/**
 * routeEngine.ts
 * Calcola percorso reale via OSRM (foot + car)
 * con cache, throttling e fallback Haversine
 */

import type { TransportMode } from './transportDetector';
import { OSRM_FOOT_BASE } from '../../services/osrmService';

export interface LatLng {
  lat: number;
  lng: number;
}

export interface RouteStep {
  instruction: string;       // "Svolta a destra in Via Roma"
  distance: number;          // metri
  duration: number;          // secondi
  bearing: number;           // direzione 0-360
  maneuver: string;          // turn | straight | arrive
}

export interface RouteResult {
  distance: number;          // distanza totale percorso in metri
  duration: number;          // durata totale in secondi
  steps: RouteStep[];
  geometry: LatLng[];        // polyline del percorso
  mode: TransportMode;
  fromCache: boolean;
}

// OSRM: il profilo FOOT usa la base condivisa OSRM_FOOT_BASE (grafo pedonale
// reale FOSSGIS — il demo pubblico "foot" era in realtà il grafo AUTO).
// PRODUZIONE: OSRM self-hosted o Mapbox "walking". Il profilo AUTO resta sul
// demo pubblico (grafo corretto per la guida).
const OSRM_CAR = 'https://router.project-osrm.org/route/v1/driving';

const CACHE_TTL_MS = 30_000;      // 30 secondi cache per stesso percorso
const REQUEST_TIMEOUT_MS = 4_000; // 4 secondi timeout

interface CacheEntry {
  result: RouteResult;
  timestamp: number;
}

// Cache globale percorsi
const routeCache = new Map<string, CacheEntry>();

function cacheKey(from: LatLng, to: LatLng, mode: TransportMode): string {
  // Arrotonda a 5 decimali (~1m precisione) per cache hit efficiente
  return `${mode}:${from.lat.toFixed(5)},${from.lng.toFixed(5)};${to.lat.toFixed(5)},${to.lng.toFixed(5)}`;
}

function haversineDistance(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const lat1 = a.lat * Math.PI / 180;
  const lat2 = b.lat * Math.PI / 180;
  const x = Math.sin(dLat / 2) ** 2 +
             Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function decodePolyline(encoded: string): LatLng[] {
  const coords: LatLng[] = [];
  let index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    let b, shift = 0, result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    shift = result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    coords.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return coords;
}

function parseManeuver(osrmType: string): string {
  const map: Record<string, string> = {
    'turn': 'turn', 'new name': 'straight', 'depart': 'depart',
    'arrive': 'arrive', 'merge': 'straight', 'on ramp': 'turn',
    'off ramp': 'turn', 'fork': 'turn', 'end of road': 'turn',
    'roundabout': 'turn', 'rotary': 'turn', 'continue': 'straight',
  };
  return map[osrmType] || 'straight';
}

function buildInstruction(step: any, mode: TransportMode): string {
  const maneuver = step.maneuver;
  const street = step.name || '';
  const dist = Math.round(step.distance);
  const type = maneuver.type || '';
  const modifier = maneuver.modifier || '';

  const dirMap: Record<string, string> = {
    'left': 'a sinistra', 'right': 'a destra',
    'sharp left': 'decisa a sinistra', 'sharp right': 'decisa a destra',
    'slight left': 'leggermente a sinistra', 'slight right': 'leggermente a destra',
    'straight': 'dritto', 'uturn': 'inversione a U',
  };
  const dir = dirMap[modifier] || modifier;

  if (type === 'depart') return street ? `Inizia su ${street}` : 'Inizia il percorso';
  if (type === 'arrive') return 'Sei arrivato a destinazione';
  if (type === 'turn' || type === 'end of road') {
    return street ? `Svolta ${dir} in ${street}` : `Svolta ${dir}`;
  }
  if (type === 'roundabout' || type === 'rotary') {
    const exitN = Number(maneuver.exit);
    const onStreet = street ? ` su ${street}` : '';
    // Con exit assente usciva "la ª uscita" (ordinale vuoto): guard esplicito.
    return exitN > 0
      ? `Alla rotonda prendi la ${exitN}ª uscita${onStreet}`
      : `Prosegui alla rotonda${onStreet}`;
  }
  return street ? `Continua su ${street} per ${dist}m` : `Continua dritto per ${dist}m`;
}

/**
 * Calcola percorso reale tra due punti
 */
export async function getRoute(
  from: LatLng,
  to: LatLng,
  mode: TransportMode
): Promise<RouteResult> {
  const key = cacheKey(from, to, mode);

  // Cache hit
  const cached = routeCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return { ...cached.result, fromCache: true };
  }

  // OSRM_FOOT_BASE termina già con "…/foot/"; il profilo AUTO usa "…/driving/".
  const url = mode === 'driving'
    ? `${OSRM_CAR}/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=polyline&steps=true&annotations=false`
    : `${OSRM_FOOT_BASE}${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=polyline&steps=true&annotations=false`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    const data = await res.json();

    if (data.code !== 'Ok' || !data.routes?.length) {
      throw new Error('OSRM no route');
    }

    const route = data.routes[0];
    const leg = route.legs[0];

    const steps: RouteStep[] = (leg.steps || []).map((s: any) => ({
      instruction: buildInstruction(s, mode),
      distance: s.distance,
      duration: s.duration,
      bearing: s.maneuver?.bearing_after ?? 0,
      maneuver: parseManeuver(s.maneuver?.type ?? ''),
    }));

    const result: RouteResult = {
      distance: route.distance,
      duration: route.duration,
      steps,
      geometry: decodePolyline(route.geometry),
      mode,
      fromCache: false,
    };

    routeCache.set(key, { result, timestamp: Date.now() });
    return result;

  } catch (err) {
    // Fallback Haversine se OSRM non risponde
    console.warn('[RouteEngine] OSRM fallback to Haversine:', err);
    const dist = haversineDistance(from, to);
    return {
      distance: dist,
      duration: mode === 'driving' ? dist / 13.9 : dist / 1.4, // 50kmh / 5kmh
      steps: [],
      geometry: [from, to],
      mode,
      fromCache: false,
    };
  }
}

