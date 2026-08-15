// =====================================================================
// ITAINTA · Auto-popolamento POI via Overpass (fallback DB-first)
// Usa la route esistente POST /api/overpass (key/rate-limit lato server).
// Filtro qualita' + dedup osm_id (protegge i POI eliminati) + insert auto.
// =====================================================================

import {
  mapToItaintaCategory,
  isAcceptablePoi,
  normalizeOsmId,
} from '../lib/poiCategories';
import {
  findExistingOsmIds,
  filterCrossSourceDuplicates,
  insertAutoPois,
  saveIndexedArea,
  type AutoPoiInput,
} from './poiRepository';
import type { OverpassRawPoi } from '../types/poi';

/** Costruisce la query Overpass QL per le categorie itainta intorno al punto. */
export function buildOverpassQuery(lat: number, lon: number, radius: number): string {
  const around = `(around:${radius},${lat},${lon})`;
  return `[out:json][timeout:25];
(
  nwr["tourism"~"^(museum|gallery|viewpoint|artwork|attraction|theme_park|zoo|winery)$"]${around};
  nwr["historic"]${around};
  nwr["amenity"="place_of_worship"]${around};
  nwr["amenity"~"^(restaurant|cafe|bar|pub|pharmacy|drinking_water|hospital|toilets|marketplace)$"]${around};
  nwr["leisure"~"^(park|playground)$"]${around};
  nwr["place"="square"]${around};
  nwr["highway"="pedestrian"]["area"="yes"]${around};
  nwr["railway"="station"]${around};
  nwr["highway"="motorway_junction"]${around};
  nwr["craft"]${around};
  nwr["shop"="bakery"]${around};
);
out center tags;`;
}

interface DiscoveryResult {
  found: number;      // POI grezzi tornati da Overpass
  accepted: number;   // superano filtro qualita'
  inserted: number;   // effettivamente nuovi e inseriti
  freshPois?: AutoPoiInput[]; // POI pronti per essere renderizzati subito (fallback)
}

/**
 * Interroga Overpass intorno al punto, filtra, esclude gli osm_id gia' noti
 * (presenti in shared_pois con QUALSIASI status, OPPURE tombstonati = eliminati
 * dall'admin) e inserisce i nuovi come status='auto'.
 * Registra sempre l'area in indexed_areas (anche se 0 nuovi: e' una scelta).
 */
export async function runOverpassDiscovery(
  lat: number,
  lon: number,
  radius = 500,
  categories?: string[]
): Promise<DiscoveryResult> {
  const result: DiscoveryResult = { found: 0, accepted: 0, inserted: 0 };

  let elements: OverpassRawPoi[] = [];
  try {
    // Usa la NUOVA API SMART DISCOVERY che include Overpass + Geoapify fallback
    const res = await fetch('/api/poi/discover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat, lon, radius, categories }),
    });
    if (res.ok) {
      const json = await res.json();
      elements = (json?.elements ?? []) as OverpassRawPoi[];
    }
  } catch (e) {
    console.warn('[poiDiscovery] Smart discovery fetch fallita', e);
    return result;
  }

  result.found = elements.length;

  // Filtro qualita' + normalizzazione
  const candidates = new Map<string, AutoPoiInput>();
  for (const el of elements) {
    const tags = el.tags ?? {};
    const category = mapToItaintaCategory(tags);
    const name = tags.name;
    if (!isAcceptablePoi(name, category)) continue;

    const coordLat = el.lat ?? el.center?.lat;
    const coordLon = el.lon ?? el.center?.lon;
    if (coordLat == null || coordLon == null) continue;

    // normalizeOsmId: id OSM (node/way/relation/N o numerico puro) → "<n>"
    // (poi "osm-<n>" in DB); fonti terze prefissate (fsq_/geo_) → namespace
    // distinto "fsq-…/geo-…", MAI ridotte alle cifre finali (niente più
    // collisioni osm-<n>). findExistingOsmIds/insertAutoPois usano la stessa
    // regola di id, quindi dedup e insert restano coerenti.
    const osm_id = normalizeOsmId(el.id);
    if (candidates.has(osm_id)) continue;
    candidates.set(osm_id, {
      osm_id,
      name: name as string,
      lat: coordLat,
      lon: coordLon,
      category,
      description: tags.description,
    });
  }
  result.accepted = candidates.size;

  // Escludi gli osm_id gia' presenti in DB o TOMBSTONATI (hard-deleted): senza
  // il controllo tombstone la discovery li reinseriva e il trigger di
  // untombstone annullava la cancellazione dell'admin (POI "resuscitati").
  const existing = await findExistingOsmIds([...candidates.keys()]);
  const fresh: AutoPoiInput[] = [];
  for (const [osmId, poi] of candidates) {
    if (!existing.has(osmId)) fresh.push(poi);
  }

  // Dedup cross-source: findExistingOsmIds copre solo lo stesso id/fonte
  // (es. lo stesso nodo Overpass ri-scoperto), ma non un POI geograficamente
  // vicino con nome simile gia' inserito da una fonte diversa (es. Foursquare
  // con id "fsq-…"). Scarta questi candidati prima dell'insert per non
  // duplicare la riga per lo stesso luogo reale.
  const deduped = await filterCrossSourceDuplicates(fresh);

  if (deduped.length > 0) {
    result.inserted = await insertAutoPois(deduped);
    result.freshPois = deduped;

    // --- AUTO-ENRICHMENT BACKGROUND REMOVED ---
    // (L'arricchimento avviene on-demand al click sul pin per non intasare il rate limit)
    // Non viene più eseguito fetch('/api/poi/enrich') qui.
  }

  // Registra l'area come indicizzata (rispetta le scelte future)
  await saveIndexedArea(lat, lon, radius, result.inserted);

  return result;
}
