// @ts-nocheck
// =====================================================================
// ITAINTA · Repository POI (accesso a Supabase per il sistema DB-first)
// Tutte le query verso pois / poi_details / poi_audioguides /
// indexed_areas / user_poi_settings passano da qui.
// =====================================================================

import { supabase } from '../lib/supabase';
import { haversineMeters } from '../lib/geo';
import { db } from '../lib/db';
import { Network } from '@capacitor/network';
import { supabaseCircuitBreaker } from '../lib/circuitBreaker';
import type {
  NearbyPoi,
  GeofencePoi,
  Poi,
  PoiDetails,
  PoiAudioguide,
  GuideCharacter,
  UserPoiSettings,
} from '../types/poi';

/** True se il client reale Supabase e' attivo (la mock non ha .rpc). */
function hasRpc(): boolean {
  return typeof (supabase as any).rpc === 'function';
}

// --- Lettura POI vicini (da shared_pois) --------------------------------
export async function getPoiById(id: string): Promise<NearbyPoi | null> {
  // Try Dexie first
  try {
    const local = await db.pois.get(id);
    if (local) return local as any;
  } catch(e) {}

  // Fallback Supabase
  try {
    const { data, error } = await supabase
      .from('shared_pois')
      .select('id, name, lat, lon, category, status, description_ai, is_gem, photo_url, image_url')
      .eq('id', id)
      .single();
    if (!error && data) {
       return {
          id: data.id,
          name: data.name,
          lat: data.lat,
          lon: data.lon,
          category: data.category || 'monumenti',
          distance_meters: 0,
          premium: data.is_gem ?? false,
          is_gem: data.is_gem ?? false,
          status: data.status,
          description_ai: data.description_ai,
          photo_url: data.photo_url || data.image_url,
          image_url: data.image_url || data.photo_url,
       } as NearbyPoi;
    }
  } catch(e) {}
  return null;
}

/**
 * Lettura batch di POI per id (Dexie prima, poi shared_pois con .in()).
 * Usata dall'archivio ascolti per arricchire le card (descrizione, foto).
 * Gli id non trovati (POI spariti dal DB) semplicemente mancano dalla mappa.
 */
export async function getPoisByIds(ids: string[]): Promise<Map<string, NearbyPoi>> {
  const result = new Map<string, NearbyPoi>();
  const wanted = Array.from(new Set((ids || []).map(String).filter(Boolean)));
  if (wanted.length === 0) return result;

  // 1. Dexie (offline-first)
  try {
    const locals = await db.pois.bulkGet(wanted);
    locals.forEach((p: any) => { if (p && p.id != null) result.set(String(p.id), p as any); });
  } catch (e) {}

  // 2. Supabase per i mancanti
  const missing = wanted.filter(id => !result.has(id));
  if (missing.length > 0) {
    try {
      const { data, error } = await supabase
        .from('shared_pois')
        .select('id, name, lat, lon, category, status, description_ai, is_gem, photo_url, image_url')
        .in('id', missing);
      if (!error && Array.isArray(data)) {
        data.forEach((d: any) => {
          result.set(String(d.id), {
            id: d.id,
            name: d.name,
            lat: d.lat,
            lon: d.lon,
            category: d.category || 'monumenti',
            distance_meters: 0,
            premium: d.is_gem ?? false,
            is_gem: d.is_gem ?? false,
            status: d.status,
            description_ai: d.description_ai,
            photo_url: d.photo_url || d.image_url,
            image_url: d.image_url || d.photo_url,
          } as NearbyPoi);
        });
      }
    } catch (e) {}
  }
  return result;
}

