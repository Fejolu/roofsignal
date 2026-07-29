import { createClient } from "npm:@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const headers = {
  "Access-Control-Allow-Origin": "https://www.roofsignal.nl",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const encode = (input: string) => new TextEncoder().encode(input);
async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
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
  const token = safeText(body.token, 300);
  const action = safeText(body.action, 30);
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
  await notifyAcceptance(quote, actorName, actorEmail);
  return new Response(JSON.stringify({ success: true, result: accepted }), { headers });
});
