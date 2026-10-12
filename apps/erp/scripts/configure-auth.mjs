// Explicit isolated-project setup. No account creation, email or secret output.
import { readFile, writeFile, mkdir, mkdtemp, stat, cp, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createSupabaseAdapter } from '../src/supabase-adapter.mjs';

export async function configureTestAuth(configPath) {
  const mode = await stat(configPath);
  if (!mode.isFile() || (mode.mode & 0o077)) throw new Error('Gebruik een afgeschermd configuratiebestand.');
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  createSupabaseAdapter({ ...config, redirectOrigin: config.origin });
  const origin = new URL(config.origin);
  if (origin.origin !== config.origin || !(origin.protocol === 'https:' || config.origin === 'http://127.0.0.1:8789')) throw new Error('Ongeldige testlocatie.');
  const directory = await mkdtemp(path.join(tmpdir(), 'roofsignal-erp-auth-'));
  try {
    await mkdir(path.join(directory, 'supabase/templates'), { recursive: true });
    await cp(fileURLToPath(new URL('../supabase/templates/', import.meta.url)), path.join(directory, 'supabase/templates'), { recursive: true });
    await writeFile(path.join(directory, 'supabase/config.toml'), `project_id = "roofsignal-erp-test"
[auth]
enabled = true
site_url = ${JSON.stringify(config.origin)}
additional_redirect_urls = [${JSON.stringify(config.origin + '/auth/callback')}]
enable_signup = false
enable_anonymous_sign_ins = false
minimum_password_length = 12
password_requirements = "lower_upper_letters_digits"
[auth.email]
enable_signup = false
enable_confirmations = true
double_confirm_changes = true
secure_password_change = true
[auth.email.template.invite]
subject = "Uw RoofSignal-account"
content_path = "./supabase/templates/invite.html"
[auth.email.template.recovery]
subject = "Nieuw wachtwoord voor RoofSignal"
content_path = "./supabase/templates/recovery.html"
`, { mode: 0o600 });
    try {
      await promisify(execFile)('/opt/homebrew/bin/supabase', ['config', 'push', '--project-ref', config.testProjectRef, '--workdir', directory, '--yes'],
        { maxBuffer: 1024 * 1024, timeout: 60000 });
    } catch { throw new Error('Auth-inrichting niet bevestigd; uitvoer afgeschermd.'); }
    return { configured: true, project: config.testProjectRef };
  } finally { await rm(directory, { recursive: true, force: true }); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    if (process.argv.length !== 4 || process.argv[3] !== '--configure-isolated-test') throw new Error('Expliciete testinrichting vereist.');
    console.log(JSON.stringify(await configureTestAuth(path.resolve(process.argv[2]))));
  } catch { console.error('De afzonderlijke Auth-testinrichting is niet geslaagd. Geen sleutels weergegeven.'); process.exitCode = 1; }
}
