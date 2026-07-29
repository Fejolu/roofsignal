(() => {
  const config = window.ROOFSIGNAL_SUPABASE || {};
  const isConfigured = Boolean(config.url && config.anonKey);
  let clientPromise;

  async function getClient() {
    if (!isConfigured) return null;
    if (!clientPromise) {
      clientPromise = import("https://esm.sh/@supabase/supabase-js@2").then(({ createClient }) => {
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
      .select("*")
      .eq("id", session.user.id)
      .maybeSingle();

    if (error) return null;
    return data;
  }

  async function completeCustomerProfile(fullName, phone) {
    const supabase = await getClient(); if (!supabase) return { ok: false };
    const { data, error } = await supabase.rpc("complete_customer_profile", { p_full_name: fullName, p_phone: phone });
    return error ? { ok: false, error } : { ok: true, data };
  }

  function isInternalProfile(profile, email = "") {
    return String(email || profile?.email || "").toLowerCase().endsWith("@roofsignal.nl")
      || ["support", "planning", "finance", "reportage", "owner_admin"].includes(profile?.role);
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
      .select("id,organization_id,property_id,title,status,published_at,created_at,updated_at")
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

  async function createAppointment(payload) {
    const supabase = await getClient();
    if (!supabase) return { ok: false };
    const { data, error } = await supabase.from("appointments").insert(payload).select("*").single();
    return error ? { ok: false, error } : { ok: true, data };
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
    if (!supabase || !organizationId) return [];
    const { data, error } = await supabase.from("customer_requests")
      .select("*,properties(name)").eq("organization_id", organizationId)
      .order("created_at", { ascending: false });
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
    return error ? { ok: false, error } : { ok: true, data };
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

  async function listOrganizationProperties(organizationId) {
    const supabase = await getClient();
    if (!supabase || !organizationId) return [];
    const { data, error } = await supabase
      .from("properties")
      .select("id,organization_id,name,address,postcode,city,status,building_data,created_at")
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
      .select("id,organization_id,invoice_number,amount,status,due_date,created_at")
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
      .select("id,organization_id,property_id,title,starts_at,ends_at,status,notes,created_at")
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
      .select("id,organization_id,quote_id,property_id,inspection_id,invoice_number,amount,status,due_date,created_at,organizations(name)")
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
      .select("id,organization_id,property_id,quote_id,quote_item_id,title,starts_at,ends_at,status,notes,created_at,organizations(name),properties(name)")
      .order("starts_at", { ascending: true });
    if (error) return [];
    return data || [];
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
      .select("id,email,full_name,role,created_at")
      .order("created_at", { ascending: false });
    if (error) return [];
    return data || [];
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

  async function signOut() {
    const supabase = await getClient();
    if (!supabase) return;
    await supabase.auth.signOut();
  }

  window.RoofSignalBackend = {
    isConfigured,
    getClient,
    submitLead,
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
    createQuote,
    createQuoteItems,
    listQuoteItems,
    updateQuote,
    createAppointment,
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
    createOrganization,
    createProperties,
    createPortalCustomer,
    listOrganizationProperties,
    listOrganizationReports,
    listOrganizationInvoices,
    listOrganizationAppointments,
    listInvoices,
    listQuotes,
    listAppointments,
    updateProperty,
    deleteProperty,
    updateOrganization,
    deleteOrganization,
    listProfiles,
    updateProfileRole,
  };
})();
