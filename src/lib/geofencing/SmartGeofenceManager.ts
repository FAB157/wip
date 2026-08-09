/**
 * SmartGeofenceManager.ts
 * Orchestratore principale del sistema geofencing navigatore-style
 * 
 * Flusso:
 * GPS position → TransportDetector → CategoryFilter → WaypointTracker
 *             → TriggerManager → AudioDirector → UI callbacks
 */

import { TransportDetector, type TransportMode } from './transportDetector';
import { WaypointTracker } from './waypointTracker';
import { TriggerManager, TRIGGER_THRESHOLDS, type TriggerEvent } from './triggerManager';
import { evaluatePredictive, type PredictiveInput } from './predictive';
import { handleTriggerAudio } from './audioDirector';
import { filterGeofencePOIs, type POI } from './categoryFilter';
import type { LatLng } from './routeEngine';

// Pre-filtro Haversine: non calcolare percorsi per POI lontanissimi
const HAVERSINE_PREFILTER: Record<TransportMode, number> = {
  walking: 500,   // 500m in linea d'aria
  driving: 2000,  // 2km in linea d'aria
};

// Minima accuratezza GPS accettata (metri)
const MIN_GPS_ACCURACY = 80; // Aumentato da 30 a 80 per evitare blocchi nei centri storici/strade strette

function haversine(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const lat1 = a.lat * Math.PI / 180;
  const lat2 = b.lat * Math.PI / 180;
  const x = Math.sin(dLat / 2) ** 2 +
             Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

export interface GeofenceCallbacks {
  onBanner: (poi: POI, distanceMeters: number, message: string) => void;
  onCard: (poi: POI) => void;
  onDismiss: (poi: POI) => void;
  onModeChange?: (mode: TransportMode) => void;
}

export interface GeofencePosition {
  lat: number;
  lng: number;
  accuracy: number;        // metri
  speed: number | null;    // m/s
  heading: number | null;  // gradi 0-360
}

export class SmartGeofenceManager {
  private detector: TransportDetector;
  private tracker: WaypointTracker;
  private triggerMgr: TriggerManager;
  private callbacks: GeofenceCallbacks;
  private allPOIs: POI[] = [];
  private isRunning = false;
  private watchId: number | null = null;

  constructor(callbacks: GeofenceCallbacks) {
    this.callbacks = callbacks;

    this.detector = new TransportDetector((mode) => {
      this.tracker.setMode(mode);
      this.triggerMgr.setMode(mode);
      this.triggerMgr.resetAll(); // reset trigger al cambio modalità
      callbacks.onModeChange?.(mode);
      console.log(`[Geofence] Modalità cambiata: ${mode}`);
    });

    this.tracker = new WaypointTracker();
    this.triggerMgr = new TriggerManager(this.handleTrigger.bind(this));
  }

  /**
   * Imposta la lista completa dei POI
   * Filtra automaticamente per categoria geofenceable
   */
  setPOIs(pois: POI[]) {
    this.allPOIs = filterGeofencePOIs(pois);
    console.log(`[Geofence] POI geofenceable: ${this.allPOIs.length} / ${pois.length}`);
  }

  /**
   * Avvia il tracking GPS
   */
  start() {
    if (this.isRunning) return;
    this.isRunning = true;

    if (!navigator.geolocation) {
      console.error('[Geofence] Geolocalizzazione non supportata');
      return;
    }

    this.watchId = navigator.geolocation.watchPosition(
      this.onPosition.bind(this),
      this.onError.bind(this),
      {
        enableHighAccuracy: true,
        maximumAge: 2000,
        timeout: 10000,
      }
    );

    console.log('[Geofence] Avviato watchPosition');
  }

  /**
   * Ferma il tracking GPS
   */
  stop() {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
    this.isRunning = false;
    console.log('[Geofence] Fermato');
  }

  /**
   * Override manuale modalità (es. utente seleziona "in auto")
   */
  setManualMode(mode: TransportMode) {
    this.detector.setMode(mode);
    this.tracker.setMode(mode);
    this.triggerMgr.setMode(mode);
    this.triggerMgr.resetAll();
  }

  /**
   * Reset trigger per un POI specifico (es. utente chiude banner)
   */
  resetPOI(poiId: string) {
    this.triggerMgr.resetPOI(poiId);
    this.tracker.removeTracked(poiId);
  }

  // ─── Handlers interni ────────────────────────────────────────────────────

  private async onPosition(pos: GeolocationPosition) {
    const { latitude, longitude, accuracy, speed, heading } = pos.coords;

    // Filtra posizioni con GPS troppo impreciso
    if (accuracy > MIN_GPS_ACCURACY) {
      console.warn(`[Geofence] GPS inaccurato: ${accuracy.toFixed(0)}m, skip`);
      return;
    }

    const userPos: LatLng = { lat: latitude, lng: longitude };

    // 1. Rileva modalità trasporto
    const mode = this.detector.update(speed);

    // 2. Pre-filtra POI per distanza in linea d'aria (economico)
    const prefilterDist = HAVERSINE_PREFILTER[mode];
    const inRange = this.allPOIs.filter(poi => {
      const d = haversine(userPos, { lat: poi.lat, lng: poi.lng });
      return d < prefilterDist;
    });

    // 2b. Filtro predittivo (CPA) PRIMA del routing: scarta i POI verso cui
    // l'utente non è in rotta — via parallela, altro lato della piazza, o
    // già superati. Doppio vantaggio: elimina i falsi positivi direzionali
    // e risparmia una chiamata OSRM per ogni POI scartato.
    // Vedi predictive.ts; fail-open quando i dati non bastano.
    const predictiveInput: PredictiveInput = {
      lat: latitude,
      lon: longitude,
      speed,
      heading,
      accuracy,
      timestamp: pos.timestamp,
    };
    const isDriving = mode === 'driving';
    const nearbyPOIs = inRange.filter(poi => {
      const r = evaluatePredictive(
        predictiveInput,
        poi.lat,
        poi.lng,
        TRIGGER_THRESHOLDS[mode].banner,
        isDriving,
      );
      if (r.decision === 'reject') {
        console.debug(`[Geofence] scartato ${poi.name ?? poi.id}: ${r.reason}`);
        return false;
      }
      return true;
    });

    if (nearbyPOIs.length === 0) return;

    // 3. Aggiorna tracker con percorsi reali OSRM
    const tracked = await this.tracker.update(userPos, nearbyPOIs);

    // 4. Valuta trigger
    this.triggerMgr.evaluate(tracked);
  }

  private onError(err: GeolocationPositionError) {
    console.error(`[Geofence] Errore GPS: ${err.message}`);
  }

  private handleTrigger(event: TriggerEvent) {
    // Genera audio
    const message = handleTriggerAudio(event) ?? '';

    // Notifica UI
    switch (event.type) {
      case 'banner':
        this.callbacks.onBanner(event.poi, event.remainingDistance, message);
        break;
      case 'card':
        this.callbacks.onCard(event.poi);
        break;
      case 'dismiss':
        this.callbacks.onDismiss(event.poi);
        break;
    }
  }
}
