// =====================================================================
// ITAINTA · Navigatore pedonale via OSRM (router.project-osrm.org, gratis)
// Routing a piedi + traduzione manovre in voce (Web Speech / Azure).
// =====================================================================

import type { LatLon } from '../lib/geo';

const OSRM_FOOT = 'https://router.project-osrm.org/route/v1/foot/';

export interface RouteStep {
  /** Testo gia' tradotto, pronto da leggere. */
  instruction: string;
  /** Coordinata del punto di manovra. */
  location: LatLon;
  /** Distanza (m) del segmento che porta a questa manovra. */
  distance: number;
  maneuverType: string;
  maneuverModifier?: string;
}

export interface WalkingRoute {
  steps: RouteStep[];
  /** Distanza totale in metri. */
  distance: number;
  /** Durata stimata in secondi. */
  duration: number;
  /** Polilinea [lat, lon] per disegnare il percorso su Leaflet. */
  geometry: [number, number][];
}

/** Traduce una manovra OSRM in una frase vocale nella lingua data. */
export function translateManeuver(
  type: string,
  modifier: string | undefined,
  lang: string,
  poiName?: string,
): string {
  const l = (lang || 'it').toLowerCase();
  const it = l.startsWith('it');

  if (type === 'arrive') {
    return it ? `Sei arrivato a ${poiName || 'destinazione'}` : `You have arrived at ${poiName || 'your destination'}`;
  }
  if (type === 'depart') {
    return it ? 'Inizia il percorso' : 'Start the route';
  }
  if (type === 'roundabout' || type === 'rotary') {
    return it ? "Prendi la rotonda" : 'Take the roundabout';
  }

  const right = it ? 'gira a destra' : 'turn right';
  const left = it ? 'gira a sinistra' : 'turn left';
  const straight = it ? 'continua dritto' : 'continue straight';
  const slightRight = it ? 'mantieni la destra' : 'keep right';
  const slightLeft = it ? 'mantieni la sinistra' : 'keep left';
  const uturn = it ? 'fai inversione' : 'make a U-turn';

  switch (modifier) {
    case 'right':
    case 'sharp right':
      return right;
    case 'left':
    case 'sharp left':
      return left;
    case 'slight right':
      return slightRight;
    case 'slight left':
      return slightLeft;
    case 'uturn':
      return uturn;
    case 'straight':
    default:
      return straight;
  }
}

/**
 * Calcola il percorso pedonale da -> a.
 * Ritorna null se OSRM non risponde o non trova rotte.
 */
export async function fetchWalkingRoute(
  from: LatLon,
  to: LatLon,
  lang: string,
  poiName?: string,
): Promise<WalkingRoute | null> {
  try {
    const coords = `${from.lon},${from.lat};${to.lon},${to.lat}`;
    const url = `${OSRM_FOOT}${coords}?overview=full&geometries=geojson&steps=true`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const route = data?.routes?.[0];
    if (!route) return null;

    const legSteps = route.legs?.[0]?.steps ?? [];
    const steps: RouteStep[] = legSteps.map((s: any) => {
      const type = s.maneuver?.type ?? 'continue';
      const modifier = s.maneuver?.modifier;
      const [lon, lat] = s.maneuver?.location ?? [from.lon, from.lat];
      return {
        instruction: translateManeuver(type, modifier, lang, poiName),
        location: { lat, lon },
        distance: s.distance ?? 0,
        maneuverType: type,
        maneuverModifier: modifier,
      };
    });

    const geometry: [number, number][] = (route.geometry?.coordinates ?? []).map(
      ([lon, lat]: [number, number]) => [lat, lon],
    );

    return {
      steps,
      distance: route.distance ?? 0,
      duration: route.duration ?? 0,
      geometry,
    };
  } catch {
    return null;
  }
}
