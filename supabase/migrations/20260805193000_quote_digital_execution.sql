-- Verifiable digital issue and customer acceptance for quote documents.

alter table public.quotes
  add column if not exists issued_at timestamptz,
  add column if not exists issued_by uuid references auth.users(id) on delete set null,
  add column if not exists issued_by_name text,
  add column if not exists issued_by_email text,
  add column if not exists issued_document_hash text,
  add column if not exists accepted_document_id uuid references public.documents(id) on delete set null,
  add column if not exists accepted_document_hash text;

alter table public.quote_versions
  add column if not exists document_id uuid references public.documents(id) on delete set null,
  add column if not exists document_hash text,
  add column if not exists issued_at timestamptz,
  add column if not exists issued_by_name text,
  add column if not exists issued_by_email text;

create table if not exists public.quote_execution_events (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  quote_version integer not null,
  event_type text not null check (event_type in ('issued', 'accepted')),
  actor_type text not null check (actor_type in ('roofsignal', 'customer')),
  actor_id uuid references auth.users(id) on delete set null,
  actor_name text not null,
  actor_email text,
  statement text not null,
  event_at timestamptz not null default now(),
  document_id uuid references public.documents(id) on delete set null,
  document_hash text not null,
  auth_method text not null,
  ip_hash text,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (quote_id, quote_version, event_type)
);

create index if not exists quote_execution_events_quote_id_idx
  on public.quote_execution_events(quote_id, event_at desc);

alter table public.quote_execution_events enable row level security;

drop policy if exists "quote execution visible by membership or internal"
on public.quote_execution_events;
create policy "quote execution visible by membership or internal"
on public.quote_execution_events for select to authenticated
using (public.is_internal_user() or public.is_org_member(organization_id));

drop policy if exists "quote execution managed internally"
on public.quote_execution_events;
create policy "quote execution managed internally"
on public.quote_execution_events for all to authenticated
using (public.is_internal_user())
with check (public.is_internal_user());

grant select on public.quote_execution_events to authenticated;
