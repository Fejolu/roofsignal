import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,stat,rm,chmod} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createOwnerActivation,retireFixtures,OWNER_PROJECT,OWNER_ORIGIN,OWNER_EMAIL} from '../scripts/account-admin.mjs';
import {openDatabase,command} from '../src/database.mjs';
import {cloudSmoke} from '../scripts/cloud-smoke.mjs';

const OWNER='b2345678-0000-4000-8000-000000000001',TOKEN='a'.repeat(64);
const IDS=['f2345678-0000-4000-8000-000000000001','f2345678-0000-4000-8000-000000000002','f2345678-0000-4000-8000-000000000003'];
const ORGS=['e2345678-0000-4000-8000-000000000001','e2345678-0000-4000-8000-000000000002'];
const config={testProjectRef:OWNER_PROJECT,url:`https://${OWNER_PROJECT}.supabase.co`,origin:OWNER_ORIGIN,
  publishableKey:'sb_publishable_mock',storageKey:'sb_secret_mock',sessionSecret:'1'.repeat(64)};
async function setup(t,overrides={}) {
  const directory=await mkdtemp(path.join(tmpdir(),'erp-account-test-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const configPath=path.join(directory,'config.json');await writeFile(configPath,JSON.stringify({...config,...overrides}),{mode:0o600});
  return {directory,configPath};
}
function harness({existing=null,generatedUser={id:OWNER,email:OWNER_EMAIL},failProvider=false}={}) {
  let person=existing;const calls=[],queries=[];
  return {calls,queries,dependencies:{query:async (sql,marker)=>{
    queries.push(sql);
    if(marker==='owner_identity')return person?[{...person}]:[];
    if(marker==='owner_authorized'||marker==='fixtures_retired')return true;
    throw new Error('Unexpected SQL marker');
  },fetch:async (url,options)=>{
    const body=options.body?JSON.parse(options.body):null;calls.push({url,options,body});
    if(failProvider)throw new Error('Secret provider URL and token MUST NOT LEAK');
    if(url.endsWith('/admin/generate_link')) {
      person={...generatedUser,confirmed:false,deleted:false,anonymous:false,banned:false};
      return Response.json({user:generatedUser,hashed_token:TOKEN,action_link:'SECRET_CAPABILITY_URL'});
    }
    const id=url.split('/').at(-1),role=IDS.indexOf(id);
    return Response.json({id,email:`roofsignal-erp.${['staff','customer-a','customer-b'][role]}.${'a'.repeat(16)}@example.invalid`,banned_until:'2126-10-12T00:00:00Z'});
  }}};
}
const owner={id:OWNER,email:OWNER_EMAIL,confirmed:true,deleted:false,anonymous:false,banned:false};

test('new owner invitation stores only hash privately and grants exact UUID without email/password',async t=>{
  const env=await setup(t),h=harness();
  const result=await createOwnerActivation({...env,email:OWNER_EMAIL,authorize:true,dependencies:h.dependencies});
  assert.equal(result.status,'invitation-ready');assert.equal(h.calls.length,1);
  assert.deepEqual(h.calls[0].body,{type:'invite',email:OWNER_EMAIL,data:{full_name:'Ferry Joosten'},redirect_to:OWNER_ORIGIN+'/auth/callback'});
  assert.equal(h.calls[0].options.headers.Authorization,undefined);
  const file=JSON.parse(await readFile(result.activationFile,'utf8'));
  assert.equal(file.token_hash,TOKEN);assert.equal(file.authorized,true);assert.equal(file.user_id,OWNER);
  assert.equal(file.action_link,undefined);assert.equal(file.password,undefined);
  assert.equal((await stat(result.activationFile)).mode&0o077,0);
  const sql=h.queries.find(source=>source.includes('insert into erp.staff'));
  assert.match(sql,new RegExp(OWNER));assert.match(sql,/administrator/);assert.doesNotMatch(sql,/app_metadata|user_metadata|auth\.users set/);
  assert.doesNotMatch(JSON.stringify(result),new RegExp(TOKEN+'|SECRET_CAPABILITY_URL'));
});

test('verified existing owner retains password and receives no invite or reset request',async t=>{
  const env=await setup(t),h=harness({existing:owner});
  const result=await createOwnerActivation({...env,email:OWNER_EMAIL,authorize:true,dependencies:h.dependencies});
  assert.equal(result.status,'existing-account-ready');assert.equal(h.calls.length,0);assert.equal(result.activationFile,undefined);
});

test('unconfirmed invitation retry reuses private hash; reissue explicitly generates only invite',async t=>{
  const env=await setup(t),h=harness();
  await createOwnerActivation({...env,email:OWNER_EMAIL,authorize:true,dependencies:h.dependencies});
  await createOwnerActivation({...env,email:OWNER_EMAIL,authorize:true,dependencies:h.dependencies});assert.equal(h.calls.length,1);
  await createOwnerActivation({...env,email:OWNER_EMAIL,authorize:true,reissue:true,dependencies:h.dependencies});assert.equal(h.calls.length,2);
  assert.equal(h.calls[1].body.type,'invite');
});

test('wrong project, origin, key role, owner email and permissions fail before privilege calls',async t=>{
  for(const overrides of [{testProjectRef:'kakpticlxlaxtebhsuoh',url:'https://kakpticlxlaxtebhsuoh.supabase.co'},
    {origin:'https://www.roofsignal.nl'},{storageKey:'sb_publishable_wrong'}]) {
    const env=await setup(t,overrides),h=harness();
    await assert.rejects(()=>createOwnerActivation({...env,email:OWNER_EMAIL,authorize:true,dependencies:h.dependencies}));
    assert.equal(h.calls.length,0);assert.equal(h.queries.length,0);
  }
  const env=await setup(t),h=harness();
  await assert.rejects(()=>createOwnerActivation({...env,email:'another@roofsignal.nl',authorize:true,dependencies:h.dependencies}),{safeCode:'EXPLICIT_OWNER_EMAIL_REQUIRED'});
  await assert.rejects(()=>createOwnerActivation({...env,email:OWNER_EMAIL,dependencies:h.dependencies}),{safeCode:'OWNER_AUTHORIZATION_REQUIRED'});
  await chmod(env.configPath,0o644);
  await assert.rejects(()=>createOwnerActivation({...env,email:OWNER_EMAIL,authorize:true,dependencies:h.dependencies}),{safeCode:'PRIVATE_FILE_REQUIRED'});
  assert.equal(h.queries.length,0);
});

test('returned invitation identity mismatch never grants role and provider errors are sanitized',async t=>{
  const env=await setup(t),h=harness({generatedUser:{id:OWNER,email:'wrong@example.com'}});
  await assert.rejects(()=>createOwnerActivation({...env,email:OWNER_EMAIL,authorize:true,dependencies:h.dependencies}),{safeCode:'INVITATION_BAD_RESPONSE'});
  assert.ok(!h.queries.some(source=>source.includes('insert into erp.staff')));
  const unavailable=harness({failProvider:true});
  await assert.rejects(()=>createOwnerActivation({...env,email:OWNER_EMAIL,authorize:true,dependencies:unavailable.dependencies}),error=>{
    assert.equal(error.safeCode,'ACCOUNT_PROVIDER_UNAVAILABLE');assert.doesNotMatch(String(error),/Secret|token|URL/);return true;
  });
});

async function fixtureFile(directory) {
  const fixtures={version:1,testProjectRef:OWNER_PROJECT,users:{},current:{dossiers:{}}};
  for(const [index,key] of ['staff','customerA','customerB'].entries())fixtures.users[key]={id:IDS[index],email:`roofsignal-erp.${['staff','customer-a','customer-b'][index]}.${'a'.repeat(16)}@example.invalid`,password:'PRIVATE_FIXTURE_PASSWORD'};
  for(const [index,key] of ['customerA','customerB'].entries())fixtures.current.dossiers[key]={organization_id:ORGS[index]};
  const file=path.join(directory,'fixtures.json');await writeFile(file,JSON.stringify(fixtures),{mode:0o600});return {file,fixtures};
}

test('retirement revokes exactly known identities and two orgs before bans, preserving history',async t=>{
  const env=await setup(t),{file}=await fixtureFile(env.directory),h=harness({existing:owner});
  const result=await retireFixtures({...env,ownerEmail:OWNER_EMAIL,authorize:true,dependencies:h.dependencies});
  assert.equal(result.retired,true);assert.equal(result.historyPreserved,true);
  const sql=h.queries.find(source=>source.includes('update erp.staff'));
  for(const id of [...IDS,...ORGS])assert.ok(sql.includes(id));
  assert.match(sql,/insert into erp\.fixture_identities/);assert.match(sql,/erp\.sessions set revoked_at/);
  assert.doesNotMatch(sql,/delete from|drop|encrypted_password\s*=/i);
  assert.equal(h.calls.length,3);assert.deepEqual(h.calls.map(call=>call.url.split('/').at(-1)),IDS);
  assert.ok(h.calls.every(call=>Object.keys(call.body).join(',')==='ban_duration'));
  const saved=JSON.parse(await readFile(file,'utf8'));assert.ok(saved.retired_at);assert.equal(saved.retired_auth_ids.length,3);
});

test('fixture retirement requires confirmed owner and exact .invalid known identities',async t=>{
  const env=await setup(t),{file,fixtures}=await fixtureFile(env.directory),h=harness({existing:{...owner,confirmed:false}});
  await assert.rejects(()=>retireFixtures({...env,ownerEmail:OWNER_EMAIL,authorize:true,dependencies:h.dependencies}),{safeCode:'VERIFIED_OWNER_REQUIRED'});
  assert.equal(h.calls.length,0);assert.ok(!h.queries.some(source=>source.includes('update erp.staff')));
  fixtures.users.customerA.email='actual@customer.com';await writeFile(file,JSON.stringify(fixtures),{mode:0o600});
  await assert.rejects(()=>retireFixtures({...env,ownerEmail:OWNER_EMAIL,authorize:true,dependencies:h.dependencies}),{safeCode:'FIXTURE_IDENTITY_INVALID'});
});

test('partial Auth retirement failure keeps durable SQL revocation and retired marker',async t=>{
  const env=await setup(t),{file}=await fixtureFile(env.directory),h=harness({existing:owner,failProvider:true});
  await assert.rejects(()=>retireFixtures({...env,ownerEmail:OWNER_EMAIL,authorize:true,dependencies:h.dependencies}),{safeCode:'ACCOUNT_PROVIDER_UNAVAILABLE'});
  assert.ok(h.queries.some(source=>source.includes('update erp.access_grants')));
  assert.ok(JSON.parse(await readFile(file,'utf8')).retired_at);
});

test('owner SQL executes against PostgreSQL and supplies only the exact explicit administrator',async t=>{
  const env=await setup(t),db=await openDatabase();t.after(()=>db.close());
  await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[OWNER,OWNER_EMAIL]);
  const query=async(source,marker)=>{
    const result=await db.exec(source);
    return result.flatMap(item=>item.rows||[]).find(row=>Object.hasOwn(row,marker))?.[marker];
  };
  const result=await createOwnerActivation({...env,email:OWNER_EMAIL,authorize:true,
    dependencies:{query,fetch:()=>{throw new Error('Existing owner must not call Auth');}}});
  assert.equal(result.status,'existing-account-ready');
  const snapshot=await command(db,OWNER,'snapshot');assert.equal(snapshot.staff_role,'administrator');assert.equal(snapshot.permissions.manage_access,true);
  assert.deepEqual((await db.query('select user_id,name from erp.people where user_id=$1',[OWNER])).rows,
    [{user_id:OWNER,name:'Ferry Joosten'}]);
  await createOwnerActivation({...env,email:OWNER_EMAIL,authorize:true,
    dependencies:{query,fetch:()=>{throw new Error('Existing owner must not call Auth');}}});
  assert.deepEqual((await db.query("select actor_id,entity_id,action from erp.audit_events where action='owner.bootstrap'")).rows,
    [{actor_id:OWNER,entity_id:OWNER,action:'owner.bootstrap'}]);
});

test('retirement SQL preserves records and grants for a real owner while closing exact fixtures',async t=>{
  const env=await setup(t),{file,fixtures}=await fixtureFile(env.directory),db=await openDatabase();t.after(()=>db.close());
  await db.exec('alter table auth.users add column encrypted_password text');
  await db.query('insert into auth.users(id,email,email_confirmed_at,encrypted_password) values($1,$2,now(),$3)',[OWNER,OWNER_EMAIL,'fake-hash-for-test']);
  await db.query("insert into erp.staff values($1,'administrator',true)",[OWNER]);
  for(const person of Object.values(fixtures.users))await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[person.id,person.email]);
  await db.query("insert into erp.staff values($1,'administrator',true)",[IDS[0]]);
  for(const [index,id] of ORGS.entries())await db.query("insert into erp.organizations(id,name,kind,email) values($1,'Fixture','private',$2)",[id,fixtures.users[['customerA','customerB'][index]].email]);
  await db.query("insert into erp.access_grants(user_id,organization_id,role) values($1,$2,'reader')",[IDS[1],ORGS[0]]);
  await db.query("insert into erp.sessions(session_hash,user_id,purpose,expires_at) values($1,$2,'login',now()+interval '1 hour')",['a'.repeat(64),IDS[0]]);
  const h=harness({existing:owner});
  const query=async(source,marker)=>{
    const result=await db.exec(source);return result.flatMap(item=>item.rows||[]).find(row=>Object.hasOwn(row,marker))?.[marker];
  };
  await retireFixtures({...env,ownerEmail:OWNER_EMAIL,authorize:true,dependencies:{...h.dependencies,query}});
  assert.equal((await db.query('select count(*)::int as n from erp.organizations')).rows[0].n,2);
  assert.equal((await db.query('select count(*)::int as n from erp.fixture_identities')).rows[0].n,3);
  assert.equal((await db.query('select active from erp.staff where user_id=$1',[IDS[0]])).rows[0].active,false);
  assert.equal((await db.query('select active from erp.staff where user_id=$1',[OWNER])).rows[0].active,true);
  assert.equal((await command(db,OWNER,'snapshot')).organizations.length,0);
  assert.equal((await db.query('select revoked_at is not null as revoked from erp.access_grants')).rows[0].revoked,true);
  assert.equal((await db.query('select revoked_at is not null as revoked from erp.sessions')).rows[0].revoked,true);
  assert.ok(JSON.parse(await readFile(file,'utf8')).retirement_completed_at);
  await retireFixtures({...env,ownerEmail:OWNER_EMAIL,authorize:true,dependencies:{...h.dependencies,query}});
  assert.deepEqual((await db.query("select actor_id,entity_id from erp.audit_events where action='fixtures.retire' order by entity_id")).rows,
    ORGS.map(entity_id=>({actor_id:OWNER,entity_id})));
});

test('retired fixture marker blocks provisioning before any provider call or database query',async t=>{
  const env=await setup(t,{origin:'http://127.0.0.1:8789'}),{file,fixtures}=await fixtureFile(env.directory);
  fixtures.retired_at=new Date().toISOString();await writeFile(file,JSON.stringify(fixtures),{mode:0o600});
  await assert.rejects(()=>cloudSmoke({...env,provision:true}),{safeCode:'FIXTURES_HAVE_BEEN_RETIRED'});
});
