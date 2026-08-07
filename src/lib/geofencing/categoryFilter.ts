/**
 * categoryFilter.ts
 * Definisce quali categorie POI attivano il geofencing
 * Solo: monumenti, musei, panorami, chiese, castelli, gemme, siti archeologici
 */

export const GEOFENCE_CATEGORIES = new Set([
  // Monumenti
  'monument',
  'memorial',
  'statue',

  // Musei
  'museum',
  'gallery',
  'art_gallery',

  // Panorami
  'viewpoint',
  'panorama',
  'observation_point',

  // Chiese e luoghi di culto storici
  'church',
  'cathedral',
  'chapel',
  'abbey',
  'monastery',
  'basilica',

  // Castelli e forti
  'castle',
  'fort',
  'fortress',
  'tower',
  'ruins',

  // Siti archeologici
  'archaeological_site',
  'archaeological',
  'ruins_archaeological',
  'roman_ruins',

  // Attrazioni / Gemme curate
  'attraction',
  'tourism',
  'heritage',
  'historic',
  'landmark',
]);

// Tag OSM → categoria normalizzata
const OSM_TAG_MAP: Record<string, string> = {
  // tourism=*
  'tourism:museum': 'museum',
  'tourism:gallery': 'gallery',
  'tourism:viewpoint': 'viewpoint',
  'tourism:attraction': 'attraction',
  'tourism:artwork': 'monument',

  // historic=*
  'historic:castle': 'castle',
  'historic:fort': 'fort',
  'historic:monument': 'monument',
  'historic:memorial': 'memorial',
  'historic:ruins': 'ruins',
  'historic:archaeological_site': 'archaeological_site',
  'historic:church': 'church',
  'historic:abbey': 'abbey',
  'historic:monastery': 'monastery',
  'historic:tower': 'tower',

  // amenity=*
  'amenity:place_of_worship': 'church',

  // natural=*
  'natural:peak': 'viewpoint',
  'natural:cliff': 'viewpoint',
};

export interface POI {
  id: string;
  name: string;
  lat: number;
  lng: number;
  // Supporta sia schema custom che OSM tags
  category?: string;
  type?: string;
  subtype?: string;
  osm_tags?: Record<string, string>;
  // Flag manuale "gemma" curata
  is_gem?: boolean;
}

/**
 * Determina se un POI deve attivare il geofencing
 */
export function shouldGeofence(poi: POI): boolean {
  // Gemme curate manualmente → sempre attivo
  if (poi.is_gem) return true;

  // Controlla categoria diretta
  if (poi.category && GEOFENCE_CATEGORIES.has(poi.category.toLowerCase())) return true;
  if (poi.type && GEOFENCE_CATEGORIES.has(poi.type.toLowerCase())) return true;
  if (poi.subtype && GEOFENCE_CATEGORIES.has(poi.subtype.toLowerCase())) return true;

  // Controlla OSM tags
  if (poi.osm_tags) {
    for (const [key, value] of Object.entries(poi.osm_tags)) {
      const mapped = OSM_TAG_MAP[`${key}:${value}`];
      if (mapped && GEOFENCE_CATEGORIES.has(mapped)) return true;
      if (GEOFENCE_CATEGORIES.has(value.toLowerCase())) return true;
    }
  }

  return false;
}

/**
 * Filtra array di POI lasciando solo quelli geofenceable
 */
export function filterGeofencePOIs(pois: POI[]): POI[] {
  return pois.filter(shouldGeofence);
}

/**
 * Nome categoria leggibile per audio/UI
 */
export function getCategoryLabel(poi: POI): string {
  const cat = poi.category || poi.type || poi.subtype || '';
  const labels: Record<string, string> = {
    museum: 'museo',
    gallery: 'galleria d\'arte',
    viewpoint: 'punto panoramico',
    church: 'chiesa',
    cathedral: 'cattedrale',
    chapel: 'cappella',
    castle: 'castello',
    fort: 'forte',
    monument: 'monumento',
    memorial: 'memoriale',
    archaeological_site: 'sito archeologico',
    ruins: 'rovine',
    abbey: 'abbazia',
    monastery: 'monastero',
    attraction: 'attrazione',
    landmark: 'luogo storico',
  };
  return labels[cat.toLowerCase()] || 'punto di interesse';
}
