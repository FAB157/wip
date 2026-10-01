import { Capacitor } from '@capacitor/core';
import { getApiUrl } from './api';

// Tracciamento visite ed eventi dei servizi (non le view dei singoli POI su tabella a parte: vedi CLAUDE.md e le
// migration page_views). SEMPRE ANONIMO (26/09/2026, committente: «tutto ciò che non serve autorizzazioni
// esterne»): un id di sessione casuale in sessionStorage, che sparisce chiudendo la scheda/app — mai un id
// persistente, mai l'utente, mai l'IP. Così non serve il consenso del banner.
function sessionIdVisita(): string {
  try {
    const chiave = 'wip_session_id';
    let id = sessionStorage.getItem(chiave);
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem(chiave, id);
    }
    return id;
  } catch {
    return 'senza-storage';
  }
}

// Da dove è arrivata QUESTA sessione: parametri utm_* e link d'ingresso, presi una sola volta (alla prima pagina)
// e ripetuti su ogni riga, così il pannello sa per ogni evento da quale campagna/sito veniva la persona.
type Ingresso = { utm_source?: string; utm_medium?: string; utm_campaign?: string; utm_content?: string; landing_url?: string; referrer?: string | null };
function ingressoSessione(): Ingresso {
  try {
    const salvato = sessionStorage.getItem('wip_ingresso');
    if (salvato) return JSON.parse(salvato);
    const q = new URLSearchParams(window.location.search);
    const v = (k: string) => (q.get(k) || '').slice(0, 120) || undefined;
    const ing: Ingresso = {
      utm_source: v('utm_source'), utm_medium: v('utm_medium'), utm_campaign: v('utm_campaign'), utm_content: v('utm_content'),
      landing_url: window.location.href.slice(0, 300),
      referrer: document.referrer || null,
    };
    sessionStorage.setItem('wip_ingresso', JSON.stringify(ing));
    return ing;
  } catch { return {}; }
}

// Contesto che App.tsx aggiorna (lingua dell'app, registrato sì/no): mai l'identità.
const contesto: { lang?: string; logged?: boolean } = {};
export function impostaContestoVisite(c: { lang?: string; logged?: boolean }) { Object.assign(contesto, c); }

const piattaforma = (): string => { try { return Capacitor.getPlatform(); } catch { return 'web'; } }; // 'web' | 'android' | 'ios'
const APP_VERSION = '1.4';

function invia(percorso: string, dati: Record<string, any>): void {
  try {
    const ing = ingressoSessione();
    const body = JSON.stringify({ ...ing, ...dati, sessionId: sessionIdVisita(), platform: piattaforma(), appVersion: APP_VERSION, lang: contesto.lang, logged: contesto.logged });
    const url = getApiUrl(percorso);
    // text/plain: niente preflight CORS (dall'app nativa l'origine è diversa da wip.guide). Il server lo legge.
    if (navigator.sendBeacon) {
      navigator.sendBeacon(url, new Blob([body], { type: 'text/plain' }));
    } else {
      fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body, keepalive: true }).catch(() => {});
    }
  } catch { /* mai bloccare l'app per il tracciamento */ }
}

let primaPagina = true;
/**
 * Registra una visita a una pagina/tab (sito e app). La prima della sessione porta anche il tempo di caricamento.
 */
export function tracciaVisita(path: string): void {
  let loadMs: number | undefined;
  if (primaPagina) {
    primaPagina = false;
    try { const n = performance.getEntriesByType('navigation')[0] as any; loadMs = n ? Math.round(n.domContentLoadedEventEnd || n.duration || 0) : Math.round(performance.now()); } catch { /* niente */ }
  }
  invia('/api/track/pageview', { path, loadMs });
}

/**
 * Registra l'uso di un servizio (pin aperto, audioguida, itinerario…). `nome` deve stare nella lista chiusa del
 * server (EVENTI_TRACCIATI in server.ts), `dettaglio` è corto e mai personale (categoria, città, lingua, numero).
 */
export function tracciaEvento(nome: string, dettaglio?: string | number | null): void {
  invia('/api/track/evento', { evento: nome, dettaglio: dettaglio == null ? undefined : String(dettaglio).slice(0, 80) });
}
