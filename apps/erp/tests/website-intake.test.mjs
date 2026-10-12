import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {openDatabase,command,write,seedDemo,USERS} from '../src/database.mjs';
const when='2026-10-12T18:00:00.000Z';
const envelope=(source,record,revision=1)=>({source,source_id:record.id,revision,changed_at:new Date(Date.parse(when)+(revision-1)*1000).toISOString(),record});
function consumer(change={}){return {id:randomUUID(),mode:'live',reference:'RS-CONSUMER-DEMO',status:'payment_pending',close_code:null,payment_id:'tr_demo'+randomUUID().replaceAll('-',''),payment_status:'open',calendar_event_id:'event-demo',customer:{name:'Fictieve eigenaar',email:'customer@example.invalid',phone:'0612345678',notes:''},terms:{version:'2026-09-24',accepted:true,earlyStartRequested:true},terms_accepted_at:when,slot_start:'2026-10-20T08:00:00Z',slot_end:'2026-10-20T08:45:00Z',created_at:when,updated_at:when,quote:{id:randomUUID(),address:{postcode:'7316BH',houseNumber:'4',street:'Voorbeeldstraat',city:'Apeldoorn',country:'NL'},destination:'Voorbeeldstraat 4',inspection_type:'building_envelope',thermal:true,pricing_version:'2026-10-11',base_cents:36179,thermal_cents:30250,travel_cents:4235,total_cents:70664,distance_meters:52162,travel_description:'Reiskosten',terms_version:'2026-09-24',policy_version:'2026-10-10',campaign:null,created_at:when},...change};}
function parken(change={}){return {id:randomUUID(),reference:'RS-PARKEN-DEMO',name:'Fictieve eigenaar',email:'customer@example.invalid',phone:'0612345678',street:'Voorbeeldstraat',house_number:'4',postcode:'7316BH',slot_date:'2026-10-20',slot_time:'16:00-18:00',notes:'',status:'confirmed',source:'de-parken-directmail-2026',terms_accepted_at:when,early_start_requested_at:when,thermography_interest_at:null,thermography_selected:true,offer_version:'parken-2026-09-17-thermography',inspection_excl_cents:29900,thermography_excl_cents:25000,total_incl_cents:66429,terms_version:'2026-09-24',created_at:when,updated_at:when,confirmation_sent_at:when,organization_id:null,property_id:null,appointment_id:randomUUID(),inspection_id:randomUUID(),...change};}
const vve=()=>({id:randomUUID(),request_type:'price',name:'Contactpersoon',organization:'VvE Voorbeeld',email:'manager@example.invalid',segment:'VvE / VvE-beheerder',postcode:'7316BH',object_complexity:null,site_access:null,scope:'VvE gebouwschilinspectie',message:'Aantal adressen: 8. Indicatie €1.000 excl. btw.',status:'new',source_path:'/inspectie-boeken/',created_at:when,intake_details:null});
const fixture=async t=>{const db=await openDatabase();t.after(()=>db.close());return db;};
const intake=(db,payload)=>db.transaction(async tx=>{await tx.exec('set local role service_role');return (await tx.query('select public.roofsignal_erp_intake($1::jsonb) as result',[JSON.stringify(payload)])).rows[0].result;});
const rows=(db,table)=>db.query('select * from erp.'+table).then(r=>r.rows);

test('pending consumer intake creates one draft dossier with immutable source price and no portal authority',async t=>{
 const db=await fixture(t),r=consumer(),reply=await intake(db,envelope('consumer',r));assert.equal(reply.accepted,true);assert.equal(reply.source_id,r.id);assert.equal(reply.revision,1);
 const orders=await rows(db,'orders');assert.equal(orders.length,1);assert.equal(orders[0].status,'draft');assert.equal(orders[0].service,'inspection_thermal');assert.equal((await rows(db,'external_appointments'))[0].state,'held');
 assert.equal((await rows(db,'access_grants')).length,0);assert.equal((await command(db,USERS.customer,'snapshot')).properties.length,0);assert.equal((await rows(db,'website_intakes'))[0].total_cents,70664);
});

test('paid confirmation updates the same dossier; retries and delayed events cannot duplicate or regress it',async t=>{
 const db=await fixture(t),r=consumer(),one=envelope('consumer',r);const first=await intake(db,one);assert.equal((await intake(db,one)).duplicate,true);
 const paid={...r,status:'confirmed',payment_status:'paid'},two=envelope('consumer',paid,2);await intake(db,two);
 const delayed=await intake(db,one);assert.equal(delayed.ignored,true);assert.equal(delayed.revision,1);assert.equal(delayed.current_revision,2);assert.equal(delayed.accepted,true);
 assert.equal((await rows(db,'orders')).length,1);assert.equal((await rows(db,'orders'))[0].status,'active');assert.equal((await rows(db,'external_appointments'))[0].state,'confirmed');assert.equal((await rows(db,'website_intake_revisions')).length,2);
 assert.equal((await rows(db,'website_intakes'))[0].id,first.id);await assert.rejects(intake(db,{...two,record:{...paid,status:'payment_pending'}}),/al gebruikt/);
});

