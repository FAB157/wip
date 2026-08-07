// Coda globale per il reverse geocoding Nominatim (via proxy /api/nominatim).
// La policy OSM impone max 1 req/sec: qui le richieste vengono serializzate
// con almeno MIN_INTERVAL_MS di distanza, deduplicate per cella (stessa
// chiave di poiCache) e risolte dalla cache quando possibile. Tutti i punti
// dell'app che vogliono un nome città da coordinate devono passare da qui,
// mai da fetch diretto.

import { getApiUrl } from "./api";
import { getCachedCityName, setCachedCityName } from "./poiCache";

const MIN_INTERVAL_MS = 1200;
// Backoff per le celle senza risultato (mare, campagna): evita di ritentare
// la stessa cella a ogni pan della mappa.
const MISS_RETRY_MS = 5 * 60 * 1000;

const cellKey = (lat: number, lon: number) => `${lat.toFixed(2)},${lon.toFixed(2)}`;

const pending = new Map<string, Promise<string>>();
const missedAt = new Map<string, number>();
let lastRequestAt = 0;
let chain: Promise<void> = Promise.resolve();

/**
 * Nome città per le coordinate, con throttle globale a 1 req/1.2s.
 * Risolve "" se Nominatim non trova nulla o la richiesta fallisce.
 */
export function fetchCityNameQueued(lat: number, lon: number): Promise<string> {
  const cached = getCachedCityName(lat, lon);
  if (cached) return Promise.resolve(cached);

  const key = cellKey(lat, lon);

  const miss = missedAt.get(key);
  if (miss && Date.now() - miss < MISS_RETRY_MS) return Promise.resolve("");

  const inFlight = pending.get(key);
  if (inFlight) return inFlight;

  const p = new Promise<string>((resolve) => {
    chain = chain.then(async () => {
      // La cache può essersi popolata mentre eravamo in coda
      const hit = getCachedCityName(lat, lon);
      if (hit) { resolve(hit); return; }

      const wait = lastRequestAt + MIN_INTERVAL_MS - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      lastRequestAt = Date.now();

      try {
        const res = await fetch(getApiUrl(`/api/nominatim/reverse?lat=${lat}&lon=${lon}`));
        if (res.ok) {
          const data = await res.json().catch(() => null);
          const city =
            data?.address?.city ||
            data?.address?.town ||
            data?.address?.village ||
            "";
          if (city) {
            setCachedCityName(lat, lon, city);
          } else {
            missedAt.set(key, Date.now());
          }
          resolve(city);
          return;
        }
      } catch {
        /* rete assente o proxy giù: trattato come miss temporaneo */
      }
      missedAt.set(key, Date.now());
      resolve("");
    });
  });

  pending.set(key, p);
  p.finally(() => pending.delete(key));
  return p;
}
