import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { vveIntakeDetails } from '../../../supabase/functions/_shared/vve-intake.mjs';

const schema = `
 create role anon nologin;create role authenticated nologin;create role service_role nologin;
 create table public.consumer_quotes(id uuid primary key,mode text,address jsonb,destination text,
  thermal boolean,inspection_type text,pricing_version text,travel_cents integer,total_cents integer,
  distance_meters integer,travel_description text,terms_version text,policy_version text,campaign text,
  route jsonb,created_at timestamptz default now());
 create table public.consumer_attempts(id uuid primary key,quote_id uuid,mode text,reference text,status text,
  close_code text,payment_id text,payment_status text,calendar_event_id text,customer jsonb,terms jsonb,
  terms_accepted_at timestamptz,slot_start timestamptz,slot_end timestamptz,
  created_at timestamptz default now(),updated_at timestamptz default now(),
  preparation_only boolean default false,test_released_at timestamptz,status_token text,
  checkout_url text,payment_payload jsonb,lease_token uuid,locked_until timestamptz,last_error text);
 create table public.parken_bookings(id uuid primary key,reference text,name text,email text,phone text,
  street text,house_number text,postcode text,slot_date date,slot_time text,notes text,status text,source text,
  terms_accepted_at timestamptz,early_start_requested_at timestamptz,thermography_interest_at timestamptz,
  thermography_selected boolean default false,offer_version text,inspection_excl_cents integer,
  thermography_excl_cents integer,total_incl_cents integer,terms_version text,
  created_at timestamptz default now(),updated_at timestamptz default now(),confirmation_sent_at timestamptz,
  organization_id uuid,property_id uuid,appointment_id uuid,inspection_id uuid);
 create table public.lead_requests(id uuid primary key,request_type text,name text,organization text,email text,
  segment text,postcode text,object_complexity text,site_access text,scope text,message text,status text,
  source_path text,created_at timestamptz default now());
`;
const migration = new URL('../../../supabase/migrations/20261012223000_erp_intake_outbox.sql', import.meta.url);
async function fixture(t, before) {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(schema); if (before) await before(db);
  await db.exec(await readFile(migration, 'utf8')); return db;
}
async function insert(db, table, row) {
  const keys = Object.keys(row);
  await db.query(`insert into public.${table}(${keys.join(',')}) values(${keys.map((_,i)=>'$'+(i+1)).join(',')})`,
    Object.values(row).map(value => value && typeof value === 'object' ? JSON.stringify(value) : value));
  return row.id;
}
async function consumer(db, changes = {}) {
  const quoteId = randomUUID(), id = randomUUID();
  await insert(db, 'consumer_quotes', { id: quoteId, mode: 'live', address: {
    postcode: '7316BH', houseNumber: '4', street: 'Teststraat', city: 'Apeldoorn', country: 'NL', provider_secret: 'must stay private',
  }, destination: 'Teststraat 4, Apeldoorn', inspection_type: 'building_envelope', thermal: true,
  pricing_version: '2026-10-11-equal-standalone', travel_cents: 0, total_cents: 66429, distance_meters: 4000,
  travel_description: 'Inbegrepen', terms_version: 'v1', policy_version: 'policy-v1', route: { key: 'route-secret' } });
  return insert(db, 'consumer_attempts', { id, quote_id: quoteId, mode: 'live', reference: 'RS-' + id.replaceAll('-','').toUpperCase(),
    status: 'payment_pending', payment_id: 'tr_123', payment_status: 'open',
    customer: { name: 'Testklant', email: 'test@example.invalid', phone: '0612345678', notes: 'Vraag', secret: 'must stay private' },
    terms: { version: 'v1', accepted: true, earlyStartRequested: true, secret: 'must stay private' },
    terms_accepted_at: '2026-10-12T20:00:00Z', slot_start: '2026-10-20T09:00:00Z', slot_end: '2026-10-20T09:45:00Z',
    status_token: 'private-token', checkout_url: 'https://payment.invalid/private', payment_payload: { key: 'provider-secret' },
    ...changes });
}
const parken = (db, changes = {}) => insert(db, 'parken_bookings', {
  id: randomUUID(), reference: 'RS-PARKEN-' + randomUUID().slice(0,8).toUpperCase(), name: 'Pilotklant', email: 'pilot@example.invalid',
  phone: '0612345678', street: 'Teststraat', house_number: '4', postcode: '7316BH', slot_date: '2026-10-20', slot_time: '16:00-18:00',
  notes: '', status: 'confirmation_pending', source: 'de-parken-directmail-2026', terms_accepted_at: '2026-10-12T20:00:00Z', ...changes,
});
const vve = (db, changes = {}) => insert(db, 'lead_requests', {
  id: randomUUID(), request_type: 'price', name: 'Beheerder', organization: 'VvE Test', email: 'vve@example.invalid',
  segment: 'VvE / VvE-beheerder', postcode: '7316BH', scope: 'VvE-objectaanmelding — thermografie',
  message: 'Aantal adressen binnen het object: 10\nPrijsindicatie (geen definitieve offerte): €550 excl. btw',
  status: 'new', source_path: '/inspectie-boeken/', ...changes,
});
const queue = async db => (await db.query('select * from public.erp_intake_outbox order by source,source_id')).rows;
const service = async (db, sql, args = []) => db.transaction(async tx => {
  await tx.exec('set local role service_role'); return (await tx.query(sql,args)).rows;
});
const claim = (db, limit = 10) => service(db,'select * from public.claim_erp_intakes($1)',[limit]);
const ack = async (db,job) => (await service(db,'select public.ack_erp_intake($1,$2,$3,$4) as value',
  [job.source,job.source_id,job.revision,job.lock_token]))[0].value;

