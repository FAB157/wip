// AUDIT DELLE SCHEDE VECCHIE E SCARSE (01/10/2026, caso Terme Redi: «questo abbinamento aiuta
// tutti gli script... ma non tocca i testi gia' salvati: restano sbagliati finche' non passano
// dall'audit»). La pipeline di oggi (materialeWebPerPoi, REGOLA_SPECIFICITA, nomeCombacia coi
// sinonimi terme/stabilimento/spa) vale solo per i POI NUOVI o mai arricchiti: /api/poi/enrich e
// /api/poi/audioguide rispondono dalla cache appena c'e' un testo >= 60 caratteri, qualunque sia
// la qualita' di quel testo. Questo script TROVA le schede scarse e le rigenera con `force:true`
// (background-script, pool a rotazione, mai le chiavi dedicate agli utenti in attesa).
//
// Cosa conta come "scarsa":
//  - description_short/long/ai tutte sotto SOGLIA_TESTO caratteri (quasi vuota);
//  - oppure un'etichetta di import mai riscritta ("[Wikipedia Import] ...", vedi incidente
//    dei 117k POI del 21/09);
//  - oppure (con --anche-audio) un'audioguida IT esistente ma sotto SOGLIA_AUDIO caratteri.
//
// Uso:
//   node scripts/audit-schede-vecchie.mjs --lat=43.88 --lon=10.77 --km=10 [--limite=200]
//     [--lingua=it] [--anche-audio] [--base=https://www.wip.guide] [--prova]
//
// --prova: elenca cosa farebbe, senza chiamare la rotta (nessuna scrittura, nessun costo).
// Senza --prova chiama /api/poi/enrich e (con --anche-audio) /api/poi/audioguide con force:true,
// per i personaggi nicky e dante, nella lingua indicata.
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = {};
for (const f of ['.env', '.env.local']) { if (!fs.existsSync(f)) continue; for (const r of fs.readFileSync(f, 'utf8').split(/\r?\n/)) { const m = r.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, ''); } }
const args = process.argv.slice(2);
const opt = (n, d) => { const a = args.find((x) => x.startsWith(`--${n}=`)); return a ? a.split('=').slice(1).join('=') : d; };
const lat = Number(opt('lat', '')), lon = Number(opt('lon', '')), km = Number(opt('km', 10));
const limite = Number(opt('limite', 200));
const lingua = opt('lingua', 'it');
const ancheAudio = args.includes('--anche-audio');
const base = opt('base', 'https://www.wip.guide');
const prova = args.includes('--prova');
if (!Number.isFinite(lat) || !Number.isFinite(lon)) { console.error('uso: node scripts/audit-schede-vecchie.mjs --lat=<lat> --lon=<lon> [--km=10] [--limite=200] [--lingua=it] [--anche-audio] [--prova]'); process.exit(1); }
if (!env.SCRIPT_SHARED_SECRET && !prova) { console.error('manca SCRIPT_SHARED_SECRET nel .env/.env.local'); process.exit(1); }

