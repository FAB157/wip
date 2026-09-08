// =====================================================================
// DETTATURA VOCALE — una sola porta per web e app native (08/09/2026).
//
// Il tasto microfono dell'agente WIP «non si poteva cliccare» sull'app: in
// realtà si cliccava, ma non succedeva niente. Causa: sia AgentControls sia
// WipAgentPlanner usavano SOLO `window.SpeechRecognition` /
// `webkitSpeechRecognition` — la Web Speech API. Quella API esiste in Chrome
// desktop, ma NON nella WKWebView di iOS né, in pratica, nella WebView
// Android: `SR` era undefined e il tasto finiva nel ramo «non supportato»
// (un toast che passa inosservato) oppure `rec.start()` moriva in silenzio.
//
// Qui il riconoscimento passa dal plugin NATIVO
// (@capacitor-community/speech-recognition: SFSpeechRecognizer su iOS,
// SpeechRecognizer su Android) quando l'app gira nativa, e resta sulla Web
// Speech API sul web, dove funziona. Un solo modulo per entrambi i punti
// dell'interfaccia: se domani si aggiunge una terza bocca, non si riscrive
// la logica dei permessi una terza volta.
// =====================================================================
import { Capacitor } from '@capacitor/core';

/** Cosa può andare storto, in modo che l'interfaccia scelga il messaggio. */
export type MotivoVoce = 'non_disponibile' | 'permesso_negato' | 'errore';

export interface SessioneVoce {
  /** Ferma l'ascolto. Si può chiamare più volte senza danno. */
  ferma: () => void;
}

export interface OpzioniVoce {
  /** BCP-47: it-IT, en-US, … */
  lingua: string;
  /** Testo riconosciuto (una volta sola, a fine dettatura). */
  onRisultato: (testo: string) => void;
  /** Ascolto finito, per qualunque motivo: l'interfaccia spegne il rosso. */
  onFine: () => void;
  /** Fallito prima ancora di ascoltare. `onFine` arriva comunque. */
  onErrore?: (motivo: MotivoVoce) => void;
}

const SR = (): any =>
  typeof window === 'undefined'
    ? null
    : (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

/**
 * C'è modo di dettare su questo dispositivo? Sincrono di proposito: serve a
 * decidere COME disegnare il tasto, non si può aspettare una promise.
 * Sul nativo il plugin c'è sempre (è compilato dentro l'app); la verifica
 * vera — servizio di dettatura presente, permesso concesso — avviene
 * all'avvio, dove si può anche chiedere il permesso all'utente.
 */
export function voceDisponibile(): boolean {
  return Capacitor.isNativePlatform() ? true : !!SR();
}

/** Avvia l'ascolto. Ritorna la sessione da fermare, o null se non è partito. */
export async function avviaAscolto(opts: OpzioniVoce): Promise<SessioneVoce | null> {
  return Capacitor.isNativePlatform() ? avviaNativo(opts) : avviaWeb(opts);
}

// ── Nativo: plugin Capacitor ────────────────────────────────────────────
async function avviaNativo(opts: OpzioniVoce): Promise<SessioneVoce | null> {
  try {
    const { SpeechRecognition } = await import('@capacitor-community/speech-recognition');

    const { available } = await SpeechRecognition.available();
    if (!available) {
      opts.onErrore?.('non_disponibile');
      opts.onFine();
      return null;
    }

    // Il permesso si chiede solo se manca: richiederlo a ogni tocco fa
    // comparire il dialogo di sistema anche a chi ha già detto sì.
    let stato = (await SpeechRecognition.checkPermissions()).speechRecognition;
    if (stato !== 'granted') stato = (await SpeechRecognition.requestPermissions()).speechRecognition;
    if (stato !== 'granted') {
      opts.onErrore?.('permesso_negato');
      opts.onFine();
      return null;
    }

    let chiusa = false;
    const ferma = () => {
      if (chiusa) return;
      chiusa = true;
      SpeechRecognition.stop().catch(() => { /* già ferma */ });
    };

    // partialResults=false → start() si risolve con il testo finale.
    // popup=false: su Android il dialogo di sistema coprirebbe la chat, e
    // l'utente perderebbe di vista quello che WIP gli ha appena chiesto.
    SpeechRecognition.start({
      language: opts.lingua,
      maxResults: 1,
      partialResults: false,
      popup: false,
    })
      .then((res: { matches?: string[] }) => {
        chiusa = true;
        const testo = String(res?.matches?.[0] || '').trim();
        if (testo) opts.onRisultato(testo);
      })
      .catch(() => {
        // Anche l'annullamento passa di qui: non è un errore da mostrare.
        chiusa = true;
      })
      .finally(() => opts.onFine());

    return { ferma };
  } catch {
    opts.onErrore?.('errore');
    opts.onFine();
    return null;
  }
}

// ── Web: Web Speech API ─────────────────────────────────────────────────
function avviaWeb(opts: OpzioniVoce): SessioneVoce | null {
  const Riconoscitore = SR();
  if (!Riconoscitore) {
    opts.onErrore?.('non_disponibile');
    opts.onFine();
    return null;
  }
  try {
    const rec = new Riconoscitore();
    rec.lang = opts.lingua;
    rec.continuous = false;
    rec.interimResults = false;
    rec.onresult = (ev: any) => {
      const testo = String(ev.results?.[0]?.[0]?.transcript || '').trim();
      if (testo) opts.onRisultato(testo);
    };
    rec.onerror = (ev: any) => {
      // 'not-allowed' = microfono negato dal browser: è un permesso, non un
      // guasto, e va detto con le parole giuste.
      if (ev?.error === 'not-allowed' || ev?.error === 'service-not-allowed') opts.onErrore?.('permesso_negato');
    };
    rec.onend = () => opts.onFine();
    rec.start();
    return {
      ferma: () => { try { rec.stop(); } catch { /* già ferma */ } },
    };
  } catch {
    opts.onErrore?.('errore');
    opts.onFine();
    return null;
  }
}
