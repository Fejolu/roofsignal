import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {openDatabase,seedDemo,command,write,USERS} from '../src/database.mjs';

async function fixture(t) {
  const db=await openDatabase();t.after(()=>db.close());
  // The isolated hosted schema has these Supabase Auth columns and role.
  // Keep this setup compatible with the development adapter's additive update.
  await db.exec(`do $$ begin if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if; end $$;
    alter table auth.users add column if not exists email text;
    alter table auth.users add column if not exists email_confirmed_at timestamptz;`);
  for(const [name,id] of Object.entries(USERS))await db.query('update auth.users set email=$1,email_confirmed_at=now() where id=$2',[`${name}@example.invalid`,id]);
  await db.exec(await readFile(new URL('../db/003_auth_and_documents.sql',import.meta.url),'utf8'));
  await seedDemo(db);return db;
}
async function service(db,fn,caller,payload={}) {
  return db.transaction(async tx=>{
    await tx.exec('set local role service_role');
    return (await tx.query(`select public.${fn}($1::uuid,$2::jsonb) as result`,[caller,JSON.stringify(payload)])).rows[0].result;
  });
}
const attach=(db,caller,payload)=>service(db,'roofsignal_erp_document',caller,payload);
const ensure=(db,caller,payload)=>service(db,'roofsignal_erp_profile',caller,payload);
const snapshot=(db,user)=>command(db,user,'snapshot');
const metadata=report_id=>({report_id,request_id:randomUUID(),file_name:'Inspectierapport.pdf',file_size:1200,file_sha256:'a'.repeat(64)});
async function session(db,caller,action,payload) {
  return db.transaction(async tx=>{
    await tx.exec('set local role service_role');
    return (await tx.query('select public.roofsignal_erp_session($1::uuid,$2,$3::jsonb) as result',[caller,action,JSON.stringify(payload)])).rows[0].result;
  });
}

test('only an explicitly active administrator manages or lists access',async t=>{
  const db=await fixture(t);
  const admin=await snapshot(db,USERS.staff);
  assert.equal(admin.staff_role,'administrator');assert.equal(admin.permissions.manage_access,true);
  const customer=await snapshot(db,USERS.customer);
  assert.equal(customer.staff_role,null);assert.equal(customer.permissions.manage_access,false);
  await assert.rejects(command(db,USERS.customer,'access.snapshot'),/Geen toegang/);
  const operator=randomUUID();await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[operator,'operator@roofsignal.nl']);
  await db.query("insert into erp.staff values($1,'operator',true)",[operator]);
  assert.equal((await snapshot(db,operator)).staff_role,'operator');
  await assert.rejects(command(db,operator,'access.snapshot'),/Geen toegang/);
  await assert.rejects(write(db,operator,'access.grant',{user_id:USERS.other,organization_id:admin.organizations[0].id,role:'contact'}),/Geen toegang/);
  await db.query('update erp.staff set active=false where user_id=$1',[USERS.staff]);
  await assert.rejects(command(db,USERS.staff,'access.snapshot'),/Geen toegang/);
});

test('administrator grants a verified identity only within the selected organization and object',async t=>{
  const db=await fixture(t),admin=await snapshot(db,USERS.staff),a=admin.properties[0],b=admin.properties[1];
  const newcomer=randomUUID(),unverified=randomUUID();
  await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now()),($3,$4,null)',[newcomer,'new@roofsignal.nl',unverified,'pending@example.invalid']);
  const scope={user_id:newcomer,organization_id:a.organization_id,property_id:a.id,role:'reader'};
  await assert.rejects(write(db,USERS.staff,'access.grant',{...scope,user_id:unverified}),/geverifieerd/);
  await assert.rejects(write(db,USERS.staff,'access.grant',{...scope,user_id:randomUUID()}),/geverifieerd/);
  await assert.rejects(write(db,USERS.staff,'access.grant',{...scope,property_id:b.id}),/niet bij/);
  await assert.rejects(write(db,USERS.staff,'access.grant',{...scope,role:'administrator'}),/dossierrol/);
  await assert.rejects(write(db,USERS.staff,'access.grant',{...scope,expires_at:'2000-01-01T00:00:00Z'}),/toekomst/);
  await assert.rejects(write(db,USERS.staff,'access.grant',{...scope,expires_at:'infinity'}),/toekomst/);
  assert.equal((await snapshot(db,newcomer)).properties.length,0);
  const grant=await write(db,USERS.staff,'access.grant',scope);
  assert.deepEqual((await snapshot(db,newcomer)).properties.map(p=>p.id),[a.id]);
  await assert.rejects(write(db,newcomer,'request.create',{organization_id:a.organization_id,property_id:a.id,kind:'question',message:'Reader cannot write'}),/Geen toegang/);
  await write(db,USERS.staff,'access.revoke',{id:grant.id});
  assert.equal((await snapshot(db,newcomer)).properties.length,0);
});

