// =====================================================================
// Allarme ZTL (Zone a Traffico Limitato) — il dolore n°1 del turista
// in auto in Italia: entrare in ZTL senza accorgersene = multa.
//
// - Perimetri ZTL da Overpass (boundary=traffic_zone + name~ZTL) attorno
//   alla posizione, raggio 15 km, cache localStorage 7 giorni per cella
//   di ~11 km (1 decimale).
// - startZtlWatch(): ascolta 'wip-location-update' (stesso pattern di
//   gpsReplay.ts). SOLO quando la velocità recente suggerisce un veicolo
//   (>20 km/h con isteresi: sotto 8 km/h sostenuti si torna "a piedi")
//   fa point-in-polygon (ray casting) sulla posizione E sulla proiezione
//   del movimento (bearing + 150 m) per il pre-avviso.
// - Anti-spam: max 1 avviso per zona per ora (localStorage).
//
// Logica pura, nessuna dipendenza da Leaflet/React: MapArea usa
// fetchZtlZonesAround() anche per disegnare i poligoni.
//
// LIMITE DICHIARATO: copertura basata su OpenStreetMap — non tutte le
// ZTL italiane sono mappate. L'avviso è un aiuto, mai un sostituto
// della segnaletica (il toggle in MapArea lo dice all'attivazione).
// =====================================================================

/** Un anello del perimetro: coppie [lat, lon], primo ≈ ultimo punto. */
export type ZtlRing = Array<[number, number]>;

export interface ZtlZone {
  id: string;
  name: string;
  /** Anelli esterni del perimetro (gli eventuali "buchi" sono ignorati:
   *  rarissimi nelle ZTL e sbagliare per eccesso di prudenza va bene). */
  rings: ZtlRing[];
}

export interface ZtlAlertEvent {
  zone: ZtlZone;
  /** true = pre-avviso (la proiezione del movimento entra nella zona),
   *  false = sei già dentro il perimetro. */
  preWarning: boolean;
}

const RADIUS_M = 15000;                         // raggio di ricerca ZTL
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;   // 7 giorni
const FETCH_TIMEOUT_MS = 25000;
const MAX_ZONES = 120;
const PROJECTION_M = 150;                       // pre-avviso: 150 m avanti
const ALERT_COOLDOWN_MS = 60 * 60 * 1000;       // 1 avviso/zona/ora
const ALERTED_KEY = 'wip_ztl_alerted';
const REFETCH_DISTANCE_M = 5000;                // nuova query oltre 5 km
const FETCH_RETRY_MS = 5 * 60 * 1000;           // dopo un fallimento

// Isteresi veicolo: si "sale in auto" sopra 20 km/h, si "scende" solo
// quando la velocità resta sotto 8 km/h per più fix (niente flip ai
// semafori, come l'isteresi 12/6 del nativo in guideSettings).
const VEHICLE_ENTER_KMH = 20;
const VEHICLE_EXIT_KMH = 8;

// Endpoint primario + fallback (stessi mirror di servicesLayer.ts)
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

// ── Geometria ─────────────────────────────────────────────────────────

function distanceM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(Math.min(1, a)));
}

/** Ray casting classico: il punto è dentro l'anello? */
function pointInRing(lat: number, lon: number, ring: ZtlRing): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [latI, lonI] = ring[i];
    const [latJ, lonJ] = ring[j];
    const intersects = ((latI > lat) !== (latJ > lat)) &&
      (lon < (lonJ - lonI) * (lat - latI) / (latJ - latI) + lonI);
    if (intersects) inside = !inside;
  }
  return inside;
}

function pointInZone(lat: number, lon: number, zone: ZtlZone): boolean {
  return zone.rings.some(r => pointInRing(lat, lon, r));
}

/** Proietta un punto di `meters` metri lungo il bearing (gradi da Nord). */
function projectPoint(lat: number, lon: number, bearingDeg: number, meters: number): [number, number] {
  const rad = bearingDeg * Math.PI / 180;
  const dLat = (meters * Math.cos(rad)) / 111320;
  const cosLat = Math.cos(lat * Math.PI / 180) || 1e-6;
  const dLon = (meters * Math.sin(rad)) / (111320 * cosLat);
  return [lat + dLat, lon + dLon];
}

