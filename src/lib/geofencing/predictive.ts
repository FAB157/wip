/**
 * predictive.ts — nucleo predittivo (CPA) dello stack geofencing WEB.
 *
 * ⚠️ WEB = RADAR-ONLY: questo modulo è usato solo da SmartGeofenceManager, che
 * NON è montato in produzione (i trigger reali sono nativi). Nasce come port
 * concettuale di PredictiveTrigger.kt / PredictiveTrigger.swift, ma NON è un
 * "port esatto" vincolante: il nativo è autonomo e non dipende da questi valori.
 * Le costanti qui sotto restano libere di divergere.
 *
 * PROBLEMA CHE RISOLVE
 * --------------------
 * Il geofence circolare è isotropo: non sa da dove arrivi l'utente. Per far
 * scattare l'avviso abbastanza presto lungo l'asse di marcia bisogna
 * allargare il raggio, ma allargandolo scatta anche per chi passa nella via
 * parallela. Con i cerchi il compromesso è insolubile.
 *
 * SOLUZIONE — punto di massimo avvicinamento (CPA) invece della distanza.
 * Con p = posizione utente, v = vettore velocità, q = POI:
 *
 *     r     = q - p
 *     t_cpa = (r · v) / (v · v)      secondi al massimo avvicinamento
 *     d_cpa = | r - v * t_cpa |      distanza minima che raggiungerà
 *
 * Si annuncia quando t_cpa ∈ (0, T_LEAD] AND d_cpa <= CORRIDOR. Il luogo dei
 * punti che soddisfa le due condizioni È il buffer orientato nella direzione
 * di marcia, e si allunga da sé con la velocità.
 */

export type Decision = 'fire' | 'hold' | 'reject';

// ─── Costanti da tarare sul campo ──────────────────────────────────────────
/**
 * Anticipo desiderato sull'annuncio, in secondi. Deve coprire:
 * età del fix (~3 s) + durata del TTS (~3 s) + reazione utente (~5 s)
 * = 11 s minimo teorico. 22 s a piedi ≈ 30 m a 1,4 m/s.
 */
export const T_LEAD_WALKING_S = 22.0;
export const T_LEAD_DRIVING_S = 14.0;

/** Semi-larghezza del corridoio: quanto "di lato" può stare il POI. */
export const CORRIDOR_WALKING_M = 35.0;
export const CORRIDOR_DRIVING_M = 70.0;

/** Tetto all'estrapolazione: oltre, l'errore supera il beneficio. */
export const MAX_EXTRAPOLATION_S = 3.0;

/** Sotto questa velocità l'heading derivato dal GPS è rumore. */
export const MIN_SPEED_FOR_VECTOR_MS = 0.5;

/** Sopra questa incertezza la predizione non è affidabile: fail-open. */
export const MAX_ACCURACY_FOR_PREDICTION_M = 50.0;

/** Oltre questo ritardo il fix è troppo vecchio per estrapolarlo. */
export const MAX_FIX_AGE_MS = 30_000;

export interface PredictiveResult {
  decision: Decision;
  /** Secondi al punto di massimo avvicinamento. NaN se non predetto. */
  tCpaSeconds: number;
  /** Distanza minima che l'utente raggiungerà. NaN se non predetto. */
  dCpaMeters: number;
  distanceNowMeters: number;
  usedPrediction: boolean;
  reason: string;
}

export interface PredictiveInput {
  lat: number;
  lon: number;
  /** m/s; null/undefined se non disponibile */
  speed?: number | null;
  /** gradi 0-360; null/undefined o < 0 se non disponibile */
  heading?: number | null;
  /** metri; null/undefined se non disponibile */
  accuracy?: number | null;
  /** epoch ms del fix */
  timestamp?: number | null;
}

/** Proietta una posizione in avanti lungo una rotta, per `seconds`. */
function extrapolate(
  lat: number, lon: number, bearingDeg: number, speedMs: number, seconds: number,
): [number, number] {
  if (seconds <= 0 || speedMs <= 0 || bearingDeg < 0) return [lat, lon];
  const distance = speedMs * seconds;
  const bearingRad = (bearingDeg * Math.PI) / 180;
  const dNorth = distance * Math.cos(bearingRad);
  const dEast = distance * Math.sin(bearingRad);
  const newLat = lat + dNorth / 111_320;
  let cosLat = Math.cos((lat * Math.PI) / 180);
  if (Math.abs(cosLat) < 1e-6) cosLat = 1e-6;
  return [newLat, lon + dEast / (111_320 * cosLat)];
}

/** Offset (est, nord) in metri dal punto utente al POI. */
function toLocalMeters(
  userLat: number, userLon: number, poiLat: number, poiLon: number,
): [number, number] {
  let cosLat = Math.cos((userLat * Math.PI) / 180);
  if (Math.abs(cosLat) < 1e-6) cosLat = 1e-6;
  return [(poiLon - userLon) * 111_320 * cosLat, (poiLat - userLat) * 111_320];
}

/**
 * Valuta se annunciare un POI adesso.
 *
 * FAIL-OPEN DELIBERATO: quando i dati non permettono una predizione (fix
 * impreciso, utente fermo, heading assente) NON si irrigidisce — si ricade
 * sul comportamento radiale attuale. Peggiorare il punto cieco sarebbe una
 * regressione: qui si migliora dove si può e non si tocca il resto.
 */
