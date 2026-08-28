// =====================================================================
// ITAINTA · Enrichment scheda POI (cache-first)
// Per ogni POI genera UNA volta la scheda (Wikipedia/Wikidata/Commons via
// /api/poi/enrich + Foursquare via /api/fsq/*). La PERSISTENZA in poi_details è
// server-owned (dentro /api/poi/enrich, service role): la RLS blocca ora la
// scrittura client. Qui si legge/rilegge la cache dal DB; dalla seconda volta
// in poi si riusa. Nessuna key lato client.
// =====================================================================

import { getPoiDetails } from './poiRepository';
import { getApiUrl, apiFetch } from '../lib/api';
import { isNetworkError } from '../lib/circuitBreaker';

// Timeout delle rotte di arricchimento (wiki/Commons/Foursquare via server):
// 20 s, poi si ricade sui dati che ci sono (ITI-07).
const ENRICH_TIMEOUT_MS = 20000;
import type { PoiCategory, PoiDetails, PoiImage, FoursquareData } from '../types/poi';

// --- CIRCUIT BREAKER (half-open con cooldown) ---
// Conta SOLO i fallimenti di RETE di /api/poi/enrich (fetch fallita): un 4xx/5xx
// applicativo è deterministico e non deve aprire il breaker. All'apertura si
// sospende l'enrichment per un cooldown, poi si riprova (half-open) invece di
// restare disabilitato per sempre (prima resetCircuitBreaker non veniva mai
// chiamato → enrichment morto fino al reload).
export let consecutiveDbFailures = 0;
export let enrichmentDisabled = false;
const MAX_DB_FAILURES = 3;
const ENRICH_COOLDOWN_MS = 2 * 60_000; // 2 min prima del tentativo half-open
let enrichmentDisabledUntil = 0;

export function resetCircuitBreaker() {
  consecutiveDbFailures = 0;
  enrichmentDisabled = false;
  enrichmentDisabledUntil = 0;
}

/** True se il breaker è aperto E il cooldown non è ancora scaduto. */
function isEnrichmentOpen(): boolean {
  if (!enrichmentDisabled) return false;
  if (Date.now() >= enrichmentDisabledUntil) {
    // Half-open: cooldown scaduto → si concede un nuovo tentativo.
    enrichmentDisabled = false;
    consecutiveDbFailures = 0;
    console.info('[Enrichment] Circuit breaker half-open: nuovo tentativo dopo cooldown.');
    return false;
  }
  return true;
}

function noteEnrichSuccess(): void {
  consecutiveDbFailures = 0;
}

function noteEnrichNetworkFailure(): void {
  consecutiveDbFailures++;
  console.warn(`[Enrichment] Fallimento di rete /api/poi/enrich. Consecutivi: ${consecutiveDbFailures}`);
  if (consecutiveDbFailures >= MAX_DB_FAILURES && !enrichmentDisabled) {
    enrichmentDisabled = true;
    enrichmentDisabledUntil = Date.now() + ENRICH_COOLDOWN_MS;
    console.error('[Enrichment] CIRCUIT BREAKER APERTO (cooldown 2 min) dopo 3 fallimenti di rete.');
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('enrichment-circuit-breaker', { detail: { open: true } }));
    }
  }
}
// -----------------------

export interface EnrichInput {
  id: string;
  name: string;
  lat: number;
  lon: number;
  category: PoiCategory | null;
  /** QID Wikidata, se il POI ce l'ha: porta il server all'articolo ESATTO
   *  invece della ricerca per coordinate (che fallisce sui luoghi estesi,
   *  dove il centroide dista chilometri dall'articolo). */
  wikidata?: string | null;
}

/** Chiama /api/poi/enrich (pipeline Oracle: wiki + edge + foto). */
async function fetchEnrich(poi: EnrichInput, lang: string): Promise<any | null> {
  try {
    // ID ORIGINALE, non modificato: forzare "osm-" su QUALSIASI id (uuid
    // community, "iti-…", utility) faceva creare al server una riga nuova.
    // Il dedup è responsabilità del server, che riceve l'id reale del POI.
    const res = await apiFetch(getApiUrl('/api/poi/enrich'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: poi.id,
        name: poi.name,
        lat: poi.lat,
        lon: poi.lon,
        category: poi.category ?? 'attraction',
        // Il server lo usa per andare dritto all'articolo giusto e alla foto
        // ufficiale (P18): prima era accettato e ignorato.
        ...(poi.wikidata ? { wikidata: poi.wikidata } : {}),
        lang,
      }),
    }, ENRICH_TIMEOUT_MS);
    if (!res.ok) return null; // errore applicativo/HTTP: NON conta per il breaker
    noteEnrichSuccess();
    return await res.json();
  } catch (e) {
    // Solo un vero errore di RETE apre il breaker.
    if (isNetworkError(e)) noteEnrichNetworkFailure();
    return null;
  }
}