test('paid planning review is clearly separate from an active confirmed inspection',async t=>{
 const db=await fixture(t),r=consumer({status:'paid_review_required',payment_status:'paid'});await intake(db,envelope('consumer',r));assert.equal((await rows(db,'orders'))[0].status,'draft');assert.equal((await rows(db,'website_intakes'))[0].state,'paid_review');assert.equal((await rows(db,'external_appointments'))[0].state,'review');
});

test('source revisions preserve staff work and raise review without repricing the accepted agreement',async t=>{
 const db=await fixture(t),r=consumer({status:'confirmed',payment_status:'paid'});await intake(db,envelope('consumer',r));const o=(await rows(db,'orders'))[0];
 await db.query("update erp.orders set status='completed',scope='Staff scope',internal_note='Staff note' where id=$1",[o.id]);
 const altered={...r,quote:{...r.quote,base_cents:36279,total_cents:70764}};await intake(db,envelope('consumer',altered,2));const order=(await rows(db,'orders'))[0],item=(await rows(db,'website_intakes'))[0];assert.equal(order.status,'completed');assert.equal(order.scope,'Staff scope');assert.equal(order.internal_note,'Staff note');assert.equal(item.total_cents,70664);assert.equal(item.commercial.total_cents,70664);assert.equal(item.financial_review,true);assert.equal((await rows(db,'website_intake_revisions'))[1].record.quote.total_cents,70764);
});

test('consumer failures and pilot cancellations stay cancelled; pilot confirmation never becomes payment proof',async t=>{
 const db=await fixture(t);await intake(db,envelope('consumer',consumer({status:'canceled',payment_status:'canceled'})));await intake(db,envelope('parken',parken()));await intake(db,envelope('parken',parken({id:randomUUID(),status:'cancelled',email:'other@example.invalid'})));
 const items=await rows(db,'website_intakes');assert.equal(items.find(i=>i.source==='consumer').state,'payment_cancelled');const pilot=items.find(i=>i.state==='pilot_confirmed');assert.equal(pilot.payment_status,null);assert.equal(pilot.payment_id,null);assert.equal((await rows(db,'orders')).filter(o=>o.status==='cancelled').length,2);
 const appointment=(await rows(db,'external_appointments')).find(a=>a.intake_id===pilot.id);assert.equal(new Date(appointment.starts_at).toISOString(),'2026-10-20T14:00:00.000Z');assert.equal(new Date(appointment.ends_at).toISOString(),'2026-10-20T16:00:00.000Z');
});

test('old pilot interest is not a paid thermography purchase or a newly inferred price',async t=>{
 const db=await fixture(t),r=parken({offer_version:null,thermography_selected:null,inspection_excl_cents:null,thermography_excl_cents:null,total_incl_cents:null,thermography_interest_at:when});await intake(db,envelope('parken',r));assert.equal((await rows(db,'website_intakes'))[0].total_cents,null);assert.equal((await rows(db,'orders'))[0].service,'inspection');
});

test('VvE submissions are inquiries with no invoice, payment, operational order or login grant',async t=>{
 const db=await fixture(t),r=vve();await intake(db,envelope('vve',r));assert.equal((await rows(db,'website_intakes'))[0].state,'inquiry');for(const table of ['organizations','properties','orders','external_appointments','access_grants'])assert.equal((await rows(db,table)).length,0);
 await assert.rejects(intake(db,envelope('vve',{...r,id:randomUUID(),request_type:'withdrawal'})),/VvE/);
});

test('complete party and object identity reuses exact bookings but shared contact across houses is not merged',async t=>{
 const db=await fixture(t),r=consumer();await intake(db,envelope('consumer',r));await intake(db,envelope('parken',parken()));assert.equal((await rows(db,'organizations')).length,1);assert.equal((await rows(db,'properties')).length,1);
 const another=consumer({customer:r.customer});another.quote.address={...r.quote.address,houseNumber:'6'};await intake(db,envelope('consumer',another));assert.equal((await rows(db,'organizations')).length,2);assert.equal((await rows(db,'properties')).length,2);
});

