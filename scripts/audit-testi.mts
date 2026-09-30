// AUDIT DEI TESTI DEI POI — trova le schede inventate o riempitive.
//
// Per ogni POI con un testo, raccoglie le fonti verificate (Wikipedia/Wikidata
// agganciate per coordinate, vedi lib/wiki.ts) e controlla che ogni
// affermazione specifica del testo compaia nelle fonti (lib/ancoraggio.ts).
//
// SIMULAZIONE di default: scrive solo un CSV in scratch/out/. Con --apply marca
// i POI "non ancorati" con enrichment_source = 'da_rifare': la scheda smette di
// servirne il testo dalla cache (server.ts, STEP 0) e lo rigenera dalle fonti.
// Il testo vecchio NON viene toccato dallo script: lo sostituisce la
// rigenerazione, o lo azzera se le fonti non esistono.
//
// Uso (un processo alla volta sul droplet, vedi ecosystem.config.cjs):
//   npx tsx scripts/audit-testi.mts --limit=200
//   npx tsx scripts/audit-testi.mts --near=43.88,10.77,10      # zona nota
//   npx tsx scripts/audit-testi.mts --apply                    # marca
//   npx tsx scripts/audit-testi.mts --apply --clear-audio      # e azzera le audioguide in cache
//   --include-generico   marca anche i testi "generico" (senza specifiche ma vuoti)
//   --include-sourced    valuta anche i POI gia' marcati come scritti da fonti
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { collectPoiSources } from './lib/wiki';
import { valutaAncoraggio, type VerdettoTesto } from './lib/ancoraggio';

dotenv.config();
dotenv.config({ path: '.env.local' });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Servono VITE_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (.env / .env.local).');
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

const argv = process.argv.slice(2);
const getArg = (n: string, d: string) => argv.find(a => a.startsWith(`--${n}=`))?.split('=')[1] ?? d;
const APPLY = argv.includes('--apply');
const CLEAR_AUDIO = argv.includes('--clear-audio');
const INCLUDE_GENERICO = argv.includes('--include-generico');
const INCLUDE_SOURCED = argv.includes('--include-sourced');
const LIMIT = parseInt(getArg('limit', '0'), 10);
const DELAY_MS = parseInt(getArg('delay', '400'), 10);
const BATCH = 50;
const NEAR = (() => {
  const raw = getArg('near', '');
  if (!raw) return null;
  const [lat, lon, km] = raw.split(',').map(Number);
  return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon, km: Number.isFinite(km) && km > 0 ? km : 10 } : null;
})();

/** Schede gia' scritte da fonti verificate: si valutano solo con --include-sourced. */
const FONTI_AFFIDABILI = new Set(['agnes_wiki_sourced', 'wikidata_retro']);
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const cella = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""').replace(/\s+/g, ' ')}"`;

const OUT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'scratch', 'out');
fs.mkdirSync(OUT_DIR, { recursive: true });
const OUT_FILE = path.join(OUT_DIR, `audit-testi-${new Date().toISOString().slice(0, 10)}.csv`);
fs.writeFileSync(OUT_FILE, 'id,nome,citta,categoria,origine,verdetto,non_ancorate,frasi_vuote,fonte_trovata\n');

const PESO: Record<VerdettoTesto, number> = { vuoto: 0, ancorato: 1, generico: 2, non_ancorato: 3 };

