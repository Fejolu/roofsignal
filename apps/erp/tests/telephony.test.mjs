import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {openDatabase,seedDemo,command,write,USERS} from '../src/database.mjs';

async function fixture(t){const db=await openDatabase();t.after(()=>db.close());await seedDemo(db);return db;}
const lookup=(db,phone,user=USERS.staff)=>command(db,user,'phone.lookup',{phone});
const customer=(db,name,phone)=>write(db,USERS.staff,'organization.create',{
  name,kind:'business',contact_name:'Fictieve contactpersoon',email:'voorbeeld@example.invalid',phone,
});

test('Dutch mobile and landline variants open the exact same customer',async t=>{
  const db=await fixture(t);
  const mobile=await customer(db,'Mobiele klant','06 1234 5678');
  const landline=await customer(db,'Zakelijke klant','085-212-8019');
  for(const phone of ['0612345678','06-1234.5678','+31 6 1234 5678','0031 (6) 1234 5678','+31 (0)6 1234 5678']) {
    const result=await lookup(db,phone);
    assert.equal(result.phone,'+31612345678');assert.equal(result.match,'single');
    assert.equal(result.customers[0].id,mobile.id);assert.equal(result.customers[0].phone,'06 1234 5678');
  }
  for(const phone of ['0852128019','(085) 212 80 19','+31 85 2128019','0031852128019']) {
    const result=await lookup(db,phone);
    assert.equal(result.phone,'+31852128019');assert.equal(result.match,'single');
    assert.equal(result.customers[0].id,landline.id);
  }
});

test('international numbers retain the country code and do not use suffix matching',async t=>{
  const db=await fixture(t),foreign=await customer(db,'Belgische klant','+32 (2) 123 45 67');
  for(const phone of ['+3221234567','0032 2 123 45 67']) {
    const result=await lookup(db,phone);assert.equal(result.phone,'+3221234567');
    assert.equal(result.match,'single');assert.equal(result.customers[0].id,foreign.id);
  }
  // A different country or a different full national number is a different caller.
  assert.equal((await lookup(db,'+3321234567')).match,'none');
  assert.equal((await lookup(db,'0212345678')).match,'none');
  await assert.rejects(lookup(db,'21234567'),/Ongeldig telefoonnummer/);
});

test('a shared number returns every matching customer for the employee to choose',async t=>{
  const db=await fixture(t),first=await customer(db,'VvE A','06 12345678'),second=await customer(db,'VvE B','+31612345678');
  const result=await lookup(db,'0031 6 1234 5678');
  assert.equal(result.match,'multiple');assert.deepEqual(result.customers.map(c=>c.id),[first.id,second.id]);
  assert.equal(result.customers.length,2);
});

test('unknown and withheld calls stay read-only and do not create customer or audit records',async t=>{
  const db=await fixture(t);
  const counts=async()=> (await db.query(`select (select count(*)::int from erp.organizations) as customers,
    (select count(*)::int from erp.audit_events) as audit,(select count(*)::int from erp.command_receipts) as commands`)).rows[0];
  const before=await counts();
  assert.deepEqual(await lookup(db,'0698765432'),{phone:'+31698765432',match:'none',customers:[]});
  for(const phone of [null,'',' \t\n ','anonymous','WITHHELD','private','restricted','unknown','Anoniem','afgeschermd']) {
    assert.deepEqual(await lookup(db,phone),{phone:null,match:'withheld',customers:[]});
  }
  assert.deepEqual(await command(db,USERS.staff,'phone.lookup',{}),{phone:null,match:'withheld',customers:[]});
  assert.deepEqual(await counts(),before);
});

test('malformed nonempty numbers are rejected instead of guessing a customer',async t=>{
  const db=await fixture(t);
  for(const phone of ['06123','+310612345678','+31 6 123456789','+31 6 1234567','06abc12345678',
    '0612345678 ext 9','+31+612345678','+0123456789','+1234567890123456','javascript:alert(1)',42,{}]) {
    await assert.rejects(lookup(db,phone),/Ongeldig telefoonnummer/);
  }
});

