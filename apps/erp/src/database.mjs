import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

export const USERS = Object.freeze({
  staff: '11111111-1111-4111-8111-111111111111',
  customer: '22222222-2222-4222-8222-222222222222',
  other: '33333333-3333-4333-8333-333333333333',
  finance: '44444444-4444-4444-8444-444444444444',
});

// Local development only. Production must use Supabase's verified auth.uid().
export async function openDatabase(dataDir) {
  const db = new PGlite(dataDir);
  await db.waitReady;
  const exists = (await db.query("select to_regclass('erp.staff') as name")).rows[0].name;
  if (!exists) {
    await db.exec(`
      create role anon nologin;
      create role authenticated nologin;
      create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;
      $$;
      grant usage on schema auth to authenticated;
      grant execute on function auth.uid() to authenticated;
    `);
    await db.exec(await readFile(new URL('../db/001_foundation.sql',import.meta.url),'utf8'));
    for (const id of Object.values(USERS)) await db.query('insert into auth.users(id) values ($1)',[id]);
    await db.query("insert into erp.staff values ($1,'administrator',true)",[USERS.staff]);
    for (const [key,name] of [['staff','RoofSignal medewerker'],['customer','Contact Voorbeeldhof'],['other','Contact Demowoning'],['finance','Financieel contact']]) {
      await db.query('insert into erp.people(user_id,name) values($1,$2)',[USERS[key],name]);
    }
  }
  // Additive local updates preserve existing practice dossiers on restart.
  // This Auth substitute is only for fictitious local identities; the hosted
  // adapter uses real Supabase identities and never imports this bootstrap.
  await db.exec(`
    do $$ begin
      if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if;
    end $$;
    alter table auth.users add column if not exists email text;
    alter table auth.users add column if not exists email_confirmed_at timestamptz;
  `);
  for (const [account,id] of Object.entries(USERS)) await db.query(
    'update auth.users set email=$1,email_confirmed_at=coalesce(email_confirmed_at,now()) where id=$2',
    [`${account}@example.invalid`,id]);
  await db.exec(await readFile(new URL('../db/002_telephony.sql',import.meta.url),'utf8'));
  await db.exec(await readFile(new URL('../db/003_auth_and_documents.sql',import.meta.url),'utf8'));
  await db.exec(await readFile(new URL('../db/005_website_intake.sql',import.meta.url),'utf8'));
  return db;
}

// The RPC executes under the same unprivileged role as the future Supabase API.
export async function command(db,user,action,payload={}) {
  return db.transaction(async tx=>{
    await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[user || '']);
    await tx.exec('set local role authenticated');
    const {rows}=await tx.query('select public.roofsignal_erp($1,$2::jsonb) as result',[action,JSON.stringify(payload)]);
    return rows[0].result;
  });
}
export const write = (db,user,action,payload={})=>command(db,user,action,{request_id:randomUUID(),...payload});

// The development server has authenticated its local session and checked the
// PDF bytes before invoking the same service-only boundary as the hosted adapter.
export async function trustedDocument(db,caller,payload) {
  return db.transaction(async tx=>{
    await tx.exec('set local role service_role');
    const {rows}=await tx.query('select public.roofsignal_erp_document($1::uuid,$2::jsonb) as result',[caller,JSON.stringify(payload)]);
    return rows[0].result;
  });
}

export async function seedDemo(db) {
  if ((await db.query('select count(*)::int as n from erp.organizations')).rows[0].n) return;
  for (const [user,name,kind,address] of [
    [USERS.customer,'VvE Voorbeeldhof','vve','Voorbeeldstraat 10–18'],
    [USERS.other,'Eigenaar Demowoning','private','Demolaan 24'],
  ]) {
    const org=await write(db,USERS.staff,'organization.create',{name,kind,contact_name:'Proefcontact',email:'voorbeeld@example.invalid'});
    const prop=await write(db,USERS.staff,'property.create',{organization_id:org.id,name:kind==='vve'?'Voorbeeldhof':'Demowoning',address,city:'Apeldoorn',postcode:'0000 AA'});
    await db.query("insert into erp.access_grants(user_id,organization_id,role) values($1,$2,'contact')",[user,org.id]);
    if(user===USERS.customer) await db.query("insert into erp.access_grants(user_id,organization_id,role) values($1,$2,'finance')",[USERS.finance,org.id]);
    const order=await write(db,USERS.staff,'order.create',{organization_id:org.id,property_id:prop.id,title:'Nulmeting gebouwschil',service:'inspection',scope:'Dak, goten en geveldetails. Dit is een fictief oefendossier.',internal_note:'Interne voorbereiding; niet zichtbaar voor klanten.'});
    await write(db,USERS.staff,'order.status',{id:order.id,status:'active'});
    const ins=(await db.query('select id from erp.inspections where order_id=$1',[order.id])).rows[0];
    const date=new Date(Date.now()-7*86400000).toISOString().slice(0,10);
    await write(db,USERS.staff,'inspection.date',{id:ins.id,inspected_on:date});
    await write(db,USERS.staff,'observation.create',{inspection_id:ins.id,title:'Vervuiling in dakgoot',component:'Dakgoot noordzijde',description:'Bladophoping zichtbaar bij de afvoer. Fictieve waarneming voor deze proefomgeving.',recommendation:'Laat de dakgoot reinigen en controleer de afvoer.',severity:'medium',assessment:'observed'});
    const report=await write(db,USERS.staff,'report.save',{inspection_id:ins.id,title:'Nulmeting · '+(kind==='vve'?'Voorbeeldhof':'Demowoning'),summary:'De gebouwschil is vastgelegd. De dakgoot vraagt om opvolging. Dit voorbeeld bevat uitsluitend fictieve informatie.'});
    if(user===USERS.customer) {
      await write(db,USERS.staff,'report.publish',{id:report.id});
      await write(db,USERS.staff,'inspection.create',{order_id:order.id,label:'Halfjaarlijkse vervolginspectie',proposed_on:new Date(Date.now()+182*86400000).toISOString().slice(0,10)});
      await write(db,user,'request.create',{organization_id:org.id,property_id:prop.id,kind:'question',message:'Kunt u bij de volgende inspectie ook de schoorsteen opnieuw bekijken?'});
    }
  }
}
