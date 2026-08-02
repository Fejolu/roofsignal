(() => {
  "use strict";
  const backend = window.RoofSignalBackend;
  const profileId = new URLSearchParams(window.location.search).get("id");
  const roleLabels = { owner_admin: "Owner admin", support: "Support", planning: "Planning", inspector: "Inspecteur", finance: "Finance", reportage: "Rapportage", hr: "HR" };
  const statusLabels = { active: "Actief", leave: "Met verlof", sick: "Ziek", inactive: "Inactief", left: "Uit dienst" };
  let access;
  let profile;
  let hrData;
  let noticeTimer;

  const $ = (selector) => document.querySelector(selector);
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
  const formatDate = (value) => value ? new Intl.DateTimeFormat("nl-NL", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${String(value).slice(0, 10)}T12:00:00`)) : "—";
  const number = (value) => Number(value || 0);

  function notice(message, tone = "success") {
    const node = $("[data-page-notice]");
    node.textContent = message; node.dataset.statusTone = tone; node.hidden = false;
    clearTimeout(noticeTimer);
    noticeTimer = window.setTimeout(() => { node.hidden = true; }, tone === "error" ? 6000 : 3200);
  }

  function confirmSaveButton(form) {
    const button = form.querySelector('button[type="submit"]'); if (!button) return;
    const original = button.dataset.saveLabel || button.textContent;
    button.dataset.saveLabel = original; button.textContent = "✓ Opgeslagen"; button.classList.add("save-confirmed");
    window.setTimeout(() => { button.textContent = original; button.classList.remove("save-confirmed"); }, 1800);
  }

  function payload(form, numeric = []) {
    return Object.fromEntries([...new FormData(form).entries()].filter(([key]) => !["file", "portal_role", "portal_roles"].includes(key)).map(([key, value]) => [key, numeric.includes(key) ? (value === "" ? null : Number(value)) : (String(value).trim() || null)]));
  }

  function fillForm(employee) {
    const form = $("[data-employee-form]");
    [...form.elements].forEach((field) => {
      if (!field.name || field.name === "portal_roles") return;
      if (Object.prototype.hasOwnProperty.call(employee, field.name)) field.value = employee[field.name] ?? "";
    });
    form.elements.status.value = employee.status || "active";
    const owner = (access.profile.roles || [access.profile.role]).includes("owner_admin");
    $("[data-role-checkboxes]").innerHTML = Object.entries(roleLabels).map(([role,label]) => `<label><input type="checkbox" name="portal_roles" value="${role}" ${(profile.roles || [profile.role]).includes(role) ? "checked" : ""} ${owner ? "" : "disabled"}><span>${label}</span></label>`).join("");
    $("[data-role-help]").textContent = owner ? "Alleen de eigenaar kan toegangsrollen wijzigen." : "Alleen de eigenaar kan deze rol wijzigen.";
  }

  function absenceRate(items) {
    const year = new Date().getFullYear();
    const start = new Date(year, 0, 1); const end = new Date(year, 11, 31);
    return items.reduce((sum, item) => {
      const from = new Date(`${item.starts_on}T12:00:00`); const until = item.ends_on ? new Date(`${item.ends_on}T12:00:00`) : new Date();
      const days = Math.max(0, (Math.min(until, end) - Math.max(from, start)) / 86400000 + 1);
      return sum + days * number(item.absence_percentage) / 365;
    }, 0);
  }

  function render() {
    const employee = hrData.records.find((item) => item.profile_id === profileId) || {};
    const leave = hrData.leave.filter((item) => item.profile_id === profileId);
    const absence = hrData.absence.filter((item) => item.profile_id === profileId);
    const documents = hrData.documents.filter((item) => item.profile_id === profileId);
    const used = leave.filter((item) => item.status === "approved" && item.leave_type === "holiday").reduce((sum, item) => sum + number(item.hours), 0);
    const balance = number(employee.annual_leave_hours) - used;

    $("[data-employee-name]").textContent = profile.full_name || profile.email;
    $("[data-employee-subtitle]").textContent = `${employee.job_title || (profile.roles || [profile.role]).map((role) => roleLabels[role] || role).join(" + ")} · ${profile.email}`;
    $("[data-employee-status-label]").textContent = statusLabels[employee.status || "active"];
    $("[data-summary-role]").textContent = (profile.roles || [profile.role]).map((role) => roleLabels[role] || role).join(" + ");
    $("[data-summary-hours]").textContent = employee.weekly_hours ? `${number(employee.weekly_hours).toLocaleString("nl-NL")} uur` : "—";
    $("[data-summary-leave]").textContent = `${balance.toLocaleString("nl-NL")} uur`;
    $("[data-summary-absence]").textContent = `${absenceRate(absence).toLocaleString("nl-NL", { maximumFractionDigits: 1 })}%`;
    $("[data-leave-balance]").textContent = `${balance.toLocaleString("nl-NL")} uur beschikbaar van ${number(employee.annual_leave_hours).toLocaleString("nl-NL")} uur per jaar.`;
    fillForm(employee);

    $("[data-document-list]").innerHTML = documents.length ? documents.map((item) => `<button type="button" data-open-document="${escapeHtml(item.storage_path)}"><span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.document_type)} · ${formatDate(item.created_at)}</small></span><span aria-hidden="true">↗</span></button>`).join("") : "<p>Nog geen documenten toegevoegd.</p>";
    $("[data-leave-list]").innerHTML = leave.length ? leave.map((item) => `<div><span><strong>${escapeHtml(item.leave_type)} · ${number(item.hours).toLocaleString("nl-NL")} uur</strong><small>${formatDate(item.starts_on)} – ${formatDate(item.ends_on)}</small></span><span>${escapeHtml(item.status)}</span></div>`).join("") : "<p>Nog geen verlof geregistreerd.</p>";
    $("[data-absence-list]").innerHTML = absence.length ? absence.map((item) => `<div><span><strong>${number(item.absence_percentage).toLocaleString("nl-NL")}% · ${escapeHtml(item.status)}</strong><small>${formatDate(item.starts_on)} – ${item.ends_on ? formatDate(item.ends_on) : "lopend"}</small></span><span>${number(item.work_capacity_percentage).toLocaleString("nl-NL")}% inzetbaar</span></div>`).join("") : "<p>Nog geen verzuim geregistreerd.</p>";
  }

  async function reload() { hrData = await backend.listEmployeeHrData(); render(); }

  async function init() {
    if (!backend?.isConfigured || !profileId) return window.location.replace("portal-beheer.html#rechten");
    access = await backend.requirePortalAccess("internal");
    if (!access.ok) return window.location.replace("portal-login");
    if (!["owner_admin", "hr"].some((role) => (access.profile.roles || [access.profile.role]).includes(role))) return window.location.replace("portal-beheer.html#rechten");
    const profiles = await backend.listProfiles(); profile = profiles.find((item) => item.id === profileId);
    if (!profile) { notice("Dit medewerkersdossier bestaat niet of u heeft geen toegang.", "error"); return; }
    $("[data-account-name]").textContent = access.profile.full_name || access.profile.email;
    $("[data-account-role]").textContent = (access.profile.roles || [access.profile.role]).map((role) => roleLabels[role] || role).join(" + ");
    hrData = await backend.listEmployeeHrData(); render(); document.body.classList.remove("portal-auth-pending");
  }

  $("[data-employee-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault(); const form = event.currentTarget;
    const result = await backend.saveEmployeeRecord({ profile_id: profileId, ...payload(form, ["weekly_hours", "annual_leave_hours"]) });
    if (!result.ok) return notice(result.error?.message || "Opslaan is mislukt.", "error");
    if ((access.profile.roles || [access.profile.role]).includes("owner_admin")) {
      const selectedRoles = [...form.querySelectorAll('[name="portal_roles"]:checked')].map((input) => input.value);
      if (!selectedRoles.length) return notice("Selecteer minimaal één backoffice-rol.", "error");
      const roleResult = await backend.saveProfileRoles(profile.id, selectedRoles);
      if (!roleResult.ok) return notice("De gegevens zijn opgeslagen, maar de rol kon niet worden gewijzigd.", "error");
      profile.roles = selectedRoles;
    }
    await reload(); confirmSaveButton(form); notice("Het medewerkersdossier is bijgewerkt.");
  });

  $("[data-employee-document-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault(); const form = event.currentTarget; const file = form.elements.file.files?.[0]; if (!file) return;
    const result = await backend.uploadEmployeeDocument(file, { profile_id: profileId, ...payload(form) });
    if (!result.ok) return notice(result.error?.message || "Document opslaan is mislukt.", "error");
    form.reset(); await reload(); confirmSaveButton(form); notice("Het document is afgeschermd opgeslagen.");
  });

  $("[data-employee-leave-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault(); const result = await backend.createEmployeeLeave({ profile_id: profileId, ...payload(event.currentTarget, ["hours"]) });
    if (!result.ok) return notice(result.error?.message || "Verlof vastleggen is mislukt.", "error");
    event.currentTarget.reset(); await reload(); confirmSaveButton(event.currentTarget); notice("Het verlof is vastgelegd.");
  });

  $("[data-employee-absence-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault(); const form = event.currentTarget; const data = payload(form, ["absence_percentage", "work_capacity_percentage"]);
    const result = await backend.createEmployeeAbsence({ profile_id: profileId, ...data });
    if (!result.ok) return notice(result.error?.message || "Verzuim vastleggen is mislukt.", "error");
    await backend.saveEmployeeRecord({ profile_id: profileId, status: data.status === "recovered" ? "active" : "sick" });
    form.reset(); await reload(); confirmSaveButton(form); notice("De inzetbaarheid is vastgelegd zonder medische gegevens.");
  });

  document.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-open-document]"); if (!button) return;
    const result = await backend.openEmployeeDocument(button.dataset.openDocument);
    if (!result.ok) return notice("Het document kan niet worden geopend.", "error");
    window.open(result.data.signedUrl, "_blank", "noopener");
  });

  init();
})();
