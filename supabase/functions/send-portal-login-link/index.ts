import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function escapeHtml(value: string | null | undefined): string {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeEmail(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

function safeRedirectTo(value: unknown): string {
  const fallback = "https://www.roofsignal.nl/portal-login";
  const redirectTo = String(value || fallback).trim();

  try {
    const url = new URL(redirectTo);
    if (url.hostname === "www.roofsignal.nl" || url.hostname === "roofsignal.nl") {
      return url.toString();
    }
  } catch (_error) {
    return fallback;
  }

  return fallback;
}

async function sendResendEmail(apiKey: string, fromEmail: string, fromName: string, to: string, subject: string, text: string, html: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `${fromName} <${fromEmail}>`,
      to: [to],
      reply_to: "info@roofsignal.nl",
      subject,
      text,
      html,
    }),
  });

  const body = await res.json();
  if (!res.ok) throw new Error(body.message || body.name || JSON.stringify(body));
  return body;
}

async function sendBrevoEmail(apiKey: string, fromEmail: string, fromName: string, to: string, subject: string, text: string, html: string) {
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
      replyTo: { email: "info@roofsignal.nl" },
      headers: { "X-Mailin-Track": "0" },
      subject,
      textContent: text,
      htmlContent: html,
    }),
  });

  const body = await res.json();
  if (!res.ok) throw new Error(body.message || body.code || JSON.stringify(body));
  return body;
}

type EmailMode = "magiclink" | "password_reset";
type PortalAudience = "customer" | "employee";

