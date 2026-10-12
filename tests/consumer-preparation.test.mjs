import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import {UUID,TERMINAL,paymentBody,verifyPayment,rememberCreatedPayment,mayRetryCreation,reconcilePayment} from '../supabase/functions/_shared/consumer-payment.mjs';
import {assertMode} from '../supabase/functions/_shared/consumer-access.mjs';

// Run the actual Edge Function workflow, not a duplicate implementation.
// Provider and storage boundaries are deterministic fault-injection doubles.
const backend=fs.readFileSync(new URL('../supabase/functions/consumer-booking/index.ts',import.meta.url),'utf8');
const progressSource=backend.slice(backend.indexOf('async function progress('),backend.indexOf('async function view('));
const discardSource=backend.slice(backend.indexOf('async function discardPreparation('),backend.indexOf('async function checkout('));
const viewSource=backend.slice(backend.indexOf('async function view('),backend.indexOf('async function prepare('));
assert.ok(progressSource.startsWith('async function progress('),'Actual payment progress function must be present');
const instant=Date.parse('2026-10-12T17:00:00Z');
const id='601f78aa-31f3-4c63-941d-07b31df84902';
const quoteId='b15c27e0-4d30-4fc6-bc54-4bba2499c895';
const slotId='fe741dc0-6013-45a0-9774-0db3a782b267';
const iso=offset=>new Date(instant+offset).toISOString();
const checkoutUrl='https://www.mollie.com/checkout/test-preparation-payment';
const customer={name:'[TEST] RoofSignal',email:'ferry@roofsignal.nl',phone:'0852128019'};
const terms={accepted:true,version:'2026-10-11-consumer-los',earlyStartRequested:true};

