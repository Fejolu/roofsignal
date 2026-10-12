import { createSupabaseAdapter } from '../src/supabase-adapter.mjs';
import { createSessionCookies } from '../src/session-cookie.mjs';
import { createHostedHandler } from '../src/hosted-handler.mjs';
import { createWebsiteIntakeHandler } from '../src/website-intake-handler.mjs';

let cached;
function handler(env) {
  const values = [env.ERP_ORIGIN, env.ERP_SUPABASE_URL, env.ERP_TEST_PROJECT_REF,
    env.ERP_PUBLISHABLE_KEY, env.ERP_STORAGE_KEY, env.ERP_SESSION_SECRET,
    env.ERP_INTAKE_SECRET, env.ERP_ENVIRONMENT, env.ERP_PASSWORD_RECOVERY];
  if (cached && values.every((v, i) => v === cached.values[i])) return cached.handle;
  if (!values.slice(0, 6).every(v => typeof v === 'string' && v.length)) throw new Error('Werkruimte nog niet ingericht.');
  const origin = new URL(env.ERP_ORIGIN);
  if (origin.protocol !== 'https:' || origin.origin !== env.ERP_ORIGIN) throw new Error('HTTPS is vereist.');
  const adapter = createSupabaseAdapter({ url: env.ERP_SUPABASE_URL, testProjectRef: env.ERP_TEST_PROJECT_REF,
    publishableKey: env.ERP_PUBLISHABLE_KEY, storageKey: env.ERP_STORAGE_KEY, redirectOrigin: env.ERP_ORIGIN });
  const cookies = createSessionCookies({ secret: env.ERP_SESSION_SECRET, origin: env.ERP_ORIGIN });
  // Cloudflare supplies this header; this module is not used by the local server.
  const handle = createHostedHandler({ adapter, cookies, origin: env.ERP_ORIGIN,
    environment: env.ERP_ENVIRONMENT === 'production' ? 'production' : 'test',
    passwordRecovery: env.ERP_PASSWORD_RECOVERY === 'true' || env.ERP_ENVIRONMENT !== 'production',
    rateLimitKey: request => request.headers.get('CF-Connecting-IP') || 'unknown' });
  const intake = env.ERP_INTAKE_SECRET ? createWebsiteIntakeHandler({ adapter, secret: env.ERP_INTAKE_SECRET, origin: env.ERP_ORIGIN }) : null;
  const dispatch = request => new URL(request.url).pathname === '/api/website-intake'
    ? intake ? intake(request) : Response.json({ error: 'Websitekoppeling niet beschikbaar.' }, { status: 503,
      headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow, noarchive' } }) : handle(request);
  cached = { values, handle: dispatch };
  return dispatch;
}

export async function onRequest(context) {
  const url = new URL(context.request.url);
  if (url.pathname.startsWith('/api/') || url.pathname === '/auth/callback') {
    try { return await handler(context.env)(context.request); }
    catch { return Response.json({ error: 'De testomgeving is nog niet beschikbaar.' }, { status: 503,
      headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow, noarchive' } }); }
  }
  const asset = await context.next();
  const response = new Response(asset.body, asset);
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'no-referrer');
  response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  response.headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  return response;
}
