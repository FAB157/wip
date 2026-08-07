/**
 * triggerManager.ts
 * Gestisce i trigger banner / scheda POI in base a modalità e distanza percorso
 * Logica navigatore: distanza RESIDUA sul percorso, non linea d'aria
 */

import type { TransportMode } from './transportDetector';
import type { POI } from './categoryFilter';
import type { TrackedPOI } from './waypointTracker';

// Soglie distanza percorso reale per trigger
export const TRIGGER_THRESHOLDS: Record<TransportMode, {
  banner: number;      // metri → mostra banner + audio avviso
  card: number;        // metri → apri scheda completa POI
  dismiss: number;     // metri → nascondi banner se ci si allontana
}> = {
  walking: {
    banner: 150,
    card: 50,
    dismiss: 200,
  },
  driving: {
    banner: 300,
    card: 120,     // parcheggio / stop vicino
    dismiss: 400,
  },
};

export type TriggerType = 'banner' | 'card' | 'dismiss';

export interface TriggerEvent {
  type: TriggerType;
  poi: POI;
  remainingDistance: number;
  mode: TransportMode;
  nextStep?: string;           // istruzione navigazione es. "Svolta a destra"
}

export class TriggerManager {
  private bannerTriggered = new Set<string>();
  private cardTriggered = new Set<string>();
  private mode: TransportMode = 'walking';
  private onTrigger?: (event: TriggerEvent) => void;

  constructor(onTrigger?: (event: TriggerEvent) => void) {
    this.onTrigger = onTrigger;
  }

  setMode(mode: TransportMode) {
    this.mode = mode;
  }

  /**
   * Valuta tutti i POI tracciati e emette eventi trigger
   */
  evaluate(tracked: Map<string, TrackedPOI>) {
    const thresholds = TRIGGER_THRESHOLDS[this.mode];

    tracked.forEach((t, poiId) => {
      const dist = t.remainingDistance;
      if (dist === Infinity || dist === undefined) return;

      // Prossimo step navigazione (primo step del percorso)
      const nextStep = t.route?.steps?.[0]?.instruction;

      // DISMISS - utente si è allontanato
      if (dist > thresholds.dismiss) {
        if (this.bannerTriggered.has(poiId)) {
          this.bannerTriggered.delete(poiId);
          this.emit({ type: 'dismiss', poi: t.poi, remainingDistance: dist, mode: this.mode });
        }
        return;
      }

      // BANNER - distanza banner, non ancora mostrato
      if (dist <= thresholds.banner && !this.bannerTriggered.has(poiId)) {
        this.bannerTriggered.add(poiId);
        this.emit({
          type: 'banner',
          poi: t.poi,
          remainingDistance: dist,
          mode: this.mode,
          nextStep,
        });
      }

      // CARD - distanza card, non ancora mostrata
      if (dist <= thresholds.card && !this.cardTriggered.has(poiId)) {
        this.cardTriggered.add(poiId);
        this.emit({
          type: 'card',
          poi: t.poi,
          remainingDistance: dist,
          mode: this.mode,
        });
      }
    });
  }

  private emit(event: TriggerEvent) {
    this.onTrigger?.(event);
  }

  resetPOI(poiId: string) {
    this.bannerTriggered.delete(poiId);
    this.cardTriggered.delete(poiId);
  }

  resetAll() {
    this.bannerTriggered.clear();
    this.cardTriggered.clear();
  }
}
