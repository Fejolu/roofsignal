-- A database-only handoff to the separate RoofSignal ERP. No payment, email,
-- calendar or existing backoffice operation waits for the ERP HTTP endpoint.
-- Historical records are queued only by the explicit, paginated backfill RPC.
alter table public.lead_requests add column intake_details jsonb
 check(intake_details is null or jsonb_typeof(intake_details)='object');

create table public.erp_intake_outbox (
 source text not null check(source in ('consumer','parken','vve')),
 source_id uuid not null,
 revision integer not null default 1 check(revision > 0),
 changed_at timestamptz not null default now(),
 record jsonb not null check(jsonb_typeof(record)='object'),
 status text not null default 'pending' check(status in ('pending','processing','delivered','review')),
 attempts integer not null default 0 check(attempts >= 0),
 lock_token uuid, locked_until timestamptz,
 next_attempt_at timestamptz not null default now(),
 delivered_revision integer not null default 0 check(delivered_revision >= 0 and delivered_revision <= revision),
 accepted_at timestamptz, last_error text,
 primary key(source,source_id)
);
create index erp_intake_due on public.erp_intake_outbox(next_attempt_at)
 where status in ('pending','processing');
alter table public.erp_intake_outbox enable row level security;
revoke all on public.erp_intake_outbox from public,anon,authenticated;
grant select on public.erp_intake_outbox to service_role;

