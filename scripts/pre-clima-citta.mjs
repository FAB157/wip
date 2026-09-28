// PRE-CARICAMENTO DEL CLIMA DELLE CITTÀ (23/09/2026, committente: «deve essere
// su tutto il mondo — inizia da Italia, Europa, USA e resto del mondo»).
//
// Per ogni città della lista GeoNames (scratch/lista-citta.jsonl, una riga per
// POI: si tengono le città distinte) chiama in PRODUZIONE:
//   GET /api/meteo/clima        → statistiche NASA POWER + analisi breve
//   GET /api/meteo/clima/report → report completo (web + AI)
// con il segreto di infrastruttura (`x-script-secret`): il server lo tratta
// come background-script, cioè chiavi del pool, mai quelle dedicate a chi
// aspetta in diretta. Tutto finisce in api_cache, quindi poi lo leggono tutti,
// ospiti compresi. Ordine: Italia → Europa → USA → resto del mondo.
// Riprendibile (file .stato). Non parte mai da solo.
//
//   node scripts/pre-clima-citta.mjs [--lista=scratch/lista-citta.jsonl] [--lingue=it,en]
//        [--lavoratori=2] [--pausa=2000] [--prova=5] [--base=https://www.wip.guide]
import fs from 'node:fs';
import readline from 'node:readline';

const A = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [a, true]; }));
const LISTA = A.lista || 'scratch/lista-citta.jsonl';
const LINGUE = String(A.lingue || 'it,en').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
// Un lavoratore e pausa lunga: il report fa ricerca web sul SearXNG di
// produzione (droplet 201, indispensabile), che non va martellato.
const LAVORATORI = Math.max(1, Number(A.lavoratori) || 1);
const PAUSA = Number(A.pausa) || 10000;
const BASE = A.base || 'https://www.wip.guide';
const PROVA = Number(A.prova) || 0;
const STATO = `${LISTA}.clima.stato.json`;
const log = (m) => console.log(`[${new Date().toISOString()}] ${m}`);
const dormi = (ms) => new Promise((r) => setTimeout(r, ms));

// Il segreto: dall'ambiente, oppure da .env / .env.local / .sb_env.
let SEGRETO = process.env.SCRIPT_SHARED_SECRET || '';
for (const f of ['.env', '.env.local', '.sb_env', '/root/citta/.env']) {
  if (SEGRETO || !fs.existsSync(f)) continue;
  const m = fs.readFileSync(f, 'utf8').match(/^\s*(?:export\s+)?SCRIPT_SHARED_SECRET\s*=\s*["']?([^"'\r\n]+)/m);
  if (m) SEGRETO = m[1].trim();
}
if (!SEGRETO) { console.error('manca SCRIPT_SHARED_SECRET'); process.exit(2); }

const EUROPA = new Set('AD AL AT BA BE BG BY CH CY CZ DE DK EE ES FI FO FR GB GG GI GR HR HU IE IM IS IT JE LI LT LU LV MC MD ME MK MT NL NO PL PT RO RS RU SE SI SK SM UA VA XK'.split(' '));
const fascia = (iso) => (iso === 'IT' ? 0 : EUROPA.has(iso) ? 1 : iso === 'US' ? 2 : 3);

// Le città distinte, con un punto rappresentativo (media dei POI: più stabile del primo).
async function citta() {
  const per = new Map();
  const rl = readline.createInterface({ input: fs.createReadStream(LISTA) });
  for await (const riga of rl) {
    if (!riga) continue;
    let p; try { p = JSON.parse(riga); } catch { continue; }
    const nome = String(p.citta || '').trim(), iso = String(p.iso || '').toUpperCase();
    if (!nome || !Number.isFinite(p.lat) || !Number.isFinite(p.lon)) continue;
    const k = `${iso}|${nome}`;
    const c = per.get(k) || { nome, iso, lat: 0, lon: 0, n: 0 };
    c.lat += p.lat; c.lon += p.lon; c.n++;
    per.set(k, c);
  }
  return [...per.values()].map((c) => ({ nome: c.nome, iso: c.iso, lat: c.lat / c.n, lon: c.lon / c.n, poi: c.n, fascia: fascia(c.iso) }))
    .sort((a, b) => a.fascia - b.fascia || b.poi - a.poi);
}

async function chiama(percorso, tentativi = 3) {
  for (let t = 1; t <= tentativi; t++) {
    try {
      const r = await fetch(`${BASE}${percorso}`, { headers: { 'x-script-secret': SEGRETO }, signal: AbortSignal.timeout(120000) });
      if (r.status === 429) { await dormi(60000); continue; }
      const j = await r.json().catch(() => ({}));
      return { stato: r.status, ok: r.ok && j?.ok !== false, fonte: j?.fonte, analisi: !!j?.analisi };
    } catch (e) { if (t === tentativi) return { stato: 0, ok: false, errore: e.message }; await dormi(5000); }
  }
  return { stato: 0, ok: false };
}

const tutte = await citta();
const stato = fs.existsSync(STATO) ? JSON.parse(fs.readFileSync(STATO, 'utf8')) : { fatte: {} };
const daFare = (PROVA ? tutte.slice(0, PROVA) : tutte).filter((c) => !stato.fatte[`${c.iso}|${c.nome}`]);
log(`città distinte ${tutte.length} (IT ${tutte.filter((c) => c.fascia === 0).length}, Europa ${tutte.filter((c) => c.fascia === 1).length}, USA ${tutte.filter((c) => c.fascia === 2).length}, resto ${tutte.filter((c) => c.fascia === 3).length}) · da fare ${daFare.length} · lingue ${LINGUE.join(',')} · ${LAVORATORI} lavoratori`);

let i = 0, ok = 0, ko = 0;
const salva = () => fs.writeFileSync(STATO, JSON.stringify(stato));
async function lavoratore() {
  for (;;) {
    const c = daFare[i++];
    if (!c) return;
    const esiti = [];
    for (const lang of LINGUE) {
      const q = `lat=${c.lat.toFixed(3)}&lon=${c.lon.toFixed(3)}&lang=${lang}`;
      const a = await chiama(`/api/meteo/clima?${q}`);
      const b = a.ok ? await chiama(`/api/meteo/clima/report?${q}`) : { ok: false, stato: a.stato };
      esiti.push(`${lang}:${a.ok ? (a.analisi ? 'stat+analisi' : 'stat') : 'KO' + a.stato}/${b.ok ? 'report' + (b.fonte === 'cache' ? '(cache)' : '') : 'KO' + b.stato}`);
      if (!(a.ok && b.ok)) ko++; else ok++;
      await dormi(PAUSA);
    }
    // «Fatta» solo se TUTTO è riuscito: una città con il report fallito
    // (503 per quota, rete…) resta da fare e si riprende al giro dopo.
    const riuscita = !esiti.some((e) => e.includes('KO'));
    if (riuscita) stato.fatte[`${c.iso}|${c.nome}`] = { quando: Date.now(), esiti };
    else stato.fallite = { ...(stato.fallite || {}), [`${c.iso}|${c.nome}`]: { quando: Date.now(), esiti } };
    salva();
    log(`${String(i).padStart(4)}/${daFare.length} ${c.iso} ${c.nome} (${c.poi} POI) → ${esiti.join(' · ')}${riuscita ? '' : '  [da rifare]'}`);
  }
}
await Promise.all(Array.from({ length: LAVORATORI }, lavoratore));
log(`FATTO: ${ok} riusciti, ${ko} falliti`);
