-- Prevent the booking RPC from confusing its output-column variables with table columns.

do $$
declare
  v_signature regprocedure := 'public.create_parken_booking(text,text,text,text,text,text,date,text,text,text,boolean,boolean,boolean)'::regprocedure;
  v_definition text;
  v_old_check text := 'exists(select 1 from public.parken_bookings where slot_date=p_slot_date and slot_time=p_slot_time and status not in (''cancelled'',''declined''))';
  v_new_check text := 'exists(select 1 from public.parken_bookings as booking where booking.slot_date=p_slot_date and booking.slot_time=p_slot_time and booking.status not in (''cancelled'',''declined''))';
begin
  select pg_get_functiondef(v_signature) into v_definition;

  if position(v_old_check in v_definition) = 0 then
    raise exception 'Expected De Parken slot check was not found';
  end if;

  execute replace(v_definition, v_old_check, v_new_check);
end;
$$;
