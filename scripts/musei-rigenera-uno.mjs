#!/usr/bin/env node
/**
 * Rigenera UNA guida dalle fonti (rigenera=true, x-script-secret) e stampa la
 * completezza. Uso: node scripts/musei-rigenera-uno.mjs wd-Q106449134 "Palazzo delle Logge" IT 44.0797 10.0980
 */
import fs from 'fs';
import path from 'path';
const env = {};
for (const f of ['.env', '.env.local']) {
  try { for (const l of fs.readFileSync(path.join('C:/progetti/itainta', f), 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/); if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, ''); } } catch {}
}
const [poiId, nome, lingua = 'IT', lat, lon] = process.argv.slice(2);
if (!poiId || !nome) { console.error('Uso: node scripts/musei-rigenera-uno.mjs <poiId> "<nome>" [LINGUA] [lat] [lon]'); process.exit(1); }
const t0 = Date.now();
const r = await fetch(`${env.WIP_API || 'https://www.wip.guide'}/api/vision/venue-guide`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'x-script-secret': env.SCRIPT_SHARED_SECRET },
  // NO_RIGENERA=1: chiama la rotta come farebbe l'app (cache e libreria valgono,
  // e vale la cache opere_museo pre-riempita dal droplet).
  body: JSON.stringify({ poiId, venueHint: nome, venueHintSource: 'user', lat: lat ? +lat : null, lon: lon ? +lon : null, language: lingua, rigenera: process.env.NO_RIGENERA !== '1' }),
  signal: AbortSignal.timeout(290000),
});
const j = await r.json().catch(() => ({}));
console.log('stato', r.status, 'ok', j.ok, j.reason || '', `${((Date.now() - t0) / 1000).toFixed(0)} s`);
if (!j.ok) console.log('dettaglio:', JSON.stringify({ tappeProposte: j.tappeProposte, motiviScarto: j.motiviScarto, error: j.error }));
if (j.ok) {
  const g = j.guide; const t = g.tappe || [];
  console.log('intro', (g.intro || '').length, 'consiglio', (g.consiglio || '').length, 'servizi', Object.values(g.servizi || {}).filter(Boolean).length, 'fotoMuseo', !!j.venuePhoto);
  for (const x of t) console.log('-', x.nome.slice(0, 40).padEnd(40), 'foto', !!x.foto, 'perche', (x.perche || '').length, 'curio', (x.curiosita || '').length, 'sala', x.salaCodice || x.dove || '', x.revisione ? `⚠ ${x.revisione}` : '');
  if (j.motiviScarto?.length) console.log('scartate:', JSON.stringify(j.motiviScarto));
}
