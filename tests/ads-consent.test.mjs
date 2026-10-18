import test from 'node:test';
import assert from 'node:assert/strict';
import {consentGranted, safeAdsUrl, conversionPayload, CONSENT_VERSION, CONSENT_MAX_AGE} from '../assets/ads-policy.mjs';
import {eligibleAdsConversion} from '../supabase/functions/_shared/consumer-ads.mjs';
import fs from 'node:fs';
import vm from 'node:vm';
test('No implicit, expired, future or old-version advertising consent', () => {
  const now=100000000000;
  for(const c of [null,{}, {version:CONSENT_VERSION,granted:false,at:now}, {version:'old',granted:true,at:now},{version:CONSENT_VERSION,granted:true,at:now+1},{version:CONSENT_VERSION,granted:true,at:now-CONSENT_MAX_AGE}]) assert.equal(consentGranted(c,now),false);
  assert.equal(consentGranted({version:CONSENT_VERSION,granted:true,at:now},now),true);
});
test('Google URL strips booking secrets, PII, referrers and fragments',()=>{
  const clean=safeAdsUrl('https://www.roofsignal.nl/inspectie-boeken/?booking=SECRET&email=private%40example.com&gclid=VALID_123&rs_campaign=search_consument_apeldoorn#private');
  assert.equal(clean,'https://www.roofsignal.nl/inspectie-boeken/?gclid=VALID_123&rs_campaign=search_consument_apeldoorn');
  assert.equal(safeAdsUrl('https://www.roofsignal.nl/?gclid=bad%3Fsecret&rs_campaign=arbitrary'),'https://www.roofsignal.nl/');
});
test('Server only exposes conversion for live paid confirmed calendar bookings',()=>{
  const a={mode:'live',status:'confirmed',payment_status:'paid',calendar_event_id:'event'};const q={total_cents:36179};
  assert.equal(eligibleAdsConversion(a,q),true);
  for(const patch of [{mode:'test'},{status:'paid_review_required'},{status:'pending'},{payment_status:'refunded'},{calendar_event_id:null}]) assert.equal(eligibleAdsConversion({...a,...patch},q),false);
});
test('Client conversion payload has a strict field allowlist and safe transaction ID',()=>{
  const data={state:'closed',status:'confirmed',adsConversion:{id:'rs_'+'a'.repeat(64),currency:'EUR',valueCents:36179,email:'private'},token:'SECRET'};
  assert.deepEqual(conversionPayload(data),{send_to:'AW-18511176766/J4uQCM6CzpsdEL7I6PpE',transaction_id:'rs_'+'a'.repeat(64),currency:'EUR',value:361.79});
  for(const patch of [{status:'paid_review_required'},{state:'pending'},{adsConversion:{...data.adsConversion,id:'SECRET'}},{adsConversion:{...data.adsConversion,currency:'USD'}}]) assert.equal(conversionPayload({...data,...patch}),null);
});
function browser({choice=null,optedOut=false}={}) {
  const nodes=[];const stored=new Map();const session=new Map();
  if(choice)stored.set('roofsignal-advertentiemeting',JSON.stringify(choice));
  function node(tag){const n={tag,children:[],hidden:false,listeners:{},append(...a){this.children.push(...a);},setAttribute(){},addEventListener(k,f){this.listeners[k]=f;},querySelector(){return this.children.find(v=>v.tag==='button');},focus(){}};nodes.push(n);return n;}
  const location=new URL('https://www.roofsignal.nl/inspectie-boeken/?booking='+'x'.repeat(40)+'&gclid=click_123');location.reload=()=>{};
  const head=node('head'),body=node('body');const window={dataLayer:[]};
  const context=vm.createContext({CONSENT_VERSION,CONSENT_MAX_AGE,consentGranted,safeAdsUrl,conversionPayload,window,location,history:{replaceState(_a,_b,url){location.href=url;}},navigator:{globalPrivacyControl:optedOut},URL,Date,Set,localStorage:{getItem:k=>stored.get(k)||null,setItem:(k,v)=>stored.set(k,v)},sessionStorage:{getItem:k=>session.get(k)||null,setItem:(k,v)=>session.set(k,v),removeItem:k=>session.delete(k)},document:{readyState:'complete',head,body,cookie:'',createElement:node,querySelector:()=>null}});
  const src=fs.readFileSync(new URL('../assets/ads-consent.mjs',import.meta.url),'utf8').replace(/^import .*;\n/,'').replace(/export /g,'');
  vm.runInContext(src,context);
  return {nodes,head,window,location,context,stored};
}
test('Actual loader makes no Google request before consent or after refusal',()=>{
  const b=browser();assert.equal(b.head.children.filter(x=>x.tag==='script').length,0);assert.ok(!b.location.href.includes('booking'));
  b.nodes.find(x=>x.textContent==='Weigeren').listeners.click();assert.equal(b.head.children.filter(x=>x.tag==='script').length,0);assert.equal(b.window.dataLayer.length,0);
});
test('Opt-in loads once, keeps secrets out of payloads and deduplicates confirmed events',()=>{
  const b=browser();b.nodes.find(x=>x.textContent==='Toestaan').listeners.click();assert.equal(b.head.children.filter(x=>x.tag==='script').length,1);
  const data={state:'closed',status:'confirmed',adsConversion:{id:'rs_'+'b'.repeat(64),currency:'EUR',valueCents:36179}};
  b.context.reportConfirmedBooking(data);b.context.reportConfirmedBooking(data);
  const events=b.window.dataLayer.filter(x=>x[0]==='event');assert.equal(events.length,1);
  assert.ok(!JSON.stringify(b.window.dataLayer).includes('x'.repeat(40)));
});
test('GPC overrides a previously granted consent',()=>{
  const b=browser({choice:{version:CONSENT_VERSION,granted:true,at:Date.now()},optedOut:true});assert.equal(b.head.children.filter(x=>x.tag==='script').length,0);
});
