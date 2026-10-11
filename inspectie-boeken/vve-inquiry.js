(() => {
  const byId = id => document.getElementById(id);
  const form = byId('vve-form');
  if (!form) return;
  const choices = document.querySelectorAll('[data-audience-choice]');
  const panels = document.querySelectorAll('[data-audience]');
  const money = value => new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(value);
  // Approved base tiers per object (RS-2026-09-17). These are enquiry
  // indications only: no calendar reservation, order or payment is created.
  const tiers = [
    { maximum: 5, key: 'small', net: 750, gross: 907.50 },
    { maximum: 10, key: 'medium', net: 1000, gross: 1210 },
    { maximum: 20, key: 'large', net: 1250, gross: 1512.50 }
  ];

  function showAudience(audience) {
    for (const button of choices) button.setAttribute('aria-pressed', String(button.dataset.audienceChoice === audience));
    for (const panel of panels) panel.hidden = panel.dataset.audience !== audience;
    byId('audience-action').textContent = audience === 'vve' ? 'Meld uw object aan ↓' : 'Stel uw inspectie samen ↓';
  }

  function updatePrice() {
    const count = Number(byId('vve-address-count').value);
    const valid = Number.isSafeInteger(count) && count >= 1 && count <= 10000;
    const scope = byId('vve-object-scope').value;
    const tier = valid && scope === 'single' ? tiers.find(item => count <= item.maximum) : null;
    const custom = scope !== 'single' || (valid && count > 20);
    const key = tier?.key || (custom ? 'custom' : '');
    for (const row of document.querySelectorAll('[data-vve-tier]')) {
      row.classList.toggle('selected', row.dataset.vveTier === key);
    }
    byId('vve-estimate').textContent = tier ? `${money(tier.net)} excl. btw` : custom ? 'Voorstel op maat' : 'Vul het aantal adressen in';
    byId('vve-estimate-vat').textContent = tier ? `${money(tier.gross)} incl. btw · excl. reiskosten en thermografie` : '';
    byId('vve-price-detail').value = tier
      ? `${money(tier.net)} excl. btw / ${money(tier.gross)} incl. btw. Exclusief reiskosten en thermografie. Basisstaffel RS-2026-09-17; definitieve scope en totaalprijs vooraf afstemmen.`
      : custom ? 'Maatwerk: omvang en prijs vooraf afstemmen.' : '';
  }

  for (const button of choices) {
    button.addEventListener('click', () => showAudience(button.dataset.audienceChoice));
    button.disabled = false;
  }
  byId('vve-address-count').addEventListener('input', updatePrice);
  byId('vve-object-scope').addEventListener('change', updatePrice);
  // Refresh the transmitted indication even after browser autofill. The
  // capture listener runs before the shared lead form's submit handler.
  form.addEventListener('submit', updatePrice, true);
  form.addEventListener('reset', () => queueMicrotask(updatePrice));
  if (window.RoofSignalBackend?.isConfigured && window.RoofSignalFormSecurity) byId('vve-fields').disabled = false;
  else byId('vve-form').querySelector('[data-lead-status]').textContent = 'Aanmelden is tijdelijk niet beschikbaar. Neem contact op via info@roofsignal.nl.';
  // A Mollie return always opens the existing consumer payment feedback.
  const audienceFromUrl = () => !new URLSearchParams(window.location.search).has('booking') && window.location.hash === '#vve' ? 'vve' : 'home';
  window.addEventListener('hashchange', () => {
    if (window.location.hash === '#vve') showAudience(audienceFromUrl());
  });
  showAudience(audienceFromUrl());
  updatePrice();
})();
