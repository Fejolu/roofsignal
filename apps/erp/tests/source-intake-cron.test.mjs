import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHmac} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import {verifyErpDispatch} from '../../../supabase/functions/_shared/erp-dispatch-auth.mjs';

const filename=new URL('../../../supabase/migrations/20261013010000_erp_intake_cron.sql',import.meta.url);
const KEY='b'.repeat(64),JOB='roofsignal-erp-intake-every-minute';
const schema=`
 create role anon nologin;create role authenticated nologin;create role service_role nologin;
 create role hosted_net_owner nologin;
 create schema vault;create table vault.secrets(id uuid primary key default gen_random_uuid(),name text,secret text,description text);
 create view vault.decrypted_secrets as select id,name,secret as decrypted_secret from vault.secrets;
 create function vault.create_secret(new_secret text,new_name text default null,new_description text default '') returns uuid
 language sql as $$insert into vault.secrets(name,secret,description) values($2,$1,$3) returning id;$$;
 create function vault.update_secret(secret_id uuid,new_secret text default null,new_name text default null,new_description text default null)
 returns void language sql as $$update vault.secrets set secret=coalesce($2,secret),name=coalesce($3,name),description=coalesce($4,description) where id=$1;$$;
 create schema net;
 create table net.http_request_queue(id bigserial primary key,method text,url text,body bytea,headers jsonb,timeout_milliseconds integer);
 create table net._http_response(id bigint,status_code integer);
 grant usage on schema net to public;grant all on all tables in schema net to public;grant all on all sequences in schema net to public;
 create function net.http_post(url text,body jsonb default '{}',params jsonb default '{}',headers jsonb default '{}',timeout_milliseconds integer default 2000)
 returns bigint language sql volatile as $$
  insert into net.http_request_queue(method,url,body,headers,timeout_milliseconds) values('POST',$1,convert_to($2::text,'UTF8'),$4,$5) returning id;
 $$;
 alter table net.http_request_queue owner to hosted_net_owner;
 alter table net._http_response owner to hosted_net_owner;
 alter function net.http_post(text,jsonb,jsonb,jsonb,integer) owner to hosted_net_owner;
 alter schema net owner to hosted_net_owner;
 create schema cron;
 create table cron.job(jobid bigserial primary key,jobname text,username text not null default current_user,
  database text not null default current_database(),schedule text,command text,active boolean not null default true,unique(jobname,username));
 create function cron.schedule(jobname text,schedule text,command text) returns bigint language sql as $$
  insert into cron.job(jobname,schedule,command) values($1,$2,$3) on conflict(jobname,username)
   do update set schedule=excluded.schedule,command=excluded.command,active=true returning jobid;
 $$;
 create table public.erp_intake_outbox(source text default 'consumer',source_id uuid default gen_random_uuid(),
  status text not null default 'pending',next_attempt_at timestamptz not null default now(),locked_until timestamptz);
`;
let original;
const migration=source=>source.replace(/^create extension if not exists (?:pg_cron|pg_net)[^;]*;[ \t]*$/gm,'');
async function fixture(t,before) {
 const db=new PGlite({extensions:{pgcrypto}});t.after(()=>db.close());await db.exec(schema);if(before)await before(db);
 original ||=await readFile(filename,'utf8');
 // Only hosted cron/net are mocked with their native SQL signatures/ownership.
 // Actual pgcrypto, dispatcher, atomic nonce updates, locks and grants execute.
 await db.exec(migration(original));return db;
}
const dispatch=async db=>(await db.query('select roofsignal_erp_automation.dispatch_intakes() as value')).rows[0].value;
const requests=async db=>(await db.query("select id,method,url,convert_from(body,'UTF8') as body,headers,timeout_milliseconds from net.http_request_queue order by id")).rows;
const installKey=db=>db.query('insert into vault.secrets(name,secret) values($1,$2)',['roofsignal_erp_intake_key',KEY]);
const due=db=>db.exec('insert into public.erp_intake_outbox default values');
const removeQueued=db=>db.exec('delete from net.http_request_queue;update roofsignal_erp_automation.dispatch_state set next_dispatch_at=now()-interval \'1 second\'');
const consume=(db,nonce,timestamp)=>db.transaction(async tx=>{
 await tx.exec('set local role service_role');
 return(await tx.query('select public.consume_erp_intake_scheduler_nonce($1,$2) as value',[nonce,timestamp])).rows[0].value;
});
const capability=request=>({nonce:request.headers['x-roofsignal-dispatch-nonce'],timestamp:Number(request.headers['x-roofsignal-dispatch-timestamp'])});

