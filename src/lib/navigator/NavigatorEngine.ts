import { Poi } from '../../types/poi';

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

export class NavigatorEngine {
  private state: NavigationState = this.getInitialState();
  private onStateChangeCallback?: (state: NavigationState) => void;
  private osrmBaseUrl = process.env.NEXT_PUBLIC_OSRM_BASE || 'https://router.project-osrm.org';
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
    
    const url = `${this.osrmBaseUrl}/route/v1/${profile}/${userPos.lng},${userPos.lat};${dest.lon},${dest.lat}?overview=full&geometries=polyline&steps=true&language=it`;

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
    let minDistance = Infinity;
    let closestIndex = 0;

    for (let i = 0; i < geometry.length; i++) {
      const d = this.haversineDistance(pos, geometry[i]);
      if (d < minDistance) {
        minDistance = d;
        closestIndex = i;
      }
    }

    let remainingDistance = 0;
    for (let i = closestIndex; i < geometry.length - 1; i++) {
      remainingDistance += this.haversineDistance(geometry[i], geometry[i+1]);
    }

    return { closestIndex, offRouteDistance: minDistance, remainingDistance };
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
