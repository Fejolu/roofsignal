import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createWebsiteIntakeHandler } from '../src/website-intake-handler.mjs';

const secret = 'ab'.repeat(32), origin = 'https://erp.example.invalid';
const timestamp = '1791831600';
const input = { source: 'parken', source_id: '11111111-1111-4111-8111-111111111111', revision: 1,
  changed_at: '2026-10-12T19:00:00Z', record: { id: '11111111-1111-4111-8111-111111111111', reference: 'RS-TEST' } };
const sign = raw => createHmac('sha256', Buffer.from(secret, 'hex')).update(timestamp + '.' + raw).digest('hex');
function setup(overrides = {}) {
  const calls = [];
  const handler = createWebsiteIntakeHandler({ origin, secret, now: () => Number(timestamp) * 1000,
    adapter: { websiteIntake: async value => { calls.push(value); return { accepted: true, source: value.source,
      source_id: value.source_id, revision: value.revision, ignored: false }; } }, ...overrides });
  return { handler, calls };
}
function request({ raw = JSON.stringify(input), headers = {}, path = '/api/website-intake', method = 'POST' } = {}) {
  return new Request(origin + path, { method, headers: { 'Content-Type': 'application/json',
    'X-RoofSignal-Timestamp': timestamp, 'X-RoofSignal-Signature': sign(raw), ...headers },
  ...(method === 'POST' ? { body: raw } : {}) });
}
test('narrow signed import acknowledges only source identity and revision, without record data', async () => {
  const { handler, calls } = setup();
  const response = await handler(request());
  assert.equal(response.status, 200);
  assert.deepEqual(calls, [input]);
  assert.deepEqual(await response.json(), { accepted: true, source: input.source, source_id: input.source_id,
    revision: 1, ignored: false });
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.match(response.headers.get('X-Robots-Tag'), /noindex/);
});
test('browser session, changed bytes, absent or wrong signing key cannot import', async () => {
  const { handler, calls } = setup();
  for (const headers of [{ 'X-RoofSignal-Signature': '' }, { 'X-RoofSignal-Signature': '00'.repeat(32), Cookie: 'session=example' },
    { 'X-RoofSignal-Signature': sign(JSON.stringify({ ...input, revision: 2 })) },
    { 'X-RoofSignal-Timestamp': String(Number(timestamp) - 301) },
    { 'X-RoofSignal-Timestamp': String(Number(timestamp) + 301) }]) {
    assert.equal((await handler(request({ headers }))).status, 401);
  }
  assert.equal(calls.length, 0);
});
test('valid signature cannot select arbitrary command, identity, source or metadata', async () => {
  const { handler, calls } = setup();
  for (const body of [{ ...input, action: 'access.grant' }, { ...input, source: 'users' },
    { ...input, source_id: 'arbitrary' }, { ...input, revision: 0 }, { ...input, revision: 1.1 },
    { ...input, changed_at: 'tomorrow' }, { ...input, record: [] }, { ...input, revision: Number.MAX_SAFE_INTEGER + 1 }]) {
    assert.equal((await handler(request({ raw: JSON.stringify(body) }))).status, 400);
  }
  assert.equal(calls.length, 0);
});
test('source record cannot smuggle tokens, grants or unrelated private source columns', async () => {
  const { handler, calls } = setup();
  for (const record of [{ ...input.record, status_token: 'private-capability' },
    { ...input.record, access_grants: ['administrator'] }, { ...input.record, id: '22222222-2222-4222-8222-222222222222' }]) {
    assert.equal((await handler(request({ raw: JSON.stringify({ ...input, record }) }))).status, 400);
  }
  assert.equal(calls.length, 0);
});
test('wrong host, query, method or content type fails before importing', async () => {
  const { handler, calls } = setup();
  assert.equal((await handler(new Request('https://evil.example.invalid/api/website-intake'))).status, 404);
  assert.equal((await handler(request({ path: '/api/website-intake?secret=unexpected' }))).status, 404);
  assert.equal((await handler(request({ method: 'GET' }))).status, 405);
  assert.equal((await handler(request({ headers: { 'Content-Type': 'text/plain' } }))).status, 415);
  assert.equal(calls.length, 0);
});
test('payload bounds hold even without content-length, and UTF-8/JSON must be valid', async () => {
  const { handler, calls } = setup();
  assert.equal((await handler(request({ raw: 'x'.repeat(65537) }))).status, 413);
  assert.equal((await handler(request({ raw: '{' }))).status, 400);
  assert.equal(calls.length, 0);
});
test('transport failures and incomplete acknowledgements never claim delivery or leak provider values', async () => {
  for (const adapter of [
    { websiteIntake: async () => { throw Error('key=private-secret customer@example.invalid'); } },
    { websiteIntake: async () => ({ accepted: true, ...input, source_id: 'wrong' }) },
  ]) {
    const { handler } = setup({ adapter });
    const response = await handler(request());
    assert.equal(response.status, 503);
    const text = await response.text();
    assert.equal(text.includes('private-secret'), false);
    assert.equal(text.includes('customer@'), false);
  }
});
test('old/replayed event acknowledges ignored result instead of creating another operation', async () => {
  const { handler } = setup({ adapter: { websiteIntake: async value => ({ accepted: true,
    source: value.source, source_id: value.source_id, revision: value.revision, ignored: true }) } });
  const response = await handler(request());
  assert.equal(response.status, 200);
  assert.equal((await response.json()).ignored, true);
});
test('missing secrets fail closed and only explicit environment names are accepted', () => {
  assert.throws(() => setup({ secret: undefined }));
  assert.throws(() => setup({ secret: 'weak' }));
  assert.throws(() => setup({ origin: 'http://erp.example.invalid' }));
});
