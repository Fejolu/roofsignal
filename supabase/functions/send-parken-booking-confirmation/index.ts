import { createClient } from "npm:@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const allowedOrigins = new Set([
  "https://www.roofsignal.nl",
  "https://roofsignal.nl",
  "http://127.0.0.1:8080",
  "http://localhost:8080",
]);
const escapeHtml = (value: unknown) => String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const validEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

function headers(req: Request) {
  const origin = req.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": allowedOrigins.has(origin) ? origin : "https://www.roofsignal.nl",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
    "Vary": "Origin",
  };
}

async function sendBrevo(payload: Record<string, unknown>) {
  const apiKey = (Deno.env.get("BREVO_API_KEY") || "").trim();
  if (!apiKey) throw new Error("E-mailprovider is niet geconfigureerd.");
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": apiKey, accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || body.code || "E-mailverzending mislukt.");
  return body;
}

serve(async (req) => {
  const cors = headers(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: cors });

  const body = await req.json().catch(() => ({}));
  const reference = String(body.reference || "").trim().toUpperCase();
  const email = String(body.email || "").trim().toLowerCase();
  if (!/^RS-PARKEN-[A-F0-9]{8}$/.test(reference) || !validEmail(email)) {
    return new Response(JSON.stringify({ error: "Ongeldige bevestigingsaanvraag." }), { status: 400, headers: cors });
  }

  const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: booking } = await service.from("parken_bookings")
    .select("id,reference,name,email,street,house_number,postcode,slot_date,slot_time,status,confirmation_sent_at")
    .eq("reference", reference).eq("email", email).maybeSingle();
  if (!booking) return new Response(JSON.stringify({ error: "Boeking niet gevonden." }), { status: 404, headers: cors });
  if (booking.status === "cancelled" || booking.status === "declined") {
    return new Response(JSON.stringify({ error: "Deze boeking is niet meer actief." }), { status: 409, headers: cors });
  }
  if (booking.confirmation_sent_at) return new Response(JSON.stringify({ success: true, alreadySent: true }), { headers: cors });

  const date = new Intl.DateTimeFormat("nl-NL", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Amsterdam" })
    .format(new Date(`${booking.slot_date}T12:00:00+02:00`));
  const address = `${booking.street} ${booking.house_number}, ${booking.postcode} Apeldoorn`;
  const sender = {
    email: Deno.env.get("BREVO_FROM_EMAIL") || "noreply@roofsignal.nl",
    name: Deno.env.get("BREVO_FROM_NAME") || "RoofSignal",
  };
  const html = `<!doctype html><html><body style="margin:0;background:#f3f5f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#17201d"><table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="padding:28px 12px"><tr><td align="center"><table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:600px;background:#fff;border-radius:12px;overflow:hidden"><tr><td style="background:#101715;padding:24px 28px;color:#fff;font-size:20px;font-weight:800">⌂ ROOF<span style="color:#ff5a1f">SIGNAL</span></td></tr><tr><td style="padding:34px 32px"><div style="color:#ff5a1f;font-size:12px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase">De Parken Pilot 2026</div><h1 style="font-size:28px;margin:10px 0 18px">Uw Woningscan is gereserveerd</h1><p>Beste ${escapeHtml(booking.name)},</p><p style="line-height:1.65">Dank voor uw opdracht. We hebben het onderstaande inspectiemoment voor u gereserveerd.</p><div style="background:#f6f7f6;border-left:4px solid #ff5a1f;padding:16px 18px;margin:22px 0"><strong>Datum:</strong> ${escapeHtml(date)}<br><strong>Tijdvenster:</strong> ${escapeHtml(booking.slot_time)}<br><strong>Adres:</strong> ${escapeHtml(address)}<br><strong>Referentie:</strong> ${escapeHtml(booking.reference)}</div><p style="line-height:1.65">De afspraak is weersafhankelijk. Als veilig vliegen of goed inspecteren niet mogelijk is, nemen we contact met u op voor een nieuw moment.</p><p style="line-height:1.65">Wilt u wijzigen of annuleren? Antwoord op deze e-mail of bel 085 21 28 019 en vermeld uw referentie.</p><p style="line-height:1.6">Met vriendelijke groet,<br><strong>F.J. Joosten</strong><br>RoofSignal</p></td></tr></table></td></tr></table></body></html>`;
  const text = ["Uw Woningscan is gereserveerd", "", `Beste ${booking.name},`, "", `Datum: ${date}`, `Tijdvenster: ${booking.slot_time}`, `Adres: ${address}`, `Referentie: ${booking.reference}`, "", "De afspraak is weersafhankelijk.", "", "Wijzigen of annuleren? Antwoord op deze e-mail of bel 085 21 28 019.", "", "RoofSignal"].join("\n");
  const result = await sendBrevo({
    sender,
    to: [{ email: booking.email, name: booking.name }],
    replyTo: { email: "info@roofsignal.nl", name: "RoofSignal" },
    headers: { "X-Mailin-Track": "0" },
    subject: `RoofSignal bevestiging – ${booking.reference}`,
    textContent: text,
    htmlContent: html,
  });
  await service.from("parken_bookings").update({ confirmation_sent_at: new Date().toISOString(), confirmation_message_id: result?.messageId || null, status: "confirmed" }).eq("id", booking.id);
  return new Response(JSON.stringify({ success: true }), { headers: cors });
});
