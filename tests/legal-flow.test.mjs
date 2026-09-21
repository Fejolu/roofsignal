import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';
import { withdrawalRecord, withdrawalReceipt, isWithdrawal } from '../supabase/functions/_shared/withdrawal.mjs';
import { bookingLegal } from '../supabase/functions/_shared/booking-legal.mjs';
import { bookingOptions, PARKEN_OFFER_VERSION } from '../supabase/functions/_shared/parken-offer.mjs';
import { TERMS_TEXT } from '../supabase/functions/_shared/terms-20260921.mjs';

test('explicit current terms are stored and historical agreements do not acquire new terms', () => {
  const body = { offer_version: PARKEN_OFFER_VERSION, terms_accepted: true, thermography_selected: false, terms_version: '2026-09-21' };
  assert.equal(bookingOptions(body).p_terms_version, '2026-09-21');
  assert.throws(() => bookingOptions({ ...body, terms_version: 'future' }), /OFFER_UPDATED/);
  assert.deepEqual(bookingLegal({ terms_version: null }), { lines: [], attachments: [] });
  const legal = bookingLegal({ terms_version: '2026-09-21', terms_accepted_at: '2026-09-21T12:00:00Z', early_start_requested_at: null });
  assert.match(legal.lines.join('\n'), /niet verzocht/);
  assert.match(bookingLegal({ terms_version: '2026-09-21', early_start_requested_at: '2026-09-21' }).lines.join('\n'), /inclusief het rapport/);
  assert.equal(Buffer.from(legal.attachments[0].content, 'base64').toString('utf8'), TERMS_TEXT);
});

test('withdrawal cannot be submitted without an explicit declaration and never changes a booking', () => {
  const body = { name: 'TEST', email: 'test@example.invalid', reference: 'TEST-ORDER', withdrawal_confirmed: true };
  const record = withdrawalRecord(body);
  assert.equal(record.request_type, 'contact');
  assert.equal(isWithdrawal(record), true);
  assert.throws(() => withdrawalRecord({ ...body, withdrawal_confirmed: false }));
  assert.throws(() => withdrawalRecord({ ...body, reference: '' }));
  const receipt = withdrawalReceipt({ ...record, id: 'test-receipt', created_at: '2026-09-21T12:00:00Z' });
  assert.match(receipt, /TEST-ORDER/);
  assert.match(receipt, /14:00:00/);
  assert.match(receipt, /latere administratieve verwerking verandert dit moment niet/);
});

async function withdrawalEndpoint({ mailOk = true, stored = true, turnstile = true } = {}) {
  let handler;
  let saved;
  let notifyPayload;
  const chain = { select() { return this; }, eq() { return this; }, gte() { return Promise.resolve({ count: 0 }); } };
  const service = { from(table) {
    if (table === 'public_form_attempts') return { ...chain, insert: async () => ({ error: null }) };
    assert.equal(table, 'lead_requests');
    return { insert(record) {
      saved = record;
      return { select: () => ({ single: async () => stored ? { data: { ...record, id: 'test-receipt', created_at: '2026-09-21T12:00:00Z' }, error: null } : { error: { message: 'test failure' } } }) };
    } };
  } };
  const source = fs.readFileSync(new URL('../supabase/functions/submit-public-lead/index.ts', import.meta.url), 'utf8').replace(/^import .*;\n/gm, '');
  vm.runInNewContext(stripTypeScriptTypes(source), {
    serve: fn => { handler = fn; }, createClient: () => service, withdrawalRecord, withdrawalReceipt,
    Request, Response, crypto, TextEncoder, AbortSignal, Deno: { env: { get: key => key === 'SUPABASE_URL' ? 'https://test.invalid' : 'test-secret' } },
    fetch: async (url, options) => {
      if (url.includes('siteverify')) return new Response(JSON.stringify({ success: turnstile }));
      assert.match(url, /send-lead-notification$/);
      notifyPayload = JSON.parse(options.body);
      return new Response('{}', { status: mailOk ? 200 : 503 });
    },
  });
  const response = await handler(new Request('https://test.invalid', { method: 'POST', headers: { origin: 'https://www.roofsignal.nl', 'content-type': 'application/json' }, body: JSON.stringify({ type: 'withdrawal', name: 'TEST', email: 'test@example.invalid', reference: 'TEST-ORDER', withdrawal_confirmed: true, turnstile_token: 'TEST', created_at: 'forged', source_path: '/forged' }) }));
  return { response, body: await response.json(), saved, notifyPayload };
}

test('stored withdrawal returns the server timestamp and survives a mail provider failure', async () => {
  for (const mailOk of [true, false]) {
    const result = await withdrawalEndpoint({ mailOk });
    assert.equal(result.response.status, 200);
    assert.equal(result.body.success, true);
    assert.equal(result.body.emailSent, mailOk);
    assert.match(result.body.receipt, /21 september 2026/);
    assert.doesNotMatch(result.body.receipt, /forged/);
    assert.equal(result.saved.source_path, '/herroepen');
    assert.equal(result.notifyPayload.record.id, 'test-receipt');
  }
});

test('failed storage or bot verification cannot produce a false receipt', async () => {
  const failed = await withdrawalEndpoint({ stored: false });
  assert.equal(failed.response.status, 500);
  assert.equal(failed.notifyPayload, undefined);
  const bot = await withdrawalEndpoint({ turnstile: false });
  assert.equal(bot.response.status, 403);
  assert.equal(bot.saved, undefined);
});

function analyticsContext(path = '/', navigator = {}) {
  const loaded = [];
  const window = { location: { pathname: path }, ROOFSIGNAL_ANALYTICS: { enabled: true, websiteId: 'test', scriptUrl: 'https://analytics.invalid', publicPaths: ['/', '/de-parken'] } };
  const document = { createElement: () => ({ dataset: {}, addEventListener() {} }), head: { appendChild: el => loaded.push(el) }, addEventListener() {} };
  vm.runInNewContext(fs.readFileSync(new URL('../assets/analytics.js', import.meta.url), 'utf8'), { window, document, navigator });
  return { window, loaded };
}

test('analytics drops identity, URLs, free text, unknown events and optional tracking types', () => {
  const { window, loaded } = analyticsContext('/de-parken/');
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0].dataset.autoTrack, 'false');
  const clean = window.roofSignalBeforeAnalytics('event', { name: 'De Parken boeking voltooid', url: '/?email=secret', referrer: 'secret', title: 'secret', id: 'secret', data: { thermography: true, email: 'secret', postcode: 'secret', reference: 'secret' } });
  assert.equal(JSON.stringify(clean), JSON.stringify({ website: 'test', hostname: 'www.roofsignal.nl', url: '/de-parken', name: 'De Parken boeking voltooid', data: { thermography: true } }));
  for (const type of ['identify', 'performance', 'replay']) assert.equal(window.roofSignalBeforeAnalytics(type, {}), false);
  assert.equal(window.roofSignalBeforeAnalytics('event', { name: 'unknown customer event' }), false);
});

test('private routes, unknown routes, DNT and GPC never load the analytics provider', () => {
  for (const path of ['/offerte-akkoord', '/portal-klant.html', '/herroepen', '/customer/secret']) assert.equal(analyticsContext(path).loaded.length, 0);
  assert.equal(analyticsContext('/', { doNotTrack: '1' }).loaded.length, 0);
  assert.equal(analyticsContext('/', { globalPrivacyControl: true }).loaded.length, 0);
});
