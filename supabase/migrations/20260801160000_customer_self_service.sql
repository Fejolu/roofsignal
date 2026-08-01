alter table public.properties add column if not exists customer_notes text;
alter table public.invoices add column if not exists payment_url text;
alter table public.appointments
  add column if not exists customer_response text,
  add column if not exists customer_response_at timestamptz,
  add column if not exists customer_note text;

create table if not exists public.customer_request_messages (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.customer_requests(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null,
  author_type text not null check (author_type in ('customer','staff')),
  message text not null check (length(trim(message)) between 1 and 4000),
  created_at timestamptz not null default now()
);
alter table public.customer_request_messages enable row level security;
drop policy if exists "request messages visible to organization" on public.customer_request_messages;
create policy "request messages visible to organization" on public.customer_request_messages for select to authenticated
using (public.is_internal_user() or public.is_org_member(organization_id));
drop policy if exists "request messages created by participants" on public.customer_request_messages;
create policy "request messages created by participants" on public.customer_request_messages for insert to authenticated
with check (
  (public.is_internal_user() or public.is_org_member(organization_id))
  and author_id = auth.uid()
  and ((public.is_internal_user() and author_type='staff') or (not public.is_internal_user() and author_type='customer'))
  and exists (select 1 from public.customer_requests r where r.id = request_id and r.organization_id = customer_request_messages.organization_id)
);

create table if not exists public.portal_notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  body text,
  link text,
  kind text not null default 'info',
  created_at timestamptz not null default now(),
  read_by uuid[] not null default '{}'
);
alter table public.portal_notifications enable row level security;
drop policy if exists "notifications visible to organization" on public.portal_notifications;
create policy "notifications visible to organization" on public.portal_notifications for select to authenticated
using (public.is_internal_user() or public.is_org_member(organization_id));
drop policy if exists "notifications managed internally" on public.portal_notifications;
create policy "notifications managed internally" on public.portal_notifications for all to authenticated
using (public.is_internal_user()) with check (public.is_internal_user());

create or replace function public.customer_save_property(p_id uuid, p_name text, p_address text, p_postcode text, p_city text, p_notes text)
returns public.properties language plpgsql security definer set search_path=public as $$
declare v_org uuid; v_row public.properties;
begin
  select organization_id into v_org from public.profiles where id=auth.uid();
  if v_org is null then raise exception 'Geen klantorganisatie gekoppeld.'; end if;
  if nullif(trim(p_name),'') is null then raise exception 'Vul een objectnaam in.'; end if;
  if p_id is null then
    insert into public.properties(organization_id,name,address,postcode,city,customer_notes,status)
    values(v_org,trim(p_name),nullif(trim(p_address),''),upper(nullif(trim(p_postcode),'')),nullif(trim(p_city),''),nullif(trim(p_notes),''),'active') returning * into v_row;
  else
    update public.properties set name=trim(p_name),address=nullif(trim(p_address),''),postcode=upper(nullif(trim(p_postcode),'')),city=nullif(trim(p_city),''),customer_notes=nullif(trim(p_notes),''),updated_at=now()
    where id=p_id and organization_id=v_org and deleted_at is null returning * into v_row;
    if v_row.id is null then raise exception 'Object niet gevonden.'; end if;
  end if;
  return v_row;
end $$;
grant execute on function public.customer_save_property(uuid,text,text,text,text,text) to authenticated;

create or replace function public.customer_archive_property(p_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_org uuid;
begin
  select organization_id into v_org from public.profiles where id=auth.uid();
  update public.properties set deleted_at=now(),status='deleted',updated_at=now() where id=p_id and organization_id=v_org and deleted_at is null;
  if not found then raise exception 'Object niet gevonden.'; end if;
end $$;
grant execute on function public.customer_archive_property(uuid) to authenticated;

create or replace function public.customer_accept_quote(p_quote_id uuid, p_name text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_org uuid; v_email text; v_quote public.quotes%rowtype; v_version integer; v_version_id uuid;
begin
  select organization_id,email into v_org,v_email from public.profiles where id=auth.uid();
  select * into v_quote from public.quotes where id=p_quote_id and organization_id=v_org for update;
  if v_quote.id is null then raise exception 'Offerte niet gevonden.'; end if;
  if v_quote.status='accepted' then return jsonb_build_object('status','accepted','already_accepted',true); end if;
  if v_quote.status not in ('sent','viewed','open') then raise exception 'Deze offerte kan niet worden goedgekeurd.'; end if;
  if v_quote.valid_until is not null and v_quote.valid_until < current_date then raise exception 'Deze offerte is verlopen.'; end if;
  update public.quotes set status='accepted',accepted_at=now(),accepted_by_name=coalesce(nullif(trim(p_name),''),v_email),accepted_by_email=v_email,updated_at=now() where id=p_quote_id;
  select coalesce(max(version),0)+1 into v_version from public.quote_versions where quote_id=p_quote_id;
  insert into public.quote_versions(quote_id,version,snapshot,status,accepted_at,accepted_by_name,accepted_by_email,created_by)
  values(p_quote_id,v_version,jsonb_build_object('quote_id',p_quote_id,'amount',v_quote.amount,'title',v_quote.title,'source','customer_portal'),'accepted',now(),coalesce(nullif(trim(p_name),''),v_email),v_email,auth.uid()) returning id into v_version_id;
  update public.order_confirmations set quote_version_id=v_version_id,status='confirmed',confirmed_at=now(),updated_at=now() where quote_id=p_quote_id;
  if not found then insert into public.order_confirmations(organization_id,quote_id,quote_version_id,status,confirmed_at) values(v_org,p_quote_id,v_version_id,'confirmed',now()); end if;
  insert into public.audit_log(actor_id,action,table_name,record_id,metadata)
  values(auth.uid(),'quote.accepted_by_customer','quotes',p_quote_id,jsonb_build_object('source','customer_portal'));
  return jsonb_build_object('status','accepted','already_accepted',false);
end $$;
grant execute on function public.customer_accept_quote(uuid,text) to authenticated;

create or replace function public.customer_respond_appointment(p_appointment_id uuid, p_action text, p_note text default null)
returns public.appointments language plpgsql security definer set search_path=public as $$
declare v_org uuid; v_row public.appointments;
begin
  select organization_id into v_org from public.profiles where id=auth.uid();
  if p_action not in ('confirmed','reschedule_requested','cancellation_requested') then raise exception 'Ongeldige afspraakactie.'; end if;
  update public.appointments set customer_response=p_action,customer_response_at=now(),customer_note=nullif(trim(p_note),''),updated_at=now()
  where id=p_appointment_id and organization_id=v_org and status not in ('completed','cancelled') returning * into v_row;
  if v_row.id is null then raise exception 'Afspraak niet gevonden.'; end if;
  if p_action in ('reschedule_requested','cancellation_requested') then
    insert into public.customer_requests(organization_id,property_id,request_type,subject,message,status)
    values(v_org,v_row.property_id,'support',case when p_action='reschedule_requested' then 'Verzoek afspraak verplaatsen' else 'Verzoek afspraak annuleren' end,p_note,'submitted');
  end if;
  return v_row;
end $$;
grant execute on function public.customer_respond_appointment(uuid,text,text) to authenticated;

create or replace function public.customer_mark_notification_read(p_notification_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_org uuid;
begin
  select organization_id into v_org from public.profiles where id=auth.uid();
  update public.portal_notifications set read_by=array_append(read_by,auth.uid()) where id=p_notification_id and organization_id=v_org and not auth.uid()=any(read_by);
end $$;
grant execute on function public.customer_mark_notification_read(uuid) to authenticated;
