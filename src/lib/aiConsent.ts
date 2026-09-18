// CONSENSO AI DI TERZE PARTI (18/09/2026) — App Store Guidelines 5.1.1(i) e
// 5.1.2(i), quinto rifiuto della 1.3 (build 186): «the app appears to share
// the user's personal data with a third-party AI service but does not clearly
// explain what data is sent, identify who the data is sent to, and ask the
// user's permission before sharing». Scriverlo nella privacy policy NON basta
// (lo dice il rifiuto stesso): serve una richiesta dentro l'app, PRIMA del
// primo invio.
//
// Qui sta la sola logica, senza React: ogni funzione che manda a un'AI
// qualcosa scritto, dettato o fotografato dall'utente chiama
// `chiediConsensoAi()` e prosegue solo su `true`. La finestra la disegna
// AiConsentHost (montato una volta in App.tsx), che ascolta l'evento qui sotto.
// Se l'host non c'è (errore di montaggio) la promessa si risolve `false`:
// nel dubbio NON si invia.

const CHIAVE = 'wip_ai_consent_v1';
export const EVENTO_RICHIESTA_CONSENSO_AI = 'wip-ai-consent-request';
export const EVENTO_CONSENSO_AI_CAMBIATO = 'wip-ai-consent-changed';

export type DecisioneConsensoAi = (concesso: boolean) => void;

export function haConsensoAi(): boolean {
  try {
    const grezzo = localStorage.getItem(CHIAVE);
    if (!grezzo) return false;
    return JSON.parse(grezzo)?.concesso === true;
  } catch {
    return false;
  }
}

export function salvaConsensoAi(concesso: boolean): void {
  try {
    if (concesso) localStorage.setItem(CHIAVE, JSON.stringify({ concesso: true, quando: new Date().toISOString() }));
    else localStorage.removeItem(CHIAVE);
  } catch { /* archivio pieno o bloccato: il consenso vale per questa sessione sola */ }
  try { window.dispatchEvent(new CustomEvent(EVENTO_CONSENSO_AI_CAMBIATO, { detail: { concesso } })); } catch { /* niente window */ }
}

let inAttesa: Promise<boolean> | null = null;

/**
 * `true` se l'utente ha già acconsentito o acconsente adesso. Un rifiuto NON
 * si ricorda: la funzione resta spenta e alla prossima richiesta la finestra
 * torna — chi ha detto no per sbaglio non deve cercare un'impostazione.
 */
export function chiediConsensoAi(): Promise<boolean> {
  if (haConsensoAi()) return Promise.resolve(true);
  if (inAttesa) return inAttesa;
  inAttesa = new Promise<boolean>((resolve) => {
    let deciso = false;
    const decidi: DecisioneConsensoAi = (concesso) => {
      if (deciso) return;
      deciso = true;
      if (concesso) salvaConsensoAi(true);
      inAttesa = null;
      resolve(concesso);
    };
    const evento = new CustomEvent(EVENTO_RICHIESTA_CONSENSO_AI, { detail: { decidi, preso: false } });
    window.dispatchEvent(evento);
    // Nessun host ha raccolto la richiesta: non si invia.
    if (!(evento.detail as any).preso) decidi(false);
  });
  return inAttesa;
}
