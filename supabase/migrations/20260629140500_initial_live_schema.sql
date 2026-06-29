create extension if not exists pgcrypto;

do $$
begin
  create type public.app_role as enum ('customer', 'support', 'planning', 'finance', 'reportage', 'owner_admin');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.lead_request_type as enum ('report', 'price', 'contact');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  segment text,
  status text not null default 'prospect',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete set null,
  email text not null unique,
  full_name text,
  role public.app_role not null default 'customer',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null default 'customer',
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table if not exists public.properties (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  address text,
  postcode text,
  city text,
  property_type text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  property_id uuid references public.properties(id) on delete set null,
  title text not null,
  summary text,
  status text not null default 'draft',
  report_url text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.findings (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete cascade,
  severity text not null default 'normal',
  title text not null,
  description text,
  recommendation text,
  priority text,
  cost_min numeric(12,2),
  cost_max numeric(12,2),
  created_at timestamptz not null default now()
);

create table if not exists public.lead_requests (
  id uuid primary key default gen_random_uuid(),
  request_type public.lead_request_type not null,
  name text not null,
  organization text,
  email text not null,
  segment text,
  postcode text,
  object_complexity text,
  site_access text,
  scope text,
  message text,
  status text not null default 'new',
  source_path text,
  created_at timestamptz not null default now()
);

create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  lead_request_id uuid references public.lead_requests(id) on delete set null,
  quote_number text unique,
  title text not null,
  amount numeric(12,2),
  status text not null default 'draft',
  valid_until date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  quote_id uuid references public.quotes(id) on delete set null,
  invoice_number text unique,
  amount numeric(12,2),
  status text not null default 'draft',
  due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  property_id uuid references public.properties(id) on delete set null,
  title text not null,
  starts_at timestamptz,
  ends_at timestamptz,
  status text not null default 'planned',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  table_name text,
  record_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array['organizations', 'profiles', 'properties', 'reports', 'quotes', 'invoices', 'appointments']
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', table_name);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', table_name);
  end loop;
end $$;

create or replace function public.current_user_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select role from public.profiles where id = auth.uid()), 'customer'::public.app_role);
$$;

create or replace function public.is_roofsignal_user()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt() ->> 'email', '') ilike '%@roofsignal.nl';
$$;

create or replace function public.is_internal_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_role() in ('support', 'planning', 'finance', 'reportage', 'owner_admin')
     or public.is_roofsignal_user();
$$;

create or replace function public.is_owner_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_role() = 'owner_admin'
     or lower(coalesce(auth.jwt() ->> 'email', '')) in ('admin@roofsignal.nl', 'ferry@roofsignal.nl');
$$;

create or replace function public.is_org_member(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members om
    where om.organization_id = org_id
      and om.user_id = auth.uid()
  );
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_email text := lower(coalesce(new.email, ''));
  assigned_role public.app_role := 'customer';
begin
  if normalized_email in ('admin@roofsignal.nl', 'ferry@roofsignal.nl') then
    assigned_role := 'owner_admin';
  elsif normalized_email like '%@roofsignal.nl' then
    assigned_role := 'support';
  end if;

  insert into public.profiles (id, email, full_name, role)
  values (new.id, normalized_email, coalesce(new.raw_user_meta_data ->> 'full_name', ''), assigned_role)
  on conflict (id) do update set email = excluded.email, role = excluded.role;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.organization_members enable row level security;
alter table public.properties enable row level security;
alter table public.reports enable row level security;
alter table public.findings enable row level security;
alter table public.lead_requests enable row level security;
alter table public.quotes enable row level security;
alter table public.invoices enable row level security;
alter table public.appointments enable row level security;
alter table public.audit_log enable row level security;

drop policy if exists "lead requests can be created publicly" on public.lead_requests;
create policy "lead requests can be created publicly"
on public.lead_requests for insert
to anon, authenticated
with check (true);

drop policy if exists "internal users manage lead requests" on public.lead_requests;
create policy "internal users manage lead requests"
on public.lead_requests for all
to authenticated
using (public.is_internal_user())
with check (public.is_internal_user());

