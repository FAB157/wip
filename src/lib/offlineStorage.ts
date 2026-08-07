import { get, set, del, keys } from 'idb-keyval';
import { db } from './db';
import { supabase } from './supabase';

export interface OfflineItinerarySummary {
  id: string;
  title: string;
  date: number;
}

export const saveOfflineItinerary = async (id: string, data: any) => {
  await set(`itinerary_${id}`, data);
  
  const list = await get('offline_itineraries_list') as OfflineItinerarySummary[] || [];
  if (!list.find(i => i.id === id)) {
    list.push({ id, title: data.titolo || "Itinerario offline", date: Date.now() });
    await set('offline_itineraries_list', list);
  }
};

export const getOfflineItinerariesList = async () => {
  return await get('offline_itineraries_list') as OfflineItinerarySummary[] || [];
};

export const getOfflineItinerary = async (id: string) => {
  return await get(`itinerary_${id}`);
};

export const deleteOfflineItinerary = async (id: string) => {
  await del(`itinerary_${id}`);
  let list = await get('offline_itineraries_list') as OfflineItinerarySummary[] || [];
  list = list.filter(i => i.id !== id);
  await set('offline_itineraries_list', list);
};

export const saveOfflineAudio = async (url: string, id: string) => {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    await set(`audio_${id}`, blob);
    return true;
  } catch (error) {
    console.error("Failed to save audio offline", error);
    return false;
  }
};

export const getOfflineAudioUrl = async (id: string) => {
  const blob = await get(`audio_${id}`) as Blob;
  if (blob) {
    return URL.createObjectURL(blob);
  }
  return null;
};

export interface OfflineMapArea {
  id: string; // e.g. "roma_100km"
  name: string; // e.g. "Roma (100km)"
  center: { lat: number; lon: number };
  radiusKm: number;
  date: number;
  poiCount: number;
  lastSync?: number; // ultima riconciliazione con Supabase
}

/**
 * Mirroring dei POI in Dexie (db.pois): è la tabella che poiRepository legge
 * quando manca la rete. Senza questo mirror i POI delle aree scaricate
 * restavano solo in idb-keyval e la mappa offline non li vedeva mai.
 */
export const mirrorPoisToDexie = async (pois: any[]) => {
  if (!Array.isArray(pois) || pois.length === 0) return;
  try {
    await db.pois.bulkPut(pois
      .filter(p => p && p.id && typeof p.lat === 'number' && typeof p.lon === 'number')
      .map(p => ({
        id: String(p.id),
        name: p.name || p.nome || '',
        lat: p.lat,
        lon: p.lon,
        category: p.category || 'monumenti',
        subCategory: p.subCategory,
        is_gem: p.is_gem ?? false,
        description: p.description,
        description_short: p.description_short,
        description_long: p.description_long,
        description_ai: p.description_ai,
        audio_script: p.audio_script,
        teaser_text_it: p.teaser_text_it,
        practical_info: p.practical_info,
        image_url: p.image_url || p.photo_url,
        photo_url: p.photo_url || p.image_url,
        status: p.status,
        lastUpdated: Date.now(),
      })));
  } catch (e) {
    console.warn('[OfflineStorage] Mirror Dexie fallito:', e);
  }
};

export const saveOfflineMapArea = async (area: OfflineMapArea, pois: any[]) => {
  await set(`offline_area_pois_${area.id}`, pois);
  await mirrorPoisToDexie(pois);

  const list = await get('offline_map_areas_list') as OfflineMapArea[] || [];
  const existingIndex = list.findIndex(a => a.id === area.id);
  if (existingIndex >= 0) {
    list[existingIndex] = area;
  } else {
    list.push(area);
  }
  await set('offline_map_areas_list', list);
};

export const getOfflineMapAreasList = async () => {
  return await get('offline_map_areas_list') as OfflineMapArea[] || [];
};

export const deleteOfflineMapArea = async (id: string) => {
  await del(`offline_area_pois_${id}`);
  let list = await get('offline_map_areas_list') as OfflineMapArea[] || [];
  list = list.filter(a => a.id !== id);
  await set('offline_map_areas_list', list);
};

export const getAllOfflinePois = async () => {
  const areas = await getOfflineMapAreasList();
  let allPois: any[] = [];
  for (const area of areas) {
    const pois = await get(`offline_area_pois_${area.id}`) as any[];
    if (pois) {
      allPois = allPois.concat(pois);
    }
  }
  
  // Deduplicazione per evitare doppioni se due aree si sovrappongono
  const uniquePoisMap = new Map();
  for (const poi of allPois) {
    uniquePoisMap.set(poi.id, poi);
  }
  
  return Array.from(uniquePoisMap.values());
};

