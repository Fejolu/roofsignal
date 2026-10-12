import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createDevServer} from '../src/dev-server.mjs';
import {openDatabase,command,write,USERS} from '../src/database.mjs';

test('HTTP session, CSRF checks, private file download and disk persistence',async t=>{
  const dir=await mkdtemp(path.join(tmpdir(),'roofsignal-erp-'));
  const dataDir=path.join(dir,'database');const app=await createDevServer({dataDir,port:0});
  let closed=false;t.after(async()=>{if(!closed)await app.close();await rm(dir,{recursive:true,force:true});});
  const post=(route,body,cookie,extra={})=>fetch(app.url+route,{method:'POST',headers:{Origin:app.url,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{}),...extra},body:typeof body==='string'||Buffer.isBuffer(body)?body:JSON.stringify(body)});
  assert.deepEqual(await (await fetch(app.url+'/api/config')).json(),{mode:'demo',environment:'local',passwordRecovery:false});
  assert.deepEqual(await (await fetch(app.url+'/api/session')).json(),{authenticated:false});
  assert.equal((await post('/api/command',{action:'snapshot'})).status,401);
  assert.equal((await post('/api/dev-session',{account:'staff'},null,{Origin:'https://evil.invalid'})).status,403);
  assert.equal((await fetch(app.url+'/api/dev-session',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,403);
  const login=await post('/api/dev-session',{account:'staff'});assert.equal(login.status,200);
  assert.match(login.headers.get('set-cookie'),/HttpOnly; SameSite=Strict/);const staff=login.headers.get('set-cookie').split(';')[0];
  assert.deepEqual(await (await fetch(app.url+'/api/session',{headers:{Cookie:staff}})).json(),{authenticated:true});
  const snapshot=await (await post('/api/command',{action:'snapshot'},staff)).json();const report=snapshot.reports.find(r=>r.status==='draft');
  assert.equal(snapshot.staff_role,'administrator');assert.equal(snapshot.permissions.manage_access,true);
  assert.equal((await post('/api/command',{action:'report.attach',payload:{id:report.id,file_key:randomUUID()+'.pdf'}},staff)).status,403);
  const pdf=Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF');
  assert.equal((await post(`/api/reports/${report.id}/file`,Buffer.from('not pdf'),staff,{'Content-Type':'application/pdf','X-Request-ID':randomUUID()})).status,400);
  const upload=await post(`/api/reports/${report.id}/file`,pdf,staff,{'Content-Type':'application/pdf','X-Request-ID':randomUUID(),'X-File-Name':'Proef.pdf'});assert.equal(upload.status,200);
  const other=(await post('/api/dev-session',{account:'other'})).headers.get('set-cookie').split(';')[0];
  const customer=(await post('/api/dev-session',{account:'customer'})).headers.get('set-cookie').split(';')[0];
  assert.equal((await fetch(`${app.url}/api/reports/${report.id}/file`,{headers:{Cookie:other}})).status,403);
  assert.equal((await post('/api/command',{action:'report.publish',payload:{id:report.id,request_id:randomUUID()}},staff)).status,200);
  const download=await fetch(`${app.url}/api/reports/${report.id}/file`,{headers:{Cookie:other}});
  assert.equal(download.status,200);assert.match(download.headers.get('content-disposition'),/attachment/);assert.deepEqual(Buffer.from(await download.arrayBuffer()),pdf);
  assert.equal((await fetch(`${app.url}/api/reports/${report.id}/file`,{headers:{Cookie:customer}})).status,403);
  assert.equal((await fetch(`${app.url}/.local/documents/anything.pdf`,{headers:{Cookie:staff}})).status,404);
  await post('/api/command',{action:'report.withdraw',payload:{id:report.id,request_id:randomUUID()}},staff);
  assert.equal((await fetch(`${app.url}/api/reports/${report.id}/file`,{headers:{Cookie:other}})).status,403);
  await post('/api/logout',{},staff);assert.equal((await post('/api/command',{action:'snapshot'},staff)).status,401);
  await app.close();closed=true;
  const reopened=await openDatabase(dataDir);const stored=await command(reopened,USERS.staff,'snapshot');
  assert.equal(stored.reports.find(r=>r.id===report.id).status,'withdrawn');assert.equal(stored.reports.find(r=>r.id===report.id).has_file,true);await reopened.close();
});

test('local upload retries use the trusted boundary with canonical UUIDs and no duplicate attachment',async t=>{
  const dir=await mkdtemp(path.join(tmpdir(),'roofsignal-erp-upload-'));
  const app=await createDevServer({dataDir:path.join(dir,'database'),port:0});
  t.after(async()=>{await app.close();await rm(dir,{recursive:true,force:true});});
  const login=await fetch(app.url+'/api/dev-session',{method:'POST',headers:{Origin:app.url,'Content-Type':'application/json'},body:JSON.stringify({account:'staff'})});
  const cookie=login.headers.get('set-cookie').split(';')[0];
  const snapshot=await command(app.db,USERS.staff,'snapshot'),report=snapshot.reports.find(r=>r.status==='draft');
  const requestId=randomUUID(),pdf=Buffer.from('%PDF-1.7\nFictitious upload\n%%EOF');
  const upload=(bytes,id=requestId,reportId=report.id)=>fetch(`${app.url}/api/reports/${reportId}/file`,{method:'POST',headers:{Origin:app.url,Cookie:cookie,'Content-Type':'application/pdf','X-Request-ID':id,'X-File-Name':'Fictief.pdf'},body:bytes});
  const first=await upload(pdf,requestId.toUpperCase(),report.id.toUpperCase());assert.equal(first.status,200);const stored=await first.json();
  const retry=await upload(pdf);assert.equal(retry.status,200);assert.deepEqual(await retry.json(),stored);
  assert.equal((await upload(Buffer.from('%PDF-1.7\nChanged file\n%%EOF'))).status,409);
  assert.equal((await app.db.query("select count(*)::int as n from erp.audit_events where action='document.attach' and entity_id=$1",[report.id])).rows[0].n,1);
  const download=await fetch(`${app.url}/api/reports/${report.id}/file`,{headers:{Cookie:cookie}});assert.equal(download.status,200);assert.deepEqual(Buffer.from(await download.arrayBuffer()),pdf);
});

test('demo account rotation and logout clear current, stale, and expired sessions',async t=>{
  const dir=await mkdtemp(path.join(tmpdir(),'roofsignal-erp-sessions-'));
  const app=await createDevServer({dataDir:path.join(dir,'database'),port:0});
  t.after(async()=>{await app.close();await rm(dir,{recursive:true,force:true});});
  const post=(route,body={},cookie)=>fetch(app.url+route,{method:'POST',headers:{Origin:app.url,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(body)});
  const staff=(await post('/api/dev-session',{account:'staff'})).headers.get('set-cookie').split(';')[0];
  const client=(await post('/api/dev-session',{account:'customer'},staff)).headers.get('set-cookie').split(';')[0];
  assert.equal((await post('/api/command',{action:'snapshot'},staff)).status,401);
  assert.equal((await (await post('/api/command',{action:'snapshot'},client)).json()).staff,false);
  const realNow=Date.now;
  try {
    Date.now=()=>realNow()+9*3600000;
    assert.deepEqual(await (await fetch(app.url+'/api/session',{headers:{Cookie:client}})).json(),{authenticated:false});
    const logout=await post('/api/logout',{},client);assert.equal(logout.status,200);assert.match(logout.headers.get('set-cookie'),/Max-Age=0/);
  } finally {Date.now=realNow;}
  assert.equal((await post('/api/logout',{},'roofsignal_dev='+('f'.repeat(64)))).status,200);
  assert.equal((await post('/api/logout')).status,200);
  assert.equal((await fetch(app.url+'/api/logout',{method:'POST',headers:{Origin:'https://evil.invalid'}})).status,403);
});

test('caller lookup stays behind staff session and CSRF protection and creates no customer',async t=>{
  const dir=await mkdtemp(path.join(tmpdir(),'roofsignal-erp-phone-'));
  const app=await createDevServer({dataDir:path.join(dir,'database'),port:0,seed:false});
  t.after(async()=>{await app.close();await rm(dir,{recursive:true,force:true});});
  const post=(body,cookie,origin=app.url)=>fetch(app.url+'/api/command',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(body)});
  const login=async account=>{
    const response=await fetch(app.url+'/api/dev-session',{method:'POST',headers:{Origin:app.url,'Content-Type':'application/json'},body:JSON.stringify({account})});
    return response.headers.get('set-cookie').split(';')[0];
  };
  const lookup={action:'phone.lookup',payload:{phone:'06 1234 5601'}};
  const customer=await write(app.db,USERS.staff,'organization.create',{name:'Fictieve telefoonproef',kind:'business',phone:'+31 6 1234 5601'});
  assert.equal((await post(lookup)).status,401);
  const clientCookie=await login('customer');
  assert.equal((await post(lookup,clientCookie)).status,403);
  const staffCookie=await login('staff');
  assert.equal((await post(lookup,staffCookie,'https://outside.invalid')).status,403);
  const response=await post(lookup,staffCookie);
  assert.equal(response.status,200);
  const found=await response.json();
  assert.equal(found.match,'single');
  assert.equal(found.phone,'+31612345601');
  assert.equal(found.customers[0].id,customer.id);
  const unknown=await post({action:'phone.lookup',payload:{phone:'+31612345602'}},staffCookie);
  assert.equal(unknown.status,200);
  assert.equal((await unknown.json()).match,'none');
  assert.equal((await app.db.query('select count(*)::int as n from erp.organizations')).rows[0].n,1);
  assert.equal((await post({action:'phone.lookup',payload:{phone:'not a number'}},staffCookie)).status,400);
  assert.equal((await fetch(app.url+'/api/voys')).status,401);
  // No external Voys ingress is activated by the local lookup feature.
  assert.equal((await fetch(app.url+'/api/voys',{headers:{Cookie:staffCookie}})).status,404);
});
