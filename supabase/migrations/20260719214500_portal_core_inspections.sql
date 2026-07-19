-- Portal Core: inspections are lifecycle events on an object; reports are deliverables.

alter table public.properties
  add column if not exists building_data jsonb not null default '{}'::jsonb;

create table if not exists public.inspections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  reference text unique,
  scope text,
  status text not null default 'intake'
    check (status in ('intake', 'planned', 'captured', 'analysis', 'review', 'delivered', 'cancelled')),
  scheduled_at timestamptz,
  inspected_at timestamptz,
  summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.reports
  add column if not exists inspection_id uuid references public.inspections(id) on delete set null;

create index if not exists inspections_organization_id_idx on public.inspections(organization_id);
create index if not exists inspections_property_id_idx on public.inspections(property_id);
create index if not exists inspections_status_idx on public.inspections(status);
create index if not exists reports_inspection_id_idx on public.reports(inspection_id);

alter table public.inspections enable row level security;

drop policy if exists "inspections visible by membership or internal" on public.inspections;
create policy "inspections visible by membership or internal"
on public.inspections for select
to authenticated
using (public.is_internal_user() or public.is_org_member(organization_id));

drop policy if exists "inspections managed by internal" on public.inspections;
create policy "inspections managed by internal"
on public.inspections for all
to authenticated
using (public.is_internal_user())
with check (public.is_internal_user());

drop trigger if exists inspections_set_updated_at on public.inspections;
create trigger inspections_set_updated_at
before update on public.inspections
for each row execute function public.set_updated_at();
