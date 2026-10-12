import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../inspectie-boeken/index.html', import.meta.url), 'utf8');
const script = fs.readFileSync(new URL('../inspectie-boeken/vve-inquiry.js', import.meta.url), 'utf8');

function setup({ configured = true, security = true } = {}) {
  const elements = new Map([...html.matchAll(/id="([^"]+)"/g)].map(([, id]) => {
    const tag = html.match(new RegExp(`<[^>]+\\bid="${id}"[^>]*>`))?.[0] || '';
    return [id, {
      value: '', checked: /\bchecked\b/.test(tag), textContent: '', listeners: {},
      disabled: /\bdisabled\b/.test(tag), hidden: /\bhidden\b/.test(tag),
      addEventListener(event, handler) { this.listeners[event] = handler; },
      reportValidity() { this.validityReports = (this.validityReports || 0) + 1; },
      querySelector() { return this.status ||= { textContent: '' }; }
    }];
  }));
  const get = id => elements.get(id);
  get('vve-object-scope').value = 'single';
  const window = { location: { search: '', hash: '#vve' }, addEventListener() {},
    RoofSignalBackend: { isConfigured: configured }, RoofSignalFormSecurity: security ? {} : null };
  vm.runInNewContext(script, {
    document: { getElementById: get, querySelectorAll: () => [] },
    window, URLSearchParams, Intl, queueMicrotask: callback => callback()
  });
  return {
    get,
    count(value) { get('vve-address-count').value = value; get('vve-address-count').listeners.input(); },
    scope(value) { get('vve-object-scope').value = value; get('vve-object-scope').listeners.change(); },
    addon(value) { get('vve-thermal').checked = value; get('vve-thermal').listeners.change(); },
    inspection(value) {
      get('vve-inspection-envelope').checked = value === 'building_envelope';
      get('vve-inspection-thermal').checked = value === 'thermal';
      get(value === 'thermal' ? 'vve-inspection-thermal' : 'vve-inspection-envelope').listeners.change();
    },
    submit() {
      const event = { prevented: false, stopped: false,
        preventDefault() { this.prevented = true; }, stopImmediatePropagation() { this.stopped = true; } };
      get('vve-form').listeners.submit(event);
      return event;
    },
    reset() {
      for (const element of elements.values()) element.checked = false;
      get('vve-address-count').value = '';
      get('vve-object-scope').value = 'single';
      get('vve-form').listeners.reset();
    }
  };
}
const normalized = value => value.replace(/\s/g, '');

const tierCases = [
  ['1', '750,00', '400,00', '484,00', '1.150,00', '1.391,50'],
  ['5', '750,00', '400,00', '484,00', '1.150,00', '1.391,50'],
  ['6', '1.000,00', '550,00', '665,50', '1.550,00', '1.875,50'],
  ['10', '1.000,00', '550,00', '665,50', '1.550,00', '1.875,50'],
  ['11', '1.250,00', '750,00', '907,50', '2.000,00', '2.420,00'],
  ['20', '1.250,00', '750,00', '907,50', '2.000,00', '2.420,00']
];

test('VvE starts without an inferred inspection or addon, including with populated object fields', () => {
  const ui = setup();
  ui.count('8');
  ui.addon(true);
  assert.equal(ui.get('vve-inspection-envelope').checked, false);
  assert.equal(ui.get('vve-inspection-thermal').checked, false);
  assert.equal(ui.get('vve-product-addon').hidden, true);
  assert.equal(ui.get('vve-thermal').disabled, true);
  assert.equal(ui.get('vve-thermal').checked, false);
  assert.equal(ui.get('vve-estimate').textContent, 'Kies uw inspectie');
  assert.equal(ui.get('vve-summary-base').textContent, 'Nog te kiezen');
  assert.equal(ui.get('vve-summary-thermal').textContent, 'Nog te kiezen');
  assert.equal(ui.get('vve-estimate-label').textContent, 'Uw prijs');
  assert.equal(ui.get('vve-estimate-vat').textContent, '');
  assert.equal(ui.get('vve-scope').value, '');
  assert.equal(ui.get('vve-price-detail').value, '');
  assert.equal(ui.get('vve-inspection-product').value, '');
  assert.equal(ui.get('vve-thermal-interest').value, 'no');
  assert.equal(normalized(ui.get('vve-envelope-price').textContent), '€1.000,00');
  assert.equal(normalized(ui.get('vve-standalone-price').textContent), '€550,00');
  const event = ui.submit();
  assert.equal(event.prevented, true);
  assert.equal(event.stopped, true, 'The shared lead handler must not send an inferred product');
  assert.equal(ui.get('vve-form').status.textContent, 'Kies uw inspectie.');
  assert.equal(ui.get('vve-form').validityReports, 1);
});

