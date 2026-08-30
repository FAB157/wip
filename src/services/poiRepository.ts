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

/**
 * Cache-priming "per il prossimo utente" via server (POST /api/poi/cache-enrichment).
 * Sostituisce gli update diretti del client su shared_pois, bloccati dall'RLS
 * hardening del 14/08/2026 (UPDATE solo admin). Il server accetta una
 * whitelist di campi e scrive SOLO quelli oggi vuoti sulla riga: il contenuto
 * già pubblicato non è sovrascrivibile. Best-effort: nessun errore all'utente.
 */
export async function primePoiCache(
  poiId: string | number,
  fields: Partial<Record<'description_long' | 'description_ai' | 'description_short' | 'audio_script' | 'image_url' | 'photo_url', string>>,
): Promise<void> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (!token) return;
    const { getApiUrl } = await import('../lib/api');
    await fetch(getApiUrl('/api/poi/cache-enrichment'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ poiId: String(poiId), fields }),
    });
  } catch { /* best-effort */ }
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
    // Dentro il CIRCUIT BREAKER (ITI-14): fino al 28/08/2026 solo
    // get_geofence_pois ci passava, e con Supabase giu' il radar rifaceva le
    // due RPC ogni 15 s fino al timeout di 20 s ciascuna. Con il breaker
    // aperto si legge subito da Dexie, come offline.
    let sharedRes: any;
    let utilityRes: any;
    try {
      [sharedRes, utilityRes] = await supabaseCircuitBreaker.execute(async () => {
        const risultati = await Promise.all([
          supabase.rpc('nearby_pois', {
            p_lat: lat,
            p_lon: lon,
            radius_m: radiusMeters,
            limit_num: 400
          }),
          supabase.rpc('get_utility_pois', {
            user_lat: lat,
            user_lon: lon,
            radius_meters: radiusMeters,
            limit_num: 400
          }),
        ]);
        // Entrambe fallite = problema di rete/DB, conta per il breaker. Una
        // sola fallita (funzione mancante, timeout isolato) NO: l'altra basta.
        if (risultati[0].error && risultati[1].error) throw new Error(risultati[0].error.message || 'rpc failed');
        return risultati;
      });
    } catch (e) {
      console.warn('[poiRepository] nearby RPC non disponibili (breaker/rete): leggo da Dexie', e);
      try {
        const localPois = await db.pois.toArray();
        return localPois
          .filter(isVisiblePoiStatus)
          .filter(p => haversineMeters(lat, lon, p.lat, p.lon) <= radiusMeters)
          .map(p => ({ ...p, distance_meters: haversineMeters(lat, lon, p.lat, p.lon), id: p.id })) as any[];
      } catch {
        return [];
      }
    }

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
      // Salva in Dexie per uso offline. MERGE con i record esistenti: il radar
      // porta solo i campi base (id/nome/coord/categoria/status/foto), ma
      // mirrorPoisToDexie (aree scaricate) può aver già scritto
      // description_ai/audio_script/teaser_text_it per l'ascolto offline. Un
      // bulkPut "magro" li cancellava. Leggiamo prima e sovrascriviamo SOLO i
      // campi del radar, preservando il resto.
      try {
        const ids = pois.map(p => p.id.toString());
        const existingRows = await db.pois.bulkGet(ids);
        const prevById = new Map<string, any>();
        existingRows.forEach((r: any) => { if (r && r.id != null) prevById.set(String(r.id), r); });
        await db.pois.bulkPut(pois.map(p => {
          const prev = prevById.get(p.id.toString()) || {};
          return {
            ...prev,
            id: p.id.toString(),
            name: p.name,
            lat: p.lat,
            lon: p.lon,
            category: p.category || 'monumenti',
            // is_gem reale (non più `premium ?? false`): utility rows portano
            // is_gem=false, i POI curati is_gem=true. Fallback al valore già in
            // Dexie solo se il radar non lo fornisce.
            is_gem: (p as any).is_gem ?? (p as any).premium ?? prev.is_gem ?? false,
            lastUpdated: Date.now(),
            status: p.status ?? prev.status,
            photo_url: (p as any).photo_url || (p as any).image_url || prev.photo_url,
            image_url: (p as any).image_url || (p as any).photo_url || prev.image_url,
          };
        }));
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

  // Degradazione: RPC + fallback diretto + Dexie hanno TUTTI reso vuoto. Il
  // radar resta bianco: segnaliamo (console + evento) così il chiamante può
  // avvisare invece di far sembrare "zona senza POI" un guasto di rete/breaker.
  console.warn('[poiRepository] Radar degradato: nessun POI da RPC/fallback/Dexie (rete o circuit breaker).');
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('wip-radar-degraded', { detail: { source: 'getNearbyPois' } }));
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
export const HIDDEN_POI_STATUSES = new Set(['draft', 'needs_revision', 'rejected', 'hidden']);
export function isVisiblePoiStatus(p: any): boolean {
  return !HIDDEN_POI_STATUSES.has(String(p?.status || '').toLowerCase()) && p?.is_hidden !== true;
}

