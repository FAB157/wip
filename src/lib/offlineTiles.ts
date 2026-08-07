// Prefetch delle tile raster CARTO per le aree offline.
//
// Il download "mappe offline" storicamente salvava SOLO i dati dei POI: le
// tile di sfondo non venivano mai scaricate, quindi senza rete la mappa
// restava un riquadro vuoto. Questo modulo riempie la stessa cache usata dal
// service worker ('map-tiles-cache', regola StaleWhileRevalidate su
// *.basemaps.cartocdn.com in vite.config.ts): offline il SW risponde con la
// tile in cache e lo sfondo appare.
//
// Gli URL devono combaciare AL BYTE con quelli che Leaflet richiederà: stessa
// scelta del sottodominio ((x+y) % subdomains) e stesso suffisso retina.

const TILE_CACHE_NAME = 'map-tiles-cache';
// ATTENZIONE: deve restare identico ai subdomains del TileLayer in MapArea
// (che non li specifica, quindi usa il default Leaflet 'abc'): la scelta del
// sottodominio entra nell'URL e quindi nella chiave di cache.
const SUBDOMAINS = 'abc';
// Corrisponde al TileLayer di MapArea.tsx.
const TILE_URL_TEMPLATE = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
// Tetto complessivo per download: ~4500 tile ≈ 60–120 MB nel caso peggiore.
const MAX_TILES_PER_AREA = 4500;
const FETCH_CONCURRENCY = 6;

export interface TilePrefetchProgress {
  done: number;
  failed: number;
  total: number;
}

const lon2tile = (lon: number, z: number) => Math.floor(((lon + 180) / 360) * Math.pow(2, z));
const lat2tile = (lat: number, z: number) =>
  Math.floor(
    ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) *
      Math.pow(2, z)
  );

// Stessa logica di L.TileLayer._getSubdomain: deterministica su (x+y).
const subdomainFor = (x: number, y: number) => SUBDOMAINS[Math.abs(x + y) % SUBDOMAINS.length];

// Stessa logica di L.Browser.retina per il segnaposto {r}.
const retinaSuffix = () => (typeof window !== 'undefined' && window.devicePixelRatio > 1 ? '@2x' : '');

const tileUrl = (z: number, x: number, y: number) =>
  TILE_URL_TEMPLATE
    .replace('{s}', subdomainFor(x, y))
    .replace('{z}', String(z))
    .replace('{x}', String(x))
    .replace('{y}', String(y))
    .replace('{r}', retinaSuffix());

const bboxFor = (lat: number, lon: number, radiusKm: number) => {
  const dLat = radiusKm / 111;
  const dLon = radiusKm / (111 * Math.cos((lat * Math.PI) / 180) || 1);
  return { south: lat - dLat, north: lat + dLat, west: lon - dLon, east: lon + dLon };
};

const tilesForLevel = (bbox: { south: number; north: number; west: number; east: number }, z: number): string[] => {
  const xMin = lon2tile(bbox.west, z);
  const xMax = lon2tile(bbox.east, z);
  const yMin = lat2tile(bbox.north, z);
  const yMax = lat2tile(bbox.south, z);
  const urls: string[] = [];
  const max = Math.pow(2, z) - 1;
  for (let x = Math.max(0, xMin); x <= Math.min(max, xMax); x++) {
    for (let y = Math.max(0, yMin); y <= Math.min(max, yMax); y++) {
      urls.push(tileUrl(z, x, y));
    }
  }
  return urls;
};

/**
 * Costruisce l'elenco tile per un'area: tutta l'area agli zoom bassi/medi
 * (panoramica e navigazione), il nucleo centrale (max 10 km) agli zoom di
 * dettaglio. I livelli che sforerebbero il tetto vengono saltati.
 */
export const planTilesForArea = (lat: number, lon: number, radiusKm: number): string[] => {
  const outer = bboxFor(lat, lon, radiusKm);
  const inner = bboxFor(lat, lon, Math.min(radiusKm, 10));
  // Ordine di priorità: prima la copertura larga, poi il dettaglio del centro,
  // infine il dettaglio dell'intera area se il budget lo consente.
  const levels: Array<{ bbox: typeof outer; z: number }> = [
    ...[6, 7, 8, 9, 10, 11, 12].map(z => ({ bbox: outer, z })),
    ...[13, 14, 15].map(z => ({ bbox: inner, z })),
    { bbox: outer, z: 13 },
  ];
  const urls: string[] = [];
  const seen = new Set<string>();
  for (const { bbox, z } of levels) {
    const levelUrls = tilesForLevel(bbox, z).filter(u => !seen.has(u));
    if (urls.length + levelUrls.length > MAX_TILES_PER_AREA) continue;
    levelUrls.forEach(u => { seen.add(u); urls.push(u); });
  }
  return urls;
};

/**
 * Scarica le tile dell'area nella cache del service worker. Tollerante ai
 * singoli errori (una tile mancante non blocca il download); ritorna il
 * conteggio finale. No-op (total=0) dove la Cache API non esiste.
 */
export const prefetchTilesForArea = async (
  lat: number,
  lon: number,
  radiusKm: number,
  onProgress?: (p: TilePrefetchProgress) => void
): Promise<TilePrefetchProgress> => {
  if (typeof caches === 'undefined') return { done: 0, failed: 0, total: 0 };

  const urls = planTilesForArea(lat, lon, radiusKm);
  const cache = await caches.open(TILE_CACHE_NAME);
  const progress: TilePrefetchProgress = { done: 0, failed: 0, total: urls.length };

  let cursor = 0;
  const worker = async () => {
    while (cursor < urls.length) {
      const url = urls[cursor++];
      try {
        if (await cache.match(url)) {
          progress.done++;
        } else {
          const res = await fetch(url, { mode: 'cors' });
          if (res.ok) {
            await cache.put(url, res);
            progress.done++;
          } else {
            progress.failed++;
          }
        }
      } catch {
        progress.failed++;
      }
      if ((progress.done + progress.failed) % 25 === 0) onProgress?.({ ...progress });
    }
  };

  await Promise.all(Array.from({ length: FETCH_CONCURRENCY }, worker));
  onProgress?.({ ...progress });
  return progress;
};

/**
 * Rimuove dalla cache le tile pianificate per un'area (cleanup su delete).
 * `keep` = tile di ALTRE aree ancora scaricate: le zone sovrapposte non
 * vengono toccate (eliminare "Firenze" non deve svuotare metà "Siena").
 */
export const removeTilesForArea = async (
  lat: number,
  lon: number,
  radiusKm: number,
  keep?: Set<string>
): Promise<void> => {
  if (typeof caches === 'undefined') return;
  try {
    const cache = await caches.open(TILE_CACHE_NAME);
    const urls = planTilesForArea(lat, lon, radiusKm).filter(u => !keep?.has(u));
    await Promise.all(urls.map(u => cache.delete(u)));
  } catch { /* best effort */ }
};
