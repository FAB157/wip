#!/usr/bin/env node
/** Stessa diagnosi di prima ma CON un utente loggato, per isolare se il
 *  blocco e' puoGenerare (ospite) o qualcos'altro. */
import fs from 'fs';
import path from 'path';
const env = {};
for (const f of ['.env', '.env.local']) {
  try {
    for (const l of fs.readFileSync(path.join('C:/progetti/itainta', f), 'utf8').split(/\r?\n/)) {
      const m = l.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  } catch {}
}
const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const anonKey = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;
console.log('debug supabaseUrl:', supabaseUrl, '| anonKey len:', (anonKey || '').length);

async function login() {
  const r = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'appreview@wip.guide', password: 'WipReview2026!' }),
  });
  const j = await r.json();
  if (!j.access_token) { console.error('LOGIN FALLITO', r.status, j); process.exit(1); }
  console.log('login ok, user id:', j.user?.id);
  return j.access_token;
}

async function main() {
  const token = await login();
  const targetId = 'wd-Q481323'; // Platz des 18. Marz, gia' in inglese
  const live = await fetch(`https://wip.guide/api/poi/details?id=${encodeURIComponent(targetId)}&lang=fr`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  console.log('status (autenticato):', live.status);
  const j = await live.json();
  console.log('description_short:', (j.description_short || '').slice(0, 100));
  console.log('description_long primi 150:', (j.description_long || '').slice(0, 150));
}
main().catch(e => { console.error('ERRORE', e); process.exit(1); });
