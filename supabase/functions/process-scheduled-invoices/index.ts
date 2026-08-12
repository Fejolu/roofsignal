import { createClient } from "npm:@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const headers={"Content-Type":"application/json"};
const esc=(v:unknown)=>String(v||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const money=(v:unknown)=>new Intl.NumberFormat("nl-NL",{style:"currency",currency:"EUR"}).format(Number(v||0));
const b64=(bytes:Uint8Array)=>{let out="";for(let i=0;i<bytes.length;i+=0x8000)out+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return btoa(out)};
const pdfEscape=(v:unknown)=>String(v||"").replace(/[^\x20-\x7e]/g," ").replace(/([\\()])/g,"\\$1");
const safe=(v:unknown)=>String(v||"factuur").replace(/[^a-zA-Z0-9._-]+/g,"-");

function makePdf(invoice:any,lines:any[]){
  const subtotal=Number(invoice.amount||0),vat=subtotal*.21,total=subtotal+vat;
  const rows=["ROOFSIGNAL - FACTUUR",`Factuurnummer: ${invoice.invoice_number||""}`,`Factuurdatum: ${new Date().toLocaleDateString("nl-NL",{timeZone:"Europe/Amsterdam"})}`,`Vervaldatum: ${invoice.due_date||""}`,`Klant: ${invoice.organizations?.name||""}`,"",...lines.map(x=>`${x.description} | ${Number(x.quantity||1)} x EUR ${Number(x.unit_price||0).toFixed(2)}`),"",`Subtotaal excl. btw: EUR ${subtotal.toFixed(2)}`,`Btw 21%: EUR ${vat.toFixed(2)}`,`Totaal incl. btw: EUR ${total.toFixed(2)}`,"",`IBAN: ${invoice.bank_account||""}`,`Ten name van: ${invoice.account_holder||""}`,`Betalingstermijn: ${invoice.payment_term_days||14} dagen`,`Betaallink: ${invoice.payment_url||""}`];
  let stream="BT /F1 11 Tf 48 792 Td "; rows.forEach((row,i)=>{if(i)stream+="0 -22 Td ";stream+=`(${pdfEscape(row)}) Tj `});stream+="ET";
  const objects=["<< /Type /Catalog /Pages 2 0 R >>","<< /Type /Pages /Kids [3 0 R] /Count 1 >>","<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`];
  let pdf="%PDF-1.4\n",offsets=[0]; objects.forEach((o,i)=>{offsets.push(pdf.length);pdf+=`${i+1} 0 obj\n${o}\nendobj\n`});const xref=pdf.length;pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.slice(1).map(o=>String(o).padStart(10,"0")+" 00000 n \n").join("")}trailer << /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}

async function brevo(payload:Record<string,unknown>){const response=await fetch("https://api.brevo.com/v3/smtp/email",{method:"POST",headers:{"api-key":Deno.env.get("BREVO_API_KEY")||"",accept:"application/json","Content-Type":"application/json"},body:JSON.stringify(payload)});const result=await response.json();if(!response.ok)throw new Error(result.message||JSON.stringify(result));return result;}

serve(async(req)=>{
  if(req.method!=="POST")return new Response(JSON.stringify({error:"Method not allowed"}),{status:405,headers});
  const expected=Deno.env.get("INVOICE_AUTOMATION_SECRET")||"";
  if(!expected||req.headers.get("x-automation-secret")!==expected)return new Response(JSON.stringify({error:"Geen toestemming."}),{status:403,headers});
  const service=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false}});
  const {data:queue,error}=await service.from("invoices").select("*,organizations(name,contact_name,contact_email)").in("auto_send_status",["scheduled","failed"]).lte("auto_send_at",new Date().toISOString()).eq("status","draft").order("auto_send_at").limit(20);
  if(error)return new Response(JSON.stringify({error:error.message}),{status:500,headers});
  const results=[];
  for(const invoice of queue||[]){
    const locked=await service.from("invoices").update({auto_send_status:"processing",auto_send_attempted_at:new Date().toISOString(),auto_send_error:null}).eq("id",invoice.id).in("auto_send_status",["scheduled","failed"]).select("id").maybeSingle();
    if(!locked.data)continue;
    try{
      if(!/^https:\/\//i.test(String(invoice.payment_url||"")))throw new Error("Betaallink ontbreekt.");
      const recipient=String(invoice.organizations?.contact_email||"").trim().toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient))throw new Error("Geldig klant-e-mailadres ontbreekt.");
      const {data:lines}=await service.from("invoice_lines").select("*").eq("invoice_id",invoice.id).order("created_at");
      let {data:document}=await service.from("documents").select("*").eq("invoice_id",invoice.id).eq("document_type","invoice").order("version",{ascending:false}).limit(1).maybeSingle();
      if(!document){const bytes=makePdf(invoice,lines||[]),name=`Factuur_${safe(invoice.invoice_number)}.pdf`,path=`${invoice.organization_id}/${invoice.property_id||"general"}/${crypto.randomUUID()}-${name}`;const up=await service.storage.from("portal-documents").upload(path,bytes,{contentType:"application/pdf"});if(up.error)throw up.error;const inserted=await service.from("documents").insert({organization_id:invoice.organization_id,property_id:invoice.property_id,inspection_id:invoice.inspection_id,quote_id:invoice.quote_id,invoice_id:invoice.id,document_type:"invoice",title:name,storage_path:path,customer_visible:true,required_depth:"basis",metadata:{generated_by:"invoice_automation"}}).select("*").single();if(inserted.error)throw inserted.error;document=inserted.data;}
      const download=await service.storage.from("portal-documents").download(document.storage_path);if(download.error||!download.data)throw download.error||new Error("Factuur-PDF ontbreekt.");
      const salutation=invoice.organizations?.contact_name?`Beste ${invoice.organizations.contact_name},`:"Geachte heer/mevrouw,";
      const detail=`${invoice.invoice_number||"Factuur"} - ${money(invoice.amount)} excl. btw - vervaldatum ${invoice.due_date||"-"}`;
      const html=`<!doctype html><html><body style="margin:0;background:#f3f5f4;font-family:Arial,sans-serif;color:#17201d"><table width="100%" style="padding:28px 12px"><tr><td align="center"><table width="100%" style="max-width:600px;background:#fff;border-radius:12px;overflow:hidden"><tr><td style="background:#101715;padding:24px 28px;color:#fff;font-size:20px;font-weight:800">ROOF<span style="color:#ff5a1f">SIGNAL</span></td></tr><tr><td style="padding:34px 32px"><div style="color:#ff5a1f;font-size:12px;font-weight:800;letter-spacing:1.2px">FACTURATIE</div><h1>Uw factuur</h1><p>${esc(salutation)}</p><p>In de bijlage vindt u de factuur voor de uitgevoerde RoofSignal-opdracht.</p><div style="background:#f6f7f6;border-left:4px solid #ff5a1f;padding:16px 18px;margin:22px 0"><strong>${esc(detail)}</strong></div><p style="margin:24px 0"><a href="${esc(invoice.payment_url)}" style="display:inline-block;background:#ff5a1f;color:#fff;text-decoration:none;font-weight:800;padding:14px 24px;border-radius:8px">Betaal nu</a></p><p>Met vriendelijke groet,<br><strong>F.J. Joosten</strong><br>RoofSignal</p></td></tr></table></td></tr></table></body></html>`;
      const sent=await brevo({sender:{email:Deno.env.get("BREVO_FROM_EMAIL")||"noreply@roofsignal.nl",name:"RoofSignal"},to:[{email:recipient,name:invoice.organizations?.contact_name||invoice.organizations?.name}],replyTo:{email:"info@roofsignal.nl",name:"RoofSignal"},subject:`Uw factuur ${invoice.invoice_number||"RoofSignal"}`,htmlContent:html,textContent:`${salutation}\n\nIn de bijlage vindt u uw factuur.\n${detail}\nBetaal nu: ${invoice.payment_url}\n\nMet vriendelijke groet,\nF.J. Joosten\nRoofSignal`,attachment:[{name:document.title.endsWith(".pdf")?document.title:`${document.title}.pdf`,content:b64(new Uint8Array(await download.data.arrayBuffer()))}]});
      await service.from("invoices").update({status:"sent",sent_at:new Date().toISOString(),auto_send_status:"sent",auto_send_error:null}).eq("id",invoice.id);
      await service.from("invoice_events").insert({invoice_id:invoice.id,organization_id:invoice.organization_id,event_type:"sent",amount:invoice.amount,notes:"Automatisch verzonden na rapportoplevering."});
      results.push({id:invoice.id,ok:true,messageId:sent.messageId});
    }catch(error){const message=error instanceof Error?error.message:String(error);await service.from("invoices").update({auto_send_status:message.includes("ontbreekt")?"action_required":"failed",auto_send_error:message}).eq("id",invoice.id);results.push({id:invoice.id,ok:false,error:message});}
  }
  return new Response(JSON.stringify({ok:true,processed:results.length,results}),{headers});
});

