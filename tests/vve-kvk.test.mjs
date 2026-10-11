import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createKvkHandler, vveFromProfile } from '../supabase/functions/_shared/vve-kvk.mjs';

const profile = {
  kvkNummer: '90000749', naam: 'Global Conron', statutaireNaam: 'Global Conron',
  _embedded: { eigenaar: { rechtsvorm: 'Vereniging van Eigenaars', adressen: [{ volledigAdres: 'Not the inspection address' }] } },
  vestigingen: { totaalAantalVestigingen: 7 }
};
const request = (body = {}, options = {}) => new Request('https://example.invalid/vve-kvk', {
  method: 'POST', headers: { origin: 'https://www.roofsignal.nl', 'content-type': 'application/json', ...options.headers },
  body: JSON.stringify({ kvk_number: '90000749', turnstile_token: 'fixture', ...body })
});
function handler(overrides = {}) {
  let calls = 0;
  const config = { env: key => ({ VVE_KVK_ENABLED: 'true', KVK_API_KEY: 'secret-test-value' })[key],
    verify: async () => true, consume: async () => true,
    fetchProfile: async (number, key) => { calls++; assert.equal(number, '90000749'); assert.equal(key, 'secret-test-value'); return Response.json(profile); }, ...overrides };
  return { run: createKvkHandler(config), calls: () => calls };
}
test('only an active matching VvE supplies its name, never addresses or unit counts', () => {
  assert.deepEqual(vveFromProfile(profile, '90000749'), { found: true, kvkNumber: '90000749', name: 'Global Conron' });
  assert.equal(vveFromProfile(profile, '90000000').found, false);
  assert.equal(vveFromProfile({ ...profile, materieleRegistratie: { datumEinde: '20250101' } }, '90000749').reason, 'inactive');
  assert.equal(vveFromProfile({ ...profile, _embedded: { eigenaar: { rechtsvorm: 'Besloten Vennootschap' } } }, '90000749').reason, 'not_vve');
  assert.equal(vveFromProfile({ ...profile, _embedded: {} }, '90000749').found, false);
});
test('disabled subscription, invalid inputs, untrusted origin, failed verification and exhausted limits never call KVK', async () => {
  for (const [overrides, req, expected] of [
    [{ env: () => '' }, request(), 503],
    [{}, request({ kvk_number: '123' }), 400],
    [{}, request({ kvk_number: '12a34567' }), 400],
    [{}, request({}, { headers: { origin: 'https://attacker.invalid' } }), 403],
    [{}, request({ company_website: 'spam' }), 400],
    [{ verify: async () => false }, request(), 403],
    [{ consume: async () => false }, request(), 429],
    [{ consume: async () => { throw Error('DB down'); } }, request(), 503]
  ]) {
    const h = handler(overrides); const response = await h.run(req);
    assert.equal(response.status, expected); assert.equal(h.calls(), 0);
  }
});
test('optional service status reveals only availability; successful response contains only the VvE name and number', async () => {
  const h = handler();
  const response = await h.run(new Request('https://example.invalid/vve-kvk/status', { headers: { origin: 'https://roofsignal.nl' } }));
  assert.deepEqual(await response.json(), { enabled: true }); assert.equal(h.calls(), 0);
  assert.deepEqual(await (await h.run(request({ kvk_number: '9000 0749' }))).json(), { found: true, kvkNumber: '90000749', name: 'Global Conron' });
  assert.equal(h.calls(), 1);
});
test('provider errors, missing registrations and timeouts are handled without exposing credentials', async () => {
  for (const [fetchProfile, expected] of [
    [async () => new Response('', { status: 404 }), { found: false, reason: 'not_found' }],
    [async () => new Response('secret-test-value', { status: 401 }), { error: 'unavailable' }],
    [async () => { throw Error('secret-test-value'); }, { error: 'unavailable' }]
  ]) assert.deepEqual(await (await handler({ fetchProfile }).run(request())).json(), expected);
});

