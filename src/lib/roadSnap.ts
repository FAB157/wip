// SNAP-TO-PATH (web). Scarica la geometria strade/marciapiedi dell'area da
// /api/roads/tile, la indicizza a griglia in locale e "snappa" la posizione GPS
// sul segmento percorribile più vicino, ma solo in modo CONSERVATIVO: se non
// c'è una strada abbastanza vicina si tiene il GPS grezzo. Nessuna rete al
// momento dello snap (l'indice è già in memoria), degradazione elegante senza
// tile. Vedi endpoint server /api/roads/tile.
import { getApiUrl } from './api';

type LatLon = [number, number]; // [lat, lon]
interface Seg { a: LatLon; b: LatLon; }
interface Tile { car: number[][][]; foot: number[][][]; }

const CELL = 0.003; // ~300 m: cella della griglia spaziale
const cellKey = (lat: number, lon: number) => `${Math.round(lat / CELL)},${Math.round(lon / CELL)}`;

function metersBetween(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

// Punto più vicino sul segmento (frame equirettangolare locale) + distanza in m.
function projectToSeg(lat: number, lon: number, a: LatLon, b: LatLon): { lat: number; lon: number; distM: number } {
  const cosLat = Math.cos((lat * Math.PI) / 180) || 1;
  const px = lon * cosLat, py = lat;
  const ax = a[1] * cosLat, ay = a[0];
  const bx = b[1] * cosLat, by = b[0];
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const snapLat = ay + t * dy;
  const snapLon = (ax + t * dx) / cosLat;
  return { lat: snapLat, lon: snapLon, distM: metersBetween(lat, lon, snapLat, snapLon) };
}

export interface RoadIndex {
  snap(lat: number, lon: number, accM: number, mode: 'car' | 'walk'): { lat: number; lon: number; movedM: number } | null;
}

function buildIndex(tile: Tile): RoadIndex {
  const grids: Record<'car' | 'foot', Map<string, Seg[]>> = { car: new Map(), foot: new Map() };
  const addPolylines = (polys: number[][][], net: 'car' | 'foot') => {
    const g = grids[net];
    for (const poly of polys || []) {
      for (let i = 0; i + 1 < poly.length; i++) {
        const a: LatLon = [poly[i][0], poly[i][1]];
        const b: LatLon = [poly[i + 1][0], poly[i + 1][1]];
        const seg: Seg = { a, b };
        for (const pt of [a, b]) {
          const k = cellKey(pt[0], pt[1]);
          const arr = g.get(k);
          if (arr) arr.push(seg); else g.set(k, [seg]);
        }
      }
    }
  };
  addPolylines(tile.car, 'car');
  addPolylines(tile.foot, 'foot');

  return {
    snap(lat, lon, accM, mode) {
      const g = mode === 'car' ? grids.car : grids.foot;
      if (g.size === 0) return null;
      // Soglia conservativa: mai oltre max(accuratezza, 20 m), cap 40 m. Se la
      // strada più vicina è oltre, probabilmente NON sei su una strada (interno
      // di una piazza/parco) → non snappare.
      const maxSnap = Math.min(40, Math.max(20, accM || 20));
      const cLat = Math.round(lat / CELL), cLon = Math.round(lon / CELL);
      let best: { lat: number; lon: number; distM: number } | null = null;
      for (let dLa = -1; dLa <= 1; dLa++) {
        for (let dLo = -1; dLo <= 1; dLo++) {
          const arr = g.get(`${cLat + dLa},${cLon + dLo}`);
          if (!arr) continue;
          for (const s of arr) {
            const p = projectToSeg(lat, lon, s.a, s.b);
            if (!best || p.distM < best.distM) best = p;
          }
        }
      }
      if (!best || best.distM > maxSnap) return null;
      const movedM = metersBetween(lat, lon, best.lat, best.lon);
      if (movedM < 3) return null; // spostamento trascurabile → no-op
      return { lat: best.lat, lon: best.lon, movedM };
    },
  };
}

let currentIndex: RoadIndex | null = null;
let lastFetch = { lat: 0, lon: 0, ok: false };
let inFlight = false;

export function getRoadIndex(): RoadIndex | null { return currentIndex; }

/** True se conviene (ri)scaricare il tile: mai fatto o spostati oltre soglia. */
export function shouldRefreshRoads(lat: number, lon: number, thresholdM = 400): boolean {
  if (!lastFetch.ok) return true;
  return metersBetween(lat, lon, lastFetch.lat, lastFetch.lon) > thresholdM;
}

/** Scarica il tile strade dell'area e ricostruisce l'indice. Best-effort. */
export async function refreshRoadTile(lat: number, lon: number, radius = 700): Promise<void> {
  if (inFlight) return;
  inFlight = true;
  try {
    const res = await fetch(getApiUrl(`/api/roads/tile?lat=${lat}&lon=${lon}&radius=${radius}`));
    if (!res.ok) return;
    const tile = await res.json();
    if (!tile || (!Array.isArray(tile.car) && !Array.isArray(tile.foot))) return;
    currentIndex = buildIndex({ car: tile.car || [], foot: tile.foot || [] });
    lastFetch = { lat, lon, ok: true };
  } catch {
    /* best-effort: senza tile si usa il GPS grezzo */
  } finally {
    inFlight = false;
  }
}
