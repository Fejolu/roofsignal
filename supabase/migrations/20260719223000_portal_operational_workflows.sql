-- Portal Core phase 2: operational quotes, tasks, findings and report workflow.

alter table public.quotes
  add column if not exists property_id uuid references public.properties(id) on delete set null;

alter table public.findings
  alter column report_id drop not null,
  add column if not exists inspection_id uuid references public.inspections(id) on delete cascade,
  add column if not exists building_element text,
  add column if not exists seriousness text,
  add column if not exists extent text,
  add column if not exists intensity text,
  add column if not exists condition_score numeric(2,1),
  add column if not exists confidence text,
  add column if not exists evidence_reference text,
  add column if not exists updated_at timestamptz not null default now();

alter table public.findings drop constraint if exists findings_source_check;
alter table public.findings add constraint findings_source_check
  check (inspection_id is not null or report_id is not null);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  property_id uuid references public.properties(id) on delete cascade,
  inspection_id uuid references public.inspections(id) on delete cascade,
  title text not null,
  description text,
  task_type text not null default 'internal',
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  status text not null default 'open' check (status in ('open', 'in_progress', 'waiting', 'completed', 'cancelled')),
  due_at timestamptz,
  assigned_role public.app_role,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists findings_inspection_id_idx on public.findings(inspection_id);
create index if not exists quotes_property_id_idx on public.quotes(property_id);
create index if not exists tasks_organization_id_idx on public.tasks(organization_id);
create index if not exists tasks_property_id_idx on public.tasks(property_id);
create index if not exists tasks_inspection_id_idx on public.tasks(inspection_id);
create index if not exists tasks_status_idx on public.tasks(status);

alter table public.tasks enable row level security;

drop policy if exists "tasks visible by membership or internal" on public.tasks;
create policy "tasks visible by membership or internal"
on public.tasks for select to authenticated
using (public.is_internal_user() or public.is_org_member(organization_id));

drop policy if exists "tasks managed by internal" on public.tasks;
create policy "tasks managed by internal"
on public.tasks for all to authenticated
using (public.is_internal_user())
with check (public.is_internal_user());

drop trigger if exists findings_set_updated_at on public.findings;
create trigger findings_set_updated_at before update on public.findings
for each row execute function public.set_updated_at();

drop trigger if exists tasks_set_updated_at on public.tasks;
create trigger tasks_set_updated_at before update on public.tasks
for each row execute function public.set_updated_at();
