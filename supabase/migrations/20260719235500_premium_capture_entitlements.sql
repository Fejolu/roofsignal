-- RoofSignal captures Premium data and exposes only the customer's purchased depth.

alter table public.inspections
  add column if not exists capture_depth text not null default 'premium'
    check (capture_depth = 'premium');

alter table public.findings
  add column if not exists required_depth text not null default 'basis'
    check (required_depth in ('basis', 'plus', 'premium'));

create table if not exists public.upgrade_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  quote_item_id uuid not null references public.quote_items(id) on delete cascade,
  current_depth text not null check (current_depth in ('basis', 'plus', 'premium')),
  requested_depth text not null check (requested_depth in ('plus', 'premium')),
  price_ex_vat numeric(12,2) not null,
  status text not null default 'requested' check (status in ('requested', 'offered', 'paid', 'activated', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    case current_depth when 'basis' then 1 when 'plus' then 2 else 3 end
    < case requested_depth when 'plus' then 2 else 3 end
  )
);

alter table public.upgrade_requests enable row level security;

create policy "upgrade requests visible by membership or internal"
on public.upgrade_requests for select to authenticated
using (public.is_internal_user() or public.is_org_member(organization_id));

create policy "customers request own upgrades"
on public.upgrade_requests for insert to authenticated
with check (
  public.is_internal_user()
  or (
    public.is_org_member(organization_id)
    and exists (
      select 1 from public.quote_items qi
      where qi.id = quote_item_id and qi.organization_id = organization_id
    )
  )
);

create policy "upgrade requests managed by internal"
on public.upgrade_requests for update to authenticated
using (public.is_internal_user())
with check (public.is_internal_user());

drop policy if exists "findings visible through report access" on public.findings;
create policy "findings visible within purchased depth"
on public.findings for select to authenticated
using (
  public.is_internal_user()
  or exists (
    select 1
    from public.reports r
    join public.inspections i on i.id = coalesce(findings.inspection_id, r.inspection_id)
    left join public.quote_items qi on qi.id = i.quote_item_id
    where r.id = findings.report_id
      and public.is_org_member(r.organization_id)
      and (
        case findings.required_depth when 'basis' then 1 when 'plus' then 2 else 3 end
        <= case coalesce(qi.inspection_depth, 'basis') when 'basis' then 1 when 'plus' then 2 else 3 end
      )
  )
);

create index if not exists findings_required_depth_idx on public.findings(required_depth);
create index if not exists upgrade_requests_organization_id_idx on public.upgrade_requests(organization_id);
create index if not exists upgrade_requests_quote_item_id_idx on public.upgrade_requests(quote_item_id);

drop trigger if exists upgrade_requests_set_updated_at on public.upgrade_requests;
create trigger upgrade_requests_set_updated_at before update on public.upgrade_requests
for each row execute function public.set_updated_at();
