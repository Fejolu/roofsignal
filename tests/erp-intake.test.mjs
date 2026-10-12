import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import { ERP_INTAKE_ENDPOINT, intakeEnvelope, signIntake, sendIntake, processIntakes } from '../supabase/functions/_shared/erp-intake.mjs';
import { consumerAdminKeys, isConsumerAdmin } from '../supabase/functions/_shared/consumer-admin.mjs';

const secret = 'b'.repeat(64), instant = Date.parse('2026-10-12T21:00:00Z');
const job = () => {
  const id = randomUUID();
  return { source: 'vve', source_id: id, revision: 2, changed_at: '2026-10-12T20:01:02+00:00',
    record: { id, name: 'VvE Test', message: 'Geen geaccepteerde offerte.' },
    lock_token: randomUUID(), status: 'processing', attempts: 99 };
};
const accepted = (event, overrides = {}) => Response.json({ accepted: true, source: event.source,
  source_id: event.source_id, revision: event.revision, ...overrides });

test('exact raw UTF-8 body is signed with a decoded 32-byte secret', async () => {
  const body = '{"naam":"VvE De ëik"}', timestamp = String(Math.floor(instant / 1000));
  assert.equal(await signIntake(body, timestamp, secret), createHmac('sha256', Buffer.from(secret, 'hex')).update(timestamp + '.' + body).digest('hex'));
  await assert.rejects(signIntake(body, timestamp, 'https://untrusted.invalid'), /CONFIGURATION_REQUIRED/);
});

test('transport uses the fixed destination and binds the receipt to one exact source revision', async () => {
  const original = job();
  const result = await sendIntake(original, secret, { now: () => instant, fetch: async (url, options) => {
    assert.equal(url, ERP_INTAKE_ENDPOINT); assert.equal(options.redirect, 'manual');
    const event = JSON.parse(options.body);
    assert.deepEqual(event, intakeEnvelope(original));
    assert.ok(!options.body.includes(original.lock_token)); assert.ok(!options.body.includes(secret));
    assert.equal(options.headers['X-RoofSignal-Signature'], createHmac('sha256', Buffer.from(secret, 'hex'))
      .update(options.headers['X-RoofSignal-Timestamp'] + '.' + options.body).digest('hex'));
    return accepted(event, { ignored: true });
  } });
  assert.equal(result.ignored, true);
  for (const changed of [{ revision: 1 }, { source: 'parken' }, { source_id: randomUUID() }, { accepted: false }]) {
    await assert.rejects(sendIntake(original, secret, { now: () => instant,
      fetch: async () => accepted(original, changed) }), /RECEIPT_INVALID/);
  }
});

test('redirects never forward signed customer data, follow Location or decode error bodies', async () => {
  let sent = 0, cancelled = 0;
  const stream = new ReadableStream({ cancel() { cancelled++; } });
  await assert.rejects(sendIntake(job(), secret, { now: () => instant, fetch: async (url, options) => {
    sent++; assert.equal(url, ERP_INTAKE_ENDPOINT); assert.equal(options.redirect, 'manual');
    return new Response(stream, { status: 307, headers: { Location: 'https://untrusted.invalid/' + secret } });
  } }), error => error.code === 'REDIRECT_REJECTED' && !error.message.includes(secret));
  assert.equal(sent, 1); assert.equal(cancelled, 1);
});

test('oversized customer records are rejected before signing or network and receipts are bounded', async () => {
  const input = job(); input.record.message = 'é'.repeat(40000);
  let sent = 0;
  await assert.rejects(sendIntake(input, secret, { fetch: async () => { sent++; } }), error => error.code === 'PAYLOAD_TOO_LARGE' && error.review);
  assert.equal(sent, 0);
  await assert.rejects(sendIntake(job(), secret, { now: () => instant,
    fetch: async () => new Response('x'.repeat(5000)) }), /RECEIPT_TOO_LARGE/);
});

