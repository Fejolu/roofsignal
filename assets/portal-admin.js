(() => {
  const stateKey = "roofsignal-admin-html";
  const roleRights = {
    "Owner admin": "Alles",
    Support: "Support, meekijken, dossiers",
    Planning: "Agenda, beoordelingen, toegang",
    Finance: "Facturen, offertes, betaalstatus",
    Rapportage: "Rapporten, objectdata, exports",
  };
  const roleLabels = {
    owner_admin: "Owner admin",
    support: "Support",
    planning: "Planning",
    finance: "Finance",
    rapportage: "Rapportage",
    customer: "Klant",
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
  const inspectionWorkspaceStatus = document.querySelector("[data-inspection-workspace-status]");
  const inspectionStatusForm = document.querySelector("[data-inspection-status-form]");
  const findingForm = document.querySelector("[data-finding-create-form]");
  const findingList = document.querySelector("[data-finding-list]");
  const reportForm = document.querySelector("[data-report-create-form]");
  const quoteForm = document.querySelector("[data-quote-create-form]");
  const taskForm = document.querySelector("[data-task-create-form]");
  let activeObjectCustomerRow = null;
  let activeCustomerObjects = [];
  let liveOrganizations = [];
  let liveInspections = [];
  let activeInspection = null;
  let portalAccess = null;

  function saveState() {
    // Operational data lives in Supabase. Browser storage is not a system of record.
  }

  function loadState() {
    localStorage.removeItem(stateKey);
  }

  function statusCell(label, tone = "green") {
    return `<span class="status-dot ${tone}">${label}</span>`;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
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
    };
    return statuses[String(status || "").toLowerCase()] || { label: status || "Actief", tone: "green" };
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
    return '<div class="table-actions"><a href="portal-klant.html">Overnemen</a><a href="#klanten" data-admin-action="manage-objects">Objecten</a><a href="#klanten" data-admin-action="edit-customer">Bewerken</a><a class="text-danger" href="#klanten" data-admin-action="delete-customer">Verwijderen</a></div>';
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
    return `<tr${idAttribute}${customerAttribute} data-search="${escapeHtml(searchText)}"><td>${escapeHtml(customer.name || "-")}</td><td>${escapeHtml(customer.segment || "-")}</td><td>${escapeHtml(objects)}</td><td>${escapeHtml(activity)}</td><td>${statusCell(escapeHtml(meta.label), meta.tone)}</td><td>${customerActions()}</td></tr>`;
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
    if (!profiles.length) {
      rolesBody.innerHTML = '<tr data-empty-row><td colspan="5">Geen teamleden gevonden.</td></tr>';
      return;
    }
    rolesBody.innerHTML = profiles.map((profile) => {
      const role = roleLabels[profile.role] || profile.role;
      return `<tr><td>${profile.email}</td><td>${roleCell(role)}</td><td>${roleRights[role] || "Aangepaste rechten"}</td><td>${statusCell("Actief")}</td><td><div class="table-actions"><a href="#rechten" data-admin-action="edit-role">Bewerken</a><a class="text-danger" href="#rechten" data-admin-action="remove-role">Verwijderen</a></div></td></tr>`;
    }).join("");
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
    inspectionBody.innerHTML = inspections.map((inspection) => `<tr><td>${escapeHtml(inspection.reference || inspection.id.slice(0, 8).toUpperCase())}</td><td>${escapeHtml(inspection.organizations?.name || "-")}</td><td>${escapeHtml(inspection.properties?.name || "-")}</td><td>${escapeHtml(inspection.scope || "-")}</td><td>${statusCell(escapeHtml(inspection.status), inspection.status === "delivered" ? "green" : "yellow")}</td><td><button class="inline-button" type="button" data-admin-action="open-inspection" data-inspection-id="${escapeHtml(inspection.id)}">Open</button></td></tr>`).join("");
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

  function populateInspectionOrganizations(organizations) {
    const select = inspectionForm?.querySelector('[name="organization_id"]');
    if (!select) return;
    select.innerHTML = '<option value="">Selecteer klant</option>' + organizations.map((organization) => `<option value="${escapeHtml(organization.id)}">${escapeHtml(organization.name)}</option>`).join("");
  }

  function formatMoney(value) {
    return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(Number(value || 0));
  }

  function renderInvoices(invoices = []) {
    if (!invoicesBody) return;
    invoicesBody.innerHTML = invoices.length
      ? invoices.map((invoice) => `<tr><td>${escapeHtml(invoice.organizations?.name || "-")}</td><td>${escapeHtml(formatMoney(invoice.amount))}</td><td>${statusCell(escapeHtml(invoice.status || "Concept"), invoice.status === "paid" ? "green" : "yellow")}</td></tr>`).join("")
      : '<tr data-empty-row><td colspan="3">Geen facturen.</td></tr>';
  }

  function renderQuotes(quotes = []) {
    if (!offersBody) return;
    offersBody.innerHTML = quotes.length
      ? quotes.map((quote) => `<tr><td>${escapeHtml(quote.organizations?.name || "-")}</td><td>${escapeHtml(quote.title || quote.quote_number || "Offerte")}</td><td>${escapeHtml(formatMoney(quote.amount))}</td><td>${statusCell(escapeHtml(quote.status || "Concept"), quote.status === "accepted" ? "green" : "yellow")}</td></tr>`).join("")
      : '<tr data-empty-row><td colspan="4">Geen offertes.</td></tr>';
  }

  function renderAppointments(appointments = []) {
    if (!planningList) return;
    planningList.innerHTML = appointments.length
      ? appointments.map((appointment) => `<div><span>${escapeHtml(formatPortalDate(appointment.starts_at))}</span><strong>${escapeHtml(appointment.title || "Afspraak")}</strong><p>${escapeHtml([appointment.organizations?.name, appointment.properties?.name, appointment.status].filter(Boolean).join(" · "))}</p></div>`).join("")
      : '<div data-empty-row><strong>Geen planning</strong><span>Er zijn geen afspraken geladen.</span></div>';
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

  async function loadLiveAdminData() {
    const backend = window.RoofSignalBackend;
    if (!backend?.isConfigured || (!customersBody && !rolesBody)) return;
    const [customers, profiles, inspections, invoices, quotes, appointments, tasks] = await Promise.all([
      backend.listOrganizations(),
      backend.listProfiles(),
      backend.listInspections(),
      backend.listInvoices(),
      backend.listQuotes(),
      backend.listAppointments(),
      backend.listTasks(),
    ]);
    liveOrganizations = customers;
    renderCustomers(customers);
    renderRoles(profiles);
    renderInspections(inspections);
    renderInvoices(invoices);
    renderQuotes(quotes);
    renderAppointments(appointments);
    renderTasks(tasks);
    renderAdminMetrics(customers, inspections, invoices, quotes, tasks);
    populateInspectionOrganizations(customers);
    populateWorkflowOrganizations(customers);
    syncCustomerOwnedData();
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
    const properties = await window.RoofSignalBackend.listOrganizationProperties(organizationId);
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
      scope: String(formData.get("scope") || "").trim(),
      scheduled_at: formData.get("scheduled_at") ? new Date(String(formData.get("scheduled_at"))).toISOString() : null,
      status: formData.get("scheduled_at") ? "planned" : "intake",
    };
    if (!payload.organization_id || !payload.property_id || !payload.scope) return;
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

    cells[0].textContent = name;
    cells[1].textContent = segment;
    cells[3].textContent = activity;
    row.dataset.customerKey = customerKey(name);
    if (window.RoofSignalBackend?.isConfigured && row.dataset.customerId) {
      await window.RoofSignalBackend.updateOrganization(row.dataset.customerId, {
        name,
        segment,
        notes: activity,
      });
    }
    syncCustomerOwnedData();
    saveState();
  }

  function linkCustomerRows() {
    customersBody?.querySelectorAll("tr").forEach((row) => {
      if (row.dataset.emptyRow) return;
      row.dataset.customerKey = customerKey(customerNameFromRow(row));
      if (!row.dataset.search) row.dataset.search = row.textContent;
      const actions = row.querySelector(".table-actions");
      if (actions && !actions.querySelector("[data-admin-action='manage-objects']")) {
        const takeover = actions.querySelector("a[href^='portal-klant']");
        takeover?.insertAdjacentHTML("afterend", '<a href="#klanten" data-admin-action="manage-objects">Objecten</a>');
      }
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
      notice.className = "portal-action-note";
      const anchor = main.querySelector(".portal-topbar") || main.firstElementChild;
      anchor?.insertAdjacentElement("afterend", notice);
    }
    notice.dataset.statusTone = tone;
    notice.textContent = message;
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
    quoteForm?.scrollIntoView({ behavior: "smooth", block: "center" });
    quoteForm?.querySelector('[name="organization_id"]')?.focus();
  }

  function createSupportTask() {
    taskForm?.scrollIntoView({ behavior: "smooth", block: "center" });
    taskForm?.querySelector('[name="organization_id"]')?.focus();
  }

  function setWorkflowStatus(element, message, tone = "") {
    if (!element) return;
    element.textContent = message;
    element.dataset.statusTone = tone;
  }

  async function loadQuoteObjects(organizationId) {
    const select = quoteForm?.querySelector('[name="property_id"]');
    if (!select) return;
    const properties = organizationId ? await window.RoofSignalBackend.listOrganizationProperties(organizationId) : [];
    select.innerHTML = '<option value="">Geen specifiek object</option>' + properties.map((property) => `<option value="${escapeHtml(property.id)}">${escapeHtml(property.name)}</option>`).join("");
    select.disabled = !organizationId;
  }

  async function submitQuote(event) {
    event.preventDefault();
    const data = new FormData(quoteForm);
    const result = await window.RoofSignalBackend.createQuote({ organization_id: data.get("organization_id"), property_id: data.get("property_id") || null, title: String(data.get("title") || "").trim(), amount: Number(data.get("amount") || 0), status: "draft" });
    const status = quoteForm.querySelector("[data-quote-create-status]");
    if (!result.ok) return setWorkflowStatus(status, result.error?.message || "Offerte opslaan is mislukt.", "error");
    quoteForm.reset(); await loadQuoteObjects("");
    setWorkflowStatus(status, "Conceptofferte is opgeslagen.", "success");
    renderQuotes(await window.RoofSignalBackend.listQuotes());
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
    findingList.innerHTML = findings.length ? findings.map((finding) => `<article><strong>${escapeHtml(finding.title)}</strong><span>${escapeHtml([finding.building_element, finding.priority, finding.seriousness].filter(Boolean).join(" · "))}</span><p>${escapeHtml(finding.description || "")}</p></article>`).join("") : '<div class="empty-state">Nog geen bevindingen vastgelegd.</div>';
  }

  async function openInspection(id) {
    activeInspection = liveInspections.find((inspection) => inspection.id === id);
    if (!activeInspection || !inspectionWorkspace) return;
    inspectionWorkspace.hidden = false;
    if (inspectionWorkspaceTitle) inspectionWorkspaceTitle.textContent = `${activeInspection.reference || "Inspectie"} · ${activeInspection.properties?.name || "Object"}`;
    inspectionStatusForm.elements.status.value = activeInspection.status || "intake";
    inspectionStatusForm.elements.summary.value = activeInspection.summary || "";
    renderFindings(await window.RoofSignalBackend.listFindings(id));
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
    const result = await window.RoofSignalBackend.createFinding({ organization_id: activeInspection.organization_id, property_id: activeInspection.property_id, inspection_id: activeInspection.id, title: String(data.get("title") || "").trim(), building_element: String(data.get("building_element") || "").trim() || null, priority: data.get("priority"), condition_score: data.get("condition_score") ? Number(data.get("condition_score")) : null, recommendation: String(data.get("recommendation") || "").trim() || null, source: "manual" });
    if (!result.ok) return setWorkflowStatus(inspectionWorkspaceStatus, result.error?.message || "Bevinding opslaan is mislukt.", "error");
    findingForm.reset(); renderFindings(await window.RoofSignalBackend.listFindings(activeInspection.id));
    setWorkflowStatus(inspectionWorkspaceStatus, "Bevinding is vastgelegd.", "success");
  }

  async function submitReport(event) {
    event.preventDefault(); if (!activeInspection) return;
    const data = new FormData(reportForm);
    const result = await window.RoofSignalBackend.createReport({ organization_id: activeInspection.organization_id, property_id: activeInspection.property_id, inspection_id: activeInspection.id, title: String(data.get("title") || "").trim(), summary: inspectionStatusForm.elements.summary.value.trim() || null, report_url: String(data.get("report_url") || "").trim() || null, status: "published", published_at: new Date().toISOString() });
    if (!result.ok) return setWorkflowStatus(inspectionWorkspaceStatus, result.error?.message || "Rapport publiceren is mislukt.", "error");
    await window.RoofSignalBackend.updateInspection(activeInspection.id, { status: "delivered", inspected_at: activeInspection.inspected_at || new Date().toISOString() });
    reportForm.reset(); setWorkflowStatus(inspectionWorkspaceStatus, "Rapport is gepubliceerd in het klantenportaal.", "success");
    renderInspections(await window.RoofSignalBackend.listInspections());
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
      "plan-reinspection", "request-inspection", "add-object", "unlock-modules", "prepare-accountant-export",
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

    if (action === "plan-reinspection") {
      addPlanningItem("Nieuw", "Herinspectie plannen", "Voorstel klaarzetten op basis van weer, toegang en herstelstatus.");
      return;
    }
    if (action === "request-inspection") {
      addPlanningItem("Aanvraag", "Nieuwe inspectie aangevraagd", "Backoffice plant scope, toegang en gewenste dataset met de klant.");
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
    const cells = row.querySelectorAll("td");
    const email = prompt("E-mailadres", cells[0].textContent.trim());
    if (!email) return;
    const currentRole = cells[1].textContent.trim();
    const role = prompt("Rol", currentRole);
    if (!role) return;

    cells[0].textContent = email;
    cells[1].innerHTML = roleCell(role);
    cells[2].textContent = roleRights[role] || "Aangepaste rechten";
    cells[3].innerHTML = statusCell("Actief");
    if (window.RoofSignalBackend?.isConfigured) {
      await window.RoofSignalBackend.updateProfileRole(email, role === "Owner admin" ? "owner_admin" : role.toLowerCase());
    }
    saveState();
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
      const result = await window.RoofSignalBackend.updateProfileRole(email, role === "Owner admin" ? "owner_admin" : role.toLowerCase());
      if (!result.ok) alert("Deze gebruiker bestaat nog niet in Supabase Auth. Maak eerst het account aan of laat de gebruiker inloggen.");
    }
    if (!existing) rolesBody.append(row);
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
    if (invoicesBody) invoicesBody.innerHTML = '<tr><td colspan="3">Geen facturen of abonnementen.</td></tr>';
    const financeAdminBody = document.querySelector("#finance-hub tbody");
    if (financeAdminBody) financeAdminBody.innerHTML = '<tr><td colspan="4">Geen financiële administratie beschikbaar.</td></tr>';

    document.querySelectorAll("#finance-hub .finance-kpi-grid article").forEach((card) => {
      const value = card.querySelector("strong");
      const note = card.querySelector("p");
      if (value) value.textContent = card.querySelector("span")?.textContent === "Churn" ? "0%" : "EUR 0";
      if (note) note.textContent = "Geen financiële data.";
    });

    const aiPrompts = document.querySelector("#ai .ai-prompt-list");
    if (aiPrompts) aiPrompts.innerHTML = emptyState("AI-acties worden beschikbaar zodra inspectiedata bestaat.");
    const aiAnswer = document.querySelector("#ai .ai-answer");
    if (aiAnswer) aiAnswer.innerHTML = "<strong>Geen analyse beschikbaar</strong><p>Er is nog geen inspectiedata om te analyseren.</p>";
    const complexity = document.querySelector("#planning .complexity-score");
    if (complexity) complexity.innerHTML = "<span>Inspection Complexity Score</span><strong>0 / 5</strong><p>Nog niet berekend.</p>";
  }

  function formatPortalDate(value) {
    if (!value) return "-";
    return new Intl.DateTimeFormat("nl-NL", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
  }

  function renderCustomerProperties(properties) {
    const objectList = document.querySelector(".object-list");
    if (!objectList || !properties.length) return;
    objectList.innerHTML = properties.map((property) => [
      '<article class="object-card">',
      '<div>',
      `<span class="status-pill demo">${escapeHtml(property.status || "Actief")}</span>`,
      `<h3>${escapeHtml(property.name || "Object")}</h3>`,
      `<p>${escapeHtml([property.address, property.postcode, property.city].filter(Boolean).join(", ") || "Adres niet vastgelegd.")}</p>`,
      '</div>',
      '<dl>',
      `<div><dt>Object-ID</dt><dd>${escapeHtml(property.id)}</dd></div>`,
      '<div><dt>Laatste inspectie</dt><dd>Nog niet geïnspecteerd</dd></div>',
      '</dl>',
      '</article>',
    ].join("")).join("");

    const first = properties[0];
    const dossierTitle = document.querySelector("#objectdossier h2");
    if (dossierTitle) dossierTitle.textContent = first.name || "Object";
    const firstBody = document.querySelector("#objectdossier .object-dossier-grid > div:first-child tbody");
    if (firstBody) firstBody.innerHTML = [
      `<tr><th>Adres</th><td>${escapeHtml([first.address, first.postcode, first.city].filter(Boolean).join(", ") || "Niet vastgelegd")}</td></tr>`,
      `<tr><th>Objectstatus</th><td>${escapeHtml(first.status || "Actief")}</td></tr>`,
      '<tr><th>Inspectiestatus</th><td>Nog niet geïnspecteerd</td></tr>',
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
  }

  function renderCustomerInspections(inspections, properties, reports = []) {
    const body = document.querySelector("#inspecties tbody");
    if (!body || !inspections.length) return;
    const propertyNames = new Map(properties.map((property) => [property.id, property.name]));
    const reportByInspection = new Map(reports.map((report) => [report.inspection_id, report]));
    body.innerHTML = inspections.map((inspection) => {
      const report = reportByInspection.get(inspection.id);
      const reportLink = report?.report_url ? `<a href="${escapeHtml(report.report_url)}" target="_blank" rel="noopener">Open rapport</a>` : report ? "Gepubliceerd" : "-";
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

  function renderCustomerFindings(findings = []) {
    const feed = document.querySelector(".intelligence-feed");
    const conditionBody = document.querySelector("#objectdossier .object-dossier-grid > div:nth-child(3) tbody");
    if (feed) feed.innerHTML = findings.length ? findings.map((finding) => `<article><strong>${escapeHtml(finding.title)}</strong><p>${escapeHtml([finding.building_element, finding.condition_score ? `conditie ${finding.condition_score}` : "", finding.recommendation].filter(Boolean).join(" · "))}</p></article>`).join("") : emptyState("Nog geen Property Intelligence beschikbaar.");
    if (conditionBody) conditionBody.innerHTML = findings.length ? findings.map((finding) => `<tr><th>${escapeHtml(finding.building_element || "Bevinding")}</th><td>${escapeHtml(finding.condition_score || finding.priority || "Vastgelegd")}</td></tr>`).join("") : '<tr><td colspan="2">Geen conditiedata beschikbaar.</td></tr>';
  }

  function renderCustomerAppointments(appointments) {
    const list = document.querySelector("#planning .timeline-list");
    if (!list || !appointments.length) return;
    list.innerHTML = appointments.map((appointment) => [
      "<div>",
      `<span>${escapeHtml(formatPortalDate(appointment.starts_at))}</span>`,
      `<strong>${escapeHtml(appointment.title || "Afspraak")}</strong>`,
      `<p>${escapeHtml(appointment.notes || appointment.status || "Gepland")}</p>`,
      "</div>",
    ].join("")).join("");
  }

  function renderCustomerInvoices(invoices) {
    const body = document.querySelector("#financieel tbody");
    if (!body || !invoices.length) return;
    const money = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" });
    body.innerHTML = invoices.map((invoice) => `<tr><td>${escapeHtml(invoice.invoice_number || "Factuur")}</td><td>${escapeHtml(money.format(Number(invoice.amount || 0)))}</td><td>${statusCell(escapeHtml(invoice.status || "Concept"), invoice.status === "paid" ? "green" : "yellow")}</td></tr>`).join("");
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

    const organization = (await backend.listOrganizations()).find((item) => item.id === organizationId);
    if (organization) {
      const heading = document.querySelector(".portal-topbar h1");
      const account = document.querySelector(".portal-account strong");
      if (heading) heading.textContent = organization.name;
      if (account) account.textContent = organization.name;
    }

    const [properties, inspections, invoices, appointments, reports] = await Promise.all([
      backend.listOrganizationProperties(organizationId),
      backend.listInspections(organizationId),
      backend.listOrganizationInvoices(organizationId),
      backend.listOrganizationAppointments(organizationId),
      backend.listOrganizationReports(organizationId),
    ]);
    const findings = (await Promise.all(inspections.map((inspection) => backend.listFindings(inspection.id)))).flat();
    renderCustomerProperties(properties);
    renderCustomerInspections(inspections, properties, reports);
    renderCustomerFindings(findings);
    renderCustomerInvoices(invoices);
    renderCustomerAppointments(appointments);

    const objectMetric = document.querySelector("#dashboard article:first-child");
    if (objectMetric) {
      objectMetric.querySelector("strong").textContent = String(properties.length);
      objectMetric.querySelector("p").textContent = properties.length ? `${properties.length} gekoppeld object${properties.length === 1 ? "" : "en"}.` : "Geen objecten gekoppeld.";
    }
  }

  function deleteCurrentCustomer() {
    const heading = document.querySelector(".portal-topbar h1");
    const name = heading?.textContent.trim().replace(/\.$/, "") || "deze klant";
    if (!confirm(`${name} verwijderen uit het RoofSignal Portaal?`)) return;
    document.querySelector(".admin-toolbar p").textContent = "Deze klant is gemarkeerd voor verwijdering. In de live versie wordt dit doorgevoerd in de database en auditlog.";
    localStorage.removeItem("roofsignal-current-customer");
    localStorage.removeItem("roofsignal-current-customer-id");
  }

  function applyInternalRole(role) {
    if (!document.body.matches('[data-portal-surface="internal"]')) return;
    const allowed = {
      owner_admin: ["dashboard", "klanten", "inspecties", "planning", "facturen", "offertes", "support", "rechten"],
      support: ["dashboard", "klanten", "inspecties", "support"],
      planning: ["dashboard", "klanten", "inspecties", "planning"],
      finance: ["dashboard", "klanten", "facturen", "offertes"],
      reportage: ["dashboard", "klanten", "inspecties"],
    }[role] || [];
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
    if (surface === "internal") applyInternalRole(portalAccess.profile.role);
    document.body.classList.remove("portal-auth-pending");
    loadState();
    loadCurrentCustomer();
    if (surface === "customer") await loadCustomerPortalData();
    if (surface === "internal") await loadLiveAdminData();
    syncCustomerOwnedData();
  }

  bootstrapPortal();

  document.addEventListener("click", (event) => {
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

    const portalTarget = event.target.closest("[data-portal-action]");
    if (portalTarget) {
      event.preventDefault();
      handlePortalAction(portalTarget.dataset.portalAction);
      return;
    }

    const target = event.target.closest("[data-admin-action]");
    if (!target) return;
    const action = target.dataset.adminAction;
    if (action !== "assign-role") event.preventDefault();

    if (action === "assign-role") assignRole();
    if (action === "focus-customer-form") focusCustomerForm();
    if (action === "focus-role-builder") focusRoleBuilder();
    if (action === "create-offer") createOffer();
    if (action === "create-support-task") createSupportTask();
    if (action === "open-inspection") openInspection(target.dataset.inspectionId);
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

  customerCreateForm?.addEventListener("submit", createCustomer);
  customerSearchInput?.addEventListener("input", filterCustomers);
  inspectionForm?.querySelector('[name="organization_id"]')?.addEventListener("change", (event) => loadInspectionObjects(event.target.value));
  inspectionForm?.addEventListener("submit", createInspection);
  quoteForm?.querySelector('[name="organization_id"]')?.addEventListener("change", (event) => loadQuoteObjects(event.target.value));
  quoteForm?.addEventListener("submit", submitQuote);
  taskForm?.addEventListener("submit", submitTask);
  inspectionStatusForm?.addEventListener("submit", submitInspectionStatus);
  findingForm?.addEventListener("submit", submitFinding);
  reportForm?.addEventListener("submit", submitReport);
})();
