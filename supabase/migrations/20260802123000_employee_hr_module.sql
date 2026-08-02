-- Owner-only HR administration. Medical diagnoses and treatment details are intentionally excluded.
create table if not exists public.employee_records (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  first_name text, initials text, last_name text, birth_date date,
  street text, house_number text, postcode text, city text, country text default 'Nederland',
  private_email text, phone text, emergency_contact_name text, emergency_contact_phone text,
  iban text, job_title text, department text, employment_type text default 'employee',
  contract_start date, contract_end date, weekly_hours numeric(5,2), annual_leave_hours numeric(7,2) default 0,
  salary_reference text, payroll_number text, personal_agreements text, notes text,
  status text not null default 'active' check (status in ('active','leave','sick','inactive','left')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.employee_leave (
  id uuid primary key default gen_random_uuid(), profile_id uuid not null references public.profiles(id) on delete cascade,
  leave_type text not null default 'holiday' check (leave_type in ('holiday','special','parental','unpaid','other')),
  starts_on date not null, ends_on date not null, hours numeric(7,2) not null default 0,
  status text not null default 'approved' check (status in ('requested','approved','rejected','cancelled')),
  note text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.employee_absence (
  id uuid primary key default gen_random_uuid(), profile_id uuid not null references public.profiles(id) on delete cascade,
  starts_on date not null, ends_on date, absence_percentage numeric(5,2) not null default 100 check (absence_percentage between 0 and 100),
  expected_return_on date, work_capacity_percentage numeric(5,2) check (work_capacity_percentage between 0 and 100),
  operational_note text, status text not null default 'sick' check (status in ('sick','partially_recovered','recovered')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.employee_documents (
  id uuid primary key default gen_random_uuid(), profile_id uuid not null references public.profiles(id) on delete cascade,
  document_type text not null default 'employment_contract' check (document_type in ('employment_contract','amendment','identity','payroll','agreement','other')),
  title text not null, storage_path text not null unique, valid_from date, valid_until date,
  created_at timestamptz not null default now(), created_by uuid references auth.users(id) on delete set null
);

create or replace function public.is_hr_admin() returns boolean language sql stable security definer set search_path=public as $$
  select public.current_user_role() = 'owner_admin' or public.is_roofsignal_user() and exists(select 1 from public.profiles where id=auth.uid() and role='owner_admin');
$$;

alter table public.employee_records enable row level security;
alter table public.employee_leave enable row level security;
alter table public.employee_absence enable row level security;
alter table public.employee_documents enable row level security;
create policy "hr records owner managed" on public.employee_records for all to authenticated using (public.is_hr_admin()) with check (public.is_hr_admin());
create policy "hr leave owner managed" on public.employee_leave for all to authenticated using (public.is_hr_admin()) with check (public.is_hr_admin());
create policy "hr absence owner managed" on public.employee_absence for all to authenticated using (public.is_hr_admin()) with check (public.is_hr_admin());
create policy "hr documents owner managed" on public.employee_documents for all to authenticated using (public.is_hr_admin()) with check (public.is_hr_admin());

insert into storage.buckets(id,name,public) values('hr-documents','hr-documents',false) on conflict(id) do nothing;
create policy "hr document objects owner read" on storage.objects for select to authenticated using (bucket_id='hr-documents' and public.is_hr_admin());
create policy "hr document objects owner insert" on storage.objects for insert to authenticated with check (bucket_id='hr-documents' and public.is_hr_admin());
create policy "hr document objects owner update" on storage.objects for update to authenticated using (bucket_id='hr-documents' and public.is_hr_admin()) with check (bucket_id='hr-documents' and public.is_hr_admin());
create policy "hr document objects owner delete" on storage.objects for delete to authenticated using (bucket_id='hr-documents' and public.is_hr_admin());
