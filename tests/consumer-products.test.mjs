import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import {consumerProduct,CONSUMER_PRICING_VERSION,LEGACY_CONSUMER_PRICING_VERSION} from '../supabase/functions/_shared/consumer-products.mjs';
import {paymentBody,verifyPayment} from '../supabase/functions/_shared/consumer-payment.mjs';
import {calculateTravel} from '../supabase/functions/_shared/consumer-travel-pricing.mjs';

test('Approved products calculate visual, combined and standalone thermal amounts',()=>{
 for(const [type,thermal,base,heat,total] of [
  ['building_envelope',false,36179,0,36179],
  ['building_envelope',true,36179,30250,66429],
  ['thermal',true,0,36179,36179]
 ]){
  const product=consumerProduct(type,thermal);
  assert.equal(product.baseCents,base);assert.equal(product.thermalCents,heat);assert.equal(product.subtotalCents,total);
  assert.equal(product.pricingVersion,CONSUMER_PRICING_VERSION);
 }
 assert.equal(consumerProduct(undefined,true).subtotalCents,66429,'Both primary choices normalize combined inspections to one unchanged total');
});

test('Historical quotes keep their original standalone thermal price and combined total',()=>{
 for(const version of [LEGACY_CONSUMER_PRICING_VERSION,CONSUMER_PRICING_VERSION]){
  assert.equal(consumerProduct('building_envelope',false,version).subtotalCents,36179);
  assert.equal(consumerProduct('building_envelope',true,version).subtotalCents,66429);
 }
 assert.equal(consumerProduct('thermal',true,LEGACY_CONSUMER_PRICING_VERSION).subtotalCents,30250);
 assert.equal(consumerProduct('thermal',true,CONSUMER_PRICING_VERSION).subtotalCents,36179);
});

test('Invalid product combinations cannot be converted into a cheap quote',()=>{
 for(const [type,thermal] of [['thermal',false],['thermal',undefined],['other',true],[null,true],['building_envelope','true'],['building_envelope',0]]){
  assert.throws(()=>consumerProduct(type,thermal),/INVALID_REQUEST/);
 }
 for(const version of [null,'unknown',0])assert.throws(()=>consumerProduct('thermal',true,version),/INVALID_REQUEST/);
});

test('Stored standalone thermal and combined payments retain their price in every travel bracket',()=>{
 const attempt={id:'601f78aa-31f3-4c63-941d-07b31df84902',quote_id:'thermal-quote',reference:'RS-TEST',mode:'test',status_token:'b'.repeat(64)};
 for(const [version,type,total] of [
  [LEGACY_CONSUMER_PRICING_VERSION,'thermal',30250],
  [CONSUMER_PRICING_VERSION,'thermal',36179],
  [LEGACY_CONSUMER_PRICING_VERSION,'building_envelope',66429],
  [CONSUMER_PRICING_VERSION,'building_envelope',66429]
 ])for(const travel of [0,4235,9075]){
  const quote={id:attempt.quote_id,inspection_type:type,pricing_version:version,thermal:true,total_cents:total+travel};
  const body=paymentBody(attempt,quote,'https://test.invalid');
  assert.equal(body.amount.value,((total+travel)/100).toFixed(2));
  if(type==='thermal')assert.match(body.description,/Thermische inspectie/);
  const payment={id:'tr_thermalTest',mode:'test',profileId:body.profileId,amount:body.amount,metadata:body.metadata,status:'open'};
  assert.equal(verifyPayment(payment,attempt,quote),payment);
  assert.throws(()=>verifyPayment({...payment,amount:{currency:'EUR',value:((total+travel+1)/100).toFixed(2)}},attempt,quote),/PAYMENT_MISMATCH/);
 }
});

test('Actual quote response uses its stored tariff instead of repricing a historical offer',()=>{
 const backend=fs.readFileSync(new URL('../supabase/functions/consumer-booking/index.ts',import.meta.url),'utf8');
 const source=backend.slice(backend.indexOf('function quoteView('),backend.indexOf('async function createQuote('));
 const context={consumerProduct,LEGACY_CONSUMER_PRICING_VERSION};
 vm.runInNewContext(stripTypeScriptTypes(source),context);
 for(const [version,total] of [[undefined,30250],[LEGACY_CONSUMER_PRICING_VERSION,30250],[CONSUMER_PRICING_VERSION,36179]]){
  const quote=context.quoteView({id:'historical-quote',inspection_type:'thermal',thermal:true,pricing_version:version,total_cents:total+4235,travel_cents:4235});
  assert.equal(quote.totalCents,total+4235);
  assert.equal(quote.baseCents,0);
  assert.equal(quote.thermalCents,total);
  assert.equal(quote.pricingVersion,version||LEGACY_CONSUMER_PRICING_VERSION);
 }
});

test('Actual new quote creation stores the latest authoritative price and ignores browser amounts',async()=>{
 const backend=fs.readFileSync(new URL('../supabase/functions/consumer-booking/index.ts',import.meta.url),'utf8');
 const source=backend.slice(backend.indexOf('function quoteView('),backend.indexOf('async function saveAvailability('));
 const policy={version:'2026-10-10',distanceBasis:'one_way_road',distanceBasisApproved:true,multipleVisits:'per_agreed_visit'};
 for(const [type,thermal,subtotal] of [['building_envelope',false,36179],['building_envelope',true,66429],['thermal',true,36179]]){
  for(const [distance,travel] of [[10000,0],[50000,4235],[100000,9075]]){
   const saved=[];
   const context={consumerProduct,LEGACY_CONSUMER_PRICING_VERSION,calculateTravel,POLICY:policy,TERMS:'2026-10-11-consumer-los',
    addressLookup:async()=>({street:'Teststraat',houseNumber:'1',postcode:'7311AA',city:'Apeldoorn',country:'NL'}),
    currentPlan:async()=>({route:{distanceMeters:distance},slots:[]}),acquisitionCampaign:()=>null,
    checked:async value=>value,saveAvailability:async()=>({slots:[]}),
    db:{from:table=>({insert:record=>{assert.equal(table,'consumer_quotes');saved.push(record);return {select:()=>({single:()=>({...record,id:'server-generated-quote'})})};}})}
   };
   vm.runInNewContext(stripTypeScriptTypes(source),context);
   const quote=await context.createQuote({inspectionType:type,thermal,totalCents:1,baseCents:1,thermalCents:1,pricingVersion:LEGACY_CONSUMER_PRICING_VERSION},'test');
   assert.equal(saved.length,1);
   assert.equal(saved[0].pricing_version,CONSUMER_PRICING_VERSION);
   assert.equal(saved[0].terms_version,'2026-10-11-consumer-los');
   assert.equal(saved[0].total_cents,subtotal+travel);
   assert.equal(quote.totalCents,subtotal+travel);
  }
 }
});
