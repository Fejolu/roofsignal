import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { createSupabaseAdapter } from './supabase-adapter.mjs';
import { createSessionCookies } from './session-cookie.mjs';
import { createHostedHandler } from './hosted-handler.mjs';

const PUBLIC = fileURLToPath(new URL('../public/', import.meta.url));
const MIME = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };

// Local browser proof against the isolated, real Supabase Auth environment.
// Online hosting uses the same Fetch handler, behind HTTPS and its own secrets.
export async function createHostedServer({ config, port = 8789 } = {}) {
  if (process.env.NODE_ENV === 'production') throw new Error('Gebruik voor online hosting de HTTPS-adapter.');
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Ongeldige lokale poort.');
  const origin = `http://127.0.0.1:${port}`;
  if (config?.origin !== origin) throw new Error('De vaste terugkeerlocatie moet overeenkomen met de lokale testserver.');
  const adapter = createSupabaseAdapter({ ...config, redirectOrigin: origin });
  const cookies = createSessionCookies({ secret: config.sessionSecret, origin });
  const handler = createHostedHandler({ adapter, cookies, origin });
  const server = http.createServer(async (incoming, outgoing) => {
    try {
      if (incoming.headers.host !== `127.0.0.1:${port}`) { outgoing.writeHead(403); return outgoing.end(); }
      const url = new URL(incoming.url, origin);
      let response;
      if (url.pathname.startsWith('/api/') || url.pathname === '/auth/callback') {
        const request = new Request(url, { method: incoming.method, headers: incoming.headers,
          ...(!['GET', 'HEAD'].includes(incoming.method) ? { body: incoming, duplex: 'half' } : {}) });
        response = await handler(request);
      } else {
        const name = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
        if (incoming.method !== 'GET' || !/^[A-Za-z0-9_.-]+$/.test(name) || !MIME[path.extname(name)]) {
          response = new Response('Niet gevonden', { status: 404 });
        } else {
          const bytes = await readFile(path.join(PUBLIC, name)).catch(() => null);
          response = new Response(bytes || 'Niet gevonden', { status: bytes ? 200 : 404,
            headers: { 'Content-Type': MIME[path.extname(name)] } });
        }
        response.headers.set('Cache-Control', 'no-store');
        response.headers.set('X-Content-Type-Options', 'nosniff');
        response.headers.set('Referrer-Policy', 'no-referrer');
        response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
        response.headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
      }
      outgoing.writeHead(response.status, Object.fromEntries(response.headers));
      outgoing.end(Buffer.from(await response.arrayBuffer()));
    } catch {
      // Never log provider URLs, credentials, cookies or authentication callbacks.
      if (!outgoing.headersSent) outgoing.writeHead(503, { 'Cache-Control': 'no-store', 'Content-Type': 'application/json' });
      outgoing.end('{"error":"De verbinding is tijdelijk niet beschikbaar."}');
    }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  return { url: origin, server, close: () => new Promise(resolve => server.close(resolve)) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const configPath = process.env.ROOFSIGNAL_ERP_TEST_CONFIG;
  if (!configPath) throw new Error('Stel ROOFSIGNAL_ERP_TEST_CONFIG in op het afgeschermde testconfiguratiebestand.');
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  const app = await createHostedServer({ config });
  console.log(`RoofSignal ERP: echte login in de aparte testomgeving · ${app.url}`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await app.close(); process.exit(0); });
}
