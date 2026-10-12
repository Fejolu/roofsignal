// Explicit provisioning and real-provider smoke test for the isolated ERP only.
// Never runs on import, sends email, removes users, or prints credentials.
import {readFile,writeFile,chmod,stat,rename,mkdtemp,rm} from 'node:fs/promises';
import {randomBytes,randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createSupabaseAdapter} from '../src/supabase-adapter.mjs';
import {createSessionCookies} from '../src/session-cookie.mjs';
import {createHostedHandler} from '../src/hosted-handler.mjs';

const run=promisify(execFile),PRODUCTION='kakpticlxlaxtebhsuoh';
const APP=fileURLToPath(new URL('../',import.meta.url));
const UUID=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const FIXTURE_EMAIL=/^roofsignal-erp\.(staff|customer-a|customer-b)\.[a-f0-9]{16}@example\.invalid$/;
const fail=code=>Object.assign(new Error('De besloten ERP-proef is niet geslaagd.'),{safeCode:code});
const password=()=>`Rs1!${randomBytes(24).toString('base64url')}`;
const uuid=value=>{if(typeof value!=='string'||!UUID.test(value))throw fail('INVALID_FIXTURE_UUID');return value.toLowerCase();};
const jsonHeaders={'Content-Type':'application/json'};
function foundValue(value,key) {
  if(value&&typeof value==='object') {
    if(Object.hasOwn(value,key))return value[key];
    for(const child of Object.values(value)) {const found=foundValue(child,key);if(found!==undefined)return found;}
  }
}

