(() => {
  const byId = id => document.getElementById(id);
  const form = byId('vve-form');
  if (!form) return;
  const choices = document.querySelectorAll('[data-audience-choice]');
  const panels = document.querySelectorAll('[data-audience]');
  const money = value => new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(value);
  const chosenInspection = () => byId('vve-inspection-envelope').checked ? 'building_envelope'
    : byId('vve-inspection-thermal').checked ? 'thermal' : null;
  let lastInspection = null;
  // Approved base (RS-2026-09-17) and thermal (RS-2026-10-11) tiers per object.
  // These are enquiry
  // indications only: no calendar reservation, order or payment is created.
  const tiers = [
    { maximum: 5, net: 750, gross: 907.50, thermalNet: 400, thermalGross: 484 },
    { maximum: 10, net: 1000, gross: 1210, thermalNet: 550, thermalGross: 665.50 },
    { maximum: 20, net: 1250, gross: 1512.50, thermalNet: 750, thermalGross: 907.50 }
  ];

  function showAudience(audience) {
    for (const button of choices) button.setAttribute('aria-pressed', String(button.dataset.audienceChoice === audience));
    for (const panel of panels) panel.hidden = panel.dataset.audience !== audience;
  }

  function updatePrice() {
    const inspection = chosenInspection();
    if (inspection !== lastInspection || !inspection) byId('vve-thermal').checked = false;
    lastInspection = inspection;
    const addon = Boolean(inspection && byId('vve-thermal').checked);
    const thermalPrimary = inspection === 'thermal';
    const envelope = inspection === 'building_envelope' || (thermalPrimary && addon);
    const thermal = thermalPrimary || (inspection === 'building_envelope' && addon);
    const thermalOnly = thermal && !envelope;
    byId('vve-product-addon').hidden = !inspection;
    byId('vve-thermal').disabled = !inspection;
    byId('vve-addon-title').textContent = thermalPrimary ? 'Gebouwschilinspectie toevoegen' : 'Thermografische inspectie toevoegen';
    byId('vve-addon-description').textContent = thermalPrimary ? 'Foto’s, bevindingen en onderhoudsadvies.' : 'Warmtebeelden van dak en gevel.';
    // A combined enquiry has the same canonical products in either direction.
    byId('vve-inspection-product').value = envelope ? 'building_envelope' : thermalOnly ? 'thermal' : '';
    const count = Number(byId('vve-address-count').value);
    const valid = Number.isSafeInteger(count) && count >= 1 && count <= 10000;
    const scope = byId('vve-object-scope').value;
    const tier = valid && scope === 'single' ? tiers.find(item => count <= item.maximum) : null;
    const custom = scope !== 'single' || (valid && count > 20);
    byId('vve-thermal-interest').value = thermal ? 'yes' : 'no';
    byId('vve-scope').value = !inspection ? '' : thermalOnly
      ? 'VvE-objectaanmelding — thermografische inspectie, inclusief rapport'
      : `VvE-objectaanmelding — dak en gevel, inclusief inspectierapport${thermal ? ' en thermografie' : ''}`;
    const net = tier ? (envelope ? tier.net : 0) + (thermal ? tier.thermalNet : 0) : 0;
    const gross = tier ? (envelope ? tier.gross : 0) + (thermal ? tier.thermalGross : 0) : 0;
    byId('vve-envelope-price').textContent = tier ? money(tier.net) : custom ? 'Op maat' : `Vanaf ${money(tiers[0].net)}`;
    byId('vve-standalone-price').textContent = tier ? money(tier.thermalNet) : custom ? 'Op maat' : `Vanaf ${money(tiers[0].thermalNet)}`;
    byId('vve-thermal-price').textContent = tier
      ? `+ ${money(thermalPrimary ? tier.net : tier.thermalNet)}`
      : custom ? 'Op maat' : `Vanaf ${money(thermalPrimary ? tiers[0].net : tiers[0].thermalNet)}`;
    byId('vve-summary-base-label').textContent = !inspection ? 'Inspectie' : thermalPrimary ? 'Thermografische inspectie' : 'Dak- en gevelinspectie';
    byId('vve-summary-base').textContent = !inspection ? 'Nog te kiezen' : tier ? money(thermalPrimary ? tier.thermalNet : tier.net) : custom ? 'Op maat' : 'Na objectgegevens';
    byId('vve-summary-thermal-label').textContent = !inspection ? 'Aanvulling' : thermalPrimary ? 'Gebouwschilinspectie' : 'Thermografie';
    byId('vve-summary-thermal').textContent = !inspection ? 'Nog te kiezen' : addon ? tier ? money(thermalPrimary ? tier.net : tier.thermalNet) : custom ? 'Op maat' : 'Na objectgegevens' : 'Niet toegevoegd';
    byId('vve-estimate-label').textContent = !inspection ? 'Uw prijs' : addon ? 'Uw gecombineerde inspectie' : thermalPrimary ? 'Uw thermografische inspectie' : 'Uw basisprijs';
    byId('vve-estimate').textContent = !inspection ? 'Kies uw inspectie' : tier ? `${money(net)} excl. btw` : custom ? 'Voorstel op maat' : 'Nog te bepalen';
    byId('vve-estimate-vat').textContent = inspection && tier ? `${money(gross)} incl. btw` : '';
    byId('vve-price-detail').value = !inspection ? '' : tier
      ? `Basisinspectie: ${envelope ? `${money(tier.net)} excl. btw / ${money(tier.gross)} incl. btw` : 'niet gekozen'}. Thermografie: ${thermal ? `${money(tier.thermalNet)} excl. btw / ${money(tier.thermalGross)} incl. btw` : 'niet gekozen'}. Totaal: ${money(net)} excl. btw / ${money(gross)} incl. btw. Exclusief reiskosten. Basisstaffel RS-2026-09-17; thermografiestaffel RS-2026-10-11; definitieve scope en totaalprijs vooraf afstemmen.`
      : custom ? `Maatwerk: omvang en prijs vooraf afstemmen. Thermografie: ${thermal ? 'gewenst, prijs op maat' : 'niet gekozen'}.` : '';
    return Boolean(inspection);
  }

  for (const button of choices) {
    button.addEventListener('click', () => showAudience(button.dataset.audienceChoice));
    button.disabled = false;
  }
  byId('vve-address-count').addEventListener('input', updatePrice);
  byId('vve-object-scope').addEventListener('change', updatePrice);
  byId('vve-thermal').addEventListener('change', updatePrice);
  byId('vve-inspection-envelope').addEventListener('change', updatePrice);
  byId('vve-inspection-thermal').addEventListener('change', updatePrice);
  // Refresh the transmitted indication even after browser autofill. The
  // capture listener runs before the shared lead form's submit handler.
  form.addEventListener('submit', event => {
    if (updatePrice()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    form.querySelector('[data-lead-status]').textContent = 'Kies uw inspectie.';
    form.reportValidity();
  }, true);
  form.addEventListener('reset', () => queueMicrotask(updatePrice));
  if (window.RoofSignalBackend?.isConfigured && window.RoofSignalFormSecurity) {
    byId('vve-fields').disabled = false;
    byId('vve-submit').disabled = false;
  }
  else byId('vve-form').querySelector('[data-lead-status]').textContent = 'Aanmelden is tijdelijk niet beschikbaar. Neem contact op via info@roofsignal.nl.';
  // A Mollie return always opens the existing consumer payment feedback.
  const audienceFromUrl = () => !new URLSearchParams(window.location.search).has('booking') && window.location.hash === '#vve' ? 'vve' : 'home';
  window.addEventListener('hashchange', () => {
    if (window.location.hash === '#vve') showAudience(audienceFromUrl());
  });
  showAudience(audienceFromUrl());
  updatePrice();
})();
