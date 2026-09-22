// DRIVER DA FILE PER LE CITTA' (22/09/2026, committente: «lingue 4 e gemme 100») — gira sul droplet 104, senza accesso
// al database, come driver-arricchimento-file.mjs (20/09) da cui deriva. Legge la lista di scratch/esporta-lista-citta.mjs
// (una riga per pin × lingua, campo `lang`, `fase` 0 = lingua principale della citta', 1-3 = le altre) e fa lavorare IL
// SERVER DI PRODUZIONE (/api/poi/enrich e, con --audio, /api/poi/audioguide) col segreto di infrastruttura, nella lingua
// della riga. Le righe delle altre lingue di un pin uscito «senza fonte» nella lingua principale si SALTANO: la fonte non
// dipende dalla lingua, e si risparmiano tre ricerche a vuoto. Ripartibile: la posizione sta in <lista>.stato.json.
//   node driver-citta.mjs --lista=/root/citta/lista-citta.jsonl [--lavoratori=5] [--pausa=1500] [--audio]
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
let stato = { pos: 0, ok: 0, conFoto: 0, audio: 0, errori: 0, esiti: {}, senzaFonte: {} };
try { stato = { ...stato, ...JSON.parse(fs.readFileSync(STATO, 'utf8')) }; } catch {}
const salva = () => fs.writeFileSync(STATO, JSON.stringify(stato));
const pausa = (ms) => new Promise(r => setTimeout(r, ms));
async function post(p, body, ms = 200000) {
  for (let t = 0; t < 3; t++) {
    try {
      const r = await fetch(`${B}${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-script-secret': SEG }, body: JSON.stringify(body), signal: AbortSignal.timeout(ms) });
      const x = await r.text(); let d = {}; try { d = JSON.parse(x); } catch { d = { raw: x.slice(0, 80) }; }
      if (r.status === 429 || r.status === 503) { await pausa(20000 * (t + 1)); continue; }
      return { s: r.status, d };
    } catch (e) { if (t === 2) return { s: 0, d: { error: e.message } }; await pausa(5000); }
  }
  return { s: 429, d: {} };
}
async function una(p) {
  const lang = String(p.lang || 'it').toLowerCase().slice(0, 2);
  // Altre lingue di un pin senza fonte: si salta (la fonte non cambia con la lingua).
  if (Number(p.fase) > 0 && stato.senzaFonte[p.id]) { stato.esiti.saltato = (stato.esiti.saltato || 0) + 1; return 'saltato'; }
  const e = await post('/api/poi/enrich', { id: p.id, name: p.name, lat: p.lat, lon: p.lon, category: p.category, subCategory: p.poi_type, wikidata: p.wikidata || undefined, wikipedia: p.wikipedia_url || undefined, lang, mode: 'full' });
  let esito = 'errore';
  if (e.s === 200) {
    const lunga = String(e.d?.description_long || ''), breve = String(e.d?.description_short || e.d?.extract || '');
    esito = lunga.length >= 300 ? 'testo' : breve.length >= 30 ? 'breve' : e.d?.solo_dati ? 'solo_dati' : 'senza_fonte';
    if (esito === 'senza_fonte' && Number(p.fase) === 0) stato.senzaFonte[p.id] = true;
    if (e.d?.thumbnail) stato.conFoto++;
    if (AUDIO && lunga.length >= 600) { const a = await post('/api/poi/audioguide', { poiId: p.id, lang, character: 'nicky' }); if (a.s === 200 && a.d?.text) stato.audio++; }
  } else stato.errori++;
  stato.esiti[esito] = (stato.esiti[esito] || 0) + 1;
  return esito;
}
console.log(`${new Date().toISOString()} lista ${LISTA}: ${righe.length} righe (pin × lingua), riparto da ${stato.pos} — lavoratori ${LAV}, pausa ${PAUSA} ms${AUDIO ? ', con audioguida' : ''}`);
let male = 0;
while (stato.pos < righe.length) {
  const lotto = righe.slice(stato.pos, stato.pos + LAV * 4).map(x => JSON.parse(x));
  const coda = [...lotto];
  await Promise.all(Array.from({ length: LAV }, async () => {
    while (coda.length) {
      const p = coda.shift(); const esito = await una(p);
      male = esito === 'errore' ? male + 1 : 0;
      if (male >= 8) { console.log(`${new Date().toISOString()} troppi errori di fila: pausa di 5 minuti`); await pausa(300000); male = 0; }
      if (esito !== 'saltato') await pausa(PAUSA);
    }
  }));
  stato.pos += lotto.length; salva();
  if (stato.pos % 40 < LAV * 4) console.log(`${new Date().toISOString()} ${stato.pos}/${righe.length} — ${JSON.stringify(stato.esiti)} foto ${stato.conFoto} audio ${stato.audio} errori ${stato.errori}`);
}
console.log(`${new Date().toISOString()} lista finita: ${JSON.stringify({ ...stato, senzaFonte: Object.keys(stato.senzaFonte).length })}`);