/**
 * Distanza residua sul percorso dalla posizione attuale
 * Trova il punto più vicino sulla polyline e calcola distanza rimanente
 */
// Proiezione punto→segmento (frame equirettangolare locale), identica a
// roadSnap.projectToSeg (non esportata da quel modulo). Restituisce il punto
// proiettato e la distanza in metri DAL SEGMENTO (non dal vertice).
function projectToSegLL(p: LatLng, a: LatLng, b: LatLng): { lat: number; lng: number; distM: number } {
  const cosLat = Math.cos((p.lat * Math.PI) / 180) || 1;
  const px = p.lng * cosLat, py = p.lat;
  const ax = a.lng * cosLat, ay = a.lat;
  const bx = b.lng * cosLat, by = b.lat;
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const snapLat = ay + t * dy;
  const snapLng = (ax + t * dx) / cosLat;
  return { lat: snapLat, lng: snapLng, distM: haversineDistance(p, { lat: snapLat, lng: snapLng }) };
}

export function getRemainingDistance(
  currentPos: LatLng,
  routeGeometry: LatLng[]
): { remaining: number; closestIndex: number; offRouteDistance: number } {
  if (routeGeometry.length < 2) {
    return { remaining: 0, closestIndex: 0, offRouteDistance: 0 };
  }

  // Fuori-rotta = distanza dalla PROIEZIONE sul segmento più vicino, non dal
  // vertice: con vertici distanti la distanza-al-vertice gonfiava l'off-route e
  // faceva scattare ricalcoli fantasma anche stando sul tracciato.
  let minDist = Infinity;
  let closestIndex = 0;
  let proj: LatLng = routeGeometry[0];
  for (let i = 0; i < routeGeometry.length - 1; i++) {
    const p = projectToSegLL(currentPos, routeGeometry[i], routeGeometry[i + 1]);
    if (p.distM < minDist) { minDist = p.distM; closestIndex = i; proj = { lat: p.lat, lng: p.lng }; }
  }

  // Distanza residua: dalla proiezione al vertice successivo, poi fino alla fine.
  let remaining = haversineDistance(proj, routeGeometry[closestIndex + 1]);
  for (let i = closestIndex + 1; i < routeGeometry.length - 1; i++) {
    remaining += haversineDistance(routeGeometry[i], routeGeometry[i + 1]);
  }

  return {
    remaining,
    closestIndex,
    offRouteDistance: minDist,
  };
}
