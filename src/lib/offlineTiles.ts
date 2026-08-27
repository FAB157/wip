// Prefetch delle tile raster CARTO per le aree offline + layer Leaflet che le
// rilegge dalla Cache API SENZA passare dal service worker.
//
// Il download "mappe offline" storicamente salvava SOLO i dati dei POI: le
// tile di sfondo non venivano mai scaricate, quindi senza rete la mappa
// restava un riquadro vuoto. Questo modulo riempie la cache 'map-tiles-cache'
// (stessa regola StaleWhileRevalidate su *.basemaps.cartocdn.com in
// vite.config.ts).
//
// PERCHÉ IL SERVICE WORKER NON BASTA (verificato 22/08/2026): su iOS la
// WebView Capacitor gira su schema custom `capacitor://localhost` e WKWebView
// NON supporta i service worker su schema custom — il SW di VitePWA non si
// registra mai, e il SW era l'unico a restituire le tile dalla cache. Risultato:
// 60-120 MB scaricati e mappa vuota offline. Cambiare `iosScheme` non è
// un'opzione (cambierebbe l'origine della WebView e cancellerebbe localStorage
// e IndexedDB degli utenti già installati).
// La Cache API invece è accessibile da JavaScript su TUTTE le piattaforme:
// `createCachedTileLayer` legge le tile da lì direttamente, quindi funziona
// identico su iOS, Android e web, con o senza service worker.
//
// Gli URL devono combaciare AL BYTE con quelli che Leaflet richiederà: stessa
// scelta del sottodominio ((x+y) % subdomains) e stesso suffisso retina.

import L from 'leaflet';

const TILE_CACHE_NAME = 'map-tiles-cache';
// ATTENZIONE: deve restare identico ai subdomains del TileLayer in MapArea
// (che non li specifica, quindi usa il default Leaflet 'abc'): la scelta del
// sottodominio entra nell'URL e quindi nella chiave di cache.
const SUBDOMAINS = 'abc';
// Corrisponde al TileLayer di MapArea.tsx. CARTO richiede la chiave gratuita
// dal 26/08/2026 (watermark "API KEY REQUIRED" sull'accesso anonimo).
const TILE_URL_TEMPLATE = `https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?key=${import.meta.env.VITE_CARTO_API_KEY || ''}`;
// Tetto complessivo per download: ~4500 tile.
const MAX_TILES_PER_AREA = 4500;
const FETCH_CONCURRENCY = 6;

// Zoom massimo effettivamente SCARICATO (vedi planTilesForArea). Oltre questo
// livello non si scarica nulla: le tile si sovrascalano (maxNativeZoom).
export const MAX_ZOOM_SCARICATO = 15;

// Peso medio misurato di una tile CARTO voyager @2x: 40-90 KB (la stima
// storica di 30 KB era 2-3 volte sotto il vero, e l'utente si ritrovava a
// scaricare il triplo di quanto gli era stato detto).
const KB_TILE_MIN = 40;
const KB_TILE_MEDIO = 60;
const KB_TILE_MAX = 90;
// Dati POI/testi del pacchetto, oltre alle tile.
const BYTES_DATI_POI = 5 * 1024 * 1024;

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

export interface PianoTile {
  urls: string[];
  /** Livelli di zoom saltati per non sforare MAX_TILES_PER_AREA. Prima
   *  venivano saltati IN SILENZIO: ora finiscono nel riepilogo all'utente. */
  livelliSaltati: number[];
}

/**
 * Costruisce l'elenco tile per un'area: tutta l'area agli zoom bassi/medi
 * (panoramica e navigazione), il nucleo centrale (max 10 km) agli zoom di
 * dettaglio. I livelli che sforerebbero il tetto vengono saltati (e segnalati).
 *
 * OLTRE LO ZOOM 15 NON SI SCARICA NULLA, DI PROPOSITO: ogni livello in più
 * QUADRUPLICA il numero di tile (lo zoom 16 sul solo nucleo da 10 km sono già
 * ~2.300 tile, il 17 quasi 10.000) e il tetto salterebbe subito. Chi cammina e
 * zooma non vede grigio lo stesso: il layer offline sovrascala le tile dello
 * zoom 15 (`maxNativeZoom`, vedi createCachedTileLayer) — mappa sfocata invece
 * che vuota. Grafica inferiore, zoom mantenuto.
 */
export const planTilesForAreaDettaglio = (lat: number, lon: number, radiusKm: number): PianoTile => {
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
  const livelliSaltati: number[] = [];
  for (const { bbox, z } of levels) {
    const levelUrls = tilesForLevel(bbox, z).filter(u => !seen.has(u));
    if (urls.length + levelUrls.length > MAX_TILES_PER_AREA) {
      if (levelUrls.length > 0 && !livelliSaltati.includes(z)) livelliSaltati.push(z);
      continue;
    }
    levelUrls.forEach(u => { seen.add(u); urls.push(u); });
  }
  return { urls, livelliSaltati };
};

