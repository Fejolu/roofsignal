// Server-only adapter. Authenticated business commands always keep the user's
// JWT; the elevated key is reserved for private files and the document RPC.
// Contracts: supabase/auth openapi.yaml; supabase/storage-js StorageFileApi.ts.
import { Buffer } from 'node:buffer';
import { validateWebsiteIntake } from './website-intake-handler.mjs';

const PRODUCTION_PROJECT = 'kakpticlxlaxtebhsuoh';
const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const FILE_KEY = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\.pdf$/;
const MAX_DOCUMENT = 10 * 1024 * 1024;
const MAX_JSON = 1024 * 1024;
const PROVIDER_CODES = new Set(['invalid_credentials', 'email_not_confirmed', 'user_not_found',
  'session_not_found', 'refresh_token_not_found', 'refresh_token_already_used', 'otp_expired',
  'over_email_send_rate_limit', 'over_request_rate_limit', 'weak_password', 'same_password',
  'P0001', '42501', '23503', '23505', '23514', 'PGRST301', 'PGRST302',
  'not_found', 'object_not_found', 'NoSuchKey', 'Duplicate', 'already_exists']);
function transportDiagnostic(error, stage) {
  const kind = ['TypeError', 'TimeoutError', 'AbortError', 'Error'].includes(error?.name) ? error.name : 'Error';
  const message = typeof error?.message === 'string' ? error.message : '';
  // Only static categories survive. The provider's original exception can
  // contain credentials and URLs, so it is never retained on the error object.
  const reason = /illegal invocation/i.test(message) ? 'receiver'
    : /invalid redirect value|unsupported redirect (?:value|mode)|redirect.*(?:not supported|won.t be implemented)/i.test(message) ? 'redirect'
    : /unsupported cache mode|cache mode.*not supported|cache option.*not (?:implemented|supported)/i.test(message) ? 'cache'
    : /different request|outside.*request context|global scope.*(?:async|io|i\/o)|i\/o.*global scope/i.test(message) ? 'request_scope'
    : /abortsignal\.timeout.*(?:not a function|undefined)/i.test(message) ? 'timeout_api'
    : /timeout|timed out/i.test(message) ? 'timeout'
    : /reader.*(?:released|locked)|readablestream.*(?:locked|closed)|stream.*(?:premature|closed)/i.test(message) ? 'stream'
    : /unsupported.*encoding|invalid.*content.encoding|decompress/i.test(message) ? 'encoding'
    : /fetch failed/i.test(message) ? 'fetch_failed' : undefined;
  return { transportStage: stage, transportKind: kind, ...(reason ? { transportReason: reason } : {}) };
}

export class SupabaseAdapterError extends Error {
  constructor(code, status = 502, providerCode) {
    const message = status === 401 ? 'Aanmelden is niet gelukt.'
      : status === 403 ? 'Geen toegang.'
      : status === 404 ? 'Bestand of dossier niet beschikbaar.'
      : status === 409 ? 'Dit gegeven is al vastgelegd of gewijzigd.'
      : status === 429 ? 'Te veel verzoeken. Probeer het later opnieuw.'
      : status === 400 ? 'Controleer de invoer.' : 'De verbinding is tijdelijk niet beschikbaar.';
    super(message);
    this.name = 'SupabaseAdapterError';
    this.code = code;
    this.status = status;
    if (PROVIDER_CODES.has(providerCode)) this.providerCode = providerCode;
  }
}
const invalid = () => new SupabaseAdapterError('SUPABASE_INVALID_INPUT', 400);

