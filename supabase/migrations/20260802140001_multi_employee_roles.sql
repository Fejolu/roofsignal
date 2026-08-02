create table if not exists public.profile_roles (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role public.app_role not null check (role <> 'customer'),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  primary key (profile_id, role)
);

create table if not exists public.role_definitions (
  role public.app_role primary key check (role <> 'customer'),
  label text not null,
  description text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

insert into public.profile_roles(profile_id,role)
select id,role from public.profiles where role <> 'customer' on conflict do nothing;

insert into public.role_definitions(role,label,description) values
('owner_admin','Owner admin','Volledige toegang tot alle modules, rollen, HR en instellingen.'),
('support','Support','Klantvragen, dossiernotities, meekijken en algemene ondersteuning.'),
('planning','Planning','Inspecties plannen, agenda’s beheren en resources toewijzen.'),
('inspector','Inspecteur','Inspecties uitvoeren, bevindingen vastleggen en opnames aanleveren.'),
('finance','Finance','Offertes, facturen, betaalstatus, herinneringen en omzetoverzicht.'),
('reportage','Rapportage','Bevindingen beoordelen, rapporten opstellen en publiceren.'),
('hr','HR','Medewerkersdossiers, contracten, verlof en verzuim beheren.')
on conflict(role) do nothing;

alter table public.profile_roles enable row level security;
alter table public.role_definitions enable row level security;

create or replace function public.current_user_has_role(requested public.app_role)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.profiles p where p.id=auth.uid() and p.role=requested)
      or exists(select 1 from public.profile_roles pr where pr.profile_id=auth.uid() and pr.role=requested);
$$;

create or replace function public.is_internal_user()
returns boolean language sql stable security definer set search_path=public as $$
  select public.is_roofsignal_user()
      or exists(select 1 from public.profiles p where p.id=auth.uid() and p.role in ('support','planning','inspector','finance','reportage','hr','owner_admin'))
      or exists(select 1 from public.profile_roles pr where pr.profile_id=auth.uid() and pr.role in ('support','planning','inspector','finance','reportage','hr','owner_admin'));
$$;

create or replace function public.is_owner_admin()
returns boolean language sql stable security definer set search_path=public as $$
  select public.current_user_has_role('owner_admin')
      or lower(coalesce(auth.jwt()->>'email','')) in ('admin@roofsignal.nl','ferry@roofsignal.nl');
$$;

create or replace function public.is_hr_admin()
returns boolean language sql stable security definer set search_path=public as $$
  select public.current_user_has_role('hr') or public.current_user_has_role('owner_admin');
$$;

drop policy if exists "internal read role definitions" on public.role_definitions;
drop policy if exists "owners manage role definitions" on public.role_definitions;
drop policy if exists "internal read profile roles" on public.profile_roles;
drop policy if exists "owners manage profile roles" on public.profile_roles;

create policy "internal read role definitions" on public.role_definitions for select to authenticated using (public.is_internal_user());
create policy "owners manage role definitions" on public.role_definitions for all to authenticated using (public.is_owner_admin()) with check (public.is_owner_admin());
create policy "internal read profile roles" on public.profile_roles for select to authenticated using (public.is_internal_user());
create policy "owners manage profile roles" on public.profile_roles for all to authenticated using (public.is_owner_admin()) with check (public.is_owner_admin());