/**
 * Filtro PIÙ STRETTO per il download offline: oltre a escludere gli status
 * nascosti, scarta anche i record SENZA status (undefined). Motivo: la RPC
 * offline storicamente non ritornava lo status, quindi un draft "senza status"
 * finiva scaricato e, offline (dove il geofencing parte da solo), poteva far
 * scattare un trigger. Un POI legittimo scaricabile ha SEMPRE uno status noto
 * (verified/auto/approved dal merge shared_pois, oppure 'verified' da Overpass).
 */
export function isDownloadablePoiStatus(p: any): boolean {
  const s = String(p?.status || '').toLowerCase();
  if (!s) return false; // status assente → non scaricare (era il buco draft)
  return !HIDDEN_POI_STATUSES.has(s) && p?.is_hidden !== true;
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
  // 'community' e gli otto verticali tematici NON ci sono piu' (22/08/2026):
  // non hanno audioguida per decisione del committente. Vedi
  // guideSettings.SENZA_AUDIOGUIDA.
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
        // I RAGGI GREZZI, come li da' la RPC dal 23/08/2026: null quando il
        // POI non e' mai stato calibrato sul perimetro. E' la differenza che
        // permette al client di NON trattare 50 come un raggio reale e di
        // rispettare lo slider dell'utente anche sotto i 50 m.
        alert_radius: Number(p.alert_radius) > 0 ? Number(p.alert_radius) : null,
        geofence_radius: Number(p.geofence_radius) > 0 ? Number(p.geofence_radius) : null,
        // Ingresso e indirizzo dal pacchetto offline, quando ci sono: senza
        // questi puntoArrivo() ricadrebbe sul centroide anche a bundle scaricato.
        entrance_lat: p.entrance_lat ?? null,
        entrance_lon: p.entrance_lon ?? null,
        address: p.address ?? null,
        address_source: p.address_source ?? null,
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
    // NORMALIZZAZIONE DELLE COLONNE NUOVE (migration 20260823140000).
    // Finche' quella migration non e' applicata la RPC non le restituisce
    // affatto: qui diventano esplicitamente `null`, cosi' i consumatori
    // (foregroundTriggers.triggerRadiusFor, puntoArrivo, puntoArrivoSuStrada)
    // vedono sempre lo stesso oggetto e non devono sapere quale versione
    // della funzione SQL c'e' sul DB.
    //
    // Il numero grezzo NON viene mai sostituito da un default: `null` qui
    // significa "questo POI non e' mai stato calibrato sul perimetro", ed e'
    // l'informazione che permette allo slider dell'utente di scendere sotto
    // i 50 m. eff_* restano quelli della RPC (col coalesce) per i chiamanti
    // che li leggono da sempre.
    const num = (v: any): number | null => (Number(v) > 0 ? Number(v) : null);
    const str = (v: any): string | null => {
      const s = String(v ?? '').trim();
      return s ? s : null;
    };
    const coord = (v: any): number | null => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : null);
    return ((data ?? []) as any[]).map((p) => ({
      ...p,
      entrance_lat: coord(p?.entrance_lat),
      entrance_lon: coord(p?.entrance_lon),
      address: str(p?.address),
      address_source: str(p?.address_source),
      city: str(p?.city),
      alert_radius: num(p?.alert_radius),
      geofence_radius: num(p?.geofence_radius),
    })) as GeofencePoi[];
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
/**
 * Costruisce l'id shared_pois da un osm_id/id-di-fonte, coerente con
 * insertAutoPois: gli id NAMESPACIZZATI (fsq-…, geo-…, iti-…) — che contengono
 * '-' — restano intatti; gli id OSM numerici puri diventano "osm-<n>".
 */