test('consumer export keeps authoritative price, consent, provider status and reference but excludes capabilities', async t => {
  const db = await fixture(t), id = await consumer(db), [entry] = await queue(db);
  assert.equal(entry.source_id,id); assert.equal(entry.revision,1);
  assert.equal(entry.record.payment_status,'open'); assert.equal(entry.record.status,'payment_pending');
  assert.equal(entry.record.quote.total_cents,66429); assert.equal(entry.record.quote.base_cents,36179);
  assert.equal(entry.record.quote.thermal_cents,30250); assert.equal(entry.record.terms.accepted,true);
  const encoded = JSON.stringify(entry.record);
  for (const forbidden of ['private-token','payment.invalid','provider-secret','route-secret','must stay private','status_token','lease_token'])
    assert.ok(!encoded.includes(forbidden),forbidden);
  assert.deepEqual(Object.keys(entry.record.customer).sort(),['email','name','notes','phone']);
});

test('preparation drafts, test payments, released test attempts and tombstones never enter the ERP queue', async t => {
  const db = await fixture(t);
  await consumer(db,{preparation_only:true,customer:null,terms:null,terms_accepted_at:null});
  await consumer(db,{mode:'test'}); await consumer(db,{test_released_at:'2026-10-12T20:00:00Z'});
  await consumer(db,{status:'not_created'}); await consumer(db,{terms_accepted_at:null});
  assert.equal((await queue(db)).length,0);
  const id = await consumer(db,{status:'failed',payment_status:'failed'});
  const [entry] = await queue(db); assert.equal(entry.source_id,id); assert.equal(entry.record.status,'failed');
});

test('semantic changes increment revision; lease heartbeats do not; older lease receipts cannot clear newer work', async t => {
  const db = await fixture(t), id = await consumer(db), [first] = await claim(db);
  await db.query("update consumer_attempts set lease_token=gen_random_uuid(),locked_until=now()+interval '1 minute',updated_at=now()+interval '1 second' where id=$1",[id]);
  assert.equal((await queue(db))[0].revision,1); assert.equal((await queue(db))[0].status,'processing');
  await db.query("update consumer_attempts set payment_status='paid',status='paid_review_required',updated_at=now() where id=$1",[id]);
  const pending = (await queue(db))[0]; assert.equal(pending.revision,2); assert.equal(pending.status,'pending'); assert.equal(pending.lock_token,null);
  assert.equal(await ack(db,first),false);
  const [second] = await claim(db); assert.equal(second.record.payment_status,'paid');
  assert.equal(await ack(db,second),true); assert.equal(await ack(db,second),false);
  const delivered = (await queue(db))[0]; assert.equal(delivered.delivered_revision,2); assert.ok(delivered.accepted_at);
  await db.query("update consumer_attempts set status='confirmed',calendar_event_id='event-1',updated_at=now() where id=$1",[id]);
  assert.equal((await queue(db))[0].revision,3); assert.equal((await queue(db))[0].delivered_revision,2);
});

