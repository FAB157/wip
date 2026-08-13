// =====================================================================
// ITAINTA · Mappatura tag OSM/Overpass -> categorie itainta + filtro qualita'
// Usato sia dallo script di import CSV sia dal fallback Overpass runtime,
// cosi' la classificazione e' identica nelle due strade.
// =====================================================================

import type { PoiCategory } from '../types/poi';

/** Nomi generici/non-significativi da scartare. */
const GENERIC_NAMES = new Set([
  'yes', 'no', 'true', 'false', 'unknown', 'poi', 'n/a', 'na', '-', '?', '.',
]);

/**
 * Mappa un set di tag (OSM o colonne CSV omonime) a una categoria itainta.
 * Ritorna null se il punto non rientra nelle 9 categorie supportate
 * (es. highway/shop/craft/railway -> scartato).
 */
export function mapToItaintaCategory(
  tags: Record<string, string | undefined>,
): PoiCategory | null {
  const tourism = (tags.tourism || '').toLowerCase();
  const historic = (tags.historic || '').toLowerCase();
  const amenity = (tags.amenity || '').toLowerCase();
  const building = (tags.building || '').toLowerCase();

  // --- utilita FORCE FILTER (scarta prima di tutto) ---
  if (
    amenity === 'hospital' ||
    amenity === 'pharmacy' ||
    amenity === 'clinic' ||
    amenity === 'doctors' ||
    amenity === 'dentist' ||
    amenity === 'social_facility' ||
    amenity === 'veterinary' ||
    amenity === 'police' ||
    amenity === 'post_office' ||
    amenity === 'drinking_water' ||
    amenity === 'taxi' ||
    amenity === 'toilets' ||
    amenity === 'marketplace' ||
    tags.railway === 'station' ||
    tags.railway === 'subway_entrance' ||
    tags.barrier === 'toll_booth' ||
    tags.highway === 'motorway_junction'
  ) {
    return 'utilita';
  }

  // --- tourism ---
  if (tourism === 'museum' || tourism === 'gallery') return 'museum';
  if (tourism === 'viewpoint') return 'viewpoint';
  if (tourism === 'artwork') return 'artwork';
  if (tourism === 'attraction' || tourism === 'yes') return 'attraction';

  // --- historic ---
  if (historic === 'monument' || historic === 'memorial') return 'monument';
  if (
    historic === 'castle' ||
    historic === 'fort' ||
    historic === 'fortress' ||
    historic === 'city_gate' ||
    historic === 'tower'
  ) {
    return 'castle';
  }
  if (historic === 'ruins') return 'ruins';
  if (historic === 'archaeological_site') return 'archaeological_site';
  if (historic === 'artwork') return 'artwork';
  if (
    historic === 'church' ||
    historic === 'chapel' ||
    historic === 'cathedral' ||
    historic === 'monastery'
  ) {
    return 'church';
  }

  // --- luoghi di culto ---
  if (amenity === 'place_of_worship') return 'church';
  if (building === 'church' || building === 'cathedral' || building === 'chapel') {
    return 'church';
  }

  // --- famiglie ---
  if (
    tags.leisure === 'park' ||
    tags.leisure === 'playground' ||
    tourism === 'theme_park' ||
    tourism === 'aquarium' ||
    tourism === 'zoo'
  ) {
    return 'famiglie';
  }

  // --- locali ---
  if (
    amenity === 'restaurant' ||
    amenity === 'cafe' ||
    amenity === 'fast_food' ||
    amenity === 'bar' ||
    amenity === 'pub' ||
    amenity === 'ice_cream'
  ) {
    return 'locali';
  }

  // --- fallback storico generico ---
  if (historic && historic !== 'no') return 'monument';

  // --- piazze ---
  if (tags.place === 'square' || (tags.highway === 'pedestrian' && tags.area === 'yes')) {
    return 'monument';
  }

  return null;
}

/** Verifica che un POI superi il filtro qualita' (categoria valida + nome reale). */
export function isAcceptablePoi(
  name: string | undefined | null,
  category: PoiCategory | null,
): boolean {
  if (!category) return false;
  if (!name) return false;
  const n = name.trim().toLowerCase();
  if (n.length < 2) return false;
  if (GENERIC_NAMES.has(n)) return false;
  return true;
}

