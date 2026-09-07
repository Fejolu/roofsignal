-- Reject stale forms and direct API submissions, preserving historical appointments.
create or replace function public.reject_expired_parken_slot()
returns trigger language plpgsql set search_path = public as $$
begin
  if TG_OP = 'UPDATE' then
    if new.slot_date = old.slot_date and new.slot_time = old.slot_time then
      return new;
    end if;
  end if;
  if ((new.slot_date::text || ' ' || left(new.slot_time, 5))::timestamp
      at time zone 'Europe/Amsterdam') <= clock_timestamp() then
    raise exception 'SLOT_EXPIRED';
  end if;
  return new;
end;
$$;
create trigger parken_reject_expired_slot
before insert or update of slot_date, slot_time on public.parken_bookings
for each row execute function public.reject_expired_parken_slot();
