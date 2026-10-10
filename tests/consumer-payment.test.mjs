import test from 'node:test';
import assert from 'node:assert/strict';
import {paymentBody,verifyPayment,mayRetryCreation,reconcilePayment,checkoutHref} from '../supabase/functions/_shared/consumer-payment.mjs';
const id='601f78aa-31f3-4c63-941d-07b31df84902';
const a=()=>({id,quote_id:'q1',reference:'RS-123456',mode:'test',status_token:'b'.repeat(64),slot_start:'2026-10-20T10:00:00Z',status:'payment_pending',lease_token:'lock'});
const q={id:'q1',total_cents:66429,destination:'Testadres, Apeldoorn'};
const p=(status='paid')=>({id:'tr_example123',mode:'test',profileId:'pfl_Bef5DYX9w5',amount:{currency:'EUR',value:'664.29'},metadata:{consumerRequestId:id,quoteId:'q1',integration:'roofsignal-consumer-v1',mode:'test'},status});
test('Mollie amount and metadata use saved server quote and restrict to iDEAL',()=>{
 const result=paymentBody(a(),q,'https://example.com');assert.deepEqual(result.amount,{currency:'EUR',value:'664.29'});assert.equal(result.testmode,true);assert.equal(result.method,'ideal');assert.equal(result.metadata.consumerRequestId,id);
});
test('payment verification rejects amount, profile, mode, request, currency and identifier mismatches',()=>{
 for(const mutate of [v=>v.amount.value='664.28',v=>v.profileId='other',v=>v.mode='live',v=>v.metadata.consumerRequestId='other',v=>v.metadata.mode='live',v=>v.amount.currency='USD',v=>v.id='invalid']){
  const payment=p();mutate(payment);assert.throws(()=>verifyPayment(payment,a(),q));
 }
 assert.throws(()=>verifyPayment(p(),{...a(),payment_id:'tr_other'},q));
});
test('no payment create retry after own durable window, credential rotation or known provider ID',()=>{
 const now=Date.parse('2026-10-10T12:00:00Z'),base={...a(),key_fingerprint:'key',payment_started_at:new Date(now-1000).toISOString()};
 assert.equal(mayRetryCreation(base,'key',now),true);
 assert.equal(mayRetryCreation({...base,payment_started_at:new Date(now-41*60000).toISOString()},'key',now),false);
 assert.equal(mayRetryCreation(base,'rotated',now),false);
 assert.equal(mayRetryCreation({...base,payment_id:'tr_example123'},'key',now),false);
});
test('paid status is stored before calendar confirmation; network failure remains explicit review',async()=>{
 let state=a();const steps=[];
 const result=await reconcilePayment({attempt:state,quote:q,payment:p(),save:async patch=>{steps.push(patch.status);state={...state,...patch};return state;},calendar:async()=>{steps.push('calendar');throw Error('offline');}});
 assert.deepEqual(steps,['paid_review_required','calendar']);assert.equal(result.status,'paid_review_required');assert.equal(result.payment_status,'paid');
});
test('confirmed payment can only follow successful calendar check',async()=>{
 let state=a();const steps=[];
 const result=await reconcilePayment({attempt:state,quote:q,payment:p(),save:async patch=>{steps.push(patch.status);state={...state,...patch};return state;},calendar:async action=>{steps.push(action);}});
 assert.deepEqual(steps,['paid_review_required','confirm','confirmed']);assert.equal(result.status,'confirmed');
});
test('cancel/expiry/failure only release after verified payment and successful calendar removal',async()=>{
 for(const status of ['canceled','expired','failed']){
  let saved=false;
  await assert.rejects(reconcilePayment({attempt:a(),quote:q,payment:p(status),calendar:async()=>{throw Error('offline');},save:async()=>{saved=true;}}));assert.equal(saved,false);
  const steps=[];let state=a();
  await reconcilePayment({attempt:state,quote:q,payment:p(status),calendar:async action=>steps.push(action),save:async patch=>{steps.push(patch.status);state={...state,...patch};return state;}});
  assert.deepEqual(steps,['release',status]);
 }
});
test('open payment never confirms or releases an appointment; paid cannot regress',async()=>{
 const result=await reconcilePayment({attempt:a(),quote:q,payment:p('open'),calendar:async()=>assert.fail('no calendar mutation'),save:async patch=>({...a(),...patch})});
 assert.equal(result.status,'payment_pending');
 await assert.rejects(reconcilePayment({attempt:{...a(),payment_status:'paid'},quote:q,payment:p('expired'),calendar:async()=>assert.fail(),save:async()=>assert.fail()}));
});
test('checkout redirects only to exact HTTPS Mollie hosts',()=>{
 for(const href of ['http://www.mollie.com/pay','https://www.mollie.com.bad.example/pay','https://evil@www.mollie.com/pay'])assert.throws(()=>checkoutHref({_links:{checkout:{href}}}));
 assert.equal(checkoutHref({_links:{checkout:{href:'https://www.mollie.com/checkout/test'}}}),'https://www.mollie.com/checkout/test');
});