export async function getNearbyPois(
  lat: number,
  lon: number,
  radiusMeters = 800,
): Promise<NearbyPoi[]> {
  // Fallback offline: leggi da Dexie (cache locale)
  try {
    const status = await Network.getStatus();
    if (!status.connected) {
      console.log('[Offline] Leggo POI da Dexie');
      const localPois = await db.pois.toArray();
      const filtered = localPois
        .filter(isVisiblePoiStatus)
        .filter(p => haversineMeters(lat, lon, p.lat, p.lon) <= radiusMeters)
        .map(p => ({
          ...p,
          distance_meters: haversineMeters(lat, lon, p.lat, p.lon),
          id: p.id,
        }));
      return filtered as any[];
    }
  } catch (e) {
    console.warn('Network plugin error in repository', e);
  }

  // Primary: RPC nearby_pois (legge da shared_pois con PostGIS) e get_utility_pois
  if (hasRpc()) {
    const fetchShared = supabase.rpc('nearby_pois', {
      p_lat: lat,
      p_lon: lon,
      radius_m: radiusMeters,
      limit_num: 400
    });
    
    const fetchUtility = supabase.rpc('get_utility_pois', {
      user_lat: lat,
      user_lon: lon,
      radius_meters: radiusMeters,
      limit_num: 400
    });

    const [sharedRes, utilityRes] = await Promise.all([fetchShared, fetchUtility]);
    
    let allPois: NearbyPoi[] = [];
    // La RPC nearby_pois deployata espone il nome nella colonna "nome".
    // La RPC NON filtra per status: bozze e POI in bonifica (status draft/
    // needs_revision, es. allucinazioni Vision) non devono arrivare al radar.
    // Stesso filtro nei parser nativi (WipSupabaseClient.swift, SupabaseClient.kt).
    const hiddenStatuses = new Set(['draft', 'needs_revision', 'rejected', 'hidden']);
    if (!sharedRes.error && sharedRes.data) {
      allPois = allPois.concat(
        (sharedRes.data as any[])
          .filter(p => !hiddenStatuses.has(String(p.status || '').toLowerCase()) && p.is_hidden !== true)
          .map(p => ({ ...p, name: p.name ?? p.nome })) as NearbyPoi[]
      );
    }
    if (!utilityRes.error && utilityRes.data) {
       // Map utility_pois fields to match NearbyPoi
       const mappedUtility = (utilityRes.data as any[]).map(p => ({
         ...p,
         premium: false,
         is_gem: false,
         description_ai: null
       }));
       allPois = allPois.concat(mappedUtility);
    }

    if (allPois.length > 0) {
      const pois = allPois;
      // Salva in Dexie per uso offline
      try {
        await db.pois.bulkPut(pois.map(p => ({
          id: p.id.toString(),
          name: p.name,
          lat: p.lat,
          lon: p.lon,
          category: p.category || 'monumenti',
          is_gem: (p as any).premium ?? false,
          lastUpdated: Date.now(),
          status: p.status,
          photo_url: (p as any).photo_url || (p as any).image_url,
          image_url: (p as any).image_url || (p as any).photo_url,
        })));
      } catch (dexieErr) {
        console.warn('[Dexie] Errore salvataggio POI:', dexieErr);
      }
      return pois;
    }
    if (sharedRes.error) console.warn('[poiRepository] nearby_pois RPC:', sharedRes.error.message);
  }

  // Fallback diretto su shared_pois e utility_pois (bbox query senza ST_DWithin)
  try {
    const delta = (radiusMeters / 111000);
    
    const fetchFbShared = supabase
      .from('shared_pois')
      .select('id, name, lat, lon, category, status, description_ai, is_gem, photo_url, image_url')
      .gte('lat', lat - delta)
      .lte('lat', lat + delta)
      .gte('lon', lon - delta)
      .lte('lon', lon + delta)
      .in('status', ['verified', 'auto', 'approved'])
      .not('name', 'is', null)
      .limit(400);

    const fetchFbUtility = supabase
      .from('utility_pois')
      .select('id, name, lat, lon, category, photo_url, image_url')
      .gte('lat', lat - delta)
      .lte('lat', lat + delta)
      .gte('lon', lon - delta)
      .lte('lon', lon + delta)
      .in('status', ['verified', 'auto'])
      .not('name', 'is', null)
      .limit(400);
      
    const [fbSharedRes, fbUtilityRes] = await Promise.all([fetchFbShared, fetchFbUtility]);

    let allFallbackPois: any[] = [];
    if (!fbSharedRes.error && fbSharedRes.data) allFallbackPois = allFallbackPois.concat(fbSharedRes.data);
    if (!fbUtilityRes.error && fbUtilityRes.data) {
       const mappedFbUt = fbUtilityRes.data.map(p => ({
         ...p,
         premium: false,
         is_gem: false,
         description_ai: null
       }));
       allFallbackPois = allFallbackPois.concat(mappedFbUt);
    }

    if (allFallbackPois.length > 0) {
      return allFallbackPois
        .filter(p => p.lat && p.lon && p.name && haversineMeters(lat, lon, p.lat, p.lon) <= radiusMeters)
        .map(p => ({
          id: p.id,
          name: p.name,
          lat: p.lat,
          lon: p.lon,
          category: p.category || 'monumenti',
          is_gem: p.is_gem ?? false,
          premium: p.is_gem ?? false,
          distance_meters: haversineMeters(lat, lon, p.lat, p.lon),
          status: p.status,
          description_ai: p.description_ai,
          photo_url: p.photo_url || p.image_url,
          image_url: p.image_url || p.photo_url,
        })) as NearbyPoi[];
    }
  } catch (e) {
    console.warn('[poiRepository] Fallback fail:', e);
  }

  // Ultima spiaggia: Supabase irraggiungibile o vuoto anche se Network dice
  // "connesso" (rete zombie, circuit breaker, zona senza segnale reale).
  // Leggiamo Dexie: la mappa mostra comunque i pin delle aree scaricate.
  try {
    const localPois = await db.pois.toArray();
    const filtered = localPois
      .filter(isVisiblePoiStatus)
      .filter(p => haversineMeters(lat, lon, p.lat, p.lon) <= radiusMeters)
      .map(p => ({
        ...p,
        distance_meters: haversineMeters(lat, lon, p.lat, p.lon),
      }));
    if (filtered.length > 0) {
      console.log(`[poiRepository] Fallback offline finale: ${filtered.length} POI da Dexie`);
      return filtered as any[];
    }
  } catch (e) {
    console.warn('[poiRepository] Dexie final fallback fail:', e);
  }

  return [];
}


