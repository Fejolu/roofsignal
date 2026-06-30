(() => {
  const forms = document.querySelectorAll("[data-lead-form]");
  const contactPhone = "085 21 28 019";
  const contactEmail = "info@roofsignal.nl";
  const freeDomains = new Set([
    "gmail.com",
    "hotmail.com",
    "outlook.com",
    "live.nl",
    "live.com",
    "icloud.com",
    "yahoo.com",
    "proton.me",
    "protonmail.com",
  ]);

  function getDomain(email) {
    return String(email || "").trim().toLowerCase().split("@")[1] || "";
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
    };
  }

  function successCopy(type) {
    if (type === "report") {
      return {
        title: "Voorbeeldrapport aangevraagd.",
        body: "Bedankt voor uw interesse in RoofSignal.",
        next: "We sturen het rapport naar het opgegeven e-mailadres.",
      };
    }

    if (type === "price") {
      return {
        title: "Offerteaanvraag ontvangen",
        body: "Bedankt voor uw aanvraag.",
        next: "We beoordelen de gegevens en sturen een heldere reactie naar het opgegeven e-mailadres.",
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
      <span><b>Geen e-mail ontvangen binnen 5 minuten?</b><br>
        Neem contact op via <a href="tel:+31852128019">${contactPhone}</a> of
        <a href="mailto:${contactEmail}">${contactEmail}</a>.
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
        <a href="mailto:${contactEmail}">${contactEmail}</a>.
      </span>
    `;
  }

  for (const form of forms) {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      const scrollY = window.scrollY;
      const email = form.querySelector("input[type='email']");
      const organization = form.querySelector("[name='organization']");
      const status = form.querySelector("[data-lead-status]");
      const domain = getDomain(email?.value);
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

      if (type !== "price" && freeDomains.has(domain)) {
        email.setCustomValidity("Gebruik bij voorkeur een zakelijk mailadres, zodat we de aanvraag aan de juiste organisatie kunnen koppelen.");
        email.reportValidity();
        return;
      }

      const backend = window.RoofSignalBackend;

      setBusy(form, true);
      if (status) {
        status.className = "form-note form-status pending";
        status.setAttribute("role", "status");
        status.textContent = "Aanvraag wordt veilig verzonden...";
      }

      let completed = false;

      try {
        const payload = buildPayload(form, type);
        if (!backend?.isConfigured) {
          throw new Error("Supabase lead endpoint is not configured.");
        }

        const result = await backend.submitLead(payload);
        if (!result.ok) {
          throw result.error || new Error("Supabase lead endpoint rejected the request.");
        }

        form.reset();
        form.classList.add("is-complete");
        if (status) renderSuccess(status, type);
        completed = true;
        window.requestAnimationFrame(() => window.scrollTo(0, scrollY));
      } catch (error) {
        console.error("RoofSignal report request failed.", {
          endpoint: "Supabase lead_requests",
          error,
        });
        if (status) renderError(status);
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