function bearingDeg(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const φ1 = lat1 * Math.PI / 180, φ2 = lat2 * Math.PI / 180;
  const dλ = (lon2 - lon1) * Math.PI / 180;
  const y = Math.sin(dλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(dλ);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

// ── Parsing Overpass → poligoni ───────────────────────────────────────

type OsmPoint = { lat: number; lon: number };

function sameNode(a: OsmPoint, b: OsmPoint): boolean {
  return Math.abs(a.lat - b.lat) < 1e-6 && Math.abs(a.lon - b.lon) < 1e-6;
}

/** Un anello è valido se chiuso, con almeno 4 punti e non degenere. */
function toValidRing(points: OsmPoint[]): ZtlRing | null {
  if (!Array.isArray(points) || points.length < 4) return null;
  if (!sameNode(points[0], points[points.length - 1])) return null;
  // Area (shoelace in gradi²): scarta anelli-filo praticamente senza area
  let area = 0;
  for (let i = 0; i < points.length - 1; i++) {
    area += points[i].lon * points[i + 1].lat - points[i + 1].lon * points[i].lat;
  }
  if (Math.abs(area / 2) < 1e-9) return null;
  return points.map(p => [p.lat, p.lon]);
}

/**
 * Cuce i segmenti "outer" di una relation in anelli chiusi (i perimetri
 * OSM sono spesso spezzati in più way consecutive). Segmenti che non si
 * chiudono vengono scartati: meglio nessun poligono di uno sbagliato.
 */
function stitchRings(segments: OsmPoint[][]): ZtlRing[] {
  const pool = segments.filter(s => Array.isArray(s) && s.length >= 2).map(s => [...s]);
  const rings: ZtlRing[] = [];
  while (pool.length > 0) {
    const current = pool.shift()!;
    let guard = pool.length + 2;
    while (!sameNode(current[0], current[current.length - 1]) && guard-- > 0) {
      const end = current[current.length - 1];
      const idx = pool.findIndex(s => sameNode(s[0], end) || sameNode(s[s.length - 1], end));
      if (idx === -1) break; // anello non chiudibile: si scarta
      const next = pool.splice(idx, 1)[0];
      if (sameNode(next[next.length - 1], end)) next.reverse();
      current.push(...next.slice(1));
    }
    const ring = toValidRing(current);
    if (ring) rings.push(ring);
  }
  return rings;
}

function parseOverpassZtl(data: any): ZtlZone[] {
  const zones: ZtlZone[] = [];
  const seen = new Set<string>();
  for (const el of (data?.elements || [])) {
    if (zones.length >= MAX_ZONES) break;
    const id = `ztl-${el.type}-${el.id}`;
    if (seen.has(id)) continue;
    const name: string = el.tags?.name || el.tags?.['name:it'] || 'ZTL';
    let rings: ZtlRing[] = [];
    if (el.type === 'way' && Array.isArray(el.geometry)) {
      const ring = toValidRing(el.geometry);
      if (ring) rings = [ring];
    } else if (el.type === 'relation' && Array.isArray(el.members)) {
      const outers = el.members
        .filter((m: any) => m?.type === 'way' && (m.role === 'outer' || m.role === '') && Array.isArray(m.geometry))
        .map((m: any) => m.geometry as OsmPoint[]);
      rings = stitchRings(outers);
    }
    if (rings.length === 0) continue; // geometria aperta/degenere: fuori
    seen.add(id);
    zones.push({ id, name, rings });
  }
  return zones;
}

// ── Fetch + cache ─────────────────────────────────────────────────────

function cacheKey(lat: number, lon: number): string {
  // 1 decimale ≈ celle di ~11 km: coerente col raggio di query di 15 km
  return `wip_ztl_${lat.toFixed(1)}_${lon.toFixed(1)}`;
}

/**
 * ZTL entro 15 km dal punto. Cache-first (localStorage, TTL 7 giorni);
 * lancia se tutti gli endpoint Overpass falliscono.
 */
export async function fetchZtlZonesAround(lat: number, lon: number): Promise<ZtlZone[]> {
  const key = cacheKey(lat, lon);
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.ts === 'number' && Date.now() - parsed.ts < CACHE_TTL_MS && Array.isArray(parsed.zones)) {
        return parsed.zones as ZtlZone[];
      }
    }
  } catch { /* cache corrotta: si rifà la query */ }

  // In OSM le ZTL italiane sono per lo più relation/way con
  // boundary=traffic_zone, oppure riconoscibili solo dal nome.
  const query = `[out:json][timeout:25];
(
  relation["boundary"="traffic_zone"](around:${RADIUS_M},${lat},${lon});
  way["boundary"="traffic_zone"](around:${RADIUS_M},${lat},${lon});
  relation["name"~"ZTL|Zona a Traffico Limitato",i](around:${RADIUS_M},${lat},${lon});
  way["name"~"ZTL|Zona a Traffico Limitato",i](around:${RADIUS_M},${lat},${lon});
);
out geom ${MAX_ZONES * 2};`;

  let data: any = null;
  let lastError: any = null;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
        signal: ctrl.signal,
      });
      if (res.ok) { data = await res.json(); break; }
      lastError = new Error(`Overpass HTTP ${res.status}`);
    } catch (e) {
      lastError = e;
    } finally {
      clearTimeout(timer);
    }
  }
  if (!data) {
    throw new Error('Overpass non raggiungibile (ZTL): ' + (lastError?.message || 'errore sconosciuto'));
  }

  const zones = parseOverpassZtl(data);
  try {
    localStorage.setItem(key, JSON.stringify({ ts: Date.now(), zones }));
  } catch { /* quota piena: si vive senza cache */ }
  return zones;
}

