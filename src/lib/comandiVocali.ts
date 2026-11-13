/**
 * COMANDI VOCALI NELLA VISITA (12/09/2026, richiesta del committente).
 *
 * Al museo, con le cuffie, il telefono sta in tasca: si dice «prossima»,
 * «ripeti», «dov'è», «pausa», «continua», «basta». Riconoscimento SUL
 * DISPOSITIVO (Web Speech API: Chrome Android, Safari), niente audio
 * mandato ai nostri server, attivo solo dopo un tocco sul microfono e
 * solo mentre la scheda della visita è aperta. Sui WebView nativi senza
 * SpeechRecognition il tasto non compare: meglio niente che un microfono
 * che non ascolta.
 */

export type ComandoVocale = 'prossima' | 'ripeti' | 'dove' | 'pausa' | 'riprendi' | 'stop';

// Parole chiave per lingua. Si confrontano su testo minuscolo senza accenti,
// per parola intera (o come prefisso per il cinese, dove non ci sono spazi).
const PAROLE: Record<ComandoVocale, string[]> = {
  prossima: ['prossima', 'prossimo', 'avanti', 'next', 'suivant', 'suivante', 'siguiente', 'weiter', 'nachste', 'nachstes', 'дальше', 'следующая', 'следующий', '下一个', '下一件', '下一幅'],
  ripeti: ['ripeti', 'ancora', 'repeat', 'again', 'repete', 'encore', 'repite', 'otra vez', 'wiederhole', 'wiederholen', 'nochmal', 'повтори', 'ещё раз', 'еще раз', '重复', '再说一遍', '再来一次'],
  dove: ["dov'e", 'dove', 'where', 'ou est', 'ou', 'donde', 'wo', 'wo ist', 'где', '在哪', '在哪里', '哪个展厅'],
  pausa: ['pausa', 'pause', 'aspetta', 'wait', 'attends', 'espera', 'warte', 'пауза', 'подожди', '暂停', '等一下'],
  riprendi: ['continua', 'riprendi', 'vai', 'continue', 'resume', 'go', 'reprends', 'continuer', 'continua', 'sigue', 'fortsetzen', 'weiter machen', 'продолжай', 'продолжить', '继续'],
  stop: ['basta', 'stop', 'ferma', 'fermati', 'silenzio', 'arrete', 'arrete toi', 'para', 'silencio', 'halt', 'stopp', 'ruhe', 'стоп', 'хватит', 'тихо', '停止', '停', '安静'],
};

const normalizza = (s: string) =>
  String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['’]/g, "'").replace(/[^a-z0-9一-鿿Ѐ-ӿ' ]/g, ' ').replace(/\s+/g, ' ').trim();

/** Che comando c'è dentro la frase riconosciuta? `null` se nessuno. */
export function riconosciComando(testo: string): ComandoVocale | null {
  const t = normalizza(testo);
  if (!t) return null;
  const parole = new Set(t.split(' '));
  // Ordine di precedenza: «stop» e «pausa» vincono su tutto (sono urgenti),
  // «dov'è» prima di «prossima» perché «dov'è la prossima» chiede la sala.
  const ordine: ComandoVocale[] = ['stop', 'pausa', 'dove', 'ripeti', 'riprendi', 'prossima'];
  for (const c of ordine) {
    for (const p of PAROLE[c]) {
      const pn = normalizza(p);
      if (!pn) continue;
      if (/[一-鿿]/.test(pn)) { if (t.includes(pn)) return c; continue; }
      if (pn.includes(' ')) { if (t.includes(pn)) return c; continue; }
      if (parole.has(pn)) return c;
    }
  }
  return null;
}

const BCP47: Record<string, string> = { it: 'it-IT', en: 'en-US', fr: 'fr-FR', es: 'es-ES', de: 'de-DE', ru: 'ru-RU', zh: 'zh-CN' };

function motore(): any {
  if (typeof window === 'undefined') return null;
  return (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null;
}

export function comandiVocaliDisponibili(): boolean {
  return !!motore();
}

/**
 * Avvia l'ascolto continuo. Torna la funzione che lo ferma. `onStato` dice
 * se il microfono è davvero acceso (il permesso può essere negato dopo).
 */
export function avviaAscolto(
  lingua: string,
  onComando: (c: ComandoVocale, testo: string) => void,
  onStato: (attivo: boolean) => void,
): () => void {
  const SR = motore();
  if (!SR) { onStato(false); return () => {}; }
  let attivo = true;
  let rec: any = null;
  let ultimoTesto = '';
  let ultimoQuando = 0;

  const crea = () => {
    rec = new SR();
    rec.lang = BCP47[String(lingua || 'it').toLowerCase().slice(0, 2)] || 'it-IT';
    rec.continuous = true;
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (ev: any) => {
      const ultimo = ev.results?.[ev.results.length - 1];
      const testo = String(ultimo?.[0]?.transcript || '').trim();
      if (!testo) return;
      // Lo stesso testo entro due secondi è un'eco del riconoscitore, non
      // un secondo comando.
      const ora = Date.now();
      if (testo === ultimoTesto && ora - ultimoQuando < 2000) return;
      ultimoTesto = testo; ultimoQuando = ora;
      const c = riconosciComando(testo);
      if (c) onComando(c, testo);
    };
    rec.onerror = (ev: any) => {
      const err = String(ev?.error || '');
      // Senza permesso o senza microfono non si insiste.
      if (err === 'not-allowed' || err === 'service-not-allowed' || err === 'audio-capture') { attivo = false; onStato(false); }
    };
    rec.onend = () => {
      // Chrome chiude l'ascolto dopo qualche secondo di silenzio: si riapre
      // finché l'utente non spegne il microfono.
      if (!attivo) { onStato(false); return; }
      setTimeout(() => { if (attivo) { try { rec.start(); } catch { /* già avviato */ } } }, 250);
    };
    rec.onstart = () => onStato(true);
  };

  try {
    crea();
    rec.start();
  } catch {
    attivo = false;
    onStato(false);
  }

  return () => {
    attivo = false;
    try { rec?.stop(); } catch { /* già fermo */ }
    try { rec?.abort?.(); } catch { /* ok */ }
    onStato(false);
  };
}
