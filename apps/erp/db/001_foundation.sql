-- Prepared ERP foundation. Deliberately outside the automatic production migrations.
-- Requires auth.users, auth.uid() and the authenticated role supplied by Supabase.
begin;
create schema if not exists erp;
revoke all on schema erp from public;

create table erp.staff (
  user_id uuid primary key references auth.users(id),
  role text not null check (role in ('administrator','operator')),
  active boolean not null default true
);
create table erp.people (
  user_id uuid primary key references auth.users(id),
  name text not null check (length(name) between 1 and 150),
  phone text not null default '' check (length(phone) <= 40)
);
create table erp.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 200),
  kind text not null check (kind in ('private','vve','business','manager')),
  contact_name text not null default '' check (length(contact_name) <= 150),
  email text not null default '' check (length(email) <= 254),
  phone text not null default '' check (length(phone) <= 40),
  created_at timestamptz not null default now()
);
-- A building keeps its identity when the owner or manager changes.
create table erp.properties (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 200),
  address text not null check (length(trim(address)) between 1 and 250),
  postcode text not null default '' check (length(postcode) <= 10),
  city text not null check (length(trim(city)) between 1 and 150),
  created_at timestamptz not null default now()
);
create table erp.organization_properties (
  organization_id uuid not null references erp.organizations(id),
  property_id uuid not null references erp.properties(id),
  relationship text not null default 'client' check (relationship in ('client','owner','manager')),
  primary key (organization_id,property_id)
);
create table erp.access_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  organization_id uuid not null references erp.organizations(id),
  property_id uuid,
  role text not null check (role in ('reader','contact','finance')),
  expires_at timestamptz,
  revoked_at timestamptz,
  foreign key (organization_id,property_id) references erp.organization_properties
);
create index access_grants_user on erp.access_grants(user_id,organization_id);
create table erp.orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  property_id uuid not null,
  title text not null check (length(trim(title)) between 1 and 200),
  service text not null check (service in ('inspection','thermal','inspection_thermal','construction','photogrammetry')),
  scope text not null default '' check (length(scope) <= 5000),
  internal_note text not null default '' check (length(internal_note) <= 5000),
  status text not null default 'draft' check (status in ('draft','active','completed','cancelled')),
  report_due_on date,
  created_at timestamptz not null default now(),
  foreign key (organization_id,property_id) references erp.organization_properties
);
-- A round and a visit are different: a proposed date is not a reserved calendar slot.
create table erp.inspections (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references erp.orders(id),
  label text not null check (length(trim(label)) between 1 and 200),
  inspected_on date,
  created_at timestamptz not null default now()
);
create table erp.visits (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references erp.inspections(id),
  proposed_on date not null,
  status text not null default 'proposed' check (status in ('proposed','cancelled')),
  created_at timestamptz not null default now()
);
create table erp.findings (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references erp.properties(id),
  title text not null check (length(trim(title)) between 1 and 200),
  component text not null check (length(trim(component)) between 1 and 150),
  created_at timestamptz not null default now()
);
create table erp.observations (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references erp.inspections(id),
  finding_id uuid not null references erp.findings(id),
  description text not null check (length(trim(description)) between 1 and 5000),
  recommendation text not null check (length(trim(recommendation)) between 1 and 5000),
  severity text not null check (severity in ('low','medium','high')),
  assessment text not null check (assessment in ('observed','unchanged','worse','improved','not_visible')),
  created_at timestamptz not null default now(),
  unique (inspection_id,finding_id),
  unique (id,inspection_id)
);
create table erp.reports (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null unique references erp.inspections(id),
  title text not null check (length(trim(title)) between 1 and 200),
  summary text not null check (length(trim(summary)) between 1 and 10000),
  status text not null default 'draft' check (status in ('draft','published','withdrawn')),
  file_key text check (file_key ~ '^[0-9a-f-]{36}\.pdf$'),
  file_name text check (length(file_name) <= 200),
  file_sha256 text check (file_sha256 ~ '^[0-9a-f]{64}$'),
  file_size integer check (file_size between 1 and 10485760),
  created_at timestamptz not null default now(),
  published_at timestamptz
);
-- Reserved domain identity for later private 3D storage and a viewer.
create table erp.model_versions (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references erp.inspections(id),
  version integer not null check (version > 0),
  captured_on date not null,
  coordinate_reference text not null,
  storage_manifest jsonb not null default '{}',
  status text not null default 'draft' check (status in ('draft','published','withdrawn')),
  unique (inspection_id,version),
  unique (id,inspection_id)
);
create table erp.model_markers (
  id uuid primary key default gen_random_uuid(),
  model_version_id uuid not null,
  observation_id uuid not null,
  inspection_id uuid not null,
  foreign key (model_version_id,inspection_id) references erp.model_versions(id,inspection_id),
  foreign key (observation_id,inspection_id) references erp.observations(id,inspection_id),
  position jsonb not null check (jsonb_typeof(position)='array' and jsonb_array_length(position)=3
    and jsonb_typeof(position->0)='number' and jsonb_typeof(position->1)='number' and jsonb_typeof(position->2)='number'),
  unique (model_version_id,observation_id)
);
create table erp.requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  property_id uuid not null,
  created_by uuid not null references auth.users(id),
  kind text not null check (kind in ('inspection','move','repair','question','correction')),
  message text not null check (length(trim(message)) between 1 and 5000),
  preferred_on date,
  status text not null default 'open' check (status in ('open','in_progress','closed')),
  response text not null default '' check (length(response) <= 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id,property_id) references erp.organization_properties
);
create table erp.audit_events (
  id bigint generated always as identity primary key,
  actor_id uuid not null references auth.users(id),
  action text not null,
  entity_id uuid,
  created_at timestamptz not null default now()
);
create table erp.command_receipts (
  actor_id uuid not null references auth.users(id),
  request_id uuid not null,
  command jsonb not null,
  result jsonb,
  primary key (actor_id,request_id)
);

