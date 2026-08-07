export class BackgroundService {
  private isTracking: boolean = false;
  private watchId: string | null = null;
  private isNative: boolean = false;

  constructor() {
    if (typeof window !== 'undefined') {
      const capacitor = (window as any).Capacitor;
      this.isNative = capacitor?.isNativePlatform?.() || false;
    }
  }

  public async startBackgroundTracking(onPositionUpdate: (position: any) => void): Promise<void> {
    if (!this.isNative) {
      console.warn('[Capacitor] Non sei su dispositivo nativo. Simulazione BackgroundService...');
      return;
    }

    try {
      const { LocalNotifications } = await import('@capacitor/local-notifications');
      const { registerPlugin } = await import('@capacitor/core');
      const BackgroundGeolocation = registerPlugin<any>('BackgroundGeolocation');

      // Richiedi permessi Notifiche
      const permRes = await LocalNotifications.requestPermissions();
      if (permRes.display !== 'granted') {
        console.warn('[Capacitor] Permessi notifiche negati.');
      }

      // Avvia foreground service Android con notifica persistente
      await LocalNotifications.schedule({
        notifications: [{
          id: 1,
          title: 'WIP — Navigazione attiva',
          body: 'Riceverai notifiche quando ti avvicini a luoghi interessanti',
          ongoing: true,           // non dismissibile
          autoCancel: false,
        }]
      });

      console.log('[Capacitor] Notifica persistente avviata.');

      // Registra watcher Background Geolocation
      this.watchId = await BackgroundGeolocation.addWatcher({
        backgroundMessage: 'WIP sta usando la tua posizione per la guida turistica',
        backgroundTitle: 'WIP — Navigazione attiva',
        requestPermissions: true,
        stale: false,
        distanceFilter: 10,        // aggiorna ogni 10 metri
      }, (position, error) => {
        if (error) {
          if (error.code === 'NOT_AUTHORIZED') {
            if (window.confirm("App requires location tracking permission. Open settings?")) {
              BackgroundGeolocation.openSettings();
            }
          }
          console.error('[Capacitor] BackgroundGeolocation error:', error);
          return;
        }
        if (position) {
          onPositionUpdate(position);
        }
      });

      this.isTracking = true;
      console.log('[Capacitor] Background tracking avviato con successo.');

    } catch (e) {
      console.error('[Capacitor] Errore avvio background tracking:', e);
    }
  }

  public async stopBackgroundTracking(): Promise<void> {
    if (!this.isNative || !this.isTracking) return;

    try {
      const { LocalNotifications } = await import('@capacitor/local-notifications');
      const { registerPlugin } = await import('@capacitor/core');
      const BackgroundGeolocation = registerPlugin<any>('BackgroundGeolocation');

      if (this.watchId !== null) {
        await BackgroundGeolocation.removeWatcher({ id: this.watchId });
        this.watchId = null;
      }
      
      await LocalNotifications.cancel({ notifications: [{ id: 1 }] });
      this.isTracking = false;
      console.log('[Capacitor] Background tracking interrotto e notifica rimossa.');

    } catch (e) {
      console.error('[Capacitor] Errore stop background tracking:', e);
    }
  }
}

export const backgroundService = new BackgroundService();