test('private import and history are inaccessible to clients and malformed or secret-bearing payloads roll back',async t=>{
 const db=await fixture(t),r=consumer();await assert.rejects(db.transaction(async tx=>{await tx.exec('set local role authenticated');await tx.query('select public.roofsignal_erp_intake($1::jsonb)',[JSON.stringify(envelope('consumer',r))]);}),/permission denied/);
 for(const table of ['website_intakes','website_intake_revisions','external_appointments'])await assert.rejects(db.transaction(async tx=>{await tx.exec('set local role authenticated');await tx.query('select * from erp.'+table);}),/permission denied/);
 await assert.rejects(intake(db,envelope('consumer',{...r,status_token:'secret'})),/consumentenregistratie/);
 await assert.rejects(intake(db,envelope('consumer',{...r,mode:'test'})),/consumentenregistratie/);
 await assert.rejects(intake(db,envelope('consumer',{...r,quote:{...r.quote,total_cents:100}})),/prijsafspraak/);
 assert.equal((await rows(db,'website_intakes')).length,0);
 await assert.rejects(command(db,USERS.customer,'intake.snapshot',{}),/Geen toegang/);
});

test('fixture dossiers and known fixture identities disappear from staff and direct report access',async t=>{
 const db=await fixture(t);await seedDemo(db);const before=await command(db,USERS.staff,'snapshot'),org=before.organizations[0],report=before.reports.find(r=>before.inspections.find(i=>i.id===r.inspection_id).organization_id===org.id);
 await db.query('update erp.organizations set is_fixture=true where id=$1',[org.id]);await db.query('insert into erp.fixture_identities(user_id) values($1)',[USERS.other]);
 const after=await command(db,USERS.staff,'snapshot');assert.equal(after.organizations.length,before.organizations.length-1);assert.ok(after.orders.every(o=>o.organization_id!==org.id));assert.ok(!after.reports.some(r=>r.id===report.id));await assert.rejects(command(db,USERS.staff,'report.file',{id:report.id}),/Geen toegang/);
 const access=await command(db,USERS.staff,'access.snapshot');assert.ok(!access.organizations.some(o=>o.id===org.id));assert.ok(!access.people.some(p=>p.user_id===USERS.other));
});

test('reapplying the migration preserves imported identities and continues verified routing',async t=>{
 const db=await fixture(t),r=consumer();await intake(db,envelope('consumer',r));await db.exec(await readFile(new URL('../db/005_website_intake.sql',import.meta.url),'utf8'));assert.equal((await rows(db,'orders')).length,1);assert.equal((await command(db,USERS.staff,'intake.snapshot',{})).items.length,1);assert.equal((await intake(db,envelope('consumer',r))).duplicate,true);
});


test('standalone thermal remains thermal even when the stored thermal flag is true',async t=>{
 const db=await fixture(t),r=consumer();r.quote={...r.quote,inspection_type:'thermal',thermal:true,base_cents:0,thermal_cents:36179,total_cents:40414};await intake(db,envelope('consumer',r));assert.equal((await rows(db,'orders'))[0].service,'thermal');
});

test('published observations survive the fixture filter for their own authorized customer',async t=>{
 const db=await fixture(t);await seedDemo(db);const before=await command(db,USERS.customer,'snapshot');assert.ok(before.observations.length>0);const other=(await command(db,USERS.other,'snapshot')).organizations[0];await db.query('update erp.organizations set is_fixture=true where id=$1',[other.id]);const after=await command(db,USERS.customer,'snapshot');assert.deepEqual(after.observations,before.observations);assert.ok(after.observations.length>0);
});


test('unknown future component split retains the accepted total and flags review instead of inventing amounts',async t=>{
 const db=await fixture(t),r=consumer({status:'confirmed',payment_status:'paid'});r.quote={...r.quote,pricing_version:'future-version',base_cents:null,thermal_cents:null};await intake(db,envelope('consumer',r));const item=(await rows(db,'website_intakes'))[0];assert.equal(item.total_cents,70664);assert.equal(item.financial_review,true);assert.equal(item.commercial.base_cents,null);assert.equal(item.commercial.thermal_cents,null);
});

test('structured VvE pricing remains an unaccepted indication and never creates an order',async t=>{
 const db=await fixture(t),r=vve();r.intake_details={schema_version:1,context:'vve-object',inspection_type:'building_envelope',thermal:true,address_count:8,object_scope:'single',object_address:'Voorbeeldstraat 1–8',object_city:'Apeldoorn',phone:'0612345678',kvk_number:null,price_indication:{kind:'indication',pricing_version:'vve-2026-10-11',building_envelope_excl_cents:100000,thermal_excl_cents:55000,total_excl_cents:155000,total_incl_cents:187550,travel_included:false,accepted:false}};await intake(db,envelope('vve',r));const item=(await rows(db,'website_intakes'))[0];assert.equal(item.total_cents,null);assert.equal(item.record.intake_details.price_indication.total_incl_cents,187550);assert.equal((await rows(db,'orders')).length,0);
 const bad=structuredClone(r);bad.id=crypto.randomUUID();bad.intake_details.price_indication.accepted=true;await assert.rejects(intake(db,envelope('vve',bad)),/VvE-indicatie/);
});


