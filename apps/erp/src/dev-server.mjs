import http from 'node:http';
import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises';
import { randomBytes, createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { openDatabase, seedDemo, command, USERS } from './database.mjs';

const ROOT=fileURLToPath(new URL('../',import.meta.url));
const MIME={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'};
const uuid=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const error=(message,status=400)=>Object.assign(new Error(message),{status});
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');

async function body(req,max=65536) {
  const chunks=[];let size=0;
  for await(const chunk of req) { size+=chunk.length;if(size>max) throw error('Bestand of invoer is te groot',413);chunks.push(chunk); }
  return Buffer.concat(chunks);
}
async function json(req) {
  if(!req.headers['content-type']?.startsWith('application/json')) throw error('JSON-invoer vereist',415);
  try{return JSON.parse((await body(req)).toString());}catch(e){if(e.status)throw e;throw error('Ongeldige invoer');}
}

export async function createDevServer({dataDir=path.join(ROOT,'.local/database'),port=8788,seed=true}={}) {
  if(process.env.NODE_ENV==='production') throw new Error('De lokale proefserver mag niet in productie draaien.');
  const privateDir=dataDir?path.join(path.dirname(dataDir),'documents'):null;
  if(dataDir) await mkdir(path.dirname(dataDir),{recursive:true,mode:0o700});
  if(privateDir) await mkdir(privateDir,{recursive:true,mode:0o700});
  const db=await openDatabase(dataDir);
  if(seed)await seedDemo(db);
  const sessions=new Map();
  const server=http.createServer(async(req,res)=>{
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('X-Robots-Tag','noindex, nofollow, noarchive');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    const reply=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value));};
    try {
      const actualPort=server.address().port;
      const hosts=[`127.0.0.1:${actualPort}`,`localhost:${actualPort}`];
      if(!hosts.includes(req.headers.host))throw error('Onbekende host',403);
      if(req.method==='POST'&&!hosts.some(h=>req.headers.origin===`http://${h}`))throw error('Verzoek van buiten de proefomgeving geweigerd',403);
      const url=new URL(req.url,`http://${req.headers.host}`);
      if(url.pathname==='/api/dev-session'&&req.method==='POST') {
        const input=await json(req);const user=USERS[input.account];
        if(!user)throw error('Onbekend proefaccount');
        const token=randomBytes(32).toString('hex');
        sessions.set(token,{user,expires:Date.now()+8*3600000});
        res.setHeader('Set-Cookie',`roofsignal_dev=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800`);
        return reply(200,{ok:true});
      }
      if(url.pathname.startsWith('/api/')) {
        const token=req.headers.cookie?.match(/(?:^|;\s*)roofsignal_dev=([a-f0-9]{64})(?:;|$)/)?.[1];
        const session=sessions.get(token);
        if(!session||session.expires<Date.now())throw error('Kies een proefaccount om te beginnen',401);
        if(url.pathname==='/api/logout'&&req.method==='POST') {
          sessions.delete(token);res.setHeader('Set-Cookie','roofsignal_dev=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');return reply(200,{ok:true});
        }
        if(url.pathname==='/api/command'&&req.method==='POST') {
          const input=await json(req);
          if(input.action==='report.attach')throw error('Gebruik de beveiligde PDF-upload',403);
          const result=await command(db,session.user,input.action,input.payload);
          if(input.action==='snapshot')result.dev_account=Object.entries(USERS).find(([,id])=>id===session.user)?.[0];
          return reply(200,result);
        }
        const fileRoute=url.pathname.match(/^\/api\/reports\/([0-9a-f-]+)\/file$/);
        if(fileRoute&&uuid.test(fileRoute[1])) {
          const id=fileRoute[1];
          if(req.method==='GET') {
            const file=await command(db,session.user,'report.file',{id});
            if(!file.key||!privateDir)throw error('Er is nog geen PDF toegevoegd',404);
            if(!/^[0-9a-f-]{36}\.pdf$/.test(file.key))throw error('Ongeldige bestandsverwijzing',404);
            const bytes=await readFile(path.join(privateDir,file.key)).catch(()=>{throw error('PDF is momenteel niet beschikbaar',503);});
            res.writeHead(200,{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="RoofSignal-rapport.pdf"; filename*=UTF-8''${encodeURIComponent(file.name)}`,'Content-Security-Policy':"sandbox; default-src 'none'"});
            return res.end(bytes);
          }
          if(req.method==='POST') {
            const snapshot=await command(db,session.user,'snapshot');
            if(!snapshot.staff)throw error('Geen toegang',403);
            if(!privateDir)throw error('Bestandsopslag niet beschikbaar',503);
            const report=snapshot.reports.find(r=>r.id===id);
            if(!report||report.published_at)throw error('Rapport ontbreekt of is al vrijgegeven',409);
            const requestId=req.headers['x-request-id'];
            if(!uuid.test(requestId||''))throw error('Verzoeknummer ontbreekt');
            if(req.headers['content-type']!=='application/pdf')throw error('Kies een PDF-bestand',415);
            const bytes=await body(req,10485760);
            if(bytes.subarray(0,5).toString()!=='%PDF-')throw error('Dit is geen PDF-bestand');
            const hash=digest(`${session.user}:${requestId}`).slice(0,32);
            const key=`${hash.slice(0,8)}-${hash.slice(8,12)}-${hash.slice(12,16)}-${hash.slice(16,20)}-${hash.slice(20)}.pdf`;
            const dest=path.join(privateDir,key);let created=false;
            try{await writeFile(dest,bytes,{flag:'wx',mode:0o600});created=true;}catch(e){
              if(e.code!=='EEXIST')throw e;
              if(digest(await readFile(dest))!==digest(bytes))throw error('Verzoeknummer al gebruikt voor een ander bestand',409);
            }
            try {
              const result=await command(db,session.user,'report.attach',{id,request_id:requestId,file_key:key,
                file_name:decodeURIComponent(req.headers['x-file-name']||'Rapport.pdf').replace(/[\r\n]/g,'').slice(0,200),
                file_size:bytes.length,file_sha256:digest(bytes)});
              return reply(200,result);
            } catch(e){if(created)await unlink(dest);throw e;}
          }
        }
        throw error('Niet gevonden',404);
      }
      if(req.method!=='GET')throw error('Methode niet toegestaan',405);
      const name=url.pathname==='/'?'index.html':decodeURIComponent(url.pathname.slice(1));
      if(!/^[a-zA-Z0-9_.-]+$/.test(name)||!MIME[path.extname(name)])throw error('Niet gevonden',404);
      const bytes=await readFile(path.join(ROOT,'public',name)).catch(()=>{throw error('Niet gevonden',404);});
      res.writeHead(200,{'Content-Type':MIME[path.extname(name)]});res.end(bytes);
    }catch(e) {
      if(res.headersSent)return res.end();
      const knownSql=e.code==='P0001';
      const status=e.status||(e.code==='42501'?403:400);
      const message=e.status||knownSql||e.code==='42501'?e.message:
        e.code==='23505'?'Dit gegeven is al vastgelegd.':e.code?.startsWith('23')?'Controleer de verplichte velden en het gekoppelde dossier.':'De actie is niet gelukt. Controleer de invoer en probeer opnieuw.';
      reply(status,{error:message});
    }
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  return {server,db,url:`http://127.0.0.1:${server.address().port}`,async close(){await new Promise(resolve=>server.close(resolve));await db.close();}};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) {
  const app=await createDevServer();
  console.log(`RoofSignal ERP proefomgeving: ${app.url}\nUitsluitend fictieve dossiers. Opslag: apps/erp/.local/`);
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await app.close();process.exit(0);});
}
