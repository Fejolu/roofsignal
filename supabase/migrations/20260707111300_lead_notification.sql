-- Migration: extend lead_request_type enum for de-parken and access forms
--
-- The de-parken and access forms previously fell back to "contact" type.
-- This migration adds explicit enum values so lead types are tracked accurately.

do $$
begin
  -- Check if 'parken' value already exists
  if not exists (
    select 1 from pg_enum
    where enumtypid = 'public.lead_request_type'::regtype
      and enumlabel = 'parken'
  ) then
    alter type public.lead_request_type add value 'parken';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_enum
    where enumtypid = 'public.lead_request_type'::regtype
      and enumlabel = 'access'
  ) then
    alter type public.lead_request_type add value 'access';
  end if;
end $$;

-- Retcon existing de-parken leads to the correct type
update public.lead_requests
set request_type = 'parken'
where request_type = 'contact'
  and source_path = '/de-parken/';
