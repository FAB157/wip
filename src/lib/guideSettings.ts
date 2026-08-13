// =====================================================================
// ITAINTA · Impostazioni guida/geofencing persistite in localStorage
// - distanze trigger per modalita' A PIEDI / IN AUTO (con slider UI)
// - modalita' attivazione (automatica / semi-automatica)
// - personaggio guida (nicky / dante)
// - anti-ripetizione: set dei POI gia' riprodotti (NON si resetta da solo)
// =====================================================================

import type { GuideCharacter } from '../types/poi';

export type ActivationMode = 'automatic' | 'semi-automatic';
export type TransportMode = 'walk' | 'car';
export type TransportPreference = 'auto' | 'walk' | 'car';

const KEYS = {
  walkAlert: 'wip_walk_alert',
  walkTrigger: 'wip_walk_trigger',
  carAlert: 'wip_car_alert',
  carTrigger: 'wip_car_trigger',
  mode: 'wip_activation_mode',
  character: 'wip_guide_character',
  transport: 'wip_transport_pref',
  played: 'wip_played_pois',
} as const;

/** Default e range per gli slider (spec sezione 6). */
export const DISTANCE_CONFIG = {
  // Spec confermata: alert 150m a piedi / 300m in auto; arrivo (teaser)
  // 30m a piedi / 50m in auto. Stessi default nel servizio Kotlin
  // (ItaintaBackgroundPoiService.kt): tenerli allineati.
  walkAlert:   { default: 150, min: 50,  max: 400 },
  walkTrigger: { default: 30,  min: 15,  max: 100 },
  carAlert:    { default: 300, min: 100, max: 600 },
  carTrigger:  { default: 50,  min: 20,  max: 150 },
} as const;

export type DistanceKey = keyof typeof DISTANCE_CONFIG;

export interface GuideDistances {
  walkAlert: number;
  walkTrigger: number;
  carAlert: number;
  carTrigger: number;
}

