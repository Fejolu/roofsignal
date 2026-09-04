import { createClient } from "npm:@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const cors={"Access-Control-Allow-Origin":"https://www.roofsignal.nl","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json"};
const esc=(v:unknown)=>String(v||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const money=(v:unknown)=>new Intl.NumberFormat("nl-NL",{style:"currency",currency:"EUR"}).format(Number(v||0));
const b64=(bytes:Uint8Array)=>{let out="";for(let i=0;i<bytes.length;i+=0x8000)out+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return btoa(out)};
async function send(payload:Record<string,unknown>){const response=await fetch("https://api.brevo.com/v3/smtp/email",{method:"POST",headers:{"api-key":Deno.env.get("BREVO_API_KEY")||"",accept:"application/json","Content-Type":"application/json"},body:JSON.stringify(payload)});const result=await response.json();if(!response.ok)throw new Error(result.message||JSON.stringify(result));return result}

serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(req.method!=="POST")return new Response(JSON.stringify({error:"Method not allowed"}),{status:405,headers:cors});
  const url=Deno.env.get("SUPABASE_URL")!, authorization=req.headers.get("Authorization")||"";
  const user=createClient(url,Deno.env.get("SUPABASE_ANON_KEY")!,{global:{headers:{Authorization:authorization}},auth:{persistSession:false}});
  const {data:identity}=await user.auth.getUser();const authenticatedUser=identity.user;const result=await user.rpc("is_internal_user");const internal=result.data===true;
  if(!authenticatedUser||!internal)return new Response(JSON.stringify({error:"Geen toestemming."}),{status:403,headers:cors});
  const service=createClient(url,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false}});
  const body=await req.json().catch(()=>({})); const kind=String(body.kind||""); const id=String(body.id||""); const reminder=Boolean(body.reminder);
  if(!["invoice","report"].includes(kind)||!id)return new Response(JSON.stringify({error:"Ongeldige documentactie."}),{status:400,headers:cors});

  let organization:any, document:any, subject="", heading="", intro="", detail="", eventType="", paymentUrl="", lockedInvoice=false;
  const portalUrl="https://www.roofsignal.nl/portal-klant.html#inspecties";
  if(kind==="invoice"){
    const {data:invoice}=await service.from("invoices").select("*,organizations(id,name,contact_name,contact_email)").eq("id",id).single();
    if(!invoice)return new Response(JSON.stringify({error:"Factuur niet gevonden."}),{status:404,headers:cors});
    const forceResend=Boolean(body.forceResend);
    if(!reminder&&!forceResend&&invoice.status!=="draft")return new Response(JSON.stringify({error:"Deze factuur is al verzonden. Gebruik alleen na bewuste bevestiging 'Opnieuw versturen'."}),{status:409,headers:cors});
    if(!reminder&&!forceResend){
      const lock=await service.from("invoices").update({auto_send_status:"processing",auto_send_attempted_at:new Date().toISOString(),auto_send_error:null}).eq("id",id).eq("status","draft").or("auto_send_status.is.null,auto_send_status.neq.processing").select("id").maybeSingle();
      if(lock.error)return new Response(JSON.stringify({error:lock.error.message}),{status:500,headers:cors});
      if(!lock.data)return new Response(JSON.stringify({error:"Deze factuur wordt al verzonden of is inmiddels verzonden."}),{status:409,headers:cors});
      lockedInvoice=true;
    }
    organization=invoice.organizations; eventType=reminder?"reminder_1":"sent";
    subject=reminder?`Herinnering factuur ${invoice.invoice_number||"RoofSignal"}`:`Uw factuur ${invoice.invoice_number||"RoofSignal"}`;
    heading=reminder?"Herinnering openstaande factuur":"Uw factuur";
    intro=reminder?"Volgens onze administratie staat onderstaande factuur nog open. Mogelijk heeft uw betaling en dit bericht elkaar gekruist.":"In de bijlage vindt u uw factuur van RoofSignal.";
    detail=`${invoice.invoice_number||"Factuur"} · ${money(invoice.amount)} excl. btw · vervaldatum ${invoice.due_date||"-"}`;
    paymentUrl=/^https:\/\//i.test(String(invoice.payment_url||""))?String(invoice.payment_url):"";
    if(!reminder&&!paymentUrl)return new Response(JSON.stringify({error:"Voeg eerst een geldige betaallink toe."}),{status:400,headers:cors});
    const result=await service.from("documents").select("*").eq("invoice_id",id).eq("document_type","invoice").order("version",{ascending:false}).limit(1).maybeSingle(); document=result.data;
    (body as any)._invoice=invoice;
  }else{
    const {data:report}=await service.from("reports").select("*,organizations(id,name,contact_name,contact_email)").eq("id",id).single();
    if(!report)return new Response(JSON.stringify({error:"Rapport niet gevonden."}),{status:404,headers:cors});
    organization=report.organizations; subject=`Uw inspectierapport ${report.title}`; heading="Uw inspectierapport"; intro="Het inspectierapport staat voor u klaar in het beveiligde RoofSignal klantenportaal. Via de knop hieronder kunt u het rapport bekijken en downloaden."; detail=report.title;
    const result=await service.from("documents").select("*").eq("inspection_id",report.inspection_id).eq("document_type","inspection_report").order("version",{ascending:false}).limit(1).maybeSingle(); document=result.data;
  }
  const recipient=String(body.testRecipient||organization?.contact_email||"").trim().toLowerCase();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient))return new Response(JSON.stringify({error:"Geen geldig klant-e-mailadres."}),{status:400,headers:cors});
  if(body.testRecipient&&recipient!=="ferry@roofsignal.nl")return new Response(JSON.stringify({error:"Ongeldige testontvanger."}),{status:400,headers:cors});
  if(!document)return new Response(JSON.stringify({error:"Het PDF-document ontbreekt. Upload het document voordat u de e-mail verstuurt."}),{status:400,headers:cors});
  let reportUrl="";
  if(kind==="report"){
    const downloadName=document.title.endsWith(".pdf")?document.title:`${document.title}.pdf`;
    const {data:signed,error:signedError}=await service.storage.from("portal-documents").createSignedUrl(document.storage_path,7*24*60*60,{download:downloadName});
    if(signedError||!signed?.signedUrl)return new Response(JSON.stringify({error:"De beveiligde downloadlink kon niet worden aangemaakt."}),{status:502,headers:cors});
    reportUrl=signed.signedUrl;
  }
  const salutation=organization?.contact_name?`Beste ${organization.contact_name},`:"Geachte heer/mevrouw,";
  const paymentButton=paymentUrl?`<p style="margin:24px 0"><a href="${esc(paymentUrl)}" style="display:inline-block;background:#ff5a1f;color:#fff;text-decoration:none;font-weight:800;padding:14px 24px;border-radius:8px">Betaal nu</a></p>`:"";
  const reportButton=kind==="report"?`<p style="margin:24px 0"><a href="${esc(reportUrl)}" style="display:inline-block;background:#ff5a1f;color:#fff;text-decoration:none;font-weight:800;padding:14px 24px;border-radius:8px">Bekijk en download rapport</a></p><p style="font-size:13px;line-height:1.5;color:#5c6862">Deze persoonlijke downloadlink is zeven dagen geldig. Het rapport blijft daarna beschikbaar in het beveiligde RoofSignal-klantenportaal.</p>`:"";
  const html=`<!doctype html><html><body style="margin:0;background:#f3f5f4;font-family:Arial,sans-serif;color:#17201d"><table width="100%" cellpadding="0" cellspacing="0" style="padding:28px 12px"><tr><td align="center"><table width="100%" style="max-width:600px;background:#fff;border-radius:12px;overflow:hidden"><tr><td style="background:#101715;padding:24px 28px;color:#fff;font-size:20px;font-weight:800">⌂ ROOF<span style="color:#ff5a1f">SIGNAL</span></td></tr><tr><td style="padding:34px 32px"><div style="color:#ff5a1f;font-size:12px;font-weight:800;letter-spacing:1.2px">${kind==="invoice"?"FACTURATIE":"INSPECTIERAPPORT"}</div><h1 style="font-size:28px">${esc(heading)}</h1><p>${esc(salutation)}</p><p style="line-height:1.65">${esc(intro)}</p><div style="background:#f6f7f6;border-left:4px solid #ff5a1f;padding:16px 18px;margin:22px 0"><strong>${esc(detail)}</strong></div>${reportButton}${paymentButton}<p>Met vriendelijke groet,<br><strong>F.J. Joosten</strong><br>RoofSignal</p></td></tr></table></td></tr></table></body></html>`;
  const attachment=[] as Record<string,string>[];
  if(kind==="invoice"){const {data:file}=await service.storage.from("portal-documents").download(document.storage_path);if(file)attachment.push({name:document.title.endsWith(".pdf")?document.title:`${document.title}.pdf`,content:b64(new Uint8Array(await file.arrayBuffer()))});}
  if(kind==="invoice"&&!attachment.length)return new Response(JSON.stringify({error:"Het factuurdocument kon niet als bijlage worden geladen."}),{status:400,headers:cors});
  const textLink=kind==="report"?`\nBekijk en download rapport (7 dagen geldig): ${reportUrl}\nKlantenportaal: ${portalUrl}`:"";
  const mailPayload:Record<string,unknown>={sender:{email:Deno.env.get("BREVO_FROM_EMAIL")||"noreply@roofsignal.nl",name:"RoofSignal"},to:[{email:recipient,name:organization?.contact_name||organization?.name}],...(recipient==="ferry@roofsignal.nl"?{}:{bcc:[{email:"ferry@roofsignal.nl",name:"F.J. Joosten"}]}),replyTo:{email:"info@roofsignal.nl",name:"RoofSignal"},subject:`${body.testRecipient?"[TEST] ":""}${subject}`,htmlContent:html,textContent:`${salutation}\n\n${intro}\n${detail}${textLink}${paymentUrl?`\nBetaal nu: ${paymentUrl}`:""}\n\nMet vriendelijke groet,\nF.J. Joosten\nRoofSignal`};
  if(attachment.length)mailPayload.attachment=attachment;
  try{const result=await send(mailPayload);if(!body.testRecipient)await service.from("customer_activities").insert({organization_id:organization.id,activity_type:"email",subject,body:`Verzonden aan: ${recipient}\nBCC: ferry@roofsignal.nl\nDocument: ${document.title}\nBericht-ID: ${result.messageId||"niet beschikbaar"}`,created_by:authenticatedUser.id});if(kind==="invoice"&&!body.testRecipient){const invoice=(body as any)._invoice;if(!reminder)await service.from("invoices").update({status:"sent",sent_at:new Date().toISOString(),auto_send_status:"sent",auto_send_error:null}).eq("id",id);await service.from("invoice_events").insert({invoice_id:id,organization_id:invoice.organization_id,event_type:eventType,amount:invoice.amount,notes:`Bericht-ID: ${result.messageId||"niet beschikbaar"}; BCC: ferry@roofsignal.nl`,created_by:authenticatedUser.id});}return new Response(JSON.stringify({ok:true,messageId:result.messageId}),{headers:cors});}catch(error){if(lockedInvoice)await service.from("invoices").update({auto_send_status:"failed",auto_send_error:error instanceof Error?error.message:String(error)}).eq("id",id).eq("auto_send_status","processing");return new Response(JSON.stringify({error:error instanceof Error?error.message:String(error)}),{status:502,headers:cors});}
});
