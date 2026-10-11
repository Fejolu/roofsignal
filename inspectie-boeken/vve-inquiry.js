(() => {
  const byId = id => document.getElementById(id);
  const form = byId('vve-form');
  if (!form) return;
  const choices = document.querySelectorAll('[data-audience-choice]');
  const panels = document.querySelectorAll('[data-audience]');
  const money = value => new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(value);
  // Approved base (RS-2026-09-17) and thermal (RS-2026-10-11) tiers per object.
  // These are enquiry
  // indications only: no calendar reservation, order or payment is created.
  const tiers = [
    { maximum: 5, key: 'small', net: 750, gross: 907.50, thermalNet: 400, thermalGross: 484 },
    { maximum: 10, key: 'medium', net: 1000, gross: 1210, thermalNet: 550, thermalGross: 665.50 },
    { maximum: 20, key: 'large', net: 1250, gross: 1512.50, thermalNet: 750, thermalGross: 907.50 }
  ];

  function showAudience(audience) {
    for (const button of choices) button.setAttribute('aria-pressed', String(button.dataset.audienceChoice === audience));
    for (const panel of panels) panel.hidden = panel.dataset.audience !== audience;
  }

  function updatePrice() {
    const count = Number(byId('vve-address-count').value);
    const valid = Number.isSafeInteger(count) && count >= 1 && count <= 10000;
    const scope = byId('vve-object-scope').value;
    const tier = valid && scope === 'single' ? tiers.find(item => count <= item.maximum) : null;
    const custom = scope !== 'single' || (valid && count > 20);
    const key = tier?.key || (custom ? 'custom' : '');
    const thermal = byId('vve-thermal').checked;
    for (const row of document.querySelectorAll('[data-vve-tier]')) {
      row.classList.toggle('selected', row.dataset.vveTier === key);
    }
    const net = tier ? tier.net + (thermal ? tier.thermalNet : 0) : 0;
    const gross = tier ? tier.gross + (thermal ? tier.thermalGross : 0) : 0;
    byId('vve-thermal-price').textContent = tier
      ? `+ ${money(tier.thermalNet)} excl. btw (${money(tier.thermalGross)} incl. btw)`
      : custom ? 'Prijs op maat' : 'Vul het aantal adressen in voor de toeslag';
    byId('vve-estimate-label').textContent = thermal ? 'Uw prijs met thermografie' : 'Uw basisprijs';
    byId('vve-estimate').textContent = tier ? `${money(net)} excl. btw` : custom ? 'Voorstel op maat' : 'Vul het aantal adressen in';
    byId('vve-estimate-vat').textContent = tier ? `${money(gross)} incl. btw · excl. reiskosten` : '';
    byId('vve-price-detail').value = tier
      ? `Basisinspectie: ${money(tier.net)} excl. btw / ${money(tier.gross)} incl. btw. Thermografie: ${thermal ? `${money(tier.thermalNet)} excl. btw / ${money(tier.thermalGross)} incl. btw` : 'niet gekozen'}. Totaal: ${money(net)} excl. btw / ${money(gross)} incl. btw. Exclusief reiskosten. Basisstaffel RS-2026-09-17; thermografiestaffel RS-2026-10-11; definitieve scope en totaalprijs vooraf afstemmen.`
      : custom ? `Maatwerk: omvang en prijs vooraf afstemmen. Thermografie: ${thermal ? 'gewenst, prijs op maat' : 'niet gekozen'}.` : '';
  }

  for (const button of choices) {
    button.addEventListener('click', () => showAudience(button.dataset.audienceChoice));
    button.disabled = false;
  }
  byId('vve-address-count').addEventListener('input', updatePrice);
  byId('vve-object-scope').addEventListener('change', updatePrice);
  byId('vve-thermal').addEventListener('change', updatePrice);
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
