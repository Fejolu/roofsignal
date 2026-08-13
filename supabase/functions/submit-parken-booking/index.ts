import { createClient } from "npm:@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const origins = new Set(["https://www.roofsignal.nl", "https://roofsignal.nl", "http://localhost:8080", "http://127.0.0.1:8080"]);
function cors(req: Request) { const origin = req.headers.get("origin") || ""; return { "Access-Control-Allow-Origin": origins.has(origin) ? origin : "https://www.roofsignal.nl", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS", "Content-Type": "application/json", "Vary": "Origin" }; }
async function digest(value: string) { const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)); return Array.from(new Uint8Array(bytes)).map((part) => part.toString(16).padStart(2, "0")).join(""); }
async function verify(token: string, ip: string) { const secret = (Deno.env.get("TURNSTILE_SECRET_KEY") || "").trim(); if (!secret || !token) return false; const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ secret, response: token, remoteip: ip }) }); const result = await response.json().catch(() => ({})); return response.ok && result.success === true; }

serve(async (req) => {
  const headers = cors(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers });
  if (!origins.has(req.headers.get("origin") || "")) return new Response(JSON.stringify({ error: "Ongeldige aanvraagbron." }), { status: 403, headers });
  const body = await req.json().catch(() => ({}));
  if (String(body.company_website || "").trim()) return new Response(JSON.stringify({ success: true }), { headers });
  const ip = (req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for") || "unknown").split(",")[0].trim();
  if (!await verify(String(body.turnstile_token || ""), ip)) return new Response(JSON.stringify({ error: "Menselijke verificatie mislukt." }), { status: 403, headers });
  const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const ipHash = await digest(`${Deno.env.get("FORM_RATE_LIMIT_SALT") || "roofsignal"}:${ip}`);
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await service.from("public_form_attempts").select("id", { head: true, count: "exact" }).eq("ip_hash", ipHash).eq("form_type", "parken").gte("created_at", since);
  if ((count || 0) >= 3) return new Response(JSON.stringify({ error: "Te veel reserveringspogingen. Probeer het later opnieuw." }), { status: 429, headers });
  await service.from("public_form_attempts").insert({ ip_hash: ipHash, form_type: "parken" });
  const { data, error } = await service.rpc("create_parken_booking", { p_name: body.name, p_email: body.email, p_phone: body.phone, p_street: body.street, p_house_number: body.house_number, p_postcode: body.postcode, p_slot_date: body.slot_date, p_slot_time: body.slot_time, p_notes: body.notes || "", p_source: body.source || "de-parken-directmail-2026", p_terms_accepted: Boolean(body.terms_accepted), p_early_start_requested: Boolean(body.early_start_requested), p_thermography_interest: Boolean(body.thermography_interest) });
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400, headers });
  const booking = Array.isArray(data) ? data[0] : data;
  const confirmation = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-parken-booking-confirmation`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` }, body: JSON.stringify({ reference: booking.reference, email: body.email }) });
  if (!confirmation.ok) return new Response(JSON.stringify({ error: "Reservering opgeslagen; bevestiging kon niet worden verstuurd." }), { status: 502, headers });
  return new Response(JSON.stringify({ success: true, booking }), { headers });
});