function keyRole(key) {
  if (typeof key !== 'string' || key.length > 8192 || !/^[A-Za-z0-9._-]+$/.test(key)) return null;
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) return 'anon';
  if (/^sb_secret_[A-Za-z0-9_-]+$/.test(key)) return 'service_role';
  if (key.split('.').length !== 3) return null;
  // This only classifies configured keys. The provider verifies their signature.
  try { return JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role; }
  catch { return null; }
}
function configuredUrl(raw, testProjectRef) {
  let parsed;
  try { parsed = new URL(raw); } catch { throw invalid(); }
  const match = parsed.hostname.match(/^([a-z]{20})\.supabase\.co$/);
  if (!match || parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port
    || parsed.pathname !== '/' || parsed.search || parsed.hash
    || match[1] === PRODUCTION_PROJECT || testProjectRef !== match[1]) throw invalid();
  return parsed.origin;
}
function emailInput(email) {
  if (typeof email !== 'string' || email.length > 254) throw invalid();
  const value = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw invalid();
  return value;
}
function passwordInput(password, minimum = 1) {
  if (typeof password !== 'string' || password.length < minimum || password.length > 1024 || password.includes('\0')) throw invalid();
  return password;
}
function tokenInput(token, excluded) {
  if (typeof token !== 'string' || !token || token.length > 8192 || !/^[A-Za-z0-9._-]+$/.test(token)
    || excluded.includes(token) || token.startsWith('sb_') || keyRole(token) === 'service_role') throw invalid();
  return token;
}
function userView(user) {
  if (!user || !UUID.test(user.id || '')) throw new SupabaseAdapterError('SUPABASE_BAD_RESPONSE');
  const result = { id: user.id };
  if (user.email !== undefined) result.email = emailInput(user.email);
  result.email_confirmed_at = typeof user.email_confirmed_at === 'string' ? user.email_confirmed_at : null;
  result.is_anonymous = user.is_anonymous === true;
  // Names are profile data, never roles or dossier grants.
  result.user_metadata = {};
  for (const key of ['name', 'full_name']) {
    const value = user.user_metadata?.[key];
    if (typeof value === 'string' && value.length <= 200) result.user_metadata[key] = value;
  }
  return result;
}
function sessionView(value, excluded) {
  if (!value || value.token_type !== 'bearer' || !Number.isSafeInteger(value.expires_in)
    || value.expires_in < 1 || value.expires_in > 604800) throw new SupabaseAdapterError('SUPABASE_BAD_RESPONSE');
  try {
    return { access_token: tokenInput(value.access_token, excluded), refresh_token: tokenInput(value.refresh_token, excluded),
      expires_in: value.expires_in, expires_at: Math.floor(Date.now() / 1000) + value.expires_in,
      token_type: 'bearer', user: userView(value.user) };
  } catch { throw new SupabaseAdapterError('SUPABASE_BAD_RESPONSE'); }
}
function fileKey(key) {
  if (typeof key !== 'string' || !FILE_KEY.test(key)) throw invalid();
  return key;
}
function jsonBody(value, limit = 65536) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
  let body;
  try { body = JSON.stringify(value); } catch { throw invalid(); }
  if (Buffer.byteLength(body) > limit) throw invalid();
  return body;
}
async function readLimited(response, limit) {
  const declared = response.headers.get('content-length');
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > limit)) {
    await response.body?.cancel().catch(() => {});
    throw new SupabaseAdapterError('SUPABASE_BAD_RESPONSE');
  }
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader(), parts = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel().catch(() => {});
        throw new SupabaseAdapterError('SUPABASE_BAD_RESPONSE');
      }
      parts.push(Buffer.from(value));
    }
    return Buffer.concat(parts, size);
  } finally { reader.releaseLock(); }
}

