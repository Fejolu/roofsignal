-- Mirror accepted website records. No invoicing, payment or agenda side effects.
begin;
alter table erp.organizations add column if not exists is_fixture boolean not null default false;
create table if not exists erp.fixture_identities(user_id uuid primary key references auth.users(id));
create table if not exists erp.website_parties(identity_key text primary key,organization_id uuid references erp.organizations(id));
create table if not exists erp.website_objects(identity_key text primary key,property_id uuid references erp.properties(id));
create table if not exists erp.website_intakes(
 id uuid primary key default gen_random_uuid(),source text not null check(source in('consumer','parken','vve')),source_id uuid not null,
 revision integer not null default 0 check(revision>=0),changed_at timestamptz,record jsonb not null default '{}',
 reference text,source_status text,state text not null default 'new',payment_id text,payment_status text,total_cents integer,
 identity_snapshot jsonb,identity_review boolean not null default false,commercial jsonb,financial_review boolean not null default false,
 organization_id uuid references erp.organizations(id),property_id uuid references erp.properties(id),order_id uuid references erp.orders(id),managed_order_status text,
 created_at timestamptz not null default now(),imported_at timestamptz not null default now(),unique(source,source_id)
);
alter table erp.website_intakes add column if not exists identity_snapshot jsonb;
alter table erp.website_intakes add column if not exists identity_review boolean not null default false;
create unique index if not exists website_intake_mollie_id on erp.website_intakes(payment_id) where source='consumer' and payment_id is not null;
create table if not exists erp.website_intake_revisions(
 intake_id uuid not null references erp.website_intakes(id),revision integer not null,changed_at timestamptz not null,record jsonb not null,
 imported_at timestamptz not null default now(),primary key(intake_id,revision)
);
create table if not exists erp.external_appointments(
 id uuid primary key default gen_random_uuid(),intake_id uuid not null unique references erp.website_intakes(id),
 order_id uuid not null references erp.orders(id),starts_at timestamptz not null,ends_at timestamptz not null check(ends_at>starts_at),
 timezone text not null default 'Europe/Amsterdam' check(timezone='Europe/Amsterdam'),state text not null,
 external_reference text,source_revision integer not null
);
-- The only mutable source fields are the latest mirror. Every prior source revision remains intact.
create or replace function erp.intake_keys(value jsonb,allowed text[]) returns boolean language sql immutable set search_path=pg_catalog as $$
 select jsonb_typeof(value)='object' and not exists(select 1 from jsonb_object_keys(value) k where k<>all(allowed));
$$;
create or replace function erp.intake_org_visible(org uuid) returns boolean language sql stable set search_path=pg_catalog as $$
 select exists(select 1 from erp.organizations where id=org and not is_fixture);
$$;
create or replace function erp.can_access(org uuid,prop uuid,write_access boolean default false) returns boolean language sql stable set search_path=pg_catalog as $$
 select erp.intake_org_visible(org) and (erp.is_staff() or exists(select 1 from erp.access_grants g
 join erp.organization_properties p on p.organization_id=g.organization_id where g.user_id=auth.uid() and g.organization_id=org and p.property_id=prop
 and (g.property_id is null or g.property_id=prop) and g.revoked_at is null and (g.expires_at is null or g.expires_at>now())
 and g.role in('reader','contact') and (not write_access or g.role='contact')));
$$;
create or replace function erp.can_read_report(report_id uuid) returns boolean language sql stable set search_path=pg_catalog as $$
 select exists(select 1 from erp.reports r join erp.inspections i on i.id=r.inspection_id join erp.orders o on o.id=i.order_id
 where r.id=report_id and erp.intake_org_visible(o.organization_id) and (erp.is_staff() or(r.status='published' and erp.can_access(o.organization_id,o.property_id))));
$$;

