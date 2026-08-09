/**
 * Notifiche in-app condivise.
 *
 * L'app usava `alert()` in una novantina di punti: blocca il thread, non è
 * stilizzabile, non è traducibile senza passare dal chiamante e su PWA iOS
 * mostra il dominio nel titolo del popup. Qui c'è un canale unico, non
 * bloccante, montato una sola volta in App.tsx (`<ToastHost />`).
 *
 * Uso:
 *   import { notify } from '../lib/toast';
 *   notify('Crediti insufficienti');            // tono 'error' (default)
 *   notify('Salvato!', 'success');
 *
 * `window.confirm` NON va sostituito con questo: serve una risposta
 * dell'utente, e un toast non la può dare.
 */

export type ToastTone = 'error' | 'success' | 'info';

export const TOAST_EVENT = 'wip-toast';

export interface ToastDetail {
  id: number;
  text: string;
  tone: ToastTone;
  /** Millisecondi prima della chiusura automatica. */
  duration: number;
}

let seq = 0;

export function notify(text: string, tone: ToastTone = 'error', duration = 6000): void {
  // Messaggi vuoti (es. `alert(err.message)` con message undefined) non
  // devono produrre un toast fantasma.
  const body = String(text ?? '').trim();
  if (!body) return;

  try {
    window.dispatchEvent(new CustomEvent<ToastDetail>(TOAST_EVENT, {
      detail: { id: ++seq, text: body, tone, duration }
    }));
  } catch {
    // Ambiente senza DOM (SSR/test): il messaggio non va perso del tutto.
    console.warn('[toast]', body);
  }
}