test('retired fixture JWTs cannot execute any business RPC and cannot receive a new grant',async t=>{
 const db=await fixture(t);await seedDemo(db);const org=(await command(db,USERS.staff,'snapshot')).organizations[0];await db.query('insert into erp.fixture_identities(user_id) values($1)',[USERS.customer]);
 for(const action of ['snapshot','profile.save','intake.snapshot','phone.lookup'])await assert.rejects(command(db,USERS.customer,action,{request_id:randomUUID(),name:'Old fixture',phone:''}),/Geen toegang/);
 await assert.rejects(write(db,USERS.staff,'access.grant',{user_id:USERS.customer,organization_id:org.id,role:'reader'}),/Geen toegang/);
 await db.exec('alter table auth.users add column if not exists banned_until timestamptz');await db.query("update auth.users set banned_until=now()+interval '1 day' where id=$1",[USERS.other]);await assert.rejects(write(db,USERS.staff,'access.grant',{user_id:USERS.other,organization_id:org.id,role:'reader'}),/Geen toegang/);
});


test('a previously accepted checkout closed as not_created cancels its existing operational draft',async t=>{
 const db=await fixture(t),r=consumer({status:'preparing',payment_id:null,payment_status:null});await intake(db,envelope('consumer',r));await intake(db,envelope('consumer',{...r,status:'not_created',close_code:'SLOT_UNAVAILABLE'},2));assert.equal((await rows(db,'orders')).length,1);assert.equal((await rows(db,'orders'))[0].status,'cancelled');assert.equal((await rows(db,'external_appointments'))[0].state,'cancelled');assert.equal((await rows(db,'website_intakes'))[0].state,'payment_not_created');
});

test('phone lookup excludes retired fixture organizations and recomputes the actual match',async t=>{
 const db=await fixture(t);await seedDemo(db);const org=(await command(db,USERS.staff,'snapshot')).organizations[0];await db.query("update erp.organizations set phone='0612345678',is_fixture=true where id=$1",[org.id]);const hidden=await command(db,USERS.staff,'phone.lookup',{phone:'0612345678'});assert.equal(hidden.match,'none');assert.deepEqual(hidden.customers,[]);const real=await write(db,USERS.staff,'organization.create',{name:'Real source contact',kind:'private',phone:'0612345678'});const found=await command(db,USERS.staff,'phone.lookup',{phone:'0612345678'});assert.equal(found.match,'single');assert.deepEqual(found.customers.map(c=>c.id),[real.id]);assert.equal((await command(db,USERS.staff,'phone.lookup',{phone:'anonymous'})).match,'withheld');
});


test('a later source address correction retains the original dossier and requests identity review separately from pricing',async t=>{
 const db=await fixture(t),r=consumer();await intake(db,envelope('consumer',r));const before=(await rows(db,'website_intakes'))[0],property=(await rows(db,'properties'))[0];const corrected={...r,customer:{...r.customer,notes:'New operational note'},quote:{...r.quote,address:{...r.quote.address,houseNumber:'6'}}};await intake(db,envelope('consumer',corrected,2));const after=(await rows(db,'website_intakes'))[0];assert.equal(after.organization_id,before.organization_id);assert.equal(after.property_id,property.id);assert.equal(after.identity_review,true);assert.equal(after.financial_review,false);assert.equal((await rows(db,'properties'))[0].address,'Voorbeeldstraat 4');assert.equal(after.record.quote.address.houseNumber,'6');assert.equal((await rows(db,'external_appointments'))[0].state,'review');
});

test('closing a booking keeps its appointment cancelled while identity review remains visible',async t=>{
 const db=await fixture(t),r=consumer({status:'preparing',payment_id:null,payment_status:null});
 await intake(db,envelope('consumer',r));
 const corrected={...r,quote:{...r.quote,address:{...r.quote.address,houseNumber:'6'}}};
 await intake(db,envelope('consumer',corrected,2));
 await intake(db,envelope('consumer',{...corrected,status:'not_created',close_code:'SLOT_UNAVAILABLE'},3));
 assert.equal((await rows(db,'external_appointments'))[0].state,'cancelled');
 assert.equal((await rows(db,'website_intakes'))[0].identity_review,true);
});
