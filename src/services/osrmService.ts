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

// Frasi delle manovre in tutte le lingue dell'app (prima solo IT/EN: le
// altre lingue ricevevano le indicazioni in inglese).
type ManeuverPhrases = {
  arrive: (poi: string) => string;
  destination: string;
  depart: string;
  roundabout: string;
  right: string;
  left: string;
  straight: string;
  slightRight: string;
  slightLeft: string;
  uturn: string;
};

const MANEUVER_LANGS: Record<string, ManeuverPhrases> = {
  it: {
    arrive: p => `Sei arrivato a ${p}`, destination: 'destinazione', depart: 'Inizia il percorso',
    roundabout: 'Prendi la rotonda', right: 'gira a destra', left: 'gira a sinistra',
    straight: 'continua dritto', slightRight: 'mantieni la destra', slightLeft: 'mantieni la sinistra',
    uturn: 'fai inversione',
  },
  en: {
    arrive: p => `You have arrived at ${p}`, destination: 'your destination', depart: 'Start the route',
    roundabout: 'Take the roundabout', right: 'turn right', left: 'turn left',
    straight: 'continue straight', slightRight: 'keep right', slightLeft: 'keep left',
    uturn: 'make a U-turn',
  },
  fr: {
    arrive: p => `Vous êtes arrivé à ${p}`, destination: 'destination', depart: 'Commencez le trajet',
    roundabout: 'Prenez le rond-point', right: 'tournez à droite', left: 'tournez à gauche',
    straight: 'continuez tout droit', slightRight: 'serrez à droite', slightLeft: 'serrez à gauche',
    uturn: 'faites demi-tour',
  },
  es: {
    arrive: p => `Has llegado a ${p}`, destination: 'tu destino', depart: 'Inicia el recorrido',
    roundabout: 'Toma la rotonda', right: 'gira a la derecha', left: 'gira a la izquierda',
    straight: 'sigue recto', slightRight: 'mantente a la derecha', slightLeft: 'mantente a la izquierda',
    uturn: 'da la vuelta',
  },
  de: {
    arrive: p => `Sie haben ${p} erreicht`, destination: 'Ihr Ziel', depart: 'Route starten',
    roundabout: 'Nehmen Sie den Kreisverkehr', right: 'rechts abbiegen', left: 'links abbiegen',
    straight: 'geradeaus weiter', slightRight: 'rechts halten', slightLeft: 'links halten',
    uturn: 'wenden',
  },
  ru: {
    arrive: p => `Вы прибыли: ${p}`, destination: 'пункт назначения', depart: 'Начните маршрут',
    roundabout: 'Проезжайте круговой перекрёсток', right: 'поверните направо', left: 'поверните налево',
    straight: 'продолжайте прямо', slightRight: 'держитесь правее', slightLeft: 'держитесь левее',
    uturn: 'развернитесь',
  },
  zh: {
    arrive: p => `您已到达${p}`, destination: '目的地', depart: '开始路线',
    roundabout: '进入环岛', right: '右转', left: '左转',
    straight: '直行', slightRight: '靠右行驶', slightLeft: '靠左行驶',
    uturn: '掉头',
  },
};

/** Traduce una manovra OSRM in una frase vocale nella lingua data. */
export function translateManeuver(
  type: string,
  modifier: string | undefined,
  lang: string,
  poiName?: string,
): string {
  const l = (lang || 'it').toLowerCase().slice(0, 2);
  const t = MANEUVER_LANGS[l] || MANEUVER_LANGS.en;

  if (type === 'arrive') return t.arrive(poiName || t.destination);
  if (type === 'depart') return t.depart;
  if (type === 'roundabout' || type === 'rotary') return t.roundabout;

  switch (modifier) {
    case 'right':
    case 'sharp right':
      return t.right;
    case 'left':
    case 'sharp left':
      return t.left;
    case 'slight right':
      return t.slightRight;
    case 'slight left':
      return t.slightLeft;
    case 'uturn':
      return t.uturn;
    case 'straight':
    default:
      return t.straight;
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
