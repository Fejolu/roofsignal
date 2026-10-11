import {createClient} from 'npm:@supabase/supabase-js@2';
import {calculateTravel} from '../_shared/consumer-travel-pricing.mjs';
import {UUID,TERMINAL,paymentBody,verifyPayment,checkoutHref,mayRetryCreation,customerInput,reconcilePayment} from '../_shared/consumer-payment.mjs';
import {sendDelivery} from '../_shared/parken-delivery.mjs';
import {TERMS_TEXT} from '../_shared/terms-20260924.mjs';
import {consumerAdminKeys,isConsumerAdmin} from '../_shared/consumer-admin.mjs';
import {daysAfterWithdrawal,assertAfterWithdrawal,withdrawalLastDay,reportDueDay} from '../_shared/consumer-dates.mjs';
import {CONSUMER_TERMS as LEGACY_CONSUMER_TERMS} from '../_shared/consumer-terms-20261010.mjs';
import {CONSUMER_TERMS as PREVIOUS_CONSUMER_TERMS} from '../_shared/consumer-terms-20261011.mjs';
import {CONSUMER_TERMS} from '../_shared/consumer-terms-20261011betalen.mjs';
import {googleExecutionError,googleTokenProvider} from '../_shared/consumer-google.mjs';
import {planAvailability} from '../_shared/consumer-availability.mjs';
import {consumerMode,verifiedChallenge,assertMode,publicError} from '../_shared/consumer-access.mjs';
import {acquisitionCampaign} from '../_shared/consumer-acquisition.mjs';

