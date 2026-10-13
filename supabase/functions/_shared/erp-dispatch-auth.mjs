// This capability can trigger only an empty ERP queue drain. Its purpose and
// one-use nonce prevent reuse as an intake, payment or account authorization.
const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/;
const HEX = /^[a-f0-9]{64}$/;
const encoder = new TextEncoder();
const bytes = hex => Uint8Array.from(hex.match(/../g), value => Number.parseInt(value, 16));

async function emptyBody(request) {
  const length = request.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) !== 2)) return false;
  if (!request.body) return false;
  const reader = request.body.getReader();
  const result = new Uint8Array(2);
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (size + value.byteLength > 2) { await reader.cancel().catch(() => {}); return false; }
      result.set(value, size); size += value.byteLength;
    }
    return size === 2 && result[0] === 123 && result[1] === 125;
  } finally { reader.releaseLock(); }
}

// The receiver MUST atomically consume this verified nonce in PostgreSQL before
// reading/claiming queue work. Signature verification alone does not stop replay.
export async function verifyErpDispatch(request, secret, { now = Date.now } = {}) {
  try {
    if (request.method !== 'POST' || !HEX.test(secret || '')) return null;
    const timestampText = request.headers.get('x-roofsignal-dispatch-timestamp');
    const nonce = request.headers.get('x-roofsignal-dispatch-nonce');
    const signature = request.headers.get('x-roofsignal-dispatch-signature');
    if (!/^\d{10}$/.test(timestampText || '') || !UUID.test(nonce || '') || !HEX.test(signature || '')) return null;
    const timestamp = Number(timestampText), current = Math.floor(now() / 1000);
    if (!Number.isSafeInteger(current) || timestamp <= current - 60 || timestamp > current + 5) return null;
    if (!await emptyBody(request)) return null;
    const key = await crypto.subtle.importKey('raw', bytes(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const valid = await crypto.subtle.verify('HMAC', key, bytes(signature),
      encoder.encode(timestampText + '.erp-drain:v1.' + nonce + '.{}'));
    return valid ? { nonce, timestamp } : null;
  } catch { return null; }
}
