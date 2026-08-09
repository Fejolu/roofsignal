import { createClient } from "npm:@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const headers = {
  "Access-Control-Allow-Origin": "https://www.roofsignal.nl",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const encode = (input: string) => new TextEncoder().encode(input);
async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
async function sha256Bytes(value: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", value);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
const formatMoment = (value: Date) => new Intl.DateTimeFormat("nl-NL", {
  dateStyle: "long", timeStyle: "medium", timeZone: "Europe/Amsterdam",
}).format(value);

async function addCustomerAcceptance(pdfBytes: Uint8Array, details: {
  actorName: string; actorEmail: string; acceptedAt: Date; quoteVersion: number;
}) {
  const pdf = await PDFDocument.load(pdfBytes);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  if (pdf.getPageCount() !== 2) throw new Error("De uitgegeven offerte moet exact twee pagina's bevatten.");
  const page = pdf.getPages()[pdf.getPageCount() - 1];
  const { width } = page.getSize();
  const dark = rgb(0.063, 0.09, 0.082);
  const muted = rgb(0.36, 0.4, 0.38);
  const green = rgb(0.18, 0.55, 0.34);
  const left = 56;
  const gap = 10;
  const boxWidth = (width - 112 - gap) / 2;
  page.drawRectangle({ x: left - 2, y: 290, width: boxWidth + 4, height: 98, color: rgb(1, 1, 1) });
  page.drawRectangle({ x: left, y: 292, width: boxWidth, height: 94, borderColor: green, borderWidth: 1.5, color: rgb(0.98, 0.99, 0.98) });
  page.drawText("OPDRACHTGEVER - DIGITAAL AKKOORD", { x: left + 14, y: 366, size: 8, font: bold, color: green });
  page.drawText(details.actorName, { x: left + 14, y: 344, size: 11, font: bold, color: dark });
  page.drawText(details.actorEmail, { x: left + 14, y: 329, size: 8, font: regular, color: muted });
  page.drawText(`Akkoord: ${formatMoment(details.acceptedAt)}`, { x: left + 14, y: 310, size: 8, font: regular, color: dark });
  page.drawText(`Geaccepteerde offerteversie ${details.quoteVersion}`, { x: left + 14, y: 297, size: 8, font: regular, color: dark });
  return new Uint8Array(await pdf.save());
}

async function finalizeAcceptedDocument(service: any, quote: any, actor: {
  id?: string | null; name: string; email: string; acceptedAt: Date; ipHash?: string | null; userAgent?: string | null; authMethod: string;
}) {
  const { data: issuedDocument } = await service.from("documents")
    .select("id,storage_path,title,version,metadata")
    .eq("quote_id", quote.id)
    .eq("document_type", "quote")
    .eq("metadata->>execution_status", "issued")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!issuedDocument) return { documentPending: true, reason: "issued_document_missing" };
  const { data: sourcePdf, error: downloadError } = await service.storage.from("portal-documents").download(issuedDocument.storage_path);
  if (downloadError || !sourcePdf) return { documentPending: true, reason: "issued_document_download_failed" };
  const { data: acceptedVersionRow } = await service.from("quote_versions")
    .select("version").eq("quote_id", quote.id).eq("status", "accepted")
    .order("version", { ascending: false }).limit(1).maybeSingle();
  const acceptedVersion = Number(acceptedVersionRow?.version || Number(quote.acceptance_version || 1) + 1);
  const acceptedBytes = await addCustomerAcceptance(new Uint8Array(await sourcePdf.arrayBuffer()), {
    actorName: actor.name, actorEmail: actor.email, acceptedAt: actor.acceptedAt, quoteVersion: acceptedVersion,
  });
  const acceptedHash = await sha256Bytes(acceptedBytes);
  const path = `${quote.organization_id}/general/${quote.id}/v${acceptedVersion}-geaccepteerd.pdf`;
  const { error: uploadError } = await service.storage.from("portal-documents").upload(
    path, new Blob([acceptedBytes], { type: "application/pdf" }), { contentType: "application/pdf", upsert: true },
  );
  if (uploadError) return { documentPending: true, reason: "accepted_document_upload_failed" };
  const { data: acceptedDocument, error: documentError } = await service.from("documents").insert({
    organization_id: quote.organization_id,
    quote_id: quote.id,
    document_type: "quote",
    title: `${quote.quote_number || quote.title} - geaccepteerd.pdf`,
    storage_path: path,
    version: Number(issuedDocument.version || 1) + 1,
    customer_visible: true,
    required_depth: "basis",
    created_by: actor.id || null,
    metadata: { execution_status: "accepted", quote_version: acceptedVersion, document_hash: acceptedHash },
  }).select("id").single();
  if (documentError) return { documentPending: true, reason: "accepted_document_record_failed" };
  await service.from("documents").update({ customer_visible: false }).eq("quote_id", quote.id).eq("document_type", "quote").neq("id", acceptedDocument.id);
  await service.from("quotes").update({ accepted_document_id: acceptedDocument.id, accepted_document_hash: acceptedHash }).eq("id", quote.id);
  await service.from("quote_versions").update({ document_id: acceptedDocument.id, document_hash: acceptedHash })
    .eq("quote_id", quote.id).eq("version", acceptedVersion).eq("status", "accepted");
  await service.from("quote_execution_events").upsert({
    quote_id: quote.id,
    organization_id: quote.organization_id,
    quote_version: acceptedVersion,
    event_type: "accepted",
    actor_type: "customer",
    actor_id: actor.id || null,
    actor_name: actor.name,
    actor_email: actor.email,
    statement: "Ik heb deze offerte en de bijbehorende voorwaarden gelezen en ga hiermee akkoord.",
    event_at: actor.acceptedAt.toISOString(),
    document_id: acceptedDocument.id,
    document_hash: acceptedHash,
    auth_method: actor.authMethod,
    ip_hash: actor.ipHash || null,
    user_agent: safeText(actor.userAgent, 1000),
  }, { onConflict: "quote_id,quote_version,event_type" });
  return { documentPending: false, documentId: acceptedDocument.id, documentHash: acceptedHash };
}