export const planTilesForArea = (lat: number, lon: number, radiusKm: number): string[] =>
  planTilesForAreaDettaglio(lat, lon, radiusKm).urls;

export interface StimaDownload {
  tile: number;
  /** Intervallo onesto in MB (solo tile): le CARTO @2x pesano 40-90 KB. */
  mbMin: number;
  mbMax: number;
  /** Byte totali attesi (tile al peso medio + dati POI): per il check spazio. */
  byteAttesi: number;
  livelliSaltati: number[];
}

/** Stima da mostrare PRIMA che il download parta. */
export const stimaDownloadArea = (lat: number, lon: number, radiusKm: number): StimaDownload => {
  const { urls, livelliSaltati } = planTilesForAreaDettaglio(lat, lon, radiusKm);
  const mb = (kb: number) => Math.round((urls.length * kb) / 1024);
  return {
    tile: urls.length,
    mbMin: mb(KB_TILE_MIN),
    mbMax: mb(KB_TILE_MAX),
    byteAttesi: urls.length * KB_TILE_MEDIO * 1024 + BYTES_DATI_POI,
    livelliSaltati,
  };
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
  // La lista delle aree scaricate è cambiata: il layer la rilegge.
  invalidaAreeScaricate();
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
  invalidaAreeScaricate();
};

// ─────────────────────────────────────────────────────────────────────────────
// LAYER LEAFLET CHE LEGGE DALLA CACHE API (niente service worker)
// ─────────────────────────────────────────────────────────────────────────────

/** Aree/pacchetti già scaricati, per decidere se vale la pena mettere in cache
 *  una tile presa dalla rete. Import dinamici: nessun ciclo fra i moduli. */
let areeCache: Array<{ lat: number; lon: number; radiusKm: number }> | null = null;
let areePending: Promise<Array<{ lat: number; lon: number; radiusKm: number }>> | null = null;

export const invalidaAreeScaricate = () => { areeCache = null; areePending = null; };

const areeScaricate = (): Promise<Array<{ lat: number; lon: number; radiusKm: number }>> => {
  if (areeCache) return Promise.resolve(areeCache);
  if (!areePending) {
    areePending = (async () => {
      const out: Array<{ lat: number; lon: number; radiusKm: number }> = [];
      try {
        const { getOfflineMapAreasList } = await import('./offlineStorage');
        for (const a of (await getOfflineMapAreasList()) || []) {
          if (a?.center) out.push({ lat: a.center.lat, lon: a.center.lon, radiusKm: a.radiusKm });
        }
      } catch { /* web senza aree salvate */ }
      try {
        const { listOfflinePackages } = await import('../services/offlinePackageService');
        for (const p of (await listOfflinePackages()) || []) {
          out.push({ lat: p.centerLat, lon: p.centerLon, radiusKm: p.radiusKm });
        }
      } catch { /* nativo non disponibile */ }
      areeCache = out;
      return out;
    })();
  }
  return areePending;
};

const tile2lon = (x: number, z: number) => (x / Math.pow(2, z)) * 360 - 180;
const tile2lat = (y: number, z: number) => {
  const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, z);
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
};

const distKm = (aLat: number, aLon: number, bLat: number, bLon: number) => {
  const dLat = (bLat - aLat) * 111;
  const dLon = (bLon - aLon) * 111 * Math.cos((aLat * Math.PI) / 180);
  return Math.sqrt(dLat * dLat + dLon * dLon);
};

/** La tile cade dentro un'area scaricata? (margine 20%: le bbox del piano sono
 *  quadrate, il raggio è un cerchio). */
const dentroAreaScaricata = async (coords: { x: number; y: number; z: number }) => {
  const aree = await areeScaricate();
  if (aree.length === 0) return false;
  const lat = tile2lat(coords.y + 0.5, coords.z);
  const lon = tile2lon(coords.x + 0.5, coords.z);
  return aree.some(a => distKm(a.lat, a.lon, lat, lon) <= a.radiusKm * 1.2);
};

const daCacheApi = async (url: string): Promise<Blob | null> => {
  if (typeof caches === 'undefined') return null;
  try {
    const cache = await caches.open(TILE_CACHE_NAME);
    const res = await cache.match(url);
    if (!res || !res.ok) return null;
    return await res.blob();
  } catch {
    return null;
  }
};

const inRete = () => (typeof navigator === 'undefined' ? true : navigator.onLine !== false);

