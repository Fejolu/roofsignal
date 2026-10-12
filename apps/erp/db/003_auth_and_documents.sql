-- Real-auth boundary, applied only to the isolated ERP environment.
-- The trusted adapter verifies caller_uuid with Supabase Auth before calling
-- either service-only function below. The browser never receives a service key.
begin;

-- Persistent session revocation across server instances. Credentials and tokens
-- stay outside the database; only the random cookie capability's hash is stored.
create table if not exists erp.sessions (
  session_hash text primary key check (session_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid not null references auth.users(id),
  purpose text not null check (purpose in ('login','recovery')),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
alter table erp.sessions enable row level security;
revoke all on table erp.sessions from public,anon,authenticated,service_role;

create or replace function public.roofsignal_erp_session(caller_uuid uuid,action text,payload jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
<<session_cmd>>
declare session_hash text; purpose text; expiry timestamptz; item erp.sessions; valid_user boolean; consumed boolean;
begin
  if jsonb_typeof(payload) is distinct from 'object' then raise exception 'Ongeldige invoer'; end if;
  session_hash:=payload->>'session_hash';
  if session_hash is null or session_hash !~ '^[0-9a-f]{64}$' then raise exception 'Ongeldige sessie'; end if;
  if action is null or action not in ('register','check','revoke','consume') then raise exception 'Onbekende sessieactie'; end if;
  valid_user:=exists(select 1 from auth.users u where u.id=caller_uuid and u.email_confirmed_at is not null
    and to_jsonb(u)->>'deleted_at' is null and not coalesce((to_jsonb(u)->>'is_anonymous')::boolean,false));
  if action='consume' then
    update erp.sessions s set revoked_at=now() where s.session_hash=session_cmd.session_hash and s.user_id=caller_uuid
      and s.purpose='recovery' and s.revoked_at is null and s.expires_at>now() and valid_user returning true into consumed;
    return jsonb_build_object('consumed',coalesce(consumed,false),'valid',false,'purpose',null,'expires_at',null);
  end if;
  if action='register' then
    if not valid_user then raise exception 'Geverifieerd account vereist' using errcode='42501'; end if;
    purpose:=payload->>'purpose'; expiry:=(payload->>'expires_at')::timestamptz;
    if purpose is null or purpose not in ('login','recovery') or expiry is null or not isfinite(expiry)
      or expiry<=now() or expiry>now()+(case purpose when 'recovery' then interval '10 minutes' else interval '8 hours' end)
      then raise exception 'Ongeldige sessieduur'; end if;
    insert into erp.sessions(session_hash,user_id,purpose,expires_at)
      values(session_hash,caller_uuid,purpose,expiry) on conflict do nothing;
    select * into item from erp.sessions s where s.session_hash=session_cmd.session_hash for update;
    if item.user_id<>caller_uuid or item.purpose<>purpose or item.expires_at<>expiry then
      raise exception 'Sessie-identiteit is al gebruikt';
    end if;
  elsif action='revoke' then
    update erp.sessions s set revoked_at=coalesce(s.revoked_at,now())
      where s.session_hash=session_cmd.session_hash and s.user_id=caller_uuid;
  end if;
  select * into item from erp.sessions s where s.session_hash=session_cmd.session_hash and s.user_id=caller_uuid;
  if item.session_hash is null or item.revoked_at is not null or item.expires_at<=now() or not valid_user then
    return jsonb_build_object('valid',false,'purpose',null,'expires_at',null);
  end if;
  return jsonb_build_object('valid',true,'purpose',item.purpose,'expires_at',item.expires_at);
end;
$$;
revoke all on function public.roofsignal_erp_session(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.roofsignal_erp_session(uuid,text,jsonb) to service_role;

-- Keep the telephony router private, including when additive migrations replay.
do $$ begin
  if to_regprocedure('erp.telephony_command(text,jsonb)') is null then
    alter function public.roofsignal_erp(text,jsonb) set schema erp;
    alter function erp.roofsignal_erp(text,jsonb) rename to telephony_command;
  end if;
end $$;
revoke all on function erp.telephony_command(text,jsonb) from public,anon,authenticated,service_role;

create or replace function erp.is_administrator() returns boolean
language sql stable set search_path=pg_catalog as $$
  select exists(select 1 from erp.staff where user_id=auth.uid() and active and role='administrator');
$$;
revoke all on function erp.is_administrator() from public,anon,authenticated,service_role;

create or replace function erp.access_snapshot() returns jsonb
language sql stable set search_path=pg_catalog as $$
  select jsonb_build_object(
    -- Only people who have already entered this ERP, never an Auth-wide listing.
    'people',coalesce((select jsonb_agg(jsonb_build_object('user_id',p.user_id,'name',p.name,'email',u.email) order by p.name,p.user_id)
      from erp.people p join auth.users u on u.id=p.user_id where u.email_confirmed_at is not null and to_jsonb(u)->>'deleted_at' is null
        and not coalesce((to_jsonb(u)->>'is_anonymous')::boolean,false)),'[]'::jsonb),
    'organizations',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'name',o.name) order by o.name) from erp.organizations o),'[]'::jsonb),
    'properties',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'organization_id',op.organization_id) order by p.name)
      from erp.properties p join erp.organization_properties op on op.property_id=p.id),'[]'::jsonb),
    'grants',coalesce((select jsonb_agg(to_jsonb(g) order by g.id) from erp.access_grants g),'[]'::jsonb),
    'staff',coalesce((select jsonb_agg(to_jsonb(s) order by s.user_id) from erp.staff s),'[]'::jsonb)
  );
