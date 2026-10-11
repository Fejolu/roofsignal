import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../inspectie-boeken/index.html', import.meta.url), 'utf8');
const script = fs.readFileSync(new URL('../inspectie-boeken/vve-inquiry.js', import.meta.url), 'utf8');

function setup() {
  const elements = new Map([...html.matchAll(/id="([^"]+)"/g)].map(([, id]) => [id, {
    value: '', checked: false, textContent: '', listeners: {},
    addEventListener(event, handler) { this.listeners[event] = handler; }
  }]));
  const get = id => elements.get(id);
  get('vve-object-scope').value = 'single';
  const window = { location: { search: '', hash: '#vve' }, addEventListener() {},
    RoofSignalBackend: { isConfigured: true }, RoofSignalFormSecurity: {} };
  vm.runInNewContext(script, {
    document: { getElementById: get, querySelectorAll: () => [] }, window, URLSearchParams, Intl, queueMicrotask
  });
  return {
    get,
    count(value) { get('vve-address-count').value = value; get('vve-address-count').listeners.input(); },
    scope(value) { get('vve-object-scope').value = value; get('vve-object-scope').listeners.change(); },
    thermal(value) { get('vve-thermal').checked = value; get('vve-thermal').listeners.change(); }
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
    assert.equal(normalized(ui.get('vve-thermal-price').textContent), `+€${supplement}excl.btw(€${supplementVat}incl.btw)`);
    assert.equal(normalized(ui.get('vve-estimate').textContent), `€${total}excl.btw`);
    assert.equal(normalized(ui.get('vve-estimate-vat').textContent), `€${totalVat}incl.btw·excl.reiskosten`);
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
    assert.equal(ui.get('vve-estimate').textContent, 'Vul het aantal adressen in');
    assert.equal(ui.get('vve-price-detail').value, '');
  }
  ui.count('21');
  assert.equal(ui.get('vve-thermal-price').textContent, 'Prijs op maat');
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