test('grant and revocation retries are idempotent, audited, and cannot change payload',async t=>{
  const db=await fixture(t),p=(await snapshot(db,USERS.staff)).properties[0],request_id=randomUUID();
  const payload={request_id,user_id:USERS.finance,organization_id:p.organization_id,role:'contact',expires_at:'2099-01-01T00:00:00Z'};
  const grant=await command(db,USERS.staff,'access.grant',payload);
  assert.deepEqual(await command(db,USERS.staff,'access.grant',payload),grant);
  assert.equal((await db.query('select count(*)::int as n from erp.audit_events where entity_id=$1',[grant.id])).rows[0].n,1);
  await assert.rejects(command(db,USERS.staff,'access.grant',{...payload,role:'finance'}),/al gebruikt/);
  const revoke={id:grant.id,request_id:randomUUID()};
  await command(db,USERS.staff,'access.revoke',revoke);await command(db,USERS.staff,'access.revoke',revoke);
  const listed=await command(db,USERS.staff,'access.snapshot');assert.ok(listed.grants.find(g=>g.id===grant.id).revoked_at);
  assert.equal((await db.query('select count(*)::int as n from erp.audit_events where entity_id=$1',[grant.id])).rows[0].n,2);
  assert.equal((await snapshot(db,USERS.finance)).properties.length,0);
});

test('profile ensure creates no access and lists only known verified ERP profiles',async t=>{
  const db=await fixture(t),unknown=randomUUID(),unverified=randomUUID();
  await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now()),($3,$4,null)',[unknown,'known@example.invalid',unverified,'pending@example.invalid']);
  const before=await command(db,USERS.staff,'access.snapshot');assert.ok(!before.people.some(p=>p.user_id===unknown));
  await ensure(db,unknown,{name:'Nieuw profiel',role:'administrator',organization_id:before.organizations[0].id});
  await ensure(db,unknown,{name:'Login must not overwrite own name'});
  const person=await snapshot(db,unknown);assert.equal(person.person.name,'Nieuw profiel');assert.equal(person.staff,false);assert.equal(person.properties.length,0);
  const after=await command(db,USERS.staff,'access.snapshot');assert.equal(after.people.find(p=>p.user_id===unknown).email,'known@example.invalid');
  assert.ok(!after.people.some(p=>p.user_id===unverified));
  await assert.rejects(ensure(db,unverified,{name:'Pending'}),/Geverifieerd/);
  await assert.rejects(db.transaction(async tx=>{await tx.exec('set local role authenticated');await tx.query("select public.roofsignal_erp_profile($1,'{}')",[unknown]);}),/permission denied/);
});

