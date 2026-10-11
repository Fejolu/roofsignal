import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {openDatabase,seedDemo,command,write,USERS} from '../src/database.mjs';
import {esc} from '../public/view.mjs';

async function fixture(t){const db=await openDatabase();t.after(()=>db.close());await seedDemo(db);return db;}
const snapshot=(db,user)=>command(db,user,'snapshot');

test('server authorizes dossiers, reports and internal notes for each account',async t=>{
  const db=await fixture(t),staff=await snapshot(db,USERS.staff),a=await snapshot(db,USERS.customer),b=await snapshot(db,USERS.other);
  assert.equal(staff.properties.length,2);assert.equal(a.properties.length,1);assert.equal(b.properties.length,1);
  assert.notEqual(a.properties[0].id,b.properties[0].id);
  assert.equal(a.reports.length,1);assert.equal(b.reports.length,0);
  assert.equal(b.observations.length,0);assert.equal(staff.observations.length,2);
  assert.equal(a.orders[0].internal_note,null);assert.equal(a.activity.length,0);
  assert.equal(a.organizations[0].email,null);
  await assert.rejects(command(db,USERS.other,'report.file',{id:a.reports[0].id}),/Geen toegang/);
  await assert.rejects(command(db,null,'snapshot'),/Inloggen vereist/);
  await assert.rejects(write(db,USERS.customer,'organization.create',{name:'Forbidden',kind:'business'}),/Geen toegang/);
  const finance=await snapshot(db,USERS.finance);assert.equal(finance.properties.length,0);assert.equal(finance.reports.length,0);
});

test('direct table access and anonymous RPC calls are rejected',async t=>{
  const db=await fixture(t);
  await assert.rejects(db.transaction(async tx=>{await tx.exec('set local role authenticated');await tx.query('select * from erp.organizations');}),/permission denied/);
  await assert.rejects(db.transaction(async tx=>{await tx.exec('set local role anon');await tx.query("select public.roofsignal_erp('snapshot','{}')");}),/permission denied/);
  await assert.rejects(db.transaction(async tx=>{await tx.exec('set local role authenticated');await tx.query("select erp.snapshot()");}),/permission denied/);
});

test('revoked, expired and object-specific grants are enforced immediately',async t=>{
  const db=await fixture(t),s=await snapshot(db,USERS.customer),p=s.properties[0];
  const second=await write(db,USERS.staff,'property.create',{organization_id:p.organization_id,name:'Tweede pand',address:'Demo 2',city:'Apeldoorn'});
  assert.equal((await snapshot(db,USERS.customer)).properties.length,2);
  await db.query('update erp.access_grants set property_id=$1 where user_id=$2',[p.id,USERS.customer]);
  assert.deepEqual((await snapshot(db,USERS.customer)).properties.map(p=>p.id),[p.id]);
  await assert.rejects(write(db,USERS.customer,'request.create',{organization_id:p.organization_id,property_id:second.id,kind:'question',message:'Niet toegestaan'}),/Geen toegang/);
  await db.query("update erp.access_grants set expires_at=now()-interval '1 minute' where user_id=$1",[USERS.customer]);
  assert.equal((await snapshot(db,USERS.customer)).reports.length,0);
  await db.query('update erp.access_grants set expires_at=null,revoked_at=now() where user_id=$1',[USERS.customer]);
  assert.equal((await snapshot(db,USERS.customer)).properties.length,0);
  await assert.rejects(command(db,USERS.customer,'report.file',{id:s.reports[0].id}),/Geen toegang/);
  await db.query('update erp.staff set active=false where user_id=$1',[USERS.staff]);
  await assert.rejects(write(db,USERS.staff,'property.create',{}),/Geen toegang/);
});

