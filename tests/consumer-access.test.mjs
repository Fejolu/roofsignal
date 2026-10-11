import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import {consumerMode,verifiedChallenge,assertMode,publicError} from '../supabase/functions/_shared/consumer-access.mjs';
import {assertEarlyStartConsent,withdrawalLastDay,reportDueDay} from '../supabase/functions/_shared/consumer-dates.mjs';
import {UUID,customerInput} from '../supabase/functions/_shared/consumer-payment.mjs';
import {consumerProduct} from '../supabase/functions/_shared/consumer-products.mjs';
import {CONSUMER_TERMS as LEGACY_CONSUMER_TERMS} from '../supabase/functions/_shared/consumer-terms-20261010.mjs';
import {CONSUMER_TERMS as PREVIOUS_CONSUMER_TERMS} from '../supabase/functions/_shared/consumer-terms-20261011.mjs';
import {CONSUMER_TERMS as PAYMENT_CONSUMER_TERMS} from '../supabase/functions/_shared/consumer-terms-20261011betalen.mjs';
import {CONSUMER_TERMS as PREVIOUS_THERMAL_CONSUMER_TERMS} from '../supabase/functions/_shared/consumer-terms-20261011thermografie.mjs';
import {CONSUMER_TERMS} from '../supabase/functions/_shared/consumer-terms-20261011kort.mjs';
import {TERMS_TEXT} from '../supabase/functions/_shared/terms-20260924.mjs';
import {TERMS_TEXT as THERMAL_TERMS_TEXT} from '../supabase/functions/_shared/terms-20261011thermografie.mjs';

const backend=fs.readFileSync(new URL('../supabase/functions/consumer-booking/index.ts',import.meta.url),'utf8');
const TERMS=backend.match(/const TERMS='([^']+)'/)[1];
const agreement=Date.parse('2026-10-11T12:00:00Z');
const quoteId='b15c27e0-4d30-4fc6-bc54-4bba2499c895',slotId='fe741dc0-6013-45a0-9774-0db3a782b267',requestId='16664b2d-fbcd-44e8-9935-d8c6b084801f';
const customer={name:'Test Customer',email:'ferry@roofsignal.nl',phone:'0612345678'};
function checkoutHarness(start,version=TERMS) {
 const claims=[],q={id:quoteId,mode:'test',terms_version:version},s={id:slotId,quote_id:quoteId,start_at:start};
 const source=backend.slice(backend.indexOf('async function checkout('),backend.indexOf('async function limit('));
 const context={UUID,TERMS,customerInput,assertMode,
  assertEarlyStartConsent:(date,requested)=>assertEarlyStartConsent(date,requested,agreement),
  one:async table=>table==='consumer_quotes'?q:s,
  sha:async payload=>payload,
  claim:async(id,payload,mode)=>{claims.push({id,payload,mode});return {claimed:false,attempt:{status:'preparing'}};},
  progress:async()=>assert.fail('Consent validation must happen before payment processing'),
  view:async()=>({state:'pending'})};
 vm.runInNewContext(stripTypeScriptTypes(source),context);
 return {claims,checkout:earlyStartRequested=>context.checkout({quoteId,slotId,requestId,customer,terms:{accepted:true,version,earlyStartRequested}},'test')};
}
test('Anonymous mode selection cannot expose private tests or choose alternate credentials',()=>{
  for(const hint of [null,'test','live','admin','../secret'])assert.equal(consumerMode(false,hint),'live');
  assert.equal(consumerMode(true,null),'test');assert.equal(consumerMode(true,'live'),'live');
  assert.throws(()=>consumerMode(true,'other'),/INVALID_MODE/);
  assert.throws(()=>assertMode({mode:'test'},'live'),/INVALID_REQUEST/);
  assert.throws(()=>assertMode(null,'live'),/INVALID_REQUEST/);
});
test('A solved challenge from another site or form is not accepted',()=>{
  const valid={success:true,hostname:'www.roofsignal.nl',action:'consumer_quote'};
  assert.equal(verifiedChallenge(valid),true);
  for(const patch of [{success:false},{hostname:'evil.example'},{hostname:'www.roofsignal.nl.evil.example'},{action:'contact'},{action:undefined}])
    assert.equal(verifiedChallenge({...valid,...patch}),false);
});
test('Unexpected backend messages never leak appointment or credential details',()=>{
  assert.ok(!publicError('private location or secret').includes('private location'));
  assert.match(publicError('QUOTE_EXPIRED'),/verlopen/);
  assert.match(publicError('EARLY_START_CONSENT_REQUIRED'),/toestemming.*later/);
});

