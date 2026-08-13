import { createClient } from "npm:@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const origins = new Set(["https://www.roofsignal.nl", "https://roofsignal.nl", "http://localhost:8080", "http://127.0.0.1:8080"]);
const allowedTypes = new Set(["report", "price", "contact", "access"]);
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cors(req: Request) {
  const origin = req.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": origins.has(origin) ? origin : "https://www.roofsignal.nl",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
    "Vary": "Origin",
  };
}

async function digest(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes)).map((part) => part.toString(16).padStart(2, "0")).join("");
}

async function verifyTurnstile(token: string, ip: string) {
  const secret = (Deno.env.get("TURNSTILE_SECRET_KEY") || "").trim();
  if (!secret || !token || token.length > 2048) return false;
  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ secret, response: token, remoteip: ip }),
  });
  const result = await response.json().catch(() => ({}));
  return response.ok && result.success === true;
}

serve(async (req) => {
  const headers = cors(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers });
  const origin = req.headers.get("origin") || "";
  if (!origins.has(origin)) return new Response(JSON.stringify({ error: "Ongeldige aanvraagbron." }), { status: 403, headers });

  const body = await req.json().catch(() => ({}));
  if (String(body.company_website || "").trim()) return new Response(JSON.stringify({ success: true }), { headers });
  const ip = (req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for") || "unknown").split(",")[0].trim();
  if (!await verifyTurnstile(String(body.turnstile_token || ""), ip)) {
    return new Response(JSON.stringify({ error: "Menselijke verificatie mislukt. Probeer het opnieuw." }), { status: 403, headers });
  }

  const requestType = allowedTypes.has(String(body.type)) ? String(body.type) : "contact";
  const name = String(body.name || "").trim().slice(0, 160);
  const organization = String(body.organization || "").trim().slice(0, 200) || null;
  const email = String(body.email || "").trim().toLowerCase().slice(0, 254);
  if ((!name && !organization) || !emailPattern.test(email)) {
    return new Response(JSON.stringify({ error: "Controleer naam en e-mailadres." }), { status: 400, headers });
  }

  const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const ipHash = await digest(`${Deno.env.get("FORM_RATE_LIMIT_SALT") || "roofsignal"}:${ip}`);
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await service.from("public_form_attempts").select("id", { head: true, count: "exact" }).eq("ip_hash", ipHash).eq("form_type", requestType).gte("created_at", since);
  if ((count || 0) >= 5) return new Response(JSON.stringify({ error: "Te veel aanvragen. Probeer het later opnieuw." }), { status: 429, headers });
  await service.from("public_form_attempts").insert({ ip_hash: ipHash, form_type: requestType });

  const record = {
    request_type: requestType, name, organization, email,
    segment: String(body.segment || "").slice(0, 120) || null,
    postcode: String(body.postcode || "").slice(0, 20) || null,
    object_complexity: String(body.complexity || "").slice(0, 120) || null,
    site_access: String(body.site_access || "").slice(0, 120) || null,
    scope: String(body.scope || "").slice(0, 240) || null,
    message: String(body.message || "").slice(0, 4000) || null,
    source_path: String(body.source_path || "").slice(0, 240),
  };
  const { data, error } = await service.from("lead_requests").insert(record).select("*").single();
  if (error) return new Response(JSON.stringify({ error: "Aanvraag kon niet worden opgeslagen." }), { status: 500, headers });

  const notify = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-lead-notification`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
    body: JSON.stringify({ record: data }),
  });
  if (!notify.ok) return new Response(JSON.stringify({ error: "Aanvraag opgeslagen; bevestiging kon niet worden verstuurd." }), { status: 502, headers });
  return new Response(JSON.stringify({ success: true }), { headers });
});
