(() => {
  const cfg = window.ROOFSIGNAL_ANALYTICS || {};
  const queue = [];
  let ready = false;

  function send(name, data) {
    if (!ready || !window.umami || typeof window.umami.track !== "function") {
      queue.push([name, data]);
      return;
    }
    window.umami.track(name, data || {});
  }

  function flush() {
    ready = Boolean(window.umami && typeof window.umami.track === "function");
    if (!ready) return;
    while (queue.length) {
      const [name, data] = queue.shift();
      window.umami.track(name, data || {});
    }
  }

  const api = { track: send };

  if (cfg.enabled && cfg.websiteId) {
    const script = document.createElement("script");
    script.async = true;
    script.src = cfg.scriptUrl;
    script.dataset.websiteId = cfg.websiteId;
    script.addEventListener("load", flush);
    document.head.appendChild(script);

    // Umami may finish initialising just after the script load event.
    let attempts = 0;
    const readyTimer = window.setInterval(() => {
      flush();
      attempts += 1;
      if (ready || attempts >= 40) window.clearInterval(readyTimer);
    }, 250);
  }

  window.RoofSignalAnalytics = api;

  // Homepage CTA-test: één variant per sessie en overal op de pagina gelijk.
  const homepageCtas = document.querySelectorAll("[data-homepage-primary-cta]");
  if (homepageCtas.length) {
    let variant = window.sessionStorage.getItem("roofsignal-homepage-cta");
    if (!variant) {
      variant = Math.random() < 0.5 ? "offerte" : "portefeuillescan";
      window.sessionStorage.setItem("roofsignal-homepage-cta", variant);
    }
    const label = variant === "offerte" ? "Vraag een offerte aan" : "Vraag een portefeuillescan aan";
    homepageCtas.forEach((link) => {
      link.textContent = label;
      link.dataset.ctaVariant = variant;
    });
    send("Homepage CTA getoond", { variant, path: window.location.pathname });
  }

  function cleanPath(value) {
    try {
      return new URL(value, window.location.href).pathname;
    } catch {
      return String(value || "");
    }
  }

  document.addEventListener("click", (event) => {
    const link = event.target.closest("a,button");
    if (!link) return;
    const href = link.getAttribute("href") || "";
    const label = (link.textContent || link.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ").slice(0, 100);
    const data = { label, path: window.location.pathname };

    if (link.dataset.ctaVariant) {
      send("Homepage CTA klik", { ...data, variant: link.dataset.ctaVariant });
    }

    if (href.startsWith("tel:")) return send("Contact telefoon", data);
    if (href.startsWith("mailto:")) return send("Contact e-mail", data);
    if (/portal-login/.test(href)) return send("Portaal openen", data);
    if (/offerte-akkoord/.test(href)) return send("Offerte akkoordpagina openen", data);
    if (/betaal|payment|payreq/i.test(href + " " + label)) return send("Betaling starten", data);
    if (/offerte|aanvraag|scan|rapport|contact/i.test(label)) {
      send("CTA klik", { ...data, destination: cleanPath(href) });
    }
  });

  document.addEventListener("submit", (event) => {
    const form = event.target;
    const formName = form.dataset.leadForm || form.id || form.getAttribute("data-parken-booking") !== null && "de-parken-boeking" || "formulier";
    send("Formulier verzonden", { form: formName, path: window.location.pathname });
  }, true);
})();