function safeText(value: unknown, max = 250) {
  return String(value || "").trim().slice(0, max);
}

async function notifyAcceptance(quote: any, actorName: string, actorEmail: string) {
  const apiKey = (Deno.env.get("BREVO_API_KEY") || "").trim();
  if (!apiKey) return;
  const fromEmail = Deno.env.get("BREVO_FROM_EMAIL") || "noreply@roofsignal.nl";
  const fromName = Deno.env.get("BREVO_FROM_NAME") || "RoofSignal";
  const toEmail = Deno.env.get("NOTIFICATION_EMAIL") || "info@roofsignal.nl";
  await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": apiKey, "Content-Type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      sender: { email: fromEmail, name: fromName },
      to: [{ email: toEmail }],
      replyTo: { email: actorEmail },
      subject: `RoofSignal – offerte ${quote.quote_number || quote.title} geaccepteerd`,
      textContent: [
        "Offerte geaccepteerd",
        "",
        `Klant: ${quote.organizations?.name || "-"}`,
        `Offerte: ${quote.quote_number || quote.title}`,
        `Door: ${actorName} (${actorEmail})`,
        `Bedrag: € ${Number(quote.amount || 0).toFixed(2)} excl. btw`,
        "",
        "De opdracht staat in het RoofSignal-portaal klaar om in te plannen.",
      ].join("\n"),
    }),
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers });

  const service = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
  const body = await req.json().catch(() => ({}));
  const action = safeText(body.action, 30);
  if (action === "acceptAuthenticated") {
    const authorization = req.headers.get("Authorization") || "";
    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authorization } }, auth: { persistSession: false },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData.user) return new Response(JSON.stringify({ error: "Niet aangemeld." }), { status: 401, headers });
    const quoteId = safeText(body.quoteId, 100);
    const actorName = safeText(body.actorName) || safeText(userData.user.user_metadata?.full_name) || safeText(userData.user.email);
    const actorEmail = safeText(userData.user.email).toLowerCase();
    const { data: quote } = await service.from("quotes").select("id,organization_id,quote_number,title,acceptance_version").eq("id", quoteId).maybeSingle();
    if (!quote) return new Response(JSON.stringify({ error: "Offerte niet gevonden." }), { status: 404, headers });
    const { data: accepted, error: acceptError } = await userClient.rpc("customer_accept_quote", { p_quote_id: quoteId, p_name: actorName });
    if (acceptError) return new Response(JSON.stringify({ error: acceptError.message }), { status: 400, headers });
    const acceptedAt = new Date();
    const finalized = await finalizeAcceptedDocument(service, quote, {
      id: userData.user.id, name: actorName, email: actorEmail, acceptedAt,
      userAgent: req.headers.get("user-agent"), authMethod: "authenticated_customer_portal",
    });
    return new Response(JSON.stringify({ success: true, result: accepted, ...finalized }), { headers });
  }

  const token = safeText(body.token, 300);
  if (token.length < 32) return new Response(JSON.stringify({ error: "Ongeldige offertelink." }), { status: 400, headers });
  const tokenHash = await sha256(token);

  const { data: quote, error } = await service
    .from("quotes")
    .select("id,organization_id,quote_number,title,amount,status,valid_until,sent_at,accepted_at,accepted_by_name,acceptance_token_expires_at,acceptance_version,organizations(name),quote_items(id,inspection_product,inspection_depth,scope,amount,properties(name,address,postcode,city))")
    .eq("acceptance_token_hash", tokenHash)
    .maybeSingle();
  if (error || !quote) return new Response(JSON.stringify({ error: "Deze offertelink is ongeldig of niet meer actief." }), { status: 404, headers });

  const expired = !quote.acceptance_token_expires_at || new Date(quote.acceptance_token_expires_at) < new Date();
  if (expired) return new Response(JSON.stringify({ error: "Deze offertelink is verlopen. Vraag RoofSignal om een nieuwe link." }), { status: 410, headers });

  if (action === "view") {
    const { data: document } = await service
      .from("documents")
      .select("title,storage_path")
      .eq("quote_id", quote.id)
      .eq("document_type", "quote")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { data: signedDocument } = document?.storage_path
      ? await service.storage.from("portal-documents").createSignedUrl(document.storage_path, 15 * 60)
      : { data: null };

    await service.from("quote_acceptance_events").insert({
      quote_id: quote.id,
      organization_id: quote.organization_id,
      event_type: "opened",
      quote_version: quote.acceptance_version,
      user_agent: safeText(req.headers.get("user-agent"), 1000),
    });
    return new Response(JSON.stringify({
      quote: {
        quoteNumber: quote.quote_number,
        title: quote.title,
        amount: quote.amount,
        validUntil: quote.valid_until,
        status: quote.status,
        acceptedAt: quote.accepted_at,
        acceptedByName: quote.accepted_by_name,
        organizationName: quote.organizations?.name,
        items: quote.quote_items,
        documentUrl: signedDocument?.signedUrl || null,
        documentTitle: document?.title || null,
      },
    }), { headers });
  }

  if (action !== "accept") return new Response(JSON.stringify({ error: "Onbekende actie." }), { status: 400, headers });
  if (body.confirmed !== true) return new Response(JSON.stringify({ error: "Bevestig dat u akkoord gaat." }), { status: 400, headers });
  const actorName = safeText(body.actorName);
  const actorEmail = safeText(body.actorEmail).toLowerCase();
  if (actorName.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(actorEmail)) {
    return new Response(JSON.stringify({ error: "Vul uw naam en een geldig e-mailadres in." }), { status: 400, headers });
  }
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";
  const ipHash = forwarded ? await sha256(`${forwarded}:${Deno.env.get("QUOTE_ACCEPTANCE_IP_SALT") || "roofsignal"}`) : null;
  const { data: accepted, error: acceptError } = await service.rpc("accept_quote_by_token", {
    p_token_hash: tokenHash,
    p_actor_name: actorName,
    p_actor_email: actorEmail,
    p_user_agent: safeText(req.headers.get("user-agent"), 1000),
    p_ip_hash: ipHash,
  });
  if (acceptError) return new Response(JSON.stringify({ error: acceptError.message }), { status: 400, headers });
  const acceptedAt = new Date(String(accepted?.accepted_at || new Date().toISOString()));
  const finalized = await finalizeAcceptedDocument(service, quote, {
    name: actorName, email: actorEmail, acceptedAt, ipHash,
    userAgent: req.headers.get("user-agent"), authMethod: "secure_email_link_with_confirmation",
  });
  await notifyAcceptance(quote, actorName, actorEmail);
  return new Response(JSON.stringify({ success: true, result: accepted, ...finalized }), { headers });
});