/**
 * Categorie che possono avere un'audioguida: allineate a isCategoryAllowed
 * di useGeofencing.ts (le categorie commerciali/utilitarie non triggerano mai).
 */
// Status che NON devono mai arrivare all'utente, ONLINE come OFFLINE: bozze,
// allucinazioni Vision in bonifica, POI rifiutati/nascosti. Prima le letture
// Dexie non filtravano nulla → offline (dove il geofencing parte da solo) un
// draft poteva far scattare "Sei arrivato!". Stessa denylist di nearby_pois.
const HIDDEN_POI_STATUSES = new Set(['draft', 'needs_revision', 'rejected', 'hidden']);
function isVisiblePoiStatus(p: any): boolean {
  return !HIDDEN_POI_STATUSES.has(String(p?.status || '').toLowerCase()) && p?.is_hidden !== true;
}

const AUDIOGUIDABLE_CATEGORIES = new Set([
  'monument', 'artwork', 'monumenti', 'attraction',
  'castle', 'castelli', 'ruins', 'archaeological_site', 'archeo',
  'church', 'chiese', 'chiesa', 'place_of_worship', 'cathedral', 'cattedrale',
  'chapel', 'cappella', 'basilica', 'monastery', 'monastero', 'abbey', 'abbazia',
  'shrine', 'santuario',
  'viewpoint', 'park', 'panorami',
  'museum', 'gallery', 'musei',
  'information', 'tourism_information', 'office', 'consigli',
  'gemme',
  'community',
]);

/**
 * Fallback offline per il geofencing (stesso pattern del fallback finale di
 * getNearbyPois): legge Dexie e filtra alle sole categorie audioguidabili,
 * con raggi geofence di default. Sblocca i trigger PWA senza rete.
 */
