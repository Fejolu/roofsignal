(() => {
  const forms = document.querySelectorAll("[data-lead-form]");
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

  function buildBody(form, type) {
    const data = new FormData(form);
    const lines = [
      type === "price" ? "Nieuwe aanvraag prijsindicatie" : "Nieuwe aanvraag voorbeeldrapport",
      "",
      `Naam: ${data.get("name") || "-"}`,
      `Organisatie: ${data.get("organization") || "-"}`,
      `E-mail: ${data.get("email") || "-"}`,
    ];

    if (type === "price") {
      lines.push(
        `Postcode object: ${data.get("postcode") || "-"}`,
        `Objectcomplexiteit: ${data.get("complexity") || "-"}`,
        `Begaanbaarheid locatie: ${data.get("site_access") || "-"}`,
        `Inspectiediepte: ${data.get("scope") || "-"}`,
        `Opmerking: ${data.get("message") || "-"}`
      );
    } else {
      lines.push(`Segment: ${data.get("segment") || "-"}`);
    }

    lines.push("", "Opvolging: stuur de gevraagde informatie naar het opgegeven mailadres.");
    return lines.join("\n");
  }

  function buildPayload(form, type) {
    const data = new FormData(form);
    return {
      type,
      name: data.get("name") || "",
      organization: data.get("organization") || "",
      email: data.get("email") || "",
      segment: data.get("segment") || "",
      postcode: data.get("postcode") || "",
      complexity: data.get("complexity") || "",
      site_access: data.get("site_access") || "",
      scope: data.get("scope") || "",
      message: data.get("message") || "",
    };
  }

  for (const form of forms) {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
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

      const subject = type === "price" ? "Aanvraag prijsindicatie RoofSignal" : "Aanvraag voorbeeldrapport RoofSignal";
      const mailto = `mailto:info@roofsignal.nl?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(buildBody(form, type))}`;
      const backend = window.RoofSignalBackend;

      if (backend?.isConfigured) {
        const result = await backend.submitLead(buildPayload(form, type));
        if (result.ok) {
          if (status) {
            status.textContent = type === "price"
              ? "Aanvraag ontvangen. We sturen de prijsindicatie naar het opgegeven mailadres."
              : "Aanvraag ontvangen. We sturen het voorbeeldrapport naar het opgegeven mailadres.";
          }
          form.reset();
          return;
        }
      }

      window.location.href = mailto;

      if (status) {
        status.textContent = type === "price"
          ? "Aanvraag voorbereid. We sturen de prijsindicatie naar het opgegeven mailadres."
          : "Aanvraag voorbereid. We sturen het voorbeeldrapport naar het opgegeven mailadres.";
      }

      form.reset();
    });
  }
})();
