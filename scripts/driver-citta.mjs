// DRIVER DA FILE PER TUTTI I PIN CULTURALI (22/09/2026, committente: «tutti i POI culturali iniziando dalle gemme»,
// «1 lingua e tradurre tutte le altre da quella», «fallo per tutte le 7 lingue») — gira sul droplet 104, senza accesso
// al database, come driver-arricchimento-file.mjs (20/09) da cui deriva. Legge la lista di scripts/lista-tutti-culturali.mjs
// (UNA riga per pin: `lang` = lingua in cui generare o gia' scritta, `altre` = le lingue da tradurre) e fa lavorare
// IL SERVER DI PRODUZIONE col segreto di infrastruttura:
//   1. /api/poi/enrich nella lingua `lang` — SEMPRE, anche per i pin che avevano gia' un testo (23/09/2026,
//      committente: «le audioguide anche a chi ha gia' testo e chi ha gia' testo deve essere arricchito con
//      foto e descrizione dettagliata e audioguida»): `solo_traduci` non salta piu' la generazione, dice solo
//      in che lingua era scritto il testo di partenza. Porta la foto se manca e prova una descrizione piu' completa.
//   2. se il pin ha un testo, /api/poi/traduci per le lingue `altre` (una chiamata, tutte le lingue);
//   3. con --audio, /api/poi/audioguide nella lingua `lang` per OGNI pin con un testo, non solo sopra una soglia
//      di caratteri (committente: «se ci sono meno caratteri, audioguida di almeno 30 secondi») — la lunghezza
//      minima (30-40 s) la applica gia' REGOLA_SPECIFICITA lato server usando solo i fatti disponibili, mai
//      riempitivo: con poco materiale la guida sara' onestamente piu' corta, non finta.
// Ripartibile: la posizione sta in <lista>.stato.json.
//   node driver-citta.mjs --lista=/root/citta/lista-tutti-culturali.jsonl [--lavoratori=5] [--pausa=1500] [--audio]
import fs from 'fs';
const A = process.argv.slice(2);
const arg = (k, d) => { const x = A.find(a => a.startsWith(`--${k}=`)); return x ? x.slice(k.length + 3) : d; };
const LISTA = arg('lista', ''), LAV = Number(arg('lavoratori', 5)), PAUSA = Number(arg('pausa', 1500)), AUDIO = A.includes('--audio');
const STATO = `${LISTA}.stato.json`;
const ENVF = process.env.ENVF || '/root/citta/.env';
const SEG = (fs.existsSync(ENVF) ? fs.readFileSync(ENVF, 'utf8') : '').match(/^SCRIPT_SHARED_SECRET=(.*)$/m)?.[1]?.trim();
const B = process.env.WIP_BASE || 'https://www.wip.guide';
if (!LISTA || !SEG) { console.log('mancano --lista o SCRIPT_SHARED_SECRET in /root/citta/.env'); process.exit(1); }
const righe = fs.readFileSync(LISTA, 'utf8').split('\n').filter(Boolean);
let stato = { pos: 0, ok: 0, conFoto: 0, audio: 0, tradotte: 0, errori: 0, esiti: {} };
try { stato = { ...stato, ...JSON.parse(fs.readFileSync(STATO, 'utf8')) }; } catch {}
const salva = () => fs.writeFileSync(STATO, JSON.stringify(stato));
const pausa = (ms) => new Promise(r => setTimeout(r, ms));
async function post(p, body, ms = 200000) {
  for (let t = 0; t < 3; t++) {
    try {
      const r = await fetch(`${B}${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-script-secret': SEG }, body: JSON.stringify(body), signal: AbortSignal.timeout(ms) });
      const x = await r.text(); let d = {}; try { d = JSON.parse(x); } catch { d = { raw: x.slice(0, 80) }; }
      if (r.status === 429 || r.status === 503) { await pausa(15000 * (t + 1)); continue; }
      return { s: r.status, d };
    } catch (e) { if (t === 2) return { s: 0, d: { error: e.message } }; await pausa(5000); }
  }
  return { s: 429, d: {} };
}
async function una(p) {
  const lang = String(p.lang || 'it').toLowerCase().slice(0, 2);
  const altre = (p.altre || []).filter((l) => l !== lang);
  let esito = 'errore', haTesto = false;
  const e = await post('/api/poi/enrich', { id: p.id, name: p.name, lat: p.lat, lon: p.lon, category: p.category, subCategory: p.poi_type, wikidata: p.wikidata || undefined, wikipedia: p.wikipedia_url || undefined, lang, mode: 'full' });
  if (e.s === 200) {
    const lunga = String(e.d?.description_long || ''), breve = String(e.d?.description_short || e.d?.extract || '');
    esito = lunga.length >= 300 ? 'testo' : breve.length >= 30 ? 'breve' : e.d?.solo_dati ? 'solo_dati' : 'senza_fonte';
    haTesto = esito === 'testo' || esito === 'breve';
    if (e.d?.thumbnail) stato.conFoto++;
  } else { stato.errori++; stato.esiti.errore = (stato.esiti.errore || 0) + 1; return 'errore'; }
  // Audioguida e traduzioni IN PARALLELO (23/09/2026): dipendono entrambe dal testo appena scritto, non l'una
  // dall'altra — messe in sequenza, con Gonka per primo (1-2 min a chiamata), un pin arrivava a 4-6 minuti.
  // Nessuna soglia di caratteri per l'audio: si tenta per ogni pin con un testo, corto o lungo che sia.
  const chiamate = [];
  if (AUDIO && haTesto) chiamate.push(post('/api/poi/audioguide', { poiId: p.id, lang, character: 'nicky' }).then((a) => { if (a.s === 200 && a.d?.text) stato.audio++; }));
  if (haTesto && altre.length) chiamate.push(post('/api/poi/traduci', { id: p.id, lingue: altre }, 290000).then((t) => { if (t.s === 200) stato.tradotte += (t.d?.fatte || []).length; else stato.errori++; }));
  if (chiamate.length) await Promise.all(chiamate);
  stato.esiti[esito] = (stato.esiti[esito] || 0) + 1;
  return esito;
}
console.log(`${new Date().toISOString()} lista ${LISTA}: ${righe.length} pin, riparto da ${stato.pos} — lavoratori ${LAV}, pausa ${PAUSA} ms${AUDIO ? ', con audioguida' : ''}`);
let male = 0;
while (stato.pos < righe.length) {
  const lotto = righe.slice(stato.pos, stato.pos + LAV * 4).map(x => JSON.parse(x));
  const coda = [...lotto];
  await Promise.all(Array.from({ length: LAV }, async () => {
    while (coda.length) {
      const p = coda.shift(); const esito = await una(p);
      male = esito === 'errore' ? male + 1 : 0;
      // «Non fermarti mai» (committente 22/09/2026 sera): dopo 8 errori di fila solo un respiro di 45 s, poi avanti.
      if (male >= 8) { console.log(`${new Date().toISOString()} troppi errori di fila: pausa di 45 secondi`); await pausa(45000); male = 0; }
      await pausa(PAUSA);
    }
  }));
  stato.pos += lotto.length; salva();
  if (stato.pos % 40 < LAV * 4) console.log(`${new Date().toISOString()} ${stato.pos}/${righe.length} — ${JSON.stringify(stato.esiti)} foto ${stato.conFoto} audio ${stato.audio} tradotte ${stato.tradotte} errori ${stato.errori}`);
}
console.log(`${new Date().toISOString()} lista finita: ${JSON.stringify(stato)}`);
