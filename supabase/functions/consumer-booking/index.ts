import {createClient} from 'npm:@supabase/supabase-js@2';
import {calculateTravel} from '../_shared/consumer-travel-pricing.mjs';
import {UUID,TERMINAL,paymentBody,verifyPayment,checkoutHref,mayRetryCreation,customerInput,reconcilePayment} from '../_shared/consumer-payment.mjs';
import {sendDelivery} from '../_shared/parken-delivery.mjs';
import {TERMS_TEXT} from '../_shared/terms-20260924.mjs';
import {consumerAdminKeys,isConsumerAdmin} from '../_shared/consumer-admin.mjs';
import {earlyStartRequired,withdrawalLastDay,reportDueDay} from '../_shared/consumer-dates.mjs';
import {CONSUMER_TERMS} from '../_shared/consumer-terms-20261010.mjs';
import {googleExecutionError} from '../_shared/consumer-google.mjs';

// Deliberate TEST-ONLY gate. No environment switch can activate real payments.
// Live activation needs a reviewed code change after real chain verification.
const MODE='test';
const TERMS='2026-10-10-consumer';
const POLICY={version:'2026-10-10',distanceBasis:'one_way_road',distanceBasisApproved:true,multipleVisits:'per_agreed_visit'};
const env=(name:string)=>Deno.env.get(name)||'';
const adminKeys=consumerAdminKeys(env('SUPABASE_SERVICE_ROLE_KEY'),env('SUPABASE_SECRET_KEYS'));
const serviceKey=adminKeys.secret||adminKeys.legacy;
const db=createClient(env('SUPABASE_URL'),serviceKey,{auth:{persistSession:false}});
const base=env('SUPABASE_URL')+'/functions/v1/consumer-booking';
const now=()=>new Date().toISOString();
const sha=async(s:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))).map(v=>v.toString(16).padStart(2,'0')).join('');
const safeError=(e:any)=>/^[A-Z_0-9]+$/.test(e?.message||'')?e.message:'SERVICE_UNAVAILABLE';
async function checked(query:any){const {data,error}=await query;if(error)throw Error('STORAGE_UNAVAILABLE');return data;}
async function one(table:string,key:string,value:string){return await checked(db.from(table).select('*').eq(key,value).maybeSingle());}
async function bridge(action:string,data:any={}) {
 const deployment=env('CONSUMER_GOOGLE_DEPLOYMENT_ID'),client=env('CONSUMER_GOOGLE_CLIENT_ID'),secret=env('CONSUMER_GOOGLE_CLIENT_SECRET'),refresh=env('CONSUMER_GOOGLE_REFRESH_TOKEN');
 if(!/^[A-Za-z0-9_-]{20,}$/.test(deployment)||!client||!secret||!refresh)throw Error('CALENDAR_NOT_CONFIGURED');
 const auth=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
  body:new URLSearchParams({grant_type:'refresh_token',client_id:client,client_secret:secret,refresh_token:refresh}),signal:AbortSignal.timeout(10000)});
 const token=await auth.json();if(!auth.ok||!token.access_token)throw Error('CALENDAR_AUTH_REQUIRED');
 const response=await fetch('https://script.googleapis.com/v1/scripts/'+deployment+':run',{method:'POST',
  headers:{'Content-Type':'application/json',Authorization:'Bearer '+token.access_token},
  body:JSON.stringify({function:'executeRoofSignal',parameters:[{action,mode:MODE,...data}],devMode:false}),signal:AbortSignal.timeout(45000)});
 const operation=await response.json();
 if(!response.ok)throw Error('GOOGLE_API_HTTP_'+response.status+'_'+String(operation.error?.status||'ERROR').replace(/[^A-Z_]/g,''));
 if(operation.error){
  const detail=operation.error?.details?.[0];
  const error=Error(googleExecutionError(detail?.errorMessage));
  // Only the authenticated private test caller can see the Apps Script error.
  // This is an execution error, never an OAuth response or request payload.
  Object.assign(error,{diagnostic:{type:String(detail?.errorType||''),message:String(detail?.errorMessage||'').slice(0,400)}});
  throw error;
 }
 const result=operation.response?.result;if(result?.ok!==true)throw Error('CALENDAR_UNAVAILABLE');return result;
}
async function mollie(path:string,options:RequestInit={}) {
 const key=env('MOLLIE_TEST_API_KEY');if(!key)throw Error('PAYMENT_NOT_CONFIGURED');
 const response=await fetch('https://api.mollie.com/v2/payments'+path,{...options,headers:{Authorization:'Bearer '+key,'Content-Type':'application/json',...options.headers},signal:AbortSignal.timeout(18000)});
 const result=await response.json();
 if(!response.ok)throw Error('MOLLIE_HTTP_'+response.status);return result;
}
async function addressLookup(input:any) {
 const postcode=String(input?.postcode||'').replace(/\s/g,'').toUpperCase(),number=String(input?.houseNumber||'').trim().toUpperCase();
 if(!/^[1-9][0-9]{3}[A-Z]{2}$/.test(postcode)||! /^[1-9][0-9]{0,6}[ A-Z0-9/-]{0,12}$/.test(number))throw Error('INVALID_ADDRESS');
 const url=new URL('https://api.pdok.nl/bzk/locatieserver/search/v3_1/free');
 url.searchParams.append('fq','type:adres');url.searchParams.append('fq','postcode:'+postcode);url.searchParams.set('rows','100');
 const response=await fetch(url,{signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error('ADDRESS_UNAVAILABLE');
 const data=await response.json();
 const matches=(data.response?.docs||[]).filter((d:any)=>d.postcode===postcode&&d.huis_nlt?.replace(/\s/g,'').toUpperCase()===number.replace(/\s/g,''));
 if(matches.length!==1)throw Error('ADDRESS_NOT_UNIQUE');const found=matches[0];
 if(!found.straatnaam||!found.woonplaatsnaam)throw Error('ADDRESS_UNAVAILABLE');
 return {postcode,houseNumber:found.huis_nlt,street:found.straatnaam,city:found.woonplaatsnaam,country:'NL'};
}
function quoteView(q:any) {return {serviceable:true,quoteId:q.id,currency:'EUR',baseCents:36179,thermalCents:q.thermal?30250:0,travelCents:q.travel_cents,totalCents:q.total_cents,travelDescription:q.travel_description,expiresAt:q.expires_at,termsVersion:q.terms_version,address:q.address};}
async function createQuote(body:any) {
 if(typeof body.thermal!=='boolean')throw Error('INVALID_REQUEST');
 const address=await addressLookup(body.address),destination=`${address.street} ${address.houseNumber}, ${address.postcode} ${address.city}, Nederland`;
 const route=await bridge('route',{destination});const travel=calculateTravel(route.distanceMeters,POLICY,1);
 if(travel.status!=='ready')throw Error('OUTSIDE_ONLINE_AREA');
 const q=await checked(db.from('consumer_quotes').insert({mode:MODE,address,destination,thermal:body.thermal,distance_meters:route.distanceMeters,route,
  travel_cents:travel.travelCents,travel_description:travel.travelDescription,total_cents:36179+(body.thermal?30250:0)+travel.travelCents,
  terms_version:TERMS,policy_version:POLICY.version,expires_at:new Date(Date.now()+20*60000).toISOString()}).select('*').single());return quoteView(q);
}
async function availability(id:string) {
 if(!UUID.test(id))throw Error('INVALID_REQUEST');const q=await one('consumer_quotes','id',id);
 if(!q||q.mode!==MODE||Date.parse(q.expires_at)<=Date.now())throw Error('QUOTE_EXPIRED');
 const result=await bridge('availability',{destination:q.destination});
 const slots=result.slots.map((s:any)=>({quote_id:q.id,start_at:s.start,end_at:s.end,recommended:s.recommended===true,checked_at:now()}));
 if(!slots.length)return {quoteId:id,slots:[]};
 const saved=await checked(db.from('consumer_slots').upsert(slots,{onConflict:'quote_id,start_at'}).select('*'));
 return {quoteId:id,slots:saved.map((s:any)=>({id:s.id,start:s.start_at,end:s.end_at,recommended:s.recommended})),sourceCheckedAt:result.sourceCheckedAt};
}
async function claim(id:string,payload:any=null) {
 if(!UUID.test(id))throw Error('INVALID_REQUEST');
 return await checked(db.rpc('consumer_claim',{p_id:id,p_mode:MODE,p_payload:payload}));
}
async function save(a:any,patch:any) {
 const saved=await checked(db.from('consumer_attempts').update({...patch,updated_at:now()}).eq('id',a.id).eq('lease_token',a.lease_token).select('*').maybeSingle());
 if(!saved)throw Error('LEASE_LOST');return saved;
}
async function receipt(a:any,q:any,job:any) {
 const date=new Intl.DateTimeFormat('nl-NL',{dateStyle:'full',timeStyle:'short',timeZone:'Europe/Amsterdam'}).format(new Date(a.slot_start));
 const amount=new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(q.total_cents/100);
 const lines=['INTERNE TEST — geen echte opdracht of betalingsverplichting.',`Referentie: ${a.reference}`,`Inspectiemoment: ${date} (45 minuten)`,`Adres: ${q.destination}`,
  `Thermografie: ${q.thermal?'ja, één gecombineerd bezoek':'nee'}`,`Totaal inclusief btw: ${amount}`,q.travel_description,'Betaling in Mollie-testmodus gecontroleerd; afspraak geregistreerd.',
  'Uitvoering onder weer-, meet- en vliegvoorbehoud. Bij ongeschikt weer verplaatsen we kosteloos. Een vooraf gewenst afzonderlijk bezoek vereist een offerte met reiskosten per bezoek.',
  'Digitaal inspectierapport met beelden, bevindingen, beperkingen, onderhoudsprioriteiten en vervolgstappen, binnen twee werkdagen na de inspectie.',
  `Bij uitvoering op het geboekte moment is de uiterste rapportdatum: ${reportDueDay(a.slot_start)}.`,
  `Uw bedenktijd loopt tot en met ${withdrawalLastDay(a.terms_accepted_at)}. Herroepen kan via https://www.roofsignal.nl/herroepen of info@roofsignal.nl.`,
  a.terms.earlyStartRequested?'Uw vastgelegde keuze: beginnen tijdens de bedenktijd; bij herroeping een evenredig bedrag voor het geleverde deel. Na volledige uitvoering, inclusief het rapport, vervalt het herroepingsrecht.':'Geen verzoek om uitvoering binnen de bedenktijd.',
  `Akkoord vastgelegd: ${a.terms_accepted_at}`,`Voorwaarden: ${TERMS}`,'','Met vriendelijke groet,','RoofSignal'];
 const text=lines.join('\n');
 return {sender:{email:env('BREVO_FROM_EMAIL'),name:'RoofSignal'},to:[{email:'ferry@roofsignal.nl',name:'RoofSignal test'}],
  subject:`[TEST] ${job.recipient_kind==='customer'?'Klantbevestiging':'Nieuwe boeking'} ${a.reference}`,
  textContent:text,headers:{'X-Mailin-Track':'0',idempotencyKey:job.id},tags:['consumer-booking-test'],
  attachment:[{name:'RoofSignal-voorwaarden.txt',content:btoa(String.fromCharCode(...new TextEncoder().encode(TERMS_TEXT+'\n\n'+CONSUMER_TERMS)))}]};
}
async function deliver(a:any,q:any) {
 // Tests send only to the user's RoofSignal inbox, never the submitted address.
 if(env('CONSUMER_TEST_EMAIL_ENABLED')!=='true')return;
 const jobs=await checked(db.from('consumer_mail_outbox').select('*').eq('request_id',a.id).eq('status','pending'));
 for(const job of jobs){
  if(job.first_attempt_at&&Date.now()-Date.parse(job.first_attempt_at)>12*60000){await checked(db.from('consumer_mail_outbox').update({status:'review'}).eq('id',job.id));continue;}
  const payload=job.payload||await receipt(a,q,job);
  await checked(db.from('consumer_mail_outbox').update({payload,first_attempt_at:job.first_attempt_at||now()}).eq('id',job.id));
  const result=await sendDelivery(payload,env('BREVO_API_KEY'));
  await checked(db.from('consumer_mail_outbox').update({status:'accepted',accepted_at:now(),message_id:result.messageId}).eq('id',job.id));
 }
}
async function progress(initial:any,knownPayment:any=null) {
 let a=initial;const q=await one('consumer_quotes','id',a.quote_id);
 try{
  if(a.status==='confirmed'){await deliver(a,q);return await save(a,{last_error:null});}
  if(TERMINAL.has(a.status)&&a.status!=='paid_review_required')return a;
  if(!a.payment_id&&!knownPayment){
   if(!a.payment_started_at){
    let hold;
    try{hold=await bridge('hold',{requestId:a.id,start:a.slot_start,destination:q.destination});}
    catch(e){
     if(safeError(e)==='SLOT_UNAVAILABLE'){
      await bridge('release',{requestId:a.id,start:a.slot_start});
      return await save(a,{status:'not_created',close_code:'SLOT_UNAVAILABLE'});
     }throw e;
    }
    a=await save(a,{calendar_event_id:hold.eventId,payment_started_at:now(),key_fingerprint:await sha(env('MOLLIE_TEST_API_KEY')),payment_payload:paymentBody(a,q,base)});
   }
   if(!mayRetryCreation(a,await sha(env('MOLLIE_TEST_API_KEY'))))return await save(a,{status:'creation_review',last_error:'PAYMENT_CREATION_REQUIRES_REVIEW'});
   const payment=await mollie('',{method:'POST',headers:{'Idempotency-Key':a.id},body:JSON.stringify(a.payment_payload)});
   verifyPayment(payment,a,q);
   a=await save(a,{payment_id:payment.id,checkout_url:payment.status==='open'?checkoutHref(payment):null,payment_status:payment.status,status:'payment_pending'});
  }
  const payment=knownPayment||await mollie('/'+a.payment_id+'?testmode=true');
  a=await reconcilePayment({attempt:a,quote:q,payment,calendar:bridge,save:async(patch:any)=>{a=await save(a,{...patch,last_error:null});return a;}});
  if(a.status==='confirmed')await deliver(a,q);
  return a;
 }catch(e){
  a=await save(a,{last_error:safeError(e)});return a;
 }finally{
  await checked(db.from('consumer_attempts').update({lease_token:null,locked_until:null,next_attempt_at:new Date(Date.now()+60000).toISOString()}).eq('id',a.id).eq('lease_token',initial.lease_token));
 }
}
async function view(a:any) {
 if(a.status==='not_created')return {requestId:a.id,state:'not_created',code:'REQUEST_NOT_CREATED',reason:a.close_code,paymentCreated:false,requestClosed:true};
 const q=await one('consumer_quotes','id',a.quote_id);
 const identity={requestId:a.id,quoteId:a.quote_id,slotId:a.slot_id,reference:a.reference,currency:'EUR',totalCents:q.total_cents};
 if(TERMINAL.has(a.status))return {...identity,state:'closed',status:a.status,requestClosed:true};
 if(a.checkout_url&&a.payment_status==='open')return {...identity,state:'checkout_ready',checkoutUrl:a.checkout_url};
 return {requestId:a.id,state:'pending'};
}
async function checkout(body:any){
 if(!UUID.test(body.quoteId)||!UUID.test(body.slotId))throw Error('INVALID_REQUEST');
 const customer=customerInput(body);
 if(customer.email!=='ferry@roofsignal.nl')throw Error('TEST_EMAIL_REQUIRED');
 const q=await one('consumer_quotes','id',body.quoteId),s=await one('consumer_slots','id',body.slotId);
 if(!q||!s||s.quote_id!==q.id||q.terms_version!==body.terms.version||q.terms_version!==TERMS)throw Error('INVALID_REQUEST');
 if(earlyStartRequired(s.start_at)&&body.terms.earlyStartRequested!==true)throw Error('EARLY_START_REQUIRED');
 const payload={quoteId:q.id,slotId:s.id,customer,terms:body.terms};
 const result=await claim(body.requestId,{...payload,fingerprint:await sha(JSON.stringify(payload))});
 return await view(result.claimed?await progress(result.attempt):result.attempt);
}
Deno.serve(async(req:Request)=>{
 const origin=req.headers.get('origin')||'',headers={'Content-Type':'application/json','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex,nofollow',
  'Access-Control-Allow-Origin':origin==='https://www.roofsignal.nl'?origin:'https://www.roofsignal.nl','Access-Control-Allow-Headers':'content-type,authorization','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Vary':'Origin'};
 const respond=(v:any,status=200)=>new Response(JSON.stringify(v),{status,headers});
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(env('CONSUMER_TEST_ENABLED')!=='true')return respond({error:'De online boeking is nog niet beschikbaar.'},503);
 const url=new URL(req.url),path=url.pathname.split('/consumer-booking')[1]||'/';
 const admin=isConsumerAdmin(req.headers,adminKeys);
 try{
  if(path==='/webhook'&&req.method==='POST'){
   const raw=await req.text();if(raw.length>200)return respond({error:'INVALID_REQUEST'},400);
   const id=new URLSearchParams(raw).get('id')||'';if(!/^tr_[A-Za-z0-9]+$/.test(id))return respond({error:'INVALID_REQUEST'},400);
   const payment=await mollie('/'+id+'?testmode=true');const requestId=payment.metadata?.consumerRequestId;
   if(!UUID.test(requestId)||payment.metadata?.integration!=='roofsignal-consumer-v1')return respond({ok:true});
   const found=await one('consumer_attempts','id',requestId);if(!found||!found.payment_started_at)return respond({ok:true});
   const quote=await one('consumer_quotes','id',found.quote_id);verifyPayment(payment,found,quote);
   const job=await claim(requestId);if(!job.claimed)return respond({error:'RETRY'},503);
   const a=await progress(job.attempt,payment);
   return respond({ok:!a.last_error},a.last_error?503:200);
  }
  // Private test access only; no public quote, customer data, or real checkout.
  if(!admin)return respond({error:'TEST_ACCESS_REQUIRED'},403);
  if(path==='/health')return respond({ok:true,mode:MODE,calendar:await bridge('health')});
  if(path==='/availability'&&req.method==='GET')return respond(await availability(url.searchParams.get('quoteId')||''));
  if(path==='/status'&&req.method==='GET'){
   const token=url.searchParams.get('token')||'';if(!/^[a-f0-9]{64}$/.test(token))throw Error('INVALID_REQUEST');
   const found=await one('consumer_attempts','status_token',token);if(!found)throw Error('INVALID_REQUEST');
   const job=await claim(found.id);const a=job.claimed?await progress(job.attempt):job.attempt;
   return respond({status:['confirmed','paid_review_required','failed','canceled','expired'].includes(a.status)?a.status:a.payment_status||'pending'});
  }
  if(req.method!=='POST')return respond({error:'METHOD_NOT_ALLOWED'},405);
  const raw=await req.text();if(raw.length>12000)throw Error('INVALID_REQUEST');const body=JSON.parse(raw);
  if(path==='/quote')return respond(await createQuote(body));
  if(path==='/checkout')return respond(await checkout(body));
  if(path==='/recover'){
   const job=await claim(body.requestId);return respond(await view(job.claimed?await progress(job.attempt):job.attempt));
  }
  if(path==='/process'){
   const due=await checked(db.from('consumer_attempts').select('id').eq('mode',MODE).not('status','in','(not_created,failed,canceled,expired,confirmed)').lte('next_attempt_at',now()).order('next_attempt_at').limit(3));
   const mailDue=await checked(db.from('consumer_mail_outbox').select('request_id').eq('status','pending').limit(3));
   for(const mail of mailDue)if(!due.some((a:any)=>a.id===mail.request_id))due.push({id:mail.request_id});
   const results=[];for(const item of due){const job=await claim(item.id);if(job.claimed){const a=await progress(job.attempt);results.push({id:a.id,status:a.status,error:a.last_error});}}
   return respond({processed:results});
  }
  if(path==='/test-release'){
   if(!UUID.test(body.requestId))throw Error('INVALID_REQUEST');
   const a=await one('consumer_attempts','id',body.requestId);
   if(!a||a.mode!=='test'||!['confirmed','failed','canceled','expired'].includes(a.status))throw Error('TEST_RELEASE_NOT_ALLOWED');
   if(a.test_released_at)return respond({released:true});
   const job=await claim(a.id);
   if(a.status==='confirmed'&&!job.claimed)throw Error('TEST_RELEASE_BUSY');
   try{
    const result=await bridge('release',{requestId:a.id,start:a.slot_start});
    if(result.released!==true)throw Error('TEST_RELEASE_FAILED');
    await checked(db.from('consumer_mail_outbox').update({status:'canceled'}).eq('request_id',a.id).in('status',['pending','review']));
    await checked(db.from('consumer_attempts').update({test_released_at:now()}).eq('id',a.id).eq('mode','test'));
    return respond({released:true});
   }finally{
    if(job.claimed)await checked(db.from('consumer_attempts').update({lease_token:null,locked_until:null}).eq('id',a.id).eq('lease_token',job.attempt.lease_token));
   }
  }
  return respond({error:'NOT_FOUND'},404);
 }catch(e:any){return respond({error:safeError(e),...(admin&&e?.diagnostic?{diagnostic:e.diagnostic}:{})},503);}
});
