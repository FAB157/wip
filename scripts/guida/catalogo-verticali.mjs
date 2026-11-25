// Estrae dal catalogo curato dell'app (src/data/tematici/*.json) numeri e luoghi reali degli otto verticali.
// SOLA LETTURA di file locali: nessuna rete, nessun database.  Scrive public/guida/verticali.json.
//   node scripts/guida/catalogo-verticali.mjs
import fs from 'fs';
import path from 'path';

const DIR = path.join('src', 'data', 'tematici');
const OUT = path.join('public', 'guida', 'verticali.json');
const CHIAVI = ['terme', 'cinema', 'cieli', 'street_art', 'mercati', 'fioriture', 'memoria', 'lento'];
const PAESI = new Intl.DisplayNames(['it'], { type: 'region' });
const nomePaese = c => { try { return c ? PAESI.of(String(c).toUpperCase()) : null; } catch { return c; } };
// solo nomi leggibili in italiano/latino
const latino = s => !!s && !/[^\u0000-ɏ‐-―‘-‟\s]/.test(String(s));

const out = { generato: new Date().toISOString(), fonte: 'Catalogo curato dell\'app (src/data/tematici): non è il conteggio dei pin sulla mappa.', verticali: {} };
for (const k of CHIAVI) {
  const f = path.join(DIR, `${k}.json`);
  if (!fs.existsSync(f)) { console.log(k, 'file mancante'); continue; }
  let dati = JSON.parse(fs.readFileSync(f, 'utf8'));
  if (!Array.isArray(dati)) dati = dati.items || dati.voci || dati.luoghi || Object.values(dati).find(Array.isArray) || [];
  const tipi = {}, paesi = {};
  for (const r of dati) {
    tipi[r.type] = (tipi[r.type] || 0) + 1;
    if (r.country) paesi[r.country] = (paesi[r.country] || 0) + 1;
  }
  const buoni = dati.filter(r => r.name && latino(r.name) && r.highlights && String(r.highlights).length > 30);
  buoni.sort((a, b) => (b.fame || 0) - (a.fame || 0) || String(a.name).localeCompare(String(b.name)));
  // al massimo 3 esempi per paese per avere varietà, 30 in tutto
  const perPaese = {}; const esempi = [];
  for (const r of buoni) {
    perPaese[r.country] = (perPaese[r.country] || 0) + 1;
    if (perPaese[r.country] > 3) continue;
    esempi.push({ nome: r.name, tipo: r.type, citta: r.city || null, paese: nomePaese(r.country), codicePaese: r.country || null, regione: r.region || null, fama: r.fame || null, quando: r.best_time || null, sintesi: String(r.highlights).slice(0, 260), sito: r.url || null, extra: r.extra && Object.keys(r.extra).length ? r.extra : null });
    if (esempi.length >= 30) break;
  }
  const conExtra = dati.filter(r => r.extra && Object.keys(r.extra).length).length;
  const conQuando = dati.filter(r => r.best_time).length;
  out.verticali[k] = {
    totale: dati.length,
    tipi: Object.entries(tipi).sort((a, b) => b[1] - a[1]).map(([tipo, n]) => ({ tipo, n })),
    paesi: Object.entries(paesi).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([c, n]) => ({ codice: c, paese: nomePaese(c), n })),
    nPaesi: Object.keys(paesi).length,
    conDatiExtra: conExtra, conPeriodoMigliore: conQuando,
    esempi,
  };
  console.log(k.padEnd(11), dati.length, '· tipi', Object.keys(tipi).length, '· paesi', Object.keys(paesi).length, '· esempi', esempi.length, '· extra', conExtra);
}
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log('Scritto', OUT);
