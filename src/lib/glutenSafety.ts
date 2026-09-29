// Sicurezza per celiaci: tipi e classificatore di testo (fase 1).
//
// Il classificatore legge il testo del SITO DEL LOCALE (o di una scheda) e
// decide il livello. Regola d'oro: nel dubbio 'non_verificato' o 'opzioni',
// MAI 'solo'. Ogni esito porta con se' la frase di prova.

export type GlutenLevel = 'solo' | 'opzioni' | 'limitato' | 'non_verificato';

export interface GlutenSafety {
  poi_id: string;
  level: GlutenLevel;
  dedicated_kitchen: boolean | null;
  dedicated_fryer: boolean | null;
  certification: string | null;
  certification_url: string | null;
  evidence: string | null;
  evidence_url: string | null;
  source: 'osm' | 'sito_locale' | 'utenti' | 'admin';
  checked_at: string;
}

export interface GlutenClassification {
  level: GlutenLevel;
  dedicated_kitchen: boolean | null;
  dedicated_fryer: boolean | null;
  evidence: string | null;
}

/** Valore OSM diet:gluten_free -> livello. `no` e valori ignoti -> null. */
export function livelloDaOsm(v: string | undefined | null): GlutenLevel | null {
  switch ((v || '').trim().toLowerCase()) {
    case 'only': return 'solo';
    case 'yes': return 'opzioni';
    case 'limited': return 'limitato';
    default: return null;
  }
}

// "gluten free" in IT/EN/FR/ES/DE, con o senza trattino.
const GF = String.raw`(?:senza[\s-]+glutine|gluten[\s-]?free|glutenfrei|sans[\s-]+gluten|sin[\s-]+gluten|gf)`;

// Frasi che dicono "tutto il locale e' senza glutine".
const FORTI: RegExp[] = [
  new RegExp(String.raw`100\s?%\s*(?:${GF})`, 'i'),
  new RegExp(String.raw`(?:interamente|completamente|totalmente|esclusivamente|solo|tutto|tutta)\s+(?:${GF})`, 'i'),
  new RegExp(String.raw`(?:${GF})\s+(?:al|100)\s?%`, 'i'),
  new RegExp(String.raw`(?:entirely|completely|totally|fully|exclusively|strictly|only|dedicated)\s+(?:${GF})`, 'i'),
  new RegExp(String.raw`(?:${GF})\s+(?:only|kitchen|restaurant|bakery)\b`, 'i'),
  /nostro\s+locale\s+è\s+senza\s+glutine|tutto\s+il\s+(?:nostro\s+)?menu\s+è\s+senza\s+glutine/i,
  /(?:cucina|laboratorio|forno|locale)\s+(?:interamente\s+)?(?:dedicat[oa]|solo)\s+(?:al\s+)?senza\s+glutine/i,
  /(?:rein|komplett|ausschließlich)\s+glutenfrei|vollständig\s+glutenfrei/i,
  /(?:entièrement|100\s?%)\s+sans\s+gluten|(?:totalmente|100\s?%)\s+sin\s+gluten/i,
];

// Segnali di opzioni parziali: "anche", "su richiesta", "opzioni", "also"...
const COMPARTECIPA = /\b(?:anche|inoltre|su\s+richiesta|opzioni|alcuni|alcune|disponibil[ei]|possibilit[àa]|per\s+celiaci|menu\s+per|also|options?|available|on\s+request|some|menu\s+for|coeliac|celiac|auch|optionen|aussi|options|también|opciones)\b/i;
// Assenza esplicita dell'attrezzatura: "nessuna friggitrice dedicata" => false.
const ASSENZA = /\b(?:nessun[ao]?|niente|non\s+(?:c'è|abbiamo|disponiamo|è)|no|not|without|ohne|kein[e]?|aucun[e]?|pas\s+de|ninguna?)\b/i;
const NEGAZIONE = /\b(?:non|no|not|without|senza\s+garanzia|kein|keine|pas|sin\s+garant[ií]a|may\s+contain|può\s+contenere|tracce|traces|cross[\s-]?contamination|contaminazione)\b/i;

const CUCINA_DEDICATA = /(?:cucina|laboratorio|forno|kitchen|bakery|prep(?:aration)?\s+area|küche|cuisine|cocina)\s+(?:interamente\s+|completamente\s+)?(?:dedicat[oa]|separat[oa]|dedicated|separate|getrennt|séparée|dedicada|separada)|(?:dedicated|separate)\s+(?:gluten[\s-]?free\s+)?(?:kitchen|prep|preparation)/i;
const FRIGGITRICE_DEDICATA = /(?:friggitric[ei]|fryer|friteuse|freidora|fritteuse)\s+(?:dedicat[ae]|separat[ae]|dedicated|separate|dédiée|dedicada|getrennt)|(?:dedicated|separate)\s+(?:gluten[\s-]?free\s+)?fr(?:yer|itteuse)|(?:friggitric[ei]|fryer)\s+(?:only\s+)?for\s+gluten[\s-]?free/i;

function frasi(testo: string): string[] {
  return testo
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?;•\n])\s*/)
    .map(s => s.trim())
    .filter(s => s.length > 3 && s.length < 400);
}

const haGF = (s: string) => new RegExp(GF, 'i').test(s);

export function classificaTestoGlutine(testo: string): GlutenClassification {
  const out: GlutenClassification = {
    level: 'non_verificato', dedicated_kitchen: null, dedicated_fryer: null, evidence: null,
  };
  if (!testo || !testo.trim()) return out;

  let forte: string | null = null;
  let opzioni: string | null = null;

  for (const s of frasi(testo)) {
    if (!haGF(s) && !CUCINA_DEDICATA.test(s) && !FRIGGITRICE_DEDICATA.test(s)) continue;
    const negata = NEGAZIONE.test(s);

    // Vero solo senza negazioni; falso solo con assenza ESPLICITA; altrimenti
    // resta sconosciuto (mai false per "non lo so").
    const assente = ASSENZA.test(s);
    if (CUCINA_DEDICATA.test(s) && out.dedicated_kitchen === null) {
      if (assente) out.dedicated_kitchen = false; else if (!negata) out.dedicated_kitchen = true;
    }
    if (FRIGGITRICE_DEDICATA.test(s) && out.dedicated_fryer === null) {
      if (assente) out.dedicated_fryer = false; else if (!negata) out.dedicated_fryer = true;
    }

    if (!haGF(s)) continue;
    // "non e' senza glutine", "puo' contenere tracce", una domanda: non prova nulla
    if (negata || /\?$/.test(s)) continue;
    const eForte = FORTI.some(r => r.test(s));
    if (eForte && !COMPARTECIPA.test(s)) { forte = forte ?? s; continue; }
    opzioni = opzioni ?? s;
  }

  if (forte) { out.level = 'solo'; out.evidence = forte; }
  else if (opzioni) { out.level = 'opzioni'; out.evidence = opzioni; }
  return out;
}

/**
 * Unisce OSM e testo del sito. "solo" vale SOLO se le due fonti non si
 * contraddicono: con una sola fonte a dire "solo" si scende a "opzioni".
 */
export function uniscilivelli(osm: GlutenLevel | null, sito: GlutenLevel): GlutenLevel {
  if (osm === 'solo' && sito === 'solo') return 'solo';
  if (osm === 'solo' || sito === 'solo') return 'opzioni';
  if (osm === 'opzioni' || sito === 'opzioni') return 'opzioni';
  if (osm === 'limitato') return 'limitato';
  return 'non_verificato';
}