async function main() {
  console.log(`audit-testi — ${APPLY ? 'SCRITTURA (marca da_rifare)' : 'SIMULAZIONE (solo CSV)'}${CLEAR_AUDIO ? ' + azzera audioguide' : ''}`);
  console.log(`output: ${OUT_FILE}`);

  let lastId = '';
  let visti = 0;
  const conteggi: Record<string, number> = {};
  const daMarcare: string[] = [];

  while (true) {
    let q = supabase
      .from('shared_pois')
      .select('id, name, city, category, lat, lon, description_long, description_ai, audio_script, enrichment_source')
      .not('lat', 'is', null)
      .or('description_long.not.is.null,description_ai.not.is.null,audio_script.not.is.null')
      .order('id', { ascending: true })
      .limit(BATCH);
    if (lastId) q = q.gt('id', lastId);
    if (NEAR) {
      const dLat = NEAR.km / 111;
      const dLon = NEAR.km / (111 * Math.max(0.2, Math.cos((NEAR.lat * Math.PI) / 180)));
      q = q.gte('lat', NEAR.lat - dLat).lte('lat', NEAR.lat + dLat).gte('lon', NEAR.lon - dLon).lte('lon', NEAR.lon + dLon);
    }
    const { data: pois, error } = await q;
    if (error) { console.error('Errore lettura:', error.message); break; }
    if (!pois || pois.length === 0) break;

    for (const p of pois as any[]) {
      lastId = p.id;
      if (LIMIT > 0 && visti >= LIMIT) { await chiudi(conteggi, daMarcare); return; }
      if (p.enrichment_source === 'da_rifare') continue;
      if (!INCLUDE_SOURCED && FONTI_AFFIDABILI.has(p.enrichment_source)) continue;
      visti++;

      const fonti = await collectPoiSources(p.name, p.lat, p.lon);
      const ctx = { name: p.name, city: p.city || '', fonti: [fonti.wikipedia, fonti.wikidata].filter(Boolean) };

      // Si valutano TUTTI i testi che l'utente puo' sentire o leggere.
      const testi = [p.description_long || p.description_ai, p.audio_script].filter((t): t is string => !!t);
      let peggiore: VerdettoTesto = 'vuoto';
      const nonAnc = new Set<string>();
      const vuote = new Set<string>();
      for (const t of testi) {
        const r = valutaAncoraggio(t, ctx);
        if (PESO[r.verdetto] > PESO[peggiore]) peggiore = r.verdetto;
        r.nonAncorate.forEach(x => nonAnc.add(x));
        r.frasiVuote.forEach(x => vuote.add(x));
      }

      conteggi[peggiore] = (conteggi[peggiore] || 0) + 1;
      fs.appendFileSync(OUT_FILE, [p.id, p.name, p.city, p.category, p.enrichment_source, peggiore,
        [...nonAnc].join(' '), [...vuote].join(' '), fonti.match ? fonti.match.title : ''].map(cella).join(',') + '\n');

      if (peggiore === 'non_ancorato' || (INCLUDE_GENERICO && peggiore === 'generico')) daMarcare.push(String(p.id));
      if (visti % 25 === 0) console.log(`  ${visti} POI — ${JSON.stringify(conteggi)}`);
      await sleep(DELAY_MS);
    }
  }
  await chiudi(conteggi, daMarcare);
}

async function chiudi(conteggi: Record<string, number>, daMarcare: string[]) {
  console.log(`\nValutati: ${Object.values(conteggi).reduce((a, b) => a + b, 0)}  ${JSON.stringify(conteggi)}`);
  console.log(`Da rifare: ${daMarcare.length}`);
  if (!APPLY) { console.log('Simulazione: nessuna scrittura. Rilancia con --apply per marcarli.'); return; }
  for (let i = 0; i < daMarcare.length; i += 100) {
    const blocco = daMarcare.slice(i, i + 100);
    const { error } = await supabase.from('shared_pois').update({ enrichment_source: 'da_rifare' }).in('id', blocco);
    if (error) { console.error('Errore marcatura:', error.message); return; }
    if (CLEAR_AUDIO) {
      const { error: e2 } = await supabase.from('poi_audioguides').delete().in('poi_id', blocco);
      if (e2) console.error('Audioguide non azzerate:', e2.message);
    }
  }
  console.log('Marcati. La scheda rigenera il testo alla prossima apertura, o i processi di sfondo li ripassano.');
}

main().catch(e => { console.error(e); process.exit(1); });
