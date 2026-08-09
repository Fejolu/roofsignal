-- Turn every De Parken consumer booking into an operational backoffice dossier.

alter table public.parken_bookings
  add column if not exists organization_id uuid references public.organizations(id) on delete set null,
  add column if not exists property_id uuid references public.properties(id) on delete set null,
  add column if not exists appointment_id uuid references public.appointments(id) on delete set null,
  add column if not exists inspection_id uuid references public.inspections(id) on delete set null,
  add column if not exists inspector_id uuid references public.profiles(id) on delete set null;

create unique index if not exists parken_bookings_appointment_id_idx
  on public.parken_bookings (appointment_id) where appointment_id is not null;
create unique index if not exists parken_bookings_inspection_id_idx
  on public.parken_bookings (inspection_id) where inspection_id is not null;

create or replace function public.sync_parken_booking_to_backoffice(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.parken_bookings%rowtype;
  v_inspector_id uuid;
  v_organization_id uuid;
  v_property_id uuid;
  v_appointment_id uuid;
  v_inspection_id uuid;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_address text;
  v_notes text;
begin
  select * into v_booking
  from public.parken_bookings
  where id = p_booking_id
  for update;

  if not found then
    raise exception 'PARKEN_BOOKING_NOT_FOUND';
  end if;

  select id into v_inspector_id
  from public.profiles
  where lower(email) = 'ferry@roofsignal.nl'
  limit 1;

  if v_inspector_id is null then
    raise exception 'PARKEN_INSPECTOR_PROFILE_NOT_FOUND';
  end if;

  v_address := trim(v_booking.street) || ' ' || trim(v_booking.house_number);
  v_starts_at := (v_booking.slot_date::text || ' ' || left(v_booking.slot_time, 5))::timestamp at time zone 'Europe/Amsterdam';
  v_ends_at := (v_booking.slot_date::text || ' ' || right(v_booking.slot_time, 5))::timestamp at time zone 'Europe/Amsterdam';
  v_notes := concat_ws(E'\n',
    'Pilotboeking ' || v_booking.reference,
    nullif(trim(v_booking.notes), ''),
    case when v_booking.early_start_requested_at is not null then 'Klant verzoekt uitvoering binnen de bedenktijd.' end,
    case when v_booking.thermography_interest_at is not null then 'Klant wil informatie over thermische inspecties in Q4.' end
  );

  v_organization_id := v_booking.organization_id;
  if v_organization_id is null then
    select id into v_organization_id
    from public.organizations
    where lower(contact_email) = lower(v_booking.email)
      and deleted_at is null
    order by created_at
    limit 1;
  end if;

  if v_organization_id is null then
    insert into public.organizations (
      name, segment, contact_name, contact_email, contact_phone, address, status, notes
    ) values (
      v_booking.name, 'Particulier', v_booking.name, lower(v_booking.email), v_booking.phone,
      v_address || ', ' || v_booking.postcode || ' Apeldoorn', 'active',
      'Aangemaakt vanuit De Parken Pilot 2026 · ' || v_booking.reference
    ) returning id into v_organization_id;
  else
    update public.organizations
    set contact_name = coalesce(nullif(contact_name, ''), v_booking.name),
        contact_phone = coalesce(nullif(contact_phone, ''), v_booking.phone),
        address = coalesce(nullif(address, ''), v_address || ', ' || v_booking.postcode || ' Apeldoorn'),
        status = case when status = 'prospect' then 'active' else status end
    where id = v_organization_id;
  end if;

  v_property_id := v_booking.property_id;
  if v_property_id is null then
    select id into v_property_id
    from public.properties
    where organization_id = v_organization_id
      and upper(regexp_replace(coalesce(postcode, ''), '\s', '', 'g')) = v_booking.postcode
      and lower(coalesce(address, '')) = lower(v_address)
      and deleted_at is null
    order by created_at
    limit 1;
  end if;

  if v_property_id is null then
    insert into public.properties (
      organization_id, name, address, postcode, city, property_type, status
    ) values (
      v_organization_id, v_address, v_address, v_booking.postcode, 'Apeldoorn',
      'Grondgebonden woning', 'active'
    ) returning id into v_property_id;
  end if;

  v_appointment_id := v_booking.appointment_id;
  if v_appointment_id is null then
    insert into public.appointments (
      organization_id, property_id, inspector_id, title, starts_at, ends_at, status, notes
    ) values (
      v_organization_id, v_property_id, v_inspector_id, 'Woningscan De Parken',
      v_starts_at, v_ends_at,
      case when v_booking.status in ('cancelled','declined') then 'cancelled' else 'planned' end,
      v_notes
    ) returning id into v_appointment_id;
  else
    update public.appointments
    set organization_id = v_organization_id,
        property_id = v_property_id,
        inspector_id = v_inspector_id,
        starts_at = v_starts_at,
        ends_at = v_ends_at,
        status = case when v_booking.status in ('cancelled','declined') then 'cancelled' else status end,
        notes = v_notes
    where id = v_appointment_id;
  end if;

  v_inspection_id := v_booking.inspection_id;
  if v_inspection_id is null then
    insert into public.inspections (
      organization_id, property_id, appointment_id, reference, inspection_product,
      inspection_depth, scope, status, scheduled_at, summary
    ) values (
      v_organization_id, v_property_id, v_appointment_id, v_booking.reference,
      'object_report', 'basis',
      'Woningscan De Parken: dak, gevel, goten en schoorsteen',
      case when v_booking.status in ('cancelled','declined') then 'cancelled' else 'planned' end,
      v_starts_at, v_notes
    ) returning id into v_inspection_id;
  else
    update public.inspections
    set organization_id = v_organization_id,
        property_id = v_property_id,
        appointment_id = v_appointment_id,
        scheduled_at = v_starts_at,
        status = case when v_booking.status in ('cancelled','declined') then 'cancelled' else status end,
        summary = v_notes
    where id = v_inspection_id;
  end if;

  update public.parken_bookings
  set organization_id = v_organization_id,
      property_id = v_property_id,
      appointment_id = v_appointment_id,
      inspection_id = v_inspection_id,
      inspector_id = v_inspector_id,
      updated_at = now()
  where id = p_booking_id;
end;
$$;

revoke all on function public.sync_parken_booking_to_backoffice(uuid) from public;
grant execute on function public.sync_parken_booking_to_backoffice(uuid) to authenticated;

create or replace function public.sync_parken_booking_to_backoffice_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.sync_parken_booking_to_backoffice(new.id);
  return new;
end;
$$;

drop trigger if exists parken_booking_backoffice_sync on public.parken_bookings;
create trigger parken_booking_backoffice_sync
after insert or update of slot_date, slot_time, status
on public.parken_bookings
for each row execute function public.sync_parken_booking_to_backoffice_trigger();

do $$
declare
  v_booking_id uuid;
begin
  for v_booking_id in select id from public.parken_bookings order by created_at
  loop
    perform public.sync_parken_booking_to_backoffice(v_booking_id);
  end loop;
end;
$$;
