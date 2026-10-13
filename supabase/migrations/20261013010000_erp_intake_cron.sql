-- Source-project scheduler for the already authenticated ERP intake worker.
-- No credentials appear in this migration or the stored cron command. Runtime
-- provisioning stores the existing narrow ERP key in Vault under the fixed name.
begin;
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- Supabase owns pg_net and grants its queues to PUBLIC. Those provider grants
-- cannot be revoked by postgres. The queue therefore carries only an empty
-- body and a purpose-specific, expiring, one-use capability, never the key.

create schema if not exists roofsignal_erp_automation;
revoke all on schema roofsignal_erp_automation from public,anon,authenticated,service_role;
create table if not exists roofsignal_erp_automation.dispatch_state (
 singleton boolean primary key default true check(singleton),
 next_dispatch_at timestamptz not null default '-infinity',
 last_request_id bigint,
 last_dispatched_at timestamptz,
 nonce uuid,
 signed_timestamp bigint,
 expires_at timestamptz,
 consumed_at timestamptz,
 check((nonce is null and signed_timestamp is null and expires_at is null)
  or(nonce is not null and signed_timestamp is not null and expires_at is not null))
);
insert into roofsignal_erp_automation.dispatch_state(singleton) values(true) on conflict do nothing;
revoke all on table roofsignal_erp_automation.dispatch_state from public,anon,authenticated,service_role;

-- Provision through a bound REST/RPC parameter, never a SQL secret literal.
-- Existing administrator credentials may set only this one narrow Vault name.
create or replace function public.set_erp_intake_scheduler_secret(p_secret text)
returns boolean language plpgsql security definer set search_path=pg_catalog as $$
declare matches integer; secret_id uuid;
begin
 if p_secret is null or p_secret!~'^[a-f0-9]{64}$' then raise exception 'ERP_SCHEDULER_SECRET_INVALID';end if;
 perform pg_advisory_xact_lock(hashtextextended('roofsignal-erp-scheduler-secret',0));
 select count(*)::integer,(array_agg(id))[1] into matches,secret_id
 from vault.secrets where name='roofsignal_erp_intake_key';
 if matches>1 then raise exception 'ERP_SCHEDULER_SECRET_CONFLICT';end if;
 if matches=0 then
  perform vault.create_secret(p_secret,'roofsignal_erp_intake_key','RoofSignal ERP-only intake worker');
 else
  perform vault.update_secret(secret_id,p_secret);
 end if;
 return true;
end;
$$;
alter function public.set_erp_intake_scheduler_secret(text) owner to postgres;
revoke all on function public.set_erp_intake_scheduler_secret(text) from public,anon,authenticated;
grant execute on function public.set_erp_intake_scheduler_secret(text) to service_role;

-- Only the existing server worker may consume the verified capability. One
-- atomic UPDATE gives exactly one winner, including concurrent/replayed calls.
create or replace function public.consume_erp_intake_scheduler_nonce(p_nonce uuid,p_timestamp bigint)
returns boolean language plpgsql security definer set search_path=pg_catalog as $$
declare consumed boolean;
begin
 update roofsignal_erp_automation.dispatch_state set consumed_at=clock_timestamp()
 where singleton and nonce=p_nonce and signed_timestamp=p_timestamp
  and consumed_at is null and expires_at>clock_timestamp()
 returning true into consumed;
 return coalesce(consumed,false);
end;
$$;
alter function public.consume_erp_intake_scheduler_nonce(uuid,bigint) owner to postgres;
revoke all on function public.consume_erp_intake_scheduler_nonce(uuid,bigint) from public,anon,authenticated;
grant execute on function public.consume_erp_intake_scheduler_nonce(uuid,bigint) to service_role;

create or replace function roofsignal_erp_automation.dispatch_intakes()
returns bigint language plpgsql security definer set search_path=pg_catalog as $$
declare state roofsignal_erp_automation.dispatch_state; tick timestamptz:=clock_timestamp();
 dispatch_key text; key_count integer; request_id bigint;
 dispatch_nonce uuid; dispatch_timestamp bigint; signature text;
