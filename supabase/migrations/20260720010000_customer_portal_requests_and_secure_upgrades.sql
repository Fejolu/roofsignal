-- Customer portal actions are real, auditable requests. Pricing is derived server-side.

create table if not exists public.customer_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  property_id uuid references public.properties(id) on delete set null,
  request_type text not null check (request_type in ('inspection','reinspection','support')),
  subject text not null,
  message text,
  preferred_date date,
  status text not null default 'submitted' check (status in ('submitted','in_progress','scheduled','resolved','cancelled')),
  created_by uuid not null references auth.users(id) on delete restrict default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.customer_requests enable row level security;

create policy "customers read own requests"
on public.customer_requests for select to authenticated
using (public.is_internal_user() or public.is_org_member(organization_id));

create policy "customers create own requests"
on public.customer_requests for insert to authenticated
with check (
  created_by = auth.uid()
  and public.is_org_member(organization_id)
  and (property_id is null or exists (
    select 1 from public.properties p
    where p.id = property_id and p.organization_id = organization_id and p.deleted_at is null
  ))
);

create policy "internal users manage customer requests"
on public.customer_requests for update to authenticated
using (public.is_internal_user()) with check (public.is_internal_user());

create trigger customer_requests_set_updated_at before update on public.customer_requests
for each row execute function public.set_updated_at();

create or replace function public.create_task_for_customer_request()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.tasks (organization_id, property_id, title, description, task_type, priority, status, assigned_role, created_by)
  values (
    new.organization_id,
    new.property_id,
    case new.request_type
      when 'inspection' then 'Nieuwe inspectieaanvraag: ' || new.subject
      when 'reinspection' then 'Herinspectieaanvraag: ' || new.subject
      else 'Supportvraag: ' || new.subject
    end,
    concat_ws(E'\n', new.message, case when new.preferred_date is not null then 'Voorkeursdatum: ' || to_char(new.preferred_date, 'DD-MM-YYYY') end),
    case when new.request_type = 'support' then 'support' else 'planning' end,
    'normal', 'open',
    case when new.request_type = 'support' then 'support'::public.app_role else 'planning'::public.app_role end,
    new.created_by
  );
  return new;
end;
$$;

create trigger customer_requests_create_internal_task after insert on public.customer_requests
for each row execute function public.create_task_for_customer_request();

drop policy if exists "customers request own upgrades" on public.upgrade_requests;
create policy "upgrade requests inserted internally"
on public.upgrade_requests for insert to authenticated
with check (public.is_internal_user());

create unique index if not exists upgrade_requests_one_active_request
on public.upgrade_requests(quote_item_id, requested_depth)
where status in ('requested','offered','paid');

create or replace function public.request_inspection_upgrade(p_quote_item_id uuid, p_requested_depth text)
returns public.upgrade_requests
language plpgsql security definer set search_path = public as $$
declare
  item public.quote_items;
  target_price numeric(12,2);
  current_price numeric(12,2);
  created_request public.upgrade_requests;
begin
  if p_requested_depth not in ('plus','premium') then raise exception 'Ongeldige inspectiediepte'; end if;
  select * into item from public.quote_items where id = p_quote_item_id;
  if item.id is null or not public.is_org_member(item.organization_id) then raise exception 'Geen toegang tot dit inspectieproduct'; end if;
  if (case item.inspection_depth when 'basis' then 1 when 'plus' then 2 else 3 end)
     >= (case p_requested_depth when 'plus' then 2 else 3 end) then raise exception 'Upgrade moet hoger zijn dan het huidige pakket'; end if;

  select price_ex_vat into current_price from public.product_catalog
  where variant = item.inspection_product and depth = item.inspection_depth and is_active
    and active_from <= current_date and (active_until is null or active_until >= current_date)
  order by version desc limit 1;
  select price_ex_vat into target_price from public.product_catalog
  where variant = item.inspection_product and depth = p_requested_depth and is_active
    and active_from <= current_date and (active_until is null or active_until >= current_date)
  order by version desc limit 1;
  if current_price is null or target_price is null or target_price <= current_price then raise exception 'Upgradeprijs ontbreekt in de productcatalogus'; end if;

  insert into public.upgrade_requests (organization_id, quote_item_id, current_depth, requested_depth, price_ex_vat)
  values (item.organization_id, item.id, item.inspection_depth, p_requested_depth, target_price - current_price)
  returning * into created_request;
  return created_request;
exception when unique_violation then
  raise exception 'Deze upgrade is al aangevraagd';
end;
$$;

revoke all on function public.request_inspection_upgrade(uuid,text) from public;
grant execute on function public.request_inspection_upgrade(uuid,text) to authenticated;
