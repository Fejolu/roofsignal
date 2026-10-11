import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import * as view from '../public/view.mjs';

const source=(await readFile(new URL('../public/app.mjs',import.meta.url),'utf8')).replace(/^import .*?;\n/,'');
const org={id:'aaaa1111-1111-4111-8111-111111111111',name:'Fictieve klant',kind:'business',contact_name:'Proefpersoon',email:'proef@example.invalid',phone:'+31600000001'};
const fixture=staff=>({staff,dev_account:staff?'staff':'customer',person:{name:'Proefaccount'},organizations:[org],properties:[{id:'prop-1',organization_id:org.id,name:'Proefpand',address:'Demolaan 1',city:'Apeldoorn'}],orders:[],reports:[],inspections:[],observations:[],requests:[],visits:[],activity:[]});
const tick=async()=>{await new Promise(r=>setImmediate(r));await new Promise(r=>setImmediate(r));};
function harness({hash='#telephony',staff=true,authenticated=true}={}) {
  const listeners={},windowListeners={},calls=[],pending=[];
  const form={dataset:{},values:{},_context:{}};
  const app={innerHTML:''},account={value:'',disabled:false,addEventListener(){}},toast={textContent:'',hidden:true};
  const dialog={innerHTML:'',open:false,banner:null,showModal(){this.open=true;},close(){this.open=false;},querySelector(selector){if(selector==='form')return form;if(selector==='.pending-call')return this.banner;return null;},insertAdjacentHTML(_position,html){this.banner={html,remove:()=>{this.banner=null;}};}};
  let currentHash=hash;const location={get hash(){return currentHash;},set hash(value){currentHash=value.startsWith('#')?value:'#'+value;}};
  const document={querySelector:selector=>({'#app':app,'#dialog':dialog,'#account':account,'#toast':toast})[selector],addEventListener:(name,fn)=>listeners[name]=fn};
  const window={addEventListener:(name,fn)=>windowListeners[name]=fn,scrollTo(){}};
  const response=(body,ok=true,status=200)=>({ok,status,json:async()=>body});
  const fetch=async(url,options={})=>{
    const body=options.body?JSON.parse(options.body):{};calls.push({url,body});
    if(url==='/api/dev-session'){staff=body.account==='staff';authenticated=true;return response({});}
    if(url==='/api/logout'){authenticated=false;return response({});}
    if(body.action==='snapshot')return authenticated?response(fixture(staff)):response({error:'Inloggen vereist'},false,401);
    if(body.action==='phone.lookup')return new Promise(resolve=>pending.push({phone:body.payload.phone,resolve:body=>resolve(response(body)),fail:()=>resolve(response({error:'Verbinding onderbroken'},false,503))}));
    throw new Error('Unexpected command: '+body.action);
  };
  const context=vm.createContext({...view,document,window,location,fetch,crypto:{randomUUID:()=> 'request-id'},setTimeout:()=>0,clearTimeout(){},FormData:class{constructor(form){this.values=form.values;}get(name){return this.values[name]??null;}[Symbol.iterator](){return Object.entries(this.values)[Symbol.iterator]();}}});
  vm.runInContext(source,context);
  return {app,dialog,form,calls,pending,location,context,run:code=>vm.runInContext(code,context),navigate:hash=>{location.hash=hash;windowListeners.hashchange();}};
}

const single={phone:org.phone,match:'single',customers:[org]};
const unknown={phone:'+31600000002',match:'none',customers:[]};

test('call destination uses only a consistent server result and decodes the caller deep link',()=>{
  assert.equal(view.callPhoneFromHash('#call/%2B31600000001'),'+31600000001');
  assert.equal(view.callPhoneFromHash('#call'),'');
  assert.throws(()=>view.callPhoneFromHash('#call/%zz'),/niet geldig/);
  assert.deepEqual(view.callDestination(single),{kind:'customer',id:org.id});
  assert.deepEqual(view.callDestination(unknown),{kind:'new',phone:unknown.phone});
  assert.deepEqual(view.callDestination({phone:null,match:'withheld',customers:[]}),{kind:'withheld'});
  assert.throws(()=>view.callDestination({phone:org.phone,match:'single',customers:[]}),/niet worden gecontroleerd/);
  assert.throws(()=>view.callDestination({phone:org.phone,match:'none',customers:[org]}),/niet worden gecontroleerd/);
});

