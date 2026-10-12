import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import * as view from '../public/view.mjs';

const source=(await readFile(new URL('../public/app.mjs',import.meta.url),'utf8')).replace(/^import .*?;\n/,'');
const tick=async()=>{await new Promise(r=>setImmediate(r));await new Promise(r=>setImmediate(r));};
const snapshot=({staff=false,admin=false,name='Klant A',orgName='Dossier A'}={})=>({staff,staff_role:admin?'administrator':staff?'inspector':null,permissions:{manage_access:admin},person:{name},organizations:[{id:'org-1',name:orgName,kind:'vve'}],properties:[{id:'prop-1',organization_id:'org-1',name:orgName,address:'Voorbeeldstraat 1',city:'Apeldoorn'}],orders:[],reports:[],inspections:[],observations:[],requests:[],visits:[],activity:[]});
function harness({config={mode:'hosted',passwordRecovery:true,environment:'test'},session={authenticated:false},data=snapshot(),hash='#overview',handler}={}) {
  const listeners={},windowListeners={},calls=[];
  const error={textContent:'',hidden:true},submit={disabled:false,textContent:''};
  const form={dataset:{},values:{},_context:{},querySelector:selector=>selector==='.form-error'?error:null,querySelectorAll:()=>[submit]};
  const selectors={'[name="property_id"]':{required:true,innerHTML:'',value:''}};
  const app={innerHTML:'',querySelector:selector=>selector==='.form-error'?error:selector==='.auth-form button'?submit:null};
  const account={value:'',disabled:true,addEventListener(){}},bar={hidden:true},toast={textContent:'',hidden:true};
  const dialog={innerHTML:'',open:false,showModal(){this.open=true;},close(){this.open=false;},querySelector:selector=>selector==='form'?form:selectors[selector]};
  let currentHash=hash;const location={get hash(){return currentHash;},set hash(value){currentHash=value.startsWith('#')?value:'#'+value;}};
  const document={querySelector:selector=>({'#app':app,'#dialog':dialog,'#account':account,'#toast':toast,'.devbar':bar})[selector],addEventListener:(name,fn)=>listeners[name]=fn};
  const window={addEventListener:(name,fn)=>windowListeners[name]=fn,scrollTo(){}};
  const response=(body,ok=true,status=200)=>({ok,status,json:async()=>body});
  const fetch=async(url,options={})=>{
    const body=options.body?JSON.parse(options.body):{};const call={url,body,options};calls.push(call);
    const overridden=await handler?.(call,response);if(overridden)return overridden;
    if(url==='/api/config')return response(config);
    if(url==='/api/session')return response(session);
    if(url==='/api/login'){session={authenticated:true};return response({ok:true});}
    if(url==='/api/logout'){session={authenticated:false};return response({ok:true});}
    if(url==='/api/reset-request'||url==='/api/password')return response({ok:true});
    if(body.action==='snapshot')return response(data);
    if(body.action==='access.snapshot')return response({people:[{user_id:'user-1',name:'Contact A',email:'contact@example.invalid'}],organizations:[{id:'org-1',name:'Dossier A'}],properties:[{id:'prop-1',organization_id:'org-1',name:'Object A'}],grants:[{id:'grant-1',user_id:'user-1',organization_id:'org-1',property_id:null,role:'reader',expires_at:null,revoked_at:null}],staff:[{user_id:'user-1',role:'administrator',active:true}]});
    return response({ok:true});
  };
  const context=vm.createContext({...view,document,window,location,fetch,Date,crypto:{randomUUID:()=> 'request-id'},setTimeout:()=>0,clearTimeout(){},FormData:class{constructor(form){this.values=form.values;}get(name){return this.values[name]??null;}[Symbol.iterator](){return Object.entries(this.values)[Symbol.iterator]();}}});
  vm.runInContext(source,context);
  return {app,account,bar,dialog,form,error,submit,toast,calls,location,run:code=>vm.runInContext(code,context),auth:async(kind,values)=>{form.dataset={auth:kind};form.values=values;await vm.runInContext('submitAuth(dialog.querySelector("form"))',context);},navigate:hash=>{location.hash=hash;windowListeners.hashchange();},setData:next=>data=next,listeners};
}

