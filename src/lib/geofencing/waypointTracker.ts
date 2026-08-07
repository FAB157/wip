/**
 * waypointTracker.ts
 * Traccia la distanza residua sul percorso reale verso ogni POI attivo
 * Gestisce off-route detection e ricalcolo silenzioso
 */

import type { LatLng, RouteResult } from './routeEngine';
import { getRoute, getRemainingDistance } from './routeEngine';
import type { TransportMode } from './transportDetector';
import type { POI } from './categoryFilter';

// Soglie off-route per modalità
const OFF_ROUTE_THRESHOLD: Record<TransportMode, number> = {
  walking: 20,   // metri - a piedi si può andare ovunque
  driving: 50,   // metri - in auto la deviazione è più ampia
};

// Intervallo minimo tra ricalcoli per POI (evita spam OSRM)
const RECALC_COOLDOWN_MS: Record<TransportMode, number> = {
  walking: 10_000,  // 10 secondi
  driving: 5_000,   // 5 secondi (velocità maggiore)
};

export interface TrackedPOI {
  poi: POI;
  route: RouteResult | null;
  remainingDistance: number;    // metri sul percorso
  offRouteDistance: number;     // metri di deviazione dal percorso
  isOffRoute: boolean;
  lastRecalcTime: number;
  routeRequested: boolean;
}

export class WaypointTracker {
  private tracked = new Map<string, TrackedPOI>();
  private mode: TransportMode = 'walking';

  setMode(mode: TransportMode) {
    this.mode = mode;
    // Pulisci cache percorsi al cambio modalità
    this.tracked.forEach(t => { t.route = null; t.routeRequested = false; });
  }

  /**
   * Aggiorna posizione utente e ricalcola distanze residue
   */
  async update(userPos: LatLng, pois: POI[]): Promise<Map<string, TrackedPOI>> {
    const now = Date.now();

    for (const poi of pois) {
      let tracked = this.tracked.get(poi.id);

      if (!tracked) {
        tracked = {
          poi,
          route: null,
          remainingDistance: Infinity,
          offRouteDistance: 0,
          isOffRoute: false,
          lastRecalcTime: 0,
          routeRequested: false,
        };
        this.tracked.set(poi.id, tracked);
      }

      const poiPos: LatLng = { lat: poi.lat, lng: poi.lng };
      const cooldown = RECALC_COOLDOWN_MS[this.mode];
      const shouldRecalc = !tracked.route ||
                           (tracked.isOffRoute && now - tracked.lastRecalcTime > cooldown);

      if (shouldRecalc && !tracked.routeRequested) {
        tracked.routeRequested = true;
        tracked.lastRecalcTime = now;

        // Async - non blocca il loop
        getRoute(userPos, poiPos, this.mode).then(route => {
          if (tracked) {
            tracked.route = route;
            tracked.routeRequested = false;
          }
        }).catch(() => {
          if (tracked) tracked.routeRequested = false;
        });
      }

      // Calcola distanza residua se abbiamo il percorso
      if (tracked.route?.geometry?.length) {
        const { remaining, offRouteDistance } = getRemainingDistance(
          userPos,
          tracked.route.geometry
        );
        tracked.remainingDistance = remaining;
        tracked.offRouteDistance = offRouteDistance;
        tracked.isOffRoute = offRouteDistance > OFF_ROUTE_THRESHOLD[this.mode];
      }
    }

    // Rimuovi POI non più nella lista
    const poiIds = new Set(pois.map(p => p.id));
    this.tracked.forEach((_, id) => {
      if (!poiIds.has(id)) this.tracked.delete(id);
    });

    return this.tracked;
  }

  getTracked(poiId: string): TrackedPOI | undefined {
    return this.tracked.get(poiId);
  }

  removeTracked(poiId: string) {
    this.tracked.delete(poiId);
  }
}
