import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Resend } from "npm:resend@4.2.0";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const NOTIFICATION_EMAIL = Deno.env.get("NOTIFICATION_EMAIL") || "info@roofsignal.nl";
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") || "RoofSignal <noreply@roofsignal.nl>";

if (!RESEND_API_KEY) {
  console.error("RESEND_API_KEY is not set. Email notifications will fail.");
}

const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

interface LeadRecord {
  id: string;
  request_type: string;
  name: string;
  organization: string | null;
  email: string;
  segment: string | null;
  postcode: string | null;
  object_complexity: string | null;
  site_access: string | null;
  scope: string | null;
  message: string | null;
  source_path: string | null;
  created_at: string;
  status: string;
}

const EMAIL_SUBJECTS: Record<string, string> = {
  report: "RoofSignal – Aanvraag voorbeeldrapport",
  price: "RoofSignal – Offerteaanvraag",
  contact: "RoofSignal – Aanvraag portefeuillescan",
  parken: "RoofSignal – Aanvraag Woningscan De Parken",
  "de-parken": "RoofSignal – Aanvraag Woningscan De Parken",
  access: "RoofSignal – Aanvraag portaaltoegang",
};

function formatLeadBody(record: LeadRecord): string {
  const lines: string[] = [];

  const header = EMAIL_SUBJECTS[record.request_type]
    ? `Nieuwe ${EMAIL_SUBJECTS[record.request_type].replace("RoofSignal – ", "").toLowerCase()}`
    : `Nieuwe lead (${record.request_type})`;
  lines.push(header);
  lines.push("=".repeat(header.length));
  lines.push("");

  lines.push(`Naam:         ${record.name}`);
  lines.push(`E-mail:       ${record.email}`);
  if (record.organization) {
    lines.push(`Organisatie:  ${record.organization}`);
  }
  if (record.segment) {
    lines.push(`Segment:      ${record.segment}`);
  }
  if (record.postcode) {
    lines.push(`Postcode:     ${record.postcode}`);
  }
  if (record.object_complexity) {
    lines.push(`Complexiteit: ${record.object_complexity}`);
  }
  if (record.site_access) {
    lines.push(`Toegang:      ${record.site_access}`);
  }
  if (record.scope) {
    lines.push(`Scope:        ${record.scope}`);
  }
  if (record.message) {
    lines.push("");
    lines.push("--- Bericht ---");
    lines.push(record.message);
  }
  lines.push("");
  lines.push(`Bron: ${record.source_path || "onbekend"}`);
  lines.push(`Tijd:  ${record.created_at}`);
  lines.push(`URL:   https://www.roofsignal.nl${record.source_path || ""}`);
  lines.push("");
  lines.push("---");
  lines.push("Deze notificatie is automatisch verstuurd door RoofSignal.");

  return lines.join("\n");
}

function createHtmlBody(record: LeadRecord): string {
  const rows: string[] = [];
  const add = (label: string, value: string | null) => {
    if (value) rows.push(`<tr><td style="padding:4px 12px 4px 0;color:#555;white-space:nowrap;vertical-align:top">${label}</td><td style="padding:4px 0">${value}</td></tr>`);
  };

  add("Naam", record.name);
  add("E-mail", `<a href="mailto:${record.email}">${record.email}</a>`);
  add("Organisatie", record.organization);
  add("Segment", record.segment);
  add("Postcode", record.postcode);
  add("Complexiteit", record.object_complexity);
  add("Toegang locatie", record.site_access);
  add("Scope", record.scope);

  const messageHtml = record.message
    ? `<div style="margin-top:16px;padding:12px;background:#f5f5f5;border-left:4px solid #f97316;border-radius:0 6px 6px 0"><strong>Bericht:</strong><br>${record.message.replace(/\n/g, "<br>")}</div>`
    : "";

  return `<!DOCTYPE html>
<html>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1a1a;max-width:580px;margin:0 auto;padding:20px">
  <div style="background:#0f172a;padding:20px;border-radius:8px 8px 0 0">
    <span style="color:#f97316;font-size:24px">⌂</span><span style="color:#fff;font-weight:700;font-size:18px">ROOF<span style="color:#f97316">SIGNAL</span></span>
  </div>
  <div style="padding:24px;border:1px solid #e2e8f0;border-top:0;border-radius:0 0 8px 8px">
    <h2 style="margin:0 0 16px;color:#0f172a">${EMAIL_SUBJECTS[record.request_type] || `Nieuwe lead (${record.request_type})`}</h2>
    <table style="border-collapse:collapse">${rows.join("")}</table>
    ${messageHtml}
    <hr style="margin:20px 0;border:0;border-top:1px solid #e2e8f0">
    <p style="color:#888;font-size:12px">Bron: <a href="https://www.roofsignal.nl${record.source_path || ""}">${record.source_path || "onbekend"}</a> &middot; ${record.created_at}</p>
    <p style="color:#888;font-size:12px">Automatische notificatie van RoofSignal</p>
  </div>
</body>
</html>`;
}

serve(async (req: Request): Promise<Response> => {
  // Only accept POST
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  // Two ways this can be called:
  // 1. From Supabase Database Webhook → payload has { record: ..., type: "INSERT", ... }
  // 2. From frontend fallback → payload has { record: ... }
  let record: LeadRecord;
  try {
    const body = await req.json();
    const raw = body.record || body;

    // Normalize field names: frontend sends 'type','complexity';
    // DB webhook sends 'request_type','object_complexity'.
    record = {
      id: raw.id || "",
      request_type: raw.request_type || raw.type || "contact",
      name: raw.name || "",
      organization: raw.organization || null,
      email: raw.email || "",
      segment: raw.segment || null,
      postcode: raw.postcode || null,
      object_complexity: raw.object_complexity || raw.complexity || null,
      site_access: raw.site_access || null,
      scope: raw.scope || null,
      message: raw.message || null,
      source_path: raw.source_path || "",
      created_at: raw.created_at || new Date().toISOString(),
      status: raw.status || "new",
    };
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 });
  }

  if (!record || !record.email) {
    return new Response(JSON.stringify({ error: "Missing required field: email" }), { status: 400 });
  }

  // The access form has no name field; organization serves as identifier.
  if (!record.name && !record.organization) {
    return new Response(JSON.stringify({ error: "Missing required fields: name or organization" }), { status: 400 });
  }

  // Fallback: if Resend isn't configured, log and return success
  // (the lead is still saved in the database, which is the critical part)
  if (!resend) {
    console.log("[NO-RESEND] Would send email for lead:", JSON.stringify(record));
    return new Response(JSON.stringify({ success: true, mode: "dry-run" }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [NOTIFICATION_EMAIL],
      subject: EMAIL_SUBJECTS[record.request_type] || `RoofSignal – Nieuwe lead (${record.request_type})`,
      text: formatLeadBody(record),
      html: createHtmlBody(record),
      reply_to: record.email,
    });

    if (error) {
      console.error("Resend error:", error);
      return new Response(JSON.stringify({ success: false, error: error.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    console.log("Email sent:", data?.id);
    return new Response(JSON.stringify({ success: true, id: data?.id }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(
      JSON.stringify({ success: false, error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