-- These projections are explicit allowlists. Recovery tokens, checkout URLs,
-- provider payloads, raw routes and internal leases never leave the source.
create function public.erp_consumer_record(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare v_record jsonb;
begin
 select jsonb_build_object(
  'id',a.id,'mode',a.mode,'reference',a.reference,'status',a.status,'close_code',a.close_code,
  'payment_id',a.payment_id,'payment_status',a.payment_status,'calendar_event_id',a.calendar_event_id,
  'customer',jsonb_build_object('name',a.customer->'name','email',a.customer->'email',
    'phone',a.customer->'phone','notes',a.customer->'notes'),
  'terms',jsonb_build_object('version',a.terms->'version','accepted',a.terms->'accepted',
    'earlyStartRequested',a.terms->'earlyStartRequested'),
  'terms_accepted_at',a.terms_accepted_at,'slot_start',a.slot_start,'slot_end',a.slot_end,
  'created_at',a.created_at,'updated_at',a.updated_at,
  'quote',jsonb_build_object('id',q.id,
    'address',jsonb_build_object('postcode',q.address->'postcode','houseNumber',q.address->'houseNumber',
      'street',q.address->'street','city',q.address->'city','country',q.address->'country'),
    'destination',q.destination,'inspection_type',q.inspection_type,'thermal',q.thermal,
    'pricing_version',q.pricing_version,
    'base_cents',case when q.inspection_type='thermal' then 0
      when not q.thermal then q.total_cents-q.travel_cents
      when q.pricing_version in ('2026-10-11-equal-standalone','2026-10-11-thermal-legacy') then q.total_cents-q.travel_cents-30250 else null end,
    'thermal_cents',case when not q.thermal then 0
      when q.inspection_type='thermal' then q.total_cents-q.travel_cents
      when q.pricing_version in ('2026-10-11-equal-standalone','2026-10-11-thermal-legacy') then 30250 else null end,
    'travel_cents',q.travel_cents,'total_cents',q.total_cents,'distance_meters',q.distance_meters,
    'travel_description',q.travel_description,'terms_version',q.terms_version,
    'policy_version',q.policy_version,'campaign',q.campaign,'created_at',q.created_at)) into v_record
 from public.consumer_attempts a join public.consumer_quotes q on q.id=a.quote_id
 where a.id=p_id and a.mode='live' and q.mode='live' and not a.preparation_only
   and a.test_released_at is null and (a.status<>'not_created'
     or exists(select 1 from erp_intake_outbox o where o.source='consumer' and o.source_id=a.id))
   and jsonb_typeof(a.customer)='object' and a.terms->'accepted'='true'::jsonb and a.terms_accepted_at is not null;
 if v_record is null then
  -- An accepted attempt can close before payment creation (e.g. its slot was
  -- taken). Close an already exported identity, even if cleanup removed the
  -- quote/customer fields; retain the earlier accepted price and agreement.
  select o.record || jsonb_build_object('status',a.status,'close_code',a.close_code,
   'payment_id',coalesce(to_jsonb(a.payment_id),o.record->'payment_id'),
   'payment_status',coalesce(to_jsonb(a.payment_status),o.record->'payment_status'),
   'calendar_event_id',coalesce(to_jsonb(a.calendar_event_id),o.record->'calendar_event_id'),
   'updated_at',a.updated_at) into v_record
  from consumer_attempts a join erp_intake_outbox o on o.source='consumer' and o.source_id=a.id
  where a.id=p_id and a.mode='live' and not a.preparation_only and a.test_released_at is null
    and a.status='not_created';
 end if;
 return v_record;
end
$$;

create function public.erp_parken_record(p_id uuid) returns jsonb
language sql stable security definer set search_path=public as $$
 select jsonb_build_object(
  'id',a.id,'reference',a.reference,'name',a.name,'email',a.email,'phone',a.phone,
  'street',a.street,'house_number',a.house_number,'postcode',a.postcode,
  'slot_date',a.slot_date,'slot_time',a.slot_time,'notes',a.notes,'status',a.status,'source',a.source,
  'terms_accepted_at',a.terms_accepted_at,'early_start_requested_at',a.early_start_requested_at,
  'thermography_interest_at',a.thermography_interest_at,'thermography_selected',a.thermography_selected,
  'offer_version',a.offer_version,'inspection_excl_cents',a.inspection_excl_cents,
  'thermography_excl_cents',a.thermography_excl_cents,'total_incl_cents',a.total_incl_cents,
  'terms_version',a.terms_version,'created_at',a.created_at,'updated_at',a.updated_at,
  'confirmation_sent_at',a.confirmation_sent_at,'organization_id',a.organization_id,
  'property_id',a.property_id,'appointment_id',a.appointment_id,'inspection_id',a.inspection_id)
 from public.parken_bookings a where a.id=p_id and a.reference !~ '^RS-PARKEN-TEST(-|$)'
$$;

create function public.erp_vve_record(p_id uuid) returns jsonb
language sql stable security definer set search_path=public as $$
 select jsonb_build_object(
  'id',a.id,'request_type',a.request_type,'name',a.name,'organization',a.organization,
  'email',a.email,'segment',a.segment,'postcode',a.postcode,'object_complexity',a.object_complexity,
  'site_access',a.site_access,'scope',a.scope,'message',a.message,'status',a.status,
  'source_path',a.source_path,'created_at',a.created_at,
  -- Historical messages are retained verbatim; amounts in them are indications,
  -- not accepted prices. Structured metadata is optional and additive.
  'intake_details',to_jsonb(a)->'intake_details')
 from public.lead_requests a where a.id=p_id and a.request_type='price'
  and rtrim(a.source_path,'/')='/inspectie-boeken' and a.segment='VvE / VvE-beheerder'
$$;

create function public.enqueue_erp_intake(p_source text,p_id uuid) returns boolean
language plpgsql security definer set search_path=public as $$
declare v_record jsonb; v_rows integer;
begin
 case p_source
  when 'consumer' then v_record:=erp_consumer_record(p_id);
  when 'parken' then v_record:=erp_parken_record(p_id);
  when 'vve' then v_record:=erp_vve_record(p_id);
  else raise exception 'INVALID_INTAKE_SOURCE';
 end case;
 if v_record is null then return false; end if;
 insert into erp_intake_outbox(source,source_id,record) values(p_source,p_id,v_record)
 on conflict(source,source_id) do update set
  revision=erp_intake_outbox.revision+1, changed_at=now(), record=excluded.record,
  status='pending',attempts=0,lock_token=null,locked_until=null,next_attempt_at=now(),last_error=null
 -- Processing heartbeats update source updated_at; these are not new bookings.
 where erp_intake_outbox.record-'updated_at' is distinct from excluded.record-'updated_at';
 get diagnostics v_rows=row_count;
 return v_rows>0;
end $$;

create function public.erp_intake_source_changed() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 perform enqueue_erp_intake(TG_ARGV[0],new.id);
 return new;
end $$;
create trigger erp_consumer_intake after insert or update on public.consumer_attempts
 for each row execute function public.erp_intake_source_changed('consumer');
create trigger erp_parken_intake after insert or update on public.parken_bookings
 for each row execute function public.erp_intake_source_changed('parken');
create trigger erp_vve_intake after insert or update on public.lead_requests
 for each row execute function public.erp_intake_source_changed('vve');

-- Quotes are normally immutable. A deliberate correction also gets a newer
-- source revision without repricing historical quotes to today's tariff.
create function public.erp_intake_quote_changed() returns trigger
language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
 for v_id in select id from consumer_attempts where quote_id=new.id loop
  perform enqueue_erp_intake('consumer',v_id);
 end loop;
 return new;
end $$;
create trigger erp_consumer_quote_intake after update on public.consumer_quotes
 for each row execute function public.erp_intake_quote_changed();

create function public.claim_erp_intakes(p_limit integer default 10)
returns setof public.erp_intake_outbox language sql security definer set search_path=public as $$
 with due as (
  select source,source_id from erp_intake_outbox
  where status in ('pending','processing') and next_attempt_at<=now()
    and (locked_until is null or locked_until<=now())
  order by next_attempt_at,source,source_id limit greatest(1,least(coalesce(p_limit,10),10))
  for update skip locked
 ) update erp_intake_outbox o set status='processing',attempts=o.attempts+1,
    lock_token=gen_random_uuid(),locked_until=now()+interval '2 minutes'
 from due where o.source=due.source and o.source_id=due.source_id returning o.*
$$;

create function public.ack_erp_intake(p_source text,p_source_id uuid,p_revision integer,p_lock_token uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare v_rows integer;
begin
 update erp_intake_outbox set status='delivered',delivered_revision=p_revision,
  accepted_at=now(),last_error=null,lock_token=null,locked_until=null
 where source=p_source and source_id=p_source_id and revision=p_revision
   and lock_token=p_lock_token and status='processing';
 get diagnostics v_rows=row_count;
 return v_rows=1;
end $$;

create function public.retry_erp_intake(p_source text,p_source_id uuid,p_revision integer,
 p_lock_token uuid,p_error text,p_review boolean default false)
returns boolean language plpgsql security definer set search_path=public as $$
declare v_rows integer;
begin
 update erp_intake_outbox set status=case when p_review then 'review' else 'pending' end,
  next_attempt_at=now()+make_interval(secs=>least(3600,30*power(2,least(attempts,7))::integer)),
  last_error=case when p_error in ('TRANSPORT_FAILED','TRANSPORT_TIMEOUT','REDIRECT_REJECTED',
   'RECEIVER_REJECTED','RECEIPT_INVALID','RECEIPT_TOO_LARGE','PAYLOAD_TOO_LARGE',
   'QUEUE_ACK_FAILED','SIGNING_FAILED','CONFIGURATION_REQUIRED') then p_error else 'TRANSPORT_FAILED' end,
  lock_token=null,locked_until=null
 where source=p_source and source_id=p_source_id and revision=p_revision
   and lock_token=p_lock_token and status='processing';
 get diagnostics v_rows=row_count;
 return v_rows=1;
end $$;

-- Repeated backfill is safe: unchanged source records neither create a new
-- revision nor reset delivery. Cursor and bounded batches keep it reviewable.
create function public.backfill_erp_intakes(p_source text,p_after uuid default null,p_limit integer default 100)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_last uuid; v_processed integer:=0; v_queued integer:=0;
 v_limit integer:=greatest(1,least(coalesce(p_limit,100),500)); v_more boolean:=false;
begin
 if p_source not in ('consumer','parken','vve') then raise exception 'INVALID_INTAKE_SOURCE'; end if;
 for v_id in
  select id from (
   select id from consumer_attempts where p_source='consumer'
   union all select id from parken_bookings where p_source='parken'
   union all select id from lead_requests where p_source='vve'
  ) ids where p_after is null or id>p_after order by id limit v_limit+1
 loop
  if v_processed=v_limit then v_more:=true; exit; end if;
  v_processed:=v_processed+1;v_last:=v_id;
  if enqueue_erp_intake(p_source,v_id) then v_queued:=v_queued+1; end if;
 end loop;
 return jsonb_build_object('source',p_source,'processed',v_processed,'queued',v_queued,
  'next_after',v_last,'has_more',v_more);
end $$;

revoke all on function public.erp_consumer_record(uuid),public.erp_parken_record(uuid),public.erp_vve_record(uuid),
 public.enqueue_erp_intake(text,uuid),public.erp_intake_source_changed(),public.erp_intake_quote_changed(),
 public.claim_erp_intakes(integer),public.ack_erp_intake(text,uuid,integer,uuid),
 public.retry_erp_intake(text,uuid,integer,uuid,text,boolean),public.backfill_erp_intakes(text,uuid,integer)
 from public,anon,authenticated;
grant execute on function public.claim_erp_intakes(integer),public.ack_erp_intake(text,uuid,integer,uuid),
 public.retry_erp_intake(text,uuid,integer,uuid,text,boolean),public.backfill_erp_intakes(text,uuid,integer)
 to service_role;