function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
function payment(status='open',overrides={}){
 return {id:'tr_preparation123',mode:'test',profileId:'pfl_Bef5DYX9w5',amount:{currency:'EUR',value:'361.79'},
  metadata:{consumerRequestId:id,quoteId,integration:'roofsignal-consumer-v1',mode:'test'},status,
  ...(status==='open'?{_links:{checkout:{href:checkoutUrl}}}:{}),...overrides};
}
function harness(options={}){
 let state={id,quote_id:quoteId,slot_id:slotId,reference:'RS-TEST-PREPARATION',mode:'test',status_token:'b'.repeat(64),
  slot_start:iso(2*86400000),status:'preparing',lease_token:'owned-lease',preparation_only:true,
  preparation_expires_at:iso(5*60000),preparation_ready_at:null,customer:null,terms:null,
  payment_id:null,payment_started_at:null,calendar_event_id:null,...options.attempt};
 const quote={id:quoteId,mode:'test',total_cents:36179,destination:'Eigen testadres, Apeldoorn',expires_at:iso(20*60000),...options.quote};
 const calls=[],replayedPayments=new WeakMap();let writes=[];
 class Clock extends Date{constructor(...args){super(...(args.length?args:[instant]));}static now(){return instant;}}
 function record(kind,data){calls.push({kind,...data});}
 const tableQuery=table=>{
  let operation='select',patch=null,filters=[],single=false;
  const chain={
   update(value){operation='update';patch=value;return chain;},select(){return chain;},
   eq(field,value){filters.push([field,value]);return chain;},is(field,value){filters.push([field,value]);return chain;},
   maybeSingle(){single=true;return chain;},
   then(resolve,reject){
    try{
     const value=table==='consumer_quotes'?quote:state;
     const matches=filters.every(([field,expected])=>value[field]===expected);
     let data=null;
     if(matches&&operation==='update'){
      record('database-final-update',{patch:{...patch}});state={...state,...patch};data=single?{...state}:[{...state}];
     }else if(matches)data=single?{...value}:[{...value}];
     return Promise.resolve({data,error:null}).then(resolve,reject);
    }catch(error){return Promise.reject(error).then(resolve,reject);}
   }
  };return chain;
 };
 const context={Date:Clock,UUID,TERMINAL,paymentBody,verifyPayment,rememberCreatedPayment,reconcilePayment,replayedPayments,assertMode,
  mayRetryCreation:(attempt,fingerprint)=>mayRetryCreation(attempt,fingerprint,instant),
  base:'https://example.test/functions/consumer-booking',now:()=>iso(0),
  sha:async()=> 'test-key-fingerprint',paymentKey:()=> 'private-test-key',
  safeError:error=>/^[A-Z_0-9]+$/.test(error?.message||'')?error.message:'SERVICE_UNAVAILABLE',
  db:{from:tableQuery,rpc:async(name,args)=>{
   assert.equal(name,'consumer_discard_preparation');assert.equal(args.p_id,id);assert.equal(args.p_mode,state.mode);
   record('rpc',{name});
   if(options.promoteDuringDiscard)state={...state,preparation_only:false,customer,terms,terms_accepted_at:iso(0),status:'payment_pending',payment_id:'tr_preparation123',payment_status:'open',checkout_url:checkoutUrl};
   if(!state.preparation_only)return {data:{claimed:false,attempt:{...state}},error:null};
   state={...state,preparation_expires_at:iso(-1),close_code:'PREPARATION_DISCARDED'};
   if(options.discardBusy)return {data:{claimed:false,attempt:{...state}},error:null};
   state={...state,lease_token:'discard-owned-lease'};
   return {data:{claimed:true,attempt:{...state}},error:null};
  }},checked:async query=>{const result=await query;if(result.error)throw Error('STORAGE_UNAVAILABLE');return result.data;},
  claim:async(requestId,payload,mode)=>{
   if(!options.allowRecoveryClaim)assert.fail('Discard must consume the lease returned by its RPC, never claim it a second time');
   assert.equal(requestId,id);assert.equal(payload,null,'Recovery must never reconstruct customer details or agreement');assertMode(state,mode);
   record('claim',{mode});state={...state,lease_token:'recovery-owned-lease'};
   return {claimed:true,attempt:{...state}};
  },
  one:async(table,field,value)=>{
   record('read',{table,field});
   const found=table==='consumer_quotes'?quote:table==='consumer_attempts'?state:null;
   return found&&found[field]===value?{...found}:null;
  },
  save:async(attempt,patch)=>{
   if(attempt.lease_token!==state.lease_token)throw Error('LEASE_LOST');
   record('save',{patch:{...patch}});writes.push({...patch});state={...state,...patch};return {...state};
  },
  bridge:async(action,data,mode)=>{
   record('calendar',{action,mode,requestId:data.requestId,start:data.start});
   if(options.bridge)return await options.bridge(action,data,mode,{state:()=>({...state}),update:patch=>state={...state,...patch}});
   return action==='hold'?{ok:true,eventId:'test-calendar-hold'}:{ok:true,released:true};
  },
  mollie:async(path,init,mode)=>{
   record('mollie',{path,method:init?.method||'GET',mode});
   const result=options.mollie?await options.mollie(path,init,mode):payment();
   replayedPayments.set(result,options.replayed===true&&init?.method==='POST');return result;
  },
  deliver:async()=>record('mail',{})
 };
 vm.runInNewContext(stripTypeScriptTypes(progressSource+'\n'+discardSource+'\n'+viewSource),context);
 return {calls,writes,state:()=>({...state}),promote:()=>state={...state,preparation_only:false,customer,terms,terms_accepted_at:iso(0)},
  run:knownPayment=>context.progress({...state},knownPayment),discard:()=>context.discardPreparation(id,'test'),
  recover:(mode='test')=>context.recoverAttempt(id,mode),update:patch=>state={...state,...patch}};
}
const providerCalls=app=>app.calls.filter(call=>call.kind==='mollie');
const calendarCalls=app=>app.calls.filter(call=>call.kind==='calendar').map(call=>call.action);

test('Preparing a chosen moment only holds the calendar; it never creates payment, agreement or mail',async()=>{
 const app=harness();await app.run();
 assert.deepEqual(calendarCalls(app),['hold']);assert.equal(providerCalls(app).length,0);
 const state=app.state();assert.equal(state.calendar_event_id,'test-calendar-hold');
 assert.ok(state.preparation_ready_at);assert.equal(state.payment_id,null);assert.equal(state.payment_started_at,null);
 assert.equal(state.customer,null);assert.equal(state.terms,null);assert.equal(app.calls.some(call=>call.kind==='mail'),false);
 assert.equal(state.lease_token,null,'Preparation releases its worker lease');
});

