import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSupabaseAdapter, SupabaseAdapterError } from '../src/supabase-adapter.mjs';

const ref = 'abcdefghijklmnopqrst';
const url = `https://${ref}.supabase.co`;
const publishableKey = 'sb_publishable_test_public_key';
const storageKey = 'sb_secret_test_server_key';
const caller = '11111111-1111-4111-8111-111111111111';
const key = '01234567-89ab-cdef-0123-456789abcdef.pdf';
const access = 'signed.user.access';
const refresh = 'opaque-refresh-token';
const pdf = Buffer.from('%PDF-1.7\nPrivate report');
const user = { id: caller, email: 'user@example.invalid', email_confirmed_at: '2026-10-12T12:00:00Z',
  app_metadata: { role: 'administrator' }, user_metadata: { name: 'Example', role: 'administrator' } };
const session = { access_token: access, refresh_token: refresh, expires_in: 3600, token_type: 'bearer', user };
const json = (body = {}, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
function fixture(respond = () => json(session), overrides = {}) {
  const calls = [];
  const adapter = createSupabaseAdapter({ url, testProjectRef: ref, publishableKey, storageKey,
    redirectOrigin: 'https://erp.example.invalid', fetch: async (target, options) => {
      calls.push({ url: target, ...options });
      return await respond(target, options, calls.length);
    }, ...overrides });
  return { adapter, calls };
}
const rejectsInput = fn => assert.rejects(async () => fn(), error => error instanceof SupabaseAdapterError
  && error.code === 'SUPABASE_INVALID_INPUT' && error.status === 400);
const legacyKey = role => 'header.' + Buffer.from(JSON.stringify({ role })).toString('base64url') + '.signature';

test('configuration pins an explicit separate HTTPS Supabase test project', () => {
  for (const candidate of ['http://abcdefghijklmnopqrst.supabase.co', 'https://localhost', 'https://127.0.0.1',
    'https://abcdefghijklmnopqrst.supabase.co.evil.invalid', 'https://evil.invalid',
    'https://user:password@abcdefghijklmnopqrst.supabase.co', 'https://abcdefghijklmnopqrst.supabase.co:9443',
    `${url}/auth/v1`, `${url}?x=1`, `${url}#fragment`, 'https://kakpticlxlaxtebhsuoh.supabase.co']) {
    assert.throws(() => fixture(undefined, { url: candidate }), /Controleer de invoer/);
  }
  assert.throws(() => fixture(undefined, { testProjectRef: undefined }), /Controleer de invoer/);
  assert.throws(() => fixture(undefined, { testProjectRef: 'zyxwvutsrqponmlkjihg' }), /Controleer de invoer/);
  assert.throws(() => fixture(undefined, { publishableKey: storageKey }), /Controleer de invoer/);
  assert.throws(() => fixture(undefined, { storageKey: publishableKey }), /Controleer de invoer/);
  assert.throws(() => fixture(undefined, { publishableKey: 'public\r\nAuthorization: secret' }), /Controleer de invoer/);
  assert.throws(() => fixture(undefined, { timeoutMs: 0 }), /Controleer de invoer/);
});

test('password sign-in and refresh use public application key and server-only native session data', async () => {
  const { adapter, calls } = fixture();
  const one = await adapter.signIn('  User@Example.Invalid  ', 'password123');
  assert.equal(calls[0].url, `${url}/auth/v1/token?grant_type=password`);
  assert.deepEqual(JSON.parse(calls[0].body), { email: 'user@example.invalid', password: 'password123' });
  assert.equal(calls[0].headers.apikey, publishableKey);
  assert.equal(calls[0].headers.Authorization, undefined);
  assert.equal(calls[0].redirect, 'error');
  assert.equal(calls[0].cache, 'no-store');
  assert.equal(one.access_token, access);
  assert.equal(one.refresh_token, refresh);
  assert.equal(one.token_type, 'bearer');
  assert.ok(one.expires_at > Date.now() / 1000);
  assert.deepEqual(one.user.user_metadata, { name: 'Example' });
  assert.equal(one.user.app_metadata, undefined);
  assert.equal(one.user.is_anonymous, false);
  await adapter.refresh(refresh);
  assert.equal(calls[1].url, `${url}/auth/v1/token?grant_type=refresh_token`);
  assert.deepEqual(JSON.parse(calls[1].body), { refresh_token: refresh });
  assert.equal(calls[1].headers.apikey, publishableKey);
  assert.equal(calls[1].headers.Authorization, undefined);
});

test('remote anonymous-user flag survives sanitizing for the server authorization boundary', async () => {
  const { adapter } = fixture(() => json({ ...user, is_anonymous: true }));
  assert.equal((await adapter.getUser(access)).is_anonymous, true);
});

test('getUser verifies the token remotely; business RPC always preserves the user Bearer', async () => {
  const { adapter, calls } = fixture((target) => json(target.includes('/auth/') ? user : { staff: false, properties: [] }));
  assert.equal((await adapter.getUser(access)).id, caller);
  assert.equal(calls[0].url, `${url}/auth/v1/user`);
  const result = await adapter.command(access, 'snapshot', {});
  assert.deepEqual(result, { staff: false, properties: [] });
  assert.equal(calls[1].url, `${url}/rest/v1/rpc/roofsignal_erp`);
  assert.equal(calls[1].method, 'POST');
  assert.deepEqual(JSON.parse(calls[1].body), { action: 'snapshot', payload: {} });
  for (const request of calls) {
    assert.equal(request.headers.apikey, publishableKey);
    assert.equal(request.headers.Authorization, `Bearer ${access}`);
    assert.equal(JSON.stringify(request.headers).includes(storageKey), false);
  }
});

test('missing tokens, credentials substituted for user identity and unsafe action paths are rejected before fetch', async () => {
  const { adapter, calls } = fixture();
  for (const token of ['', null, undefined, storageKey, publishableKey, legacyKey('service_role'), 'a\r\nb']) {
    await rejectsInput(() => adapter.getUser(token));
    await rejectsInput(() => adapter.command(token, 'snapshot'));
    await rejectsInput(() => adapter.signOut(token));
    await rejectsInput(() => adapter.updatePassword(token, 'password123'));
  }
  await rejectsInput(() => adapter.command(access, '../arbitrary/path'));
  await rejectsInput(() => adapter.command(access, 'snapshot', { text: 'x'.repeat(65536) }));
  assert.equal(calls.length, 0);
});

test('logout revokes the current provider session and password update sends only a password', async () => {
  const { adapter, calls } = fixture(target => target.includes('/logout') ? new Response(null, { status: 204 }) : json(user));
  assert.deepEqual(await adapter.signOut(access), { ok: true });
  assert.equal(calls[0].url, `${url}/auth/v1/logout?scope=local`);
  assert.equal(calls[0].method, 'POST');
  await adapter.updatePassword(access, 'new-password123');
  assert.equal(calls[1].url, `${url}/auth/v1/user`);
  assert.equal(calls[1].method, 'PUT');
  assert.deepEqual(JSON.parse(calls[1].body), { password: 'new-password123' });
  assert.equal(calls[1].headers.Authorization, `Bearer ${access}`);
  await rejectsInput(() => adapter.updatePassword(access, 'short'));
});

test('password recovery goes only to the supplied user and configured redirect origin', async () => {
  const { adapter, calls } = fixture(() => json({}));
  assert.deepEqual(await adapter.resetPassword('USER@example.invalid', 'https://erp.example.invalid/auth/confirm?purpose=recovery'), { ok: true });
  const recovery = new URL(calls[0].url);
  assert.equal(recovery.pathname, '/auth/v1/recover');
  assert.equal(recovery.searchParams.get('redirect_to'), 'https://erp.example.invalid/auth/confirm?purpose=recovery');
  assert.deepEqual(JSON.parse(calls[0].body), { email: 'user@example.invalid' });
  assert.equal(calls[0].headers.apikey, publishableKey);
  assert.equal(calls[0].headers.Authorization, undefined);
  for (const target of ['javascript:alert(1)', 'http://evil.invalid', 'https://evil.invalid',
    'https://user:password@erp.example.invalid/auth/confirm', 'https://erp.example.invalid/#token']) {
    await rejectsInput(() => adapter.resetPassword('user@example.invalid', target));
  }
  assert.equal(calls.length, 1);
});

test('invite and recovery verification exchange a hash by POST without user creation or privilege metadata', async () => {
  const { adapter, calls } = fixture();
  const hash = 'a'.repeat(64);
  for (const type of ['recovery', 'invite']) {
    assert.equal((await adapter.verifyOtp(hash, type)).user.id, caller);
    const call = calls.at(-1);
    assert.equal(call.url, `${url}/auth/v1/verify`);
    assert.equal(call.method, 'POST');
    assert.deepEqual(JSON.parse(call.body), { token_hash: hash, type });
    assert.equal(call.headers.apikey, publishableKey);
  }
  await rejectsInput(() => adapter.verifyOtp(hash, 'signup'));
  await rejectsInput(() => adapter.verifyOtp('small'));
  await rejectsInput(() => adapter.verifyOtp('https://evil.invalid/secret'));
});

test('private storage uses only the server key, strict UUID.pdf paths and no public or signed links', async () => {
  const { adapter, calls } = fixture((target, options) => options.method === 'GET'
    ? new Response(pdf, { headers: { 'Content-Type': 'application/pdf' } }) : json({}));
  assert.deepEqual(await adapter.upload(key, pdf), { key });
  assert.equal(calls[0].url, `${url}/storage/v1/object/erp-documents/${key}`);
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].headers['Content-Type'], 'application/pdf');
  assert.equal(calls[0].headers['x-upsert'], 'false');
  assert.equal(calls[0].headers['cache-control'], 'no-store');
  assert.deepEqual(calls[0].body, pdf);
  assert.deepEqual(await adapter.download(key), pdf);
  assert.equal(calls[1].url, `${url}/storage/v1/object/authenticated/erp-documents/${key}`);
  assert.deepEqual(await adapter.remove(key), { ok: true });
  assert.equal(calls[2].url, `${url}/storage/v1/object/erp-documents`);
  assert.equal(calls[2].method, 'DELETE');
  assert.deepEqual(JSON.parse(calls[2].body), { prefixes: [key] });
  for (const call of calls) {
    assert.equal(call.headers.apikey, storageKey);
    assert.equal(call.headers.Authorization, undefined);
    assert.equal(call.url.includes('/public/'), false);
    assert.equal(call.url.includes('/sign/'), false);
  }
});