test('idle dispatcher schedules one named minute job but performs no HTTP or secret lookup',async t=>{
 const db=await fixture(t);assert.equal(await dispatch(db),null);assert.deepEqual(await requests(db),[]);
 const [job]=(await db.query('select jobname,schedule,command,username from cron.job')).rows;
 assert.deepEqual(job,{jobname:JOB,schedule:'* * * * *',command:'select roofsignal_erp_automation.dispatch_intakes();',username:'postgres'});
 assert.ok(!job.command.includes(KEY));
});

test('due work queues only a fixed empty drain, signed by actual pgcrypto without the long-term key',async t=>{
 const db=await fixture(t);await installKey(db);await due(db);
 const id=await dispatch(db),[request]=await requests(db);
 assert.equal(id,request.id);assert.equal(request.url,'https://kakpticlxlaxtebhsuoh.supabase.co/functions/v1/process-erp-intakes');
 assert.equal(request.method,'POST');assert.equal(request.body,'{}');assert.equal(request.timeout_milliseconds,45000);
 assert.deepEqual(Object.keys(request.headers).sort(),['Content-Type','x-roofsignal-dispatch-nonce','x-roofsignal-dispatch-signature','x-roofsignal-dispatch-timestamp'].sort());
 const {nonce,timestamp}=capability(request);
 const expected=createHmac('sha256',Buffer.from(KEY,'hex')).update(timestamp+'.erp-drain:v1.'+nonce+'.{}').digest('hex');
 assert.equal(request.headers['x-roofsignal-dispatch-signature'],expected);
 assert.ok(!JSON.stringify(request).includes(KEY));
 const state=(await db.query('select * from roofsignal_erp_automation.dispatch_state')).rows[0];assert.equal(state.last_request_id,id);
 assert.ok(new Date(state.next_dispatch_at)-new Date(state.last_dispatched_at)===45000);
 assert.equal(state.nonce,nonce);assert.equal(Number(state.signed_timestamp),timestamp);assert.equal(state.consumed_at,null);
 assert.equal(new Date(state.expires_at).getTime(),(timestamp+60)*1000);
});

test('overlap, throttling and a stalled network queue cannot accumulate duplicate dispatches',async t=>{
 const db=await fixture(t);await installKey(db);await due(db);await dispatch(db);
 assert.equal(await dispatch(db),null);assert.equal((await requests(db)).length,1);
 await db.exec("update roofsignal_erp_automation.dispatch_state set next_dispatch_at=now()-interval '1 minute'");
 assert.equal(await dispatch(db),null);assert.equal((await requests(db)).length,1);
 const {nonce,timestamp}=capability((await requests(db))[0]);
 await removeQueued(db);assert.equal(await dispatch(db),null); // still-live capability remains usable exactly once
 assert.equal(await consume(db,nonce,timestamp),true);
 assert.ok(await dispatch(db));assert.equal((await requests(db)).length,1);
});

test('retry due dates and active worker leases control eligibility; no delivered/review records are sent',async t=>{
 const db=await fixture(t);await installKey(db);
 await db.exec("insert into public.erp_intake_outbox(status,next_attempt_at,locked_until) values('delivered',now(),null),('review',now(),null),('pending',now()+interval '1 hour',null),('processing',now(),now()+interval '1 minute')");
 assert.equal(await dispatch(db),null);assert.equal((await requests(db)).length,0);
 await db.exec("update public.erp_intake_outbox set locked_until=now()-interval '1 second' where status='processing'");
 assert.ok(await dispatch(db));assert.equal((await requests(db)).length,1);
});

test('missing, malformed or duplicate named Vault credentials fail closed without HTTP or secret-bearing errors',async t=>{
 const db=await fixture(t);await due(db);
 for(const entries of [[],[['other-secret',KEY]],[['roofsignal_erp_intake_key','not-a-key']],[['roofsignal_erp_intake_key',KEY],['roofsignal_erp_intake_key',KEY]]]) {
  await db.exec('delete from vault.secrets');
  for(const values of entries)await db.query('insert into vault.secrets(name,secret) values($1,$2)',values);
  await assert.rejects(dispatch(db),error=>{assert.equal(error.message,'ERP_DISPATCH_KEY_REQUIRED');assert.ok(!error.message.includes(KEY));return true;});
  assert.equal((await requests(db)).length,0);
 }
});

