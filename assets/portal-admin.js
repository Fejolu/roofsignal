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
  let activeObjectCustomerRow = null;
  let activeCustomerObjects = [];

  function saveState() {
    localStorage.setItem(stateKey, JSON.stringify({
      customers: customersBody?.innerHTML || "",
      roles: rolesBody?.innerHTML || "",
      offers: offersBody?.innerHTML || "",
      invoices: invoicesBody?.innerHTML || "",
      support: supportGrid?.innerHTML || "",
      planning: planningList?.innerHTML || "",
    }));
  }

  function hasState(state, key) {
    return Object.prototype.hasOwnProperty.call(state, key);
  }

  function loadState() {
    try {
      const state = JSON.parse(localStorage.getItem(stateKey) || "{}");
      if (hasState(state, "customers") && customersBody) customersBody.innerHTML = state.customers;
      if (hasState(state, "roles") && rolesBody) rolesBody.innerHTML = state.roles;
      if (hasState(state, "offers") && offersBody) offersBody.innerHTML = state.offers;
      if (hasState(state, "invoices") && invoicesBody) invoicesBody.innerHTML = state.invoices;
      if (hasState(state, "support") && supportGrid) supportGrid.innerHTML = state.support;
      if (hasState(state, "planning") && planningList) planningList.innerHTML = state.planning;
    } catch {
      localStorage.removeItem(stateKey);
    }
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
    if (!rolesBody || !profiles.length) return;
    rolesBody.innerHTML = profiles.map((profile) => {
      const role = roleLabels[profile.role] || profile.role;
      return `<tr><td>${profile.email}</td><td>${roleCell(role)}</td><td>${roleRights[role] || "Aangepaste rechten"}</td><td>${statusCell("Actief")}</td><td><div class="table-actions"><a href="#rechten" data-admin-action="edit-role">Bewerken</a><a class="text-danger" href="#rechten" data-admin-action="remove-role">Verwijderen</a></div></td></tr>`;
    }).join("");
  }

  async function loadLiveAdminData() {
    const backend = window.RoofSignalBackend;
    if (!backend?.isConfigured || (!customersBody && !rolesBody)) return;
    const [customers, profiles] = await Promise.all([
      backend.listOrganizations(),
      backend.listProfiles(),
    ]);
    renderCustomers(customers);
    renderRoles(profiles);
    syncCustomerOwnedData();
  }

  async function editCustomer(row) {
    const cells = row.querySelectorAll("td");
    const name = prompt("Klantnaam", cells[0].textContent.trim());
    if (!name) return;
    const segment = prompt("Segment", cells[1].textContent.trim());
    if (!segment) return;
    const objects = prompt("Aantal objecten", cells[2].textContent.trim());
    if (objects === null) return;
    const activity = prompt("Laatste activiteit", cells[3].textContent.trim());
    if (!activity) return;

    cells[0].textContent = name;
    cells[1].textContent = segment;
    cells[2].textContent = objects;
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

    if (pipeline && !hasCustomers) {
      pipeline.querySelectorAll("article").forEach((article) => {
        const value = article.querySelector("strong");
        const note = article.querySelector("p");
        if (value) value.textContent = "0";
        if (note) note.textContent = "Geen klantdata.";
      });
    }
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
    return [
      `<article class="object-edit-card" data-property-id="${escapeHtml(property.id || "")}">`,
      '<div class="object-edit-fields">',
      `<label>Objectnaam<input data-object-field="name" value="${escapeHtml(property.name || "")}" placeholder="Objectnaam"></label>`,
      `<label>Adres<input data-object-field="address" value="${escapeHtml(property.address || "")}" placeholder="Straat en huisnummer"></label>`,
      `<label>Postcode<input data-object-field="postcode" value="${escapeHtml(property.postcode || "")}" placeholder="7311 AA"></label>`,
      `<label>Plaats<input data-object-field="city" value="${escapeHtml(property.city || "")}" placeholder="Apeldoorn"></label>`,
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
    return {
      name: value("name") || "Object",
      address: value("address") || null,
      postcode: value("postcode") || null,
      city: value("city") || null,
      status: value("status") || "active",
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
    const name = row?.querySelector("td")?.textContent.trim() || "VvE Parkzicht";
    localStorage.setItem("roofsignal-current-customer", name);
    window.location.href = "portal-klant.html";
  }

  async function signOutPortal() {
    if (window.RoofSignalBackend?.isConfigured) {
      await window.RoofSignalBackend.signOut();
    }
    window.location.href = "portal-login.html";
  }

  function createOffer() {
    if (!offersBody) return;
    if (!customerKeys().size) {
      setPortalNotice("Maak eerst een klant aan voordat je een offerte aanmaakt.", "error");
      focusCustomerForm();
      return;
    }
    const customer = prompt("Klant voor deze offerte", "Nieuwe klant")?.trim();
    if (!customer) return;
    if (!hasCustomer(customer)) {
      setPortalNotice("Maak eerst de klant aan voordat je een offerte aanmaakt.", "error");
      focusCustomerForm();
      return;
    }
    const scope = prompt("Scope", "Dakinspectie en gebouwschilrapportage")?.trim();
    if (!scope) return;
    const amount = prompt("Bedrag", "EUR 1.250")?.trim();
    if (!amount) return;

    const row = document.createElement("tr");
    row.dataset.customerKey = customerKey(customer);
    row.innerHTML = `<td>${escapeHtml(customer)}</td><td>${escapeHtml(scope)}</td><td>${escapeHtml(amount)}</td><td>${statusCell("Concept", "yellow")}</td>`;
    offersBody.prepend(row);
    syncCustomerOwnedData();
    saveState();
    setPortalNotice(`Conceptofferte voor ${customer} is aangemaakt in Offertes.`, "success");
    document.querySelector("#offertes")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function createSupportTask() {
    if (!supportGrid) return;
    if (!customerKeys().size) {
      setPortalNotice("Maak eerst een klant aan voordat je een supporttaak toevoegt.", "error");
      focusCustomerForm();
      return;
    }
    const customer = prompt("Klant of dossier", "Nieuwe klant")?.trim();
    if (!customer) return;
    if (!hasCustomer(customer)) {
      setPortalNotice("Maak eerst de klant aan voordat je een supporttaak toevoegt.", "error");
      focusCustomerForm();
      return;
    }
    const task = prompt("Interne taak", "Portaaltoegang controleren en opvolging klaarzetten")?.trim();
    if (!task) return;

    const item = document.createElement("div");
    item.dataset.customerKey = customerKey(customer);
    item.innerHTML = `<strong>${escapeHtml(customer)}</strong><span>${escapeHtml(task)}</span>`;
    supportGrid.prepend(item);
    syncCustomerOwnedData();
    saveState();
    setPortalNotice(`Interne taak voor ${customer} is toegevoegd aan Support.`, "success");
    document.querySelector("#support")?.scrollIntoView({ behavior: "smooth", block: "start" });
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
    const email = row.querySelector("td")?.textContent.trim() || "dit teamlid";
    if (!confirm(`Rol van ${email} intrekken?`)) return;
    row.remove();
    saveState();
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
    const current = heading?.textContent.trim().replace(/\.$/, "") || "VvE Parkzicht";
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
    if (heading) heading.textContent = name;
    if (account) account.textContent = name;
  }

  function deleteCurrentCustomer() {
    const heading = document.querySelector(".portal-topbar h1");
    const name = heading?.textContent.trim().replace(/\.$/, "") || "deze klant";
    if (!confirm(`${name} verwijderen uit het RoofSignal Portaal?`)) return;
    document.querySelector(".admin-toolbar p").textContent = "Deze klant is gemarkeerd voor verwijdering. In de live versie wordt dit doorgevoerd in de database en auditlog.";
    localStorage.removeItem("roofsignal-current-customer");
  }

  loadState();
  loadCurrentCustomer();
  loadLiveAdminData();
  syncCustomerOwnedData();

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
})();
