(() => {
  const stateKey = "roofsignal-admin-html";
  const form = document.querySelector("#customer-detail-form");
  const status = document.querySelector("[data-customer-detail-status]");
  const objectList = document.querySelector("[data-object-entry-list]");
  const addObjectButton = document.querySelector("[data-add-object]");
  const objectPreview = document.querySelector("[data-object-preview]");
  let objectSequence = 0;

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function customerKey(name) {
    return String(name || "").trim().toLowerCase();
  }

  function statusCell(label, tone = "yellow") {
    return `<span class="status-dot ${tone}">${escapeHtml(label)}</span>`;
  }

  function customerActions() {
    return '<div class="table-actions"><a href="portal-klant.html">Overnemen</a><a href="#klanten" data-admin-action="edit-customer">Bewerken</a><a class="text-danger" href="#klanten" data-admin-action="delete-customer">Verwijderen</a></div>';
  }

  function setStatus(message, tone = "") {
    if (!status) return;
    status.textContent = message;
    status.dataset.statusTone = tone;
  }

  function readState() {
    try {
      return JSON.parse(localStorage.getItem(stateKey) || "{}");
    } catch {
      return {};
    }
  }

  function writeState(state) {
    localStorage.setItem(stateKey, JSON.stringify(state));
  }

  function formatAddress(parts) {
    const streetLine = [parts.street, parts.house_number].filter(Boolean).join(" ");
    const cityLine = [parts.postcode, parts.city].filter(Boolean).join(" ");
    return [streetLine, cityLine].filter(Boolean).join(", ");
  }

  function readAddress(prefix, data) {
    const field = (name) => prefix ? `${prefix}_${name}` : name;
    return {
      street: String(data.get(field("street")) || "").trim(),
      house_number: String(data.get(field("house_number")) || "").trim(),
      postcode: String(data.get(field("postcode")) || "").trim(),
      city: String(data.get(field("city")) || "").trim(),
    };
  }

  function readObjects(data) {
    const entries = Array.from(objectList?.querySelectorAll("[data-object-entry]") || []);
    return entries.map((entry) => {
      const key = entry.dataset.objectKey;
      const address = readAddress(`object_${key}`, data);
      const name = String(data.get(`object_${key}_name`) || "").trim();
      const label = name || formatAddress(address);
      return {
        key,
        name: label,
        display_name: name,
        ...address,
        address: formatAddress(address),
      };
    }).filter((object) => object.name || object.address || object.postcode || object.city);
  }

  function objectSummary(object) {
    return [
      object.name,
      object.address && object.address !== object.name ? object.address : "",
    ].filter(Boolean).join(" - ");
  }

  function buildNotes(customer, objects) {
    return [
      customer.contact_name ? `Contactpersoon: ${customer.contact_name}` : "",
      customer.contact_phone ? `Telefoon: ${customer.contact_phone}` : "",
      customer.address ? `Adres: ${customer.address}` : "",
      customer.kvk_number ? `KvK: ${customer.kvk_number}` : "",
      customer.bank_account ? `Bankrekening: ${customer.bank_account}` : "",
      objects.length ? `Objecten:\n- ${objects.map(objectSummary).join("\n- ")}` : "",
    ].filter(Boolean).join("\n\n");
  }

  function appendLocalCustomer(customer, objects, syncedId = "") {
    const state = readState();
    const name = customer.name;
    const objectCount = objects.length;
    const searchText = [
      customer.name,
      customer.segment,
      customer.contact_name,
      customer.contact_email,
      customer.contact_phone,
      customer.address,
      customer.kvk_number,
      customer.bank_account,
      objects.map(objectSummary).join(" "),
      customer.notes,
    ].filter(Boolean).join(" ");
    const row = [
      `<tr${syncedId ? ` data-customer-id="${escapeHtml(syncedId)}"` : ""} data-customer-key="${escapeHtml(customerKey(name))}" data-search="${escapeHtml(searchText)}">`,
      `<td>${escapeHtml(name)}</td>`,
      `<td>${escapeHtml(customer.segment || "Klant")}</td>`,
      `<td>${objectCount}</td>`,
      `<td>${escapeHtml([customer.contact_name, customer.contact_email, customer.contact_phone].filter(Boolean).join(" / "))}</td>`,
      `<td>${statusCell("Prospect", "yellow")}</td>`,
      `<td>${customerActions()}</td>`,
      "</tr>",
    ].join("");

    const currentRows = String(state.customers || "")
      .replace(/<tr[^>]*data-empty-row[^>]*>[\s\S]*?<\/tr>/g, "");
    state.customers = `${row}${currentRows}`;
    writeState(state);
  }

  function updateObjectCardTitle(entry) {
    const key = entry.dataset.objectKey;
    const name = entry.querySelector(`[name="object_${key}_name"]`)?.value.trim();
    const street = entry.querySelector(`[name="object_${key}_street"]`)?.value.trim();
    const houseNumber = entry.querySelector(`[name="object_${key}_house_number"]`)?.value.trim();
    const postcode = entry.querySelector(`[name="object_${key}_postcode"]`)?.value.trim();
    const city = entry.querySelector(`[name="object_${key}_city"]`)?.value.trim();
    const title = entry.querySelector("[data-object-title]");
    const addressLine = formatAddress({ street, house_number: houseNumber, postcode, city });
    if (title) title.textContent = name || addressLine || `Object ${key}`;
    if (entry.classList.contains("is-selected")) {
      renderObjectPreview({ name: name || addressLine || `Object ${key}`, address: addressLine, postcode, city });
    }
  }

  function renderObjectPreview(object) {
    if (!objectPreview) return;
    objectPreview.innerHTML = [
      '<span class="eyebrow orange">Inspectie</span>',
      `<strong>${escapeHtml(object.name || "Object zonder naam")}</strong>`,
      `<p>${escapeHtml(object.address || "Adres nog niet compleet.")}</p>`,
      '<dl>',
      `<div><dt>Status</dt><dd>Inspectieconcept</dd></div>`,
      `<div><dt>Postcode</dt><dd>${escapeHtml(object.postcode || "-")}</dd></div>`,
      `<div><dt>Plaats</dt><dd>${escapeHtml(object.city || "-")}</dd></div>`,
      '<div><dt>Volgende stap</dt><dd>Scope bepalen</dd></div>',
      '</dl>',
    ].join("");
  }

  function selectObject(entry) {
    objectList?.querySelectorAll("[data-object-entry]").forEach((item) => {
      item.classList.toggle("is-selected", item === entry);
    });
    updateObjectCardTitle(entry);
  }

  function addObjectEntry(initial = {}) {
    if (!objectList) return;
    objectSequence += 1;
    const key = String(objectSequence);
    const entry = document.createElement("section");
    entry.className = "object-entry";
    entry.dataset.objectEntry = "";
    entry.dataset.objectKey = key;
    entry.innerHTML = [
      '<button class="object-entry-select" type="button" data-select-object>',
      `<span data-object-title>${escapeHtml(initial.name || `Object ${key}`)}</span>`,
      '<small>Inspectie bekijken</small>',
      '</button>',
      '<div class="object-entry-fields">',
      `<label>Objectnaam<input name="object_${key}_name" placeholder="Parkzicht Hoofdgebouw" value="${escapeHtml(initial.name || "")}"></label>`,
      `<label>Straat<input name="object_${key}_street" placeholder="Straatnaam" value="${escapeHtml(initial.street || "")}"></label>`,
      `<label>Huisnummer<input name="object_${key}_house_number" placeholder="12-48" value="${escapeHtml(initial.house_number || "")}"></label>`,
      `<label>Postcode<input name="object_${key}_postcode" placeholder="7311 AA" value="${escapeHtml(initial.postcode || "")}"></label>`,
      `<label>Plaats<input name="object_${key}_city" placeholder="Apeldoorn" value="${escapeHtml(initial.city || "")}"></label>`,
      '</div>',
    ].join("");
    objectList.append(entry);
    entry.addEventListener("input", () => updateObjectCardTitle(entry));
    entry.querySelector("[data-select-object]")?.addEventListener("click", () => selectObject(entry));
    selectObject(entry);
  }

  async function submitCustomer(event) {
    event.preventDefault();
    if (!form) return;

    const data = new FormData(form);
    const contactEmail = String(data.get("contact_email") || "").trim().toLowerCase();
    const emailInput = form.querySelector("input[name='contact_email']");
    emailInput?.setCustomValidity("");

    if (!contactEmail || !emailInput?.checkValidity()) {
      emailInput?.setCustomValidity("Vul een geldig e-mailadres in.");
      emailInput?.reportValidity();
      return;
    }

    const customer = {
      name: String(data.get("company_name") || data.get("contact_name") || contactEmail).trim(),
      segment: "Klant",
      contact_name: String(data.get("contact_name") || "").trim() || null,
      contact_email: contactEmail,
      contact_phone: String(data.get("contact_phone") || "").trim() || null,
      address: formatAddress(readAddress("", data)) || null,
      kvk_number: String(data.get("kvk_number") || "").trim() || null,
      bank_account: String(data.get("bank_account") || "").trim() || null,
      status: "prospect",
    };
    const objects = readObjects(data);
    customer.notes = buildNotes(customer, objects);

    const button = form.querySelector("button[type='submit']");
    button.disabled = true;
    setStatus("Klant wordt aangemaakt...", "");

    let syncedId = "";
    let syncWarning = "";
    try {
      if (window.RoofSignalBackend?.isConfigured) {
        const result = await window.RoofSignalBackend.createOrganization(customer);
        if (result.ok) {
          syncedId = result.data?.id || "";
          if (syncedId && objects.length) {
            const properties = objects.map((object) => ({
              organization_id: syncedId,
              name: object.name,
              address: object.address || customer.address,
              postcode: object.postcode || null,
              city: object.city || null,
              status: "active",
            }));
            const propertyResult = await window.RoofSignalBackend.createProperties(properties);
            if (!propertyResult.ok) syncWarning = " Objecten konden nog niet naar Supabase worden geschreven.";
          }
        } else {
          syncWarning = " Supabase-sync is niet gelukt; de klant staat lokaal in deze backoffice-sessie.";
        }
      }

      appendLocalCustomer(customer, objects, syncedId);
      setStatus(`${customer.name} is aangemaakt.${syncWarning}`, syncWarning ? "error" : "success");
      window.setTimeout(() => {
        window.location.href = "portal-beheer.html#klanten";
      }, 650);
    } catch (error) {
      setStatus(error?.message || "Klant aanmaken is mislukt.", "error");
      button.disabled = false;
    }
  }

  addObjectButton?.addEventListener("click", () => addObjectEntry());
  if (objectList && !objectList.children.length) addObjectEntry();
  form?.addEventListener("submit", submitCustomer);
})();
