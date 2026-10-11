import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../inspectie-boeken/index.html', import.meta.url), 'utf8');
const script = fs.readFileSync(new URL('../inspectie-boeken/vve-inquiry.js', import.meta.url), 'utf8');

function setup({ configured = true, security = true } = {}) {
  const elements = new Map([...html.matchAll(/id="([^"]+)"/g)].map(([, id]) => [id, {
    value: '', checked: false, textContent: '', listeners: {},
    disabled: /\bdisabled\b/.test(html.match(new RegExp(`<[^>]+\\bid="${id}"[^>]*>`))?.[0] || ''),
    addEventListener(event, handler) { this.listeners[event] = handler; },
    querySelector() { return this.status ||= { textContent: '' }; }
  }]));
  const get = id => elements.get(id);
  get('vve-object-scope').value = 'single';
  get('vve-inspection-envelope').checked = true;
  const window = { location: { search: '', hash: '#vve' }, addEventListener() {},
    RoofSignalBackend: { isConfigured: configured }, RoofSignalFormSecurity: security ? {} : null };
  vm.runInNewContext(script, {
    document: { getElementById: get, querySelectorAll: () => [] }, window, URLSearchParams, Intl, queueMicrotask
  });
  return {
    get,
    count(value) { get('vve-address-count').value = value; get('vve-address-count').listeners.input(); },
    scope(value) { get('vve-object-scope').value = value; get('vve-object-scope').listeners.change(); },
    thermal(value) { get('vve-thermal').checked = value; get('vve-thermal').listeners.change(); },
    inspection(value) {
      get('vve-inspection-envelope').checked = value === 'building_envelope';
      get('vve-inspection-thermal').checked = value === 'thermal';
      get(value === 'thermal' ? 'vve-inspection-thermal' : 'vve-inspection-envelope').listeners.change();
    }
  };
}
const normalized = value => value.replace(/\s/g, '');

test('approved thermal supplements and VAT totals at every VvE tier boundary', () => {
  const ui = setup();
  for (const [count, base, supplement, supplementVat, total, totalVat] of [
    ['1', '750,00', '400,00', '484,00', '1.150,00', '1.391,50'],
    ['5', '750,00', '400,00', '484,00', '1.150,00', '1.391,50'],
    ['6', '1.000,00', '550,00', '665,50', '1.550,00', '1.875,50'],
    ['10', '1.000,00', '550,00', '665,50', '1.550,00', '1.875,50'],
    ['11', '1.250,00', '750,00', '907,50', '2.000,00', '2.420,00'],
    ['20', '1.250,00', '750,00', '907,50', '2.000,00', '2.420,00']
  ]) {
    ui.count(count);
    ui.thermal(true);
    assert.equal(normalized(ui.get('vve-thermal-price').textContent), `+€${supplement}`);
    assert.equal(normalized(ui.get('vve-estimate').textContent), `€${total}excl.btw`);
    assert.equal(normalized(ui.get('vve-estimate-vat').textContent), `€${totalVat}incl.btw`);
    assert.equal(normalized(ui.get('vve-summary-base').textContent), `€${base}`);
    assert.equal(normalized(ui.get('vve-summary-thermal').textContent), `€${supplement}`);
    assert.match(ui.get('vve-price-detail').value, /thermografiestaffel RS-2026-10-11/);
    ui.thermal(false);
    assert.equal(normalized(ui.get('vve-estimate').textContent), `€${base}excl.btw`);
    assert.match(ui.get('vve-price-detail').value, /Thermografie: niet gekozen/);
    assert.equal(ui.get('vve-estimate-label').textContent, 'Uw basisprijs');
  }
});

test('invalid counts and custom objects never retain a previous numeric quote', () => {
  const ui = setup();
  ui.count('8'); ui.thermal(true);
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
});

test('submit refreshes the indication after autofill without change events', () => {
  const ui = setup();
  ui.count('5');
  ui.get('vve-address-count').value = '12';
  ui.get('vve-thermal').checked = true;
  ui.get('vve-form').listeners.submit();
  const submitted = normalized(ui.get('vve-price-detail').value);
  assert(submitted.includes('Basisinspectie:€1.250,00excl.btw/€1.512,50incl.btw'));
  assert(submitted.includes('Thermografie:€750,00excl.btw/€907,50incl.btw'));
  assert(submitted.includes('Totaal:€2.000,00excl.btw/€2.420,00incl.btw'));
});

