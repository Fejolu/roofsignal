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

      const backend = window.RoofSignalBackend;

      if (backend?.isConfigured) {
        const result = await backend.submitLead(buildPayload(form, type));
        if (!result.ok && status) {
          status.textContent = "De aanvraag wordt rechtstreeks naar info@roofsignal.nl verzonden.";
        }
      }

      if (status) {
        status.textContent = type === "price"
          ? "Aanvraag wordt verzonden. We sturen de offerte naar het opgegeven e-mailadres."
          : "Aanvraag wordt verzonden. We sturen het voorbeeldrapport naar het opgegeven e-mailadres.";
      }

      if (form.action && form.action.startsWith("https://")) {
        HTMLFormElement.prototype.submit.call(form);
        return;
      }
    });
  }
})();
