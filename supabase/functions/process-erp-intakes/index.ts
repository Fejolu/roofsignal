import { createClient } from 'npm:@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { consumerAdminKeys, isConsumerAdmin } from '../_shared/consumer-admin.mjs';
import { processIntakes } from '../_shared/erp-intake.mjs';
import { verifyErpDispatch } from '../_shared/erp-dispatch-auth.mjs';

const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers });
serve(async (request: Request) => {
  // OPTIONS confirms deployment health without reading a queue or sending data.
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const keys = consumerAdminKeys(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), Deno.env.get('SUPABASE_SECRET_KEYS'));
  const supplied = request.headers.get('x-automation-secret');
  const scheduled = ['ERP_AUTOMATION_SECRET', 'CONSUMER_AUTOMATION_SECRET']
    .some(name => Boolean(Deno.env.get(name) && supplied === Deno.env.get(name)));
  const administrator = scheduled || isConsumerAdmin(request.headers, keys);
  const dispatch = administrator ? null : await verifyErpDispatch(request, Deno.env.get('ERP_INTAKE_SECRET'));
  if (!administrator && !dispatch) return json({ error: 'Unauthorized' }, 401);
  const enabled = Deno.env.get('ERP_INTAKE_ENABLED') === 'true';
  if (!enabled) return json(await processIntakes({ enabled: false }));
  const key = keys.secret || keys.legacy;
  if (!key) return json({ error: 'CONFIGURATION_REQUIRED' }, 503);
  const service = createClient(Deno.env.get('SUPABASE_URL')!, key, { auth: { persistSession: false } });
  const command = async (name: string, args: Record<string, unknown>) => {
    const result = await service.rpc(name, args);
    if (result.error) throw Error('QUEUE_OPERATION_FAILED');
    return result.data;
  };
  try {
    // A visible scheduler signature authorizes only one empty-body queue drain.
    // Consume its private database nonce before reading or processing any job.
    if (dispatch && await command('consume_erp_intake_scheduler_nonce', {
      p_nonce: dispatch.nonce, p_timestamp: dispatch.timestamp,
    }) !== true) return json({ error: 'Unauthorized' }, 401);
    const result = await processIntakes({ enabled, secret: Deno.env.get('ERP_INTAKE_SECRET'),
      claim: async () => await command('claim_erp_intakes', { p_limit: 10 }) || [],
      ack: async (job: any) => await command('ack_erp_intake', {
        p_source: job.source, p_source_id: job.source_id, p_revision: job.revision, p_lock_token: job.lock_token,
      }),
      retry: async (job: any, code: string, review: boolean) => await command('retry_erp_intake', {
        p_source: job.source, p_source_id: job.source_id, p_revision: job.revision,
        p_lock_token: job.lock_token, p_error: code, p_review: review,
      }),
    });
    const counts = await service.from('erp_intake_outbox').select('source', { count: 'exact', head: true }).eq('status', 'review');
    if (counts.error) return json({ ...result, ok: false, error: 'QUEUE_REVIEW_FAILED' }, 503);
    const needsReview = counts.count || 0;
    return json({ ...result, ok: result.ok && !needsReview, needsReview }, result.ok && !needsReview ? 200 : 502);
  } catch (error) {
    return json({ error: error?.code === 'CONFIGURATION_REQUIRED' ? 'CONFIGURATION_REQUIRED' : 'QUEUE_PROCESS_FAILED' }, 503);
  }
});
