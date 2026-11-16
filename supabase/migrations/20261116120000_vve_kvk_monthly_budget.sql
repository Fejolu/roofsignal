begin;

-- Durable counters survive cleanup of the rolling abuse-prevention log.
create table public.vve_kvk_monthly_usage (
  month date primary key,
  lookup_count integer not null default 0 check (lookup_count >= 0),
  warned_at timestamptz,
  warning_claim uuid,
  warning_claim_until timestamptz
);
alter table public.vve_kvk_monthly_usage enable row level security;
revoke all on public.vve_kvk_monthly_usage from public, anon, authenticated, service_role;

-- Include this month's requests made before the monthly cap was introduced.
insert into public.vve_kvk_monthly_usage (month, lookup_count)
select date_trunc('month', created_at at time zone 'Europe/Amsterdam')::date, count(*)::integer
from public.public_form_attempts
where form_type = 'vve_kvk'
group by 1;

create or replace function public.consume_vve_kvk_lookup(p_ip_hash text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  current_month date := date_trunc('month', now() at time zone 'Europe/Amsterdam')::date;
  used integer;
begin
  if p_ip_hash is null or p_ip_hash !~ '^[a-f0-9]{64}$' then return false; end if;
  -- Same lock as the existing daily/hourly gate: reserve before calling KVK.
  perform pg_advisory_xact_lock(726641109);
  insert into public.vve_kvk_monthly_usage(month) values(current_month) on conflict do nothing;
  select lookup_count into used from public.vve_kvk_monthly_usage where month = current_month;
  if used >= 100
    or (select count(*) from public.public_form_attempts
        where form_type = 'vve_kvk' and created_at >= now() - interval '24 hours') >= 100
    or (select count(*) from public.public_form_attempts
        where form_type = 'vve_kvk' and ip_hash = p_ip_hash
        and created_at >= now() - interval '1 hour') >= 10 then
    return false;
  end if;
  update public.vve_kvk_monthly_usage set lookup_count = lookup_count + 1 where month = current_month;
  insert into public.public_form_attempts(ip_hash, form_type) values(p_ip_hash, 'vve_kvk');
  return true;
end;
$$;
revoke all on function public.consume_vve_kvk_lookup(text) from public, anon, authenticated;
grant execute on function public.consume_vve_kvk_lookup(text) to service_role;

-- One worker owns each pending warning for five minutes. Failed deliveries can
-- be retried without allocating any additional KVK requests.
create function public.claim_vve_kvk_budget_warning()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare usage public.vve_kvk_monthly_usage%rowtype; claim uuid;
begin
  select * into usage from public.vve_kvk_monthly_usage
  where lookup_count >= 80 and warned_at is null
    and (warning_claim_until is null or warning_claim_until < now())
  order by month limit 1 for update skip locked;
  if not found then return null; end if;
  claim := gen_random_uuid();
  update public.vve_kvk_monthly_usage set warning_claim = claim,
    warning_claim_until = now() + interval '5 minutes' where month = usage.month;
  return jsonb_build_object('month', usage.month, 'count', usage.lookup_count,
    'limit', 100, 'threshold', 80, 'claim', claim);
end;
$$;
revoke all on function public.claim_vve_kvk_budget_warning() from public, anon, authenticated;
grant execute on function public.claim_vve_kvk_budget_warning() to service_role;

create function public.finish_vve_kvk_budget_warning(p_month date, p_claim uuid, p_delivered boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update public.vve_kvk_monthly_usage set
    warned_at = case when p_delivered then now() else warned_at end,
    warning_claim = null, warning_claim_until = null
  where month = p_month and warning_claim = p_claim and warned_at is null;
  return found;
end;
$$;
revoke all on function public.finish_vve_kvk_budget_warning(date,uuid,boolean) from public, anon, authenticated;
grant execute on function public.finish_vve_kvk_budget_warning(date,uuid,boolean) to service_role;
notify pgrst, 'reload schema';
commit;
