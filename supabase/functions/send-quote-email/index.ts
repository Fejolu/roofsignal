import { createClient } from "npm:@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const cors = {
  "Access-Control-Allow-Origin": "https://www.roofsignal.nl",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const escapeHtml = (value: unknown) => String(value || "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const money = (value: unknown) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(Number(value || 0));
const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
};
async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sendBrevo(payload: Record<string, unknown>) {
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": (Deno.env.get("BREVO_API_KEY") || "").trim(),
      accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.message || body.code || JSON.stringify(body));
  return body;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: cors });

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authorization = req.headers.get("Authorization") || "";
  const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const { data: userData } = await userClient.auth.getUser();
  if (!userData.user) return new Response(JSON.stringify({ error: "Niet aangemeld." }), { status: 401, headers: cors });
  const { data: internal } = await userClient.rpc("is_internal_user");
  if (internal !== true) return new Response(JSON.stringify({ error: "Geen toestemming." }), { status: 403, headers: cors });

  const service = createClient(url, serviceKey, { auth: { persistSession: false } });
  const body = await req.json().catch(() => ({}));
  const quoteId = String(body.quoteId || "");
  const testRecipient = String(body.testRecipient || "").trim().toLowerCase();
  const recipientOverride = String(body.recipientOverride || "").trim().toLowerCase();
  const ccRecipient = String(body.ccRecipient || "").trim().toLowerCase();
  const { data: quote, error } = await service
    .from("quotes")
    .select("id,organization_id,quote_number,title,amount,status,valid_until,organizations(name,contact_name,contact_email),quote_items(id,inspection_product,inspection_depth,scope,amount,properties(name,address,postcode,city))")
    .eq("id", quoteId)
    .single();
  if (error || !quote) return new Response(JSON.stringify({ error: "Offerte niet gevonden." }), { status: 404, headers: cors });
  if (!["draft", "sent"].includes(quote.status)) return new Response(JSON.stringify({ error: "Alleen een concept of verzonden offerte kan worden verstuurd." }), { status: 400, headers: cors });

  const recipient = testRecipient || recipientOverride || String(quote.organizations?.contact_email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
    return new Response(JSON.stringify({ error: "De klant heeft geen geldig contact-e-mailadres." }), { status: 400, headers: cors });
  }
  if (testRecipient && testRecipient !== "ferry@roofsignal.nl") {
    return new Response(JSON.stringify({ error: "Alleen ferry@roofsignal.nl is toegestaan als testontvanger." }), { status: 400, headers: cors });
  }
  if (ccRecipient && ccRecipient !== "ferry@roofsignal.nl") {
    return new Response(JSON.stringify({ error: "Alleen ferry@roofsignal.nl is toegestaan als cc-ontvanger." }), { status: 400, headers: cors });
  }

  const { data: document } = await service
    .from("documents")
    .select("id,storage_path,title,version")
    .eq("quote_id", quote.id)
    .eq("document_type", "quote")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!document) return new Response(JSON.stringify({ error: "Upload eerst de PDF-offerte bij deze offerte." }), { status: 400, headers: cors });
  const { data: pdf, error: downloadError } = await service.storage.from("portal-documents").download(document.storage_path);
  if (downloadError || !pdf) return new Response(JSON.stringify({ error: "De PDF-offerte kon niet worden geladen." }), { status: 500, headers: cors });
  const pdfBase64 = bytesToBase64(new Uint8Array(await pdf.arrayBuffer()));

  const token = randomToken();
  const tokenHash = await sha256(token);
  const sentAt = new Date();
  const expiresAt = new Date(sentAt.getTime() + 30 * 24 * 60 * 60 * 1000);
  const { data: latestVersion } = await service.from("quote_versions").select("version").eq("quote_id", quote.id).order("version", { ascending: false }).limit(1).maybeSingle();
  const version = Number(latestVersion?.version || 1) + 1;
  const acceptanceUrl = `https://www.roofsignal.nl/offerte-akkoord?token=${encodeURIComponent(token)}`;
  const property = quote.quote_items?.[0]?.properties;
  const address = [property?.address, property?.postcode, property?.city].filter(Boolean).join(", ");
  const subject = `${testRecipient ? "[TEST] " : ""}Uw offerte ${quote.title} – ${property?.name || address || quote.quote_number || "RoofSignal"}`;
  const salutation = quote.organizations?.contact_name ? `Beste ${quote.organizations.contact_name},` : "Geachte heer/mevrouw,";
  const text = [
    salutation, "",
    `In de bijlage vindt u offerte ${quote.quote_number || quote.title} voor ${address || "uw object"}.`,
    `Totaal: ${money(quote.amount)} excl. btw.`, "",
    "Klik voor akkoord:", acceptanceUrl, "",
    "Met vriendelijke groet,", "F.J. Joosten", "RoofSignal", "085 21 28 019", "www.roofsignal.nl",
  ].join("\n");
  const html = `<!doctype html><html><body style="margin:0;background:#f3f5f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#17201d"><table width="100%" role="presentation" cellpadding="0" cellspacing="0" style="padding:28px 12px"><tr><td align="center"><table width="100%" role="presentation" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:12px;overflow:hidden"><tr><td style="background:#101715;padding:24px 28px;color:#fff;font-size:20px;font-weight:800">⌂ ROOF<span style="color:#ff5a1f">SIGNAL</span></td></tr><tr><td style="padding:34px 32px"><div style="color:#ff5a1f;font-size:12px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase">Offerte gebouwschilinspectie</div><h1 style="font-size:28px;margin:10px 0 18px">Uw offerte ${escapeHtml(quote.title)}</h1><p>${escapeHtml(salutation)}</p><p style="line-height:1.65">In de bijlage vindt u onze offerte voor ${escapeHtml(address || "uw object")}.</p><div style="background:#f6f7f6;border-left:4px solid #ff5a1f;padding:16px 18px;margin:22px 0"><strong>Offerte:</strong> ${escapeHtml(quote.quote_number || quote.title)}<br><strong>Totaal:</strong> ${escapeHtml(money(quote.amount))} excl. btw<br><strong>Geldig tot:</strong> ${escapeHtml(quote.valid_until || "-")}</div><p style="margin:24px 0"><a href="${acceptanceUrl}" style="display:inline-block;background:#ff5a1f;color:#fff;text-decoration:none;font-weight:800;padding:14px 20px;border-radius:8px">Klik voor akkoord</a></p><p style="line-height:1.6">Met vriendelijke groet,<br><strong>F.J. Joosten</strong><br>RoofSignal</p></td></tr><tr><td style="background:#101715;padding:20px;color:#bec5c2;text-align:center;font-size:12px">info@roofsignal.nl &nbsp;•&nbsp; 085 21 28 019 &nbsp;•&nbsp; <span style="color:#ff7a45">www.roofsignal.nl</span></td></tr></table></td></tr></table></body></html>`;

  const fromEmail = Deno.env.get("BREVO_FROM_EMAIL") || "noreply@roofsignal.nl";
  const fromName = Deno.env.get("BREVO_FROM_NAME") || "RoofSignal";
  try {
    const result = await sendBrevo({
      sender: { email: fromEmail, name: fromName },
      to: [{ email: recipient, name: quote.organizations?.contact_name || quote.organizations?.name }],
      ...(ccRecipient ? { cc: [{ email: ccRecipient, name: "RoofSignal" }] } : {}),
      replyTo: { email: "info@roofsignal.nl", name: "RoofSignal" },
      headers: { "X-Mailin-Track": "0" },
      subject,
      textContent: text,
      htmlContent: html,
      attachment: [{ name: document.title.endsWith(".pdf") ? document.title : `${document.title}.pdf`, content: pdfBase64 }],
    });
    await service.from("quotes").update({
      status: "sent",
      sent_at: sentAt.toISOString(),
      acceptance_token_hash: tokenHash,
      acceptance_token_expires_at: expiresAt.toISOString(),
      acceptance_version: version,
    }).eq("id", quote.id);
    await service.from("quote_versions").insert({
      quote_id: quote.id,
      version,
      status: "sent",
      sent_at: sentAt.toISOString(),
      snapshot: { quote, document_id: document.id, recipient, cc_recipient: ccRecipient || null },
      created_by: userData.user.id,
    });
    await service.from("customer_activities").insert({
      organization_id: quote.organization_id,
      activity_type: "email",
      subject: `Offerte verzonden: ${quote.quote_number || quote.title}`,
      body: `Offerteversie ${version} verzonden naar ${recipient}${ccRecipient ? ` met cc aan ${ccRecipient}` : ""}.`,
      created_by: userData.user.id,
    });
    return new Response(JSON.stringify({ success: true, recipient, ccRecipient: ccRecipient || null, version, messageId: result?.messageId || null }), { headers: cors });
  } catch (sendError) {
    return new Response(JSON.stringify({ error: sendError instanceof Error ? sendError.message : "Verzenden is mislukt." }), { status: 500, headers: cors });
  }
});
