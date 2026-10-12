import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/[[path]].js';

const origin = 'https://roofsignal-erp-test.pages.dev';
const env = { ERP_ORIGIN: origin, ERP_SUPABASE_URL: 'https://' + 'a'.repeat(20) + '.supabase.co', ERP_TEST_PROJECT_REF: 'a'.repeat(20),
  ERP_PUBLISHABLE_KEY: 'sb_publishable_fixture', ERP_STORAGE_KEY: 'sb_secret_fixture', ERP_SESSION_SECRET: 'b'.repeat(64) };
test('separate hosting serves each asset once with private noindex headers', async () => {
  let calls = 0;
  const response = await onRequest({ request: new Request(origin + '/'), env, next: async () => { calls++; return new Response('asset', { headers: { 'Content-Type': 'text/html' } }); } });
  assert.equal(calls, 1); assert.equal(await response.text(), 'asset');
  assert.match(response.headers.get('X-Robots-Tag'), /noindex/);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.match(response.headers.get('Content-Security-Policy'), /frame-ancestors 'none'/);
});
test('hosting fails closed on missing config and excludes server secrets from public config', async () => {
  const pending = await onRequest({ request: new Request(origin + '/api/config'), env: {} });
  assert.equal(pending.status, 503);
  const ready = await onRequest({ request: new Request(origin + '/api/config'), env });
  assert.deepEqual(await ready.json(), { mode: 'hosted', environment: 'test', passwordRecovery: true });
  const session = await onRequest({ request: new Request(origin + '/api/session'), env });
  assert.equal((await session.json()).authenticated, false);
  const wrongOrigin = await onRequest({ request: new Request('https://untrusted.example/api/config'), env });
  assert.equal(wrongOrigin.status, 403);
});