create or replace function public.roofsignal_erp_intake(payload jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
<<importer>>
declare src text; sid uuid; rev integer; changed timestamptz; r jsonb; q jsonb; a jsonb; c jsonb; commercial jsonb;
 item erp.website_intakes; state text; order_state text; service text; price integer; pay_id text; pay_status text;
 name text; email text; phone text; street text; house text; postcode text; city text; address text; identity text;
 org uuid; prop uuid; ord uuid; inspected uuid; start_time timestamptz; end_time timestamptz; appointment_state text; appointment_ref text;
 actual_state text; key text; amount_key text; source_terms jsonb; source_identity jsonb; identity_changed boolean:=false; split_unknown boolean:=false;
begin
 if not erp.intake_keys(payload,array['source','source_id','revision','changed_at','record']) or octet_length(payload::text)>65536 then raise exception 'Ongeldige website-inname'; end if;
 src:=payload->>'source';sid:=(payload->>'source_id')::uuid;
 if src is null or src not in('consumer','parken','vve') or sid is null or coalesce(payload->>'revision','')!~'^[1-9][0-9]{0,9}$' then raise exception 'Ongeldige bronidentiteit'; end if;
 rev:=(payload->>'revision')::integer;changed:=(payload->>'changed_at')::timestamptz;r:=payload->'record';
 if changed is null or not isfinite(changed) or jsonb_typeof(r) is distinct from 'object' or (r->>'id')::uuid is distinct from sid then raise exception 'Ongeldige bronregistratie'; end if;
 if src='consumer' then
  if not erp.intake_keys(r,array['id','mode','reference','status','close_code','payment_id','payment_status','calendar_event_id','customer','terms','terms_accepted_at','slot_start','slot_end','created_at','updated_at','quote'])
   or r->>'mode' is distinct from 'live' or not erp.intake_keys(r->'customer',array['name','email','phone','notes'])
   or not erp.intake_keys(r->'terms',array['version','accepted','earlyStartRequested']) then raise exception 'Ongeldige consumentenregistratie'; end if;
  q:=r->'quote';a:=q->'address';c:=r->'customer';
  if not erp.intake_keys(q,array['id','address','destination','inspection_type','thermal','pricing_version','base_cents','thermal_cents','travel_cents','total_cents','distance_meters','travel_description','terms_version','policy_version','campaign','created_at'])
   or not erp.intake_keys(a,array['postcode','houseNumber','street','city','country']) or jsonb_typeof(q->'thermal') is distinct from 'boolean'
   or q->>'inspection_type' not in('building_envelope','thermal') or q->>'inspection_type' is null
   or coalesce(r->'terms'->>'accepted','')<>'true' or nullif(r->>'terms_accepted_at','') is null then raise exception 'Ongeldige consumentenafspraak'; end if;
  for amount_key in select unnest(array['travel_cents','total_cents','distance_meters']) loop
   if coalesce(q->>amount_key,'')!~'^[0-9]{1,9}$' then raise exception 'Ongeldige prijsafspraak'; end if;
  end loop;
  price:=(q->>'total_cents')::integer;
  split_unknown:=coalesce(jsonb_typeof(q->'base_cents'),'null')='null' and coalesce(jsonb_typeof(q->'thermal_cents'),'null')='null';
  if split_unknown then
   if price<(q->>'travel_cents')::integer then raise exception 'Ongeldige prijsafspraak'; end if;
  elsif coalesce(q->>'base_cents','')!~'^[0-9]{1,9}$' or coalesce(q->>'thermal_cents','')!~'^[0-9]{1,9}$' or price<>(q->>'base_cents')::integer+(q->>'thermal_cents')::integer+(q->>'travel_cents')::integer then raise exception 'Ongeldige prijsafspraak'; end if;
  if r->>'status' not in('preparing','payment_pending','creation_review','paid_review_required','confirmed','failed','canceled','expired','not_created') or r->>'status' is null then raise exception 'Ongeldige boekingsstatus'; end if;
  name:=c->>'name';email:=c->>'email';phone:=coalesce(c->>'phone','');street:=a->>'street';house:=a->>'houseNumber';postcode:=a->>'postcode';city:=a->>'city';
  pay_id:=nullif(r->>'payment_id','');pay_status:=nullif(r->>'payment_status','');
  if pay_id is not null and pay_id!~'^tr_[A-Za-z0-9]+$' or pay_status is not null and pay_status not in('open','pending','authorized','paid','failed','canceled','expired') then raise exception 'Ongeldige betaalreferentie'; end if;
  if r->>'status' in('confirmed','paid_review_required') and (pay_status is distinct from 'paid' or pay_id is null) then raise exception 'Betaalbewijs ontbreekt'; end if;
  state:=case when r->>'status'='confirmed' then 'paid_confirmed' when pay_status='paid' then 'paid_review' when r->>'status'='canceled' then 'payment_cancelled'
   when r->>'status'='failed' then 'payment_failed' when r->>'status'='expired' then 'payment_expired' when r->>'status'='creation_review' then 'creation_review' when r->>'status'='not_created' then 'payment_not_created' else 'awaiting_payment' end;
  order_state:=case when state='paid_confirmed' then 'active' when state in('payment_cancelled','payment_failed','payment_expired','payment_not_created') then 'cancelled' else 'draft' end;
  service:=case when q->>'inspection_type'='thermal' then 'thermal' when(q->>'thermal')::boolean then 'inspection_thermal' else 'inspection' end;
  start_time:=(r->>'slot_start')::timestamptz;end_time:=(r->>'slot_end')::timestamptz;
  appointment_ref:=r->>'calendar_event_id';appointment_state:=case when state='paid_confirmed' then 'confirmed' when state='paid_review' then 'review' when order_state='cancelled' then 'cancelled' else 'held' end;
  if state='paid_confirmed' and nullif(appointment_ref,'') is null then raise exception 'Afspraakbevestiging ontbreekt'; end if;
  commercial:=jsonb_build_object('quote_id',q->'id','inspection_type',q->'inspection_type','thermal',q->'thermal','pricing_version',q->'pricing_version','base_cents',q->'base_cents','thermal_cents',q->'thermal_cents','travel_cents',q->'travel_cents','total_cents',q->'total_cents','distance_meters',q->'distance_meters','travel_description',q->'travel_description','terms',r->'terms','terms_accepted_at',r->'terms_accepted_at','terms_version',q->'terms_version','policy_version',q->'policy_version');
 elsif src='parken' then
  if not erp.intake_keys(r,array['id','reference','name','email','phone','street','house_number','postcode','slot_date','slot_time','notes','status','source','terms_accepted_at','early_start_requested_at','thermography_interest_at','thermography_selected','offer_version','inspection_excl_cents','thermography_excl_cents','total_incl_cents','terms_version','created_at','updated_at','confirmation_sent_at','organization_id','property_id','appointment_id','inspection_id'])
   or r->>'status' not in('confirmation_pending','confirmed','completed','cancelled','declined') or r->>'status' is null then raise exception 'Ongeldige pilotregistratie'; end if;
  name:=r->>'name';email:=r->>'email';phone:=coalesce(r->>'phone','');street:=r->>'street';house:=r->>'house_number';postcode:=r->>'postcode';city:='Apeldoorn';
  service:=case when coalesce((r->>'thermography_selected')::boolean,false) then 'inspection_thermal' else 'inspection' end;
  if nullif(r->>'offer_version','') is not null then
   for amount_key in select unnest(array['inspection_excl_cents','thermography_excl_cents','total_incl_cents']) loop
    if coalesce(r->>amount_key,'')!~'^[0-9]{1,9}$' then raise exception 'Ongeldige pilotprijs'; end if;
   end loop;
   price:=(r->>'total_incl_cents')::integer;
   if price<>round(((r->>'inspection_excl_cents')::integer+(r->>'thermography_excl_cents')::integer)*1.21) then raise exception 'Ongeldige pilotprijs'; end if;
  end if;
  state:=case r->>'status' when 'confirmation_pending' then 'pilot_pending' when 'confirmed' then 'pilot_confirmed' when 'completed' then 'pilot_completed' when 'declined' then 'pilot_declined' else 'pilot_cancelled' end;
  order_state:=case state when 'pilot_confirmed' then 'active' when 'pilot_completed' then 'completed' when 'pilot_pending' then 'draft' else 'cancelled' end;
  if coalesce(r->>'slot_time','')!~'^[0-9]{2}:[0-9]{2}[–-][0-9]{2}:[0-9]{2}$' then raise exception 'Ongeldig pilotmoment'; end if;
  start_time:=((r->>'slot_date')||' '||left(r->>'slot_time',5))::timestamp at time zone 'Europe/Amsterdam';
  end_time:=((r->>'slot_date')||' '||right(r->>'slot_time',5))::timestamp at time zone 'Europe/Amsterdam';
  appointment_ref:=r->>'appointment_id';appointment_state:=case when order_state='active' or order_state='completed' then 'confirmed' when order_state='cancelled' then 'cancelled' else 'provisional' end;
  commercial:=jsonb_build_object('offer_version',r->'offer_version','thermography_selected',r->'thermography_selected','inspection_excl_cents',r->'inspection_excl_cents','thermography_excl_cents',r->'thermography_excl_cents','total_incl_cents',r->'total_incl_cents','terms_version',r->'terms_version','terms_accepted_at',r->'terms_accepted_at','early_start_requested_at',r->'early_start_requested_at');
 else
  if not erp.intake_keys(r,array['id','request_type','name','organization','email','segment','postcode','object_complexity','site_access','scope','message','status','source_path','created_at','intake_details'])
   or r->>'request_type' is distinct from 'price' or coalesce(r->>'segment','') not in('VvE','VvE-beheerder','VvE / VvE-beheerder')
   or r->>'source_path' not in('/inspectie-boeken','/inspectie-boeken/') or r->>'source_path' is null then raise exception 'Ongeldige VvE-aanvraag'; end if;
  if jsonb_typeof(r->'intake_details') is not null and jsonb_typeof(r->'intake_details')<>'null' then
   c:=r->'intake_details';q:=c->'price_indication';
   if not erp.intake_keys(c,array['schema_version','context','inspection_type','thermal','address_count','object_scope','object_address','object_city','phone','kvk_number','price_indication'])
    or c->>'schema_version' is distinct from '1' or c->>'context' is distinct from 'vve-object' or c->>'inspection_type' not in('building_envelope','thermal')
    or jsonb_typeof(c->'thermal') is distinct from 'boolean' or coalesce(c->>'address_count','')!~'^[1-9][0-9]{0,4}$'
    or(c->>'address_count')::integer>10000 or c->>'object_scope' not in('single','multiple','unknown')
    or not erp.intake_keys(q,array['kind','pricing_version','building_envelope_excl_cents','thermal_excl_cents','total_excl_cents','total_incl_cents','travel_included','accepted'])
    or q->>'kind' not in('indication','custom') or q->>'accepted' is distinct from 'false' or q->>'travel_included' is distinct from 'false'
    then raise exception 'Ongeldige vrijblijvende VvE-indicatie'; end if;
  end if;
  state:='inquiry';name:=r->>'name';email:=r->>'email';phone:='';
  if nullif(r->>'message','') is null then raise exception 'Aanvraaginhoud ontbreekt'; end if;
 end if;
 if length(trim(coalesce(name,''))) not between 1 and 160 or length(coalesce(email,''))>254 or coalesce(email,'')!~'^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' or length(phone)>40 then raise exception 'Ongeldige klantgegevens'; end if;
 if src<>'vve' then
  if length(trim(coalesce(street,''))) not between 1 and 180 or length(trim(coalesce(house,''))) not between 1 and 40 or length(trim(coalesce(city,''))) not between 1 and 150
   or upper(regexp_replace(coalesce(postcode,''),'[[:space:]]','','g'))!~'^[1-9][0-9]{3}[A-Z]{2}$'
   or start_time is null or end_time is null or not isfinite(start_time) or not isfinite(end_time) or end_time<=start_time then raise exception 'Ongeldige objectafspraak'; end if;
 end if;
 if src<>'vve' then source_identity:=jsonb_build_array(lower(trim(name)),lower(trim(email)),coalesce(erp.normalized_phone(phone),trim(phone)),lower(trim(street)||' '||trim(house)),upper(regexp_replace(postcode,'[[:space:]]','','g')),lower(trim(city)));end if;
 insert into erp.website_intakes(source,source_id) values(src,sid) on conflict(source,source_id) do nothing;
 select * into item from erp.website_intakes where source=src and source_id=sid for update;
 if rev<item.revision then return jsonb_build_object('accepted',true,'source',src,'source_id',sid,'id',item.id,'revision',rev,'current_revision',item.revision,'ignored',true); end if;
 if rev=item.revision then
  if item.record<>r or item.changed_at<>changed then raise exception 'Bronrevisie al gebruikt voor andere inhoud'; end if;
  return jsonb_build_object('accepted',true,'source',src,'source_id',sid,'id',item.id,'revision',rev,'current_revision',item.revision,'duplicate',true,'ignored',false);
 end if;
 if item.changed_at is not null and changed<item.changed_at then raise exception 'Bronrevisie loopt terug in tijd'; end if;
 if item.payment_id is not null and pay_id is distinct from item.payment_id then raise exception 'Betaalidentiteit mag niet wijzigen'; end if;
 if item.revision>0 and item.commercial is distinct from commercial then state:=state||'_review'; end if;
 identity_changed:=item.identity_review or(item.revision>0 and item.identity_snapshot is not null and item.identity_snapshot is distinct from source_identity);
 if identity_changed and appointment_state<>'cancelled' then appointment_state:='review';end if;
 org:=item.organization_id;prop:=item.property_id;ord:=item.order_id;
 if src<>'vve' and ord is null then
  address:=trim(street)||' '||trim(house);postcode:=upper(regexp_replace(postcode,'[[:space:]]','','g'));
  -- Contact details are not a portal identity. Include the exact object to avoid
  -- merging different owners represented by the same contact person.
  identity:=encode(sha256(convert_to(jsonb_build_array(lower(trim(name)),lower(trim(email)),coalesce(erp.normalized_phone(phone),trim(phone)),lower(address),postcode,lower(trim(city)))::text,'UTF8')),'hex');
  insert into erp.website_parties(identity_key) values(identity) on conflict do nothing;
  select organization_id into org from erp.website_parties where identity_key=identity for update;
  if org is null then
   insert into erp.organizations(name,kind,contact_name,email,phone) values(trim(name),'private',trim(name),lower(trim(email)),trim(phone)) returning id into org;
   update erp.website_parties set organization_id=org where identity_key=identity;
  elsif not erp.intake_org_visible(org) then raise exception 'Bronpartij verwijst naar proefdata'; end if;
  insert into erp.website_objects(identity_key) values(identity) on conflict do nothing;
  select property_id into prop from erp.website_objects where identity_key=identity for update;
  if prop is null then
   insert into erp.properties(name,address,postcode,city) values(address,address,postcode,trim(city)) returning id into prop;
   insert into erp.organization_properties(organization_id,property_id) values(org,prop);
   update erp.website_objects set property_id=prop where identity_key=identity;
  end if;
  insert into erp.orders(organization_id,property_id,title,service,scope,status) values(org,prop,case when src='parken' then 'Woningscan De Parken' else 'Website-inspectie' end,service,case service when 'thermal' then 'Thermografische inspectie' when 'inspection_thermal' then 'Dak- en gevelinspectie met thermografie' else 'Dak- en gevelinspectie' end,order_state) returning id into ord;
  insert into erp.inspections(order_id,label) values(ord,'Eerste inspectie') returning id into inspected;
 elsif ord is not null then
  select status into actual_state from erp.orders where id=ord for update;
  if actual_state=item.managed_order_status and actual_state not in('completed','cancelled') and not item.financial_review and not identity_changed and state not like '%_review' then update erp.orders set status=order_state where id=ord; else order_state:=actual_state; end if;
 end if;
 insert into erp.website_intake_revisions(intake_id,revision,changed_at,record) values(item.id,rev,changed,r);
 update erp.website_intakes set revision=rev,changed_at=changed,record=r,reference=coalesce(r->>'reference',case when src='vve' then 'RS-VVE-'||upper(substr(replace(sid::text,'-',''),1,8)) else sid::text end),source_status=r->>'status',state=importer.state,
  payment_id=coalesce(item.payment_id,pay_id),payment_status=pay_status,total_cents=case when item.revision=0 then price else item.total_cents end,
  identity_snapshot=case when item.revision=0 or item.identity_snapshot is null then source_identity else item.identity_snapshot end,identity_review=identity_changed,
  commercial=case when item.revision=0 then importer.commercial else item.commercial end,financial_review=item.financial_review or split_unknown or(item.revision>0 and item.commercial is distinct from importer.commercial),
  organization_id=org,property_id=prop,order_id=ord,managed_order_status=order_state,imported_at=now() where id=item.id;
 if ord is not null then
  insert into erp.external_appointments(intake_id,order_id,starts_at,ends_at,state,external_reference,source_revision) values(item.id,ord,start_time,end_time,appointment_state,appointment_ref,rev)
   on conflict(intake_id) do update set starts_at=excluded.starts_at,ends_at=excluded.ends_at,state=excluded.state,external_reference=excluded.external_reference,source_revision=excluded.source_revision;
 end if;
 return jsonb_build_object('accepted',true,'source',src,'source_id',sid,'id',item.id,'revision',rev,'current_revision',rev,'duplicate',false,'ignored',false);
end;
$$;
revoke all on function public.roofsignal_erp_intake(jsonb) from public,anon,authenticated;
grant execute on function public.roofsignal_erp_intake(jsonb) to service_role;

create or replace function erp.intake_filter_snapshot(answer jsonb) returns jsonb language plpgsql stable set search_path=pg_catalog as $$
declare key text; values jsonb; result jsonb:=answer;
begin
 for key in select unnest(array['organizations','properties','orders','inspections','visits','observations','reports','requests','grants','people','staff']) loop
  if jsonb_typeof(answer->key) is distinct from 'array' then continue; end if;
  select coalesce(jsonb_agg(e),'[]') into values from jsonb_array_elements(answer->key) e where case key
   when 'organizations' then erp.intake_org_visible((e->>'id')::uuid)
   when 'properties' then erp.intake_org_visible((e->>'organization_id')::uuid)
   when 'orders' then erp.intake_org_visible((e->>'organization_id')::uuid)
   when 'inspections' then erp.intake_org_visible((e->>'organization_id')::uuid)
   when 'requests' then erp.intake_org_visible((e->>'organization_id')::uuid)
   when 'grants' then erp.intake_org_visible((e->>'organization_id')::uuid)
   when 'people' then not exists(select 1 from erp.fixture_identities where user_id=(e->>'user_id')::uuid)
   when 'staff' then not exists(select 1 from erp.fixture_identities where user_id=(e->>'user_id')::uuid)
   when 'visits' then exists(select 1 from erp.visits v join erp.inspections i on i.id=v.inspection_id join erp.orders o on o.id=i.order_id where v.id=(e->>'id')::uuid and erp.intake_org_visible(o.organization_id))
   when 'observations' then exists(select 1 from erp.observations ob join erp.inspections i on i.id=ob.inspection_id join erp.orders o on o.id=i.order_id where ob.inspection_id=(e->>'inspection_id')::uuid and ob.finding_id=(e->>'finding_id')::uuid and erp.intake_org_visible(o.organization_id))
   when 'reports' then exists(select 1 from erp.reports r join erp.inspections i on i.id=r.inspection_id join erp.orders o on o.id=i.order_id where r.id=(e->>'id')::uuid and erp.intake_org_visible(o.organization_id)) else false end;
  result:=jsonb_set(result,array[key],values);
 end loop;
 return result;
end;
$$;
do $$ begin
 if to_regprocedure('erp.auth_command(text,jsonb)') is null then alter function public.roofsignal_erp(text,jsonb) set schema erp;alter function erp.roofsignal_erp(text,jsonb) rename to auth_command;
 elsif position('erp.auth_command(' in pg_get_functiondef('public.roofsignal_erp(text,jsonb)'::regprocedure))=0 then
  execute replace(pg_get_functiondef('public.roofsignal_erp(text,jsonb)'::regprocedure),'public.roofsignal_erp','erp.auth_command');
 end if;
end $$;
revoke all on function erp.auth_command(text,jsonb) from public,anon,authenticated,service_role;
create or replace function public.roofsignal_erp(action text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare answer jsonb;target uuid;visible_customers jsonb;commercial_data jsonb;
begin
 if exists(select 1 from erp.fixture_identities where user_id=auth.uid()) then raise exception 'Geen toegang' using errcode='42501'; end if;
 if action in('commercial.create','commercial.release','commercial.withdraw') and to_regprocedure('erp.commercial_action(text,jsonb)') is not null then
  execute 'select erp.commercial_action($1,$2)' into answer using action,payload;return answer;
 end if;
 if action='access.grant' then
  target:=(payload->>'user_id')::uuid;
  if exists(select 1 from erp.fixture_identities where user_id=target) or exists(select 1 from auth.users u where u.id=target and(to_jsonb(u)->>'banned_until')::timestamptz>now()) then raise exception 'Geen toegang' using errcode='42501'; end if;
 end if;
 if action='intake.snapshot' then
  -- The existing verified-identity boundary is evaluated before staff authority.
  perform erp.auth_command('snapshot','{}');
  if not erp.is_staff() then raise exception 'Geen toegang' using errcode='42501'; end if;
  return jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(t) order by t.changed_at desc,t.id) from (select * from erp.website_intakes order by changed_at desc,id limit 200) t),'[]'));
 end if;
 answer:=erp.auth_command(action,payload);
 if action='phone.lookup' and answer->>'match' is distinct from 'withheld' then
  select coalesce(jsonb_agg(c),'[]') into visible_customers from jsonb_array_elements(answer->'customers') c where erp.intake_org_visible((c->>'id')::uuid);
  answer:=answer||jsonb_build_object('customers',visible_customers,'match',case jsonb_array_length(visible_customers) when 0 then 'none' when 1 then 'single' else 'multiple' end);
 end if;
 if action in('snapshot','access.snapshot') then answer:=erp.intake_filter_snapshot(answer);end if;
 if action='snapshot' then
  answer:=answer||jsonb_build_object('appointments',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'order_id',a.order_id,'property_id',o.property_id,'organization_id',o.organization_id,'starts_at',a.starts_at,'ends_at',a.ends_at,'state',a.state,'source',t.source) order by a.starts_at)
   from erp.external_appointments a join erp.orders o on o.id=a.order_id join erp.website_intakes t on t.id=a.intake_id
   where erp.intake_org_visible(o.organization_id) and(erp.is_staff() or(o.status<>'draft' and erp.can_access(o.organization_id,o.property_id)))),'[]'),
   'order_sources',case when erp.is_staff() then coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'order_id',t.order_id,'source',t.source,'reference',t.reference,'state',t.state,'total_cents',t.total_cents,'payment_status',t.payment_status,'financial_review',t.financial_review,'identity_review',t.identity_review)) from erp.website_intakes t where t.order_id is not null and erp.intake_org_visible(t.organization_id)),'[]') else '[]'::jsonb end);
 end if;
 if action='snapshot' and to_regprocedure('erp.commercial_snapshot()') is not null then
  execute 'select erp.commercial_snapshot()' into commercial_data;answer:=answer||jsonb_build_object('commercial_documents',commercial_data);
 end if;
 return answer;
end;
$$;
revoke all on function public.roofsignal_erp(text,jsonb) from public,anon;
grant execute on function public.roofsignal_erp(text,jsonb) to authenticated;
do $$ declare t text;begin
 for t in select unnest(array['fixture_identities','website_parties','website_objects','website_intakes','website_intake_revisions','external_appointments']) loop
  execute format('alter table erp.%I enable row level security',t);execute format('revoke all on table erp.%I from public,anon,authenticated,service_role',t);
 end loop;
end $$;
revoke all on function erp.intake_keys(jsonb,text[]),erp.intake_org_visible(uuid),erp.intake_filter_snapshot(jsonb) from public,anon,authenticated,service_role;
commit;
