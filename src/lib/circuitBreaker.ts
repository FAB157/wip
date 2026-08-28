// src/lib/circuitBreaker.ts
//
// Il breaker deve aprirsi SOLO su errori di RETE (fetch fallita, timeout, 5xx
// transitori, rate limit): un errore DETERMINISTICO (4xx, RLS, firma RPC
// errata / funzione mancante) si ripeterebbe identico e aprire il breaker
// bloccherebbe le chiamate corrette successive. C'è già half-open dopo un
// cooldown; qui aggiungiamo la classificazione e un reset() esplicito.

/**
 * True se l'errore è (probabilmente) di RETE/transitorio. Gli errori applicativi
 * riconosciuti (4xx, RLS, funzione/colonna mancante, violazioni) tornano false
 * e NON aprono il breaker. Un errore ignoto → transitorio (prudente: preserva
 * la protezione originale, tanto c'è comunque il cooldown/half-open).
 */
export function isNetworkError(e: any): boolean {
  const msg = String(e?.message || e || '').toLowerCase();
  // Applicativo/deterministico → NON di rete (controllo prima).
  // NB: 429 (Too Many Requests) è transitorio → escluso dal range deterministico
  // (42[0-8]) così lo cattura il ramo di rete più sotto, non questo.
  if (/could not find|does not exist|schema cache|no rows|invalid input|violates|permission denied|row-level security|row level security|\b40[0-9]\b|\b41[0-9]\b|\b42[0-8]\b|pgrst|22\d{3}|23\d{3}|42\d{3}/.test(msg)) {
    return false;
  }
  // Rete/transitorio esplicito.
  if (/failed to fetch|networkerror|network error|load failed|timeout|timed out|econn|enotfound|eai_again|dns|fetch failed|socket|aborted|\b50[0-9]\b|\b52[0-9]\b|429|too many requests|unavailable/.test(msg)) {
    return true;
  }
  // Ignoto → trattato come transitorio (verrà comunque riaperto dal cooldown).
  return true;
}

export class CircuitBreaker {
  private failureCount = 0;
  private lastFailureTime = 0;
  private readonly threshold = 3;
  private readonly cooldownMs = 60000; // 1 min

  async execute<T>(request: () => Promise<T>): Promise<T> {
    if (this.isOpen()) {
      throw new Error("Circuit breaker is open - Network cooldown");
    }
    try {
      const result = await request();
      this.failureCount = 0;
      return result;
    } catch (e) {
      // Solo gli errori di RETE contano verso l'apertura: un 4xx/RLS/firma RPC
      // è deterministico e non è una condizione transitoria da attendere.
      if (isNetworkError(e)) {
        this.failureCount++;
        this.lastFailureTime = Date.now();
        // All'apertura si registra l'errore VERO in system_errors: l'utente
        // vede solo «pausa di sicurezza» (IPA del 28/08/2026, Carrara) e
        // senza questa riga non c'è modo di sapere cosa ha fallito davvero.
        if (this.failureCount === this.threshold) {
          import('./errorLogger')
            .then(({ logSystemError }) => logSystemError(
              `Circuit breaker aperto: ${String((e as any)?.message || e).slice(0, 300)}`,
              { level: 'warning', context: { type: 'circuit_breaker', failureCount: this.failureCount } },
            ))
            .catch(() => {});
        }
      }
      throw e;
    }
  }

  private isOpen(): boolean {
    if (this.failureCount >= this.threshold) {
      if (Date.now() - this.lastFailureTime > this.cooldownMs) {
        this.failureCount = 0; // Half-open
        return false;
      }
      return true;
    }
    return false;
  }

  /** Reset esplicito (ripristino manuale / test). */
  reset(): void {
    this.failureCount = 0;
    this.lastFailureTime = 0;
  }
}

export const supabaseCircuitBreaker = new CircuitBreaker();
