-- New agreements retain their terms version; historical agreements stay unchanged.
alter table public.parken_bookings add column terms_version text;

create or replace function public.create_parken_booking_with_terms(
  p_name text, p_email text, p_phone text, p_street text,
  p_house_number text, p_postcode text, p_slot_date date, p_slot_time text,
  p_notes text, p_source text, p_terms_accepted boolean,
  p_early_start_requested boolean, p_thermography_selected boolean, p_offer_version text,
  p_terms_version text
)
returns table(reference text, slot_date date, slot_time text,
  thermography_selected boolean, total_incl_cents integer)
language plpgsql security definer set search_path = public as $$
declare v_booking record;
begin
  if p_terms_version is distinct from '2026-09-21' then
    raise exception 'OFFER_UPDATED';
  end if;
  select * into strict v_booking from public.create_parken_booking_with_options(
    p_name, p_email, p_phone, p_street, p_house_number, p_postcode, p_slot_date, p_slot_time,
    'Voorwaarden en bedenktijdinformatie: ' || p_terms_version || E'\n' || coalesce(p_notes, ''),
    p_source, p_terms_accepted, p_early_start_requested, p_thermography_selected, p_offer_version
  );
  update public.parken_bookings as b set terms_version = p_terms_version where b.reference = v_booking.reference;
  return query select v_booking.reference::text, v_booking.slot_date::date, v_booking.slot_time::text,
    v_booking.thermography_selected::boolean, v_booking.total_incl_cents::integer;
end;
$$;
revoke all on function public.create_parken_booking_with_terms(text,text,text,text,text,text,date,text,text,text,boolean,boolean,boolean,text,text) from public, anon, authenticated;
grant execute on function public.create_parken_booking_with_terms(text,text,text,text,text,text,date,text,text,text,boolean,boolean,boolean,text,text) to service_role;
