// PRE-ARRICCHIMENTO DI UNA ZONA (21/09/2026, committente: «devono essere tutti piu' completi possibili»).
// Riempie in anticipo testo breve, testo dettagliato e foto dei pin visibili di una zona che ne sono ancora privi, cosi'
// l'utente li trova gia' pronti. Chiama la stessa rotta dell'app (/api/poi/enrich) col segreto di servizio: la richiesta
// vale come `background-script`, quindi usa il POOL a rotazione (Groq 4 chiavi, Gonka 'poi') e MAI le chiavi dedicate
// agli utenti in attesa ne' DeepSeek diretto. Le regole restano quelle della rotta: nessun testo inventato, riga dei dati
// per i commerciali, foto solo se ritrae il luogo.
//
//   node scripts/prearricchisci-zona.mjs <lat> <lon> [km=3] [--limite=200] [--base=https://www.wip.guide] [--prova]
//   --prova: elenca cosa farebbe, senza chiamare la rotta.
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = {};
for (const f of ['.env', '.env.local']) { if (!fs.existsSync(f)) continue; for (const r of fs.readFileSync(f, 'utf8').split(/\r?\n/)) { const m = r.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, ''); } }
const args = process.argv.slice(2);
const [lat, lon, km = 3] = args.filter((a) => !a.startsWith('--')).map(Number);
const opt = (n, d) => { const a = args.find((x) => x.startsWith(`--${n}=`)); return a ? a.split('=').slice(1).join('=') : d; };
const limite = Number(opt('limite', 200));
const base = opt('base', 'https://www.wip.guide');
const prova = args.includes('--prova');
if (!Number.isFinite(lat) || !Number.isFinite(lon)) { console.error('uso: node scripts/prearricchisci-zona.mjs <lat> <lon> [km] [--limite=N] [--base=URL] [--prova]'); process.exit(1); }
if (!env.SCRIPT_SHARED_SECRET && !prova) { console.error('manca SCRIPT_SHARED_SECRET nel .env/.env.local'); process.exit(1); }

