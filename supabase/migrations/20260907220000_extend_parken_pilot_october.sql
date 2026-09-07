-- Extend the pilot window, keeping validation, capacity and booking synchronization intact.
do $$
declare
  definition text;
begin
  select pg_get_functiondef('public.create_parken_booking(text,text,text,text,text,text,date,text,text,text,boolean,boolean,boolean)'::regprocedure) into definition;
  if position('2026-09-30' in definition) = 0 then
    raise exception 'Expected pilot end date not found; review booking function';
  end if;
  execute replace(definition, '2026-09-30', '2026-10-31');
end;
$$;

create or replace function public.list_unavailable_parken_slots()
returns table(slot_date date, slot_time text)
language sql stable security definer set search_path = public as $$
  select booking.slot_date, booking.slot_time
  from public.parken_bookings as booking
  where booking.status not in ('cancelled', 'declined')
    and booking.slot_date between date '2026-09-01' and date '2026-10-31'
  order by booking.slot_date, booking.slot_time;
$$;
revoke all on function public.list_unavailable_parken_slots() from public;
grant execute on function public.list_unavailable_parken_slots() to anon, authenticated;
