/**
 * IL 402 DEL GIRO, TRATTATO IN UN POSTO SOLO (03/09/2026).
 *
 * Collaudo del committente: «per attivare la navigazione serve il Day Pass,
 * viene il banner, ma non c'e` nessun link per l'acquisto». Il messaggio
 * `PASS_RICHIESTO:` arrivava in quattro punti diversi (tasto della mappa,
 * cruscotto, pannello del radar, avvio dalla bozza) e ognuno lo scriveva in
 * un toast e basta. Da qui in poi chi riceve quell'errore chiama questa
 * funzione: il toast resta, e in piu` si apre SUBITO la card del Day Pass
 * con il tasto «Acquista ora» (evento `wip-open-daypass`, gestito da
 * App.tsx). Se il pass risulta gia` attivo in locale la card non ha senso —
 * e` il server che non lo ha riconosciuto — e si dice quello.
 */
import { notify } from '../toast';
import { getTranslation, type Language } from '../i18n';
import { getDayPassState } from '../../services/dayPassService';

const PREFISSO = 'PASS_RICHIESTO';

/** Il messaggio d'errore e` il 402 del giro? */
export function ePassRichiesto(messaggio: unknown): boolean {
  return String((messaggio as any)?.message ?? messaggio ?? '').startsWith(PREFISSO);
}

/**
 * Traduce l'errore per l'utente e, se e` il 402, apre la cassa.
 * Ritorna il testo mostrato (utile a chi lo vuole anche scrivere in una riga
 * del pannello). `city` da` il titolo alla card, quando lo si conosce.
 */
export function gestisciErroreGiro(
  errore: unknown,
  language: Language,
  opzioni: { city?: string | null; toast?: boolean } = {},
): string {
  const m = String((errore as any)?.message ?? errore ?? '');
  const pass = m.startsWith(PREFISSO);
  const dettaglio = m.startsWith(`${PREFISSO}:`) ? m.slice(PREFISSO.length + 1).trim() : '';
  const testo = pass
    ? `${getTranslation('gr_pass_richiesto', language)}${dettaglio ? ` (${dettaglio})` : ''}`
    : (m || getTranslation('gr_giro_non_riuscito', language));
  if (opzioni.toast !== false) notify(testo);
  if (pass) apriCassaDayPass(opzioni.city, getTranslation('gr_dp_gate_navigazione', language));
  return testo;
}

/**
 * Apre la card del Day Pass, a meno che il pass non risulti gia` attivo:
 * in quel caso il 402 e` un guasto della verifica, e proporre una seconda
 * cassa a chi ha appena pagato e` esattamente l'errore da non fare.
 */
export function apriCassaDayPass(city?: string | null, motivo?: string): void {
  getDayPassState()
    .then((s) => {
      if (s?.active) return;
      window.dispatchEvent(new CustomEvent('wip-open-daypass', { detail: { city: city || undefined, motivo } }));
    })
    .catch(() => {
      window.dispatchEvent(new CustomEvent('wip-open-daypass', { detail: { city: city || undefined, motivo } }));
    });
}