drop policy if exists "profiles readable by self or internal" on public.profiles;
create policy "profiles readable by self or internal"
on public.profiles for select
to authenticated
using (id = auth.uid() or public.is_internal_user());

drop policy if exists "profiles updatable by owner admin" on public.profiles;
create policy "profiles updatable by owner admin"
on public.profiles for update
to authenticated
using (public.is_owner_admin())
with check (public.is_owner_admin());

drop policy if exists "organizations visible by membership or internal" on public.organizations;
create policy "organizations visible by membership or internal"
on public.organizations for select
to authenticated
using (public.is_internal_user() or public.is_org_member(id));

drop policy if exists "organizations managed by internal" on public.organizations;
create policy "organizations managed by internal"
on public.organizations for all
to authenticated
using (public.is_internal_user())
with check (public.is_internal_user());

drop policy if exists "members visible by membership or internal" on public.organization_members;
create policy "members visible by membership or internal"
on public.organization_members for select
to authenticated
using (public.is_internal_user() or user_id = auth.uid() or public.is_org_member(organization_id));

drop policy if exists "members managed by owner admin" on public.organization_members;
create policy "members managed by owner admin"
on public.organization_members for all
to authenticated
using (public.is_owner_admin())
with check (public.is_owner_admin());

drop policy if exists "properties visible by membership or internal" on public.properties;
create policy "properties visible by membership or internal"
on public.properties for select
to authenticated
using (public.is_internal_user() or public.is_org_member(organization_id));

drop policy if exists "properties managed by internal" on public.properties;
create policy "properties managed by internal"
on public.properties for all
to authenticated
using (public.is_internal_user())
with check (public.is_internal_user());

drop policy if exists "reports visible by membership or internal" on public.reports;
create policy "reports visible by membership or internal"
on public.reports for select
to authenticated
using (public.is_internal_user() or public.is_org_member(organization_id));

drop policy if exists "reports managed by internal" on public.reports;
create policy "reports managed by internal"
on public.reports for all
to authenticated
using (public.is_internal_user())
with check (public.is_internal_user());

drop policy if exists "findings visible through report access" on public.findings;
create policy "findings visible through report access"
on public.findings for select
to authenticated
using (
  public.is_internal_user()
  or exists (
    select 1
    from public.reports r
    where r.id = findings.report_id
      and public.is_org_member(r.organization_id)
  )
);

drop policy if exists "findings managed by internal" on public.findings;
create policy "findings managed by internal"
on public.findings for all
to authenticated
using (public.is_internal_user())
with check (public.is_internal_user());

drop policy if exists "commercial records visible by membership or internal" on public.quotes;
create policy "commercial records visible by membership or internal"
on public.quotes for select
to authenticated
using (public.is_internal_user() or (organization_id is not null and public.is_org_member(organization_id)));

drop policy if exists "quotes managed by internal" on public.quotes;
create policy "quotes managed by internal"
on public.quotes for all
to authenticated
using (public.is_internal_user())
with check (public.is_internal_user());

drop policy if exists "invoices visible by membership or internal" on public.invoices;
create policy "invoices visible by membership or internal"
on public.invoices for select
to authenticated
using (public.is_internal_user() or (organization_id is not null and public.is_org_member(organization_id)));

drop policy if exists "invoices managed by internal" on public.invoices;
create policy "invoices managed by internal"
on public.invoices for all
to authenticated
using (public.is_internal_user())
with check (public.is_internal_user());

drop policy if exists "appointments visible by membership or internal" on public.appointments;
create policy "appointments visible by membership or internal"
on public.appointments for select
to authenticated
using (public.is_internal_user() or (organization_id is not null and public.is_org_member(organization_id)));

drop policy if exists "appointments managed by internal" on public.appointments;
create policy "appointments managed by internal"
on public.appointments for all
to authenticated
using (public.is_internal_user())
with check (public.is_internal_user());

drop policy if exists "audit visible to owner admin" on public.audit_log;
create policy "audit visible to owner admin"
on public.audit_log for select
to authenticated
using (public.is_owner_admin());

drop policy if exists "audit insert by authenticated" on public.audit_log;
create policy "audit insert by authenticated"
on public.audit_log for insert
to authenticated
with check (actor_id = auth.uid() or public.is_internal_user());
