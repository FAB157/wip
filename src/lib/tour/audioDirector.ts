/**
 * DIECI TAPPE — il direttore d'orchestra audio.
 *
 * Navigatore e audioguida vogliono lo stesso orecchio. Se parlano insieme il
 * giro e` rovinato, e nessuna raffinatezza sul percorso lo recupera: e` questa
 * la funzione, non un dettaglio di rifinitura.
 *
 * Il modulo NON parla: decide soltanto. Prende una situazione e risponde chi
 * ha la precedenza. Cosi` si puo` provare senza audio, senza GPS e senza
 * camminare — ed e` il motivo per cui esiste separato dal resto.
 */

export type Voce = 'guida' | 'navigatore' | 'teaser';

export type Decisione =
  | { azione: 'parla'; voce: Voce }
  | { azione: 'accoda'; voce: Voce; motivo: string }
  | { azione: 'abbassa_e_parla'; voce: Voce; motivo: string }
  | { azione: 'taci'; motivo: string };

export interface SituazioneAudio {
  /** Che cosa vorrebbe dire qualcosa adesso. */
  richiesta: Voce;
  /** La guida sta parlando in questo momento. */
  guidaInCorso: boolean;
  /** Metri alla prossima manovra, null se non c'e` una manovra imminente. */
  metriAllaSvolta: number | null;
  /** Si sta attraversando (o si e` a ridosso di) un attraversamento stradale. */
  suAttraversamento: boolean;
  /** Il giro e` in pausa (manuale o per sosta lunga). */
  inPausa: boolean;
  /** Si e` appena arrivati alla tappa. */
  allIngresso: boolean;
}

/**
 * Sotto questi metri una svolta e` "imminente" e batte il racconto.
 * Trenta metri sono circa venti secondi di cammino: il tempo di sentire
 * l'istruzione, capirla e girare. Piu` corto e si arriva all'incrocio mentre
 * la frase finisce; piu` lungo e si interrompe la guida senza necessita`.
 */
export const SVOLTA_IMMINENTE_M = 30;

export function decidi(s: SituazioneAudio): Decisione {
  // 1. La pausa e` sacra. Nessuna voce, nessun sollecito, mai. Una sosta caffe`
  //    non e` un errore da correggere.
  if (s.inPausa) return { azione: 'taci', motivo: 'giro in pausa' };

  // 2. L'attraversamento viene prima di tutto il resto. Non e` una questione di
  //    esperienza, e` che una voce inattesa mentre si scende dal marciapiede fa
  //    alzare la testa dal posto sbagliato.
  if (s.suAttraversamento) return { azione: 'taci', motivo: 'attraversamento in corso' };

  // 3. L'arrivo alla tappa e` il momento per cui esiste tutto il resto: il
  //    navigatore tace e parla la guida.
  if (s.allIngresso) {
    if (s.richiesta === 'guida') return { azione: 'parla', voce: 'guida' };
    return { azione: 'taci', motivo: 'siamo arrivati: parla la guida' };
  }

  // 4. Niente guida in corso: chi chiede, parla.
  if (!s.guidaInCorso) return { azione: 'parla', voce: s.richiesta };

  // 5. Guida in corso. Qui sta il cuore.
  if (s.richiesta === 'guida') return { azione: 'parla', voce: 'guida' };

  if (s.richiesta === 'navigatore') {
    const imminente = s.metriAllaSvolta != null && s.metriAllaSvolta <= SVOLTA_IMMINENTE_M;
    if (imminente) {
      // Sbagliare strada costa piu` di dieci secondi di racconto. Ma non si
      // TRONCA la guida: si abbassa e si rialza, cosi` il filo non si perde.
      return { azione: 'abbassa_e_parla', voce: 'navigatore', motivo: `svolta fra ${Math.round(s.metriAllaSvolta!)} m` };
    }
    // Svolta lontana: l'istruzione aspetta il primo silenzio utile.
    // Interrompere un racconto per una svolta fra trecento metri e` gratuito
    // solo per chi scrive il codice.
    return { azione: 'accoda', voce: 'navigatore', motivo: 'svolta non imminente' };
  }

  // 6. Il teaser della tappa successiva non interrompe mai una guida in corso.
  return { azione: 'accoda', voce: 'teaser', motivo: 'guida in corso' };
}

/**
 * La coda delle voci rimandate.
 *
 * Non e` una coda qualunque: le istruzioni di navigazione INVECCHIANO. Una
 * svolta accodata mentre eravamo a trecento metri non va detta due minuti dopo
 * quando l'incrocio e` alle spalle — sarebbe peggio del silenzio.
 */
export class CodaVoci {
  private coda: { voce: Voce; testo: string; scadenza: number }[] = [];

  /** `validoPer` in secondi: dopo, l'elemento si butta invece di dirlo tardi. */
  accoda(voce: Voce, testo: string, validoPer = 45) {
    // Una sola istruzione di navigazione alla volta: se ne arriva una nuova,
    // sostituisce la vecchia. Due svolte accodate significano che la prima e`
    // gia` passata.
    if (voce === 'navigatore') this.coda = this.coda.filter(x => x.voce !== 'navigatore');
    this.coda.push({ voce, testo, scadenza: Date.now() + validoPer * 1000 });
  }

  /** Il prossimo ancora valido, o null. Butta gli scaduti passando. */
  prossimo(): { voce: Voce; testo: string } | null {
    const ora = Date.now();
    while (this.coda.length) {
      const x = this.coda.shift()!;
      if (x.scadenza > ora) return { voce: x.voce, testo: x.testo };
    }
    return null;
  }

  svuota() { this.coda = []; }
  get lunghezza() { return this.coda.length; }
}

/**
 * Quanto abbassare la guida quando la svolta deve passare sopra.
 * Non zero: se la guida sparisce del tutto sembra un'interruzione, mentre
 * abbassandola resta chiaro che sta continuando.
 */
export const VOLUME_ABBASSATO = 0.25;