test('legacy configured service JWT is used only on elevated storage requests', async () => {
  const legacy = legacyKey('service_role');
  const { adapter, calls } = fixture(() => json({}), { storageKey: legacy });
  await adapter.upload(key, pdf);
  assert.equal(calls[0].headers.apikey, legacy);
  assert.equal(calls[0].headers.Authorization, `Bearer ${legacy}`);
  await adapter.command(access, 'snapshot');
  assert.equal(calls[1].headers.apikey, publishableKey);
  assert.equal(calls[1].headers.Authorization, `Bearer ${access}`);
});

test('storage cannot reach arbitrary paths, override content types or overwrite a previous document', async () => {
  const { adapter, calls } = fixture();
  for (const unsafe of ['../secret.pdf', `/erp-documents/${key}`, `https://evil.invalid/${key}`, key + '?x=1',
    key.replace('.pdf', '.html'), 'public/' + key, key.toUpperCase()]) {
    await rejectsInput(() => adapter.upload(unsafe, pdf));
    await rejectsInput(() => adapter.download(unsafe));
    await rejectsInput(() => adapter.remove(unsafe));
  }
  await rejectsInput(() => adapter.upload(key, pdf, { upsert: true }));
  await rejectsInput(() => adapter.upload(key, pdf, { contentType: 'text/html' }));
  await rejectsInput(() => adapter.upload(key, Buffer.from('<html>not a PDF</html>')));
  await rejectsInput(() => adapter.upload(key, Buffer.alloc(10485761)));
  assert.equal(calls.length, 0);
});

