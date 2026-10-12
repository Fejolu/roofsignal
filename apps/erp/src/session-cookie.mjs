import { Buffer } from 'node:buffer';

const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/;
const TOKEN = /^[A-Za-z0-9._-]{1,8192}$/;
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

// The browser receives an authenticated, encrypted envelope; the server checks
// its opaque ID against the durable registry before using either provider token.
export function createSessionCookies({ secret, origin, now = Date.now } = {}) {
  const site = new URL(origin);
  if (site.origin !== origin || site.username || site.password
    || !(site.protocol === 'https:' || (site.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(site.hostname)))) {
    throw new Error('Ongeldige inlogomgeving.');
  }
  if (typeof secret !== 'string' || !/^[a-f0-9]{64}$/.test(secret)) throw new Error('Een afzonderlijke sessiesleutel is vereist.');
  const key = crypto.subtle.importKey('raw', Buffer.from(secret, 'hex'), 'AES-GCM', false, ['encrypt', 'decrypt']);
  const secure = site.protocol === 'https:';
  const name = secure ? '__Host-roofsignal_session' : 'roofsignal_local_session';
  const attributes = `HttpOnly; SameSite=Strict; Path=/${secure ? '; Secure' : ''}`;
  const aad = encoder.encode(`RoofSignal ERP session v1 ${origin}`);
  function valid(s) {
    return s && typeof s === 'object' && !Array.isArray(s) && /^[a-f0-9]{64}$/.test(s.id || '')
      && UUID.test(s.user || '') && TOKEN.test(s.accessToken || '') && TOKEN.test(s.refreshToken || '')
      && Number.isSafeInteger(s.accessExpiresAt) && Number.isSafeInteger(s.expiresAt)
      && s.expiresAt > now() && s.expiresAt <= now() + (s.purpose === 'recovery' ? 600000 : 28800000)
      && ['login', 'recovery'].includes(s.purpose);
  }
  return Object.freeze({
    async encode(session) {
      if (!valid(session)) throw new Error('Ongeldige sessie.');
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const body = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad }, await key, encoder.encode(JSON.stringify(session)));
      const value = 'v1.' + Buffer.from(iv).toString('base64url') + '.' + Buffer.from(body).toString('base64url');
      // Oversized provider tokens must fail instead of silently losing a cookie.
      if (value.length > 3800) throw new Error('De sessie is te groot.');
      return `${name}=${value}; ${attributes}; Max-Age=${Math.max(1, Math.floor((session.expiresAt - now()) / 1000))}`;
    },
    async decode(request) {
      const header = request.headers.get('cookie') || '';
      if (header.length > 16384) return null;
      const matches = header.split(';').map(s => s.trim()).filter(s => s.startsWith(name + '='));
      if (matches.length !== 1) return null;
      const value = matches[0].slice(name.length + 1);
      if (!/^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{30,3800}$/.test(value)) return null;
      try {
        const [, iv, data] = value.split('.');
        const bytes = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: Buffer.from(iv, 'base64url'), additionalData: aad }, await key, Buffer.from(data, 'base64url'));
        const session = JSON.parse(decoder.decode(bytes));
        return valid(session) ? session : null;
      } catch { return null; }
    },
    clear() { return `${name}=; ${attributes}; Max-Age=0`; },
  });
}
