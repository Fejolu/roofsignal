import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { cloudSmoke } from '../scripts/cloud-smoke.mjs';
import { configureTestAuth } from '../scripts/configure-auth.mjs';

test('cloud setup cannot run implicitly or target the existing website environment', async t => {
  await assert.rejects(cloudSmoke({}), e => e.safeCode === 'EXPLICIT_PROVISION_FLAG_REQUIRED');
  const folder = await mkdtemp(path.join(tmpdir(), 'erp-guard-'));
  t.after(() => rm(folder, { recursive: true, force: true }));
  const file = path.join(folder, 'config.json');
  await writeFile(file, JSON.stringify({ url: 'https://kakpticlxlaxtebhsuoh.supabase.co', testProjectRef: 'kakpticlxlaxtebhsuoh',
    origin: 'http://127.0.0.1:8789', publishableKey: 'sb_publishable_fixture', storageKey: 'sb_secret_fixture' }), { mode: 0o600 });
  await assert.rejects(cloudSmoke({ configPath: file, provision: true }), e => e.safeCode === 'ISOLATED_TEST_CONFIG_REQUIRED');
  await assert.rejects(configureTestAuth(file), /Controleer de invoer/);
});