test('Actual checkout rejects missing or forged early consent before claim or payment',async()=>{
 for(const value of [false,undefined,null,'true',1]) {
  const app=checkoutHarness('2026-10-12T08:00:00Z');
  await assert.rejects(app.checkout(value),value===false?/EARLY_START_CONSENT_REQUIRED/:/INVALID_REQUEST/);
  assert.equal(app.claims.length,0,'No database claim, reservation or payment starts without required consent');
 }
 const app=checkoutHarness('2026-10-12T08:00:00Z');
 assert.equal((await app.checkout(true)).state,'pending');
 assert.equal(app.claims.length,1);
 assert.equal(app.claims[0].payload.terms.earlyStartRequested,true,'The exact explicit choice is persisted in the atomic claim');
 assert.equal(app.claims[0].payload.terms.version,'2026-10-11-consumer-kort');
});

test('Actual checkout permits later dates without early consent but still validates the terms version',async()=>{
 const app=checkoutHarness('2026-10-27T08:00:00Z');
 await app.checkout(false);
 assert.equal(app.claims.length,1);
 assert.equal(app.claims[0].payload.terms.earlyStartRequested,false);
 const previous=checkoutHarness('2026-10-27T08:00:00Z','2026-10-11-consumer-thermal');
 await assert.rejects(previous.checkout(false),/INVALID_REQUEST/);
 assert.equal(previous.claims.length,0,'A new agreement cannot silently reuse the previous no-early-start terms');
});

test('Receipt recovery retains the exact accepted consumer and general terms for existing bookings',async()=>{
 const source=backend.slice(backend.indexOf('async function receipt('),backend.indexOf('async function deliver('));
 const context={TERMS,TERMS_TEXT,THERMAL_TERMS_TEXT,LEGACY_CONSUMER_TERMS,PREVIOUS_CONSUMER_TERMS,PAYMENT_CONSUMER_TERMS,PREVIOUS_THERMAL_CONSUMER_TERMS,CONSUMER_TERMS,
  withdrawalLastDay,reportDueDay,consumerProduct,TextEncoder,
  btoa:value=>Buffer.from(value,'binary').toString('base64'),env:()=> 'ferry@roofsignal.nl'};
 vm.runInNewContext(stripTypeScriptTypes(source),context);
 for(const [version,text,general] of [
  ['2026-10-10-consumer',LEGACY_CONSUMER_TERMS,TERMS_TEXT],
  ['2026-10-11-consumer',PREVIOUS_CONSUMER_TERMS,TERMS_TEXT],
  ['2026-10-11-consumer-pay',PAYMENT_CONSUMER_TERMS,TERMS_TEXT],
  ['2026-10-11-consumer-thermal',PREVIOUS_THERMAL_CONSUMER_TERMS,THERMAL_TERMS_TEXT],
  [TERMS,CONSUMER_TERMS,THERMAL_TERMS_TEXT]
 ]) {
  const receipt=await context.receipt({mode:'test',reference:'RS-TEST',slot_start:'2026-10-12T08:00:00Z',terms_accepted_at:new Date(agreement).toISOString(),terms:{earlyStartRequested:version===TERMS}},
   {destination:'Test object',total_cents:30250,inspection_type:'thermal',thermal:true,travel_description:'Test route',terms_version:version},{recipient_kind:'customer',id:'test-outbox'});
  assert.equal(Buffer.from(receipt.attachment[0].content,'base64').toString('utf8'),general+'\n\n'+text,version);
  assert.match(receipt.textContent,version===TERMS?/Uw vastgelegde keuze: beginnen tijdens de bedenktijd/:/Uw inspectie vindt plaats na de bedenktijd/);
 }
});
