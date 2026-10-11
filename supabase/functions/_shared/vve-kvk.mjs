const origins = new Set(['https://www.roofsignal.nl', 'https://roofsignal.nl']);
export const normalizeKvk = value => String(value || '').replace(/\s/g, '');

// Only a matching, active VvE may supply the name. Branch counts and registered
// addresses are deliberately excluded: neither defines the inspected object.
export function vveFromProfile(profile, number) {
  const owner = profile?._embedded?.eigenaar;
  if (profile?.kvkNummer !== number) return { found: false, reason: 'not_found' };
  if (profile.materieleRegistratie?.datumEinde || owner?.datumUitschrijving) return { found: false, reason: 'inactive' };
  if (String(owner?.rechtsvorm || '').toLowerCase() !== 'vereniging van eigenaars') return { found: false, reason: 'not_vve' };
  const name = String(profile.statutaireNaam || profile.naam || '').trim();
  if (!name || name.length > 200) return { found: false, reason: 'unavailable' };
  return { found: true, kvkNumber: number, name };
}

export function createKvkHandler({ env, verify, consume, fetchProfile }) {
  return async req => {
    const origin = req.headers.get('origin') || '';
    const headers = {
      'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Origin',
      'Access-Control-Allow-Origin': origins.has(origin) ? origin : 'https://www.roofsignal.nl',
      'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
    };
    const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers });
    if (req.method === 'OPTIONS') return reply({});
    if (!origins.has(origin)) return reply({ error: 'origin' }, 403);
    const enabled = env('VVE_KVK_ENABLED') === 'true' && Boolean(env('KVK_API_KEY')?.trim());
    if (req.method === 'GET' && new URL(req.url).pathname.endsWith('/status')) return reply({ enabled });
    if (req.method !== 'POST') return reply({ error: 'method' }, 405);
    if (!enabled) return reply({ error: 'unavailable' }, 503);
    try {
      if (Number(req.headers.get('content-length') || 0) > 4096) return reply({ error: 'invalid' }, 400);
      const text = await req.text();
      if (text.length > 4096) return reply({ error: 'invalid' }, 400);
      let body;
      try { body = JSON.parse(text); } catch { return reply({ error: 'invalid' }, 400); }
      const number = normalizeKvk(body?.kvk_number);
      if (!/^\d{8}$/.test(number) || body?.company_website) return reply({ error: 'invalid' }, 400);
      const token = String(body.turnstile_token || '');
      if (!token || token.length > 2048) return reply({ error: 'verification' }, 403);
      const ip = (req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim();
      if (!await verify(token, ip)) return reply({ error: 'verification' }, 403);
      // The atomic server-side budget is consumed before any paid API request.
      if (!await consume(ip)) return reply({ error: 'limit' }, 429);
      const response = await fetchProfile(number, env('KVK_API_KEY').trim());
      if (response.status === 404) return reply({ found: false, reason: 'not_found' });
      if (!response.ok) return reply({ error: 'unavailable' }, 503);
      return reply(vveFromProfile(await response.json(), number));
    } catch {
      // Provider responses and keys must never reach browser errors or logs.
      return reply({ error: 'unavailable' }, 503);
    }
  };
}