function toSharedPoiId(rawId: string): string {
  return rawId.includes('-') ? rawId : `osm-${rawId}`;
}

/**
 * Ritorna il set degli osm_id (nella STESSA forma passata dal chiamante) già
 * presenti in DB (QUALSIASI status) OPPURE tombstonati.
 *
 * Include i tombstone (shared_pois_tombstones) per NON resuscitare i POI
 * hard-deleted dall'admin: reinserirli farebbe scattare il trigger di
 * untombstone che annulla la cancellazione. Prima, controllando solo
 * shared_pois, la discovery li reinseriva ad ogni giro.
 *
 * La mappatura preserva il namespace: "fsq_abc" → "fsq-abc" (NON "osm-fsq-abc"),
 * evitando le collisioni "osm-<cifre>" che il vecchio prefisso forzato creava.
 */
export async function findExistingOsmIds(osmIds: string[]): Promise<Set<string>> {
  const result = new Set<string>();
  if (osmIds.length === 0) return result;

  // id shared_pois reale → osm_id originale (per restituire la forma attesa).
  const dbIdToOsm = new Map<string, string>();
  for (const osm of osmIds) dbIdToOsm.set(toSharedPoiId(osm), osm);
  const dbIds = [...dbIdToOsm.keys()];

  try {
    // chunk per evitare URL troppo lunghi nelle IN()
    const chunkSize = 200;
    for (let i = 0; i < dbIds.length; i += chunkSize) {
      const chunk = dbIds.slice(i, i + chunkSize);
      const [liveRes, deadRes] = await Promise.all([
        supabase.from('shared_pois').select('id').in('id', chunk),
        supabase.from('shared_pois_tombstones').select('id').in('id', chunk),
      ]);
      (liveRes.data as any[] | null)?.forEach((r) => {
        const osm = dbIdToOsm.get(r.id);
        if (osm) result.add(osm);
      });
      (deadRes.data as any[] | null)?.forEach((r) => {
        const osm = dbIdToOsm.get(r.id);
        if (osm) result.add(osm); // tombstonato → NON reinserire
      });
    }
  } catch (e) {
    console.warn('[poiRepository] findExistingOsmIds', e);
  }
  return result;
}

// --- Dedup cross-source per prossimita' geografica + nome simile --------
/**
 * Normalizza un nome POI per il confronto: minuscolo, senza diacritici,
 * senza punteggiatura, spazi collassati. "Duomo di Milano" e "DUOMO DI
 * MILANO!" normalizzano allo stesso valore.
 */
function normalizePoiNameForCompare(name: string): string {
  return String(name || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // rimuove i diacritici (accenti)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Distanza di Levenshtein classica (DP O(n*m)); i nomi POI sono corti. */
function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[] = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prevDiag = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prevDiag : 1 + Math.min(prevDiag, dp[j], dp[j - 1]);
      prevDiag = tmp;
    }
  }
  return dp[n];
}

/**
 * True se due nomi POI sono abbastanza simili da poter essere lo stesso
 * luogo visto da fonti diverse (es. OSM "Duomo di Milano" vs Foursquare
 * "Duomo"). Soglie scelte:
 * - uno e' sottostringa dell'altro (>=3 char dopo normalizzazione) → match
 *   diretto: molto comune tra fonti diverse avere nomi abbreviati/parziali;
 * - altrimenti Levenshtein normalizzata (distanza / lunghezza massima) <= 0.3
 *   → tollera piccole variazioni di grafia/spazi/abbreviazioni (es. "Chiesa
 *   di San Marco" vs "Chiesa San Marco") senza scambiare per duplicati due
 *   nomi genuinamente diversi (soglia 0.3 = fino al 30% dei caratteri
 *   differenti, valore empirico standard per il fuzzy-matching di toponimi).
 */
function namesAreSimilarEnough(nameA: string, nameB: string): boolean {
  const a = normalizePoiNameForCompare(nameA);
  const b = normalizePoiNameForCompare(nameB);
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length >= 3 && b.length >= 3 && (a.includes(b) || b.includes(a))) return true;
  const dist = levenshteinDistance(a, b);
  const maxLen = Math.max(a.length, b.length);
  return maxLen > 0 && dist / maxLen <= 0.3;
}

