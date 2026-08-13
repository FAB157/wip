// =====================================================================
// ITAINTA · errorLogger — logging centralizzato degli errori runtime
// Cattura window.onerror + unhandledrejection e li scrive nella tabella
// system_errors (letta dalla tab admin "Errori di sistema", che finora
// restava sempre vuota: nessuno scriveva mai gli errori).
// Best-effort e rate-limitato: non deve MAI aggravare un crash in corso.
// Richiede la migrazione 20260807120000_admin_observability.sql.
// =====================================================================

import { supabase } from './supabase';

const MAX_PER_MINUTE = 5;
let sentTimestamps: number[] = [];
// Dedupe: lo stesso messaggio non viene rispedito entro 60s (i render loop
// di React producono centinaia di errori identici al secondo).
let lastMessage = '';
let lastMessageTs = 0;

const canSend = (message: string): boolean => {
  const now = Date.now();
  if (message === lastMessage && now - lastMessageTs < 60000) return false;
  sentTimestamps = sentTimestamps.filter(t => now - t < 60000);
  if (sentTimestamps.length >= MAX_PER_MINUTE) return false;
  sentTimestamps.push(now);
  lastMessage = message;
  lastMessageTs = now;
  return true;
};

export const logSystemError = (
  message: string,
  opts?: { level?: 'error' | 'warning' | 'critical'; stack?: string; context?: Record<string, any> }
): void => {
  try {
    const msg = String(message || 'Errore sconosciuto').slice(0, 500);
    if (!canSend(msg)) return;
    supabase.auth.getSession().then(({ data }) => {
      const userId = data?.session?.user?.id || null;
      supabase.from('system_errors').insert({
        level: opts?.level || 'error',
        message: msg,
        stack: (opts?.stack || '').slice(0, 4000) || null,
        source: 'client',
        context: {
          userId,
          url: typeof location !== 'undefined' ? location.href : '',
          userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
          // Piattaforma per il raggruppamento nel pannello (web/android/ios):
          // letta via window per non importare Capacitor in un error handler.
          platform: (typeof window !== 'undefined' && (window as any).Capacitor?.getPlatform?.()) || 'web',
          ...opts?.context,
        },
      }).then(() => { /* ok o tabella assente: irrilevante */ });
    }).catch(() => {});
  } catch { /* mai propagare: siamo dentro un error handler */ }
};

/** Registra i listener globali. Chiamare UNA volta all'avvio (main.tsx). */
export const installGlobalErrorLogger = (): void => {
  if (typeof window === 'undefined') return;
  window.addEventListener('error', (e) => {
    // Errori di caricamento risorse (img, script): rumore, si salta.
    if (!(e instanceof ErrorEvent)) return;
    logSystemError(e.message, {
      stack: e.error?.stack,
      context: { file: e.filename, line: e.lineno, col: e.colno },
    });
  });
  window.addEventListener('unhandledrejection', (e) => {
    const reason: any = e.reason;
    logSystemError(reason?.message || String(reason), {
      stack: reason?.stack,
      context: { type: 'unhandledrejection' },
    });
  });
};
