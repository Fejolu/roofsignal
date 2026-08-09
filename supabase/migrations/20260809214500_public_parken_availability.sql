-- Expose only occupied De Parken slots to the public planner; never customer data.

create or replace function public.list_unavailable_parken_slots()
returns table(slot_date date, slot_time text)
language sql
stable
security definer
set search_path = public
as $$
  select booking.slot_date, booking.slot_time
  from public.parken_bookings as booking
  where booking.status not in ('cancelled', 'declined')
    and booking.slot_date between date '2026-09-01' and date '2026-09-30'
  order by booking.slot_date, booking.slot_time;
$$;

revoke all on function public.list_unavailable_parken_slots() from public;
grant execute on function public.list_unavailable_parken_slots() to anon, authenticated;