test('missing private key blocks storage without blocking ordinary authenticated commands', async () => {
  const { adapter, calls } = fixture(() => json({}), { storageKey: undefined });
  await assert.rejects(adapter.download(key), error => error.code === 'SUPABASE_STORAGE_NOT_CONFIGURED' && error.status === 503);
  await adapter.command(access, 'snapshot');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].headers.apikey, publishableKey);
});

test('document attachment, verified-user profile and session registry use the exact service-only RPC contracts', async () => {
  const { adapter, calls } = fixture(() => json({ id: caller, key }));
  const payload = { report_id: caller, request_id: caller, file_name: 'Report.pdf', file_size: pdf.length, file_sha256: 'a'.repeat(64) };
  await adapter.attachDocument(caller, payload);
  assert.equal(calls[0].url, `${url}/rest/v1/rpc/roofsignal_erp_document`);
  assert.deepEqual(JSON.parse(calls[0].body), { caller_uuid: caller, payload });
  await adapter.ensureProfile(caller, { name: 'Example', phone: '+31612345678' });
  assert.equal(calls[1].url, `${url}/rest/v1/rpc/roofsignal_erp_profile`);
  assert.deepEqual(JSON.parse(calls[1].body), { caller_uuid: caller, payload: { name: 'Example', phone: '+31612345678' } });
  await adapter.session(caller, 'check', { session_hash: 'a'.repeat(64) });
  assert.equal(calls[2].url, `${url}/rest/v1/rpc/roofsignal_erp_session`);
  assert.deepEqual(JSON.parse(calls[2].body), { caller_uuid: caller, action: 'check', payload: { session_hash: 'a'.repeat(64) } });
  for (const call of calls) { assert.equal(call.headers.apikey, storageKey); assert.equal(call.headers.Authorization, undefined); }
  await rejectsInput(() => adapter.attachDocument('not-a-UUID', payload));
  await rejectsInput(() => adapter.ensureProfile(caller, { name: 'Example', role: 'administrator' }));
  await rejectsInput(() => adapter.session(caller, '../admin'));
});