async function getGeofencePoisFromDexie(
  lat: number,
  lon: number,
  radiusMeters: number,
): Promise<GeofencePoi[]> {
  try {
    const localPois = await db.pois.toArray();
    const result = localPois
      .filter(isVisiblePoiStatus)
      .filter(p => p.lat && p.lon && p.name)
      .filter(p =>
        p.is_gem ||
        AUDIOGUIDABLE_CATEGORIES.has(String(p.category || '').toLowerCase()))
      .filter(p => haversineMeters(lat, lon, p.lat, p.lon) <= radiusMeters)
      .map(p => ({
        id: String(p.id),
        osm_id: null,
        name: p.name,
        lat: p.lat,
        lon: p.lon,
        category: p.category || 'monumenti',
        city: null,
        premium: p.is_gem ?? false,
        is_gem: p.is_gem ?? false,
        source: 'offline',
        status: p.status || 'auto',
        // Raggi di default: useGeofencing li ricalcola comunque con
        // radiiForTransport, questi valgono solo come fallback coerente.
        eff_alert_radius: 150,
        eff_geofence_radius: 50,
        alert_enabled: true,
        audio_enabled: true,
        distance_meters: haversineMeters(lat, lon, p.lat, p.lon),
      })) as GeofencePoi[];
    if (result.length > 0) {
      console.log(`[poiRepository] getGeofencePois fallback Dexie: ${result.length} POI offline`);
    }
    return result;
  } catch (e) {
    console.warn('[poiRepository] getGeofencePois Dexie fallback fail:', e);
    return [];
  }
}

/** POI vicini con raggi geofence effettivi gia' risolti (override utente). */
export async function getGeofencePois(
  lat: number,
  lon: number,
  userId: string | null,
  radiusMeters = 500,
): Promise<GeofencePoi[]> {
  // Offline dichiarato: inutile tentare la RPC, vai diretto su Dexie
  // (stesso criterio di getNearbyPois).
  try {
    const status = await Network.getStatus();
    if (!status.connected) {
      return await getGeofencePoisFromDexie(lat, lon, radiusMeters);
    }
  } catch (e) {
    // Plugin Network non disponibile (web puro): prosegui con la RPC.
  }

  if (!hasRpc()) return getGeofencePoisFromDexie(lat, lon, radiusMeters);
  try {
    const data = await supabaseCircuitBreaker.execute(async () => {
      const { data, error } = await supabase.rpc('get_geofence_pois', {
        user_lat: lat,
        user_lon: lon,
        p_user_id: userId,
        radius_meters: radiusMeters,
      });
      if (error) throw new Error(error.message);
      return data;
    });
    return (data ?? []) as GeofencePoi[];
  } catch (error: any) {
    console.warn('[poiRepository] get_geofence_pois (circuit breaker):', error.message);
    // RPC fallita (rete zombie, circuit breaker aperto): ultima spiaggia Dexie.
    return getGeofencePoisFromDexie(lat, lon, radiusMeters);
  }
}

// --- Aree indicizzate ---------------------------------------------------
/**
 * True se le coordinate ricadono in un'area gia' interrogata su Overpass.
 * (Se indicizzata ma con pochi POI = scelta da rispettare: non riproporre.)
 */
export async function isAreaIndexed(
  lat: number,
  lon: number,
): Promise<boolean> {
  try {
    const delta = 0.01; // ~1.1 km box, sufficiente per aree da 500 m
    const { data, error } = await supabase
      .from('indexed_areas')
      .select('center_lat, center_lon, radius_meters')
      .gte('center_lat', lat - delta)
      .lte('center_lat', lat + delta)
      .gte('center_lon', lon - delta)
      .lte('center_lon', lon + delta);
    if (error || !data) return false;
    return (data as any[]).some(
      (a) => haversineMeters(lat, lon, a.center_lat, a.center_lon) <= (a.radius_meters ?? 500),
    );
  } catch {
    return false;
  }
}

