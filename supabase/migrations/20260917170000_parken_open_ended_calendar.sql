-- Remove the campaign end date; existing slot/expiry/consent safeguards remain.
do $$
declare
  definition text;
  old_condition constant text := 'p_slot_date < date ''2026-09-01'' or p_slot_date > date ''2026-10-31''';
  new_condition constant text := 'p_slot_date is null or not isfinite(p_slot_date)';
begin
  select pg_get_functiondef('public.create_parken_booking(text,text,text,text,text,text,date,text,text,text,boolean,boolean,boolean)'::regprocedure) into definition;
  if (length(definition) - length(replace(definition, old_condition, ''))) / length(old_condition) <> 1 then
    raise exception 'Expected exactly one Parken date window; review live booking function';
  end if;
  definition := replace(definition, old_condition, new_condition);
  if position('pg_advisory_xact_lock' in definition) = 0
    or position('SLOT_TAKEN' in definition) = 0
    or position('INVALID_PILOT_SLOT' in definition) = 0
    or position('TERMS_REQUIRED' in definition) = 0
    or position('ADDRESS_OUTSIDE_PILOT' in definition) = 0
    or not exists(select 1 from pg_trigger where tgrelid='public.parken_bookings'::regclass
      and tgname='parken_reject_expired_slot' and tgenabled <> 'D') then
    raise exception 'Required Parken booking safeguards missing';
  end if;
  execute definition;
end;
$$;

-- Keep returning only occupied dates/times, including later months and years.
create or replace function public.list_unavailable_parken_slots()
returns table(slot_date date, slot_time text)
language sql stable security definer set search_path = public as $$
  select booking.slot_date, booking.slot_time
  from public.parken_bookings as booking
  where booking.status not in ('cancelled', 'declined')
    and booking.slot_date >= (now() at time zone 'Europe/Amsterdam')::date
  order by booking.slot_date, booking.slot_time;
$$;
revoke all on function public.list_unavailable_parken_slots() from public;
grant execute on function public.list_unavailable_parken_slots() to anon, authenticated;