/** Raggio (metri) entro cui due POI di fonti diverse con nome simile sono
 * considerati lo stesso luogo. 45m assorbe l'offset GPS/geocoding tipico tra
 * sorgenti diverse (OSM/Foursquare/Geoapify) su un edificio con footprint
 * ampio, restando abbastanza stretto da non confondere due esercizi vicini
 * sulla stessa via. */
const CROSS_SOURCE_DEDUP_RADIUS_METERS = 45;

/**
 * Dedup cross-source: findExistingOsmIds confronta solo l'id esatto della
 * STESSA fonte (stesso nodo OSM ri-scoperto), ma non si accorge di un POI
 * geograficamente vicino con nome simile gia' presente da una fonte diversa
 * (es. gia' inserito via Foursquare con id "fsq-…", poi Overpass lo ritrova
 * con un osm_id diverso → riga duplicata per lo stesso luogo reale). Questa
 * funzione va ad AGGIUNGERSI a findExistingOsmIds, non a sostituirla.
 *
 * Query una singola volta il bounding box che copre tutti i candidati (invece
 * di una RPC per candidato) e confronta localmente con haversineMeters +
 * namesAreSimilarEnough. Ritorna il subset di `candidates` SENZA un match
 * vicino+simile gia' in shared_pois (qualsiasi status/fonte).
 */
export async function filterCrossSourceDuplicates(
  candidates: AutoPoiInput[],
): Promise<AutoPoiInput[]> {
  if (candidates.length === 0) return candidates;
  try {
    // ~gradi equivalenti al raggio di dedup; bounding box approssimato (come
    // il fallback bbox di getNearbyPois quando non c'e' RPC PostGIS diretta
    // per un set di punti sparsi).
    const delta = CROSS_SOURCE_DEDUP_RADIUS_METERS / 111000;
    const lats = candidates.map((c) => c.lat);
    const lons = candidates.map((c) => c.lon);
    const minLat = Math.min(...lats) - delta;
    const maxLat = Math.max(...lats) + delta;
    const minLon = Math.min(...lons) - delta;
    const maxLon = Math.max(...lons) + delta;

    const { data, error } = await supabase
      .from('shared_pois')
      .select('id, name, lat, lon')
      .gte('lat', minLat).lte('lat', maxLat)
      .gte('lon', minLon).lte('lon', maxLon);

    if (error) {
      console.warn('[poiRepository] filterCrossSourceDuplicates query:', error.message);
      return candidates; // in dubbio non blocchiamo l'inserimento per un errore di rete
    }
    const nearby = (data as any[] | null) ?? [];
    if (nearby.length === 0) return candidates;

    const kept: AutoPoiInput[] = [];
    let skipped = 0;
    for (const cand of candidates) {
      const isDuplicate = nearby.some((row) =>
        typeof row.lat === 'number' && typeof row.lon === 'number' &&
        haversineMeters(cand.lat, cand.lon, row.lat, row.lon) <= CROSS_SOURCE_DEDUP_RADIUS_METERS &&
        namesAreSimilarEnough(cand.name, row.name || ''),
      );
      if (isDuplicate) {
        skipped++;
      } else {
        kept.push(cand);
      }
    }
    if (skipped > 0) {
      console.log(`[poiRepository] filterCrossSourceDuplicates: scartati ${skipped}/${candidates.length} candidati (gia' presenti da altra fonte entro ${CROSS_SOURCE_DEDUP_RADIUS_METERS}m con nome simile)`);
    }
    return kept;
  } catch (e) {
    console.warn('[poiRepository] filterCrossSourceDuplicates ex', e);
    return candidates;
  }
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
  // Vocabolario ampliato il 30/08/2026: l'AI degli itinerari non scrive
  // «ristorante», scrive «pranzo» (56 volte sui 93 itinerari salvati), «cena»
  // (36), «colazione», «aperitivo», «enoteca», «catering»… Prima finivano
  // tutti nel fallback 'monumenti', cioe' una cena diventava un monumento.
  if (t.match(/ristorante|osteria|trattoria|pizzeria|cena|pranzo|colazione|brunch|merenda|aperitivo|degustazione|enogastronom|gastronom|enoteca|pub|caff|bar|food|cibo|catering|agriturismo/)) return 'locali';
  if (t.match(/monumento|statua|storico|castello|castle|rovina|rocca|fortezza|torre|palazzo|monument|archeolog|nuraghe/)) return 'monumenti';
  if (t.match(/chiesa|basilica|cattedrale|duomo|abbazia|santuario|cappella|church|monastero/)) return 'chiese';
  // «panoram» e non «panoramic»: l'AI scrive «panorama», che con la vecchia
  // espressione NON veniva riconosciuto e cadeva nel fallback 'monumenti'
  // (30/08/2026 — sette Monte/Poggio finiti fra i monumenti).
  if (t.match(/parco|giardino|natura|spiaggia|panoram|viewpoint|park|isola|lago|monte|vetta|cascata|mare|paesaggio|vista/)) return 'panorami';
  if (t.match(/evento/)) return 'eventi';
  // Stazioni, porti, aeroporti: sono luoghi veri, ma di servizio — categoria
  // 'utilita', non 'monumenti' (30/08/2026, «ogni tappa la sua categoria»).
  if (t.match(/stazione|aeroporto|porto|trasporto|traghetto|metro/)) return 'utilita';
  // 'esperienze_locali' non esiste più come categoria mappa: fallback neutro
  return 'monumenti';
}

