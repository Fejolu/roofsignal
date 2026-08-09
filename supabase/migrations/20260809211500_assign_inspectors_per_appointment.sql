-- New consumer bookings enter Planning without an inspector. The planner
-- assigns an employee whose inspector role is managed in Medewerkers & HR.

create or replace function public.keep_new_parken_booking_unassigned()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_appointment_id uuid;
begin
  if new.inspector_id is null then
    select appointment_id into v_appointment_id
    from public.parken_bookings
    where id = new.id;

    update public.appointments
    set inspector_id = null
    where id = v_appointment_id;

    update public.parken_bookings
    set inspector_id = null
    where id = new.id
      and inspector_id is not null;
  end if;
  return new;
end;
$$;

drop trigger if exists zz_parken_booking_leave_unassigned on public.parken_bookings;
create trigger zz_parken_booking_leave_unassigned
after insert or update of slot_date, slot_time, status
on public.parken_bookings
for each row execute function public.keep_new_parken_booking_unassigned();
