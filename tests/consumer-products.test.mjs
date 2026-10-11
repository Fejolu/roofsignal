import test from 'node:test';
import assert from 'node:assert/strict';
import {consumerProduct} from '../supabase/functions/_shared/consumer-products.mjs';
import {paymentBody,verifyPayment} from '../supabase/functions/_shared/consumer-payment.mjs';

test('Approved products calculate visual, combined and standalone thermal amounts',()=>{
 for(const [type,thermal,base,heat,total] of [
  ['building_envelope',false,36179,0,36179],
  ['building_envelope',true,36179,30250,66429],
  ['thermal',true,0,30250,30250]
 ]){
  const product=consumerProduct(type,thermal);
  assert.equal(product.baseCents,base);assert.equal(product.thermalCents,heat);assert.equal(product.subtotalCents,total);
 }
 assert.equal(consumerProduct(undefined,true).subtotalCents,66429,'Cached visual clients and historical quotes retain their base price');
});

test('Invalid product combinations cannot be converted into a cheap quote',()=>{
 for(const [type,thermal] of [['thermal',false],['thermal',undefined],['other',true],[null,true],['building_envelope','true'],['building_envelope',0]]){
  assert.throws(()=>consumerProduct(type,thermal),/INVALID_REQUEST/);
 }
});

test('Standalone thermal payment charges only saved thermal and travel amounts and names its service',()=>{
 const attempt={id:'601f78aa-31f3-4c63-941d-07b31df84902',quote_id:'thermal-quote',reference:'RS-TEST',mode:'test',status_token:'b'.repeat(64)};
 for(const travel of [0,4235,9075]){
  const quote={id:attempt.quote_id,inspection_type:'thermal',thermal:true,total_cents:30250+travel};
  const body=paymentBody(attempt,quote,'https://test.invalid');
  assert.equal(body.amount.value,((30250+travel)/100).toFixed(2));
  assert.match(body.description,/Thermische inspectie/);
  const payment={id:'tr_thermalTest',mode:'test',profileId:body.profileId,amount:body.amount,metadata:body.metadata,status:'open'};
  assert.equal(verifyPayment(payment,attempt,quote),payment);
  assert.throws(()=>verifyPayment({...payment,amount:{currency:'EUR',value:'664.29'}},attempt,quote),/PAYMENT_MISMATCH/);
 }
});