test('Envelope primary offers thermal supplement at all unchanged VvE tier boundaries', () => {
  const ui = setup();
  ui.inspection('building_envelope');
  assert.equal(ui.get('vve-product-addon').hidden, false);
  assert.equal(ui.get('vve-thermal').disabled, false);
  assert.equal(ui.get('vve-addon-title').textContent, 'Thermografische inspectie toevoegen');
  assert.equal(ui.get('vve-addon-description').textContent, 'Warmtebeelden van dak en gevel.');
  for (const [count, base, supplement, , total, totalVat] of tierCases) {
    ui.count(count);
    ui.addon(true);
    assert.equal(normalized(ui.get('vve-thermal-price').textContent), `+€${supplement}`);
    assert.equal(normalized(ui.get('vve-estimate').textContent), `€${total}excl.btw`);
    assert.equal(normalized(ui.get('vve-estimate-vat').textContent), `€${totalVat}incl.btw`);
    assert.equal(normalized(ui.get('vve-summary-base').textContent), `€${base}`);
    assert.equal(normalized(ui.get('vve-summary-thermal').textContent), `€${supplement}`);
    assert.equal(ui.get('vve-inspection-product').value, 'building_envelope');
    assert.equal(ui.get('vve-thermal-interest').value, 'yes');
    assert.match(ui.get('vve-price-detail').value, /thermografiestaffel RS-2026-10-11/);
    ui.addon(false);
    assert.equal(normalized(ui.get('vve-estimate').textContent), `€${base}excl.btw`);
    assert.match(ui.get('vve-price-detail').value, /Thermografie: niet gekozen/);
    assert.equal(ui.get('vve-thermal-interest').value, 'no');
  }
});

test('Thermal primary offers envelope supplement with identical combined totals and canonical products', () => {
  const ui = setup();
  ui.inspection('thermal');
  assert.equal(ui.get('vve-product-addon').hidden, false);
  assert.equal(ui.get('vve-addon-title').textContent, 'Gebouwschilinspectie toevoegen');
  assert.equal(ui.get('vve-addon-description').textContent, 'Foto’s, bevindingen en onderhoudsadvies.');
  assert.equal(ui.get('vve-summary-base-label').textContent, 'Thermografische inspectie');
  assert.equal(ui.get('vve-summary-thermal-label').textContent, 'Gebouwschilinspectie');
  for (const [count, base, thermal, thermalVat, total, totalVat] of tierCases) {
    ui.count(count);
    assert.equal(normalized(ui.get('vve-estimate').textContent), `€${thermal}excl.btw`);
    assert.equal(normalized(ui.get('vve-estimate-vat').textContent), `€${thermalVat}incl.btw`);
    assert.equal(ui.get('vve-inspection-product').value, 'thermal');
    assert.equal(ui.get('vve-thermal-interest').value, 'yes');
    assert.match(ui.get('vve-price-detail').value, /Basisinspectie: niet gekozen/);
    assert.match(ui.get('vve-scope').value, /thermografische inspectie, inclusief rapport/);
    assert.equal(normalized(ui.get('vve-thermal-price').textContent), `+€${base}`);
    ui.addon(true);
    assert.equal(normalized(ui.get('vve-estimate').textContent), `€${total}excl.btw`);
    assert.equal(normalized(ui.get('vve-estimate-vat').textContent), `€${totalVat}incl.btw`);
    assert.equal(normalized(ui.get('vve-summary-base').textContent), `€${thermal}`);
    assert.equal(normalized(ui.get('vve-summary-thermal').textContent), `€${base}`);
    assert.equal(ui.get('vve-inspection-product').value, 'building_envelope');
    assert.equal(ui.get('vve-thermal-interest').value, 'yes');
    assert.match(ui.get('vve-scope').value, /dak en gevel, inclusief inspectierapport en thermografie/);
    ui.addon(false);
  }
});

test('Switching either primary clears the previous addon and refreshes its title, price and summary', () => {
  const ui = setup();
  ui.count('8');
  ui.inspection('building_envelope'); ui.addon(true);
  ui.inspection('thermal');
  assert.equal(ui.get('vve-thermal').checked, false);
  assert.equal(ui.get('vve-addon-title').textContent, 'Gebouwschilinspectie toevoegen');
  assert.equal(normalized(ui.get('vve-estimate').textContent), '€550,00excl.btw');
  assert.equal(normalized(ui.get('vve-thermal-price').textContent), '+€1.000,00');
  ui.addon(true); ui.inspection('building_envelope');
  assert.equal(ui.get('vve-thermal').checked, false);
  assert.equal(ui.get('vve-addon-title').textContent, 'Thermografische inspectie toevoegen');
  assert.equal(normalized(ui.get('vve-estimate').textContent), '€1.000,00excl.btw');
  assert.equal(normalized(ui.get('vve-thermal-price').textContent), '+€550,00');
  assert.equal(ui.get('vve-summary-thermal').textContent, 'Niet toegevoegd');
  assert.equal(ui.get('vve-thermal-interest').value, 'no');
});

