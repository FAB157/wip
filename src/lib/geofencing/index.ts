/**
 * index.ts
 * Barrel export del sistema geofencing itainta.
 *
 * ⚠️ WEB = RADAR-ONLY. I trigger geofence in produzione sono gestiti dal
 * servizio NATIVO (Android/iOS). Questo stack (SmartGeofenceManager +
 * useSmartGeofence + predictive/…) NON è montato in produzione: nessun
 * componente fuori da questa cartella lo importa. Resta come base web di
 * riferimento; NON è un "port allineato" del nativo e non va tenuto in sync a
 * costante col Kotlin/Swift. `routeEngine` è invece usato altrove (owner: altro
 * modulo mappa) e resta esportato qui.
 */

export { SmartGeofenceManager } from './SmartGeofenceManager';
export type { GeofenceCallbacks, GeofencePosition } from './SmartGeofenceManager';

export { useSmartGeofence } from './useSmartGeofence';
export type { BannerState, GeofenceState } from './useSmartGeofence';

export { TransportDetector } from './transportDetector';
export type { TransportMode } from './transportDetector';

export { WaypointTracker } from './waypointTracker';
export type { TrackedPOI } from './waypointTracker';

export { TriggerManager, TRIGGER_THRESHOLDS } from './triggerManager';
export type { TriggerEvent, TriggerType } from './triggerManager';

export { handleTriggerAudio, speak, stopAudio } from './audioDirector';

// Nucleo predittivo (CPA), usato dal solo stack web (non montato). Le costanti
// vivono qui in modo indipendente: il nativo ha i propri PredictiveTrigger.kt /
// .swift e non dipende da questi valori.
export {
  evaluatePredictive,
  hasPassed,
  T_LEAD_WALKING_S,
  T_LEAD_DRIVING_S,
  CORRIDOR_WALKING_M,
  CORRIDOR_DRIVING_M,
} from './predictive';
export type { PredictiveResult, PredictiveInput, Decision } from './predictive';

export { getRoute, getRemainingDistance } from './routeEngine';
export type { RouteResult, RouteStep, LatLng } from './routeEngine';

export {
  shouldGeofence,
  filterGeofencePOIs,
  getCategoryLabel,
  GEOFENCE_CATEGORIES,
} from './categoryFilter';
export type { POI } from './categoryFilter';
