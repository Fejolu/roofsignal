-- New orders record an explicit paid option and an immutable-at-booking price snapshot.
-- Historical marketing interest is deliberately not converted into an order.
alter table public.parken_bookings
  add column thermography_selected boolean not null default false,
  add column offer_version text,
  add column inspection_excl_cents integer,
  add column thermography_excl_cents integer,
  add column total_incl_cents integer;

alter table public.parken_bookings add constraint parken_order_price_snapshot check (
  (offer_version is null and inspection_excl_cents is null
    and thermography_excl_cents is null and total_incl_cents is null
    and thermography_selected = false)
  or
  (offer_version is not null and inspection_excl_cents is not null
    and thermography_excl_cents is not null and total_incl_cents is not null
    and inspection_excl_cents >= 0 and thermography_excl_cents >= 0
    and thermography_selected = (thermography_excl_cents > 0)
    and total_incl_cents = round((inspection_excl_cents + thermography_excl_cents)::numeric * 1.21))
);

create or replace function public.create_parken_booking_with_options(
  p_name text, p_email text, p_phone text, p_street text,
  p_house_number text, p_postcode text, p_slot_date date, p_slot_time text,
  p_notes text, p_source text, p_terms_accepted boolean,
  p_early_start_requested boolean, p_thermography_selected boolean, p_offer_version text
)
returns table(reference text, slot_date date, slot_time text,
  thermography_selected boolean, total_incl_cents integer)
language plpgsql security definer set search_path = public as $$
declare
  v_booking record;
  v_thermal boolean := coalesce(p_thermography_selected, false);
  v_total integer := case when v_thermal then 66429 else 36179 end;
  v_order_note text;
begin
  if p_offer_version is distinct from 'parken-2026-09-17-thermography' then
    raise exception 'OFFER_UPDATED';
  end if;
  if p_terms_accepted is distinct from true then
    raise exception 'TERMS_REQUIRED';
  end if;
  v_order_note := case when v_thermal then
    'Geboekt: RoofSignal Inspectie EUR 299 excl. btw + thermografische inspectie EUR 250 excl. btw. Totaal EUR 664,29 incl. btw. Reiskosten binnen De Parken inbegrepen. Thermografie zo nodig op een apart, afgestemd moment bij geschikte meetomstandigheden.'
  else
    'Geboekt: RoofSignal Inspectie EUR 299 excl. btw. Totaal EUR 361,79 incl. btw. Geen thermografische inspectie bijgeboekt. Reiskosten binnen De Parken inbegrepen.'
  end;

  -- Reuse all live address, date, slot, locking and backoffice synchronization safeguards.
  -- The order note goes first so the existing 1500-character limit cannot truncate it.
  select * into strict v_booking from public.create_parken_booking(
    p_name, p_email, p_phone, p_street, p_house_number, p_postcode,
    p_slot_date, p_slot_time, v_order_note || E'\n\nBijzonderheden klant: ' || left(coalesce(p_notes, ''), 1000),
    p_source, p_terms_accepted, p_early_start_requested, false
  );
  update public.parken_bookings as booking
  set thermography_selected = v_thermal,
      offer_version = p_offer_version,
      inspection_excl_cents = 29900,
      thermography_excl_cents = case when v_thermal then 25000 else 0 end,
      total_incl_cents = v_total
  where booking.reference = v_booking.reference;

  return query select v_booking.reference::text, v_booking.slot_date::date,
    v_booking.slot_time::text, v_thermal, v_total;
end;
$$;
revoke all on function public.create_parken_booking_with_options(text,text,text,text,text,text,date,text,text,text,boolean,boolean,boolean,text) from public, anon, authenticated;
grant execute on function public.create_parken_booking_with_options(text,text,text,text,text,text,date,text,text,text,boolean,boolean,boolean,text) to service_role;
