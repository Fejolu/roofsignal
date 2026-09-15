(() => {
  const cfg = window.ROOFSIGNAL_ANALYTICS || {};
  const queue = [];
  const key = "roofsignal-homepage-cta-v2";
  let ready = false;
  let variant = "";
  try { variant = window.sessionStorage.getItem(key) || ""; } catch { /* Storage may be blocked. */ }
  if (!["inspectievoorstel", "offerte"].includes(variant)) variant = "";

  function send(name, data = {}) {
    if (!cfg.enabled || !cfg.websiteId) return;
    const payload = variant ? { ...data, cta_variant: variant } : data;
    if (!ready || !window.umami || typeof window.umami.track !== "function") {
      if (queue.length < 100) queue.push([name, payload]);
      return;
    }
    window.umami.track(name, payload);
  }
  function flush() {
    ready = Boolean(window.umami && typeof window.umami.track === "function");
    if (!ready) return;
    while (queue.length) {
      const [name, data] = queue.shift();
      window.umami.track(name, data);
    }
  }
  window.RoofSignalAnalytics = { track: send };
  if (cfg.enabled && cfg.websiteId) {
    const script = document.createElement("script");
    script.async = true;
    script.src = cfg.scriptUrl;
    script.dataset.websiteId = cfg.websiteId;
    script.addEventListener("load", flush);
    document.head.appendChild(script);
    let attempts = 0;
    const timer = window.setInterval(() => {
      flush();
      if (ready || ++attempts >= 40) window.clearInterval(timer);
    }, 250);
  }

  function initCtas() {
    const links = document.querySelectorAll("[data-homepage-primary-cta]");
    if (!links.length) return;
    if (!variant) {
      variant = Math.random() < 0.5 ? "inspectievoorstel" : "offerte";
      try { window.sessionStorage.setItem(key, variant); } catch { /* Keep this page usable. */ }
    }
    const label = variant === "offerte" ? "Vraag een offerte aan" : "Vraag een inspectievoorstel aan";
    links.forEach((link) => { link.textContent = label; link.dataset.ctaVariant = variant; });
    send("Homepage CTA getoond", { variant, path: window.location.pathname });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initCtas, { once: true });
  else initCtas();

  function cleanPath(value) {
    try { return new URL(value, window.location.href).pathname; } catch { return ""; }
  }
  document.addEventListener("click", (event) => {
    const link = event.target.closest?.("a,button");
    if (!link) return;
    const href = link.getAttribute("href") || "";
    const label = (link.textContent || link.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ").slice(0, 100);
    const data = { label, path: window.location.pathname };
    if (link.dataset.ctaVariant) send("Homepage CTA klik", { ...data, variant: link.dataset.ctaVariant });
    if (link.dataset.reportDownload) return send("Praktijkrapport download", { report: link.dataset.reportDownload, path: window.location.pathname, destination: cleanPath(href) });
    if (href.startsWith("tel:")) return send("Contact telefoon", data);
    if (href.startsWith("mailto:")) return send("Contact e-mail", data);
    if (/portal-login/.test(href)) return send("Portaal openen", data);
    if (/offerte-akkoord/.test(href)) return send("Offerte akkoordpagina openen", data);
    if (/betaal|payment|payreq/i.test(href + " " + label)) return send("Betaling starten", data);
    if (/offerte|aanvraag|scan|rapport|contact|inspectie/i.test(label)) send("CTA klik", { ...data, destination: cleanPath(href) });
  });
  document.addEventListener("submit", (event) => {
    const form = event.target;
    const formName = form.dataset.leadForm || form.id || (form.hasAttribute("data-parken-booking") ? "de-parken-boeking" : "formulier");
    // Actual conversions are emitted only by the form after backend success.
    send("Formulier verzendpoging", { form: formName, path: window.location.pathname });
  }, true);
})();
