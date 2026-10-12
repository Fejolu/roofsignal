import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createSessionCookies } from '../src/session-cookie.mjs';

const now = () => 1000000;
const secret = randomBytes(32).toString('hex');
const origin = 'https://erp-test.roofsignal.nl';
const session = { id: 'a'.repeat(64), user: '11111111-1111-4111-8111-111111111111', accessToken: 'secret.access.token',
  refreshToken: 'secret_refresh_token', accessExpiresAt: 2000000, expiresAt: 3000000, purpose: 'login' };
const request = cookie => new Request(origin, { headers: { cookie } });
test('cookie encrypts provider credentials and uses host-only protected attributes', async () => {
  const cookies = createSessionCookies({ secret, origin, now });
  const header = await cookies.encode(session);
  assert.match(header, /^__Host-roofsignal_session=v1\./);
  assert.match(header, /HttpOnly; SameSite=Strict; Path=\/; Secure; Max-Age=/);
  assert.ok(!header.includes('secret.access') && !header.includes(session.refreshToken));
  assert.deepEqual(await cookies.decode(request(header.split(';')[0])), session);
  assert.notEqual(await cookies.encode(session), header);
});
test('tampering, changed deployment origin/key, duplicate and expired cookies fail closed', async () => {
  const cookies = createSessionCookies({ secret, origin, now });
  const value = (await cookies.encode(session)).split(';')[0];
  assert.equal(await cookies.decode(request(value.slice(0, -4) + 'AAAA')), null);
  assert.equal(await cookies.decode(request(value + '; ' + value)), null);
  assert.equal(await createSessionCookies({ secret, origin: 'https://other.roofsignal.nl', now }).decode(request(value)), null);
  assert.equal(await createSessionCookies({ secret: 'f'.repeat(64), origin, now }).decode(request(value)), null);
  assert.equal(await createSessionCookies({ secret, origin, now: () => session.expiresAt }).decode(request(value)), null);
});
test('recovery lifetime and session shapes are bounded; no insecure remote origins', async () => {
  const cookies = createSessionCookies({ secret, origin, now });
  for (const change of [{ purpose: 'recovery' }, { purpose: 'admin' }, { user: 'not-a-user' }, { expiresAt: 300000000 }, { accessToken: 'bad\n' }]) {
    await assert.rejects(cookies.encode({ ...session, ...change }));
  }
  assert.throws(() => createSessionCookies({ secret, origin: 'http://erp.roofsignal.nl', now }));
  assert.throws(() => createSessionCookies({ secret: 'short', origin, now }));
  assert.match(cookies.clear(), /Max-Age=0$/);
  assert.match(await createSessionCookies({ secret, origin: 'http://127.0.0.1:8789', now }).encode(session), /^roofsignal_local_session=/);
});