/**
 * Questa tappa è un LUOGO, e quindi diventa un POI in shared_pois? (30/08/2026)
 *
 * Regola: ogni tappa va nella sua categoria — i pasti in 'locali', le stazioni
 * in 'utilita', i musei in 'musei'. Non si esclude nulla per il timore che
 * «parli»: il presidio contro le audioguide fuori posto sta già al livello
 * giusto, in AUDIOGUIDABLE_CATEGORIES (qui sotto), dove 'locali' e 'utilita'
 * NON compaiono. Una cena finisce sulla mappa fra i locali e non parla.
 *
 * Restano fuori SOLO le tappe che non sono un posto:
 *  • 'trasferimento' e 'spostamento' — nel roadtrip sono le coordinate del
 *    centro della città di arrivo, non un luogo visitabile: come POI il
 *    servizio nativo scatterebbe passando vicino alla città;
 *  • 'pausa' — non ha un luogo per definizione.
 */
const TAPPE_NON_LUOGO = /pausa|spostamento|trasferimento/;

export function tappaDiventaPoi(aiType: string = ""): boolean {
  return !TAPPE_NON_LUOGO.test(String(aiType).toLowerCase());
}

/** Inserisce POI auto-popolati (source=overpass_auto/foursquare, status=auto). */
export async function insertAutoPois(rows: AutoPoiInput[]): Promise<number> {
  if (rows.length === 0) return 0;
  const payload = rows.map((r) => ({
    id: toSharedPoiId(r.osm_id),
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

/**
 * NO-OP lato client: poi_details è scrivibile SOLO server-side (RLS chiusa).
 * La persistenza avviene dentro /api/poi/enrich (service role). Manteniamo la
 * firma (ritorna true) per non far scattare falsi fallimenti nei chiamanti.
 */
export async function upsertPoiDetails(
  _details: Partial<PoiDetails> & { poi_id: string; language: string },
): Promise<boolean> {
  // Scrittura rimossa: un upsert client su poi_details verrebbe negato dalla RLS.
  return true;
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

/**
 * NO-OP lato client: poi_audioguides è scrivibile SOLO server-side (RLS chiusa).
 * La persistenza per-lingua avviene nella route get-or-create /api/poi/audioguide
 * (service role), popolata dal prefetch nativo e da getOrCreateAudioguideText.
 * Manteniamo la firma perché è chiamata anche da server.ts (dove il write via
 * client anon sarebbe comunque negato dalla RLS) e da PoiDetailSheet.
 */
export async function upsertAudioguide(
  _poiId: string,
  _language: string,
  _character: GuideCharacter,
  _audioText: string,
): Promise<void> {
  // Scrittura rimossa: un upsert client su poi_audioguides verrebbe negato
  // dalla RLS. Il testo mostrato resta valido per la sessione; la cache
  // condivisa viene popolata server-side dalla route get-or-create.
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
