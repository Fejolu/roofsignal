-- Optional coarse source label; old/direct visits stay unattributed.
alter table public.consumer_quotes add column campaign text
 check(campaign in('search_consument_apeldoorn','google_bedrijfsprofiel','parken_flyer'));

-- One row per actual attempt, not per browser return, webhook or email.
-- Gross confirmed booking value only: refunds/chargebacks must be checked
-- against Mollie before calculating retained sales, net revenue or CAC.
create function public.consumer_acquisition_summary(p_from timestamptz,p_until timestamptz)
returns table(campaign text,confirmed_bookings bigint,thermal_bookings bigint,gross_cents bigint)
language sql stable security invoker set search_path=public as $$
 select coalesce(q.campaign,'unattributed'),count(*),count(*) filter(where q.thermal),sum(q.total_cents)::bigint
 from consumer_attempts a join consumer_quotes q on q.id=a.quote_id
 where a.mode='live' and q.mode='live' and a.status='confirmed'
   and a.payment_status='paid' and a.payment_id is not null and a.calendar_event_id is not null
   and a.test_released_at is null and a.created_at>=p_from and a.created_at<p_until
 group by q.campaign
$$;
revoke all on function public.consumer_acquisition_summary(timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.consumer_acquisition_summary(timestamptz,timestamptz) to service_role;
