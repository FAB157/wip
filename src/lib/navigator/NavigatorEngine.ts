import { Poi } from '../../types/poi';
import { OSRM_FOOT_BASE } from '../../services/osrmService';

export type TransportMode = 'walking' | 'driving';

export interface LatLng {
  lat: number;
  lng: number;
}

export interface RouteStep {
  instruction: string;
  distance: number; // meters
  duration: number; // seconds
  maneuver: string; // "turn-right", "roundabout", "depart", "arrive", etc.
  location: LatLng;
}

export interface NavigationState {
  isNavigating: boolean;
  destination: Poi | null;
  mode: TransportMode;
  geometry: LatLng[];
  steps: RouteStep[];
  currentStepIndex: number;
  remainingDistance: number; // to destination
  remainingTime: number; // to destination
  remainingToNextStep: number;
  isOffRoute: boolean;
  isArrived: boolean;
}

/**
 * @deprecated STACK NON USATO. Nessun import in tutto il codebase (verificato):
 * il navigatore realmente attivo è `useWalkingNavigation` + `osrmService`. Non
 * cancellato per sicurezza, ma non ricollegarlo senza revisione — `process.env`
 * non esiste nel bundle Vite del browser e istanziarlo faceva "process is not
 * defined".
 */
export class NavigatorEngine {
  private state: NavigationState = this.getInitialState();
  private onStateChangeCallback?: (state: NavigationState) => void;
  // Guard: in Vite `process` è undefined nel browser → ReferenceError se questo
  // modulo venisse importato. Override solo se un bundler lo definisce; default
  // = demo pubblico (attenzione: espone solo il grafo AUTO).
  private osrmBaseUrl = (typeof process !== 'undefined' && (process as any)?.env?.NEXT_PUBLIC_OSRM_BASE) || 'https://router.project-osrm.org';
  private polylineDecoder = new PolylineDecoder();
  private isRecalculating = false;

  private getInitialState(): NavigationState {
    return {
      isNavigating: false,
      destination: null,
      mode: 'walking',
      geometry: [],
      steps: [],
      currentStepIndex: 0,
      remainingDistance: 0,
      remainingTime: 0,
      remainingToNextStep: 0,
      isOffRoute: false,
      isArrived: false
    };
  }

  public onStateChange(callback: (state: NavigationState) => void) {
    this.onStateChangeCallback = callback;
  }

  private emitState() {
    if (this.onStateChangeCallback) {
      this.onStateChangeCallback({ ...this.state });
    }
  }

  public async startNavigation(userPos: LatLng, destination: Poi, mode: TransportMode) {
    console.log(`[Navigator] Avvio navigazione verso ${destination.name} (${mode})`);
    this.state = this.getInitialState();
    this.state.isNavigating = true;
    this.state.destination = destination;
    this.state.mode = mode;
    this.emitState();

    await this.fetchRoute(userPos);
  }

  public stopNavigation() {
    console.log('[Navigator] Navigazione interrotta.');
    this.state = this.getInitialState();
    this.emitState();
  }

