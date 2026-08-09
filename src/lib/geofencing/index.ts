/**
 * index.ts
 * Barrel export del sistema geofencing itainta
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

// Nucleo predittivo (CPA). Le costanti sono da tarare sul campo: tenerle
// allineate a PredictiveTrigger.kt e PredictiveTrigger.swift.
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