function readInt(key: string, fallback: number): number {
  try {
    const v = localStorage.getItem(key);
    if (v === null) return fallback;
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : fallback;
  } catch {
    return fallback;
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

// --- Distanze trigger ---------------------------------------------------
export function getDistances(): GuideDistances {
  return {
    walkAlert: readInt(KEYS.walkAlert, DISTANCE_CONFIG.walkAlert.default),
    walkTrigger: readInt(KEYS.walkTrigger, DISTANCE_CONFIG.walkTrigger.default),
    carAlert: readInt(KEYS.carAlert, DISTANCE_CONFIG.carAlert.default),
    carTrigger: readInt(KEYS.carTrigger, DISTANCE_CONFIG.carTrigger.default),
  };
}

export function setDistance(key: DistanceKey, value: number): void {
  const cfg = DISTANCE_CONFIG[key];
  const clamped = clamp(value, cfg.min, cfg.max);
  try {
    localStorage.setItem(KEYS[key], String(clamped));
  } catch {
    /* ignore */
  }
}

/**
 * Raggi operativi (alert/trigger) per la modalita' di trasporto corrente.
 * Include una logica di espansione del raggio per edifici grandi (Musei, Castelli, ecc.)
 */
/** Raggi calibrati sul perimetro reale del POI (footprint OSM), quando presenti. */
export interface PoiFootprint {
  /** Raggio di trigger/arrivo derivato dal perimetro (colonna geofence_radius). */
  geofenceRadius?: number | null;
  /** Raggio di alert derivato dal perimetro (colonna alert_radius). */
  alertRadius?: number | null;
  /** True se il POI è stato processato col footprint (entrance valorizzato). */
  hasEntrance?: boolean;
}

export function radiiForTransport(
  mode: TransportMode,
  category?: string | null,
  footprint?: PoiFootprint | null,
): {
  alert: number;
  trigger: number;
} {
  const d = getDistances();
  let { alert, trigger } = mode === 'car'
    ? { alert: d.carAlert, trigger: d.carTrigger }
    : { alert: d.walkAlert, trigger: d.walkTrigger };

  // RAGGI CALIBRATI SUL PERIMETRO REALE. Se il POI è stato processato col
  // footprint OSM (entrance valorizzato → hasEntrance), usa i suoi raggi reali,
  // EspAndendo (mai riducendo) i default di modalità: una piazza ottiene un
  // raggio grande, una statua resta stretta. Sostituisce il bump forfettario.
  // Gated su hasEntrance: i POI non processati sono IDENTICI a oggi (i valori
  // 50/150 di default sono indistinguibili da raggi reali e non vanno usati).
  const fpTrigger = Number(footprint?.geofenceRadius) || 0;
  const fpAlert = Number(footprint?.alertRadius) || 0;
  if (footprint?.hasEntrance && (fpTrigger > 0 || fpAlert > 0)) {
    if (fpTrigger > 0) trigger = Math.max(trigger, fpTrigger);
    if (fpAlert > 0) alert = Math.max(alert, fpAlert);
    return { alert, trigger };
  }

  // Fallback (comportamento attuale): bump forfettario per edifici grandi,
  // perché il centroide di un edificio massiccio è lontano dalla strada.
  const cat = (category || '').toLowerCase();
  const largeScaleCategories = [
    'castle', 'castelli', 'museum', 'musei', 'church', 'chiese',
    'place_of_worship', 'fortress', 'palazzo', 'palace', 'monastery', 'abbey',
    'archaeological_site', 'ruins', 'rovine', 'monument', 'monumento', 'attraction'
  ];

  if (largeScaleCategories.includes(cat)) {
    trigger += 40; // Aggiungiamo 40 metri di tolleranza per edifici massicci
    alert += 50;   // Espandiamo anche l'alert per dare tempo al GPS di stabilizzarsi
  }

  return { alert, trigger };
}

// --- Modalita' attivazione ---------------------------------------------
export function getActivationMode(): ActivationMode {
  try {
    return (localStorage.getItem(KEYS.mode) as ActivationMode) || 'automatic';
  } catch {
    return 'automatic';
  }
}

export function setActivationMode(mode: ActivationMode): void {
  try {
    localStorage.setItem(KEYS.mode, mode);
  } catch {
    /* ignore */
  }
}

// --- Personaggio guida --------------------------------------------------
export function getGuideCharacter(): GuideCharacter {
  try {
    return (localStorage.getItem(KEYS.character) as GuideCharacter) || 'nicky';
  } catch {
    return 'nicky';
  }
}

export function setGuideCharacter(character: GuideCharacter): void {
  try {
    localStorage.setItem(KEYS.character, character);
  } catch {
    /* ignore */
  }
}

// --- Preferenza trasporto (auto = rileva da velocita') ------------------
export function getTransportPreference(): TransportPreference {
  try {
    return (localStorage.getItem(KEYS.transport) as TransportPreference) || 'auto';
  } catch {
    return 'auto';
  }
}

export function setTransportPreference(pref: TransportPreference): void {
  try {
    localStorage.setItem(KEYS.transport, pref);
  } catch {
    /* ignore */
  }
}

/** Modalita' trasporto effettiva data la velocita' (m/s) e la preferenza. */
export function resolveTransportMode(speedMetersPerSec: number | null): TransportMode {
  const pref = getTransportPreference();
  if (pref === 'walk') return 'walk';
  if (pref === 'car') return 'car';
  const kmh = (speedMetersPerSec || 0) * 3.6;
  // Il nativo usa un'ISTERESI 12 km/h (sopra → auto) / 6 km/h (sotto → piedi)
  // per evitare il flip ai semafori. Qui, senza stato tra i fix, una singola
  // soglia intermedia (~10 km/h) approssima quel crossover: sopra → auto.
  return kmh >= 10 ? 'car' : 'walk';
}

// --- Anti-ripetizione (POI gia' riprodotti) -----------------------------
function readPlayed(): Set<string> {
  try {
    const raw = localStorage.getItem(KEYS.played);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function writePlayed(set: Set<string>): void {
  try {
    localStorage.setItem(KEYS.played, JSON.stringify([...set]));
  } catch {
    /* ignore */
  }
}

export function isPlayed(poiId: string | number): boolean {
  return readPlayed().has(String(poiId));
}

export function markPlayed(poiId: string | number): void {
  const set = readPlayed();
  set.add(String(poiId));
  writePlayed(set);
}

/** Reset esplicito di un singolo POI (es. click PLAY dalla scheda). */
export function resetPlayedOne(poiId: string | number): void {
  const set = readPlayed();
  if (set.delete(String(poiId))) writePlayed(set);
}

/** Reset totale ("Reimposta audioguide ascoltate" nelle settings). */
export function resetAllPlayed(): void {
  try {
    localStorage.removeItem(KEYS.played);
  } catch {
    /* ignore */
  }
}
