/**
 * Vibrazione «che funziona anche su iPhone».
 *
 * `navigator.vibrate` è un no-op su iOS (Safari e WKWebView non lo
 * implementano): il banner di avvicinamento e l'allarme ZTL vibravano solo
 * su Android (UX-08, audit 28/08/2026). Sul nativo si passa da
 * @capacitor/haptics (Taptic Engine su iOS, Vibrator su Android); sul web
 * resta `navigator.vibrate` dove esiste. Mai un'eccezione verso il chiamante.
 */
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

export type TipoVibrazione = 'successo' | 'avviso' | 'errore' | 'tocco';

/** Pattern per il web (ms): lo stesso che i componenti usavano prima. */
const PATTERN_WEB: Record<TipoVibrazione, number | number[]> = {
  successo: [250, 100, 250],
  avviso: [200],
  errore: [250, 120, 250],
  tocco: [30],
};

export function vibra(tipo: TipoVibrazione = 'avviso'): void {
  if (Capacitor.isNativePlatform()) {
    // Fire-and-forget: il chiamante non aspetta la vibrazione.
    (async () => {
      try {
        if (tipo === 'tocco') {
          await Haptics.impact({ style: ImpactStyle.Light });
          return;
        }
        const type = tipo === 'successo'
          ? NotificationType.Success
          : tipo === 'errore' ? NotificationType.Error : NotificationType.Warning;
        await Haptics.notification({ type });
      } catch {
        // Plugin assente nella build (o hardware senza motore aptico): silenzio.
      }
    })();
    return;
  }
  try {
    navigator.vibrate?.(PATTERN_WEB[tipo]);
  } catch {
    // API assente (Safari desktop, iOS PWA): niente da fare.
  }
}
