(() => {
  const stateKey = "roofsignal-admin-html";
  let activeSaveButton = null;
  let portalNoticeTimer = null;
  const roleRights = {
    "Owner admin": "Alles",
    Support: "Support, meekijken, dossiers",
    Planning: "Agenda, inspecties, toegang",
    Inspecteur: "Inspecties uitvoeren, bevindingen en opnames",
    Finance: "Facturen, offertes, betaalstatus",
    Rapportage: "Rapporten, objectdata, exports",
    HR: "Medewerkersdossiers, contracten, verlof en verzuim",
  };
  const roleLabels = {
    owner_admin: "Owner admin",
    support: "Support",
    planning: "Planning",
    inspector: "Inspecteur",
    finance: "Finance",
    rapportage: "Rapportage",
    hr: "HR",
    customer: "Klant",
  };
  const inspectionDepths = {
    basis: {
      label: "Basis", price: 395,
      coverage: {
        "Dakbedekking": ["Gebroken, verschoven of ontbrekende dakpannen", "Gescheurde leien", "Losliggende bitumen", "Beschadigde dakbedekking"],
        "Nok": ["Losliggende nokvorsten", "Gescheurde mortel", "Ontbrekende bevestigingen", "Mosvorming"],
        "Kilgoten": ["Verstoppingen", "Vuilophoping", "Corrosie", "Scheuren"],
        "Aansluitingen": ["Loodwerk", "Muurlood", "Dakdoorvoeren", "Ventilatiepijpen", "Ontluchtingen"],
        "Dakkapellen": ["Houtrot", "Lekkagesporen", "Los lood", "Beschadigde bekleding"],
        "Dakveiligheid": ["Losliggende onderdelen", "Vallende elementen"],
        "Metselwerk": ["Scheuren", "Losse of verweerde stenen", "Vorstschade"],
        "Voegwerk": ["Uitgesleten of gescheurde voegen", "Los voegwerk"],
        "Gevelvervorming": ["Doorbuiging", "Uitbuiken", "Verzakking"],
        "Geveldetails": ["Lateien", "Rollagen", "Siermetselwerk", "Ornamenten"],
        "Vocht": ["Uitbloei", "Groene aanslag", "Vochtsporen"],
        "Rapportage": ["20-40 bewijsfoto's", "Samenvatting", "Direct aanpakken", "Binnen 1-3 jaar", "Monitoren"],
      },
    },
    plus: {
      label: "Plus", price: 595,
      coverage: {
        "Alles uit Basis": [],
        "Schoorstenen": ["Metselwerk: losse stenen en scheuren", "Voegwerk: verweerd en uitgesleten", "Lood: gescheurd en los", "Dekplaat: scheuren en losliggend", "Veiligheid: vallende onderdelen"],
        "Goten": ["Verstopping door bladeren, mos of takken", "Stagnerend water en verzakkingen", "Corrosie, scheuren en lekkagepunten", "Losse of verbogen beugels"],
        "Houtwerk": ["Kozijnen: houtrot en open verbindingen", "Daklijsten: aantasting en verwering", "Windveren: scheuren en rot", "Schilderwerk: bladderen en kaal hout"],
        "Onderhoudsadvies": ["Komend jaar", "1-3 jaar", "3-5 jaar", "Kostenbandbreedtes en maatregelen"],
      },
    },
    premium: {
      label: "Premium", price: 995,
      coverage: {
        "Alles uit Plus": [],
        "Thermische scan": ["Warmtelekken bij dak, gevel en kozijnen", "Natte isolatie in dak- en gevelpakket", "Hotspots en defecte zonnecellen", "Koude natte plekken"],
        "MJOP-indicatie": ["Conditie per onderdeel", "Verwachte termijn", "Rood: veiligheid of lekkage", "Oranje: waardevermindering", "Groen: cosmetisch"],
        "Herstelbegroting": ["Indicatie per hoofdonderdeel", "Kostenbandbreedtes voor schilderwerk, voegwerk en dakrenovatie"],
      },
    },
  };

  const customersBody = document.querySelector("#klanten tbody");
  const rolesBody = document.querySelector(".role-table tbody");
  const roleBuilder = document.querySelector(".role-builder");
  const customerCreateForm = document.querySelector("#klant-aanmaken");
  const customerCreateStatus = document.querySelector("[data-customer-create-status]");
  const customerSearchInput = document.querySelector("[data-customer-search]");
  const customerSearchStatus = document.querySelector("[data-customer-search-status]");
  const offersBody = document.querySelector(".offer-table tbody");
  const invoicesBody = document.querySelector("#facturen tbody");
  const supportGrid = document.querySelector("#support .support-grid");
  const planningList = document.querySelector("#planning .timeline-list");
  const pipeline = document.querySelector("#inspecties .pipeline");
  const objectManager = document.querySelector("[data-object-manager]");
  const objectManagerTitle = document.querySelector("[data-object-manager-title]");
  const objectManagerStatus = document.querySelector("[data-object-manager-status]");
  const objectEditList = document.querySelector("[data-object-edit-list]");
  const inspectionForm = document.querySelector("[data-inspection-create-form]");
  const inspectionStatus = document.querySelector("[data-inspection-create-status]");
  const inspectionBody = document.querySelector(".inspection-table tbody");
  const inspectionWorkspace = document.querySelector("[data-inspection-workspace]");
  const inspectionWorkspaceTitle = document.querySelector("[data-inspection-workspace-title]");
  const inspectionCommercialScope = document.querySelector("[data-inspection-commercial-scope]");
  const inspectionWorkspaceStatus = document.querySelector("[data-inspection-workspace-status]");
  const inspectionStatusForm = document.querySelector("[data-inspection-status-form]");
  const findingForm = document.querySelector("[data-finding-create-form]");
  const findingList = document.querySelector("[data-finding-list]");
  const inspectionChecklist = document.querySelector("[data-inspection-checklist]");
  const mediaUploadForm = document.querySelector("[data-media-upload-form]");
  const mediaUploadStatus = document.querySelector("[data-media-upload-status]");
  const inspectionMediaList = document.querySelector("[data-inspection-media-list]");
  const reportForm = document.querySelector("[data-report-create-form]");
  const quoteForm = document.querySelector("[data-quote-create-form]");
  const quoteScheduleForm = document.querySelector("[data-quote-schedule-form]");
  const quoteScheduleTitle = document.querySelector("[data-quote-schedule-title]");
  const taskForm = document.querySelector("[data-task-create-form]");
  const customerWorkspace = document.querySelector("[data-customer-workspace]");
  const customerWorkspaceTitle = document.querySelector("[data-customer-workspace-title]");
  const customerDossierOverview = document.querySelector("[data-customer-dossier-overview]");
  const contactCreateForm = document.querySelector("[data-contact-create-form]");
  const activityCreateForm = document.querySelector("[data-activity-create-form]");
  const customerProfileForm = document.querySelector("[data-customer-profile-form]");
  let activeObjectCustomerRow = null;
  let activeCustomerObjects = [];
  let liveOrganizations = [];
  let liveInspections = [];
  let activeInspection = null;
  let liveAppointments = [];
  let liveProfiles = [];
  let liveInvoices = [];
  let liveQuotes = [];
  let liveQuoteItems = [];
  let activeQuote = null;
  let liveTasks = [];
  let liveReports = [];
  let liveUpgradeRequests = [];
  let liveHrData = { records: [], leave: [], absence: [], documents: [] };
  let liveRoleDefinitions = [];
  let portalAccess = null;
  let customerPortalState = null;
  let resourceCalendarWeekOffset = 0;

  function saveState() {
    // Operational data lives in Supabase. Browser storage is not a system of record.
  }

  function loadState() {
    localStorage.removeItem(stateKey);
  }

  function statusCell(label, tone = "green") {
    const meta = typeof label === "object" ? label : statusMeta(label);
    const resolvedTone = meta.tone || tone;
    return `<span class="status-dot ${resolvedTone}" data-status-label="${escapeHtml(meta.label)}">${escapeHtml(meta.label)}</span>`;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  const adminActionMeta = {
    "staff-calendar-feed": ["Agenda-abonnement", "calendar"], "open-employee": ["Medewerkersdossier openen", "folder"],
    "edit-role": ["Rol bewerken", "edit"], "remove-role": ["Teamlid verwijderen", "trash"],
    "manage-customer": ["Klantdossier openen", "folder"], "edit-customer": ["Klant bewerken", "edit"], "delete-customer": ["Klant verwijderen", "trash"],
    "open-inspection": ["Inspectie openen", "search"], "send-quote": ["Offerte versturen", "send"], "send-quote-custom": ["Offerte opnieuw versturen", "send"],
    "edit-sent-quote": ["Offerte bewerken", "edit"], "sync-quote-items": ["Offerte synchroniseren", "sync"], "accept-quote": ["Akkoord registreren", "check"],
    "schedule-quote": ["Inspectie plannen", "calendar"], "invoice-quote": ["Factuur aanmaken", "invoice"], "send-invoice": ["Factuur versturen", "send"],
    "send-invoice-mail": ["Factuur versturen", "send"], "send-invoice-reminder": ["Betalingsherinnering versturen", "bell"],
    "open-invoice": ["Factuur bekijken", "document"], "pay-invoice": ["Betaling registreren", "check"], "set-payment-link": ["Betaallink beheren", "link"], "credit-invoice": ["Factuur crediteren", "credit"],
  };
  const adminIcons = {
    calendar: '<path d="M5 3v3M13 3v3M3 8h12M4 5h10a1 1 0 0 1 1 1v9H3V6a1 1 0 0 1 1-1Z"/>', folder: '<path d="M2.5 5.5h5l1.5 2h6.5v7h-13Z"/>',
    edit: '<path d="m4 14 1-4 7.5-7.5 3 3L8 13Z"/><path d="m11.5 3.5 3 3"/>', trash: '<path d="M3 5h12M7 5V3h4v2M5 5l1 10h6l1-10M8 8v4M11 8v4"/>',
    search: '<circle cx="7.5" cy="7.5" r="4.5"/><path d="m11 11 4 4"/>', send: '<path d="m2 8 14-6-5 14-2.5-5.5ZM8.5 10.5 16 2"/>',
    sync: '<path d="M14 6a6 6 0 0 0-10-2L2 6M2 2v4h4M4 12a6 6 0 0 0 10 2l2-2M16 16v-4h-4"/>', check: '<path d="m3 9 3 3 8-8"/>',
    invoice: '<path d="M4 2h9v14l-2-1-2 1-2-1-3 1Z"/><path d="M6 6h5M6 9h5M6 12h3"/>', link: '<path d="M7 11 5.5 12.5a3 3 0 0 1-4-4L4 6M11 7l1.5-1.5a3 3 0 0 1 4 4L14 12M6 9h6"/>',
    credit: '<path d="M3 5h12v9H3Z"/><path d="M3 8h12M6 11h3"/>', bell: '<path d="M5 12V8a4 4 0 0 1 8 0v4l1.5 2h-11Z"/><path d="M7 15a2 2 0 0 0 4 0"/>', document: '<path d="M4 2h7l3 3v11H4Z"/><path d="M11 2v4h4M6.5 9h5M6.5 12h5"/>',
  };
  function iconizeAdminActions(root = document) {
    root.querySelectorAll(".portal-table [data-admin-action]").forEach((control) => {
      const meta = adminActionMeta[control.dataset.adminAction]; if (!meta || control.classList.contains("admin-icon-action")) return;
      control.classList.add("admin-icon-action"); control.title = meta[0]; control.setAttribute("aria-label", meta[0]);
      control.innerHTML = `<svg viewBox="0 0 18 18" aria-hidden="true">${adminIcons[meta[1]] || adminIcons.folder}</svg>`;
    });
  }

  function statusMeta(status) {
    const statuses = {
      active: { label: "Actief", tone: "green" },
      actief: { label: "Actief", tone: "green" },
      intake: { label: "Intake", tone: "yellow" },
      prospect: { label: "Prospect", tone: "yellow" },
      testdata: { label: "Testdata", tone: "yellow" },
      "actie nodig": { label: "Actie nodig", tone: "red" },
      deleted: { label: "Verwijderd", tone: "red" },
      accepted: { label: "Akkoord", tone: "green" },
      sent: { label: "Wacht op akkoord", tone: "yellow" },
      viewed: { label: "Wacht op akkoord", tone: "yellow" },
      draft: { label: "Concept", tone: "yellow" },
      planned: { label: "Gepland", tone: "yellow" },
      scheduled: { label: "Gepland", tone: "yellow" },
      delivered: { label: "Opgeleverd", tone: "green" },
      published: { label: "Gepubliceerd", tone: "green" },
      paid: { label: "Betaald", tone: "green" },
      open: { label: "Open", tone: "yellow" },
      overdue: { label: "Te laat", tone: "red" },
      rejected: { label: "Niet akkoord", tone: "red" },
      expired: { label: "Verlopen", tone: "red" },
    };
    return statuses[String(status || "").toLowerCase()] || { label: status || "Actief", tone: "green" };
  }

  function invoiceStatusMeta(status) {
    const statuses = {
      draft: { label: "Concept", tone: "yellow" },
      sent: { label: "Wacht op betaling", tone: "yellow" },
      open: { label: "Wacht op betaling", tone: "yellow" },
      overdue: { label: "Betaling te laat", tone: "red" },
      paid: { label: "Betaald", tone: "green" },
      credited: { label: "Gecrediteerd", tone: "green" },
      cancelled: { label: "Geannuleerd", tone: "red" },
    };
    return statuses[String(status || "").toLowerCase()] || { label: status || "Concept", tone: "yellow" };
  }

  function roleCell(role) {
    const ownerClass = role === "Owner admin" ? " owner" : "";
    return `<span class="role-pill${ownerClass}">${role}</span>`;
  }

  function rowFor(actionTarget) {
    return actionTarget.closest("tr");
  }

  function customerKey(name) {
    return String(name || "").trim().toLowerCase();
  }

  function customerNameFromRow(row) {
    return row?.querySelector("td")?.textContent.trim() || "";
  }

  function customerKeys() {
    return new Set([...customersBody?.querySelectorAll("tbody tr, tr") || []]
      .filter((row) => !row.dataset.emptyRow)
      .map(customerNameFromRow)
      .filter(Boolean)
      .map(customerKey));
  }

  function hasCustomer(name) {
    return customerKeys().has(customerKey(name));
  }

  function customerActions() {
    return '<div class="table-actions icon-actions"><a href="#klanten" data-admin-action="manage-customer" title="Klantdossier openen" aria-label="Klantdossier openen">↗</a><a href="portal-klant.html" title="Klantweergave bekijken" aria-label="Klantweergave bekijken">◉</a><button type="button" data-admin-action="send-account-mail" title="Accountmail opnieuw versturen" aria-label="Accountmail opnieuw versturen">✉</button><button type="button" data-admin-action="send-password-mail" title="Wachtwoord opnieuw instellen" aria-label="Wachtwoord opnieuw instellen">⌁</button><a href="#klanten" data-admin-action="edit-customer" title="Klant bewerken" aria-label="Klant bewerken">✎</a><a class="text-danger" href="#klanten" data-admin-action="delete-customer" title="Klant verwijderen" aria-label="Klant verwijderen">⌫</a></div>';
  }

  function customerRow(customer) {
    const meta = statusMeta(customer.status || "active");
    const objects = customer.objects ?? customer.objectCount ?? "-";
    const contactParts = [customer.contact_name, customer.contact_email, customer.contact_phone].filter(Boolean);
    const activity = contactParts.length ? contactParts.join(" / ") : customer.activity || customer.notes || "Klant aangemaakt";
    const idAttribute = customer.id ? ` data-customer-id="${escapeHtml(customer.id)}"` : "";
    const customerAttribute = customer.name ? ` data-customer-key="${escapeHtml(customerKey(customer.name))}"` : "";
    const searchText = [
      customer.name,
      customer.segment,
      objects,
      activity,
      customer.contact_name,
      customer.contact_email,
      customer.contact_phone,
      customer.address,
      customer.kvk_number,
      customer.bank_account,
      customer.notes,
    ].filter(Boolean).join(" ");
    return `<tr${idAttribute}${customerAttribute} class="customer-clickable-row" data-search="${escapeHtml(searchText)}" role="link" tabindex="0" aria-label="Klantdossier van ${escapeHtml(customer.name || "klant")} openen"><td>${escapeHtml(customer.name || "-")}</td><td>${escapeHtml(customer.segment || "-")}</td><td>${escapeHtml(objects)}</td><td>${escapeHtml(activity)}</td><td>${statusCell(escapeHtml(meta.label), meta.tone)}</td><td>${customerActions()}</td></tr>`;
  }

  function renderCustomers(customers) {
    if (!customersBody) return;
    if (!customers.length) {
      customersBody.innerHTML = "";
      return;
    }
    customersBody.innerHTML = customers.map((customer) => {
      return customerRow(customer);
    }).join("");
  }

  function renderRoles(profiles) {
    if (!rolesBody) return;
    const teamProfiles = profiles.filter((profile) => profile.roles?.length || profile.role !== "customer");
    if (!teamProfiles.length) {
      rolesBody.innerHTML = '<tr data-empty-row><td colspan="5">Geen teamleden gevonden.</td></tr>';
      return;
    }
    rolesBody.innerHTML = teamProfiles.map((profile) => {
      const roles = profile.roles?.length ? profile.roles : [profile.role];
      const role = roles.map((item) => roleLabels[item] || item).join(" + ");
      const employee = liveHrData.records.find((item) => item.profile_id === profile.id) || {};
      const today = new Date().toISOString().slice(0, 10);
      const activeLeave = liveHrData.leave.find((item) => item.profile_id === profile.id && item.status === "approved" && item.starts_on <= today && item.ends_on >= today);
      const activeAbsence = liveHrData.absence.find((item) => item.profile_id === profile.id && item.status !== "recovered" && item.starts_on <= today && (!item.ends_on || item.ends_on >= today));
      const availability = activeAbsence ? `${Number(activeAbsence.absence_percentage || 100)}% ziek` : activeLeave ? "Met verlof" : "Beschikbaar";
      const calendarAction = `<button type="button" data-admin-action="staff-calendar-feed" data-profile-id="${escapeHtml(profile.id)}">Agenda-abonnement</button>`;
      const roleAction = (portalAccess?.profile?.roles || [portalAccess?.profile?.role]).includes("owner_admin") ? '<button type="button" data-admin-action="edit-role">Rollen bewerken</button>' : "";
      const roleSummary = employee.job_title
        ? `<strong>${escapeHtml(employee.job_title)}</strong><small>${escapeHtml(role)}</small>`
        : escapeHtml(role);
      return `<tr class="record-clickable-row" role="link" tabindex="0" data-record-kind="profile" data-record-id="${escapeHtml(profile.id)}"><td><strong>${escapeHtml(profile.full_name || [employee.first_name,employee.last_name].filter(Boolean).join(" ") || profile.email)}</strong><small>${escapeHtml(profile.email)}</small></td><td>${roleSummary}</td><td>${escapeHtml(availability)}</td><td>${statusCell(employee.status === "left" ? "Uit dienst" : "Actief", employee.status === "left" ? "yellow" : "green")}</td><td><div class="table-actions">${calendarAction}<button type="button" data-admin-action="open-employee" data-profile-id="${escapeHtml(profile.id)}">Dossier</button>${roleAction}</div></td></tr>`;
    }).join("");
    renderHrMetrics(teamProfiles);
  }

  function renderRoleDefinitions(definitions) {
    const list = document.querySelector("[data-role-definitions]"); if (!list) return;
    list.innerHTML = definitions.map((item) => `<form class="role-definition-card" data-role-definition="${escapeHtml(item.role)}"><strong>${escapeHtml(item.label)}</strong><textarea name="description" aria-label="Functiebeschrijving ${escapeHtml(item.label)}">${escapeHtml(item.description || "")}</textarea><button class="btn ghost-dark" type="submit">Beschrijving opslaan</button></form>`).join("");
  }

  function dateRangeDays(start, end = new Date().toISOString().slice(0, 10)) {
    const from = new Date(`${start}T12:00:00`); const until = new Date(`${end}T12:00:00`); let days = 0;
    for (const day = new Date(from); day <= until; day.setDate(day.getDate() + 1)) if (![0, 6].includes(day.getDay())) days += 1;
    return Math.max(0, days);
  }

  function employeeAbsenceRate(profileId) {
    const year = new Date().getFullYear(); const start = `${year}-01-01`; const today = new Date().toISOString().slice(0, 10);
    const lost = liveHrData.absence.filter((item) => item.profile_id === profileId && item.starts_on <= today && (!item.ends_on || item.ends_on >= start)).reduce((sum, item) => sum + dateRangeDays(item.starts_on < start ? start : item.starts_on, item.ends_on && item.ends_on < today ? item.ends_on : today) * Number(item.absence_percentage || 100) / 100, 0);
    return dateRangeDays(start, today) ? (lost / dateRangeDays(start, today)) * 100 : 0;
  }

  function renderHrMetrics(profiles) {
    const cards = document.querySelectorAll("[data-hr-metrics] article"); if (!cards.length) return;
    const today = new Date().toISOString().slice(0, 10);
    const absentIds = new Set([
      ...liveHrData.leave.filter((item) => item.status === "approved" && item.starts_on <= today && item.ends_on >= today).map((item) => item.profile_id),
      ...liveHrData.absence.filter((item) => item.status !== "recovered" && item.starts_on <= today && (!item.ends_on || item.ends_on >= today)).map((item) => item.profile_id),
    ]);
    const active = profiles.filter((profile) => (liveHrData.records.find((item) => item.profile_id === profile.id)?.status || "active") !== "left");
    const rate = active.length ? active.reduce((sum, profile) => sum + employeeAbsenceRate(profile.id), 0) / active.length : 0;
    const values = [active.length, absentIds.size, `${rate.toLocaleString("nl-NL", { maximumFractionDigits: 1 })}%`, liveHrData.leave.filter((item) => item.status === "requested").length];
    cards.forEach((card, index) => { const value = card.querySelector("strong"); if (value) value.textContent = String(values[index]); });
  }

  function reportPipelineStage(status) {
    const normalized = String(status || "draft").trim().toLowerCase().replace(/[ -]+/g, "_");
    if (["delivered", "published", "complete", "completed", "geleverd", "afgerond"].includes(normalized)) return "delivered";
    if (["captured", "analysis", "analyse", "review", "in_review", "processing", "reporting"].includes(normalized)) return "analysis";
    if (["planned", "scheduled", "gepland", "appointment"].includes(normalized)) return "planned";
    return "intake";
  }

  function renderReportPipeline(reports = []) {
    if (!pipeline) return;
    const counts = { intake: 0, planned: 0, analysis: 0, delivered: 0 };
    reports.forEach((report) => {
      counts[reportPipelineStage(report.status)] += 1;
    });
    pipeline.querySelectorAll("[data-pipeline-stage]").forEach((article) => {
      const stage = article.dataset.pipelineStage;
      const value = article.querySelector("strong");
      if (value) value.textContent = String(counts[stage] || 0);
    });
  }

  function renderInspections(inspections = []) {
    liveInspections = inspections;
    renderReportPipeline(inspections);
    if (!inspectionBody) return;
    if (!inspections.length) {
      inspectionBody.innerHTML = '<tr data-empty-row><td colspan="6">Nog geen inspecties.</td></tr>';
      return;
    }
    inspectionBody.innerHTML = inspections.map((inspection) => {
      const productAndDepth = `${productLabel(inspection.inspection_product)} · ${inspectionDepths[inspection.inspection_depth]?.label || "Basis"}`;
      const scope = inspection.scope ? `<small>${escapeHtml(inspection.scope)}</small>` : "";
      return `<tr class="record-clickable-row" role="link" tabindex="0" data-record-kind="inspection" data-record-id="${escapeHtml(inspection.id)}"><td>${escapeHtml(inspection.reference || inspection.id.slice(0, 8).toUpperCase())}</td><td>${escapeHtml(inspection.organizations?.name || "-")}</td><td>${escapeHtml(inspection.properties?.name || "-")}</td><td><strong>${escapeHtml(productAndDepth)}</strong>${scope}</td><td>${statusCell(escapeHtml(inspection.status), inspection.status === "delivered" ? "green" : "yellow")}</td><td><button class="inline-button" type="button" data-admin-action="open-inspection" data-inspection-id="${escapeHtml(inspection.id)}">Open</button></td></tr>`;
    }).join("");
  }

  function populateWorkflowOrganizations(organizations) {
    [quoteForm, taskForm].forEach((form) => {
      const select = form?.querySelector('[name="organization_id"]');
      if (select) select.innerHTML = '<option value="">Selecteer klant</option>' + organizations.map((organization) => `<option value="${escapeHtml(organization.id)}">${escapeHtml(organization.name)}</option>`).join("");
    });
  }

  function renderTasks(tasks = []) {
    if (!supportGrid) return;
    supportGrid.innerHTML = tasks.length ? tasks.map((task) => `<div><strong>${escapeHtml(task.title)}</strong><span>${escapeHtml([task.organizations?.name, task.priority, task.status, task.due_at ? formatPortalDate(task.due_at) : ""].filter(Boolean).join(" · "))}</span></div>`).join("") : '<div data-empty-row><strong>Geen supporttaken</strong><span>Er zijn geen klantvragen of taken geladen.</span></div>';
  }

  function renderAdminSupport(requests = [], messages = [], tasks = []) {
    if (!supportGrid) return;
    const requestCards = requests.map((request) => { const thread = messages.filter((item) => item.request_id === request.id); return `<article class="admin-request-card"><strong>${escapeHtml(request.subject)}</strong><span>${escapeHtml(request.organizations?.name || "Klant")} · ${escapeHtml(request.status)}</span><div class="request-thread-messages">${thread.map((item) => `<div class="request-message ${escapeHtml(item.author_type)}"><strong>${item.author_type === "staff" ? "RoofSignal" : "Klant"}</strong><p>${escapeHtml(item.message)}</p></div>`).join("")}</div><form class="customer-mini-form" data-admin-request-message-form data-request-id="${escapeHtml(request.id)}" data-organization-id="${escapeHtml(request.organization_id)}"><label>Antwoord<textarea name="message" required rows="2"></textarea></label><button class="inline-button" type="submit">Antwoord versturen</button><span class="form-note"></span></form></article>`; });
    const taskCards = tasks.map((task) => `<div><strong>${escapeHtml(task.title)}</strong><span>${escapeHtml([task.organizations?.name, task.priority, task.status].filter(Boolean).join(" · "))}</span></div>`);
    supportGrid.innerHTML = [...requestCards, ...taskCards].join("") || '<div data-empty-row><strong>Geen supporttaken</strong><span>Er zijn geen klantvragen of taken geladen.</span></div>';
  }

  function populateInspectionOrganizations(organizations) {
    const select = inspectionForm?.querySelector('[name="organization_id"]');
    if (!select) return;
    select.innerHTML = '<option value="">Selecteer klant</option>' + organizations.map((organization) => `<option value="${escapeHtml(organization.id)}">${escapeHtml(organization.name)}</option>`).join("");
  }

  function formatMoney(value) {
    return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(Number(value || 0));
  }

  function productLabel(value) {
    return { quickscan: "Quickscan", object_report: "Objectrapportage", portfolio_scan: "Portefeuillescan" }[value] || value || "Inspectie";
  }

  function depthSnapshot(variant, depth) {
    const selected = inspectionDepths[depth] || inspectionDepths.basis;
    return { variant, variant_label: productLabel(variant), depth, depth_label: selected.label, list_price_ex_vat: selected.price, currency: "EUR", coverage: selected.coverage };
  }

  function updateQuoteDepth(row) {
    const depth = row?.querySelector('[data-quote-item-field="inspection_depth"]')?.value || "basis";
    const selected = inspectionDepths[depth];
    const amount = row?.querySelector('[data-quote-item-field="amount"]');
    const summary = row?.querySelector("[data-quote-depth-summary]");
    if (amount) amount.value = String(selected.price);
    if (summary) summary.textContent = `${selected.label} · ${Object.keys(selected.coverage).join(", ")}.`;
  }

  function renderInvoices(invoices = []) {
    if (!invoicesBody) return;
    invoicesBody.innerHTML = invoices.length
      ? invoices.map((invoice) => {
        const open = ["sent", "open", "overdue"].includes(invoice.status);
        const mailAction = `<button class="inline-button" data-admin-action="send-invoice-mail" data-invoice-id="${escapeHtml(invoice.id)}">${invoice.status === "draft" ? "Versturen" : "Opnieuw versturen"}</button>${open ? `<button class="inline-button" data-admin-action="send-invoice-reminder" data-invoice-id="${escapeHtml(invoice.id)}">Herinnering versturen</button><button class="inline-button" data-admin-action="pay-invoice" data-invoice-id="${escapeHtml(invoice.id)}">Betaald registreren</button>` : ""}`;
        const paymentLink = !["paid", "credited", "cancelled"].includes(invoice.status) ? `<button class="inline-button" data-admin-action="set-payment-link" data-invoice-id="${escapeHtml(invoice.id)}">${invoice.payment_url ? "Betaallink wijzigen" : "Betaallink toevoegen"}</button>` : "";
        const credit = !["credited", "cancelled"].includes(invoice.status) ? `<button class="inline-button text-danger" data-admin-action="credit-invoice" data-invoice-id="${escapeHtml(invoice.id)}">Crediteren</button>` : "";
        const view = `<button class="inline-button" data-admin-action="open-invoice" data-invoice-id="${escapeHtml(invoice.id)}">Factuur bekijken</button>`;
        return `<tr class="record-clickable-row" role="link" tabindex="0" data-record-kind="invoice" data-record-id="${escapeHtml(invoice.id)}"><td>${escapeHtml(invoice.organizations?.name || "-")}</td><td>${escapeHtml(formatMoney(invoice.amount))}</td><td>${statusCell(invoiceStatusMeta(invoice.status))}</td><td><div class="table-actions">${view}${mailAction}${paymentLink}${credit}</div></td></tr>`;
      }).join("")
      : '<tr data-empty-row><td colspan="4">Geen facturen.</td></tr>';
  }

  async function changeInvoiceStatus(id, status) {
    const invoice = liveInvoices.find((item) => item.id === id); if (!invoice) return;
    const now = new Date().toISOString(); const payload = status === "sent" ? { status, sent_at: now } : { status, paid_at: now };
    const result = await window.RoofSignalBackend.updateInvoice(id, payload);
    if (!result.ok) return setPortalNotice(result.error?.message || "Factuur bijwerken is mislukt.", "error");
    await window.RoofSignalBackend.createInvoiceEvent({ invoice_id: id, organization_id: invoice.organization_id, event_type: status === "sent" ? "sent" : "payment", amount: invoice.amount });
    setPortalNotice(status === "sent" ? "Factuur is als verzonden geregistreerd." : "Betaling is geregistreerd.", "success"); await loadLiveAdminData();
  }

  async function resendAppointment(id) {
    const result = await window.RoofSignalBackend.sendAppointmentEmail(id);
    setPortalNotice(result.ok ? "De afspraakbevestiging is opnieuw verstuurd." : result.error?.message || "De afspraakbevestiging kon niet worden verstuurd.", result.ok ? "success" : "error");
  }

  async function sendInvoiceMail(id, reminder = false) {
    const result = await window.RoofSignalBackend.sendDocumentEmail("invoice", id, { reminder });
    setPortalNotice(result.ok ? (reminder ? "De betalingsherinnering is verstuurd." : "De factuurmail is verstuurd.") : result.error?.message || "De factuurmail kon niet worden verstuurd.", result.ok ? "success" : "error");
    if (result.ok) await loadLiveAdminData();
  }

  async function sendCustomerAccessMail(row, action) {
    const customer = liveOrganizations.find((item) => item.id === row?.dataset.customerId);
    if (!customer?.contact_email) return setPortalNotice("Deze klant heeft geen contact-e-mailadres.", "error");
    const result = await window.RoofSignalBackend.sendPortalAccessEmail(customer.contact_email, action);
    const label = action === "password_reset" ? "Wachtwoordmail" : "Accountmail";
    setPortalNotice(result.ok ? `${label} is verstuurd naar ${customer.contact_email}.` : result.error?.message || `${label} kon niet worden verstuurd.`, result.ok ? "success" : "error");
  }

  async function setInvoicePaymentLink(id) {
    const invoice = liveInvoices.find((item) => item.id === id); if (!invoice) return;
    const paymentUrl = prompt("Volledige betaallink van de betaalprovider", invoice.payment_url || ""); if (paymentUrl === null) return;
    if (paymentUrl && !/^https:\/\//i.test(paymentUrl)) return setPortalNotice("Gebruik een volledige https-betaallink.", "error");
    const result = await window.RoofSignalBackend.updateInvoice(id, { payment_url: paymentUrl || null });
    if (!result.ok) return setPortalNotice(result.error?.message || "Betaallink opslaan is mislukt.", "error");
    setPortalNotice(paymentUrl ? "Betaallink is zichtbaar voor de klant." : "Betaallink is verwijderd.", "success"); await loadLiveAdminData();
  }

  async function creditInvoice(id) {
    const invoice = liveInvoices.find((item) => item.id === id); if (!invoice || !confirm("Een creditfactuur aanmaken voor het volledige bedrag?")) return;
    const credit = await window.RoofSignalBackend.createInvoice({ organization_id: invoice.organization_id, quote_id: invoice.quote_id, amount: -Math.abs(Number(invoice.amount || 0)), status: "sent", due_date: new Date().toISOString().slice(0,10), credited_invoice_id: invoice.id });
    if (!credit.ok) return setPortalNotice(credit.error?.message || "Creditfactuur aanmaken is mislukt.", "error");
    await window.RoofSignalBackend.createInvoiceLines([{ invoice_id: credit.data.id, description: `Credit op ${invoice.invoice_number || "factuur"}`, quantity: 1, unit_price: -Math.abs(Number(invoice.amount || 0)), vat_rate: 21 }]);
    await window.RoofSignalBackend.updateInvoice(invoice.id, { status: "credited" });
    await window.RoofSignalBackend.createInvoiceEvent({ invoice_id: invoice.id, organization_id: invoice.organization_id, event_type: "credited", amount: invoice.amount });
    setPortalNotice("Creditfactuur is aangemaakt.", "success"); await loadLiveAdminData();
  }

  function quoteNextAction(quote) {
    const items = liveQuoteItems.filter((item) => item.quote_id === quote.id);
    const inspections = liveInspections.filter((item) => item.quote_id === quote.id);
    const invoice = liveInvoices.find((item) => item.quote_id === quote.id);
    if (quote.status === "draft") return `<button class="inline-button" data-admin-action="send-quote" data-quote-id="${escapeHtml(quote.id)}">Offerte verzenden</button>`;
    if (quote.status === "sent") return `<div class="table-actions"><button class="inline-button" data-admin-action="edit-sent-quote" data-quote-id="${escapeHtml(quote.id)}">Offerte aanpassen</button><button class="inline-button" data-admin-action="sync-quote-items" data-quote-id="${escapeHtml(quote.id)}">Regels synchroniseren</button><button class="inline-button" data-admin-action="accept-quote" data-quote-id="${escapeHtml(quote.id)}">Akkoord registreren</button><button class="inline-button" data-admin-action="send-quote-custom" data-quote-id="${escapeHtml(quote.id)}">Opnieuw e-mailen</button></div>`;
    if (quote.status !== "accepted") return "-";
    const unscheduled = items.filter((item) => !inspections.some((inspection) => inspection.quote_item_id === item.id));
    if (unscheduled.length) return `<button class="inline-button" data-admin-action="schedule-quote" data-quote-id="${escapeHtml(quote.id)}">${unscheduled.length} object${unscheduled.length === 1 ? "" : "en"} plannen</button>`;
    const openInspection = inspections.find((inspection) => inspection.status !== "delivered");
    if (invoice) return `Factuur ${escapeHtml(invoice.status || "concept")}`;
    if (openInspection) return `<div class="table-actions"><button class="inline-button" data-admin-action="open-inspection" data-inspection-id="${escapeHtml(openInspection.id)}">Inspectie openen</button><button class="inline-button" data-admin-action="invoice-quote" data-quote-id="${escapeHtml(quote.id)}">Conceptfactuur</button></div>`;
    return `<button class="inline-button" data-admin-action="invoice-quote" data-quote-id="${escapeHtml(quote.id)}">Conceptfactuur</button>`;
  }

  function renderQuotes(quotes = []) {
    if (!offersBody) return;
    offersBody.innerHTML = quotes.length
      ? quotes.map((quote) => { const items = liveQuoteItems.filter((item) => item.quote_id === quote.id); return `<tr class="record-clickable-row" role="link" tabindex="0" data-record-kind="quote" data-record-id="${escapeHtml(quote.id)}"><td>${escapeHtml(quote.organizations?.name || "-")}</td><td>${escapeHtml(items.map((item) => item.properties?.name).filter(Boolean).join(", ") || "-")}</td><td>${escapeHtml(quote.title || quote.quote_number || "Offerte")}</td><td>${escapeHtml(formatMoney(quote.amount))}</td><td>${statusCell(escapeHtml(quote.status || "Concept"), quote.status === "accepted" ? "green" : "yellow")}</td><td>${quoteNextAction(quote)}</td></tr>`; }).join("")
      : '<tr data-empty-row><td colspan="6">Geen offertes.</td></tr>';
  }

  function renderAppointments(appointments = []) {
    renderResourceCalendar(appointments);
    if (!planningList) return;
    planningList.innerHTML = appointments.length
      ? appointments.map((appointment) => `<div class="record-clickable-row" role="link" tabindex="0" data-record-kind="appointment" data-record-id="${escapeHtml(appointment.id)}"><span>${escapeHtml(formatPortalDate(appointment.starts_at))}</span><strong>${escapeHtml(appointment.title || "Afspraak")}</strong><p>${escapeHtml([appointment.organizations?.name, appointment.properties?.name, appointment.profiles?.full_name || appointment.profiles?.email, statusMeta(appointment.status).label].filter(Boolean).join(" · "))}</p><button class="inline-button" type="button" data-admin-action="resend-appointment" data-appointment-id="${escapeHtml(appointment.id)}">Bevestiging opnieuw versturen</button></div>`).join("")
      : '<div data-empty-row><strong>Geen planning</strong><span>Er zijn geen afspraken geladen.</span></div>';
  }

  function startOfCalendarWeek(offset = 0) {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    const day = date.getDay() || 7;
    const mondayShift = day >= 6 ? 8 - day : 1 - day;
    date.setDate(date.getDate() + mondayShift + (offset * 7));
    return date;
  }

  function renderResourceCalendar(appointments = liveAppointments) {
    const grid = document.querySelector("[data-resource-calendar-grid]");
    const period = document.querySelector("[data-calendar-period]");
    if (!grid) return;
    const start = startOfCalendarWeek(resourceCalendarWeekOffset);
    const days = Array.from({ length: 5 }, (_, index) => { const date = new Date(start); date.setDate(start.getDate() + index); return date; });
    const end = new Date(days[4]); end.setHours(23, 59, 59, 999);
    if (period) period.textContent = `${days[0].toLocaleDateString("nl-NL", { day: "numeric", month: "short" })} – ${days[4].toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" })}`;
    const inspectors = liveProfiles.filter((profile) => (profile.roles || [profile.role]).includes("inspector"));
    const resources = inspectors.length ? inspectors : [{ id: "unassigned", full_name: "Niet toegewezen" }];
    const header = `<div class="calendar-corner"><span>Inspecteur</span></div>${days.map((date) => `<div class="calendar-day-head${date.toDateString() === new Date().toDateString() ? " today" : ""}"><strong>${date.toLocaleDateString("nl-NL", { weekday: "short" })}</strong><span>${date.getDate()} ${date.toLocaleDateString("nl-NL", { month: "short" })}</span></div>`).join("")}`;
    const rows = resources.map((resource) => {
      const name = resource.full_name || resource.email || "Inspecteur";
      const cells = days.map((date) => {
        const events = appointments.filter((appointment) => {
          const when = new Date(appointment.starts_at);
          const assigned = resource.id === "unassigned" ? !appointment.inspector_id && !appointment.profile_id : [appointment.inspector_id, appointment.profile_id, appointment.profiles?.id].includes(resource.id);
          return assigned && when.toDateString() === date.toDateString() && when >= start && when <= end;
        });
        return `<div class="calendar-resource-cell${date.toDateString() === new Date().toDateString() ? " today" : ""}">${events.map((appointment) => `<button type="button" class="calendar-event-card record-clickable-row" data-record-kind="appointment" data-record-id="${escapeHtml(appointment.id)}"><time>${new Date(appointment.starts_at).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" })}</time><strong>${escapeHtml(appointment.organizations?.name || appointment.title || "Afspraak")}</strong><span>${escapeHtml(appointment.properties?.name || "")}</span></button>`).join("")}</div>`;
      }).join("");
      return `<div class="calendar-resource-name"><strong>${escapeHtml(name)}</strong><span>${escapeHtml(roleLabels[resource.role] || "Inspecteur")}</span></div>${cells}`;
    }).join("");
    grid.innerHTML = header + rows;
  }

  function renderAdminMetrics(customers, inspections, invoices, quotes, tasks = []) {
    const cards = [...document.querySelectorAll("#dashboard article")];
    const openInspections = inspections.filter((inspection) => !["delivered", "cancelled"].includes(inspection.status)).length;
    const openInvoices = invoices.filter((invoice) => !["paid", "cancelled", "credited"].includes(invoice.status));
    const openAmount = openInvoices.reduce((total, invoice) => total + Number(invoice.amount || 0), 0);
    const openTasks = tasks.filter((task) => !["completed", "cancelled"].includes(task.status)).length;
    const values = [customers.length, openInspections, openTasks, formatMoney(openAmount), quotes.filter((quote) => !["accepted", "rejected", "expired"].includes(quote.status)).length];
    const notes = ["Live uit klantdata.", "Niet geleverd of geannuleerd.", "Open interne taken.", "Niet betaald of gecrediteerd.", "Nog niet afgerond."];
    cards.forEach((card, index) => {
      if (card.querySelector("strong")) card.querySelector("strong").textContent = String(values[index] ?? 0);
      if (card.querySelector("p")) card.querySelector("p").textContent = notes[index] || "";
    });
  }

  function renderAdminDashboardPreviews(customers = [], quotes = [], appointments = []) {
    const targets = {
      customers: document.querySelector("[data-dashboard-customers]"),
      quotes: document.querySelector("[data-dashboard-quotes]"),
      planning: document.querySelector("[data-dashboard-planning]")
    };
    const row = (kind, id, title, detail, status = "", query = title) => `<button type="button" class="admin-preview-item" data-dashboard-preview-kind="${escapeHtml(kind)}" data-dashboard-preview-id="${escapeHtml(id || "")}" data-dashboard-preview-query="${escapeHtml(query || title || "")}" aria-label="${escapeHtml(title || "Item")} openen"><span class="admin-preview-copy"><strong>${escapeHtml(title || "-")}</strong><small>${escapeHtml(detail || "")}</small></span><span class="admin-preview-meta">${status ? statusCell(status) : ""}<i aria-hidden="true">→</i></span></button>`;
    if (targets.customers) targets.customers.innerHTML = customers.length ? customers.slice(0, 5).map((customer) => row("customer", customer.id, customer.name, customer.contact_email || customer.segment || "Klant", customer.status || "active")).join("") : emptyState("Nog geen klanten.");
    const openQuotes = quotes.filter((quote) => !["accepted", "rejected", "expired"].includes(quote.status));
    if (targets.quotes) targets.quotes.innerHTML = openQuotes.length ? openQuotes.slice(0, 5).map((quote) => row("quote", quote.id, quote.organizations?.name || quote.title, `${quote.title || "Offerte"} · ${formatMoney(quote.amount)}`, quote.status || "draft", quote.title || quote.organizations?.name)).join("") : emptyState("Geen open offertes.");
    const upcoming = appointments.filter((appointment) => new Date(appointment.starts_at) >= new Date()).sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
    if (targets.planning) targets.planning.innerHTML = upcoming.length ? upcoming.slice(0, 5).map((appointment) => row("appointment", appointment.id, appointment.organizations?.name || appointment.title, `${formatPortalDate(appointment.starts_at)} · ${appointment.properties?.name || ""}`, appointment.status || "planned", appointment.organizations?.name || appointment.title)).join("") : emptyState("Geen aankomende afspraken.");
  }

  function openDashboardPreview(target) {
    const kind = target.dataset.dashboardPreviewKind;
    const view = { customer: "klanten", quote: "offertes", appointment: "planning" }[kind];
    if (!view) return;
    window.RoofSignalAdminNavigate?.(view);
    if (kind === "customer") {
      const row = customersBody?.querySelector(`[data-customer-id="${CSS.escape(target.dataset.dashboardPreviewId)}"]`);
      if (row) openCustomer(row);
      return;
    }
    const input = document.getElementById(view)?.querySelector("[data-list-search]");
    if (input) {
      input.value = target.dataset.dashboardPreviewQuery || "";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.focus();
    }
  }

  function openEmployeeDossier(profileId) {
    if (!profileId) return;
    window.location.href = `portal-medewerker.html?id=${encodeURIComponent(profileId)}`;
  }

  async function openInvoicePdf(invoiceId, fallbackTarget) {
    const viewer = window.open("about:blank", "_blank");
    const result = await window.RoofSignalBackend.openInvoiceDocument(invoiceId);
    if (result.ok && result.data?.signedUrl) {
      if (viewer) viewer.location.replace(result.data.signedUrl);
      else window.location.href = result.data.signedUrl;
      return;
    }
    viewer?.close();
    setPortalNotice("Bij deze factuur is nog geen PDF opgeslagen. De factuurgegevens worden getoond.", "error");
    if (fallbackTarget) openRecordContext(fallbackTarget, true);
  }

  function openRecordContext(target, detailsOnly = false) {
    const kind = target.dataset.recordKind;
    const id = target.dataset.recordId;
    if (kind === "inspection") return openInspection(id);
    if (kind === "profile") return openEmployeeDossier(id);
    if (kind === "invoice" && !detailsOnly) return openInvoicePdf(id, target);
    const record = { quote: liveQuotes, invoice: liveInvoices, appointment: liveAppointments, profile: liveProfiles }[kind]?.find((item) => item.id === id);
    if (!record) return;
    let dialog = document.querySelector("[data-admin-record-dialog]");
    if (!dialog) {
      dialog = document.createElement("dialog");
      dialog.className = "portal-dialog";
      dialog.dataset.adminRecordDialog = "true";
      document.body.append(dialog);
    }
    const title = kind === "quote" ? record.title || record.quote_number || "Offerte" : kind === "invoice" ? record.invoice_number || "Factuur" : kind === "profile" ? record.full_name || record.email : record.title || "Afspraak";
    const fields = kind === "quote"
      ? [["Klant", record.organizations?.name], ["Bedrag", formatMoney(record.amount)], ["Status", statusMeta(record.status).label], ["Geldig tot", record.valid_until ? formatPortalDate(record.valid_until) : "-"]]
      : kind === "invoice"
        ? [["Klant", record.organizations?.name], ["Bedrag", formatMoney(record.amount)], ["Status", invoiceStatusMeta(record.status).label], ["Vervaldatum", record.due_date ? formatPortalDate(record.due_date) : "-"], ["Betalingstermijn", record.payment_term_days != null ? `${record.payment_term_days} dagen` : "-"], ["Rekeningnummer", record.bank_account], ["Ten name van", record.account_holder]]
        : kind === "profile"
          ? [["Naam", record.full_name], ["E-mailadres", record.email], ["Rol", roleLabels[record.role] || record.role], ["Telefoon", record.phone || "-"]]
          : [["Klant", record.organizations?.name], ["Object", record.properties?.name], ["Datum en tijd", formatPortalDate(record.starts_at)], ["Inspecteur", record.profiles?.full_name || record.profiles?.email || "-"]];
    const inspectorEditor = kind === "appointment" ? appointmentInspectorEditor(record) : "";
    dialog.innerHTML = `<div class="portal-dialog-card admin-record-card"><div class="panel-head"><div><span class="eyebrow orange">Details</span><h2>${escapeHtml(title)}</h2></div><button class="dialog-close" type="button" data-dialog-close aria-label="Sluiten">×</button></div><dl>${fields.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value || "-")}</dd></div>`).join("")}</dl>${inspectorEditor}<div class="dialog-actions"><button class="btn ghost-dark" type="button" data-dialog-close>Sluiten</button></div></div>`;
    dialog.showModal();
  }

  function appointmentInspectorEditor(appointment) {
    const inspectors = liveProfiles.filter((profile) => (profile.roles || [profile.role]).includes("inspector"));
    const options = inspectors.map((profile) => `<option value="${escapeHtml(profile.id)}"${profile.id === appointment.inspector_id ? " selected" : ""}>${escapeHtml(profile.full_name || profile.email)}</option>`).join("");
    return `<form class="appointment-inspector-form" data-appointment-inspector-form data-appointment-id="${escapeHtml(appointment.id)}"><label>Inspecteur/drone-operator<select name="inspector_id" required><option value="">Selecteer medewerker</option>${options}</select></label><button class="btn" type="submit">Koppeling opslaan</button><p class="form-note" data-appointment-inspector-status>${inspectors.length ? "Alleen medewerkers met de rol Inspecteur zijn beschikbaar." : "Ken eerst in Medewerkers & HR de rol Inspecteur toe."}</p></form>`;
  }

  async function submitAppointmentInspector(event) {
    event.preventDefault();
    const form = event.target;
    const status = form.querySelector("[data-appointment-inspector-status]");
    const inspectorId = new FormData(form).get("inspector_id");
    if (!inspectorId) return setWorkflowStatus(status, "Selecteer een inspecteur/drone-operator.", "error");
    const result = await window.RoofSignalBackend.updateAppointment(form.dataset.appointmentId, { inspector_id: inspectorId });
    if (!result.ok) return setWorkflowStatus(status, result.error?.message || "De medewerker kon niet worden gekoppeld.", "error");
    form.closest("dialog")?.close();
    setPortalNotice("Inspecteur/drone-operator is aan de opdracht gekoppeld.", "success");
    await loadLiveAdminData();
  }

  async function loadLiveAdminData() {
    const backend = window.RoofSignalBackend;
    if (!backend?.isConfigured || (!customersBody && !rolesBody)) return;
    const [customers, profiles, inspections, invoices, quotes, appointments, tasks, quoteItems, reports, upgrades, requests, requestMessages, hrData, roleDefinitions] = await Promise.all([
      backend.listOrganizations(),
      backend.listProfiles(),
      backend.listInspections(),
      backend.listInvoices(),
      backend.listQuotes(),
      backend.listAppointments(),
      backend.listTasks(),
      backend.listQuoteItems(),
      backend.listReports(),
      backend.listUpgradeRequests(),
      backend.listCustomerRequests(),
      backend.listRequestMessages(),
      backend.listEmployeeHrData(),
      backend.listRoleDefinitions(),
    ]);
    liveOrganizations = customers;
    liveProfiles = profiles;
    liveAppointments = appointments;
    liveInvoices = invoices;
    liveQuotes = quotes;
    liveQuoteItems = quoteItems;
    liveTasks = tasks;
    liveReports = reports;
    liveUpgradeRequests = upgrades;
    liveHrData = hrData;
    liveRoleDefinitions = roleDefinitions;
    renderCustomers(customers);
    const pendingCustomerId = sessionStorage.getItem("roofsignal-open-customer-id");
    if (pendingCustomerId) {
      sessionStorage.removeItem("roofsignal-open-customer-id");
      const pendingRow = customersBody?.querySelector(`[data-customer-id="${CSS.escape(pendingCustomerId)}"]`);
      if (pendingRow) window.setTimeout(() => openCustomer(pendingRow), 0);
    }
    renderRoles(profiles);
    renderRoleDefinitions(roleDefinitions);
    renderInspections(inspections);
    renderInvoices(invoices);
    renderQuotes(quotes);
    renderAppointments(appointments);
    renderAdminSupport(requests, requestMessages, tasks);
    renderAdminMetrics(customers, inspections, invoices, quotes, tasks);
    renderAdminDashboardPreviews(customers, quotes, appointments);
    populateInspectionOrganizations(customers);
    populateWorkflowOrganizations(customers);
    syncCustomerOwnedData();
    iconizeAdminActions();
  }

  async function loadInspectionObjects(organizationId) {
    const select = inspectionForm?.querySelector('[name="property_id"]');
    if (!select) return;
    select.disabled = true;
    select.innerHTML = '<option value="">Objecten laden...</option>';
    if (!organizationId) {
      select.innerHTML = '<option value="">Selecteer eerst een klant</option>';
      return;
    }
    const [properties, contacts, activities, maintenance] = await Promise.all([
      window.RoofSignalBackend.listOrganizationProperties(organizationId),
      window.RoofSignalBackend.listOrganizationContacts(organizationId),
      window.RoofSignalBackend.listCustomerActivities(organizationId),
      window.RoofSignalBackend.listMaintenanceActions(organizationId),
    ]);
    select.innerHTML = '<option value="">Selecteer object</option>' + properties.map((property) => `<option value="${escapeHtml(property.id)}">${escapeHtml(property.name)}</option>`).join("");
    select.disabled = !properties.length;
    if (!properties.length) select.innerHTML = '<option value="">Deze klant heeft nog geen objecten</option>';
  }

  async function createInspection(event) {
    event.preventDefault();
    if (!inspectionForm) return;
    const formData = new FormData(inspectionForm);
    const payload = {
      organization_id: String(formData.get("organization_id") || ""),
      property_id: String(formData.get("property_id") || ""),
      inspection_product: String(formData.get("inspection_product") || ""),
      inspection_depth: String(formData.get("inspection_depth") || ""),
      scope: String(formData.get("scope") || "").trim() || null,
      scheduled_at: formData.get("scheduled_at") ? new Date(String(formData.get("scheduled_at"))).toISOString() : null,
      status: formData.get("scheduled_at") ? "planned" : "intake",
    };
    if (!payload.organization_id || !payload.property_id || !payload.inspection_product || !payload.inspection_depth) return;
    const button = inspectionForm.querySelector('button[type="submit"]');
    button.disabled = true;
    if (inspectionStatus) inspectionStatus.textContent = "Inspectie wordt aangemaakt...";
    const result = await window.RoofSignalBackend.createInspection(payload);
    button.disabled = false;
    if (!result.ok) {
      if (inspectionStatus) inspectionStatus.textContent = result.error?.message || "Inspectie aanmaken is mislukt.";
      return;
    }
    inspectionForm.reset();
    await loadInspectionObjects("");
    if (inspectionStatus) inspectionStatus.textContent = "Inspectie is aangemaakt en aan het object gekoppeld.";
    renderInspections(await window.RoofSignalBackend.listInspections());
  }

  async function editCustomer(row) {
    const cells = row.querySelectorAll("td");
    const name = prompt("Klantnaam", cells[0].textContent.trim());
    if (!name) return;
    const segment = prompt("Segment", cells[1].textContent.trim());
    if (!segment) return;
    const activity = prompt("Laatste activiteit", cells[3].textContent.trim());
    if (!activity) return;

    if (window.RoofSignalBackend?.isConfigured && row.dataset.customerId) {
      const result = await window.RoofSignalBackend.updateOrganization(row.dataset.customerId, {
        name,
        segment,
        notes: activity,
      });
      if (!result.ok) return setPortalNotice(result.error?.message || "Klant opslaan is mislukt.", "error");
    }
    cells[0].textContent = name;
    cells[1].textContent = segment;
    cells[3].textContent = activity;
    row.dataset.customerKey = customerKey(name);
    setPortalNotice("Klantgegevens zijn opgeslagen.", "success");
    syncCustomerOwnedData();
    saveState();
  }

  function linkCustomerRows() {
    customersBody?.querySelectorAll("tr").forEach((row) => {
      if (row.dataset.emptyRow) return;
      row.dataset.customerKey = customerKey(customerNameFromRow(row));
      if (!row.dataset.search) row.dataset.search = row.textContent;
    });
  }

  function filterCustomers() {
    if (!customersBody || !customerSearchInput) return;
    const query = customerKey(customerSearchInput.value);
    const rows = [...customersBody.querySelectorAll("tr")].filter((row) => !row.dataset.emptyRow);
    let visible = 0;

    rows.forEach((row) => {
      const haystack = customerKey(`${row.textContent} ${row.dataset.search || ""}`);
      const match = !query || haystack.includes(query);
      row.hidden = !match;
      if (match) visible += 1;
    });

    if (customerSearchStatus) {
      customerSearchStatus.textContent = query
        ? `${visible} klant${visible === 1 ? "" : "en"} gevonden.`
        : "Zoeken gebruikt alle bekende klantvelden.";
    }
  }

  function linkRowsByFirstCell(body) {
    body?.querySelectorAll("tr").forEach((row) => {
      if (row.dataset.emptyRow) return;
      row.dataset.customerKey = customerKey(row.querySelector("td")?.textContent.trim());
    });
  }

  function linkSupportCards() {
    const validKeys = customerKeys();
    supportGrid?.querySelectorAll(":scope > div").forEach((item) => {
      const key = customerKey(item.querySelector("strong")?.textContent.trim());
      if (validKeys.has(key)) item.dataset.customerKey = key;
    });
  }

  function linkPlanningItems() {
    const customers = [...customerKeys()];
    planningList?.querySelectorAll(":scope > div").forEach((item) => {
      const text = customerKey(item.textContent);
      const key = customers.find((candidate) => candidate && text.includes(candidate));
      if (key) item.dataset.customerKey = key;
    });
  }

  function ensureEmptyRow(body, colSpan, message) {
    if (!body) return;
    body.querySelectorAll("[data-empty-row]").forEach((row) => row.remove());
    const hasRows = [...body.querySelectorAll("tr")].some((row) => !row.dataset.emptyRow);
    if (hasRows) return;
    const row = document.createElement("tr");
    row.dataset.emptyRow = "true";
    row.innerHTML = `<td colspan="${colSpan}">${escapeHtml(message)}</td>`;
    body.append(row);
  }

  function ensureEmptyCard(container, message) {
    if (!container) return;
    container.querySelectorAll("[data-empty-row]").forEach((item) => item.remove());
    const hasItems = [...container.children].some((item) => !item.dataset.emptyRow);
    if (hasItems) return;
    const item = document.createElement("div");
    item.dataset.emptyRow = "true";
    item.innerHTML = `<strong>Geen klantdata</strong><span>${escapeHtml(message)}</span>`;
    container.append(item);
  }

  function updateAggregateData(hasCustomers) {
    const dashboardCards = [...document.querySelectorAll("#dashboard article")];
    const customerCount = customersBody
      ? [...customersBody.querySelectorAll("tr")].filter((row) => !row.dataset.emptyRow).length
      : 0;

    if (!hasCustomers) {
      const emptyValues = ["0", "0", "0", "EUR 0", "0"];
      dashboardCards.forEach((card, index) => {
        const value = card.querySelector("strong");
        const note = card.querySelector("p");
        if (value) value.textContent = emptyValues[index] || "0";
        if (note) note.textContent = "Geen klantdata.";
      });
    } else if (dashboardCards[0]) {
      const value = dashboardCards[0].querySelector("strong");
      if (value) value.textContent = String(customerCount);
    }

    if (pipeline && !hasCustomers) renderReportPipeline([]);
  }

  function syncCustomerOwnedData() {
    linkCustomerRows();
    linkRowsByFirstCell(offersBody);
    linkRowsByFirstCell(invoicesBody);
    linkSupportCards();
    linkPlanningItems();

    const validKeys = customerKeys();
    const linkedItems = [
      ...offersBody?.querySelectorAll("tr[data-customer-key]") || [],
      ...invoicesBody?.querySelectorAll("tr[data-customer-key]") || [],
      ...supportGrid?.querySelectorAll(":scope > [data-customer-key]") || [],
      ...planningList?.querySelectorAll(":scope > [data-customer-key]") || [],
    ];

    linkedItems.forEach((item) => {
      if (!validKeys.has(item.dataset.customerKey)) item.remove();
    });

    if (!validKeys.size) {
      offersBody?.querySelectorAll("tr:not([data-empty-row])").forEach((row) => row.remove());
      invoicesBody?.querySelectorAll("tr:not([data-empty-row])").forEach((row) => row.remove());
      supportGrid?.querySelectorAll(":scope > div:not([data-empty-row])").forEach((item) => item.remove());
      planningList?.querySelectorAll(":scope > div:not([data-empty-row])").forEach((item) => item.remove());
    }

    ensureEmptyRow(offersBody, 4, "Geen offertes zonder klant.");
    ensureEmptyRow(invoicesBody, 3, "Geen facturen zonder klant.");
    ensureEmptyCard(supportGrid, "Geen supporttaken zonder klant.");
    ensureEmptyCard(planningList, "Geen planning zonder klant.");
    updateAggregateData(Boolean(validKeys.size));
    filterCustomers();
  }

  function setCustomerCreateStatus(message, tone = "") {
    if (!customerCreateStatus) return;
    customerCreateStatus.textContent = message;
    customerCreateStatus.dataset.statusTone = tone;
  }

  function focusCustomerForm() {
    window.location.href = "portal-klant-aanmaken.html";
  }

  function focusRoleBuilder() {
    roleBuilder?.scrollIntoView({ behavior: "smooth", block: "center" });
    roleBuilder?.querySelector("input")?.focus({ preventScroll: true });
    setPortalNotice("Vul het e-mailadres en de rol in en klik op Rol toewijzen.");
  }

  async function createCustomer(event) {
    event.preventDefault();
    if (!customersBody || !customerCreateForm) return;

    const formData = new FormData(customerCreateForm);
    const customer = {
      name: String(formData.get("name") || "").trim(),
      segment: String(formData.get("segment") || "").trim(),
      objects: String(formData.get("objects") || "0").trim(),
      status: String(formData.get("status") || "prospect").trim(),
      notes: String(formData.get("notes") || "").trim(),
    };

    if (!customer.name) {
      setCustomerCreateStatus("Vul eerst een klantnaam in.", "error");
      customerCreateForm.querySelector("input[name='name']")?.focus();
      return;
    }

    const button = customerCreateForm.querySelector("button");
    button.disabled = true;
    setCustomerCreateStatus("Klant wordt aangemaakt...", "");

    let syncWarning = "";
    try {
      if (window.RoofSignalBackend?.isConfigured) {
        const result = await window.RoofSignalBackend.createOrganization({
          name: customer.name,
          segment: customer.segment,
          status: customer.status,
          notes: customer.notes || "Aangemaakt in backoffice",
        });
        if (result.ok) {
          customer.id = result.data?.id;
        } else {
          syncWarning = " Supabase-sync is niet gelukt; de klant staat lokaal in deze backoffice-sessie.";
        }
      }

      const template = document.createElement("template");
      template.innerHTML = customerRow({
        ...customer,
        activity: customer.notes || "Zojuist aangemaakt",
      });
      customersBody.prepend(template.content.firstElementChild);
      syncCustomerOwnedData();
      saveState();
      customerCreateForm.reset();
      customerCreateForm.querySelector("input[name='objects']").value = "0";
      setCustomerCreateStatus(`${customer.name} is aangemaakt in de backoffice.${syncWarning}`, syncWarning ? "error" : "success");
    } catch (error) {
      setCustomerCreateStatus(error?.message || "Klant aanmaken is mislukt.", "error");
    } finally {
      button.disabled = false;
    }
  }

  async function deleteCustomer(row) {
    const name = row.querySelector("td")?.textContent.trim() || "deze klant";
    if (!confirm(`${name} verwijderen uit dit beheerportaal?`)) return;
    if (window.RoofSignalBackend?.isConfigured && row.dataset.customerId) {
      await window.RoofSignalBackend.deleteOrganization(row.dataset.customerId);
    }
    row.remove();
    syncCustomerOwnedData();
    saveState();
  }

  function setObjectManagerStatus(message, tone = "") {
    if (!objectManagerStatus) return;
    objectManagerStatus.textContent = message;
    objectManagerStatus.dataset.statusTone = tone;
  }

  function propertySearchText(property) {
    return [
      property.name,
      property.address,
      property.postcode,
      property.city,
      property.status,
    ].filter(Boolean).join(" ");
  }

  function refreshCustomerObjectCount(row, objects = activeCustomerObjects) {
    if (!row) return;
    const count = objects.filter((object) => object.status !== "deleted").length;
    const cells = row.querySelectorAll("td");
    if (cells[2]) cells[2].textContent = String(count);
    row.dataset.search = [
      row.textContent,
      objects.map(propertySearchText).join(" "),
    ].filter(Boolean).join(" ");
    filterCustomers();
    saveState();
  }

  function objectEditCard(property) {
    const building = property.building_data || {};
    return [
      `<article class="object-edit-card" data-property-id="${escapeHtml(property.id || "")}">`,
      '<div class="object-edit-fields">',
      `<label>Objectnaam<input data-object-field="name" value="${escapeHtml(property.name || "")}" placeholder="Objectnaam"></label>`,
      `<label>Adres<input data-object-field="address" value="${escapeHtml(property.address || "")}" placeholder="Straat en huisnummer"></label>`,
      `<label>Postcode<input data-object-field="postcode" value="${escapeHtml(property.postcode || "")}" placeholder="7311 AA"></label>`,
      `<label>Plaats<input data-object-field="city" value="${escapeHtml(property.city || "")}" placeholder="Apeldoorn"></label>`,
      `<label>Gebouwtype<input data-object-field="building_type" value="${escapeHtml(building.building_type || "")}" placeholder="Kantoor, bedrijfshal..."></label>`,
      `<label>Bouwjaar<input data-object-field="construction_year" type="number" value="${escapeHtml(building.construction_year || "")}" placeholder="1998"></label>`,
      `<label>Bruto vloeroppervlak (m²)<input data-object-field="gross_floor_area" type="number" step="0.01" value="${escapeHtml(building.gross_floor_area || "")}"></label>`,
      `<label>Dakoppervlak (m²)<input data-object-field="roof_area" type="number" step="0.01" value="${escapeHtml(building.roof_area || "")}"></label>`,
      `<label>Geveloppervlak (m²)<input data-object-field="facade_area" type="number" step="0.01" value="${escapeHtml(building.facade_area || "")}"></label>`,
      '<label>Status<select data-object-field="status">',
      ["active", "concept", "paused"].map((status) => {
        const labels = { active: "Actief", concept: "Concept", paused: "Gepauzeerd" };
        const selected = (property.status || "active") === status ? " selected" : "";
        return `<option value="${status}"${selected}>${labels[status]}</option>`;
      }).join(""),
      '</select></label>',
      '</div>',
      '<div class="object-edit-actions">',
      '<button class="btn ghost-dark" type="button" data-admin-action="save-object">Opslaan</button>',
      '<button class="btn ghost-dark text-danger" type="button" data-admin-action="delete-object">Verwijderen</button>',
      '</div>',
      '</article>',
    ].join("");
  }

  function renderObjectManager(objects) {
    if (!objectEditList) return;
    if (!objects.length) {
      objectEditList.innerHTML = '<div class="empty-state">Deze klant heeft nog geen gekoppelde objecten.</div>';
      return;
    }
    objectEditList.innerHTML = objects.map(objectEditCard).join("");
  }

  async function manageObjects(row) {
    if (!row || row.dataset.emptyRow || !objectManager) return;
    activeObjectCustomerRow = row;
    activeCustomerObjects = [];
    const customerName = customerNameFromRow(row);
    objectManager.hidden = false;
    if (objectManagerTitle) objectManagerTitle.textContent = `Objecten van ${customerName}`;
    setObjectManagerStatus("Objecten ophalen...");
    renderObjectManager([]);
    objectManager.scrollIntoView({ behavior: "smooth", block: "start" });

    if (!window.RoofSignalBackend?.isConfigured || !row.dataset.customerId) {
      setObjectManagerStatus("Deze klantregel heeft geen databasekoppeling. Objecten kunnen pas worden beheerd nadat de klant in Supabase staat.", "error");
      return;
    }

    activeCustomerObjects = await window.RoofSignalBackend.listOrganizationProperties(row.dataset.customerId);
    renderObjectManager(activeCustomerObjects);
    refreshCustomerObjectCount(row, activeCustomerObjects);
    setObjectManagerStatus(activeCustomerObjects.length
      ? `${activeCustomerObjects.length} object${activeCustomerObjects.length === 1 ? "" : "en"} geladen.`
      : "Geen gekoppelde objecten gevonden.",
    activeCustomerObjects.length ? "success" : "");
  }

  function propertyPayloadFromCard(card) {
    const value = (field) => card.querySelector(`[data-object-field="${field}"]`)?.value.trim() || "";
    const number = (field) => value(field) ? Number(value(field)) : null;
    return {
      name: value("name") || "Object",
      address: value("address") || null,
      postcode: value("postcode") || null,
      city: value("city") || null,
      status: value("status") || "active",
      building_data: {
        building_type: value("building_type") || null,
        construction_year: number("construction_year"),
        gross_floor_area: number("gross_floor_area"),
        roof_area: number("roof_area"),
        facade_area: number("facade_area"),
      },
    };
  }

  async function saveObject(card) {
    const id = card?.dataset.propertyId;
    if (!id || !window.RoofSignalBackend?.isConfigured) return;
    const payload = propertyPayloadFromCard(card);
    setObjectManagerStatus("Object wordt opgeslagen...");
    const result = await window.RoofSignalBackend.updateProperty(id, payload);
    if (!result.ok) {
      setObjectManagerStatus(result.error?.message || "Object opslaan is mislukt.", "error");
      return;
    }
    activeCustomerObjects = activeCustomerObjects.map((object) => object.id === id ? result.data : object);
    renderObjectManager(activeCustomerObjects);
    refreshCustomerObjectCount(activeObjectCustomerRow, activeCustomerObjects);
    setObjectManagerStatus(`${payload.name} is opgeslagen.`, "success");
  }

  async function deleteObject(card) {
    const id = card?.dataset.propertyId;
    const name = card?.querySelector('[data-object-field="name"]')?.value.trim() || "dit object";
    if (!id || !window.RoofSignalBackend?.isConfigured) return;
    if (!confirm(`${name} verwijderen bij deze klant?`)) return;
    setObjectManagerStatus("Object wordt verwijderd...");
    const result = await window.RoofSignalBackend.deleteProperty(id);
    if (!result.ok) {
      setObjectManagerStatus(result.error?.message || "Object verwijderen is mislukt.", "error");
      return;
    }
    activeCustomerObjects = activeCustomerObjects.filter((object) => object.id !== id);
    renderObjectManager(activeCustomerObjects);
    refreshCustomerObjectCount(activeObjectCustomerRow, activeCustomerObjects);
    setObjectManagerStatus(`${name} is verwijderd.`, "success");
  }

  function closeObjectManager() {
    if (!objectManager) return;
    objectManager.hidden = true;
    activeObjectCustomerRow = null;
    activeCustomerObjects = [];
  }

  function setPortalNotice(message, tone = "info") {
    const main = document.querySelector(".portal-main");
    if (!main) return;
    let notice = main.querySelector(".portal-action-note");
    if (!notice) {
      notice = document.createElement("div");
      notice.className = "portal-action-note portal-toast";
      const anchor = main.querySelector(".portal-topbar") || main.firstElementChild;
      anchor?.insertAdjacentElement("afterend", notice);
    }
    notice.dataset.statusTone = tone;
    notice.textContent = message;
    notice.hidden = false;
    finishSaveFeedback(tone);
    clearTimeout(portalNoticeTimer);
    portalNoticeTimer = window.setTimeout(() => { notice.hidden = true; }, tone === "error" ? 6000 : 3200);
  }

  function impersonateCustomer(row) {
    const name = row?.querySelector("td")?.textContent.trim() || "Klant";
    localStorage.setItem("roofsignal-current-customer", name);
    if (row?.dataset.customerId) localStorage.setItem("roofsignal-current-customer-id", row.dataset.customerId);
    window.location.href = "portal-klant.html";
  }

  async function signOutPortal() {
    if (window.RoofSignalBackend?.isConfigured) {
      await window.RoofSignalBackend.signOut();
    }
    window.location.href = "portal-login.html";
  }

  function createOffer() {
    if (!quoteForm) return;
    closeWorkflowForms(quoteForm);
    quoteForm.hidden = false;
    const organizationId = activeObjectCustomerRow?.dataset.customerId || "";
    if (organizationId) {
      selectOrganizationInForm(quoteForm, organizationId);
    } else {
      setWorkflowStatus(quoteForm.querySelector("[data-quote-create-status]"), "Selecteer een klant in Klanten beheren, of kies de klant in dit formulier.");
    }
    quoteForm.scrollIntoView({ behavior: "smooth", block: "center" });
    quoteForm.querySelector('[name="organization_id"]')?.focus({ preventScroll: true });
  }

  function selectOrganizationInForm(form, organizationId) {
    const select = form?.querySelector('[name="organization_id"]');
    if (!select) return;
    select.value = organizationId || "";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function closeWorkflowForms(except = null) {
    [inspectionForm, quoteForm, quoteScheduleForm, taskForm].forEach((form) => { if (form && form !== except) form.hidden = true; });
  }

  function dossierItems(title, items, emptyMessage) {
    return `<section><h4>${escapeHtml(title)} <span>${items.length}</span></h4>${items.length ? `<ul>${items.slice(0, 5).map((item) => `<li>${item}</li>`).join("")}</ul>` : `<p>${escapeHtml(emptyMessage)}</p>`}</section>`;
  }

  async function renderCustomerDossier(organizationId) {
    if (!customerDossierOverview) return;
    customerDossierOverview.innerHTML = '<div class="empty-state">Klantdossier laden...</div>';
    const [properties, contacts, activities, maintenance] = await Promise.all([
      window.RoofSignalBackend.listOrganizationProperties(organizationId),
      window.RoofSignalBackend.listOrganizationContacts(organizationId),
      window.RoofSignalBackend.listCustomerActivities(organizationId),
      window.RoofSignalBackend.listMaintenanceActions(organizationId),
    ]);
    const inspections = liveInspections.filter((item) => item.organization_id === organizationId);
    const quotes = liveQuotes.filter((item) => item.organization_id === organizationId);
    const invoices = liveInvoices.filter((item) => item.organization_id === organizationId);
    const appointments = liveAppointments.filter((item) => item.organization_id === organizationId);
    const tasks = liveTasks.filter((item) => item.organization_id === organizationId && !["completed", "cancelled"].includes(item.status));
    const upgrades = liveUpgradeRequests.filter((item) => item.organization_id === organizationId && !["activated", "cancelled"].includes(item.status));
    const reports = liveReports.filter((item) => item.organization_id === organizationId);
    customerDossierOverview.innerHTML = [
      dossierItems("Objecten", properties.map((item) => `<strong>${escapeHtml(item.name)}</strong><small>${escapeHtml([item.address, item.postcode, item.city].filter(Boolean).join(", "))}</small>`), "Geen objecten."),
      dossierItems("Contactpersonen", contacts.map((item) => `<strong>${escapeHtml([item.first_name,item.last_name].filter(Boolean).join(" "))}${item.is_primary ? " · primair" : ""}</strong><small>${escapeHtml([item.email,item.phone,item.job_title].filter(Boolean).join(" · "))}</small>`), "Geen contactpersonen."),
      dossierItems("Offertes", quotes.map((item) => `<strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(formatMoney(item.amount))} · ${escapeHtml(item.status)}</small>`), "Geen offertes."),
      dossierItems("Inspecties & rapporten", inspections.map((item) => `<strong>${escapeHtml(item.properties?.name || "Object")}</strong><small>${escapeHtml(item.scope || "Inspectie")} · ${escapeHtml(item.status)}</small>`).concat(reports.map((item) => `<strong>${escapeHtml(item.title)}</strong><small>Rapport · ${escapeHtml(item.status)}</small>`)), "Geen inspecties of rapporten."),
      dossierItems("Planning", appointments.map((item) => `<strong>${escapeHtml(formatPortalDate(item.starts_at))}</strong><small>${escapeHtml(item.title || "Afspraak")}</small>`), "Niets gepland."),
      dossierItems("Facturen", invoices.map((item) => `<strong>${escapeHtml(formatMoney(item.amount))}</strong><small>${escapeHtml(item.status || "concept")}</small>`), "Geen facturen."),
      dossierItems("Open acties", tasks.map((item) => `<strong>${escapeHtml(item.title)}</strong><small>${escapeHtml([item.priority, item.due_at ? formatPortalDate(item.due_at) : ""].filter(Boolean).join(" · "))}</small>`).concat(upgrades.map((item) => `<strong>Upgrade ${escapeHtml(inspectionDepths[item.requested_depth]?.label || item.requested_depth)}</strong><small>${escapeHtml(item.quote_items?.properties?.name || "Object")} · ${escapeHtml(formatMoney(item.price_ex_vat))} excl. btw</small><button class="inline-button" data-admin-action="activate-upgrade" data-upgrade-id="${escapeHtml(item.id)}" data-quote-item-id="${escapeHtml(item.quote_item_id)}" data-inspection-product="${escapeHtml(item.quote_items?.inspection_product || "object_report")}" data-requested-depth="${escapeHtml(item.requested_depth)}">Betaling registreren en activeren</button>`)), "Geen open acties."),
      dossierItems("Onderhoud", maintenance.map((item) => `<strong>${escapeHtml(item.title)}</strong><small>${escapeHtml([item.properties?.name,item.priority,item.status].filter(Boolean).join(" · "))}</small>${!["completed","verified","cancelled"].includes(item.status) ? `<button class="inline-button" data-admin-action="complete-maintenance" data-maintenance-id="${escapeHtml(item.id)}">Herstel voltooid</button>` : item.status === "completed" ? `<button class="inline-button" data-admin-action="verify-maintenance" data-maintenance-id="${escapeHtml(item.id)}" data-property-id="${escapeHtml(item.property_id)}" data-maintenance-title="${escapeHtml(item.title)}">Herinspectie aanmaken</button>` : ""}`), "Geen onderhoudsacties."),
      dossierItems("Activiteiten", activities.map((item) => `<strong>${escapeHtml(item.subject)}</strong><small>${escapeHtml([item.activity_type,formatPortalDate(item.occurred_at)].join(" · "))}</small>`), "Geen activiteiten."),
    ].join("");
  }

  async function submitContact(event) {
    event.preventDefault(); const organizationId = activeObjectCustomerRow?.dataset.customerId; if (!organizationId) return;
    const data = new FormData(contactCreateForm);
    const result = await window.RoofSignalBackend.createOrganizationContact({ organization_id: organizationId, first_name: String(data.get("first_name") || "").trim(), last_name: String(data.get("last_name") || "").trim() || null, email: String(data.get("email") || "").trim() || null, phone: String(data.get("phone") || "").trim() || null, is_primary: data.get("is_primary") === "on" });
    if (!result.ok) return setPortalNotice(result.error?.message || "Contact opslaan is mislukt.", "error");
    contactCreateForm.reset(); await renderCustomerDossier(organizationId); setPortalNotice("Contactpersoon is toegevoegd.", "success");
  }

  async function submitActivity(event) {
    event.preventDefault(); const organizationId = activeObjectCustomerRow?.dataset.customerId; if (!organizationId) return;
    const data = new FormData(activityCreateForm);
    const result = await window.RoofSignalBackend.createCustomerActivity({ organization_id: organizationId, activity_type: data.get("activity_type"), subject: String(data.get("subject") || "").trim(), body: String(data.get("body") || "").trim() || null });
    if (!result.ok) return setPortalNotice(result.error?.message || "Activiteit opslaan is mislukt.", "error");
    activityCreateForm.reset(); await renderCustomerDossier(organizationId); setPortalNotice("Activiteit is vastgelegd.", "success");
  }

  async function openCustomer(row) {
    if (!row?.dataset.customerId || !customerWorkspace) return;
    activeObjectCustomerRow = row;
    customerWorkspace.hidden = false;
    if (customerWorkspaceTitle) customerWorkspaceTitle.textContent = customerNameFromRow(row);
    closeWorkflowForms();
    try {
      await renderCustomerDossier(row.dataset.customerId);
    } catch (error) {
      customerDossierOverview.innerHTML = '<div class="empty-state">Het klantdossier kon niet volledig worden geladen.</div>';
      setPortalNotice(error?.message || "Klantdossier laden is mislukt.", "error");
    }
    customerWorkspace.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function openCustomerWorkflow(type) {
    const organizationId = activeObjectCustomerRow?.dataset.customerId;
    if (!organizationId) return setPortalNotice("Selecteer eerst een klant.", "error");
    if (type === "objects") return manageObjects(activeObjectCustomerRow);
    const target = { inspection: inspectionForm, quote: quoteForm, task: taskForm }[type];
    if (!target) return;
    closeWorkflowForms(target);
    target.hidden = false;
    selectOrganizationInForm(target, organizationId);
    if (type === "quote") {
      setWorkflowStatus(target.querySelector("[data-quote-create-status]"), "Klant geselecteerd. Kies minimaal één object en vul de offertegegevens in.");
    }
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    target.querySelector("input:not([type='hidden']), select")?.focus();
  }

  function createSupportTask() {
    taskForm?.scrollIntoView({ behavior: "smooth", block: "center" });
    taskForm?.querySelector('[name="organization_id"]')?.focus();
  }

  function setWorkflowStatus(element, message, tone = "") {
    if (!element) return;
    element.textContent = message;
    element.dataset.statusTone = tone;
    finishSaveFeedback(tone);
  }

  function finishSaveFeedback(tone) {
    const button = activeSaveButton;
    if (!button || tone !== "success") {
      if (tone === "error") activeSaveButton = null;
      return;
    }
    activeSaveButton = null;
    const original = button.dataset.saveLabel || button.textContent;
    button.dataset.saveLabel = original;
    button.textContent = "✓ Opgeslagen";
    button.classList.add("save-confirmed");
    window.setTimeout(() => {
      button.textContent = original;
      button.classList.remove("save-confirmed");
    }, 1800);
  }

  async function loadQuoteObjects(organizationId) {
    const list = quoteForm?.querySelector("[data-quote-object-list]");
    if (!list) return;
    const properties = organizationId ? await window.RoofSignalBackend.listOrganizationProperties(organizationId) : [];
    const products = '<option value="quickscan">Quickscan</option><option value="object_report" selected>Objectrapportage</option><option value="portfolio_scan">Portefeuillescan</option>';
    const depths = '<option value="basis">Basis · €395</option><option value="plus">Plus · €595</option><option value="premium">Premium · €995</option>';
    list.innerHTML = properties.length ? properties.map((property) => `<article class="quote-object-row" data-quote-property="${escapeHtml(property.id)}"><label class="quote-object-select"><input type="checkbox" name="selected_property" value="${escapeHtml(property.id)}"><span><strong>${escapeHtml(property.name)}</strong><small>${escapeHtml([property.address, property.postcode, property.city].filter(Boolean).join(", "))}</small></span></label><label>Variant<select data-quote-item-field="inspection_product">${products}</select></label><label>Diepte<select data-quote-item-field="inspection_depth">${depths}</select></label><label>Scope<input data-quote-item-field="scope" placeholder="Aanvullende onderzoeksvraag"></label><label>Bedrag excl. btw<input data-quote-item-field="amount" type="number" min="0" step="0.01" value="395"></label><p class="quote-depth-summary" data-quote-depth-summary>Basis · dak, gevels, 20-40 bewijsfoto's en aandachtspunten.</p></article>`).join("") : '<div class="empty-state">Deze klant heeft nog geen objecten. Voeg eerst een object toe.</div>';
  }

  async function submitQuote(event) {
    event.preventDefault();
    const data = new FormData(quoteForm);
    const status = quoteForm.querySelector("[data-quote-create-status]");
    const selectedRows = [...quoteForm.querySelectorAll("[data-quote-property]")].filter((row) => row.querySelector('[name="selected_property"]').checked);
    if (!selectedRows.length) return setWorkflowStatus(status, "Selecteer minimaal één object.", "error");
    const itemValues = selectedRows.map((row) => { const inspection_product = row.querySelector('[data-quote-item-field="inspection_product"]').value; const inspection_depth = row.querySelector('[data-quote-item-field="inspection_depth"]').value; return { property_id: row.dataset.quoteProperty, inspection_product, inspection_depth, scope: row.querySelector('[data-quote-item-field="scope"]').value.trim() || null, amount: Number(row.querySelector('[data-quote-item-field="amount"]').value || 0), scope_snapshot: depthSnapshot(inspection_product, inspection_depth) }; });
    if (itemValues.some((item) => item.amount <= 0)) return setWorkflowStatus(status, "Vul voor ieder geselecteerd object een bedrag in.", "error");
    const total = itemValues.reduce((sum, item) => sum + item.amount, 0);
    const result = await window.RoofSignalBackend.createQuote({ organization_id: data.get("organization_id"), title: String(data.get("title") || "").trim(), amount: total, status: "draft", valid_until: data.get("valid_until") });
    if (!result.ok) return setWorkflowStatus(status, result.error?.message || "Offerte opslaan is mislukt.", "error");
    const items = await window.RoofSignalBackend.createQuoteItems(itemValues.map((item) => ({ ...item, quote_id: result.data.id, organization_id: data.get("organization_id") })));
    if (!items.ok) return setWorkflowStatus(status, items.error?.message || "Objectregels opslaan is mislukt.", "error");
    await window.RoofSignalBackend.createQuoteVersion({ quote_id: result.data.id, version: 1, status: "draft", snapshot: { quote: result.data, items: items.data } });
    const quoteFile = quoteForm.elements.quote_file.files?.[0];
    if (quoteFile) {
      const firstProperty = itemValues[0]?.property_id || null;
      const uploaded = await window.RoofSignalBackend.uploadPortalDocument(quoteFile, {
        organization_id: data.get("organization_id"),
        property_id: firstProperty,
        quote_id: result.data.id,
        document_type: "quote",
        title: quoteFile.name,
        version: 1,
        customer_visible: true,
        required_depth: "basis",
        metadata: { quote_number: result.data.quote_number, source: "quote_workflow" },
      });
      if (!uploaded.ok) return setWorkflowStatus(status, uploaded.error?.message || "Offerte is opgeslagen, maar de PDF-upload is mislukt.", "error");
    }
    quoteForm.reset(); await loadQuoteObjects("");
    setWorkflowStatus(status, `Conceptofferte met ${itemValues.length} object${itemValues.length === 1 ? "" : "en"} is opgeslagen.`, "success");
    await loadLiveAdminData();
  }

  async function acceptQuote(id) {
    const quote = liveQuotes.find((item) => item.id === id);
    const items = liveQuoteItems.filter((item) => item.quote_id === id);
    const result = await window.RoofSignalBackend.updateQuote(id, { status: "accepted" });
    if (!result.ok) return setPortalNotice(result.error?.message || "Offerte bijwerken is mislukt.", "error");
    const acceptedAt = new Date().toISOString();
    const version = await window.RoofSignalBackend.createQuoteVersion({ quote_id: id, version: 3, status: "accepted", accepted_at: acceptedAt, snapshot: { quote: { ...quote, status: "accepted" }, items } });
    await window.RoofSignalBackend.createOrderConfirmation({ organization_id: quote.organization_id, quote_id: id, quote_version_id: version.data?.id || null, status: "confirmed", confirmed_at: acceptedAt });
    setPortalNotice("Akkoord is geregistreerd. De inspectiedatum kan nu worden gepland.", "success");
    await loadLiveAdminData();
  }

  async function sendQuote(id) {
    const quote = liveQuotes.find((item) => item.id === id); if (!quote) return;
    setPortalNotice("Offerte en akkoordlink worden verzonden…");
    const result = await window.RoofSignalBackend.sendQuoteEmail(id);
    if (!result.ok) return setPortalNotice(result.error?.message || "Offerte verzenden is mislukt.", "error");
    setPortalNotice(`Offerte is verzonden naar ${result.data.recipient}. Akkoord wordt automatisch teruggekoppeld.`, "success");
    await loadLiveAdminData();
  }

  async function sendQuoteCustom(id) {
    const quote = liveQuotes.find((item) => item.id === id); if (!quote) return;
    const recipient = window.prompt("Ontvanger", quote.organizations?.contact_email || "");
    if (!recipient) return;
    const ccRecipient = window.prompt("Cc (optioneel)", "");
    setPortalNotice("Offerte en akkoordlink worden verzonden…");
    const result = await window.RoofSignalBackend.sendQuoteEmail(id, "", {
      recipientOverride: recipient.trim(),
      ccRecipient: String(ccRecipient || "").trim(),
    });
    if (!result.ok) return setPortalNotice(result.error?.message || "Offerte verzenden is mislukt.", "error");
    setPortalNotice(`Offerte is verzonden naar ${result.data.recipient}${result.data.ccRecipient ? ` met cc aan ${result.data.ccRecipient}` : ""}.`, "success");
    await loadLiveAdminData();
  }

  async function editSentQuote(id) {
    const quote = liveQuotes.find((item) => item.id === id); if (!quote) return;
    const amountInput = window.prompt("Nieuw bedrag excl. btw", Number(quote.amount || 0).toFixed(2));
    if (amountInput === null) return;
    const amount = Number(String(amountInput).replace(",", "."));
    if (!Number.isFinite(amount) || amount <= 0) return setPortalNotice("Vul een geldig bedrag excl. btw in.", "error");

    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "application/pdf,.pdf";
    fileInput.hidden = true;
    document.body.append(fileInput);
    fileInput.addEventListener("change", async () => {
      const file = fileInput.files?.[0];
      fileInput.remove();
      if (!file) return;
      setPortalNotice("Offertebedrag en PDF worden bijgewerkt…");
      const updated = await window.RoofSignalBackend.updateQuote(id, { amount });
      if (!updated.ok) return setPortalNotice(updated.error?.message || "Offertebedrag bijwerken is mislukt.", "error");
      const items = liveQuoteItems.filter((item) => item.quote_id === id);
      const firstItem = items[0] || {};
      if (items.length === 1) {
        const updatedItem = await window.RoofSignalBackend.updateQuoteItem(firstItem.id, { amount });
        if (!updatedItem.ok) return setPortalNotice(updatedItem.error?.message || "Offertebedrag is bijgewerkt, maar de objectregel niet.", "error");
        firstItem.amount = amount;
      }
      const uploaded = await window.RoofSignalBackend.uploadPortalDocument(file, {
        organization_id: quote.organization_id,
        property_id: firstItem.property_id || null,
        quote_id: id,
        document_type: "quote",
        title: file.name,
        version: 2,
        customer_visible: true,
        required_depth: "basis",
        metadata: { quote_number: quote.quote_number, source: "quote_revision" },
      });
      if (!uploaded.ok) return setPortalNotice(uploaded.error?.message || "Bedrag is bijgewerkt, maar de PDF-upload is mislukt.", "error");
      await window.RoofSignalBackend.createQuoteVersion({ quote_id: id, version: 2, status: quote.status, snapshot: { quote: { ...quote, amount }, items } });
      setPortalNotice("Offertebedrag en nieuwe PDF zijn bijgewerkt.", "success");
      await loadLiveAdminData();
    }, { once: true });
    fileInput.click();
  }

  async function syncQuoteItems(id) {
    const quote = liveQuotes.find((item) => item.id === id); if (!quote) return;
    const items = liveQuoteItems.filter((item) => item.quote_id === id);
    if (items.length !== 1) return setPortalNotice("Automatisch synchroniseren kan alleen bij een offerte met één objectregel.", "error");
    const result = await window.RoofSignalBackend.updateQuoteItem(items[0].id, { amount: Number(quote.amount || 0) });
    if (!result.ok) return setPortalNotice(result.error?.message || "Objectregel synchroniseren is mislukt.", "error");
    setPortalNotice("Objectregel is gelijkgezet aan het offertetotaal.", "success");
    await loadLiveAdminData();
  }

  function openQuoteSchedule(id) {
    activeQuote = liveQuotes.find((quote) => quote.id === id) || null;
    if (!activeQuote || !quoteScheduleForm) return;
    closeWorkflowForms(quoteScheduleForm);
    quoteScheduleForm.hidden = false;
    const select = quoteScheduleForm.querySelector('[name="quote_item_id"]');
    const unscheduled = liveQuoteItems.filter((item) => item.quote_id === id && !liveInspections.some((inspection) => inspection.quote_item_id === item.id));
    select.innerHTML = '<option value="">Selecteer object</option>' + unscheduled.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.properties?.name || "Object")} · ${escapeHtml(productLabel(item.inspection_product))} · ${escapeHtml(inspectionDepths[item.inspection_depth]?.label || "Basis")}</option>`).join("");
    const inspectorSelect = quoteScheduleForm.querySelector('[name="inspector_id"]');
    const inspectors = liveProfiles.filter((profile) => (profile.roles || [profile.role]).some((role) => ["inspector", "planning", "owner_admin"].includes(role)));
    inspectorSelect.innerHTML = '<option value="">Selecteer inspecteur</option>' + inspectors.map((profile) => `<option value="${escapeHtml(profile.id)}">${escapeHtml(profile.full_name || profile.email)} · ${escapeHtml(roleLabels[profile.role] || profile.role)}</option>`).join("");
    if (quoteScheduleTitle) quoteScheduleTitle.textContent = `${activeQuote.organizations?.name || "Klant"} · inspectie plannen`;
    quoteScheduleForm.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function submitQuoteSchedule(event) {
    event.preventDefault(); if (!activeQuote) return;
    const data = new FormData(quoteScheduleForm);
    const startsAt = new Date(String(data.get("starts_at")));
    const endsAt = new Date(startsAt.getTime() + Number(data.get("duration_hours") || 2) * 3600000);
    const status = quoteScheduleForm.querySelector("[data-quote-schedule-status]");
    const quoteItem = liveQuoteItems.find((item) => item.id === data.get("quote_item_id"));
    if (!quoteItem) return setWorkflowStatus(status, "Selecteer een object uit de offerte.", "error");
    const depthLabel = inspectionDepths[quoteItem.inspection_depth]?.label || "Basis";
    const appointment = await window.RoofSignalBackend.createAppointment({ organization_id: activeQuote.organization_id, property_id: quoteItem.property_id, quote_id: activeQuote.id, quote_item_id: quoteItem.id, inspector_id: data.get("inspector_id"), title: `${productLabel(quoteItem.inspection_product)} ${depthLabel} · ${quoteItem.properties?.name || "Object"}`, starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString(), status: "planned" });
    if (!appointment.ok) return setWorkflowStatus(status, appointment.error?.message || "Planning opslaan is mislukt.", "error");
    const inspection = await window.RoofSignalBackend.createInspection({ organization_id: activeQuote.organization_id, property_id: quoteItem.property_id, quote_id: activeQuote.id, quote_item_id: quoteItem.id, appointment_id: appointment.data.id, inspection_product: quoteItem.inspection_product, inspection_depth: quoteItem.inspection_depth, scope: quoteItem.scope || null, scheduled_at: startsAt.toISOString(), status: "planned" });
    if (!inspection.ok) return setWorkflowStatus(status, inspection.error?.message || "Inspectie aanmaken is mislukt.", "error");
    const notification = await window.RoofSignalBackend.sendAppointmentEmail(appointment.data.id);
    if (!notification.ok) setPortalNotice("Afspraak is gepland, maar de bevestigingsmail kon niet worden verzonden.", "error");
    quoteScheduleForm.reset(); quoteScheduleForm.hidden = true;
    setPortalNotice("De datum is gepland en de inspectie is aangemaakt.", "success");
    await loadLiveAdminData();
  }

  async function createCalendarFeed(profileId) {
    const result = await window.RoofSignalBackend.createStaffCalendarFeed(profileId);
    if (!result.ok) return setPortalNotice(result.error?.message || "Agenda-abonnement aanmaken is mislukt.", "error");
    const url = result.data.webcalUrl || result.data.feedUrl;
    let dialog = document.querySelector("[data-calendar-feed-dialog]");
    if (!dialog) { dialog = document.createElement("dialog"); dialog.className = "portal-dialog"; dialog.dataset.calendarFeedDialog = "true"; document.body.append(dialog); }
    dialog.innerHTML = `<div class="portal-dialog-card admin-record-card"><div class="panel-head"><div><span class="eyebrow orange">Persoonlijke agenda</span><h2>Agenda-abonnement</h2></div><button class="dialog-close" type="button" data-dialog-close aria-label="Sluiten">×</button></div><p>Open de link om de RoofSignal-planning als abonnement aan Apple Agenda, Outlook of een andere agenda toe te voegen.</p><label>Abonnementslink<input type="text" readonly value="${escapeHtml(url)}" data-calendar-feed-url></label><div class="dialog-actions"><a class="btn" href="${escapeHtml(url)}">Open agenda-abonnement</a><button class="btn ghost-dark" type="button" data-admin-action="copy-calendar-feed">Link kopiëren</button><button class="btn ghost-dark" type="button" data-dialog-close>Sluiten</button></div></div>`;
    dialog.showModal();
    setPortalNotice("Het persoonlijke agenda-abonnement staat klaar.", "success");
  }

  async function copyCalendarFeed() {
    const input = document.querySelector("[data-calendar-feed-url]"); if (!input) return;
    try { await navigator.clipboard.writeText(input.value); setPortalNotice("Agenda-abonnementslink is gekopieerd.", "success"); }
    catch (_error) { input.focus(); input.select(); setPortalNotice("De link is geselecteerd. Kopieer met Cmd+C of Ctrl+C.", "info"); }
  }

  async function invoiceQuote(id) {
    const quote = liveQuotes.find((item) => item.id === id);
    const inspections = liveInspections.filter((item) => item.quote_id === id);
    const existingInvoice = liveInvoices.find((item) => item.quote_id === id);
    if (!quote || quote.status !== "accepted" || !inspections.length) return setPortalNotice("Een conceptfactuur kan pas worden aangemaakt na offerteakkoord en zodra de inspectie is gekoppeld.", "error");
    if (existingInvoice) return setPortalNotice(`Er bestaat al een factuur voor deze offerte: ${existingInvoice.invoice_number || "conceptfactuur"}.`, "info");
    const due = new Date(); due.setDate(due.getDate() + 14);
    const firstInspection = inspections[0];
    const firstQuoteItem = liveQuoteItems.find((item) => item.quote_id === id);
    const result = await window.RoofSignalBackend.createInvoice({ organization_id: quote.organization_id, quote_id: quote.id, property_id: firstQuoteItem?.property_id || null, inspection_id: firstInspection.id, amount: quote.amount, status: "draft", due_date: due.toISOString().slice(0, 10) });
    if (!result.ok) return setPortalNotice(result.error?.message || "Factuur aanmaken is mislukt.", "error");
    const quoteItems = liveQuoteItems.filter((item) => item.quote_id === id);
    await window.RoofSignalBackend.createInvoiceLines(quoteItems.map((item) => ({ invoice_id: result.data.id, description: `${productLabel(item.inspection_product)} ${inspectionDepths[item.inspection_depth]?.label || "Basis"} · ${item.properties?.name || "Object"}`, quantity: 1, unit_price: item.amount, vat_rate: 21 })));
    await window.RoofSignalBackend.createInvoiceEvent({ invoice_id: result.data.id, organization_id: quote.organization_id, event_type: "created", amount: quote.amount });
    setPortalNotice("Conceptfactuur is aangemaakt vanuit de geaccordeerde offerte. Controleer de factuur voordat u deze verstuurt.", "success");
    await loadLiveAdminData();
  }

  async function submitTask(event) {
    event.preventDefault();
    const data = new FormData(taskForm);
    const result = await window.RoofSignalBackend.createTask({ organization_id: data.get("organization_id"), title: String(data.get("title") || "").trim(), priority: data.get("priority"), due_at: data.get("due_at") ? new Date(String(data.get("due_at"))).toISOString() : null, task_type: "support", status: "open", created_by: portalAccess?.profile?.id || null });
    const status = taskForm.querySelector("[data-task-create-status]");
    if (!result.ok) return setWorkflowStatus(status, result.error?.message || "Taak opslaan is mislukt.", "error");
    taskForm.reset(); setWorkflowStatus(status, "Interne taak is opgeslagen.", "success");
    renderTasks(await window.RoofSignalBackend.listTasks());
  }

  function renderFindings(findings = []) {
    if (!findingList) return;
    findingList.innerHTML = findings.length ? findings.map((finding) => `<article><strong>${escapeHtml(finding.title)}</strong><span>${escapeHtml([finding.building_element, finding.priority, finding.required_depth ? `vanaf ${inspectionDepths[finding.required_depth]?.label}` : ""].filter(Boolean).join(" · "))}</span><p>${escapeHtml(finding.recommendation || finding.description || "")}</p><button class="inline-button" type="button" data-admin-action="finding-to-maintenance" data-finding-id="${escapeHtml(finding.id)}" data-finding-title="${escapeHtml(finding.title)}" data-finding-priority="${escapeHtml(finding.priority || "normal")}">Maak onderhoudsactie</button></article>`).join("") : '<div class="empty-state">Nog geen bevindingen vastgelegd.</div>';
  }

  async function findingToMaintenance(target) {
    if (!activeInspection) return;
    const result = await window.RoofSignalBackend.createMaintenanceAction({ organization_id: activeInspection.organization_id, property_id: activeInspection.property_id, inspection_id: activeInspection.id, finding_id: target.dataset.findingId, title: target.dataset.findingTitle, priority: target.dataset.findingPriority || "normal", status: "open" });
    if (!result.ok) return setPortalNotice(result.error?.message || "Onderhoudsactie aanmaken is mislukt.", "error");
    setPortalNotice("Bevinding is als onderhoudsactie toegevoegd aan het objectdossier.", "success");
  }

  async function completeMaintenance(target) {
    const result = await window.RoofSignalBackend.updateMaintenanceAction(target.dataset.maintenanceId, { status: "completed", completed_at: new Date().toISOString() });
    if (!result.ok) return setPortalNotice(result.error?.message || "Onderhoud bijwerken is mislukt.", "error");
    await renderCustomerDossier(activeObjectCustomerRow.dataset.customerId); setPortalNotice("Herstel is als voltooid geregistreerd.", "success");
  }

  async function verifyMaintenance(target) {
    const organizationId = activeObjectCustomerRow?.dataset.customerId; if (!organizationId) return;
    const inspection = await window.RoofSignalBackend.createInspection({ organization_id: organizationId, property_id: target.dataset.propertyId, scope: `Herinspectie herstel · ${target.dataset.maintenanceTitle}`, status: "intake" });
    if (!inspection.ok) return setPortalNotice(inspection.error?.message || "Herinspectie aanmaken is mislukt.", "error");
    await window.RoofSignalBackend.updateMaintenanceAction(target.dataset.maintenanceId, { verification_inspection_id: inspection.data.id });
    setPortalNotice("Herinspectie is aangemaakt en aan de onderhoudsactie gekoppeld.", "success"); await loadLiveAdminData();
  }

  function depthRank(depth) { return { basis: 1, plus: 2, premium: 3 }[depth] || 1; }

  function entitledChecklistRows(depth = "basis") {
    return Object.entries(inspectionDepths).filter(([candidate]) => depthRank(candidate) <= depthRank(depth)).flatMap(([candidate, definition]) => Object.entries(definition.coverage).flatMap(([element, checkpoints]) => checkpoints.map((checkpoint) => ({ building_element: element, checkpoint, required_depth: candidate }))));
  }

  function renderInspectionChecklist(items = []) {
    if (!inspectionChecklist) return;
    const complete = items.filter((item) => ["observed","not_observed","not_applicable"].includes(item.status)).length;
    inspectionChecklist.innerHTML = `<div class="checklist-head"><strong>Offertescope · ${escapeHtml(inspectionDepths[activeInspection?.inspection_depth]?.label || "Basis")}</strong><span>${complete}/${items.length} controlepunten afgerond</span></div>${items.map((item) => `<label><span><strong>${escapeHtml(item.building_element)}</strong><small>${escapeHtml(item.checkpoint)} · onderdeel van ${escapeHtml(inspectionDepths[item.required_depth]?.label || item.required_depth)}</small></span><select data-checklist-item="${escapeHtml(item.id)}"><option value="pending"${item.status === "pending" ? " selected" : ""}>Nog controleren</option><option value="observed"${item.status === "observed" ? " selected" : ""}>Bevinding</option><option value="not_observed"${item.status === "not_observed" ? " selected" : ""}>Geen gebrek</option><option value="not_applicable"${item.status === "not_applicable" ? " selected" : ""}>Niet van toepassing</option><option value="blocked"${item.status === "blocked" ? " selected" : ""}>Niet bereikbaar</option></select></label>`).join("")}`;
  }

  function renderInspectionMedia(items = []) {
    if (!inspectionMediaList) return;
    inspectionMediaList.innerHTML = items.length ? items.map((item) => `<article><strong>${escapeHtml(item.file_name)}</strong><span>${escapeHtml(item.media_type)} · zichtbaar vanaf ${escapeHtml(inspectionDepths[item.required_depth]?.label || item.required_depth)} · ${escapeHtml(Math.round(Number(item.byte_size || 0) / 1024))} kB</span></article>`).join("") : '<div class="empty-state">Nog geen inspectiemedia geüpload.</div>';
  }

  async function openInspection(id) {
    activeInspection = liveInspections.find((inspection) => inspection.id === id);
    if (!activeInspection || !inspectionWorkspace) return;
    inspectionWorkspace.hidden = false;
    if (inspectionWorkspaceTitle) inspectionWorkspaceTitle.textContent = `${activeInspection.reference || "Inspectie"} · ${activeInspection.properties?.name || "Object"}`;
    const quote = liveQuotes.find((item) => item.id === activeInspection.quote_id);
    const quoteItem = liveQuoteItems.find((item) => item.id === activeInspection.quote_item_id);
    const depth = quoteItem?.inspection_depth || activeInspection.inspection_depth || "basis";
    activeInspection = { ...activeInspection, inspection_product: quoteItem?.inspection_product || activeInspection.inspection_product, inspection_depth: depth, scope: quoteItem?.scope || activeInspection.scope };
    if (inspectionCommercialScope) inspectionCommercialScope.innerHTML = quote?.status === "accepted" && quoteItem ? `<strong>Geaccordeerde opdracht</strong><span>${escapeHtml(productLabel(quoteItem.inspection_product))} · ${escapeHtml(inspectionDepths[depth]?.label || depth)}</span><small>Offerte ${escapeHtml(quote.quote_number || quote.title)}${quote.accepted_at ? ` · akkoord op ${escapeHtml(formatPortalDate(quote.accepted_at))}` : ""}${quoteItem.scope ? `<br>Aanvullende scope: ${escapeHtml(quoteItem.scope)}` : ""}</small>` : `<strong>Publicatie geblokkeerd</strong><span>Geen geaccordeerde offertescope gevonden</span><small>Koppel deze inspectie eerst aan de juiste geaccordeerde offerte en objectregel.</small>`;
    [findingForm, mediaUploadForm].forEach((form) => { const select = form?.elements.required_depth; if (select) [...select.options].forEach((option) => { option.hidden = depthRank(option.value) > depthRank(depth); option.disabled = option.hidden; }); if (select && depthRank(select.value) > depthRank(depth)) select.value = depth; });
    inspectionStatusForm.elements.status.value = activeInspection.status || "intake";
    inspectionStatusForm.elements.summary.value = activeInspection.summary || "";
    renderFindings(await window.RoofSignalBackend.listFindings(id));
    let checklist = await window.RoofSignalBackend.listInspectionChecklist(id);
    if (!checklist.length) {
      const created = await window.RoofSignalBackend.createInspectionChecklist(entitledChecklistRows(depth).map((item) => ({ ...item, inspection_id: activeInspection.id, organization_id: activeInspection.organization_id, property_id: activeInspection.property_id })));
      checklist = created.ok ? created.data : [];
    }
    renderInspectionChecklist(checklist.filter((item) => depthRank(item.required_depth) <= depthRank(depth)));
    renderInspectionMedia(await window.RoofSignalBackend.listInspectionMedia(id));
    inspectionWorkspace.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function submitInspectionStatus(event) {
    event.preventDefault(); if (!activeInspection) return;
    const data = new FormData(inspectionStatusForm);
    const result = await window.RoofSignalBackend.updateInspection(activeInspection.id, { status: data.get("status"), summary: String(data.get("summary") || "").trim() || null });
    if (!result.ok) return setWorkflowStatus(inspectionWorkspaceStatus, result.error?.message || "Inspectie bijwerken is mislukt.", "error");
    setWorkflowStatus(inspectionWorkspaceStatus, "Inspectie is bijgewerkt.", "success");
    renderInspections(await window.RoofSignalBackend.listInspections()); activeInspection = result.data;
  }

  async function submitFinding(event) {
    event.preventDefault(); if (!activeInspection) return;
    const data = new FormData(findingForm);
    const result = await window.RoofSignalBackend.createFinding({ organization_id: activeInspection.organization_id, property_id: activeInspection.property_id, inspection_id: activeInspection.id, title: String(data.get("title") || "").trim(), building_element: String(data.get("building_element") || "").trim() || null, priority: data.get("priority"), required_depth: data.get("required_depth") || "basis", condition_score: data.get("condition_score") ? Number(data.get("condition_score")) : null, recommendation: String(data.get("recommendation") || "").trim() || null, source: "manual" });
    if (!result.ok) return setWorkflowStatus(inspectionWorkspaceStatus, result.error?.message || "Bevinding opslaan is mislukt.", "error");
    findingForm.reset(); renderFindings(await window.RoofSignalBackend.listFindings(activeInspection.id));
    setWorkflowStatus(inspectionWorkspaceStatus, "Bevinding is vastgelegd.", "success");
  }

  async function submitReport(event) {
    event.preventDefault(); if (!activeInspection) return;
    const quote = liveQuotes.find((item) => item.id === activeInspection.quote_id);
    const quoteItem = liveQuoteItems.find((item) => item.id === activeInspection.quote_item_id);
    if (!quoteItem || quote?.status !== "accepted") return setWorkflowStatus(inspectionWorkspaceStatus, "Rapport kan niet worden gepubliceerd zonder gekoppelde geaccordeerde offerte.", "error");
    const checklist = await window.RoofSignalBackend.listInspectionChecklist(activeInspection.id);
    const relevant = checklist.filter((item) => depthRank(item.required_depth) <= depthRank(quoteItem.inspection_depth));
    const incomplete = relevant.filter((item) => ["pending","blocked"].includes(item.status));
    if (!relevant.length || incomplete.length) return setWorkflowStatus(inspectionWorkspaceStatus, `Rapport kan nog niet worden gepubliceerd: ${incomplete.length || "de checklist"} controlepunt${incomplete.length === 1 ? "" : "en"} binnen de offertescope is niet afgerond.`, "error");
    const data = new FormData(reportForm);
    const reportFile = data.get("report_file");
    let reportUrl = null;
    if (reportFile?.size) {
      const uploaded = await window.RoofSignalBackend.uploadPortalDocument(reportFile, { organization_id: activeInspection.organization_id, property_id: activeInspection.property_id, inspection_id: activeInspection.id, document_type: "inspection_report", title: String(data.get("title") || "").trim(), customer_visible: false, required_depth: quoteItem.inspection_depth });
      if (!uploaded.ok) return setWorkflowStatus(inspectionWorkspaceStatus, uploaded.error?.message || "Rapportbestand uploaden is mislukt.", "error");
      reportUrl = null;
    }
    const result = await window.RoofSignalBackend.publishInspectionReport(activeInspection.id, String(data.get("title") || "").trim(), inspectionStatusForm.elements.summary.value.trim() || null);
    if (!result.ok) return setWorkflowStatus(inspectionWorkspaceStatus, result.error?.message || "Rapport publiceren is mislukt.", "error");
    reportForm.reset(); setWorkflowStatus(inspectionWorkspaceStatus, "Rapport is gepubliceerd in het klantenportaal.", "success");
    await loadLiveAdminData();
  }

  function setAiAnswer(title, body) {
    const answer = document.querySelector(".ai-answer");
    if (!answer) return;
    answer.innerHTML = `<strong>${escapeHtml(title)}</strong><p>${escapeHtml(body)}</p>`;
    document.querySelector("#ai")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function addPlanningItem(label, title, body) {
    const planningList = document.querySelector("#planning .timeline-list");
    if (!planningList) return;
    const item = document.createElement("div");
    item.innerHTML = `<span>${escapeHtml(label)}</span><strong>${escapeHtml(title)}</strong><p>${escapeHtml(body)}</p>`;
    planningList.prepend(item);
    setPortalNotice(`${title} is toegevoegd aan de inspectieplanning.`, "success");
    document.querySelector("#planning")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function addObject() {
    const objectList = document.querySelector(".object-list");
    if (!objectList) return;
    const name = prompt("Objectnaam", "Nieuw object")?.trim();
    if (!name) return;
    const scope = prompt("Korte omschrijving", "Objectconcept voor toekomstige opname en onderhoudshistorie.")?.trim();
    if (!scope) return;

    const card = document.createElement("article");
    card.className = "object-card locked";
    card.innerHTML = `<div><span class="status-pill demo">Concept</span><h3>${escapeHtml(name)}</h3><p>${escapeHtml(scope)}</p></div><dl><div><dt>Status</dt><dd>Objectconcept</dd></div><div><dt>Data</dt><dd>Basisgegevens</dd></div></dl>`;
    objectList.append(card);
    setPortalNotice(`${name} is toegevoegd als objectconcept.`, "success");
    document.querySelector("#objecten")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function unlockModules() {
    const entitlements = document.querySelectorAll(".entitlement-list div");
    entitlements.forEach((item) => {
      const label = item.querySelector("strong")?.textContent.trim();
      const status = item.querySelector(".status-dot");
      if (status && ["Thermal", "3D-model", "AI MJOP-input"].includes(label)) {
        status.className = "status-dot green";
        status.textContent = "Ontgrendeld";
      }
    });
    setPortalNotice("Thermal, 3D-model en AI MJOP-input zijn in deze portalsessie ontgrendeld.", "success");
    document.querySelector("#media")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function prepareAccountantExport() {
    const exportGrid = document.querySelector("#accountant-export .export-grid");
    if (!exportGrid) return;
    const existing = exportGrid.querySelector("[data-export-status]");
    if (existing) existing.remove();
    const item = document.createElement("article");
    item.dataset.exportStatus = "ready";
    item.innerHTML = "<strong>Exportstatus</strong><span>Concept-export voor kwartaal en boekjaar staat klaar voor controle.</span>";
    exportGrid.prepend(item);
    setPortalNotice("Accountant-export is voorbereid met BTW, grootboek en audittrail-controle.", "success");
    document.querySelector("#accountant-export")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function handlePortalAction(action) {
    if (document.querySelector(".property-platform") && [
      "explain-intelligence", "ai-crack", "ai-do-nothing", "compare-inspections", "ai-mjop", "ai-actions",
    ].includes(action)) {
      setAiAnswer("Geen analyse beschikbaar", "Er is nog geen inspectiedata om deze analyse uit te voeren.");
      return;
    }
    if (document.querySelector(".property-platform") && [
      "add-object", "unlock-modules", "prepare-accountant-export",
    ].includes(action)) {
      setPortalNotice("Deze actie wordt beschikbaar zodra de bijbehorende klantdata en workflow zijn vastgelegd.", "info");
      return;
    }
    const answers = {
      "explain-intelligence": [
        "Toelichting op intelligence",
        "De belangrijkste verandering zit in HWA-zone A en dakranddetails. Die combinatie verhoogt de kans op vervolgschade, dus eerst detailcontrole en herstelplanning, daarna herinspectie.",
      ],
      "ai-crack": [
        "Waarom ontstaat deze scheur?",
        "De scheur past bij spanning rond materiaalovergangen en weersbelasting. Zonder destructief onderzoek blijft dit een visuele indicatie, maar de combinatie met vochtsporen maakt opvolging verstandig.",
      ],
      "ai-do-nothing": [
        "Scenario bij niets doen",
        "Het risico verschuift van lokaal herstel naar gevolgschade: meer wateraccumulatie, hogere herstelkosten en slechtere bewijspositie richting onderhoudspartijen.",
      ],
      "compare-inspections": [
        "Vergelijking maart versus juni 2026",
        "Ten opzichte van maart zijn HWA-zone A en twee dakranddetails verslechterd. Voegwerk noord blijft stabiel en de schoorsteen lijkt verbeterd.",
      ],
      "ai-mjop": [
        "MJOP-input voor Parkzicht Hoofdgebouw",
        "Neem HWA-detailcontrole op als korte termijn actie, dakrandherstel als planbaar onderhoud en voegwerkmonitoring als periodieke controlepost.",
      ],
      "ai-actions": [
        "Samenvatting open acties",
        "Hoog: HWA-zone A controleren en dakranddetail herstellen. Normaal: offerte loodwerk vergelijken, PV-hotspot koppelen, herinspectie in september plannen.",
      ],
    };

    if (action === "explain-intelligence") {
      answerObjectQuestion("Wat is veranderd bij de laatste inspectie?");
      document.querySelector("#ai")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (action === "plan-reinspection") {
      const form = document.querySelector('[data-customer-request-form="inspection"]');
      if (form) form.elements.request_type.value = "reinspection";
      document.querySelector("#aanvragen")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (action === "request-inspection") {
      const form = document.querySelector('[data-customer-request-form="inspection"]');
      if (form) form.elements.request_type.value = "inspection";
      document.querySelector("#aanvragen")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (action === "add-object") {
      addObject();
      return;
    }
    if (action === "unlock-modules") {
      unlockModules();
      return;
    }
    if (action === "prepare-accountant-export") {
      prepareAccountantExport();
      return;
    }
    if (answers[action]) setAiAnswer(answers[action][0], answers[action][1]);
  }

  async function editRole(row) {
    openEmployeeDossier(row?.dataset.recordId);
  }

  function removeRole(row) {
    setPortalNotice("Toegang intrekken wordt pas beschikbaar zodra de Auth-intrekkingsworkflow gereed is.", "info");
  }

  async function assignRole() {
    const emailInput = roleBuilder?.querySelector("input");
    const roleSelect = roleBuilder?.querySelector("select");
    const email = emailInput?.value.trim().toLowerCase();
    const role = roleSelect?.value || "Support";

    if (!email || !email.endsWith("@roofsignal.nl")) {
      alert("Gebruik een geldig @roofsignal.nl e-mailadres voor interne rollen.");
      emailInput?.focus();
      return;
    }

    if (!rolesBody) return;

    const existing = [...rolesBody.querySelectorAll("tr")].find((row) => {
      return row.querySelector("td")?.textContent.trim().toLowerCase() === email;
    });
    const row = existing || document.createElement("tr");
    row.innerHTML = `<td>${email}</td><td>${roleCell(role)}</td><td>${roleRights[role] || "Aangepaste rechten"}</td><td>${statusCell("Actief")}</td><td><div class="table-actions"><a href="#rechten" data-admin-action="edit-role">Bewerken</a><a class="text-danger" href="#rechten" data-admin-action="remove-role">Verwijderen</a></div></td>`;
    if (window.RoofSignalBackend?.isConfigured) {
      const roleValue = role === "Owner admin" ? "owner_admin" : role === "Inspecteur" ? "inspector" : role.toLowerCase();
      const profile = liveProfiles.find((item) => item.email?.toLowerCase() === email);
      const result = profile ? await window.RoofSignalBackend.saveProfileRoles(profile.id, [...new Set([...(profile.roles || [profile.role]), roleValue])]) : { ok: false };
      if (!result.ok) {
        alert("Deze gebruiker bestaat nog niet in Supabase Auth. Maak eerst het account aan of laat de gebruiker inloggen.");
        return;
      }
      await loadLiveAdminData();
      setPortalNotice(`${roleLabels[roleValue] || role} is toegevoegd aan ${email}.`, "success");
      if (emailInput) emailInput.value = "";
      return;
    }
    if (!existing) rolesBody.append(row);
    iconizeAdminActions(rolesBody);
    saveState();
  }

  function editCurrentCustomer() {
    const heading = document.querySelector(".portal-topbar h1");
    const current = heading?.textContent.trim().replace(/\.$/, "") || "Klant";
    const name = prompt("Klantnaam", current);
    if (!name || !heading) return;
    heading.textContent = `${name}.`;
    localStorage.setItem("roofsignal-current-customer", name);
  }

  function loadCurrentCustomer() {
    const name = localStorage.getItem("roofsignal-current-customer");
    if (!name || !document.querySelector(".property-platform")) return;
    const heading = document.querySelector(".portal-topbar h1");
    const account = document.querySelector(".portal-account strong");
    const subscription = document.querySelector(".portal-account strong + span");
    if (heading) heading.textContent = name;
    if (account) account.textContent = name;
    if (subscription) subscription.textContent = "Abonnement: niet ingesteld";
  }

  function emptyState(message) {
    return `<div class="empty-state">${escapeHtml(message)}</div>`;
  }

  function resetCustomerPortalData() {
    if (!document.querySelector(".property-platform")) return;

    document.querySelectorAll("#dashboard article").forEach((card) => {
      const value = card.querySelector("strong");
      const note = card.querySelector("p");
      if (value) value.textContent = card.querySelector("span")?.textContent === "Datawaarde" ? "0%" : card.querySelector("span")?.textContent === "Abonnement" ? "EUR 0" : "0";
      if (note) note.textContent = "Geen gegevens beschikbaar.";
    });

    document.querySelectorAll("#management .management-grid article").forEach((card) => {
      const value = card.querySelector("strong");
      const note = card.querySelector("p");
      if (value) value.textContent = "0";
      if (note) note.textContent = "Geen gegevens beschikbaar.";
    });

    const replacements = [
      [".object-list", "Geen objecten gekoppeld aan deze klant."],
      [".object-command aside .timeline-list", "Geen waarschuwingen of signalen."],
      [".intelligence-feed", "Nog geen Property Intelligence beschikbaar."],
      [".entitlement-list", "Geen pakket of modules vastgelegd."],
      ["#media .media-stack", "Nog geen inspectiemedia beschikbaar."],
      ["#planning .timeline-list", "Geen afspraken gepland."],
      ["#finance-hub aside .timeline-list", "Geen betalingsherinneringen."],
      ["#accountant-export + aside .support-grid", "Geen financiële data om te controleren."],
      ["#financieel + .portal-panel .support-grid", "Geen supporttaken of opvolging."],
    ];
    replacements.forEach(([selector, message]) => {
      const element = document.querySelector(selector);
      if (element) element.innerHTML = emptyState(message);
    });

    document.querySelectorAll("#objectdossier .object-dossier-grid > div").forEach((section) => {
      const tableBody = section.querySelector("tbody");
      if (tableBody) tableBody.innerHTML = '<tr><td colspan="2">Geen objectgegevens beschikbaar.</td></tr>';
    });
    const dossierTitle = document.querySelector("#objectdossier h2");
    if (dossierTitle) dossierTitle.textContent = "Geen object geselecteerd";
    const reportLink = document.querySelector("#objectdossier .panel-head > a");
    if (reportLink) reportLink.hidden = true;

    const inspectionsBody = document.querySelector("#inspecties tbody");
    if (inspectionsBody) inspectionsBody.innerHTML = '<tr><td colspan="6">Nog geen inspecties of rapporten.</td></tr>';
    const invoicesBody = document.querySelector("#financieel tbody");
    if (invoicesBody) invoicesBody.innerHTML = '<tr><td colspan="4">Geen facturen of abonnementen.</td></tr>';
    const financeAdminBody = document.querySelector("#finance-hub tbody");
    if (financeAdminBody) financeAdminBody.innerHTML = '<tr><td colspan="4">Geen financiële administratie beschikbaar.</td></tr>';

    document.querySelectorAll("#finance-hub .finance-kpi-grid article").forEach((card) => {
      const value = card.querySelector("strong");
      const note = card.querySelector("p");
      if (value) value.textContent = card.querySelector("span")?.textContent === "Churn" ? "0%" : "EUR 0";
      if (note) note.textContent = "Geen financiële data.";
    });

    const aiPrompts = document.querySelector("#ai .ai-prompt-list");
    if (aiPrompts) aiPrompts.innerHTML = "";
    const aiAnswer = document.querySelector("#ai .ai-answer");
    if (aiAnswer) aiAnswer.innerHTML = "<strong>Vraag het dossier</strong><p>Het antwoord wordt samengesteld uit de actuele gegevens die voor uw organisatie in RoofSignal zijn vastgelegd.</p>";
    const complexity = document.querySelector("#planning .complexity-score");
    if (complexity) complexity.innerHTML = "<span>Inspection Complexity Score</span><strong>0 / 5</strong><p>Nog niet berekend.</p>";
  }

  function formatPortalDate(value) {
    if (!value) return "-";
    return new Intl.DateTimeFormat("nl-NL", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
  }

  function formatPortalDateTime(value) {
    if (!value) return "-";
    return new Intl.DateTimeFormat("nl-NL", { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
  }

  function propertyAddress(property = {}) {
    const street = String(property.address || "").trim();
    const postcode = String(property.postcode || "").trim();
    const city = String(property.city || "").trim();
    const suffix = [postcode, city].filter(Boolean).join(" ");
    if (suffix && street.toLowerCase().includes(suffix.toLowerCase())) return street;
    return [street, suffix].filter(Boolean).join(", ");
  }

  function renderCustomerProperties(properties, inspections = [], findings = []) {
    const objectList = document.querySelector(".object-list");
    if (!objectList) return;
    if (!properties.length) { objectList.innerHTML = emptyState("Nog geen objecten. Voeg uw eerste object toe met de plusknop."); return; }
    objectList.innerHTML = properties.map((property) => [
      `<article class="object-card customer-object-choice" data-customer-property-id="${escapeHtml(property.id)}">`,
      '<div>',
      `<span class="status-pill demo">${escapeHtml(property.status || "Actief")}</span>`,
      `<h3>${escapeHtml(property.name || "Object")}</h3>`,
      `<p>${escapeHtml(propertyAddress(property) || "Adres niet vastgelegd.")}</p>`,
      '</div>',
      '<dl>',
      `<div><dt>Inspecties</dt><dd>${inspections.filter((item) => item.property_id === property.id).length}</dd></div>`,
      `<div><dt>Bevindingen</dt><dd>${findings.filter((item) => inspections.some((inspection) => inspection.id === item.inspection_id && inspection.property_id === property.id)).length}</dd></div>`,
      '</dl>',
      `<div class="customer-object-actions"><button class="inline-button" type="button" data-portal-action="open-customer-object" data-property-id="${escapeHtml(property.id)}">Open dossier</button><button class="inline-button" type="button" data-portal-action="edit-customer-object" data-property-id="${escapeHtml(property.id)}">Aanpassen</button><button class="inline-button text-danger" type="button" data-portal-action="delete-customer-object" data-property-id="${escapeHtml(property.id)}">Verwijderen</button></div>`,
      '</article>',
    ].join("")).join("");
    selectCustomerProperty(properties[0].id, false);
  }

  function selectCustomerProperty(propertyId, shouldScroll = true) {
    if (!customerPortalState) return;
    const { properties, inspections, findings, reports } = customerPortalState;
    const first = properties.find((property) => property.id === propertyId);
    if (!first) return;
    document.querySelectorAll("[data-customer-property-id]").forEach((card) => card.classList.toggle("selected", card.dataset.customerPropertyId === propertyId));
    const dossierTitle = document.querySelector("#objectdossier h2");
    if (dossierTitle) dossierTitle.textContent = first.name || "Object";
    const firstBody = document.querySelector("#objectdossier .object-dossier-grid > div:first-child tbody");
    if (firstBody) firstBody.innerHTML = [
      `<tr><th>Adres</th><td>${escapeHtml(propertyAddress(first) || "Niet vastgelegd")}</td></tr>`,
      `<tr><th>Objectstatus</th><td>${escapeHtml(first.status || "Actief")}</td></tr>`,
      `<tr><th>Inspecties</th><td>${inspections.filter((item) => item.property_id === first.id).length}</td></tr>`,
      `<tr><th>Opmerkingen</th><td>${escapeHtml(first.customer_notes || "Geen opmerkingen")}</td></tr>`,
    ].join("");
    const building = first.building_data || {};
    const buildingBody = document.querySelector("#objectdossier .object-dossier-grid > div:nth-child(2) tbody");
    const buildingRows = [
      ["Gebouwtype", building.building_type], ["Bouwjaar", building.construction_year],
      ["Bruto vloeroppervlak", building.gross_floor_area != null ? `${building.gross_floor_area} m²` : ""],
      ["Dakoppervlak", building.roof_area != null ? `${building.roof_area} m²` : ""],
      ["Geveloppervlak", building.facade_area != null ? `${building.facade_area} m²` : ""],
    ].filter(([, value]) => value !== null && value !== undefined && value !== "");
    if (buildingBody) buildingBody.innerHTML = buildingRows.length ? buildingRows.map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`).join("") : '<tr><td colspan="2">Nog geen gebouwdata vastgelegd.</td></tr>';
    const inspectionIds = new Set(inspections.filter((item) => item.property_id === first.id).map((item) => item.id));
    renderCustomerFindings(findings.filter((finding) => inspectionIds.has(finding.inspection_id)), true);
    const report = reports.find((item) => item.property_id === first.id && item.status === "published");
    const reportLink = document.querySelector("#objectdossier .panel-head > a");
    if (reportLink) {
      reportLink.hidden = !report?.report_url;
      if (report?.report_url) reportLink.href = report.report_url;
    }
    if (shouldScroll) document.querySelector("#objectdossier")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function renderCustomerInspections(inspections, properties, reports = [], documents = []) {
    const body = document.querySelector("#inspecties tbody");
    if (!body || !inspections.length) return;
    const propertyNames = new Map(properties.map((property) => [property.id, property.name]));
    const reportByInspection = new Map(reports.map((report) => [report.inspection_id, report]));
    body.innerHTML = inspections.map((inspection) => {
      const report = reportByInspection.get(inspection.id);
      const document = documents.find((item) => item.inspection_id === inspection.id && item.document_type === "inspection_report");
      const reportLink = document?.signed_url ? `<a href="${escapeHtml(document.signed_url)}" target="_blank" rel="noopener">Open rapport</a>` : report?.report_url ? `<a href="${escapeHtml(report.report_url)}" target="_blank" rel="noopener">Open rapport</a>` : report ? "Gepubliceerd" : "-";
      return [
      "<tr>",
      `<td>${escapeHtml(formatPortalDate(inspection.inspected_at || inspection.scheduled_at || inspection.created_at))}</td>`,
      `<td>${escapeHtml(propertyNames.get(inspection.property_id) || inspection.properties?.name || "Object")}</td>`,
      `<td>${escapeHtml(inspection.scope || "Inspectie")}</td>`,
      `<td>${escapeHtml(inspection.summary || "Nog geen gebouwdata vastgelegd")}</td>`,
      `<td>${statusCell(escapeHtml(inspection.status || "Intake"), inspection.status === "delivered" ? "green" : "yellow")}</td>`,
      `<td>${reportLink}</td>`,
      "</tr>",
    ].join(""); }).join("");
  }

  function renderCustomerFindings(findings = [], dossierOnly = false) {
    const feed = document.querySelector(".intelligence-feed");
    const conditionBody = document.querySelector("#objectdossier .object-dossier-grid > div:nth-child(3) tbody");
    if (feed && !dossierOnly) feed.innerHTML = findings.length ? findings.map((finding) => `<article><strong>${escapeHtml(finding.title)}</strong><p>${escapeHtml([finding.building_element, finding.condition_score ? `conditie ${finding.condition_score}` : "", finding.recommendation].filter(Boolean).join(" · "))}</p></article>`).join("") : emptyState("Nog geen Property Intelligence beschikbaar.");
    if (conditionBody) conditionBody.innerHTML = findings.length ? findings.map((finding) => `<tr><th>${escapeHtml(finding.building_element || "Bevinding")}</th><td>${escapeHtml(finding.condition_score || finding.priority || "Vastgelegd")}</td></tr>`).join("") : '<tr><td colspan="2">Geen conditiedata beschikbaar.</td></tr>';
  }

  function renderCustomerMedia(media = []) {
    const stack = document.querySelector("#media .media-stack");
    if (!stack) return;
    stack.innerHTML = media.length ? media.map((item) => ["photo","thermal"].includes(item.media_type) ? `<a href="${escapeHtml(item.signed_url || "#")}" target="_blank" rel="noopener"><img src="${escapeHtml(item.signed_url || "")}" alt="${escapeHtml(item.file_name)}"><span>${escapeHtml(item.media_type)} · ${escapeHtml(item.file_name)}</span></a>` : `<a href="${escapeHtml(item.signed_url || "#")}" target="_blank" rel="noopener">${escapeHtml(item.file_name)} · ${escapeHtml(item.media_type)}</a>`).join("") : emptyState("Nog geen inspectiemedia beschikbaar.");
  }

  function renderCustomerEntitlements(quoteItems = []) {
    const list = document.querySelector(".entitlement-list");
    if (!list) return;
    const prices = { basis: 395, plus: 595, premium: 995 };
    list.innerHTML = quoteItems.length ? quoteItems.map((item) => {
      const current = item.inspection_depth || "basis";
      const actualPrice = Number(item.amount || 0);
      const isCustomPrice = actualPrice > 0 && Math.abs(actualPrice - prices[current]) > 0.01;
      const upgrades = isCustomPrice ? [] : current === "basis" ? [["plus", 200], ["premium", 600]] : current === "plus" ? [["premium", 400]] : [];
      const upgradeCopy = isCustomPrice ? '<div class="entitlement-complete">Voor uitbreiding van deze maatwerkofferte kunt u contact opnemen.</div>' : upgrades.length ? `<div class="entitlement-actions">${upgrades.map(([depth, price]) => `<button class="inline-button" type="button" data-portal-action="request-upgrade" data-quote-item-id="${escapeHtml(item.id)}" data-current-depth="${escapeHtml(current)}" data-requested-depth="${depth}" data-upgrade-price="${price}">Ontgrendel ${inspectionDepths[depth].label} · ${formatMoney(price)} excl. btw</button>`).join("")}</div>` : '<div class="entitlement-complete">Alle afgesproken datalagen zijn beschikbaar</div>';
      return `<article class="entitlement-card"><span class="status-pill demo">${escapeHtml(inspectionDepths[current]?.label || "Basis")}</span><strong>${escapeHtml(item.properties?.name || "Object")}</strong><p>${escapeHtml(productLabel(item.inspection_product))} · overeengekomen voor ${escapeHtml(formatMoney(actualPrice || prices[current]))} excl. btw</p><small>Uw offerte en de daarin afgesproken scope zijn leidend.</small>${upgradeCopy}</article>`;
    }).join("") : emptyState("Nog geen inspectieproduct gekoppeld.");
  }

  async function requestUpgrade(target) {
    const result = await window.RoofSignalBackend.createUpgradeRequest(target.dataset.quoteItemId, target.dataset.requestedDepth);
    if (!result.ok) return setPortalNotice(result.error?.message || "Upgrade aanvragen is mislukt.", "error");
    target.disabled = true;
    setPortalNotice(`Upgrade naar ${inspectionDepths[target.dataset.requestedDepth]?.label} is aangevraagd. RoofSignal neemt contact op voor betaling en activatie.`, "success");
  }

  async function activateUpgrade(target) {
    if (!confirm("Bevestig dat de betaling is ontvangen en activeer deze datalaag.")) return;
    const result = await window.RoofSignalBackend.activateUpgradeRequest(target.dataset.upgradeId, target.dataset.quoteItemId, target.dataset.requestedDepth, depthSnapshot(target.dataset.inspectionProduct, target.dataset.requestedDepth));
    if (!result.ok) return setPortalNotice(result.error?.message || "Upgrade activeren is mislukt.", "error");
    setPortalNotice("Betaling is geregistreerd en de extra datalaag is geactiveerd.", "success");
    await loadLiveAdminData();
    if (activeObjectCustomerRow) await renderCustomerDossier(activeObjectCustomerRow.dataset.customerId);
  }

  function renderCustomerAppointments(appointments) {
    const list = document.querySelector("#planning .timeline-list");
    if (!list) return;
    if (!appointments.length) { list.innerHTML = emptyState("Geen afspraken gepland."); return; }
    list.innerHTML = appointments.map((appointment) => [
      '<div class="customer-appointment-card">',
      `<span>${escapeHtml(formatPortalDateTime(appointment.starts_at))}</span>`,
      `<strong>${escapeHtml(appointment.title || "Afspraak")}</strong>`,
      `<p>${escapeHtml(propertyAddress(appointment.properties) || appointment.notes || "Inspectieadres wordt bevestigd.")}</p>`,
      `${appointment.ends_at ? `<small>Verwachte eindtijd: ${escapeHtml(new Intl.DateTimeFormat("nl-NL", { hour: "2-digit", minute: "2-digit" }).format(new Date(appointment.ends_at)))}</small>` : ""}`,
      `<span class="status-dot yellow">${escapeHtml(statusMeta(appointment.status || "planned").label)}</span>`,
      appointment.customer_response ? `<small>Uw reactie: ${escapeHtml({confirmed:"Bevestigd",reschedule_requested:"Verzoek tot verplaatsen ingediend",cancellation_requested:"Verzoek tot annuleren ingediend"}[appointment.customer_response] || appointment.customer_response)}</small>` : `<div class="appointment-actions"><button class="inline-button" data-portal-action="appointment-response" data-appointment-id="${escapeHtml(appointment.id)}" data-response="confirmed">Bevestigen</button><button class="inline-button" data-portal-action="appointment-response" data-appointment-id="${escapeHtml(appointment.id)}" data-response="reschedule_requested">Verplaatsen</button><button class="inline-button text-danger" data-portal-action="appointment-response" data-appointment-id="${escapeHtml(appointment.id)}" data-response="cancellation_requested">Annuleren</button></div>`,
      "</div>",
    ].join("")).join("");
  }

  function renderCustomerInvoices(invoices, documents = []) {
    const body = document.querySelector("#financieel tbody");
    if (!body || !invoices.length) return;
    const money = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" });
    body.innerHTML = invoices.map((invoice) => {
      const document = documents.find((item) => item.invoice_id === invoice.id && item.signed_url);
      const download = document ? `<a href="${escapeHtml(document.signed_url)}" target="_blank" rel="noopener">Download factuur</a>` : '<span class="unavailable-label">Nog niet beschikbaar</span>';
      const payment = invoice.payment_url && !["paid","credited","cancelled"].includes(invoice.status) ? `<a class="inline-button" href="${escapeHtml(invoice.payment_url)}" target="_blank" rel="noopener">Betaal nu</a>` : "";
      const action = `<div class="quote-actions">${download}${payment}</div>`;
      return `<tr><td>${escapeHtml(invoice.invoice_number || "Factuur")}</td><td>${escapeHtml(money.format(Number(invoice.amount || 0)))}</td><td>${statusCell(invoiceStatusMeta(invoice.status))}</td><td>${action}</td></tr>`;
    }).join("");
  }

  function renderCustomerQuotes(quotes = [], documents = []) {
    const list = document.querySelector(".customer-quote-list");
    if (!list) return;
    if (!quotes.length) {
      list.innerHTML = '<div class="empty-state">Nog geen offertes beschikbaar.</div>';
      return;
    }
    list.innerHTML = quotes.map((quote) => {
      const document = documents.find((item) => item.quote_id === quote.id && item.document_type === "quote");
      const action = document?.signed_url ? `<a class="inline-button" href="${escapeHtml(document.signed_url)}" target="_blank" rel="noopener">PDF bekijken</a>` : "";
      const accepted = quote.status === "accepted" ? ` · akkoord${quote.accepted_by_name ? ` door ${quote.accepted_by_name}` : ""}` : "";
      const canAccept = ["sent","viewed","open"].includes(quote.status) && (!quote.valid_until || new Date(`${quote.valid_until}T23:59:59`) >= new Date());
      const accept = canAccept ? `<button class="btn" type="button" data-portal-action="accept-customer-quote" data-quote-id="${escapeHtml(quote.id)}">Offerte goedkeuren</button>` : "";
      return `<article class="customer-quote-card"><div><strong>${escapeHtml(quote.quote_number || quote.title)}</strong><span>${escapeHtml(formatMoney(quote.amount))} excl. btw · ${escapeHtml(statusMeta(quote.status).label)}${escapeHtml(accepted)}</span></div><div class="quote-actions">${action}${accept}</div></article>`;
    }).join("");
  }

  function fillCustomerRequestForms(properties) {
    document.querySelectorAll("[data-customer-request-form] select[name='property_id']").forEach((select) => {
      const first = select.querySelector("option")?.outerHTML || '<option value="">Kies een object</option>';
      select.innerHTML = first + properties.map((property) => `<option value="${escapeHtml(property.id)}">${escapeHtml(property.name)}</option>`).join("");
    });
  }

  function renderCustomerRequests(requests = [], messages = []) {
    const list = document.querySelector(".customer-request-list");
    if (!list) return;
    const labels = { inspection: "Inspectie", reinspection: "Herinspectie", support: "Support" };
    list.innerHTML = requests.length ? requests.map((request) => { const thread = messages.filter((item) => item.request_id === request.id); return `<article class="request-history-item"><div><span class="status-pill">${escapeHtml(labels[request.request_type] || request.request_type)}</span><strong>${escapeHtml(request.subject)}</strong><p>${escapeHtml(request.properties?.name || "Algemeen")} · ${escapeHtml(formatPortalDate(request.created_at))}</p></div><span>${escapeHtml(request.status)}</span><div class="request-thread"><div class="request-thread-messages">${thread.length ? thread.map((item) => `<div class="request-message ${escapeHtml(item.author_type)}"><strong>${item.author_type === "staff" ? "RoofSignal" : "U"}</strong><p>${escapeHtml(item.message)}</p><small>${escapeHtml(formatPortalDateTime(item.created_at))}</small></div>`).join("") : "<small>Nog geen berichten in dit gesprek.</small>"}</div><form class="customer-mini-form" data-request-message-form data-request-id="${escapeHtml(request.id)}"><label>Reageren<textarea name="message" required rows="2"></textarea></label><button class="inline-button" type="submit">Bericht versturen</button><span class="form-note"></span></form></div></article>`; }).join("") : emptyState("Nog geen aanvragen ingediend.");
  }

  async function submitCustomerRequest(form) {
    const status = form.querySelector("[data-request-status]");
    const data = new FormData(form);
    const requestType = form.dataset.customerRequestForm === "support" ? "support" : String(data.get("request_type") || "inspection");
    const property = customerPortalState?.properties.find((item) => item.id === data.get("property_id"));
    const subject = requestType === "support" ? String(data.get("subject") || "").trim() : `${requestType === "reinspection" ? "Herinspectie" : "Inspectie"} ${property?.name || "object"}`;
    const result = await window.RoofSignalBackend.createCustomerRequest({
      organization_id: portalAccess.profile.organization_id,
      property_id: data.get("property_id") || null,
      request_type: requestType,
      subject,
      message: String(data.get("message") || "").trim() || null,
      preferred_date: data.get("preferred_date") || null,
    });
    if (!result.ok) return setWorkflowStatus(status, result.error?.message || "Aanvraag versturen is mislukt.", "error");
    form.reset();
    setWorkflowStatus(status, "Uw aanvraag is ontvangen. RoofSignal neemt contact met u op.", "success");
    const requests = await window.RoofSignalBackend.listCustomerRequests(portalAccess.profile.organization_id);
    renderCustomerRequests(requests, await window.RoofSignalBackend.listRequestMessages(portalAccess.profile.organization_id));
  }

  function openCustomerObjectDialog(property = null) {
    const dialog = document.querySelector("[data-customer-object-dialog]");
    const form = dialog?.querySelector("[data-customer-object-form]");
    if (!dialog || !form) return;
    form.reset(); form.elements.id.value = property?.id || ""; form.elements.name.value = property?.name || "";
    form.elements.address.value = property?.address || ""; form.elements.postcode.value = property?.postcode || "";
    form.elements.city.value = property?.city || ""; form.elements.customer_notes.value = property?.customer_notes || "";
    dialog.querySelector("[data-customer-object-form-title]").textContent = property ? "Object aanpassen" : "Object toevoegen";
    dialog.showModal();
  }

  async function submitCustomerObject(form) {
    const data = new FormData(form); const status = form.querySelector("[data-customer-object-status]");
    const result = await window.RoofSignalBackend.saveCustomerProperty(Object.fromEntries(data.entries()));
    if (!result.ok) return setWorkflowStatus(status, result.error?.message || "Object opslaan is mislukt.", "error");
    form.closest("dialog")?.close(); setPortalNotice("Object is opgeslagen.", "success"); await loadCustomerPortalData();
  }

  async function deleteCustomerObject(id) {
    const property = customerPortalState?.properties.find((item) => item.id === id); if (!property) return;
    if (!confirm(`${property.name} uit uw portaal verwijderen? Het bestaande dossier blijft bij RoofSignal bewaard.`)) return;
    const result = await window.RoofSignalBackend.archiveCustomerProperty(id);
    if (!result.ok) return setPortalNotice(result.error?.message || "Object verwijderen is mislukt.", "error");
    setPortalNotice("Object is verwijderd uit uw actieve portfolio.", "success"); await loadCustomerPortalData();
  }

  async function acceptCustomerQuote(id) {
    const quote = customerPortalState?.quotes?.find((item) => item.id === id); if (!quote) return;
    if (!confirm(`Offerte ${quote.quote_number || quote.title} voor ${formatMoney(quote.amount)} excl. btw goedkeuren?`)) return;
    const result = await window.RoofSignalBackend.acceptCustomerQuote(id, portalAccess?.profile?.full_name || "");
    if (!result.ok) return setPortalNotice(result.error?.message || "Offerte goedkeuren is mislukt.", "error");
    setPortalNotice("Dank u. De offerte is goedgekeurd en RoofSignal ontvangt hiervan bericht.", "success"); await loadCustomerPortalData();
  }

  async function respondToCustomerAppointment(id, response) {
    let note = "";
    if (response !== "confirmed") { note = prompt(response === "reschedule_requested" ? "Welke datum of periode heeft uw voorkeur?" : "Wilt u de reden of een toelichting meegeven?", "") || ""; if (!note.trim()) return; }
    const result = await window.RoofSignalBackend.respondToAppointment(id, response, note);
    if (!result.ok) return setPortalNotice(result.error?.message || "Uw reactie kon niet worden opgeslagen.", "error");
    setPortalNotice(response === "confirmed" ? "De afspraak is bevestigd." : "Uw verzoek is ontvangen. RoofSignal neemt contact met u op.", "success"); await loadCustomerPortalData();
  }

  function renderCustomerChanges(inspections, findings) {
    const feed = document.querySelector("#intelligence .intelligence-feed"); if (!feed) return;
    const dated = inspections.filter((item) => item.inspected_at || item.scheduled_at).sort((a,b) => new Date(b.inspected_at || b.scheduled_at) - new Date(a.inspected_at || a.scheduled_at));
    if (dated.length < 2) { feed.innerHTML = emptyState("Na een volgende inspectie vergelijken we veranderingen per gebouwdeel."); return; }
    const latest = findings.filter((item) => item.inspection_id === dated[0].id); const previous = findings.filter((item) => item.inspection_id === dated[1].id);
    const prior = new Map(previous.map((item) => [String(item.building_element || item.title).toLowerCase(), item]));
    const changes = latest.map((item) => { const old = prior.get(String(item.building_element || item.title).toLowerCase()); if (!old) return { title: item.title, text: "Nieuw vastgelegd bij de laatste inspectie." }; const now = Number(item.condition_score || 0), before = Number(old.condition_score || 0); if (now && before && now !== before) return { title: item.building_element || item.title, text: `Conditie gewijzigd van ${before} naar ${now}.` }; return null; }).filter(Boolean);
    feed.innerHTML = changes.length ? changes.map((item) => `<article class="change-card"><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.text)}</p></article>`).join("") : emptyState("Geen vastgelegde conditiewijzigingen tussen de laatste twee inspecties.");
  }

  function answerObjectQuestion(question) {
    const state = customerPortalState || {}; const q = question.toLowerCase(); let answer;
    if (/verander|gewijzigd|verschil/.test(q)) answer = (state.inspections || []).length < 2 ? "Er is nog maar één inspectie vastgelegd. Na een volgende inspectie kan RoofSignal veranderingen per gebouwdeel vergelijken." : "De vergelijking tussen de laatste twee inspecties staat bij ‘Wat is veranderd?’. Alleen vastgelegde wijzigingen worden daar genoemd.";
    else if (/aandacht|prioriteit|eerst/.test(q)) { const urgent = (state.findings || []).filter((item) => ["p1","p2","urgent","high"].includes(String(item.priority || item.severity).toLowerCase())); answer = urgent.length ? `Er zijn ${urgent.length} bevindingen met verhoogde prioriteit. Begin met ${urgent.slice(0,3).map((item) => item.title).join(", ")}.` : "Er zijn momenteel geen bevindingen met verhoogde prioriteit vastgelegd."; }
    else if (/afspraak|wanneer|planning/.test(q)) { const next = (state.appointments || []).find((item) => new Date(item.starts_at) >= new Date()); answer = next ? `De eerstvolgende afspraak is ${formatPortalDateTime(next.starts_at)} voor ${next.properties?.name || "uw object"}.` : "Er staat momenteel geen toekomstige afspraak gepland."; }
    else if (/factuur|betaal/.test(q)) { const open = (state.invoices || []).filter((item) => !["paid","credited","cancelled"].includes(item.status)); answer = open.length ? `Er ${open.length === 1 ? "staat" : "staan"} ${open.length} openstaande factuur${open.length === 1 ? "" : "en"}.` : "Er zijn geen openstaande facturen."; }
    else if (/rapport|document/.test(q)) answer = `In het dossier ${state.reports?.length === 1 ? "staat" : "staan"} ${state.reports?.length || 0} rapport${state.reports?.length === 1 ? "" : "en"} en ${state.documents?.length || 0} document${state.documents?.length === 1 ? "" : "en"}.`;
    else answer = `Uw dossier bevat ${state.properties?.length || 0} objecten, ${state.inspections?.length || 0} inspecties en ${state.findings?.length || 0} bevindingen. Stel een vraag over aandachtspunten, planning, facturen of rapporten voor een gerichter antwoord.`;
    const box = document.querySelector("#ai .ai-answer"); if (box) box.innerHTML = `<strong>Antwoord uit uw dossier</strong><p>${escapeHtml(answer)}</p>`;
  }

  function renderPortalNotifications(databaseNotifications = []) {
    const userId = portalAccess?.profile?.id; const items = databaseNotifications; const list = document.querySelector(".portal-notification-list"); const count = document.querySelector("[data-notification-count]");
    const unread = items.filter((item) => !item.read_by?.includes(userId)); if (count) { count.textContent = unread.length; count.hidden = !unread.length; }
    if (list) list.innerHTML = items.length ? items.map((item) => `<article class="portal-notification ${item.read_by?.includes(userId) ? "" : "unread"}"><div><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.body || "")}</p></div><a class="inline-button" href="${escapeHtml(item.link || "#dashboard")}" data-notification-id="${escapeHtml(item.id)}">Bekijken</a></article>`).join("") : emptyState("Geen nieuwe meldingen.");
  }

  async function loadCustomerPortalData() {
    if (!document.querySelector(".property-platform")) return;
    resetCustomerPortalData();
    const backend = window.RoofSignalBackend;
    if (!backend?.isConfigured) return;
    let organizationId = portalAccess?.internal
      ? localStorage.getItem("roofsignal-current-customer-id")
      : portalAccess?.profile?.organization_id;
    if (!organizationId) organizationId = (await backend.getProfile())?.organization_id || "";
    if (!organizationId) {
      const currentName = customerKey(localStorage.getItem("roofsignal-current-customer"));
      const organization = (await backend.listOrganizations()).find((item) => customerKey(item.name) === currentName);
      organizationId = organization?.id || "";
      if (organizationId) localStorage.setItem("roofsignal-current-customer-id", organizationId);
    }
    if (!organizationId) return;
    if (customerProfileForm && portalAccess?.profile && !portalAccess.internal) {
      customerProfileForm.elements.full_name.value = portalAccess.profile.full_name || "";
      customerProfileForm.elements.phone.value = portalAccess.profile.phone || "";
    }

    const organization = (await backend.listOrganizations()).find((item) => item.id === organizationId);
    if (organization) {
      const heading = document.querySelector(".portal-topbar h1");
      const account = document.querySelector(".portal-account strong");
      if (heading) heading.textContent = organization.name;
      if (account) account.textContent = organization.name;
    }
    const previewBanner = document.querySelector("[data-customer-preview-banner]");
    if (previewBanner) previewBanner.hidden = !portalAccess?.internal;

    const [properties, inspections, invoices, appointments, reports, quoteItems, documents, requests, quotes, requestMessages, notifications] = await Promise.all([
      backend.listOrganizationProperties(organizationId),
      backend.listInspections(organizationId),
      backend.listOrganizationInvoices(organizationId),
      backend.listOrganizationAppointments(organizationId),
      backend.listOrganizationReports(organizationId),
      backend.listQuoteItems(),
      backend.listOrganizationDocuments(organizationId),
      backend.listCustomerRequests(organizationId),
      backend.listOrganizationQuotes(organizationId),
      backend.listRequestMessages(organizationId),
      backend.listPortalNotifications(organizationId),
    ]);
    const findings = (await Promise.all(inspections.map((inspection) => backend.listFindings(inspection.id)))).flat();
    const media = (await Promise.all(inspections.map((inspection) => backend.listInspectionMedia(inspection.id)))).flat();
    customerPortalState = { organizationId, properties, inspections, findings, reports, documents, invoices, appointments, quotes, requests, requestMessages, notifications };
    renderCustomerFindings(findings);
    renderCustomerProperties(properties, inspections, findings);
    renderCustomerInspections(inspections, properties, reports, documents);
    renderCustomerMedia(media);
    renderCustomerEntitlements(quoteItems.filter((item) => item.organization_id === organizationId));
    renderCustomerInvoices(invoices, documents);
    renderCustomerQuotes(quotes, documents);
    renderCustomerAppointments(appointments);
    renderCustomerChanges(inspections, findings);
    renderPortalNotifications(notifications);
    fillCustomerRequestForms(properties);
    renderCustomerRequests(requests, requestMessages);
    const customerMetrics = [...document.querySelectorAll("#dashboard article")];
    const metricValues = [properties.length, inspections.length, reports.length, findings.length];
    const metricNotes = [
      properties.length ? `${properties.length} gekoppeld object${properties.length === 1 ? "" : "en"}.` : "Geen objecten gekoppeld.",
      inspections.length ? `${inspections.length} inspectie${inspections.length === 1 ? "" : "s"} in het dossier.` : "Nog geen inspecties.",
      reports.length ? `${reports.length} gepubliceerd${reports.length === 1 ? " rapport" : "e rapporten"}.` : "Nog geen rapporten.",
      findings.length ? `${findings.length} vastgelegde bevinding${findings.length === 1 ? "" : "en"}.` : "Nog geen bevindingen.",
    ];
    customerMetrics.forEach((card, index) => {
      if (card.querySelector("strong")) card.querySelector("strong").textContent = String(metricValues[index] || 0);
      if (card.querySelector("p")) card.querySelector("p").textContent = metricNotes[index] || "";
    });
  }

  function initializePortalNavigation() {
    const links = [...document.querySelectorAll(".portal-nav a[href^='#']")];
    const sections = links.map((link) => document.querySelector(link.getAttribute("href"))).filter(Boolean);
    if (!links.length || !sections.length) return;
    const viewCopy = {
      dashboard: ["Overzicht en open acties.", "De belangrijkste cijfers en vervolgstappen van RoofSignal."],
      klanten: ["Klanten en objecten.", "Zoek een klant, open het dossier of maak een nieuwe klant aan."],
      offertes: ["Offertes maken en opvolgen.", "Van concept en verzending tot akkoord en planning."],
      planning: ["Planning en afspraken.", "Bekijk inspectiedata, objecten en toegewezen inspecteurs."],
      inspecties: ["Inspecties en rapportage.", "Volg de uitvoering, bevindingen en oplevering per object."],
      facturen: ["Facturen en betalingen.", "Bekijk betaalstatus, betaallinks en openstaande acties."],
      support: ["Support en klantvragen.", "Beantwoord vragen en volg interne taken per klantdossier."],
      rechten: ["Medewerkers en HR.", "Beheer personeelsdossiers, contracten, verlof, verzuim, rollen en toegang."]
    };
    const activate = (requestedId, updateHash = false) => {
      const available = links.find((link) => link.hash === `#${requestedId}` && !link.hidden);
      const id = (available || links.find((link) => !link.hidden))?.hash.slice(1);
      if (!id) return;
      sections.forEach((section) => { section.hidden = section.id !== id; });
      document.querySelectorAll("[data-admin-dashboard-preview]").forEach((section) => { section.hidden = id !== "dashboard"; });
      links.forEach((link) => link.classList.toggle("active", link.hash === `#${id}`));
      document.body.dataset.adminView = id;
      const createCustomerButton = document.querySelector(".admin-create-button");
      if (createCustomerButton) createCustomerButton.hidden = id === "rechten";
      const heading = document.querySelector(".portal-topbar h1");
      const intro = document.querySelector(".portal-topbar h1 + p");
      if (heading && viewCopy[id]) heading.textContent = viewCopy[id][0];
      if (intro && viewCopy[id]) intro.textContent = viewCopy[id][1];
      if (updateHash && window.location.hash !== `#${id}`) history.pushState(null, "", `#${id}`);
      window.scrollTo({ top: 0, behavior: "instant" });
    };
    links.forEach((link) => link.addEventListener("click", (event) => {
      event.preventDefault();
      activate(link.hash.slice(1), true);
    }));
    document.querySelectorAll("[data-admin-view-link]").forEach((link) => link.addEventListener("click", (event) => {
      event.preventDefault();
      activate(link.dataset.adminViewLink, true);
    }));
    document.querySelectorAll('[data-admin-view-link][role="link"]').forEach((link) => link.addEventListener("keydown", (event) => {
      if (!["Enter", " "].includes(event.key)) return;
      event.preventDefault();
      activate(link.dataset.adminViewLink, true);
    }));
    window.addEventListener("popstate", () => activate(window.location.hash.slice(1) || "dashboard"));
    window.addEventListener("hashchange", () => activate(window.location.hash.slice(1) || "dashboard"));
    window.RoofSignalAdminNavigate = (id) => activate(id, true);
    activate(window.location.hash.slice(1) || "dashboard");
  }

  function initializeAdminListTools() {
    if (!document.body.matches('[data-portal-surface="internal"]')) return;
    const collections = [
      ["klanten", "table", "Zoek klant of object"], ["offertes", "table", "Zoek offerte"],
      ["inspecties", "table", "Zoek inspectie"], ["facturen", "table", "Zoek factuur"],
      ["rechten", "table", "Zoek teamlid of rol"], ["planning", ".timeline-list", "Zoek afspraak"],
      ["support", ".admin-support", "Zoek klantvraag"]
    ];
    collections.forEach(([id, selector, placeholder]) => {
      const section = document.getElementById(id);
      const collection = section?.querySelector(selector);
      if (!section || !collection || collection.dataset.listToolsReady) return;
      collection.dataset.listToolsReady = "true";
      const toolbar = document.createElement("div");
      toolbar.className = "admin-list-toolbar";
      toolbar.innerHTML = `<label><span class="sr-only">${placeholder}</span><input type="search" placeholder="${placeholder}" data-list-search></label>${selector === "table" ? '<label class="admin-status-filter"><span class="sr-only">Filter op status</span><select data-list-status><option value="">Alle statussen</option></select></label>' : ""}<label class="admin-page-size"><span>Regels</span><select data-list-size><option>10</option><option>25</option><option>50</option></select></label><span data-list-count></span><div class="admin-list-pages"><button type="button" data-list-prev aria-label="Vorige pagina">‹</button><span data-list-page></span><button type="button" data-list-next aria-label="Volgende pagina">›</button></div>`;
      collection.before(toolbar);
      let page = 1;
      const items = () => selector === "table" ? [...collection.querySelectorAll("tbody tr:not([data-empty-row])")] : [...collection.children].filter((item) => !item.dataset.emptyRow);
      const update = () => {
        const query = toolbar.querySelector("[data-list-search]").value.trim().toLowerCase();
        const statusSelect = toolbar.querySelector("[data-list-status]");
        const selectedStatus = statusSelect?.value || "";
        const size = Number(toolbar.querySelector("[data-list-size]").value);
        const all = items();
        if (statusSelect) {
          const currentOptions = new Set([...statusSelect.options].map((option) => option.value));
          [...new Set(all.map((item) => item.querySelector(".status-dot")?.dataset.statusLabel).filter(Boolean))].sort().forEach((status) => {
            if (!currentOptions.has(status)) statusSelect.add(new Option(status, status));
          });
        }
        const matches = all.filter((item) => (!query || item.textContent.toLowerCase().includes(query)) && (!selectedStatus || item.querySelector(".status-dot")?.dataset.statusLabel === selectedStatus));
        const pages = Math.max(1, Math.ceil(matches.length / size));
        page = Math.min(Math.max(page, 1), pages);
        all.forEach((item) => { item.hidden = true; });
        matches.slice((page - 1) * size, page * size).forEach((item) => { item.hidden = false; });
        toolbar.querySelector("[data-list-count]").textContent = `${matches.length} resultaat${matches.length === 1 ? "" : "en"}`;
        toolbar.querySelector("[data-list-page]").textContent = `${page} / ${pages}`;
        toolbar.querySelector("[data-list-prev]").disabled = page <= 1;
        toolbar.querySelector("[data-list-next]").disabled = page >= pages;
      };
      toolbar.addEventListener("input", () => { page = 1; update(); });
      toolbar.querySelector("[data-list-prev]").addEventListener("click", () => { page -= 1; update(); });
      toolbar.querySelector("[data-list-next]").addEventListener("click", () => { page += 1; update(); });
      new MutationObserver(update).observe(selector === "table" ? collection.querySelector("tbody") : collection, { childList: true });
      update();
    });
  }

  function initializeAdminGlobalSearch() {
    const input = document.querySelector("[data-admin-global-search]");
    const results = document.querySelector("[data-admin-search-results]");
    if (!input || !results) return;
    const moduleNames = { klanten: "Klanten", offertes: "Offertes", planning: "Planning", inspecties: "Inspecties", facturen: "Facturen", support: "Support", rechten: "Medewerkers & HR" };
    input.addEventListener("input", () => {
      const query = input.value.trim().toLowerCase();
      if (query.length < 2) { results.hidden = true; results.innerHTML = ""; return; }
      const found = [];
      Object.keys(moduleNames).forEach((id) => {
        const section = document.getElementById(id);
        const candidates = section ? [...section.querySelectorAll("tbody tr:not([data-empty-row]), .timeline-list > div:not([data-empty-row]), .admin-support > *:not([data-empty-row])")] : [];
        candidates.filter((item) => item.textContent.toLowerCase().includes(query)).slice(0, 3).forEach((item) => found.push({ id, text: item.textContent.trim().replace(/\s+/g, " ") }));
      });
      results.innerHTML = found.length ? found.slice(0, 10).map((item) => `<button type="button" data-admin-view-target="${item.id}"><strong>${moduleNames[item.id]}</strong><span>${escapeHtml(item.text.slice(0, 110))}</span></button>`).join("") : '<p>Geen resultaten gevonden.</p>';
      results.hidden = false;
    });
    results.addEventListener("click", (event) => {
      const target = event.target.closest("[data-admin-view-target]");
      if (!target) return;
      window.RoofSignalAdminNavigate?.(target.dataset.adminViewTarget);
      const local = document.getElementById(target.dataset.adminViewTarget)?.querySelector("[data-list-search]");
      if (local) { local.value = input.value; local.dispatchEvent(new Event("input", { bubbles: true })); }
      results.hidden = true;
    });
    document.addEventListener("click", (event) => { if (!event.target.closest(".admin-global-search")) results.hidden = true; });
  }

  function initializeCustomerGlobalSearch() {
    const input = document.querySelector("[data-customer-global-search]");
    const results = document.querySelector("[data-customer-search-results]");
    if (!input || !results) return;
    const modules = {
      objecten: ["Mijn objecten", "#objecten"], offertes: ["Offertes en documenten", "#offertes"],
      inspecties: ["Inspecties en rapporten", "#inspecties"], planning: ["Afspraken", "#planning"],
      financieel: ["Facturen", "#financieel"], aanvragen: ["Aanvragen en contact", "#aanvragen"],
      notificaties: ["Meldingen", "#notificaties"]
    };
    input.addEventListener("input", () => {
      const query = input.value.trim().toLowerCase();
      if (query.length < 2) { results.hidden = true; results.innerHTML = ""; return; }
      const found = [];
      Object.entries(modules).forEach(([id, [label]]) => {
        const section = document.getElementById(id);
        if (!section) return;
        const candidates = [...section.querySelectorAll("tbody tr, article, .customer-object-card, .customer-quote-card, .timeline-list > div, .portal-notification")];
        if (label.toLowerCase().includes(query)) found.push({ id, label, text: "Open dit onderdeel" });
        candidates.filter((item) => item.textContent.toLowerCase().includes(query)).slice(0, 3).forEach((item) => found.push({ id, label, text: item.textContent.trim().replace(/\s+/g, " ").slice(0, 110) }));
      });
      results.innerHTML = found.length ? found.slice(0, 10).map((item) => `<button type="button" data-customer-search-target="${item.id}"><strong>${escapeHtml(item.label)}</strong><span>${escapeHtml(item.text)}</span></button>`).join("") : '<p>Geen resultaten in uw dossier.</p>';
      results.hidden = false;
    });
    results.addEventListener("click", (event) => {
      const target = event.target.closest("[data-customer-search-target]");
      if (!target) return;
      const section = document.getElementById(target.dataset.customerSearchTarget);
      if (!section) return;
      history.pushState(null, "", `#${target.dataset.customerSearchTarget}`);
      section.scrollIntoView({ behavior: "smooth", block: "start" });
      results.hidden = true;
    });
    document.addEventListener("click", (event) => { if (!event.target.closest(".customer-global-search")) results.hidden = true; });
  }

  function deleteCurrentCustomer() {
    const heading = document.querySelector(".portal-topbar h1");
    const name = heading?.textContent.trim().replace(/\.$/, "") || "deze klant";
    if (!confirm(`${name} verwijderen uit het RoofSignal Portaal?`)) return;
    document.querySelector(".admin-toolbar p").textContent = "Deze klant is gemarkeerd voor verwijdering. In de live versie wordt dit doorgevoerd in de database en auditlog.";
    localStorage.removeItem("roofsignal-current-customer");
    localStorage.removeItem("roofsignal-current-customer-id");
  }

  function applyInternalRole(roles) {
    if (!document.body.matches('[data-portal-surface="internal"]')) return;
    roles = Array.isArray(roles) ? roles : [roles];
    const roleAccess = {
      owner_admin: ["dashboard", "klanten", "inspecties", "planning", "facturen", "offertes", "support", "rechten"],
      hr: ["rechten"],
      support: ["dashboard", "klanten", "inspecties", "support"],
      planning: ["dashboard", "klanten", "inspecties", "planning"],
      finance: ["dashboard", "klanten", "facturen", "offertes"],
      reportage: ["dashboard", "klanten", "inspecties"],
      inspector: ["dashboard", "inspecties", "planning"],
    };
    const allowed = [...new Set(roles.flatMap((role) => roleAccess[role] || []))];
    const owner = roles.includes("owner_admin");
    document.querySelectorAll("[data-role-administration]").forEach((element) => { element.hidden = !owner; });
    ["dashboard", "klanten", "inspecties", "planning", "facturen", "offertes", "support", "rechten"].forEach((id) => {
      const visible = allowed.includes(id);
      const section = document.getElementById(id);
      const link = document.querySelector(`.portal-nav a[href="#${id}"]`);
      if (section) section.hidden = !visible;
      if (link) link.hidden = !visible;
    });
  }

  async function bootstrapPortal() {
    const surface = document.body.dataset.portalSurface;
    const backend = window.RoofSignalBackend;
    if (!surface || !backend?.isConfigured) {
      window.location.replace("portal-login.html");
      return;
    }
    portalAccess = await backend.requirePortalAccess(surface);
    if (!portalAccess.ok) {
      window.location.replace(portalAccess.reason === "customer_only" ? "portal-klant.html" : "portal-login.html");
      return;
    }
    if (surface === "internal") applyInternalRole(portalAccess.profile.roles || [portalAccess.profile.role]);
    if (surface === "internal") window.RoofSignalAdminNavigate?.(window.location.hash.slice(1) || "dashboard");
    document.body.classList.remove("portal-auth-pending");
    loadState();
    loadCurrentCustomer();
    if (surface === "customer") await loadCustomerPortalData();
    if (surface === "internal") {
      await loadLiveAdminData();
      syncCustomerOwnedData();
    }
  }

  bootstrapPortal();
  initializePortalNavigation();
  initializeAdminListTools();
  initializeAdminGlobalSearch();
  initializeCustomerGlobalSearch();

  document.addEventListener("click", (event) => {
    const calendarNav = event.target.closest("[data-calendar-nav]");
    if (calendarNav) {
      resourceCalendarWeekOffset = calendarNav.dataset.calendarNav === "today" ? 0 : resourceCalendarWeekOffset + (calendarNav.dataset.calendarNav === "next" ? 1 : -1);
      renderResourceCalendar();
      return;
    }
    const calendarEvent = event.target.closest(".calendar-event-card");
    if (calendarEvent) { openRecordContext(calendarEvent); return; }
    const dashboardPreview = event.target.closest("[data-dashboard-preview-kind]");
    if (dashboardPreview) { openDashboardPreview(dashboardPreview); return; }
    const customerRowTarget = event.target.closest(".customer-clickable-row");
    if (customerRowTarget && !event.target.closest("a, button, input, select, textarea")) { openCustomer(customerRowTarget); return; }
    const recordRowTarget = event.target.closest(".record-clickable-row");
    if (recordRowTarget && !event.target.closest("a, button, input, select, textarea")) { openRecordContext(recordRowTarget); return; }
    const dialogClose = event.target.closest("[data-dialog-close]");
    if (dialogClose) { event.preventDefault(); dialogClose.closest("dialog")?.close(); return; }
    const signOut = event.target.closest(".portal-account a[href^='portal-login']");
    if (signOut) {
      event.preventDefault();
      signOutPortal();
      return;
    }

    const takeover = event.target.closest("#klanten tbody a[href^='portal-klant']");
    if (takeover) {
      event.preventDefault();
      impersonateCustomer(rowFor(takeover));
      return;
    }

    const customerProperty = event.target.closest("[data-customer-property-id]");
    if (customerProperty && !event.target.closest("[data-portal-action]")) {
      event.preventDefault();
      selectCustomerProperty(customerProperty.dataset.customerPropertyId);
      return;
    }

    const portalTarget = event.target.closest("[data-portal-action]");
    if (portalTarget) {
      event.preventDefault();
      const portalAction = portalTarget.dataset.portalAction;
      if (portalAction === "request-upgrade") {
        requestUpgrade(portalTarget);
        return;
      }
      if (portalAction === "add-customer-object") return openCustomerObjectDialog();
      if (portalAction === "open-customer-object") return selectCustomerProperty(portalTarget.dataset.propertyId);
      if (portalAction === "edit-customer-object") return openCustomerObjectDialog(customerPortalState?.properties.find((item) => item.id === portalTarget.dataset.propertyId));
      if (portalAction === "delete-customer-object") return deleteCustomerObject(portalTarget.dataset.propertyId);
      if (portalAction === "accept-customer-quote") return acceptCustomerQuote(portalTarget.dataset.quoteId);
      if (portalAction === "appointment-response") return respondToCustomerAppointment(portalTarget.dataset.appointmentId, portalTarget.dataset.response);
      if (portalAction === "mark-all-notifications-read") { window.RoofSignalBackend.markAllPortalNotificationsRead().then((result) => { if (!result.ok) return setPortalNotice(result.error?.message || "Meldingen bijwerken is mislukt.", "error"); loadCustomerPortalData(); }); return; }
      handlePortalAction(portalAction);
      return;
    }

    const notificationLink = event.target.closest("[data-notification-id]");
    if (notificationLink) window.RoofSignalBackend.markPortalNotificationRead(notificationLink.dataset.notificationId);

    const target = event.target.closest("[data-admin-action]");
    if (!target) return;
    const action = target.dataset.adminAction;
    if (action !== "assign-role") event.preventDefault();

    if (action === "assign-role") assignRole();
    if (action === "focus-customer-form") focusCustomerForm();
    if (action === "focus-role-builder") focusRoleBuilder();
    if (action === "create-offer") createOffer();
    if (action === "create-support-task") createSupportTask();
    if (action === "manage-customer") openCustomer(rowFor(target));
    if (action === "send-account-mail") sendCustomerAccessMail(rowFor(target), "magiclink");
    if (action === "send-password-mail") sendCustomerAccessMail(rowFor(target), "password_reset");
    if (action === "customer-objects") openCustomerWorkflow("objects");
    if (action === "customer-inspection") openCustomerWorkflow("inspection");
    if (action === "customer-quote") openCustomerWorkflow("quote");
    if (action === "customer-task") openCustomerWorkflow("task");
    if (action === "open-inspection") openInspection(target.dataset.inspectionId);
    if (action === "accept-quote") acceptQuote(target.dataset.quoteId);
    if (action === "send-quote") sendQuote(target.dataset.quoteId);
    if (action === "send-quote-custom") sendQuoteCustom(target.dataset.quoteId);
    if (action === "edit-sent-quote") editSentQuote(target.dataset.quoteId);
    if (action === "sync-quote-items") syncQuoteItems(target.dataset.quoteId);
    if (action === "staff-calendar-feed") createCalendarFeed(target.dataset.profileId);
    if (action === "resend-appointment") resendAppointment(target.dataset.appointmentId);
    if (action === "copy-calendar-feed") copyCalendarFeed();
    if (action === "open-employee") openEmployeeDossier(target.dataset.profileId);
    if (action === "open-employee-document") window.RoofSignalBackend.openEmployeeDocument(target.dataset.storagePath).then((result) => { if (result.ok) window.open(result.data.signedUrl, "_blank", "noopener"); else setPortalNotice(result.error?.message || "Document openen is mislukt.", "error"); });
    if (action === "schedule-quote") openQuoteSchedule(target.dataset.quoteId);
    if (action === "invoice-quote") invoiceQuote(target.dataset.quoteId);
    if (action === "activate-upgrade") activateUpgrade(target);
    if (action === "finding-to-maintenance") findingToMaintenance(target);
    if (action === "send-invoice-mail") sendInvoiceMail(target.dataset.invoiceId, false);
    if (action === "send-invoice-reminder") sendInvoiceMail(target.dataset.invoiceId, true);
    if (action === "open-invoice") openInvoicePdf(target.dataset.invoiceId, target.closest(".record-clickable-row"));
    if (action === "pay-invoice") changeInvoiceStatus(target.dataset.invoiceId, "paid");
    if (action === "set-payment-link") setInvoicePaymentLink(target.dataset.invoiceId);
    if (action === "credit-invoice") creditInvoice(target.dataset.invoiceId);
    if (action === "complete-maintenance") completeMaintenance(target);
    if (action === "verify-maintenance") verifyMaintenance(target);
    if (action === "manage-objects") manageObjects(rowFor(target));
    if (action === "save-object") saveObject(target.closest("[data-property-id]"));
    if (action === "delete-object") deleteObject(target.closest("[data-property-id]"));
    if (action === "close-object-manager") closeObjectManager();
    if (action === "edit-customer") editCustomer(rowFor(target));
    if (action === "delete-customer") deleteCustomer(rowFor(target));
    if (action === "edit-role") editRole(rowFor(target));
    if (action === "remove-role") removeRole(rowFor(target));
    if (action === "edit-current-customer") editCurrentCustomer();
    if (action === "delete-current-customer") deleteCurrentCustomer();
  });

  document.addEventListener("keydown", (event) => {
    const customerRowTarget = event.target.closest?.(".customer-clickable-row");
    const recordRowTarget = event.target.closest?.(".record-clickable-row");
    if ((!customerRowTarget && !recordRowTarget) || !["Enter", " "].includes(event.key)) return;
    event.preventDefault();
    if (customerRowTarget) openCustomer(customerRowTarget);
    if (recordRowTarget) openRecordContext(recordRowTarget);
  });

  document.addEventListener("submit", (event) => {
    if (event.target.matches?.("[data-appointment-inspector-form]")) {
      submitAppointmentInspector(event);
      return;
    }
    const button = event.target.querySelector?.('button[type="submit"]');
    if (button && /opslaan|vastleggen|bijwerken|toevoegen|publiceren/i.test(button.textContent)) activeSaveButton = button;
  }, true);
  customerCreateForm?.addEventListener("submit", createCustomer);
  customerSearchInput?.addEventListener("input", filterCustomers);
  inspectionForm?.querySelector('[name="organization_id"]')?.addEventListener("change", (event) => loadInspectionObjects(event.target.value));
  inspectionForm?.addEventListener("submit", createInspection);
  quoteForm?.querySelector('[name="organization_id"]')?.addEventListener("change", (event) => loadQuoteObjects(event.target.value));
  quoteForm?.addEventListener("change", (event) => {
    if (event.target.matches('[data-quote-item-field="inspection_depth"]')) updateQuoteDepth(event.target.closest("[data-quote-property]"));
  });
  quoteForm?.addEventListener("submit", submitQuote);
  quoteScheduleForm?.addEventListener("submit", submitQuoteSchedule);
  taskForm?.addEventListener("submit", submitTask);
  inspectionStatusForm?.addEventListener("submit", submitInspectionStatus);
  findingForm?.addEventListener("submit", submitFinding);
  reportForm?.addEventListener("submit", submitReport);
  mediaUploadForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!activeInspection) return setWorkflowStatus(mediaUploadStatus, "Open eerst een inspectiedossier.", "error");
    const data = new FormData(mediaUploadForm);
    const files = [...mediaUploadForm.elements.media_files.files];
    if (!files.length) return setWorkflowStatus(mediaUploadStatus, "Selecteer minimaal één foto of video.", "error");
    const tooLarge = files.filter((file) => file.size > 50 * 1024 * 1024);
    if (tooLarge.length) return setWorkflowStatus(mediaUploadStatus, `${tooLarge[0].name} is groter dan 50 MB. Verklein dit bestand of upload de video afzonderlijk.`, "error");
    const unsupported = files.filter((file) => file.type && !/^(image|video)\//.test(file.type));
    if (unsupported.length) return setWorkflowStatus(mediaUploadStatus, `${unsupported[0].name} is geen ondersteund foto- of videobestand.`, "error");

    const button = mediaUploadForm.querySelector('button[type="submit"]');
    const originalLabel = button.textContent;
    const payload = { organization_id: activeInspection.organization_id, property_id: activeInspection.property_id, inspection_id: activeInspection.id, media_type: data.get("media_type"), required_depth: data.get("required_depth") };
    let cursor = 0; let completed = 0; const failures = [];
    button.disabled = true;
    const updateProgress = () => { button.textContent = `${completed}/${files.length} geüpload`; setWorkflowStatus(mediaUploadStatus, `Bezig met uploaden: ${completed} van ${files.length} bestanden. Laat dit venster open.`, ""); };
    updateProgress();
    const worker = async () => {
      while (cursor < files.length) {
        const file = files[cursor++];
        let result = await window.RoofSignalBackend.uploadInspectionMedia(file, payload);
        if (!result.ok) result = await window.RoofSignalBackend.uploadInspectionMedia(file, payload);
        if (!result.ok) failures.push({ file: file.name, message: result.error?.message || "Upload mislukt" });
        completed += 1; updateProgress();
      }
    };
    try {
      await Promise.all(Array.from({ length: Math.min(3, files.length) }, worker));
      const uploaded = files.length - failures.length;
      renderInspectionMedia(await window.RoofSignalBackend.listInspectionMedia(activeInspection.id));
      if (failures.length) {
        setWorkflowStatus(mediaUploadStatus, `${uploaded} van ${files.length} bestanden zijn geüpload. Mislukt: ${failures.slice(0, 3).map((item) => item.file).join(", ")}${failures.length > 3 ? ` en ${failures.length - 3} meer` : ""}. Selecteer alleen deze bestanden opnieuw.`, "error");
      } else {
        mediaUploadForm.reset();
        setWorkflowStatus(mediaUploadStatus, `${uploaded} bestand${uploaded === 1 ? "" : "en"} succesvol geüpload.`, "success");
      }
    } finally {
      button.disabled = false; button.textContent = originalLabel;
    }
  });
  inspectionChecklist?.addEventListener("change", async (event) => {
    const select = event.target.closest("[data-checklist-item]"); if (!select) return;
    await window.RoofSignalBackend.updateChecklistItem(select.dataset.checklistItem, { status: select.value, completed_at: ["observed","not_observed","not_applicable"].includes(select.value) ? new Date().toISOString() : null });
    renderInspectionChecklist(await window.RoofSignalBackend.listInspectionChecklist(activeInspection.id));
  });
  contactCreateForm?.addEventListener("submit", submitContact);
  activityCreateForm?.addEventListener("submit", submitActivity);
  customerProfileForm?.addEventListener("submit", async (event) => {
    event.preventDefault(); const data = new FormData(customerProfileForm); const status = customerProfileForm.querySelector("[data-customer-profile-status]");
    const result = await window.RoofSignalBackend.completeCustomerProfile(String(data.get("full_name") || "").trim(), String(data.get("phone") || "").trim());
    setWorkflowStatus(status, result.ok ? "Contactgegevens zijn opgeslagen." : result.error?.message || "Opslaan is mislukt.", result.ok ? "success" : "error");
  });
  document.querySelectorAll("[data-customer-request-form]").forEach((form) => form.addEventListener("submit", (event) => {
    event.preventDefault();
    submitCustomerRequest(form);
  }));
  document.querySelector("[data-customer-object-form]")?.addEventListener("submit", (event) => { event.preventDefault(); submitCustomerObject(event.currentTarget); });
  document.querySelector("[data-object-assistant-form]")?.addEventListener("submit", (event) => { event.preventDefault(); const data = new FormData(event.currentTarget); answerObjectQuestion(String(data.get("question") || "")); });
  document.addEventListener("submit", async (event) => {
    const roleDefinitionForm = event.target.closest("[data-role-definition]");
    if (roleDefinitionForm) {
      event.preventDefault();
      const description = String(new FormData(roleDefinitionForm).get("description") || "").trim();
      const result = await window.RoofSignalBackend.updateRoleDefinition(roleDefinitionForm.dataset.roleDefinition, description);
      return setPortalNotice(result.ok ? "Functiebeschrijving is opgeslagen." : result.error?.message || "Functiebeschrijving opslaan is mislukt.", result.ok ? "success" : "error");
    }
    const form = event.target.closest("[data-request-message-form]"); if (!form) return; event.preventDefault();
    const status = form.querySelector(".form-note"); const message = String(new FormData(form).get("message") || "").trim();
    const result = await window.RoofSignalBackend.createRequestMessage(form.dataset.requestId, customerPortalState.organizationId, message);
    if (!result.ok) return setWorkflowStatus(status, result.error?.message || "Bericht versturen is mislukt.", "error");
    form.reset(); customerPortalState.requestMessages = await window.RoofSignalBackend.listRequestMessages(customerPortalState.organizationId); renderCustomerRequests(customerPortalState.requests, customerPortalState.requestMessages);
  });
  document.addEventListener("submit", async (event) => {
    const form = event.target.closest("[data-admin-request-message-form]"); if (!form) return; event.preventDefault();
    const status = form.querySelector(".form-note"); const message = String(new FormData(form).get("message") || "").trim();
    const result = await window.RoofSignalBackend.createRequestMessage(form.dataset.requestId, form.dataset.organizationId, message, "staff");
    if (!result.ok) return setWorkflowStatus(status, result.error?.message || "Antwoord versturen is mislukt.", "error");
    form.reset(); setWorkflowStatus(status, "Antwoord is zichtbaar in het klantenportaal.", "success"); await loadLiveAdminData();
  });
})();