test('storage not-found and conflict are mapped from provider responses without exposing provider messages', async () => {
  const secretText = `${storageKey}: customer@example.invalid https://evil.invalid/private`;
  for (const [body, http, expected] of [[{ error: 'not_found', message: secretText }, 400, 404],
    [{ statusCode: '404', message: secretText }, 400, 404], [{ error: 'Duplicate', message: secretText }, 400, 409],
    [{ error: storageKey, message: secretText }, 500, 503]]) {
    const { adapter } = fixture(() => json(body, http));
    await assert.rejects(adapter.download(key), error => {
      assert.equal(error.status, expected);
      assert.equal(error.message.includes(secretText), false);
      assert.equal(JSON.stringify(error).includes(storageKey), false);
      assert.equal(error.cause, undefined);
      return true;
    });
  }
});

test('network/redirect exceptions and provider auth errors are sanitized and rate limits retained', async () => {
  const { adapter } = fixture(() => { throw Error(`${storageKey} ${refresh} https://evil.invalid`); });
  await assert.rejects(adapter.getUser(access), error => error.code === 'SUPABASE_UNAVAILABLE' && error.status === 503
    && !error.message.includes(storageKey) && error.cause === undefined);
  const denied = fixture(() => json({ error_code: 'invalid_credentials', msg: `${publishableKey} email@example.invalid` }, 400));
  await assert.rejects(denied.adapter.signIn('user@example.invalid', 'password'), error => error.providerCode === 'invalid_credentials'
    && !error.message.includes(publishableKey));
  const limited = fixture(() => json({ error_code: 'over_email_send_rate_limit', msg: 'Email leaked' }, 429));
  await assert.rejects(limited.adapter.resetPassword('user@example.invalid', 'https://erp.example.invalid/auth/confirm'), error => error.status === 429
    && error.providerCode === 'over_email_send_rate_limit' && !error.message.includes('Email leaked'));
});

test('invalid or oversized JSON/session responses are rejected rather than trusted', async () => {
  for (const data of [{ ...session, access_token: storageKey }, { ...session, user: { id: 'not-a-UUID' } },
    { ...session, expires_in: -1 }, { ...session, token_type: 'secret' }, { ...session, refresh_token: null }]) {
    const { adapter } = fixture(() => json(data));
    await assert.rejects(adapter.signIn('user@example.invalid', 'password'), error => error.code === 'SUPABASE_BAD_RESPONSE');
  }
  const invalidJson = fixture(() => new Response('<html>provider unavailable</html>', { status: 503 }));
  await assert.rejects(invalidJson.adapter.getUser(access), error => error.code === 'SUPABASE_BAD_RESPONSE');
  const oversized = fixture(() => new Response('x'.repeat(1048577)));
  await assert.rejects(oversized.adapter.getUser(access), error => error.code === 'SUPABASE_BAD_RESPONSE');
});

test('download enforces private PDF format and a 10 MiB response limit even without content-length', async () => {
  const html = fixture(() => new Response('<html>fake report</html>'));
  await assert.rejects(html.adapter.download(key), error => error.code === 'SUPABASE_BAD_RESPONSE');
  const declared = fixture(() => new Response(pdf, { headers: { 'Content-Length': '10485761' } }));
  await assert.rejects(declared.adapter.download(key), error => error.code === 'SUPABASE_BAD_RESPONSE');
  const tooBig = fixture(() => new Response(Buffer.concat([pdf, Buffer.alloc(10485760)])));
  await assert.rejects(tooBig.adapter.download(key), error => error.code === 'SUPABASE_BAD_RESPONSE');
});

test('a stalled provider request is aborted and leaves no in-flight state that blocks subsequent calls', async () => {
  let first = true;
  const { adapter, calls } = fixture((_url, options) => {
    if (!first) return json(user);
    first = false;
    return new Promise((resolve, reject) => {
      const hold = setTimeout(() => resolve(json(user)), 200);
      options.signal.addEventListener('abort', () => { clearTimeout(hold); reject(Error('timed out with secret provider context')); }, { once: true });
    });
  }, { timeoutMs: 15 });
  await assert.rejects(adapter.getUser(access), error => error.code === 'SUPABASE_UNAVAILABLE' && error.status === 503);
  assert.equal((await adapter.getUser(access)).id, caller);
  assert.equal(calls.length, 2);
});
