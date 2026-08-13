(() => {
  const forms = document.querySelectorAll("[data-lead-form]");
  const contactPhone = "085 21 28 019";
  const contactEmail = "info@roofsignal.nl";

  function track(name, data) {
    window.RoofSignalAnalytics?.track(name, data || {});
  }

  function readField(data, ...names) {
    for (const name of names) {
      const value = data.get(name);
      if (value) return String(value).trim();
    }
    return "";
  }

  function appendDetail(lines, label, value) {
    if (value) lines.push(`${label}: ${value}`);
  }

  function buildPayload(form, type) {
    const data = new FormData(form);
    const messageLines = [];
    appendDetail(messageLines, "Bericht", readField(data, "message", "Bericht"));
    appendDetail(messageLines, "Telefoon", readField(data, "phone", "Telefoon"));
    appendDetail(messageLines, "Objecten/adressen", readField(data, "buildings", "Gebouwen", "objecten"));
    appendDetail(messageLines, "Demo-data", data.get("demo_data") ? "Ja" : "");

    return {
      type,
      name: readField(data, "name", "Naam"),
      organization: readField(data, "organization", "Organisatie", "organisatie"),
      email: readField(data, "email", "Email"),
      segment: readField(data, "segment"),
      postcode: readField(data, "postcode"),
      complexity: readField(data, "complexity"),
      site_access: readField(data, "site_access"),
      scope: readField(data, "scope"),
      message: messageLines.join("\n"),
      source_path: window.location.pathname,
    };
  }

  function successCopy(type) {
    if (type === "report") {
      return {
        title: "Voorbeeldrapport aangevraagd.",
        body: "Bedankt voor uw interesse in RoofSignal.",
        next: "We sturen direct een link naar het voorbeeldrapport.",
      };
    }

    if (type === "price") {
      return {
        title: "Offerteaanvraag ontvangen",
        body: "Bedankt voor uw aanvraag.",
        next: "U ontvangt eerst een automatische bevestiging. De offerte volgt meestal binnen 48 uur.",
      };
    }

    if (type === "access") {
      return {
        title: "Toegang aangevraagd",
        body: "Bedankt voor uw aanvraag.",
        next: "We controleren de organisatiegegevens en nemen contact op over de portaaltoegang.",
      };
    }

    return {
      title: "Aanvraag ontvangen",
      body: "Bedankt voor uw interesse in RoofSignal.",
      next: "We nemen contact op via het opgegeven e-mailadres.",
    };
  }

  function setBusy(form, isBusy) {
    const button = form.querySelector("button[type='submit']");
    if (!button) return;
    if (!button.dataset.originalText) button.dataset.originalText = button.textContent;
    button.disabled = isBusy;
    button.textContent = isBusy ? "Verzenden..." : button.dataset.originalText;
    form.setAttribute("aria-busy", String(isBusy));
  }

  function renderSuccess(status, type) {
    const copy = successCopy(type);
    status.className = "form-note form-status success";
    status.setAttribute("role", "status");
    status.innerHTML = `
      <strong><span aria-hidden="true">✓</span> ${copy.title}</strong>
      <span>${copy.body}</span>
      <span>${copy.next}</span>
      <span><b>Geen bevestigingsmail ontvangen binnen enkele minuten?</b><br>
        Neem contact op via <a href="tel:+31852128019">${contactPhone}</a> of
        <a href="contact">${contactEmail}</a>.
      </span>
    `;
  }

  function renderError(status) {
    status.className = "form-note form-status error";
    status.setAttribute("role", "alert");
    status.innerHTML = `
      <strong>Verzenden lukt niet</strong>
      <span>De aanvraag kon niet automatisch worden verwerkt. Neem direct contact op via
        <a href="tel:+31852128019">${contactPhone}</a> of
        <a href="contact">${contactEmail}</a>.
      </span>
    `;
  }

  async function submitProtectedLead(payload) {
    const config = window.ROOFSIGNAL_SUPABASE;
    if (!config?.url || !config?.anonKey) {
      throw new Error("Supabase email endpoint is not configured.");
    }
    const url = `${config.url}/functions/v1/submit-public-lead`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.anonKey}`,
      },
      body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.success) {
      throw new Error(result.error || "Email notification endpoint rejected the request.");
    }
    return result;
  }

  for (const form of forms) {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      const scrollY = window.scrollY;
      const email = form.querySelector("input[type='email']");
      const organization = form.querySelector("[name='organization']");
      const status = form.querySelector("[data-lead-status]");
      const type = form.dataset.leadForm;

      email?.setCustomValidity("");
      organization?.setCustomValidity("");

      if (!email?.checkValidity()) {
        email?.reportValidity();
        return;
      }

      if (organization?.required && !organization.value.trim()) {
        organization?.setCustomValidity("Vul een organisatie of bedrijfsnaam in.");
        organization?.reportValidity();
        return;
      }

      const backend = window.RoofSignalBackend;

      track("Lead start", { form: type, path: window.location.pathname });
      setBusy(form, true);
      if (status) {
        status.className = "form-note form-status pending";
        status.setAttribute("role", "status");
        status.textContent = "Aanvraag wordt verzonden...";
      }

      let completed = false;

      try {
        window.RoofSignalFormSecurity?.ensureReady(form);
        const payload = {
          ...buildPayload(form, type),
          ...window.RoofSignalFormSecurity?.getPayload(form),
        };
        if (!backend?.isConfigured) {
          throw new Error("Supabase lead endpoint is not configured.");
        }

        await submitProtectedLead(payload);

        form.reset();
        form.classList.add("is-complete");
        if (status) renderSuccess(status, type);
        completed = true;
        track("Lead success", { form: type, path: window.location.pathname });
        window.requestAnimationFrame(() => window.scrollTo(0, scrollY));
      } catch (error) {
        console.error("RoofSignal report request failed.", {
          endpoint: "Supabase lead_requests",
          error,
        });
        track("Lead error", { form: type, path: window.location.pathname });
        if (status) renderError(status);
        window.RoofSignalFormSecurity?.reset(form);
        window.requestAnimationFrame(() => window.scrollTo(0, scrollY));
      } finally {
        if (completed) {
          const button = form.querySelector("button[type='submit']");
          if (button) {
            button.disabled = true;
            button.textContent = "Verzonden";
          }
          form.setAttribute("aria-busy", "false");
        } else {
          setBusy(form, false);
        }
      }
    });
  }
})();
