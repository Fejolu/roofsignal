-- Secure customer acceptance for quote versions.

alter table public.quotes
  add column if not exists sent_at timestamptz,
  add column if not exists accepted_at timestamptz,
  add column if not exists accepted_by_name text,
  add column if not exists accepted_by_email text,
  add column if not exists acceptance_token_hash text,
  add column if not exists acceptance_token_expires_at timestamptz,
  add column if not exists acceptance_version integer,
  add column if not exists acceptance_user_agent text,
  add column if not exists acceptance_ip_hash text;

create unique index if not exists quotes_acceptance_token_hash_idx
  on public.quotes(acceptance_token_hash)
  where acceptance_token_hash is not null;

create table if not exists public.quote_acceptance_events (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_type text not null check (event_type in ('opened', 'accepted', 'expired', 'rejected')),
  quote_version integer,
  actor_name text,
  actor_email text,
  ip_hash text,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists quote_acceptance_events_quote_id_idx
  on public.quote_acceptance_events(quote_id, created_at desc);

alter table public.quote_acceptance_events enable row level security;

drop policy if exists "quote acceptance events visible by membership or internal"
on public.quote_acceptance_events;
create policy "quote acceptance events visible by membership or internal"
on public.quote_acceptance_events for select to authenticated
using (public.is_internal_user() or public.is_org_member(organization_id));

drop policy if exists "quote acceptance events managed internally"
on public.quote_acceptance_events;
create policy "quote acceptance events managed internally"
on public.quote_acceptance_events for all to authenticated
using (public.is_internal_user())
with check (public.is_internal_user());

create or replace function public.accept_quote_by_token(
  p_token_hash text,
  p_actor_name text,
  p_actor_email text,
  p_user_agent text default null,
  p_ip_hash text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_quote public.quotes%rowtype;
  accepted_version integer;
  accepted_version_id uuid;
begin
  select * into target_quote
  from public.quotes
  where acceptance_token_hash = p_token_hash
  for update;

  if target_quote.id is null then
    raise exception 'Ongeldige offertelink';
  end if;
  if target_quote.acceptance_token_expires_at is null or target_quote.acceptance_token_expires_at < now() then
    insert into public.quote_acceptance_events (quote_id, organization_id, event_type, quote_version)
    values (target_quote.id, target_quote.organization_id, 'expired', target_quote.acceptance_version);
    raise exception 'Deze offertelink is verlopen';
  end if;
  if target_quote.status = 'accepted' then
    return jsonb_build_object('quote_id', target_quote.id, 'status', 'accepted', 'already_accepted', true);
  end if;
  if target_quote.status <> 'sent' then
    raise exception 'Deze offerte kan niet worden geaccepteerd';
  end if;

  accepted_version := coalesce(target_quote.acceptance_version, 1);

  update public.quotes
  set status = 'accepted',
      accepted_at = now(),
      accepted_by_name = nullif(trim(p_actor_name), ''),
      accepted_by_email = lower(nullif(trim(p_actor_email), '')),
      acceptance_user_agent = left(p_user_agent, 1000),
      acceptance_ip_hash = p_ip_hash,
      acceptance_token_hash = null,
      acceptance_token_expires_at = null
  where id = target_quote.id;

  insert into public.quote_versions (
    quote_id, version, snapshot, status, sent_at, accepted_at,
    accepted_by_name, accepted_by_email
  )
  values (
    target_quote.id,
    accepted_version + 1,
    jsonb_build_object(
      'quote_id', target_quote.id,
      'quote_number', target_quote.quote_number,
      'title', target_quote.title,
      'amount', target_quote.amount,
      'accepted_from_version', accepted_version
    ),
    'accepted',
    target_quote.sent_at,
    now(),
    nullif(trim(p_actor_name), ''),
    lower(nullif(trim(p_actor_email), ''))
  )
  returning id into accepted_version_id;

  insert into public.order_confirmations (
    organization_id, quote_id, quote_version_id, status, confirmed_at
  )
  values (
    target_quote.organization_id, target_quote.id, accepted_version_id, 'confirmed', now()
  );

  insert into public.customer_activities (
    organization_id, activity_type, subject, body
  )
  values (
    target_quote.organization_id,
    'system',
    'Offerte geaccepteerd: ' || coalesce(target_quote.quote_number, target_quote.title),
    'Digitaal geaccepteerd door ' || coalesce(nullif(trim(p_actor_name), ''), 'klant')
      || coalesce(' (' || nullif(lower(trim(p_actor_email)), '') || ')', '') || '.'
  );

  insert into public.quote_acceptance_events (
    quote_id, organization_id, event_type, quote_version, actor_name,
    actor_email, ip_hash, user_agent
  )
  values (
    target_quote.id, target_quote.organization_id, 'accepted', accepted_version,
    nullif(trim(p_actor_name), ''), lower(nullif(trim(p_actor_email), '')),
    p_ip_hash, left(p_user_agent, 1000)
  );

  insert into public.audit_log (action, table_name, record_id, metadata)
  values (
    'quote.accepted_by_customer',
    'quotes',
    target_quote.id,
    jsonb_build_object(
      'quote_version', accepted_version,
      'actor_name', nullif(trim(p_actor_name), ''),
      'actor_email', lower(nullif(trim(p_actor_email), '')),
      'ip_hash', p_ip_hash
    )
  );

  return jsonb_build_object(
    'quote_id', target_quote.id,
    'status', 'accepted',
    'accepted_at', now(),
    'already_accepted', false
  );
end;
$$;

revoke all on function public.accept_quote_by_token(text,text,text,text,text) from public;
grant execute on function public.accept_quote_by_token(text,text,text,text,text) to service_role;