// Deterministic, renderable one-page fixture. ASCII keeps byte positions exact
// across runtimes; this contains no customer details, dates or real findings.
export function createFixturePdf() {
  const literal=value=>'('+value.replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)')+')';
  const text=(font,size,x,y,value,color='0.07 0.09 0.08')=>`${color} rg\nBT /${font} ${size} Tf 1 0 0 1 ${x} ${y} Tm ${literal(value)} Tj ET\n`;
  const stream='q\n0.72 0.22 0.04 rg\n48 782 499 4 re f\n'
    +text('F2',23,48,743,'ROOFSIGNAL')
    +text('F1',10,48,721,'EIGEN ERP EN KLANTPORTAAL - TESTOMGEVING','0.32 0.36 0.34')
    +text('F2',19,48,664,'Fictief inspectierapport')
    +text('F1',11,48,639,'Dit document bevat uitsluitend fictieve testgegevens.')
    +text('F1',11,48,622,'Er is geen inspectie uitgevoerd.')
    +text('F2',12,48,566,'Testdoel')
    +text('F1',11,48,543,'Controleren dat alleen de juiste klant het vrijgegeven rapport')
    +text('F1',11,48,526,'kan downloaden vanuit het eigen objectdossier.')
    +text('F2',12,48,474,'Voorbeeldobject')
    +text('F1',11,48,451,'Voorbeeldgebouw - geen werkelijk klantadres.')
    +text('F2',12,48,399,'Fictieve bevinding')
    +text('F1',11,48,376,'Dakgoot: een testwaarneming voor de werking van het portaal.')
    +text('F1',11,48,359,'Deze tekst geeft geen oordeel over een bestaand gebouw.')
    +text('F2',12,48,307,'Rapportstatus')
    +text('F1',11,48,284,'Proefdocument. Niet gebruiken voor onderhoudsbeslissingen.')
    +'0.82 0.84 0.83 RG 0.5 w 48 88 m 547 88 l S\n'
    +text('F1',8,48,70,'RoofSignal ERP testomgeving | Geen klant- of inspectiedossier','0.32 0.36 0.34')
    +text('F1',8,532,70,'1 / 1','0.32 0.36 0.34')+'Q\n';
  const objects=[
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
    `<< /Length ${Buffer.byteLength(stream,'ascii')} >>\nstream\n${stream}endstream`,
  ];
  let pdf='%PDF-1.4\n';const offsets=[0];
  for(const [index,object] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf,'ascii'));pdf+=`${index+1} 0 obj\n${object}\nendobj\n`;
  }
  const xref=Buffer.byteLength(pdf,'ascii');
  pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;
  for(const offset of offsets.slice(1))pdf+=`${String(offset).padStart(10,'0')} 00000 n \n`;
  pdf+=`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf,'ascii');
}

export async function cloudSmoke({configPath,provision=false}={}) {
  if(!provision)throw fail('EXPLICIT_PROVISION_FLAG_REQUIRED');
  if(typeof configPath!=='string'||!configPath)throw fail('PRIVATE_CONFIG_REQUIRED');
  configPath=path.resolve(configPath);
  const mode=await stat(configPath);
  if(!mode.isFile()||(mode.mode&0o077)!==0)throw fail('CONFIG_MUST_BE_PRIVATE');
  const config=JSON.parse(await readFile(configPath,'utf8'));
  if(!/^[a-z]{20}$/.test(config.testProjectRef||'')||config.testProjectRef===PRODUCTION
    ||config.url!==`https://${config.testProjectRef}.supabase.co`||!config.storageKey
    ||config.origin!=='http://127.0.0.1:8789')throw fail('ISOLATED_TEST_CONFIG_REQUIRED');
  // Constructors validate both key roles, project pinning and cookie encryption
  // before the first CLI query or provider request.
  const adapter=createSupabaseAdapter({...config,redirectOrigin:config.origin});
  const cookies=createSessionCookies({secret:config.sessionSecret,origin:config.origin});
  const handler=createHostedHandler({adapter,cookies,origin:config.origin});
  const elevated={apikey:config.storageKey,...(config.storageKey.startsWith('sb_secret_')?{}:{Authorization:`Bearer ${config.storageKey}`})};
  const fixturesPath=path.join(path.dirname(configPath),'fixtures.json');
  const temp=await mkdtemp(path.join(tmpdir(),'roofsignal-erp-cloud-'));await chmod(temp,0o700);
  const checks=[],sessions=[];let stage='schema',fixtures;
  const checked=(condition,code)=>{if(!condition)throw fail(code);};
  async function saveFixtures() {
    const temporary=fixturesPath+'.'+randomUUID()+'.tmp';
    await writeFile(temporary,JSON.stringify(fixtures,null,2)+'\n',{mode:0o600,flag:'wx'});
    await rename(temporary,fixturesPath);await chmod(fixturesPath,0o600);
  }
  async function sql(source,marker) {
    const file=path.join(temp,randomUUID()+'.sql');await writeFile(file,source,{mode:0o600,flag:'wx'});
    let stdout;
    try {
      ({stdout}=await run('/opt/homebrew/bin/supabase',['db','query','--linked','--project-ref',config.testProjectRef,'--file',file,'--output','json'],
        {cwd:APP,maxBuffer:4*1024*1024,timeout:90000,env:{...process.env,SUPABASE_TELEMETRY_DISABLED:'1'}}));
    } catch {throw fail('TEST_SQL_FAILED');}
    finally {await rm(file,{force:true});}
    if(!marker)return;
    let result;try{result=JSON.parse(stdout);}catch{throw fail('TEST_SQL_BAD_RESPONSE');}
    const value=foundValue(result,marker);if(value===undefined)throw fail('TEST_SQL_MARKER_MISSING');return value;
  }
  async function provider(endpoint,{method='GET',body,headers=elevated}={}) {
    let response;
    try {response=await fetch(config.url+endpoint,{method,headers:{...headers,...jsonHeaders},body:body?JSON.stringify(body):undefined,
      redirect:'error',cache:'no-store',signal:AbortSignal.timeout(20000)});}catch{throw fail('TEST_PROVIDER_UNAVAILABLE');}
    if(!response.ok)throw fail(`TEST_PROVIDER_HTTP_${response.status}`);
    let result;try{result=await response.json();}catch{throw fail('TEST_PROVIDER_BAD_RESPONSE');}return result;
  }
  async function call(session,route,{method='POST',body,headers={}}={}) {
    const response=await handler(new Request(config.origin+route,{method,
      headers:{...(method==='POST'?{Origin:config.origin}:{}),...(session?.cookie?{Cookie:session.cookie}:{}),
        ...(body!==undefined&&!(body instanceof Uint8Array)?jsonHeaders:{}),...headers},
      body:body===undefined?undefined:body instanceof Uint8Array?body:JSON.stringify(body)}));
    const replacement=response.headers.get('set-cookie');if(replacement&&session)session.cookie=replacement.split(';')[0];
    return response;
  }
  async function login(person) {
    const session={cookie:''};let response;
    for(const candidate of [...new Set([person.pendingPassword,person.password].filter(Boolean))]) {
      response=await call(session,'/api/login',{body:{email:person.email,password:candidate}});
      if(response.status===200) {
        if(candidate===person.pendingPassword){person.password=candidate;delete person.pendingPassword;await saveFixtures();}
        checked(session.cookie.length>0,'LOGIN_COOKIE_MISSING');sessions.push(session);return session;
      }
      if(response.status!==401)break;
    }
    throw fail('VERIFIED_LOGIN_FAILED');
  }
  async function rpc(session,action,payload={}) {
    const response=await call(session,'/api/command',{body:{action,payload}});
    checked(response.status===200,'BUSINESS_RPC_FAILED');return response.json();
  }
  const write=(session,action,payload={})=>rpc(session,action,{request_id:randomUUID(),...payload});
  try {
    const foundation=await sql("select to_regclass('erp.staff') is not null as foundation_present;",'foundation_present');
    if(foundation!==true)await sql(await readFile(path.join(APP,'db/001_foundation.sql'),'utf8'));
    for(const name of ['002_telephony.sql','003_auth_and_documents.sql','004_private_storage.sql'])await sql(await readFile(path.join(APP,'db',name),'utf8'));
    checks.push('Afzonderlijke ERP-database en private PDF-opslag ingericht');
    stage='fictitious-accounts';
    try {
      const file=await stat(fixturesPath);checked((file.mode&0o077)===0,'FIXTURES_MUST_BE_PRIVATE');
      fixtures=JSON.parse(await readFile(fixturesPath,'utf8'));
      checked(fixtures.version===1&&fixtures.testProjectRef===config.testProjectRef&&fixtures.users,'FIXTURES_PROJECT_MISMATCH');
    } catch(error) {
      if(error.code!=='ENOENT')throw error;
      fixtures={version:1,testProjectRef:config.testProjectRef,created_at:new Date().toISOString(),users:{}};await saveFixtures();
    }
    for(const [key,label,emailRole] of [['staff','RoofSignal proefmedewerker','staff'],['customerA','Contact VvE Voorbeeldhof','customer-a'],['customerB','Contact Demowoning','customer-b']]) {
      if(!fixtures.users[key]) {
        fixtures.users[key]={name:label,email:`roofsignal-erp.${emailRole}.${randomBytes(8).toString('hex')}@example.invalid`,password:password()};await saveFixtures();
      }
      const person=fixtures.users[key];checked(FIXTURE_EMAIL.test(person.email||'')&&person.email.startsWith(`roofsignal-erp.${emailRole}.`)
        &&typeof person.password==='string','INVALID_FICTITIOUS_IDENTITY');
      if(!person.id) {
        const existing=await sql(`select max(id::text) as fixture_user_id from auth.users where email='${person.email}';`,'fixture_user_id');
        if(existing)person.id=uuid(existing);
        else {
          const created=await provider('/auth/v1/admin/users',{method:'POST',body:{email:person.email,password:person.password,email_confirm:true,
            user_metadata:{full_name:label}}});
          person.id=uuid(created.id||created.user?.id);
        }
        await saveFixtures();
      }else person.id=uuid(person.id);
      const identity=await sql(`select count(*)::int as fixture_identity_verified from auth.users u where u.id='${uuid(person.id)}'
        and u.email='${person.email}' and u.email_confirmed_at is not null and to_jsonb(u)->>'deleted_at' is null
        and not coalesce((to_jsonb(u)->>'is_anonymous')::boolean,false);`,'fixture_identity_verified');
      checked(identity===1,'FIXTURE_IDENTITY_MISMATCH');
    }
    checked(new Set(Object.values(fixtures.users).map(person=>person.id)).size===3,'FIXTURE_IDENTITIES_MUST_DIFFER');
    await sql(`insert into erp.staff(user_id,role,active) values('${uuid(fixtures.users.staff.id)}','administrator',true)
      on conflict(user_id) do update set role='administrator',active=true;`);
    // A newly created RPC may not be visible until PostgREST processes NOTIFY.
    await new Promise(resolve=>setTimeout(resolve,1000));
    const staff=await login(fixtures.users.staff),a=await login(fixtures.users.customerA),b=await login(fixtures.users.customerB);
    const staffView=await rpc(staff,'snapshot');checked(staffView.staff===true&&staffView.staff_role==='administrator','STAFF_ROLE_NOT_EXPLICIT');
    checked((await rpc(a,'snapshot')).staff===false&&(await rpc(b,'snapshot')).staff===false,'CUSTOMER_PRIVILEGE_INCORRECT');
    checks.push('Drie echte, geverifieerde proefaccounts; expliciete medewerkerrechten');

    stage='fictitious-dossiers';const runId=randomUUID();
    fixtures.current={run_id:runId,created_at:new Date().toISOString(),dossiers:{}};await saveFixtures();
    async function dossier(key,person,name,kind,address) {
      const organization=await write(staff,'organization.create',{name,kind,contact_name:person.name,email:person.email,phone:''});
      const property=await write(staff,'property.create',{organization_id:uuid(organization.id),name,address,postcode:'0000 AA',city:'Apeldoorn'});
      const order=await write(staff,'order.create',{organization_id:uuid(organization.id),property_id:uuid(property.id),title:'Fictieve eerste inspectie',service:'inspection',scope:'Uitsluitend een proef; geen echte inspectie.',internal_note:'Interne proefnotitie, nooit voor klanten.'});
      await write(staff,'order.status',{id:uuid(order.id),status:'active'});
      const inspection=(await rpc(staff,'snapshot')).inspections.find(item=>item.order_id===order.id);checked(inspection,'SEEDED_INSPECTION_MISSING');
      await write(staff,'inspection.date',{id:uuid(inspection.id),inspected_on:new Date().toISOString().slice(0,10)});
      await write(staff,'observation.create',{inspection_id:uuid(inspection.id),title:'Fictieve vervuiling dakgoot',component:'Dakgoot',description:'Testwaarneming zonder echte locatie.',recommendation:'Uitsluitend een voorbeeldadvies.',severity:'medium',assessment:'observed'});
      const report=await write(staff,'report.save',{inspection_id:uuid(inspection.id),title:`Proefrapport ${name}`,summary:'Dit is een fictief rapport om portaaltoegang te controleren.'});
      const grant=await write(staff,'access.grant',{user_id:person.id,organization_id:organization.id,property_id:property.id,role:'contact'});
      const result={organization_id:organization.id,property_id:property.id,order_id:order.id,inspection_id:inspection.id,report_id:report.id,grant_id:grant.id};
      fixtures.current.dossiers[key]=result;await saveFixtures();return result;
    }
    const da=await dossier('customerA',fixtures.users.customerA,'VvE Voorbeeldhof · fictief','vve','Voorbeeldstraat 10–18');
    const db=await dossier('customerB',fixtures.users.customerB,'Demowoning · fictief','private','Demolaan 24');
    const before=await rpc(a,'snapshot');checked(!before.reports.some(r=>r.id===da.report_id)&&!before.observations.some(o=>o.inspection_id===da.inspection_id),'DRAFT_INFORMATION_LEAK');
    checked(!before.properties.some(p=>p.id===db.property_id),'OTHER_CUSTOMER_OBJECT_LEAK');
    checked((await call(a,`/api/reports/${da.report_id}/file`,{method:'GET'})).status===403,'DRAFT_DOWNLOAD_ALLOWED');
    checks.push('Eigen objecttoegang; concepten en interne notities afgeschermd');

    stage='private-pdf';
    const pdf=createFixturePdf();
    const requestId=randomUUID();
    const upload=()=>call(staff,`/api/reports/${da.report_id}/file`,{body:pdf,headers:{'Content-Type':'application/pdf','X-Request-ID':requestId,'X-File-Name':'Fictief-voorbeeldrapport.pdf'}});
    checked((await upload()).status===200,'TRUSTED_UPLOAD_FAILED');checked((await upload()).status===200,'UPLOAD_RETRY_FAILED');
    const count=await sql(`select count(*)::int as attachment_count from erp.audit_events where action='document.attach' and entity_id='${uuid(da.report_id)}';`,'attachment_count');
    checked(count===1,'DUPLICATE_DOCUMENT_ATTACHMENT');
    checked((await call(staff,'/api/command',{body:{action:'report.attach',payload:{id:da.report_id,file_key:randomUUID()+'.pdf'}}})).status===403,'CLIENT_ATTACHMENT_BYPASS');
    await write(staff,'report.publish',{id:da.report_id});await write(staff,'report.publish',{id:db.report_id});
    const own=await call(a,`/api/reports/${da.report_id}/file`,{method:'GET'});
    checked(own.status===200&&Buffer.from(await own.arrayBuffer()).equals(pdf),'OWN_PDF_DOWNLOAD_FAILED');
    checked((await call(b,`/api/reports/${da.report_id}/file`,{method:'GET'})).status===403,'OTHER_CUSTOMER_PDF_LEAK');
    checked((await call(a,`/api/reports/${db.report_id}/file`,{method:'GET'})).status===403,'OTHER_CUSTOMER_REPORT_LEAK');
    checks.push('Private PDF-upload, herhaalverzoek zonder duplicaat en vrijgegeven download');

    stage='direct-access-boundaries';
    const native=await adapter.signIn(fixtures.users.customerA.email,fixtures.users.customerA.password);
    const userHeaders={apikey:config.publishableKey,Authorization:`Bearer ${native.access_token}`};
    async function denied(endpoint,options={}) {
      const result=await fetch(config.url+endpoint,{...options,headers:{...userHeaders,...options.headers},redirect:'error',signal:AbortSignal.timeout(20000)});
      checked(!result.ok&&[400,401,403,404,406].includes(result.status),'DIRECT_ACCESS_ALLOWED');await result.body?.cancel();
    }
    await denied('/rest/v1/organizations?select=id',{headers:{'Accept-Profile':'erp'}});
    await denied('/rest/v1/rpc/roofsignal_erp_document',{method:'POST',headers:jsonHeaders,body:JSON.stringify({caller_uuid:fixtures.users.staff.id,payload:{report_id:da.report_id,request_id:randomUUID()}})});
    await denied('/rest/v1/rpc/roofsignal_erp',{method:'POST',headers:jsonHeaders,body:JSON.stringify({action:'report.file',payload:{id:db.report_id}})});
    const privateFile=await rpc(staff,'report.file',{id:da.report_id});checked(/^[0-9a-f-]{36}\.pdf$/.test(privateFile.key||''),'PRIVATE_KEY_INVALID');
    await denied('/storage/v1/object/authenticated/erp-documents/'+privateFile.key);
    const publicAttempt=await fetch(config.url+'/storage/v1/object/public/erp-documents/'+privateFile.key,{redirect:'error',signal:AbortSignal.timeout(20000)});
    checked(!publicAttempt.ok,'PUBLIC_PDF_DOWNLOAD_ALLOWED');await publicAttempt.body?.cancel();await adapter.signOut(native.access_token);
    checks.push('Directe tabel-, RPC-, andere-klant- en openbare bestandsroutes geweigerd');

    stage='immediate-revocation';
    await write(staff,'access.revoke',{id:da.grant_id});
    checked((await call(a,`/api/reports/${da.report_id}/file`,{method:'GET'})).status===403,'REVOKED_PDF_ACCESS_ALLOWED');
    const restored=await write(staff,'access.grant',{user_id:fixtures.users.customerA.id,organization_id:da.organization_id,property_id:da.property_id,role:'contact'});
    da.grant_id=restored.id;await saveFixtures();
    const replay={cookie:a.cookie};checked((await call(a,'/api/logout')).status===200,'LOGOUT_FAILED');
    checked((await call(replay,'/api/command',{body:{action:'snapshot',payload:{}}})).status===401,'REVOKED_COOKIE_REPLAY_ALLOWED');
    checks.push('Dossierrechten direct ingetrokken; oude cookie na uitloggen onbruikbaar');

    stage='real-password-recovery';
    const recovery=await provider('/auth/v1/admin/generate_link',{method:'POST',body:{type:'recovery',email:fixtures.users.customerB.email,redirect_to:config.origin+'/auth/callback'}});
    const tokenHash=recovery.properties?.hashed_token||recovery.hashed_token;
    checked(typeof tokenHash==='string'&&/^[A-Za-z0-9_-]{20,256}$/.test(tokenHash),'RECOVERY_HASH_MISSING');
    const recoverySession={cookie:''};const callback=await call(recoverySession,'/auth/callback?token_hash='+encodeURIComponent(tokenHash)+'&type=recovery',{method:'GET'});
    checked(callback.status===303&&recoverySession.cookie,'RECOVERY_CALLBACK_FAILED');sessions.push(recoverySession);
    checked((await call(recoverySession,'/api/command',{body:{action:'snapshot',payload:{}}})).status===403,'RECOVERY_BUSINESS_ACCESS_ALLOWED');
    const recoveryReplay={cookie:recoverySession.cookie};
    fixtures.users.customerB.pendingPassword=password();await saveFixtures();
    const racingRequests=await Promise.all([
      call({cookie:recoverySession.cookie},'/api/password',{body:{password:fixtures.users.customerB.pendingPassword}}),
      call({cookie:recoverySession.cookie},'/api/password',{body:{password:fixtures.users.customerB.pendingPassword}}),
    ]);
    checked(racingRequests.filter(response=>response.status===200).length===1
      &&racingRequests.filter(response=>response.status===401).length===1,'RECOVERY_CONCURRENT_CONSUME_FAILED');
    fixtures.users.customerB.password=fixtures.users.customerB.pendingPassword;delete fixtures.users.customerB.pendingPassword;await saveFixtures();
    checked((await call(recoveryReplay,'/api/password',{body:{password:password()}})).status===401,'RECOVERY_COOKIE_REPLAY_ALLOWED');
    await login(fixtures.users.customerB);
    checks.push('Echte herstelcode zonder mail; gelijktijdige verzoeken hebben één winnaar en daarna geen toegang');

    for(const session of sessions)if(session.cookie)await call(session,'/api/logout');
    fixtures.current.completed_at=new Date().toISOString();fixtures.current.checks=checks;await saveFixtures();
    return {ok:true,checks,fixturesStoredPrivately:true};
  } catch(error) {
    throw Object.assign(fail(error.safeCode||'CLOUD_SMOKE_FAILED'),{stage});
  } finally {await rm(temp,{recursive:true,force:true});}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) {
  const args=process.argv.slice(2),index=args.indexOf('--config');
  const configPath=index>=0?args[index+1]:args.find(value=>!value.startsWith('--'));
  try {
    const result=await cloudSmoke({configPath,provision:args.includes('--provision-fixtures')});console.log(JSON.stringify(result));
  } catch(error) {
    console.error(JSON.stringify({ok:false,stage:error.stage||'configuration',code:error.safeCode||'CLOUD_SMOKE_FAILED'}));process.exitCode=1;
  }
}