const sb = createClient(env.VITE_SUPABASE_URL || env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const d = km / 111, dl = km / (111 * Math.max(0.15, Math.cos(lat * Math.PI / 180)));
// Mai ORDER BY su shared_pois (timeout, vedi memoria): riquadro chiuso sui due assi + limit.
const { data, error } = await sb.from('shared_pois')
  .select('id, name, category, poi_type, lat, lon, description_short, description_long, image_url, photo_url, status')
  .gte('lat', lat - d).lte('lat', lat + d).gte('lon', lon - dl).lte('lon', lon + dl)
  .not('is_hidden', 'is', true).limit(3000);
if (error) { console.error('lettura fallita:', error.message); process.exit(1); }
// PULIZIA SICURA PRIMA DI RIEMPIRE: una «foto» che non e' una foto (bandiera, stemma, cartina, logo, SVG, scansione di
// libro) e' sbagliata per definizione — nessun luogo e' ritratto da una bandiera. Si toglie, con REGISTRO dei valori
// precedenti (regola del repo: mai svuotare righe senza traccia), e il luogo entra fra quelli da riempire.
// Le foto con un nome file che non nomina il luogo NON si toccano qui: molte sono giuste («Carrara-Marmormuseum»).
const NON_FOTO = /\.svg|flag[ _]of|bandiera|stemma|coat[ _]of[ _]arms|wappen|blason|escudo|\blogo\b|locator|location[ _]map|\bmap\b|mappa|karte|(^|[^a-z0-9])page\d+-|djvu/i;
const nomeFile = (u) => { try { return decodeURIComponent(String(u || '').split('?')[0].split('/').pop() || ''); } catch { return String(u || ''); } };
const daPulire = (data || []).filter((r) => r.image_url && /wikimedia|wikipedia/i.test(r.image_url) && NON_FOTO.test(nomeFile(r.image_url)));
if (daPulire.length) {
  const registro = `scratch/registro-foto-non-foto-tolte-${new Date().toISOString().slice(0, 10)}.jsonl`;
  console.log(`foto che non sono foto (bandiere, cartine, stemmi, SVG…): ${daPulire.length}${prova ? ' — PROVA, non tolte' : ` — tolte, registro in ${registro}`}`);
  for (const r of daPulire.slice(0, prova ? 15 : 0)) console.log(`  ${r.name} | ${nomeFile(r.image_url).slice(0, 70)}`);
  if (!prova) {
    for (const r of daPulire) {
      fs.appendFileSync(registro, JSON.stringify({ id: r.id, name: r.name, image_url: r.image_url, photo_url: r.photo_url, quando: new Date().toISOString() }) + '\n');
      // Guardia: si toglie solo se la foto e' ancora quella letta (nessuno l'ha cambiata nel frattempo).
      const { error: e3 } = await sb.from('shared_pois').update({ image_url: null, photo_url: null }).eq('id', r.id).eq('image_url', r.image_url);
      if (e3) console.log(`  errore togliendo la foto di ${r.name}: ${e3.message}`);
      else { r.image_url = null; r.photo_url = null; }
    }
  }
}
const salta = /^(iti-|ai_|vision-|viator-|tq-|gyg-|tm-|tiqets-|ocm-)/;
const nonLuoghi = /metropolitana|stazione|station|ev_charging|parking|utilita|fuel|pharmacy|bank|atm|information/i;
const daFare = (data || []).filter((r) =>
  r.name && Number.isFinite(Number(r.lat)) && Number.isFinite(Number(r.lon)) && !Number.isNaN(Number(r.lat))
  && !salta.test(String(r.id)) && !nonLuoghi.test(`${r.category} ${r.poi_type || ''}`)
  && !/\b(car ?park|parking|parcheggio|supercharger|q-park)\b/i.test(String(r.name))
  && (!(String(r.description_short || r.description_long || '').trim().length > 20) || !(r.image_url || r.photo_url)),
).slice(0, limite);
console.log(`zona ${lat},${lon} ±${km} km: ${data.length} pin visibili, ${daFare.length} da completare (limite ${limite})${prova ? ' — PROVA, nessuna chiamata' : ''}`);
if (prova) { for (const r of daFare.slice(0, 30)) console.log(`  ${r.id} | ${r.name} | ${r.category} | testo:${r.description_short ? 'si' : 'no'} foto:${r.image_url || r.photo_url ? 'si' : 'no'}`); process.exit(0); }

let ok = 0, conTesto = 0, conFoto = 0, errori = 0;
for (const [i, r] of daFare.entries()) {
  try {
    const res = await fetch(`${base}/api/poi/enrich`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-script-secret': env.SCRIPT_SHARED_SECRET },
      body: JSON.stringify({ id: r.id, name: r.name, lat: r.lat, lon: r.lon, category: r.category, subCategory: r.poi_type, lang: 'it', mode: 'full' }),
      signal: AbortSignal.timeout(90000),
    });
    const j = await res.json().catch(() => ({}));
    if (res.ok) { ok++; if (j.description_short) conTesto++; if (j.thumbnail) conFoto++; }
    else errori++;
    console.log(`${String(i + 1).padStart(4)}/${daFare.length} ${res.status} ${String(r.name).slice(0, 40).padEnd(40)} testo:${j.description_short ? 'si' : 'no'} foto:${j.thumbnail ? 'si' : 'no'}${j.solo_dati ? ' (riga dati)' : ''}`);
  } catch (e) { errori++; console.log(`${String(i + 1).padStart(4)}/${daFare.length} ERRORE ${r.name}: ${e.message}`); }
  await new Promise((ok2) => setTimeout(ok2, 1500)); // gentile con Supabase, Wikimedia e il pool
}
console.log(`\nFINITO: ${ok} riusciti (${conTesto} con testo, ${conFoto} con foto), ${errori} errori.`);
