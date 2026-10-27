-- Commercial drafts and explicit customer release. No payment or email side effects.
begin;
create table if not exists erp.commercial_documents(
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null, property_id uuid not null,
 kind text not null check(kind in('quote','invoice_draft')),
 title text not null check(length(trim(title)) between 1 and 200),
 description text not null check(length(trim(description)) between 1 and 5000),
 amount_excl_cents integer not null check(amount_excl_cents between 1 and 100000000),
 vat_percent integer not null check(vat_percent in(0,9,21)),
 vat_cents integer not null check(vat_cents>=0),
 total_cents integer not null check(total_cents=amount_excl_cents+vat_cents),
 valid_until date, status text not null default 'draft' check(status in('draft','released','withdrawn')),
 created_at timestamptz not null default now(),released_at timestamptz,
 foreign key(organization_id,property_id) references erp.organization_properties
);
alter table erp.commercial_documents enable row level security;
revoke all on erp.commercial_documents from public,anon,authenticated,service_role;
create or replace function erp.can_read_commercial(org uuid,prop uuid) returns boolean language sql stable set search_path=pg_catalog as $$
 select erp.intake_org_visible(org) and (erp.is_staff() or exists(select 1 from erp.access_grants g
 where g.user_id=auth.uid() and g.organization_id=org and (g.property_id is null or g.property_id=prop)
 and g.role='finance' and g.revoked_at is null and(g.expires_at is null or g.expires_at>now())));
$$;
create or replace function erp.commercial_action(action text,payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
<<commercial>>
declare answer jsonb; rid uuid; actor uuid:=auth.uid(); entity uuid; previous jsonb; cached jsonb;
 org uuid;prop uuid; amount integer;rate integer;tax integer;doc erp.commercial_documents;
begin
 perform erp.auth_command('snapshot','{}');
 if not erp.is_staff() then raise exception 'Geen toegang' using errcode='42501';end if;
 if not erp.intake_keys(payload,array['request_id','organization_id','property_id','kind','title','description','amount_excl_cents','vat_percent','valid_until','id']) then raise exception 'Ongeldige invoer';end if;
 rid:=(payload->>'request_id')::uuid;
 if rid is null then raise exception 'Verzoeknummer vereist';end if;
 insert into erp.command_receipts(actor_id,request_id,command) values(actor,rid,jsonb_build_object('action',action,'payload',payload)) on conflict do nothing;
 select c.command,c.result into previous,cached from erp.command_receipts c where c.actor_id=actor and c.request_id=rid for update;
 if previous<>jsonb_build_object('action',action,'payload',payload) then raise exception 'Verzoeknummer al gebruikt voor andere invoer';end if;
 if cached is not null then return cached;end if;
 if action='commercial.create' then
  org:=(payload->>'organization_id')::uuid;prop:=(payload->>'property_id')::uuid;
  if not erp.can_access(org,prop) then raise exception 'Geen toegang' using errcode='42501';end if;
  if coalesce(payload->>'amount_excl_cents','')!~'^[0-9]{1,9}$' or coalesce(payload->>'vat_percent','')!~'^(0|9|21)$' then raise exception 'Ongeldig bedrag of btw';end if;
  amount:=(payload->>'amount_excl_cents')::integer;rate:=(payload->>'vat_percent')::integer;
  tax:=round(amount::numeric*rate/100)::integer;
  insert into erp.commercial_documents(organization_id,property_id,kind,title,description,amount_excl_cents,vat_percent,vat_cents,total_cents,valid_until)
  values(org,prop,payload->>'kind',payload->>'title',payload->>'description',amount,rate,tax,amount+tax,nullif(payload->>'valid_until','')::date) returning id into entity;
 else
  entity:=(payload->>'id')::uuid;
  select * into doc from erp.commercial_documents where id=entity for update;
  if not found or not erp.can_read_commercial(doc.organization_id,doc.property_id) then raise exception 'Geen toegang' using errcode='42501';end if;
  if action='commercial.release' then
   if doc.kind<>'quote' then raise exception 'Een factuurconcept kan nog niet worden uitgegeven';end if;
   if doc.status<>'draft' then raise exception 'Alleen een concept kan worden vrijgegeven';end if;
   if doc.valid_until is null or doc.valid_until<current_date then raise exception 'Kies een geldige offertedatum';end if;
   update erp.commercial_documents set status='released',released_at=now() where id=entity;
  else
   if doc.status<>'released' then raise exception 'Alleen een vrijgegeven offerte kan worden ingetrokken';end if;
   update erp.commercial_documents set status='withdrawn' where id=entity;
  end if;
 end if;
 answer:=jsonb_build_object('id',entity);
 update erp.command_receipts set result=answer where actor_id=actor and request_id=rid;
 insert into erp.audit_events(actor_id,action,entity_id) values(actor,action,entity);
 return answer;
end;
$$;
create or replace function erp.commercial_snapshot() returns jsonb language sql stable set search_path=pg_catalog as $$
 select coalesce(jsonb_agg(to_jsonb(d)||jsonb_build_object('organization_name',o.name,'property_name',p.name) order by d.created_at desc),'[]') from erp.commercial_documents d join erp.organizations o on o.id=d.organization_id join erp.properties p on p.id=d.property_id
 where erp.can_read_commercial(d.organization_id,d.property_id) and(erp.is_staff() or(d.kind='quote' and d.status='released'));
$$;
revoke all on function erp.can_read_commercial(uuid,uuid),erp.commercial_action(text,jsonb),erp.commercial_snapshot() from public,anon,authenticated,service_role;
commit;
