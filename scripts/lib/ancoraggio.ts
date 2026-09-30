// VERIFICA DI ANCORAGGIO DEI TESTI — modulo puro (nessuna rete, nessun DB).
//
// Un testo di POI e' "ancorato" quando ogni affermazione specifica che contiene
// (anni, numeri, nomi propri, stili, paesaggio) compare nelle FONTI del luogo.
// Serve a trovare le schede inventate o riempitive senza dipendere dal marcatore
// enrichment_source, che i testi vecchi non hanno.
//
// Limite dichiarato: non capisce il senso, controlla la PRESENZA dei termini.
// Un testo senza nessuna affermazione specifica passa come "generico", non come
// "falso": per questo i due verdetti sono separati.

export type VerdettoTesto =
  | 'vuoto'        // niente da valutare
  | 'ancorato'     // le affermazioni specifiche stanno nelle fonti
  | 'non_ancorato' // contiene specifiche che le fonti non hanno (da rifare)
  | 'generico';    // nessuna specifica e frasi da dépliant / riempitivo

export interface EsitoAncoraggio {
  verdetto: VerdettoTesto;
  /** Affermazioni specifiche non trovate nelle fonti. */
  nonAncorate: string[];
  /** Frasi da dépliant trovate. */
  frasiVuote: string[];
  /** Quante affermazioni specifiche il testo contiene (misura di concretezza). */
  specifiche: number;
}

export interface ContestoPoi {
  name?: string;
  city?: string;
  region?: string;
  /** Testi delle fonti verificate (Wikipedia, Wikidata, sito, tag OSM...). */
  fonti: string[];
}

/** Frasi vuote da dépliant: occupano spazio senza dire nulla. */
const FRASI_VUOTE: RegExp[] = [
  /mozzafiato/i, /suggestiv[aoie]/i, /luogo magico/i, /un viaggio nel tempo/i,
  /mix di storia e bellezza/i, /sospes[oa] tra passato e presente/i, /scrigno di/i,
  /cuore pulsante/i, /incarna lo spirito/i, /lontano dal caos/i, /fuga dalla routine/i,
  /ricaricare le batterie/i, /imperdibile/i, /da non perdere/i, /angolo di paradiso/i,
  /perfett[oa] per chi cerca/i, /il posto ideale per/i, /tra storia e natura/i,
  /oasi di (pace|tranquillit)/i, /immers[oa] (nella|nel)/i, /come in un sogno/i,
];

/**
 * Lessico concreto: parole che affermano PAESAGGIO, STILE o EPOCA. Se il testo
 * le usa e le fonti no, il modello le ha prese dalla categoria o dalla regione
 * ("Toscana" -> "colline e vigneti"), non dal luogo.
 */
const LESSICO_CONCRETO = [
  // paesaggio
  'vigneti', 'vigneto', 'colline', 'collina', 'oliveti', 'uliveti', 'boschi', 'bosco', 'vallata',
  'montagne', 'montagna', 'lago', 'fiume', 'mare', 'spiaggia', 'panorama', 'panoramico', 'panoramica',
  'panoramici', 'panoramiche', 'campagna', 'cipressi', 'scogliera', 'cascata', 'sorgente', 'sorgenti',
  // stile e materiali
  'romanico', 'romanica', 'gotico', 'gotica', 'barocco', 'barocca', 'rinascimentale', 'rinascimento',
  'liberty', 'neoclassico', 'neoclassica', 'medievale', 'affreschi', 'affresco', 'campanile', 'navata',
  'facciata', 'marmo', 'mosaici', 'mosaico', 'cupola', 'torre',
];

const STOP_MAIUSCOLE = new Set([
  'il', 'lo', 'la', 'i', 'gli', 'le', 'un', 'una', 'uno', 'questo', 'questa', 'qui', 'oggi', 'dentro',
  'dei', 'del', 'della', 'nel', 'nella', 'con', 'per', 'tra', 'fra', 'ma', 'se', 'ora', 'poi',
  'the', 'a', 'an', 'in', 'on', 'of', 'this', 'that', 'here', 'today', 'and', 'but', 'it',
]);

const SECOLI: Record<string, string> = {
  duecento: 'xiii', trecento: 'xiv', quattrocento: 'xv', cinquecento: 'xvi', seicento: 'xvii',
  settecento: 'xviii', ottocento: 'xix', novecento: 'xx',
};

