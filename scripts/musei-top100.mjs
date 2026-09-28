#!/usr/bin/env node
/**
 * I 100 musei più noti del mondo (Wikidata: istanze di museo, per numero
 * di voci Wikipedia), con coordinate ed etichetta it/en → scratch/top100-musei.json
 * Lista di lavoro per «i primi 100 musei completi di tutto» (committente 12/09/2026).
 */
import fs from 'fs';
const N = parseInt(process.argv[2] || '100', 10);
const q = `
SELECT ?m ?mLabel ?sitelinks ?lat ?lon ?sito WHERE {
  { SELECT ?m ?sitelinks WHERE {
      ?m wdt:P31/wdt:P279* wd:Q33506; wikibase:sitelinks ?sitelinks; wdt:P625 ?c .
      FILTER(?sitelinks >= 40)
    } ORDER BY DESC(?sitelinks) LIMIT ${N + 20} }
  ?m p:P625/psv:P625 ?cv . ?cv wikibase:geoLatitude ?lat ; wikibase:geoLongitude ?lon .
  OPTIONAL { ?m wdt:P856 ?sito }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "it,en". }
} ORDER BY DESC(?sitelinks)`;
let j = null;
for (let t = 0; t < 4 && !j; t++) {
  const r = await fetch('https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(q), { headers: { 'User-Agent': 'WorldInPocket/1.0 (support@wip.guide)', Accept: 'application/sparql-results+json' } });
  if (!r.ok) { console.log('SPARQL', r.status); await new Promise(x => setTimeout(x, 15000)); continue; }
  try { j = JSON.parse((await r.text()).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')); } catch (e) { console.log('JSON', e.message); }
}
if (!j) process.exit(1);
const visti = new Set(); const out = [];
// Fuori le voci che non sono luoghi (Newgrounds è «museo» su Wikidata).
const NON_LUOGHI = new Set(['Q263655']);
for (const b of j.results.bindings) {
  const qid = b.m.value.split('/').pop();
  if (visti.has(qid) || NON_LUOGHI.has(qid)) continue; visti.add(qid);
  out.push({ qid, nome: b.mLabel?.value || qid, sitelinks: +b.sitelinks.value, lat: +b.lat.value, lon: +b.lon.value, sito: b.sito?.value || null });
  if (out.length >= N) break;
}
fs.writeFileSync('C:/progetti/itainta/scratch/top100-musei.json', JSON.stringify(out, null, 1));
console.log(out.length, 'musei; ultimo:', out[out.length - 1]?.nome, out[out.length - 1]?.sitelinks, 'sitelink');
for (const m of out.slice(0, 15)) console.log(` ${m.sitelinks}\t${m.nome}`);