create function erp.is_staff() returns boolean language sql stable set search_path=pg_catalog as $$
  select exists(select 1 from erp.staff where user_id=auth.uid() and active);
$$;
create function erp.can_access(org uuid, prop uuid, write_access boolean default false)
returns boolean language sql stable set search_path=pg_catalog as $$
  select erp.is_staff() or exists (
    select 1 from erp.access_grants g
    join erp.organization_properties p on p.organization_id=g.organization_id
    where g.user_id=auth.uid() and g.organization_id=org and p.property_id=prop
      and (g.property_id is null or g.property_id=prop)
      and g.revoked_at is null and (g.expires_at is null or g.expires_at>now())
      and g.role in ('reader','contact') and (not write_access or g.role='contact')
  );
$$;
create function erp.can_read_report(report_id uuid) returns boolean language sql stable set search_path=pg_catalog as $$
  select exists(select 1 from erp.reports r join erp.inspections i on i.id=r.inspection_id
    join erp.orders o on o.id=i.order_id where r.id=report_id
    and (erp.is_staff() or (r.status='published' and erp.can_access(o.organization_id,o.property_id))));
$$;
create function erp.snapshot() returns jsonb language sql stable set search_path=pg_catalog as $$
select jsonb_build_object(
  'staff',erp.is_staff(),
  'person',coalesce((select to_jsonb(p) from erp.people p where p.user_id=auth.uid()),jsonb_build_object('name','Gebruiker','phone','')),
  'organizations',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'name',o.name,'kind',o.kind,
      'contact_name',case when erp.is_staff() then o.contact_name else null end,
      'email',case when erp.is_staff() then o.email else null end,'phone',case when erp.is_staff() then o.phone else null end) order by o.name)
    from erp.organizations o where erp.is_staff() or exists(select 1 from erp.organization_properties op
      where op.organization_id=o.id and erp.can_access(o.id,op.property_id))),'[]'),
  'properties',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'address',p.address,
      'postcode',p.postcode,'city',p.city,'organization_id',op.organization_id,
      'can_request',erp.can_access(op.organization_id,p.id,true)) order by p.name)
    from erp.properties p join erp.organization_properties op on op.property_id=p.id
    where erp.can_access(op.organization_id,p.id)),'[]'),
  'orders',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'organization_id',o.organization_id,'property_id',o.property_id,
      'title',o.title,'service',o.service,'scope',o.scope,'status',o.status,'report_due_on',o.report_due_on,
      'internal_note',case when erp.is_staff() then o.internal_note else null end) order by o.created_at desc)
    from erp.orders o where erp.is_staff() or (o.status<>'draft' and erp.can_access(o.organization_id,o.property_id))),'[]'),
  'inspections',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'order_id',i.order_id,'label',i.label,'inspected_on',i.inspected_on,
      'property_id',o.property_id,'organization_id',o.organization_id) order by i.inspected_on desc nulls last,i.created_at desc)
    from erp.inspections i join erp.orders o on o.id=i.order_id
    where erp.is_staff() or (o.status<>'draft' and erp.can_access(o.organization_id,o.property_id))),'[]'),
  'visits',coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'inspection_id',v.inspection_id,'proposed_on',v.proposed_on,
      'status',v.status,'property_id',o.property_id,'title',o.title) order by v.proposed_on)
    from erp.visits v join erp.inspections i on i.id=v.inspection_id join erp.orders o on o.id=i.order_id
    where erp.is_staff() or (o.status<>'draft' and erp.can_access(o.organization_id,o.property_id))),'[]'),
  'observations',coalesce((select jsonb_agg(jsonb_build_object('id',ob.id,'inspection_id',ob.inspection_id,
      'finding_id',f.id,'property_id',f.property_id,'title',f.title,'component',f.component,
      'description',ob.description,'recommendation',ob.recommendation,'severity',ob.severity,'assessment',ob.assessment))
    from erp.observations ob join erp.findings f on f.id=ob.finding_id join erp.inspections i on i.id=ob.inspection_id
    join erp.orders o on o.id=i.order_id where erp.is_staff() or
      (erp.can_access(o.organization_id,o.property_id) and exists(select 1 from erp.reports r where r.inspection_id=i.id and r.status='published'))),'[]'),
  'reports',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'inspection_id',r.inspection_id,'title',r.title,'summary',r.summary,
      'status',r.status,'published_at',r.published_at,'has_file',r.file_key is not null,'file_name',r.file_name,'file_size',r.file_size)
      order by r.created_at desc) from erp.reports r where erp.can_read_report(r.id)),'[]'),
  'requests',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'organization_id',r.organization_id,'property_id',r.property_id,
      'kind',r.kind,'message',r.message,'preferred_on',r.preferred_on,'status',r.status,'response',r.response,'created_at',r.created_at)
      order by r.created_at desc) from erp.requests r where erp.is_staff() or
      (r.created_by=auth.uid() and erp.can_access(r.organization_id,r.property_id))),'[]'),
  'activity',case when erp.is_staff() then coalesce((select jsonb_agg(to_jsonb(a)) from
      (select action,entity_id,created_at from erp.audit_events order by id desc limit 12) a),'[]') else '[]'::jsonb end
);
$$;