test('configuration and disabled mode make no claim, signature or outbound request', async () => {
  const never = () => assert.fail('Disabled handoff must not perform work');
  assert.deepEqual(await processIntakes({ enabled: false, claim: never, ack: never, retry: never, send: never }),
    { ok: true, disabled: true, processed: 0, delivered: 0, failed: 0 });
  await assert.rejects(processIntakes({ enabled: true, secret: '', claim: never }), /CONFIGURATION_REQUIRED/);
});

test('network uncertainty is retried durably; a stale ACK cannot complete a newer revision', async () => {
  const original = job(), retries = [], acks = [];
  const first = await processIntakes({ enabled: true, secret, claim: async () => [original],
    send: async () => { throw Object.assign(Error('provider secret must not leak'), { code: 'TRANSPORT_TIMEOUT' }); },
    ack: async () => assert.fail('No delivery receipt'), retry: async (...args) => retries.push(args) });
  assert.equal(first.failed, 1); assert.equal(first.ok, false);
  assert.deepEqual(retries[0], [original, 'TRANSPORT_TIMEOUT', false]);
  const second = await processIntakes({ enabled: true, secret, claim: async () => [original], send: async () => ({}),
    ack: async input => { acks.push(input); return false; }, retry: async () => assert.fail('Revision already superseded') });
  assert.equal(second.superseded, 1); assert.equal(second.ok, true); assert.equal(second.delivered, 0);
  assert.equal(acks[0], original);
});

test('unreadable receipt and receiver failures keep safe codes; invalid canonical data needs review', async () => {
  for (const [status, review] of [[401, false], [503, false], [429, false], [409, true], [400, true]]) {
    await assert.rejects(sendIntake(job(), secret, { now: () => instant, fetch: async () => new Response(secret, { status }) }),
      error => error.code === 'RECEIVER_REJECTED' && error.review === review && !error.message.includes(secret));
  }
  await assert.rejects(sendIntake(job(), secret, { now: () => instant, fetch: async () => { throw Error(secret); } }),
    error => error.code === 'TRANSPORT_FAILED' && !error.message.includes(secret));
  const input = job(); input.record.id = randomUUID();
  assert.throws(() => intakeEnvelope(input), /RECEIPT_INVALID/);
});