begin
 -- One row serializes simultaneous/manual scheduler calls. A pending pg_net
 -- request cannot accumulate copies if its background worker is unavailable.
 select * into strict state from roofsignal_erp_automation.dispatch_state where singleton for update;
 if state.next_dispatch_at>tick then return null;end if;
 -- A still-live capability must not be replaced while its HTTP call is racing
 -- the next scheduler tick. It remains single-use even after pg_net dequeues it.
 if state.consumed_at is null and state.expires_at>tick then return null;end if;
 if exists(select 1 from net.http_request_queue
  where url='https://kakpticlxlaxtebhsuoh.supabase.co/functions/v1/process-erp-intakes')
  then return null;end if;
 if not exists(select 1 from public.erp_intake_outbox where status in('pending','processing')
  and next_attempt_at<=tick and(locked_until is null or locked_until<=tick)) then return null;end if;

 select count(*)::integer,min(decrypted_secret) into key_count,dispatch_key
 from vault.decrypted_secrets where name='roofsignal_erp_intake_key';
 if key_count<>1 or dispatch_key is null or dispatch_key!~'^[a-f0-9]{64}$'
  then raise exception 'ERP_DISPATCH_KEY_REQUIRED';end if;
 dispatch_nonce:=gen_random_uuid();
 dispatch_timestamp:=floor(extract(epoch from tick))::bigint;
 signature:=encode(extensions.hmac(
  convert_to(dispatch_timestamp::text||'.erp-drain:v1.'||dispatch_nonce::text||'.{}','UTF8'),
  decode(dispatch_key,'hex'),'sha256'),'hex');
 request_id:=net.http_post(
  url:='https://kakpticlxlaxtebhsuoh.supabase.co/functions/v1/process-erp-intakes',
  body:='{}'::jsonb,
  headers:=jsonb_build_object('Content-Type','application/json',
   'x-roofsignal-dispatch-timestamp',dispatch_timestamp::text,
   'x-roofsignal-dispatch-nonce',dispatch_nonce::text,
   'x-roofsignal-dispatch-signature',signature),
  timeout_milliseconds:=45000);
 if request_id is null then raise exception 'ERP_DISPATCH_NOT_QUEUED';end if;
 update roofsignal_erp_automation.dispatch_state set last_request_id=request_id,
  last_dispatched_at=tick,next_dispatch_at=tick+interval '45 seconds',
  nonce=dispatch_nonce,signed_timestamp=dispatch_timestamp,
  expires_at=to_timestamp(dispatch_timestamp+60),consumed_at=null where singleton;
 return request_id;
end;
$$;
alter function roofsignal_erp_automation.dispatch_intakes() owner to postgres;
revoke all on function roofsignal_erp_automation.dispatch_intakes() from public,anon,authenticated,service_role;
grant execute on function roofsignal_erp_automation.dispatch_intakes() to postgres;

do $$
declare installed cron.job; job_name constant text:='roofsignal-erp-intake-every-minute';
 job_command constant text:='select roofsignal_erp_automation.dispatch_intakes();';
begin
 if current_user<>'postgres' then raise exception 'ERP_SCHEDULER_OWNER_REQUIRED';end if;
 if has_table_privilege('anon','vault.decrypted_secrets','SELECT')
  or has_table_privilege('authenticated','vault.decrypted_secrets','SELECT')
  then raise exception 'ERP_SCHEDULER_PRIVATE_STORAGE_REQUIRED';end if;
 if(select count(*) from cron.job where jobname=job_name)>1 then raise exception 'ERP_SCHEDULER_JOB_CONFLICT';end if;
 select * into installed from cron.job where jobname=job_name;
 if found then
  if installed.username<>'postgres' or installed.database<>current_database()
   or installed.command<>job_command or installed.schedule<>'* * * * *'
   then raise exception 'ERP_SCHEDULER_JOB_CONFLICT';end if;
  -- Reapplying a migration must not reactivate a deliberately paused job.
 else
  perform cron.schedule(job_name,'* * * * *',job_command);
 end if;
end;
$$;
notify pgrst,'reload schema';
commit;
