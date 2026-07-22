import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const internalRoles = new Set(["support", "planning", "finance", "reportage", "owner_admin"]);

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

function normalizeText(value: unknown): string | null {
  const text = String(value || "").trim();
  return text || null;
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

function buildActivationEmail(actionLink: string, organizationName: string) {
  const subject = "Uw RoofSignal klantenportaal is aangemaakt";
  const escapedLink = escapeHtml(actionLink);
  const escapedOrganization = escapeHtml(organizationName || "uw organisatie");
  const text = [
    "Uw RoofSignal klantenportaal is aangemaakt",
    "",
    `Er is een RoofSignal klantenportaal klaargezet voor ${organizationName || "uw organisatie"}.`,
    "Gebruik onderstaande link om uw toegang te activeren en het portaal te openen.",
    "",
    actionLink,
    "",
    "Heeft u deze uitnodiging niet verwacht? Neem dan contact op via info@roofsignal.nl.",
    "",
    "RoofSignal",
    "info@roofsignal.nl",
  ].join("\n");
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
                <div style="margin-top:6px;font-size:12px;letter-spacing:1.4px;text-transform:uppercase;color:#b7c0ba;">Klantenportaal</div>
              </td>
            </tr>
            <tr>
              <td style="padding:30px 28px 10px;">
                <h1 style="margin:0 0 12px;font-size:26px;line-height:1.2;color:#111816;">Uw portaal staat klaar</h1>
                <p style="margin:0 0 20px;font-size:16px;line-height:1.55;color:#34413b;">Voor ${escapedOrganization} is een RoofSignal klantenportaal aangemaakt. Activeer uw toegang om rapporten, objecten, planning en opvolging te bekijken.</p>
                <p style="margin:0 0 26px;">
                  <a href="${escapedLink}" style="display:inline-block;background:#ff5a1f;color:#ffffff;text-decoration:none;font-weight:700;border-radius:6px;padding:14px 20px;">Activeer klantenportaal</a>
                </p>
                <p style="margin:0 0 16px;font-size:13px;line-height:1.5;color:#5c6862;">Werkt de knop niet? Kopieer deze link naar uw browser:<br><a href="${escapedLink}" style="color:#ff5a1f;word-break:break-all;">${escapedLink}</a></p>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 28px 28px;border-top:1px solid #edf0ec;">
                <p style="margin:0;font-size:12px;line-height:1.5;color:#77817b;">Heeft u deze uitnodiging niet verwacht? Neem contact op via <a href="mailto:info@roofsignal.nl" style="color:#ff5a1f;">info@roofsignal.nl</a>.</p>
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

async function sendActivationEmail(to: string, actionLink: string, organizationName: string) {
  const emailProvider = (Deno.env.get("EMAIL_PROVIDER") || "brevo").trim().toLowerCase();
  const resendApiKey = (Deno.env.get("RESEND_API_KEY") || "").trim();
  const brevoApiKey = (Deno.env.get("BREVO_API_KEY") || "").trim();
  const fromEmail = Deno.env.get("BREVO_FROM_EMAIL") || Deno.env.get("FROM_EMAIL") || "noreply@roofsignal.nl";
  const fromName = Deno.env.get("BREVO_FROM_NAME") || "RoofSignal";
  const { subject, text, html } = buildActivationEmail(actionLink, organizationName);

  if (emailProvider === "brevo" && brevoApiKey) return sendBrevoEmail(brevoApiKey, fromEmail, fromName, to, subject, text, html);
  if (emailProvider === "resend" && resendApiKey) return sendResendEmail(resendApiKey, fromEmail, fromName, to, subject, text, html);

  throw new Error(`Configured email provider is unavailable: ${emailProvider}`);
}

async function assertInternalCaller(req: Request, supabaseUrl: string, anonKey: string, serviceRoleKey: string) {
  const authHeader = req.headers.get("Authorization") || "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!jwt) return { ok: false, error: "Missing authorization." };

  const authClient = createClient(supabaseUrl, anonKey || serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const { data: userData, error: userError } = await authClient.auth.getUser(jwt);
  const user = userData?.user;
  if (userError || !user) return { ok: false, error: "Invalid session." };

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: profile, error: profileError } = await adminClient
    .from("profiles")
    .select("email,role")
    .eq("id", user.id)
    .maybeSingle();

  const email = normalizeEmail(profile?.email || user.email);
  const role = String(profile?.role || "").trim();
  const isInternal = email.endsWith("@roofsignal.nl") || internalRoles.has(role);
  if (profileError || !isInternal) return { ok: false, error: "Not allowed." };

  return { ok: true, user };
}

async function findOrCreateUser(supabase: ReturnType<typeof createClient>, email: string, fullName: string | null) {
  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { full_name: fullName || "" },
  });

  if (created?.user) return created.user;

  const alreadyExists = String(createError?.message || "").toLowerCase().includes("already");
  if (!alreadyExists) throw createError || new Error("Auth user could not be created.");

  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;
  const user = data.users.find((candidate) => normalizeEmail(candidate.email) === email);
  if (!user) throw new Error("Existing auth user could not be found.");
  return user;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: "Customer service is not configured." }), { status: 500, headers: corsHeaders });
  }

  const caller = await assertInternalCaller(req, supabaseUrl, anonKey, serviceRoleKey);
  if (!caller.ok) {
    return new Response(JSON.stringify({ error: caller.error }), { status: 401, headers: corsHeaders });
  }

  const payload = await req.json().catch(() => ({}));
  const customer = payload.customer || {};
  const properties = Array.isArray(payload.properties) ? payload.properties : [];
  const email = normalizeEmail(customer.contact_email);
  const organizationName = normalizeText(customer.name) || email;
  const redirectTo = safeRedirectTo(payload.redirectTo);

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return new Response(JSON.stringify({ error: "Valid customer email is required." }), { status: 400, headers: corsHeaders });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: organization, error: organizationError } = await supabase
    .from("organizations")
    .insert({
      name: organizationName,
      segment: normalizeText(customer.segment) || "Klant",
      contact_name: normalizeText(customer.contact_name),
      contact_email: email,
      contact_phone: normalizeText(customer.contact_phone),
      address: normalizeText(customer.address),
      kvk_number: normalizeText(customer.kvk_number),
      bank_account: normalizeText(customer.bank_account),
      status: "active",
      notes: normalizeText(customer.notes),
    })
    .select("id,name,segment,contact_name,contact_email,contact_phone,address,kvk_number,bank_account,status,notes,created_at")
    .single();

  if (organizationError || !organization) {
    console.error("Organization creation failed", organizationError);
    return new Response(JSON.stringify({ error: "Customer could not be saved." }), { status: 500, headers: corsHeaders });
  }

  const user = await findOrCreateUser(supabase, email, normalizeText(customer.contact_name));

  const { error: profileError } = await supabase
    .from("profiles")
    .upsert({
      id: user.id,
      organization_id: organization.id,
      email,
      full_name: normalizeText(customer.contact_name),
      role: "customer",
    }, { onConflict: "id" });

  const { error: memberError } = await supabase
    .from("organization_members")
    .upsert({
      organization_id: organization.id,
      user_id: user.id,
      role: "customer",
    }, { onConflict: "organization_id,user_id" });

  if (profileError || memberError) {
    console.error("Customer profile/member creation failed", profileError || memberError);
    return new Response(JSON.stringify({ error: "Customer access could not be prepared." }), { status: 500, headers: corsHeaders });
  }

  let createdProperties: Array<Record<string, unknown>> = [];
  if (properties.length) {
    const propertyRows = properties
      .map((property: Record<string, unknown>) => ({
        organization_id: organization.id,
        name: normalizeText(property.name) || normalizeText(property.address) || "Object",
        address: normalizeText(property.address),
        postcode: normalizeText(property.postcode),
        city: normalizeText(property.city),
        status: "active",
      }))
      .filter((property: { name: string | null }) => property.name);

    if (propertyRows.length) {
      const { data, error } = await supabase
        .from("properties")
        .insert(propertyRows)
        .select("id,organization_id,name,address,postcode,city,status,created_at");
      if (error) {
        console.error("Property creation failed", error);
        return new Response(JSON.stringify({ error: "Customer was saved, but objects could not be saved." }), { status: 500, headers: corsHeaders });
      }
      createdProperties = data || [];
    }
  }

  const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo },
  });
  const actionLink = linkData?.properties?.action_link;
  if (linkError || !actionLink) {
    console.error("Activation link creation failed", linkError);
    return new Response(JSON.stringify({ error: "Customer was saved, but activation link could not be created." }), { status: 500, headers: corsHeaders });
  }

  try {
    await sendActivationEmail(email, actionLink, organization.name);
  } catch (error) {
    console.error("Activation email failed", error);
    return new Response(JSON.stringify({ error: "Customer was saved, but activation email could not be sent." }), { status: 500, headers: corsHeaders });
  }

  return new Response(JSON.stringify({
    ok: true,
    organization,
    properties: createdProperties,
    activation_email_sent: true,
  }), { headers: corsHeaders });
});
