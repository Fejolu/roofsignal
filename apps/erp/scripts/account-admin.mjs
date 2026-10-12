// Explicit owner setup and retirement of the three known ERP fixtures only.
// No email delivery, password generation, user deletion or secret output.
import {readFile,writeFile,stat,rename,mkdtemp,chmod,rm} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createSupabaseAdapter} from '../src/supabase-adapter.mjs';

export const OWNER_PROJECT='seyuhowazudrhgrbwtbk';
export const OWNER_ORIGIN='https://roofsignal-erp-test.pages.dev';
export const OWNER_EMAIL='ferry@roofsignal.nl';
const OWNER_NAME='Ferry Joosten',APP=fileURLToPath(new URL('../',import.meta.url));
const UUID=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const TOKEN_HASH=/^[A-Za-z0-9_-]{20,256}$/;
const FIXTURE_ROLES={staff:'staff',customerA:'customer-a',customerB:'customer-b'};
const fail=code=>Object.assign(new Error('De besloten accountinrichting is niet bevestigd.'),{safeCode:code});
const uuid=value=>{if(typeof value!=='string'||!UUID.test(value))throw fail('INVALID_ACCOUNT_ID');return value.toLowerCase();};
const quote=value=>"'"+value.replace(/'/g,"''")+"'";
const emailInput=value=>{
  if(typeof value!=='string'||value.trim().toLowerCase()!==OWNER_EMAIL)throw fail('EXPLICIT_OWNER_EMAIL_REQUIRED');
  return OWNER_EMAIL;
};
function found(value,key) {
  if(value&&typeof value==='object') {
    if(Object.hasOwn(value,key))return value[key];
    for(const child of Object.values(value)){const result=found(child,key);if(result!==undefined)return result;}
  }
}
async function privateJson(file,optional=false) {
  try {
    const details=await stat(file);
    if(!details.isFile()||(details.mode&0o077))throw fail('PRIVATE_FILE_REQUIRED');
    return JSON.parse(await readFile(file,'utf8'));
  }catch(error){if(optional&&error.code==='ENOENT')return null;throw error.safeCode?error:fail('PRIVATE_FILE_INVALID');}
}
async function savePrivate(file,value) {
  const temporary=file+'.'+randomUUID()+'.tmp';
  try {
    await writeFile(temporary,JSON.stringify(value,null,2)+'\n',{mode:0o600,flag:'wx'});
    await rename(temporary,file);await chmod(file,0o600);
  }finally{await rm(temporary,{force:true});}
}
async function environment(configPath,{query,fetch:fetcher=globalThis.fetch}={}) {
  if(typeof configPath!=='string'||!configPath)throw fail('PRIVATE_CONFIG_REQUIRED');
  configPath=path.resolve(configPath);const config=await privateJson(configPath);
  if(config.testProjectRef!==OWNER_PROJECT||config.url!==`https://${OWNER_PROJECT}.supabase.co`
    ||config.origin!==OWNER_ORIGIN)throw fail('PINNED_ERP_ENVIRONMENT_REQUIRED');
  // Check both configured key roles before any privileged query or request.
  createSupabaseAdapter({...config,redirectOrigin:config.origin});
  const headers={apikey:config.storageKey,'Content-Type':'application/json',
    ...(config.storageKey.startsWith('sb_secret_')?{}:{Authorization:`Bearer ${config.storageKey}`})};
  const directory=path.dirname(configPath);
  async function sql(source,marker) {
    if(query) {
      try{return await query(source,marker);}catch{throw fail('ACCOUNT_SQL_FAILED');}
    }
    const temporary=await mkdtemp(path.join(tmpdir(),'roofsignal-erp-account-'));await chmod(temporary,0o700);
    try {
      const file=path.join(temporary,'query.sql');await writeFile(file,source,{mode:0o600,flag:'wx'});
      let stdout;
      try {({stdout}=await promisify(execFile)('/opt/homebrew/bin/supabase',
        ['db','query','--linked','--project-ref',OWNER_PROJECT,'--file',file,'--output','json'],
        {cwd:APP,maxBuffer:2*1024*1024,timeout:90000,env:{...process.env,SUPABASE_TELEMETRY_DISABLED:'1'}}));}
      catch{throw fail('ACCOUNT_SQL_FAILED');}
      if(!marker)return;
      let result;try{result=JSON.parse(stdout);}catch{throw fail('ACCOUNT_SQL_BAD_RESPONSE');}
      const value=found(result,marker);if(value===undefined)throw fail('ACCOUNT_SQL_MARKER_MISSING');return value;
    }finally{await rm(temporary,{recursive:true,force:true});}
  }
  async function provider(endpoint,method='GET',body) {
    let response;
    try {response=await fetcher(config.url+endpoint,{method,headers,redirect:'error',cache:'no-store',
      signal:AbortSignal.timeout(20000),body:body===undefined?undefined:JSON.stringify(body)});}
    catch{throw fail('ACCOUNT_PROVIDER_UNAVAILABLE');}
    if(!response.ok)throw fail(`ACCOUNT_PROVIDER_HTTP_${response.status}`);
    try{return await response.json();}catch{throw fail('ACCOUNT_PROVIDER_BAD_RESPONSE');}
  }
  async function identity(email) {
    const rows=await sql(`select coalesce(jsonb_agg(jsonb_build_object('id',id,'email',email,
      'confirmed',email_confirmed_at is not null,'deleted',to_jsonb(u)->>'deleted_at' is not null,
      'anonymous',coalesce((to_jsonb(u)->>'is_anonymous')::boolean,false),
      'banned',coalesce((to_jsonb(u)->>'banned_until')::timestamptz > now(),false))), '[]'::jsonb)
      as owner_identity from auth.users u where lower(email)=${quote(email)};`,'owner_identity');
    if(!Array.isArray(rows)||rows.length>1)throw fail('OWNER_IDENTITY_AMBIGUOUS');
    if(!rows.length)return null;
    const person=rows[0];person.id=uuid(person.id);
    if(person.email?.toLowerCase()!==email||person.deleted||person.anonymous||person.banned)throw fail('OWNER_IDENTITY_UNAVAILABLE');
    return person;
  }
  return {configPath,directory,sql,provider,identity};
}

export async function createOwnerActivation({configPath,email,authorize=false,reissue=false,dependencies}={}) {
  if(!authorize)throw fail('OWNER_AUTHORIZATION_REQUIRED');
  email=emailInput(email);const env=await environment(configPath,dependencies);
  const activationPath=path.join(env.directory,'owner-activation.json');
  let person=await env.identity(email),activation=await privateJson(activationPath,true);
  if(activation&&(activation.version!==1||activation.projectRef!==OWNER_PROJECT||activation.origin!==OWNER_ORIGIN
    ||activation.email!==email||!UUID.test(activation.user_id||'')))throw fail('ACTIVATION_IDENTITY_MISMATCH');
  if(person&&activation&&person.id!==activation.user_id)throw fail('ACTIVATION_IDENTITY_MISMATCH');
  if(!person?.confirmed) {
    if(!activation||reissue) {
      // Native GoTrue response exposes hashed_token at the top level; SDK
      // wrappers may put it under properties. Neither full link is retained.
      const generated=await env.provider('/auth/v1/admin/generate_link','POST',{
        type:'invite',email,data:{full_name:OWNER_NAME},redirect_to:OWNER_ORIGIN+'/auth/callback'});
      const returned=generated.user||generated;
      const id=uuid(returned.id),token=generated.hashed_token||generated.properties?.hashed_token;
      if(returned.email?.toLowerCase()!==email||!TOKEN_HASH.test(token||''))throw fail('INVITATION_BAD_RESPONSE');
      if(person&&person.id!==id)throw fail('INVITATION_IDENTITY_MISMATCH');
      activation={version:1,projectRef:OWNER_PROJECT,origin:OWNER_ORIGIN,email,user_id:id,name:OWNER_NAME,
        type:'invite',token_hash:token,issued_at:new Date().toISOString(),authorized:false};
      await savePrivate(activationPath,activation);
      person=await env.identity(email);
      if(!person||person.id!==id)throw fail('INVITATION_IDENTITY_NOT_CONFIRMED');
    }else if(!person||person.id!==activation.user_id||!TOKEN_HASH.test(activation.token_hash||'')) {
      throw fail('INVITATION_CANNOT_BE_REUSED');
    }
  }
  // The SQL repeats the exact Auth binding in the same transaction as the
  // explicit ERP role. No Auth app_metadata/user_metadata role is assigned.
  const id=uuid(person.id);
  const authorized=await env.sql(`begin;
    do $owner$ begin
      perform pg_advisory_xact_lock(hashtextextended('roofsignal-owner-bootstrap:${id}',0));
      if not exists(select 1 from auth.users u where id='${id}' and lower(email)=${quote(email)}
        and to_jsonb(u)->>'deleted_at' is null and not coalesce((to_jsonb(u)->>'is_anonymous')::boolean,false)
        and not coalesce((to_jsonb(u)->>'banned_until')::timestamptz > now(),false))
      then raise exception 'Owner identity changed'; end if;
    end $owner$;
    insert into erp.people(user_id,name,phone) values('${id}',${quote(OWNER_NAME)},'')
      on conflict(user_id) do nothing;
    insert into erp.staff(user_id,role,active) values('${id}','administrator',true)
      on conflict(user_id) do update set role='administrator',active=true;
    insert into erp.audit_events(actor_id,action,entity_id)
      select '${id}','owner.bootstrap','${id}' where not exists(select 1 from erp.audit_events
        where actor_id='${id}' and action='owner.bootstrap' and entity_id='${id}');
    select true as owner_authorized;
    commit;`,'owner_authorized');
  if(authorized!==true)throw fail('OWNER_ROLE_NOT_CONFIRMED');
  if(activation){activation.authorized=true;if(person.confirmed){delete activation.token_hash;activation.activated_at=new Date().toISOString();}await savePrivate(activationPath,activation);}
  return {authorized:true,status:person.confirmed?'existing-account-ready':'invitation-ready',
    ...(person.confirmed?{}:{activationFile:activationPath}),project:OWNER_PROJECT};
}

export async function retireFixtures({configPath,ownerEmail,authorize=false,dependencies}={}) {
  if(!authorize)throw fail('FIXTURE_RETIREMENT_AUTHORIZATION_REQUIRED');
  ownerEmail=emailInput(ownerEmail);const env=await environment(configPath,dependencies);
  const fixturesPath=path.join(env.directory,'fixtures.json'),fixtures=await privateJson(fixturesPath);
  if(fixtures.version!==1||fixtures.testProjectRef!==OWNER_PROJECT||!fixtures.users||!fixtures.current?.dossiers)throw fail('KNOWN_FIXTURES_REQUIRED');
  const people=Object.entries(FIXTURE_ROLES).map(([key,role])=>{
    const person=fixtures.users[key];
    if(!person||!new RegExp(`^roofsignal-erp\\.${role}\\.[a-f0-9]{16}@example\\.invalid$`).test(person.email||''))throw fail('FIXTURE_IDENTITY_INVALID');
    return {id:uuid(person.id),email:person.email};
  });
  const organizations=['customerA','customerB'].map(key=>({id:uuid(fixtures.current.dossiers[key]?.organization_id),email:fixtures.users[key].email}));
  if(Object.keys(fixtures.users).length!==3||new Set(people.map(p=>p.id)).size!==3||new Set(organizations.map(o=>o.id)).size!==2)throw fail('KNOWN_FIXTURE_SET_REQUIRED');
  const owner=await env.identity(ownerEmail);
  if(!owner?.confirmed||people.some(person=>person.id===owner.id))throw fail('VERIFIED_OWNER_REQUIRED');
  const ids=people.map(p=>`'${p.id}'`).join(','),orgids=organizations.map(o=>`'${o.id}'`).join(',');
  // Revoke database access before Auth calls. Provider failure leaves already
  // retired accounts denied; a retry only finishes the missing Auth bans.
  const retired=await env.sql(`begin;
    do $retire$ begin
      perform pg_advisory_xact_lock(hashtextextended('roofsignal-fixtures-retirement',0));
      if not exists(select 1 from erp.staff s join auth.users u on u.id=s.user_id where s.user_id='${owner.id}'
        and s.role='administrator' and s.active and u.email_confirmed_at is not null
        and lower(u.email)=${quote(ownerEmail)} and to_jsonb(u)->>'deleted_at' is null
        and not coalesce((to_jsonb(u)->>'is_anonymous')::boolean,false)
        and not coalesce((to_jsonb(u)->>'banned_until')::timestamptz > now(),false)
        and coalesce(u.encrypted_password,'') <> '') then raise exception 'Active owner required'; end if;
      ${people.map(p=>`if not exists(select 1 from auth.users where id='${p.id}' and email=${quote(p.email)}) then raise exception 'Fixture binding changed'; end if;`).join('\n      ')}
      ${organizations.map(o=>`if not exists(select 1 from erp.organizations where id='${o.id}' and email=${quote(o.email)}) then raise exception 'Fixture object changed'; end if;`).join('\n      ')}
      if exists(select 1 from erp.website_intakes where organization_id in (${orgids}))
        or exists(select 1 from erp.website_parties where organization_id in (${orgids}))
        then raise exception 'Website records cannot be archived as fixtures'; end if;
    end $retire$;
    insert into erp.fixture_identities(user_id) values ${people.map(p=>`('${p.id}')`).join(',')} on conflict do nothing;
    update erp.organizations set is_fixture=true where id in (${orgids});
    update erp.staff set active=false where user_id in (${ids});
    update erp.access_grants set revoked_at=coalesce(revoked_at,now()) where user_id in (${ids});
    update erp.sessions set revoked_at=coalesce(revoked_at,now()) where user_id in (${ids});
    insert into erp.audit_events(actor_id,action,entity_id)
      select '${owner.id}','fixtures.retire',id from erp.organizations o where id in (${orgids})
        and not exists(select 1 from erp.audit_events a where a.actor_id='${owner.id}'
          and a.action='fixtures.retire' and a.entity_id=o.id);
    select true as fixtures_retired;
    commit;`,'fixtures_retired');
  if(retired!==true)throw fail('FIXTURE_REVOCATION_NOT_CONFIRMED');
  fixtures.retired_at ||=new Date().toISOString();fixtures.retired_auth_ids ||= [];await savePrivate(fixturesPath,fixtures);
  for(const person of people) {
    const result=await env.provider(`/auth/v1/admin/users/${person.id}`,'PUT',{ban_duration:'876000h'});
    const user=result.user||result;
    if(uuid(user.id)!==person.id||user.email!==person.email||!(new Date(user.banned_until).getTime()>Date.now()))throw fail('FIXTURE_AUTH_BAN_NOT_CONFIRMED');
    if(!fixtures.retired_auth_ids.includes(person.id))fixtures.retired_auth_ids.push(person.id);await savePrivate(fixturesPath,fixtures);
  }
  fixtures.retirement_completed_at=new Date().toISOString();await savePrivate(fixturesPath,fixtures);
  return {retired:true,accounts:3,organizations:2,historyPreserved:true,project:OWNER_PROJECT};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const [command,...args]=process.argv.slice(2);const values=new Map();
    for(let i=0;i<args.length;i++) {
      const key=args[i];if(values.has(key))throw fail('DUPLICATE_OPTION');
      if(['--authorize-owner','--reissue-invitation','--retire-known-fixtures'].includes(key))values.set(key,true);
      else if(['--config','--email','--owner-email'].includes(key)&&args[i+1]&&!args[i+1].startsWith('--'))values.set(key,args[++i]);
      else throw fail('INVALID_OPTION');
    }
    const result=command==='owner'?await createOwnerActivation({configPath:values.get('--config'),email:values.get('--email'),
      authorize:values.get('--authorize-owner')===true,reissue:values.get('--reissue-invitation')===true}):command==='retire-fixtures'?
      await retireFixtures({configPath:values.get('--config'),ownerEmail:values.get('--owner-email'),authorize:values.get('--retire-known-fixtures')===true}):(()=>{throw fail('INVALID_COMMAND');})();
    console.log(JSON.stringify(result));
  }catch(error){console.error(JSON.stringify({completed:false,code:error.safeCode||'ACCOUNT_SETUP_FAILED'}));process.exitCode=1;}
}
