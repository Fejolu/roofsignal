-- Warm only the calendar hold while the customer fills in the form. Preparing
-- a hold records no customer, agreement or payment. Betalen promotes that exact
-- quote/slot atomically; existing accepted requests retain their identity.
alter table public.consumer_attempts
 add column preparation_only boolean not null default false,
 add column preparation_expires_at timestamptz,
 add column preparation_ready_at timestamptz;

alter table public.consumer_attempts add constraint consumer_preparation_has_no_order
 check (not preparation_only or (
  preparation_expires_at is not null and
  customer is null and terms is null and terms_accepted_at is null and
  payment_id is null and payment_started_at is null and payment_status is null and
  payment_payload is null and key_fingerprint is null and checkout_url is null and
  status in ('preparing','not_created','failed','canceled','expired')
 ));

create or replace function public.consumer_claim(p_id uuid,p_mode text,p_payload jsonb default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare a consumer_attempts; q consumer_quotes; s consumer_slots;
 token uuid:=gen_random_uuid(); reason text;
 preparing boolean:=coalesce(p_payload->'prepare'='true'::jsonb,false);
begin
 perform pg_advisory_xact_lock(68190120261010);
 select * into a from consumer_attempts where id=p_id for update;
 if found then
  if a.mode<>p_mode then raise exception 'MODE_MISMATCH'; end if;
  if a.preparation_only and a.status in ('not_created','failed','canceled','expired') then
   -- A completed discard/expiry is a durable request fence. Its draft
   -- fingerprint intentionally differs from the late final payload.
   return jsonb_build_object('attempt',to_jsonb(a),'claimed',false,'reason',a.close_code);
  end if;
  if a.preparation_only and a.status not in ('not_created','failed','canceled','expired') then
   if p_payload is not null then
    if a.quote_id is distinct from (p_payload->>'quoteId')::uuid or
       a.slot_id is distinct from (p_payload->>'slotId')::uuid then raise exception 'REQUEST_MISMATCH'; end if;
    if preparing and a.fingerprint is distinct from p_payload->>'fingerprint' then raise exception 'REQUEST_MISMATCH'; end if;
   end if;
   select * into q from consumer_quotes where id=a.quote_id and mode=p_mode;
   if q.id is null then reason:='INVALID_REQUEST';
   elsif q.expires_at<=now() then reason:='QUOTE_EXPIRED';
   elsif a.preparation_expires_at<=now() then reason:=coalesce(a.close_code,'PREPARATION_EXPIRED');
   elsif a.slot_start<=now() then reason:='SLOT_UNAVAILABLE'; end if;
   if reason is not null then
    -- Calendar cleanup happens under the returned lease, never in SQL. An
    -- expired draft stays a draft even if a late Betalen payload arrives.
    update consumer_attempts set preparation_expires_at=least(preparation_expires_at,now()),
     close_code=reason,next_attempt_at=now(),updated_at=now() where id=p_id returning * into a;
   elsif p_payload is not null and not preparing then
    if jsonb_typeof(p_payload->'customer') is distinct from 'object' or
       jsonb_typeof(p_payload->'terms') is distinct from 'object' or
       p_payload->'terms'->'accepted' is distinct from 'true'::jsonb or
       jsonb_typeof(p_payload->'terms'->'earlyStartRequested') is distinct from 'boolean' or
       nullif(p_payload->>'fingerprint','') is null then raise exception 'INVALID_REQUEST'; end if;
    -- Promotion deliberately precedes the lease check. An in-flight hold
    -- worker keeps its lease and re-reads the accepted state before continuing.
    update consumer_attempts set preparation_only=false,fingerprint=p_payload->>'fingerprint',
     customer=p_payload->'customer',terms=p_payload->'terms',terms_accepted_at=now(),
     close_code=null,updated_at=now() where id=p_id returning * into a;
   end if;
  elsif preparing then
   if a.quote_id is not null and (a.quote_id is distinct from (p_payload->>'quoteId')::uuid or
      a.slot_id is distinct from (p_payload->>'slotId')::uuid) then raise exception 'REQUEST_MISMATCH'; end if;
   return jsonb_build_object('attempt',to_jsonb(a),'claimed',false,'reason','PREPARATION_ALREADY_SUBMITTED');
  elsif p_payload is not null and a.fingerprint is not null and a.fingerprint<>p_payload->>'fingerprint' then
   raise exception 'REQUEST_MISMATCH';
  end if;
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
  elsif exists(select 1 from consumer_attempts where test_released_at is null and status not in ('not_created','failed','canceled','expired') and
   (quote_id=q.id or (slot_start<s.end_at and slot_end>s.start_at))) then reason:='SLOT_UNAVAILABLE'; end if;
  if reason is not null then
   insert into consumer_attempts(id,mode,status,close_code) values(p_id,p_mode,'not_created',reason) returning * into a;
   return jsonb_build_object('attempt',to_jsonb(a),'claimed',false);
  end if;
  insert into consumer_attempts(id,mode,quote_id,slot_id,reference,fingerprint,customer,terms,terms_accepted_at,
   slot_start,slot_end,preparation_only,preparation_expires_at)
   values(p_id,p_mode,q.id,s.id,'RS-'||upper(replace(p_id::text,'-','')),p_payload->>'fingerprint',
    case when preparing then null else p_payload->'customer' end,
    case when preparing then null else p_payload->'terms' end,
    case when preparing then null else now() end,s.start_at,s.end_at,preparing,
    case when preparing then least(q.expires_at,now()+interval '5 minutes') else null end)
   returning * into a;
 end if;
 if a.test_released_at is not null or a.status in ('not_created','failed','canceled','expired') or a.locked_until>now() then
  return jsonb_build_object('attempt',to_jsonb(a),'claimed',false,'reason',reason);
 end if;
 update consumer_attempts set lease_token=token,locked_until=now()+interval '2 minutes',updated_at=now()
  where id=p_id returning * into a;
 return jsonb_build_object('attempt',to_jsonb(a),'claimed',true,'reason',reason);
end $$;

create function public.consumer_discard_preparation(p_id uuid,p_mode text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare a consumer_attempts; token uuid:=gen_random_uuid();
begin
 perform pg_advisory_xact_lock(68190120261010);
 select * into a from consumer_attempts where id=p_id for update;
 if not found then
  -- Fence a delayed prepare request with the same ID. It may not recreate a
  -- discarded hold after its browser has moved to another choice.
  insert into consumer_attempts(id,mode,status,close_code) values(p_id,p_mode,'not_created','PREPARATION_DISCARDED') returning * into a;
  return jsonb_build_object('attempt',to_jsonb(a),'discarded',true,'claimed',false);
 end if;
 if a.mode<>p_mode then raise exception 'MODE_MISMATCH'; end if;
 if not a.preparation_only then
  return jsonb_build_object('attempt',to_jsonb(a),'discarded',false,'claimed',false,'reason','PREPARATION_ALREADY_SUBMITTED');
 end if;
 update consumer_attempts set preparation_expires_at=least(preparation_expires_at,now()),
  close_code='PREPARATION_DISCARDED',next_attempt_at=now(),updated_at=now()
  where id=p_id returning * into a;
 if a.test_released_at is not null or a.status in ('not_created','failed','canceled','expired') or a.locked_until>now() then
  return jsonb_build_object('attempt',to_jsonb(a),'discarded',true,'claimed',false,'reason','PREPARATION_DISCARDED');
 end if;
 update consumer_attempts set lease_token=token,locked_until=now()+interval '2 minutes',updated_at=now()
  where id=p_id returning * into a;
 return jsonb_build_object('attempt',to_jsonb(a),'discarded',true,'claimed',true,'reason','PREPARATION_DISCARDED');
end $$;

-- No public data/API grants change. Both RPCs remain server-only, and the
-- existing capacity index counts drafts until the backend removes their hold.
revoke all on function public.consumer_claim(uuid,text,jsonb),public.consumer_discard_preparation(uuid,text) from public,anon,authenticated;
grant execute on function public.consumer_claim(uuid,text,jsonb),public.consumer_discard_preparation(uuid,text) to service_role;
