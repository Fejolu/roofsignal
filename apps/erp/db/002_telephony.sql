-- Additive local ERP extension; deliberately outside production migrations.
begin;

-- Preserve the existing command implementation and its data without rebuilding it.
do $$ begin
  if to_regprocedure('erp.core_command(text,jsonb)') is null then
    alter function public.roofsignal_erp(text,jsonb) set schema erp;
    alter function erp.roofsignal_erp(text,jsonb) rename to core_command;
  end if;
end $$;
revoke all on function erp.core_command(text,jsonb) from public,anon,authenticated;

-- Caller identification is a staff convenience, never an identity or access grant.
-- Invalid historical contact values are skipped rather than breaking every lookup.
create or replace function erp.normalized_phone(raw text) returns text language plpgsql immutable set search_path=pg_catalog as $$
declare value text:=regexp_replace(coalesce(raw,''),'^[[:space:]]+|[[:space:]]+$','','g');
begin
  if value='' or length(value)>80 or value !~ '^[+0-9() .[:space:]-]+$' then return null; end if;
  -- Accept the explicitly written optional Dutch trunk prefix, not arbitrary zeros.
  value:=regexp_replace(value,'^(\+31|0031)[ .[:space:]-]*\(0\)','\1');
  value:=regexp_replace(value,'[() .[:space:]-]','','g');
  if value ~ '^00[1-9][0-9]+$' then value:='+'||substr(value,3); end if;
  if value ~ '^0[1-9][0-9]{8}$' then value:='+31'||substr(value,2); end if;
  if value !~ '^\+[1-9][0-9]{6,14}$' then return null; end if;
  if value like '+31%' and value !~ '^\+31[1-9][0-9]{8}$' then return null; end if;
  return value;
end;
$$;
revoke all on function erp.normalized_phone(text) from public,anon,authenticated;

create or replace function public.roofsignal_erp(action text, payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare caller_phone text; caller_input text; caller_customers jsonb;
begin
  if action is distinct from 'phone.lookup' then return erp.core_command(action,payload); end if;
  if auth.uid() is null then raise exception 'Inloggen vereist' using errcode='42501'; end if;
  if not erp.is_staff() then raise exception 'Geen toegang' using errcode='42501'; end if;
  if jsonb_typeof(payload) is distinct from 'object' then raise exception 'Ongeldige invoer'; end if;
  if payload ? 'phone' and jsonb_typeof(payload->'phone') not in ('string','null') then
    raise exception 'Ongeldig telefoonnummer';
  end if;
  caller_input:=regexp_replace(coalesce(payload->>'phone',''),'^[[:space:]]+|[[:space:]]+$','','g');
  caller_phone:=erp.normalized_phone(caller_input);
  if caller_phone is null then
    if lower(caller_input) not in ('','anonymous','withheld','private','restricted','unknown','anoniem','afgeschermd','onbekend') then
      raise exception 'Ongeldig telefoonnummer';
    end if;
    return jsonb_build_object('phone',null,'match','withheld','customers','[]'::jsonb);
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'name',o.name,'kind',o.kind,
    'contact_name',o.contact_name,'email',o.email,'phone',o.phone) order by o.name,o.id),'[]')
    into caller_customers from erp.organizations o where erp.normalized_phone(o.phone)=caller_phone;
  return jsonb_build_object('phone',caller_phone,'match',case jsonb_array_length(caller_customers)
    when 0 then 'none' when 1 then 'single' else 'multiple' end,'customers',caller_customers);
end;
$$;
revoke all on function public.roofsignal_erp(text,jsonb) from public,anon;
grant execute on function public.roofsignal_erp(text,jsonb) to authenticated;
commit;
