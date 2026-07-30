alter table public.appointments
  add column if not exists inspector_id uuid references public.profiles(id) on delete set null,
  add column if not exists customer_notified_at timestamptz,
  add column if not exists inspector_notified_at timestamptz;

create index if not exists appointments_inspector_id_idx on public.appointments(inspector_id);

create table if not exists public.calendar_feed_tokens (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles(id) on delete cascade,
  token_hash text not null unique,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.calendar_feed_tokens enable row level security;

drop policy if exists "calendar feed tokens managed by internal" on public.calendar_feed_tokens;
create policy "calendar feed tokens managed by internal"
on public.calendar_feed_tokens for all to authenticated
using (public.is_internal_user())
with check (public.is_internal_user());

drop trigger if exists calendar_feed_tokens_set_updated_at on public.calendar_feed_tokens;
create trigger calendar_feed_tokens_set_updated_at before update on public.calendar_feed_tokens
for each row execute function public.set_updated_at();
