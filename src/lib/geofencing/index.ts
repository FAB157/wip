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

export { getRoute, getRemainingDistance } from './routeEngine';
export type { RouteResult, RouteStep, LatLng } from './routeEngine';

export {
  shouldGeofence,
  filterGeofencePOIs,
  getCategoryLabel,
  GEOFENCE_CATEGORIES,
} from './categoryFilter';
export type { POI } from './categoryFilter';