function buildPortalEmail(mode: EmailMode, actionLink: string, audience: PortalAudience, fullName = "") {
  const isPasswordReset = mode === "password_reset";
  const isEmployee = audience === "employee";
  const portalLabel = isEmployee ? "Beheerportaal" : "Klantenportaal";
  const title = isPasswordReset ? "Wachtwoord opnieuw instellen" : "Uw inloglink staat klaar";
  const subject = isPasswordReset ? "Wachtwoord opnieuw instellen | RoofSignal" : `Uw inloglink voor het RoofSignal ${portalLabel.toLowerCase()}`;
  const intro = isPasswordReset
    ? `Gebruik deze link om een nieuw wachtwoord in te stellen voor uw RoofSignal ${portalLabel.toLowerCase()}. De link is tijdelijk geldig en kan maar één keer worden gebruikt.`
    : `Gebruik deze link om veilig in te loggen in het RoofSignal ${portalLabel.toLowerCase()}. De link is tijdelijk geldig en kan maar één keer worden gebruikt.`;
  const buttonLabel = isPasswordReset ? "Nieuw wachtwoord instellen" : "Log in bij RoofSignal";
  const greeting = fullName ? `Beste ${fullName},` : "Beste gebruiker,";
  const text = [
    subject,
    "",
    greeting,
    "",
    intro,
    "",
    actionLink,
    "",
    "Heeft u deze link niet aangevraagd? Dan kunt u deze e-mail negeren.",
    "",
    "RoofSignal",
    "info@roofsignal.nl",
  ].join("\n");
  const escapedLink = escapeHtml(actionLink);
  const html = `<!doctype html>
<html lang="nl">
  <body style="margin:0;background:#f4f5f3;font-family:Arial,Helvetica,sans-serif;color:#111816;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f5f3;padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #e1e4df;border-radius:8px;overflow:hidden;">
            <tr>
              <td style="background:#0c1210;padding:24px 28px;">
                <div style="font-size:22px;font-weight:800;letter-spacing:.2px;color:#ffffff;">ROOF<span style="color:#ff5a1f;">SIGNAL</span></div>
                <div style="margin-top:6px;font-size:12px;letter-spacing:1.4px;text-transform:uppercase;color:#b7c0ba;">${portalLabel}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:30px 28px 10px;">
                <h1 style="margin:0 0 12px;font-size:26px;line-height:1.2;color:#111816;">${title}</h1>
                <p style="margin:0 0 12px;font-size:16px;line-height:1.55;color:#34413b;">${escapeHtml(greeting)}</p>
                <p style="margin:0 0 20px;font-size:16px;line-height:1.55;color:#34413b;">${intro}</p>
                <p style="margin:0 0 26px;">
                  <a href="${escapedLink}" style="display:inline-block;background:#ff5a1f;color:#ffffff;text-decoration:none;font-weight:700;border-radius:6px;padding:14px 20px;">${buttonLabel}</a>
                </p>
                <p style="margin:0 0 16px;font-size:13px;line-height:1.5;color:#5c6862;">Werkt de knop niet? Kopieer deze link naar uw browser:<br><a href="${escapedLink}" style="color:#ff5a1f;word-break:break-all;">${escapedLink}</a></p>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 28px 28px;border-top:1px solid #edf0ec;">
                <p style="margin:0;font-size:12px;line-height:1.5;color:#77817b;">Heeft u deze link niet aangevraagd? Dan kunt u deze e-mail negeren. Voor vragen: <a href="mailto:info@roofsignal.nl" style="color:#ff5a1f;">info@roofsignal.nl</a>.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject, text, html };
}

async function sendEmail(to: string, actionLink: string, mode: EmailMode, audience: PortalAudience, fullName = "") {
  const emailProvider = (Deno.env.get("EMAIL_PROVIDER") || "brevo").trim().toLowerCase();
  const resendApiKey = (Deno.env.get("RESEND_API_KEY") || "").trim();
  const brevoApiKey = (Deno.env.get("BREVO_API_KEY") || "").trim();
  const fromEmail = Deno.env.get("BREVO_FROM_EMAIL") || Deno.env.get("FROM_EMAIL") || "noreply@roofsignal.nl";
  const fromName = Deno.env.get("BREVO_FROM_NAME") || "RoofSignal";
  const { subject, text, html } = buildPortalEmail(mode, actionLink, audience, fullName);

  if (emailProvider === "brevo" && brevoApiKey) return sendBrevoEmail(brevoApiKey, fromEmail, fromName, to, subject, text, html);
  if (emailProvider === "resend" && resendApiKey) return sendResendEmail(resendApiKey, fromEmail, fromName, to, subject, text, html);

  throw new Error(`Configured email provider is unavailable: ${emailProvider}`);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: "Auth service is not configured." }), { status: 500, headers: corsHeaders });
  }

  const payload = await req.json().catch(() => ({}));
  const email = normalizeEmail(payload.email);
  const redirectTo = safeRedirectTo(payload.redirectTo);
  const mode: EmailMode = payload.action === "password_reset" ? "password_reset" : "magiclink";
  const genericResponse = new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return genericResponse;
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id,email,full_name,role")
    .eq("email", email)
    .maybeSingle();

  if (profileError) {
    console.error("Profile lookup failed", profileError);
    return new Response(JSON.stringify({ error: "Login link could not be sent." }), { status: 500, headers: corsHeaders });
  }

  if (!profile) {
    return genericResponse;
  }

  const internalRoles = new Set(["support", "planning", "finance", "reportage", "owner_admin"]);
  const audience: PortalAudience = email.endsWith("@roofsignal.nl") || internalRoles.has(profile.role) ? "employee" : "customer";

  const { data, error } = await supabase.auth.admin.generateLink({
    type: mode === "password_reset" ? "recovery" : "magiclink",
    email,
    options: {
      redirectTo,
    },
  });

  const actionLink = data?.properties?.action_link;
  if (error || !actionLink) {
    console.error("Magic link generation failed", error);
    return new Response(JSON.stringify({ error: "Login link could not be created." }), { status: 500, headers: corsHeaders });
  }

  try {
    await sendEmail(email, actionLink, mode, audience, profile.full_name || "");
  } catch (error) {
    console.error("Portal auth email failed", error);
    return new Response(JSON.stringify({ error: "Portal email could not be sent." }), { status: 500, headers: corsHeaders });
  }

  return genericResponse;
});
