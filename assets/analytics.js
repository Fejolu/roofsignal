(() => {
  const cfg = window.ROOFSIGNAL_ANALYTICS || {};
  const path = window.location.pathname.replace(/\.html$/, "").replace(/\/$/, "") || "/";
  const privatePage = /(?:portal|admin|offerte-akkoord|herroepen|login|dashboard|auth|betaling)/i.test(path);
  const optedOut = navigator.globalPrivacyControl === true || ["1", "yes"].includes(String(navigator.doNotTrack || window.doNotTrack || ""));
  window.RoofSignalAnalytics = { track() {} };
  if (!cfg.enabled || !cfg.websiteId || privatePage || optedOut) return;
  // Only known public paths: URL path segments can themselves contain identifiers.
  const pages = new Set(cfg.publicPaths || []);
  if (!pages.has(path)) return;
  const events = new Set([
    "Praktijkrapport download", "Contact telefoon", "Contact e-mail", "CTA klik",
    "Formulier verzendpoging", "Lead start", "Lead success", "Lead error",
    "De Parken postcodecontrole", "De Parken boeking voltooid", "De Parken boeking mislukt",
  ]);
  let ready = false;
  const queue = [];
  function cleanData(data = {}) {
    const clean = {};
    for (const key of ["valid", "eligible", "thermography"]) {
      if (typeof data[key] === "boolean") clean[key] = data[key];
    }
    if (["contact", "price", "report", "access", "neighborhood", "de-parken-boeking"].includes(data.form)) clean.form = data.form;
    if (["zutphen", "deventer", "thermografie"].includes(data.report)) clean.report = data.report;
    return clean;
  }
  // Rebuild every outgoing payload; no title, query, referrer, screen or identity.
  window.roofSignalBeforeAnalytics = (type, payload) => {
    if (type !== "event" || (payload.name && !events.has(payload.name))) return false;
    return {
      website: cfg.websiteId, hostname: "www.roofsignal.nl", url: path,
      ...(payload.name ? { name: payload.name, data: cleanData(payload.data) } : {}),
    };
  };
  function send(name, data = {}) {
    if (!events.has(name)) return;
    const safe = cleanData(data);
    if (!ready) { if (queue.length < 50) queue.push([name, safe]); return; }
    window.umami.track(name, safe);
  }
  window.RoofSignalAnalytics = { track: send };
  const script = document.createElement("script");
  script.async = true;
  script.src = cfg.scriptUrl;
  Object.assign(script.dataset, {
    websiteId: cfg.websiteId, autoTrack: "false", excludeSearch: "true",
    excludeHash: "true", doNotTrack: "true", beforeSend: "roofSignalBeforeAnalytics",
    domains: "roofsignal.nl,www.roofsignal.nl",
  });
  script.addEventListener("load", () => {
    ready = Boolean(window.umami && typeof window.umami.track === "function");
    if (!ready) return;
    window.umami.track();
    while (queue.length) { const [name, data] = queue.shift(); send(name, data); }
  });
  document.head.appendChild(script);
  document.addEventListener("click", (event) => {
    const link = event.target.closest?.("a,button");
    if (!link) return;
    const href = link.getAttribute("href") || "";
    if (link.dataset.reportDownload) return send("Praktijkrapport download", { report: link.dataset.reportDownload });
    if (href.startsWith("tel:")) return send("Contact telefoon");
    if (href.startsWith("mailto:")) return send("Contact e-mail");
    if (link.matches(".btn, [data-homepage-primary-cta]")) send("CTA klik");
  });
  document.addEventListener("submit", (event) => {
    const form = event.target;
    send("Formulier verzendpoging", { form: form.dataset.leadForm || (form.hasAttribute("data-parken-booking") ? "de-parken-boeking" : "") });
  }, true);
})();