test('Invalid counts and custom objects never retain a previous numeric quote in either direction', () => {
  for (const inspection of ['building_envelope', 'thermal']) {
    const ui = setup();
    ui.inspection(inspection); ui.count('8'); ui.addon(true);
    for (const count of ['', '0', '-1', '1.5', '10001']) {
      ui.count(count);
      assert.equal(ui.get('vve-estimate').textContent, 'Nog te bepalen');
      assert.equal(ui.get('vve-price-detail').value, '');
    }
    ui.count('21');
    assert.equal(ui.get('vve-thermal-price').textContent, 'Op maat');
    assert.match(ui.get('vve-price-detail').value, /gewenst, prijs op maat/);
    ui.count('8');
    for (const scope of ['multiple', 'unknown']) {
      ui.scope(scope);
      assert.equal(ui.get('vve-estimate').textContent, 'Voorstel op maat');
      assert.equal(ui.get('vve-estimate-vat').textContent, '');
      assert.doesNotMatch(ui.get('vve-price-detail').value, /€/);
    }
    ui.scope('single');
    assert.equal(normalized(ui.get('vve-estimate').textContent), '€1.550,00excl.btw');
  }
});

test('Submit refreshes object and addon indications after autofill without change events', () => {
  const ui = setup();
  ui.inspection('building_envelope'); ui.count('5');
  ui.get('vve-address-count').value = '12';
  ui.get('vve-thermal').checked = true;
  assert.equal(ui.submit().prevented, false);
  const submitted = normalized(ui.get('vve-price-detail').value);
  assert(submitted.includes('Basisinspectie:€1.250,00excl.btw/€1.512,50incl.btw'));
  assert(submitted.includes('Thermografie:€750,00excl.btw/€907,50incl.btw'));
  assert(submitted.includes('Totaal:€2.000,00excl.btw/€2.420,00incl.btw'));
});

test('Autofilled primary changes cannot turn a stale addon into the opposite inspection', () => {
  const ui = setup();
  ui.inspection('building_envelope'); ui.count('12'); ui.addon(true);
  ui.get('vve-inspection-envelope').checked = false;
  ui.get('vve-inspection-thermal').checked = true;
  assert.equal(ui.submit().prevented, false);
  assert.equal(ui.get('vve-thermal').checked, false);
  assert.equal(ui.get('vve-inspection-product').value, 'thermal');
  assert.equal(ui.get('vve-thermal-interest').value, 'yes');
  assert.match(ui.get('vve-scope').value, /thermografische inspectie/);
  assert.match(ui.get('vve-price-detail').value, /Basisinspectie: niet gekozen/);
  assert.equal(normalized(ui.get('vve-estimate').textContent), '€750,00excl.btw');
  ui.addon(true);
  assert.equal(ui.submit().prevented, false);
  assert.equal(ui.get('vve-inspection-product').value, 'building_envelope');
  assert.equal(normalized(ui.get('vve-estimate').textContent), '€2.000,00excl.btw');
});

test('Native form reset clears primary, addon, canonical scope and quoted totals', () => {
  const ui = setup();
  ui.inspection('thermal'); ui.count('8'); ui.addon(true);
  ui.reset();
  assert.equal(ui.get('vve-product-addon').hidden, true);
  assert.equal(ui.get('vve-thermal').checked, false);
  assert.equal(ui.get('vve-inspection-product').value, '');
  assert.equal(ui.get('vve-scope').value, '');
  assert.equal(ui.get('vve-price-detail').value, '');
  assert.equal(ui.get('vve-estimate').textContent, 'Kies uw inspectie');
  assert.equal(ui.submit().prevented, true);
});

test('The VvE action remains disabled until its backend and form verification are available', () => {
  const active = setup();
  assert.equal(active.get('vve-fields').disabled, false);
  assert.equal(active.get('vve-submit').disabled, false);
  for (const options of [{ configured: false }, { security: false }]) {
    const unavailable = setup(options);
    assert.equal(unavailable.get('vve-fields').disabled, true);
    assert.equal(unavailable.get('vve-submit').disabled, true);
    assert.match(unavailable.get('vve-form').status.textContent, /tijdelijk niet beschikbaar/);
  }
});