/**
 * Normalizza l'id di un POI di fonte terza per il dedup.
 *
 * SOLO gli id genuinamente OSM diventano id numerico puro:
 *   - "node/123" | "way/123" | "relation/123"  (Overpass live)
 *   - "123" | "@123"                            (CSV, colonna @id numerica)
 * confrontabili fra loro → poi diventeranno "osm-123" in shared_pois.
 *
 * Gli id con PREFISSO di altre sorgenti (Foursquare "fsq_…", Geoapify "geo_…")
 * NON sono OSM: estrarne le cifre finali creava collisioni "osm-<n>" con POI
 * OSM reali diversi. Si conserva un namespace distinto ("fsq-…", "geo-…"),
 * normalizzando il separatore a '-' (insertAutoPois lo tratta come id già
 * namespacizzato perché contiene '-').
 */
export function normalizeOsmId(raw: string | number): string {
  const s = String(raw).trim();
  // OSM esplicito: tipo/idnumerico.
  const typed = s.match(/^(?:node|way|relation)\/(\d+)$/i);
  if (typed) return typed[1];
  // OSM da CSV: id puramente numerico (con eventuale '@' del campo @id).
  const numeric = s.match(/^@?(\d+)$/);
  if (numeric) return numeric[1];
  // Fonte terza con prefisso alfabetico (fsq_/geo_/…): namespace preservato.
  const prefixed = s.match(/^([a-z]+)[_:\-](.+)$/i);
  if (prefixed) {
    const ns = prefixed[1].toLowerCase();
    const rest = prefixed[2].replace(/[^a-z0-9]+/gi, '');
    if (rest) return `${ns}-${rest}`;
  }
  // Fallback: id sconosciuto lasciato intatto, MAI ridotto alle cifre finali.
  return s;
}

/** Etichette IT per la UI. */
export const CATEGORY_LABELS_IT: Record<PoiCategory, string> = {
  museum: 'Museo',
  monument: 'Monumento',
  viewpoint: 'Punto panoramico',
  church: 'Chiesa',
  castle: 'Castello',
  ruins: 'Rovine',
  archaeological_site: 'Sito archeologico',
  artwork: "Opera d'arte",
  attraction: 'Attrazione',
  utilita: 'Utilità e Servizi',
  famiglie: 'Famiglie e Parchi',
  esperienze_locali: 'Esperienze Locali',
  locali: 'Locali e Ristorazione',
  eventi: 'Eventi',
  gemme: 'Gemme Nascoste',
  monumenti: 'Monumenti',
  musei: 'Musei',
  chiese: 'Chiese',
  panorami: 'Panorami',
};

/** Colore marker per categoria (cluster mappa). */
export const CATEGORY_COLORS: Record<PoiCategory, string> = {
  museum: '#8b5cf6',
  monument: '#b45309',
  viewpoint: '#0ea5e9',
  church: '#6366f1',
  castle: '#92400e',
  ruins: '#78716c',
  archaeological_site: '#a16207',
  artwork: '#db2777',
  attraction: '#16a34a',
  utilita: '#0284c7', // light blue
  famiglie: '#10b981', // emerald
  esperienze_locali: '#f59e0b', // amber
  locali: '#e11d48', // rose
  eventi: '#8b5cf6', // violet
  gemme: '#0f766e', // teal
  monumenti: '#b45309',
  musei: '#8b5cf6',
  chiese: '#6366f1',
  panorami: '#0ea5e9',
};

/** Emoji per categoria (popup/scheda). */
export const CATEGORY_EMOJI: Record<PoiCategory, string> = {
  museum: '🏛️',
  monument: '🗿',
  viewpoint: '🌄',
  church: '⛪',
  castle: '🏰',
  ruins: '🏚️',
  archaeological_site: '⚱️',
  artwork: '🎨',
  attraction: '📍',
  utilita: '🏥',
  famiglie: '🎡',
  esperienze_locali: '🍷',
  locali: '🍝',
  eventi: '🎭',
  gemme: '💎',
  monumenti: '🗿',
  musei: '🏛️',
  chiese: '⛪',
  panorami: '🌄',
};
