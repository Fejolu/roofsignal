-- Retain test history without leaving a released test reservation in capacity.
alter table public.consumer_attempts add column test_released_at timestamptz;
alter table public.consumer_attempts add constraint consumer_test_cleanup_only check(test_released_at is null or mode='test');
drop index public.consumer_one_active_quote;
create unique index consumer_one_active_quote on public.consumer_attempts(quote_id)
 where test_released_at is null and status not in('not_created','failed','canceled','expired');
alter table public.consumer_mail_outbox drop constraint consumer_mail_outbox_status_check;
alter table public.consumer_mail_outbox add constraint consumer_mail_outbox_status_check check(status in('pending','accepted','review','canceled'));

create or replace function public.consumer_claim(p_id uuid,p_mode text,p_payload jsonb default null)
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
  elsif exists(select 1 from consumer_attempts where test_released_at is null and status not in('not_created','failed','canceled','expired') and
   (quote_id=q.id or (slot_start<s.end_at and slot_end>s.start_at))) then reason:='SLOT_UNAVAILABLE'; end if;
  if reason is not null then
   insert into consumer_attempts(id,mode,status,close_code) values(p_id,p_mode,'not_created',reason) returning * into a;
   return jsonb_build_object('attempt',to_jsonb(a),'claimed',false);
  end if;
  insert into consumer_attempts(id,mode,quote_id,slot_id,reference,fingerprint,customer,terms,terms_accepted_at,slot_start,slot_end)
   values(p_id,p_mode,q.id,s.id,'RS-'||upper(replace(p_id::text,'-','')),p_payload->>'fingerprint',p_payload->'customer',p_payload->'terms',now(),s.start_at,s.end_at)
   returning * into a;
 end if;
 if a.test_released_at is not null or a.status in('not_created','failed','canceled','expired') or a.locked_until>now() then
  return jsonb_build_object('attempt',to_jsonb(a),'claimed',false);
 end if;
 update consumer_attempts set lease_token=token,locked_until=now()+interval '2 minutes',updated_at=now()
  where id=p_id returning * into a;
 return jsonb_build_object('attempt',to_jsonb(a),'claimed',true);
end $$;