  public async updatePosition(userPos: LatLng) {
    if (!this.state.isNavigating || this.state.isArrived || this.isRecalculating || this.state.geometry.length === 0) {
      return;
    }

    // Trova il punto più vicino sulla geometria
    const { closestIndex, offRouteDistance, remainingDistance } = this.calculateProgress(userPos, this.state.geometry);

    // Controlla off-route
    const offRouteThreshold = this.state.mode === 'walking' ? 20 : 50;
    if (offRouteDistance > offRouteThreshold) {
      console.log(`[Navigator] Off-route rilevato (distanza: ${Math.round(offRouteDistance)}m). Ricalcolo...`);
      this.state.isOffRoute = true;
      this.emitState();
      await this.recalculate(userPos);
      return;
    }

    this.state.isOffRoute = false;
    this.state.remainingDistance = remainingDistance;

    // Aggiorna step corrente
    let stepIndex = this.state.currentStepIndex;
    const currentStep = this.state.steps[stepIndex];
    
    if (currentStep) {
      const distToStep = this.haversineDistance(userPos, currentStep.location);
      this.state.remainingToNextStep = distToStep;

      if (distToStep < 15 && stepIndex < this.state.steps.length - 1) {
        // Step superato, passa al prossimo
        console.log(`[Navigator] Step superato, passo al successivo`);
        this.state.currentStepIndex++;
        stepIndex++;
      }
    }

    // Ricalcolo approssimativo del tempo rimanente
    const speedMs = this.state.mode === 'walking' ? 1.4 : 11.1; // 5 km/h vs 40 km/h approssimativi
    this.state.remainingTime = this.state.remainingDistance / speedMs;

    // Arrivo
    if (this.state.remainingDistance < 25) {
      if (!this.state.isArrived) {
        console.log(`[Navigator] Arrivato a destinazione!`);
        this.state.isArrived = true;
        
        // Dispara evento global per audio arrival
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('wip-navigator-arrive', { detail: { destination: this.state.destination }}));
        }
      }
    }

    this.emitState();
  }

  public async recalculate(userPos: LatLng) {
    if (this.isRecalculating) return;
    this.isRecalculating = true;
    await this.fetchRoute(userPos);
    this.isRecalculating = false;
  }

  private async fetchRoute(userPos: LatLng) {
    if (!this.state.destination) return;
    const dest = this.state.destination;
    const profile = this.state.mode === 'walking' ? 'foot' : 'driving';

    // Il profilo FOOT usa la base pedonale condivisa (grafo reale FOSSGIS); il
    // demo pubblico "foot" era in realtà il grafo AUTO. OSRM_FOOT_BASE termina
    // già con "…/foot/".
    const url = profile === 'foot'
      ? `${OSRM_FOOT_BASE}${userPos.lng},${userPos.lat};${dest.lon},${dest.lat}?overview=full&geometries=polyline&steps=true&language=it`
      : `${this.osrmBaseUrl}/route/v1/${profile}/${userPos.lng},${userPos.lat};${dest.lon},${dest.lat}?overview=full&geometries=polyline&steps=true&language=it`;

    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(4000) });
      if (!response.ok) throw new Error(`OSRM HTTP error: ${response.status}`);
      const data = await response.json();

      if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
        throw new Error('OSRM non ha restituito percorsi validi');
      }

      const route = data.routes[0];
      const geometry = this.polylineDecoder.decode(route.geometry);
      
      const steps: RouteStep[] = route.legs[0].steps.map((s: any) => ({
        instruction: this.buildItalianInstruction(s),
        distance: s.distance,
        duration: s.duration,
        maneuver: s.maneuver.type + (s.maneuver.modifier ? '-' + s.maneuver.modifier : ''),
        location: { lat: s.maneuver.location[1], lng: s.maneuver.location[0] }
      }));

      this.state.geometry = geometry;
      this.state.steps = steps;
      this.state.currentStepIndex = 0;
      this.state.remainingDistance = route.distance;
      this.state.remainingTime = route.duration;
      this.state.isOffRoute = false;
      this.state.isArrived = false;
      
      console.log(`[Navigator] Percorso ricalcolato con successo. Distanza totale: ${route.distance}m`);
      this.emitState();
    } catch (error) {
      console.warn(`[Navigator] Errore fetch percorso OSRM:`, error);
      // Fallback linea d'aria
      this.state.geometry = [userPos, { lat: dest.lat, lng: dest.lon }];
      this.state.remainingDistance = this.haversineDistance(userPos, { lat: dest.lat, lng: dest.lon });
      this.state.steps = [{
        instruction: `Procedi in direzione ${dest.name}`,
        distance: this.state.remainingDistance,
        duration: this.state.remainingDistance / (this.state.mode === 'walking' ? 1.4 : 11.1),
        maneuver: 'straight',
        location: { lat: dest.lat, lng: dest.lon }
      }];
      this.emitState();
    }
  }

  // --- Utility Matematiche ---
  private calculateProgress(pos: LatLng, geometry: LatLng[]) {
    if (geometry.length < 2) {
      const d = geometry.length ? this.haversineDistance(pos, geometry[0]) : 0;
      return { closestIndex: 0, offRouteDistance: d, remainingDistance: 0 };
    }

    // Fuori-rotta = distanza dalla PROIEZIONE sul segmento più vicino, non dal
    // vertice (la distanza-al-vertice gonfiava l'off-route → ricalcoli fantasma).
    let minDistance = Infinity;
    let closestIndex = 0;
    let proj: LatLng = geometry[0];
    for (let i = 0; i < geometry.length - 1; i++) {
      const p = this.projectToSeg(pos, geometry[i], geometry[i + 1]);
      if (p.distM < minDistance) { minDistance = p.distM; closestIndex = i; proj = { lat: p.lat, lng: p.lng }; }
    }

    let remainingDistance = this.haversineDistance(proj, geometry[closestIndex + 1]);
    for (let i = closestIndex + 1; i < geometry.length - 1; i++) {
      remainingDistance += this.haversineDistance(geometry[i], geometry[i + 1]);
    }

    return { closestIndex, offRouteDistance: minDistance, remainingDistance };
  }

  // Proiezione punto→segmento (equirettangolare locale), come roadSnap.projectToSeg.
  private projectToSeg(p: LatLng, a: LatLng, b: LatLng): { lat: number; lng: number; distM: number } {
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
    return { lat: snapLat, lng: snapLng, distM: this.haversineDistance(p, { lat: snapLat, lng: snapLng }) };
  }

  private haversineDistance(pos1: LatLng, pos2: LatLng): number {
    const R = 6371e3; // meters
    const dLat = (pos2.lat - pos1.lat) * Math.PI / 180;
    const dLon = (pos2.lng - pos1.lng) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(pos1.lat * Math.PI / 180) * Math.cos(pos2.lat * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private buildItalianInstruction(step: any): string {
    // Basic translation, could be extended
    const type = step.maneuver.type;
    const modifier = step.maneuver.modifier;
    const name = step.name || '';

    if (type === 'turn') {
      if (modifier === 'left') return `Svolta a sinistra in ${name}`;
      if (modifier === 'right') return `Svolta a destra in ${name}`;
      if (modifier === 'slight left') return `Svolta leggermente a sinistra in ${name}`;
      if (modifier === 'slight right') return `Svolta leggermente a destra in ${name}`;
      if (modifier === 'sharp left') return `Svolta stretta a sinistra in ${name}`;
      if (modifier === 'sharp right') return `Svolta stretta a destra in ${name}`;
      if (modifier === 'straight') return `Continua dritto in ${name}`;
    }
    if (type === 'roundabout') {
      const exit = step.maneuver.exit ? `prendi la ${step.maneuver.exit}ª uscita` : `supera la rotonda`;
      return `Alla rotonda ${exit} ${name ? 'in ' + name : ''}`;
    }
    if (type === 'depart') return `Procedi in direzione ${modifier || 'dritto'}`;
    if (type === 'arrive') return `Sei arrivato a destinazione`;
    if (type === 'continue') return `Continua su ${name}`;

    return step.maneuver.instruction || `Procedi in ${name || 'avanti'}`;
  }
}

// Algoritmo di decodifica polyline di Google
class PolylineDecoder {
  decode(str: string, precision: number = 5): LatLng[] {
    let index = 0, lat = 0, lng = 0, coordinates: LatLng[] = [];
    let shift = 0, result = 0, byte = null;
    let latitude_change, longitude_change, factor = Math.pow(10, precision || 5);

    while (index < str.length) {
      byte = null; shift = 0; result = 0;
      do {
        byte = str.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
      latitude_change = ((result & 1) ? ~(result >> 1) : (result >> 1));
      shift = result = 0;
      do {
        byte = str.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
      longitude_change = ((result & 1) ? ~(result >> 1) : (result >> 1));
      lat += latitude_change;
      lng += longitude_change;
      coordinates.push({ lat: lat / factor, lng: lng / factor });
    }
    return coordinates;
  }
}

export const navigatorEngine = new NavigatorEngine();
