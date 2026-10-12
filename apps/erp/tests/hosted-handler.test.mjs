import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createHostedHandler } from '../src/hosted-handler.mjs';
import { createSessionCookies } from '../src/session-cookie.mjs';

const origin = 'https://erp.example.invalid';
const userA = '11111111-1111-4111-8111-111111111111';
const userB = '22222222-2222-4222-8222-222222222222';
const reportA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const reportB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const requestId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const fileKey = '01234567-89ab-cdef-0123-456789abcdef.pdf';
const pdf = Buffer.from('%PDF-1.7\nPrivate example report');
const digest = value => createHash('sha256').update(value).digest('hex');
const derivedKey = (caller, id) => {
  const value = digest(caller + ':' + id).slice(0, 32);
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}.pdf`;
};
const providerError = status => Object.assign(new Error('provider SECRET_PRIVATE_KEY email@example.invalid'), { status });
const cookieFrom = response => response.headers.get('set-cookie')?.split(';')[0] || '';
const confirmed = id => ({ id, email: id === userA ? 'a@example.invalid' : 'b@example.invalid',
  email_confirmed_at: '2026-10-12T10:00:00Z', is_anonymous: false,
  user_metadata: { name: 'Example', role: 'administrator', email_domain: 'roofsignal.nl' } });

function fixture({ staff = false, overrides = {}, options = {} } = {}) {
  let time = Date.now();
  const now = () => time;
  const events = [], registry = new Map(), storage = new Map([[fileKey, pdf]]);
  const cookies = createSessionCookies({ secret: 'f'.repeat(64), origin, now });
  const native = id => ({ access_token: id === userA ? 'access-a' : 'access-b', refresh_token: id === userA ? 'refresh-a' : 'refresh-b',
    expires_at: Math.floor(time / 1000) + 3600, expires_in: 3600, token_type: 'bearer', user: confirmed(id) });
  const adapter = {
    async signIn(email, password) {
      events.push(['signIn', email, password]);
      if (password === 'wrong') throw providerError(400);
      return native(email === 'b@example.invalid' ? userB : userA);
    },
    async refresh(token) { events.push(['refresh', token]); return { ...native(token.endsWith('b') ? userB : userA), access_token: token.endsWith('b') ? 'renewed-b' : 'renewed-a' }; },
    async getUser(token) { events.push(['getUser', token]); return confirmed(token.endsWith('b') ? userB : userA); },
    async ensureProfile(caller, payload) { events.push(['ensureProfile', caller, payload]); return { id: caller }; },
    async session(caller, action, payload) {
      events.push(['session', caller, action, payload]);
      if (action === 'register') {
        assert.match(payload.session_hash, /^[0-9a-f]{64}$/);
        assert.equal(Object.keys(payload).some(key => /token|password/.test(key)), false);
        if (!registry.has(payload.session_hash)) registry.set(payload.session_hash, { user: caller, purpose: payload.purpose, expires_at: payload.expires_at, revoked: false });
      }
      const row = registry.get(payload.session_hash);
      if (action === 'consume') {
        const consumed = row?.user === caller && row.purpose === 'recovery' && !row.revoked && Date.parse(row.expires_at) > time;
        if (consumed) row.revoked = true;
        return { consumed: Boolean(consumed), valid: false, purpose: null, expires_at: null };
      }
      if (action === 'revoke' && row?.user === caller) row.revoked = true;
      const valid = row?.user === caller && !row.revoked && Date.parse(row.expires_at) > time;
      return { valid: Boolean(valid), purpose: valid ? row.purpose : null, expires_at: valid ? row.expires_at : null };
    },
    async command(token, action, payload) {
      events.push(['command', token, action, payload]);
      if (action === 'snapshot') return { staff, reports: staff ? [{ id: reportA, status: 'draft', published_at: null }] : [], organizations: [], properties: [] };
      if (action === 'report.file') {
        if (token.endsWith('b') || payload.id !== reportA) throw providerError(403);
        return { key: fileKey, name: "Rapport's voorbeeld.pdf" };
      }
      return { id: userA };
    },
    async resetPassword(email, redirect) { events.push(['resetPassword', email, redirect]); return { ok: true }; },
    async verifyOtp(token, type) { events.push(['verifyOtp', token, type]); return native(userA); },
    async updatePassword(token, password) { events.push(['updatePassword', token, password]); return confirmed(userA); },
    async signOut(token) { events.push(['signOut', token]); return { ok: true }; },
    async upload(key, bytes, metadata) {
      events.push(['upload', key, metadata]);
      if (storage.has(key)) throw providerError(409);
      storage.set(key, Buffer.from(bytes));
      return { key };
    },
    async download(key) { events.push(['download', key]); if (!storage.has(key)) throw providerError(404); return storage.get(key); },
    async attachDocument(caller, payload) { events.push(['attachDocument', caller, payload]); return { id: payload.report_id, key: derivedKey(caller, payload.request_id) }; },
    async remove(key) { events.push(['remove', key]); storage.delete(key); },
  };
  Object.assign(adapter, overrides);
  const handler = createHostedHandler({ adapter, cookies, origin, now, ...options });
  function req(path, { method = 'GET', body, cookie, headers = {}, requestOrigin = origin } = {}) {
    const requestHeaders = new Headers(headers);
    if (cookie) requestHeaders.set('cookie', cookie);
    if (method !== 'GET' && method !== 'HEAD' && requestOrigin !== null) requestHeaders.set('origin', requestOrigin);
    let data = body;
    if (body !== undefined && !(body instanceof Uint8Array) && !(body instanceof ReadableStream)) {
      data = JSON.stringify(body);
      if (!requestHeaders.has('content-type')) requestHeaders.set('content-type', 'application/json');
    }
    return new Request(origin + path, { method, headers: requestHeaders, body: data, ...(body instanceof ReadableStream ? { duplex: 'half' } : {}) });
  }
  async function login(email = 'a@example.invalid', cookie) {
    const response = await handler(req('/api/login', { method: 'POST', body: { email, password: 'ValidPassword123' }, cookie }));
    assert.equal(response.status, 200);
    return cookieFrom(response);
  }
  return { handler, adapter, cookies, events, registry, storage, req, login, native, now,
    advance: amount => { time += amount; }, setTime: value => { time = value; } };
}

test('hosted config and anonymous session expose no credentials or development login', async () => {
  const f = fixture();
  const config = await f.handler(f.req('/api/config'));
  assert.deepEqual(await config.json(), { mode: 'hosted', environment: 'test', passwordRecovery: true });
  const session = await f.handler(f.req('/api/session'));
  assert.deepEqual(await session.json(), { authenticated: false, recovery: false });
  assert.equal((await f.handler(f.req('/api/dev-session', { method: 'POST', body: { account: 'staff' } }))).status, 404);
  assert.equal(f.events.length, 0);
});

test('sign-in binds a verified identity, stores only a session hash and returns an encrypted HttpOnly cookie', async () => {
  const f = fixture(), cookie = await f.login();
  assert.ok(cookie.includes('__Host-roofsignal_session=v1.'));
  assert.equal(cookie.includes('access-a'), false);
  assert.equal(cookie.includes('refresh-a'), false);
  assert.equal(cookie.includes(userA), false);
  const decoded = await f.cookies.decode(f.req('/api/session', { cookie }));
  assert.equal(decoded.user, userA);
  assert.equal(decoded.purpose, 'login');
  assert.equal(decoded.expiresAt, f.now() + 8 * 3600000);
  const record = f.registry.get(digest(decoded.id));
  assert.equal(record.user, userA);
  assert.equal(record.purpose, 'login');
  const session = await f.handler(f.req('/api/session', { cookie }));
  assert.deepEqual(await session.json(), { authenticated: true, recovery: false });
  assert.equal(f.events.filter(event => event[0] === 'getUser').length, 2);
  assert.equal(f.events.some(event => event[0] === 'command'), false);
  assert.equal(f.events.find(event => event[0] === 'ensureProfile')[2].role, undefined);
});

test('login rejects unverified, anonymous and mismatched provider identities without registering any authority', async () => {
  for (const invalid of [{ ...confirmed(userA), email_confirmed_at: null }, { ...confirmed(userA), is_anonymous: true }, confirmed(userB)]) {
    const f = fixture({ overrides: { async getUser() { return invalid; } } });
    const response = await f.handler(f.req('/api/login', { method: 'POST', body: { email: 'a@example.invalid', password: 'ValidPassword123', role: 'administrator' } }));
    assert.equal(response.status, 401);
    assert.equal(f.registry.size, 0);
    assert.equal(f.events.some(event => event[0] === 'ensureProfile'), false);
    assert.equal((await response.text()).includes('SECRET'), false);
  }
});

test('mutations require the exact Origin and requests cannot choose another host', async () => {
  const f = fixture(), cookie = await f.login();
  for (const path of ['/api/login', '/api/logout', '/api/reset-request', '/api/password', '/api/command', `/api/reports/${reportA}/file`]) {
    for (const bad of [null, 'https://evil.invalid', 'https://erp.example.invalid.evil.invalid']) {
      assert.equal((await f.handler(f.req(path, { method: 'POST', body: {}, cookie, requestOrigin: bad }))).status, 403);
    }
  }
  const otherHost = await f.handler(new Request('https://evil.invalid/api/session', { headers: { cookie } }));
  assert.equal(otherHost.status, 403);
  assert.equal(f.events.filter(event => event[0] === 'signIn').length, 1);
});

test('business commands use the verified user token and reject generic report attachment', async () => {
  const f = fixture(), cookie = await f.login();
  const response = await f.handler(f.req('/api/command', { method: 'POST', cookie,
    body: { action: 'profile.save', payload: { name: 'Example', user_id: userB, role: 'administrator' } } }));
  assert.equal(response.status, 200);
  const call = f.events.find(event => event[0] === 'command');
  assert.equal(call[1], 'access-a');
  assert.equal(call[2], 'profile.save');
  assert.equal(f.events.some(event => event[0] === 'attachDocument'), false);
  const blocked = await f.handler(f.req('/api/command', { method: 'POST', cookie, body: { action: 'report.attach', payload: { id: reportA, file_key: fileKey } } }));
  assert.equal(blocked.status, 403);
  assert.equal(f.events.filter(event => event[0] === 'command').length, 1);
});

test('revoked, expired and identity-changed sessions stop before a business command', async () => {
  const f = fixture(), cookie = await f.login();
  const decoded = await f.cookies.decode(f.req('/api/session', { cookie }));
  f.registry.get(digest(decoded.id)).revoked = true;
  assert.equal((await f.handler(f.req('/api/command', { method: 'POST', cookie, body: { action: 'snapshot', payload: {} } }))).status, 401);
  assert.deepEqual(await (await f.handler(f.req('/api/session', { cookie }))).json(), { authenticated: false, recovery: false });
  f.registry.get(digest(decoded.id)).revoked = false;
  f.adapter.getUser = async () => confirmed(userB);
  assert.equal((await f.handler(f.req('/api/command', { method: 'POST', cookie, body: { action: 'snapshot', payload: {} } }))).status, 401);
  f.setTime(decoded.expiresAt + 1);
  assert.equal((await f.handler(f.req('/api/command', { method: 'POST', cookie, body: { action: 'snapshot', payload: {} } }))).status, 401);
  assert.equal(f.events.some(event => event[0] === 'command'), false);
});

test('concurrent refresh uses one provider refresh and preserves the original absolute session deadline', async () => {
  const f = fixture(), cookie = await f.login();
  const decoded = await f.cookies.decode(f.req('/api/session', { cookie }));
  decoded.accessExpiresAt = f.now() - 1;
  const stale = (await f.cookies.encode(decoded)).split(';')[0];
  let release, entered;
  const ready = new Promise(resolve => { entered = resolve; });
  f.adapter.refresh = async token => { f.events.push(['refresh', token]); entered(); await new Promise(resolve => { release = resolve; }); return { ...f.native(userA), access_token: 'renewed-a' }; };
  const first = f.handler(f.req('/api/session', { cookie: stale }));
  const second = f.handler(f.req('/api/session', { cookie: stale }));
  await ready;
  await new Promise(resolve => setTimeout(resolve, 5));
  release();
  const responses = await Promise.all([first, second]);
  for (const response of responses) {
    assert.equal(response.status, 200);
    const renewed = await f.cookies.decode(f.req('/api/session', { cookie: cookieFrom(response) }));
    assert.equal(renewed.accessToken, 'renewed-a');
    assert.equal(renewed.expiresAt, decoded.expiresAt);
    assert.equal(renewed.id, decoded.id);
  }
  assert.equal(f.events.filter(event => event[0] === 'refresh').length, 1);
});

test('revocation during refresh prevents renewed cookie issuance and user identity is checked after refresh', async () => {
  const f = fixture(), cookie = await f.login();
  const decoded = await f.cookies.decode(f.req('/api/session', { cookie }));
  decoded.accessExpiresAt = f.now() - 1;
  const stale = (await f.cookies.encode(decoded)).split(';')[0];
  f.adapter.refresh = async () => { f.registry.get(digest(decoded.id)).revoked = true; return f.native(userA); };
  const response = await f.handler(f.req('/api/session', { cookie: stale }));
  assert.deepEqual(await response.json(), { authenticated: false, recovery: false });
  assert.ok(response.headers.get('set-cookie').includes('Max-Age=0'));
});

test('logout revokes its own capability even if provider Auth is unavailable; replay cannot reopen it', async () => {
  const f = fixture(), cookie = await f.login();
  f.adapter.getUser = async () => { throw providerError(503); };
  f.adapter.signOut = async () => { throw providerError(503); };
  const response = await f.handler(f.req('/api/logout', { method: 'POST', cookie }));
  assert.equal(response.status, 200);
  assert.ok(response.headers.get('set-cookie').includes('Max-Age=0'));
  assert.equal([...f.registry.values()][0].revoked, true);
  f.adapter.getUser = async () => confirmed(userA);
  const replay = await f.handler(f.req('/api/command', { method: 'POST', cookie, body: { action: 'snapshot', payload: {} } }));
  assert.equal(replay.status, 401);
  assert.equal(f.events.some(event => event[0] === 'command'), false);
});

test('logout registry outage preserves the cookie and can be retried successfully', async () => {
  const f = fixture(), cookie = await f.login(), original = f.adapter.session;
  f.adapter.session = async () => { throw providerError(503); };
  const failed = await f.handler(f.req('/api/logout', { method: 'POST', cookie }));
  assert.equal(failed.status, 503);
  assert.equal(failed.headers.get('set-cookie'), null);
  assert.equal([...f.registry.values()][0].revoked, false);
  f.adapter.session = original;
  assert.equal((await f.handler(f.req('/api/logout', { method: 'POST', cookie }))).status, 200);
  assert.equal([...f.registry.values()][0].revoked, true);
});

test('successful account switch revokes a copied old cookie; failed old revocation preserves it', async () => {
  const f = fixture(), oldCookie = await f.login(), newCookie = await f.login('b@example.invalid', oldCookie);
  const next = await f.cookies.decode(f.req('/api/session', { cookie: newCookie }));
  assert.equal(next.user, userB);
  assert.equal((await f.handler(f.req('/api/command', { method: 'POST', cookie: oldCookie, body: { action: 'snapshot', payload: {} } }))).status, 401);
  const current = f.adapter.session;
  f.adapter.session = async (caller, action, payload) => { if (action === 'revoke') throw providerError(503); return current(caller, action, payload); };
  const failed = await f.handler(f.req('/api/login', { method: 'POST', cookie: newCookie, body: { email: 'a@example.invalid', password: 'ValidPassword123' } }));
  assert.equal(failed.status, 503);
  assert.equal(failed.headers.get('set-cookie'), null);
  assert.equal(f.registry.size, 2);
  f.adapter.session = current;
  assert.deepEqual(await (await f.handler(f.req('/api/session', { cookie: newCookie }))).json(), { authenticated: true, recovery: false });
});

test('reset requests have an account-independent response and a fixed callback destination', async () => {
  const f = fixture();
  const one = await f.handler(f.req('/api/reset-request', { method: 'POST', body: { email: 'a@example.invalid', redirect: 'https://evil.invalid', bcc: 'attacker@example.invalid' } }));
  assert.deepEqual(await one.json(), { ok: true });
  assert.deepEqual(f.events[0], ['resetPassword', 'a@example.invalid', origin + '/auth/callback']);
  f.adapter.resetPassword = async () => { throw providerError(429); };
  const other = await f.handler(f.req('/api/reset-request', { method: 'POST', body: { email: 'absent@example.invalid' } }));
  assert.equal(other.status, 200);
  assert.deepEqual(await other.json(), { ok: true });
});

async function recovery(f, type = 'recovery', cookie) {
  const response = await f.handler(f.req('/auth/callback?token_hash=' + 'a'.repeat(64) + '&type=' + type + '&next=https://evil.invalid', { cookie }));
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), '/#reset');
  return cookieFrom(response);
}
test('recovery and invite links grant only a ten-minute password session, never business access', async () => {
  for (const type of ['recovery', 'invite']) {
    const f = fixture({ staff: true }), cookie = await recovery(f, type);
    const state = await f.cookies.decode(f.req('/api/session', { cookie }));
    assert.equal(state.purpose, 'recovery');
    assert.equal(state.expiresAt, f.now() + 10 * 60000);
    assert.deepEqual(await (await f.handler(f.req('/api/session', { cookie }))).json(), { authenticated: false, recovery: true });
    assert.equal((await f.handler(f.req('/api/command', { method: 'POST', cookie, body: { action: 'snapshot', payload: {} } }))).status, 403);
    assert.equal((await f.handler(f.req(`/api/reports/${reportA}/file`, { cookie }))).status, 403);
    assert.equal(f.events.some(event => event[0] === 'command' || event[0] === 'download'), false);
    f.advance(10 * 60000 + 1);
    assert.equal((await f.handler(f.req('/api/password', { method: 'POST', cookie, body: { password: 'NewPassword123' } }))).status, 401);
  }
});

test('invalid or duplicated reset callback parameters cannot issue cookies or leak tokens', async () => {
  const f = fixture();
  for (const path of ['/auth/callback?token_hash=short&type=recovery', '/auth/callback?token_hash=' + 'a'.repeat(64) + '&type=signup',
    '/auth/callback?token_hash=' + 'a'.repeat(64) + '&type=recovery&type=invite']) {
    const response = await f.handler(f.req(path));
    assert.equal(response.status, 400);
    assert.equal(response.headers.get('set-cookie'), null);
    assert.equal(f.events.length, 0);
  }
  f.adapter.verifyOtp = async () => { throw providerError(400); };
  const failed = await f.handler(f.req('/auth/callback?token_hash=' + 'a'.repeat(64) + '&type=recovery'));
  assert.equal(failed.status, 400);
  assert.equal((await failed.text()).includes('SECRET'), false);
});

test('password update requires a strong recovery password and consumes the recovery capability first', async () => {
  const f = fixture(), normal = await f.login();
  assert.equal((await f.handler(f.req('/api/password', { method: 'POST', cookie: normal, body: { password: 'NewPassword123' } }))).status, 403);
  const cookie = await recovery(f, 'recovery', normal);
  for (const password of ['short', 'lowercase123456', 'UPPERCASE123456', 'NoDigitsHereEver']) {
    assert.equal((await f.handler(f.req('/api/password', { method: 'POST', cookie, body: { password } }))).status, 400);
  }
  const response = await f.handler(f.req('/api/password', { method: 'POST', cookie, body: { password: 'NewPassword123' } }));
  assert.equal(response.status, 200);
  assert.ok(response.headers.get('set-cookie').includes('Max-Age=0'));
  const updateIndex = f.events.findIndex(event => event[0] === 'updatePassword');
  assert.equal(f.events[updateIndex - 1][0], 'session');
  assert.equal(f.events[updateIndex - 1][2], 'consume');
  assert.equal((await f.handler(f.req('/api/password', { method: 'POST', cookie, body: { password: 'AnotherPassword123' } }))).status, 401);
});

test('provider password failure leaves no reusable recovery cookie; registry failure performs no password mutation', async () => {
  const f = fixture(), cookie = await recovery(f);
  f.adapter.updatePassword = async () => { throw providerError(503); };
  const failure = await f.handler(f.req('/api/password', { method: 'POST', cookie, body: { password: 'NewPassword123' } }));
  assert.equal(failure.status, 503);
  assert.deepEqual(await failure.json(), { error: 'De herstelsessie is beëindigd. Vraag een nieuwe herstellink aan.', recovery_required: true });
  assert.ok(failure.headers.get('set-cookie').includes('Max-Age=0'));
  assert.equal([...f.registry.values()][0].revoked, true);
  const second = fixture(), cookie2 = await recovery(second), previous = second.adapter.session;
  second.adapter.session = async (caller, action, payload) => { if (action === 'consume') throw providerError(503); return previous(caller, action, payload); };
  const unavailable = await second.handler(second.req('/api/password', { method: 'POST', cookie: cookie2, body: { password: 'NewPassword123' } }));
  assert.equal(unavailable.status, 503);
  assert.equal(unavailable.headers.get('set-cookie'), null);
  assert.equal(second.events.some(event => event[0] === 'updatePassword'), false);
});

test('concurrent password requests atomically consume recovery once and perform exactly one provider update', async () => {
  const f = fixture(), cookie = await recovery(f);
  const pending = [];
  f.adapter.getUser = async () => new Promise(resolve => {
    pending.push(resolve);
    if (pending.length === 2) pending.forEach(done => done(confirmed(userA)));
  });
  const first = f.handler(f.req('/api/password', { method: 'POST', cookie, body: { password: 'FirstPassword123' } }));
  const second = f.handler(f.req('/api/password', { method: 'POST', cookie, body: { password: 'SecondPassword123' } }));
  const responses = await Promise.all([first, second]);
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 401]);
  assert.equal(f.events.filter(event => event[0] === 'updatePassword').length, 1);
  assert.equal(f.events.filter(event => event[0] === 'session' && event[2] === 'consume').length, 2);
  assert.equal([...f.registry.values()][0].revoked, true);
  assert.equal((await responses.find(response => response.status === 401).json()).recovery_required, true);
});

test('expired recovery password request asks for a new link while local validation keeps the session', async () => {
  const f = fixture(), cookie = await recovery(f);
  const invalid = await f.handler(f.req('/api/password', { method: 'POST', cookie, body: { password: 'short' } }));
  assert.equal(invalid.status, 400);
  assert.equal((await invalid.json()).recovery_required, undefined);
  assert.equal(invalid.headers.get('set-cookie'), null);
  f.advance(10 * 60000 + 1);
  const expired = await f.handler(f.req('/api/password', { method: 'POST', cookie, body: { password: 'NewPassword123' } }));
  assert.equal(expired.status, 401);
  assert.equal((await expired.json()).recovery_required, true);
  assert.ok(expired.headers.get('set-cookie').includes('Max-Age=0'));
});

test('private download authorizes the requested report with the user token before storage access', async () => {
  const f = fixture(), cookie = await f.login();
  const response = await f.handler(f.req(`/api/reports/${reportA.toUpperCase()}/file`, { cookie }));
  assert.equal(response.status, 200);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), pdf);
  assert.equal(response.headers.get('content-type'), 'application/pdf');
  assert.ok(response.headers.get('content-disposition').includes('%27'));
  assert.equal(response.headers.get('content-security-policy'), "sandbox; default-src 'none'");
  const authorization = f.events.find(event => event[0] === 'command');
  assert.deepEqual(authorization, ['command', 'access-a', 'report.file', { id: reportA }]);
  assert.deepEqual(f.events.find(event => event[0] === 'download'), ['download', fileKey]);
  const denied = await f.handler(f.req(`/api/reports/${reportB}/file`, { cookie }));
  assert.equal(denied.status, 403);
  assert.equal(f.events.filter(event => event[0] === 'download').length, 1);
});

test('customer or finance-only upload cannot reach elevated storage or attachment RPC', async () => {
  const f = fixture(), cookie = await f.login();
  const response = await f.handler(f.req(`/api/reports/${reportA}/file`, { method: 'POST', cookie, body: pdf,
    headers: { 'Content-Type': 'application/pdf', 'X-Request-Id': requestId, 'X-File-Name': 'Example.pdf' } }));
  assert.equal(response.status, 403);
  assert.equal(f.events.some(event => event[0] === 'upload' || event[0] === 'attachDocument'), false);
});

test('staff PDF upload derives identity from the verified user and canonical request UUID', async () => {
  const f = fixture({ staff: true }), cookie = await f.login();
  const response = await f.handler(f.req(`/api/reports/${reportA.toUpperCase()}/file`, { method: 'POST', cookie, body: pdf,
    headers: { 'Content-Type': 'application/pdf', 'X-Request-Id': requestId.toUpperCase(), 'X-File-Name': encodeURIComponent('Voorbeeld.pdf'), 'X-User-Id': userB } }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { id: reportA });
  const upload = f.events.find(event => event[0] === 'upload'), attach = f.events.find(event => event[0] === 'attachDocument');
  assert.equal(upload[1], derivedKey(userA, requestId));
  assert.deepEqual(upload[2], { contentType: 'application/pdf', upsert: false });
  assert.equal(attach[1], userA);
  assert.deepEqual(attach[2], { report_id: reportA, request_id: requestId, file_name: 'Voorbeeld.pdf', file_size: pdf.length, file_sha256: digest(pdf) });
  assert.equal(attach[2].file_key, undefined);
});

test('same-ID PDF retry checks bytes instead of overwriting; altered bytes cannot attach', async () => {
  const f = fixture({ staff: true }), cookie = await f.login();
  const submit = body => f.handler(f.req(`/api/reports/${reportA}/file`, { method: 'POST', cookie, body,
    headers: { 'Content-Type': 'application/pdf', 'X-Request-Id': requestId, 'X-File-Name': 'Example.pdf' } }));
  assert.equal((await submit(pdf)).status, 200);
  assert.equal((await submit(pdf)).status, 200);
  assert.equal(f.events.filter(event => event[0] === 'download').length, 1);
  const conflict = await submit(Buffer.from('%PDF-1.7\nChanged contents'));
  assert.equal(conflict.status, 409);
  assert.equal(f.events.filter(event => event[0] === 'attachDocument').length, 2);
  assert.deepEqual(f.storage.get(derivedKey(userA, requestId)), pdf);
});

test('attachment uncertainty retains its private object for recovery and wrong returned key never succeeds', async () => {
  const f = fixture({ staff: true }), cookie = await f.login();
  f.adapter.attachDocument = async () => { throw providerError(503); };
  const submit = () => f.handler(f.req(`/api/reports/${reportA}/file`, { method: 'POST', cookie, body: pdf,
    headers: { 'Content-Type': 'application/pdf', 'X-Request-Id': requestId, 'X-File-Name': 'Example.pdf' } }));
  assert.equal((await submit()).status, 503);
  assert.ok(f.storage.has(derivedKey(userA, requestId)));
  assert.equal(f.events.some(event => event[0] === 'remove'), false);
  f.adapter.attachDocument = async () => ({ id: reportA, key: fileKey });
  assert.equal((await submit()).status, 503);
});

test('published or missing report, invalid PDF metadata and oversized incoming body are rejected before storage writes', async () => {
  const f = fixture({ staff: true }), cookie = await f.login();
  const upload = (body = pdf, headers = {}, id = reportA) => f.handler(f.req(`/api/reports/${id}/file`, { method: 'POST', cookie, body,
    headers: { 'Content-Type': 'application/pdf', 'X-Request-Id': requestId, 'X-File-Name': 'Example.pdf', ...headers } }));
  assert.equal((await upload(pdf, {}, reportB)).status, 409);
  assert.equal((await upload(pdf, { 'X-Request-Id': 'not-a-UUID' })).status, 400);
  assert.equal((await upload(pdf, { 'X-File-Name': encodeURIComponent('../secret.pdf') })).status, 400);
  assert.equal((await upload(pdf, { 'X-File-Name': '%broken' })).status, 400);
  assert.equal((await upload(pdf, { 'Content-Type': 'text/html' })).status, 415);
  assert.equal((await upload(Buffer.from('<html>not PDF</html>'))).status, 400);
  assert.equal((await upload(Buffer.alloc(10485761))).status, 413);
  f.adapter.command = async () => ({ staff: true, reports: [{ id: reportA, status: 'draft', published_at: '2026-10-12' }] });
  assert.equal((await upload()).status, 409);
  assert.equal(f.events.some(event => event[0] === 'upload'), false);
});

test('provider messages, unavailable authorization and unsafe file references never leak or reach storage', async () => {
  const f = fixture(), cookie = await f.login();
  f.adapter.command = async () => { throw providerError(503); };
  const unavailable = await f.handler(f.req(`/api/reports/${reportA}/file`, { cookie }));
  assert.equal(unavailable.status, 503);
  assert.equal((await unavailable.text()).includes('SECRET_PRIVATE_KEY'), false);
  assert.equal(f.events.some(event => event[0] === 'download'), false);
  f.adapter.command = async () => ({ key: 'https://evil.invalid/secret.pdf', name: 'Secret.pdf' });
  assert.equal((await f.handler(f.req(`/api/reports/${reportA}/file`, { cookie }))).status, 503);
  assert.equal(f.events.some(event => event[0] === 'download'), false);
});

test('every success, redirect and rejection sends private no-cache/security headers and no cross-origin allowance', async () => {
  const f = fixture();
  for (const response of [await f.handler(f.req('/api/config')), await f.handler(f.req('/unknown')),
    await f.handler(f.req('/api/login', { method: 'POST', requestOrigin: null, body: {} })),
    await f.handler(f.req('/auth/callback?token_hash=' + 'a'.repeat(64) + '&type=recovery'))]) {
    assert.equal(response.headers.get('cache-control'), 'no-store, private');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
    assert.ok(response.headers.get('x-robots-tag').includes('noindex'));
    assert.ok(response.headers.get('content-security-policy').includes("frame-ancestors 'none'"));
    assert.equal(response.headers.get('access-control-allow-origin'), null);
  }
});

test('failed auth attempts and reset requests are throttled without trusting caller-supplied forwarding headers', async () => {
  const f = fixture();
  for (let number = 0; number < 10; number += 1) {
    const response = await f.handler(f.req('/api/login', { method: 'POST', body: { email: 'a@example.invalid', password: 'wrong' },
      headers: { 'X-Forwarded-For': '192.0.2.' + number } }));
    assert.equal(response.status, 401);
  }
  const rejected = await f.handler(f.req('/api/login', { method: 'POST', body: { email: 'a@example.invalid', password: 'wrong' }, headers: { 'X-Forwarded-For': '198.51.100.1' } }));
  assert.equal(rejected.status, 429);
  assert.equal(rejected.headers.get('retry-after'), '600');
  assert.equal(f.events.filter(event => event[0] === 'signIn').length, 10);
  for (let number = 0; number < 5; number += 1) assert.equal((await f.handler(f.req('/api/reset-request', { method: 'POST', body: { email: 'a@example.invalid' } }))).status, 200);
  assert.equal((await f.handler(f.req('/api/reset-request', { method: 'POST', body: { email: 'a@example.invalid' } }))).status, 429);
  f.advance(15 * 60000 + 1);
  assert.equal((await f.handler(f.req('/api/login', { method: 'POST', body: { email: 'a@example.invalid', password: 'wrong' } }))).status, 401);
});
