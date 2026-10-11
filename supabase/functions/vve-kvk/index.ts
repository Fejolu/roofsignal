import { createClient } from 'npm:@supabase/supabase-js@2';
import { createKvkHandler } from '../_shared/vve-kvk.mjs';

const env = (name: string) => Deno.env.get(name) || '';
const service = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });

Deno.serve(createKvkHandler({
  env,
  async verify(token: string, ip: string) {
    if (!env('TURNSTILE_SECRET_KEY')) return false;
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: env('TURNSTILE_SECRET_KEY'), response: token, remoteip: ip }),
      signal: AbortSignal.timeout(8000)
    });
    const result = await response.json();
    return response.ok && result.success === true && result.action === 'price'
      && ['roofsignal.nl', 'www.roofsignal.nl'].includes(result.hostname);
  },
  async consume(ip: string) {
    if (!env('FORM_RATE_LIMIT_SALT')) return false;
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${env('FORM_RATE_LIMIT_SALT')}:${ip}`));
    const hash = Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
    const { data, error } = await service.rpc('consume_vve_kvk_lookup', { p_ip_hash: hash });
    return !error && data === true;
  },
  fetchProfile: (number: string, key: string) => fetch(`https://api.kvk.nl/api/v1/basisprofielen/${number}`, {
    headers: { apikey: key, Accept: 'application/json' }, signal: AbortSignal.timeout(8000), redirect: 'error'
  })
}));
