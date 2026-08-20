#!/usr/bin/env npx tsx
// ─────────────────────────────────────────────────────────────────────────
// SITI UFFICIALI SUI NOSTRI POI (droplet DigitalOcean)
//
// Obiettivo: riempire `contact_website` su shared_pois, così gli itinerari
// (biblioteca e non) possono mettere un link VERO in ogni tappa invece di
// lasciarlo vuoto o farselo inventare dall'AI.
//
// Due passate, entrambe in blocco — mai una chiamata per POI, che con 2
// milioni di righe significherebbe farsi bandire da Overpass:
//   • wikidata: prende i POI che hanno un id Wikidata (422.000 senza sito) e
//     interroga SPARQL a gruppi di 200 con VALUES, chiedendo P856 (sito
//     ufficiale) e P1329 (telefono). Corrispondenza per identificatore:
//     nessun rischio di sbagliare luogo.
//   • osm: una query Overpass per riquadro di ~6 km sulle zone che la
//     biblioteca copre davvero, poi corrispondenza per nome normalizzato.
//
// Il database va trattato con riguardo (il 20/08/2026 e' andato in PGRST002
// durante la semina): scritture a raffica limitata, pause fra i gruppi e
// rallentamento automatico al primo errore. Riprende da dove era arrivato
// grazie al file di stato.
//
// Uso:  npx tsx scripts/arricchisci-siti-poi.mts wikidata
//       npx tsx scripts/arricchisci-siti-poi.mts osm
// ─────────────────────────────────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const env: Record<string, string> = {};
for (const f of ['.env', '.env.local']) {
  let txt = '';
  try { txt = fs.readFileSync(path.join(here, '..', f), 'utf8'); } catch { continue; }
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
  }
}
const K = (n: string) => process.env[n] || env[n] || '';
const SUPA = K('VITE_SUPABASE_URL') || K('SUPABASE_URL');
const SKEY = K('SUPABASE_SERVICE_ROLE_KEY');
const H = { apikey: SKEY, Authorization: `Bearer ${SKEY}` };
const MODO = (process.argv[2] || 'wikidata').toLowerCase();
// Uno stato per passata: le due usano lo stesso campo cursore e mescolarle
// farebbe ripartire l'una dal punto dell'altra.
const STATE = `${K('POI_SITI_STATE') || '/root/arricchisci-siti-stato'}-${MODO}.json`;

if (!SUPA || !SKEY) { console.error('Servono VITE_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.'); process.exit(1); }

const ts = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let stop = false;
for (const s of ['SIGINT', 'SIGTERM']) process.on(s as NodeJS.Signals, () => { console.log(`${ts()} ${s}: chiudo al termine del gruppo.`); stop = true; });