test('a known caller opens the staff customer card with contacts, objects and orders',async()=>{
  const h=harness({hash:'#call/%2B31600000001'});await tick();
  assert.equal(h.pending[0].phone,org.phone);h.pending[0].resolve(single);await tick();
  assert.equal(h.location.hash,`#customer/${org.id}`);assert.match(h.app.innerHTML,/Contactgegevens/);assert.match(h.app.innerHTML,/Proefpand/);assert.match(h.app.innerHTML,/Terug naar klanten/);
  assert.equal(h.dialog.open,false);
});

test('an unknown caller opens a prefilled customer form but never automatically saves',async()=>{
  const h=harness({hash:'#call/%2B31600000002'});await tick();h.pending[0].resolve(unknown);await tick();
  assert.equal(h.dialog.open,true);assert.match(h.dialog.innerHTML,/Klant toevoegen/);assert.match(h.dialog.innerHTML,/value="\+31600000002"/);
  assert.equal(h.calls.some(c=>c.body.action==='organization.create'),false);
});

test('multiple customers need selection and a withheld number creates no customer form',async()=>{
  const h=harness({hash:'#call/%2B31600000001'});await tick();h.pending[0].resolve({phone:org.phone,match:'multiple',customers:[org,{...org,id:'bbbb2222-2222-4222-8222-222222222222',name:'Tweede fictieve klant'}]});await tick();
  assert.match(h.app.innerHTML,/meerdere klanten/);assert.match(h.app.innerHTML,/Tweede fictieve klant/);assert.equal(h.dialog.open,false);assert.equal(h.location.hash,'#call/%2B31600000001');
  const hidden=harness({hash:'#call'});await tick();hidden.pending[0].resolve({phone:null,match:'withheld',customers:[]});await tick();
  assert.match(hidden.app.innerHTML,/afgeschermd/);assert.equal(hidden.dialog.open,false);
});

test('a failed lookup offers retry and is not treated as an unknown caller',async()=>{
  const h=harness({hash:'#call/%2B31600000001'});await tick();h.pending[0].fail();await tick();
  assert.match(h.app.innerHTML,/probeer het opnieuw/i);assert.match(h.app.innerHTML,/Klant zoeken/);assert.equal(h.dialog.open,false);
  assert.equal(h.calls.some(c=>c.body.action==='organization.create'),false);
});

test('old lookup responses cannot override navigation or an active form',async()=>{
  const h=harness({hash:'#call/%2B31600000001'});await tick();h.navigate('#objects');h.pending[0].resolve(unknown);await tick();
  assert.equal(h.location.hash,'#objects');assert.equal(h.dialog.open,false);assert.match(h.app.innerHTML,/Doorlopende dossiers/);
  const edit=harness({hash:'#call/%2B31600000001'});await tick();edit.run("action('organization.new')");const existing=edit.dialog.innerHTML;edit.pending[0].resolve(unknown);await tick();assert.equal(edit.dialog.innerHTML,existing);assert.equal(edit.dialog.open,true);
});

test('an incoming call preserves an unsaved form until the employee chooses to open the caller',async()=>{
  const h=harness({hash:'#customers'});await tick();h.run("action('organization.new')");h.form.values={name:'Nog niet opgeslagen'};const markup=h.dialog.innerHTML;
  h.navigate('#call/%2B31600000002');await tick();assert.equal(h.pending.length,0);assert.equal(h.dialog.open,true);assert.equal(h.dialog.innerHTML,markup);assert.equal(h.form.values.name,'Nog niet opgeslagen');assert.match(h.dialog.banner.html,/Uw formulier blijft open/);
  h.run("action('call.ignore')");assert.equal(h.dialog.open,true);assert.equal(h.dialog.innerHTML,markup);assert.equal(h.pending.length,0);
  h.navigate('#call/%2B31600000003');h.run("action('call.open')");await tick();assert.equal(h.pending.length,1);assert.equal(h.pending[0].phone,'+31600000003');
  assert.equal(h.calls.some(c=>c.body.action==='organization.create'),false);
});

test('the pending call survives staff login but customer accounts cannot use caller routes',async()=>{
  const h=harness({hash:'#call/%2B31600000001',authenticated:false});await tick();assert.match(h.app.innerHTML,/Open de backoffice/);await h.run("login('staff')");await tick();assert.equal(h.location.hash,'#call/%2B31600000001');assert.equal(h.pending[0].phone,org.phone);
  const customer=harness({hash:'#call/%2B31600000001',staff:false});await tick();assert.equal(customer.pending.length,0);assert.match(customer.app.innerHTML,/Niet beschikbaar/);assert.doesNotMatch(customer.app.innerHTML,/data-phone-lookup/);
  customer.navigate(`#customer/${org.id}`);assert.match(customer.app.innerHTML,/Niet beschikbaar/);assert.doesNotMatch(customer.app.innerHTML,/Contactgegevens/);
});
