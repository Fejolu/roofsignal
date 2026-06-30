(() => {
  const forms = document.querySelectorAll("[data-lead-form]");
  const contactPhone = "085 21 28 019";
  const contactEmail = "info@roofsignal.nl";
  const mailEndpoint = "https://formsubmit.co/ajax/info@roofsignal.nl";
  const reportUrl = "https://roofsignal.nl/voorbeeldrapport-uitgebreid.html";
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
        title: "Voorbeeldrapport aangevraagd",
        body: "Bedankt voor uw interesse in RoofSignal.",
        next: "Het voorbeeldrapport wordt binnen enkele minuten verzonden naar het opgegeven e-mailadres.",
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

  function mailSubject(type) {
    if (type === "report") return "Aanvraag voorbeeldrapport RoofSignal";
    if (type === "price") return "Aanvraag offerte RoofSignal";
    if (type === "access") return "Aanvraag klantenportaal toegang RoofSignal";
    return "Aanvraag portefeuillescan RoofSignal";
  }

  function autoresponse(type) {
    if (type === "report") {
      return [
        "Bedankt voor uw interesse in RoofSignal.",
        "",
        "U kunt het uitgebreide voorbeeldrapport hier bekijken:",
        reportUrl,
        "",
        "Geen e-mail ontvangen binnen 5 minuten of lukt de link niet?",
        `Neem contact op via ${contactPhone} of ${contactEmail}.`,
        "",
        "RoofSignal",
      ].join("\n");
    }

    if (type === "price") {
      return [
        "Bedankt voor uw offerteaanvraag bij RoofSignal.",
        "",
        "We beoordelen de gegevens en sturen een heldere reactie naar het opgegeven e-mailadres.",
        "",
        `Vragen? Neem contact op via ${contactPhone} of ${contactEmail}.`,
        "",
        "RoofSignal",
      ].join("\n");
    }

    return [
      "Bedankt voor uw aanvraag bij RoofSignal.",
      "",
      "We hebben uw gegevens ontvangen en nemen contact op via het opgegeven e-mailadres.",
      "",
      `Vragen? Neem contact op via ${contactPhone} of ${contactEmail}.`,
      "",
      "RoofSignal",
    ].join("\n");
  }

  function buildMailFormData(payload, type) {
    const data = new FormData();
    data.append("_subject", mailSubject(type));
    data.append("_template", "table");
    data.append("_captcha", "false");
    data.append("_autoresponse", autoresponse(type));
    data.append("name", payload.name);
    data.append("email", payload.email);
    data.append("organization", payload.organization);
    data.append("request_type", type);
    data.append("segment", payload.segment);
    data.append("postcode", payload.postcode);
    data.append("complexity", payload.complexity);
    data.append("site_access", payload.site_access);
    data.append("scope", payload.scope);
    data.append("message", payload.message);
    data.append("source_path", window.location.pathname);
    return data;
  }

  async function submitMail(payload, type) {
    const response = await fetch(mailEndpoint, {
      method: "POST",
      headers: { Accept: "application/json" },
      body: buildMailFormData(payload, type),
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.success === false || result.success === "false") {
      throw new Error(result.message || "Mail delivery failed.");
    }

    return result;
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
        await submitMail(payload, type);

        if (backend?.isConfigured) {
          const result = await backend.submitLead(payload);
          if (!result.ok) {
            console.warn("RoofSignal lead storage failed after mail delivery.", result.error || result);
          }
        }

        form.reset();
        form.classList.add("is-complete");
        if (status) renderSuccess(status, type);
        completed = true;
        window.requestAnimationFrame(() => window.scrollTo(0, scrollY));
      } catch (error) {
        console.error("RoofSignal lead submit failed.", error);
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
