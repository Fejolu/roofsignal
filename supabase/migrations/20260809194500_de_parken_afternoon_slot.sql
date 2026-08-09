-- Align the live weekday slot with the final operating window: 16:00–18:00.

update public.parken_bookings
set slot_time = '16:00-18:00', updated_at = now()
where slot_time = '16:30-18:30'
  and slot_date between date '2026-09-01' and date '2026-09-30';

do $$
declare
  v_signature regprocedure := 'public.create_parken_booking(text,text,text,text,text,text,date,text,text,text,boolean,boolean,boolean)'::regprocedure;
  v_definition text;
begin
  select pg_get_functiondef(v_signature) into v_definition;
  if position('16:30-18:30' in v_definition) > 0 then
    execute replace(v_definition, '16:30-18:30', '16:00-18:00');
  end if;
end;
$$;
