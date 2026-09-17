-- De Parken capacity follows available appointment slots, not a campaign quota.
-- Preserve existing bookings, postcode/consent validation and double-booking protection.
do $$
declare
  definition text;
  revised text;
  quota_block constant text := $quota$  if (select count(*) from public.parken_bookings where status not in ('cancelled','declined')) >= 25 then
    raise exception 'PILOT_FULL';
  end if;
$quota$;
begin
  select pg_get_functiondef('public.create_parken_booking(text,text,text,text,text,text,date,text,text,text,boolean,boolean,boolean)'::regprocedure)
    into definition;
  if position(quota_block in definition) = 0 then
    raise exception 'Expected Parken quota block not found; review booking function before release';
  end if;
  revised := replace(definition, quota_block, '');
  if position('PILOT_FULL' in revised) > 0
     or position('pg_advisory_xact_lock' in revised) = 0
     or position('SLOT_TAKEN' in revised) = 0
     or position('TERMS_REQUIRED' in revised) = 0
     or position('ADDRESS_OUTSIDE_PILOT' in revised) = 0 then
    raise exception 'Unexpected change to Parken booking safeguards';
  end if;
  if to_regclass('public.parken_bookings_active_slot_idx') is null
     or to_regclass('public.parken_bookings_active_address_idx') is null
     or not exists (
       select 1 from pg_trigger
       where tgrelid = 'public.parken_bookings'::regclass
         and tgname = 'parken_reject_expired_slot' and tgenabled <> 'D'
     ) then
    raise exception 'Parken slot, address or expiry safeguards missing';
  end if;
  execute revised;
  select pg_get_functiondef('public.create_parken_booking(text,text,text,text,text,text,date,text,text,text,boolean,boolean,boolean)'::regprocedure)
    into revised;
  if position('PILOT_FULL' in revised) > 0 then
    raise exception 'Parken campaign quota is still present';
  end if;
end;
$$;
