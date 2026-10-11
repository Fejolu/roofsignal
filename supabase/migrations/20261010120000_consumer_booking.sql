-- General consumer bookings are separate from the De Parken pilot.
-- Functions remain disabled until credentials and end-to-end tests pass.
create table public.consumer_quotes (
 id uuid primary key default gen_random_uuid(), mode text not null check(mode in('test','live')),
 address jsonb not null, destination text not null, thermal boolean not null,
 distance_meters integer not null check(distance_meters between 0 and 150000), route jsonb not null,
 travel_cents integer not null check(travel_cents in(0,4235,9075)), travel_description text not null,
 total_cents integer not null, terms_version text not null, policy_version text not null,
 created_at timestamptz not null default now(), expires_at timestamptz not null,
 check(total_cents=36179+(case when thermal then 30250 else 0 end)+travel_cents)
);
create table public.consumer_slots (
 id uuid primary key default gen_random_uuid(), quote_id uuid not null references public.consumer_quotes(id),
 start_at timestamptz not null, end_at timestamptz not null, recommended boolean not null default false,
 checked_at timestamptz not null default now(), unique(quote_id,start_at),
 check(end_at=start_at+interval '45 minutes')
);
create table public.consumer_attempts (
 id uuid primary key, quote_id uuid references public.consumer_quotes(id), slot_id uuid references public.consumer_slots(id),
 mode text not null check(mode in('test','live')), reference text unique,
 status_token text not null unique default replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-',''),
 fingerprint text, customer jsonb, terms jsonb, terms_accepted_at timestamptz,
 slot_start timestamptz, slot_end timestamptz,
 status text not null default 'preparing' check(status in('preparing','payment_pending','creation_review','paid_review_required','confirmed','failed','canceled','expired','not_created')),
 close_code text, payment_id text unique, payment_status text,
 payment_started_at timestamptz, payment_payload jsonb, key_fingerprint text,
 checkout_url text, calendar_event_id text,
 lease_token uuid, locked_until timestamptz, next_attempt_at timestamptz not null default now(),
 last_error text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(status='not_created' or (quote_id is not null and slot_id is not null and fingerprint is not null)),
 check(slot_end is null or slot_end=slot_start+interval '45 minutes')
);
create unique index consumer_one_active_quote on public.consumer_attempts(quote_id)
 where status not in('not_created','failed','canceled','expired');
create index consumer_due on public.consumer_attempts(next_attempt_at) where status not in('not_created','failed','canceled','expired','confirmed');
create table public.consumer_mail_outbox (
 id uuid primary key default gen_random_uuid(), request_id uuid not null references public.consumer_attempts(id),
 recipient_kind text not null check(recipient_kind in('customer','internal')), payload jsonb,
 status text not null default 'pending' check(status in('pending','accepted','review')),
 first_attempt_at timestamptz, accepted_at timestamptz, message_id text, unique(request_id,recipient_kind)
);
create table public.consumer_rate_limits (
 bucket text primary key, started_at timestamptz not null default now(), hits integer not null default 1
);

alter table public.consumer_quotes enable row level security;
alter table public.consumer_slots enable row level security;
alter table public.consumer_attempts enable row level security;
alter table public.consumer_mail_outbox enable row level security;
alter table public.consumer_rate_limits enable row level security;
revoke all on public.consumer_quotes,public.consumer_slots,public.consumer_attempts,public.consumer_mail_outbox,public.consumer_rate_limits from public,anon,authenticated;
grant all on public.consumer_quotes,public.consumer_slots,public.consumer_attempts,public.consumer_mail_outbox,public.consumer_rate_limits to service_role;

create function public.consumer_rate_limit(p_bucket text,p_limit integer) returns boolean
language plpgsql security definer set search_path=public as $$
declare n integer;
begin
 insert into consumer_rate_limits(bucket) values(p_bucket)
 on conflict(bucket) do update set hits=consumer_rate_limits.hits+1 returning hits into n;
 delete from consumer_rate_limits where started_at<now()-interval '2 days';
 return n<=p_limit;
end $$;

-- The same advisory lock serializes checkout and recovery of an unseen request.
-- A recovery tombstone prevents a delayed checkout from creating a payment.
create function public.consumer_claim(p_id uuid,p_mode text,p_payload jsonb default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare a consumer_attempts; q consumer_quotes; s consumer_slots; token uuid:=gen_random_uuid(); reason text;
begin
 perform pg_advisory_xact_lock(68190120261010);
 select * into a from consumer_attempts where id=p_id for update;
 if found then
  if a.mode<>p_mode then raise exception 'MODE_MISMATCH'; end if;
  if p_payload is not null and a.fingerprint is not null and a.fingerprint<>p_payload->>'fingerprint' then raise exception 'REQUEST_MISMATCH'; end if;
 else
  if p_payload is null then
   insert into consumer_attempts(id,mode,status,close_code) values(p_id,p_mode,'not_created','REQUEST_NOT_CREATED') returning * into a;
   return jsonb_build_object('attempt',to_jsonb(a),'claimed',false);
  end if;
  select * into q from consumer_quotes where id=(p_payload->>'quoteId')::uuid and mode=p_mode;
  select * into s from consumer_slots where id=(p_payload->>'slotId')::uuid and quote_id=q.id;
  if q.id is null or s.id is null then reason:='INVALID_REQUEST';
  elsif q.expires_at<=now() then reason:='QUOTE_EXPIRED';
  elsif s.start_at<=now() then reason:='SLOT_UNAVAILABLE';
  elsif exists(select 1 from consumer_attempts where status not in('not_created','failed','canceled','expired') and
   (quote_id=q.id or (slot_start<s.end_at and slot_end>s.start_at))) then reason:='SLOT_UNAVAILABLE'; end if;
  if reason is not null then
   insert into consumer_attempts(id,mode,status,close_code) values(p_id,p_mode,'not_created',reason) returning * into a;
   return jsonb_build_object('attempt',to_jsonb(a),'claimed',false);
  end if;
  insert into consumer_attempts(id,mode,quote_id,slot_id,reference,fingerprint,customer,terms,terms_accepted_at,slot_start,slot_end)
   values(p_id,p_mode,q.id,s.id,'RS-'||upper(replace(p_id::text,'-','')),p_payload->>'fingerprint',p_payload->'customer',p_payload->'terms',now(),s.start_at,s.end_at)
   returning * into a;
 end if;
 if a.status in('not_created','failed','canceled','expired') or a.locked_until>now() then
  return jsonb_build_object('attempt',to_jsonb(a),'claimed',false);
 end if;
 update consumer_attempts set lease_token=token,locked_until=now()+interval '2 minutes',updated_at=now()
  where id=p_id returning * into a;
 return jsonb_build_object('attempt',to_jsonb(a),'claimed',true);
end $$;

-- Emails are queued in the transaction that records the verified appointment.
create function public.consumer_queue_mail() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if new.status='confirmed' and old.status is distinct from new.status then
  insert into consumer_mail_outbox(request_id,recipient_kind) values(new.id,'customer'),(new.id,'internal') on conflict do nothing;
 end if;
 return new;
end $$;
create trigger consumer_confirmed_mail after update on public.consumer_attempts for each row execute function public.consumer_queue_mail();
revoke all on function public.consumer_rate_limit(text,integer),public.consumer_claim(uuid,text,jsonb),public.consumer_queue_mail() from public,anon,authenticated;
grant execute on function public.consumer_rate_limit(text,integer),public.consumer_claim(uuid,text,jsonb) to service_role;
