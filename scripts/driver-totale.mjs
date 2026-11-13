#!/usr/bin/env node
// DRIVER DELL'ARRICCHIMENTO TOTALE (26/09/2026) — gira sul droplet 104, senza accesso al database: fa lavorare il
// SERVER (col segreto di infrastruttura, come `background-script`: pool a rotazione, mai le chiavi dedicate agli
// utenti) su una lista di scripts/lista-arricchimento-totale.mjs. Due corsie:
//   --corsia=completa  /api/poi/enrich in modo `full`: foto, descrizione breve, descrizione dettagliata e info, dalle
//                      sole fonti (il modello scrive SOLO dal materiale, e non viene chiamato se non c'è materiale).
//                      UNA lingua (`lang` della riga), nessuna traduzione, nessuna audioguida.
//   --corsia=veloce    /api/poi/enrich in modo `fast`/`short`, SENZA modello: foto, fatti di Wikidata, incipit di
//                      Wikipedia, riga dei dati; per i luoghi senza fonte e per la schedina del gruppo 6.
// A differenza di driver-citta.mjs e driver-arricchimento-file.mjs NON carica la lista in memoria (le liste hanno
// milioni di righe e il droplet ha poca RAM libera): la legge a righe e tiene solo il lotto in corso.
// Ripartibile: la posizione sta in <lista>.stato.json. Si governa a caldo, senza riavviare:
//   · file <lista>.lavoratori  con un numero → cambia i lavoratori al lotto successivo;
//   · file <lista>.pausa       con un numero (ms) → cambia la pausa fra un luogo e l'altro;
//   · file <lista>.stop        → si ferma pulito al lotto successivo (cancellarlo e riavviare per riprendere).
// I luoghi in errore vanno in <lista>.ripasso.jsonl (stessa forma della lista: si rilancia con --lista=…ripasso.jsonl).
//   node driver-totale.mjs --lista=/root/totale/completa.jsonl --corsia=completa [--lavoratori=6] [--pausa=1500]
import fs from 'node:fs';
import readline from 'node:readline';
const A = process.argv.slice(2);
const arg = (k, d) => { const x = A.find((a) => a.startsWith(`--${k}=`)); return x ? x.slice(k.length + 3) : d; };
// --lista può essere UN file o più file separati da virgola, lavorati in fila come un'unica lista (la posizione è la
// riga complessiva): per aggiungere altri gruppi basta riavviare con un file in più IN CODA, senza toccare i primi.
// Stato, ripasso, registro e file di governo prendono il nome dal PRIMO file.
const LISTE = arg('lista', '').split(',').map((s) => s.trim()).filter(Boolean), CORSIA = arg('corsia', 'completa');
const LISTA = LISTE[0] || '';
let LAV = Number(arg('lavoratori', 6)), PAUSA = Number(arg('pausa', 1500));
const STATO = `${LISTA}.stato.json`, RIPASSO = `${LISTA}.ripasso.jsonl`, FATTI = `${LISTA}.fatti.tsv`;
const ENVF = process.env.ENVF || '/root/citta/.env';
const SEG = (fs.existsSync(ENVF) ? fs.readFileSync(ENVF, 'utf8') : '').match(/^SCRIPT_SHARED_SECRET=(.*)$/m)?.[1]?.trim();
const B = process.env.WIP_BASE || 'https://www.wip.guide';
if (!LISTE.length || !SEG || !['completa', 'veloce'].includes(CORSIA)) { console.log('uso: --lista=<file> --corsia=completa|veloce, e SCRIPT_SHARED_SECRET in ENVF'); process.exit(1); }
let stato = { pos: 0, conFoto: 0, errori: 0, esiti: {}, inizio: new Date().toISOString() };
try { stato = { ...stato, ...JSON.parse(fs.readFileSync(STATO, 'utf8')) }; } catch { /* prima volta */ }
const salva = () => fs.writeFileSync(STATO, JSON.stringify(stato));
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
const numeroDaFile = (f, d) => { try { const n = Number(fs.readFileSync(f, 'utf8').trim()); return Number.isFinite(n) && n >= 0 ? n : d; } catch { return d; } };
const ripassa = (p, motivo) => { try { fs.appendFileSync(RIPASSO, JSON.stringify({ ...p, motivo }) + '\n'); stato.ripasso = (stato.ripasso || 0) + 1; } catch { /* best effort */ } };

