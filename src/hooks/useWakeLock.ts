import { useEffect } from 'react';

// Wake lock schermo: logica condivisa fuori da React, perché serve anche a chi
// non è un componente (dockingDetector). Il punto dolente storico: la sentinella
// veniva scartata e non veniva MAI rilasciata, così lo schermo restava acceso a
// vuoto — a guida spenta, a telefono sganciato dal supporto, con l'app in
// background — finché il sistema non spegneva da solo. Qui la sentinella si
// conserva, si rilascia allo spegnimento e quando la pagina va in background, e
// si ri-chiede al ritorno SOLO se la condizione è ancora vera.
// Tutto fail-open: se l'API manca o la richiesta viene negata non succede nulla.

export interface WakeLockController {
  /** Chiede (e mantiene) il wake lock. Idempotente. */
  enable(): Promise<void>;
  /** Rilascia il wake lock e smette di ri-chiederlo. Idempotente. */
  disable(): Promise<void>;
  isActive(): boolean;
  /** Rilascia tutto e stacca i listener. */
  dispose(): void;
}

export function createWakeLockController(tag = 'WakeLock'): WakeLockController {
  let sentinel: WakeLockSentinel | null = null;
  let voluto = false;      // stato desiderato: guida accesa / telefono agganciato
  let listening = false;
  let logNonSupportato = false;

  const supportato = () => typeof navigator !== 'undefined' && 'wakeLock' in navigator;

  const richiedi = async () => {
    if (!voluto || sentinel) return;
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
    if (!supportato()) {
      // Una riga sola, non a ogni tentativo.
      if (!logNonSupportato) { logNonSupportato = true; console.warn(`[${tag}] API non supportata da questo browser.`); }
      return;
    }
    try {
      const s = await navigator.wakeLock.request('screen');
      // Se nel frattempo è stato spento, si rilascia subito invece di tenerlo.
      if (!voluto) { try { await s.release(); } catch { /* ignorato */ } return; }
      sentinel = s;
      s.addEventListener('release', () => { if (sentinel === s) sentinel = null; });
    } catch {
      /* negato o pagina non visibile: si riproverà al prossimo enable/ritorno */
    }
  };

  const rilascia = async () => {
    const s = sentinel;
    sentinel = null;
    if (!s) return;
    try { await s.release(); } catch { /* già rilasciato dal sistema */ }
  };

  const onVisibility = () => {
    if (typeof document === 'undefined') return;
    if (document.visibilityState === 'visible') {
      // Ri-chiesta solo se la condizione è ancora vera.
      if (voluto) void richiedi();
    } else {
      // In background lo schermo è spento comunque: tenere il lock è spreco.
      void rilascia();
    }
  };

  const ascolta = () => {
    if (listening || typeof document === 'undefined') return;
    document.addEventListener('visibilitychange', onVisibility);
    listening = true;
  };
  const smettiAscolto = () => {
    if (!listening || typeof document === 'undefined') return;
    document.removeEventListener('visibilitychange', onVisibility);
    listening = false;
  };

  return {
    async enable() {
      voluto = true;
      ascolta();
      await richiedi();
    },
    async disable() {
      voluto = false;
      await rilascia();
    },
    isActive() { return sentinel !== null; },
    dispose() {
      voluto = false;
      smettiAscolto();
      void rilascia();
    },
  };
}

export function useWakeLock(enabled: boolean) {
  useEffect(() => {
    const ctrl = createWakeLockController();
    if (enabled) void ctrl.enable();
    return () => { ctrl.dispose(); };
  }, [enabled]);
}