export async function saveIndexedArea(
  lat: number,
  lon: number,
  radiusMeters: number,
  poiCount: number,
): Promise<void> {
  try {
    await supabase.from('indexed_areas').insert([
      { center_lat: lat, center_lon: lon, radius_meters: radiusMeters, poi_count: poiCount },
    ]);
  } catch (e) {
    console.warn('[poiRepository] saveIndexedArea fallita', e);
  }
}

// --- Dedup osm_id (protegge i POI eliminati dall'admin) -----------------
/** Ritorna il set degli osm_id gia' presenti in DB (QUALSIASI status). */
export async function findExistingOsmIds(osmIds: string[]): Promise<Set<string>> {
  const result = new Set<string>();
  if (osmIds.length === 0) return result;
  try {
    // chunk per evitare URL troppo lunghi nelle IN()
    const chunkSize = 200;
    for (let i = 0; i < osmIds.length; i += chunkSize) {
      const chunk = osmIds.slice(i, i + chunkSize).map(id => `osm-${id}`);
      const { data } = await supabase.from('shared_pois').select('id').in('id', chunk);
      (data as any[] | null)?.forEach((r) => {
        if (r.id && r.id.startsWith('osm-')) {
          result.add(r.id.replace('osm-', ''));
        }
      });
    }
  } catch (e) {
    console.warn('[poiRepository] findExistingOsmIds', e);
  }
  return result;
}

export interface AutoPoiInput {
  osm_id: string;
  name: string;
  lat: number;
  lon: number;
  category: Poi['category'];
  description?: string;
  description_ai?: string;
}

/** Utility per mappare le categorie stringa AI al set ristretto dell'app */
export function mapItineraryCategoryToMapCategory(aiType: string = ""): Poi['category'] {
  const t = aiType.toLowerCase();
  if (t.match(/museo|galleria|arte|museum|gallery/)) return 'musei';
  if (t.match(/ristorante|cena|pranzo|colazione|degustazione|pub|caff|bar|food/)) return 'locali';
  if (t.match(/monumento|statua|storico|castello|rovina|monument/)) return 'monumenti';
  if (t.match(/chiesa|basilica|cattedrale|duomo|abbazia/)) return 'chiese';
  if (t.match(/parco|giardino|natura|spiaggia|panoramic|viewpoint|park/)) return 'panorami';
  if (t.match(/evento/)) return 'eventi';
  // 'esperienze_locali' non esiste più come categoria mappa: fallback neutro
  return 'monumenti';
}

/** Inserisce POI auto-popolati (source=overpass_auto/foursquare, status=auto). */
export async function insertAutoPois(rows: AutoPoiInput[]): Promise<number> {
  if (rows.length === 0) return 0;
  const payload = rows.map((r) => ({ 
    id: r.osm_id.includes('-') ? r.osm_id : `osm-${r.osm_id}`,
    name: r.name,
    lat: r.lat,
    lon: r.lon,
    category: r.category,
    description: r.description || null,
    description_ai: r.description_ai || null,
    // status='auto', non 'verified': è POI grezzo da Overpass/Foursquare,
    // filtrato da una denylist di 12 parole — non curato. 'verified' spetta
    // solo alla revisione admin. (Allineato al docstring della funzione.)
    status: 'auto',
    alert_radius: 150,
    geofence_radius: 50
  }));
  try {
    const { error } = await supabase
      .from('shared_pois')
      .upsert(payload, { onConflict: 'id', ignoreDuplicates: true });
    if (error) {
      console.warn('[poiRepository] insertAutoPois:', error.message);
      return 0;
    }
    return rows.length;
  } catch (e) {
    console.warn('[poiRepository] insertAutoPois ex', e);
    return 0;
  }
}

/**
 * CROWDSOURCING: garantisce che un POI di fonte terza (OSM/Foursquare/Google/
 * itinerario AI) esista in shared_pois prima di associargli audioguide o
 * dettagli. ignoreDuplicates: mai sovrascrivere un record già curato.
 */