test('hosted login exposes email/password only and never offers the demo account selector',async()=>{
  const h=harness();await tick();assert.match(h.app.innerHTML,/data-auth="login"/);assert.match(h.app.innerHTML,/autocomplete="current-password"/);assert.match(h.app.innerHTML,/Wachtwoord vergeten/);assert.equal(h.bar.hidden,true);assert.equal(h.account.disabled,true);
  assert.doesNotMatch(h.app.innerHTML,/data-account|Proefaccount|Open de backoffice/);await h.run("login('staff')");assert.equal(h.calls.some(c=>c.url==='/api/dev-session'),false);
  assert.equal(h.calls.some(c=>c.body.action==='snapshot'),false);
});

test('missing or invalid config fails closed rather than enabling demo login',async()=>{
  const h=harness({config:{mode:'something-else'}});await tick();assert.match(h.app.innerHTML,/Werkruimte niet beschikbaar/);assert.doesNotMatch(h.app.innerHTML,/data-auth|data-account/);assert.equal(h.bar.hidden,true);assert.equal(h.calls.some(c=>c.url==='/api/session'),false);
});

test('verified cookie session opens the server-authorized customer view without staff actions',async()=>{
  const h=harness({session:{authenticated:true},data:snapshot()});await tick();assert.match(h.app.innerHTML,/Mijn objecten/);assert.match(h.app.innerHTML,/Dossier A/);assert.doesNotMatch(h.app.innerHTML,/href="#customers"|href="#access"|Telefonie/);assert.equal(h.account.value,'');assert.equal(h.calls.every(c=>c.options.credentials==='same-origin'),true);
});

test('one hosted login posts credentials once and only the snapshot determines employee rights',async()=>{
  let resolveLogin;const h=harness({data:snapshot({staff:true,name:'Medewerker'}),handler:({url},response)=>url==='/api/login'?new Promise(r=>resolveLogin=()=>r(response({ok:true}))):undefined});await tick();
  const first=h.auth('login',{email:'someone@example.invalid',password:'a-test-password'});await tick();await h.auth('login',{email:'other@example.invalid',password:'different-password'});assert.equal(h.calls.filter(c=>c.url==='/api/login').length,1);assert.doesNotMatch(h.app.innerHTML,/Dossier A|href="#customers"/);
  resolveLogin();await first;await tick();assert.match(h.app.innerHTML,/RoofSignal \/ Backoffice/);assert.doesNotMatch(h.app.innerHTML,/href="#access"/);assert.deepEqual(h.calls.find(c=>c.url==='/api/login').body,{email:'someone@example.invalid',password:'a-test-password'});assert.doesNotMatch(h.app.innerHTML,/a-test-password|someone@example.invalid/);
});

test('logout immediately clears dossier markup and ignores a late previous snapshot',async()=>{
  let oldResolve,delay=false;const h=harness({session:{authenticated:true},data:snapshot({staff:true,admin:true}),handler:({body},response)=>delay&&body.action==='snapshot'?new Promise(r=>oldResolve=()=>r(response(snapshot({staff:true,admin:true,orgName:'Secret old dossier'})))):undefined});await tick();
  h.run("action('organization.new')");assert.equal(h.dialog.open,true);delay=true;const pending=h.run('load()');await tick();h.run("action('logout')");assert.equal(h.dialog.open,false);assert.equal(h.dialog.innerHTML,'');assert.doesNotMatch(h.app.innerHTML,/Dossier A|href="#customers"|href="#access"/);assert.match(h.app.innerHTML,/data-auth="login"/);
  oldResolve();await pending;assert.doesNotMatch(h.app.innerHTML,/Secret old dossier|href="#customers"/);
});

test('session expiry clears data and an open dialog before rendering login',async()=>{
  let expired=false;const h=harness({session:{authenticated:true},handler:({url},response)=>expired&&url==='/api/command'?response({error:'Uw sessie is verlopen'},false,401):undefined});await tick();h.run("showForm('Privé dossier','profile.save','<p>Secret</p>')");expired=true;await h.run('load()');assert.equal(h.dialog.open,false);assert.equal(h.dialog.innerHTML,'');assert.match(h.app.innerHTML,/data-auth="login"/);assert.doesNotMatch(h.app.innerHTML,/Dossier A|Mijn objecten/);
});

