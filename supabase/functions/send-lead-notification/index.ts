import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

async function sendEmail(apiKey: string, fromEmail: string, fromName: string, to: string, subject: string, text: string, html: string, replyTo: string) {
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "accept": "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sender: { email: fromEmail, name: fromName },
      to: [{ email: to }],
      replyTo: { email: replyTo },
      headers: {
        "X-Mailin-Track": "0",
      },
      subject,
      textContent: text,
      htmlContent: html,
    }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.message || body.code || JSON.stringify(body));
  return body;
}

function escapeHtml(value: string | null | undefined): string {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

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
  lines.push(`Naam:         ${record.name || record.organization || "-"}`);
  lines.push(`E-mail:       ${record.email}`);
  if (record.organization) lines.push(`Organisatie:  ${record.organization}`);
  if (record.segment) lines.push(`Segment:      ${record.segment}`);
  if (record.postcode) lines.push(`Postcode:     ${record.postcode}`);
  if (record.object_complexity) lines.push(`Complexiteit: ${record.object_complexity}`);
  if (record.site_access) lines.push(`Toegang:      ${record.site_access}`);
  if (record.scope) lines.push(`Scope:        ${record.scope}`);
  if (record.message) { lines.push(""); lines.push("--- Bericht ---"); lines.push(record.message); }
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
  add("Naam", escapeHtml(record.name || record.organization));
  add("E-mail", `<a href="mailto:${escapeHtml(record.email)}">${escapeHtml(record.email)}</a>`);
  add("Organisatie", escapeHtml(record.organization));
  add("Segment", escapeHtml(record.segment));
  add("Postcode", escapeHtml(record.postcode));
  add("Complexiteit", escapeHtml(record.object_complexity));
  add("Toegang locatie", escapeHtml(record.site_access));
  add("Scope", escapeHtml(record.scope));
  const msgHtml = record.message
    ? `<div style="margin-top:16px;padding:12px;background:#f5f5f5;border-left:4px solid #f97316;border-radius:0 6px 6px 0"><strong>Bericht:</strong><br>${escapeHtml(record.message).replace(/\n/g, "<br>")}</div>`
    : "";
  return `<!DOCTYPE html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1a1a;max-width:580px;margin:0 auto;padding:20px"><div style="background:#0f172a;padding:20px;border-radius:8px 8px 0 0"><span style="color:#f97316;font-size:24px">⌂</span><span style="color:#fff;font-weight:700;font-size:18px">ROOF<span style="color:#f97316">SIGNAL</span></span></div><div style="padding:24px;border:1px solid #e2e8f0;border-top:0;border-radius:0 0 8px 8px"><h2 style="margin:0 0 16px;color:#0f172a">${escapeHtml(EMAIL_SUBJECTS[record.request_type] || `Nieuwe lead (${record.request_type})`)}</h2><table style="border-collapse:collapse">${rows.join("")}</table>${msgHtml}<hr style="margin:20px 0;border:0;border-top:1px solid #e2e8f0"><p style="color:#888;font-size:12px">Bron: <a href="https://www.roofsignal.nl${escapeHtml(record.source_path || "")}">${escapeHtml(record.source_path || "onbekend")}</a> &middot; ${escapeHtml(record.created_at)}</p><p style="color:#888;font-size:12px">Automatische notificatie van RoofSignal</p></div></body></html>`;
}

function applicantCopy(record: LeadRecord): { subject: string; intro: string; next: string } {
  if (record.request_type === "report") {
    return {
      subject: "RoofSignal – uw voorbeeldrapportaanvraag is ontvangen",
      intro: "Bedankt voor uw interesse in het RoofSignal voorbeeldrapport.",
      next: "We sturen het voorbeeldrapport of een passende reactie naar dit e-mailadres.",
    };
  }
  if (record.request_type === "price") {
    return {
      subject: "RoofSignal – uw offerteaanvraag is ontvangen",
      intro: "Bedankt voor uw offerteaanvraag.",
      next: "We beoordelen de gegevens en sturen een heldere reactie naar dit e-mailadres.",
    };
  }
  if (record.request_type === "access") {
    return {
      subject: "RoofSignal – uw aanvraag voor portaaltoegang is ontvangen",
      intro: "Bedankt voor uw aanvraag voor portaaltoegang.",
      next: "We controleren de organisatiegegevens en nemen contact op over de toegang.",
    };
  }
  if (record.request_type === "parken" || record.request_type === "de-parken") {
    return {
      subject: "RoofSignal – uw Woningscan-aanvraag is ontvangen",
      intro: "Bedankt voor uw aanvraag voor de RoofSignal Woningscan De Parken.",
      next: "We nemen contact op over planning, scope en vervolgstappen.",
    };
  }
  return {
    subject: "RoofSignal – uw aanvraag is ontvangen",
    intro: "Bedankt voor uw interesse in RoofSignal.",
    next: "We nemen contact op via dit e-mailadres.",
  };
}

