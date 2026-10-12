// The only outbound destination and operation this worker can perform.
export const ERP_INTAKE_ENDPOINT = 'https://roofsignal-erp-test.pages.dev/api/website-intake';
export const ERP_INTAKE_MAX_BYTES = 65536;
const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/;
const SOURCES = new Set(['consumer', 'parken', 'vve']);
const encoder = new TextEncoder();
const failure = (code, review = false) => Object.assign(new Error(code), { code, review });

export function intakeEnvelope(job) {
  if (!SOURCES.has(job?.source) || !UUID.test(job?.source_id || '')
    || !Number.isInteger(job.revision) || job.revision < 1 || job.revision > 2147483647
    || typeof job.changed_at !== 'string' || job.changed_at.length > 40
    || !/^\d{4}-\d{2}-\d{2}T/.test(job.changed_at) || !Number.isFinite(Date.parse(job.changed_at))
    || !job.record || typeof job.record !== 'object' || Array.isArray(job.record)
    || job.record.id !== job.source_id) throw failure('RECEIPT_INVALID', true);
  return { source: job.source, source_id: job.source_id, revision: job.revision,
    changed_at: job.changed_at, record: job.record };
}

export async function signIntake(body, timestamp, secret) {
  if (!/^[a-f0-9]{64}$/.test(secret || '') || !/^\d{10}$/.test(timestamp)) throw failure('CONFIGURATION_REQUIRED');
  try {
    const bytes = Uint8Array.from(secret.match(/../g), value => Number.parseInt(value, 16));
    const key = await crypto.subtle.importKey('raw', bytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(timestamp + '.' + body));
    return Array.from(new Uint8Array(signature), value => value.toString(16).padStart(2, '0')).join('');
  } catch { throw failure('SIGNING_FAILED'); }
}

async function receiptBody(response) {
  const maximum = 4096;
  const length = response.headers.get('content-length');
  if (length && (!/^\d+$/.test(length) || Number(length) > maximum)) {
    await response.body?.cancel().catch(() => {});
    throw failure('RECEIPT_TOO_LARGE');
  }
  if (!response.body) throw failure('RECEIPT_INVALID');
  const reader = response.body.getReader(), chunks = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximum) { await reader.cancel().catch(() => {}); throw failure('RECEIPT_TOO_LARGE'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw failure('RECEIPT_INVALID'); }
}

export async function sendIntake(job, secret, { fetch: transport = globalThis.fetch, now = Date.now } = {}) {
  const event = intakeEnvelope(job), body = JSON.stringify(event);
  if (encoder.encode(body).byteLength > ERP_INTAKE_MAX_BYTES) throw failure('PAYLOAD_TOO_LARGE', true);
  const timestamp = String(Math.floor(now() / 1000));
  const signature = await signIntake(body, timestamp, secret);
  let response;
  try {
    response = await transport(ERP_INTAKE_ENDPOINT, {
      method: 'POST', redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(15000),
      headers: { 'Content-Type': 'application/json', 'X-RoofSignal-Timestamp': timestamp,
        'X-RoofSignal-Signature': signature }, body,
    });
  } catch (error) {
    throw failure(['TimeoutError','AbortError'].includes(error?.name) ? 'TRANSPORT_TIMEOUT' : 'TRANSPORT_FAILED');
  }
  if (response.status >= 300 && response.status < 400) {
    await response.body?.cancel().catch(() => {});
    throw failure('REDIRECT_REJECTED');
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    // Configuration/authentication failures remain retryable after correction.
    // Invalid canonical data and equal-revision conflicts need human review.
    throw failure('RECEIVER_REJECTED', [400,409,413,415].includes(response.status));
  }
  let receipt;
  try { receipt = await receiptBody(response); }
  catch (error) {
    if (['RECEIPT_TOO_LARGE','RECEIPT_INVALID'].includes(error?.code)) throw error;
    throw failure('TRANSPORT_FAILED');
  }
  if (receipt?.accepted !== true || receipt.source !== event.source
    || receipt.source_id !== event.source_id || receipt.revision !== event.revision) throw failure('RECEIPT_INVALID');
  return { accepted: true, source: event.source, source_id: event.source_id,
    revision: event.revision, ignored: receipt.ignored === true };
}

// Infrastructure is injected so disabled behavior and retry/receipt boundaries
// can be tested without calling a provider or sending real customer data.
export async function processIntakes({ enabled = false, secret, claim, ack, retry, send = sendIntake } = {}) {
  if (enabled !== true) return { ok: true, disabled: true, processed: 0, delivered: 0, failed: 0 };
  if (!/^[a-f0-9]{64}$/.test(secret || '')) throw failure('CONFIGURATION_REQUIRED');
  const jobs = await claim();
  const results = await Promise.all(jobs.map(async job => {
    try {
      await send(job, secret);
      // A source change may already have superseded this exact revision/lease.
      // It remains pending; a stale receipt cannot mark the new revision done.
      const saved = await ack(job);
      return { delivered: saved === true, superseded: saved === false, failed: false };
    } catch (error) {
      const codes = ['TRANSPORT_FAILED','TRANSPORT_TIMEOUT','REDIRECT_REJECTED','RECEIVER_REJECTED',
        'RECEIPT_INVALID','RECEIPT_TOO_LARGE','PAYLOAD_TOO_LARGE','SIGNING_FAILED','CONFIGURATION_REQUIRED'];
      const code = codes.includes(error?.code) ? error.code : 'QUEUE_ACK_FAILED';
      try { await retry(job, code, error?.review === true); } catch { /* The durable lease expires for a safe retry. */ }
      return { delivered: false, superseded: false, failed: true };
    }
  }));
  return { ok: results.every(result => !result.failed), disabled: false, processed: results.length,
    delivered: results.filter(result => result.delivered).length,
    superseded: results.filter(result => result.superseded).length,
    failed: results.filter(result => result.failed).length };
}