/** Minuscolo, senza accenti, spazi ridotti; secoli in numeri romani. */
export function normalizza(s: string): string {
  let t = (s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
  // numeri "8.000", "8 000", "8,000" -> "8000" (solo gruppi da 3 cifre)
  t = t.replace(/(\d)[.,\s ](?=\d{3}(\D|$))/g, '$1');
  // "il Seicento" / "XVII secolo" / "17th century" -> "xvii"
  for (const [nome, rom] of Object.entries(SECOLI)) t = t.replace(new RegExp(`\\b${nome}\\b`, 'g'), ` ${rom} `);
  t = t.replace(/\bsecolo\b|\bsec\.?\b|\bcentury\b/g, ' ');
  t = t.replace(/(\d{1,2})(st|nd|rd|th)\b/g, (_m, n) => ` ${romano(parseInt(n, 10) - 0)} `);
  return t.replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function romano(n: number): string {
  // "17th century" = XVII (n gia' e' il secolo)
  const r: Array<[number, string]> = [[10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']];
  let out = '';
  for (const [v, s] of r) while (n >= v) { out += s; n -= v; }
  return out;
}

function contiene(haystackNorm: string, needleNorm: string): boolean {
  if (!needleNorm) return true;
  return new RegExp(`(^|\\s)${needleNorm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`).test(haystackNorm);
}

/** Numeri di 3+ cifre (anni, conteggi, superfici): i piu' facili da inventare. */
export function estraiNumeri(testo: string): string[] {
  const n = normalizza(testo).match(/\b\d{3,}\b/g) || [];
  return [...new Set(n)];
}

/**
 * Nomi propri: parole maiuscole NON a inizio frase, e sequenze di due o piu'
 * maiuscole ("Gian Luigi Giordani"). Restituisce i singoli token normalizzati.
 */
export function estraiNomiPropri(testo: string): string[] {
  const out = new Set<string>();
  const frasi = testo.split(/(?<=[.!?…])\s+|\n+/);
  for (const frase of frasi) {
    const parole = frase.replace(/^[^A-Za-zÀ-ÿ0-9]+/, '').split(/\s+/);
    parole.forEach((p, i) => {
      const w = p.replace(/^[^A-Za-zÀ-ÿ]+|[^A-Za-zÀ-ÿ]+$/g, '');
      if (w.length < 3 || !/^[A-ZÀ-Ý]/.test(w)) return;
      if (i === 0) return; // inizio frase: la maiuscola non dice nulla
      const n = normalizza(w);
      if (!n || STOP_MAIUSCOLE.has(n)) return;
      out.add(n);
    });
  }
  return [...out];
}

export function trovaFrasiVuote(testo: string): string[] {
  return FRASI_VUOTE.filter(r => r.test(testo)).map(r => (testo.match(r) || [''])[0]);
}

export function valutaAncoraggio(testo: string, ctx: ContestoPoi): EsitoAncoraggio {
  const t = (testo || '').trim();
  if (t.length < 20) return { verdetto: 'vuoto', nonAncorate: [], frasiVuote: [], specifiche: 0 };

  const fontiNorm = normalizza([...ctx.fonti, ctx.name || '', ctx.city || '', ctx.region || ''].join(' \n '));
  const frasiVuote = trovaFrasiVuote(t);

  const nonAncorate: string[] = [];
  let specifiche = 0;

  for (const num of estraiNumeri(t)) {
    specifiche++;
    if (!contiene(fontiNorm, num)) nonAncorate.push(num);
  }
  for (const nome of estraiNomiPropri(t)) {
    specifiche++;
    if (!contiene(fontiNorm, nome)) nonAncorate.push(nome);
  }
  const tNorm = normalizza(t);
  for (const parola of LESSICO_CONCRETO) {
    if (contiene(tNorm, parola)) {
      specifiche++;
      if (!contiene(fontiNorm, parola)) nonAncorate.push(parola);
    }
  }

  const verdetto: VerdettoTesto =
    nonAncorate.length > 0 ? 'non_ancorato'
    : frasiVuote.length > 0 && specifiche < 3 ? 'generico'
    : specifiche === 0 && t.length > 300 ? 'generico'
    : 'ancorato';

  return { verdetto, nonAncorate: [...new Set(nonAncorate)], frasiVuote, specifiche };
}
