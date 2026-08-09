-- Prevent the booking RPC from confusing its output-column variables with table columns.

do $$
declare
  v_signature regprocedure := 'public.create_parken_booking(text,text,text,text,text,text,date,text,text,text,boolean,boolean,boolean)'::regprocedure;
  v_definition text;
begin
  select pg_get_functiondef(v_signature) into v_definition;

  if position('booking.parken_bookings.slot_date' in v_definition) > 0 then
    v_definition := replace(v_definition, 'booking.parken_bookings.slot_date', 'booking.slot_date');
    v_definition := replace(v_definition, 'booking.parken_bookings.slot_time', 'booking.slot_time');
  elsif position('from public.parken_bookings where slot_date=p_slot_date and slot_time=p_slot_time' in v_definition) > 0 then
    v_definition := replace(
      v_definition,
      'from public.parken_bookings where slot_date=p_slot_date and slot_time=p_slot_time',
      'from public.parken_bookings as booking where booking.slot_date=p_slot_date and booking.slot_time=p_slot_time'
    );
  elsif position('booking.slot_date' in v_definition) > 0
        and position('booking.slot_time' in v_definition) > 0 then
    return;
  else
    raise exception 'Expected De Parken slot comparisons were not found';
  end if;

  execute v_definition;
end;
$$;
