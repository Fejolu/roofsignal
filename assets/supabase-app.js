(() => {
  const config = window.ROOFSIGNAL_SUPABASE || {};
  const isConfigured = Boolean(config.url && config.anonKey);
  let clientPromise;

  async function getClient() {
    if (!isConfigured) return null;
    if (!clientPromise) {
      clientPromise = import("https://esm.sh/@supabase/supabase-js@2.49.1").then(({ createClient }) => {
        return createClient(config.url, config.anonKey, {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
          },
        });
      });
    }
    return clientPromise;
  }

  function normalizeLeadPayload(payload) {
    const knownTypes = ["report", "price", "contact", "parken", "access"];
    // Map frontend form types to DB enum values
    const typeMap = { "de-parken": "parken" };
    const requestType = typeMap[payload.type] || (knownTypes.includes(payload.type) ? payload.type : "contact");
    const message = payload.type === requestType
      ? payload.message
      : [`Origineel formulier: ${payload.type}`, payload.message].filter(Boolean).join("\n");

    return {
      request_type: requestType,
      name: payload.name,
      organization: payload.organization || null,
      email: payload.email,
      segment: payload.segment || null,
      postcode: payload.postcode || null,
      object_complexity: payload.complexity || null,
      site_access: payload.site_access || null,
      scope: payload.scope || null,
      message: message || null,
      source_path: window.location.pathname,
    };
  }

  async function submitLead(payload) {
    const supabase = await getClient();
    if (!supabase) return { ok: false, fallback: true };

    const { error } = await supabase
      .from("lead_requests")
      .insert(normalizeLeadPayload(payload));

    if (error) return { ok: false, error };
    return { ok: true };
  }

  async function submitParkenBooking(payload) {
    const supabase = await getClient();
    if (!supabase) return { ok: false, fallback: true };

    const { data, error } = await supabase.rpc("create_parken_booking", {
      p_name: payload.name,
      p_email: payload.email,
      p_phone: payload.phone,
      p_street: payload.street,
      p_house_number: payload.house_number,
      p_postcode: payload.postcode,
      p_slot_date: payload.slot_date,
      p_slot_time: payload.slot_time,
      p_notes: payload.notes || "",
      p_source: payload.source || "de-parken-directmail-2026",
      p_terms_accepted: Boolean(payload.terms_accepted),
      p_early_start_requested: Boolean(payload.early_start_requested),
      p_thermography_interest: Boolean(payload.thermography_interest),
    });

    if (error) return { ok: false, error };
    return { ok: true, booking: Array.isArray(data) ? data[0] : data };
  }

  async function listUnavailableParkenSlots() {
    const supabase = await getClient();
    if (!supabase) return { ok: false, fallback: true };

    const { data, error } = await supabase.rpc("list_unavailable_parken_slots");
    if (error) return { ok: false, error };
    return { ok: true, slots: Array.isArray(data) ? data : [] };
  }

  async function readFunctionError(error) {
    const fallback = error?.message || "De serveractie is mislukt.";
    const response = error?.context;
    if (!response || typeof response.clone !== "function") {
      return { message: fallback };
    }

    try {
      const body = await response.clone().json();
      return {
        message: body?.error || body?.message || fallback,
        status: response.status,
      };
    } catch (_jsonError) {
      try {
        const text = await response.clone().text();
        return {
          message: text || fallback,
          status: response.status,
        };
      } catch (_textError) {
        return {
          message: fallback,
          status: response.status,
        };
      }
    }
  }

  async function signIn(email, password = "") {
    const supabase = await getClient();
    if (!supabase) return { ok: false, fallback: true };

    if (password) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return { ok: false, error };
      return { ok: true };
    }

    const { error } = await supabase.functions.invoke("send-portal-login-link", {
      body: {
        email,
        redirectTo: config.loginRedirectUrl || `${window.location.origin}/portal-login.html`,
      },
    });

    if (error) return { ok: false, error };
    return { ok: true };
  }

  async function resetPassword(email) {
    const supabase = await getClient();
    if (!supabase) return { ok: false, fallback: true };

    const { error } = await supabase.functions.invoke("send-portal-login-link", {
      body: {
        email,
        action: "password_reset",
        redirectTo: config.loginRedirectUrl || `${window.location.origin}/portal-login.html`,
      },
    });

    return error ? { ok: false, error } : { ok: true };
  }

  async function updatePassword(password) {
    const supabase = await getClient();
    if (!supabase) return { ok: false, fallback: true };

    const { error } = await supabase.auth.updateUser({ password });
    return error ? { ok: false, error } : { ok: true };
  }

  async function getSession() {
    const supabase = await getClient();
    if (!supabase) return null;
    const { data } = await supabase.auth.getSession();
    return data.session || null;
  }

  async function getProfile() {
    const supabase = await getClient();
    if (!supabase) return null;
    const session = await getSession();
    if (!session?.user) return null;

    const { data, error } = await supabase
      .from("profiles")
      .select("*,profile_roles(role)")
      .eq("id", session.user.id)
      .maybeSingle();

    if (error) return null;
    if (!data) return data;
    data.roles = [...new Set([data.role, ...(data.profile_roles || []).map((item) => item.role)].filter((role) => role && role !== "customer"))];
    return data;
  }

  async function completeCustomerProfile(fullName, phone) {
    const supabase = await getClient(); if (!supabase) return { ok: false };
    const { data, error } = await supabase.rpc("complete_customer_profile", { p_full_name: fullName, p_phone: phone });
    return error ? { ok: false, error } : { ok: true, data };
  }

  function isInternalProfile(profile, email = "") {
    return String(email || profile?.email || "").toLowerCase().endsWith("@roofsignal.nl")
      || ["support", "planning", "inspector", "finance", "reportage", "hr", "owner_admin"].some((role) => (profile?.roles || [profile?.role]).includes(role));
  }

  async function requirePortalAccess(surface) {
    const session = await getSession();
    if (!session?.user) return { ok: false, reason: "signed_out" };
    const profile = await getProfile();
    if (!profile) return { ok: false, reason: "profile_missing" };
    const internal = isInternalProfile(profile, session.user.email);
    if (surface === "internal" && !internal) return { ok: false, reason: "customer_only", profile, internal };
    if (surface === "customer" && !internal && !profile.organization_id) {
      return { ok: false, reason: "organization_missing", profile, internal };
    }
    return { ok: true, profile, session, internal };
  }

  async function listOrganizations() {
    const supabase = await getClient();
    if (!supabase) return [];
    const { data, error } = await supabase
      .from("organizations")
      .select("id,name,segment,contact_name,contact_email,contact_phone,address,kvk_number,bank_account,status,notes,created_at,properties(id,deleted_at)")
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) return [];
    return (data || []).map((organization) => ({
      ...organization,
      objects: Array.isArray(organization.properties)
        ? organization.properties.filter((property) => !property.deleted_at).length
        : 0,
    }));
  }

  async function listReports() {
    const supabase = await getClient();
    if (!supabase) return [];
    const { data, error } = await supabase
      .from("reports")
      .select("id,organization_id,property_id,inspection_id,quote_id,quote_item_id,title,summary,status,published_at,created_at,updated_at")
      .order("created_at", { ascending: false });
    if (error) return [];
    return data || [];
  }

  async function listInspections(organizationId = "") {
    const supabase = await getClient();
    if (!supabase) return [];
    let query = supabase
      .from("inspections")
      .select("id,organization_id,property_id,quote_id,quote_item_id,appointment_id,reference,inspection_product,inspection_depth,scope,status,scheduled_at,inspected_at,summary,created_at,updated_at,properties(name,address,postcode,city),organizations(name)")
      .order("created_at", { ascending: false });
    if (organizationId) query = query.eq("organization_id", organizationId);
    const { data, error } = await query;
    if (error) return [];
    return data || [];
  }

  async function createInspection(payload) {
    const supabase = await getClient();
    if (!supabase) return { ok: false, fallback: true };
    const { data, error } = await supabase
      .from("inspections")
      .insert(payload)
      .select("id,organization_id,property_id,quote_id,quote_item_id,appointment_id,reference,inspection_product,inspection_depth,scope,status,scheduled_at,inspected_at,summary,created_at,updated_at")
      .single();
    return error ? { ok: false, error } : { ok: true, data };
  }

  async function updateInspection(id, payload) {
    const supabase = await getClient();
    if (!supabase || !id) return { ok: false };
    const { data, error } = await supabase.from("inspections").update(payload).eq("id", id).select("*").single();
    return error ? { ok: false, error } : { ok: true, data };
  }

  async function listFindings(inspectionId) {
    const supabase = await getClient();
    if (!supabase || !inspectionId) return [];
    const { data, error } = await supabase.from("findings").select("*").eq("inspection_id", inspectionId).order("created_at");
    return error ? [] : data || [];
  }

  async function createFinding(payload) {
    const supabase = await getClient();
    if (!supabase) return { ok: false };
    const { data, error } = await supabase.from("findings").insert(payload).select("*").single();
    return error ? { ok: false, error } : { ok: true, data };
  }

  async function createReport(payload) {
    const supabase = await getClient();
    if (!supabase) return { ok: false };
    const { data, error } = await supabase.from("reports").insert(payload).select("*").single();
    if (error) return { ok: false, error };
    if (payload.inspection_id) {
      const { error: findingError } = await supabase.from("findings").update({ report_id: data.id }).eq("inspection_id", payload.inspection_id);
      if (findingError) return { ok: false, error: findingError };
    }
    return { ok: true, data };
  }

  async function saveInspectionReportDraft(payload) {
    const supabase = await getClient();
    if (!supabase || !payload?.inspection_id) return { ok: false, error: { message: "Inspectie ontbreekt." } };
    const { data: existing, error: lookupError } = await supabase.from("reports").select("id,status").eq("inspection_id", payload.inspection_id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (lookupError) return { ok: false, error: lookupError };
    if (existing?.status === "published") return { ok: false, error: { message: "Dit rapport is al definitief gepubliceerd." } };
    const query = existing?.id ? supabase.from("reports").update({ ...payload, status: "draft", published_at: null }).eq("id", existing.id) : supabase.from("reports").insert({ ...payload, status: "draft" });
    const { data, error } = await query.select("*").single();
    return error ? { ok: false, error } : { ok: true, data };
  }

  async function publishInspectionReport(inspectionId, title, summary) {
    const supabase = await getClient(); if (!supabase || !inspectionId) return { ok: false };
    const { data, error } = await supabase.rpc("publish_inspection_report", { p_inspection_id: inspectionId, p_title: title, p_summary: summary || null });
    return error ? { ok: false, error } : { ok: true, data };
  }

  async function createQuote(payload) {
    const supabase = await getClient();
    if (!supabase) return { ok: false };
    const { data, error } = await supabase.from("quotes").insert(payload).select("*").single();
    return error ? { ok: false, error } : { ok: true, data };
  }

  async function createQuoteItems(items) {
    const supabase = await getClient();
    if (!supabase || !items?.length) return { ok: false };
    const { data, error } = await supabase.from("quote_items").insert(items).select("*");
    return error ? { ok: false, error } : { ok: true, data };
  }

  async function listQuoteItems(quoteId = "") {
    const supabase = await getClient();
    if (!supabase) return [];
    let query = supabase.from("quote_items").select("*,properties(name,address,postcode,city)").order("created_at");
    if (quoteId) query = query.eq("quote_id", quoteId);
    const { data, error } = await query;
    return error ? [] : data || [];
  }

  async function updateQuote(id, payload) {
    const supabase = await getClient();
    if (!supabase || !id) return { ok: false };
    const { data, error } = await supabase.from("quotes").update(payload).eq("id", id).select("*").single();
    return error ? { ok: false, error } : { ok: true, data };
  }

  async function updateQuoteItem(id, payload) {
    const supabase = await getClient();
    if (!supabase || !id) return { ok: false };
    const { data, error } = await supabase.from("quote_items").update(payload).eq("id", id).select("*").single();
    return error ? { ok: false, error } : { ok: true, data };
  }

  async function createAppointment(payload) {
    const supabase = await getClient();
    if (!supabase) return { ok: false };
    const { data, error } = await supabase.from("appointments").insert(payload).select("*").single();
    return error ? { ok: false, error } : { ok: true, data };
  }

  async function sendAppointmentEmail(appointmentId, testRecipient = "") {
    const supabase = await getClient(); if (!supabase || !appointmentId) return { ok: false };
    const { data, error } = await supabase.functions.invoke("send-appointment-email", {
      body: { appointmentId, testRecipient: testRecipient || undefined },
    });
    return error ? { ok: false, error: await readFunctionError(error) } : { ok: true, data };
  }

  async function sendDocumentEmail(kind, id, options = {}) {
    const supabase = await getClient(); if (!supabase || !kind || !id) return { ok: false };
    const { data, error } = await supabase.functions.invoke("send-document-email", { body: { kind, id, ...options } });
    return error ? { ok: false, error: await readFunctionError(error) } : { ok: true, data };
  }

  async function sendCustomerEmail(payload) {
    const supabase = await getClient(); if (!supabase) return { ok: false };
    const { data, error } = await supabase.functions.invoke("send-customer-email", { body: payload });
    return error ? { ok: false, error: await readFunctionError(error) } : { ok: true, data };
  }

  async function createStaffCalendarFeed(profileId) {
    const supabase = await getClient(); if (!supabase || !profileId) return { ok: false };
    const { data, error } = await supabase.functions.invoke("staff-calendar", { body: { profileId } });
    return error ? { ok: false, error: await readFunctionError(error) } : { ok: true, data };
  }

  async function createInvoice(payload) {
    const supabase = await getClient();
    if (!supabase) return { ok: false };
    const { data, error } = await supabase.from("invoices").insert(payload).select("*").single();
    return error ? { ok: false, error } : { ok: true, data };
  }

  async function updateInvoice(id, payload) {
    const supabase = await getClient(); if (!supabase || !id) return { ok: false };
    const { data, error } = await supabase.from("invoices").update(payload).eq("id", id).select("*").single();
    return error ? { ok: false, error } : { ok: true, data };
  }

  async function createUpgradeRequest(quoteItemId, requestedDepth) {
    const supabase = await getClient();
    if (!supabase) return { ok: false };
    const { data, error } = await supabase.rpc("request_inspection_upgrade", {
      p_quote_item_id: quoteItemId,
      p_requested_depth: requestedDepth,
    });
    return error ? { ok: false, error } : { ok: true, data };
  }

  async function createCustomerRequest(payload) {
    const supabase = await getClient();
    if (!supabase) return { ok: false };
    const session = await getSession();
    const { data, error } = await supabase.from("customer_requests")
      .insert({ ...payload, created_by: session?.user?.id })
      .select("*").single();
    return error ? { ok: false, error } : { ok: true, data };
  }

  async function listCustomerRequests(organizationId) {
    const supabase = await getClient();
    if (!supabase) return [];
    let query = supabase.from("customer_requests").select("*,properties(name),organizations(name)").order("created_at", { ascending: false });
    if (organizationId) query = query.eq("organization_id", organizationId);
    const { data, error } = await query;
    return error ? [] : data || [];
  }

  async function listUpgradeRequests(organizationId = "") {
    const supabase = await getClient();
    if (!supabase) return [];
    let query = supabase.from("upgrade_requests").select("*,quote_items(properties(name),inspection_product)").order("created_at", { ascending: false });
    if (organizationId) query = query.eq("organization_id", organizationId);
    const { data, error } = await query;
    return error ? [] : data || [];
  }

  async function activateUpgradeRequest(requestId, quoteItemId, requestedDepth, scopeSnapshot) {
    const supabase = await getClient();
    if (!supabase) return { ok: false };
    const { error: itemError } = await supabase.from("quote_items").update({ inspection_depth: requestedDepth, scope_snapshot: scopeSnapshot }).eq("id", quoteItemId);
    if (itemError) return { ok: false, error: itemError };
    const { data, error } = await supabase.from("upgrade_requests").update({ status: "activated" }).eq("id", requestId).select("*").single();
    return error ? { ok: false, error } : { ok: true, data };
  }

  async function listTasks(organizationId = "") {
    const supabase = await getClient();
    if (!supabase) return [];
    let query = supabase.from("tasks").select("*,organizations(name),properties(name),inspections(reference)").order("created_at", { ascending: false });
    if (organizationId) query = query.eq("organization_id", organizationId);
    const { data, error } = await query;
    return error ? [] : data || [];
  }

  async function createTask(payload) {
    const supabase = await getClient();
    if (!supabase) return { ok: false };
    const session = await getSession();
    const { data, error } = await supabase.from("tasks").insert({ ...payload, created_by: session?.user?.id || null }).select("*").single();
    return error ? { ok: false, error } : { ok: true, data };
  }

  async function listOrganizationContacts(organizationId) {
    const supabase = await getClient(); if (!supabase || !organizationId) return [];
    const { data, error } = await supabase.from("organization_contacts").select("*").eq("organization_id", organizationId).order("is_primary", { ascending: false }).order("created_at");
    return error ? [] : data || [];
  }

  async function createOrganizationContact(payload) {
    const supabase = await getClient(); if (!supabase) return { ok: false };
    const { data, error } = await supabase.from("organization_contacts").insert(payload).select("*").single();
    return error ? { ok: false, error } : { ok: true, data };
  }

  async function listCustomerActivities(organizationId) {
    const supabase = await getClient(); if (!supabase || !organizationId) return [];
    const { data, error } = await supabase.from("customer_activities").select("*,organization_contacts(first_name,last_name)").eq("organization_id", organizationId).order("occurred_at", { ascending: false });
    return error ? [] : data || [];
  }

  async function createCustomerActivity(payload) {
    const supabase = await getClient(); if (!supabase) return { ok: false };
    const session = await getSession();
    const { data, error } = await supabase.from("customer_activities").insert({ ...payload, created_by: session?.user?.id || null }).select("*").single();
    return error ? { ok: false, error } : { ok: true, data };
  }

  async function listMaintenanceActions(organizationId) {
    const supabase = await getClient(); if (!supabase || !organizationId) return [];
    const { data, error } = await supabase.from("maintenance_actions").select("*,properties(name)").eq("organization_id", organizationId).order("created_at", { ascending: false });
    return error ? [] : data || [];
  }

  async function createMaintenanceAction(payload) {
    const supabase = await getClient(); if (!supabase) return { ok: false };
    const { data, error } = await supabase.from("maintenance_actions").insert(payload).select("*").single();
    return error ? { ok: false, error } : { ok: true, data };
  }

  async function updateMaintenanceAction(id, payload) {
    const supabase = await getClient(); if (!supabase || !id) return { ok: false };
    const { data, error } = await supabase.from("maintenance_actions").update(payload).eq("id", id).select("*").single();
    return error ? { ok: false, error } : { ok: true, data };
  }

  async function listInspectionChecklist(inspectionId) {
    const supabase = await getClient(); if (!supabase || !inspectionId) return [];
    const { data, error } = await supabase.from("inspection_checklist_items").select("*").eq("inspection_id", inspectionId).order("created_at");
    return error ? [] : data || [];
  }

  async function createInspectionChecklist(items) {
    const supabase = await getClient(); if (!supabase || !items?.length) return { ok: false };
    const { data, error } = await supabase.from("inspection_checklist_items").insert(items).select("*");
    return error ? { ok: false, error } : { ok: true, data };
  }

  async function updateChecklistItem(id, payload) {
    const supabase = await getClient(); if (!supabase || !id) return { ok: false };
    const { data, error } = await supabase.from("inspection_checklist_items").update(payload).eq("id", id).select("*").single();
    return error ? { ok: false, error } : { ok: true, data };
  }

  async function createQuoteVersion(payload) {
    const supabase = await getClient(); if (!supabase) return { ok: false };
    const { data, error } = await supabase.from("quote_versions").insert(payload).select("*").single();
    return error ? { ok: false, error } : { ok: true, data };
  }

  async function sendQuoteEmail(quoteId, testRecipient = "", options = {}) {
    const supabase = await getClient(); if (!supabase || !quoteId) return { ok: false };
    const { data, error } = await supabase.functions.invoke("send-quote-email", {
      body: {
        quoteId,
        testRecipient: testRecipient || undefined,
        recipientOverride: options.recipientOverride || undefined,
        ccRecipient: options.ccRecipient || undefined,
      },
    });
    return error ? { ok: false, error: await readFunctionError(error) } : { ok: true, data };
  }

  async function listOrganizationQuotes(organizationId) {
    const supabase = await getClient(); if (!supabase || !organizationId) return [];
    const { data, error } = await supabase
      .from("quotes")
      .select("id,organization_id,quote_number,title,amount,status,valid_until,sent_at,accepted_at,accepted_by_name,quote_items(id,inspection_product,inspection_depth,scope,amount,properties(name,address,postcode,city))")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false });
    return error ? [] : data || [];
  }

  async function createOrderConfirmation(payload) {
    const supabase = await getClient(); if (!supabase) return { ok: false };
    const { data, error } = await supabase.from("order_confirmations").insert(payload).select("*").single();
    return error ? { ok: false, error } : { ok: true, data };
  }

  async function createInvoiceLines(lines) {
    const supabase = await getClient(); if (!supabase || !lines?.length) return { ok: false };
    const { data, error } = await supabase.from("invoice_lines").insert(lines).select("*");
    return error ? { ok: false, error } : { ok: true, data };
  }

  async function createInvoiceEvent(payload) {
    const supabase = await getClient(); if (!supabase) return { ok: false };
    const { data, error } = await supabase.from("invoice_events").insert(payload).select("*").single();
    return error ? { ok: false, error } : { ok: true, data };
  }

  function safeFileName(name) {
    return String(name || "bestand").normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  }

  async function uploadInspectionMedia(file, payload) {
    const supabase = await getClient(); if (!supabase || !file) return { ok: false };
    const path = `${payload.organization_id}/${payload.property_id}/${payload.inspection_id}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
    const { error: uploadError } = await supabase.storage.from("inspection-media").upload(path, file, { contentType: file.type, upsert: false });
    if (uploadError) return { ok: false, error: uploadError };
    const { data, error } = await supabase.from("media_assets").insert({ ...payload, storage_path: path, file_name: file.name, mime_type: file.type, byte_size: file.size }).select("*").single();
    if (error) {
      await supabase.storage.from("inspection-media").remove([path]);
      return { ok: false, error };
    }
    return { ok: true, data };
  }

  async function listInspectionMedia(inspectionId) {
    const supabase = await getClient(); if (!supabase || !inspectionId) return [];
    const { data, error } = await supabase.from("media_assets").select("*").eq("inspection_id", inspectionId).order("created_at", { ascending: false });
    if (error) return [];
    return Promise.all((data || []).map(async (asset) => {
      const { data: signed } = await supabase.storage.from("inspection-media").createSignedUrl(asset.storage_path, 3600);
      return { ...asset, signed_url: signed?.signedUrl || null };
    }));
  }

  async function uploadPortalDocument(file, payload) {
    const supabase = await getClient(); if (!supabase || !file) return { ok: false };
    const path = `${payload.organization_id}/${payload.property_id || "general"}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
    const { error: uploadError } = await supabase.storage.from("portal-documents").upload(path, file, { contentType: file.type, upsert: false });
    if (uploadError) return { ok: false, error: uploadError };
    const { data, error } = await supabase.from("documents").insert({ ...payload, storage_path: path }).select("*").single();
    if (error) return { ok: false, error };
    const { data: signed, error: signedError } = await supabase.storage.from("portal-documents").createSignedUrl(path, 60 * 60 * 24 * 7);
    return signedError ? { ok: false, error: signedError } : { ok: true, data, signedUrl: signed.signedUrl };
  }

  async function listOrganizationDocuments(organizationId) {
    const supabase = await getClient(); if (!supabase || !organizationId) return [];
    const { data, error } = await supabase.from("documents").select("*").eq("organization_id", organizationId).eq("customer_visible", true).order("created_at", { ascending: false });
    if (error) return [];
    return Promise.all((data || []).map(async (document) => {
      const { data: signed } = await supabase.storage.from("portal-documents").createSignedUrl(document.storage_path, 3600);
      return { ...document, signed_url: signed?.signedUrl || null };
    }));
  }

  async function openInvoiceDocument(invoiceId) {
    const supabase = await getClient();
    if (!supabase || !invoiceId) return { ok: false };
    const { data: document, error } = await supabase
      .from("documents")
      .select("id,storage_path,title,file_name,created_at")
      .eq("invoice_id", invoiceId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !document?.storage_path) return { ok: false, error: error || { message: "Geen factuurdocument gevonden." } };
    const { data, error: signedError } = await supabase.storage.from("portal-documents").createSignedUrl(document.storage_path, 300);
    return signedError || !data?.signedUrl ? { ok: false, error: signedError } : { ok: true, data: { ...document, signedUrl: data.signedUrl } };
  }

  async function openInspectionReportDocument(inspectionId) {
    const supabase = await getClient();
    if (!supabase || !inspectionId) return { ok: false };
    const { data: document, error } = await supabase.from("documents").select("id,storage_path,title,file_name,customer_visible,created_at").eq("inspection_id", inspectionId).eq("document_type", "inspection_report").order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (error || !document?.storage_path) return { ok: false, error: error || { message: "Geen rapportbestand gevonden." } };
    const { data, error: signedError } = await supabase.storage.from("portal-documents").createSignedUrl(document.storage_path, 300);
    return signedError || !data?.signedUrl ? { ok: false, error: signedError } : { ok: true, data: { ...document, signedUrl: data.signedUrl } };
  }

  async function createOrganization(payload) {
    const supabase = await getClient();
    if (!supabase) return { ok: false, fallback: true };
    const { data, error } = await supabase
      .from("organizations")
      .insert(payload)
      .select("id,name,segment,contact_name,contact_email,contact_phone,address,kvk_number,bank_account,status,notes,created_at")
      .single();
    return error ? { ok: false, error } : { ok: true, data };
  }

  async function createProperties(properties) {
    const supabase = await getClient();
    if (!supabase || !properties?.length) return { ok: false, fallback: true };
    const { data, error } = await supabase
      .from("properties")
      .insert(properties)
      .select("id,organization_id,name,address,postcode,city,status,created_at");
    return error ? { ok: false, error } : { ok: true, data };
  }

  async function createPortalCustomer(customer, properties = []) {
    const supabase = await getClient();
    if (!supabase) return { ok: false, fallback: true };
    const { data, error } = await supabase.functions.invoke("create-portal-customer", {
      body: {
        customer,
        properties,
        redirectTo: config.loginRedirectUrl || `${window.location.origin}/portal-login.html`,
      },
    });
    return error ? { ok: false, error: await readFunctionError(error) } : { ok: true, data };
  }

  async function saveCustomerProperty(payload) {
    const supabase = await getClient(); if (!supabase) return { ok: false };
    const { data, error } = await supabase.rpc("customer_save_property", {
      p_id: payload.id || null, p_name: payload.name, p_address: payload.address || "",
      p_postcode: payload.postcode || "", p_city: payload.city || "", p_notes: payload.customer_notes || "",
    });
    return error ? { ok: false, error } : { ok: true, data };
  }

  async function archiveCustomerProperty(id) {
    const supabase = await getClient(); if (!supabase) return { ok: false };
    const { error } = await supabase.rpc("customer_archive_property", { p_id: id });
    return error ? { ok: false, error } : { ok: true };
  }

  async function acceptCustomerQuote(id, name) {
    const supabase = await getClient(); if (!supabase) return { ok: false };
    const { data, error } = await supabase.functions.invoke("quote-acceptance", {
      body: { action: "acceptAuthenticated", quoteId: id, actorName: name || "" },
    });
    return error ? { ok: false, error: await readFunctionError(error) } : { ok: true, data };
  }

  async function respondToAppointment(id, action, note = "") {
    const supabase = await getClient(); if (!supabase) return { ok: false };
    const { data, error } = await supabase.rpc("customer_respond_appointment", { p_appointment_id: id, p_action: action, p_note: note });
    return error ? { ok: false, error } : { ok: true, data };
  }

  async function listRequestMessages(organizationId) {
    const supabase = await getClient(); if (!supabase) return [];
    let query = supabase.from("customer_request_messages").select("*").order("created_at");
    if (organizationId) query = query.eq("organization_id", organizationId);
    const { data, error } = await query;
    return error ? [] : data || [];
  }

  async function createRequestMessage(requestId, organizationId, message, authorType = "customer") {
    const supabase = await getClient(); if (!supabase) return { ok: false };
    const { data: { session } } = await supabase.auth.getSession();
    const { data, error } = await supabase.from("customer_request_messages").insert({ request_id: requestId, organization_id: organizationId, author_id: session?.user?.id, author_type: authorType, message }).select("*").single();
    return error ? { ok: false, error } : { ok: true, data };
  }

  async function listPortalNotifications(organizationId) {
    const supabase = await getClient(); if (!supabase || !organizationId) return [];
    const { data, error } = await supabase.from("portal_notifications").select("*").eq("organization_id", organizationId).order("created_at", { ascending: false });
    return error ? [] : data || [];
  }

  async function markPortalNotificationRead(id) {
    const supabase = await getClient(); if (!supabase) return { ok: false };
    const { error } = await supabase.rpc("customer_mark_notification_read", { p_notification_id: id });
    return error ? { ok: false, error } : { ok: true };
  }

  async function markAllPortalNotificationsRead() {
    const supabase = await getClient(); if (!supabase) return { ok: false };
    const { data, error } = await supabase.rpc("customer_mark_all_notifications_read");
    return error ? { ok: false, error } : { ok: true, data };
  }

  async function sendPortalAccessEmail(email, action = "magiclink") {
    const supabase = await getClient(); if (!supabase || !email) return { ok: false };
    const { data, error } = await supabase.functions.invoke("send-portal-login-link", { body: { email, action } });
    return error ? { ok: false, error: await readFunctionError(error) } : { ok: true, data };
  }

  async function listOrganizationProperties(organizationId) {
    const supabase = await getClient();
    if (!supabase || !organizationId) return [];
    const { data, error } = await supabase
      .from("properties")
      .select("id,organization_id,name,address,postcode,city,status,building_data,customer_notes,created_at")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) return [];
    return data || [];
  }

  async function listOrganizationReports(organizationId) {
    const supabase = await getClient();
    if (!supabase || !organizationId) return [];
    const { data, error } = await supabase
      .from("reports")
      .select("id,organization_id,property_id,inspection_id,title,summary,status,report_url,published_at,created_at,updated_at")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false });
    if (error) return [];
    return data || [];
  }

  async function listOrganizationInvoices(organizationId) {
    const supabase = await getClient();
    if (!supabase || !organizationId) return [];
    const { data, error } = await supabase
      .from("invoices")
      .select("id,organization_id,invoice_number,amount,status,due_date,payment_url,bank_account,account_holder,payment_term_days,created_at")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false });
    if (error) return [];
    return data || [];
  }

  async function listOrganizationAppointments(organizationId) {
    const supabase = await getClient();
    if (!supabase || !organizationId) return [];
    const { data, error } = await supabase
      .from("appointments")
      .select("id,organization_id,property_id,inspector_id,title,starts_at,ends_at,status,notes,customer_response,customer_response_at,customer_note,created_at,properties(name,address,postcode,city)")
      .eq("organization_id", organizationId)
      .order("starts_at", { ascending: true });
    if (error) return [];
    return data || [];
  }

  async function listInvoices() {
    const supabase = await getClient();
    if (!supabase) return [];
    const { data, error } = await supabase
      .from("invoices")
      .select("id,organization_id,quote_id,property_id,inspection_id,invoice_number,amount,status,due_date,payment_url,bank_account,account_holder,payment_term_days,created_at,organizations(name)")
      .order("created_at", { ascending: false });
    if (error) return [];
    return data || [];
  }

  async function listQuotes() {
    const supabase = await getClient();
    if (!supabase) return [];
    const { data, error } = await supabase
      .from("quotes")
      .select("id,organization_id,property_id,quote_number,title,amount,status,valid_until,created_at,organizations(name),properties(name)")
      .order("created_at", { ascending: false });
    if (error) return [];
    return data || [];
  }

  async function listAppointments() {
    const supabase = await getClient();
    if (!supabase) return [];
    const { data, error } = await supabase
      .from("appointments")
      .select("id,organization_id,property_id,quote_id,quote_item_id,inspector_id,title,starts_at,ends_at,status,notes,customer_notified_at,inspector_notified_at,created_at,organizations(name),properties(name)")
      .order("starts_at", { ascending: true });
    if (error) return [];
    const appointments = data || [];
    const inspectorIds = [...new Set(appointments.map((item) => item.inspector_id).filter(Boolean))];
    if (!inspectorIds.length) return appointments;
    const { data: inspectors } = await supabase.from("profiles").select("id,full_name,email").in("id", inspectorIds);
    const inspectorMap = new Map((inspectors || []).map((profile) => [profile.id, profile]));
    return appointments.map((appointment) => ({ ...appointment, profiles: inspectorMap.get(appointment.inspector_id) || null }));
  }

  async function updateAppointment(id, payload) {
    const supabase = await getClient();
    if (!supabase || !id) return { ok: false };
    const { data, error } = await supabase
      .from("appointments")
      .update(payload)
      .eq("id", id)
      .select("id,organization_id,property_id,inspector_id,title,starts_at,ends_at,status,notes")
      .single();
    if (error) return { ok: false, error };
    if (Object.prototype.hasOwnProperty.call(payload, "inspector_id")) {
      await supabase.from("parken_bookings").update({ inspector_id: payload.inspector_id }).eq("appointment_id", id);
    }
    return { ok: true, data };
  }

  async function updateProperty(id, payload) {
    const supabase = await getClient();
    if (!supabase || !id) return { ok: false };
    const { data, error } = await supabase
      .from("properties")
      .update(payload)
      .eq("id", id)
      .select("id,organization_id,name,address,postcode,city,status,building_data,created_at")
      .single();
    return error ? { ok: false, error } : { ok: true, data };
  }

  async function deleteProperty(id) {
    const supabase = await getClient();
    if (!supabase || !id) return { ok: false };
    const { error } = await supabase
      .from("properties")
      .update({ deleted_at: new Date().toISOString(), status: "deleted" })
      .eq("id", id);
    return error ? { ok: false, error } : { ok: true };
  }

  async function updateOrganization(id, payload) {
    const supabase = await getClient();
    if (!supabase || !id) return { ok: false };
    const { error } = await supabase
      .from("organizations")
      .update(payload)
      .eq("id", id);
    return error ? { ok: false, error } : { ok: true };
  }

  async function deleteOrganization(id) {
    const supabase = await getClient();
    if (!supabase || !id) return { ok: false };
    const { error } = await supabase
      .from("organizations")
      .update({ deleted_at: new Date().toISOString(), status: "deleted" })
      .eq("id", id);
    return error ? { ok: false, error } : { ok: true };
  }

  async function listProfiles() {
    const supabase = await getClient();
    if (!supabase) return [];
    const { data, error } = await supabase
      .from("profiles")
      .select("id,email,full_name,role,created_at,profile_roles(role)")
      .order("created_at", { ascending: false });
    if (error) return [];
    return (data || []).map((profile) => ({ ...profile, roles: [...new Set([profile.role, ...(profile.profile_roles || []).map((item) => item.role)].filter((role) => role !== "customer"))] }));
  }

  async function saveProfileRoles(profileId, roles) {
    const supabase = await getClient(); if (!supabase || !profileId) return { ok: false };
    const normalized = [...new Set((roles || []).filter((role) => role && role !== "customer"))];
    if (!normalized.length) return { ok: false, error: new Error("Selecteer minimaal één backoffice-rol.") };
    const { error } = await supabase.rpc("set_profile_roles", { p_profile_id: profileId, p_roles: normalized });
    return error ? { ok: false, error } : { ok: true };
  }

  async function listRoleDefinitions() {
    const supabase = await getClient(); if (!supabase) return [];
    const { data, error } = await supabase.from("role_definitions").select("*").order("label");
    return error ? [] : data || [];
  }

  async function updateRoleDefinition(role, description) {
    const supabase = await getClient(); if (!supabase) return { ok: false };
    const { error } = await supabase.from("role_definitions").update({ description, updated_at: new Date().toISOString() }).eq("role", role);
    return error ? { ok: false, error } : { ok: true };
  }

  async function updateProfileRole(email, role) {
    const supabase = await getClient();
    if (!supabase || !email || !role) return { ok: false };
    const { error } = await supabase
      .from("profiles")
      .update({ role })
      .eq("email", email.toLowerCase());
    return error ? { ok: false, error } : { ok: true };
  }

  async function listEmployeeHrData() {
    const supabase = await getClient(); if (!supabase) return { records: [], leave: [], absence: [], documents: [] };
    const [records, leave, absence, documents] = await Promise.all([
      supabase.from("employee_records").select("*").order("last_name"),
      supabase.from("employee_leave").select("*").order("starts_on", { ascending: false }),
      supabase.from("employee_absence").select("*").order("starts_on", { ascending: false }),
      supabase.from("employee_documents").select("*").order("created_at", { ascending: false }),
    ]);
    return { records: records.data || [], leave: leave.data || [], absence: absence.data || [], documents: documents.data || [] };
  }

  async function saveEmployeeRecord(payload) {
    const supabase = await getClient(); if (!supabase) return { ok: false };
    const { data, error } = await supabase.from("employee_records").upsert(payload, { onConflict: "profile_id" }).select("*").single();
    return error ? { ok: false, error } : { ok: true, data };
  }

  async function createEmployeeLeave(payload) {
    const supabase = await getClient(); if (!supabase) return { ok: false };
    const { data, error } = await supabase.from("employee_leave").insert(payload).select("*").single();
    return error ? { ok: false, error } : { ok: true, data };
  }

  async function createEmployeeAbsence(payload) {
    const supabase = await getClient(); if (!supabase) return { ok: false };
    const { data, error } = await supabase.from("employee_absence").insert(payload).select("*").single();
    return error ? { ok: false, error } : { ok: true, data };
  }

  async function uploadEmployeeDocument(file, payload) {
    const supabase = await getClient(); if (!supabase || !file) return { ok: false };
    const path = `${payload.profile_id}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
    const { error: uploadError } = await supabase.storage.from("hr-documents").upload(path, file, { contentType: file.type, upsert: false });
    if (uploadError) return { ok: false, error: uploadError };
    const { data, error } = await supabase.from("employee_documents").insert({ ...payload, storage_path: path }).select("*").single();
    return error ? { ok: false, error } : { ok: true, data };
  }

  async function openEmployeeDocument(path) {
    const supabase = await getClient(); if (!supabase || !path) return { ok: false };
    const { data, error } = await supabase.storage.from("hr-documents").createSignedUrl(path, 300);
    return error ? { ok: false, error } : { ok: true, data };
  }

  async function signOut() {
    const supabase = await getClient();
    if (!supabase) return;
    await supabase.auth.signOut();
  }

  window.RoofSignalBackend = {
    isConfigured,
    getClient,
    submitLead,
    submitParkenBooking,
    listUnavailableParkenSlots,
    signIn,
    resetPassword,
    updatePassword,
    signOut,
    getSession,
    getProfile,
    completeCustomerProfile,
    requirePortalAccess,
    listOrganizations,
    listReports,
    listInspections,
    createInspection,
    updateInspection,
    listFindings,
    createFinding,
    createReport,
    saveInspectionReportDraft,
    publishInspectionReport,
    createQuote,
    createQuoteItems,
    listQuoteItems,
    updateQuote,
    updateQuoteItem,
    createAppointment,
    sendAppointmentEmail,
    sendDocumentEmail,
    sendCustomerEmail,
    createStaffCalendarFeed,
    createInvoice,
    updateInvoice,
    createUpgradeRequest,
    createCustomerRequest,
    listCustomerRequests,
    listUpgradeRequests,
    activateUpgradeRequest,
    listTasks,
    createTask,
    listOrganizationContacts,
    createOrganizationContact,
    listCustomerActivities,
    createCustomerActivity,
    listMaintenanceActions,
    createMaintenanceAction,
    updateMaintenanceAction,
    listInspectionChecklist,
    createInspectionChecklist,
    updateChecklistItem,
    createQuoteVersion,
    sendQuoteEmail,
    listOrganizationQuotes,
    createOrderConfirmation,
    createInvoiceLines,
    createInvoiceEvent,
    uploadInspectionMedia,
    listInspectionMedia,
    uploadPortalDocument,
    listOrganizationDocuments,
    openInvoiceDocument,
    openInspectionReportDocument,
    createOrganization,
    createProperties,
    createPortalCustomer,
    saveCustomerProperty,
    archiveCustomerProperty,
    acceptCustomerQuote,
    respondToAppointment,
    listRequestMessages,
    createRequestMessage,
    listPortalNotifications,
    markPortalNotificationRead,
    markAllPortalNotificationsRead,
    sendPortalAccessEmail,
    listOrganizationProperties,
    listOrganizationReports,
    listOrganizationInvoices,
    listOrganizationAppointments,
    listInvoices,
    listQuotes,
    listAppointments,
    updateAppointment,
    updateProperty,
    deleteProperty,
    updateOrganization,
    deleteOrganization,
    listProfiles,
    updateProfileRole,
    saveProfileRoles,
    listRoleDefinitions,
    updateRoleDefinition,
    listEmployeeHrData,
    saveEmployeeRecord,
    createEmployeeLeave,
    createEmployeeAbsence,
    uploadEmployeeDocument,
    openEmployeeDocument,
  };
})();