test('private key/state/dispatcher stay inaccessible while hosted PUBLIC net grants expose only a bounded capability',async t=>{
 const db=await fixture(t);await installKey(db);await due(db);await dispatch(db);
 for(const role of ['anon','authenticated','service_role']) {
  for(const sql of ['select roofsignal_erp_automation.dispatch_intakes()',
   'select * from roofsignal_erp_automation.dispatch_state','select * from vault.decrypted_secrets'])
   await assert.rejects(db.transaction(async tx=>{await tx.exec('set local role '+role);await tx.query(sql);}),/permission denied/);
  const readable=await db.transaction(async tx=>{await tx.exec('set local role '+role);return(await tx.query('select headers from net.http_request_queue')).rows;});
  assert.equal(readable.length,1);assert.ok(!JSON.stringify(readable).includes(KEY));
 }
 assert.equal((await db.query("select tableowner from pg_tables where schemaname='net' and tablename='http_request_queue'")).rows[0].tableowner,'hosted_net_owner');
 await assert.rejects(db.query('select roofsignal_erp_automation.dispatch_intakes($1)',['https://attacker.invalid']),/does not exist/);
});

test('reapplying preserves the named paused job, its state, and unrelated jobs',async t=>{
 const db=await fixture(t);await installKey(db);await due(db);await dispatch(db);
 await db.query("select cron.schedule('unrelated-job','0 0 * * *','select 1;')");
 await db.query('update cron.job set active=false where jobname=$1',[JOB]);
 const before=(await db.query('select * from cron.job order by jobname')).rows;
 const state=(await db.query('select * from roofsignal_erp_automation.dispatch_state')).rows;
 await db.exec(migration(original));
 assert.deepEqual((await db.query('select * from cron.job order by jobname')).rows,before);
 assert.deepEqual((await db.query('select * from roofsignal_erp_automation.dispatch_state')).rows,state);
});

test('a conflicting same-name job is rejected; no other job is replaced',async t=>{
 const db=new PGlite({extensions:{pgcrypto}});t.after(()=>db.close());await db.exec(schema);
 await db.query('select cron.schedule($1,$2,$3)',[JOB,'* * * * *','select 2;']);
 const source=await readFile(filename,'utf8');
 await assert.rejects(db.exec(migration(source)),/ERP_SCHEDULER_JOB_CONFLICT/);
 await db.exec('rollback');
 assert.equal((await db.query('select command from cron.job')).rows[0].command,'select 2;');
});

test('service-only bounded provisioning creates or rotates exactly one named secret without echoing or changing jobs',async t=>{
 const db=await fixture(t);
 await db.query('insert into vault.secrets(name,secret) values($1,$2)',['unrelated-consumer-key','leave-private']);
 const provide=key=>db.transaction(async tx=>{await tx.exec('set local role service_role');return(await tx.query('select public.set_erp_intake_scheduler_secret($1) as value',[key])).rows[0].value;});
 assert.equal(await provide(KEY),true);const before=(await db.query("select id from vault.secrets where name='roofsignal_erp_intake_key'")).rows[0].id;
 assert.equal(await provide(KEY),true);assert.equal(await provide('c'.repeat(64)),true);
 const items=(await db.query('select id,name,secret from vault.secrets order by name')).rows;
 assert.equal(items.length,2);assert.equal(items.find(item=>item.name==='roofsignal_erp_intake_key').id,before);
 assert.equal(items.find(item=>item.name==='roofsignal_erp_intake_key').secret,'c'.repeat(64));
 assert.equal(items.find(item=>item.name==='unrelated-consumer-key').secret,'leave-private');
 assert.equal((await db.query('select count(*)::integer as n from cron.job')).rows[0].n,1);
 assert.equal((await requests(db)).length,0);
 for(const role of ['anon','authenticated'])await assert.rejects(db.transaction(async tx=>{
  await tx.exec('set local role '+role);await tx.query('select public.set_erp_intake_scheduler_secret($1)',[KEY]);
 }),/permission denied/);
});