export function evaluatePredictive(
  user: PredictiveInput,
  poiLat: number,
  poiLon: number,
  radiusM: number,
  isDriving: boolean,
  nowMs: number = Date.now(),
): PredictiveResult {
  const tLead = isDriving ? T_LEAD_DRIVING_S : T_LEAD_WALKING_S;
  const corridor = isDriving ? CORRIDOR_DRIVING_M : CORRIDOR_WALKING_M;

  const fixAgeMs = Math.max(0, nowMs - (user.timestamp ?? nowMs));
  const accuracy = typeof user.accuracy === 'number' && user.accuracy > 0
    ? user.accuracy : Number.MAX_VALUE;
  const speed = typeof user.speed === 'number' && user.speed >= 0 ? user.speed : 0;
  const heading = typeof user.heading === 'number' && user.heading >= 0 ? user.heading : -1;

  const canPredict = accuracy <= MAX_ACCURACY_FOR_PREDICTION_M
    && speed >= MIN_SPEED_FOR_VECTOR_MS
    && heading >= 0
    && fixAgeMs <= MAX_FIX_AGE_MS;

  // Compensazione della latenza: il fix viene usato come se fosse "adesso",
  // ma è vecchio di secondi. A 1,4 m/s ogni secondo è 1,4 m di errore.
  const extrapolationS = canPredict ? Math.min(fixAgeMs / 1000, MAX_EXTRAPOLATION_S) : 0;
  const [userLat, userLon] = extrapolate(user.lat, user.lon, heading, speed, extrapolationS);

  const [east, north] = toLocalMeters(userLat, userLon, poiLat, poiLon);
  const distanceNow = Math.sqrt(east * east + north * north);

  if (!canPredict) {
    const why: string[] = [];
    if (accuracy > MAX_ACCURACY_FOR_PREDICTION_M) why.push(`acc=${Math.round(accuracy)}m`);
    if (speed < MIN_SPEED_FOR_VECTOR_MS) why.push(`speed=${speed.toFixed(1)}m/s`);
    if (heading < 0) why.push('no-heading');
    if (fixAgeMs > MAX_FIX_AGE_MS) why.push(`age=${Math.round(fixAgeMs)}ms`);
    return {
      decision: distanceNow <= radiusM ? 'fire' : 'hold',
      tCpaSeconds: NaN,
      dCpaMeters: NaN,
      distanceNowMeters: distanceNow,
      usedPrediction: false,
      reason: `fail-open: ${why.join(' ')}`,
    };
  }

  const headingRad = (heading * Math.PI) / 180;
  const vEast = speed * Math.sin(headingRad);
  const vNorth = speed * Math.cos(headingRad);
  const vSq = vEast * vEast + vNorth * vNorth;

  const tCpa = (east * vEast + north * vNorth) / vSq;
  const missEast = east - vEast * tCpa;
  const missNorth = north - vNorth * tCpa;
  const dCpa = Math.sqrt(missEast * missEast + missNorth * missNorth);

  const base = { tCpaSeconds: tCpa, dCpaMeters: dCpa, distanceNowMeters: distanceNow, usedPrediction: true };

  // Già dentro il raggio: la predizione non deve poter negare un arrivo vero.
  if (distanceNow <= radiusM) return { ...base, decision: 'fire', reason: 'inside-radius' };
  // Si allontana: il CPA è alle sue spalle.
  if (tCpa <= 0) return { ...base, decision: 'reject', reason: 'moving-away' };
  // Passerà di lato: via parallela, altro lato della piazza.
  if (dCpa > corridor) return { ...base, decision: 'reject', reason: `off-corridor d_cpa=${Math.round(dCpa)}m` };
  // In rotta ma non ancora nella finestra di anticipo.
  if (tCpa > tLead) return { ...base, decision: 'hold', reason: `too-early t_cpa=${Math.round(tCpa)}s` };
  // In rotta e dentro la finestra: è il momento.
  return { ...base, decision: 'fire', reason: `predicted t_cpa=${Math.round(tCpa)}s` };
}

/**
 * Metri oltre il CPA perché un POI sia "superato". In DISTANZA, non in
 * secondi: la vecchia soglia -3 s valeva ~42 m in auto ma ~4 m a piedi, e il
 * pedone che faceva due passi oltre il monumento (o stava fermo col GPS in
 * deriva) si vedeva tagliare l'audioguida. 40 m si scalano da sé con la
 * velocità, come il corridoio.
 */
export const PASS_DISTANCE_M = 40.0;

/**
 * Rileva il superamento del POI: CPA alle spalle di almeno PASS_DISTANCE_M
 * metri E distanza oltre il pavimento radiale `radiusM`, in crescita.
 * Il chiamante sceglie il pavimento: raggio di ARRIVO in auto (taglio rapido
 * dopo il sorpasso), raggio di ALERT a piedi (finché cammini nei 150 m sei
 * ancora "al" monumento e la voce può finire il racconto).
 * Stato PASSED consumato oggi dai due stack nativi; qui la firma resta
 * allineata per il giorno in cui il web lo adotterà.
 */
export function hasPassed(
  tCpaSeconds: number, distanceNow: number, previousDistance: number, radiusM: number, speedMs: number,
): boolean {
  if (distanceNow <= previousDistance) return false;
  if (Number.isNaN(tCpaSeconds)) return distanceNow > radiusM;
  const metersPastCpa = -tCpaSeconds * Math.max(speedMs, 0);
  return metersPastCpa > PASS_DISTANCE_M && distanceNow > radiusM;
}