/**
 * Salva la "scheda" testuale di un POI nel formato che PoiDetailSheet legge
 * quando è offline (chiave localStorage `offline_poi_<id>`): descrizione,
 * dati di viaggio e testo guida già generato.
 */
export const saveOfflinePoiSheet = (
  poiId: string,
  payload: { wikiData?: any; tripData?: any; parkingData?: any; generatedText?: string | null },
) => {
  try {
    localStorage.setItem(`offline_poi_${poiId}`, JSON.stringify({ cachedOfflineData: payload, savedAt: Date.now() }));
  } catch (e) {
    console.warn('[OfflineStorage] saveOfflinePoiSheet fallito:', e);
  }
};

// ── Riconciliazione online ────────────────────────────────────────────────
// Quando l'utente torna online, le aree scaricate vengono aggiornate da
// Supabase (nuovi POI crowdsourced, descrizioni e audio_script generati da
// altri utenti nel frattempo). Throttle: max una sync per area ogni 24h.

const SYNC_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const SYNC_FIELDS = 'id,name,lat,lon,category,status,is_gem,description,description_short,description_long,description_ai,audio_script,practical_info,image_url,photo_url,teaser_text_it';

export const syncOfflineAreasIfStale = async (maxAgeMs = SYNC_MAX_AGE_MS) => {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  const list = await get('offline_map_areas_list') as OfflineMapArea[] || [];
  if (list.length === 0) return;

  let touched = false;
  for (const area of list) {
    if (Date.now() - (area.lastSync ?? 0) < maxAgeMs) continue;
    try {
      const deltaLat = area.radiusKm / 111;
      const deltaLon = area.radiusKm / (111 * Math.cos((area.center.lat * Math.PI) / 180) || 1);
      const { data, error } = await supabase
        .from('shared_pois')
        .select(SYNC_FIELDS)
        .gte('lat', area.center.lat - deltaLat)
        .lte('lat', area.center.lat + deltaLat)
        .gte('lon', area.center.lon - deltaLon)
        .lte('lon', area.center.lon + deltaLon)
        .in('status', ['verified', 'auto', 'approved', 'draft'])
        .not('name', 'is', null)
        .limit(3000);
      if (error || !data) continue;

      // Merge: i dati freschi da Supabase vincono, ma i POI locali che il
      // server non conosce (es. Overpass-only) restano.
      const stored = (await get(`offline_area_pois_${area.id}`) as any[]) || [];
      const merged = new Map<string, any>();
      for (const p of stored) merged.set(String(p.id), p);
      for (const p of data as any[]) merged.set(String(p.id), { ...merged.get(String(p.id)), ...p });
      const mergedList = Array.from(merged.values());

      await set(`offline_area_pois_${area.id}`, mergedList);
      await mirrorPoisToDexie(mergedList);
      area.lastSync = Date.now();
      area.poiCount = mergedList.length;
      touched = true;
      console.log(`[OfflineStorage] Area "${area.name}" sincronizzata: ${mergedList.length} POI`);
    } catch (e) {
      console.warn(`[OfflineStorage] Sync area ${area.id} fallita:`, e);
    }
  }
  if (touched) await set('offline_map_areas_list', list);
};

// Auto-registrazione: sync quando la rete torna, e un check all'avvio.
if (typeof window !== 'undefined') {
  const w = window as any;
  if (!w.__wipOfflineSyncRegistered) {
    w.__wipOfflineSyncRegistered = true;
    window.addEventListener('online', () => { syncOfflineAreasIfStale().catch(() => {}); });
    setTimeout(() => {
      if (navigator.onLine) syncOfflineAreasIfStale().catch(() => {});
    }, 8000);
  }
}

/**
 * 🧹 Garbage Collection: Rimuove i file audio orfani (mp3 scaricati che non appartengono più
 * ai preferiti o all'itinerario attuale) per risparmiare spazio sul dispositivo.
 */
export const clearOrphanedAudioFiles = async (activePoiIds: string[]) => {
  try {
    const allKeys = await keys();
    const audioKeys = allKeys.filter(k => typeof k === 'string' && k.startsWith('audio_'));

    let deletedCount = 0;
    for (const key of audioKeys) {
      // La chiave è tipo 'audio_poiId_guideMode'
      const poiId = (key as string).split('_')[1];
      if (poiId && !activePoiIds.includes(poiId)) {
        await del(key);
        deletedCount++;
      }
    }
    if (deletedCount > 0) {
      console.log(`[OfflineStorage] Pulizia completata: rimosse ${deletedCount} audioguide orfane.`);
    }
  } catch (error) {
    console.warn("[OfflineStorage] Errore durante la pulizia audio:", error);
  }
};
