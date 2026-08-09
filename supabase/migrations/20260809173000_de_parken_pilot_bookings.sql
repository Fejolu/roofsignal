-- De Parken Pilot 2026: durable consumer bookings with serialized capacity checks.

create table if not exists public.parken_bookings (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  name text not null,
  email text not null,
  phone text not null,
  street text not null,
  house_number text not null,
  postcode text not null,
  slot_date date not null,
  slot_time text not null,
  notes text not null default '',
  status text not null default 'confirmation_pending'
    check (status in ('confirmation_pending','confirmed','completed','cancelled','declined')),
  source text not null default 'de-parken-directmail-2026',
  terms_accepted_at timestamptz not null,
  early_start_requested_at timestamptz,
  thermography_interest_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists parken_bookings_active_address_idx
on public.parken_bookings (postcode, lower(street), lower(house_number))
where status not in ('cancelled','declined');

create unique index if not exists parken_bookings_active_slot_idx
on public.parken_bookings (slot_date, slot_time)
where status not in ('cancelled','declined');

create index if not exists parken_bookings_status_created_idx
on public.parken_bookings (status, created_at desc);

alter table public.parken_bookings enable row level security;

drop policy if exists "internal users manage parken bookings" on public.parken_bookings;
create policy "internal users manage parken bookings"
on public.parken_bookings for all to authenticated
using (public.is_internal_user())
with check (public.is_internal_user());

create or replace function public.create_parken_booking(
  p_name text,
  p_email text,
  p_phone text,
  p_street text,
  p_house_number text,
  p_postcode text,
  p_slot_date date,
  p_slot_time text,
  p_notes text default '',
  p_source text default 'de-parken-directmail-2026',
  p_terms_accepted boolean default false,
  p_early_start_requested boolean default false,
  p_thermography_interest boolean default false
)
returns table(reference text, slot_date date, slot_time text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_postcode text := upper(regexp_replace(coalesce(p_postcode, ''), '\s', '', 'g'));
  v_reference text := 'RS-PARKEN-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  v_weekday int := extract(isodow from p_slot_date);
begin
  perform pg_advisory_xact_lock(hashtext('roofsignal-de-parken-pilot-2026'));

  if not p_terms_accepted then
    raise exception 'TERMS_REQUIRED';
  end if;
  if nullif(trim(p_name), '') is null or nullif(trim(p_email), '') is null
     or position('@' in p_email) < 2 or nullif(trim(p_phone), '') is null
     or nullif(trim(p_street), '') is null or nullif(trim(p_house_number), '') is null then
    raise exception 'MISSING_REQUIRED_FIELDS';
  end if;
  if not (v_postcode = any(array[
    '7311AA','7311AB','7311AC','7311AD','7311AE','7311AG','7311AJ','7311AL','7311LV',
    '7315BR','7315BS','7315BT','7315BV','7315EB','7316AA','7316AB','7316AC','7316AD',
    '7316AE','7316AG','7316AH','7316AK','7316AL','7316AM','7316AN','7316AP','7316AR',
    '7316AS','7316AT','7316AV','7316AW','7316BA','7316BB','7316BC','7316BD','7316BE',
    '7316BG','7316BH','7316BJ','7316BK','7316BL','7316BM','7316BN','7316BP','7316BR',
    '7316BS','7316BT','7316BV','7316BW','7316BX','7316BZ','7316CA','7316CD','7316CE',
    '7316CG','7316CH','7316CJ','7316CK','7316CL','7316CM','7316CN','7316CP','7316CR',
    '7316CS','7316CT','7316CV','7316CW','7316CX','7316CZ','7316DA','7316DB','7316DC',
    '7316DD','7316DE','7316DG','7316DH','7316DJ','7316DK','7316DL','7316DM','7316DN',
    '7316DP','7316DR','7316DS','7316DT','7316DV','7316DW','7316DX','7316DZ','7316EA',
    '7316EB','7316EC','7316ED','7316EE','7316EG','7316EH','7316EJ','7316EK','7316EL',
    '7316EM','7316EN','7316EP','7316ER','7316ES','7316ET','7317AC','7317AD','7317AE',
    '7317AH','7317AJ','7317AP','7317AR','7317CA','7317CB','7317CC','7317CE'
  ])) then
    raise exception 'ADDRESS_OUTSIDE_PILOT';
  end if;
  if p_slot_date < date '2026-09-01' or p_slot_date > date '2026-09-30' then
    raise exception 'INVALID_PILOT_DATE';
  end if;
  if (v_weekday between 1 and 4 and p_slot_time <> '16:30-18:30')
     or (v_weekday in (5,6) and p_slot_time not in ('09:00-10:30','10:45-12:15','13:00-14:30','14:45-16:15'))
     or v_weekday = 7 then
    raise exception 'INVALID_PILOT_SLOT';
  end if;
  if (select count(*) from public.parken_bookings where status not in ('cancelled','declined')) >= 25 then
    raise exception 'PILOT_FULL';
  end if;
  if exists(select 1 from public.parken_bookings where slot_date=p_slot_date and slot_time=p_slot_time and status not in ('cancelled','declined')) then
    raise exception 'SLOT_TAKEN';
  end if;

  insert into public.parken_bookings (
    reference,name,email,phone,street,house_number,postcode,slot_date,slot_time,notes,
    source,terms_accepted_at,early_start_requested_at,thermography_interest_at
  ) values (
    v_reference,trim(p_name),lower(trim(p_email)),trim(p_phone),trim(p_street),trim(p_house_number),
    v_postcode,p_slot_date,p_slot_time,left(coalesce(p_notes,''),1500),left(coalesce(p_source,'de-parken-directmail-2026'),80),
    now(),case when p_early_start_requested then now() end,case when p_thermography_interest then now() end
  );

  return query select v_reference, p_slot_date, p_slot_time;
exception
  when unique_violation then
    raise exception 'ADDRESS_OR_SLOT_ALREADY_BOOKED';
end;
$$;

revoke all on function public.create_parken_booking(text,text,text,text,text,text,date,text,text,text,boolean,boolean,boolean) from public;
grant execute on function public.create_parken_booking(text,text,text,text,text,text,date,text,text,text,boolean,boolean,boolean) to anon, authenticated;

