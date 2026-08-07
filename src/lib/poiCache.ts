// Cache in-memory di sessione per schede POI e nomi città.
// LRU con TTL: senza limiti la vecchia versione cresceva per tutta la
// sessione e serviva dati stantii dopo un enrichment.

const POI_CACHE_MAX = 300;
const POI_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minuti

type PoiCacheEntry = { data: any; at: number };
const POI_CACHE = new Map<string, PoiCacheEntry>();

export const getCachedPoiDetails = (id: string | number) => {
  const key = String(id);
  const entry = POI_CACHE.get(key);
  if (!entry) return null;
  if (Date.now() - entry.at > POI_CACHE_TTL_MS) {
    POI_CACHE.delete(key);
    return null;
  }
  // LRU: re-inserisce in coda alla Map
  POI_CACHE.delete(key);
  POI_CACHE.set(key, entry);
  return entry.data;
};

export const setCachedPoiDetails = (id: string | number, data: any) => {
  const key = String(id);
  const existing = POI_CACHE.get(key);
  POI_CACHE.delete(key);
  POI_CACHE.set(key, {
    data: existing ? { ...existing.data, ...data } : data,
    at: Date.now(),
  });
  if (POI_CACHE.size > POI_CACHE_MAX) {
    // La prima chiave della Map è la meno usata di recente
    const oldest = POI_CACHE.keys().next().value;
    if (oldest !== undefined) POI_CACHE.delete(oldest);
  }
};

const CITY_CACHE_MAX = 500;
const CITY_NAME_CACHE = new Map<string, string>();

export const getCachedCityName = (lat: number, lon: number) => {
  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  const exact = CITY_NAME_CACHE.get(key);
  if (exact) return exact;
  // Una cella 0.01° è ~1.1 km: spostandosi di poche centinaia di metri si
  // cambia cella pur restando nella stessa città. Su miss si accettano le
  // 8 celle adiacenti prima di rifare una chiamata a Nominatim.
  for (let dLat = -1; dLat <= 1; dLat++) {
    for (let dLon = -1; dLon <= 1; dLon++) {
      if (dLat === 0 && dLon === 0) continue;
      const neighbor = CITY_NAME_CACHE.get(`${(lat + dLat * 0.01).toFixed(2)},${(lon + dLon * 0.01).toFixed(2)}`);
      if (neighbor) return neighbor;
    }
  }
  return null;
};

export const setCachedCityName = (lat: number, lon: number, name: string) => {
  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  CITY_NAME_CACHE.delete(key);
  CITY_NAME_CACHE.set(key, name);
  if (CITY_NAME_CACHE.size > CITY_CACHE_MAX) {
    const oldest = CITY_NAME_CACHE.keys().next().value;
    if (oldest !== undefined) CITY_NAME_CACHE.delete(oldest);
  }
};