async function post(body, ms = 200000, tentativi = 3) {
  for (let t = 0; t < tentativi; t++) {
    try {
      const r = await fetch(`${B}/api/poi/enrich`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-script-secret': SEG }, body: JSON.stringify(body), signal: AbortSignal.timeout(ms) });
      const x = await r.text(); let d = {}; try { d = JSON.parse(x); } catch { d = { raw: x.slice(0, 80) }; }
      if (r.status === 429 || r.status === 503) { await pausa(15000 * (t + 1)); continue; }
      return { s: r.status, d };
    } catch (e) { if (t === tentativi - 1) return { s: 0, d: { error: e.message } }; await pausa(5000); }
  }
  return { s: 429, d: {} };
}
async function una(p) {
  const corpo = CORSIA === 'completa'
    ? { id: p.id, name: p.name, lat: p.lat, lon: p.lon, category: p.category, subCategory: p.poi_type, wikidata: p.wikidata || undefined, wikipedia: p.wikipedia_url || undefined, lang: String(p.lang || 'it').toLowerCase().slice(0, 2), mode: 'full' }
    : { id: p.id, name: p.name, lat: p.lat, lon: p.lon, category: p.category, subCategory: p.poi_type, lang: 'it', fast: true, mode: 'short' };
  const e = await post(corpo);
  let esito;
  if (e.s === 200) {
    const lunga = String(e.d?.description_long || ''), breve = String(e.d?.description_short || e.d?.extract || '');
    esito = e.d?.cached ? 'gia_completo' : lunga.length >= 300 ? 'testo' : breve.length >= 30 && !e.d?.solo_dati ? 'breve' : e.d?.solo_dati ? 'solo_dati' : 'senza_fonte';
    if (e.d?.thumbnail) stato.conFoto++;
  } else if (e.s === 403) esito = 'generico'; // nome generico: la rotta lo rifiuta di proposito
  else { esito = 'errore'; stato.errori++; ripassa(p, `enrich ${e.s || e.d?.error || ''}`); }
  stato.esiti[esito] = (stato.esiti[esito] || 0) + 1;
  // Registro di ciò che è stato fatto (id, esito, ora): serve al controllo qualità a campione e a capire cosa è successo.
  try { fs.appendFileSync(FATTI, `${p.id}\t${esito}\t${p.category}\t${Date.now()}\n`); } catch { /* best effort */ }
  return esito;
}

console.log(`${new Date().toISOString()} corsia ${CORSIA} — ${LISTA} → ${B}: riparto dalla riga ${stato.pos}, lavoratori ${LAV}, pausa ${PAUSA} ms`);
async function* tutteLeRighe() {
  for (const f of LISTE) {
    if (!fs.existsSync(f)) { console.log(`${new Date().toISOString()} file della lista mancante: ${f}`); continue; }
    const r = readline.createInterface({ input: fs.createReadStream(f), crlfDelay: Infinity });
    for await (const riga of r) yield riga;
  }
}
let indice = 0, lotto = [], male = 0, ultimoLog = 0;
async function lavoraLotto() {
  if (fs.existsSync(`${LISTA}.stop`)) { console.log(`${new Date().toISOString()} file .stop presente: mi fermo alla riga ${stato.pos}`); salva(); process.exit(0); }
  LAV = Math.max(1, numeroDaFile(`${LISTA}.lavoratori`, LAV)); PAUSA = numeroDaFile(`${LISTA}.pausa`, PAUSA);
  const coda = [...lotto];
  await Promise.all(Array.from({ length: LAV }, async () => {
    while (coda.length) {
      const p = coda.shift(); const esito = await una(p);
      male = esito === 'errore' ? male + 1 : 0;
      // «Non fermarti mai»: dopo 8 errori di fila solo un respiro di 45 s, poi avanti.
      if (male >= 8) { console.log(`${new Date().toISOString()} troppi errori di fila: pausa di 45 secondi`); await pausa(45000); male = 0; }
      await pausa(PAUSA);
    }
  }));
  stato.pos += lotto.length; lotto = []; salva();
  if (stato.pos - ultimoLog >= 200) { ultimoLog = stato.pos; console.log(`${new Date().toISOString()} ${stato.pos} — ${JSON.stringify(stato.esiti)} foto ${stato.conFoto} errori ${stato.errori} ripasso ${stato.ripasso || 0} (lavoratori ${LAV}, pausa ${PAUSA})`); }
}
for await (const riga of tutteLeRighe()) {
  if (indice++ < stato.pos) continue;
  if (!riga) continue;
  try { lotto.push(JSON.parse(riga)); } catch { stato.pos++; continue; }
  if (lotto.length >= LAV * 4) await lavoraLotto();
}
if (lotto.length) await lavoraLotto();
console.log(`${new Date().toISOString()} lista finita: ${JSON.stringify(stato)}`);