create function public.roofsignal_erp(action text, payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
<<cmd>>
declare
  actor uuid:=auth.uid(); staff boolean; result jsonb; cached jsonb; original jsonb; request_id uuid;
  entity uuid; org uuid; prop uuid; ins uuid; finding uuid; r erp.reports; ord erp.orders;
begin
  if actor is null then raise exception 'Inloggen vereist' using errcode='42501'; end if;
  if jsonb_typeof(payload)<>'object' then raise exception 'Ongeldige invoer'; end if;
  staff:=erp.is_staff();
  if action='snapshot' then return erp.snapshot(); end if;
  if action='report.file' then
    if not erp.can_read_report((payload->>'id')::uuid) then raise exception 'Geen toegang' using errcode='42501'; end if;
    select * into r from erp.reports where id=(payload->>'id')::uuid;
    return jsonb_build_object('key',r.file_key,'name',r.file_name);
  end if;
  if action not in ('organization.create','property.create','order.create','order.status','inspection.create','inspection.date','observation.create',
    'report.save','report.publish','report.withdraw','report.attach','request.create','request.respond','profile.save')
    then raise exception 'Onbekende actie'; end if;
  if action not in ('request.create','profile.save') and not staff then raise exception 'Geen toegang' using errcode='42501'; end if;
  if action='request.create' then
    org:=(payload->>'organization_id')::uuid; prop:=(payload->>'property_id')::uuid;
    if not erp.can_access(org,prop,true) then raise exception 'Geen toegang' using errcode='42501'; end if;
  end if;
  request_id:=(payload->>'request_id')::uuid;
  if request_id is null then raise exception 'Verzoeknummer ontbreekt'; end if;
  insert into erp.command_receipts(actor_id,request_id,command)
    values(actor,request_id,jsonb_build_object('action',action,'payload',payload)) on conflict do nothing;
  select c.result,c.command into cached,original from erp.command_receipts c
    where c.actor_id=actor and c.request_id=cmd.request_id for update;
  if original<>jsonb_build_object('action',action,'payload',payload) then raise exception 'Verzoeknummer al gebruikt voor andere invoer'; end if;
  if cached is not null then return cached; end if;

  case action
  when 'organization.create' then
    insert into erp.organizations(name,kind,contact_name,email,phone)
      values(trim(payload->>'name'),payload->>'kind',trim(coalesce(payload->>'contact_name','')),
        trim(coalesce(payload->>'email','')),trim(coalesce(payload->>'phone',''))) returning id into entity;
  when 'property.create' then
    org:=(payload->>'organization_id')::uuid;
    insert into erp.properties(name,address,postcode,city) values(trim(payload->>'name'),trim(payload->>'address'),
      upper(trim(coalesce(payload->>'postcode',''))),trim(payload->>'city')) returning id into entity;
    insert into erp.organization_properties(organization_id,property_id) values(org,entity);
  when 'order.create' then
    insert into erp.orders(organization_id,property_id,title,service,scope,internal_note,report_due_on)
      values((payload->>'organization_id')::uuid,(payload->>'property_id')::uuid,trim(payload->>'title'),payload->>'service',
      trim(coalesce(payload->>'scope','')),trim(coalesce(payload->>'internal_note','')),nullif(payload->>'report_due_on','')::date)
      returning id into entity;
    insert into erp.inspections(order_id,label) values(entity,'Eerste inspectie');
  when 'order.status' then
    update erp.orders set status=payload->>'status' where id=(payload->>'id')::uuid returning id into entity;
  when 'inspection.create' then
    select * into ord from erp.orders where id=(payload->>'order_id')::uuid for update;
    if not found or ord.status='cancelled' then raise exception 'Opdracht niet beschikbaar'; end if;
    insert into erp.inspections(order_id,label,inspected_on) values(ord.id,trim(payload->>'label'),nullif(payload->>'inspected_on','')::date)
      returning id into entity;
    if nullif(payload->>'proposed_on','') is not null then
      insert into erp.visits(inspection_id,proposed_on) values(entity,(payload->>'proposed_on')::date);
    end if;
  when 'inspection.date' then
    ins:=(payload->>'id')::uuid;
    perform 1 from erp.orders o join erp.inspections i on i.order_id=o.id where i.id=ins for update of o;
    if exists(select 1 from erp.reports where inspection_id=ins and published_at is not null)
      then raise exception 'Vrijgegeven inspectie is vergrendeld'; end if;
    update erp.inspections set inspected_on=nullif(payload->>'inspected_on','')::date where id=ins returning id into entity;
  when 'observation.create' then
    ins:=(payload->>'inspection_id')::uuid;
    select o.* into ord from erp.orders o join erp.inspections i on i.order_id=o.id where i.id=ins for update of o;
    if not found then raise exception 'Inspectie niet gevonden'; end if;
    if exists(select 1 from erp.reports where inspection_id=ins and published_at is not null)
      then raise exception 'Vrijgegeven inspectie is vergrendeld. Maak een nieuwe inspectieronde.'; end if;
    finding:=nullif(payload->>'finding_id','')::uuid;
    if finding is null then
      insert into erp.findings(property_id,title,component) values(ord.property_id,trim(payload->>'title'),trim(payload->>'component')) returning id into finding;
    elsif not exists(select 1 from erp.findings where id=finding and property_id=ord.property_id) then
      raise exception 'Bevinding hoort bij een ander object';
    end if;
    insert into erp.observations(inspection_id,finding_id,description,recommendation,severity,assessment)
      values(ins,finding,trim(payload->>'description'),trim(payload->>'recommendation'),payload->>'severity',payload->>'assessment') returning id into entity;
  when 'report.save' then
    ins:=(payload->>'inspection_id')::uuid;
    perform 1 from erp.orders o join erp.inspections i on i.order_id=o.id where i.id=ins for update of o;
    select * into r from erp.reports where inspection_id=ins for update;
    if r.published_at is not null then raise exception 'Een vrijgegeven rapport kan niet worden overschreven'; end if;
    insert into erp.reports(inspection_id,title,summary) values(ins,trim(payload->>'title'),trim(payload->>'summary'))
      on conflict(inspection_id) do update set title=excluded.title,summary=excluded.summary returning id into entity;
  when 'report.publish' then
    select * into r from erp.reports where id=(payload->>'id')::uuid;
    if r.id is null then raise exception 'Rapport niet gevonden'; end if;
    perform 1 from erp.orders o join erp.inspections i on i.order_id=o.id where i.id=r.inspection_id for update of o;
    select * into r from erp.reports where id=(payload->>'id')::uuid for update;
    if not exists(select 1 from erp.observations where inspection_id=r.inspection_id) then raise exception 'Leg eerst de bevindingen vast'; end if;
    if not exists(select 1 from erp.inspections where id=r.inspection_id and inspected_on is not null)
      then raise exception 'De inspectiedatum ontbreekt'; end if;
    if exists(select 1 from erp.orders o join erp.inspections i on i.order_id=o.id
      where i.id=r.inspection_id and o.status not in ('active','completed')) then raise exception 'Activeer eerst de opdracht'; end if;
    update erp.reports set status='published',published_at=coalesce(published_at,now()) where id=r.id returning id into entity;
  when 'report.withdraw' then
    update erp.reports set status='withdrawn' where id=(payload->>'id')::uuid and status='published' returning id into entity;
  when 'report.attach' then
    update erp.reports set file_key=payload->>'file_key',file_name=payload->>'file_name',
      file_sha256=payload->>'file_sha256',file_size=(payload->>'file_size')::integer
      where id=(payload->>'id')::uuid and published_at is null returning id into entity;
  when 'request.create' then
    insert into erp.requests(organization_id,property_id,created_by,kind,message,preferred_on)
      values(org,prop,actor,payload->>'kind',trim(payload->>'message'),nullif(payload->>'preferred_on','')::date) returning id into entity;
  when 'request.respond' then
    update erp.requests set status=payload->>'status',response=trim(coalesce(payload->>'response','')),updated_at=now()
      where id=(payload->>'id')::uuid returning id into entity;
  when 'profile.save' then
    insert into erp.people(user_id,name,phone) values(actor,trim(payload->>'name'),trim(coalesce(payload->>'phone','')))
      on conflict(user_id) do update set name=excluded.name,phone=excluded.phone returning user_id into entity;
  end case;
  if entity is null then raise exception 'Record niet beschikbaar of al vergrendeld'; end if;
  result:=jsonb_build_object('id',entity);
  insert into erp.audit_events(actor_id,action,entity_id) values(actor,action,entity);
  update erp.command_receipts c set result=cmd.result where c.actor_id=actor and c.request_id=cmd.request_id;
  return result;
end;
$$;

-- No direct table access. The single RPC validates each action and each dossier.
do $$ declare t record; begin
  for t in select tablename from pg_tables where schemaname='erp' loop
    execute format('alter table erp.%I enable row level security',t.tablename);
  end loop;
end $$;
revoke all on all tables in schema erp from public,anon,authenticated;
revoke all on all sequences in schema erp from public,anon,authenticated;
revoke all on all functions in schema erp from public,anon,authenticated;
revoke all on function public.roofsignal_erp(text,jsonb) from public,anon;
grant execute on function public.roofsignal_erp(text,jsonb) to authenticated;
commit;