test('historical thermal price remains unchanged rather than applying the new standalone tariff', async t => {
  const db = await fixture(t), id = await consumer(db), [entry] = await queue(db);
  await db.query("update consumer_quotes set inspection_type='thermal',pricing_version='2026-10-11-thermal-legacy',total_cents=30250 where id=$1",[entry.record.quote.id]);
  const updated = (await queue(db))[0]; assert.equal(updated.source_id,id); assert.equal(updated.revision,2);
  assert.equal(updated.record.quote.base_cents,0); assert.equal(updated.record.quote.thermal_cents,30250);
  assert.equal(updated.record.quote.total_cents,30250);
});

test('accepted attempt that becomes not_created closes its existing ERP identity; stale receipts cannot revive it', async t => {
  const db = await fixture(t), id = await consumer(db,{status:'preparing',payment_id:null,payment_status:null}), [earlier] = await claim(db);
  await db.query("update consumer_attempts set status='not_created',close_code='SLOT_UNAVAILABLE',updated_at=now() where id=$1",[id]);
  const [closed] = await queue(db); assert.equal(closed.revision,2); assert.equal(closed.status,'pending');
  assert.equal(closed.record.status,'not_created'); assert.equal(closed.record.close_code,'SLOT_UNAVAILABLE');
  assert.equal(closed.record.quote.total_cents,66429); assert.equal(closed.record.customer.email,'test@example.invalid');
  assert.equal(closed.record.payment_id,null); assert.equal(await ack(db,earlier),false);
  const [closure] = await claim(db); assert.equal(await ack(db,closure),true);
  await consumer(db,{preparation_only:true,customer:null,terms:null,terms_accepted_at:null,status:'not_created'});
  await consumer(db,{status:'not_created',close_code:'REQUEST_NOT_CREATED'});
  assert.equal((await queue(db)).length,1);
});

test('closing a known accepted identity retains its price, consent and provider evidence if source cleanup removed data', async t => {
  const db = await fixture(t), id = await consumer(db), [prior] = await queue(db);
  await db.query("update consumer_attempts set status='not_created',close_code='SLOT_UNAVAILABLE',quote_id=null,customer=null,terms=null,terms_accepted_at=null,payment_id=null,payment_status=null,updated_at=now() where id=$1",[id]);
  const [closed] = await queue(db); assert.equal(closed.revision,2); assert.equal(closed.record.status,'not_created');
  assert.deepEqual(closed.record.quote,prior.record.quote); assert.deepEqual(closed.record.terms,prior.record.terms);
  assert.deepEqual(closed.record.customer,prior.record.customer); assert.equal(closed.record.payment_id,'tr_123');
  assert.equal(closed.record.payment_status,'open'); assert.equal(closed.record.terms_accepted_at,prior.record.terms_accepted_at);
});

test('pilot options within one transaction collapse to the latest authoritative snapshot; payment is not fabricated', async t => {
  const db = await fixture(t); let id;
  await db.transaction(async tx => {
    id = await parken(tx);
    await tx.query("update parken_bookings set offer_version='parken-2026-09-17-thermography',inspection_excl_cents=29900,thermography_excl_cents=25000,total_incl_cents=66429,thermography_selected=true where id=$1",[id]);
    await tx.query("update parken_bookings set terms_version='2026-09-21' where id=$1",[id]);
  });
  const [entry] = await queue(db); assert.equal(entry.source_id,id); assert.equal(entry.revision,3);
  assert.equal(entry.record.terms_version,'2026-09-21'); assert.equal(entry.record.total_incl_cents,66429);
  assert.equal(entry.record.slot_time,'16:00-18:00'); assert.ok(!('payment_status' in entry.record));
  await parken(db,{reference:'RS-PARKEN-TEST-20260920'});
  assert.equal((await queue(db)).length,1);
  await parken(db,{name:'Test is een gewone achternaam'}); assert.equal((await queue(db)).length,2);
});

