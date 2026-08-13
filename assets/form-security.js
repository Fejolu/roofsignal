(() => {
  const protectedForms = document.querySelectorAll("[data-lead-form], [data-parken-booking]");
  if (!protectedForms.length) return;

  const config = window.ROOFSIGNAL_SUPABASE || {};
  const sitekey = String(config.turnstileSiteKey || "").trim();
  const configured = Boolean(sitekey && !sitekey.startsWith("ROOFSIGNAL_"));

  function addHoneypot(form) {
    if (form.querySelector("[name='company_website']")) return;
    const trap = document.createElement("div");
    trap.className = "form-security-trap";
    trap.setAttribute("aria-hidden", "true");
    trap.innerHTML = '<label>Laat dit veld leeg<input name="company_website" tabindex="-1" autocomplete="off"></label>';
    form.prepend(trap);
  }

  for (const form of protectedForms) {
    addHoneypot(form);
    form.dataset.securityReady = configured ? "pending" : "missing";
    if (!configured) continue;
    const widget = document.createElement("div");
    widget.className = "cf-turnstile form-turnstile";
    widget.dataset.sitekey = sitekey;
    widget.dataset.theme = "light";
    widget.dataset.size = "flexible";
    widget.dataset.appearance = "interaction-only";
    widget.dataset.action = form.dataset.leadForm || "parken_booking";
    const button = form.querySelector("button[type='submit']");
    button?.before(widget);
    form.dataset.securityReady = "ready";
  }

  if (configured) {
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
    script.async = true;
    script.defer = true;
    document.head.append(script);
  }

  window.RoofSignalFormSecurity = {
    getPayload(form) {
      return {
        turnstile_token: String(new FormData(form).get("cf-turnstile-response") || ""),
        company_website: String(new FormData(form).get("company_website") || ""),
      };
    },
    ensureReady(form) {
      if (!configured) throw new Error("Formulierbeveiliging is niet geconfigureerd.");
      const token = String(new FormData(form).get("cf-turnstile-response") || "");
      if (!token) throw new Error("Bevestig eerst dat u geen geautomatiseerde aanvraag verstuurt.");
      return true;
    },
    reset(form) {
      const widget = form.querySelector(".cf-turnstile");
      if (widget && window.turnstile) window.turnstile.reset(widget);
    },
  };
})();
