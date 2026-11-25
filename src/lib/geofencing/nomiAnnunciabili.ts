/**
 * Quali righe possono PARLARE e quali nomi si possono ANNUNCIARE (23/10/2026).
 *
 * Regole nate dal collaudo di 7 città del 23/10/2026 (Bruxelles, Belgrado, Manchester, Guayaquil, Ottawa,
 * Rimini…), valide per ogni motore che fa parlare un luogo. Le stesse liste vanno portate su Kotlin
 * (`GeofenceManager.kt` / `CategoryMap.kt`) e Swift (`PoiModels.swift`): vedi scratch/correzioni-app-2026-10-23.md.
 *
 * 1. `rigaNonParla`: una CITTÀ, un'entità amministrativa (comune, provincia, regione, area metropolitana,
 *    quartiere amministrativo) o una METROPOLITANA (linea/stazione) non è un luogo da raccontare. A Bruxelles
 *    parlava `wd-Q239` «Bruxelles», altrove «area metropolitana di…», «metropolitana di…».
 * 2. `nomeDaAnnunciare`: l'avviso dei 150 m dice un NOME, mai un'etichetta grezza. Non si annunciano: numeri
 *    soli («1830»), pietre d'inciampo, targhe e lapidi, descrizioni inglesi usate come nome («School building»,
 *    «Statue of a man»), nomi in un alfabeto diverso da quello della lingua dell'utente (Cirillico a un
 *    italiano). In quel caso si risponde null: niente avviso (la guida all'arrivo resta governata dalle sue regole).
 * 3. `alfabeto` / `stessoLuogoAltroAlfabeto`: il gemello in un altro alfabeto («Трг републике» dopo «Piazza della
 *    Repubblica») è lo stesso luogo — non parla se entro 150 m (o con lo stesso QID) qualcuno ha già parlato.
 */

export type Alfabeto = 'latino' | 'cirillico' | 'greco' | 'arabo' | 'ebraico' | 'cjk' | 'devanagari' | 'thai' | 'altro' | 'nessuno';

/** L'alfabeto prevalente di un testo (lettere soltanto). */
export function alfabeto(testo: string | null | undefined): Alfabeto {
  const s = String(testo || '');
  const conta: Record<string, number> = {};
  for (const ch of s) {
    const c = ch.codePointAt(0) || 0;
    let a: Alfabeto | null = null;
    if ((c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a) || (c >= 0xc0 && c <= 0x24f) || (c >= 0x1e00 && c <= 0x1eff)) a = 'latino';
    else if (c >= 0x400 && c <= 0x52f) a = 'cirillico';
    else if (c >= 0x370 && c <= 0x3ff) a = 'greco';
    else if (c >= 0x600 && c <= 0x6ff) a = 'arabo';
    else if (c >= 0x590 && c <= 0x5ff) a = 'ebraico';
    else if ((c >= 0x3040 && c <= 0x30ff) || (c >= 0x4e00 && c <= 0x9fff) || (c >= 0xac00 && c <= 0xd7af)) a = 'cjk';
    else if (c >= 0x900 && c <= 0x97f) a = 'devanagari';
    else if (c >= 0xe00 && c <= 0xe7f) a = 'thai';
    else if (/\p{L}/u.test(ch)) a = 'altro';
    if (a) conta[a] = (conta[a] || 0) + 1;
  }
  let migliore: Alfabeto = 'nessuno', n = 0;
  for (const [k, v] of Object.entries(conta)) if (v > n) { migliore = k as Alfabeto; n = v; }
  return migliore;
}

/** L'alfabeto che la voce della lingua dell'utente sa leggere. */
export function alfabetoDellaLingua(lingua: string | null | undefined): Alfabeto {
  const l = String(lingua || 'it').toLowerCase().slice(0, 2);
  if (l === 'ru') return 'cirillico';
  if (l === 'zh') return 'cjk';
  return 'latino';
}