test('only VvE website price inquiries enter the queue; legacy message is retained without approved price/payment', async t => {
  const db = await fixture(t); const id = await vve(db);
  await vve(db,{request_type:'contact'}); await vve(db,{source_path:'/contact/'}); await vve(db,{segment:'Particulier'});
  const [entry] = await queue(db); assert.equal(entry.source,'vve'); assert.equal(entry.source_id,id);
  assert.equal(entry.record.intake_details,null); assert.match(entry.record.message,/geen definitieve offerte/);
  for (const field of ['payment_id','payment_status','total_cents','slot_start']) assert.ok(!(field in entry.record));
  await db.query("update lead_requests set status='contacted' where id=$1",[id]);
  assert.equal((await queue(db))[0].revision,2);
});

test('new VvE structured choices export a server-derived indication without changing legacy message or creating finance data', async t => {
  const db = await fixture(t);
  const details = vveIntakeDetails({type:'price',segment:'VvE / VvE-beheerder',source_path:'/inspectie-boeken/',
    vve_intake:{inspection_type:'thermal',thermal:true,address_count:10,object_scope:'single',
      object_address:'Teststraat 2–20',object_city:'Apeldoorn',phone:'',kvk_number:''}});
  await vve(db,{intake_details:details,message:'De oorspronkelijke klantvraag blijft staan.'});
  const [entry] = await queue(db); assert.deepEqual(entry.record.intake_details,details);
  assert.equal(entry.record.intake_details.price_indication.total_excl_cents,55000);
  assert.equal(entry.record.intake_details.price_indication.accepted,false);
  assert.equal(entry.record.message,'De oorspronkelijke klantvraag blijft staan.');
  assert.ok(!('payment_id' in entry.record)); assert.ok(!('approved_price' in entry.record));
});

test('lease expiry recovers interrupted delivery and retry codes/backoff stay bounded', async t => {
  const db = await fixture(t); await consumer(db); const [job] = await claim(db);
  assert.equal((await claim(db)).length,0);
  await db.query("update erp_intake_outbox set locked_until=now()-interval '1 second' where source_id=$1",[job.source_id]);
  const [reclaimed] = await claim(db); assert.notEqual(reclaimed.lock_token,job.lock_token); assert.equal(reclaimed.attempts,2);
  const [retry] = await service(db,'select public.retry_erp_intake($1,$2,$3,$4,$5,$6) as value',
    [reclaimed.source,reclaimed.source_id,reclaimed.revision,reclaimed.lock_token,'raw customer email must not be saved',false]);
  assert.equal(retry.value,true); const [pending] = await queue(db);
  assert.equal(pending.last_error,'TRANSPORT_FAILED'); assert.equal(pending.status,'pending'); assert.equal(pending.lock_token,null);
  assert.ok(new Date(pending.next_attempt_at).getTime()>Date.now());
  assert.equal((await claim(db)).length,0);
});

test('migration sends no historical data; bounded explicit backfill is idempotent and service-only', async t => {
  const db = await fixture(t,async db => {await consumer(db);await consumer(db);await consumer(db,{mode:'test'});});
  assert.equal((await queue(db)).length,0);
  const [a] = await service(db,"select public.backfill_erp_intakes('consumer',null,1) as value");
  assert.equal(a.value.processed,1); assert.equal(a.value.has_more,true);
  const [b] = await service(db,"select public.backfill_erp_intakes('consumer',$1,500) as value",[a.value.next_after]);
  assert.equal(b.value.has_more,false); assert.equal((await queue(db)).length,2);
  const [again] = await service(db,"select public.backfill_erp_intakes('consumer',null,500) as value");
  assert.equal(again.value.queued,0);
  for (const role of ['anon','authenticated']) {
    await assert.rejects(db.transaction(async tx => { await tx.exec(`set local role ${role}`); await tx.query('select * from public.erp_intake_outbox'); }),/permission denied/);
    await assert.rejects(db.transaction(async tx => { await tx.exec(`set local role ${role}`); await tx.query('select * from public.claim_erp_intakes(10)'); }),/permission denied/);
    await assert.rejects(db.transaction(async tx => { await tx.exec(`set local role ${role}`); await tx.query("select public.backfill_erp_intakes('consumer',null,10)"); }),/permission denied/);
  }
});
