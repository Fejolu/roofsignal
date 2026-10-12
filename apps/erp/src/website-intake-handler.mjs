// Narrow server-to-server entry point. It cannot issue sessions, access grants,
// payments, invoices, calendar writes or arbitrary ERP commands.
const MAX_BYTES = 65536;
const encoder = new TextEncoder();
const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const SOURCES = new Set(['consumer', 'parken', 'vve']);
const FIELDS = {
  consumer: ['id', 'mode', 'reference', 'status', 'close_code', 'payment_id', 'payment_status', 'calendar_event_id',
    'customer', 'terms', 'terms_accepted_at', 'slot_start', 'slot_end', 'created_at', 'updated_at', 'quote'],
  parken: ['id', 'reference', 'name', 'email', 'phone', 'street', 'house_number', 'postcode', 'slot_date', 'slot_time',
    'notes', 'status', 'source', 'terms_accepted_at', 'early_start_requested_at', 'thermography_interest_at',
    'thermography_selected', 'offer_version', 'inspection_excl_cents', 'thermography_excl_cents', 'total_incl_cents',
    'terms_version', 'created_at', 'updated_at', 'confirmation_sent_at', 'organization_id', 'property_id', 'appointment_id', 'inspection_id'],
  vve: ['id', 'request_type', 'name', 'organization', 'email', 'segment', 'postcode', 'object_complexity', 'site_access',
    'scope', 'message', 'status', 'source_path', 'created_at', 'intake_details'],
};
function allowedObject(value, keys, nullable = false) {
  if (nullable && value === null) return;
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) throw failure(400);
}
const HEADERS = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow, noarchive' };
const failure = status => Object.assign(new Error('Websitekoppeling niet beschikbaar.'), { status });
const hexBytes = value => Uint8Array.from(value.match(/../g), pair => Number.parseInt(pair, 16));

export function validateWebsiteIntake(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).some(key => !['source', 'source_id', 'revision', 'changed_at', 'record'].includes(key))
    || !SOURCES.has(value.source) || typeof value.source_id !== 'string' || !UUID.test(value.source_id)
    || !Number.isSafeInteger(value.revision) || value.revision < 1
    || typeof value.changed_at !== 'string' || value.changed_at.length > 40
    || !/^\d{4}-\d{2}-\d{2}T/.test(value.changed_at) || !Number.isFinite(Date.parse(value.changed_at))
    || !value.record || typeof value.record !== 'object' || Array.isArray(value.record)) throw failure(400);
  allowedObject(value.record, FIELDS[value.source]);
  if (value.record.id !== value.source_id) throw failure(400);
  if (value.source === 'consumer') {
    allowedObject(value.record.customer, ['name', 'email', 'phone', 'notes']);
    allowedObject(value.record.terms, ['version', 'accepted', 'earlyStartRequested']);
    allowedObject(value.record.quote, ['id', 'address', 'destination', 'inspection_type', 'thermal', 'pricing_version',
      'base_cents', 'thermal_cents', 'travel_cents', 'total_cents', 'distance_meters', 'travel_description',
      'terms_version', 'policy_version', 'campaign', 'created_at']);
    allowedObject(value.record.quote.address, ['postcode', 'houseNumber', 'street', 'city', 'country']);
  }
  return { ...value, source_id: value.source_id.toLowerCase() };
}

async function bodyBytes(request) {
  const length = request.headers.get('content-length');
  if (length && (!/^\d+$/.test(length) || Number(length) > MAX_BYTES)) {
    await request.body?.cancel().catch(() => {});
    throw failure(413);
  }
  if (!request.body) throw failure(400);
  const reader = request.body.getReader(), chunks = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) { await reader.cancel().catch(() => {}); throw failure(413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

export function createWebsiteIntakeHandler({ adapter, secret, origin, now = Date.now } = {}) {
  if (!adapter || typeof adapter.websiteIntake !== 'function' || !/^[a-f0-9]{64}$/.test(secret || '')
    || typeof now !== 'function' || new URL(origin).origin !== origin || !origin.startsWith('https://')) {
    throw Error('Besloten websitekoppeling vereist.');
  }
  // Crypto import is deferred to the request, for Cloudflare's request scope.
  return async function websiteIntake(request) {
    try {
      const target = new URL(request.url);
      if (target.origin !== origin || target.pathname !== '/api/website-intake' || target.search) throw failure(404);
      if (request.method !== 'POST') throw failure(405);
      if (!/^application\/json(?:\s*;.*)?$/i.test(request.headers.get('content-type') || '')) throw failure(415);
      const timestamp = request.headers.get('X-RoofSignal-Timestamp') || '';
      const signature = request.headers.get('X-RoofSignal-Signature') || '';
      if (!/^\d{10}$/.test(timestamp) || !/^[a-f0-9]{64}$/.test(signature)
        || Math.abs(Math.floor(now() / 1000) - Number(timestamp)) > 300) throw failure(401);
      const raw = await bodyBytes(request);
      const prefix = encoder.encode(timestamp + '.');
      const signed = new Uint8Array(prefix.length + raw.length);
      signed.set(prefix); signed.set(raw, prefix.length);
      const key = await crypto.subtle.importKey('raw', hexBytes(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
      if (!await crypto.subtle.verify('HMAC', key, hexBytes(signature), signed)) throw failure(401);
      let input;
      try { input = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw)); }
      catch { throw failure(400); }
      const payload = validateWebsiteIntake(input);
      const result = await adapter.websiteIntake(payload);
      if (result?.accepted !== true || result.source !== payload.source || result.source_id !== payload.source_id
        || result.revision !== payload.revision) throw failure(503);
      return Response.json({ accepted: true, source: payload.source, source_id: payload.source_id,
        revision: payload.revision, ignored: result.ignored === true }, { headers: HEADERS });
    } catch (error) {
      const status = [400, 401, 404, 405, 413, 415, 409].includes(error?.status) ? error.status : 503;
      return Response.json({ error: status === 401 ? 'Geen toegang.' : status === 400 ? 'Ongeldige websiteaanvraag.'
        : 'Websitekoppeling niet beschikbaar.' }, { status, headers: HEADERS });
    }
  };
}