export async function ensureSharedPoi(poi: {
  id: string;
  name: string;
  lat: number;
  lon: number;
  category?: string | null;
  description_short?: string | null;
  description_long?: string | null;
  audio_script?: string | null;
}): Promise<void> {
  if (!poi?.id || !poi?.name || typeof poi.lat !== 'number' || typeof poi.lon !== 'number') return;
  try {
    const { error } = await supabase.from('shared_pois').upsert(
      [{
        id: String(poi.id),
        name: poi.name,
        lat: poi.lat,
        lon: poi.lon,
        category: poi.category || 'monumenti',
        description_short: poi.description_short || null,
        description_long: poi.description_long || null,
        description_ai: poi.description_long || null,
        audio_script: poi.audio_script || null,
        status: 'auto',
        alert_radius: 150,
        geofence_radius: 50,
      }],
      { onConflict: 'id', ignoreDuplicates: true },
    );
    if (error) console.warn('[poiRepository] ensureSharedPoi:', error.message);
  } catch (e) {
    console.warn('[poiRepository] ensureSharedPoi ex', e);
  }
}

// --- Scheda POI (cache-first) ------------------------------------------
export async function getPoiDetails(
  poiId: string,
  language: string,
): Promise<PoiDetails | null> {
  try {
    const { data } = await supabase
      .from('poi_details')
      .select('*')
      .eq('poi_id', poiId)
      .eq('language', language)
      .single();
    return (data as PoiDetails) ?? null;
  } catch {
    return null;
  }
}

export async function upsertPoiDetails(
  details: Partial<PoiDetails> & { poi_id: string; language: string },
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('poi_details')
      .upsert({ ...details, updated_at: new Date().toISOString() }, { onConflict: 'poi_id,language' });
    if (error) {
      console.warn('[poiRepository] upsertPoiDetails error:', error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.warn('[poiRepository] upsertPoiDetails exception', e);
    return false;
  }
}

// --- Audioguide (cache-first) ------------------------------------------
export async function getAudioguide(
  poiId: string,
  language: string,
  character: GuideCharacter,
): Promise<PoiAudioguide | null> {
  try {
    const { data } = await supabase
      .from('poi_audioguides')
      .select('*')
      .eq('poi_id', poiId)
      .eq('language', language)
      .eq('guide_character', character)
      .single();
    return (data as PoiAudioguide) ?? null;
  } catch {
    return null;
  }
}

export async function upsertAudioguide(
  poiId: string,
  language: string,
  character: GuideCharacter,
  audioText: string,
): Promise<void> {
  try {
    await supabase.from('poi_audioguides').upsert(
      {
        poi_id: poiId,
        language,
        guide_character: character,
        audio_text: audioText,
        generated_at: new Date().toISOString(),
      },
      { onConflict: 'poi_id,language,guide_character' },
    );
  } catch (e) {
    console.warn('[poiRepository] upsertAudioguide', e);
  }
}

export async function incrementAudioguidePlay(audioguideId: number): Promise<void> {
  if (!hasRpc()) return;
  try {
    await supabase.rpc('increment_audioguide_play', { target_id: audioguideId });
  } catch (e) {
    console.warn('[poiRepository] incrementAudioguidePlay', e);
  }
}

// --- Impostazioni per-utente per-POI -----------------------------------
export async function getUserPoiSettings(
  userId: string,
  poiId: string,
): Promise<UserPoiSettings | null> {
  try {
    const { data } = await supabase
      .from('user_poi_settings')
      .select('*')
      .eq('user_id', userId)
      .eq('poi_id', poiId)
      .single();
    return (data as UserPoiSettings) ?? null;
  } catch {
    return null;
  }
}

export async function upsertUserPoiSettings(
  settings: Partial<UserPoiSettings> & { user_id: string; poi_id: string },
): Promise<void> {
  try {
    await supabase
      .from('user_poi_settings')
      .upsert({ ...settings, updated_at: new Date().toISOString() }, { onConflict: 'user_id,poi_id' });
  } catch (e) {
    console.warn('[poiRepository] upsertUserPoiSettings', e);
  }
}
