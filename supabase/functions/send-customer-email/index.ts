import { createClient } from "npm:@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const cors = {
  "Access-Control-Allow-Origin": "https://www.roofsignal.nl",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const esc = (value: unknown) => String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const b64 = (bytes: Uint8Array) => { let out = ""; for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(out); };

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: cors });
  const url = Deno.env.get("SUPABASE_URL")!;
  const authorization = req.headers.get("Authorization") || "";
  const user = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
  const { data: identity } = await user.auth.getUser();
  const { data: internal } = await user.rpc("is_internal_user");
  if (!identity.user || internal !== true) return new Response(JSON.stringify({ error: "Geen toestemming." }), { status: 403, headers: cors });

  const body = await req.json().catch(() => ({}));
  const organizationId = String(body.organizationId || "");
  const recipient = String(body.recipient || "").trim().toLowerCase();
  const subject = String(body.subject || "").trim();
  const message = String(body.body || "").trim();
  const documentId = String(body.documentId || "");
  if (!organizationId || !documentId || !subject || !message || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
    return new Response(JSON.stringify({ error: "Vul ontvanger, onderwerp, bericht en bijlage volledig in." }), { status: 400, headers: cors });
  }
  if (subject.length > 180 || message.length > 12000) return new Response(JSON.stringify({ error: "Onderwerp of bericht is te lang." }), { status: 400, headers: cors });

  const service = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const [{ data: organization }, { data: contacts }, { data: document }] = await Promise.all([
    service.from("organizations").select("id,name,contact_name,contact_email").eq("id", organizationId).single(),
    service.from("organization_contacts").select("email").eq("organization_id", organizationId),
    service.from("documents").select("id,organization_id,title,storage_path").eq("id", documentId).eq("organization_id", organizationId).single(),
  ]);
  if (!organization || !document) return new Response(JSON.stringify({ error: "Klant of bijlage niet gevonden." }), { status: 404, headers: cors });
  const allowed = [organization.contact_email, ...(contacts || []).map((item) => item.email)].filter(Boolean).map((value) => String(value).trim().toLowerCase());
  if (!allowed.includes(recipient)) return new Response(JSON.stringify({ error: "De ontvanger is niet als e-mailadres bij deze klant geregistreerd." }), { status: 400, headers: cors });

  const { data: file } = await service.storage.from("portal-documents").download(document.storage_path);
  if (!file) return new Response(JSON.stringify({ error: "De PDF-bijlage kon niet worden geladen." }), { status: 400, headers: cors });
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length > 15 * 1024 * 1024) return new Response(JSON.stringify({ error: "De PDF-bijlage is groter dan 15 MB." }), { status: 400, headers: cors });

  const paragraphs = message.split(/\n{2,}/).map((part) => `<p style="line-height:1.65;margin:0 0 16px">${esc(part).replace(/\n/g, "<br>")}</p>`).join("");
  const html = `<!doctype html><html><body style="margin:0;background:#f3f5f4;font-family:Arial,sans-serif;color:#17201d"><table width="100%" cellpadding="0" cellspacing="0" style="padding:28px 12px"><tr><td align="center"><table width="100%" style="max-width:640px;background:#fff;border-radius:12px;overflow:hidden"><tr><td style="background:#101715;padding:24px 28px;color:#fff;font-size:20px;font-weight:800">⌂ ROOF<span style="color:#ff5a1f">SIGNAL</span></td></tr><tr><td style="padding:34px 32px">${paragraphs}</td></tr></table></td></tr></table></body></html>`;
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": Deno.env.get("BREVO_API_KEY") || "", accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      sender: { email: "ferry@roofsignal.nl", name: "F.J. Joosten | RoofSignal" },
      to: [{ email: recipient, name: organization.contact_name || organization.name }],
      bcc: [{ email: "ferry@roofsignal.nl", name: "F.J. Joosten" }],
      replyTo: { email: "ferry@roofsignal.nl", name: "F.J. Joosten | RoofSignal" },
      headers: { "X-Mailin-Track": "0" }, subject, textContent: message, htmlContent: html,
      attachment: [{ name: `${document.title || "RoofSignal-bijlage"}.pdf`, content: b64(bytes) }],
    }),
  });
  const result = await response.json();
  if (!response.ok) return new Response(JSON.stringify({ error: result.message || JSON.stringify(result) }), { status: 502, headers: cors });
  await service.from("customer_activities").insert({
    organization_id: organizationId, activity_type: "email", subject,
    body: `${message}\n\nBijlage: ${document.title}.pdf\nBCC: ferry@roofsignal.nl`, created_by: identity.user.id,
  });
  return new Response(JSON.stringify({ ok: true, messageId: result.messageId }), { headers: cors });
});
