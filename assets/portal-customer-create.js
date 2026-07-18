(() => {
  const stateKey = "roofsignal-admin-html";
  const form = document.querySelector("#customer-detail-form");
  const status = document.querySelector("[data-customer-detail-status]");

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

  function parseObjects(value) {
    return String(value || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  }

  function buildNotes(customer, objects) {
    return [
      customer.contact_name ? `Contactpersoon: ${customer.contact_name}` : "",
      customer.contact_phone ? `Telefoon: ${customer.contact_phone}` : "",
      customer.address ? `Adres: ${customer.address}` : "",
      customer.kvk_number ? `KvK: ${customer.kvk_number}` : "",
      customer.bank_account ? `Bankrekening: ${customer.bank_account}` : "",
      objects.length ? `Objecten:\n- ${objects.join("\n- ")}` : "",
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
      objects.join(" "),
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
      address: String(data.get("address") || "").trim() || null,
      kvk_number: String(data.get("kvk_number") || "").trim() || null,
      bank_account: String(data.get("bank_account") || "").trim() || null,
      status: "prospect",
    };
    const objects = parseObjects(data.get("objects"));
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
              name: object,
              address: customer.address,
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

  form?.addEventListener("submit", submitCustomer);
})();