test('a late unauthorized response from the previous user cannot close the new customer session',async()=>{
  let staleResolve,delay=false;const h=harness({session:{authenticated:true},handler:({body},response)=>delay&&body.action==='snapshot'?new Promise(r=>staleResolve=()=>r(response({error:'Old expired session'},false,401))):undefined});await tick();delay=true;const pending=h.run('load()');await tick();h.run("action('logout')");delay=false;h.setData(snapshot({name:'Klant B',orgName:'Dossier B'}));await h.auth('login',{email:'new@example.invalid',password:'a-test-password'});assert.match(h.app.innerHTML,/Dossier B/);staleResolve();await pending;assert.match(h.app.innerHTML,/Dossier B/);assert.doesNotMatch(h.app.innerHTML,/data-auth="login"/);
});

test('password recovery requires the server recovery session, not a reset fragment',async()=>{
  const ordinary=harness({hash:'#reset'});await tick();assert.match(ordinary.app.innerHTML,/data-auth="login"/);await ordinary.auth('password',{password:'Long-test-password1',repeat:'Long-test-password1'});assert.equal(ordinary.calls.some(c=>c.url==='/api/password'),false);
  const h=harness({session:{authenticated:true,recovery:true},hash:'#reset'});await tick();assert.match(h.app.innerHTML,/data-auth="password"/);assert.equal(h.calls.some(c=>c.body.action==='snapshot'),false);
  await h.auth('password',{password:'Long-test-password1',repeat:'other-password'});assert.equal(h.calls.some(c=>c.url==='/api/password'),false);assert.equal(h.error.hidden,false);
  await h.auth('password',{password:'Long-test-password1',repeat:'Long-test-password1'});assert.deepEqual(h.calls.find(c=>c.url==='/api/password').body,{password:'Long-test-password1'});assert.match(h.app.innerHTML,/data-auth="login"/);assert.match(h.toast.textContent,/Log opnieuw in/);
});

test('reset request shows a generic acknowledgement without exposing account existence',async()=>{
  const h=harness();await tick();h.run("action('auth.forgot')");assert.match(h.app.innerHTML,/data-auth="reset-request"/);await h.auth('reset-request',{email:'unknown@example.invalid'});assert.match(h.app.innerHTML,/Als er een account voor dit e-mailadres bestaat/);assert.doesNotMatch(h.app.innerHTML,/unknown@example.invalid/);assert.equal(h.calls.filter(c=>c.url==='/api/reset-request').length,1);
});

test('access management loads only for a verified administrator and preserves scope in grant payload',async()=>{
  const denied=harness({session:{authenticated:true},data:snapshot({staff:true}),hash:'#access'});await tick();assert.match(denied.app.innerHTML,/Niet beschikbaar/);assert.equal(denied.calls.some(c=>c.body.action==='access.snapshot'),false);
  const h=harness({session:{authenticated:true},data:snapshot({staff:true,admin:true}),hash:'#access'});await tick();assert.match(h.app.innerHTML,/href="#access"/);assert.match(h.app.innerHTML,/Contact A/);h.run("action('access.new')");assert.match(h.dialog.innerHTML,/Dossier lezen/);assert.match(h.dialog.innerHTML,/Financieel contact/);assert.equal(h.dialog.querySelector('[name="property_id"]').required,false);
  h.form.dataset={command:'access.grant'};h.form.values={user_id:'user-1',organization_id:'org-1',property_id:'prop-1',role:'reader',expires_at:''};h.form.closest=selector=>selector==='form[data-command]'?h.form:null;
  await h.listeners.submit({target:h.form,preventDefault(){}});const call=h.calls.find(c=>c.body.action==='access.grant');assert.deepEqual(call.body.payload,{user_id:'user-1',organization_id:'org-1',property_id:'prop-1',role:'reader',expires_at:null,request_id:'request-id'});assert.equal(h.calls.some(c=>c.url.includes('invite')),false);
});

test('access data completing after logout never reopens administrator UI',async()=>{
  let resolveAccess;const h=harness({session:{authenticated:true},data:snapshot({staff:true,admin:true}),hash:'#access',handler:({body},response)=>body.action==='access.snapshot'?new Promise(r=>resolveAccess=()=>r(response({people:[],organizations:[],properties:[],grants:[],staff:[]}))):undefined});await tick();h.run("action('logout')");resolveAccess();await tick();assert.match(h.app.innerHTML,/data-auth="login"/);assert.doesNotMatch(h.app.innerHTML,/Dossiertoegang|href="#access"/);
});