test('write retries are idempotent, payload changes and invalid relations roll back',async t=>{
  const db=await fixture(t),request_id=randomUUID(),payload={request_id,name:'Een nieuwe klant',kind:'business'};
  const one=await command(db,USERS.staff,'organization.create',payload);
  const two=await command(db,USERS.staff,'organization.create',payload);assert.deepEqual(one,two);
  const count=(await db.query('select count(*)::int as n from erp.audit_events where entity_id=$1',[one.id])).rows[0].n;assert.equal(count,1);
  await assert.rejects(command(db,USERS.staff,'organization.create',{...payload,name:'Andere klant'}),/al gebruikt/);
  const before=(await snapshot(db,USERS.staff)).properties.length;
  await assert.rejects(write(db,USERS.staff,'property.create',{organization_id:randomUUID(),name:'Ongeldig',address:'Demo 1',city:'Apeldoorn'}));
  assert.equal((await snapshot(db,USERS.staff)).properties.length,before);
  assert.equal((await db.query("select count(*)::int as n from erp.command_receipts where result is null")).rows[0].n,0);
});

test('report release freezes the inspection and withdrawal removes customer access',async t=>{
  const db=await fixture(t),s=await snapshot(db,USERS.staff),report=s.reports.find(r=>r.status==='draft');
  const original=s.observations.find(o=>o.inspection_id===report.inspection_id);
  assert.equal((await snapshot(db,USERS.other)).reports.length,0);
  await write(db,USERS.staff,'report.publish',{id:report.id});
  const published=await snapshot(db,USERS.other);assert.equal(published.reports.length,1);assert.equal(published.observations.length,1);
  await assert.rejects(write(db,USERS.staff,'report.save',{inspection_id:report.inspection_id,title:'Overschrijven',summary:'Nee'}),/niet worden overschreven/);
  await assert.rejects(write(db,USERS.staff,'inspection.date',{id:report.inspection_id,inspected_on:'2026-01-01'}),/vergrendeld/);
  await write(db,USERS.staff,'report.withdraw',{id:report.id});
  assert.equal((await snapshot(db,USERS.other)).reports.length,0);assert.equal((await snapshot(db,USERS.other)).observations.length,0);
  await assert.rejects(command(db,USERS.other,'report.file',{id:report.id}),/Geen toegang/);
  await assert.rejects(write(db,USERS.staff,'observation.create',{inspection_id:report.inspection_id}),/vergrendeld/);
  assert.deepEqual((await snapshot(db,USERS.staff)).observations.find(o=>o.id===original.id),original);
});

test('a repeat inspection keeps the finding identity and earlier observations intact',async t=>{
  const db=await fixture(t),s=await snapshot(db,USERS.staff),r=s.reports.find(r=>r.status==='published');
  const earlier=s.observations.find(o=>o.inspection_id===r.inspection_id),ins=s.inspections.find(i=>i.id===r.inspection_id);
  const next=await write(db,USERS.staff,'inspection.create',{order_id:ins.order_id,label:'Tweede ronde',inspected_on:'2026-10-01'});
  await write(db,USERS.staff,'observation.create',{inspection_id:next.id,finding_id:earlier.finding_id,description:'Meer vervuiling zichtbaar.',recommendation:'Reinigen.',severity:'high',assessment:'worse'});
  const after=await snapshot(db,USERS.staff),history=after.observations.filter(o=>o.finding_id===earlier.finding_id);
  assert.equal(history.length,2);assert.deepEqual(history.find(o=>o.id===earlier.id),earlier);
  const foreign=s.observations.find(o=>o.property_id!==earlier.property_id);
  await assert.rejects(write(db,USERS.staff,'observation.create',{inspection_id:next.id,finding_id:foreign.finding_id}),/ander object/);
  assert.equal((await snapshot(db,USERS.customer)).observations.length,1);
});

