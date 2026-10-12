// Fetch-compatible BFF: tokens stay in an encrypted HttpOnly cookie and every
// request rechecks the durable session and the verified Supabase identity.
const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const FILE_KEY = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\.pdf$/;
const MAX_DOCUMENT = 10 * 1024 * 1024;
const MAX_JSON = 65536;
const ownError = Symbol('hosted-handler-error');
const encoder = new TextEncoder();
const fail = (status, message) => Object.assign(new Error(message), { status, [ownError]: true });
const loginRequired = () => fail(401, 'Log opnieuw in om uw werkruimte te openen.');
const genericMessage = status => status === 401 ? 'Aanmelden is niet gelukt.' : status === 403 ? 'Geen toegang.'
  : status === 404 ? 'Bestand of dossier niet beschikbaar.' : status === 409 ? 'Dit gegeven is al vastgelegd of gewijzigd.'
  : status === 429 ? 'Te veel verzoeken. Probeer het later opnieuw.' : status === 400 ? 'Controleer de invoer.'
  : 'De verbinding is tijdelijk niet beschikbaar. Probeer het later opnieuw.';
const hex = bytes => Array.from(new Uint8Array(bytes), part => part.toString(16).padStart(2, '0')).join('');
const hash = async value => hex(await crypto.subtle.digest('SHA-256', typeof value === 'string' ? encoder.encode(value) : value));
const capability = () => hex(crypto.getRandomValues(new Uint8Array(32)));
const sameUuid = (one, two) => typeof one === 'string' && typeof two === 'string' && UUID.test(one) && UUID.test(two)
  && one.toLowerCase() === two.toLowerCase();
function normalizeUuid(value) {
  if (typeof value !== 'string' || !UUID.test(value)) throw fail(400, 'Rapport of verzoeknummer ontbreekt.');
  return value.toLowerCase();
}
function confirmedUser(user, expected) {
  if (!user || !UUID.test(user.id || '') || (expected && !sameUuid(user.id, expected))
    || user.is_anonymous === true || typeof user.email_confirmed_at !== 'string' || !Number.isFinite(Date.parse(user.email_confirmed_at))) throw loginRequired();
  return user;
}
function validSession(session, now) {
  return session && /^[0-9a-f]{64}$/.test(session.id || '') && UUID.test(session.user || '')
    && ['login', 'recovery'].includes(session.purpose) && typeof session.accessToken === 'string' && session.accessToken.length > 0
    && typeof session.refreshToken === 'string' && session.refreshToken.length > 0
    && Number.isFinite(session.accessExpiresAt) && Number.isFinite(session.expiresAt) && session.expiresAt > now;
}
function nativeTokens(native, now) {
  const expires = Number.isFinite(native?.expires_at) ? native.expires_at * 1000
    : Number.isFinite(native?.expires_in) ? now + native.expires_in * 1000 : NaN;
  if (!native || typeof native.access_token !== 'string' || !native.access_token || typeof native.refresh_token !== 'string'
    || !native.refresh_token || !Number.isFinite(expires) || expires <= now) throw fail(503, genericMessage(503));
  return { accessToken: native.access_token, refreshToken: native.refresh_token, accessExpiresAt: expires };
}
async function readBody(request, maximum) {
  const declared = request.headers.get('content-length');
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > maximum)) {
    await request.body?.cancel().catch(() => {});
    throw fail(413, 'Bestand of invoer is te groot.');
  }
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader(), parts = [];
  let total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximum) {
        await reader.cancel().catch(() => {});
        throw fail(413, 'Bestand of invoer is te groot.');
      }
      parts.push(value);
    }
  } finally { reader.releaseLock(); }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.byteLength; }
  return result;
}
async function readJson(request) {
  if (!/^application\/json(?:\s*;.*)?$/i.test(request.headers.get('content-type') || '')) throw fail(415, 'JSON-invoer vereist.');
  let data;
  try { data = JSON.parse(new TextDecoder().decode(await readBody(request, MAX_JSON))); }
  catch (error) { if (error?.[ownError]) throw error; throw fail(400, 'Ongeldige invoer.'); }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw fail(400, 'Ongeldige invoer.');
  return data;
}
const pdfBytes = bytes => bytes instanceof Uint8Array && bytes.length >= 5 && bytes.length <= MAX_DOCUMENT
  && new TextDecoder().decode(bytes.subarray(0, 5)) === '%PDF-';
