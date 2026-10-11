// Read-only aggregate report; uses the already-authorized local Supabase CLI.
// Usage: node tools/consumer_acquisition_report.mjs 2026-10-12 2026-11-11
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const [from,until]=process.argv.slice(2);
if(![from,until].every(v=>/^\d{4}-\d{2}-\d{2}$/.test(v||'')&&Number.isFinite(Date.parse(v)))||from>=until)throw Error('Supply ISO start and exclusive end dates.');
const project='kakpticlxlaxtebhsuoh';
try {
 const {stdout}=await promisify(execFile)('supabase',['projects','api-keys','--project-ref',project,'--reveal','--output','json']);
 const key=JSON.parse(stdout).find(k=>k.name==='default'&&k.type==='secret')?.api_key;
 if(!key)throw Error('Authorized server credential unavailable.');
 const response=await fetch(`https://${project}.supabase.co/rest/v1/rpc/consumer_acquisition_summary`,{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({p_from:from+'T00:00:00Z',p_until:until+'T00:00:00Z'}),signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw Error('Aggregate report unavailable (HTTP '+response.status+').');
 console.log(JSON.stringify({fromUTC:from,untilUTCExclusive:until,rows:await response.json(),note:'Live, verified-paid and scheduled bookings, grouped by booking creation date. Gross value incl. VAT. Check refunds, chargebacks and cancellations in Mollie before reporting retained sales/CAC. Unknown origin stays unattributed.'},null,2));
} catch(error) { console.error(error.message.startsWith('Command failed')?'Supabase authentication unavailable.':error.message);process.exitCode=1; }
