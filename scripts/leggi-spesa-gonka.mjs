#!/usr/bin/env node
/** Contatori di spesa Gonka (api_cache gonka_semina_usd_*) e uso Groq/DeepSeek delle ultime 48 h (api_usage_logs), per stimare il costo per luogo del pre-arricchimento. */
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
const key = env.SUPABASE_SERVICE_ROLE_KEY;
const headers = { apikey: key, Authorization: `Bearer ${key}` };
const g = await (await fetch(`${supabaseUrl}/rest/v1/api_cache?cache_key=like.gonka_semina_usd_*&select=cache_key,text_content,created_at`, { headers })).json();
console.log('contatori Gonka:', g);
const da = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
const cols = await (await fetch(`${supabaseUrl}/rest/v1/api_usage_logs?select=*&limit=1`, { headers })).json();
console.log('colonne api_usage_logs:', Object.keys(cols[0] || {}));
const u = await (await fetch(`${supabaseUrl}/rest/v1/api_usage_logs?select=service,engine,model,input_tokens,output_tokens,cost_usd,user_id,created_at&created_at=gte.${da}&user_id=eq.background-script&limit=5000&order=created_at.desc`, { headers })).json();
if (!Array.isArray(u)) { console.log('usage:', u); process.exit(0); }
const agg = {};
for (const r of u) { const k = `${r.engine || r.service}/${r.model || ''}`; agg[k] = agg[k] || { n: 0, inTok: 0, outTok: 0, usd: 0 }; agg[k].n++; agg[k].inTok += Number(r.input_tokens || 0); agg[k].outTok += Number(r.output_tokens || 0); agg[k].usd += Number(r.cost_usd || 0); }
console.log(`api_usage_logs background-script ultime 48 h: ${u.length} righe (max 5000)`);
for (const [k, v] of Object.entries(agg)) console.log(` ${k}: ${v.n} chiamate, in ${v.inTok} tok, out ${v.outTok} tok, ${v.usd.toFixed(3)} $ → ${(v.usd / v.n).toFixed(5)} $/chiamata`);
