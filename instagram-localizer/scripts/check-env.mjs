import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
try {
  const file = await readFile(new URL('../.env.local', import.meta.url), 'utf8');
  const env = { ...parseEnv(file), ...process.env };
  for (const name of ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY']) {
    if (!env[name]?.trim() || /YOUR_PROJECT|REPLACE_ME/.test(env[name])) throw new Error('Set ' + name + ' in .env.local.');
  }
  const url = new URL(env.VITE_SUPABASE_URL);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('VITE_SUPABASE_URL must be an HTTP(S) URL.');
  if (env.VITE_SUPABASE_PUBLISHABLE_KEY.startsWith('sb_secret_')) throw new Error('Use a Supabase publishable key, never a secret key.');
  for (const [server, client] of [['SUPABASE_URL','VITE_SUPABASE_URL'],['SUPABASE_PUBLISHABLE_KEY','VITE_SUPABASE_PUBLISHABLE_KEY']]) {
    if (env[server] && env[server] !== env[client]) throw new Error(server + ' must match ' + client + ', or be empty.');
  }
  console.log('Required public configuration is present. No remote connection was tested.');
} catch (error) {
  console.error(error.code === 'ENOENT' ? 'Missing .env.local. Run setup.ps1 first.' : error instanceof TypeError ? 'Check the URL format in .env.local.' : error.message);
  process.exitCode = 1;
}
