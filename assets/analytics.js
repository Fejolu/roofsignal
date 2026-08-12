(() => {
  const cfg = window.ROOFSIGNAL_ANALYTICS || {};
  const api = { track: () => {} };

  if (cfg.enabled && cfg.websiteId) {
    const script = document.createElement("script");
    script.async = true;
    script.src = cfg.scriptUrl;
    script.dataset.websiteId = cfg.websiteId;
    document.head.appendChild(script);

    api.track = (name, data) => {
      if (window.umami && typeof window.umami.trackEvent === "function") {
        window.umami.trackEvent(name, data || {});
      }
    };
  }

  window.RoofSignalAnalytics = api;
})();
