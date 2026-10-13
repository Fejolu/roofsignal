import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { verifyErpDispatch } from '../supabase/functions/_shared/erp-dispatch-auth.mjs';

const SECRET = 'ab'.repeat(32);
const INSTANT = Date.parse('2026-10-13T12:00:00Z');
const TIMESTAMP = Math.floor(INSTANT / 1000);
const NONCE = 'f8cdd00b-1469-40d2-a68e-9cbcf4a86f66';
const sign = message => createHmac('sha256', Buffer.from(SECRET, 'hex')).update(message).digest('hex');
function request({ timestamp = TIMESTAMP, nonce = NONCE, body = '{}', signature,
  method = 'POST', headers = {}, ...options } = {}) {
  const timestampText = String(timestamp);
  return new Request('https://source.invalid/functions/v1/process-erp-intakes', {
    method, ...(method === 'POST' ? { body } : {}),
    headers: {
      'content-type': 'application/json',
      'x-roofsignal-dispatch-timestamp': timestampText,
      'x-roofsignal-dispatch-nonce': nonce,
      'x-roofsignal-dispatch-signature': signature ?? sign(timestampText + '.erp-drain:v1.' + nonce + '.{}'),
      ...headers,
    }, ...options,
  });
}
const verify = (input, secret = SECRET) => verifyErpDispatch(input, secret, { now: () => INSTANT });

test('valid scheduler signature uses the raw decoded key and returns only the nonce and timestamp', async () => {
  assert.deepEqual(await verify(request()), { nonce: NONCE, timestamp: TIMESTAMP });
  const asciiKeySignature = createHmac('sha256', SECRET).update(TIMESTAMP + '.erp-drain:v1.' + NONCE + '.{}').digest('hex');
  assert.equal(await verify(request({ signature: asciiKeySignature })), null);
});

test('the 60-second expiry and five-second future allowance are bounded', async () => {
  assert.deepEqual(await verify(request({ timestamp: TIMESTAMP - 59 })), { nonce: NONCE, timestamp: TIMESTAMP - 59 });
  assert.equal(await verify(request({ timestamp: TIMESTAMP - 60 })), null);
  assert.equal(await verify(request({ timestamp: TIMESTAMP - 61 })), null);
  assert.deepEqual(await verify(request({ timestamp: TIMESTAMP + 5 })), { nonce: NONCE, timestamp: TIMESTAMP + 5 });
  assert.equal(await verify(request({ timestamp: TIMESTAMP + 6 })), null);
});

test('intake signatures and other operations cannot authorize a queue drain', async () => {
  for (const message of [TIMESTAMP + '.{}', TIMESTAMP + '.erp-drain:v2.' + NONCE + '.{}',
    TIMESTAMP + '.report.publish:v1.' + NONCE + '.{}', TIMESTAMP + '.erp-drain:v1.' + NONCE + '.{"limit":100}']) {
    assert.equal(await verify(request({ signature: sign(message) })), null);
  }
});

test('only POST with exactly two empty-object bytes is accepted', async () => {
  assert.equal(await verify(request({ method: 'GET' })), null);
  for (const body of ['', '[]', ' {}', '{}\n', '{ }', '{"id":"customer"}']) assert.equal(await verify(request({ body })), null);
  for (const length of ['0', '1', '3', '999999', 'invalid']) assert.equal(await verify(request({ headers: { 'content-length': length } })), null);
  assert.deepEqual(await verify(request({ headers: { 'content-length': '2' } })), { nonce: NONCE, timestamp: TIMESTAMP });
});

test('oversized streamed bodies are cancelled without waiting for the remainder', async () => {
  let cancelled = false;
  const body = new ReadableStream({
    start(controller) { controller.enqueue(new TextEncoder().encode('{}extra')); },
    cancel() { cancelled = true; },
  });
  assert.equal(await verify(request({ body, duplex: 'half' })), null);
  assert.equal(cancelled, true);
});

test('malformed headers, secrets and altered nonces fail without reading the body', async () => {
  for (const headers of [
    { 'x-roofsignal-dispatch-timestamp': '001' },
    { 'x-roofsignal-dispatch-timestamp': TIMESTAMP + '.5' },
    { 'x-roofsignal-dispatch-nonce': 'not-a-uuid' },
    { 'x-roofsignal-dispatch-nonce': NONCE.toUpperCase() },
    { 'x-roofsignal-dispatch-signature': 'a'.repeat(63) },
    { 'x-roofsignal-dispatch-signature': 'Z'.repeat(64) },
  ]) {
    const input = request({ headers });
    assert.equal(await verify(input), null); assert.equal(input.bodyUsed, false);
  }
  for (const secret of [undefined, null, '', 'a'.repeat(63), SECRET.toUpperCase()]) assert.equal(await verify(request(), secret ?? ''), null);
  assert.equal(await verify(request({ headers: { 'x-roofsignal-dispatch-nonce': 'a8cdd00b-1469-40d2-a68e-9cbcf4a86f66' } })), null);
});

test('a signature changed at either end is rejected and malformed request failures stay closed', async () => {
  const signature = sign(TIMESTAMP + '.erp-drain:v1.' + NONCE + '.{}');
  for (const changed of [(signature[0] === 'a' ? 'b' : 'a') + signature.slice(1),
    signature.slice(0, -1) + (signature.at(-1) === 'a' ? 'b' : 'a')]) {
    assert.equal(await verify(request({ signature: changed })), null);
  }
  assert.equal(await verifyErpDispatch(null, SECRET), null);
  assert.equal(await verifyErpDispatch(request(), SECRET, { now: () => NaN }), null);
});
