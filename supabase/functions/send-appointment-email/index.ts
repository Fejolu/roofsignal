import { createClient } from "npm:@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const cors = {
  "Access-Control-Allow-Origin": "https://www.roofsignal.nl",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const escapeHtml = (value: unknown) => String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const validEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const pad = (value: number) => String(value).padStart(2, "0");
const icsDate = (value: string) => {
  const date = new Date(value);
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
};
const icsEscape = (value: unknown) => String(value || "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
};
function calendarEvent(appointment: any, address: string) {
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//RoofSignal//Planning//NL", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:appointment-${appointment.id}@roofsignal.nl`,
    `DTSTAMP:${icsDate(new Date().toISOString())}`,
    `DTSTART:${icsDate(appointment.starts_at)}`,
    `DTEND:${icsDate(appointment.ends_at)}`,
    `SUMMARY:${icsEscape(appointment.title)}`,
    `LOCATION:${icsEscape(address)}`,
    `DESCRIPTION:${icsEscape(`RoofSignal inspectie\\nKlant: ${appointment.organizations?.name || "-"}\\nObject: ${appointment.properties?.name || "-"}`)}`,
    "STATUS:CONFIRMED",
    "END:VEVENT", "END:VCALENDAR", "",
  ].join("\r\n");
}
async function sendBrevo(payload: Record<string, unknown>) {
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": (Deno.env.get("BREVO_API_KEY") || "").trim(), accept: "application/json", "Content-Type": "application/json" },
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
  const authorization = req.headers.get("Authorization") || "";
  const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
  const { data: userData } = await userClient.auth.getUser();
  if (!userData.user) return new Response(JSON.stringify({ error: "Niet aangemeld." }), { status: 401, headers: cors });
  const { data: caller } = await userClient.from("profiles").select("role,email").eq("id", userData.user.id).maybeSingle();
  const internal = String(caller?.email || userData.user.email || "").endsWith("@roofsignal.nl") || ["support", "planning", "finance", "reportage", "owner_admin"].includes(caller?.role);
  if (!internal) return new Response(JSON.stringify({ error: "Geen toestemming." }), { status: 403, headers: cors });

  const body = await req.json().catch(() => ({}));
  const appointmentId = String(body.appointmentId || "");
  const testRecipient = String(body.testRecipient || "").trim().toLowerCase();
  if (testRecipient && testRecipient !== "ferry@roofsignal.nl") return new Response(JSON.stringify({ error: "Alleen ferry@roofsignal.nl is toegestaan als testontvanger." }), { status: 400, headers: cors });
  const service = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: appointment, error } = await service.from("appointments")
    .select("id,title,starts_at,ends_at,notes,inspector_id,organizations(name,contact_name,contact_email),properties(name,address,postcode,city),profiles!appointments_inspector_id_fkey(full_name,email)")
    .eq("id", appointmentId).single();
  if (error || !appointment) return new Response(JSON.stringify({ error: "Afspraak niet gevonden." }), { status: 404, headers: cors });
  const address = [appointment.properties?.address, appointment.properties?.postcode, appointment.properties?.city].filter(Boolean).join(", ");
  const when = new Intl.DateTimeFormat("nl-NL", { dateStyle: "full", timeStyle: "short", timeZone: "Europe/Amsterdam" }).format(new Date(appointment.starts_at));
  const ics = calendarEvent(appointment, address);
  const attachment = [{ name: "RoofSignal-inspectie.ics", content: bytesToBase64(new TextEncoder().encode(ics)) }];
  const fromEmail = Deno.env.get("BREVO_FROM_EMAIL") || "noreply@roofsignal.nl";
  const sender = { email: fromEmail, name: Deno.env.get("BREVO_FROM_NAME") || "RoofSignal" };
  const replyTo = { email: "info@roofsignal.nl", name: "RoofSignal" };
  const messages: Array<{ type: string; recipient: string; result: any }> = [];
  const recipients = testRecipient
    ? [{ type: "customer_test", email: testRecipient, name: "Ferry Joosten", heading: "[TEST] Afspraakbevestiging", intro: `De inspectie voor ${appointment.organizations?.name || "de klant"} is gepland.` }]
    : [
      { type: "customer", email: String(appointment.organizations?.contact_email || "").toLowerCase(), name: appointment.organizations?.contact_name || appointment.organizations?.name, heading: "Uw RoofSignal-inspectie is gepland", intro: "De afspraak voor uw gebouwschilinspectie is bevestigd." },
      { type: "inspector", email: String(appointment.profiles?.email || "").toLowerCase(), name: appointment.profiles?.full_name || "Inspecteur", heading: "Nieuwe RoofSignal-inspectie", intro: "Er is een inspectie aan u toegewezen." },
    ];
  for (const message of recipients) {
    if (!validEmail(message.email)) continue;
    const html = `<!doctype html><html><body style="margin:0;background:#f3f5f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#17201d"><table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="padding:28px 12px"><tr><td align="center"><table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:600px;background:#fff;border-radius:12px;overflow:hidden"><tr><td style="background:#101715;padding:24px 28px;color:#fff;font-size:20px;font-weight:800">⌂ ROOF<span style="color:#ff5a1f">SIGNAL</span></td></tr><tr><td style="padding:34px 32px"><div style="color:#ff5a1f;font-size:12px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase">Afspraakbevestiging</div><h1 style="font-size:28px;margin:10px 0 18px">${escapeHtml(message.heading)}</h1><p>Beste ${escapeHtml(message.name || "")},</p><p style="line-height:1.65">${escapeHtml(message.intro)}</p><div style="background:#f6f7f6;border-left:4px solid #ff5a1f;padding:16px 18px;margin:22px 0"><strong>Datum en tijd:</strong> ${escapeHtml(when)}<br><strong>Adres:</strong> ${escapeHtml(address)}<br><strong>Inspectie:</strong> ${escapeHtml(appointment.title)}</div><p>Gebruik de agenda-bijlage om deze afspraak toe te voegen.</p><p style="line-height:1.6">Met vriendelijke groet,<br><strong>F.J. Joosten</strong><br>RoofSignal</p></td></tr></table></td></tr></table></body></html>`;
    const text = [message.heading, "", message.intro, `Datum en tijd: ${when}`, `Adres: ${address}`, `Inspectie: ${appointment.title}`, "", "De agenda-uitnodiging is als bijlage toegevoegd.", "", "RoofSignal"].join("\n");
    const result = await sendBrevo({ sender, to: [{ email: message.email, name: message.name }], replyTo, headers: { "X-Mailin-Track": "0" }, subject: `${testRecipient ? "[TEST] " : ""}RoofSignal afspraakbevestiging – ${appointment.properties?.name || address}`, textContent: text, htmlContent: html, attachment });
    messages.push({ type: message.type, recipient: message.email, result });
  }
  if (!testRecipient) await service.from("appointments").update({
    customer_notified_at: messages.some((item) => item.type === "customer") ? new Date().toISOString() : null,
    inspector_notified_at: messages.some((item) => item.type === "inspector") ? new Date().toISOString() : null,
  }).eq("id", appointment.id);
  return new Response(JSON.stringify({ success: true, messages: messages.map(({ type, recipient, result }) => ({ type, recipient, messageId: result?.messageId || null })) }), { headers: cors });
});
