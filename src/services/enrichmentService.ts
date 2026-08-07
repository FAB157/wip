// =====================================================================
// ITAINTA · Enrichment scheda POI (cache-first)
// Per ogni POI genera UNA volta la scheda (Wikipedia/Wikidata/Commons via
// /api/poi/enrich + Foursquare via /api/fsq/*) e la salva in poi_details.
// Dalla seconda volta in poi si riusa la cache. Nessuna key lato client.
// =====================================================================

import { getPoiDetails, upsertPoiDetails } from './poiRepository';
import { getApiUrl } from '../lib/api';
import type { PoiCategory, PoiDetails, PoiImage, FoursquareData } from '../types/poi';

// --- CIRCUIT BREAKER ---
export let consecutiveDbFailures = 0;
export let enrichmentDisabled = false;
const MAX_DB_FAILURES = 3;

export function resetCircuitBreaker() {
  consecutiveDbFailures = 0;
  enrichmentDisabled = false;
}
// -----------------------

export interface EnrichInput {
  id: string;
  name: string;
  lat: number;
  lon: number;
  category: PoiCategory | null;
}

/** Chiama /api/poi/enrich (pipeline Oracle: wiki + edge + foto). */
async function fetchEnrich(poi: EnrichInput, lang: string): Promise<any | null> {
  try {
    // IMPORTANTE: Assicurati di non raddoppiare il prefisso osm-
    const cleanId = poi.id.startsWith('osm-') ? poi.id : `osm-${poi.id}`;

    const res = await fetch(getApiUrl('/api/poi/enrich'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: cleanId,
        name: poi.name,
        lat: poi.lat,
        lon: poi.lon,
        category: poi.category ?? 'attraction',
        lang,
      }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** Cerca il match Foursquare piu' vicino e ne prende i dettagli. */
async function fetchFoursquare(poi: EnrichInput): Promise<FoursquareData | null> {
  try {
    const sUrl = getApiUrl(`/api/fsq/search?lat=${poi.lat}&lon=${poi.lon}&query=${encodeURIComponent(poi.name)}`);
    const sRes = await fetch(sUrl);
    if (!sRes.ok) return null;
    const sData = await sRes.json();
    const best = sData?.results?.[0];
    if (!best?.fsq_id) return null;

    const fields = 'description,photos,rating,categories,location,website,tel,hours';
    const dRes = await fetch(getApiUrl(`/api/fsq/details?fsq_id=${best.fsq_id}&fields=${fields}`));
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
  if (enrichmentDisabled) {
    console.warn('[Enrichment] Circuit breaker is open. Enrichment is disabled.');
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

  const success = await upsertPoiDetails(details);
  
  if (success) {
    consecutiveDbFailures = 0;
  } else {
    consecutiveDbFailures++;
    console.warn(`[Enrichment] DB save failed. Consecutive failures: ${consecutiveDbFailures}`);
    if (consecutiveDbFailures >= MAX_DB_FAILURES) {
      enrichmentDisabled = true;
      console.error('[Enrichment] CIRCUIT BREAKER OPENED due to 3 consecutive DB failures.');
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('enrichment-circuit-breaker', { detail: { open: true } }));
      }
    }
  }

  // Se la rilettura dal DB fallisce (offline, RLS, circuit breaker aperto)
  // si restituiscono comunque i dettagli appena generati: buttarli faceva
  // ripiegare l'audioguida sul solo nome del POI ("Duomo (chiesa)"),
  // cioè contenuto pagato e generato senza fonti.
  const stored = await getPoiDetails(poi.id, language);
  return stored ?? (details as PoiDetails);
}
