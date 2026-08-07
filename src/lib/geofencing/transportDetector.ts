/**
 * transportDetector.ts
 * Rileva automaticamente walking / driving dalla velocità GPS
 * con hysteresis per evitare flipping ai semafori
 */

export type TransportMode = 'walking' | 'driving';

interface SpeedSample {
  speed: number; // km/h
  timestamp: number;
}

const WALKING_MAX_KMH = 10;     // sotto → walking
const DRIVING_MIN_KMH = 15;     // sopra → driving
const HYSTERESIS_SAMPLES = 4;   // campioni consecutivi per cambio modalità
const SAMPLE_WINDOW_MS = 8000;  // finestra temporale campioni

export class TransportDetector {
  private mode: TransportMode = 'walking';
  private samples: SpeedSample[] = [];
  private onModeChange?: (mode: TransportMode) => void;

  constructor(onModeChange?: (mode: TransportMode) => void) {
    this.onModeChange = onModeChange;
  }

  /**
   * Aggiorna con nuova lettura GPS
   * @param speedMs velocità in m/s da GeolocationCoordinates.speed
   */
  update(speedMs: number | null): TransportMode {
    const speedKmh = speedMs != null && speedMs >= 0 ? speedMs * 3.6 : 0;
    const now = Date.now();

    this.samples.push({ speed: speedKmh, timestamp: now });

    // Mantieni solo campioni nella finestra temporale
    this.samples = this.samples.filter(s => now - s.timestamp < SAMPLE_WINDOW_MS);

    if (this.samples.length < HYSTERESIS_SAMPLES) return this.mode;

    const recent = this.samples.slice(-HYSTERESIS_SAMPLES);
    const avgSpeed = recent.reduce((sum, s) => sum + s.speed, 0) / recent.length;

    const prevMode = this.mode;

    if (avgSpeed > DRIVING_MIN_KMH) {
      this.mode = 'driving';
    } else if (avgSpeed < WALKING_MAX_KMH) {
      this.mode = 'walking';
    }
    // zona grigia 10-15 kmh → mantieni modalità precedente (bici / scooter lento)

    if (this.mode !== prevMode) {
      this.onModeChange?.(this.mode);
    }

    return this.mode;
  }

  getMode(): TransportMode {
    return this.mode;
  }

  // Override manuale (es. utente seleziona modalità)
  setMode(mode: TransportMode) {
    this.mode = mode;
    this.samples = [];
  }
}