/** Cerca il match Foursquare piu' vicino e ne prende i dettagli. */
async function fetchFoursquare(poi: EnrichInput): Promise<FoursquareData | null> {
  try {
    const sUrl = getApiUrl(`/api/fsq/search?lat=${poi.lat}&lon=${poi.lon}&query=${encodeURIComponent(poi.name)}`);
    const sRes = await apiFetch(sUrl, undefined, ENRICH_TIMEOUT_MS);
    if (!sRes.ok) return null;
    const sData = await sRes.json();
    const best = sData?.results?.[0];
    if (!best?.fsq_id) return null;

    const fields = 'description,photos,rating,categories,location,website,tel,hours';
    const dRes = await apiFetch(getApiUrl(`/api/fsq/details?fsq_id=${best.fsq_id}&fields=${fields}`), undefined, ENRICH_TIMEOUT_MS);
    const d = dRes.ok ? await dRes.json() : {};

    return {
      fsq_id: best.fsq_id,
      rating: d.rating,
      description: d.description,
      website: d.website,
      tel: d.tel,
      hours: d.hours,
      photos: d.photos,
      categories: (d.categories ?? []).map((c: any) => ({ name: c.name })),
    };
  } catch {
    return null;
  }
}

/**
 * Restituisce la scheda del POI, generandola e salvandola se non in cache.
 * @param force  ricrea anche se gia' presente in cache.
 */
export async function ensurePoiDetails(
  poi: EnrichInput,
  language = 'it',
  force = false,
): Promise<PoiDetails | null> {
  if (isEnrichmentOpen()) {
    console.warn('[Enrichment] Circuit breaker aperto (cooldown attivo): enrichment sospeso.');
    return null;
  }

  if (!force) {
    const cached = await getPoiDetails(poi.id, language);
    if (cached?.enriched) return cached;
  }

  const sources: string[] = [];
  const enrich = await fetchEnrich(poi, language);
  if (enrich) sources.push(enrich.source || 'oracle');

  const fsq = await fetchFoursquare(poi);
  if (fsq) sources.push('foursquare');

  const isCultural = ['monumenti', 'musei', 'chiese', 'panorami', 'gemme'].includes(poi.category || '');

  const images: PoiImage[] = [];
  if (enrich?.thumbnail) {
    images.push({ url: enrich.thumbnail, source: 'commons' });
  } else if (!isCultural && fsq?.photos && Array.isArray(fsq.photos) && fsq.photos.length > 0) {
    // Solo se NON è culturale usiamo Foursquare (evitiamo foto sbagliate per monumenti)
    const p = fsq.photos[0];
    images.push({ url: `${p.prefix}original${p.suffix}`, source: 'foursquare' });
  }

  const summary: string | null =
    enrich?.description_short || enrich?.extract || fsq?.description || null;

  // Se proprio non abbiamo nulla, non marchiamo come arricchito (riprovera').
  const enriched = Boolean(summary || enrich?.extract || fsq);

  const details: Partial<PoiDetails> & { poi_id: string; language: string } = {
    poi_id: poi.id,
    language,
    summary,
    wiki_extract: enrich?.extract ?? null,
    images: images.length ? images : null,
    foursquare: fsq,
    sources: sources.length ? sources : null,
    enriched,
  };

  // NIENTE upsert lato client: poi_details è ora scrivibile SOLO server-side
  // (RLS chiusa). La persistenza avviene dentro /api/poi/enrich (service role);
  // qui rileggiamo dal DB ciò che il server ha salvato.
  // Se la rilettura fallisce (offline, server non ancora aggiornato) si
  // restituiscono comunque i dettagli appena generati: buttarli faceva
  // ripiegare l'audioguida sul solo nome del POI ("Duomo (chiesa)"),
  // cioè contenuto pagato e generato senza fonti.
  const stored = await getPoiDetails(poi.id, language);
  return stored ?? (details as PoiDetails);
}