test('direct attachment RPC is blocked; trusted upload commits a deterministic private key exactly once',async t=>{
  const db=await fixture(t),s=await snapshot(db,USERS.staff),report=s.reports.find(r=>r.status==='draft'),payload=metadata(report.id);
  await assert.rejects(write(db,USERS.staff,'report.attach',{id:report.id,file_key:randomUUID()+'.pdf'}),/beveiligde PDF/);
  await assert.rejects(db.transaction(async tx=>{await tx.exec('set local role authenticated');await tx.query('select public.roofsignal_erp_document($1,$2::jsonb)',[USERS.staff,JSON.stringify(payload)]);}),/permission denied/);
  await assert.rejects(attach(db,USERS.customer,payload),/Geen toegang/);
  const stored=await attach(db,USERS.staff,payload);
  const h=createHash('sha256').update(`${USERS.staff}:${payload.request_id}`).digest('hex').slice(0,32);
  assert.equal(stored.key,`${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}.pdf`);
  assert.deepEqual(await attach(db,USERS.staff,payload),stored);
  assert.equal((await db.query('select count(*)::int as n from erp.audit_events where action=$1 and entity_id=$2',['document.attach',report.id])).rows[0].n,1);
  assert.equal((await snapshot(db,USERS.staff)).reports.find(r=>r.id===report.id).has_file,true);
  await assert.rejects(attach(db,USERS.staff,{...payload,file_sha256:'b'.repeat(64)}),/al gebruikt/);
  await assert.rejects(attach(db,USERS.staff,{...metadata(report.id),file_key:randomUUID()+'.pdf'}),/server bepaald/);
});

test('trusted PDF commits reject unsafe metadata and locks; revocation applies even to a retry',async t=>{
  const db=await fixture(t),s=await snapshot(db,USERS.staff),report=s.reports.find(r=>r.status==='draft');
  for(const changes of [{file_name:'../Other.pdf'},{file_name:'Other\\File.pdf'},{file_name:'name\r\nheader'},{file_size:0},{file_size:10485761},{file_sha256:'not-a-hash'}]) {
    await assert.rejects(attach(db,USERS.staff,{...metadata(report.id),...changes}),/PDF-bestandsgegevens/);
  }
  const payload=metadata(report.id);await attach(db,USERS.staff,payload);
  await write(db,USERS.staff,'report.publish',{id:report.id});
  // A repeat of the committed upload does not overwrite a now-published report.
  assert.deepEqual(await attach(db,USERS.staff,payload),{id:report.id,key:(await command(db,USERS.staff,'report.file',{id:report.id})).key});
  await assert.rejects(attach(db,USERS.staff,metadata(report.id)),/vrijgegeven/);
  await db.query('update erp.staff set active=false where user_id=$1',[USERS.staff]);
  await assert.rejects(attach(db,USERS.staff,payload),/Geen toegang/);
});

test('replaying the auth migration preserves dossiers, command routing, and attachment permissions',async t=>{
  const db=await fixture(t),before=await snapshot(db,USERS.staff);
  await db.exec(await readFile(new URL('../db/002_telephony.sql',import.meta.url),'utf8'));
  await db.exec(await readFile(new URL('../db/003_auth_and_documents.sql',import.meta.url),'utf8'));
  assert.deepEqual(await snapshot(db,USERS.staff),before);
  assert.equal((await command(db,USERS.staff,'phone.lookup',{phone:'anonymous'})).match,'withheld');
  await assert.rejects(write(db,USERS.staff,'report.attach',{}),/beveiligde PDF/);
  await assert.rejects(db.transaction(async tx=>{await tx.exec('set local role authenticated');await tx.query("select erp.access_snapshot()");}),/permission denied/);
});

test('persistent sessions store no tokens, bind the caller, and remain revoked on register retries',async t=>{
  const db=await fixture(t),session_hash=createHash('sha256').update(randomUUID()).digest('hex');
  const payload={session_hash,purpose:'login',expires_at:new Date(Date.now()+7*3600000).toISOString()};
  const registered=await session(db,USERS.customer,'register',payload);assert.equal(registered.valid,true);assert.equal(registered.purpose,'login');
  assert.deepEqual(await session(db,USERS.customer,'check',{session_hash}),registered);
  assert.deepEqual(await session(db,USERS.customer,'register',payload),registered);
  assert.equal((await session(db,USERS.other,'check',{session_hash})).valid,false);
  await assert.rejects(session(db,USERS.other,'register',payload),/al gebruikt/);
  await assert.rejects(db.transaction(async tx=>{await tx.exec('set local role authenticated');await tx.query('select public.roofsignal_erp_session($1,$2,$3::jsonb)',[USERS.customer,'check',JSON.stringify({session_hash})]);}),/permission denied/);
  await assert.rejects(db.transaction(async tx=>{await tx.exec('set local role authenticated');await tx.query('select * from erp.sessions');}),/permission denied/);
  const columns=(await db.query("select column_name from information_schema.columns where table_schema='erp' and table_name='sessions' order by ordinal_position")).rows.map(r=>r.column_name);
  assert.deepEqual(columns,['session_hash','user_id','purpose','expires_at','revoked_at','created_at']);
  assert.equal((await session(db,USERS.customer,'revoke',{session_hash})).valid,false);
  assert.equal((await session(db,USERS.customer,'register',payload)).valid,false);
  assert.equal((await session(db,USERS.customer,'check',{session_hash})).valid,false);
});

