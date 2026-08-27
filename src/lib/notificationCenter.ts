/**
 * Centro notifiche in-app: registro persistente (localStorage) degli eventi
 * rilevanti per l'utente (trigger POI, stati audioguida, ...). Nessun
 * backend: max 100 voci FIFO, lette/non lette, badge sulla campanella del
 * profilo. Chi scrive: l'useEffect centralizzato in App.tsx (eventi
 * 'wip-poi-trigger' e 'audioguide-status'); chi legge: ProfileScreen.
 */

import { getTranslation, linguaCorrente, type Language } from './i18n';

const STORE_KEY = 'wip_notification_center';
const MAX_ENTRIES = 100;

/** Evento globale emesso a ogni modifica del registro (badge live). */
export const NOTIFICATION_CENTER_EVENT = 'wip-notification-center-updated';

export interface WipNotification {
  id: string;
  tipo: string;          // es. 'poi' | 'audioguida' | 'sistema'
  titolo: string;
  corpo?: string;
  ts: number;            // epoch ms
  letta: boolean;
  meta?: Record<string, any>;
}

const readStore = (): WipNotification[] => {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeStore = (items: WipNotification[]) => {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(items.slice(0, MAX_ENTRIES)));
  } catch { /* quota localStorage esaurita: si perde la notifica, non l'app */ }
  try {
    window.dispatchEvent(new CustomEvent(NOTIFICATION_CENTER_EVENT));
  } catch { /* ambiente senza window (SSR/test): nessun badge da aggiornare */ }
};

/**
 * Registra una notifica (in testa: più recente prima). Dedup leggero: se
 * l'ultima voce ha stesso titolo+corpo ed è arrivata da meno di 30 secondi
 * (tipico degli stati audioguida ripetuti) non si duplica.
 */
export const record = (n: { tipo: string; titolo: string; corpo?: string; ts?: number; meta?: Record<string, any> }): void => {
  const titolo = String(n.titolo || '').trim();
  if (!titolo) return;
  const items = readStore();
  const ts = n.ts ?? Date.now();
  const last = items[0];
  if (last && last.titolo === titolo && (last.corpo || '') === (n.corpo || '') && ts - last.ts < 30_000) {
    return;
  }
  items.unshift({
    id: `${ts}-${Math.random().toString(36).slice(2, 8)}`,
    tipo: n.tipo || 'sistema',
    titolo,
    corpo: n.corpo,
    ts,
    letta: false,
    meta: n.meta,
  });
  writeStore(items);
};

/** Tutte le notifiche, più recente in testa. */
export const list = (): WipNotification[] => readStore();

/** Segna tutte come lette (azzera il badge). */
export const markAllRead = (): void => {
  const items = readStore();
  if (!items.some(i => !i.letta)) return;
  writeStore(items.map(i => ({ ...i, letta: true })));
};

/** Conteggio non lette per il badge della campanella. */
export const unreadCount = (): number => readStore().filter(i => !i.letta).length;

/** "adesso" / "5 min fa" / "2 h fa" / "3 g fa" / data breve — nella lingua UI. */
export const formatRelativeTime = (ts: number, lang: Language = linguaCorrente()): string => {
  const diff = Date.now() - ts;
  if (diff < 60_000) return getTranslation('pf_time_adesso', lang);
  const min = Math.floor(diff / 60_000);
  if (min < 60) return getTranslation('pf_time_min', lang).replace('{n}', String(min));
  const ore = Math.floor(min / 60);
  if (ore < 24) return getTranslation('pf_time_h', lang).replace('{n}', String(ore));
  const giorni = Math.floor(ore / 24);
  if (giorni < 7) return getTranslation('pf_time_g', lang).replace('{n}', String(giorni));
  return new Date(ts).toLocaleDateString(getTranslation('pf_locale', lang), { day: '2-digit', month: 'short' });
};
