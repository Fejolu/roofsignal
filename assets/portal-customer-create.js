(() => {
  const form = document.querySelector("#customer-detail-form");
  const status = document.querySelector("[data-customer-detail-status]");
  const objectList = document.querySelector("[data-object-entry-list]");
  const addObjectButton = document.querySelector("[data-add-object]");
  const objectPreview = document.querySelector("[data-object-preview]");
  const addressLookupEndpoint = "https://api.pdok.nl/bzk/locatieserver/search/v3_1";
  const addressLookupStates = [];
  let customerAddressLookupState = null;
  let objectSequence = 0;

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function setStatus(message, tone = "") {
    if (!status) return;
    status.textContent = message;
    status.dataset.statusTone = tone;
  }

  function formatAddress(parts) {
    const streetLine = [parts.street, parts.house_number].filter(Boolean).join(" ");
    const cityLine = [parts.postcode, parts.city].filter(Boolean).join(" ");
    return [streetLine, cityLine].filter(Boolean).join(", ");
  }

  function normalizePostcode(value) {
    const compact = String(value || "").replace(/\s+/g, "").toUpperCase();
    const match = compact.match(/^(\d{4})([A-Z]{2})$/);
    return match ? `${match[1]} ${match[2]}` : String(value || "").trim().toUpperCase();
  }

  function readAddressFromFields(fields) {
    return {
      street: fields.street?.value.trim() || "",
      house_number: fields.houseNumber?.value.trim() || "",
      postcode: normalizePostcode(fields.postcode?.value || ""),
      city: fields.city?.value.trim() || "",
    };
  }

  function hasAddressInput(address) {
    return Boolean(address.street || address.house_number || address.postcode || address.city);
  }

  function addressLookupQuery(address) {
    return [
      address.street,
      address.house_number,
      address.postcode,
      address.city,
    ].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  }

  function addressFromPdokDoc(doc) {
    const postcode = normalizePostcode(doc.postcode || "");
    const houseNumber = String(doc.huis_nlt || [
      doc.huisnummer,
      doc.huisletter,
      doc.huisnummertoevoeging,
    ].filter(Boolean).join("") || "").trim();
    return {
      street: String(doc.straatnaam || doc.openbareruimtenaam || "").trim(),
      house_number: houseNumber,
      postcode,
      city: String(doc.woonplaatsnaam || "").trim(),
    };
  }

  function addressFields(container, prefix = "") {
    const field = (name) => prefix ? `input[name="${prefix}_${name}"]` : `input[name="${name}"]`;
    return {
      street: container.querySelector(field("street")),
      houseNumber: container.querySelector(field("house_number")),
      postcode: container.querySelector(field("postcode")),
      city: container.querySelector(field("city")),
    };
  }

  function setLookupPanel(state, tone, message, suggestions = []) {
    state.panel.dataset.statusTone = tone || "";
    state.suggestions = suggestions;
    const list = suggestions.length
      ? `<div class="address-suggestion-list">${suggestions.map((suggestion, index) => (
        `<button type="button" data-address-suggestion="${index}">${escapeHtml(suggestion.weergavenaam || "Adres")}</button>`
      )).join("")}</div>`
      : "";
    state.panel.innerHTML = `<p>${escapeHtml(message)}</p>${list}`;
    state.panel.querySelectorAll("[data-address-suggestion]").forEach((button) => {
      button.addEventListener("click", () => selectAddressSuggestion(state, Number(button.dataset.addressSuggestion)));
    });
  }

  async function fetchAddressSuggestions(state) {
    const address = readAddressFromFields(state.fields);
    const query = addressLookupQuery(address);
    state.lastQuery = query;

    if (query.length < 4) {
      setLookupPanel(state, "", "Typ straat, huisnummer, postcode of plaats om het adres te controleren.");
      return [];
    }

    state.controller?.abort();
    state.controller = new AbortController();
    setLookupPanel(state, "info", "Adres controleren...");

    try {
      const params = new URLSearchParams({ q: query, fq: "type:adres", rows: "5" });
      const response = await fetch(`${addressLookupEndpoint}/suggest?${params}`, {
        signal: state.controller.signal,
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error("Adrescheck is tijdelijk niet beschikbaar.");
      const payload = await response.json();
      const suggestions = payload?.response?.docs || [];
      if (state.lastQuery !== query) return suggestions;
      if (!suggestions.length) {
        setLookupPanel(state, "error", "Geen officieel BAG-adres gevonden. Controleer straat, huisnummer, postcode en plaats.");
        return suggestions;
      }
      setLookupPanel(state, "info", "Kies het juiste officiële adres uit de suggesties.", suggestions);
      return suggestions;
    } catch (error) {
      if (error?.name === "AbortError") return [];
      setLookupPanel(state, "error", error?.message || "Adrescheck is tijdelijk niet beschikbaar.");
      return [];
    }
  }

  function scheduleAddressLookup(state) {
    window.clearTimeout(state.timer);
    state.timer = window.setTimeout(() => fetchAddressSuggestions(state), 280);
  }

  function applyAddressToFields(state, address) {
    state.suppressInput = true;
    state.fields.street.value = address.street;
    state.fields.houseNumber.value = address.house_number;
    state.fields.postcode.value = address.postcode;
    state.fields.city.value = address.city;
    Object.values(state.fields).forEach((field) => field.dispatchEvent(new Event("input", { bubbles: true })));
    state.suppressInput = false;
  }

  async function selectAddressSuggestion(state, index) {
    const suggestion = state.suggestions[index];
    if (!suggestion?.id) return;
    setLookupPanel(state, "info", "Officieel adres ophalen...");

    try {
      const params = new URLSearchParams({ id: suggestion.id });
      const response = await fetch(`${addressLookupEndpoint}/lookup?${params}`, {
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error("Adres kon niet worden opgehaald.");
      const payload = await response.json();
      const doc = payload?.response?.docs?.[0] || suggestion;
      const address = addressFromPdokDoc(doc);
      if (!hasAddressInput(address)) throw new Error("Adresgegevens zijn onvolledig.");
      applyAddressToFields(state, address);
      state.valid = true;
      state.selectedId = suggestion.id;
      setLookupPanel(state, "success", `Adres gecontroleerd: ${formatAddress(address)}.`);
    } catch (error) {
      state.valid = false;
      setLookupPanel(state, "error", error?.message || "Adres kon niet worden gecontroleerd.");
    }
  }

  function initAddressLookup(container, prefix = "") {
    if (!container) return null;
    const fields = addressFields(container, prefix);
    if (!fields.street || !fields.houseNumber || !fields.postcode || !fields.city) return null;

    const panel = document.createElement("div");
    panel.className = "address-lookup-panel";
    panel.setAttribute("aria-live", "polite");
    container.dataset.addressLookup = "";
    container.append(panel);

    const state = {
      container,
      fields,
      panel,
      suggestions: [],
      valid: false,
      selectedId: "",
      timer: 0,
      controller: null,
      lastQuery: "",
      suppressInput: false,
    };

    Object.values(fields).forEach((field) => {
      field.addEventListener("input", () => {
        if (state.suppressInput) return;
        state.valid = false;
        state.selectedId = "";
        scheduleAddressLookup(state);
      });
    });
    setLookupPanel(state, "", "Typ straat, huisnummer, postcode of plaats om het adres te controleren.");
    addressLookupStates.push(state);
    return state;
  }

  function removeAddressLookup(container) {
    for (let index = addressLookupStates.length - 1; index >= 0; index -= 1) {
      const state = addressLookupStates[index];
      if (state.container !== container) continue;
      window.clearTimeout(state.timer);
      state.controller?.abort();
      addressLookupStates.splice(index, 1);
    }
  }

  async function validateAddressLookups() {
    for (const state of addressLookupStates) {
      const address = readAddressFromFields(state.fields);
      if (!hasAddressInput(address)) continue;
      if (state.valid) continue;
      await fetchAddressSuggestions(state);
      setLookupPanel(state, "error", "Kies een officieel BAG-adres uit de suggesties voordat u de klant aanmaakt.", state.suggestions);
      state.fields.street.focus();
      return false;
    }
    return true;
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

  function renderEmptyObjectPreview() {
    if (!objectPreview) return;
    objectPreview.innerHTML = [
      '<span class="eyebrow orange">Inspectie</span>',
      '<strong>Selecteer een object</strong>',
      '<p>Kies een object om de inspectievoorbereiding voor dat onderdeel te zien.</p>',
    ].join("");
  }

  function selectObject(entry) {
    objectList?.querySelectorAll("[data-object-entry]").forEach((item) => {
      item.classList.toggle("is-selected", item === entry);
    });
    updateObjectCardTitle(entry);
  }

  function removeObjectEntry(entry) {
    if (!entry || !objectList) return;
    const title = entry.querySelector("[data-object-title]")?.textContent.trim() || "dit object";
    if (!confirm(`${title} verwijderen uit deze klantaanmaak?`)) return;
    const wasSelected = entry.classList.contains("is-selected");
    removeAddressLookup(entry.querySelector(".object-entry-fields"));
    entry.remove();
    if (!wasSelected) return;
    const nextEntry = objectList.querySelector("[data-object-entry]");
    if (nextEntry) {
      selectObject(nextEntry);
    } else {
      renderEmptyObjectPreview();
    }
  }

  function copyCustomerAddress(entry, objectLookupState) {
    if (!form || !entry || !objectLookupState) return;
    const customerAddress = readAddressFromFields(addressFields(form));
    if (!hasAddressInput(customerAddress)) {
      setStatus("Vul eerst het klantadres in voordat u het naar een object overneemt.", "error");
      form.querySelector('input[name="street"]')?.focus();
      return;
    }

    applyAddressToFields(objectLookupState, customerAddress);
    objectLookupState.valid = Boolean(customerAddressLookupState?.valid);
    objectLookupState.selectedId = customerAddressLookupState?.selectedId || "";
    updateObjectCardTitle(entry);

    if (objectLookupState.valid) {
      setLookupPanel(objectLookupState, "success", `Klantadres overgenomen en gecontroleerd: ${formatAddress(customerAddress)}.`);
      setStatus("Het gecontroleerde klantadres is overgenomen naar het object.", "success");
    } else {
      setLookupPanel(objectLookupState, "info", "Klantadres overgenomen. Kies het officiële BAG-adres uit de suggesties om het te controleren.");
      scheduleAddressLookup(objectLookupState);
      setStatus("Klantadres overgenomen. Controleer het adres via de BAG-suggestie bij het object.");
    }
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
      '<div class="object-entry-actions">',
      '<button class="inline-button" type="button" data-copy-customer-address>Klantadres overnemen</button>',
      '<button class="inline-button text-danger" type="button" data-remove-object>Object verwijderen</button>',
      '</div>',
      '</div>',
    ].join("");
    objectList.append(entry);
    const objectLookupState = initAddressLookup(entry.querySelector(".object-entry-fields"), `object_${key}`);
    entry.addEventListener("input", () => updateObjectCardTitle(entry));
    entry.querySelector("[data-select-object]")?.addEventListener("click", () => selectObject(entry));
    entry.querySelector("[data-copy-customer-address]")?.addEventListener("click", () => copyCustomerAddress(entry, objectLookupState));
    entry.querySelector("[data-remove-object]")?.addEventListener("click", () => removeObjectEntry(entry));
    selectObject(entry);
  }

  async function submitCustomer(event) {
    event.preventDefault();
    if (!form) return;

    const data = new FormData(form);
    if (!(await validateAddressLookups())) return;

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
    const properties = objects.map((object) => ({
      name: object.name,
      address: object.address || customer.address,
      postcode: object.postcode || null,
      city: object.city || null,
      status: "active",
    }));

    const button = form.querySelector("button[type='submit']");
    button.disabled = true;
    setStatus("Klant wordt aangemaakt en activatiemail wordt verstuurd...", "");

    let syncedId = "";
    let syncWarning = "";
    try {
      if (window.RoofSignalBackend?.isConfigured) {
        const session = await window.RoofSignalBackend.getSession?.();
        if (!session) {
          throw new Error("Uw beheerderssessie is verlopen. Log opnieuw in via het RoofSignal Portaal en maak daarna de klant aan.");
        }

        const result = await window.RoofSignalBackend.createPortalCustomer(customer, properties);
        if (result.ok) {
          syncedId = result.data?.organization?.id || "";
        } else {
          const message = result.error?.message || "Klant kon niet volledig worden aangemaakt.";
          const authError = result.error?.status === 401 || /session|authorization|allowed/i.test(message);
          throw new Error(authError
            ? "Uw beheerderssessie is verlopen of heeft onvoldoende rechten. Log opnieuw in als beheerder en probeer het opnieuw."
            : message);
        }
      } else {
        syncWarning = " Supabase-sync is niet actief; er is geen activatiemail verstuurd.";
      }

      setStatus(syncWarning
        ? `${customer.name} staat lokaal in deze sessie.${syncWarning}`
        : `${customer.name} is aangemaakt en de activatiemail is verstuurd.`,
      syncWarning ? "error" : "success");
      window.setTimeout(() => {
        window.location.href = "portal-beheer.html#klanten";
      }, 650);
    } catch (error) {
      setStatus(error?.message || "Klant aanmaken is mislukt.", "error");
      button.disabled = false;
    }
  }

  async function bootstrapCustomerCreate() {
    const access = await window.RoofSignalBackend?.requirePortalAccess("internal");
    if (!access?.ok) {
      window.location.replace(access?.reason === "customer_only" ? "portal-klant.html" : "portal-login.html");
      return;
    }
    if (!access.internal || !["owner_admin", "support"].includes(access.profile?.role)) {
      window.location.replace("portal-beheer.html");
      return;
    }
    document.body.classList.remove("portal-auth-pending");
    addObjectButton?.addEventListener("click", () => addObjectEntry());
    customerAddressLookupState = initAddressLookup(form?.querySelector(".address-grid"));
    if (objectList && !objectList.children.length) addObjectEntry();
    form?.addEventListener("submit", submitCustomer);
  }

  bootstrapCustomerCreate();
})();