const CATEGORIE_AMMINISTRATIVE = /^(city|town|village|hamlet|municipality|comune|citta|città|administrative|admin|region|regione|province|provincia|state|country|county|district|borough|suburb|quarter|neighbourhood|neighborhood|locality|metropolitan_area|subway|subway_station|metro|metro_station|metropolitana)$/i;
const NOME_AMMINISTRATIVO = /\b(area metropolitana|citt[aà] metropolitana|metropolitan (area|city|borough|county)|metropolitana di|metro(politana)? line|linea \d+ della metropolitana|provincia di|province of|regione|r[ée]gion de|comune di|municipality of|municipio de|arrondissement|bezirk|landkreis|okrug|oblast|county of)\b/i;
const NOME_METRO = /^(metro|metropolitana|subway|u-?bahn|underground|métro)\b/i;

/**
 * True se la riga non deve mai parlare come audioguida: città, entità amministrative, metropolitane.
 * `citta` (facoltativo): il nome della città in cui si è — una riga che si chiama esattamente così è la città.
 */
export function rigaNonParla(poi: any, citta?: string | null): boolean {
  if (!poi) return false;
  if (poi.is_gem === true || poi.premium === true) {
    // Una gemma resta gemma, salvo che sia proprio un'entità amministrativa dichiarata.
    return CATEGORIE_AMMINISTRATIVE.test(String(poi.category || '').trim()) || CATEGORIE_AMMINISTRATIVE.test(String(poi.poi_type || '').trim());
  }
  const cat = String(poi.category || '').trim();
  const tipo = String(poi.poi_type || '').trim();
  if (CATEGORIE_AMMINISTRATIVE.test(cat) || CATEGORIE_AMMINISTRATIVE.test(tipo)) return true;
  const nome = String(poi.name || poi.nome || '').trim();
  if (!nome) return false;
  if (NOME_AMMINISTRATIVO.test(nome) || NOME_METRO.test(nome)) return true;
  if (citta && nome.toLowerCase() === String(citta).trim().toLowerCase()) return true;
  if (poi.city && nome.toLowerCase() === String(poi.city).trim().toLowerCase()) return true;
  return false;
}