test('production release and existing scheduler include the separately authenticated ERP worker', async () => {
  const manifest = JSON.parse(await readFile(new URL('../supabase/release-manifest.json', import.meta.url), 'utf8'));
  assert.ok(manifest.functions.includes('process-erp-intakes'));
  const config = await readFile(new URL('../supabase/config.toml', import.meta.url), 'utf8');
  assert.match(config, /\[functions\.process-erp-intakes\]\nverify_jwt = false/);
  const source = await readFile(new URL('../supabase/functions/process-erp-intakes/index.ts', import.meta.url), 'utf8');
  assert.match(source, /CONSUMER_AUTOMATION_SECRET/); assert.match(source, /ERP_INTAKE_ENABLED'\) === 'true'/);
  const schedule = await readFile(new URL('../.github/workflows/process-consumer-bookings.yml', import.meta.url), 'utf8');
  assert.match(schedule, /functions\/v1\/process-erp-intakes/); assert.match(schedule, /if: \$\{\{ always\(\) \}\}/);
});

async function worker(environment = {}, options = {}) {
  const calls = []; let handle;
  const source = await readFile(new URL('../supabase/functions/process-erp-intakes/index.ts', import.meta.url), 'utf8');
  vm.runInNewContext(stripTypeScriptTypes(source.replace(/^import[^\n]+\n/gm,'')), {
    Request, Response, Error, Boolean, consumerAdminKeys, isConsumerAdmin,
    Deno: { env: { get: name => environment[name] } },
    serve: handler => { handle = handler; },
    processIntakes: args => processIntakes({ ...args, send: async (job, key) => {
      calls.push({ kind: 'send', revision: job.revision }); assert.equal(key, secret);
      if (options.transportError) throw Object.assign(Error('Sensitive provider text'), { code: 'TRANSPORT_FAILED' });
    } }),
    createClient: (url, key) => {
      calls.push({ kind: 'client', url, key });
      return { rpc: async (name,args) => {
        calls.push({ kind: 'rpc', name, args });
        return { data: name === 'claim_erp_intakes' ? [options.job || job()] : true, error: null };
      }, from: name => ({ select: () => ({ eq: async () => {
        calls.push({ kind: 'review', name }); return { count: options.review || 0, error: null };
      } }) }) };
    },
  });
  return { calls, handle: (headers = {}, method = 'POST') => handle(new Request('https://source.example.invalid/functions/v1/process-erp-intakes', { method, headers })) };
}

test('actual worker rejects public callers and unsupported methods before provider or database work', async () => {
  const app = await worker({ SUPABASE_SERVICE_ROLE_KEY: 'service-private', CONSUMER_AUTOMATION_SECRET: 'scheduler-private', ERP_INTAKE_ENABLED: 'true' });
  for (const headers of [{}, { apikey: 'sb_publishable_public' }, { 'x-automation-secret': 'wrong' }, { authorization: 'Bearer user-token' }])
    assert.equal((await app.handle(headers)).status,401);
  assert.equal((await app.handle({},'GET')).status,405);
  assert.equal((await app.handle({},'OPTIONS')).status,204);
  assert.deepEqual(app.calls,[]);
});

test('actual worker default-disabled accepts trusted scheduler but neither reads a queue nor sends data', async () => {
  for (const value of [undefined,'false','TRUE','1']) {
    const app = await worker({ CONSUMER_AUTOMATION_SECRET: 'scheduler-private', ERP_INTAKE_ENABLED: value });
    const response = await app.handle({ 'x-automation-secret': 'scheduler-private' });
    assert.equal(response.status,200); assert.equal((await response.json()).disabled,true); assert.deepEqual(app.calls,[]);
  }
});

test('actual worker sends one claimed snapshot, acknowledges its same revision and omits customer data from output', async () => {
  const snapshot = job();
  const app = await worker({ ERP_INTAKE_ENABLED: 'true', ERP_INTAKE_SECRET: secret,
    SUPABASE_SECRET_KEYS: JSON.stringify({ default: 'sb_secret_private-test' }), SUPABASE_URL: 'https://source.example.invalid' }, { job: snapshot });
  const response = await app.handle({ apikey: 'sb_secret_private-test' });
  assert.equal(response.status,200); const result = await response.json(); assert.equal(result.delivered,1);
  assert.equal(app.calls.filter(call=>call.kind==='send').length,1);
  const ack = app.calls.find(call=>call.name==='ack_erp_intake');
  assert.equal(ack.args.p_lock_token,snapshot.lock_token); assert.equal(ack.args.p_revision,snapshot.revision);
  assert.ok(!JSON.stringify(result).includes('VvE Test')); assert.ok(!JSON.stringify(result).includes(secret));
});

test('actual worker retries network failure and reports preexisting manual review without repeating external effects', async () => {
  const env = { ERP_INTAKE_ENABLED: 'true', ERP_INTAKE_SECRET: secret,
    ERP_AUTOMATION_SECRET: 'erp-private', SUPABASE_SERVICE_ROLE_KEY: 'service-private', SUPABASE_URL: 'https://source.example.invalid' };
  const app = await worker(env,{ transportError: true });
  const response = await app.handle({ 'x-automation-secret': 'erp-private' }); assert.equal(response.status,502);
  const retry = app.calls.find(call=>call.name==='retry_erp_intake'); assert.equal(retry.args.p_error,'TRANSPORT_FAILED');
  assert.equal(retry.args.p_review,false); assert.equal(app.calls.some(call=>call.name==='ack_erp_intake'),false);
  const needsReview = await worker(env,{review:1});
  const reviewResponse = await needsReview.handle({ authorization: 'Bearer service-private' });
  assert.equal(reviewResponse.status,502); assert.equal((await reviewResponse.json()).needsReview,1);
});
