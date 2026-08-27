import { createWakeLockController } from '../../hooks/useWakeLock';

export class DockingDetector {
  private docked: boolean = false;
  private onDockChangeCallback?: (docked: boolean) => void;
  // Wake lock con la sentinella conservata: prima si chiamava request('screen')
  // buttando via il risultato e non c'era un solo release() nel file, così lo
  // schermo restava acceso a vuoto anche a telefono sganciato o con l'app in
  // background (e il lock veniva ri-chiesto a ogni avvio leggendo localStorage).
  private wakeLock = createWakeLockController('Audio/WakeLock');

  constructor() {
    this.registraAscolti();
    this.restoreManualState();
  }

  /**
   * Ri-valuta il wake lock quando la guida si accende o si spegne: senza questi
   * ascolti il lock resterebbe fermo allo stato del momento dell'avvio (era
   * proprio così che finiva chiesto a ogni caricamento leggendo localStorage).
   */
  private registraAscolti() {
    if (typeof window === 'undefined') return;
    const rivaluta = () => { void this.aggiornaWakeLock(); };
    window.addEventListener('audioguide-status', rivaluta);
    window.addEventListener('wip-settings-updated', rivaluta);
    window.addEventListener('storage', (e) => {
      if (e.key === 'wip_audioguide_active') rivaluta();
    });
  }

  public async startDetection(): Promise<void> {
    console.log('[Audio] Avvio rilevamento docking auto...');
    
    // Metodo 1: Ambient Light Sensor (Generic/Experimental)
    if ('AmbientLightSensor' in window) {
      try {
        const sensor = new (window as any).AmbientLightSensor();
        sensor.addEventListener('reading', () => {
          // Un valore molto basso potrebbe indicare che il telefono è in tasca o a faccia in giù, 
          // ma potrebbe anche essere notte in auto. Abbinato ad altri sensori.
        });
        sensor.start();
      } catch (e) {
        console.warn('AmbientLightSensor not supported or permission denied.');
      }
    }

    // Metodo 2: Battery status (is it charging?)
    if ('getBattery' in navigator) {
      try {
        const battery: any = await (navigator as any).getBattery();
        battery.addEventListener('chargingchange', () => {
          this.checkDockingState(battery.charging);
        });
        this.checkDockingState(battery.charging);
      } catch (e) {
        console.warn('Battery Status API not supported.');
      }
    }
    
    // Listen for manual overrides via local storage events across tabs
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (e) => {
        if (e.key === 'wip_is_docked') {
          this.setDocked(e.newValue === 'true');
        }
      });
    }
  }

  private checkDockingState(isCharging: boolean) {
    // Logica euristica semplice per PWA: se sta caricando, assume possibile docking.
    // Nella realtà andrebbe incrociato con accelerometro (vibrazioni auto) e connessione BT.
    // Per ora usiamo un toggle manuale che sovrascrive questa logica per dimostrazione.
    const manualDock = localStorage.getItem('wip_is_docked');
    if (manualDock !== null) return; // Priorità al manuale

    // Auto-logic disabilitata di default perché "in carica" non significa "in auto",
    // ma la lascio come predisposizione per integrazione con Capacitor Native Plugins.
  }

  public isDocked(): boolean {
    return this.docked;
  }

  public setDocked(docked: boolean) {
    if (this.docked === docked) return;
    this.docked = docked;
    localStorage.setItem('wip_is_docked', String(docked));
    
    if (this.onDockChangeCallback) {
      this.onDockChangeCallback(docked);
    }
    
    this.applyDockingBehaviors(docked);
  }

  private async applyDockingBehaviors(docked: boolean) {
    if (docked) {
      console.log('[Audio] Telefono agganciato: attivo modalità Cruscotto/Driving');
    } else {
      console.log('[Audio] Telefono sganciato: disattivo modalità Cruscotto');
    }
    await this.aggiornaWakeLock();
  }

  /** La guida in corso è l'altra condizione che giustifica lo schermo acceso. */
  private guidaAttiva(): boolean {
    try { return localStorage.getItem('wip_audioguide_active') === 'true'; } catch { return false; }
  }

  /**
   * Lo schermo resta acceso SOLO se il telefono è agganciato e la guida è
   * accesa. Fuori da questa condizione si rilascia: sganciato o guida spenta
   * significava, prima, schermo acceso a vuoto fino al timeout di sistema.
   * Il rilascio in background lo fa già il controller su visibilitychange.
   */
  private async aggiornaWakeLock() {
    if (this.docked && this.guidaAttiva()) await this.wakeLock.enable();
    else await this.wakeLock.disable();
  }

  public onDockChange(callback: (docked: boolean) => void): void {
    this.onDockChangeCallback = callback;
  }

  private restoreManualState() {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('wip_is_docked');
      if (stored === 'true') {
        this.docked = true;
        this.applyDockingBehaviors(true);
      }
    }
  }
}

export const dockingDetector = new DockingDetector();