/**
 * TileLayer che, per OGNI tile:
 *   1. prova `caches.match(url)` — se c'è, la disegna da lì (objectURL);
 *   2. altrimenti va in rete come sempre; se la tile appartiene a un'area
 *      scaricata la mette anche in cache (una sola richiesta, non due);
 *   3. in caso di errore ricade sul comportamento di prima (`img.src = url`),
 *      così restano validi errorTileUrl e il retry di Leaflet.
 *
 * L'URL è quello costruito da `L.TileLayer.getTileUrl` — cioè ESATTAMENTE
 * quello di oggi: stesso template, subdomain 'abc' scelto con
 * `Math.abs(x+y) % 3` (`_getSubdomain`), suffisso '@2x' se
 * `devicePixelRatio > 1` (`L.Browser.retina`). È la stessa chiave che scrive
 * `tileUrl()` qui sopra: se cambia una delle due, la cache non colpisce più.
 *
 * OFFLINE + ZOOM: quando la rete manca si abbassa `maxNativeZoom` allo zoom
 * massimo scaricato (15): Leaflet smette di chiedere tile che non esistono in
 * cache e INGRANDISCE quelle del 15. L'utente zooma fino al 19 e vede sfocato
 * invece che grigio. Online il limite si toglie subito, per non degradare la
 * mappa dove le tile vere ci sono. (Raffinamento possibile in futuro: pescare
 * la tile "genitore" dalla cache e ritagliarne il quadrante giusto, tile per
 * tile — più preciso, molto più codice; questa strada basta.)
 */
const CachedTileLayer = L.TileLayer.extend({
  createTile(this: any, coords: { x: number; y: number; z: number }, done: Function) {
    const tile = document.createElement('img');

    L.DomEvent.on(tile, 'load', L.Util.bind(this._tileOnLoad, this, done, tile));
    L.DomEvent.on(tile, 'error', L.Util.bind(this._tileOnError, this, done, tile));

    if (this.options.crossOrigin || this.options.crossOrigin === '') {
      tile.crossOrigin = this.options.crossOrigin === true ? '' : this.options.crossOrigin;
    }
    tile.alt = '';
    tile.setAttribute('role', 'presentation');

    const url = this.getTileUrl(coords);

    (async () => {
      // 1) cache
      const blob = await daCacheApi(url);
      if (blob) {
        if ((tile as any)._wipMorta) return;
        const obj = URL.createObjectURL(blob);
        (tile as any)._wipObjectUrl = obj;
        tile.src = obj;
        return;
      }
      // 2) rete + eventuale riempimento cache
      if (inRete() && typeof caches !== 'undefined') {
        try {
          if (await dentroAreaScaricata(coords)) {
            const res = await fetch(url, { mode: 'cors' });
            if (res.ok) {
              const copia = res.clone();
              const b = await res.blob();
              try { (await caches.open(TILE_CACHE_NAME)).put(url, copia); } catch { /* quota */ }
              if ((tile as any)._wipMorta) return;
              const obj = URL.createObjectURL(b);
              (tile as any)._wipObjectUrl = obj;
              tile.src = obj;
              return;
            }
          }
        } catch { /* si ricade sull'img classica */ }
      }
      // 3) comportamento identico a prima
      if (!(tile as any)._wipMorta) tile.src = url;
    })();

    return tile;
  },
});

export interface OpzioniLayerTile {
  attribution?: string;
  /** Zoom oltre il quale, OFFLINE, si sovrascala invece di scaricare. */
  maxNativeZoomOffline?: number;
}

/**
 * Crea il layer e lo aggancia agli eventi online/offline. Ritorna il layer e
 * la funzione di pulizia (revoca degli objectURL e rimozione dei listener):
 * senza revoca ogni tile disegnata resterebbe in memoria finché vive la pagina.
 */
export const createCachedTileLayer = (
  url: string,
  opzioni: OpzioniLayerTile = {}
): { layer: L.TileLayer; dispose: () => void } => {
  const maxNativeOffline = opzioni.maxNativeZoomOffline ?? MAX_ZOOM_SCARICATO;
  const layer = new (CachedTileLayer as any)(url, {
    attribution: opzioni.attribution,
  }) as L.TileLayer;

  // Revoca degli objectURL: 'tileunload' scatta quando Leaflet butta la tile.
  const suUnload = (e: any) => {
    const tile = e?.tile;
    if (!tile) return;
    tile._wipMorta = true;
    if (tile._wipObjectUrl) {
      URL.revokeObjectURL(tile._wipObjectUrl);
      tile._wipObjectUrl = null;
    }
  };
  layer.on('tileunload', suUnload);

  const applicaLimite = () => {
    const opts = (layer as any).options;
    const nuovo = inRete() ? undefined : maxNativeOffline;
    if (opts.maxNativeZoom === nuovo) return;
    opts.maxNativeZoom = nuovo;
    // _resetView ricalcola il clamp dello zoom (redraw() da solo non basta).
    try { (layer as any)._resetView?.(); } catch { /* layer non ancora sulla mappa */ }
  };
  applicaLimite();
  window.addEventListener('online', applicaLimite);
  window.addEventListener('offline', applicaLimite);

  const dispose = () => {
    window.removeEventListener('online', applicaLimite);
    window.removeEventListener('offline', applicaLimite);
    layer.off('tileunload', suUnload);
    const container = (layer as any)._container as HTMLElement | undefined;
    container?.querySelectorAll('img').forEach((img: any) => {
      if (img._wipObjectUrl) { URL.revokeObjectURL(img._wipObjectUrl); img._wipObjectUrl = null; }
    });
  };

  return { layer, dispose };
};
