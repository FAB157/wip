// =====================================================================
// ITAINTA · Tipi del sistema POI DB-first
// Allineati a pois_schema.sql (pois / poi_details / poi_audioguides /
// indexed_areas / user_poi_settings + RPC get_nearby_pois / get_geofence_pois)
// =====================================================================

/** Le 9 categorie itainta (vincolate dal CHECK su pois.category). */
export type PoiCategory =
  | 'museum'
  | 'monument'
  | 'viewpoint'
  | 'church'
  | 'castle'
  | 'ruins'
  | 'archaeological_site'
  | 'artwork'
  | 'attraction'
  | 'utilita'
  | 'famiglie'
  | 'esperienze_locali'
  | 'locali'
  | 'eventi'
  | 'gemme'
  | 'monumenti'
  | 'musei'
  | 'chiese'
  | 'panorami'
  // Vino e Gusto (20/08/2026): macro-categoria propria in shared_pois. Il
  // tipo preciso (cantina, caseificio, frantoio…) vive in `poi_type`.
  | 'enogastronomia'
  // Verticali NATURALI (harvest non culturale, 16/08/2026): confluiscono
  // nel filtro "panorami" — vedi guideSettings.isCategoryAllowed,
  // CategoryMap.kt e PoiCategories.map (iOS), che vanno tenuti allineati.
  | 'natura'
  | 'beach'
  | 'bay'
  | 'lake'
  | 'island'
  | 'waterfall'
  | 'spring'
  | 'cave'
  | 'peak'
  | 'cliff'
  | 'glacier'
  | 'volcano'
  | 'nature_reserve'
  | 'lighthouse'
  | 'aerialway'
  | 'winery'
  // Fase 2 (17/08/2026): patrimonio costruito, musei tematici, all'aperto,
  // famiglie. Confluiscono nei rami esistenti — vedi isCategoryAllowed.
  | 'square' | 'bridge' | 'fountain' | 'theatre' | 'opera_house' | 'palace'
  | 'tower' | 'skyscraper' | 'cemetery' | 'library' | 'windmill' | 'aqueduct'
  | 'observatory' | 'stadium' | 'monastery'
  | 'art_museum' | 'natural_history_museum'
  | 'trail' | 'scenic_road' | 'tree' | 'desert' | 'forest' | 'garden'
  | 'aquarium' | 'water_park'
  // Fasi 3-5 (17/08/2026)
  | 'birthplace' | 'house_museum' | 'necropolis' | 'catacomb' | 'fortress'
  | 'city_walls' | 'villa' | 'harbour' | 'mine' | 'chimney' | 'funicular'
  | 'amphitheatre' | 'roman_baths'
  | 'triumphal_arch' | 'obelisk' | 'mausoleum' | 'abbey' | 'synagogue' | 'mosque'
  | 'temple' | 'botanical_garden' | 'market_hall' | 'train_station' | 'dam'
  | 'watermill' | 'prison' | 'museum_ship' | 'archaeological_park' | 'geopark'
  | 'memorial' | 'sculpture' | 'university' | 'town_hall' | 'via_ferrata' | 'shrine'
  | 'roman_theatre' | 'roman_circus' | 'roman_villa' | 'domus'
  | 'city_gate' | 'coastal_tower' | 'stronghold' | 'quarry' | 'saltworks'
  | 'racetrack' | 'racecourse' | 'ski_resort' | 'ski_jump'
  | 'war_cemetery' | 'concentration_camp' | 'rack_railway' | 'pier' | 'shipyard'
  | 'art_gallery' | 'archive' | 'radio_telescope' | 'hydro_plant'
  | 'cathedral' | 'basilica' | 'baptistery' | 'bell_tower' | 'cloister' | 'crypt'
  // VERTICALI TEMATICI (21/08/2026): otto categorie proprie in shared_pois,
  // raccolte sotto la macro-chip 🧭 "Tematici". Il tipo preciso (hot_spring,
  // film_location, dark_sky_park…) vive in `poi_type` — vedi
  // TEMATICI_TYPE_LABELS in lib/poiTaxonomy.ts.
  | 'tematiche'
  | 'terme' | 'cinema' | 'cieli' | 'street_art'
  | 'mercati' | 'fioriture' | 'memoria' | 'lento';

export type PoiSource = 'csv' | 'overpass_auto';
export type PoiStatus = 'approved' | 'auto' | 'deleted';
export type GuideCharacter = 'nicky' | 'dante';

/** Riga della tabella public.pois. */
export interface Poi {
  id: string;
  osm_id: string | null;
  name: string;
  lat: number;
  lon: number;
  category: PoiCategory | null;
  city: string | null;
  region: string | null;
  country: string | null;
  description: string | null;
  alert_radius: number;     // TRIGGER 1 (avviso di avvicinamento)
  geofence_radius: number;  // TRIGGER 2 (audioguida)
  premium: boolean;
  source: PoiSource;
  status: PoiStatus;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Output di get_nearby_pois(): Poi + distanza calcolata. */
export interface NearbyPoi {
  id: string;
  osm_id: string | null;
  name: string;
  lat: number;
  lon: number;
  category: PoiCategory | null;
  city: string | null;
  region: string | null;
  country: string | null;
  description: string | null;
  alert_radius: number;
  geofence_radius: number;
  premium: boolean;
  status: PoiStatus;
  distance_meters: number;
  photo_url?: string;
  image_url?: string;
}

/** Output di get_geofence_pois(): POI con raggi effettivi gia' risolti. */
export interface GeofencePoi {
  id: string;
  osm_id: string | null;
  name: string;
  lat: number;
  lon: number;
  category: PoiCategory | null;
  city: string | null;
  premium: boolean;
  is_gem?: boolean;
  source: PoiSource;
  status: PoiStatus;
  eff_alert_radius: number;     // raggio avviso effettivo (override utente o default)
  eff_geofence_radius: number;  // raggio audioguida effettivo
  alert_enabled: boolean;
  audio_enabled: boolean;
  distance_meters: number;
}

/** Scheda POI cache-first (public.poi_details). */
export interface PoiDetails {
  id: number;
  poi_id: string;
  language: string;
  summary: string | null;
  wiki_extract: string | null;
  wikidata: Record<string, unknown> | null;
  images: PoiImage[] | null;
  foursquare: FoursquareData | null;
  sources: string[] | null;
  enriched: boolean;
  created_at: string;
  updated_at: string;
}

export interface PoiImage {
  url: string;
  source: 'commons' | 'foursquare' | 'csv' | 'other';
  title?: string;
}

export interface FoursquareData {
  fsq_id?: string;
  rating?: number;
  description?: string;
  website?: string;
  tel?: string;
  hours?: unknown;
  photos?: any[];
  categories?: { name: string }[];
}

/** Testo audioguida cache-first (public.poi_audioguides). */
export interface PoiAudioguide {
  id: number;
  poi_id: number;
  language: string;
  guide_character: GuideCharacter;
  audio_text: string | null;
  generated_at: string;
  play_count: number;
}

/** Override per-utente per-POI (public.user_poi_settings). */
export interface UserPoiSettings {
  user_id: string;
  poi_id: number;
  alert_radius: number | null;
  trigger_radius: number | null;
  alert_enabled: boolean;
  audio_enabled: boolean;
  updated_at: string;
}

/** Area indicizzata su Overpass (public.indexed_areas). */
export interface IndexedArea {
  id: number;
  center_lat: number;
  center_lon: number;
  radius_meters: number;
  indexed_at: string;
  poi_count: number;
}

/** POI grezzo proveniente da Overpass (via /api/overpass) prima del filtro. */
export interface OverpassRawPoi {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}