const html = fs.readFileSync(new URL('../inspectie-boeken/index.html', import.meta.url), 'utf8');
const script = fs.readFileSync(new URL('../inspectie-boeken/vve-kvk.js', import.meta.url), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));
async function ui({ enabled = true, lookup = async () => Response.json({ found: true, kvkNumber: '90000749', name: 'Global Conron' }) } = {}) {
  const elements = new Map();
  for (const id of ['vve-form', 'vve-kvk', 'vve-organization', 'vve-kvk-check', 'vve-kvk-status', 'vve-submit']) elements.set(id, {
    value: '', hidden: id === 'vve-kvk-check', disabled: false, listeners: {}, classList: { contains: () => false },
    addEventListener: function (name, callback) { this.listeners[name] = callback; },
    setCustomValidity() {}, getAttribute: () => null
  });
  let calls = 0, resets = 0;
  vm.runInNewContext(script, {
    document: { getElementById: id => elements.get(id) }, AbortSignal,
    window: { ROOFSIGNAL_SUPABASE: { url: 'https://example.invalid', anonKey: 'public' },
      RoofSignalFormSecurity: { ensureReady() {}, getPayload: () => ({ turnstile_token: 'fixture' }), reset() { resets++; } } },
    fetch: async (url, options) => url.endsWith('/status') ? Response.json({ enabled }) : (calls++, lookup(url, options))
  });
  await tick();
  const get = id => elements.get(id);
  return { get, calls: () => calls, resets: () => resets,
    input(value) { get('vve-kvk').value = value; get('vve-kvk').listeners.input(); },
    click: () => get('vve-kvk-check').listeners.click()
  };
}
test('KVK field has no required or pattern constraint; missing subscription preserves manual entry', async () => {
  const tag = html.match(/<input id="vve-kvk"[^>]*>/)[0];
  assert.doesNotMatch(tag, /\brequired\b|\bpattern=/);
  const x = await ui({ enabled: false });
  assert.equal(x.get('vve-kvk-check').hidden, true);
  assert.equal(x.get('vve-organization').disabled, false);
  await x.click(); assert.equal(x.calls(), 0);
});
test('valid lookup fills name, refreshes the single-use token and leaves the name editable', async () => {
  const x = await ui(); x.input('9000 0749'); await x.click();
  assert.equal(x.get('vve-organization').value, 'Global Conron');
  assert.equal(x.resets(), 1); assert.equal(x.get('vve-submit').disabled, false);
  x.input('90000102'); assert.equal(x.get('vve-organization').value, '');
});
test('invalid number and unavailable lookup do not make the optional field block submission', async () => {
  const x = await ui({ lookup: async () => new Response('{}', { status: 503 }) });
  x.input('123'); await x.click(); assert.equal(x.calls(), 0);
  x.get('vve-organization').value = 'Handmatig ingevulde VvE';
  x.input('90000749'); await x.click();
  assert.equal(x.get('vve-organization').value, 'Handmatig ingevulde VvE');
  assert.equal(x.get('vve-submit').disabled, false);
  assert.match(x.get('vve-kvk-status').textContent, /zelf de naam invullen/);
});
test('late response never overwrites a changed number or a newly typed name; duplicate requests are suppressed', async () => {
  for (const editName of [true, false]) {
    let finish;
    const x = await ui({ lookup: () => new Promise(resolve => { finish = resolve; }) });
    x.input('90000749'); const pending = x.click(); await x.click(); assert.equal(x.calls(), 1);
    if (editName) { x.get('vve-organization').value = 'Mijn naam'; x.get('vve-organization').listeners.input(); }
    else x.input('12345678');
    finish(Response.json({ found: true, kvkNumber: '90000749', name: 'Global Conron' })); await pending;
    assert.equal(x.get('vve-organization').value, editName ? 'Mijn naam' : '');
  }
});
test('optional KVK number is carried into the existing lead message, blank number is omitted', () => {
  const source = fs.readFileSync(new URL('../assets/lead-capture.js', import.meta.url), 'utf8');
  const context = { document: { querySelectorAll: () => [] }, window: { location: { pathname: '/inspectie-boeken/' } },
    FormData: function (form) { return new Map(Object.entries(form.fields)); } };
  vm.runInNewContext(source.replace(/\}\)\(\);\s*$/, 'window.build = buildPayload;})();'), context);
  const form = { dataset: { leadContext: 'vve-object' }, fields: { organization: 'Naam', kvk_number: '9000 0749' } };
  assert.match(context.window.build(form, 'price').message, /KVK-nummer VvE \(opgegeven\): 90000749/);
  form.fields.kvk_number = ''; assert.doesNotMatch(context.window.build(form, 'price').message, /KVK/);
});