$$;
revoke all on function erp.access_snapshot() from public,anon,authenticated,service_role;

create or replace function public.roofsignal_erp(action text,payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
<<cmd>>
declare
  actor uuid:=auth.uid(); staff_role text; answer jsonb; receipt jsonb; original jsonb;
  request_id uuid; target_user uuid; org uuid; prop uuid; grant_role text; expiry timestamptz; entity uuid;
begin
  if actor is null then raise exception 'Inloggen vereist' using errcode='42501'; end if;
  if not exists(select 1 from auth.users u where u.id=actor and u.email_confirmed_at is not null and to_jsonb(u)->>'deleted_at' is null
    and not coalesce((to_jsonb(u)->>'is_anonymous')::boolean,false))
    then raise exception 'Geverifieerd account vereist' using errcode='42501'; end if;
  if jsonb_typeof(payload) is distinct from 'object' then raise exception 'Ongeldige invoer'; end if;
  select role into staff_role from erp.staff where user_id=actor and active;
  if action='report.attach' then
    raise exception 'Gebruik de beveiligde PDF-upload' using errcode='42501';
  end if;
  if action='snapshot' then
    return erp.telephony_command(action,payload)||jsonb_build_object('staff_role',staff_role,
      'permissions',jsonb_build_object('manage_access',coalesce(staff_role='administrator',false)));
  end if;
  if action not in ('access.snapshot','access.grant','access.revoke') then
    return erp.telephony_command(action,payload);
  end if;
  if staff_role is distinct from 'administrator' then raise exception 'Geen toegang' using errcode='42501'; end if;
  if action='access.snapshot' then return erp.access_snapshot(); end if;

  request_id:=(payload->>'request_id')::uuid;
  if request_id is null then raise exception 'Verzoeknummer ontbreekt'; end if;
  insert into erp.command_receipts(actor_id,request_id,command)
    values(actor,request_id,jsonb_build_object('action',action,'payload',payload)) on conflict do nothing;
  select c.result,c.command into receipt,original from erp.command_receipts c
    where c.actor_id=actor and c.request_id=cmd.request_id for update;
  if original<>jsonb_build_object('action',action,'payload',payload) then raise exception 'Verzoeknummer al gebruikt voor andere invoer'; end if;
  if receipt is not null then return receipt; end if;

  if action='access.grant' then
    target_user:=(payload->>'user_id')::uuid; org:=(payload->>'organization_id')::uuid;
    prop:=nullif(payload->>'property_id','')::uuid; grant_role:=payload->>'role';
    expiry:=nullif(payload->>'expires_at','')::timestamptz;
    if not exists(select 1 from auth.users u where u.id=target_user and u.email_confirmed_at is not null and to_jsonb(u)->>'deleted_at' is null
      and not coalesce((to_jsonb(u)->>'is_anonymous')::boolean,false))
      then raise exception 'Kies een bestaand, geverifieerd account'; end if;
    if grant_role is null or grant_role not in ('reader','contact','finance') then raise exception 'Ongeldige dossierrol'; end if;
    if not exists(select 1 from erp.organizations where id=org) then raise exception 'Organisatie niet beschikbaar'; end if;
    if prop is not null and not exists(select 1 from erp.organization_properties where organization_id=org and property_id=prop)
      then raise exception 'Object hoort niet bij deze organisatie'; end if;
    if expiry is not null and (not isfinite(expiry) or expiry<=now()) then raise exception 'Einddatum moet in de toekomst liggen'; end if;
    insert into erp.access_grants(user_id,organization_id,property_id,role,expires_at)
      values(target_user,org,prop,grant_role,expiry) returning id into entity;
  else
    update erp.access_grants set revoked_at=coalesce(revoked_at,now()) where id=(payload->>'id')::uuid returning id into entity;
    if entity is null then raise exception 'Toegang niet beschikbaar'; end if;
  end if;
  answer:=jsonb_build_object('id',entity);
  insert into erp.audit_events(actor_id,action,entity_id) values(actor,action,entity);
  update erp.command_receipts c set result=answer where c.actor_id=actor and c.request_id=cmd.request_id;
  return answer;
end;
$$;
revoke all on function public.roofsignal_erp(text,jsonb) from public,anon;
grant execute on function public.roofsignal_erp(text,jsonb) to authenticated;

-- Bootstrap only a self profile for a previously verified Auth identity.
-- No staff membership, organization or dossier grant is created here.
create or replace function public.roofsignal_erp_profile(caller_uuid uuid,payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare display_name text; phone text;
begin
  if not exists(select 1 from auth.users u where u.id=caller_uuid and u.email_confirmed_at is not null and to_jsonb(u)->>'deleted_at' is null
    and not coalesce((to_jsonb(u)->>'is_anonymous')::boolean,false))
    then raise exception 'Geverifieerd account vereist' using errcode='42501'; end if;
  if jsonb_typeof(payload) is distinct from 'object' then raise exception 'Ongeldige invoer'; end if;
  display_name:=trim(coalesce(payload->>'name','Gebruiker'));
  phone:=trim(coalesce(payload->>'phone',''));
  if length(display_name) not between 1 and 150 or length(phone)>40 then raise exception 'Ongeldige profielgegevens'; end if;
  insert into erp.people(user_id,name,phone) values(caller_uuid,display_name,phone) on conflict(user_id) do nothing;
  return jsonb_build_object('id',caller_uuid);
end;
$$;
revoke all on function public.roofsignal_erp_profile(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.roofsignal_erp_profile(uuid,jsonb) to service_role;

-- A trusted adapter has checked the PDF bytes and written the deterministic
-- private object first. Save metadata under that verified caller's authority.
create or replace function public.roofsignal_erp_document(caller_uuid uuid,payload jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
<<doc>>
declare
  request_id uuid; report_id uuid; file_name text; file_size integer; file_hash text;
  key_hash text; file_key text; answer jsonb; receipt jsonb; original jsonb; r erp.reports;
begin
  if not exists(select 1 from erp.staff s join auth.users u on u.id=s.user_id
    where s.user_id=caller_uuid and s.active and u.email_confirmed_at is not null and to_jsonb(u)->>'deleted_at' is null
      and not coalesce((to_jsonb(u)->>'is_anonymous')::boolean,false))
    then raise exception 'Geen toegang' using errcode='42501'; end if;
  if jsonb_typeof(payload) is distinct from 'object' then raise exception 'Ongeldige invoer'; end if;
  if payload ? 'file_key' then raise exception 'Bestandsverwijzing wordt door de server bepaald'; end if;
  request_id:=(payload->>'request_id')::uuid; report_id:=(payload->>'report_id')::uuid;
  if request_id is null or report_id is null then raise exception 'Rapport en verzoeknummer vereist'; end if;
  file_name:=payload->>'file_name'; file_size:=(payload->>'file_size')::integer; file_hash:=payload->>'file_sha256';
  if file_name is null or length(file_name) not between 1 and 200 or file_name ~ '[[:cntrl:]]'
    or position('/' in file_name)>0 or position(chr(92) in file_name)>0
    or file_size is null or file_size not between 1 and 10485760
    or file_hash is null or file_hash !~ '^[0-9a-f]{64}$'
    then raise exception 'Ongeldige PDF-bestandsgegevens'; end if;
  key_hash:=substr(encode(sha256(convert_to(caller_uuid::text||':'||request_id::text,'UTF8')),'hex'),1,32);
  file_key:=substr(key_hash,1,8)||'-'||substr(key_hash,9,4)||'-'||substr(key_hash,13,4)||'-'||substr(key_hash,17,4)||'-'||substr(key_hash,21)||'.pdf';
  insert into erp.command_receipts(actor_id,request_id,command)
    values(caller_uuid,request_id,jsonb_build_object('action','document.attach','payload',payload)) on conflict do nothing;
  select c.result,c.command into receipt,original from erp.command_receipts c
    where c.actor_id=caller_uuid and c.request_id=doc.request_id for update;
  if original<>jsonb_build_object('action','document.attach','payload',payload) then raise exception 'Verzoeknummer al gebruikt voor andere invoer'; end if;
  if receipt is not null then return receipt; end if;
  select * into r from erp.reports where id=report_id for update;
  if r.id is null or r.published_at is not null then raise exception 'Rapport ontbreekt of is al vrijgegeven'; end if;
  update erp.reports set file_key=doc.file_key,file_name=doc.file_name,file_sha256=file_hash,file_size=doc.file_size where id=report_id;
  answer:=jsonb_build_object('id',report_id,'key',file_key);
  insert into erp.audit_events(actor_id,action,entity_id) values(caller_uuid,'document.attach',report_id);
  update erp.command_receipts c set result=answer where c.actor_id=caller_uuid and c.request_id=doc.request_id;
  return answer;
end;
$$;
revoke all on function public.roofsignal_erp_document(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.roofsignal_erp_document(uuid,jsonb) to service_role;

commit;
