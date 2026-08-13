create table if not exists public.public_form_attempts (
  id bigint generated always as identity primary key,
  ip_hash text not null,
  form_type text not null,
  created_at timestamptz not null default now()
);

alter table public.public_form_attempts enable row level security;
revoke all on public.public_form_attempts from anon, authenticated;
create index if not exists public_form_attempts_lookup_idx
  on public.public_form_attempts (ip_hash, form_type, created_at desc);

-- Public lead creation is only allowed through the verified Edge Function.
drop policy if exists "lead requests can be created publicly" on public.lead_requests;
revoke insert on public.lead_requests from anon;

revoke execute on function public.create_parken_booking(text,text,text,text,text,text,date,text,text,text,boolean,boolean,boolean) from anon, authenticated;
grant execute on function public.create_parken_booking(text,text,text,text,text,text,date,text,text,text,boolean,boolean,boolean) to service_role;
