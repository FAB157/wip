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
  | 'panorami';

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