function fileName(raw, encoded = false) {
  let name;
  try { name = encoded ? decodeURIComponent(raw || 'Rapport.pdf') : raw; } catch { throw fail(400, 'Ongeldige bestandsnaam.'); }
  if (typeof name !== 'string' || !name.trim() || name.length > 200 || /[\x00-\x1f\x7f/\\]/.test(name)) throw fail(400, 'Ongeldige bestandsnaam.');
  return name.trim();
}
const encodedFileName = value => encodeURIComponent(value).replace(/[!'()*]/g, char => '%' + char.charCodeAt(0).toString(16).toUpperCase());

export function createHostedHandler({ adapter, cookies, origin, now = Date.now, rateLimitKey = () => 'global' } = {}) {
  let base;
  try {
    const configured = new URL(origin);
    if (configured.origin !== origin || !(configured.protocol === 'https:' || (configured.protocol === 'http:'
      && ['localhost', '127.0.0.1'].includes(configured.hostname)))) throw new Error();
    base = configured.origin;
  } catch { throw Error('Een geldige, vaste ERP-origin is vereist.'); }
  if (!adapter || !cookies || typeof cookies.encode !== 'function' || typeof cookies.decode !== 'function'
    || typeof cookies.clear !== 'function' || typeof now !== 'function' || typeof rateLimitKey !== 'function') throw Error('ERP-adapter en sessiecookies zijn vereist.');
  const refreshes = new Map();
  const attempts = new Map();
  function limitAuth(kind, request) {
    const time = now(), maximum = kind === 'reset' ? 5 : 10, windowMs = kind === 'reset' ? 15 * 60000 : 10 * 60000;
    // Only the trusted HTTP/edge wrapper can select this key. Never trust an
    // X-Forwarded-For header supplied by the browser.
    const supplied = rateLimitKey(request);
    const selected = typeof supplied === 'string' && supplied.length > 0 && supplied.length <= 200 ? supplied : 'global';
    for (const [id, item] of attempts) if (item.until <= time) attempts.delete(id);
    let id = kind + ':' + selected;
    if (!attempts.has(id) && attempts.size >= 1000) id = kind + ':overflow';
    const item = attempts.get(id) || { hits: 0, until: time + windowMs };
    item.hits += 1;
    attempts.set(id, item);
    if (item.hits > maximum) throw Object.assign(fail(429, genericMessage(429)), { retryAfter: Math.max(1, Math.ceil((item.until - time) / 1000)) });
  }
  async function checkedRegistry(session, action = 'check') {
    const state = await adapter.session(session.user.toLowerCase(), action, { session_hash: await hash(session.id) });
    if (['revoke', 'consume'].includes(action)) return state;
    if (state?.valid !== true || state.purpose !== session.purpose || Date.parse(state.expires_at) !== session.expiresAt) throw loginRequired();
    return state;
  }
  async function authenticate(request) {
    const decoded = await cookies.decode(request);
    if (!validSession(decoded, now())) throw loginRequired();
    let session = { ...decoded, user: decoded.user.toLowerCase() }, changed = false;
    try {
      await checkedRegistry(session);
      if (session.accessExpiresAt <= now() + 30000) {
        let pending = refreshes.get(session.id);
        if (!pending) {
          pending = (async () => ({ ...session, ...nativeTokens(await adapter.refresh(session.refreshToken), now()) }))();
          refreshes.set(session.id, pending);
          pending.finally(() => { if (refreshes.get(session.id) === pending) refreshes.delete(session.id); }).catch(() => {});
        }
        const renewed = await pending;
        if (renewed.user !== session.user || renewed.expiresAt !== session.expiresAt || renewed.purpose !== session.purpose) throw loginRequired();
        session = renewed;
        changed = true;
        if (!validSession(session, now())) throw loginRequired();
        await checkedRegistry(session);
      }
      confirmedUser(await adapter.getUser(session.accessToken), session.user);
    } catch (error) {
      if (error?.[ownError] || ![400, 401, 403].includes(error?.status)) throw error;
      throw loginRequired();
    }
    return { session, cookie: changed ? await cookies.encode(session) : null };
  }
  async function newSession(native, purpose, request, onRotation) {
    const tokens = nativeTokens(native, now());
    const user = confirmedUser(await adapter.getUser(tokens.accessToken), native.user?.id);
    const previous = await cookies.decode(request);
    if (validSession(previous, now())) {
      const revoked = await checkedRegistry({ ...previous, user: previous.user.toLowerCase() }, 'revoke');
      if (revoked?.valid !== false) throw fail(503, 'De vorige sessie kon niet worden afgesloten. Probeer opnieuw.');
      onRotation();
    }
    const session = { id: capability(), user: user.id.toLowerCase(), ...tokens,
      expiresAt: now() + (purpose === 'recovery' ? 10 * 60000 : 8 * 3600000), purpose };
    await adapter.ensureProfile(session.user, { name: (user.user_metadata?.name || user.user_metadata?.full_name || 'Gebruiker').slice(0, 150) });
    const registered = await adapter.session(session.user, 'register', { session_hash: await hash(session.id), purpose,
      expires_at: new Date(session.expiresAt).toISOString() });
    if (registered?.valid !== true || registered.purpose !== purpose || Date.parse(registered.expires_at) !== session.expiresAt) throw fail(503, genericMessage(503));
    return { session, cookie: await cookies.encode(session) };
  }
  const headers = () => new Headers({ 'Cache-Control': 'no-store, private', Pragma: 'no-cache',
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow, noarchive',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'" });
  return async request => {
    const outgoing = headers();
    let replacementCookie = null;
    let recoveryConsumed = false;
    const json = (status, value) => {
      outgoing.set('Content-Type', 'application/json; charset=utf-8');
      if (replacementCookie) outgoing.set('Set-Cookie', replacementCookie);
      return new Response(JSON.stringify(value), { status, headers: outgoing });
    };
    const auth = async purpose => {
      const result = await authenticate(request);
      replacementCookie = result.cookie;
      if (purpose && result.session.purpose !== purpose) throw fail(403, purpose === 'recovery'
        ? 'Gebruik een geldige herstellink om uw wachtwoord te wijzigen.' : 'Deze sessie is alleen voor wachtwoordherstel.');
      return result.session;
    };
    try {
      const url = new URL(request.url), path = url.pathname;
      if (url.origin !== base || url.username || url.password) throw fail(403, 'Ongeldige aanvraagbron.');
      if (!['GET', 'HEAD'].includes(request.method) && request.headers.get('origin') !== base) throw fail(403, 'Ongeldige aanvraagbron.');
      if (path === '/api/config' && request.method === 'GET') return json(200, { mode: 'hosted', environment: 'test', passwordRecovery: true });
      if (path === '/api/session' && request.method === 'GET') {
        try { const session = await auth(); return json(200, { authenticated: session.purpose === 'login', recovery: session.purpose === 'recovery' }); }
        catch (error) { if (error?.status !== 401) throw error; replacementCookie = cookies.clear(); return json(200, { authenticated: false, recovery: false }); }
      }
      if (path === '/api/login' && request.method === 'POST') {
        limitAuth('login', request);
        const input = await readJson(request);
        if (typeof input.email !== 'string' || typeof input.password !== 'string' || input.password.length > 256) throw fail(401, 'E-mailadres of wachtwoord is niet juist.');
        let opened;
        try { opened = await newSession(await adapter.signIn(input.email, input.password), 'login', request, () => { replacementCookie = cookies.clear(); }); }
        catch (error) { if (error?.status && error.status < 500) throw fail(401, 'E-mailadres of wachtwoord is niet juist.'); throw error; }
        replacementCookie = opened.cookie;
        return json(200, { authenticated: true, recovery: false });
      }
      if (path === '/api/reset-request' && request.method === 'POST') {
        limitAuth('reset', request);
        const input = await readJson(request);
        if (typeof input.email !== 'string' || input.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) throw fail(400, 'Vul een geldig e-mailadres in.');
        // The response never confirms account existence or exposes provider
        // rate limits, delivery details or recipients other than this user.
        try { await adapter.resetPassword(input.email, base + '/auth/callback'); } catch { /* Same response for every account. */ }
        return json(200, { ok: true });
      }
      if (path === '/auth/callback' && request.method === 'GET') {
        limitAuth('callback', request);
        const tokenHash = url.searchParams.get('token_hash'), type = url.searchParams.get('type');
        if (!['recovery', 'invite'].includes(type) || !/^[A-Za-z0-9_-]{20,256}$/.test(tokenHash || '')
          || url.searchParams.getAll('token_hash').length !== 1 || url.searchParams.getAll('type').length !== 1) throw fail(400, 'Deze herstellink is ongeldig of verlopen.');
        let opened;
        try { opened = await newSession(await adapter.verifyOtp(tokenHash, type), 'recovery', request, () => { replacementCookie = cookies.clear(); }); }
        catch (error) { if (error?.status && error.status < 500) throw fail(400, 'Deze herstellink is ongeldig of verlopen.'); throw error; }
        outgoing.set('Set-Cookie', opened.cookie);
        outgoing.set('Location', '/#reset');
        return new Response(null, { status: 303, headers: outgoing });
      }
      if (path === '/api/logout' && request.method === 'POST') {
        // Revoking the capability in this encrypted cookie does not grant any
        // business authority. It must still work when provider Auth is down.
        const decoded = await cookies.decode(request);
        if (!validSession(decoded, now())) { replacementCookie = cookies.clear(); return json(200, { ok: true }); }
        const session = { ...decoded, user: decoded.user.toLowerCase() };
        const revoked = await checkedRegistry(session, 'revoke');
        if (revoked?.valid !== false) throw fail(503, 'Uitloggen kon niet worden bevestigd. Probeer het opnieuw.');
        // Keep the cookie on a registry outage so the same revocation can be
        // retried. Clear it only once the durable registry rejects replay.
        replacementCookie = cookies.clear();
        try { await adapter.signOut(session.accessToken); } catch { /* This ERP session is already durably revoked. */ }
        return json(200, { ok: true });
      }
      if (path === '/api/password' && request.method === 'POST') {
        const session = await auth('recovery'), input = await readJson(request), password = input.password;
        if (typeof password !== 'string' || password.length < 12 || password.length > 256 || !/[a-z]/.test(password)
          || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) throw fail(400, 'Gebruik minimaal 12 tekens, met een hoofdletter, kleine letter en cijfer.');
        const consumed = await checkedRegistry(session, 'consume');
        if (consumed?.consumed === false) throw loginRequired();
        if (consumed?.consumed !== true || consumed.valid !== false) throw fail(503, 'Afmelden na wachtwoordherstel kon niet worden bevestigd. Probeer opnieuw.');
        recoveryConsumed = true;
        replacementCookie = cookies.clear();
        // Consume the recovery capability before a provider mutation. Even an
        // uncertain password response cannot leave a reusable recovery cookie.
        await adapter.updatePassword(session.accessToken, password);
        try { await adapter.signOut(session.accessToken); } catch { /* Durable ERP revocation already succeeded. */ }
        return json(200, { ok: true });
      }
      if (path === '/api/command' && request.method === 'POST') {
        const session = await auth('login'), input = await readJson(request);
        if (typeof input.action !== 'string' || !/^[a-z][a-z0-9.]{0,80}$/.test(input.action)
          || !input.payload || typeof input.payload !== 'object' || Array.isArray(input.payload)) throw fail(400, 'Ongeldige actie of invoer.');
        if (input.action === 'report.attach') throw fail(403, 'Gebruik de beveiligde PDF-upload.');
        return json(200, await adapter.command(session.accessToken, input.action, input.payload));
      }
      const reportPath = path.match(/^\/api\/reports\/([^/]+)\/file$/);
      if (reportPath && ['GET', 'POST'].includes(request.method)) {
        const session = await auth('login'), reportId = normalizeUuid(reportPath[1]);
        if (request.method === 'GET') {
          // The user-authorized RPC decides whether this particular report is
          // released to this user. Storage never receives a client-chosen key.
          const file = await adapter.command(session.accessToken, 'report.file', { id: reportId });
          if (!file?.key) throw fail(404, 'Er is nog geen PDF toegevoegd.');
          if (!FILE_KEY.test(file.key)) throw fail(503, 'PDF is momenteel niet beschikbaar.');
          const bytes = await adapter.download(file.key);
          if (!pdfBytes(bytes)) throw fail(503, 'PDF is momenteel niet beschikbaar.');
          const name = fileName(file.name || 'RoofSignal-rapport.pdf');
          outgoing.set('Content-Type', 'application/pdf');
          outgoing.set('Content-Disposition', `attachment; filename="RoofSignal-rapport.pdf"; filename*=UTF-8''${encodedFileName(name)}`);
          outgoing.set('Content-Security-Policy', "sandbox; default-src 'none'");
          if (replacementCookie) outgoing.set('Set-Cookie', replacementCookie);
          return new Response(bytes, { status: 200, headers: outgoing });
        }
        const snapshot = await adapter.command(session.accessToken, 'snapshot', {});
        if (snapshot?.staff !== true) throw fail(403, 'Geen toegang.');
        const report = snapshot.reports?.find(item => sameUuid(item.id, reportId));
        if (!report || report.status !== 'draft' || report.published_at) throw fail(409, 'Rapport ontbreekt of is al vrijgegeven.');
        const requestId = normalizeUuid(request.headers.get('x-request-id'));
        if (!/^application\/pdf$/i.test(request.headers.get('content-type') || '')) throw fail(415, 'Kies een PDF-bestand.');
        const name = fileName(request.headers.get('x-file-name'), true), bytes = await readBody(request, MAX_DOCUMENT);
        if (!pdfBytes(bytes)) throw fail(400, 'Dit is geen PDF-bestand.');
        const fileHash = await hash(bytes), identityHash = (await hash(session.user + ':' + requestId)).slice(0, 32);
        const key = `${identityHash.slice(0, 8)}-${identityHash.slice(8, 12)}-${identityHash.slice(12, 16)}-${identityHash.slice(16, 20)}-${identityHash.slice(20)}.pdf`;
        try { await adapter.upload(key, bytes, { contentType: 'application/pdf', upsert: false }); }
        catch (error) {
          if (error?.status !== 409) throw error;
          // A retried request can only reuse the exact same bytes. Never
          // overwrite an object belonging to an earlier request identity.
          const existing = await adapter.download(key);
          if (!pdfBytes(existing) || await hash(existing) !== fileHash) throw fail(409, 'Verzoeknummer al gebruikt voor een ander bestand.');
        }
        // An interrupted RPC may already have committed. Keep the private
        // object for safe retry rather than deleting a possibly valid report.
        const result = await adapter.attachDocument(session.user, { report_id: reportId, request_id: requestId,
          file_name: name, file_size: bytes.length, file_sha256: fileHash });
        if (!sameUuid(result?.id, reportId) || result.key !== key) throw fail(503, 'PDF-koppeling kon niet worden bevestigd.');
        return json(200, { id: reportId });
      }
      if (path === '/api/dev-session') throw fail(404, 'Niet gevonden.');
      if (['/api/config', '/api/session', '/api/login', '/api/reset-request', '/api/logout', '/auth/callback', '/api/password', '/api/command'].includes(path)
        || reportPath) throw fail(405, 'Methode niet toegestaan.');
      throw fail(404, 'Niet gevonden.');
    } catch (error) {
      const status = error?.[ownError] ? error.status : [400, 401, 403, 404, 409, 429, 503].includes(error?.status) ? error.status : 503;
      if (status === 401) replacementCookie = cookies.clear();
      if (error?.[ownError] && error.retryAfter) outgoing.set('Retry-After', String(error.retryAfter));
      if (recoveryConsumed || (status === 401 && new URL(request.url).pathname === '/api/password')) {
        return json(status, { error: 'De herstelsessie is beëindigd. Vraag een nieuwe herstellink aan.', recovery_required: true });
      }
      return json(status, { error: error?.[ownError] ? error.message : genericMessage(status) });
    }
  };
}
