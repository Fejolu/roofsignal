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
    return {
      request_type: payload.type,
      name: payload.name,
      organization: payload.organization || null,
      email: payload.email,
      segment: payload.segment || null,
      postcode: payload.postcode || null,
      object_complexity: payload.complexity || null,
      site_access: payload.site_access || null,
      scope: payload.scope || null,
      message: payload.message || null,
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

  async function signIn(email, password = "") {
    const supabase = await getClient();
    if (!supabase) return { ok: false, fallback: true };

    if (password) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return { ok: false, error };
      return { ok: true };
    }

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: config.loginRedirectUrl || `${window.location.origin}/portal-login.html`,
      },
    });

    if (error) return { ok: false, error };
    return { ok: true };
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

  async function listOrganizations() {
    const supabase = await getClient();
    if (!supabase) return [];
    const { data, error } = await supabase
      .from("organizations")
      .select("id,name,segment,status,notes,created_at")
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) return [];
    return data || [];
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
    signOut,
    getSession,
    getProfile,
    listOrganizations,
    updateOrganization,
    deleteOrganization,
    listProfiles,
    updateProfileRole,
  };
})();