test('Payment submitted while preparation hold is in flight promotes the same request and creates once',async()=>{
 const reachedHold=deferred(),finishHold=deferred();
 const app=harness({bridge:async action=>{assert.equal(action,'hold');reachedHold.resolve();await finishHold.promise;return {ok:true,eventId:'test-calendar-hold'};}});
 const running=app.run();await reachedHold.promise;app.promote();finishHold.resolve();await running;
 assert.deepEqual(calendarCalls(app),['hold']);
 assert.equal(providerCalls(app).filter(call=>call.method==='POST').length,1);
 assert.equal(app.state().preparation_only,false);assert.equal(app.state().customer.email,customer.email);
 assert.equal(app.state().payment_id,'tr_preparation123');assert.equal(app.state().checkout_url,checkoutUrl);
});

test('Expired preparation releases its exact calendar hold and durably closes without payment',async()=>{
 const app=harness({attempt:{calendar_event_id:'test-calendar-hold',preparation_ready_at:iso(-60000),preparation_expires_at:iso(-1)}});
 await app.run();assert.deepEqual(calendarCalls(app),['release']);assert.equal(providerCalls(app).length,0);
 assert.equal(app.state().status,'not_created');assert.equal(app.state().payment_id,null);
 const release=app.calls.find(call=>call.kind==='calendar'&&call.action==='release');
 assert.equal(release.requestId,id);assert.equal(release.start,iso(2*86400000));assert.equal(release.mode,'test');
 assert.equal(app.calls.some(call=>call.kind==='mail'),false);
});

test('Discarded preparation during an in-flight hold is released before its request closes',async()=>{
 const reachedHold=deferred(),finishHold=deferred();
 const app=harness({bridge:async action=>{
  if(action==='hold'){reachedHold.resolve();await finishHold.promise;return {ok:true,eventId:'test-calendar-hold'};}
  assert.equal(action,'release');return {ok:true,released:true};
 }});
 const running=app.run();await reachedHold.promise;
 app.update({preparation_expires_at:iso(-1),close_code:'PREPARATION_DISCARDED'});finishHold.resolve();await running;
 assert.deepEqual(calendarCalls(app),['hold','release']);assert.equal(providerCalls(app).length,0);
 assert.equal(app.state().status,'not_created');assert.equal(app.state().payment_id,null);
 const releaseIndex=app.calls.findIndex(call=>call.kind==='calendar'&&call.action==='release');
 const closedIndex=app.calls.findIndex(call=>call.kind==='save'&&call.patch.status==='not_created');
 assert.ok(closedIndex>releaseIndex,'Capacity closes only after exact hold release has succeeded');
});

test('A failed preparation release remains pending and retryable without creating a payment',async()=>{
 let failing=true;
 const app=harness({attempt:{calendar_event_id:'test-calendar-hold',preparation_expires_at:iso(-1)},
  bridge:async action=>{assert.equal(action,'release');if(failing)throw Error('CALENDAR_RELEASE_OFFLINE');return {ok:true,released:true};}});
 await app.run();assert.equal(app.state().status,'preparing');assert.equal(app.state().last_error,'CALENDAR_RELEASE_OFFLINE');
 assert.equal(app.state().payment_id,null);assert.equal(providerCalls(app).length,0);
 failing=false;app.update({lease_token:'retry-lease'});await app.run();
 assert.equal(app.state().status,'not_created');assert.equal(app.state().last_error,null);
 assert.deepEqual(calendarCalls(app),['release','release']);
});

test('Actual discard handler consumes its RPC lease and releases the preparation exactly once',async()=>{
 const app=harness({attempt:{calendar_event_id:'test-calendar-hold',preparation_ready_at:iso(-1000)}});
 const result=await app.discard();assert.equal(result.discarded,true);assert.equal(result.pending,false);
 assert.equal(app.calls.filter(call=>call.kind==='rpc').length,1);assert.deepEqual(calendarCalls(app),['release']);
 assert.equal(providerCalls(app).length,0);assert.equal(app.state().status,'not_created');
 assert.equal(app.state().close_code,'PREPARATION_DISCARDED');
});

test('Actual discard handler leaves an active worker pending without stealing its lease or touching payment',async()=>{
 const app=harness({discardBusy:true,attempt:{calendar_event_id:'test-calendar-hold'}});
 const result=await app.discard();assert.equal(result.discarded,false);assert.equal(result.pending,true);
 assert.equal(app.state().lease_token,'owned-lease');assert.equal(app.state().close_code,'PREPARATION_DISCARDED');
 assert.deepEqual(calendarCalls(app),[]);assert.equal(providerCalls(app).length,0);
 assert.equal(app.writes.length,0,'The current worker will refresh and release its own discarded hold');
});

