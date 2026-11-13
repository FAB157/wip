/**
 * REGOLA 23/10/2026 (ricollaudo Lugano) — che cosa è una GUIDA da leggere, lato app.
 * Specchio di server.ts (frasiDiManiera, narrazioneDaRifare, togliFrasiModello, testoSoloDati): se cambi una
 * lista là, cambiala qui. Il server resta l'ultima parola (/api/tts/smart risponde 422 `riga_dati` /
 * `testo_da_rifare`), ma l'app decide PRIMA di addebitare il Day Pass e prima di scegliere quale testo leggere.
 */

const FORMULE = /\bscopri\b|immergiti|lasciati (incantare|sorprendere|trasportare)|un angolo di|custodisce segreti|storia e (paesaggio|natura|cultura|tradizione) si (incontrano|fondono)|raccontan[oa] l'anima|invita a riflettere|patrimonio (architettonico|culturale|storico) (locale|del territorio)|tipic[oa] del territorio|gioiello nascosto|viaggio nel tempo|atmosfera unica|imperdibile|da non perdere|hidden gem|must-see|breathtaking|rich history|steeped in history|cuore pulsante|fulcro (della|di una) (vita|comunit)|secoli di (fede|storia|devozione)|vita spirituale|punto di riferimento|si respira|testimon[ei] silenzios|tra (le )?sue mura|passato e presente|beating heart|heart and soul|ricc[oa] di (storia|fascino)|esperienza (unica|indimenticabile)|merita una visita|worth a visit|punti panoramici pi[uù] suggestivi|scrigno di tesori|luogo magico|senza tempo|contesto unico|una delle (regioni|citt[aà]|zone|localit[aà]|piazze|chiese|valli) pi[uù] (belle|suggestive|affascinanti)/gi;

const RAGIONAMENTO = /<\/?think>|^\s*(devo |let me |i need to |okay, |ok, (devo|i need))/i;

const FRASI = (t: string) => t.split(/(?<=[.!?…])\s+/).map(s => s.trim()).filter(Boolean);

/** Quante formule restano dopo la pulizia che fa il server (via le frasi con formula, se resta ≥ 2/3 del testo). */
export function formuleResidue(testo: unknown, personaggio = ''): number {
  const t = String(testo || '').trim();
  if (!t) return 0;
  const nicky = /^nicky/.test(String(personaggio || ''));
  const conta = (s: string) => (s.match(FORMULE) || []).filter(m => !(nicky && /must-see/i.test(m))).length;
  if (!conta(t)) return 0;
  const resto = FRASI(t).filter(f => !conta(f)).join(' ');
  return resto.length >= t.length * 0.66 ? 0 : conta(t);
}

/** Una guida da rifare: ragionamento del modello, o formule vietate che la pulizia non può togliere. */
export function guidaDaRifare(testo: unknown, personaggio = ''): boolean {
  const t = String(testo || '').trim();
  if (!t) return false;
  return RAGIONAMENTO.test(t) || formuleResidue(t, personaggio) > 0;
}

const FRASE_MODELLO_DATI: RegExp[] = [
  /\bclassificat[oa] come\b|\bclassified as\b|\bclass[ée]e? comme\b|\bclasificad[oa] como\b|\beingestuft als\b/i,
  /^(Dati verificati|Verified data|Données vérifiées|Datos verificados)\b/i,
  /^[^.!?]{0,80}(?:^|\s)(è|e'|is|est|es|ist)\s+(un|una|uno|un'|a|an|une|ein|eine|el|la)\s+[\p{L} '-]{2,30}\s+(di|a|in|à|de|en|von|im|of)\s+[\p{Lu}][\p{L}' -]{1,40}(,\s*(nel|nella|in|del|della|im|dans le)\s+[\p{L}' -]{1,40})?[.!]?$/u,
  /^[^.!?]{0,60}\b(si trova|is located|se trouve|se encuentra|befindet sich)\s+(a|in|nel|nella|at|à|en|dans)\b[^.!?]{0,60}[.!]?$/i,
];

/** Il testo senza le frasi-modello delle schede composte dai dati (rigaDatiLuogo / schedaDaiDati). */
export function togliFrasiModello(testo: unknown): string {
  const s = String(testo || '').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  return FRASI(s).filter((fr) => {
    if (fr.includes(' · ') && !/\b(fu|era|venne|was|built|costruit|fondat)\b/i.test(fr)) return false;
    return !FRASE_MODELLO_DATI.some(re => re.test(fr));
  }).join(' ').trim();
}

/** «È una piazza di Lugano… classificata come piazza»: solo dati, mai una guida. */
export function testoSoloDati(testo: unknown): boolean {
  return togliFrasiModello(testo).length < 60;
}

/** Una GUIDA vera da leggere con la voce: ≥ 80 caratteri, almeno una frase, non dati, non segnaposto, non da rifare. */
export function guidaLeggibile(testo: unknown, personaggio = ''): boolean {
  const s = String(testo || '').trim();
  if (s.length < 80) return false;
  if (/apri l'app per scoprire|open the app to discover/i.test(s)) return false;
  if (!/[.!?…]/.test(s) && s.includes(' · ')) return false;
  if (testoSoloDati(s)) return false;
  return !guidaDaRifare(s, personaggio);
}
