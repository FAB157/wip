export class DockingDetector {
  private docked: boolean = false;
  private onDockChangeCallback?: (docked: boolean) => void;

  constructor() {
    this.restoreManualState();
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
      // Tenta WakeLock per tenere schermo acceso
      if ('wakeLock' in navigator) {
        try {
          await (navigator as any).wakeLock.request('screen');
          console.log('[Audio] WakeLock attivato');
        } catch (e) {
          console.warn('WakeLock request failed', e);
        }
      }
    } else {
      console.log('[Audio] Telefono sganciato: disattivo modalità Cruscotto');
    }
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