test('session lifetime limits, identity deletion and verification apply on every check',async t=>{
  const db=await fixture(t),hash=()=>createHash('sha256').update(randomUUID()).digest('hex');
  for(const payload of [
    {session_hash:hash(),purpose:'login',expires_at:new Date(Date.now()+9*3600000).toISOString()},
    {session_hash:hash(),purpose:'recovery',expires_at:new Date(Date.now()+11*60000).toISOString()},
    {session_hash:hash(),purpose:'login',expires_at:'infinity'},
    {session_hash:hash(),purpose:'staff',expires_at:new Date(Date.now()+60000).toISOString()},
  ])await assert.rejects(session(db,USERS.customer,'register',payload),/sessieduur/);
  await assert.rejects(session(db,USERS.customer,'check',{session_hash:'bearer-token'}),/Ongeldige sessie/);
  const recovery={session_hash:hash(),purpose:'recovery',expires_at:new Date(Date.now()+9*60000).toISOString()};
  assert.equal((await session(db,USERS.customer,'register',recovery)).purpose,'recovery');
  await db.query('update erp.sessions set expires_at=now()-interval \'1 second\' where session_hash=$1',[recovery.session_hash]);
  assert.equal((await session(db,USERS.customer,'check',recovery)).valid,false);
  const login={session_hash:hash(),purpose:'login',expires_at:new Date(Date.now()+3600000).toISOString()};
  await session(db,USERS.other,'register',login);
  await db.query('update auth.users set email_confirmed_at=null where id=$1',[USERS.other]);
  assert.equal((await session(db,USERS.other,'check',login)).valid,false);
  await assert.rejects(snapshot(db,USERS.other),/Geverifieerd/);
  await db.exec('alter table auth.users add column if not exists deleted_at timestamptz');
  await db.query('update auth.users set email_confirmed_at=now(),deleted_at=now() where id=$1',[USERS.other]);
  assert.equal((await session(db,USERS.other,'check',login)).valid,false);
  await assert.rejects(snapshot(db,USERS.other),/Geverifieerd/);
  await assert.rejects(session(db,USERS.other,'register',{...login,session_hash:hash()}),/Geverifieerd/);
});

test('recovery consume has one winner and cannot consume a normal login or anonymous identity',async t=>{
  const db=await fixture(t),hash=()=>createHash('sha256').update(randomUUID()).digest('hex');
  const recovery={session_hash:hash(),purpose:'recovery',expires_at:new Date(Date.now()+9*60000).toISOString()};
  await session(db,USERS.customer,'register',recovery);
  assert.equal((await session(db,USERS.customer,'consume',recovery)).consumed,true);
  assert.equal((await session(db,USERS.customer,'consume',recovery)).consumed,false);
  assert.equal((await session(db,USERS.customer,'check',recovery)).valid,false);
  const login={session_hash:hash(),purpose:'login',expires_at:new Date(Date.now()+3600000).toISOString()};
  await session(db,USERS.other,'register',login);
  assert.equal((await session(db,USERS.other,'consume',login)).consumed,false);
  assert.equal((await session(db,USERS.other,'check',login)).valid,true);
  await db.exec('alter table auth.users add column if not exists is_anonymous boolean default false');
  await db.query('update auth.users set is_anonymous=true where id=$1',[USERS.other]);
  assert.equal((await session(db,USERS.other,'check',login)).valid,false);
  await assert.rejects(snapshot(db,USERS.other),/Geverifieerd/);
  await assert.rejects(ensure(db,USERS.other,{name:'Anonymous cannot enter'}),/Geverifieerd/);
});
