import {createClient} from 'npm:@supabase/supabase-js@2';
import {serve} from 'https://deno.land/std@0.168.0/http/server.ts';
import {deliveryPayload,sendDelivery,internalTestBooking,TEST_REFERENCE} from '../_shared/parken-delivery.mjs';

const headers={'Content-Type':'application/json'};
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers});
serve(async(req)=>{
  if(req.method!=='POST')return json({error:'Method not allowed'},405);
  const secret=Deno.env.get('PARKEN_AUTOMATION_SECRET')||'';
  const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
  if(!((secret && req.headers.get('x-automation-secret')===secret)
    || (serviceKey && req.headers.get('authorization')===`Bearer ${serviceKey}`)))return json({error:'Unauthorized'},401);
  const service=createClient(Deno.env.get('SUPABASE_URL')!,serviceKey,{auth:{persistSession:false}});
  const body=await req.json().catch(()=>({}));
  const testOnly=body.testOnly===true;
  if(body.prepareTest===true){
    if(!testOnly || body.dryRun===true)return json({error:'Explicit live internal-test mode required'},400);
    const {error}=await service.from('parken_delivery_outbox').upsert({reference:TEST_REFERENCE,is_test:true,booking_snapshot:internalTestBooking()},
      {onConflict:'reference',ignoreDuplicates:true});
    if(error)return json({error:'TEST_QUEUE_FAILED'},500);
  }
  const reference=typeof body.reference==='string' ? body.reference : null;
  if(reference && !/^RS-PARKEN-(?:[A-F0-9]{8}|TEST-20260920)$/.test(reference))return json({error:'Invalid reference'},400);
  if(body.dryRun===true){
    const {data,error}=await service.from('parken_delivery_outbox').select('status').eq('is_test',testOnly);
    if(error)return json({error:'QUEUE_READ_FAILED'},500);
    const counts:Record<string,number>={};for(const row of data||[])counts[row.status]=(counts[row.status]||0)+1;
    return json({ok:true,dryRun:true,testOnly,counts});
  }
  const {data:jobs,error}=await service.rpc('claim_parken_deliveries',{p_reference:reference,p_test:testOnly});
  if(error)return json({error:'QUEUE_CLAIM_FAILED'},500);
  const sender={email:Deno.env.get('BREVO_FROM_EMAIL')||'noreply@roofsignal.nl',name:Deno.env.get('BREVO_FROM_NAME')||'RoofSignal'};
  const results=await Promise.all((jobs||[]).map(async(job:any)=>{
    try{
      const payload=job.mail_payload||deliveryPayload(job,sender);
      if(!job.mail_payload){
        const saved=await service.from('parken_delivery_outbox').update({mail_payload:payload})
          .eq('id',job.id).eq('lock_token',job.lock_token).select('id').maybeSingle();
        if(saved.error||!saved.data)throw new Error('PAYLOAD_SAVE_FAILED');
      }
      const sent=await sendDelivery(payload,Deno.env.get('BREVO_API_KEY')||'');
      const saved=await service.from('parken_delivery_outbox').update({status:'accepted',accepted_at:new Date().toISOString(),message_id:sent.messageId,last_error:null,lock_token:null})
        .eq('id',job.id).eq('lock_token',job.lock_token).select('id').maybeSingle();
      if(saved.error||!saved.data)throw new Error('ACCEPTANCE_SAVE_FAILED');
      return {reference:job.reference,ok:true,alreadyAccepted:sent.alreadyAccepted===true};
    }catch(error){
      const code=error instanceof Error ? error.message : 'DELIVERY_FAILED';
      const safeCode=/^[A-Z_0-9]+$/.test(code) ? code : 'DELIVERY_UNCERTAIN';
      await service.from('parken_delivery_outbox').update({status:'pending',last_error:safeCode,next_attempt_at:new Date(Date.now()+60000).toISOString(),lock_token:null})
        .eq('id',job.id).eq('lock_token',job.lock_token);
      return {reference:job.reference,ok:false,error:safeCode};
    }
  }));
  const {count:review,error:reviewError}=await service.from('parken_delivery_outbox').select('id',{head:true,count:'exact'}).eq('is_test',testOnly).eq('status','review');
  const ok=!reviewError && !review && results.every((r:any)=>r.ok);
  return json({ok,testOnly,processed:results.length,needsReview:review||0,results},ok?200:502);
});