export function createSupabaseAdapter({ url, publishableKey, storageKey, fetch: fetchImpl = globalThis.fetch,
  testProjectRef, redirectOrigin, timeoutMs = 15000 } = {}) {
  const base = configuredUrl(url, testProjectRef);
  if (keyRole(publishableKey) !== 'anon' || (storageKey && keyRole(storageKey) !== 'service_role')
    || typeof fetchImpl !== 'function' || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000) throw invalid();
  let resetOrigin;
  if (redirectOrigin) {
    try {
      const parsed = new URL(redirectOrigin);
      if (parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash
        || !(parsed.protocol === 'https:' || (parsed.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(parsed.hostname)))) throw invalid();
      resetOrigin = parsed.origin;
    } catch { throw invalid(); }
  }
  const excluded = [publishableKey, storageKey].filter(Boolean);
  const userToken = token => tokenInput(token, excluded);
  const publicHeaders = token => ({ apikey: publishableKey, ...(token ? { Authorization: `Bearer ${userToken(token)}` } : {}) });
  const privateHeaders = () => {
    if (!storageKey) throw new SupabaseAdapterError('SUPABASE_STORAGE_NOT_CONFIGURED', 503);
    // New secret keys are not JWTs. Legacy service JWTs still need Bearer.
    return { apikey: storageKey, ...(storageKey.startsWith('sb_secret_') ? {} : { Authorization: `Bearer ${storageKey}` }) };
  };
  async function request(endpoint, { method = 'GET', headers, body, binary = false } = {}) {
    // endpoint is an internal constant or a strictly validated UUID filename.
    let response;
    let transportStage = 'fetch';
    try {
      response = await fetchImpl(base + endpoint, { method, headers: { ...headers, ...(binary ? {} : { 'Content-Type': 'application/json' }) },
        // workerd deliberately rejects redirect:'error'. Manual mode works on
        // both runtimes and explicit 3xx rejection keeps credentials at the
        // configured project instead of forwarding them to another URL.
        body, redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(timeoutMs) });
      if (response.status >= 300 && response.status < 400) {
        await response.body?.cancel().catch(() => {});
        throw Object.assign(new SupabaseAdapterError('SUPABASE_REDIRECT_REJECTED', 502),
          { transportStage: 'fetch', transportKind: 'Error', transportReason: 'redirect' });
      }
      transportStage = 'read';
      const bytes = await readLimited(response, binary && response.ok ? MAX_DOCUMENT : MAX_JSON);
      let data;
      if (!binary || !response.ok) {
        try { data = bytes.length ? JSON.parse(bytes.toString('utf8')) : null; }
        catch { throw new SupabaseAdapterError('SUPABASE_BAD_RESPONSE'); }
      }
      if (!response.ok) {
        const providerCode = data?.error_code || data?.code || data?.error;
        const objectMissing = ['not_found', 'object_not_found', 'NoSuchKey'].includes(providerCode)
          || Number(data?.statusCode) === 404;
        const duplicate = ['Duplicate', 'already_exists'].includes(providerCode) || Number(data?.statusCode) === 409;
        const status = objectMissing ? 404 : duplicate ? 409 : response.status === 401 ? 401
          : response.status === 403 || providerCode === '42501' ? 403 : response.status === 404 ? 404
          : response.status === 409 ? 409 : response.status === 429 ? 429 : response.status < 500 ? 400 : 503;
        throw new SupabaseAdapterError(status === 401 ? 'SUPABASE_AUTH_FAILED' : status === 403 ? 'SUPABASE_FORBIDDEN'
          : status === 404 ? 'SUPABASE_NOT_FOUND' : status === 409 ? 'SUPABASE_CONFLICT'
          : status === 429 ? 'SUPABASE_RATE_LIMIT' : status === 400 ? 'SUPABASE_REJECTED' : 'SUPABASE_UNAVAILABLE', status, providerCode);
      }
      return binary ? bytes : data;
    } catch (error) {
      // Provider messages and exception causes can contain tokens, addresses or
      // URLs. Never propagate their text to logs or to the browser.
      if (error instanceof SupabaseAdapterError) throw error;
      throw Object.assign(new SupabaseAdapterError('SUPABASE_UNAVAILABLE', 503), transportDiagnostic(error, transportStage));
    }
  }
  const authSession = async (endpoint, body) => sessionView(await request(endpoint,
    { method: 'POST', headers: publicHeaders(), body: jsonBody(body) }), excluded);
  return Object.freeze({
    signIn(email, password) { return authSession('/auth/v1/token?grant_type=password', { email: emailInput(email), password: passwordInput(password) }); },
    refresh(refreshToken) { return authSession('/auth/v1/token?grant_type=refresh_token', { refresh_token: userToken(refreshToken) }); },
    async getUser(accessToken) { return userView(await request('/auth/v1/user', { headers: publicHeaders(userToken(accessToken)) })); },
    async signOut(accessToken) { await request('/auth/v1/logout?scope=local', { method: 'POST', headers: publicHeaders(userToken(accessToken)) }); return { ok: true }; },
    async resetPassword(email, redirectTo) {
      let redirect;
      try { redirect = new URL(redirectTo); } catch { throw invalid(); }
      if (redirect.username || redirect.password || redirect.hash
        || !(redirect.protocol === 'https:' || (redirect.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(redirect.hostname)))
        || (resetOrigin && redirect.origin !== resetOrigin)) throw invalid();
      await request('/auth/v1/recover?redirect_to=' + encodeURIComponent(redirect.href),
        { method: 'POST', headers: publicHeaders(), body: jsonBody({ email: emailInput(email) }) });
      return { ok: true };
    },
    async updatePassword(accessToken, password) { return userView(await request('/auth/v1/user',
      { method: 'PUT', headers: publicHeaders(userToken(accessToken)), body: jsonBody({ password: passwordInput(password, 8) }) })); },
    verifyOtp(tokenHash, type = 'recovery') {
      if (!['recovery', 'invite'].includes(type) || typeof tokenHash !== 'string' || !/^[A-Za-z0-9_-]{20,256}$/.test(tokenHash)) throw invalid();
      return authSession('/auth/v1/verify', { token_hash: tokenHash, type });
    },
    command(accessToken, action, payload = {}) {
      if (typeof action !== 'string' || !/^[a-z][a-z0-9.]{0,80}$/.test(action)) throw invalid();
      return request('/rest/v1/rpc/roofsignal_erp', { method: 'POST', headers: publicHeaders(userToken(accessToken)), body: jsonBody({ action, payload }) });
    },
    websiteIntake(input) {
      const payload = validateWebsiteIntake(input);
      return request('/rest/v1/rpc/roofsignal_erp_intake', { method: 'POST', headers: privateHeaders(), body: jsonBody({ payload }) });
    },
    async upload(key, bytes, { contentType = 'application/pdf', upsert = false } = {}) {
      const validated = fileKey(key);
      if (!(bytes instanceof Uint8Array) || bytes.byteLength < 5 || bytes.byteLength > MAX_DOCUMENT
        || Buffer.from(bytes.buffer, bytes.byteOffset, 5).toString() !== '%PDF-' || contentType !== 'application/pdf' || upsert !== false) throw invalid();
      await request('/storage/v1/object/erp-documents/' + validated, { method: 'POST',
        headers: { ...privateHeaders(), 'Content-Type': 'application/pdf', 'cache-control': 'no-store', 'x-upsert': 'false' }, body: bytes, binary: true });
      return { key: validated };
    },
    async download(key) {
      const bytes = await request('/storage/v1/object/authenticated/erp-documents/' + fileKey(key), { headers: privateHeaders(), binary: true });
      if (bytes.length < 5 || bytes.subarray(0, 5).toString() !== '%PDF-') throw new SupabaseAdapterError('SUPABASE_BAD_RESPONSE');
      return bytes;
    },
    async remove(key) {
      await request('/storage/v1/object/erp-documents', { method: 'DELETE', headers: privateHeaders(), body: jsonBody({ prefixes: [fileKey(key)] }) });
      return { ok: true };
    },
    attachDocument(callerUUID, payload) {
      if (!UUID.test(callerUUID || '')) throw invalid();
      return request('/rest/v1/rpc/roofsignal_erp_document', { method: 'POST', headers: privateHeaders(), body: jsonBody({ caller_uuid: callerUUID, payload }) });
    },
    session(callerUUID, action, payload = {}) {
      if (!UUID.test(callerUUID || '') || typeof action !== 'string' || !/^[a-z][a-z0-9.]{0,80}$/.test(action)) throw invalid();
      return request('/rest/v1/rpc/roofsignal_erp_session', { method: 'POST', headers: privateHeaders(), body: jsonBody({ caller_uuid: callerUUID, action, payload }) });
    },
    ensureProfile(callerUUID, payload = {}) {
      if (!UUID.test(callerUUID || '') || !payload || typeof payload !== 'object' || Array.isArray(payload)
        || Object.keys(payload).some(key => !['name', 'phone'].includes(key))) throw invalid();
      return request('/rest/v1/rpc/roofsignal_erp_profile', { method: 'POST', headers: privateHeaders(), body: jsonBody({ caller_uuid: callerUUID, payload }) });
    },
  });
}