type Stato = { ultimoId?: string; zonaIdx?: number; scritti?: number };
const leggiStato = (): Stato => { try { return JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch { return {}; } };
const salvaStato = (s: Stato) => { try { fs.writeFileSync(STATE, JSON.stringify(s)); } catch { /* best effort */ } };

// Ritmo adattivo: al primo errore del database si rallenta, ai successi si
// torna gradualmente al passo normale.
let pausaScrittura = 200;
async function patchPoi(id: string, patch: any): Promise<boolean> {
  try {
    const r = await fetch(`${SUPA}/rest/v1/shared_pois?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { ...H, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(patch),
    });
    if (!r.ok) {
      if (r.status >= 500 || r.status === 429) { pausaScrittura = Math.min(5000, pausaScrittura * 2); console.warn(`${ts()} database in affanno (${r.status}): rallento a ${pausaScrittura}ms`); await sleep(30000); }
      return false;
    }
    pausaScrittura = Math.max(200, Math.round(pausaScrittura * 0.9));
    return true;
  } catch { await sleep(5000); return false; }
}

const pulisciUrl = (u: any): string | null => {
  const s = String(u || '').trim();
  if (!/^https?:\/\//i.test(s) || s.length > 300) return null;
  return s;
};

// ── PASSATA WIKIDATA ────────────────────────────────────────────────────
// L'elenco dei POI da lavorare si costruisce UNA VOLTA e si tiene su file.
// Motivo: paginare con i filtri (`wikidata not null` + `contact_website is
// null`) su 2 milioni di righe senza indice diventa una scansione sempre più
// lunga — dopo 34.000 POI il database rispondeva 500 per statement timeout,
// e riprovare ogni minuto è esattamente il carico che l'ha già messo in
// ginocchio una volta. Scorrere la chiave primaria senza filtri, invece, è
// una lettura indicizzata e costa uguale a qualsiasi profondità.
const FILE_LAVORO = K('POI_SITI_LISTA') || '/root/arricchisci-siti-lista.json';

async function costruisciListaWikidata(): Promise<Array<{ id: string; q: string }>> {
  try {
    const cache = JSON.parse(fs.readFileSync(FILE_LAVORO, 'utf8'));
    if (Array.isArray(cache) && cache.length) { console.log(`${ts()} elenco già pronto: ${cache.length} POI da arricchire`); return cache; }
  } catch { /* si costruisce ora */ }

  console.log(`${ts()} costruisco l'elenco scorrendo la chiave primaria (una tantum)…`);
  const out: Array<{ id: string; q: string }> = [];
  let ultimo = '', pagine = 0, righe = 0;
  for (;;) {
    if (stop) break;
    const r = await fetch(`${SUPA}/rest/v1/shared_pois?select=id,wikidata,contact_website${ultimo ? `&id=gt.${encodeURIComponent(ultimo)}` : ''}&order=id.asc&limit=1000`, { headers: H });
    if (!r.ok) { console.warn(`${ts()} elenco: HTTP ${r.status}, attendo 60s`); await sleep(60000); continue; }
    const rows: any[] = await r.json();
    if (!rows.length) break;
    for (const p of rows) {
      const q = String(p.wikidata || '').trim();
      if (!p.contact_website && /^Q\d+$/.test(q)) out.push({ id: p.id, q });
    }
    ultimo = rows[rows.length - 1].id;
    righe += rows.length;
    if (++pagine % 100 === 0) console.log(`${ts()} elenco: ${righe} POI letti, ${out.length} da arricchire`);
    await sleep(200);
  }
  try { fs.writeFileSync(FILE_LAVORO, JSON.stringify(out)); } catch { /* best effort */ }
  console.log(`${ts()} elenco pronto: ${out.length} POI con id Wikidata e senza sito (su ${righe} letti)`);
  return out;
}

async function passataWikidata(): Promise<void> {
  const lista = await costruisciListaWikidata();
  const stato = leggiStato();
  let cursore = Number(stato.zonaIdx || 0);
  let scritti = stato.scritti || 0, esaminati = 0, gruppi = 0;

  while (!stop && cursore < lista.length) {
    const rows = lista.slice(cursore, cursore + 200).map((x) => ({ id: x.id, wikidata: x.q }));
    cursore += rows.length;
    if (!rows.length) break;

    const qids = [...new Set(rows.map((p) => String(p.wikidata || '').trim()).filter((q) => /^Q\d+$/.test(q)))];
    esaminati += rows.length;

    if (qids.length) {
      const sparql = `SELECT ?item ?site ?tel WHERE { VALUES ?item { ${qids.map((q) => `wd:${q}`).join(' ')} } OPTIONAL { ?item wdt:P856 ?site } OPTIONAL { ?item wdt:P1329 ?tel } }`;
      try {
        const w = await fetch(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(sparql)}`, {
          headers: { Accept: 'application/sparql-results+json', 'User-Agent': 'WIP-POI-Contacts/1.0 (https://wip.guide)' },
        });
        if (w.status === 429) { console.warn(`${ts()} Wikidata rate limit: attendo 120s`); await sleep(120000); continue; }
        if (w.ok) {
          const dati = await w.json();
          const perQid = new Map<string, { site?: string; tel?: string }>();
          for (const b of (dati?.results?.bindings || [])) {
            const qid = String(b?.item?.value || '').split('/').pop() || '';
            if (!qid) continue;
            const cur = perQid.get(qid) || {};
            if (b?.site?.value && !cur.site) cur.site = b.site.value;
            if (b?.tel?.value && !cur.tel) cur.tel = b.tel.value;
            perQid.set(qid, cur);
          }
          for (const p of rows) {
            if (stop) break;
            const trovato = perQid.get(String(p.wikidata || '').trim());
            const sito = pulisciUrl(trovato?.site);
            if (!sito && !trovato?.tel) continue;
            const patch: any = { contact_enriched_at: new Date().toISOString() };
            if (sito) patch.contact_website = sito;
            if (trovato?.tel) patch.contact_phone = String(trovato.tel).slice(0, 40);
            if (await patchPoi(p.id, patch) && sito) scritti++;
            await sleep(pausaScrittura);
          }
        }
      } catch (e: any) {
        console.warn(`${ts()} Wikidata KO (${String(e.message).slice(0, 80)}): attendo 60s`);
        await sleep(60000);
      }
    }

    gruppi++;
    salvaStato({ zonaIdx: cursore, scritti });
    if (gruppi % 5 === 0) console.log(`${ts()} ${cursore}/${lista.length} POI lavorati, ${scritti} siti scritti`);
    await sleep(1500); // cortesia verso Wikidata
  }
  console.log(`${ts()} passata Wikidata: ${scritti} siti scritti su ${esaminati} POI lavorati in questo giro.`);
}

// ── PASSATA OSM SULLE ZONE DELLA BIBLIOTECA ─────────────────────────────
const normNome = (s: any) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, ' ').replace(/\b(il|lo|la|le|gli|i|del|della|di|da|the|of)\b/g, ' ').replace(/\s+/g, ' ').trim();

/** I riquadri da coprire non sono le zone della biblioteca ma TUTTI i posti
 *  dove abbiamo POI senza sito: si ricavano dai dati, arrotondando le
 *  coordinate a 0,1° (~11 km). La scansione costa una volta sola e si salva
 *  su file, così i riavvii non la rifanno. Riquadri ordinati per numero di
 *  POI: prima le città dense, dove il ritorno è massimo. */
const FILE_RIQUADRI = K('POI_SITI_TILES') || '/root/arricchisci-siti-riquadri.json';

async function costruisciRiquadri(): Promise<Array<{ lat: number; lon: number; n: number }>> {
  try {
    const cache = JSON.parse(fs.readFileSync(FILE_RIQUADRI, 'utf8'));
    if (Array.isArray(cache) && cache.length) { console.log(`${ts()} riquadri già calcolati: ${cache.length}`); return cache; }
  } catch { /* si costruisce ora */ }

  console.log(`${ts()} scansione delle coordinate dei POI senza sito (una tantum, ~15 minuti)…`);
  const conteggio = new Map<string, number>();
  let ultimo = '', pagine = 0, righe = 0;
  for (;;) {
    if (stop) break;
    const r = await fetch(`${SUPA}/rest/v1/shared_pois?select=id,lat,lon&contact_website=is.null${ultimo ? `&id=gt.${encodeURIComponent(ultimo)}` : ''}&order=id.asc&limit=1000`, { headers: H });
    if (!r.ok) { console.warn(`${ts()} scansione: HTTP ${r.status}, attendo 60s`); await sleep(60000); continue; }
    const rows: any[] = await r.json();
    if (!rows.length) break;
    for (const p of rows) {
      const la = Number(p.lat), lo = Number(p.lon);
      if (!Number.isFinite(la) || !Number.isFinite(lo)) continue;
      const k = `${(Math.round(la * 10) / 10).toFixed(1)}|${(Math.round(lo * 10) / 10).toFixed(1)}`;
      conteggio.set(k, (conteggio.get(k) || 0) + 1);
    }
    ultimo = rows[rows.length - 1].id;
    righe += rows.length;
    if (++pagine % 50 === 0) console.log(`${ts()} scansione: ${righe} POI, ${conteggio.size} riquadri`);
    await sleep(250);
  }
  const riquadri = [...conteggio.entries()]
    .map(([k, n]) => { const [la, lo] = k.split('|'); return { lat: Number(la), lon: Number(lo), n }; })
    .sort((a, b) => b.n - a.n);
  try { fs.writeFileSync(FILE_RIQUADRI, JSON.stringify(riquadri)); } catch { /* best effort */ }
  console.log(`${ts()} scansione finita: ${righe} POI senza sito in ${riquadri.length} riquadri`);
  return riquadri;
}

// I mirror Overpass non sono intercambiabili nei fatti: misurati dal droplet il
// 20/08/2026, overpass-api.de dava 504 e kumi/private.coffee non rispondevano
// affatto, mentre osm.ch tornava in 0,16s. Si prova in quest'ordine e si
// ricomincia dal primo a ogni riquadro, così se osm.ch cade il giro continua.
const OVERPASS_MIRRORS = [
  'https://overpass.osm.ch/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

async function overpassQuery(q: string): Promise<any | null> {
  let occupato = false;
  for (const url of OVERPASS_MIRRORS) {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 60000);
    try {
      const r = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(q)}`, signal: ctrl.signal,
      });
      if (r.status === 429 || r.status === 504) { occupato = true; continue; }
      if (!r.ok) continue;
      return await r.json();
    } catch { /* mirror giù: si passa al prossimo */ }
    finally { clearTimeout(to); }
  }
  if (occupato) throw new Error('OCCUPATO');
  return null;
}

async function passataOsm(): Promise<void> {
  const riquadri = await costruisciRiquadri();
  const zone = riquadri.map((t) => ({ nome: `${t.lat},${t.lon} (${t.n} POI)`, lat: t.lat, lon: t.lon }));
  const stato = leggiStato();
  let idx = stato.zonaIdx || 0, scritti = stato.scritti || 0;
  console.log(`${ts()} ${zone.length} riquadri da coprire, riparto dal ${idx + 1}`);

  for (; idx < zone.length && !stop; idx++) {
    const z = zone[idx];
    // Mezzo riquadro: 0,05° di latitudine (~5,5 km) e altrettanti di
    // longitudine corretti per il parallelo, così i riquadri si toccano
    // senza lasciare buchi.
    const dlat = 0.05, dlon = 0.05 / Math.max(0.2, Math.cos((z.lat * Math.PI) / 180));
    const bbox = `${(z.lat - dlat).toFixed(4)},${(z.lon - dlon).toFixed(4)},${(z.lat + dlat).toFixed(4)},${(z.lon + dlon).toFixed(4)}`;
    const q = `[out:json][timeout:25];(nwr(${bbox})["name"]["website"];nwr(${bbox})["name"]["contact:website"];);out tags center 600;`;
    let siti = new Map<string, string>();
    try {
      const dati = await overpassQuery(q);
      if (dati === null) { console.warn(`${ts()} Overpass irraggiungibile su ${z.nome}: salto`); await sleep(15000); }
      for (const el of (dati?.elements || [])) {
        const nome = normNome(el?.tags?.name);
        const url = pulisciUrl(el?.tags?.website || el?.tags?.['contact:website']);
        if (nome.length >= 4 && url && !siti.has(nome)) siti.set(nome, url);
      }
    } catch (e: any) {
      if (String(e?.message) === 'OCCUPATO') {
        console.warn(`${ts()} Overpass occupato su tutti i mirror: attendo 120s`);
        await sleep(120000); idx--; continue;
      }
      console.warn(`${ts()} Overpass KO su ${z.nome}: ${String(e.message).slice(0, 60)}`);
      await sleep(30000);
      continue;
    }
    if (siti.size) {
      const r = await fetch(`${SUPA}/rest/v1/shared_pois?select=id,name&contact_website=is.null&lat=gte.${(z.lat - dlat).toFixed(4)}&lat=lte.${(z.lat + dlat).toFixed(4)}&lon=gte.${(z.lon - dlon).toFixed(4)}&lon=lte.${(z.lon + dlon).toFixed(4)}&limit=800`, { headers: H });
      if (r.ok) {
        for (const p of await r.json()) {
          if (stop) break;
          const k = normNome(p.name);
          let url = siti.get(k);
          if (!url && k.length >= 6) for (const [n, u] of siti) { if (n.includes(k) || k.includes(n)) { url = u; break; } }
          if (!url) continue;
          if (await patchPoi(p.id, { contact_website: url, contact_enriched_at: new Date().toISOString() })) scritti++;
          await sleep(pausaScrittura);
        }
      }
    }
    salvaStato({ zonaIdx: idx + 1, scritti });
    if (siti.size || (idx + 1) % 25 === 0) {
      console.log(`${ts()} [${idx + 1}/${zone.length}] ${z.nome}: ${siti.size} siti da OSM — totale scritti ${scritti}`);
    }
    await sleep(4000); // cortesia verso Overpass
  }
  console.log(`${ts()} passata OSM: ${scritti} siti scritti.`);
}

if (MODO === 'osm') await passataOsm();
else await passataWikidata();