test('Standalone VvE thermography uses only its own tier and sends an unambiguous scope', () => {
  const ui = setup();
  ui.inspection('thermal');
  assert.equal(ui.get('vve-thermal-option').hidden, true);
  assert.equal(ui.get('vve-thermal-included').hidden, false);
  assert.equal(ui.get('vve-summary-base-label').textContent, 'Thermografische inspectie');
  assert.equal(ui.get('vve-summary-thermal-label').textContent, 'Aanvulling');
  assert.equal(ui.get('vve-summary-thermal').textContent, 'Inbegrepen');
  assert.equal(ui.get('vve-tiers-title').textContent, 'Thermografie per object');
  assert.equal(ui.get('vve-thermal-interest').value, 'yes');
  assert.match(ui.get('vve-scope').value, /thermografische inspectie, inclusief rapport/);
  for (const [count, net, gross, key] of [
    ['1', '400,00', '484,00', 'small'], ['5', '400,00', '484,00', 'small'],
    ['6', '550,00', '665,50', 'medium'], ['10', '550,00', '665,50', 'medium'],
    ['11', '750,00', '907,50', 'large'], ['20', '750,00', '907,50', 'large']
  ]) {
    ui.count(count);
    assert.equal(normalized(ui.get('vve-estimate').textContent), `€${net}excl.btw`);
    assert.equal(normalized(ui.get('vve-estimate-vat').textContent), `€${gross}incl.btw`);
    assert.equal(normalized(ui.get('vve-summary-base').textContent), `€${net}`);
    assert.equal(normalized(ui.get(`vve-tier-${key}-price`).textContent), `€${net}`);
    assert.equal(normalized(ui.get(`vve-tier-${key}-vat`).textContent), `€${gross}incl.btw`);
    assert.match(ui.get('vve-price-detail').value, /Basisinspectie: niet gekozen/);
    assert.equal(ui.get('vve-estimate-label').textContent, 'Uw thermografische inspectie');
  }
  ui.inspection('building_envelope');
  assert.equal(ui.get('vve-thermal-option').hidden, false);
  assert.equal(ui.get('vve-thermal-included').hidden, true);
  assert.equal(ui.get('vve-summary-base-label').textContent, 'Dak- en gevelinspectie');
  assert.equal(ui.get('vve-summary-thermal-label').textContent, 'Thermografie');
  assert.equal(ui.get('vve-summary-thermal').textContent, 'Niet toegevoegd');
  assert.equal(ui.get('vve-thermal-interest').value, 'no');
  assert.equal(normalized(ui.get('vve-estimate').textContent), '€1.250,00excl.btw');
  assert.equal(normalized(ui.get('vve-tier-small-price').textContent), '€750,00');
  ui.thermal(true);
  ui.inspection('thermal');
  assert.equal(normalized(ui.get('vve-estimate').textContent), '€750,00excl.btw', 'The hidden supplement must never double-charge thermal-only');
  ui.inspection('building_envelope');
  assert.equal(normalized(ui.get('vve-estimate').textContent), '€2.000,00excl.btw');
});

test('Standalone VvE thermal custom objects remain an inquiry without a numeric price', () => {
  const ui = setup();
  ui.inspection('thermal'); ui.count('5');
  ui.scope('multiple');
  assert.equal(ui.get('vve-estimate').textContent, 'Voorstel op maat');
  assert.doesNotMatch(ui.get('vve-price-detail').value, /€/);
  assert.match(ui.get('vve-price-detail').value, /gewenst, prijs op maat/);
  ui.scope('single'); ui.count('21');
  assert.equal(ui.get('vve-estimate').textContent, 'Voorstel op maat');
  ui.count('');
  assert.equal(ui.get('vve-price-detail').value, '');
});

test('VvE autofill at submit refreshes standalone type, effective thermal flag and its price', () => {
  const ui = setup();
  ui.count('12');
  ui.get('vve-inspection-envelope').checked = false;
  ui.get('vve-inspection-thermal').checked = true;
  ui.get('vve-form').listeners.submit();
  assert.equal(ui.get('vve-thermal-interest').value, 'yes');
  assert.match(ui.get('vve-scope').value, /thermografische inspectie/);
  assert.match(ui.get('vve-price-detail').value, /Basisinspectie: niet gekozen/);
  assert.equal(normalized(ui.get('vve-estimate').textContent), '€750,00excl.btw');
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