test('publishing requires actual inspection date, observations and active order',async t=>{
  const db=await fixture(t),s=await snapshot(db,USERS.staff),ins=s.inspections.find(i=>!i.inspected_on);
  const report=await write(db,USERS.staff,'report.save',{inspection_id:ins.id,title:'Concept',summary:'Nog niet vrijgeven'});
  await assert.rejects(write(db,USERS.staff,'report.publish',{id:report.id}),/bevindingen/);
  await write(db,USERS.staff,'observation.create',{inspection_id:ins.id,title:'Dak',component:'Dak',description:'Waarneming',recommendation:'Advies',severity:'low',assessment:'observed'});
  await assert.rejects(write(db,USERS.staff,'report.publish',{id:report.id}),/inspectiedatum/);
  await write(db,USERS.staff,'inspection.date',{id:ins.id,inspected_on:'2026-10-01'});
  await write(db,USERS.staff,'order.status',{id:ins.order_id,status:'cancelled'});
  await assert.rejects(write(db,USERS.staff,'report.publish',{id:report.id}),/Activeer/);
});

test('customer requests stay within the assigned dossier and do not change assessments',async t=>{
  const db=await fixture(t),a=await snapshot(db,USERS.customer),b=await snapshot(db,USERS.other),p=a.properties[0];
  const saved=await write(db,USERS.customer,'request.create',{organization_id:p.organization_id,property_id:p.id,kind:'repair',message:'Ik heb de goot gereinigd.'});
  assert.equal((await snapshot(db,USERS.customer)).requests.length,2);
  assert.equal((await snapshot(db,USERS.other)).requests.length,0);
  assert.deepEqual((await snapshot(db,USERS.customer)).observations,a.observations);
  await assert.rejects(write(db,USERS.customer,'request.create',{organization_id:b.properties[0].organization_id,property_id:b.properties[0].id,kind:'question',message:'Niet toegestaan'}),/Geen toegang/);
  await assert.rejects(write(db,USERS.customer,'request.respond',{id:saved.id,status:'closed'}),/Geen toegang/);
  await write(db,USERS.staff,'request.respond',{id:saved.id,status:'in_progress',response:'Wij beoordelen de melding.'});
  assert.equal((await snapshot(db,USERS.customer)).requests.find(r=>r.id===saved.id).response,'Wij beoordelen de melding.');
  await db.query("update erp.access_grants set role='reader' where user_id=$1",[USERS.customer]);
  await assert.rejects(write(db,USERS.customer,'request.create',{organization_id:p.organization_id,property_id:p.id,kind:'question',message:'Geen schrijfrecht'}),/Geen toegang/);
});

test('profile updates cannot promote a customer or alter organizational contact snapshots',async t=>{
  const db=await fixture(t),before=await snapshot(db,USERS.staff);
  await write(db,USERS.customer,'profile.save',{name:'Nieuwe naam',phone:'0612345678',role:'administrator',user_id:USERS.staff});
  const customer=await snapshot(db,USERS.customer);assert.equal(customer.staff,false);assert.equal(customer.person.name,'Nieuwe naam');
  assert.deepEqual((await snapshot(db,USERS.staff)).organizations,before.organizations);
  assert.equal((await snapshot(db,USERS.staff)).person.name,before.person.name);
});

test('3D markers cannot connect observations from another inspection',async t=>{
  const db=await fixture(t),s=await snapshot(db,USERS.staff),one=s.observations[0],other=s.observations[1];
  const model=(await db.query("insert into erp.model_versions(inspection_id,version,captured_on,coordinate_reference) values($1,1,current_date,'local-model') returning id",[one.inspection_id])).rows[0];
  await assert.rejects(db.query('insert into erp.model_markers(model_version_id,observation_id,inspection_id,position) values($1,$2,$3,$4)',[model.id,other.id,one.inspection_id,'[0,0,0]']));
  await db.query('insert into erp.model_markers(model_version_id,observation_id,inspection_id,position) values($1,$2,$3,$4)',[model.id,one.id,one.inspection_id,'[0,0,0]']);
});

test('rendered customer content escapes executable HTML',()=>{
  assert.equal(esc('<img src=x onerror="alert(1)">'), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
});