test('Actual discard handler cannot cancel a submitted payment or change its agreed customer and terms',async()=>{
 const app=harness({attempt:{preparation_only:false,status:'payment_pending',payment_id:'tr_preparation123',payment_status:'open',calendar_event_id:'test-calendar-hold',customer,terms}});
 const before=app.state(),result=await app.discard();assert.equal(result.discarded,false);assert.equal(result.pending,false);
 assert.deepEqual(app.state(),before);assert.deepEqual(calendarCalls(app),[]);assert.equal(providerCalls(app).length,0);assert.equal(app.writes.length,0);
});

test('Actual discard handler does not free capacity until failed calendar removal succeeds',async()=>{
 const app=harness({attempt:{calendar_event_id:'test-calendar-hold'},bridge:async action=>{assert.equal(action,'release');throw Error('CALENDAR_RELEASE_OFFLINE');}});
 const result=await app.discard();assert.equal(result.discarded,false);assert.equal(result.pending,true);
 assert.equal(app.state().status,'preparing');assert.equal(app.state().last_error,'CALENDAR_RELEASE_OFFLINE');
 assert.equal(app.state().calendar_event_id,'test-calendar-hold');assert.equal(providerCalls(app).length,0);
});

test('Actual opaque recovery fences an unsubmitted preparation without reconstructing customer or consent',async()=>{
 const app=harness({attempt:{calendar_event_id:'test-calendar-hold',preparation_ready_at:iso(-1000)}});
 const result=await app.recover();assert.equal(result.state,'not_created');assert.equal(result.requestClosed,true);assert.equal(result.paymentCreated,false);
 assert.equal(app.state().preparation_only,true);assert.equal(app.state().customer,null);assert.equal(app.state().terms,null);
 assert.equal(app.state().payment_id,null);assert.equal(providerCalls(app).length,0);assert.deepEqual(calendarCalls(app),['release']);
 assert.equal(app.calls.some(call=>call.kind==='claim'),false,'The discard RPC performs the fence and owns cleanup');
});

test('Actual opaque recovery preserves a final order accepted concurrently with its discard fence',async()=>{
 const app=harness({promoteDuringDiscard:true,attempt:{calendar_event_id:'test-calendar-hold',preparation_ready_at:iso(-1000)}});
 const result=await app.recover();assert.equal(result.state,'checkout_ready');assert.equal(result.checkoutUrl,checkoutUrl);
 assert.equal(app.state().preparation_only,false);assert.equal(app.state().customer.email,customer.email);assert.equal(app.state().terms.accepted,true);
 assert.equal(app.state().payment_id,'tr_preparation123');assert.equal(app.state().status,'payment_pending');
 assert.deepEqual(calendarCalls(app),[]);assert.equal(providerCalls(app).length,0);assert.equal(app.writes.length,0);
});

test('Actual preparation recovery rejects the wrong mode before fencing or provider access',async()=>{
 const app=harness({attempt:{calendar_event_id:'test-calendar-hold'}}),before=app.state();
 await assert.rejects(app.recover('live'),/INVALID_REQUEST/);
 assert.deepEqual(app.state(),before);assert.equal(app.calls.some(call=>call.kind==='rpc'||call.kind==='claim'),false);
 assert.deepEqual(calendarCalls(app),[]);assert.equal(providerCalls(app).length,0);
});

test('Actual bound-order recovery claims normal processing and only reads its existing provider payment',async()=>{
 const app=harness({allowRecoveryClaim:true,attempt:{preparation_only:false,status:'payment_pending',payment_id:'tr_preparation123',payment_status:'open',calendar_event_id:'test-calendar-hold',customer,terms}});
 const result=await app.recover();assert.equal(result.state,'checkout_ready');assert.equal(result.checkoutUrl,checkoutUrl);
 assert.equal(app.calls.filter(call=>call.kind==='claim').length,1);assert.equal(app.calls.some(call=>call.kind==='rpc'),false);
 assert.deepEqual(providerCalls(app).map(call=>call.method),['GET']);assert.deepEqual(calendarCalls(app),[]);
 assert.equal(app.state().payment_id,'tr_preparation123');assert.equal(app.state().customer.email,customer.email);assert.equal(app.state().terms.accepted,true);
});

