(() => {
  const endpoint = `${window.ROOFSIGNAL_SUPABASE?.url || ""}/functions/v1/quote-acceptance`;
  const status = document.querySelector("[data-quote-status]");
  const summary = document.querySelector("[data-quote-summary]");
  const form = document.querySelector("[data-quote-accept-form]");
  const formStatus = document.querySelector("[data-accept-status]");
  const token = new URLSearchParams(window.location.search).get("token") || "";

  const escapeHtml = (value) => String(value ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  const money = (value) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(Number(value || 0));
  const date = (value) => value ? new Intl.DateTimeFormat("nl-NL", { dateStyle: "long" }).format(new Date(`${value}T12:00:00`)) : "-";
  const product = (value) => ({ quickscan: "Quickscan", object_report: "Objectrapportage", portfolio_scan: "Portefeuillescan" }[value] || value);
  const depth = (value) => ({ basis: "Basis", plus: "Plus", premium: "Premium" }[value] || value);

  async function request(action, extra = {}) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, token, ...extra }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "De serveractie is mislukt.");
    return payload;
  }

  function renderQuote(quote) {
    const documentCard = quote.documentUrl
      ? `<a class="quote-document-link" href="${escapeHtml(quote.documentUrl)}" target="_blank" rel="noopener" aria-label="Bekijk offerte ${escapeHtml(quote.quoteNumber || quote.title)} als PDF">
          <span>Offerte</span>
          <strong>${escapeHtml(quote.quoteNumber || quote.title)}</strong>
          <small>Bekijk offerte (PDF) <b aria-hidden="true">→</b></small>
        </a>`
      : `<div><dt>Offerte</dt><dd>${escapeHtml(quote.quoteNumber || quote.title)}</dd></div>`;
    const items = (quote.items || []).map((item) => {
      const property = item.properties || {};
      const address = [property.address, property.postcode, property.city].filter(Boolean).join(", ");
      return `<article><strong>${escapeHtml(property.name || address || "Object")}</strong><span>${escapeHtml(product(item.inspection_product))} ${escapeHtml(depth(item.inspection_depth))}</span><small>${escapeHtml(address)}</small><b>${escapeHtml(money(item.amount))} excl. btw</b></article>`;
    }).join("");
    summary.innerHTML = `
      <dl class="quote-acceptance-summary">
        ${documentCard}
        <div><dt>Klant</dt><dd>${escapeHtml(quote.organizationName || "-")}</dd></div>
        <div><dt>Totaal</dt><dd>${escapeHtml(money(quote.amount))} excl. btw</dd></div>
        <div><dt>Geldig tot</dt><dd>${escapeHtml(date(quote.validUntil))}</dd></div>
      </dl>
      <div class="quote-acceptance-items">${items}</div>`;
    summary.hidden = false;
    if (quote.status === "accepted") {
      status.textContent = `Deze offerte is al geaccepteerd${quote.acceptedByName ? ` door ${quote.acceptedByName}` : ""}.`;
      form.hidden = true;
      return;
    }
    status.textContent = "Controleer hieronder de offertegegevens en bevestig daarna uw akkoord.";
    form.hidden = false;
  }

  async function init() {
    if (!endpoint || token.length < 32) {
      status.textContent = "Deze offertelink is ongeldig.";
      return;
    }
    try {
      const payload = await request("view");
      renderQuote(payload.quote);
    } catch (error) {
      status.textContent = error.message;
    }
  }

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    formStatus.textContent = "Uw akkoord wordt geregistreerd…";
    form.querySelector("button").disabled = true;
    try {
      await request("accept", {
        actorName: String(data.get("actor_name") || "").trim(),
        actorEmail: String(data.get("actor_email") || "").trim(),
        confirmed: data.get("confirmed") === "on",
      });
      form.hidden = true;
      status.textContent = "Dank u. Uw akkoord is geregistreerd. RoofSignal ontvangt hiervan direct bericht en neemt de inspectie op in de planning.";
      summary.insertAdjacentHTML("afterend", '<div class="quote-acceptance-success"><strong>Offerte akkoord</strong><span>De opdracht staat nu klaar voor planning.</span></div>');
    } catch (error) {
      formStatus.textContent = error.message;
      formStatus.dataset.statusTone = "error";
      form.querySelector("button").disabled = false;
    }
  });

  init();
})();