function formatApplicantBody(record: LeadRecord): string {
  const copy = applicantCopy(record);
  const lines = [
    copy.subject.replace("RoofSignal – ", ""),
    "",
    `Beste ${record.name || record.organization || "aanvrager"},`,
    "",
    copy.intro,
    copy.next,
    "",
    "Samenvatting van uw aanvraag:",
    `- Naam: ${record.name || record.organization || "-"}`,
  ];
  if (record.organization) lines.push(`- Organisatie: ${record.organization}`);
  if (record.postcode) lines.push(`- Postcode: ${record.postcode}`);
  if (record.scope) lines.push(`- Scope: ${record.scope}`);
  if (record.message) lines.push(`- Bericht: ${record.message}`);
  lines.push("", "Heeft u vragen? Reageer dan op deze e-mail of mail naar info@roofsignal.nl.", "", "Met vriendelijke groet,", "RoofSignal", "085 21 28 019", "roofsignal.nl");
  return lines.join("\n");
}

function createApplicantHtmlBody(record: LeadRecord): string {
  const copy = applicantCopy(record);
  const rows: string[] = [];
  const add = (label: string, value: string | null) => {
    if (value) rows.push(`<tr><td style="padding:4px 12px 4px 0;color:#555;white-space:nowrap;vertical-align:top">${label}</td><td style="padding:4px 0">${escapeHtml(value)}</td></tr>`);
  };
  add("Naam", record.name || record.organization);
  add("Organisatie", record.organization);
  add("Postcode", record.postcode);
  add("Scope", record.scope);
  add("Bericht", record.message);
  return `<!DOCTYPE html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1a1a;max-width:580px;margin:0 auto;padding:20px"><div style="background:#0f172a;padding:20px;border-radius:8px 8px 0 0"><span style="color:#f97316;font-size:24px">⌂</span><span style="color:#fff;font-weight:700;font-size:18px">ROOF<span style="color:#f97316">SIGNAL</span></span></div><div style="padding:24px;border:1px solid #e2e8f0;border-top:0;border-radius:0 0 8px 8px"><h2 style="margin:0 0 16px;color:#0f172a">${escapeHtml(copy.subject.replace("RoofSignal – ", ""))}</h2><p>Beste ${escapeHtml(record.name || record.organization || "aanvrager")},</p><p>${escapeHtml(copy.intro)}</p><p>${escapeHtml(copy.next)}</p><table style="border-collapse:collapse;margin-top:16px">${rows.join("")}</table><hr style="margin:20px 0;border:0;border-top:1px solid #e2e8f0"><p>Heeft u vragen? Reageer dan op deze e-mail of mail naar <a href="mailto:info@roofsignal.nl">info@roofsignal.nl</a>.</p><p style="margin-bottom:0">Met vriendelijke groet,<br>RoofSignal<br><a href="tel:+31852128019">085 21 28 019</a><br><a href="https://www.roofsignal.nl">roofsignal.nl</a></p></div></body></html>`;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: corsHeaders });
  }

  let record: LeadRecord;
  try {
    const body = await req.json();
    const raw = body.record || body;
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
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: corsHeaders });
  }

  if (!record.email) {
    return new Response(JSON.stringify({ error: "Missing required field: email" }), { status: 400, headers: corsHeaders });
  }
  if (!record.name && !record.organization) {
    return new Response(JSON.stringify({ error: "Missing required fields: name or organization" }), { status: 400, headers: corsHeaders });
  }

  const apiKey = (Deno.env.get("BREVO_API_KEY") || "").trim();
  if (!apiKey) {
    console.log("[NO-BREVO] Would send email:", JSON.stringify(record));
    return new Response(JSON.stringify({ success: true, mode: "dry-run" }), {
      headers: corsHeaders,
    });
  }

  const fromEmail = Deno.env.get("BREVO_FROM_EMAIL") || "noreply@roofsignal.nl";
  const fromName = Deno.env.get("BREVO_FROM_NAME") || "RoofSignal";
  const toEmail = Deno.env.get("NOTIFICATION_EMAIL") || "info@roofsignal.nl";
  const subject = EMAIL_SUBJECTS[record.request_type] || `RoofSignal – Nieuwe lead (${record.request_type})`;
  const applicant = applicantCopy(record);

  try {
    const [internal, confirmation] = await Promise.all([
      sendEmail(apiKey, fromEmail, fromName, toEmail, subject, formatLeadBody(record), createHtmlBody(record), record.email),
      sendEmail(apiKey, fromEmail, fromName, record.email, applicant.subject, formatApplicantBody(record), createApplicantHtmlBody(record), toEmail),
    ]);
    console.log("Emails sent:", { internal: internal?.messageId, confirmation: confirmation?.messageId });
    return new Response(JSON.stringify({
      success: true,
      ids: {
        internal: internal?.messageId,
        confirmation: confirmation?.messageId,
      },
    }), {
      headers: corsHeaders,
    });
  } catch (err) {
    console.error("Send error:", err);
    return new Response(
      JSON.stringify({ success: false, error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: corsHeaders }
    );
  }
});