test('an authenticated account without assigned objects shows an honest empty dossier state',async()=>{
  const next=snapshot();for(const key of ['organizations','properties'])next[key]=[];
  const h=harness({session:{authenticated:true},data:next});await tick();assert.match(h.app.innerHTML,/Nog geen dossiers toegewezen/);assert.doesNotMatch(h.app.innerHTML,/class="metrics"|Facturen|Nieuwe opdracht/);assert.match(h.app.innerHTML,/href="#profile"/);
});

test('weak recovery passwords stay in the form without posting to the server',async()=>{
  const h=harness({session:{authenticated:true,recovery:true}});await tick();await h.auth('password',{password:'simple-password',repeat:'simple-password'});assert.equal(h.calls.some(c=>c.url==='/api/password'),false);assert.match(h.error.textContent,/hoofdletter, kleine letter en cijfer/);
});

test('rejected login displays the server message without echoing credentials or showing a dossier',async()=>{
  const h=harness({handler:({url},response)=>url==='/api/login'?response({error:'Inloggen is niet gelukt. Controleer uw gegevens.'},false,401):undefined});await tick();await h.auth('login',{email:'someone@example.invalid',password:'private-password'});assert.match(h.error.textContent,/Inloggen is niet gelukt/);assert.doesNotMatch(h.app.innerHTML,/someone@example.invalid|private-password|Dossier A/);assert.equal(h.calls.some(c=>c.body.action==='snapshot'),false);
});


test('logout discards completed caller data before another account opens Telefonie',async()=>{
  const h=harness({session:{authenticated:true},data:snapshot({staff:true}),hash:'#telephony'});await tick();
  h.run("callView={status:'choose',phone:'+31600000001',result:{customers:[{id:'old-customer',name:'Previous private caller',kind:'business'}]},error:''};render()");assert.match(h.app.innerHTML,/Previous private caller/);
  h.run("action('logout')");assert.equal(h.run('callView.result'),null);assert.equal(h.run('callView.phone'),'');
  await h.auth('login',{email:'next@example.invalid',password:'Test-password1'});h.navigate('#telephony');assert.doesNotMatch(h.app.innerHTML,/Previous private caller|lokale proef met fictieve klanten/);assert.match(h.app.innerHTML,/De Voys-koppeling is nog niet actief/);
});


test('a consumed or expired recovery capability offers a new link rather than another password submit',async()=>{
  for(const failure of [{status:503,recovery_required:true},{status:401}]){
    const h=harness({session:{authenticated:true,recovery:true},handler:({url},response)=>url==='/api/password'?response({error:'Vraag een nieuwe herstellink aan.',...failure},false,failure.status):undefined});await tick();
    await h.auth('password',{password:'Long-test-password1',repeat:'Long-test-password1'});assert.match(h.app.innerHTML,/data-auth="reset-request"/);assert.doesNotMatch(h.app.innerHTML,/data-auth="password"|Long-test-password1/);assert.equal(h.run('recoverySession'),false);assert.match(h.error.textContent,/nieuwe herstellink/);
    await h.auth('reset-request',{email:'account@example.invalid'});assert.match(h.app.innerHTML,/Controleer uw e-mail/);
  }
});

test('password validation and an outage before recovery consumption keep the usable reset form',async()=>{
  for(const status of [400,503]){
    const h=harness({session:{authenticated:true,recovery:true},handler:({url},response)=>url==='/api/password'?response({error:'Probeer opnieuw.'},false,status):undefined});await tick();await h.auth('password',{password:'Long-test-password1',repeat:'Long-test-password1'});
    assert.match(h.app.innerHTML,/data-auth="password"/);assert.equal(h.run('recoverySession'),true);assert.equal(h.error.hidden,false);
  }
});

