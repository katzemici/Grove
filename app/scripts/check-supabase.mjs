// Verifies the Supabase setup without changing anything:
//   npm run check:supabase
// Reads VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY from .env.local or .env.

import { existsSync, readFileSync } from 'node:fs';

function readEnv() {
  const env = {};
  for (const file of ['.env', '.env.local']) {
    if (!existsSync(file)) continue;
    for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = raw.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    }
  }
  return { ...env, ...process.env };
}

const env = readEnv();
const url = (env.VITE_SUPABASE_URL ?? '').trim().replace(/\/+$/, '');
const key = (env.VITE_SUPABASE_ANON_KEY ?? '').trim();
let failed = false;
const ok = (msg) => console.log('  ok    ' + msg);
const warn = (msg) => console.log('  warn  ' + msg);
const bad = (msg) => {
  failed = true;
  console.log('  FAIL  ' + msg);
};

console.log('Supabase check\n');

if (!url || !key) {
  bad('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must both be set in .env');
  process.exit(1);
}
if (!/^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/.test(url) && !url.startsWith('http://localhost') && !url.startsWith('http://127.0.0.1')) {
  warn(`URL "${url}" does not look like https://<project>.supabase.co`);
} else ok('URL format');

function role(k) {
  if (k.startsWith('sb_secret_')) return 'secret';
  if (k.startsWith('sb_publishable_')) return 'publishable';
  try {
    return JSON.parse(Buffer.from(k.split('.')[1], 'base64url').toString()).role ?? 'unknown';
  } catch {
    return 'unknown';
  }
}
const keyRole = role(key);
if (keyRole === 'service_role' || keyRole === 'secret') {
  bad('The key is a SECRET (service_role) key. Never put it in the frontend. Use the anon / publishable key.');
  process.exit(1);
} else if (keyRole === 'anon' || keyRole === 'publishable') ok(`key is the public ${keyRole} key`);
else warn('could not recognise the key type; expected the anon or publishable key');

const headers = { apikey: key, Authorization: `Bearer ${key}` };

try {
  const res = await fetch(`${url}/auth/v1/settings`, { headers });
  if (!res.ok) bad(`auth settings returned HTTP ${res.status} (wrong URL or key?)`);
  else {
    const s = await res.json();
    ok('connected to Supabase Auth');
    if (s.disable_signup) warn('sign-ups are disabled in Auth settings; nobody can register');
    if (s.mailer_autoconfirm) warn('email confirmation is OFF. Turn on "Confirm email" so people must own the address they sign up with.');
    else ok('email confirmation is on');
    const providers = Object.entries(s.external ?? {})
      .filter(([name, on]) => on && ['google', 'apple', 'facebook'].includes(name))
      .map(([name]) => name);
    console.log('        social providers enabled: ' + (providers.length ? providers.join(', ') : 'none'));
  }
} catch (err) {
  bad('could not reach ' + url + ' (' + err.message + ')');
  process.exit(1);
}

// Tables exist and anonymous visitors see nothing (RLS + grants).
for (const table of ['profiles', 'tasks', 'transactions', 'habits']) {
  const res = await fetch(`${url}/rest/v1/${table}?select=*&limit=1`, { headers });
  const body = await res.text();
  if (res.status === 404 || body.includes('PGRST205') || body.includes('42P01')) {
    bad(`table "${table}" is missing. Run supabase/schema.sql in the SQL editor.`);
    console.log('        server said: ' + body.slice(0, 200));
  } else if (res.ok && body.trim() !== '[]') {
    bad(`anonymous request could read "${table}" rows. Row Level Security is not on. Re-run supabase/schema.sql.`);
  } else ok(`"${table}" exists and is hidden from anonymous visitors`);
}

console.log(failed ? '\nSome checks failed.' : '\nAll checks passed.');
process.exit(failed ? 1 : 0);
