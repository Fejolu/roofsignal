-- Create a controlled invoice queue when an inspection report is published.
-- The invoice is sent on the next business day at 09:00 Europe/Amsterdam,
-- but only after a payment link is supplied. Delivery is handled by the
-- process-scheduled-invoices Edge Function.

alter table public.invoices
  add column if not exists auto_send_at timestamptz,
  add column if not exists auto_send_status text not null default 'disabled'
    check (auto_send_status in ('disabled','action_required','scheduled','processing','sent','failed')),
  add column if not exists auto_send_error text,
  add column if not exists auto_send_attempted_at timestamptz;

create index if not exists invoices_auto_send_queue_idx
  on public.invoices(auto_send_at,auto_send_status)
  where auto_send_status in ('action_required','scheduled','failed');

create or replace function public.next_invoice_business_send_at(p_from timestamptz)
returns timestamptz
language plpgsql
stable
set search_path=public
as $$
declare
  v_day date := (p_from at time zone 'Europe/Amsterdam')::date + 1;
begin
  while extract(isodow from v_day) in (6,7) loop v_day := v_day + 1; end loop;
  return (v_day + time '09:00') at time zone 'Europe/Amsterdam';
end $$;

create or replace function public.queue_invoice_after_report()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_quote public.quotes%rowtype;
  v_invoice public.invoices%rowtype;
  v_send_at timestamptz;
begin
  if new.status <> 'published' or (tg_op='UPDATE' and old.status='published') then return new; end if;
  if new.quote_id is null or new.inspection_id is null then return new; end if;
  perform pg_advisory_xact_lock(hashtext(new.quote_id::text));
  select * into v_quote from public.quotes where id=new.quote_id and status='accepted';
  if v_quote.id is null then return new; end if;

  select * into v_invoice from public.invoices
  where quote_id=new.quote_id and coalesce(status,'') not in ('credited','cancelled')
  order by created_at desc limit 1;
  if v_invoice.id is not null then return new; end if;

  v_send_at := public.next_invoice_business_send_at(coalesce(new.published_at,now()));
  insert into public.invoices(
    organization_id,quote_id,property_id,inspection_id,amount,status,due_date,
    bank_account,account_holder,payment_term_days,auto_send_at,auto_send_status,auto_send_error
  ) values (
    new.organization_id,new.quote_id,new.property_id,new.inspection_id,v_quote.amount,'draft',
    (v_send_at at time zone 'Europe/Amsterdam')::date + 14,
    'NL35INGB0700762019','FJ Joosten',14,v_send_at,'action_required','Voeg een betaallink toe.'
  ) returning * into v_invoice;

  insert into public.invoice_lines(invoice_id,description,quantity,unit_price,vat_rate)
  select v_invoice.id,
    concat(coalesce(qi.scope_snapshot->>'variant_label','Objectrapportage'),' ',coalesce(qi.scope_snapshot->>'depth_label',initcap(qi.inspection_depth)),' - ',coalesce(p.name,'Object')),
    1,qi.amount,21
  from public.quote_items qi left join public.properties p on p.id=qi.property_id
  where qi.quote_id=new.quote_id;

  insert into public.invoice_events(invoice_id,organization_id,event_type,amount,notes)
  values(v_invoice.id,new.organization_id,'created',v_invoice.amount,'Automatisch aangemaakt na publicatie inspectierapport.');
  return new;
end $$;

drop trigger if exists reports_queue_invoice on public.reports;
create trigger reports_queue_invoice
after insert or update of status on public.reports
for each row execute function public.queue_invoice_after_report();

create or replace function public.sync_invoice_auto_send_readiness()
returns trigger
language plpgsql
set search_path=public
as $$
begin
  if new.status='draft' and new.auto_send_at is not null then
    if new.payment_url ~ '^https://' then
      new.auto_send_status := 'scheduled'; new.auto_send_error := null;
    else
      new.auto_send_status := 'action_required'; new.auto_send_error := 'Voeg een betaallink toe.';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists invoices_sync_auto_send_readiness on public.invoices;
create trigger invoices_sync_auto_send_readiness
before insert or update of payment_url,auto_send_at,status on public.invoices
for each row execute function public.sync_invoice_auto_send_readiness();

comment on column public.invoices.auto_send_at is 'Automatic delivery time: next business day 09:00 Europe/Amsterdam after report publication.';
comment on column public.invoices.auto_send_status is 'Queue state; sending requires a valid payment link.';