test('secret provisioning rejects malformed values and duplicate Vault names with safe fixed errors',async t=>{
 const db=await fixture(t);
 for(const invalid of [null,'','z'.repeat(64),'A'.repeat(64),'a'.repeat(63),'a'.repeat(65),'https://attacker.invalid']) {
  await assert.rejects(db.query('select public.set_erp_intake_scheduler_secret($1)',[invalid]),error=>{
   assert.equal(error.message,'ERP_SCHEDULER_SECRET_INVALID');return true;
  });
 }
 assert.equal((await db.query('select count(*)::integer as n from vault.secrets')).rows[0].n,0);
 await installKey(db);await installKey(db);
 await assert.rejects(db.query('select public.set_erp_intake_scheduler_secret($1)',[KEY]),/ERP_SCHEDULER_SECRET_CONFLICT/);
 await assert.rejects(db.query('select public.set_erp_intake_scheduler_secret($1,$2)',[KEY,'arbitrary-name']),/does not exist/);
});

test('an already queued call for this exact worker suppresses dispatch; other endpoints do not',async t=>{
 const db=await fixture(t);await installKey(db);await due(db);
 await db.query('insert into net.http_request_queue(url) values($1)',['https://another.invalid/endpoint']);
 assert.ok(await dispatch(db));assert.equal((await requests(db)).length,2);
 await db.exec("update roofsignal_erp_automation.dispatch_state set next_dispatch_at=now()-interval '1 minute',last_request_id=null");
 assert.equal(await dispatch(db),null);assert.equal((await requests(db)).length,2);
});

test('PostgreSQL-issued capability passes the receiver and exactly one service-role consume wins',async t=>{
 const db=await fixture(t);await installKey(db);await due(db);await dispatch(db);
 const [queued]=await requests(db),{nonce,timestamp}=capability(queued);
 const verified=await verifyErpDispatch(new Request(queued.url,{method:'POST',headers:queued.headers,body:queued.body}),KEY,{now:()=>timestamp*1000});
 assert.deepEqual(verified,{nonce,timestamp});
 const winners=await Promise.all([consume(db,nonce,timestamp),consume(db,nonce,timestamp),consume(db,nonce,timestamp)]);
 assert.equal(winners.filter(Boolean).length,1);
 assert.equal(await consume(db,nonce,timestamp),false);
 const state=(await db.query('select consumed_at from roofsignal_erp_automation.dispatch_state')).rows[0];
 assert.ok(state.consumed_at);
 for(const role of ['anon','authenticated'])await assert.rejects(db.transaction(async tx=>{
  await tx.exec('set local role '+role);await tx.query('select public.consume_erp_intake_scheduler_nonce($1,$2)',[nonce,timestamp]);
 }),/permission denied/);
});

test('unknown, mismatched and expired nonce attempts cannot consume an active capability',async t=>{
 const db=await fixture(t);await installKey(db);await due(db);await dispatch(db);
 const {nonce,timestamp}=capability((await requests(db))[0]);
 for(const [attempt,stamp] of [['10000000-0000-0000-0000-000000000001',timestamp],[nonce,timestamp-1],[null,timestamp],[nonce,null]])
  assert.equal(await consume(db,attempt,stamp),false);
 assert.equal((await db.query('select consumed_at from roofsignal_erp_automation.dispatch_state')).rows[0].consumed_at,null);
 await db.exec("update roofsignal_erp_automation.dispatch_state set expires_at=clock_timestamp()-interval '1 second'");
 assert.equal(await consume(db,nonce,timestamp),false);
 assert.equal((await db.query('select consumed_at from roofsignal_erp_automation.dispatch_state')).rows[0].consumed_at,null);
});

test('a timed-out capability is replaced for retry and its previous signature never consumes the new one',async t=>{
 const db=await fixture(t);await installKey(db);await due(db);await dispatch(db);
 const old=capability((await requests(db))[0]);
 await removeQueued(db);await db.exec("update roofsignal_erp_automation.dispatch_state set expires_at=clock_timestamp()-interval '1 second'");
 assert.ok(await dispatch(db));const current=capability((await requests(db))[0]);assert.notEqual(old.nonce,current.nonce);
 assert.equal(await consume(db,old.nonce,old.timestamp),false);assert.equal(await consume(db,current.nonce,current.timestamp),true);
});