// ── Anti-spam (1 avviso per zona per ora) ─────────────────────────────

function canAlert(zoneId: string): boolean {
  try {
    const map = JSON.parse(localStorage.getItem(ALERTED_KEY) || '{}');
    const last = Number(map?.[zoneId]);
    return !Number.isFinite(last) || Date.now() - last > ALERT_COOLDOWN_MS;
  } catch {
    return true;
  }
}

function markAlerted(zoneId: string): void {
  try {
    const raw = JSON.parse(localStorage.getItem(ALERTED_KEY) || '{}');
    const map: Record<string, number> = (raw && typeof raw === 'object') ? raw : {};
    const now = Date.now();
    map[zoneId] = now;
    // Pulizia voci scadute: la mappa non cresce per sempre
    for (const k of Object.keys(map)) {
      if (!Number.isFinite(map[k]) || now - map[k] > ALERT_COOLDOWN_MS) delete map[k];
    }
    map[zoneId] = now;
    localStorage.setItem(ALERTED_KEY, JSON.stringify(map));
  } catch { /* storage pieno/bloccato */ }
}

// ── Watch ─────────────────────────────────────────────────────────────

interface WatchState {
  onAlert: (event: ZtlAlertEvent) => void;
  listener: (e: Event) => void;
  lastFix: { lat: number; lon: number; ts: number } | null;
  /** Ultime velocità stimate (km/h) tra fix consecutivi. */
  speeds: number[];
  vehicleMode: boolean;
  zones: ZtlZone[];
  zonesCenter: { lat: number; lon: number } | null;
  fetching: boolean;
  lastFetchFailTs: number;
}

let watch: WatchState | null = null;

function ensureZones(state: WatchState, lat: number, lon: number): void {
  if (state.fetching) return;
  const c = state.zonesCenter;
  const stale = !c || distanceM(c.lat, c.lon, lat, lon) > REFETCH_DISTANCE_M;
  if (!stale) return;
  if (Date.now() - state.lastFetchFailTs < FETCH_RETRY_MS) return;
  state.fetching = true;
  fetchZtlZonesAround(lat, lon)
    .then((zones) => {
      if (watch !== state) return; // watch fermato nel frattempo
      state.zones = zones;
      state.zonesCenter = { lat, lon };
    })
    .catch(() => { state.lastFetchFailTs = Date.now(); })
    .finally(() => { state.fetching = false; });
}