test('employee website workspace shows source, contact, original price and the linked order',async()=>{
 const item={id:'intake-1',source:'consumer',reference:'RS-CONSUMER-1',state:'paid_review',payment_id:'tr_example123',payment_status:'paid',commercial:{inspection_type:'building_envelope',thermal:true,base_cents:36179,thermal_cents:30250,travel_cents:4235},total_cents:70664,changed_at:'2026-10-20T08:00:00Z',order_id:'order-1',organization_id:'org-1',record:{customer:{name:'Website klant',email:'client@example.invalid',phone:'0612345678'},quote:{address:{street:'Voorbeeldstraat',houseNumber:'4',postcode:'7316BH',city:'Apeldoorn'}},slot_start:'2026-10-20T08:00:00Z'}};
 const h=harness({session:{authenticated:true},data:snapshot({staff:true}),hash:'#incoming/intake-1',handler:({body},response)=>body.action==='intake.snapshot'?response({items:[item]}):undefined});await tick();assert.match(h.app.innerHTML,/Website klant/);assert.match(h.app.innerHTML,/Consumentenboeking/);assert.match(h.app.innerHTML,/Betaald · afstemming nodig/);assert.match(h.app.innerHTML,/client@example.invalid/);assert.match(h.app.innerHTML,/Voorbeeldstraat 4/);assert.match(h.app.innerHTML,/href="#order\/order-1"/);assert.match(h.app.innerHTML,/href="#customer\/org-1"/);assert.match(h.app.innerHTML,/706,64/);assert.match(h.app.innerHTML,/Dak- en gevelinspectie met thermografie/);assert.match(h.app.innerHTML,/361,79/);assert.match(h.app.innerHTML,/302,50/);assert.match(h.app.innerHTML,/42,35/);assert.match(h.app.innerHTML,/Mollie: <b>tr_example123<\/b>/);
});

test('VvE is an indication with no payment or order link, and pilot is never labelled paid',async()=>{
 const vve={id:'vve-1',source:'vve',reference:'VVE-1',state:'inquiry',total_cents:null,record:{name:'Contact',organization:'VvE <script>bad</script>',email:'vve@example.invalid',postcode:'7316BH',message:'Oorspronkelijke aanvraag',intake_details:{inspection_type:'building_envelope',thermal:true,address_count:8,kvk_number:'12345678',object_address:'Voorbeeldstraat 1–8',object_city:'Apeldoorn',phone:'0612345678',price_indication:{kind:'indication',building_envelope_excl_cents:100000,thermal_excl_cents:55000,total_incl_cents:187550,accepted:false}}}};
 const pilot={id:'pilot-1',source:'parken',reference:'PARKEN-1',state:'pilot_confirmed',total_cents:36179,record:{name:'Pilotklant',email:'pilot@example.invalid',street:'Pilotstraat',house_number:'1',postcode:'7316BH',slot_date:'2026-10-20',slot_time:'16:00-18:00'}};
 const h=harness({session:{authenticated:true},data:snapshot({staff:true}),hash:'#incoming/vve-1',handler:({body},response)=>body.action==='intake.snapshot'?response({items:[vve,pilot]}):undefined});await tick();assert.match(h.app.innerHTML,/Prijsindicatie/);assert.match(h.app.innerHTML,/1.875,50/);assert.match(h.app.innerHTML,/8 adressen opgegeven/);assert.match(h.app.innerHTML,/KVK: 12345678 \(opgegeven\)/);assert.match(h.app.innerHTML,/1.000,00/);assert.match(h.app.innerHTML,/550,00/);assert.match(h.app.innerHTML,/Nog geen opdracht of betaling/);assert.doesNotMatch(h.app.innerHTML,/Opdracht openen|<script>bad/);h.navigate('#incoming/pilot-1');assert.match(h.app.innerHTML,/Betaalstatus niet gekoppeld/);assert.doesNotMatch(h.app.innerHTML,/Betaald ·/);
});

test('customer accounts cannot read incoming records and a delayed staff response disappears on logout',async()=>{
 const customer=harness({session:{authenticated:true},hash:'#incoming'});await tick();assert.match(customer.app.innerHTML,/Niet beschikbaar/);assert.equal(customer.calls.some(c=>c.body.action==='intake.snapshot'),false);
 let resolve;const h=harness({session:{authenticated:true},data:snapshot({staff:true}),hash:'#incoming',handler:({body},response)=>body.action==='intake.snapshot'?new Promise(r=>resolve=()=>r(response({items:[{id:'private',source:'consumer',reference:'Private old source',state:'awaiting_payment',record:{customer:{name:'Previous confidential customer'}}}]}))):undefined});await tick();h.run("action('logout')");resolve();await tick();assert.match(h.app.innerHTML,/data-auth="login"/);assert.doesNotMatch(h.app.innerHTML,/Previous confidential|Private old/);
});