const SOLO_NUMERI = /^[\s\d.,:/#№-]+$/;
const PIETRA_O_TARGA = /\b(stolperstein|pietra d'inciampo|pietre d'inciampo|struikelsteen|pav[ée] de m[ée]moire|plaque|targa|lapide|gedenktafel|placa conmemorativa|memorial plaque|blue plaque)\b|^plaque\s*№?/i;
// (22/11/2026, collaudo nativo di Cracovia: in auto «Ti stai avvicinando a Punto di interesse», «Sei arrivato a Punto di
// interesse») Un nome che è solo un'etichetta di tipo, in una delle 7 lingue, non è un nome. Stessa lista in
// NomiAnnunciabili.kt e PoiModels.swift.
export const NOME_GENERICO = /^(punto (di )?interesse|point of interest|points? d'int[ée]r[êe]t|punto de inter[ée]s|sehensw[üu]rdigkeit|poi|attrazione|attraction|attraction touristique|luogo|monumento|chiesa|museo|statua|edificio|scultura|fontana|torre|ponte|cappella|senza nome|unnamed|untitled|no name|sans nom|sin nombre|ohne namen|denkmal|kirche|statue|monument|monumento conmemorativo)$/i;
const DESCRIZIONE_INGLESE = /^(a |an |the )?(school|office|residential|apartment|commercial|industrial|public|private|old|former|historic|small|large)?\s*(building|house|statue|sculpture|monument|bust|fountain|church|chapel|shrine|memorial|tower|gate|wall|bridge|structure|artwork|mural|relief|sign|bench)( of [a-z ]+| building)?$/i;

/** Il nome da dire nell'avviso dei 150 m, o null se il nome è grezzo (vedi regola 2 in cima). */
export function nomeDaAnnunciare(poi: any, lingua?: string | null): string | null {
  // 21/11/2026 (collaudo notturno): la voce leggeva anche la parentesi — «Museo egizio (Il Cairo)», «Mårten Trotzig
  // (1559–1617)», «Convento de Santa María de los Reyes. (s. XVI)». Si annuncia il nome, senza la parentesi e senza
  // la punteggiatura che resta in coda. Stessa pulizia in NomiAnnunciabili.kt e PoiModels.swift.
  // (21/11/2026, Budapest) «Abaj Kunanbajev Szobra, Asztana út, Budapest.»: un nome con l'indirizzo dentro si dice
  // fino alla prima virgola.
  const grezzo = String(poi?.name_translated || poi?.name || poi?.nome || '')
    .replace(/\s*\([^)]*\)\s*/g, ' ').split(',')[0].replace(/[\s.,;:\-–]+$/, '').replace(/\s+/g, ' ').trim();
  if (!grezzo || grezzo.length < 3) return null;
  if (SOLO_NUMERI.test(grezzo)) return null;
  if (NOME_GENERICO.test(grezzo)) return null;
  if (PIETRA_O_TARGA.test(grezzo) || /stolperstein|plaque|targa/i.test(String(poi?.category || ''))) return null;
  if (String(poi?.id || '').startsWith('plaque-')) return null;
  if (DESCRIZIONE_INGLESE.test(grezzo) || / - (school|residential|office) building$/i.test(grezzo)) return null;
  const a = alfabeto(grezzo);
  if (a !== 'nessuno' && a !== alfabetoDellaLingua(lingua)) return null;
  return grezzo;
}

/** QID Wikidata della riga, se lo conosciamo (colonna o id `wd-…Q123`). */
export function qidDi(poi: any): string | null {
  const q = String(poi?.wikidata || poi?.wikidata_id || '').trim();
  if (/^Q\d+$/.test(q)) return q;
  const m = String(poi?.id || '').match(/(?:^|-)(Q\d+)$/);
  return m ? m[1] : null;
}

/** Due righe sono lo stesso luogo scritto in due alfabeti (o lo stesso QID)? `metri`: distanza fra le due. */
export function stessoLuogoAltroAlfabeto(a: any, b: any, metri: number): boolean {
  const qa = qidDi(a), qb = qidDi(b);
  if (qa && qb && qa === qb) return true;
  if (!(metri <= 150)) return false;
  const na = alfabeto(a?.name || a?.nome), nb = alfabeto(b?.name || b?.nome);
  return na !== 'nessuno' && nb !== 'nessuno' && na !== nb;
}

/** Una targa, lapide o pietra d'inciampo (stessa regola di `eTarga` in foregroundTriggers.ts). */
export function rigaTarga(poi: any): boolean {
  if (!poi || poi.is_gem === true || poi.premium === true) return false;
  if (/plaque|targa|lapide|stolperstein/.test(String(poi.category || '').toLowerCase())) return true;
  if (String(poi.id || '').startsWith('plaque-')) return true;
  return /\b(plaque|targa|lapide|stolperstein|gedenktafel|placa conmemorativa)\b/i.test(String(poi.name || poi.nome || ''));
}

/** Un nome che è solo un'etichetta di tipo («Sito UNESCO», «Monumento», «Statue»): non è il nome di un luogo. */
const NOME_SOLO_TIPO = /^(sito unesco|unesco( world heritage)? site|patrimonio unesco|monumento|monument|statua|statue|scultura|sculpture|chiesa|church|museo|museum|memoriale|memorial|fontana|fountain|piazza|square|parco|park|punto panoramico|viewpoint|attrazione|attraction)$/i;
export function nomeSoloTipo(nome: string | null | undefined): boolean {
  return NOME_SOLO_TIPO.test(String(nome || '').replace(/\s+/g, ' ').trim());
}

const nudoSemplice = (n: any): string => String(n || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/\([^)]*\)/g, ' ').replace(/[^a-z0-9]+/g, ' ').replace(/\b(the|il|la|lo|le|i|gli|l|di|de|dei|degli|del|della|delle|dello|d|des|du|of)\b/g, ' ').replace(/\s+/g, ' ').trim();
const metriTra = (a: any, b: any): number => {
  const R = 6371000, r = Math.PI / 180;
  const la1 = Number(a?.lat), lo1 = Number(a?.lon), la2 = Number(b?.lat), lo2 = Number(b?.lon);
  if (![la1, lo1, la2, lo2].every(Number.isFinite)) return Infinity;
  const x = (la2 - la1) * r, y = (lo2 - lo1) * r;
  const h = Math.sin(x / 2) ** 2 + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin(y / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

/**
 * 21/11/2026 (prova con l'app vera a Budapest, WIP Nav): i luoghi lungo il percorso aprivano schede che l'audioguida
 * libera non avrebbe mai fatto parlare — «Stone plaque № 49320», «Sito UNESCO», il gemello Overture della META stessa
 * («Széchenyi Lánchíd» sotto «Ponte delle Catene») e il caffè di PARTENZA. Stessi filtri dell'audioguida libera, più:
 *  - mai una città, un'entità amministrativa, una targa, un nome che è solo un tipo;
 *  - mai la meta né i suoi gemelli: stesso QID, stesso nome nudo entro 150 m, altro alfabeto entro 150 m, oppure a
 *    meno di `GEMELLO_META_M` dal punto della meta (lì parla la meta all'arrivo);
 *  - mai il luogo da cui si parte (entro `PARTENZA_M` dalla partenza).
 */
export const GEMELLO_META_M = 60;
export const PARTENZA_M = 60;
export function luoghiPercorsoCheParlano<T = any>(pois: T[], meta: { id?: any; name?: string | null; lat: number; lon: number } | null, partenza: { lat: number; lon: number } | null, citta?: string | null): T[] {
  const qMeta = meta ? qidDi({ id: meta.id }) : null;
  const nMeta = meta ? nudoSemplice(meta.name) : '';
  return (pois || []).filter((p: any) => {
    if (!p) return false;
    if (rigaNonParla(p, citta) || rigaTarga(p) || nomeSoloTipo(p.name || p.nome)) return false;
    if (meta) {
      if (meta.id != null && String(p.id) === String(meta.id)) return false;
      const m = metriTra(p, meta);
      if (m <= GEMELLO_META_M) return false;
      if (qMeta && qidDi(p) === qMeta) return false;
      if (m <= 150 && nMeta.length >= 4 && nudoSemplice(p.name || p.nome) === nMeta) return false;
      if (stessoLuogoAltroAlfabeto(p, { id: meta.id, name: meta.name }, m)) return false;
    }
    if (partenza && metriTra(p, partenza) <= PARTENZA_M) return false;
    return true;
  });
}

/**
 * 23/10/2026 — REGOLA (8e): il teaser da LEGGERE, o null.
 *  - mai il segnaposto «Sei vicino a … Apri l'app per scoprire la sua storia.» (né il suo gemello inglese);
 *  - un teaser «italiano» identico a quello inglese è testo INGLESE: non si legge con voce italiana;
 *  - mai un teaser in un alfabeto che la voce dell'utente non legge.
 * Fuori dall'italiano si usa solo il teaser della lingua dell'utente (regola dell'08/10: mai l'italiano a chi
 * non lo parla), con l'inglese come riserva solo dove il chiamante lo accettava già.
 */
export function teaserLeggibile(poi: any, lingua: string | null | undefined, opz: { riservaInglese?: boolean } = {}): string | null {
  const l = String(lingua || 'it').toLowerCase().slice(0, 2);
  const pulito = (v: any) => (typeof v === 'string' ? v.trim() : '');
  const segnaposto = (t: string) => /apri l'app per scoprire|open the app to discover|ouvrez l'app|abre la app|öffne die app/i.test(t);
  const it = pulito(poi?.teaser_text_it), en = pulito(poi?.teaser_text_en);
  let t = pulito(poi?.[`teaser_text_${l}`]);
  if (l !== 'en' && t && en && t === en) t = ''; // la colonna della lingua contiene il testo inglese
  if (!t && l !== 'it' && opz.riservaInglese) t = en;
  if (!t && l === 'it') t = it && it !== en ? it : '';
  if (!t || segnaposto(t)) return null;
  const a = alfabeto(t);
  if (a !== 'nessuno' && a !== alfabetoDellaLingua(l === 'en' && opz.riservaInglese ? 'en' : l) && !(opz.riservaInglese && a === 'latino')) return null;
  return t;
}
