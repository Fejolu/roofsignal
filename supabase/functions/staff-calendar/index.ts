import { createClient } from "npm:@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const jsonHeaders = { "Access-Control-Allow-Origin": "https://www.roofsignal.nl", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Content-Type": "application/json" };
const sha256 = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))).map((byte) => byte.toString(16).padStart(2, "0")).join("");
const randomToken = () => Array.from(crypto.getRandomValues(new Uint8Array(32))).map((byte) => byte.toString(16).padStart(2, "0")).join("");
const pad = (value: number) => String(value).padStart(2, "0");
const icsDate = (value: string) => { const d = new Date(value); return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`; };
const esc = (value: unknown) => String(value || "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: jsonHeaders });
  const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  if (req.method === "GET") {
    const token = new URL(req.url).searchParams.get("token") || "";
    const { data: feed } = await service.from("calendar_feed_tokens").select("profile_id,enabled").eq("token_hash", await sha256(token)).maybeSingle();
    if (!feed?.enabled) return new Response("Ongeldige agendalink.", { status: 404 });
    const { data: appointments } = await service.from("appointments").select("id,title,starts_at,ends_at,status,notes,organizations(name),properties(name,address,postcode,city)").eq("inspector_id", feed.profile_id).neq("status", "cancelled").order("starts_at");
    const events = (appointments || []).filter((item) => item.starts_at && item.ends_at).map((item) => {
      const address = [item.properties?.address, item.properties?.postcode, item.properties?.city].filter(Boolean).join(", ");
      return ["BEGIN:VEVENT", `UID:appointment-${item.id}@roofsignal.nl`, `DTSTAMP:${icsDate(new Date().toISOString())}`, `DTSTART:${icsDate(item.starts_at)}`, `DTEND:${icsDate(item.ends_at)}`, `SUMMARY:${esc(item.title)}`, `LOCATION:${esc(address)}`, `DESCRIPTION:${esc(`RoofSignal\\n${item.organizations?.name || ""}\\n${item.properties?.name || ""}`)}`, `STATUS:${item.status === "cancelled" ? "CANCELLED" : "CONFIRMED"}`, "END:VEVENT"].join("\r\n");
    }).join("\r\n");
    return new Response(["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//RoofSignal//Medewerkerplanning//NL", "CALSCALE:GREGORIAN", "X-WR-CALNAME:RoofSignal planning", events, "END:VCALENDAR", ""].join("\r\n"), { headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "no-store" } });
  }
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: jsonHeaders });
  const authorization = req.headers.get("Authorization") || "";
  const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
  const { data: userData } = await userClient.auth.getUser();
  if (!userData.user) return new Response(JSON.stringify({ error: "Niet aangemeld." }), { status: 401, headers: jsonHeaders });
  const { data: caller } = await userClient.from("profiles").select("role,email").eq("id", userData.user.id).maybeSingle();
  const internal = String(caller?.email || userData.user.email || "").endsWith("@roofsignal.nl") || ["planning", "hr", "owner_admin"].includes(caller?.role);
  if (!internal) return new Response(JSON.stringify({ error: "Geen toestemming." }), { status: 403, headers: jsonHeaders });
  const body = await req.json().catch(() => ({}));
  const profileId = String(body.profileId || "");
  const token = randomToken();
  await service.from("calendar_feed_tokens").upsert({ profile_id: profileId, token_hash: await sha256(token), enabled: true }, { onConflict: "profile_id" });
  const feedUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/staff-calendar?token=${token}`;
  return new Response(JSON.stringify({ success: true, feedUrl, webcalUrl: feedUrl.replace(/^https:/, "webcal:") }), { headers: jsonHeaders });
});