test('Final checkout reuses its existing prepared calendar hold without a second Google hold',async()=>{
 const app=harness({attempt:{preparation_only:false,calendar_event_id:'test-calendar-hold',preparation_ready_at:iso(-1000),customer,terms,terms_accepted_at:iso(0)}});
 await app.run();assert.deepEqual(calendarCalls(app),[]);
 assert.equal(providerCalls(app).filter(call=>call.method==='POST').length,1);
 assert.equal(providerCalls(app).filter(call=>call.method==='GET').length,0,'A fresh creation response already proves current open status');
 assert.equal(app.state().checkout_url,checkoutUrl);assert.equal(app.state().payment_id,'tr_preparation123');
});

test('An idempotent POST replay reads current payment status before confirming or redirecting',async()=>{
 const app=harness({attempt:{preparation_only:false,calendar_event_id:'test-calendar-hold',customer,terms},replayed:true,
  mollie:async(_path,init)=>payment(init?.method==='POST'?'open':'paid')});
 await app.run();assert.deepEqual(providerCalls(app).map(call=>call.method),['POST','GET']);
 assert.deepEqual(calendarCalls(app),['confirm']);assert.equal(app.state().status,'confirmed');assert.equal(app.state().checkout_url,null);
});

test('Recovery after interrupted creation GETs the current status even without a replay header',async()=>{
 const app=harness({attempt:{preparation_only:false,calendar_event_id:'test-calendar-hold',customer,terms,
   payment_started_at:iso(-1000),key_fingerprint:'test-key-fingerprint',payment_payload:{existing:true}},
  mollie:async(_path,init)=>payment(init?.method==='POST'?'open':'expired')});
 await app.run();assert.deepEqual(providerCalls(app).map(call=>call.method),['POST','GET']);
 assert.deepEqual(calendarCalls(app),['release']);assert.equal(app.state().status,'expired');assert.equal(app.state().checkout_url,null);
});

test('Preparation refuses a supplied provider payment without holding, confirming or sending mail',async()=>{
 const app=harness();await app.run(payment('paid'));
 assert.equal(providerCalls(app).length,0);assert.deepEqual(calendarCalls(app),[]);
 assert.equal(app.state().last_error,'PREPARATION_PAYMENT_FORBIDDEN');assert.equal(app.state().payment_id,null);
 assert.equal(app.calls.some(call=>call.kind==='mail'),false);
});

test('A paid payment still performs a fresh calendar confirmation before sending its receipt',async()=>{
 const app=harness({attempt:{preparation_only:false,calendar_event_id:'test-calendar-hold',payment_id:'tr_preparation123',payment_status:'open',customer,terms}});
 await app.run(payment('paid'));
 assert.deepEqual(calendarCalls(app),['confirm']);assert.equal(providerCalls(app).length,0);
 const milestones=app.calls.filter(call=>call.kind==='calendar'||call.kind==='mail'||call.kind==='save'&&['paid_review_required','confirmed'].includes(call.patch.status));
 assert.deepEqual(milestones.map(call=>call.kind==='save'?call.patch.status:call.kind==='calendar'?call.action:call.kind),['paid_review_required','confirm','confirmed','mail']);
 assert.equal(app.state().status,'confirmed');
});

test('A malformed provider checkout URL retains the payment identity and never repeats creation',async()=>{
 let valid=false;
 const app=harness({attempt:{preparation_only:false,calendar_event_id:'test-calendar-hold',customer,terms},
  mollie:async()=>payment('open',{_links:{checkout:{href:valid?checkoutUrl:'https://attacker.invalid/pay'}}})});
 await app.run();assert.equal(app.state().payment_id,'tr_preparation123');assert.equal(app.state().checkout_url,null);
 assert.equal(app.state().last_error,'INVALID_CHECKOUT_URL');
 // A newly acquired lease represents the next legitimate worker recovery.
 app.update({lease_token:'recovery-lease'});valid=true;await app.run();
 assert.equal(providerCalls(app).filter(call=>call.method==='POST').length,1,'Recovery fetches the durable payment instead of creating another');
 assert.equal(app.state().checkout_url,checkoutUrl);
});