// Private tests and public live bookings use separate credentials and records.
// Public creation remains disabled until CONSUMER_LIVE_ENABLED is set explicitly.
const TERMS='2026-10-11-consumer-pay';
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
const googleToken=googleTokenProvider(async()=>{
 const client=env('CONSUMER_GOOGLE_CLIENT_ID'),secret=env('CONSUMER_GOOGLE_CLIENT_SECRET'),refresh=env('CONSUMER_GOOGLE_REFRESH_TOKEN');
 if(!client||!secret||!refresh)throw Error('CALENDAR_NOT_CONFIGURED');
 const auth=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
  body:new URLSearchParams({grant_type:'refresh_token',client_id:client,client_secret:secret,refresh_token:refresh}),signal:AbortSignal.timeout(10000)});
 const token=await auth.json();if(!auth.ok||!token.access_token)throw Error('CALENDAR_AUTH_REQUIRED');return token;
});
async function bridge(action:string,data:any={},mode='test') {
 const deployment=env('CONSUMER_GOOGLE_DEPLOYMENT_ID');
 if(!/^[A-Za-z0-9_-]{20,}$/.test(deployment))throw Error('CALENDAR_NOT_CONFIGURED');
 const token=await googleToken([env('CONSUMER_GOOGLE_CLIENT_ID'),env('CONSUMER_GOOGLE_CLIENT_SECRET'),env('CONSUMER_GOOGLE_REFRESH_TOKEN')].join('\n'));
 const response=await fetch('https://script.googleapis.com/v1/scripts/'+deployment+':run',{method:'POST',
  headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
  body:JSON.stringify({function:'executeRoofSignal',parameters:[{...data,action,mode}],devMode:false}),signal:AbortSignal.timeout(45000)});
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
const paymentKey=(mode:string)=>env(mode==='test'?'MOLLIE_TEST_API_KEY':'MOLLIE_CONSUMER_LIVE_API_KEY');
async function mollie(path:string,options:RequestInit={},mode='test') {
 const key=paymentKey(mode);if(!key)throw Error('PAYMENT_NOT_CONFIGURED');
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
async function createQuote(body:any,mode:string) {
 if(typeof body.thermal!=='boolean')throw Error('INVALID_REQUEST');
 const address=await addressLookup(body.address),destination=`${address.street} ${address.houseNumber}, ${address.postcode} ${address.city}, Nederland`;
 const plan=await currentPlan(destination,mode),route=plan.route;
 const travel=calculateTravel(route.distanceMeters,POLICY,1);
 if(travel.status!=='ready')throw Error('OUTSIDE_ONLINE_AREA');
 const q=await checked(db.from('consumer_quotes').insert({mode,address,destination,thermal:body.thermal,distance_meters:route.distanceMeters,route,campaign:acquisitionCampaign(body.campaign),
  travel_cents:travel.travelCents,travel_description:travel.travelDescription,total_cents:36179+(body.thermal?30250:0)+travel.travelCents,
  terms_version:TERMS,policy_version:POLICY.version,expires_at:new Date(Date.now()+20*60000).toISOString()}).select('*').single());
 return {...quoteView(q),availability:await saveAvailability(q,plan)};
}
async function saveAvailability(q:any,result:any) {
 const slots=result.slots.map((s:any)=>({quote_id:q.id,start_at:s.start,end_at:s.end,recommended:s.recommended===true,checked_at:now()}));
 if(!slots.length)return {quoteId:q.id,slots:[],sourceCheckedAt:result.sourceCheckedAt};
 const saved=await checked(db.from('consumer_slots').upsert(slots,{onConflict:'quote_id,start_at'}).select('*'));
 return {quoteId:q.id,slots:saved.map((s:any)=>({id:s.id,start:s.start_at,end:s.end_at,recommended:s.recommended})),sourceCheckedAt:result.sourceCheckedAt};
}
async function availability(id:string,mode:string) {
 if(!UUID.test(id))throw Error('INVALID_REQUEST');const q=await one('consumer_quotes','id',id);
 assertMode(q,mode);if(Date.parse(q.expires_at)<=Date.now())throw Error('QUOTE_EXPIRED');
 return await saveAvailability(q,await currentPlan(q.destination,mode));
}
async function currentPlan(destination:string,mode:string) {
 const context=await bridge('context',{destination},mode);
 // New online bookings start only after the full Dutch withdrawal deadline.
 // Filter before route planning to avoid calculating trips for ineligible days.
 const days=daysAfterWithdrawal(context.days);
 return await planAvailability({context:{...context,days},destination,route:(from:string,to:string)=>bridge('route',{from,destination:to},mode)});
}
async function claim(id:string,payload:any=null,mode='test') {
 if(!UUID.test(id))throw Error('INVALID_REQUEST');
 return await checked(db.rpc('consumer_claim',{p_id:id,p_mode:mode,p_payload:payload}));
}
async function save(a:any,patch:any) {
 const saved=await checked(db.from('consumer_attempts').update({...patch,updated_at:now(),locked_until:new Date(Date.now()+120000).toISOString()}).eq('id',a.id).eq('lease_token',a.lease_token).select('*').maybeSingle());
 if(!saved)throw Error('LEASE_LOST');return saved;
}
async function receipt(a:any,q:any,job:any) {
 const date=new Intl.DateTimeFormat('nl-NL',{dateStyle:'full',timeStyle:'short',timeZone:'Europe/Amsterdam'}).format(new Date(a.slot_start));
 const amount=new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(q.total_cents/100);
 const test=a.mode==='test';
 const lines=[test?'INTERNE TEST — geen echte opdracht of betalingsverplichting.':'Uw betaling is ontvangen en uw inspectie is ingepland.',`Referentie: ${a.reference}`,`Inspectiemoment: ${date} (45 minuten)`,`Adres: ${q.destination}`,
  `Thermografie: ${q.thermal?'ja, één gecombineerd bezoek':'nee'}`,`Totaal inclusief btw: ${amount}`,q.travel_description,test?'Betaling in Mollie-testmodus gecontroleerd; afspraak geregistreerd.':'Betaling via Mollie gecontroleerd.',
  'Uitvoering onder weer-, meet- en vliegvoorbehoud. Bij ongeschikt weer verplaatsen we kosteloos. Een vooraf gewenst afzonderlijk bezoek vereist een offerte met reiskosten per bezoek.',
  'Digitaal inspectierapport met beelden, bevindingen, beperkingen, onderhoudsprioriteiten en vervolgstappen, binnen twee werkdagen na de inspectie.',
  `Bij uitvoering op het geboekte moment is de uiterste rapportdatum: ${reportDueDay(a.slot_start)}.`,
  `Uw bedenktijd loopt tot en met ${withdrawalLastDay(a.terms_accepted_at)}. Herroepen kan via https://www.roofsignal.nl/herroepen of info@roofsignal.nl.`,
  a.terms.earlyStartRequested?'Uw vastgelegde keuze: beginnen tijdens de bedenktijd; bij herroeping een evenredig bedrag voor het geleverde deel. Na volledige uitvoering, inclusief het rapport, vervalt het herroepingsrecht.':'Uw inspectie vindt plaats na de bedenktijd.',
  `Akkoord vastgelegd: ${a.terms_accepted_at}`,`Voorwaarden: ${q.terms_version}`,'','Met vriendelijke groet,','RoofSignal'];
 if(job.recipient_kind==='internal')lines.unshift(`Campagne: ${acquisitionCampaign(q.campaign)||'herkomst onbekend'}`,`Klant: ${a.customer.name}`,`E-mail: ${a.customer.email}`,`Telefoon: ${a.customer.phone}`,`Bijzonderheden: ${a.customer.notes||'Geen'}`);
 const text=lines.join('\n');
 const customer=job.recipient_kind==='customer';
 const termsVersions:Record<string,string>={'2026-10-10-consumer':LEGACY_CONSUMER_TERMS,'2026-10-11-consumer':PREVIOUS_CONSUMER_TERMS,[TERMS]:CONSUMER_TERMS};
 const consumerTerms=termsVersions[q.terms_version];
 if(!consumerTerms)throw Error('TERMS_VERSION_UNAVAILABLE');
 const attachmentContent=btoa(String.fromCharCode(...new TextEncoder().encode(TERMS_TEXT+'\n\n'+consumerTerms)));
 return {sender:{email:env('BREVO_FROM_EMAIL'),name:'RoofSignal'},to:[{email:test||!customer?'ferry@roofsignal.nl':a.customer.email,name:test||!customer?'RoofSignal':a.customer.name}],
  subject:`${test?'[TEST] ':''}${customer?'Bevestiging van uw inspectie':'Nieuwe boeking'} ${a.reference}`,
  textContent:text,headers:{'X-Mailin-Track':'0',idempotencyKey:job.id},tags:['consumer-booking-'+a.mode],
  attachment:[{name:'RoofSignal-voorwaarden.txt',content:attachmentContent}]};
}
async function deliver(a:any,q:any) {
 // Tests send only to the user's RoofSignal inbox, never the submitted address.
 if(a.mode==='test'&&env('CONSUMER_TEST_EMAIL_ENABLED')!=='true')return;
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
 const calendar=(action:string,data:any)=>bridge(action,data,a.mode);
 try{
  if(a.status==='confirmed'){await deliver(a,q);return await save(a,{last_error:null});}
  if(TERMINAL.has(a.status)&&a.status!=='paid_review_required')return a;
  if(!a.payment_id&&!knownPayment){
   if(!a.payment_started_at){
    let hold;
    try{hold=await calendar('hold',{requestId:a.id,start:a.slot_start,destination:q.destination});}
    catch(e){
     if(safeError(e)==='SLOT_UNAVAILABLE'){
      await calendar('release',{requestId:a.id,start:a.slot_start});
      return await save(a,{status:'not_created',close_code:'SLOT_UNAVAILABLE'});
     }throw e;
    }
    a=await save(a,{calendar_event_id:hold.eventId,payment_started_at:now(),key_fingerprint:await sha(paymentKey(a.mode)),payment_payload:paymentBody(a,q,base)});
   }
   if(!mayRetryCreation(a,await sha(paymentKey(a.mode))))return await save(a,{status:'creation_review',last_error:'PAYMENT_CREATION_REQUIRES_REVIEW'});
   const payment=await mollie('',{method:'POST',headers:{'Idempotency-Key':a.id},body:JSON.stringify(a.payment_payload)},a.mode);
   verifyPayment(payment,a,q);
   a=await save(a,{payment_id:payment.id,checkout_url:payment.status==='open'?checkoutHref(payment):null,payment_status:payment.status,status:'payment_pending'});
  }
  const payment=knownPayment||await mollie('/'+a.payment_id+(a.mode==='test'?'?testmode=true':''),{},a.mode);
  a=await reconcilePayment({attempt:a,quote:q,payment,calendar,save:async(patch:any)=>{a=await save(a,{...patch,last_error:null});return a;}});
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
async function checkout(body:any,mode:string){
 if(!UUID.test(body.quoteId)||!UUID.test(body.slotId))throw Error('INVALID_REQUEST');
 const customer=customerInput(body);
 if(mode==='test'&&customer.email!=='ferry@roofsignal.nl')throw Error('TEST_EMAIL_REQUIRED');
 const q=await one('consumer_quotes','id',body.quoteId),s=await one('consumer_slots','id',body.slotId);
 assertMode(q,mode);if(!s||s.quote_id!==q.id||q.terms_version!==body.terms.version||q.terms_version!==TERMS)throw Error('INVALID_REQUEST');
 assertAfterWithdrawal(s.start_at);
 if(body.terms.earlyStartRequested!==false)throw Error('INVALID_REQUEST');
 const payload={quoteId:q.id,slotId:s.id,customer,terms:body.terms};
 const result=await claim(body.requestId,{...payload,fingerprint:await sha(JSON.stringify(payload))},mode);
 return await view(result.claimed?await progress(result.attempt):result.attempt);
}
async function limit(bucket:string,max:number,seconds=60) {
 const key='consumer:'+bucket+':'+Math.floor(Date.now()/(seconds*1000));
 if(!await checked(db.rpc('consumer_rate_limit',{p_bucket:key,p_limit:max})))throw Error('RATE_LIMITED');
}
async function challenge(token:any) {
 const secret=env('TURNSTILE_SECRET_KEY');
 if(!secret||typeof token!=='string'||token.length>2048||!token)throw Error('CHALLENGE_REQUIRED');
 const response=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({secret,response:token}),signal:AbortSignal.timeout(12000)});
 if(!response.ok||!verifiedChallenge(await response.json()))throw Error('CHALLENGE_REQUIRED');
}
async function processDue() {
 const due=await checked(db.from('consumer_attempts').select('id,mode').is('test_released_at',null).not('status','in','(not_created,failed,canceled,expired,confirmed)').lte('next_attempt_at',now()).order('next_attempt_at').limit(1));
 const mailDue=await checked(db.from('consumer_mail_outbox').select('request_id,consumer_attempts!inner(mode,test_released_at)').eq('status','pending').is('consumer_attempts.test_released_at',null).limit(1));
 for(const mail of mailDue)if(!due.some((a:any)=>a.id===mail.request_id))due.push({id:mail.request_id,mode:mail.consumer_attempts.mode});
 const results=[];for(const item of due){const job=await claim(item.id,null,item.mode);if(job.claimed){const a=await progress(job.attempt);results.push({status:a.status,error:a.last_error});}}
 // Counts only: scheduler logs never contain addresses, email or tokens.
 const review=await checked(db.from('consumer_attempts').select('id').eq('mode','live').is('test_released_at',null)
  .or('status.in.(creation_review,paid_review_required),and(last_error.not.is.null,created_at.lt.'+new Date(Date.now()-10*60000).toISOString()+')'));
 const mailReview=await checked(db.from('consumer_mail_outbox').select('id,consumer_attempts!inner(mode)').eq('status','review').eq('consumer_attempts.mode','live'));
 return {ok:review.length===0&&mailReview.length===0,processed:results,reviewCount:review.length,mailReviewCount:mailReview.length};
}
Deno.serve(async(req:Request)=>{
 const origin=req.headers.get('origin')||'',headers={'Content-Type':'application/json','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex,nofollow',
  'Access-Control-Allow-Origin':['https://www.roofsignal.nl','https://roofsignal.nl'].includes(origin)?origin:'https://www.roofsignal.nl','Access-Control-Allow-Headers':'content-type','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Vary':'Origin'};
 const respond=(v:any,status=200)=>new Response(JSON.stringify(v),{status,headers});
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 const url=new URL(req.url),path=url.pathname.split('/consumer-booking')[1]||'/';
 const admin=isConsumerAdmin(req.headers,adminKeys);
 try{
  const mode=consumerMode(admin,req.headers.get('x-consumer-mode'));
  const worker=!!env('CONSUMER_AUTOMATION_SECRET')&&req.headers.get('x-automation-secret')===env('CONSUMER_AUTOMATION_SECRET');
  if(path==='/process'&&req.method==='POST'){
   if(!admin&&!worker)return respond({error:'ACCESS_DENIED'},403);
   return respond(await processDue());
  }
  if(path==='/webhook'&&req.method==='POST'){
   const paymentMode=url.searchParams.get('mode')||'test';
   if(!['test','live'].includes(paymentMode))throw Error('INVALID_REQUEST');
   await limit('webhook',120);
   const raw=await req.text();if(raw.length>200)return respond({error:'INVALID_REQUEST'},400);
   const id=new URLSearchParams(raw).get('id')||'';if(!/^tr_[A-Za-z0-9]+$/.test(id))return respond({error:'INVALID_REQUEST'},400);
   const payment=await mollie('/'+id+(paymentMode==='test'?'?testmode=true':''),{},paymentMode);const requestId=payment.metadata?.consumerRequestId;
   if(!UUID.test(requestId)||payment.metadata?.integration!=='roofsignal-consumer-v1')return respond({ok:true});
   const found=await one('consumer_attempts','id',requestId);if(!found||!found.payment_started_at)return respond({ok:true});
   assertMode(found,paymentMode);if(found.test_released_at)return respond({ok:true});
   const quote=await one('consumer_quotes','id',found.quote_id);verifyPayment(payment,found,quote);
   const job=await claim(requestId,null,paymentMode);if(!job.claimed)return respond({ok:true});
   const a=await progress(job.attempt,payment);
   return respond({ok:!a.last_error},a.last_error?503:200);
  }
  if(path==='/health'){
   if(!admin)return respond({error:'ACCESS_DENIED'},403);
   return respond({ok:true,mode,calendar:await bridge('health',{},mode)});
  }
  if(!admin){
   if(env('CONSUMER_LIVE_ENABLED')!=='true')return respond({error:'Online boeken wordt nog ingericht. Neem voor een inspectie contact op met RoofSignal.'},503);
   if(!['https://www.roofsignal.nl','https://roofsignal.nl'].includes(origin))return respond({error:'ACCESS_DENIED'},403);
   const salt=env('FORM_RATE_LIMIT_SALT');if(!salt)throw Error('SECURITY_NOT_CONFIGURED');
   // IP is defense in depth. The global cap, one-use challenge and capability
   // limits also apply, so spoofing a forwarding header grants no bypass.
   const ip=(req.headers.get('x-forwarded-for')||'unknown').slice(0,200);
   await limit('public',180);
   await limit('ip:'+await sha(salt+':'+ip),30);
  }else if(mode==='test'&&env('CONSUMER_TEST_ENABLED')!=='true')return respond({error:'TEST_DISABLED'},403);
  if(path==='/availability'&&req.method==='GET'){
   const id=url.searchParams.get('quoteId')||'';if(!UUID.test(id))throw Error('INVALID_REQUEST');
   if(!admin)await limit('availability:'+id,4,1200);
   return respond(await availability(id,mode));
  }
  if(path==='/status'&&req.method==='GET'){
   const token=url.searchParams.get('token')||'';if(!/^[a-f0-9]{64}$/.test(token))throw Error('INVALID_REQUEST');
   const found=assertMode(await one('consumer_attempts','status_token',token),mode);
   if(!admin)await limit('status:'+found.id,12);
   const job=await claim(found.id,null,mode);const a=job.claimed?await progress(job.attempt):job.attempt;
   return respond({...await view(a),status:['confirmed','paid_review_required','failed','canceled','expired'].includes(a.status)?a.status:a.payment_status||'pending'});
  }
  if(req.method!=='POST')return respond({error:'METHOD_NOT_ALLOWED'},405);
  const raw=await req.text();if(raw.length>12000)throw Error('INVALID_REQUEST');const body=JSON.parse(raw);
  if(path==='/quote'){
   if(!admin){await limit('quotes',100,3600);await challenge(body.turnstileToken);}
   return respond(await createQuote(body,mode));
  }
  if(path==='/checkout'){
   if(!UUID.test(body.quoteId))throw Error('INVALID_REQUEST');
   if(!admin)await limit('checkout:'+body.quoteId,6,1200);
   return respond(await checkout(body,mode));
  }
  if(path==='/recover'){
   if(!UUID.test(body.requestId))throw Error('INVALID_REQUEST');
   if(!admin)await limit('recover:'+body.requestId,12);
   const job=await claim(body.requestId,null,mode);return respond(await view(job.claimed?await progress(job.attempt):job.attempt));
  }
  if(path==='/test-release'){
   if(!admin)return respond({error:'ACCESS_DENIED'},403);
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
 }catch(e:any){const code=safeError(e);return respond({error:admin?code:publicError(code),...(admin&&e?.diagnostic?{diagnostic:e.diagnostic}:{})},code==='RATE_LIMITED'?429:code==='CHALLENGE_REQUIRED'?403:503);}
});