const sb = createClient(env.VITE_SUPABASE_URL || env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const SOGLIA_TESTO = 60;   // stessa soglia di "scheda gia' fatta" usata da /api/poi/enrich
const SOGLIA_AUDIO = 150;  // un'audioguida sotto questo e' quasi certamente la versione "breve" di un vecchio arricchimento scarso
const ETICHETTA_IMPORT = /^\s*\[Wikipedia Import\]/i;

const d = km / 111, dl = km / (111 * Math.max(0.15, Math.cos(lat * Math.PI / 180)));
const { data, error } = await sb.from('shared_pois')
  .select('id, name, category, poi_type, lat, lon, description_short, description_long, description_ai, is_hidden, status')
  .gte('lat', lat - d).lte('lat', lat + d).gte('lon', lon - dl).lte('lon', lon + dl)
  .not('is_hidden', 'is', true)
  .limit(3000);
if (error) { console.error('lettura fallita:', error.message); process.exit(1); }

const lungo = (t) => String(t || '').replace(/\s+/g, ' ').trim();
const salta = /^(iti-|ai_|vision-|viator-|tq-|gyg-|tm-|tiqets-|ocm-)/;
const commerciale = /^(beach|restaurant|bar|cafe|pub|fast_food|ice_cream|food|hotel|hostel|guest_house|lodging|accommodation|lusso|locali|enogastronomia|shop|shopping|supermarket|ev_charging|fuel|parking|utilita|servizi|pharmacy|bank|atm|spa|wellness|nightclub|casino|gym|camp_site|campsite|marina)$/i;

const scarsa = (r) => {
  const breve = lungo(r.description_short), estesa = lungo(r.description_long), ai = lungo(r.description_ai);
  if (ETICHETTA_IMPORT.test(breve) || ETICHETTA_IMPORT.test(estesa) || ETICHETTA_IMPORT.test(ai)) return 'etichetta_import';
  const piuLunga = [breve, estesa, ai].sort((a, b) => b.length - a.length)[0];
  if (piuLunga.length < SOGLIA_TESTO) return 'testo_scarso';
  return null;
};

const daFare = (data || [])
  .filter((r) => r.name && !salta.test(String(r.id)) && !commerciale.test(String(r.category || '')) && !commerciale.test(String(r.poi_type || '')))
  .map((r) => ({ ...r, motivo: scarsa(r) }))
  .filter((r) => r.motivo)
  .slice(0, limite);

console.log(`zona ${lat},${lon} ±${km} km: ${data.length} POI, ${daFare.length} con scheda scarsa (limite ${limite})${prova ? ' — PROVA, nessuna chiamata' : ''}`);
if (prova) {
  for (const r of daFare) console.log(`  ${r.id} | ${r.name} | ${r.category} | ${r.motivo}`);
  process.exit(0);
}

const REGISTRO = `scratch/audit-schede-rifatte-${new Date().toISOString().slice(0, 10)}.jsonl`;
let rifatte = 0, errori = 0;
for (const [i, r] of daFare.entries()) {
  try {
    const e = await fetch(`${base}/api/poi/enrich`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-script-secret': env.SCRIPT_SHARED_SECRET },
      // Stessi ordini di audit-schede-globale.mjs: un'etichetta di import si sostituisce e si scarta, un testo
      // scarso si sostituisce solo con un testo vero (vedi «RIPASSO» in /api/poi/enrich).
      body: JSON.stringify({ id: r.id, name: r.name, lat: r.lat, lon: r.lon, category: r.category, subCategory: r.poi_type, lang: lingua, mode: 'full', force: true, motivo: r.motivo, sostituisci: true, ...(r.motivo === 'etichetta_import' ? { scartaVecchio: true } : {}) }),
      signal: AbortSignal.timeout(240000),
    });
    const ej = await e.json().catch(() => ({}));
    let audioOk = null;
    if (ancheAudio && e.ok) {
      const esiti = await Promise.all(['nicky', 'dante'].map((personaggio) =>
        fetch(`${base}/api/poi/audioguide`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-script-secret': env.SCRIPT_SHARED_SECRET },
          body: JSON.stringify({ poiId: r.id, lang: lingua, character: personaggio, force: true }),
          signal: AbortSignal.timeout(60000),
        }).then((res) => res.ok).catch(() => false),
      ));
      audioOk = esiti.every(Boolean);
    }
    const riga = { id: r.id, name: r.name, motivo: r.motivo, enrich_status: e.status, descrizione_nuova: lungo(ej.description_long || ej.description_short).slice(0, 80), audio: audioOk, quando: new Date().toISOString() };
    fs.appendFileSync(REGISTRO, JSON.stringify(riga) + '\n');
    if (e.ok) rifatte++; else errori++;
    console.log(`${String(i + 1).padStart(4)}/${daFare.length} ${e.status} ${String(r.name).slice(0, 40).padEnd(40)} ${r.motivo}${ancheAudio ? ` audio:${audioOk ? 'si' : 'no'}` : ''}`);
  } catch (err) {
    errori++;
    console.log(`${String(i + 1).padStart(4)}/${daFare.length} ERRORE ${r.name}: ${err.message}`);
  }
  await new Promise((ok) => setTimeout(ok, 2000)); // gentile con la rotta di produzione
}
console.log(`\nFINITO: ${rifatte} rigenerate, ${errori} errori. Registro: ${REGISTRO}`);