function handleFix(state: WatchState, lat: number, lon: number, accuracy: number | undefined): void {
  const now = Date.now();
  const prev = state.lastFix;
  // Fix troppo imprecisi: inutilizzabili sia per la velocità che per il PIP
  if (Number.isFinite(accuracy) && (accuracy as number) > 100) return;

  // Velocità stimata dai fix (l'evento non trasporta speed)
  if (prev) {
    const dtS = (now - prev.ts) / 1000;
    if (dtS >= 1 && dtS <= 120) {
      const kmh = (distanceM(prev.lat, prev.lon, lat, lon) / dtS) * 3.6;
      if (kmh < 200) { // salti GPS: fuori dalla stima
        state.speeds.push(kmh);
        if (state.speeds.length > 5) state.speeds.shift();
      }
    }
  }

  // Isteresi veicolo: 2 letture recenti sopra soglia per entrare,
  // 3 consecutive sotto la soglia bassa per uscire
  const s = state.speeds;
  if (!state.vehicleMode) {
    if (s.length >= 2 && s.slice(-2).every(v => v > VEHICLE_ENTER_KMH)) state.vehicleMode = true;
  } else {
    if (s.length >= 3 && s.slice(-3).every(v => v < VEHICLE_EXIT_KMH)) state.vehicleMode = false;
  }

  const from = prev;
  state.lastFix = { lat, lon, ts: now };
  if (!state.vehicleMode) return;

  ensureZones(state, lat, lon);
  if (state.zones.length === 0) return;

  // Punto proiettato 150 m avanti lungo il bearing del movimento
  let ahead: [number, number] | null = null;
  if (from && distanceM(from.lat, from.lon, lat, lon) > 5) {
    ahead = projectPoint(lat, lon, bearingDeg(from.lat, from.lon, lat, lon), PROJECTION_M);
  }

  for (const zone of state.zones) {
    const inside = pointInZone(lat, lon, zone);
    const approaching = !inside && !!ahead && pointInZone(ahead[0], ahead[1], zone);
    if (!inside && !approaching) continue;
    if (!canAlert(zone.id)) continue;
    markAlerted(zone.id);
    try {
      state.onAlert({ zone, preWarning: !inside });
    } catch { /* il callback UI non deve mai rompere il flusso posizioni */ }
  }
}

/**
 * Avvia l'ascolto di 'wip-location-update'. `onAlert` viene chiamato
 * all'ingresso (o pre-ingresso, 150 m avanti) in una ZTL, solo in
 * modalità veicolo e al massimo una volta per zona per ora.
 * Un watch già attivo viene sostituito.
 */
export function startZtlWatch(onAlert: (event: ZtlAlertEvent) => void): void {
  if (typeof window === 'undefined') return;
  stopZtlWatch();
  const state: WatchState = {
    onAlert,
    listener: (e: Event) => {
      try {
        const d = (e as CustomEvent).detail || {};
        const lat = Number(d.lat);
        const lon = Number(d.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
        handleFix(state, lat, lon, Number.isFinite(Number(d.accuracy)) ? Number(d.accuracy) : undefined);
      } catch { /* mai disturbare il flusso posizioni */ }
    },
    lastFix: null,
    speeds: [],
    vehicleMode: false,
    zones: [],
    zonesCenter: null,
    fetching: false,
    lastFetchFailTs: 0,
  };
  watch = state;
  window.addEventListener('wip-location-update', state.listener);
}

export function stopZtlWatch(): void {
  if (!watch) return;
  window.removeEventListener('wip-location-update', watch.listener);
  watch = null;
}

export function isZtlWatchActive(): boolean {
  return watch !== null;
}