test('invalid historical phone values are ignored and profiles do not grant a customer match',async t=>{
  const db=await fixture(t);
  await customer(db,'Oud contact','06 12345678 toestel 3');
  await write(db,USERS.customer,'profile.save',{name:'Contact Voorbeeldhof',phone:'0612345678'});
  assert.deepEqual(await lookup(db,'0612345678'),{phone:'+31612345678',match:'none',customers:[]});
  const visible=await command(db,USERS.customer,'snapshot');
  assert.equal(visible.staff,false);assert.equal(visible.properties.length,1);
});

test('caller identification requires an active employee and never grants access',async t=>{
  const db=await fixture(t);await customer(db,'Privé dossier','0612345678');
  const privileges=(await db.query(`select
    has_function_privilege('authenticated','erp.core_command(text,jsonb)','EXECUTE') as core,
    has_function_privilege('authenticated','erp.normalized_phone(text)','EXECUTE') as helper,
    has_function_privilege('anon','public.roofsignal_erp(text,jsonb)','EXECUTE') as anonymous,
    has_function_privilege('authenticated','public.roofsignal_erp(text,jsonb)','EXECUTE') as rpc`)).rows[0];
  assert.deepEqual(privileges,{core:false,helper:false,anonymous:false,rpc:true});
  for(const user of [USERS.customer,USERS.other,USERS.finance]) {
    await assert.rejects(lookup(db,'0612345678',user),/Geen toegang/);
    await assert.rejects(lookup(db,'not a number',user),/Geen toegang/);
  }
  await assert.rejects(lookup(db,'0612345678',null),/Inloggen vereist/);
  await db.query('update erp.staff set active=false where user_id=$1',[USERS.staff]);
  await assert.rejects(lookup(db,'0612345678'),/Geen toegang/);
  await assert.rejects(db.transaction(async tx=>{
    await tx.exec('set local role authenticated');await tx.query("select erp.normalized_phone('0612345678')");
  }),/permission denied/);
  await assert.rejects(db.transaction(async tx=>{
    await tx.exec('set local role authenticated');await tx.query("select erp.core_command('snapshot','{}')");
  }),/permission denied/);
  await assert.rejects(db.transaction(async tx=>{
    await tx.exec('set local role anon');await tx.query("select public.roofsignal_erp('phone.lookup','{}')");
  }),/permission denied/);
});

test('the additive update preserves an existing foundation database and survives reopening',async t=>{
  const dir=await mkdtemp(path.join(tmpdir(),'roofsignal-erp-telephony-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  let db=new PGlite(path.join(dir,'database'));await db.waitReady;
  try {
    // Recreate the preceding local version: foundation and dossiers, no telephony wrapper.
    await db.exec(`create role anon nologin;create role authenticated nologin;create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;$$;
      grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`);
    await db.exec(await readFile(new URL('../db/001_foundation.sql',import.meta.url),'utf8'));
    for(const id of Object.values(USERS))await db.query('insert into auth.users values($1)',[id]);
    await db.query("insert into erp.staff values($1,'administrator',true)",[USERS.staff]);
    await seedDemo(db);
    const saved=await customer(db,'Bestaande klant','085 212 8019');
    const before=await command(db,USERS.staff,'snapshot');
    await assert.rejects(lookup(db,'0852128019'),/Onbekende actie/);
    await db.close();db=null;

    db=await openDatabase(path.join(dir,'database'));
    const after=await command(db,USERS.staff,'snapshot');
    for(const key of ['organizations','properties','orders','inspections','reports'])assert.deepEqual(after[key],before[key]);
    assert.equal((await lookup(db,'+31852128019')).customers[0].id,saved.id);
    const next=await customer(db,'Nieuwe klant na update','0698765432');
    await db.close();db=null;

    // Running the same additive SQL a second time must not rename/rebuild the core again.
    db=await openDatabase(path.join(dir,'database'));
    assert.equal((await lookup(db,'0698765432')).customers[0].id,next.id);
    assert.equal((await lookup(db,'0852128019')).customers[0].id,saved.id);
    const reopened=await command(db,USERS.staff,'snapshot');
    assert.equal(reopened.properties.length,before.properties.length);
    await assert.rejects(lookup(db,'0852128019',USERS.customer),/Geen toegang/);
  } finally {if(db)await db.close();}
});
