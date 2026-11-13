#!/usr/bin/env node
// LE PRIME 20 CITTA' DI OGNI NAZIONE DI EUROPA, ASIA E AMERICA (22/09/2026,
// committente: «fai lista delle 20 citta principali di ogni nazione in
// europa, asia e america») — la lista da cui parte il pre-arricchimento delle
// zone, cosi' l'utente trova pin, schede e audioguide gia' pronti.
//
// Fonte: GeoNames (CC BY 4.0), file cities15000 (tutti i centri abitati con
// almeno 15.000 abitanti) + countryInfo (continente di ogni paese). Mai a
// memoria: alla pre-arricchimento servono coordinate esatte, e la classifica
// per popolazione e' quella di GeoNames, non un'opinione.
//   node scripts/citta-da-prearricchire.mjs <cartella con cities15000.txt e countryInfo.txt> [--n=20]
// Scrive scripts/data/citta-prearricchimento.jsonl (una riga per citta') e
// scratch/citta-prearricchimento.md (la lista leggibile, per continente).
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const cartella = args.find((a) => !a.startsWith('--'));
const n = Number((args.find((a) => a.startsWith('--n=')) || '--n=20').split('=')[1]) || 20;
if (!cartella) { console.error('uso: node scripts/citta-da-prearricchire.mjs <cartella geonames> [--n=20]'); process.exit(1); }

// countryInfo: colonne 0 ISO, 4 nome, 8 continente (EU, AS, NA, SA, AF, OC, AN).
const paesi = new Map();
for (const r of fs.readFileSync(path.join(cartella, 'countryInfo.txt'), 'utf8').split(/\r?\n/)) {
  if (!r || r.startsWith('#')) continue;
  const c = r.split('\t');
  paesi.set(c[0], { iso: c[0], nome: c[4], continente: c[8] });
}
const CONTINENTI = { EU: 'Europa', AS: 'Asia', NA: 'America del Nord', SA: 'America del Sud' };

// cities15000: 0 id, 1 nome, 2 ascii, 4 lat, 5 lon, 6 classe, 7 codice, 8 paese, 10 admin1, 14 popolazione.
// Esclusi i quartieri (PPLX), i luoghi abbandonati/storici (PPLQ, PPLW, PPLH): non sono citta'.
const ESCLUSI = new Set(['PPLX', 'PPLQ', 'PPLW', 'PPLH', 'PPLCH']);
const perPaese = new Map();
for (const r of fs.readFileSync(path.join(cartella, 'cities15000.txt'), 'utf8').split(/\r?\n/)) {
  if (!r) continue;
  const c = r.split('\t');
  const paese = paesi.get(c[8]);
  if (!paese || !CONTINENTI[paese.continente] || ESCLUSI.has(c[7])) continue;
  const pop = Number(c[14]) || 0;
  if (!perPaese.has(c[8])) perPaese.set(c[8], []);
  perPaese.get(c[8]).push({ nome: c[1], lat: Number(c[4]), lon: Number(c[5]), popolazione: pop, admin1: c[10], geonameid: Number(c[0]) });
}

const righe = [];
const md = ['# Città da pre-arricchire: le prime ' + n + ' di ogni nazione (Europa, Asia, America)', '', 'Fonte GeoNames cities15000 + countryInfo (CC BY 4.0), ordinate per popolazione. Generato il ' + new Date().toISOString().slice(0, 10) + '.', ''];
let totale = 0;
for (const cont of ['EU', 'AS', 'NA', 'SA']) {
  const lista = [...perPaese.entries()].filter(([iso]) => paesi.get(iso).continente === cont).sort((a, b) => paesi.get(a[0]).nome.localeCompare(paesi.get(b[0]).nome));
  md.push(`## ${CONTINENTI[cont]} (${lista.length} nazioni)`, '');
  for (const [iso, citta] of lista) {
    citta.sort((a, b) => b.popolazione - a.popolazione);
    const prime = citta.slice(0, n);
    const p = paesi.get(iso);
    md.push(`### ${p.nome} (${iso}) — ${prime.length}`);
    md.push(prime.map((c, i) => `${i + 1}. ${c.nome} (${c.popolazione.toLocaleString('it-IT')})`).join('  \n'), '');
    for (const [i, c] of prime.entries()) {
      righe.push({ continente: CONTINENTI[cont], paese: p.nome, iso, rango: i + 1, citta: c.nome, lat: c.lat, lon: c.lon, popolazione: c.popolazione, geonameid: c.geonameid });
      totale++;
    }
  }
}
fs.mkdirSync('scripts/data', { recursive: true });
fs.writeFileSync('scripts/data/citta-prearricchimento.jsonl', righe.map((r) => JSON.stringify(r)).join('\n') + '\n');
fs.mkdirSync('scratch', { recursive: true });
fs.writeFileSync('scratch/citta-prearricchimento.md', md.join('\n'));
const perCont = {};
for (const r of righe) perCont[r.continente] = (perCont[r.continente] || 0) + 1;
console.log(`citta' totali: ${totale}`, perCont);
console.log('scritti: scripts/data/citta-prearricchimento.jsonl, scratch/citta-prearricchimento.md');
