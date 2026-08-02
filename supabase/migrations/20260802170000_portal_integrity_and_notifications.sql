-- Complete the portal workflows that must be durable and atomic.

alter table public.portal_notifications
  add column if not exists source_type text,
  add column if not exists source_id uuid;

create unique index if not exists portal_notifications_source_unique
  on public.portal_notifications (organization_id, source_type, source_id)
  where source_type is not null and source_id is not null;

create or replace function public.customer_mark_all_notifications_read()
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare v_org uuid; v_count integer;
begin
  select organization_id into v_org from public.profiles where id=auth.uid();
  if v_org is null then raise exception 'Geen klantorganisatie gekoppeld.'; end if;
  update public.portal_notifications
     set read_by=array_append(read_by,auth.uid())
   where organization_id=v_org and not auth.uid()=any(read_by);
  get diagnostics v_count = row_count;
  return v_count;
end $$;
grant execute on function public.customer_mark_all_notifications_read() to authenticated;

create or replace function public.set_profile_roles(p_profile_id uuid, p_roles text[])
returns void
language plpgsql
security definer
set search_path=public
as $$
declare v_role text;
begin
  if not public.is_internal_user() then raise exception 'Geen toestemming.'; end if;
  if not public.is_owner_admin() then
    raise exception 'Alleen een eigenaar kan rollen wijzigen.';
  end if;
  if coalesce(array_length(p_roles,1),0)=0 then raise exception 'Selecteer minimaal één backoffice-rol.'; end if;
  if exists(select 1 from unnest(p_roles) r where r not in ('owner_admin','support','planning','finance','reportage','inspector','hr')) then
    raise exception 'Ongeldige rol.';
  end if;
  delete from public.profile_roles where profile_id=p_profile_id and not (role::text=any(p_roles));
  foreach v_role in array p_roles loop
    insert into public.profile_roles(profile_id,role) values(p_profile_id,v_role::public.app_role) on conflict do nothing;
  end loop;
end $$;
grant execute on function public.set_profile_roles(uuid,text[]) to authenticated;

create or replace function public.sync_portal_notification()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_title text; v_body text; v_link text; v_kind text := 'info'; v_source text := tg_table_name;
begin
  if tg_table_name='quotes' then
    if new.status not in ('sent','accepted') then return new; end if;
    v_title := case new.status when 'sent' then 'Nieuwe offerte' else 'Offerte goedgekeurd' end;
    v_body := new.title;
    v_link := '#offertes';
    v_kind := case new.status when 'sent' then 'action' else 'success' end;
  elsif tg_table_name='invoices' then
    if new.status not in ('sent','open','overdue','paid') then return new; end if;
    v_title := case new.status when 'paid' then 'Betaling verwerkt' when 'overdue' then 'Factuuractie nodig' else 'Nieuwe factuur' end;
    v_body := coalesce(new.invoice_number,'Factuur');
    v_link := '#facturen';
    v_kind := case when new.status in ('open','overdue') then 'action' else 'info' end;
  elsif tg_table_name='appointments' then
    if new.status in ('cancelled','completed') then return new; end if;
    v_title := 'Inspectieafspraak'; v_body := new.title; v_link := '#planning'; v_kind := 'action';
  elsif tg_table_name='reports' then
    if new.status<>'published' then return new; end if;
    v_title := 'Inspectierapport beschikbaar'; v_body := new.title; v_link := '#inspecties'; v_kind := 'success';
  end if;
  insert into public.portal_notifications(organization_id,title,body,link,kind,source_type,source_id)
  values(new.organization_id,v_title,v_body,v_link,v_kind,v_source,new.id)
  on conflict (organization_id,source_type,source_id) where source_type is not null and source_id is not null
  do update set title=excluded.title,body=excluded.body,link=excluded.link,kind=excluded.kind,created_at=now(),read_by='{}';
  return new;
end $$;

do $$ begin
  drop trigger if exists quotes_portal_notification on public.quotes;
  create trigger quotes_portal_notification after insert or update of status on public.quotes for each row execute function public.sync_portal_notification();
  drop trigger if exists invoices_portal_notification on public.invoices;
  create trigger invoices_portal_notification after insert or update of status on public.invoices for each row execute function public.sync_portal_notification();
  drop trigger if exists appointments_portal_notification on public.appointments;
  create trigger appointments_portal_notification after insert or update of status on public.appointments for each row execute function public.sync_portal_notification();
  drop trigger if exists reports_portal_notification on public.reports;
  create trigger reports_portal_notification after insert or update of status on public.reports for each row execute function public.sync_portal_notification();
end $$;

-- Backfill the current actionable records without creating duplicates.
insert into public.portal_notifications(organization_id,title,body,link,kind,source_type,source_id)
select organization_id,'Nieuwe offerte',title,'#offertes','action','quotes',id from public.quotes where status='sent'
on conflict do nothing;
insert into public.portal_notifications(organization_id,title,body,link,kind,source_type,source_id)
select organization_id,'Nieuwe factuur',coalesce(invoice_number,'Factuur'),'#facturen','action','invoices',id from public.invoices where status in ('sent','open','overdue')
on conflict do nothing;
insert into public.portal_notifications(organization_id,title,body,link,kind,source_type,source_id)
select organization_id,'Inspectieafspraak',title,'#planning','action','appointments',id from public.appointments where status not in ('cancelled','completed')
on conflict do nothing;
insert into public.portal_notifications(organization_id,title,body,link,kind,source_type,source_id)
select organization_id,'Inspectierapport beschikbaar',title,'#inspecties','success','reports',id from public.reports where status='published'
on conflict do nothing;
