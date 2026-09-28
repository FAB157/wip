import { getApiUrl } from './api';

// Tracciamento visite del SITO (non dei POI, vedi CLAUDE.md e la migration
// page_views): un id di sessione casuale, tenuto solo in sessionStorage
// (sparisce chiudendo la scheda), serve solo a contare sessioni uniche —
// non identifica la persona, non è un cookie persistente.
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

/**
 * Registra una visita a una pagina/tab del sito. Mai bloccante: se fallisce
 * (rete assente, server giù) non succede nulla di visibile all'utente.
 */
export function tracciaVisita(path: string): void {
  try {
    const body = JSON.stringify({
      path,
      referrer: document.referrer || null,
      sessionId: sessionIdVisita(),
    });
    const url = getApiUrl('/api/track/pageview');
    // sendBeacon non blocca la navigazione ed è pensato apposta per questo;
    // fallback a fetch con keepalive se non disponibile (es. WebView vecchie).
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: 'application/json' });
      navigator.sendBeacon(url, blob);
    } else {
      fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
    }
  } catch { /* mai bloccare l'app per il tracciamento */ }
}
