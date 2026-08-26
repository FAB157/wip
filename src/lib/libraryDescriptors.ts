// =====================================================================
// WIP · Catalogo dei DESCRITTORI della Biblioteca degli itinerari.
//
// Ogni descrittore è la "ricetta" da cui il motore genera un itinerario
// pronto: dove (coords), quanto (hours/days), con che taglio editoriale
// (angle + brief). Lo spazio totale delle combinazioni supera le 1500
// voci, generate PROGRAMMATICAMENTE incrociando:
//   - i porti di crociera / scali aeroportuali / cammini di
//     transitCatalog.ts (sola lettura, resta la fonte di verità)
//   - 9 temi editoriali × liste curate di città/zone adatte, ciascuno in
//     tre versioni: tema puro, tema TUTTO GRATIS, tema con esperienza
//     prenotabile
//   - 30 città top (mondiali + italiane) × 8 angoli × 1-2-3 giorni
//   - 421 zone mondiali (libraryZonesWorld.ts) × 8 angoli × 2-3 giorni
//
// REGOLA SENZA ECCEZIONI (committente): per OGNI destinazione, di qualunque
// kind, devono esistere la variante "🆓 Tutta gratis" (nessuna tappa a
// pagamento) e la variante "🎟 Con esperienze prenotabili" (biglietti/tour
// reali da Tiqets, Viator o GetYourGuide con URL affiliato). Inoltre OGNI
// itinerario salvato — qualunque sia l'angolo — contiene almeno un link
// affiliato reale: la regola è verificata in codice lato server
// (libraryVerifyInCode, sezione "Regola AFFILIAZIONE").
//
// getPriorityDescriptors() restituisce la lista ORDINATA per la semina
// (l'ordine è documentato sulla funzione); searchDescriptors() è il
// filtro leggero per l'uso client.
// =====================================================================

import {
  CRUISE_PORTS,
  AIRPORT_LAYOVERS,
  PILGRIM_ROUTES,
  type CruisePort,
  type AirportLayover,
  type PilgrimRoute,
  type StopOption,
} from './transitCatalog';
import { WORLD_ZONES, type WorldZone } from './libraryZonesWorld';
// Catalogo aggiuntivo (22/08/2026, ~5.000 descrittori in più su TUTTE le
// categorie): zone mondiali nuove + luoghi nuovi per i 17 temi editoriali.
// Solo dati, si fondono qui — vedi il commento in testa al file.
import { EXTRA_WORLD_ZONES, EXTRA_THEME_PLACES } from './libraryDescriptorsExtra';
// Secondo lotto (stesso giorno): stessa forma, altre zone e altri luoghi.
// I due lotti si fondono insieme, il codice di merge scarta da solo i
// doppioni fra i due (stesso taken-set/nomiEsistenti) — vedi i due punti
// di fusione più sotto.
import { EXTRA_WORLD_ZONES_2, EXTRA_THEME_PLACES_2 } from './libraryDescriptorsExtra2';
import { TASTE_ROUTES, tasteRouteContext } from './wineRoutesCatalog';
import { TASTE_ZONES, type TasteZone } from './tasteZonesWorld';
import { PERCORSI_SACRI, percorsoSacroContext } from './sacredRoutesCatalog';
import { FOOD_FESTIVALS, festivalContext } from './foodFestivalsCatalog';
import { THEMATIC_PLACES, type ThematicKey, type ThematicPlaceSummary } from './thematicDescriptors';

// ─────────────────────────────────────────────────────────────────────
// Tipi (contratto concordato con gli altri moduli della Biblioteca)
// ─────────────────────────────────────────────────────────────────────

export type LibraryKind = 'port' | 'airport' | 'pilgrim' | 'theme' | 'zone';

/** Suggerimenti di contesto per il generatore: quali fonti esterne
 *  interrogare per arricchire l'itinerario di questo descrittore. */
export interface LibraryContextHints {
  /** Cerca su Wikidata i film/serie girati nella zona (tema cinema). */
  wikidataFilm?: boolean;
  /** Cerca su OSM le botteghe artigiane (craft=*) della zona. */
  osmCraft?: boolean;
  /** Cerca su iNaturalist le osservazioni faunistiche recenti. */
  inaturalist?: boolean;
  /** Cantine, enoteche e vigneti reali dal nostro database (import OSM). */
  osmWinery?: boolean;
  /**
   * Produttori del gusto reali dal nostro database: caseifici, frantoi,
   * birrifici, distillerie, apicolture, torrefazioni. Separato da osmWinery
   * perché i temi sono due — "si beve" e "si visita dove nasce" — e mescolarli
   * riempirebbe il prompt del vino di caseifici.
   */
  osmGusto?: boolean;
  /** Cerca su OSM i murales/graffiti reali (tourism=artwork) per il tema
   *  'scoperta-urbana': niente street art inventata. */
  osmArtwork?: boolean;
  /** Cerca esperienze prenotabili reali (Tiqets/Viator/GetYourGuide) con
   *  link affiliato: obbligatorio per l'angolo 'esperienze'. */
  bookable?: boolean;
  /**
   * Luoghi di un VERTICALE TEMATICO nostro (terme, cinema, cieli, street art,
   * mercati, fioriture, memoria, viaggio lento), letti da shared_pois per
   * categoria. È l'equivalente di osmWinery/osmGusto per i cataloghi curati
   * della ricerca redazionale: senza questa ancora il generatore si
   * inventerebbe le sorgenti termali e i set cinematografici.
   */
  wipTheme?: { category: string; types?: string[] };
}

export interface LibraryConstraints {
  /** Ore di cuscinetto per il rientro (nave: 1, volo: 2). */
  returnBufferHours?: number;
  /** Km massimi al giorno (cammini a piedi). */
  maxKmPerDay?: number;
}

export interface LibraryDescriptor {
  /** Identificatore stabile e unico (usato come chiave di semina). */
  slug: string;
  kind: LibraryKind;
  title: string;
  city: string;
  country: string;
  coords: { lat: number; lon: number };
  /** Durata in ore (porti/aeroporti: gite in giornata). */
  hours?: number;
  /** Durata in giorni (zone, temi, cammini). */
  days?: number;
  /** Id del tema editoriale (solo kind 'theme'). */
  theme?: string;
  /** Id dell'angolo/variante editoriale. */
  angle: string;
  /** Istruzioni editoriali complete per il generatore. */
  brief: string;
  constraints?: LibraryConstraints;
  contextHints?: LibraryContextHints;
}

// ─────────────────────────────────────────────────────────────────────
// ANGOLI — le varianti editoriali per genere.
// Ogni brief è un'istruzione CONCRETA al generatore: cosa privilegiare,
// cosa evitare, che tono tenere.
// ─────────────────────────────────────────────────────────────────────

export interface AngleDef {
  id: string;
  label: string;
  brief: string;
}

/** I 2 angoli "commerciali" chiesti dal committente: per OGNI porto/zona
 *  (e per gli scali che escono in città) la libreria deve offrire ALMENO
 *  una variante con tutte le tappe gratuite e ALMENO una con esperienze
 *  prenotabili reali (Tiqets/Viator/GetYourGuide, link affiliato =
 *  commissione). Entrambe le regole del brief sono VERIFICATE in codice
 *  dalla pipeline server (budget attrazioni 0 € / ≥2 link dal materiale). */
const FREE_ANGLE: AngleDef = {
  id: 'gratis',
  label: '🆓 Tutta gratis',
  brief:
    'Variante TUTTA GRATIS: ogni tappa è a COSTO ZERO, senza eccezioni. Privilegia piazze e strade monumentali, chiese a ingresso libero (verifica che l\'ingresso sia davvero gratuito), belvedere e panorami, mercati da girare, street art, parchi e lungomare. VIETATA qualsiasi tappa con biglietto o ingresso a pagamento: se un luogo simbolo si paga, raccontalo da fuori dal miglior punto di vista gratuito. Nella tabella_budget la voce "attrazioni" DEVE valere 0 € OGNI giorno (un software lo verifica). I pasti restano indicati ma con opzioni economiche vere: street food, mercati, forni e friggitorie. Tono complice e concreto: dimostra che il meglio del posto non si compra.',
};
const BOOKABLE_ANGLE: AngleDef = {
  id: 'esperienze',
  label: '🎟 Con esperienze prenotabili',
  brief:
    'Variante CON ESPERIENZE PRENOTABILI: 2-3 tappe della giornata DEVONO essere esperienze REALI prenotabili online (tour guidati, ingressi salta-fila, degustazioni, attività) scelte ESCLUSIVAMENTE dal MATERIALE REALE fornito nel prompt, ciascuna con l\'URL ESATTO copiato INTATTO nel campo "link_info" della tappa (contiene il codice partner: vietato modificarlo). Le altre tappe sono normali e collegano le esperienze in un percorso logico; orari coerenti con la durata dichiarata di ogni esperienza, con margine per presentarsi al punto d\'incontro. VIETATO inventare esperienze o URL fuori dal materiale. Tono da concierge esperto: spiega perché ciascuna esperienza vale la prenotazione.',
};

/** Gli 8 angoli condivisi da porti (gita a terra) e zone (città). */
const PORT_ZONE_ANGLES: AngleDef[] = [
  {
    id: 'classica',
    label: 'Classica',
    brief:
      'Variante CLASSICA: i luoghi imprescindibili, in ordine logico e senza ansia. Privilegia i 4-6 simboli che chiunque si aspetta di vedere, collegati dal percorso a piedi più naturale, con orari prudenti e alternative pronte se una tappa è chiusa o in coda. Evita le deviazioni per specialisti e i "segreti" che rubano tempo ai must. Tono da guida esperta e rassicurante: chi segue questo itinerario deve tornare a casa potendo dire "l\'ho visto davvero".',
  },
  {
    id: 'gastronomica',
    label: 'Gastronomica',
    brief:
      'Variante GASTRONOMICA: il cibo è il filo conduttore, i monumenti fanno da contorno. Privilegia mercati coperti e rionali, i piatti-simbolo del posto con l\'indicazione di DOVE mangiarli (tipologia di locale e zona, mai nomi inventati), botteghe storiche, pasticcerie e street food da consumare camminando. Alterna assaggi e passeggiate perché nessuno arrivi a pranzo già pieno; segnala il piatto da NON perdere e la trappola per turisti da evitare. Tono goloso ma competente, con i nomi locali dei piatti spiegati.',
  },
  {
    id: 'famiglie',
    label: 'Famiglie',
    brief:
      'Variante FAMIGLIE: ritmi da bambini, zero code, zero marce forzate. Privilegia spazi aperti dove correre, attrazioni interattive o con animali, tappe brevi (max 45-60 minuti l\'una) intervallate da pause gelato/merenda e bagni facili da trovare. Evita musei lunghi, code prenotabili solo online e salite ripide con passeggino; indica sempre un "piano B" al coperto in caso di pioggia o capricci. Tono complice con i genitori: dì chiaramente cosa i bambini ameranno e cosa li farà sbuffare.',
  },
  {
    id: 'nascosta',
    label: 'Nascosta',
    brief:
      'Variante NASCOSTA: fuori dal flusso, dentro i quartieri veri. Privilegia i rioni dove la gente vive e fa la spesa, cortili, botteghe, chiese minori, street art e punti vista che i gruppi organizzati non toccano; i luoghi celebri al massimo si sfiorano di scorcio. Evita le vie dello struscio turistico e tutto ciò che compare sulle prime dieci cartoline. Ammetti onestamente quando un "segreto" è ormai noto e proponi l\'alternativa ancora autentica. Tono da amico del posto che ti porta dove andrebbe lui.',
  },
  {
    id: 'arte-storia',
    label: 'Arte e storia',
    brief:
      'Variante ARTE-STORIA: approfondita, per chi vuole capire e non solo vedere. Privilegia 3-4 luoghi trattati DAVVERO a fondo (contesto storico, committenti, dettagli da cercare con gli occhi) invece di dieci sfiorati; costruisci un filo cronologico o tematico che leghi le tappe. Includi un museo o un sito con indicazioni concrete su cosa guardare sala per sala; evita l\'elenco telefonico di date. Tono colto ma vivo: aneddoti veri, niente pedanteria, e la sincerità di dire cosa è copia e cosa è originale.',
  },
  {
    id: 'relax-panorami',
    label: 'Relax e panorami',
    brief:
      'Variante RELAX-PANORAMI: lenta, contemplativa, con poco cammino. Privilegia belvedere, lungomari e lungofiumi, parchi, terrazze e caffè con vista dove sedersi almeno mezz\'ora senza sensi di colpa; massimo 3-4 tappe in tutto, distanze corte, salite solo se c\'è un mezzo (funicolare, ascensore, bus). Evita i tour de force, gli interni affollati e qualsiasi tappa che imponga fretta. Indica l\'orario migliore per la luce (alba, tramonto) su ogni affaccio. Tono calmo, quasi meditativo: qui il viaggio è respirare il posto.',
  },
  FREE_ANGLE,
  BOOKABLE_ANGLE,
];

/** I 3 angoli degli scali in aeroporto. */
const AIRPORT_ANGLES: AngleDef[] = [
  {
    id: 'in-aeroporto',
    label: 'Resto in aeroporto',
    brief:
      'Variante IN-AEROPORTO: niente città, si resta dentro il terminal e nelle immediate vicinanze. Privilegia le cose che rendono l\'attesa piacevole: le aree migliori del terminal, dove si mangia la cucina locale decente (non la catena globale), osservatori piste, mostre, zone quiete o lounge accessibili a pagamento, una doccia se esiste. Evita qualsiasi tentazione di uscire e qualunque tappa che allontani dal gate oltre i tempi di sicurezza. Tono pratico e anti-stress: l\'obiettivo è arrivare all\'imbarco riposati, non stanchi di corsa.',
  },
  {
    id: 'citta-lampo',
    label: 'Città lampo',
    brief:
      'Variante CITTÀ-LAMPO: un assaggio vero della città, con il volo come vincolo sacro. Privilegia 2-3 simboli concentrati e raggiungibili col mezzo più rapido, un boccone tipico veloce, foto e rientro; la prima tappa è SEMPRE il deposito bagagli. Evita musei con coda, quartieri lontani dalla linea diretta e qualsiasi tappa che non lasci margine sui trasporti. Ripeti in chiusura di ogni blocco quanto tempo resta per il rientro. Tono asciutto e militare sugli orari, entusiasta sul poco che si vede: meglio poco e sereni che tanto e in ansia.',
  },
  {
    id: 'relax-vicino',
    label: 'Relax nei dintorni',
    brief:
      'Variante RELAX-VICINO: uscire dall\'aeroporto sì, ma senza tuffarsi nel centro. Privilegia un parco, un lungofiume/lungomare, un quartiere o un borgo a POCHI minuti dal terminal dove camminare lenti, mangiare seduti con calma e cambiare aria senza stress da coincidenza. Evita il centro monumentale e ogni spostamento sopra i 20-30 minuti a tratta; scegli tappe da cui si rientra al terminal con un solo mezzo. Tono disteso: questa non è una visita, è una boccata d\'ossigeno tra due voli.',
  },
];

/** I 2 angoli dei cammini. */
const PILGRIM_ANGLES: AngleDef[] = [
  {
    id: 'spirituale-classico',
    label: 'Spirituale classico',
    brief:
      'Variante SPIRITUALE-CLASSICA: il cammino come esperienza interiore, nel solco della tradizione. Privilegia santuari, pievi e luoghi di culto lungo il percorso, i riti del pellegrino (credenziale, timbri, il saluto agli altri camminatori), momenti di silenzio suggeriti in punti precisi e l\'arrivo vissuto come compimento. Rispetta le tappe e gli alloggi storici del cammino; la sera proponi la visita lenta del borgo e la cena semplice, mai programmi mondani. Tono sobrio e caldo, che parli anche a chi non è credente: qui si cammina per ritrovarsi.',
  },
  {
    id: 'natura-lento',
    label: 'Natura lenta',
    brief:
      'Variante NATURA-LENTA: lo stesso percorso, ma con gli occhi su paesaggio, flora e fauna. Privilegia i tratti più belli dal punto di vista naturalistico (boschi, crinali, corsi d\'acqua), le soste di osservazione con ciò che si può realisticamente vedere in stagione, i prodotti della terra da assaggiare a fine tappa. Ritmo ancora più disteso della media del cammino: partenze col fresco, pause lunghe, nessuna fretta di arrivare. Evita toni da impresa sportiva e non gonfiare gli avvistamenti: la natura non è uno zoo. Tono da naturalista appassionato e onesto.',
  },
];

/** Costante pubblica: gli angoli disponibili per ogni kind.
 *  port e zone condividono gli stessi 8 angoli (i 6 editoriali + gratis
 *  ed esperienze); gli aeroporti aggiungono gratis/esperienze SOLO sulle
 *  options che escono in città; per i temi l'angolo È il tema (THEMES). */
export const ANGLES: Record<Exclude<LibraryKind, 'theme'>, AngleDef[]> = {
  port: PORT_ZONE_ANGLES,
  zone: PORT_ZONE_ANGLES,
  airport: [...AIRPORT_ANGLES, FREE_ANGLE, BOOKABLE_ANGLE],
  pilgrim: [...PILGRIM_ANGLES, FREE_ANGLE, BOOKABLE_ANGLE],
};

// ─────────────────────────────────────────────────────────────────────
// Utilità
// ─────────────────────────────────────────────────────────────────────

/** Slug URL-safe: minuscole, senza accenti, trattini singoli. */
function slugify(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // rimuove i diacritici combinanti
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function angleLabel(angles: AngleDef[], id: string): string {
  const a = angles.find(x => x.id === id);
  return a ? a.label : id;
}

// ─────────────────────────────────────────────────────────────────────
// 1) PORTI — CRUISE_PORTS × durate × 8 angoli
// ─────────────────────────────────────────────────────────────────────

function portOptionContext(p: CruisePort, o: StopOption): string {
  return [
    `CONTESTO PORTO: ${p.port} (${p.city}, ${p.country}). Sosta totale a terra: ${o.hours} ore dallo sbarco.`,
    `Collegamento porto-centro: ${p.transferNote}`,
    `Traccia di riferimento "${o.title}": ${o.outline.join(' → ')}.`,
    `Avvertenze locali: ${o.notes}`,
    'VINCOLO NON NEGOZIABILE: rientro al terminal con almeno 1 ora di margine prima della fine della sosta — la nave non aspetta. Adatta l\'angolo editoriale a questo vincolo, mai il contrario.',
  ].join('\n');
}

export function portDescriptors(): LibraryDescriptor[] {
  const out: LibraryDescriptor[] = [];
  for (const p of CRUISE_PORTS) {
    if (!p.coords) continue; // le voci AI senza geocoding non entrano in biblioteca
    for (const o of p.options) {
      for (const a of PORT_ZONE_ANGLES) {
        out.push({
          slug: `${p.id}-${o.hours}h-${a.id}`,
          kind: 'port',
          title: `${p.emoji} ${p.city} dalla nave · ${o.hours}h — ${a.label}`,
          city: p.city,
          country: p.country,
          coords: p.coords,
          hours: o.hours,
          angle: a.id,
          brief: `${a.brief}\n${portOptionContext(p, o)}`,
          constraints: { returnBufferHours: 1 },
          // 'esperienze': il server deve raccogliere i prodotti prenotabili.
          // 'gastronomica': i produttori veri della zona (caseifici, frantoi,
          // birrifici, cantine) invece di piatti raccontati a memoria.
          ...(a.id === BOOKABLE_ANGLE.id ? { contextHints: { bookable: true } } : {}),
          ...(a.id === 'gastronomica' ? { contextHints: { osmGusto: true, osmWinery: true } } : {}),
        });
      }
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────
// 2) AEROPORTI — AIRPORT_LAYOVERS × durate × 3 angoli (+ gratis/esperienze)
//    Regole: buffer di rientro 2h; l'angolo "in-aeroporto" solo per la
//    durata MINIMA dello scalo; gli angoli che escono ("citta-lampo",
//    "relax-vicino" e le varianti "gratis"/"esperienze") solo per le
//    options non-stayNearAirport con ore sufficienti a uscire
//    (>= minLayoverForCity).
// ─────────────────────────────────────────────────────────────────────

function airportOptionContext(a: AirportLayover, o: StopOption): string {
  return [
    `CONTESTO SCALO: aeroporto ${a.airport} (${a.code}) di ${a.city}, ${a.country}. Scalo totale: ${o.hours} ore.`,
    `Collegamento aeroporto-centro: ${a.transferNote}`,
    a.luggageNote ? `Bagagli: ${a.luggageNote}` : 'Bagagli: verifica in loco il deposito bagagli dell\'aeroporto.',
    `Traccia di riferimento "${o.title}": ${o.outline.join(' → ')}.`,
    `Avvertenze locali: ${o.notes}`,
    'VINCOLO NON NEGOZIABILE: al gate 2 ore prima del volo. Adatta l\'angolo editoriale a questo vincolo, mai il contrario.',
  ].join('\n');
}

export function airportDescriptors(): LibraryDescriptor[] {
  const out: LibraryDescriptor[] = [];
  for (const ap of AIRPORT_LAYOVERS) {
    if (!ap.coords) continue;
    const minHours = Math.min(...ap.options.map(o => o.hours));
    const code = ap.id.replace(/^lay-/, '');
    for (const o of ap.options) {
      // gratis/esperienze SOLO sulle options che escono in città
      for (const a of [...AIRPORT_ANGLES, FREE_ANGLE, BOOKABLE_ANGLE]) {
        // "in-aeroporto" ha senso solo per lo scalo più corto del catalogo
        if (a.id === 'in-aeroporto' && o.hours !== minHours) continue;
        // gli angoli che escono richiedono ore sufficienti e una option "da fuori"
        if (a.id !== 'in-aeroporto' && (o.stayNearAirport || o.hours < ap.minLayoverForCity)) continue;
        out.push({
          slug: `air-${code}-${o.hours}h-${a.id}`,
          kind: 'airport',
          title: `✈️ Scalo a ${ap.city} (${ap.code}) · ${o.hours}h — ${a.label}`,
          city: ap.city,
          country: ap.country,
          coords: ap.coords,
          hours: o.hours,
          angle: a.id,
          brief: `${a.brief}\n${airportOptionContext(ap, o)}`,
          constraints: { returnBufferHours: 2 },
          ...(a.id === BOOKABLE_ANGLE.id ? { contextHints: { bookable: true } } : {}),
        });
      }
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────
// 3) CAMMINI — PILGRIM_ROUTES × 2 angoli
// ─────────────────────────────────────────────────────────────────────

function pilgrimContext(r: PilgrimRoute): string {
  const totKm = r.stages.reduce((acc, s) => acc + (s.km || 0), 0);
  const tappe = r.stages
    .map(s => {
      const extra = [s.terrain, s.note, s.lodging ? `alloggio: ${s.lodging}` : '']
        .filter(Boolean)
        .join('; ');
      return `Giorno ${s.day}: ${s.from} → ${s.to}, ${s.km} km${extra ? ` (${extra})` : ''}`;
    })
    .join('. ');
  return [
    `CONTESTO CAMMINO: ${r.name} (${r.start} → ${r.end}, ${r.country}), ${r.days} giorni, ~${totKm} km totali, difficoltà ${r.difficulty}.`,
    `Tappe: ${tappe}.`,
    r.credential ? `Credenziale: ${r.credential}` : '',
    `Note pratiche: ${r.notes}`,
    'Si cammina lungo il percorso ufficiale: nessun trasferimento in auto tra le tappe.',
  ]
    .filter(Boolean)
    .join('\n');
}

export function pilgrimDescriptors(): LibraryDescriptor[] {
  const out: LibraryDescriptor[] = [];
  for (const r of PILGRIM_ROUTES) {
    if (!r.coords) continue;
    const maxKm = r.stages.reduce((m, s) => Math.max(m, s.km || 0), 0);
    const id = r.id.replace(/^walk-/, '');
    // Anche i cammini hanno la coppia obbligatoria gratis/esperienze
    // (ANGLES.pilgrim): camminare è gratis, ma la versione "tutta gratis"
    // esclude anche musei e ingressi lungo il percorso, e quella
    // "esperienze" aggancia visite guidate e biglietti prenotabili.
    for (const a of ANGLES.pilgrim) {
      out.push({
        slug: `pilgrim-${id}-${a.id}`,
        kind: 'pilgrim',
        title: `${r.emoji} ${r.name} — ${a.label}`,
        city: r.start,
        country: r.country,
        coords: r.coords,
        days: r.days,
        angle: a.id,
        brief: `${a.brief}\n${pilgrimContext(r)}`,
        constraints: { maxKmPerDay: maxKm },
        ...(a.id === BOOKABLE_ANGLE.id ? { contextHints: { bookable: true } } : {}),
      });
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────
// 4) TEMI — 9 temi editoriali × città/zone curate (mondiali)
//    Per i temi l'angolo È il tema: angle === theme id.
// ─────────────────────────────────────────────────────────────────────

interface ThemePlace {
  city: string;
  country: string;
  lat: number;
  lon: number;
  /** Aggancio locale del tema, entra nel brief. */
  note?: string;
  /** Giorni specifici per questa città (default: quelli del tema). */
  days?: number;
}

export interface ThemeDef {
  id: string;
  emoji: string;
  label: string;
  /** Giorni di default per gli itinerari del tema. */
  days: number;
  /** Regole editoriali specifiche del tema (istruzioni al generatore). */
  brief: string;
  hints?: LibraryContextHints;
  places: ThemePlace[];
}

export const THEMES: ThemeDef[] = [
  {
    id: 'cinema',
    emoji: '🎬',
    label: 'Sul set',
    days: 1,
    hints: { wikidataFilm: true },
    brief:
      'Tema CINEMA: la città vista attraverso i film e le serie che l\'hanno raccontata. Ogni tappa è un luogo di ripresa REALE e verificabile: cita titolo, anno e la scena precisa, e spiega come mettersi nell\'inquadratura. Alterna i set celebri a quelli che solo i cinefili riconoscono; se un interno non è visitabile dillo subito e proponi l\'esterno o il punto di vista giusto. Evita i luoghi solo "somiglianti" e le leggende da tour operator: se una scena è stata girata in studio, ammettilo. Tono da cinefilo entusiasta ma rigoroso.',
    places: [
      { city: 'Roma', country: 'Italia', lat: 41.89, lon: 12.49, note: 'Vacanze romane, La dolce vita, La grande bellezza' },
      { city: 'Parigi', country: 'Francia', lat: 48.86, lon: 2.35, note: 'Amélie a Montmartre, Midnight in Paris' },
      { city: 'New York', country: 'Stati Uniti', lat: 40.71, lon: -74.01, note: 'Colazione da Tiffany, Ghostbusters, Friends' },
      { city: 'Londra', country: 'Regno Unito', lat: 51.51, lon: -0.13, note: 'Notting Hill, Harry Potter, James Bond' },
      { city: 'Los Angeles', country: 'Stati Uniti', lat: 34.05, lon: -118.24, note: 'La La Land, Blade Runner, il mito degli Studios' },
      { city: 'Tokyo', country: 'Giappone', lat: 35.68, lon: 139.69, note: 'Lost in Translation, Kill Bill' },
      { city: 'Dubrovnik', country: 'Croazia', lat: 42.65, lon: 18.09, note: 'Il Trono di Spade: Approdo del Re' },
      { city: 'Matera', country: 'Italia', lat: 40.67, lon: 16.6, note: 'The Passion, No Time to Die tra i Sassi' },
      { city: 'Venezia', country: 'Italia', lat: 45.44, lon: 12.34, note: 'James Bond, Indiana Jones, A qualcuno piace caldo? no: Anonimo veneziano' },
      { city: 'Vienna', country: 'Austria', lat: 48.21, lon: 16.37, note: 'Il terzo uomo, Before Sunrise' },
      { city: 'Praga', country: 'Cechia', lat: 50.09, lon: 14.42, note: 'Amadeus, Mission: Impossible' },
      { city: 'Edimburgo', country: 'Regno Unito', lat: 55.95, lon: -3.19, note: 'Trainspotting, Avengers, l\'ispirazione di Hogwarts' },
      { city: 'Dublino', country: 'Irlanda', lat: 53.35, lon: -6.26, note: 'Once, The Commitments' },
      { city: 'New Orleans', country: 'Stati Uniti', lat: 29.95, lon: -90.07, note: 'Un tram che si chiama Desiderio, Intervista col vampiro' },
      { city: 'San Francisco', country: 'Stati Uniti', lat: 37.77, lon: -122.42, note: 'La donna che visse due volte, Bullitt' },
      { city: 'Chicago', country: 'Stati Uniti', lat: 41.88, lon: -87.63, note: 'The Blues Brothers, Il cavaliere oscuro' },
      { city: 'Berlino', country: 'Germania', lat: 52.52, lon: 13.4, note: 'Le vite degli altri, Il cielo sopra Berlino' },
      { city: 'Palermo', country: 'Italia', lat: 38.12, lon: 13.36, note: 'Il Padrino parte III al teatro Massimo' },
      { city: 'Napoli', country: 'Italia', lat: 40.85, lon: 14.27, note: 'L\'oro di Napoli, Gomorra, È stata la mano di Dio' },
      { city: 'Siviglia', country: 'Spagna', lat: 37.39, lon: -5.99, note: 'Star Wars a plaza de España, Il Trono di Spade' },
      { city: 'La Valletta', country: 'Malta', lat: 35.9, lon: 14.51, note: 'Il gladiatore, Troy, Popeye Village' },
      { city: 'Wellington', country: 'Nuova Zelanda', lat: -41.29, lon: 174.78, note: 'Il Signore degli Anelli e la Weta Workshop' },
      { city: 'Sydney', country: 'Australia', lat: -33.87, lon: 151.21, note: 'Matrix, Mission: Impossible II' },
      { city: 'Salisburgo', country: 'Austria', lat: 47.8, lon: 13.05, note: 'Tutti insieme appassionatamente' },
      { city: 'Cefalù', country: 'Italia', lat: 38.04, lon: 14.02, note: 'Nuovo Cinema Paradiso sul molo' },
      { city: 'Procida', country: 'Italia', lat: 40.76, lon: 14.03, note: 'Il postino a Marina Corricella' },
    ],
  },
  {
    id: 'fioriture',
    emoji: '🌸',
    label: 'Fioriture',
    days: 1,
    brief:
      'Tema FIORITURE: l\'itinerario insegue una fioritura precisa, e la natura non firma contratti. Dichiara SEMPRE la finestra stagionale onesta (settimane, non mesi interi) e ricorda che varia di anno in anno: consiglia di verificare i bollettini locali prima di partire e proponi cosa salva la giornata se la fioritura è in ritardo o già sfiorita. Privilegia i punti di osservazione migliori a orari con poca folla (alba), il rispetto dei campi (mai calpestare le coltivazioni per una foto) e gli agganci col territorio: mercati dei fiori, prodotti derivati, tradizioni legate alla fioritura. Tono lirico ma con i piedi per terra.',
    places: [
      { city: 'Kyoto', country: 'Giappone', lat: 35.01, lon: 135.77, note: 'sakura lungo il Canale del filosofo (fine marzo-inizio aprile)' },
      { city: 'Tokyo', country: 'Giappone', lat: 35.68, lon: 139.69, note: 'hanami a Ueno e lungo il Meguro (fine marzo-inizio aprile)' },
      { city: 'Hirosaki', country: 'Giappone', lat: 40.6, lon: 140.46, note: 'i 2600 ciliegi del parco del castello (fine aprile)' },
      { city: 'Washington', country: 'Stati Uniti', lat: 38.9, lon: -77.04, note: 'i ciliegi del Tidal Basin (fine marzo-inizio aprile)' },
      { city: 'Bonn', country: 'Germania', lat: 50.73, lon: 7.1, note: 'il tunnel di ciliegi della Heerstraße (aprile)' },
      { city: 'Lisse', country: 'Paesi Bassi', lat: 52.26, lon: 4.56, note: 'Keukenhof e i campi di tulipani (metà marzo-metà maggio)' },
      { city: 'Valensole', country: 'Francia', lat: 43.84, lon: 5.98, note: 'l\'altopiano della lavanda in Provenza (fine giugno-metà luglio)' },
      { city: 'Sault', country: 'Francia', lat: 44.09, lon: 5.41, note: 'lavanda tardiva ai piedi del Ventoux (luglio-inizio agosto)' },
      { city: 'Castelluccio di Norcia', country: 'Italia', lat: 42.83, lon: 13.21, note: 'la Fiorita del Pian Grande (fine giugno-inizio luglio)' },
      { city: 'Brihuega', country: 'Spagna', lat: 40.76, lon: -2.87, note: 'i campi di lavanda della Alcarria (luglio)' },
      { city: 'Agrigento', country: 'Italia', lat: 37.31, lon: 13.58, note: 'i mandorli in fiore nella Valle dei Templi (febbraio-inizio marzo)' },
      { city: 'Pienza', country: 'Italia', lat: 43.08, lon: 11.68, note: 'papaveri e girasoli in Val d\'Orcia (maggio-luglio)' },
      { city: 'Furano', country: 'Giappone', lat: 43.35, lon: 142.38, note: 'la lavanda di Hokkaido (metà luglio)' },
      { city: 'Istanbul', country: 'Turchia', lat: 41.11, lon: 29.05, note: 'il festival dei tulipani al parco di Emirgan (aprile)' },
      { city: 'La Conner', country: 'Stati Uniti', lat: 48.39, lon: -122.5, note: 'i tulipani della Skagit Valley (aprile)' },
      { city: 'Lancaster', country: 'Stati Uniti', lat: 34.72, lon: -118.38, note: 'i papaveri della Antelope Valley (marzo-aprile, anni buoni)' },
      { city: 'Springbok', country: 'Sudafrica', lat: -29.66, lon: 17.89, note: 'il deserto fiorito del Namaqualand (agosto-settembre)' },
      { city: 'Perth', country: 'Australia', lat: -31.95, lon: 115.86, note: 'i wildflower del Kings Park (settembre-ottobre)' },
      { city: 'Funchal', country: 'Portogallo', lat: 32.65, lon: -16.91, note: 'la Festa da Flor di Madeira (aprile-maggio)' },
      { city: 'Cordova', country: 'Spagna', lat: 37.88, lon: -4.78, note: 'i patios fioriti in concorso (maggio)' },
      { city: 'Girona', country: 'Spagna', lat: 41.98, lon: 2.82, note: 'Temps de Flors nei cortili del Barri Vell (maggio)' },
      { city: 'Medellín', country: 'Colombia', lat: 6.25, lon: -75.57, note: 'la Feria de las Flores e le silletas (agosto)' },
      { city: 'Luoping', country: 'Cina', lat: 24.88, lon: 104.31, note: 'l\'oceano giallo di colza tra i coni carsici (febbraio-marzo)' },
    ],
  },
  {
    id: 'fauna',
    emoji: '🦩',
    label: 'Fauna',
    days: 2,
    hints: { inaturalist: true },
    brief:
      'Tema FAUNA: l\'itinerario è costruito attorno ad avvistamenti REALISTICI, non promessi. Per ogni tappa dichiara quali specie si possono vedere in quella stagione e con quale probabilità onesta; consiglia orari giusti (alba e tramonto), binocolo, silenzio e abbigliamento neutro. Regole etiche NON negoziabili: mai avvicinarsi, mai dare cibo, mai droni sui siti di nidificazione, e privilegia guide/centri visita locali rispetto al fai-da-te dove l\'accesso è regolamentato. Se un\'esperienza commerciale localmente diffusa maltratta gli animali, sconsigliala esplicitamente. Tono da naturalista sul campo: preciso, paziente, mai sensazionalista.',
    places: [
      { city: 'Comacchio', country: 'Italia', lat: 44.7, lon: 12.18, note: 'fenicotteri e anatidi nel delta del Po' },
      { city: 'Saintes-Maries-de-la-Mer', country: 'Francia', lat: 43.45, lon: 4.43, note: 'fenicotteri, cavalli e tori di Camargue' },
      { city: 'Hortobágy', country: 'Ungheria', lat: 47.58, lon: 21.15, note: 'le gru in migrazione sulla puszta (ottobre)' },
      { city: 'El Rocío', country: 'Spagna', lat: 37.13, lon: -6.49, note: 'l\'aviofauna di Doñana dalla marisma' },
      { city: 'Faro', country: 'Portogallo', lat: 37.02, lon: -7.94, note: 'la laguna di Ria Formosa tra limicoli e camaleonti' },
      { city: 'Tulcea', country: 'Romania', lat: 45.18, lon: 28.8, note: 'i pellicani del delta del Danubio' },
      { city: 'Białowieża', country: 'Polonia', lat: 52.7, lon: 23.87, note: 'i bisonti europei della foresta primordiale' },
      { city: 'Pescasseroli', country: 'Italia', lat: 41.81, lon: 13.79, note: 'orso marsicano e cervi nel Parco d\'Abruzzo' },
      { city: 'Cogne', country: 'Italia', lat: 45.61, lon: 7.36, note: 'stambecchi e gipeti del Gran Paradiso' },
      { city: 'Monterey', country: 'Stati Uniti', lat: 36.6, lon: -121.9, note: 'balene e lontre marine nella baia' },
      { city: 'Puerto Madryn', country: 'Argentina', lat: -42.77, lon: -65.04, note: 'balene franche australi dalla Península Valdés (giugno-dicembre)' },
      { city: 'Kaikoura', country: 'Nuova Zelanda', lat: -42.4, lon: 173.68, note: 'capodogli tutto l\'anno, albatros' },
      { city: 'Hermanus', country: 'Sudafrica', lat: -34.42, lon: 19.23, note: 'balene franche viste da terra (giugno-novembre)' },
      { city: 'Churchill', country: 'Canada', lat: 58.77, lon: -94.17, note: 'orsi polari in attesa del ghiaccio (ottobre-novembre)' },
      { city: 'Tromsø', country: 'Norvegia', lat: 69.65, lon: 18.96, note: 'orche e megattere nei fiordi (novembre-gennaio)' },
      { city: 'Reykjavik', country: 'Islanda', lat: 64.15, lon: -21.94, note: 'pulcinelle di mare e whale watching (estate)' },
      { city: 'Sandakan', country: 'Malesia', lat: 5.84, lon: 118.12, note: 'gli oranghi riabilitati di Sepilok' },
      { city: 'Sawai Madhopur', country: 'India', lat: 26.02, lon: 76.36, note: 'le tigri di Ranthambore (ottobre-giugno)' },
      { city: 'Tissamaharama', country: 'Sri Lanka', lat: 6.28, lon: 81.29, note: 'leopardi ed elefanti nel parco di Yala' },
      { city: 'Nara', country: 'Giappone', lat: 34.69, lon: 135.8, note: 'i cervi sacri del parco (non farli inchinare per forza)' },
      { city: 'Yamanouchi', country: 'Giappone', lat: 36.73, lon: 138.46, note: 'i macachi delle terme di Jigokudani (inverno)' },
      { city: 'Cowes', country: 'Australia', lat: -38.45, lon: 145.24, note: 'la parata dei pinguini minori di Phillip Island' },
      { city: 'Simon\'s Town', country: 'Sudafrica', lat: -34.19, lon: 18.43, note: 'i pinguini africani di Boulders Beach' },
      { city: 'Nairobi', country: 'Kenya', lat: -1.29, lon: 36.82, note: 'l\'unico parco safari dentro una capitale' },
    ],
  },
  {
    id: 'neve',
    emoji: '⛷',
    label: 'Neve',
    days: 2,
    brief:
      'Tema NEVE: montagna invernale per tutti, non solo per chi scia forte. Costruisci giornate che alternino piste (indicando i comprensori e il livello richiesto con onestà) ad alternative senza sci: ciaspolate segnalate, slittino, terme, rifugi raggiungibili in cabinovia, il paese. Sicurezza sempre esplicita: mai fuoripista senza guida, bollettino valanghe, rientro prima del buio, e dichiarare quando l\'innevamento a bassa quota non è garantito. Includi la dimensione del dopo-sci vero del posto (piatti di montagna, tradizioni) evitando il cliché champagne-e-DJ set se il posto non è quello. Tono energico ma responsabile.',
    places: [
      { city: 'Cortina d\'Ampezzo', country: 'Italia', lat: 46.54, lon: 12.14, note: 'le Tofane e la conca ampezzana olimpica' },
      { city: 'Zermatt', country: 'Svizzera', lat: 46.02, lon: 7.75, note: 'sci ai piedi del Cervino, paese senza auto' },
      { city: 'Chamonix', country: 'Francia', lat: 45.92, lon: 6.87, note: 'il Monte Bianco e l\'Aiguille du Midi' },
      { city: 'St. Moritz', country: 'Svizzera', lat: 46.5, lon: 9.84, note: 'l\'Engadina, il trenino rosso e il lago gelato' },
      { city: 'Livigno', country: 'Italia', lat: 46.54, lon: 10.14, note: 'il "piccolo Tibet" duty free' },
      { city: 'Madonna di Campiglio', country: 'Italia', lat: 46.23, lon: 10.83, note: 'le Dolomiti di Brenta' },
      { city: 'Courmayeur', country: 'Italia', lat: 45.79, lon: 6.97, note: 'Monte Bianco versante italiano, Skyway' },
      { city: 'Sestriere', country: 'Italia', lat: 44.96, lon: 6.88, note: 'la Vialattea olimpica' },
      { city: 'Ortisei', country: 'Italia', lat: 46.57, lon: 11.67, note: 'Val Gardena, Sellaronda e Alpe di Siusi' },
      { city: 'Corvara', country: 'Italia', lat: 46.55, lon: 11.87, note: 'Alta Badia e cucina ladina nei rifugi' },
      { city: 'Bormio', country: 'Italia', lat: 46.47, lon: 10.37, note: 'la Stelvio e le terme romane' },
      { city: 'Innsbruck', country: 'Austria', lat: 47.27, lon: 11.4, note: 'città imperiale con la funivia di Zaha Hadid' },
      { city: 'Kitzbühel', country: 'Austria', lat: 47.45, lon: 12.39, note: 'la Streif e il centro medievale' },
      { city: 'Sölden', country: 'Austria', lat: 46.97, lon: 11.01, note: 'i ghiacciai dell\'Ötztal' },
      { city: 'Davos', country: 'Svizzera', lat: 46.8, lon: 9.84, note: 'l\'altopiano della Montagna incantata' },
      { city: 'Verbier', country: 'Svizzera', lat: 46.1, lon: 7.23, note: 'le 4 Vallées e il freeride (solo con guida)' },
      { city: 'Grindelwald', country: 'Svizzera', lat: 46.62, lon: 8.04, note: 'sotto la parete nord dell\'Eiger, Jungfraujoch' },
      { city: 'Garmisch-Partenkirchen', country: 'Germania', lat: 47.49, lon: 11.1, note: 'la Zugspitze e le case affrescate' },
      { city: 'Soldeu', country: 'Andorra', lat: 42.58, lon: 1.67, note: 'Grandvalira, il comprensorio dei Pirenei' },
      { city: 'Pradollano', country: 'Spagna', lat: 37.09, lon: -3.4, note: 'Sierra Nevada: sci al mattino, Granada la sera' },
      { city: 'Bansko', country: 'Bulgaria', lat: 41.84, lon: 23.49, note: 'il Pirin e le mehana di paese' },
      { city: 'Zakopane', country: 'Polonia', lat: 49.3, lon: 19.95, note: 'gli Alti Tatra e l\'architettura in legno' },
      { city: 'Åre', country: 'Svezia', lat: 63.4, lon: 13.08, note: 'la regina dello sci scandinavo' },
      { city: 'Kittilä', country: 'Finlandia', lat: 67.8, lon: 24.8, note: 'Levi, lapponia, aurore e husky' },
      { city: 'Niseko', country: 'Giappone', lat: 42.8, lon: 140.69, note: 'la powder di Hokkaido e gli onsen' },
      { city: 'Hakuba', country: 'Giappone', lat: 36.7, lon: 137.86, note: 'le Alpi giapponesi olimpiche' },
      { city: 'Aspen', country: 'Stati Uniti', lat: 39.19, lon: -106.82, note: 'quattro montagne e una vecchia città mineraria' },
      { city: 'Whistler', country: 'Canada', lat: 50.12, lon: -122.95, note: 'il comprensorio più grande del Nordamerica' },
      { city: 'Banff', country: 'Canada', lat: 51.18, lon: -115.57, note: 'sci nel parco nazionale, lago Louise gelato' },
      { city: 'Queenstown', country: 'Nuova Zelanda', lat: -45.03, lon: 168.66, note: 'inverno australe (giugno-settembre) sui Remarkables' },
      { city: 'Bariloche', country: 'Argentina', lat: -41.13, lon: -71.31, note: 'il Catedral e la cioccolata patagonica (giugno-settembre)' },
    ],
  },
  {
    id: 'botteghe',
    emoji: '🏺',
    label: 'Botteghe',
    days: 1,
    hints: { osmCraft: true },
    brief:
      'Tema BOTTEGHE: il filo è l\'artigianato VIVO, non i negozi di souvenir travestiti. Ogni tappa è un laboratorio dove si vede lavorare (o un quartiere storico di mestiere): spiega la tecnica, cosa distingue il pezzo autentico dall\'imitazione industriale e quale fascia di prezzo onesta aspettarsi. Insegna il galateo della bottega: chiedere prima di fotografare, non mercanteggiare dove non si usa, comprare direttamente dal maestro quando possibile. Evita le "dimostrazioni per turisti" con vendita aggressiva annessa e dillo quando un mestiere è ormai messinscena. Tono curioso e rispettoso, da apprendista per un giorno.',
    places: [
      { city: 'Firenze', country: 'Italia', lat: 43.77, lon: 11.25, note: 'pelletteria in Oltrarno, orafi di Ponte Vecchio' },
      { city: 'Venezia', country: 'Italia', lat: 45.44, lon: 12.34, note: 'vetro a Murano, merletto a Burano, forcole e maschere' },
      { city: 'Faenza', country: 'Italia', lat: 44.29, lon: 11.88, note: 'la capitale della maiolica e il MIC' },
      { city: 'Deruta', country: 'Italia', lat: 42.98, lon: 12.42, note: 'ceramica umbra dal Rinascimento' },
      { city: 'Caltagirone', country: 'Italia', lat: 37.24, lon: 14.51, note: 'la scala maiolicata e le teste di moro' },
      { city: 'Grottaglie', country: 'Italia', lat: 40.54, lon: 17.44, note: 'il quartiere delle ceramiche scavato nella gravina' },
      { city: 'Vietri sul Mare', country: 'Italia', lat: 40.67, lon: 14.73, note: 'la ceramica della costiera' },
      { city: 'Sorrento', country: 'Italia', lat: 40.63, lon: 14.38, note: 'l\'intarsio ligneo sorrentino' },
      { city: 'Cremona', country: 'Italia', lat: 45.13, lon: 10.02, note: 'le botteghe dei liutai eredi di Stradivari' },
      { city: 'Napoli', country: 'Italia', lat: 40.85, lon: 14.27, note: 'i presepi di San Gregorio Armeno e i sarti' },
      { city: 'Como', country: 'Italia', lat: 45.81, lon: 9.09, note: 'la seta: stamperie e museo didattico' },
      { city: 'Toledo', country: 'Spagna', lat: 39.86, lon: -4.03, note: 'damaschinatura e spade, tra vero e souvenir' },
      { city: 'Puebla', country: 'Messico', lat: 19.04, lon: -98.2, note: 'la talavera certificata DO' },
      { city: 'Oaxaca', country: 'Messico', lat: 17.07, lon: -96.73, note: 'alebrijes, barro negro e telai a Teotitlán' },
      { city: 'Fez', country: 'Marocco', lat: 34.06, lon: -4.97, note: 'le concerie Chouara e i battitori di rame' },
      { city: 'Marrakech', country: 'Marocco', lat: 31.63, lon: -8.01, note: 'i souk per mestiere: tintori, fabbri, babbucce' },
      { city: 'Istanbul', country: 'Turchia', lat: 41.01, lon: 28.97, note: 'Gran Bazar sì, ma soprattutto i han degli artigiani' },
      { city: 'Kyoto', country: 'Giappone', lat: 35.01, lon: 135.77, note: 'kimono a Nishijin, coltelli, ceramica kiyomizu' },
      { city: 'Kanazawa', country: 'Giappone', lat: 36.56, lon: 136.66, note: 'la foglia d\'oro e le lacche' },
      { city: 'Jingdezhen', country: 'Cina', lat: 29.27, lon: 117.18, note: 'mille anni di porcellana imperiale' },
      { city: 'Jaipur', country: 'India', lat: 26.91, lon: 75.79, note: 'stampa a blocchi, gioielli e miniature' },
      { city: 'Varanasi', country: 'India', lat: 25.32, lon: 83.01, note: 'i telai della seta banarasi' },
      { city: 'Delft', country: 'Paesi Bassi', lat: 52.01, lon: 4.36, note: 'il blu di Delft, dal falso al Royal' },
      { city: 'Limoges', country: 'Francia', lat: 45.83, lon: 1.26, note: 'porcellana e smalti' },
      { city: 'Meissen', country: 'Germania', lat: 51.16, lon: 13.47, note: 'la prima porcellana d\'Europa' },
      { city: 'Bruges', country: 'Belgio', lat: 51.21, lon: 3.22, note: 'il merletto a fuselli e il cioccolato artigiano' },
      { city: 'Lisbona', country: 'Portogallo', lat: 38.72, lon: -9.14, note: 'azulejos: fabbriche storiche e museo, occhio ai pezzi strappati ai palazzi' },
      { city: 'Chiang Mai', country: 'Thailandia', lat: 18.79, lon: 98.99, note: 'ombrelli di Bo Sang, argento e carta saa' },
      { city: 'Ubud', country: 'Indonesia', lat: -8.51, lon: 115.26, note: 'intaglio, argento e i villaggi dei mestieri balinesi' },
    ],
  },
  {
    id: 'vino',
    emoji: '🍷',
    label: 'Vino',
    days: 2,
    hints: { osmWinery: true, osmGusto: true },
    brief:
      'Tema VINO: il territorio letto attraverso le sue vigne. Alterna 2-3 cantine al giorno (MAI di più: le degustazioni si sommano) a borghi, enoteche e paesaggi vitati; per ogni zona spiega denominazioni, vitigni e cosa distingue un produttore artigiano da uno industriale. Regola ferrea: chi degusta non guida — costruisci l\'itinerario attorno a navette, taxi, tour organizzati o tappe a piedi, e dillo esplicitamente. Consiglia di prenotare le visite in cantina (raramente si entra senza appuntamento) e includi l\'abbinamento con la cucina locale. Vietato lo snobismo: spiega senza gergo, e segnala anche la bottiglia onesta da 15 euro.',
    places: [
      { city: 'Alba', country: 'Italia', lat: 44.7, lon: 8.04, note: 'Langhe: Barolo, Barbaresco e il tartufo' },
      { city: 'Greve in Chianti', country: 'Italia', lat: 43.58, lon: 11.32, note: 'il cuore del Chianti Classico' },
      { city: 'Montalcino', country: 'Italia', lat: 43.06, lon: 11.49, note: 'il Brunello e la Val d\'Orcia' },
      { city: 'Verona', country: 'Italia', lat: 45.44, lon: 10.99, note: 'Valpolicella e Amarone a mezz\'ora dall\'Arena' },
      { city: 'Erbusco', country: 'Italia', lat: 45.6, lon: 9.97, note: 'Franciacorta: il metodo classico italiano' },
      { city: 'Randazzo', country: 'Italia', lat: 37.88, lon: 14.95, note: 'l\'Etna e i vini vulcanici di contrada' },
      { city: 'Beaune', country: 'Francia', lat: 47.02, lon: 4.84, note: 'la capitale della Borgogna e i climat UNESCO' },
      { city: 'Bordeaux', country: 'Francia', lat: 44.84, lon: -0.58, note: 'la Cité du Vin e gli châteaux del Médoc' },
      { city: 'Épernay', country: 'Francia', lat: 49.04, lon: 3.96, note: 'l\'avenue de Champagne e le cave scavate nel gesso' },
      { city: 'Colmar', country: 'Francia', lat: 48.08, lon: 7.36, note: 'la route des vins d\'Alsazia tra i villaggi a graticcio' },
      { city: 'Haro', country: 'Spagna', lat: 42.58, lon: -2.85, note: 'il barrio de la Estación della Rioja' },
      { city: 'Peñafiel', country: 'Spagna', lat: 41.6, lon: -4.12, note: 'Ribera del Duero sotto il castello-museo' },
      { city: 'Jerez de la Frontera', country: 'Spagna', lat: 36.69, lon: -6.14, note: 'sherry, soleras e bodegas cattedrale' },
      { city: 'Peso da Régua', country: 'Portogallo', lat: 41.16, lon: -7.79, note: 'il Douro dei terrazzamenti e le quintas del Porto' },
      { city: 'Bernkastel-Kues', country: 'Germania', lat: 49.92, lon: 7.07, note: 'i Riesling verticali della Mosella' },
      { city: 'Rüdesheim', country: 'Germania', lat: 49.98, lon: 7.92, note: 'il Rheingau e la Drosselgasse (con giudizio)' },
      { city: 'Dürnstein', country: 'Austria', lat: 48.4, lon: 15.52, note: 'la Wachau: Grüner Veltliner sul Danubio' },
      { city: 'Tokaj', country: 'Ungheria', lat: 48.12, lon: 21.41, note: 'l\'aszú, "vino dei re, re dei vini"' },
      { city: 'Santorini', country: 'Grecia', lat: 36.42, lon: 25.43, note: 'Assyrtiko su viti a canestro nella cenere vulcanica' },
      { city: 'Telavi', country: 'Georgia', lat: 41.92, lon: 45.47, note: 'Kakheti e gli 8000 anni dei qvevri' },
      { city: 'Napa', country: 'Stati Uniti', lat: 38.3, lon: -122.29, note: 'la valle simbolo del vino americano' },
      { city: 'McMinnville', country: 'Stati Uniti', lat: 45.21, lon: -123.2, note: 'i Pinot Noir della Willamette Valley' },
      { city: 'Mendoza', country: 'Argentina', lat: -32.89, lon: -68.85, note: 'Malbec d\'altura con le Ande sullo sfondo' },
      { city: 'Santa Cruz', country: 'Cile', lat: -34.64, lon: -71.37, note: 'la valle di Colchagua e il Carmenère' },
      { city: 'Stellenbosch', country: 'Sudafrica', lat: -33.93, lon: 18.86, note: 'le wine estate del Capo olandese' },
      { city: 'Franschhoek', country: 'Sudafrica', lat: -33.91, lon: 19.12, note: 'l\'angolo ugonotto e il wine tram' },
      { city: 'Tanunda', country: 'Australia', lat: -34.52, lon: 138.96, note: 'Barossa Valley: Shiraz e eredità tedesca' },
      { city: 'Blenheim', country: 'Nuova Zelanda', lat: -41.51, lon: 173.96, note: 'i Sauvignon Blanc di Marlborough' },
      { city: 'Kelowna', country: 'Canada', lat: 49.89, lon: -119.5, note: 'l\'Okanagan tra lago e icewine' },
    ],
  },
  {
    id: 'aperture-straordinarie',
    emoji: '🗝',
    label: 'Aperture straordinarie',
    days: 1,
    brief:
      'Tema APERTURE-STRAORDINARIE: i luoghi normalmente chiusi o poco accessibili — palazzi privati, cantieri di restauro, cripte, terrazze, archivi — che aprono solo in occasioni precise (giornate FAI/Heritage Days/Open House, visite su prenotazione, aperture serali). REGOLA D\'ORO: per ogni tappa dichiara con che meccanismo apre e imponi la verifica di date e prenotazioni PRIMA di partire, perché le aperture cambiano ogni anno; affianca sempre un\'alternativa sempre-aperta di pari fascino per non bucare la giornata. Privilegia ciò che davvero non si vede altrimenti rispetto al monumento celebre in versione serale. Tono da caccia al tesoro colta, con la pazienza della prenotazione.',
    places: [
      { city: 'Roma', country: 'Italia', lat: 41.89, lon: 12.49, note: 'ipogei, palazzi delle istituzioni, giornate FAI' },
      { city: 'Milano', country: 'Italia', lat: 45.46, lon: 9.19, note: 'case museo, cortili privati, salite ai tetti' },
      { city: 'Torino', country: 'Italia', lat: 45.07, lon: 7.69, note: 'palazzi barocchi privati e infernotti' },
      { city: 'Napoli', country: 'Italia', lat: 40.85, lon: 14.27, note: 'ipogei greci, chiese "a ora" e palazzi nobiliari' },
      { city: 'Genova', country: 'Italia', lat: 44.41, lon: 8.93, note: 'i Rolli Days: i palazzi UNESCO aprono i saloni' },
      { city: 'Palermo', country: 'Italia', lat: 38.12, lon: 13.36, note: 'Le Vie dei Tesori: oratori e terrazze' },
      { city: 'Firenze', country: 'Italia', lat: 43.77, lon: 11.25, note: 'corridoi, archivi e giardini privati su prenotazione' },
      { city: 'Venezia', country: 'Italia', lat: 45.44, lon: 12.34, note: 'scuole, palazzi e isole minori ad apertura contingentata' },
      { city: 'Bologna', country: 'Italia', lat: 44.49, lon: 11.34, note: 'i canali sotterranei e le torri normalmente chiuse' },
      { city: 'Trieste', country: 'Italia', lat: 45.65, lon: 13.77, note: 'palazzi assicurativi, rifugi antiaerei, l\'ex manicomio' },
      { city: 'Parigi', country: 'Francia', lat: 48.86, lon: 2.35, note: 'Journées du Patrimoine: Eliseo, teatri, cantieri' },
      { city: 'Londra', country: 'Regno Unito', lat: 51.51, lon: -0.13, note: 'Open House: grattacieli, club e case d\'autore' },
      { city: 'Berlino', country: 'Germania', lat: 52.52, lon: 13.4, note: 'Tag des offenen Denkmals, bunker e aeroporti dismessi' },
      { city: 'Vienna', country: 'Austria', lat: 48.21, lon: 16.37, note: 'Open House Wien e le cripte asburgiche minori' },
      { city: 'Madrid', country: 'Spagna', lat: 40.42, lon: -3.7, note: 'palazzi istituzionali aperti a ottobre' },
      { city: 'Barcellona', country: 'Spagna', lat: 41.39, lon: 2.17, note: '48H Open House: modernismo privato' },
      { city: 'New York', country: 'Stati Uniti', lat: 40.71, lon: -74.01, note: 'Open House New York: infrastrutture e attici' },
      { city: 'Amsterdam', country: 'Paesi Bassi', lat: 52.37, lon: 4.9, note: 'Open Monumentendag e le case sui canali' },
      { city: 'Bruxelles', country: 'Belgio', lat: 50.85, lon: 4.35, note: 'la stagione delle serre reali di Laeken e l\'Art Nouveau privato' },
      { city: 'Praga', country: 'Cechia', lat: 50.09, lon: 14.42, note: 'Open House Praha: palazzi cubisti e centrali' },
      { city: 'Lisbona', country: 'Portogallo', lat: 38.72, lon: -9.14, note: 'Open House Lisboa e i palazzi azulejados' },
      { city: 'Chicago', country: 'Stati Uniti', lat: 41.88, lon: -87.63, note: 'Open House Chicago: l\'architettura che ha inventato il grattacielo' },
    ],
  },
  {
    id: 'memoria',
    emoji: '🕯',
    label: 'Memoria',
    days: 1,
    brief:
      'Tema MEMORIA: luoghi di tragedia, guerra, persecuzione e resistenza civile. Tono GRAVE e rispettoso, senza eccezioni: niente gamification, niente checklist allegre, niente "esperienze imperdibili"; le pause caffè si suggeriscono sobriamente come momenti per riprendersi, non come premi. Contestualizza ogni luogo con i fatti storici accertati, dai spazio alle voci delle vittime, e ricorda il comportamento dovuto (silenzio, niente selfie sorridenti, abbigliamento consono dove richiesto). Se il sito ha regole di visita o età minime consigliate, riportale. L\'obiettivo è capire e ricordare, non commuovere a comando.',
    places: [
      { city: 'Berlino', country: 'Germania', lat: 52.52, lon: 13.4, note: 'Memoriale dell\'Olocausto, Topografia del Terrore, il Muro' },
      { city: 'Cracovia', country: 'Polonia', lat: 50.06, lon: 19.94, note: 'il ghetto, Płaszów e la visita ad Auschwitz-Birkenau' },
      { city: 'Varsavia', country: 'Polonia', lat: 52.23, lon: 21.01, note: 'il ghetto, il museo POLIN e la Rivolta del \'44' },
      { city: 'Amsterdam', country: 'Paesi Bassi', lat: 52.37, lon: 4.9, note: 'la casa di Anne Frank (solo su prenotazione) e il quartiere ebraico' },
      { city: 'Hiroshima', country: 'Giappone', lat: 34.39, lon: 132.45, note: 'il Parco della Pace e la cupola della bomba' },
      { city: 'Nagasaki', country: 'Giappone', lat: 32.75, lon: 129.88, note: 'l\'epicentro, il museo e la collina di Urakami' },
      { city: 'Sarajevo', country: 'Bosnia ed Erzegovina', lat: 43.86, lon: 18.41, note: 'l\'assedio, il tunnel della speranza, le rose di Sarajevo' },
      { city: 'Belfast', country: 'Regno Unito', lat: 54.6, lon: -5.93, note: 'i Troubles: murales e peace walls con guide locali' },
      { city: 'Bayeux', country: 'Francia', lat: 49.28, lon: -0.7, note: 'le spiagge dello Sbarco e i cimiteri di Normandia' },
      { city: 'Verdun', country: 'Francia', lat: 49.16, lon: 5.38, note: 'l\'ossario di Douaumont e i villaggi cancellati' },
      { city: 'Ieper', country: 'Belgio', lat: 50.85, lon: 2.89, note: 'il saliente di Ypres e il Last Post al Menin Gate (ogni sera)' },
      { city: 'Çanakkale', country: 'Turchia', lat: 40.15, lon: 26.41, note: 'i campi di Gallipoli, memoria condivisa turca e ANZAC' },
      { city: 'Phnom Penh', country: 'Cambogia', lat: 11.56, lon: 104.92, note: 'Tuol Sleng e Choeung Ek: i Khmer rossi' },
      { city: 'Kigali', country: 'Ruanda', lat: -1.95, lon: 30.06, note: 'il memoriale del genocidio del 1994' },
      { city: 'Città del Capo', country: 'Sudafrica', lat: -33.92, lon: 18.42, note: 'Robben Island e il District Six Museum' },
      { city: 'Washington', country: 'Stati Uniti', lat: 38.9, lon: -77.04, note: 'l\'Holocaust Museum e i memoriali del Mall' },
      { city: 'New York', country: 'Stati Uniti', lat: 40.71, lon: -74.01, note: 'il 9/11 Memorial e Ellis Island' },
      { city: 'Fogliano Redipuglia', country: 'Italia', lat: 45.85, lon: 13.48, note: 'il sacrario dei centomila e il Carso della Grande Guerra' },
      { city: 'Trieste', country: 'Italia', lat: 45.65, lon: 13.77, note: 'la Risiera di San Sabba e la foiba di Basovizza' },
      { city: 'Marzabotto', country: 'Italia', lat: 44.34, lon: 11.21, note: 'Monte Sole e la strage del 1944' },
      { city: 'Stazzema', country: 'Italia', lat: 43.99, lon: 10.29, note: 'Sant\'Anna: l\'eccidio e il Parco della Pace' },
      { city: 'Carpi', country: 'Italia', lat: 44.78, lon: 10.88, note: 'il campo di Fossoli e il museo del Deportato' },
      { city: 'Roma', country: 'Italia', lat: 41.89, lon: 12.49, note: 'le Fosse Ardeatine e il Portico d\'Ottavia (16 ottobre 1943)' },
      { city: 'Milano', country: 'Italia', lat: 45.46, lon: 9.19, note: 'il Binario 21 e piazzale Loreto' },
      { city: 'Terezín', country: 'Cechia', lat: 50.51, lon: 14.15, note: 'il ghetto-fortezza "modello" e la sua propaganda' },
      { city: 'Budapest', country: 'Ungheria', lat: 47.5, lon: 19.04, note: 'le Scarpe sul Danubio e la Casa del Terrore' },
      { city: 'Danzica', country: 'Polonia', lat: 54.35, lon: 18.65, note: 'Westerplatte, dove iniziò la guerra, e Solidarność' },
    ],
  },
  {
    id: 'souvenir',
    emoji: '🛍',
    label: 'Souvenir veri',
    days: 1,
    brief:
      'Tema SOUVENIR: la caccia al ricordo AUTENTICO, con una garbata ma ferma denuncia della paccottiglia. Per ogni città indica 4-6 categorie di acquisti che hanno senso (prodotti che lì si fanno davvero, con la filiera visibile) e per ciascuna DOVE comprarli al giusto prezzo: mercati storici, botteghe, spacci di produttori, non i negozi di calamite. Smaschera con eleganza i falsi tipici — il "prodotto locale" fabbricato altrove, i marchi contraffatti, i prezzi da aeroporto — e insegna a leggere etichette e denominazioni. Ricorda le regole doganali per ciò che non si può esportare (conchiglie, reperti, alimenti freschi). Tono da personal shopper onesto, dalla parte del viaggiatore e degli artigiani.',
    places: [
      { city: 'Firenze', country: 'Italia', lat: 43.77, lon: 11.25, note: 'pelle vera vs "genuine leather", carta marmorizzata, profumi storici' },
      { city: 'Venezia', country: 'Italia', lat: 45.44, lon: 12.34, note: 'vetro con marchio Murano vs vetro d\'importazione' },
      { city: 'Roma', country: 'Italia', lat: 41.89, lon: 12.49, note: 'artigianato ecclesiastico, gastronomia laziale, sartorie' },
      { city: 'Napoli', country: 'Italia', lat: 40.85, lon: 14.27, note: 'pastori veri di San Gregorio, cravatte, caffè' },
      { city: 'Palermo', country: 'Italia', lat: 38.12, lon: 13.36, note: 'teste di moro autentiche, frutta martorana, coppole' },
      { city: 'Lisbona', country: 'Portogallo', lat: 38.72, lon: -9.14, note: 'conserve illustrate, azulejos NON strappati ai palazzi, ginjinha' },
      { city: 'Porto', country: 'Portogallo', lat: 41.15, lon: -8.61, note: 'vino Porto dalle cantine, filigrana, tessuti' },
      { city: 'Siviglia', country: 'Spagna', lat: 37.39, lon: -5.99, note: 'ceramica di Triana, ventagli e mantoni veri' },
      { city: 'Atene', country: 'Grecia', lat: 37.98, lon: 23.73, note: 'komboloi, olio e miele, sandali su misura vs le repliche in serie' },
      { city: 'Istanbul', country: 'Turchia', lat: 41.01, lon: 28.97, note: 'tappeti con provenienza, spezie al Mısır Çarşısı, çini' },
      { city: 'Marrakech', country: 'Marocco', lat: 31.63, lon: -8.01, note: 'argan vero (cooperative), babbucce cucite, tajine da cucina vs da vetrina' },
      { city: 'Fez', country: 'Marocco', lat: 34.06, lon: -4.97, note: 'pelle delle concerie, ceramica blu, tessitura' },
      { city: 'Parigi', country: 'Francia', lat: 48.86, lon: 2.35, note: 'bouquinistes, épiceries fini, profumeria — non la tour Eiffel di plastica' },
      { city: 'Londra', country: 'Regno Unito', lat: 51.51, lon: -0.13, note: 'tè in casa storica, sartoria, vinili e mercati' },
      { city: 'Vienna', country: 'Austria', lat: 48.21, lon: 16.37, note: 'Sachertorte spedibile, porcellana Augarten, non il Mozart-kitsch' },
      { city: 'Praga', country: 'Cechia', lat: 50.09, lon: 14.42, note: 'cristallo di Boemia con marchio vs vetro cinese, marionette artigiane' },
      { city: 'Budapest', country: 'Ungheria', lat: 47.5, lon: 19.04, note: 'paprika di Kalocsa, ricami, Tokaji al Mercato Centrale' },
      { city: 'Tokyo', country: 'Giappone', lat: 35.68, lon: 139.69, note: 'coltelli a Kappabashi, cancelleria, dolci wagashi' },
      { city: 'Kyoto', country: 'Giappone', lat: 35.01, lon: 135.77, note: 'tè di Uji, furoshiki, incenso — comprati nei quartieri, non ai templi' },
      { city: 'Seoul', country: 'Corea del Sud', lat: 37.57, lon: 126.98, note: 'hanji, cosmetica, tè: Insadong con giudizio' },
      { city: 'Bangkok', country: 'Thailandia', lat: 13.75, lon: 100.5, note: 'seta thai certificata, spezie, celadon — occhio alle gemme "occasione"' },
      { city: 'Città del Messico', country: 'Messico', lat: 19.43, lon: -99.13, note: 'La Ciudadela: alebrijes, talavera DO, cioccolato e mezcal' },
      { city: 'Cusco', country: 'Perù', lat: -13.53, lon: -71.97, note: 'alpaca vera vs "maybe alpaca", tessuti delle comunità' },
      { city: 'New York', country: 'Stati Uniti', lat: 40.71, lon: -74.01, note: 'vinili, vintage, librerie indipendenti — non i tre-per-dieci di Times Square' },
      { city: 'Barcellona', country: 'Spagna', lat: 41.39, lon: 2.17, note: 'espadrilles cucite, turrón, ceramica catalana fuori dalle Ramblas' },
    ],
  },
  // ── ONDATA 2: temi non-media nuovi ──────────────────────────────────
  {
    id: 'fabbriche-del-gusto',
    emoji: '🍴',
    label: 'Fabbriche del gusto',
    days: 1,
    hints: { osmCraft: true, osmGusto: true },
    brief:
      'Tema FABBRICHE-DEL-GUSTO: si visita DOVE il prodotto simbolo nasce — caseifici, acetaie, frantoi, distillerie, tostature, salumifici — non dove lo si vende. Ogni tappa è un produttore o consorzio REALMENTE visitabile: spiega il processo con parole semplici (perché il tempo, la temperatura o la pietra fanno la differenza), imponi la PRENOTAZIONE dove serve (i caseifici lavorano all\'alba: dillo) e chiudi con l\'assaggio e lo spaccio a prezzo giusto. Distingui sempre il prodotto DOP/IGP dall\'imitazione da scaffale e insegna a leggere l\'etichetta. Se un\'azienda celebre NON fa visite, dillo e proponi il museo o consorzio che le fa. Tono goloso ma tecnico, da apprendista casaro per un giorno.',
    places: [
      { city: 'Parma', country: 'Italia', lat: 44.8, lon: 10.33, note: 'caseifici del Parmigiano Reggiano all\'alba, prosciuttifici di Langhirano' },
      { city: 'Modena', country: 'Italia', lat: 44.65, lon: 10.93, note: 'acetaie di aceto balsamico tradizionale nei sottotetti, visite in famiglia' },
      { city: 'Gragnano', country: 'Italia', lat: 40.69, lon: 14.52, note: 'i pastifici della città della pasta e la valle dei mulini' },
      { city: 'Paestum', country: 'Italia', lat: 40.42, lon: 15.01, note: 'i caseifici della mozzarella di bufala campana tra le piane del Sele' },
      { city: 'Modica', country: 'Italia', lat: 36.86, lon: 14.76, note: 'il cioccolato a freddo di tradizione azteca nelle dolcerie storiche' },
      { city: 'Bronte', country: 'Italia', lat: 37.79, lon: 14.83, note: 'il pistacchio verde sull\'Etna: lochi e laboratori' },
      { city: 'Norcia', country: 'Italia', lat: 42.79, lon: 13.09, note: 'norcinerie e il tartufo nero di valnerina' },
      { city: 'Imperia', country: 'Italia', lat: 43.89, lon: 8.03, note: 'frantoi della taggiasca e museo dell\'olivo' },
      { city: 'Ostuni', country: 'Italia', lat: 40.73, lon: 17.58, note: 'frantoi ipogei e masserie olearie della piana degli ulivi monumentali' },
      { city: 'Cetara', country: 'Italia', lat: 40.65, lon: 14.7, note: 'la colatura di alici: le aziende del borgo di pescatori' },
      { city: 'Amalfi', country: 'Italia', lat: 40.63, lon: 14.6, note: 'limoneti a terrazza e limoncello dai limoni veri della costiera' },
      { city: 'Trapani', country: 'Italia', lat: 37.96, lon: 12.5, note: 'le saline con i mulini: il sale marino artigianale tra le vasche rosa' },
      { city: 'Vercelli', country: 'Italia', lat: 45.32, lon: 8.42, note: 'riso: le grange delle risaie e le riserie visitabili' },
      { city: 'Torino', country: 'Italia', lat: 45.07, lon: 7.69, note: 'gianduja e cioccolato: laboratori storici e bicerin' },
      { city: 'Bra', country: 'Italia', lat: 44.7, lon: 7.85, note: 'la capitale Slow Food, Pollenzo e i formaggi di Langa' },
      { city: 'Gruyères', country: 'Svizzera', lat: 46.58, lon: 7.08, note: 'La Maison du Gruyère e la cioccolateria di Broc a due passi' },
      { city: 'Gouda', country: 'Paesi Bassi', lat: 52.01, lon: 4.71, note: 'il mercato del formaggio e le fattorie casearie del polder' },
      { city: 'Bruxelles', country: 'Belgio', lat: 50.85, lon: 4.35, note: 'cioccolatieri artigiani e birrerie trappiste/lambic (Cantillon)' },
      { city: 'Cognac', country: 'Francia', lat: 45.7, lon: -0.33, note: 'le maison del cognac sulla Charente: alambicchi e paradis' },
      { city: 'Digione', country: 'Francia', lat: 47.32, lon: 5.04, note: 'la senape artigianale e le cave di cassis' },
      { city: 'Islay', country: 'Regno Unito', lat: 55.63, lon: -6.19, note: 'le distillerie torbate dell\'isola del whisky' },
      { city: 'Dufftown', country: 'Regno Unito', lat: 57.44, lon: -3.12, note: 'lo Speyside: la capitale del malto e il Malt Whisky Trail' },
      { city: 'Tequila', country: 'Messico', lat: 20.88, lon: -103.84, note: 'agave blu, distillerie storiche e il paesaggio UNESCO' },
      { city: 'Oaxaca', country: 'Messico', lat: 17.07, lon: -96.73, note: 'palenques del mezcal nelle valli centrali' },
      { city: 'Viñales', country: 'Cuba', lat: 22.62, lon: -83.71, note: 'le vegas del tabacco e i secaderos tra i mogotes' },
      { city: 'Salento', country: 'Colombia', lat: 4.64, lon: -75.57, note: 'le fincas del caffè nell\'eje cafetero UNESCO' },
      { city: 'Antigua Guatemala', country: 'Guatemala', lat: 14.56, lon: -90.73, note: 'caffè d\'altura tra i vulcani e laboratori di cacao' },
      { city: 'Nuwara Eliya', country: 'Sri Lanka', lat: 6.97, lon: 80.77, note: 'le piantagioni di tè di Ceylon e le fabbriche coloniali' },
      { city: 'Darjeeling', country: 'India', lat: 27.04, lon: 88.26, note: 'i tea garden himalayani e il trenino UNESCO' },
      { city: 'Uji', country: 'Giappone', lat: 34.89, lon: 135.8, note: 'il tè matcha: mulini a pietra, degustazioni e case storiche' },
      { city: 'Kobe', country: 'Giappone', lat: 34.69, lon: 135.2, note: 'il sake del distretto di Nada: kura visitabili con degustazione' },
      { city: 'Bardstown', country: 'Stati Uniti', lat: 37.81, lon: -85.47, note: 'il Kentucky Bourbon Trail tra rickhouse e alambicchi' },
    ],
  },
  {
    id: 'musei-impresa',
    emoji: '🏭',
    label: 'Musei d\'impresa',
    days: 1,
    brief:
      'Tema MUSEI-IMPRESA: le fabbriche-mito aperte al pubblico e i musei aziendali fatti bene. Ogni tappa racconta un\'impresa attraverso i suoi oggetti: il prototipo, la catena di montaggio, il flop istruttivo, il design che ha cambiato le case di tutti. Dai le informazioni pratiche VERE: molti tour di fabbrica si prenotano con settimane di anticipo, alcuni vietano foto o hanno età minime — dillo tappa per tappa. Distingui il museo con l\'archivio autentico dal semplice brand store con biglietto: quando è marketing puro, avvisalo. Integra con i luoghi d\'origine dell\'azienda (il garage, il primo negozio, il villaggio operaio). Tono curioso da ingegnere-narratore, mai da brochure.',
    places: [
      { city: 'Maranello', country: 'Italia', lat: 44.53, lon: 10.86, note: 'il Museo Ferrari, la pista di Fiorano e i simulatori' },
      { city: 'Sant\'Agata Bolognese', country: 'Italia', lat: 44.66, lon: 11.13, note: 'il museo Lamborghini e il tour della linea' },
      { city: 'Bologna', country: 'Italia', lat: 44.49, lon: 11.34, note: 'il museo Ducati a Borgo Panigale' },
      { city: 'Ivrea', country: 'Italia', lat: 45.47, lon: 7.88, note: 'la città industriale Olivetti patrimonio UNESCO' },
      { city: 'Crespi d\'Adda', country: 'Italia', lat: 45.6, lon: 9.54, note: 'il villaggio operaio UNESCO rimasto intatto' },
      { city: 'Pontedera', country: 'Italia', lat: 43.66, lon: 10.63, note: 'il museo Piaggio: la Vespa dal dopoguerra a oggi' },
      { city: 'Perugia', country: 'Italia', lat: 43.11, lon: 12.39, note: 'la Casa del Cioccolato Perugina con la fabbrica dei Baci' },
      { city: 'Fabriano', country: 'Italia', lat: 43.34, lon: 12.9, note: 'il museo della carta e della filigrana: la carta dal Duecento' },
      { city: 'Torino', country: 'Italia', lat: 45.07, lon: 7.69, note: 'il Lingotto con la pista sul tetto e il museo dell\'automobile' },
      { city: 'Monaco di Baviera', country: 'Germania', lat: 48.18, lon: 11.56, note: 'BMW Welt e museo: architettura e motori' },
      { city: 'Stoccarda', country: 'Germania', lat: 48.79, lon: 9.23, note: 'i musei Mercedes-Benz e Porsche, due capolavori' },
      { city: 'Wolfsburg', country: 'Germania', lat: 52.43, lon: 10.79, note: 'l\'Autostadt Volkswagen e le torri di consegna' },
      { city: 'Dublino', country: 'Irlanda', lat: 53.34, lon: -6.29, note: 'la Guinness Storehouse a St. James\'s Gate con la Gravity Bar' },
      { city: 'Midleton', country: 'Irlanda', lat: 51.91, lon: -8.17, note: 'la Jameson Distillery tra alambicchi giganti' },
      { city: 'Amsterdam', country: 'Paesi Bassi', lat: 52.36, lon: 4.89, note: 'la Heineken Experience nella birreria storica' },
      { city: 'Eindhoven', country: 'Paesi Bassi', lat: 51.44, lon: 5.48, note: 'il Philips Museum e Strijp-S, la fabbrica diventata quartiere' },
      { city: 'Billund', country: 'Danimarca', lat: 55.73, lon: 9.11, note: 'la LEGO House e la casa del falegname Ole Kirk' },
      { city: 'Copenaghen', country: 'Danimarca', lat: 55.67, lon: 12.53, note: 'il quartiere Carlsberg con le cantine e gli elefanti' },
      { city: 'Göteborg', country: 'Svezia', lat: 57.72, lon: 11.83, note: 'il World of Volvo e l\'anima industriale della città' },
      { city: 'Mladá Boleslav', country: 'Cechia', lat: 50.41, lon: 14.9, note: 'il museo Škoda accanto alla fabbrica più antica d\'Europa' },
      { city: 'Clermont-Ferrand', country: 'Francia', lat: 45.78, lon: 3.08, note: 'L\'Aventure Michelin: dall\'omino Bibendum alle guide' },
      { city: 'Ginevra', country: 'Svizzera', lat: 46.2, lon: 6.15, note: 'il museo Patek Philippe: cinque secoli di orologeria' },
      { city: 'La Chaux-de-Fonds', country: 'Svizzera', lat: 47.1, lon: 6.83, note: 'la città-manifattura dell\'orologio, urbanistica UNESCO' },
      { city: 'Vevey', country: 'Svizzera', lat: 46.46, lon: 6.84, note: 'l\'Alimentarium Nestlé e la forchetta nel lago' },
      { city: 'Atlanta', country: 'Stati Uniti', lat: 33.76, lon: -84.39, note: 'il World of Coca-Cola accanto al parco olimpico' },
      { city: 'Dearborn', country: 'Stati Uniti', lat: 42.3, lon: -83.23, note: 'l\'Henry Ford Museum e la fabbrica del F-150 a Rouge' },
      { city: 'Everett', country: 'Stati Uniti', lat: 47.92, lon: -122.27, note: 'il Boeing Future of Flight: l\'edificio più capiente del mondo' },
      { city: 'Hershey', country: 'Stati Uniti', lat: 40.29, lon: -76.65, note: 'la città del cioccolato con i lampioni a forma di Kiss' },
      { city: 'Mountain View', country: 'Stati Uniti', lat: 37.41, lon: -122.08, note: 'il Computer History Museum e il garage-mito della Silicon Valley' },
      { city: 'Louisville', country: 'Stati Uniti', lat: 38.26, lon: -85.76, note: 'il Louisville Slugger Museum con la mazza gigante' },
      { city: 'Nagoya', country: 'Giappone', lat: 35.18, lon: 136.9, note: 'il Toyota Commemorative Museum: dai telai alle auto' },
      { city: 'Hiroshima', country: 'Giappone', lat: 34.36, lon: 132.5, note: 'il museo Mazda col tour della linea (prenotazione)' },
      { city: 'Ikeda', country: 'Giappone', lat: 34.82, lon: 135.43, note: 'il Cup Noodles Museum: inventa il tuo ramen istantaneo' },
      { city: 'Uji', country: 'Giappone', lat: 34.89, lon: 135.8, note: 'il Nintendo Museum nella vecchia fabbrica di carte hanafuda' },
      { city: 'Suwon', country: 'Corea del Sud', lat: 37.26, lon: 127.03, note: 'il Samsung Innovation Museum accanto alla città-campus' },
    ],
  },
  {
    id: 'wellness',
    emoji: '🧖',
    label: 'Wellness',
    days: 2,
    brief:
      'Tema WELLNESS: acque termali, hammam, onsen, saune e spa STORICHE — il benessere come cultura locale, non come catalogo di trattamenti. Per ogni tappa spiega il rituale del posto e il suo galateo VERO (dove ci si lava prima, dove il costume è vietato o obbligatorio, i tatuaggi negli onsen, il silenzio nelle saune nordiche): chi arriva impreparato rovina l\'esperienza a sé e agli altri. Alterna l\'ammollo a passeggiate leggere e cucina sana del territorio; indica controindicazioni oneste (calore e cuore, bambini piccoli) e gli orari con meno folla. Distingui lo stabilimento storico autentico dalla spa di catena con l\'estetica giusta. Tono rilassato e concreto: qui si va per stare bene davvero.',
    places: [
      { city: 'Budapest', country: 'Ungheria', lat: 47.5, lon: 19.04, note: 'Széchenyi, Gellért e Rudas: terme imperiali e ottomane' },
      { city: 'Hévíz', country: 'Ungheria', lat: 46.79, lon: 17.19, note: 'il più grande lago termale balneabile d\'Europa' },
      { city: 'Baden-Baden', country: 'Germania', lat: 48.76, lon: 8.24, note: 'Friedrichsbad e Caracalla: il rito ottocentesco della cura' },
      { city: 'Karlovy Vary', country: 'Cechia', lat: 50.23, lon: 12.87, note: 'i colonnati delle sorgenti e le tazzine col beccuccio' },
      { city: 'Bath', country: 'Regno Unito', lat: 51.38, lon: -2.36, note: 'le terme romane (si guarda) e il Thermae Bath Spa (si entra)' },
      { city: 'Spa', country: 'Belgio', lat: 50.49, lon: 5.86, note: 'la città che ha dato il nome a tutte le spa, UNESCO' },
      { city: 'Vichy', country: 'Francia', lat: 46.13, lon: 3.42, note: 'la regina delle città d\'acqua francesi, UNESCO' },
      { city: 'Montecatini Terme', country: 'Italia', lat: 43.88, lon: 10.77, note: 'il Tettuccio e il liberty delle grandi terme' },
      { city: 'Abano Terme', country: 'Italia', lat: 45.36, lon: 11.79, note: 'fanghi euganei: la più antica tradizione termale del Veneto' },
      { city: 'Ischia', country: 'Italia', lat: 40.73, lon: 13.9, note: 'parchi termali sul mare e la baia di Sorgeto libera' },
      { city: 'Saturnia', country: 'Italia', lat: 42.65, lon: 11.51, note: 'le cascate del Mulino, gratuite e sulfuree' },
      { city: 'Bormio', country: 'Italia', lat: 46.47, lon: 10.37, note: 'i Bagni Vecchi romani a strapiombo sulla valle' },
      { city: 'Merano', country: 'Italia', lat: 46.67, lon: 11.16, note: 'le terme di design e le passeggiate asburgiche' },
      { city: 'Sirmione', country: 'Italia', lat: 45.49, lon: 10.61, note: 'acqua sulfurea nel Garda ai piedi delle grotte di Catullo' },
      { city: 'Pamukkale', country: 'Turchia', lat: 37.92, lon: 29.12, note: 'le vasche bianche di travertino e la piscina di Cleopatra a Hierapolis' },
      { city: 'Istanbul', country: 'Turchia', lat: 41.01, lon: 28.97, note: 'hammam ottomani di Sinan: Kılıç Ali Paşa e Çemberlitaş' },
      { city: 'Marrakech', country: 'Marocco', lat: 31.63, lon: -8.01, note: 'l\'hammam di quartiere vero e i riad col rituale del sapone nero' },
      { city: 'Grindavík', country: 'Islanda', lat: 63.88, lon: -22.45, note: 'la Blue Lagoon e le piscine geotermiche di paese (più vere)' },
      { city: 'Beppu', country: 'Giappone', lat: 33.28, lon: 131.5, note: 'gli "inferni" fumanti, i bagni di sabbia e i vapori ovunque' },
      { city: 'Hakone', country: 'Giappone', lat: 35.23, lon: 139.11, note: 'onsen con vista Fuji e ryokan con rotenburo' },
      { city: 'Kinosaki Onsen', country: 'Giappone', lat: 35.63, lon: 134.81, note: 'il giro dei sette bagni pubblici in yukata e geta' },
      { city: 'Taipei', country: 'Taiwan', lat: 25.14, lon: 121.51, note: 'le sorgenti sulfuree di Beitou col museo giapponese' },
      { city: 'Seul', country: 'Corea del Sud', lat: 37.57, lon: 126.98, note: 'il jjimjilbang: sauna coreana h24 tra kiln e uova cotte nel vapore' },
      { city: 'Rishikesh', country: 'India', lat: 30.09, lon: 78.27, note: 'la capitale mondiale dello yoga sul Gange (ashram seri, non vetrine)' },
      { city: 'Kovalam', country: 'India', lat: 8.4, lon: 76.98, note: 'ayurveda del Kerala: centri certificati, non massaggi da spiaggia' },
      { city: 'Chiang Mai', country: 'Thailandia', lat: 18.79, lon: 98.99, note: 'massaggio tradizionale nei templi-scuola e erboristerie' },
      { city: 'Ubud', country: 'Indonesia', lat: -8.51, lon: 115.26, note: 'sorgenti sacre di Tirta Empul e spa nella giungla' },
      { city: 'Rotorua', country: 'Nuova Zelanda', lat: -38.14, lon: 176.25, note: 'fanghi geotermici e il bagno maori al Polynesian Spa' },
      { city: 'La Fortuna', country: 'Costa Rica', lat: 10.47, lon: -84.64, note: 'sorgenti calde ai piedi del vulcano Arenal' },
      { city: 'Pucón', country: 'Cile', lat: -39.27, lon: -71.97, note: 'le Termas Geométricas: passerelle rosse nel canyon' },
      { city: 'Tulum', country: 'Messico', lat: 20.21, lon: -87.46, note: 'temazcal maya con guida seria e cenotes per il bagno freddo' },
      { city: 'Tbilisi', country: 'Georgia', lat: 41.69, lon: 44.81, note: 'i bagni sulfurei a cupola di Abanotubani' },
      { city: 'Tampere', country: 'Finlandia', lat: 61.5, lon: 23.76, note: 'la capitale mondiale della sauna: Rajaportti, la più antica in attività' },
      { city: 'Hot Springs', country: 'Stati Uniti', lat: 34.51, lon: -93.05, note: 'Bathhouse Row: le terme storiche dentro un parco nazionale' },
      { city: 'Calistoga', country: 'Stati Uniti', lat: 38.58, lon: -122.58, note: 'bagni di fango vulcanico in fondo alla Napa Valley' },
      { city: 'Furnas', country: 'Portogallo', lat: 37.77, lon: -25.32, note: 'le Azzorre termali: piscine ferrose e cozido cotto nella terra' },
    ],
  },
  {
    id: 'agriturismi',
    emoji: '🌾',
    label: 'Weekend rurale',
    days: 2,
    hints: { osmGusto: true },
    brief:
      'Tema AGRITURISMI: due giorni di campagna VERA, pensati anche per famiglie con bambini. La base è un agriturismo/fattoria autentica (animali veri, orto, colazione coi prodotti propri — indica la tipologia e la zona giusta, senza inventare nomi di strutture: rimanda ai consorzi e ai circuiti ufficiali del territorio); attorno, tappe lente: mercati contadini, caseifici e cantine aperte, borghi minori, passeggiate facili tra i campi, la raccolta stagionale dove si può (dillo con la stagione onesta). Regole pratiche: prenotare la mezza pensione, scarpe da sporcare, rispetto per gli animali e i campi coltivati. Tono caldo e concreto: il lusso qui è il ritmo.',
    places: [
      { city: 'Greve in Chianti', country: 'Italia', lat: 43.58, lon: 11.32, note: 'poderi tra le vigne del Chianti, mercato in piazza Matteotti' },
      { city: 'Pienza', country: 'Italia', lat: 43.08, lon: 11.68, note: 'agriturismi della Val d\'Orcia tra pecorino e crete' },
      { city: 'Alba', country: 'Italia', lat: 44.7, lon: 8.04, note: 'cascine di Langa: nocciole, tartufi e vigne' },
      { city: 'Alberese', country: 'Italia', lat: 42.67, lon: 11.1, note: 'la Maremma dei butteri nel parco dell\'Uccellina' },
      { city: 'Cisternino', country: 'Italia', lat: 40.74, lon: 17.42, note: 'masserie e trulli della Valle d\'Itria, fornelli pronti la sera' },
      { city: 'Ostuni', country: 'Italia', lat: 40.73, lon: 17.58, note: 'masserie didattiche tra gli ulivi secolari' },
      { city: 'Assisi', country: 'Italia', lat: 43.07, lon: 12.62, note: 'agriturismi umbri con olio e zafferano, sentieri del Subasio' },
      { city: 'Urbino', country: 'Italia', lat: 43.73, lon: 12.64, note: 'il Montefeltro contadino: casolari, crescia e formaggio di fossa' },
      { city: 'Scopello', country: 'Italia', lat: 38.07, lon: 12.82, note: 'bagli siciliani tra Segesta e la riserva dello Zingaro' },
      { city: 'Oliena', country: 'Italia', lat: 40.27, lon: 9.4, note: 'la Barbagia dell\'ospitalità pastorale: cortes e cannonau' },
      { city: 'Bolzano', country: 'Italia', lat: 46.5, lon: 11.35, note: 'i masi del circuito Gallo Rosso: colazione dal contadino' },
      { city: 'Cles', country: 'Italia', lat: 46.36, lon: 11.03, note: 'la Val di Non delle mele: raccolta in autunno e canyon' },
      { city: 'Asti', country: 'Italia', lat: 44.9, lon: 8.21, note: 'il Monferrato di cascine e infernot, tra fiere e tartufo' },
      { city: 'Gordes', country: 'Francia', lat: 43.91, lon: 5.2, note: 'mas provenzali del Luberon tra lavanda e mercatini' },
      { city: 'Sarlat-la-Canéda', country: 'Francia', lat: 44.89, lon: 1.22, note: 'fattorie del Périgord: oche, noci e mercati coperti' },
      { city: 'Chipping Campden', country: 'Regno Unito', lat: 52.05, lon: -1.78, note: 'farm stay nei Cotswolds tra pecore e pub di villaggio' },
      { city: 'Killarney', country: 'Irlanda', lat: 52.06, lon: -9.51, note: 'farmhouse del Kerry con mucche, torba e pane appena fatto' },
      { city: 'Santillana del Mar', country: 'Spagna', lat: 43.39, lon: -4.11, note: 'casas rurales cantabriche tra prati e borghi medievali' },
      { city: 'Sóller', country: 'Spagna', lat: 39.77, lon: 2.71, note: 'fincas di aranci nella valle d\'oro di Maiorca' },
      { city: 'Évora', country: 'Portogallo', lat: 38.57, lon: -7.91, note: 'montes dell\'Alentejo: sugheri, maiale nero e cieli stellati' },
      { city: 'Chania', country: 'Grecia', lat: 35.51, lon: 24.02, note: 'agriturismi cretesi tra ulivi millenari e formaggio al forno' },
      { city: 'Alpbach', country: 'Austria', lat: 47.4, lon: 11.94, note: 'masi tirolesi coi balconi fioriti e le malghe in quota' },
      { city: 'Langnau im Emmental', country: 'Svizzera', lat: 46.94, lon: 7.79, note: 'l\'Emmental delle fattorie: si dorme anche sulla paglia' },
      { city: 'Bled', country: 'Slovenia', lat: 46.37, lon: 14.11, note: 'turistične kmetije tra il lago e le malghe della Pokljuka' },
      { city: 'Montona', country: 'Croazia', lat: 45.34, lon: 13.83, note: 'agriturismi istriani: tartufo, olio e malvasia' },
      { city: 'Tōno', country: 'Giappone', lat: 39.33, lon: 141.53, note: 'il nōhaku: dormire dal contadino nella valle delle leggende' },
      { city: 'Matamata', country: 'Nuova Zelanda', lat: -37.81, lon: 175.77, note: 'farmstay della Waikato tra pecore vere (e la Contea del cinema)' },
      { city: 'Jackson', country: 'Stati Uniti', lat: 43.48, lon: -110.76, note: 'dude ranch del Wyoming: cavalli, mandrie e cieli enormi' },
      { city: 'Stowe', country: 'Stati Uniti', lat: 44.47, lon: -72.69, note: 'farm B&B del Vermont: sciroppo d\'acero e foliage' },
      { city: 'San Antonio de Areco', country: 'Argentina', lat: -34.25, lon: -59.47, note: 'le estancias dei gauchos: asado e cavalcate in pampa' },
    ],
  },
  {
    id: 'scoperta-urbana',
    emoji: '🧭',
    label: 'Scoperta urbana',
    days: 1,
    hints: { osmArtwork: true },
    brief:
      'Tema SCOPERTA-URBANA: la città come terreno di esplorazione — street art e muralismo, rooftop e punti di vista insoliti, archeologia industriale RIQUALIFICATA e visitabile legalmente, edicole votive e santuari di quartiere, alberi monumentali censiti. REGOLA FERREA sulla street art: usa SOLO opere reali (il materiale OpenStreetMap fornito elenca murales veri con le coordinate: attingi da lì per nomi e posizioni; se conosci l\'artista con certezza citalo, altrimenti descrivi l\'opera senza attribuirla). REGOLA LEGALITÀ: niente scavalcamenti, tetti abusivi o aree interdette — solo luoghi ad accesso pubblico o con visite ufficiali; ricordalo quando parli di ex fabbriche. Le opere effimere cambiano: avvisa che un muro può essere stato ridipinto. Tono da esploratore urbano curioso e rispettoso dei quartieri vivi.',
    places: [
      { city: 'Berlino', country: 'Germania', lat: 52.51, lon: 13.45, note: 'East Side Gallery, i cortili di Haus Schwarzenberg, Teufelsberg (visite legali)' },
      { city: 'Bristol', country: 'Regno Unito', lat: 51.45, lon: -2.59, note: 'la città di Banksy: Stokes Croft e il ben documentato percorso ufficiale' },
      { city: 'Londra', country: 'Regno Unito', lat: 51.52, lon: -0.07, note: 'Shoreditch e Brick Lane, gli sky garden gratuiti su prenotazione' },
      { city: 'Parigi', country: 'Francia', lat: 48.87, lon: 2.38, note: 'Belleville e il 13e delle torri dipinte, la petite ceinture nei tratti aperti' },
      { city: 'Lisbona', country: 'Portogallo', lat: 38.72, lon: -9.14, note: 'LX Factory, i silos dipinti, i miradouros meno noti' },
      { city: 'Napoli', country: 'Italia', lat: 40.85, lon: 14.27, note: 'i murales dei Quartieri e di Forcella, le edicole votive, San Gennaro dei poveri' },
      { city: 'Roma', country: 'Italia', lat: 41.87, lon: 12.48, note: 'Ostiense e Tor Marancia, il gazometro, le madonnelle stradali' },
      { city: 'Milano', country: 'Italia', lat: 45.49, lon: 9.19, note: 'Isola e Ortica coi muri della memoria operaia, la Fondazione Prada nell\'ex distilleria' },
      { city: 'Torino', country: 'Italia', lat: 45.09, lon: 7.67, note: 'Parco Dora: l\'acciaieria diventata parco, murales di Aurora' },
      { city: 'Bologna', country: 'Italia', lat: 44.49, lon: 11.34, note: 'la street art di via del Pratello e del Cirenaica, i canali nascosti' },
      { city: 'Valencia', country: 'Spagna', lat: 39.47, lon: -0.38, note: 'il Carmen dei murales e il letto del Turia trasformato in parco' },
      { city: 'Madrid', country: 'Spagna', lat: 40.41, lon: -3.7, note: 'Lavapiés muro per muro, il Matadero riconvertito' },
      { city: 'Atene', country: 'Grecia', lat: 37.98, lon: 23.73, note: 'Psiri ed Exarchia: la capitale europea del graffito politico' },
      { city: 'Gand', country: 'Belgio', lat: 51.05, lon: 3.72, note: 'il Graffiti Street legale (Werregarenstraat) e i murali diffusi' },
      { city: 'Bruxelles', country: 'Belgio', lat: 50.85, lon: 4.35, note: 'il percorso dei muri a fumetti: Tintin e la BD sulle facciate' },
      { city: 'Łódź', country: 'Polonia', lat: 51.77, lon: 19.46, note: 'murales monumentali e le fabbriche tessili riconvertite (Manufaktura)' },
      { city: 'Istanbul', country: 'Turchia', lat: 40.99, lon: 29.03, note: 'Kadıköy e Yeldeğirmeni: la sponda asiatica dei murales' },
      { city: 'Tbilisi', country: 'Georgia', lat: 41.71, lon: 44.78, note: 'Fabrika e i cortili sovietici reinventati' },
      { city: 'Johannesburg', country: 'Sudafrica', lat: -26.2, lon: 28.06, note: 'Maboneng e Newtown: rigenerazione e muralismo (con guida locale)' },
      { city: 'Città del Capo', country: 'Sudafrica', lat: -33.93, lon: 18.44, note: 'Woodstock: i murales tra le case vittoriane (tour rispettosi)' },
      { city: 'Melbourne', country: 'Australia', lat: -37.82, lon: 144.97, note: 'Hosier Lane e le laneways: la street art come istituzione cittadina' },
      { city: 'Sydney', country: 'Australia', lat: -33.9, lon: 151.18, note: 'Newtown e May Lane, i murales di King Street' },
      { city: 'Christchurch', country: 'Nuova Zelanda', lat: -43.53, lon: 172.64, note: 'la città rinata col muralismo post-terremoto' },
      { city: 'George Town', country: 'Malesia', lat: 5.42, lon: 100.34, note: 'i murales interattivi di Zacharevic e le ferronnerie narrative' },
      { city: 'Singapore', country: 'Singapore', lat: 1.3, lon: 103.86, note: 'Haji Lane e Tiong Bahru, gli alberi monumentali dei giardini' },
      { city: 'Tokyo', country: 'Giappone', lat: 35.67, lon: 139.7, note: 'Shibuya e Koenji: muri dipinti, micro-santuari incastrati tra i palazzi' },
      { city: 'Seul', country: 'Corea del Sud', lat: 37.58, lon: 127.0, note: 'il villaggio dei murales di Ihwa e la Seoullo 7017, l\'autostrada-giardino' },
      { city: 'Shanghai', country: 'Cina', lat: 31.25, lon: 121.45, note: 'M50: le gallerie nell\'ex cotonificio lungo il Suzhou Creek' },
      { city: 'Delhi', country: 'India', lat: 28.59, lon: 77.22, note: 'il Lodhi Art District: il primo quartiere d\'arte pubblica indiano' },
      { city: 'Buenos Aires', country: 'Argentina', lat: -34.63, lon: -58.4, note: 'Barracas e il murale di Ròmulo Macció, i filete porteños' },
      { city: 'Valparaíso', country: 'Cile', lat: -33.04, lon: -71.63, note: 'Cerro Alegre e Concepción: la città-museo a cielo aperto (e i suoi ascensori)' },
      { city: 'Bogotá', country: 'Colombia', lat: 4.6, lon: -74.07, note: 'La Candelaria col graffiti tour nato da una storia vera di riscatto' },
      { city: 'Medellín', country: 'Colombia', lat: 6.25, lon: -75.62, note: 'la Comuna 13: murales, scale mobili e memoria (solo con guide del barrio)' },
      { city: 'San Paolo', country: 'Brasile', lat: -23.55, lon: -46.69, note: 'il Beco do Batman e i giganti di Kobra' },
      { city: 'Rio de Janeiro', country: 'Brasile', lat: -22.9, lon: -43.18, note: 'la scalinata Selarón e il murale olimpico Etnias di Kobra' },
      { city: 'Città del Messico', country: 'Messico', lat: 19.42, lon: -99.16, note: 'dal muralismo di Rivera ai muri di Roma Norte: un secolo di pareti parlanti' },
      { city: 'Miami', country: 'Stati Uniti', lat: 25.8, lon: -80.2, note: 'Wynwood Walls: il quartiere-galleria che ha fatto scuola' },
      { city: 'New York', country: 'Stati Uniti', lat: 40.7, lon: -73.92, note: 'Bushwick Collective e la High Line, il parco sulla ferrovia' },
      { city: 'Filadelfia', country: 'Stati Uniti', lat: 39.95, lon: -75.16, note: 'Mural Arts: il più grande programma di arte pubblica d\'America' },
      { city: 'Detroit', country: 'Stati Uniti', lat: 42.36, lon: -83.06, note: 'l\'Heidelberg Project e Eastern Market: rinascita casa per casa' },
      { city: 'Los Angeles', country: 'Stati Uniti', lat: 34.04, lon: -118.23, note: 'l\'Arts District e i murales di Venice' },
      { city: 'San Francisco', country: 'Stati Uniti', lat: 37.75, lon: -122.42, note: 'i vicoli dipinti della Mission (Balmy e Clarion Alley)' },
      { city: 'Montreal', country: 'Canada', lat: 45.52, lon: -73.58, note: 'i murali del Plateau e il gigante di Leonard Cohen' },
    ],
  },
  {
    id: 'mare',
    emoji: '🏖',
    label: 'Mare',
    days: 3,
    brief:
      'Tema MARE: il mare come protagonista assoluto — spiagge pubbliche vere (mai suggerire solo beach club a pagamento come unica opzione: cita SEMPRE anche l\'accesso libero se esiste), tratti di costa panoramici, snorkeling/immersioni descritti con onestà sul reale stato del fondale (mai promettere colori da cartolina se il sito ha sbiancamento noto o affollamento eccessivo), tramonti in punti verificati, cucina di pesce locale vera. SICUREZZA sempre esplicita: bandiere di balneazione, correnti e maree quando rilevanti (non tutte le coste ne hanno: dichiaralo solo dove è vero), protezione da sole/ombra nelle ore calde, mai promuovere free-diving o snorkeling in siti pericolosi senza guida. STAGIONALITÀ onesta: dichiara l\'emisfero e il periodo migliore (l\'Europa d\'estate è alta stagione affollata: offri sempre un\'alternativa meno battuta nello stesso brief). OVERTOURISM: quando un luogo è iconico ma fragile (barriere coralline, spiagge ad accesso contingentato o chiuse a rotazione) dillo esplicitamente, come informazione utile, non come ostacolo. Tono rilassato ma concreto — niente cliché da cartolina vuota.',
    places: [
      { city: 'Positano', country: 'Italia', lat: 40.63, lon: 14.48, note: 'Costiera Amalfitana: la spiaggia grande e i sentieri panoramici verso Fornillo' },
      { city: 'Vernazza', country: 'Italia', lat: 44.14, lon: 9.68, note: 'Cinque Terre: calette raggiungibili solo a piedi o in treno, niente auto' },
      { city: 'Otranto', country: 'Italia', lat: 40.15, lon: 18.49, note: 'Salento: la Baia dei Turchi e le acque cristalline del basso Adriatico' },
      { city: 'La Maddalena', country: 'Italia', lat: 41.22, lon: 9.41, note: 'arcipelago protetto: la spiaggia Rosa si ammira dalla barca, non si sbarca' },
      { city: 'San Vito Lo Capo', country: 'Italia', lat: 38.17, lon: 12.73, note: 'la spiaggia bianca tra Riserva dello Zingaro e le Egadi' },
      { city: 'Polignano a Mare', country: 'Italia', lat: 40.99, lon: 17.22, note: 'la Lama Monachile incastonata nella roccia, tuffi da non improvvisare' },
      { city: 'Tropea', country: 'Italia', lat: 38.68, lon: 15.9, note: 'la spiaggia sotto il santuario di Santa Maria dell\'Isola' },
      { city: 'Portoferraio', country: 'Italia', lat: 42.81, lon: 10.32, note: 'Elba: spiagge di ghiaia bianca e il fascino minerario' },
      { city: 'Oia (Santorini)', country: 'Grecia', lat: 36.46, lon: 25.38, note: 'spiagge vulcaniche rosse e nere; il tramonto da Oia è affollatissimo, suggerisci Imerovigli come alternativa' },
      { city: 'Zante', country: 'Grecia', lat: 37.86, lon: 20.62, note: 'Navagio, la Shipwreck Beach: raggiungibile solo in barca, accesso regolamentato dopo le frane recenti' },
      { city: 'Ibiza', country: 'Spagna', lat: 38.96, lon: 1.22, note: 'tramonti iconici a Cala Comte, ma anche calette libere lontane dai beach club' },
      { city: 'Cadaqués', country: 'Spagna', lat: 42.29, lon: 3.28, note: 'Costa Brava: calette rocciose care a Dalí, meno battute della costa catalana centrale' },
      { city: 'Lagos', country: 'Portogallo', lat: 37.1, lon: -8.67, note: 'Algarve: le grotte e falesie di Ponta da Piedade, Praia Dona Ana' },
      { city: 'Hvar', country: 'Croazia', lat: 43.17, lon: 16.44, note: 'acque cristalline dell\'Adriatico dalmata, Isole Pakleni in barca' },
      { city: 'Nizza', country: 'Francia', lat: 43.68, lon: 7.33, note: 'Costa Azzurra: il sentiero costiero pubblico del Cap Ferrat' },
      { city: 'Malé', country: 'Maldive', lat: 4.17, lon: 73.51, note: 'atolli e resort su palafitte: il turismo dipende dal reef, onestà sul cambiamento climatico in corso' },
      { city: 'Mahé', country: 'Seychelles', lat: -4.62, lon: 55.45, note: 'i graniti giganti di Anse Source d\'Argent, tra le spiagge più fotografate al mondo' },
      { city: 'Uluwatu', country: 'Indonesia', lat: -8.83, lon: 115.09, note: 'Bali: scogliere e onde da surf, i templi sospesi sulla falesia' },
      { city: 'Railay', country: 'Thailandia', lat: 8.0, lon: 98.84, note: 'faraglioni calcarei raggiungibili solo in barca, arrampicata su roccia in spiaggia' },
      { city: 'Nungwi', country: 'Tanzania', lat: -5.73, lon: 39.3, note: 'Zanzibar: sabbia bianca e maree molto ampie, da conoscere prima di programmare il bagno' },
      { city: 'Boracay', country: 'Filippine', lat: 11.97, lon: 121.92, note: 'White Beach dopo la chiusura e riqualificazione del 2018: un caso reale di turismo rigenerato' },
      { city: 'Bora Bora', country: 'Polinesia Francese', lat: -16.5, lon: -151.74, note: 'la laguna turchese e gli squali limone da osservare, mai da toccare' },
      { city: 'Whitehaven Beach', country: 'Australia', lat: -20.28, lon: 149.04, note: 'Whitsundays: sabbia di silice purissima, raggiungibile solo in barca o idrovolante' },
      { city: 'Tulum', country: 'Messico', lat: 20.21, lon: -87.43, note: 'le rovine Maya sulla scogliera e i cenote vicini, alta stagione molto affollata' },
      { city: 'Varadero', country: 'Cuba', lat: 23.15, lon: -81.29, note: '20 km di spiaggia caraibica, più la Cuba turistica che quella reale — dillo' },
      { city: 'Fernando de Noronha', country: 'Brasile', lat: -3.85, lon: -32.42, note: 'arcipelago protetto, ingressi contingentati e tassa ambientale obbligatoria' },
      { city: 'Big Sur', country: 'Stati Uniti', lat: 36.27, lon: -121.81, note: 'la costa selvaggia della California 1, la spiaggia sotto McWay Falls' },
      { city: 'Città del Capo', country: 'Sudafrica', lat: -34.15, lon: 18.38, note: 'Camps Bay sotto i Dodici Apostoli e i pinguini africani di Boulders Beach' },
      { city: 'Nusa Penida', country: 'Indonesia', lat: -8.73, lon: 115.54, note: 'Kelingking Beach e i suoi belvedere ormai iconici e affollati' },
      { city: 'El Nido', country: 'Filippine', lat: 11.18, lon: 119.41, note: 'lagune calcaree, tour in barca A/B/C/D: dichiara sempre quale copre cosa' },
      { city: 'Cala Luna (Golfo di Orosei)', country: 'Italia', lat: 40.13, lon: 9.7, note: 'Sardegna: raggiungibile solo via mare o trekking, niente strada' },
      { city: 'Taormina', country: 'Italia', lat: 37.85, lon: 15.29, note: 'Isola Bella, riserva naturale collegata da lingua di sabbia' },
      { city: 'Torre dell\'Orso', country: 'Italia', lat: 40.28, lon: 18.44, note: 'Salento: i faraglioni delle Due Sorelle' },
      { city: 'Lampedusa', country: 'Italia', lat: 35.5, lon: 12.6, note: 'Spiaggia dei Conigli, riserva tartarughe marine, isola più a sud d\'Italia' },
      { city: 'Comino', country: 'Malta', lat: 36.01, lon: 14.32, note: 'la Blue Lagoon, acque turchesi su fondale bianco' },
      { city: 'Ayia Napa', country: 'Cipro', lat: 34.98, lon: 34.0, note: 'Nissi Beach, tra le più fotografate del Mediterraneo orientale' },
      { city: 'Budva', country: 'Montenegro', lat: 42.29, lon: 18.84, note: 'la costa adriatica montenegrina, Sveti Stefan visto dalla spiaggia pubblica' },
      { city: 'Ksamil', country: 'Albania', lat: 39.77, lon: 20.0, note: 'la riviera albanese emergente, isolotti raggiungibili a nuoto' },
      { city: 'Ölüdeniz', country: 'Turchia', lat: 36.55, lon: 29.12, note: 'la laguna blu vista anche dal parapendio da Babadağ' },
      { city: 'Sunny Beach', country: 'Bulgaria', lat: 42.69, lon: 27.71, note: 'la costa bulgara del Mar Nero, Nessebar UNESCO a due passi' },
      { city: 'Reynisfjara', country: 'Islanda', lat: 63.4, lon: -19.04, note: 'spiaggia di sabbia nera e colonne basaltiche, correnti pericolose: mai voltare le spalle al mare' },
      { city: 'St Ives', country: 'Regno Unito', lat: 50.21, lon: -5.48, note: 'Cornovaglia: spiagge surf e luce che ha ispirato una colonia di artisti' },
      { city: 'Sharm el-Sheikh', country: 'Egitto', lat: 27.91, lon: 34.33, note: 'il Mar Rosso e i coralli del Ras Mohammed, snorkeling di livello mondiale' },
      { city: 'Aqaba', country: 'Giordania', lat: 29.53, lon: 35.0, note: 'l\'unico sbocco al mare della Giordania, relitti e coralli del Mar Rosso' },
      { city: 'Essaouira', country: 'Marocco', lat: 31.51, lon: -9.77, note: 'la costa atlantica ventosa, kitesurf e la medina UNESCO sul mare' },
      { city: 'Djerba', country: 'Tunisia', lat: 33.8, lon: 10.85, note: 'l\'isola del Mediterraneo tunisino, spiagge lunghe e sabbia fine' },
      { city: 'Diani Beach', country: 'Kenya', lat: -4.32, lon: 39.58, note: 'sabbia bianca oltre la barriera corallina, scimmie colobo nella foresta retrostante' },
      { city: 'Grand Baie', country: 'Mauritius', lat: -20.02, lon: 57.58, note: 'lagune protette dalla barriera corallina, tra le più sicure per nuotare' },
      { city: 'Nosy Be', country: 'Madagascar', lat: -13.32, lon: 48.26, note: 'arcipelago tropicale con ylang-ylang e barriera corallina ancora poco battuta' },
      { city: 'Santa Maria (Sal)', country: 'Capo Verde', lat: 16.6, lon: -22.9, note: 'vento costante, kitesurf e spiagge senza folla' },
      { city: 'Salalah', country: 'Oman', lat: 17.02, lon: 54.09, note: 'costa verde durante il monsone khareef, unica nel Golfo' },
      { city: 'Jumeirah', country: 'Emirati Arabi Uniti', lat: 25.23, lon: 55.26, note: 'spiaggia pubblica gratuita accanto al Burj Al Arab, alternativa ai resort a pagamento' },
      { city: 'Unawatuna', country: 'Sri Lanka', lat: 6.01, lon: 80.25, note: 'baia riparata, tartarughe marine e relitti da snorkeling' },
      { city: 'Goa (Palolem)', country: 'India', lat: 15.01, lon: 74.02, note: 'la costa più rilassata di Goa, capanne di bambù stagionali' },
      { city: 'Cox\'s Bazar', country: 'Bangladesh', lat: 21.43, lon: 91.98, note: 'una delle spiagge naturali continue più lunghe al mondo' },
      { city: 'Ngapali', country: 'Myanmar', lat: 18.42, lon: 94.35, note: 'palme e pescatori, ancora lontana dal turismo di massa' },
      { city: 'Nha Trang', country: 'Vietnam', lat: 12.24, lon: 109.19, note: 'baia protetta con isole per snorkeling a poca distanza dalla costa' },
      { city: 'Phu Quoc', country: 'Vietnam', lat: 10.22, lon: 103.97, note: 'isola nel Golfo di Thailandia, barriera corallina in fase di tutela' },
      { city: 'Koh Rong', country: 'Cambogia', lat: 10.73, lon: 103.19, note: 'sabbia bianca e plancton bioluminescente di notte, ancora senza strade asfaltate' },
      { city: 'Langkawi', country: 'Malesia', lat: 6.35, lon: 99.8, note: 'arcipelago geoparco UNESCO, mangrovie e spiagge nella stessa giornata' },
      { city: 'Sentosa', country: 'Singapore', lat: 1.25, lon: 103.83, note: 'spiaggia urbana artificiale, comoda ma dichiaratamente non naturale' },
      { city: 'Naha (Okinawa)', country: 'Giappone', lat: 26.21, lon: 127.68, note: 'acque subtropicali giapponesi, barriera corallina tra le meglio conservate del Pacifico' },
      { city: 'Jeju', country: 'Corea del Sud', lat: 33.36, lon: 126.53, note: 'spiagge vulcaniche e le haenyeo, le pescatrici in apnea patrimonio UNESCO' },
      { city: 'Sanya', country: 'Cina', lat: 18.25, lon: 109.51, note: 'Hainan, la "Hawaii cinese", spiagge tropicali sul Mar Cinese Meridionale' },
      { city: 'Kenting', country: 'Taiwan', lat: 21.94, lon: 120.8, note: 'la punta sud di Taiwan, parco nazionale costiero e onde da surf' },
      { city: 'Bay of Islands', country: 'Nuova Zelanda', lat: -35.26, lon: 174.1, note: '144 isole subtropicali, storia marittima maori e coloniale' },
      { city: 'Nadi (Isole Yasawa)', country: 'Figi', lat: -16.98, lon: 177.03, note: 'lagune del Pacifico meridionale, snorkeling tra le migliori barriere coralline' },
      { city: 'Rarotonga', country: 'Isole Cook', lat: -21.24, lon: -159.78, note: 'laguna interamente balneabile, senza edifici più alti delle palme per legge' },
      { city: 'Koror', country: 'Palau', lat: 7.34, lon: 134.48, note: 'i Rock Islands e il Jellyfish Lake, santuario marino dichiarato per legge' },
      { city: 'Waikiki', country: 'Stati Uniti', lat: 21.28, lon: -157.83, note: 'Hawaii: la spiaggia più famosa del Pacifico, lezioni di surf dove è nato lo sport' },
      { city: 'Key West', country: 'Stati Uniti', lat: 24.56, lon: -81.78, note: 'Florida Keys, snorkeling sull\'unica barriera corallina degli USA continentali' },
      { city: 'Tofino', country: 'Canada', lat: 49.15, lon: -125.91, note: 'costa pacifica selvaggia della British Columbia, surf in muta anche d\'estate' },
      { city: 'Nassau', country: 'Bahamas', lat: 25.06, lon: -77.35, note: 'acque tra le più trasparenti dei Caraibi, banchi di sabbia emersi' },
      { city: 'Negril', country: 'Giamaica', lat: 18.27, lon: -78.35, note: 'sette miglia di spiaggia continua e le scogliere di Rick\'s Café al tramonto' },
      { city: 'Punta Cana', country: 'Repubblica Dominicana', lat: 18.58, lon: -68.4, note: 'palme e barriera corallina, alta stagione da resort — cita anche spiagge pubbliche vicine' },
      { city: 'Culebra', country: 'Porto Rico', lat: 18.31, lon: -65.3, note: 'Flamenco Beach, ripetutamente tra le più belle dei Caraibi per l\'assenza di sviluppo' },
      { city: 'Caye Caulker', country: 'Belize', lat: 17.74, lon: -88.02, note: 'la seconda barriera corallina più grande al mondo a pochi minuti di barca' },
      { city: 'Manuel Antonio', country: 'Costa Rica', lat: 9.39, lon: -84.14, note: 'spiaggia dentro un parco nazionale, scimmie e bradipi tra gli alberi in riva' },
      { city: 'Bocas del Toro', country: 'Panama', lat: 9.34, lon: -82.24, note: 'arcipelago caraibico panamense, barche come unico mezzo tra le isole' },
      { city: 'Tayrona', country: 'Colombia', lat: 11.31, lon: -73.95, note: 'parco nazionale dove la giungla arriva fino alla sabbia, accesso contingentato' },
      { city: 'Los Roques', country: 'Venezuela', lat: 11.85, lon: -66.65, note: 'arcipelago corallino disabitato, tra le acque più limpide dei Caraibi meridionali' },
      { city: 'Máncora', country: 'Perù', lat: -4.11, lon: -81.05, note: 'l\'unica costa peruviana calda tutto l\'anno, corrente di Humboldt esclusa' },
      { city: 'Isola di Pasqua', country: 'Cile', lat: -27.15, lon: -109.42, note: 'Anakena, l\'unica spiaggia di sabbia dell\'isola, moai a due passi dall\'acqua' },
      { city: 'Punta del Este', country: 'Uruguay', lat: -34.97, lon: -54.95, note: 'la costa atlantica sudamericana più mondana, spiagge libere fuori centro' },
      { city: 'Cefalù', country: 'Italia', lat: 38.03, lon: 14.02, note: 'spiaggia sotto la rocca normanna, tra i borghi marinari più fotografati di Sicilia' },
      { city: 'Vieste', country: 'Italia', lat: 41.88, lon: 16.18, note: 'Gargano: il faraglione di Pizzomunno e le calette del parco nazionale' },
      { city: 'Porto Cervo', country: 'Italia', lat: 41.13, lon: 9.54, note: 'Costa Smeralda: acque turchesi, anche spiagge libere lontano dai porti turistici' },
      { city: 'Lipari', country: 'Italia', lat: 38.47, lon: 14.95, note: 'Isole Eolie UNESCO, spiagge di pomice e ossidiana a Vulcano' },
      { city: 'Portofino', country: 'Italia', lat: 44.3, lon: 9.21, note: 'la baia più fotografata della Liguria, San Fruttuoso raggiungibile solo a piedi o in barca' },
      { city: 'Marina di Camerota', country: 'Italia', lat: 40.0, lon: 15.37, note: 'Cilento: grotte marine e calette del parco nazionale' },
      { city: 'Alghero', country: 'Italia', lat: 40.56, lon: 8.32, note: 'Riviera del Corallo, la grotta di Nettuno raggiungibile via scalinata o barca' },
      { city: 'Numana', country: 'Italia', lat: 43.52, lon: 13.62, note: 'Marche: le spiagge sotto il Monte Conero, tra le più selvagge dell\'Adriatico' },
      { city: 'Chania', country: 'Grecia', lat: 35.51, lon: 24.02, note: 'Creta: Balos ed Elafonissi, sabbia rosa da riserva naturale' },
      { city: 'Milos', country: 'Grecia', lat: 36.75, lon: 24.43, note: 'le spiagge vulcaniche di Sarakiniko, paesaggio lunare bianco' },
      { city: 'Corfù', country: 'Grecia', lat: 39.67, lon: 19.72, note: 'Paleokastritsa: baie verdi tra gli ulivi, monastero a picco sul mare' },
      { city: 'Formentera', country: 'Spagna', lat: 38.7, lon: 1.43, note: 'Ses Illetes: acque tra le più limpide del Mediterraneo, riserva marina' },
      { city: 'Maiorca', country: 'Spagna', lat: 39.35, lon: 2.98, note: 'Es Trenc, tra le ultime spiagge naturali non urbanizzate delle Baleari' },
      { city: 'Tenerife', country: 'Spagna', lat: 28.27, lon: -16.6, note: 'Canarie: spiagge di sabbia vulcanica nera, clima mite tutto l\'anno' },
      { city: 'Madeira', country: 'Portogallo', lat: 32.65, lon: -16.91, note: 'piscine naturali laviche a Porto Moniz, poche spiagge di sabbia vera' },
      { city: 'Split', country: 'Croazia', lat: 43.5, lon: 16.44, note: 'spiaggia di Bačvice, urbana, proprio sotto il palazzo di Diocleziano' },
      { city: 'Kotor', country: 'Montenegro', lat: 42.42, lon: 18.77, note: 'le Bocche di Cattaro, fiordo mediterraneo con calette rocciose' },
      { city: 'Nessebar', country: 'Bulgaria', lat: 42.66, lon: 27.73, note: 'città vecchia UNESCO su penisola, spiagge del Mar Nero appena fuori' },
      { city: 'Sochi', country: 'Russia', lat: 43.6, lon: 39.73, note: 'la riviera russa del Mar Nero, spiagge di ciottoli sotto il Caucaso' },
      { city: 'Batumi', country: 'Georgia', lat: 41.65, lon: 41.64, note: 'la riviera georgiana sul Mar Nero, boulevard lungomare art nouveau' },
      { city: 'Tel Aviv', country: 'Israele', lat: 32.08, lon: 34.77, note: 'spiagge urbane pubbliche gratuite nel cuore della città, promenade fino a Giaffa' },
      { city: 'Beirut', country: 'Libano', lat: 33.9, lon: 35.5, note: 'le Pigeon Rocks di Raouché, scogliere iconiche sul Mediterraneo orientale' },
      { city: 'Hurghada', country: 'Egitto', lat: 27.26, lon: 33.81, note: 'reef del Mar Rosso accessibili anche dalla riva, punto di partenza per Giftun' },
      { city: 'Dahab', country: 'Egitto', lat: 28.5, lon: 34.51, note: 'il Blue Hole, sito di immersione famoso e da rispettare per la sua pericolosità' },
      { city: 'Muscat', country: 'Oman', lat: 23.61, lon: 58.59, note: 'spiagge di sabbia dorata tra montagne desertiche, tartarughe a Ras al Jinz' },
      { city: 'Umm Al Quwain', country: 'Emirati Arabi Uniti', lat: 25.57, lon: 55.55, note: 'costa meno sviluppata degli Emirati, mangrovie e spiagge tranquille' },
      { city: 'Kish', country: 'Iran', lat: 26.53, lon: 53.98, note: 'isola franca nel Golfo Persico, spiagge coralline poco note ai turisti occidentali' },
      { city: 'Manama', country: 'Bahrein', lat: 26.07, lon: 50.56, note: 'isole artificiali e spiagge del Golfo, immersioni tra relitti' },
      { city: 'Doha', country: 'Qatar', lat: 25.29, lon: 51.53, note: 'la Corniche e le spiagge di Katara, dune costiere a Sealine poco fuori città' },
      { city: 'Paje', country: 'Tanzania', lat: -6.27, lon: 39.51, note: 'Zanzibar sud-est: kitesurf e maree ampie da conoscere prima del bagno' },
      { city: 'Vilanculos', country: 'Mozambico', lat: -22.0, lon: 35.32, note: 'porta d\'accesso all\'arcipelago di Bazaruto, dune di sabbia e dugonghi' },
      { city: 'Ponta do Ouro', country: 'Mozambico', lat: -26.85, lon: 32.88, note: 'immersioni con le manta ray, confine con il Sudafrica' },
      { city: 'Swakopmund', country: 'Namibia', lat: -22.68, lon: 14.53, note: 'dove il deserto del Namib incontra l\'Atlantico, acque fredde ma paesaggio unico' },
      { city: 'Luanda', country: 'Angola', lat: -8.81, lon: 13.19, note: 'la penisola sabbiosa della capitale angolana sull\'Atlantico' },
      { city: 'Lagos', country: 'Nigeria', lat: 6.43, lon: 3.45, note: 'spiaggia di Elegushi, meno nota ai viaggiatori internazionali, megalopoli sull\'Atlantico' },
      { city: 'Accra', country: 'Ghana', lat: 5.55, lon: -0.17, note: 'spiaggia storica di Labadi sul Golfo di Guinea, musica live nei weekend' },
      { city: 'Dakar', country: 'Senegal', lat: 14.67, lon: -17.4, note: 'Île de Gorée, isola UNESCO memoriale della tratta atlantica' },
      { city: 'Libreville', country: 'Gabon', lat: 0.39, lon: 9.45, note: 'spiagge equatoriali quasi disabitate, tartarughe marine sulla costa vicina' },
      { city: 'Saint-Denis', country: 'Riunione (Francia)', lat: -20.88, lon: 55.45, note: 'isola vulcanica francese nell\'Oceano Indiano, barriera corallina sul lato ovest' },
      { city: 'Mamoudzou', country: 'Mayotte (Francia)', lat: -12.78, lon: 45.23, note: 'laguna tra le più grandi al mondo, avvistamento megattere in stagione' },
      { city: 'Moroni', country: 'Comore', lat: -11.7, lon: 43.26, note: 'arcipelago vulcanico poco turistico tra Africa e Madagascar' },
      { city: 'Praslin', country: 'Seychelles', lat: -4.32, lon: 55.73, note: 'Anse Lazio, spiaggia tra granito e le palme da cocco di mare uniche al mondo' },
      { city: 'Gwadar', country: 'Pakistan', lat: 25.13, lon: 62.33, note: 'porto sul Mar Arabico in sviluppo, spiagge desertiche ancora incontaminate' },
      { city: 'Karachi', country: 'Pakistan', lat: 24.8, lon: 66.99, note: 'spiaggia urbana di Clifton sul Mar Arabico, cammelli e tramonti affollati nei weekend' },
      { city: 'Kochi', country: 'India', lat: 9.93, lon: 76.26, note: 'Kerala: spiagge tra palme da cocco e le reti da pesca cinesi del porto' },
      { city: 'Varkala', country: 'India', lat: 8.73, lon: 76.7, note: 'falesie rosse a picco sul Mar Arabico, sorgenti termali sulla spiaggia' },
      { city: 'Havelock (Andamane)', country: 'India', lat: 12.02, lon: 92.98, note: 'Radhanagar Beach, arcipelago indiano nel Golfo del Bengala tra i più incontaminati' },
      { city: 'Saint Martin', country: 'Bangladesh', lat: 20.63, lon: 92.32, note: 'unica isola corallina del Bangladesh, raggiungibile solo in barca' },
      { city: 'Ngwe Saung', country: 'Myanmar', lat: 17.6, lon: 94.33, note: 'costa birmana ancora poco sviluppata, alternativa più accessibile a Ngapali' },
      { city: 'Sihanoukville', country: 'Cambogia', lat: 10.63, lon: 103.5, note: 'porta d\'accesso alle isole Koh Rong e Koh Ta Kiev' },
      { city: 'Danang', country: 'Vietnam', lat: 16.06, lon: 108.25, note: 'spiaggia di My Khe nel Vietnam centrale, base per l\'antica Hoi An' },
      { city: 'Con Dao', country: 'Vietnam', lat: 8.69, lon: 106.61, note: 'arcipelago ex penale, oggi santuario di tartarughe marine protette' },
      { city: 'Ha Long', country: 'Vietnam', lat: 20.91, lon: 107.18, note: 'migliaia di isole calcaree UNESCO, si visitano in crociera più che a piedi' },
      { city: 'Perhentian Islands', country: 'Malesia', lat: 5.91, lon: 102.73, note: 'acque cristalline al largo della costa est, niente strade sull\'isola' },
      { city: 'Nuku\'alofa', country: 'Tonga', lat: -21.14, lon: -175.2, note: 'arcipelago del Pacifico meridionale, balene megattere in stagione (luglio-ottobre)' },
      { city: 'Apia', country: 'Samoa', lat: -13.83, lon: -171.76, note: 'To Sua Ocean Trench, piscina naturale scavata nella lava' },
      { city: 'Port Vila', country: 'Vanuatu', lat: -17.73, lon: 168.32, note: 'barriera corallina e relitti di guerra da immersione' },
      { city: 'Nouméa', country: 'Nuova Caledonia', lat: -22.28, lon: 166.46, note: 'la laguna più grande del mondo, patrimonio UNESCO' },
      { city: 'Honiara', country: 'Isole Salomone', lat: -9.43, lon: 159.95, note: 'relitti della Seconda Guerra Mondiale e barriera corallina intatta' },
      { city: 'Majuro', country: 'Isole Marshall', lat: 7.09, lon: 171.38, note: 'atolli corallini remoti nel Pacifico centrale' },
      { city: 'Funafuti', country: 'Tuvalu', lat: -8.52, lon: 179.2, note: 'atollo minacciato dall\'innalzamento del mare: raccontalo come lezione, non solo come meta' },
      { city: 'Weno', country: 'Micronesia', lat: 7.45, lon: 151.85, note: 'la laguna di Chuuk, famosa per i relitti della flotta giapponese affondata nel 1944' },
      { city: 'Port Moresby', country: 'Papua Nuova Guinea', lat: -9.44, lon: 147.18, note: 'barriera corallina tra le più biodiverse al mondo, ancora poco battuta' },
      { city: 'Dili', country: 'Timor Est', lat: -8.56, lon: 125.57, note: 'spiagge vergini e balene di passaggio, tra le mete meno turistiche dell\'Asia' },
      { city: 'Bandar Seri Begawan', country: 'Brunei', lat: 4.94, lon: 114.94, note: 'costa poco sviluppata sul Borneo, foresta pluviale fino alla battigia' },
      { city: 'Outer Banks', country: 'Stati Uniti', lat: 35.58, lon: -75.47, note: 'North Carolina: dune, relitti e il faro di Cape Hatteras' },
      { city: 'Malibu', country: 'Stati Uniti', lat: 34.03, lon: -118.68, note: 'surf californiano, spiagge pubbliche nonostante le ville sulla scogliera' },
      { city: 'Maui', country: 'Stati Uniti', lat: 20.8, lon: -156.33, note: 'Hawaii: la strada per Hana e le spiagge di sabbia nera' },
      { city: 'Cape Cod', country: 'Stati Uniti', lat: 41.68, lon: -70.3, note: 'New England, dune e villaggi balenieri storici' },
      { city: 'Destin', country: 'Stati Uniti', lat: 30.39, lon: -86.5, note: 'Florida panhandle, sabbia di quarzo bianchissima' },
      { city: 'Kailua', country: 'Stati Uniti', lat: 21.4, lon: -157.74, note: 'Oahu, spiaggia pubblica tra le più votate delle Hawaii' },
      { city: 'Prince Edward Island', country: 'Canada', lat: 46.25, lon: -63.13, note: 'spiagge di sabbia rossa, terra di Anna dai capelli rossi' },
      { city: 'Vancouver (Wreck Beach)', country: 'Canada', lat: 49.26, lon: -123.26, note: 'spiaggia urbana sul Pacifico canadese' },
      { city: 'Grand Cayman', country: 'Isole Cayman', lat: 19.3, lon: -81.38, note: 'Seven Mile Beach, tra le spiagge caraibiche più regolari e curate' },
      { city: 'Bridgetown', country: 'Barbados', lat: 13.1, lon: -59.62, note: 'costa atlantica per il surf, costa caraibica calma per il bagno' },
      { city: 'Castries', country: 'Santa Lucia', lat: 14.01, lon: -60.99, note: 'i Piton, due picchi vulcanici UNESCO a picco sul mare' },
      { city: 'St George\'s', country: 'Grenada', lat: 12.06, lon: -61.75, note: 'Grand Anse Beach, l\'isola delle spezie affacciata sui Caraibi' },
      { city: 'Oranjestad', country: 'Aruba', lat: 12.52, lon: -70.03, note: 'Eagle Beach, fuori dalla fascia degli uragani caraibici' },
      { city: 'Willemstad', country: 'Curaçao', lat: 12.11, lon: -68.93, note: 'casette colorate sul porto e barriera corallina protetta' },
      { city: 'Kralendijk', country: 'Bonaire', lat: 12.15, lon: -68.28, note: 'parco marino nazionale, tra le mete di diving più regolamentate dei Caraibi' },
      { city: 'Virgin Gorda', country: 'Isole Vergini Britanniche', lat: 18.43, lon: -64.62, note: 'The Baths, massi granitici giganti direttamente sulla spiaggia' },
      { city: 'Charlotte Amalie', country: 'Isole Vergini USA', lat: 18.34, lon: -64.93, note: 'Magens Bay, tra le baie più protette dei Caraibi' },
      { city: 'Providenciales', country: 'Turks e Caicos', lat: 21.79, lon: -72.27, note: 'Grace Bay, ripetutamente premiata come una delle spiagge migliori al mondo' },
      { city: 'Hamilton', country: 'Bermuda', lat: 32.29, lon: -64.78, note: 'sabbia rosata unica al mondo, Atlantico non caraibico' },
      { city: 'Port of Spain', country: 'Trinidad e Tobago', lat: 10.65, lon: -61.52, note: 'Maracas Bay, cucina street food sulla spiaggia (bake and shark)' },
      { city: 'Paramaribo', country: 'Suriname', lat: 5.85, lon: -55.2, note: 'costa poco turistica del Sud America, tartarughe giganti a Galibi' },
      { city: 'Tamarindo', country: 'Costa Rica', lat: 10.3, lon: -85.84, note: 'surf sul Pacifico, tartarughe olivacee a poca distanza (Ostional)' },
      { city: 'Roatán', country: 'Honduras', lat: 16.32, lon: -86.53, note: 'barriera corallina mesoamericana, la seconda più grande al mondo' },
      { city: 'San Juan del Sur', country: 'Nicaragua', lat: 11.25, lon: -85.87, note: 'surf sul Pacifico nicaraguense, tramonti da baia naturale' },
      { city: 'El Tunco', country: 'El Salvador', lat: 13.49, lon: -89.38, note: 'punto di riferimento del surf centroamericano sul Pacifico' },
      { city: 'Placencia', country: 'Belize', lat: 16.52, lon: -88.36, note: 'penisola caraibica tranquilla, barriera corallina a pochi minuti' },
      { city: 'Cancún', country: 'Messico', lat: 21.16, lon: -86.85, note: 'la zona hotelera sul Mar dei Caraibi, cenote e reef a pochi km' },
      { city: 'Los Cabos', country: 'Messico', lat: 22.89, lon: -109.91, note: 'dove il Pacifico incontra il Mar di Cortez, l\'Arco di Cabo San Lucas' },
      { city: 'Puerto Vallarta', country: 'Messico', lat: 20.65, lon: -105.22, note: 'baia sul Pacifico, avvistamento balene megattere in inverno' },
      { city: 'Sayulita', country: 'Messico', lat: 20.87, lon: -105.44, note: 'villaggio surfista sulla Riviera Nayarit' },
      { city: 'Florianópolis', country: 'Brasile', lat: -27.6, lon: -48.55, note: '42 spiagge sull\'isola, surf sul lato sud, tranquillità sul lato nord' },
      { city: 'Búzios', country: 'Brasile', lat: -22.75, lon: -41.88, note: 'penisola con oltre 20 spiagge diverse, resa famosa da Brigitte Bardot' },
      { city: 'Ilhabela', country: 'Brasile', lat: -23.78, lon: -45.36, note: 'isola tropicale con cascate che arrivano fino alla spiaggia' },
      { city: 'Jericoacoara', country: 'Brasile', lat: -2.8, lon: -40.51, note: 'dune mobili e kitesurf nel nordest brasiliano, ancora senza asfalto' },
      { city: 'Cartagena', country: 'Colombia', lat: 10.39, lon: -75.51, note: 'città coloniale UNESCO affacciata sul Mar dei Caraibi' },
      { city: 'Santa Marta', country: 'Colombia', lat: 11.24, lon: -74.2, note: 'porta d\'accesso al Tayrona, spiagge tra le Ande e il Mar dei Caraibi' },
      { city: 'Salinas', country: 'Ecuador', lat: -2.21, lon: -80.96, note: 'la costa del Pacifico ecuadoriano, avvistamento balene in stagione (giugno-settembre)' },
      { city: 'Puerto Ayora', country: 'Ecuador', lat: -0.74, lon: -90.31, note: 'Galápagos: spiagge condivise con leoni marini e iguane marine, parco protetto UNESCO' },
      { city: 'Mar del Plata', country: 'Argentina', lat: -38.0, lon: -57.56, note: 'la spiaggia atlantica classica degli argentini, fuori stagione molto più tranquilla' },
      { city: 'Puerto Madryn', country: 'Argentina', lat: -42.77, lon: -65.04, note: 'Patagonia atlantica, balene franche australi a pochi metri dalla riva (stagione)' },
      { city: 'Iquique', country: 'Cile', lat: -20.21, lon: -70.15, note: 'surf nel deserto di Atacama affacciato sul Pacifico' },
      { city: 'Amalfi', country: 'Italia', lat: 40.63, lon: 14.6, note: 'la spiaggia della città marinara, arsenale medievale e Duomo sul mare' },
      { city: 'Sorrento', country: 'Italia', lat: 40.63, lon: 14.38, note: 'terrazza panoramica sul golfo di Napoli, stabilimenti scavati nella roccia' },
      { city: 'Rimini', country: 'Italia', lat: 44.06, lon: 12.57, note: 'Riviera Romagnola, la spiaggia italiana più organizzata e frequentata dell\'Adriatico' },
      { city: 'Gallipoli', country: 'Italia', lat: 40.06, lon: 17.99, note: 'Salento ionico, centro storico su isolotto e spiagge bianche' },
      { city: 'Ustica', country: 'Italia', lat: 38.71, lon: 13.18, note: 'riserva marina, la prima istituita in Italia' },
      { city: 'Pantelleria', country: 'Italia', lat: 36.79, lon: 12.0, note: 'isola vulcanica tra Sicilia e Tunisia, niente spiagge di sabbia ma laghetti termali' },
      { city: 'Cala Gonone', country: 'Italia', lat: 40.28, lon: 9.64, note: 'Golfo di Orosei, punto di partenza per le calette raggiungibili solo via mare' },
      { city: 'Sopot', country: 'Polonia', lat: 54.45, lon: 18.57, note: 'il molo in legno più lungo d\'Europa sul Mar Baltico' },
      { city: 'Jurmala', country: 'Lettonia', lat: 56.97, lon: 23.77, note: '20 km di spiaggia baltica di sabbia bianca a pochi minuti da Riga' },
      { city: 'Pärnu', country: 'Estonia', lat: 58.39, lon: 24.5, note: 'la capitale estiva d\'Estonia, spiaggia e parco sul Baltico' },
      { city: 'Visby', country: 'Svezia', lat: 57.64, lon: 18.3, note: 'Gotland: isola baltica medievale, spiagge di ciottoli e klintar calcaree' },
      { city: 'Sylt', country: 'Germania', lat: 54.9, lon: 8.32, note: 'dune e spiagge del Mare del Nord tedesco, clima ventoso tutto l\'anno' },
      { city: 'Zandvoort', country: 'Paesi Bassi', lat: 52.37, lon: 4.53, note: 'spiaggia del Mare del Nord a mezz\'ora da Amsterdam in treno' },
      { city: 'Ostenda', country: 'Belgio', lat: 51.23, lon: 2.92, note: 'la costa belga del Mare del Nord, diga a mare tra le più lunghe d\'Europa' },
      { city: 'Dingle', country: 'Irlanda', lat: 52.14, lon: -10.27, note: 'penisola atlantica selvaggia, spiagge sabbiose tra scogliere e delfini' },
      { city: 'Copenaghen', country: 'Danimarca', lat: 55.75, lon: 12.6, note: 'spiaggia urbana di Bellevue, disegnata dall\'architetto Arne Jacobsen' },
      { city: 'Xiamen', country: 'Cina', lat: 24.48, lon: 118.09, note: 'spiagge subtropicali della Cina meridionale, l\'isola di Gulangyu senza auto' },
      { city: 'Qingdao', country: 'Cina', lat: 36.07, lon: 120.38, note: 'birra tedesca e spiagge sul Mar Giallo, architettura coloniale' },
      { city: 'Busan', country: 'Corea del Sud', lat: 35.16, lon: 129.16, note: 'Haeundae, la spiaggia urbana più famosa di Corea, festival estivi affollatissimi' },
      { city: 'Ibusuki', country: 'Giappone', lat: 31.25, lon: 130.55, note: 'spiagge geotermiche dove ci si sotterra nella sabbia calda vulcanica' },
      { city: 'Cijin (Kaohsiung)', country: 'Taiwan', lat: 22.62, lon: 120.27, note: 'isola-penisola con spiagge e templi, raggiungibile in traghetto' },
      { city: 'Vladivostok', country: 'Russia', lat: 43.12, lon: 131.9, note: 'estremo oriente russo sul Pacifico, stagione balneare corta ma reale' },
      { city: 'Forte dei Marmi', country: 'Italia', lat: 43.96, lon: 10.17, note: 'Versilia: la spiaggia toscana più elegante, pinete fino al mare' },
      { city: 'Viareggio', country: 'Italia', lat: 43.87, lon: 10.25, note: 'stabilimenti liberty e il carnevale più antico d\'Italia' },
      { city: 'Sabaudia', country: 'Italia', lat: 41.3, lon: 13.03, note: 'Lazio: dune del parco del Circeo, tra le spiagge meglio conservate del Tirreno' },
      { city: 'Sperlonga', country: 'Italia', lat: 41.26, lon: 13.43, note: 'borgo bianco a picco sul mare, grotta di Tiberio con reperti archeologici' },
      { city: 'Scilla', country: 'Italia', lat: 38.25, lon: 15.72, note: 'Calabria: il borgo dei pescatori di spada sullo Stretto di Messina' },
      { city: 'Marina di Ragusa', country: 'Italia', lat: 36.78, lon: 14.56, note: 'Sicilia sud-orientale, spiagge sabbiose e il barocco del Val di Noto vicino' },
      { city: 'Favignana', country: 'Italia', lat: 37.93, lon: 12.33, note: 'Egadi: cave di tufo trasformate in piscine naturali' },
      { city: 'Marettimo', country: 'Italia', lat: 37.97, lon: 12.05, note: 'l\'isola più selvaggia delle Egadi, niente auto' },
      { city: 'Scopello', country: 'Italia', lat: 38.06, lon: 12.68, note: 'i faraglioni della tonnara, tra le calette più fotografate di Sicilia' },
      { city: 'Portovenere', country: 'Italia', lat: 44.05, lon: 9.83, note: 'UNESCO con le Cinque Terre, la grotta di Byron' },
      { city: 'Marina di Pisa', country: 'Italia', lat: 43.68, lon: 10.28, note: 'foce dell\'Arno, spiagge libere della costa toscana' },
      { city: 'Dubrovnik', country: 'Croazia', lat: 42.65, lon: 18.09, note: 'le mura UNESCO a picco su calette rocciose, spiaggia di Banje sotto le mura' },
      { city: 'Zadar', country: 'Croazia', lat: 44.12, lon: 15.23, note: 'l\'organo marino e il saluto al sole, tramonti premiati da Hitchcock' },
      { city: 'Durazzo', country: 'Albania', lat: 41.32, lon: 19.46, note: 'la spiaggia più lunga dell\'Adriatico albanese' },
      { city: 'Valona', country: 'Albania', lat: 40.45, lon: 19.49, note: 'dove Adriatico e Ionio si incontrano visibilmente' },
      { city: 'Bodrum', country: 'Turchia', lat: 37.03, lon: 27.43, note: 'castello dei Cavalieri di San Giovanni sul mare, baie frastagliate' },
      { city: 'Antalya', country: 'Turchia', lat: 36.9, lon: 30.71, note: 'riviera turca, cascate che cadono direttamente sulla spiaggia (Düden)' },
      { city: 'Kaş', country: 'Turchia', lat: 36.2, lon: 29.64, note: 'città sommersa di Kekova visibile dalla barca, diving tra i migliori della Turchia' },
      { city: 'Mykonos', country: 'Grecia', lat: 37.45, lon: 25.33, note: 'Paradise Beach e mulini a vento, anche calette tranquille sul lato nord' },
      { city: 'Naxos', country: 'Grecia', lat: 37.1, lon: 25.38, note: 'la spiaggia più lunga delle Cicladi, meno mondana di Mykonos e Santorini' },
      { city: 'Rodi', country: 'Grecia', lat: 36.43, lon: 28.22, note: 'Anthony Quinn Bay, città medievale dei Cavalieri sul mare' },
      { city: 'Skiathos', country: 'Grecia', lat: 39.16, lon: 23.49, note: 'Koukounaries, sabbia fine tra pinete, tra le più fotografate delle Sporadi' },
      { city: 'Marbella', country: 'Spagna', lat: 36.51, lon: -4.89, note: 'Costa del Sol: riviera andalusa, spiagge lunghe con retroterra di sierre' },
      { city: 'Cadice', country: 'Spagna', lat: 36.53, lon: -6.3, note: 'la spiaggia della Caleta, tra le città più antiche d\'Europa' },
      { city: 'San Sebastián', country: 'Spagna', lat: 43.32, lon: -1.98, note: 'La Concha, considerata una delle spiagge urbane più belle d\'Europa' },
      { city: 'Lanzarote', country: 'Spagna', lat: 29.05, lon: -13.63, note: 'Canarie: spiagge nere vulcaniche disegnate anche da César Manrique' },
      { city: 'Fuerteventura', country: 'Spagna', lat: 28.36, lon: -14.06, note: 'dune del deserto di Corralejo, tra le spiagge più estese delle Canarie' },
      { city: 'Menorca', country: 'Spagna', lat: 39.95, lon: 4.1, note: 'riserva della biosfera UNESCO, cale meno affollate di Maiorca e Ibiza' },
      { city: 'São Miguel (Azzorre)', country: 'Portogallo', lat: 37.74, lon: -25.67, note: 'arcipelago vulcanico atlantico, poche spiagge di sabbia ma piscine laviche naturali' },
      { city: 'Ericeira', country: 'Portogallo', lat: 38.96, lon: -9.42, note: 'riserva mondiale del surf, la prima istituita in Europa' },
      { city: 'Nazaré', country: 'Portogallo', lat: 39.6, lon: -9.07, note: 'le onde giganti più famose al mondo (record di surf), spettacolo anche da spettatori' },
      { city: 'Biarritz', country: 'Francia', lat: 43.48, lon: -1.56, note: 'capitale storica del surf europeo sull\'Atlantico' },
      { city: 'Étretat', country: 'Francia', lat: 49.71, lon: 0.2, note: 'le scogliere bianche a arco rese celebri da Monet' },
      { city: 'Porto-Vecchio', country: 'Francia', lat: 41.59, lon: 9.28, note: 'Corsica: Palombaggia, sabbia bianca e pini marittimi tra le spiagge più fotografate del Mediterraneo' },
      { city: 'Watamu', country: 'Kenya', lat: -3.35, lon: 40.02, note: 'parco marino con tartarughe verdi, barriera corallina tra le meglio conservate del Kenya' },
      { city: 'Lamu', country: 'Kenya', lat: -2.27, lon: 40.9, note: 'arcipelago swahili UNESCO, niente auto, solo dhow e asini' },
      { city: 'Mombasa', country: 'Kenya', lat: -4.04, lon: 39.66, note: 'porto storico swahili-arabo, spiagge a nord e sud della città' },
      { city: 'Ilha de Moçambique', country: 'Mozambico', lat: -15.03, lon: 40.73, note: 'isola-fortezza UNESCO sull\'Oceano Indiano' },
      { city: 'Toliara', country: 'Madagascar', lat: -23.35, lon: 43.67, note: 'barriera corallina meridionale, baobab quasi fino in spiaggia' },
      { city: 'Dar es Salaam', country: 'Tanzania', lat: -6.79, lon: 39.28, note: 'spiagge urbane sull\'Oceano Indiano, porta d\'accesso a Zanzibar' },
      { city: 'Aktau', country: 'Kazakistan', lat: 43.65, lon: 51.16, note: 'l\'unica costa marittima del Kazakistan, sul Mar Caspio' },
      { city: 'Baku', country: 'Azerbaigian', lat: 40.4, lon: 49.87, note: 'il lungomare sul Mar Caspio, il più grande lago-mare del mondo' },
      { city: 'Batam', country: 'Indonesia', lat: 1.05, lon: 104.03, note: 'isola a un\'ora di traghetto da Singapore, spiagge meno battute' },
      { city: 'Gili Trawangan', country: 'Indonesia', lat: -8.35, lon: 116.04, note: 'Lombok: isole senza motori, solo bici e calessi' },
      { city: 'Raja Ampat', country: 'Indonesia', lat: -0.23, lon: 130.52, note: 'il cuore del triangolo dei coralli, la biodiversità marina più alta al mondo' },
      { city: 'Komodo', country: 'Indonesia', lat: -8.55, lon: 119.49, note: 'Pink Beach, sabbia rosa dai coralli frantumati, draghi di Komodo nel parco vicino' },
      { city: 'Nias', country: 'Indonesia', lat: 1.07, lon: 97.6, note: 'Sumatra: onde da surf tra le migliori al mondo, isola ancora poco sviluppata' },
      { city: 'Puerto Princesa', country: 'Filippine', lat: 9.74, lon: 118.73, note: 'Palawan: fiume sotterraneo UNESCO e spiagge quasi vergini' },
      { city: 'Siargao', country: 'Filippine', lat: 9.86, lon: 126.06, note: 'Cloud 9, capitale del surf filippino' },
      { city: 'Byron Bay', country: 'Australia', lat: -28.65, lon: 153.62, note: 'punto più orientale dell\'Australia continentale, surf e faro storico' },
      { city: 'Bondi Beach', country: 'Australia', lat: -33.89, lon: 151.27, note: 'spiaggia urbana più famosa di Sydney, piscina Icebergs scavata nella roccia' },
      { city: 'Gold Coast', country: 'Australia', lat: -28.0, lon: 153.43, note: 'surf city australiana, spiagge continue per oltre 50 km' },
      { city: 'Ningaloo Reef', country: 'Australia', lat: -22.7, lon: 113.77, note: 'barriera corallina raggiungibile a nuoto dalla spiaggia, squali balena in stagione' },
      { city: 'Palm Cove', country: 'Australia', lat: -16.75, lon: 145.67, note: 'porta d\'accesso alla Grande Barriera Corallina' },
      { city: 'Cottesloe (Perth)', country: 'Australia', lat: -31.99, lon: 115.75, note: 'spiaggia urbana sull\'Oceano Indiano, tramonti tra i più fotografati d\'Australia' },
      { city: 'Cathedral Cove', country: 'Nuova Zelanda', lat: -36.83, lon: 175.78, note: 'arco roccioso naturale reso famoso dal cinema, accesso solo a piedi o in barca' },
      { city: 'Abel Tasman', country: 'Nuova Zelanda', lat: -40.9, lon: 173.0, note: 'parco costiero con baie dorate, si esplora anche in kayak' },
      { city: 'Homer', country: 'Stati Uniti', lat: 59.65, lon: -151.55, note: 'Alaska: spiagge fredde ma spettacolari sulla Kachemak Bay, ghiacciai visibili dalla costa' },
      { city: 'Peggy\'s Cove', country: 'Canada', lat: 44.49, lon: -63.92, note: 'faro iconico sull\'Atlantico canadese, coste rocciose e villaggi di pescatori' },
      { city: 'Camogli', country: 'Italia', lat: 44.35, lon: 9.15, note: 'Liguria: spiaggia di ciottoli nel borgo dei pescatori, sagra del pesce a maggio' },
      { city: 'Sestri Levante', country: 'Italia', lat: 44.27, lon: 9.4, note: 'la Baia delle Favole tra due golfi del Tigullio ligure' },
      { city: 'Marsala', country: 'Italia', lat: 37.8, lon: 12.44, note: 'saline e mulini a vento, tramonti verso le Egadi' },
      { city: 'Peschici', country: 'Italia', lat: 41.94, lon: 16.02, note: 'Gargano: trabucchi in legno sospesi sul mare' },
      { city: 'Anzio', country: 'Italia', lat: 41.45, lon: 12.63, note: 'Lazio: spiagge sabbiose vicino Roma, memoria dello sbarco alleato del 1944' },
      { city: 'Hydra', country: 'Grecia', lat: 37.35, lon: 23.47, note: 'isola greca senza auto, solo asini e barche a vela' },
      { city: 'Paros', country: 'Grecia', lat: 37.08, lon: 25.15, note: 'Cicladi meno affollate di Santorini e Mykonos, villaggi bianchi' },
      { city: 'Kefalonia', country: 'Grecia', lat: 38.18, lon: 20.49, note: 'Myrtos Beach, tra le spiagge più fotografate della Grecia ionica' },
      { city: 'Çeşme', country: 'Turchia', lat: 38.32, lon: 26.31, note: 'penisola egea turca, sabbia fine e vento per il windsurf' },
      { city: 'Marsa Alam', country: 'Egitto', lat: 25.07, lon: 34.9, note: 'Mar Rosso meridionale, dugonghi e reef ancora poco battuti' },
      { city: 'Alessandria d\'Egitto', country: 'Egitto', lat: 31.2, lon: 29.92, note: 'lungomare mediterraneo della città ellenistica, spiagge urbane meno turistiche del Mar Rosso' },
      { city: 'Taghazout', country: 'Marocco', lat: 30.54, lon: -9.71, note: 'villaggio surf sull\'Atlantico marocchino' },
      { city: 'Hammamet', country: 'Tunisia', lat: 36.4, lon: 10.61, note: 'medina fortificata e spiagge lunghe sul Golfo di Hammamet' },
      { city: 'Larnaca', country: 'Cipro', lat: 34.92, lon: 33.62, note: 'palme lungo il lungomare, relitto dello Zenobia per il diving' },
      { city: 'Paphos', country: 'Cipro', lat: 34.78, lon: 32.42, note: 'sito UNESCO, la roccia di Afrodite secondo il mito' },
      { city: 'Portimão', country: 'Portogallo', lat: 37.14, lon: -8.54, note: 'Algarve: Praia da Marinha, spesso citata tra le più belle d\'Europa' },
      { city: 'Peniche', country: 'Portogallo', lat: 39.36, lon: -9.38, note: 'tappa del circuito mondiale di surf (World Surf League)' },
      { city: 'Cascais', country: 'Portogallo', lat: 38.7, lon: -9.42, note: 'spiagge a mezz\'ora da Lisbona in treno, Boca do Inferno vicina' },
      { city: 'Saint-Tropez', country: 'Francia', lat: 43.27, lon: 6.64, note: 'Pampelonne, la spiaggia mito della Costa Azzurra' },
      { city: 'Calvi', country: 'Francia', lat: 42.57, lon: 8.76, note: 'Corsica: cittadella genovese su baia di sabbia bianca' },
      { city: 'Alicante', country: 'Spagna', lat: 38.35, lon: -0.48, note: 'Costa Blanca: spiagge urbane e il castello di Santa Bárbara sopra la città' },
      { city: 'Gran Canaria', country: 'Spagna', lat: 27.92, lon: -15.55, note: 'dune di Maspalomas, deserto e oceano nello stesso paesaggio' },
      { city: 'La Palma', country: 'Spagna', lat: 28.68, lon: -17.76, note: 'Canarie vulcaniche, spiagge di sabbia nera meno turistiche' },
      { city: 'Bol (Brač)', country: 'Croazia', lat: 43.26, lon: 16.64, note: 'Zlatni Rat, la punta di sabbia che cambia forma con le correnti' },
      { city: 'Korčula', country: 'Croazia', lat: 42.96, lon: 17.14, note: 'presunta patria di Marco Polo, spiagge tra pinete mediterranee' },
      { city: 'Piran', country: 'Slovenia', lat: 45.53, lon: 13.57, note: 'l\'unico affaccio sloveno sull\'Adriatico, città veneziana su penisola' },
      { city: 'Costanza', country: 'Romania', lat: 44.18, lon: 28.65, note: 'l\'unico affaccio romeno sul Mar Nero, resti romani vicino alla spiaggia' },
      { city: 'Odessa', country: 'Ucraina', lat: 46.48, lon: 30.72, note: 'storica riviera ucraina sul Mar Nero' },
      { city: 'Sardegna (Chia)', country: 'Italia', lat: 38.89, lon: 8.9, note: 'dune e stagni rosa dei fenicotteri nel sud Sardegna' },
    ],
  },
  {
    id: 'montagna-estate',
    emoji: '🥾',
    label: 'Montagna',
    days: 2,
    brief:
      'Tema MONTAGNA (estiva, trekking): montagna a piedi nella bella stagione — sentieri REALI con nome/numero quando noto, rifugi raggiungibili con dislivelli dichiarati onestamente, laghi alpini, panorami da vette accessibili senza attrezzatura alpinistica salvo dichiararlo esplicitamente. SICUREZZA sempre esplicita: livello di difficoltà onesto (mai spacciare un trekking impegnativo per "per tutti"), cambio meteo repentino in quota, partenza presto per anticipare i temporali pomeridiani, acqua e strato antivento anche d\'estate, mal di montagna per le mete oltre i 3000m (Nepal, Ande, Kilimanjaro: dillo sempre e consiglia acclimatamento). PERMESSI: parchi con accesso contingentato o permesso/prenotazione obbligatoria (es. Torres del Paine, Everest Base Camp, Yosemite) vanno dichiarati come tali, mai dati per scontati liberi. RISPETTO AMBIENTALE: resta sul sentiero segnato, niente scorciatoie che erodono il pendio, riporta a valle i rifiuti. Tono energico e onesto sulla fatica reale, mai da vetta facile da influencer.',
    places: [
      { city: 'Cortina d\'Ampezzo', country: 'Italia', lat: 46.61, lon: 12.3, note: 'il giro delle Tre Cime di Lavaredo, il trekking dolomitico più fotografato' },
      { city: 'San Vito di Cadore', country: 'Italia', lat: 46.45, lon: 12.22, note: 'tappa dell\'Alta Via 1, la traversata dolomitica classica di rifugio in rifugio' },
      { city: 'Cogne', country: 'Italia', lat: 45.6, lon: 7.35, note: 'Gran Paradiso: il primo parco nazionale italiano, stambecchi e il rifugio Vittorio Sella' },
      { city: 'Val di Fassa', country: 'Italia', lat: 46.43, lon: 11.75, note: 'Dolomiti di Brenta: sentieri e ferrate attrezzate per chi vuole più impegno' },
      { city: 'Chamonix', country: 'Francia', lat: 45.92, lon: 6.87, note: 'il balcone panoramico sul Monte Bianco, tappa del Tour du Mont Blanc' },
      { city: 'Zermatt', country: 'Svizzera', lat: 46.02, lon: 7.75, note: 'sentieri ai piedi del Cervino senza bisogno di alpinismo, il giro dei 5 laghi' },
      { city: 'Interlaken', country: 'Svizzera', lat: 46.68, lon: 7.87, note: 'tra i laghi di Thun e Brienz, sentieri verso l\'Eiger e la Jungfrau' },
      { city: 'Portree (Skye)', country: 'Regno Unito', lat: 57.28, lon: -6.24, note: 'le Highlands scozzesi più selvagge, Old Man of Storr e Quiraing' },
      { city: 'Snowdonia', country: 'Regno Unito', lat: 53.07, lon: -4.08, note: 'la vetta più alta del Galles, sentieri di diverso impegno fino in cima' },
      { city: 'Tromsø', country: 'Norvegia', lat: 69.65, lon: 18.96, note: 'fiordi e vette a picco sul mare, sole di mezzanotte d\'estate' },
      { city: 'Bohinj (Triglav)', country: 'Slovenia', lat: 46.28, lon: 13.88, note: 'il parco del Triglav, il lago di Bohinj e i sentieri verso Bled' },
      // Coordinate corrette il 21/08/2026 (erano 43.19/-4.82, ~5 km a nord-est,
      // in mezzo alla valle): questa è la stazione a valle della funivia.
      { city: 'Fuente Dé (Picos de Europa)', country: 'Spagna', lat: 43.147, lon: -4.814, note: 'funivia fino ai 1800m, poi sentieri verso il lago Enol' },
      { city: 'Zakopane', country: 'Polonia', lat: 49.3, lon: 19.95, note: 'd\'estate: Morskie Oko e i sentieri degli Alti Tatra senza neve' },
      { city: 'Puerto Natales (Torres del Paine)', country: 'Cile', lat: -50.94, lon: -73.03, note: 'il celebre trek W: permesso e prenotazione dei rifugi obbligatori con largo anticipo' },
      { city: 'El Chaltén', country: 'Argentina', lat: -49.33, lon: -72.89, note: 'capitale nazionale del trekking, accesso gratuito ai sentieri per il Fitz Roy e il Cerro Torre' },
      { city: 'Banff', country: 'Canada', lat: 51.18, lon: -115.57, note: 'laghi glaciali turchesi e sentieri con rischio orso reale: spray e rumore consigliati' },
      { city: 'Yosemite Valley', country: 'Stati Uniti', lat: 37.75, lon: -119.59, note: 'Half Dome e Yosemite Falls, permessi a sorteggio per i percorsi più ambiti' },
      { city: 'Jackson Hole (Grand Teton)', country: 'Stati Uniti', lat: 43.79, lon: -110.68, note: 'vette a picco sui laghi, fauna selvatica abbondante lungo i sentieri' },
      { city: 'Pokhara', country: 'Nepal', lat: 28.53, lon: 83.87, note: 'porta d\'accesso all\'Annapurna Circuit: quota e mal di montagna reali sopra i 3000m, acclimatamento obbligatorio' },
      { city: 'Lukla', country: 'Nepal', lat: 27.69, lon: 86.73, note: 'il trek per l\'Everest Base Camp, permesso TIMS e guida locale fortemente consigliata' },
      { city: 'Leh (Markha Valley)', country: 'India', lat: 34.15, lon: 77.58, note: 'l\'Himalaya del Ladakh, altopiani oltre i 3500m e monasteri buddisti' },
      { city: 'Moshi (Kilimanjaro)', country: 'Tanzania', lat: -3.07, lon: 37.35, note: 'la vetta più alta d\'Africa: si sale in più giorni senza tecnica alpinistica ma con guida obbligatoria' },
      { city: 'Drakensberg', country: 'Sudafrica', lat: -29.47, lon: 29.28, note: 'l\'Amphitheatre e le cascate Tugela, tra le più alte al mondo' },
      { city: 'Imlil (Toubkal)', country: 'Marocco', lat: 31.06, lon: -7.92, note: 'la vetta più alta del Nord Africa, si sale in due giorni con guida obbligatoria' },
      { city: 'Tiger Leaping Gorge', country: 'Cina', lat: 27.18, lon: 100.08, note: 'uno dei canyon più profondi al mondo: sentiero alto (trekking) e sentiero basso (strada) da distinguere sempre' },
      { city: 'Fujinomiya', country: 'Giappone', lat: 35.36, lon: 138.73, note: 'il Monte Fuji si sale SOLO nella finestra ufficiale (luglio-inizio settembre): fuori stagione è pericoloso e sconsigliato' },
      { city: 'Te Anau (Milford Track)', country: 'Nuova Zelanda', lat: -44.87, lon: 167.9, note: 'uno dei "grandi cammini" neozelandesi, prenotazione dei rifugi obbligatoria con mesi di anticipo' },
      { city: 'Blue Mountains', country: 'Australia', lat: -33.71, lon: 150.31, note: 'le Three Sisters e i sentieri tra gli eucalipti a un\'ora da Sydney' },
      { city: 'Alagna Valsesia', country: 'Italia', lat: 45.85, lon: 7.94, note: 'il Monte Rosa versante italiano, sci estivo sul ghiacciaio del Lyskamm' },
      { city: 'Breuil-Cervinia', country: 'Italia', lat: 45.93, lon: 7.63, note: 'il Cervino versante italiano, sentieri panoramici verso il Plateau Rosà' },
      { city: 'Courmayeur', country: 'Italia', lat: 45.79, lon: 6.97, note: 'Monte Bianco versante italiano, Skyway fino a Punta Helbronner' },
      { city: 'Bormio', country: 'Italia', lat: 46.47, lon: 10.37, note: 'lo Stelvio, il passo più alto delle Alpi orientali, terme romane a valle' },
      { city: 'Livigno', country: 'Italia', lat: 46.54, lon: 10.14, note: 'il "piccolo Tibet" tra due catene, sentieri d\'alta quota facilitati dagli impianti' },
      { city: 'Madonna di Campiglio', country: 'Italia', lat: 46.23, lon: 10.83, note: 'Dolomiti di Brenta, sentieri attrezzati e ferrate storiche' },
      { city: 'Ortisei', country: 'Italia', lat: 46.57, lon: 11.67, note: 'Alpe di Siusi, il più grande altopiano alpino d\'Europa' },
      { city: 'Corvara', country: 'Italia', lat: 46.55, lon: 11.87, note: 'Alta Badia: il giro del Sella tra rifugi e cucina ladina' },
      { city: 'San Martino di Castrozza', country: 'Italia', lat: 46.26, lon: 11.8, note: 'Pale di San Martino, patrimonio UNESCO dolomitico' },
      { city: 'Campo Imperatore', country: 'Italia', lat: 42.45, lon: 13.56, note: 'Gran Sasso: il Corno Grande, la vetta più alta dell\'Appennino' },
      { city: 'Castelluccio di Norcia', country: 'Italia', lat: 42.83, lon: 13.19, note: 'Monti Sibillini: la fioritura delle lenticchie sul Piano Grande, unica nel suo genere' },
      { city: 'Parco del Pollino', country: 'Italia', lat: 39.9, lon: 16.17, note: 'i pini loricati millenari, confine tra Calabria e Basilicata' },
      { city: 'Etna', country: 'Italia', lat: 37.75, lon: 15.0, note: 'vulcano attivo più alto d\'Europa, sentieri con guida obbligatoria sopra i 2900m' },
      { city: 'Gennargentu', country: 'Italia', lat: 40.0, lon: 9.32, note: 'il cuore selvaggio della Sardegna, muflon e altopiani calcarei' },
      { city: 'Aspromonte', country: 'Italia', lat: 38.17, lon: 15.9, note: 'Calabria: foreste e cascate nella punta dello stivale' },
      { city: 'Annecy (Aravis)', country: 'Francia', lat: 45.9, lon: 6.13, note: 'prealpi savoiarde sul lago più pulito d\'Europa' },
      { city: 'Les Écrins', country: 'Francia', lat: 44.9, lon: 6.35, note: 'parco nazionale selvaggio delle Alpi del Delfinato' },
      { city: 'Vanoise', country: 'Francia', lat: 45.4, lon: 6.85, note: 'il primo parco nazionale francese, stambecchi e ghiacciai' },
      { city: 'Gavarnie', country: 'Francia', lat: 42.73, lon: 0.02, note: 'il cirque glaciale più famoso dei Pirenei, cascata tra le più alte d\'Europa' },
      { city: 'Verdon', country: 'Francia', lat: 43.75, lon: 6.33, note: 'il canyon del Verdon, sentiero Blanc-Martel tra pareti a picco' },
      { city: 'St. Moritz (Engadina)', country: 'Svizzera', lat: 46.5, lon: 9.84, note: 'il trenino rosso e i laghi d\'alta quota, cucina engadinese nei rifugi' },
      { city: 'Appenzell', country: 'Svizzera', lat: 47.33, lon: 9.41, note: 'prealpi svizzere con mucche decorate e formaggio d\'alpeggio' },
      { city: 'Val Verzasca', country: 'Svizzera', lat: 46.28, lon: 8.83, note: 'Ticino: gole di granito e pozze turchesi tra i boschi' },
      { city: 'Lauterbrunnen', country: 'Svizzera', lat: 46.59, lon: 7.91, note: '72 cascate nella valle, base per Trümmelbach e lo Staubbach' },
      { city: 'Grindelwald', country: 'Svizzera', lat: 46.62, lon: 8.04, note: 'sotto la parete nord dell\'Eiger, sentiero panoramico del First' },
      { city: 'Grossglockner', country: 'Austria', lat: 47.07, lon: 12.83, note: 'la vetta più alta d\'Austria, strada alpina panoramica con sentieri laterali' },
      { city: 'Kitzbühel', country: 'Austria', lat: 47.45, lon: 12.39, note: 'prati alpini e la Streif fuori stagione sci, funivie aperte d\'estate' },
      { city: 'Innsbruck (Nordkette)', country: 'Austria', lat: 47.27, lon: 11.4, note: 'funivia dal centro città alle Alpi in 20 minuti' },
      { city: 'Hallstatt', country: 'Austria', lat: 47.56, lon: 13.65, note: 'villaggio UNESCO sul lago, miniera di sale più antica al mondo con sentieri' },
      { city: 'Zugspitze', country: 'Germania', lat: 47.42, lon: 10.98, note: 'Garmisch: la vetta più alta della Germania, funivia e sentieri d\'alta quota' },
      { city: 'Berchtesgaden', country: 'Germania', lat: 47.63, lon: 13.0, note: 'il Königssee e il nido d\'aquila, laghi alpini bavaresi' },
      { city: 'Foresta Nera', country: 'Germania', lat: 48.0, lon: 8.15, note: 'colline boscose del Baden-Württemberg, sentieri tra cascate e villaggi a graticcio' },
      { city: 'Ordesa', country: 'Spagna', lat: 42.65, lon: 0.05, note: 'canyon pirenaico aragonese, patrimonio UNESCO' },
      { city: 'Sierra Nevada (Granada)', country: 'Spagna', lat: 37.09, lon: -3.4, note: 'la montagna più alta della Spagna continentale, trekking estivo sopra Granada' },
      { city: 'Covadonga', country: 'Spagna', lat: 43.27, lon: -4.99, note: 'Picos de Europa: i laghi glaciali, calcare a picco sul verde' },
      { city: 'Serra da Estrela', country: 'Portogallo', lat: 40.33, lon: -7.62, note: 'la catena montuosa più alta del Portogallo continentale' },
      { city: 'Durmitor', country: 'Montenegro', lat: 43.13, lon: 19.05, note: 'canyon della Tara, il più profondo d\'Europa, laghi glaciali circostanti' },
      { city: 'Bjelašnica', country: 'Bosnia ed Erzegovina', lat: 43.71, lon: 18.27, note: 'sede olimpica 1984, sentieri estivi tra le Alpi Dinariche' },
      { city: 'Rila (Sette Laghi)', country: 'Bulgaria', lat: 41.83, lon: 23.4, note: 'monastero UNESCO nel cuore delle montagne del Pirin' },
      { city: 'Bucegi', country: 'Romania', lat: 45.4, lon: 25.47, note: 'Carpazi: la Sfinge e il Babele, formazioni rocciose scolpite dal vento' },
      { city: 'Piatra Craiului', country: 'Romania', lat: 45.55, lon: 25.23, note: 'cresta calcarea tagliente tra le più spettacolari dei Carpazi' },
      { city: 'Monte Olimpo', country: 'Grecia', lat: 40.09, lon: 22.36, note: 'la montagna degli dei, il rifugio Spilios Agapitos come base per la vetta' },
      { city: 'Meteora', country: 'Grecia', lat: 39.72, lon: 21.63, note: 'monasteri ortodossi su pinnacoli di roccia, UNESCO' },
      { city: 'Gola di Samaria', country: 'Grecia', lat: 35.32, lon: 23.98, note: 'Creta: la gola più lunga d\'Europa, un giorno intero di cammino fino al mare' },
      { city: 'Kazbegi', country: 'Georgia', lat: 42.66, lon: 44.64, note: 'la chiesa della Trinità sospesa sotto il Caucaso, trekking fino al ghiacciaio Gergeti' },
      { city: 'Svaneti', country: 'Georgia', lat: 43.05, lon: 42.65, note: 'torri medievali di pietra, villaggi UNESCO tra le vette più alte del Caucaso' },
      { city: 'Dilijan', country: 'Armenia', lat: 40.74, lon: 44.86, note: 'la "Svizzera armena", foreste e monasteri tra le montagne' },
      { city: 'Preikestolen', country: 'Norvegia', lat: 58.99, lon: 6.19, note: 'lo scoglio a picco di 600m sul fiordo, uno dei trekking più iconici al mondo' },
      { city: 'Trolltunga', country: 'Norvegia', lat: 60.12, lon: 6.74, note: 'la "lingua del troll" sospesa sul fiordo, giornata intera di cammino' },
      { city: 'Kebnekaise', country: 'Svezia', lat: 67.9, lon: 18.55, note: 'la vetta più alta di Svezia, Lapponia artica in piena estate' },
      { city: 'Saariselkä', country: 'Finlandia', lat: 68.42, lon: 27.42, note: 'Lapponia: sentieri sotto il sole di mezzanotte, renne al pascolo libero' },
      { city: 'Lake District', country: 'Regno Unito', lat: 54.45, lon: -3.09, note: 'i laghi e le vette dell\'Inghilterra del nord, patria dei poeti romantici' },
      { city: 'Ben Nevis', country: 'Regno Unito', lat: 56.8, lon: -5.0, note: 'la vetta più alta della Gran Bretagna, sentiero turistico e vie più impegnative' },
      { city: 'Killarney', country: 'Irlanda', lat: 52.06, lon: -9.5, note: 'il Ring of Kerry e le Macgillycuddy\'s Reeks, le vette più alte d\'Irlanda' },
      { city: 'Giant\'s Causeway', country: 'Regno Unito', lat: 55.24, lon: -6.51, note: 'colonne di basalto esagonali UNESCO, sentiero costiero dell\'Irlanda del Nord' },
      { city: 'Langtang', country: 'Nepal', lat: 28.21, lon: 85.52, note: 'trek meno affollato dell\'Annapurna/Everest, vicino alla capitale nepalese' },
      { city: 'Namche Bazaar', country: 'Nepal', lat: 27.8, lon: 86.71, note: 'il villaggio sherpa porta d\'accesso all\'Everest, acclimatamento obbligatorio prima di salire oltre' },
      { city: 'Jomsom (Mustang)', country: 'Nepal', lat: 28.78, lon: 83.72, note: 'l\'ex regno proibito del Nepal, altopiano arido oltre l\'Annapurna' },
      { city: 'Paro (Tiger\'s Nest)', country: 'Bhutan', lat: 27.49, lon: 89.36, note: 'il monastero Taktsang aggrappato alla roccia, ingresso regolato da tariffa giornaliera obbligatoria' },
      { city: 'Punakha', country: 'Bhutan', lat: 27.59, lon: 89.87, note: 'trekking tra dzong fortificati e passi himalayani, permesso di ingresso al paese obbligatorio' },
      { city: 'Leh (Ladakh)', country: 'India', lat: 34.15, lon: 77.58, note: 'monasteri buddisti e passi oltre i 5000m, acclimatamento essenziale' },
      { city: 'Manali', country: 'India', lat: 32.24, lon: 77.19, note: 'Himachal Pradesh, porta d\'accesso ai trek della Parvati Valley' },
      { city: 'Darjeeling', country: 'India', lat: 27.04, lon: 88.26, note: 'vista sul Kanchenjunga, terza vetta più alta del mondo, tra le piantagioni di tè' },
      { city: 'Skardu', country: 'Pakistan', lat: 35.3, lon: 75.63, note: 'porta d\'accesso al K2 e al Baltoro, tra le zone trekking più estreme al mondo' },
      { city: 'Hunza Valley', country: 'Pakistan', lat: 36.32, lon: 74.65, note: 'valle karakorum, vista sul Rakaposhi, cultura hunza millenaria' },
      { city: 'Lhasa', country: 'Tibet (Cina)', lat: 29.65, lon: 91.13, note: 'altopiano tibetano, mal di montagna da quota base: acclimatamento obbligatorio prima di ogni trek' },
      { city: 'Everest Base Camp Nord', country: 'Tibet (Cina)', lat: 28.14, lon: 86.85, note: 'l\'unico Base Camp raggiungibile in fuoristrada, permesso cinese speciale obbligatorio' },
      { city: 'Karakol (Ala-Kul)', country: 'Kirghizistan', lat: 42.49, lon: 78.4, note: 'lago turchese d\'alta quota nel Tian Shan' },
      { city: 'Song-Köl', country: 'Kirghizistan', lat: 41.83, lon: 75.13, note: 'lago d\'alpeggio a 3000m, yurte nomadi come unico alloggio' },
      { city: 'Almaty', country: 'Kazakistan', lat: 43.24, lon: 76.95, note: 'Tian Shan settentrionale, trekking tra laghi glaciali a un\'ora dalla città' },
      { city: 'Fann Mountains', country: 'Tagikistan', lat: 39.15, lon: 68.2, note: 'laghi color smeraldo nel Pamir occidentale, trekking ancora poco conosciuto' },
      { city: 'Khorog (Pamir)', country: 'Tagikistan', lat: 37.49, lon: 71.55, note: 'il "tetto del mondo", altopiano tra i più remoti dell\'Asia centrale' },
      { city: 'Gunung Batur', country: 'Indonesia', lat: -8.24, lon: 115.38, note: 'Bali: vulcano attivo, si sale all\'alba per il panorama sul lago craterico' },
      { city: 'Rinjani', country: 'Indonesia', lat: -8.42, lon: 116.47, note: 'Lombok: secondo vulcano più alto d\'Indonesia, lago craterico e sorgenti termali' },
      { city: 'Bromo', country: 'Indonesia', lat: -7.94, lon: 112.95, note: 'mare di sabbia vulcanico e alba sul cratere fumante, Giava orientale' },
      { city: 'Kinabalu', country: 'Malesia', lat: 6.08, lon: 116.56, note: 'Borneo: la vetta più alta del Sud-est asiatico, permesso e guida obbligatori' },
      { city: 'Mulu', country: 'Malesia', lat: 4.05, lon: 114.8, note: 'grotte giganti UNESCO e il Pinnacles trek, tra i più impegnativi del Borneo' },
      { city: 'Danum Valley', country: 'Malesia', lat: 4.97, lon: 117.8, note: 'foresta pluviale primaria del Borneo, trekking con guida obbligatoria per la fauna' },
      { city: 'Sapa', country: 'Vietnam', lat: 22.34, lon: 103.84, note: 'terrazze di riso e trekking tra i villaggi delle minoranze etniche del nord' },
      { city: 'Fansipan', country: 'Vietnam', lat: 22.3, lon: 103.77, note: 'il "tetto dell\'Indocina", oggi raggiungibile anche in funivia oltre che a piedi' },
      { city: 'Mount Pulag', country: 'Filippine', lat: 16.6, lon: 120.9, note: 'il "mare di nuvole" più famoso delle Filippine, terza vetta del paese' },
      { city: 'Mount Apo', country: 'Filippine', lat: 6.99, lon: 125.27, note: 'la vetta più alta delle Filippine, vulcano ancora attivo con fumarole' },
      { city: 'Yushan', country: 'Taiwan', lat: 23.47, lon: 120.96, note: 'la vetta più alta di Taiwan, permesso a numero chiuso' },
      { city: 'Kamikochi', country: 'Giappone', lat: 36.25, lon: 137.63, note: 'le Alpi giapponesi, valle glaciale accessibile solo in bus navetta' },
      { city: 'Yakushima', country: 'Giappone', lat: 30.34, lon: 130.51, note: 'foresta pluviale temperata UNESCO, cedri millenari ispirazione di Miyazaki' },
      { city: 'Hakone', country: 'Giappone', lat: 35.23, lon: 139.03, note: 'sentieri panoramici sul Fuji senza dover salire la vetta' },
      { city: 'Seoraksan', country: 'Corea del Sud', lat: 38.12, lon: 128.47, note: 'parco nazionale più spettacolare di Corea, foliage autunnale famosissimo' },
      { city: 'Hallasan (Jeju)', country: 'Corea del Sud', lat: 33.36, lon: 126.53, note: 'vulcano spento più alto di Corea del Sud, cratere lacustre in vetta' },
      { city: 'Huangshan', country: 'Cina', lat: 30.13, lon: 118.16, note: 'i pini e le rocce scolpite dalle nuvole, patrimonio UNESCO, mare di nuvole all\'alba' },
      { city: 'Zhangjiajie', country: 'Cina', lat: 29.32, lon: 110.43, note: 'pilastri di arenaria che ispirarono i paesaggi fluttuanti di Avatar' },
      { city: 'Jiuzhaigou', country: 'Cina', lat: 33.2, lon: 103.92, note: 'laghi multicolore e cascate nel Sichuan, patrimonio UNESCO' },
      { city: 'Emei Shan', country: 'Cina', lat: 29.52, lon: 103.33, note: 'montagna sacra buddista, scimmie lungo il sentiero verso la vetta dorata' },
      { city: 'Doi Inthanon', country: 'Thailandia', lat: 18.59, lon: 98.49, note: 'la vetta più alta della Thailandia, cascate e villaggi hmong lungo i sentieri' },
      { city: 'Luang Prabang (Kuang Si)', country: 'Laos', lat: 19.89, lon: 102.13, note: 'trekking tra villaggi hmong e cascate turchesi a scalini' },
      { city: 'Chefchaouen', country: 'Marocco', lat: 35.17, lon: -5.27, note: 'la "città blu", porta d\'accesso alle escursioni del Rif' },
      { city: 'Simien Mountains', country: 'Etiopia', lat: 13.19, lon: 38.04, note: 'altopiani UNESCO, scimmie gelada e panorami tra i più drammatici d\'Africa' },
      { city: 'Bale Mountains', country: 'Etiopia', lat: 6.83, lon: 39.75, note: 'altopiano afroalpino, lupo etiope, specie endemica rarissima' },
      { city: 'Monte Kenya', country: 'Kenya', lat: -0.15, lon: 37.31, note: 'seconda vetta più alta d\'Africa, trekking a più giorni tra zone climatiche diverse' },
      { city: 'Virunga', country: 'Ruanda', lat: -1.47, lon: 29.49, note: 'trekking regolamentato per l\'osservazione dei gorilla di montagna, permesso a numero chiuso e costoso' },
      { city: 'Bwindi', country: 'Uganda', lat: -1.06, lon: 29.63, note: 'foresta impenetrabile UNESCO, gorilla di montagna, permesso obbligatorio' },
      { city: 'Rwenzori', country: 'Uganda', lat: 0.39, lon: 29.87, note: 'le "montagne della luna", ghiacciai equatoriali sempre più rari' },
      { city: 'Sani Pass', country: 'Lesotho', lat: -29.58, lon: 29.28, note: 'il "regno del cielo", tutto il paese è sopra i 1000m di quota' },
      { city: 'Andringitra', country: 'Madagascar', lat: -22.2, lon: 46.9, note: 'granito e canyon nel sud dell\'isola, il Pic Boby tra le vette più impegnative' },
      { city: 'Table Mountain', country: 'Sudafrica', lat: -33.96, lon: 18.4, note: 'la montagna simbolo di Città del Capo, funivia e sentieri di ogni livello' },
      { city: 'Cederberg', country: 'Sudafrica', lat: -32.42, lon: 19.03, note: 'formazioni rocciose scolpite dal vento, pitture rupestri San millenarie' },
      { city: 'Estes Park (Rocky Mountain NP)', country: 'Stati Uniti', lat: 40.35, lon: -105.58, note: 'Colorado: laghi alpini e alci, sentieri fino sopra i 3500m' },
      { city: 'Lake Tahoe', country: 'Stati Uniti', lat: 39.09, lon: -120.03, note: 'California: il lago alpino più grande del Nordamerica, tratto della Pacific Crest Trail' },
      { city: 'Zion', country: 'Stati Uniti', lat: 37.3, lon: -113.05, note: 'canyon rosso dello Utah, Angels Landing tra i sentieri più esposti degli USA' },
      { city: 'Bryce Canyon', country: 'Stati Uniti', lat: 37.59, lon: -112.19, note: 'guglie di arenaria (hoodoos) uniche al mondo, sentieri tra i pinnacoli' },
      { city: 'Glacier NP', country: 'Stati Uniti', lat: 48.7, lon: -113.72, note: 'Montana: Going-to-the-Sun Road e ghiacciai in rapido ritiro' },
      { city: 'Grand Canyon', country: 'Stati Uniti', lat: 36.06, lon: -112.14, note: 'il canyon più famoso al mondo, discesa fino al fiume solo per escursionisti allenati' },
      { city: 'Great Smoky Mountains', country: 'Stati Uniti', lat: 35.68, lon: -83.53, note: 'Appalachi meridionali, il parco nazionale più visitato degli USA' },
      { city: 'Shenandoah', country: 'Stati Uniti', lat: 38.53, lon: -78.35, note: 'Appalachi della Virginia, Skyline Drive e cascate lungo l\'Appalachian Trail' },
      { city: 'White Mountains', country: 'Stati Uniti', lat: 44.27, lon: -71.3, note: 'New Hampshire: Presidential Range, meteo tra i più estremi degli USA anche d\'estate' },
      { city: 'Mount Rainier', country: 'Stati Uniti', lat: 46.85, lon: -121.76, note: 'vulcano innevato tutto l\'anno vicino Seattle, prati fioriti in luglio-agosto' },
      { city: 'Denali', country: 'Stati Uniti', lat: 63.07, lon: -151.01, note: 'Alaska: la vetta più alta del Nordamerica, permesso obbligatorio per l\'accesso profondo' },
      { city: 'Big Bend', country: 'Stati Uniti', lat: 29.25, lon: -103.25, note: 'deserto del Texas al confine col Messico, canyon sul Rio Grande' },
      { city: 'Jasper', country: 'Canada', lat: 52.87, lon: -118.08, note: 'Rockies canadesi, meno affollato di Banff, laghi glaciali e caribù' },
      { city: 'Yoho', country: 'Canada', lat: 51.44, lon: -116.49, note: 'cascate Takakkaw tra le più alte del Canada, laghi turchesi' },
      { city: 'Gaspésie', country: 'Canada', lat: 48.87, lon: -64.55, note: 'Quebec: caribù e panorami sul Golfo di San Lorenzo dalle vette' },
      { city: 'Cape Breton Highlands', country: 'Canada', lat: 46.74, lon: -60.6, note: 'Nova Scotia: la Cabot Trail tra scogliere e altopiani boscosi' },
      { city: 'Whistler (estate)', country: 'Canada', lat: 50.12, lon: -122.95, note: 'British Columbia: sentieri e bike park dove d\'inverno si scia' },
      { city: 'Nevado de Toluca', country: 'Messico', lat: 19.11, lon: -99.76, note: 'vulcano spento con due laghi craterici, tra i più accessibili del Messico centrale' },
      { city: 'Pico de Orizaba', country: 'Messico', lat: 19.03, lon: -97.27, note: 'la vetta più alta del Messico, escursione base fino al rifugio senza tecnica alpinistica' },
      { city: 'Copper Canyon', country: 'Messico', lat: 27.53, lon: -107.63, note: 'Chihuahua: canyon più vasti del Grand Canyon, ferrovia panoramica El Chepe' },
      { city: 'Acatenango', country: 'Guatemala', lat: 14.5, lon: -90.88, note: 'trekking notturno per vedere eruttare il vulcano di Fuego vicino' },
      { city: 'Chirripó', country: 'Costa Rica', lat: 9.48, lon: -83.49, note: 'la vetta più alta della Costa Rica, rifugio obbligatorio a metà salita' },
      { city: 'Volcán Barú', country: 'Panama', lat: 8.81, lon: -82.54, note: 'l\'unico punto del centro America da cui si vedono due oceani in vetta' },
      { city: 'Cotopaxi', country: 'Ecuador', lat: -0.68, lon: -78.44, note: 'uno dei vulcani attivi più alti al mondo, rifugio a 4800m come base' },
      { city: 'Quilotoa', country: 'Ecuador', lat: -0.86, lon: -78.9, note: 'lago craterico turchese, giro dell\'orlo in un giorno di cammino' },
      { city: 'Huaraz (Cordillera Blanca)', country: 'Perù', lat: -9.53, lon: -77.53, note: 'le Ande più alte fuori dall\'Himalaya, la Laguna 69 tra i trek più fotografati' },
      { city: 'Camino Inca', country: 'Perù', lat: -13.16, lon: -72.55, note: 'il trek più famoso del Sudamerica verso Machu Picchu, permesso e prenotazione obbligatori mesi prima' },
      { city: 'Salkantay', country: 'Perù', lat: -13.35, lon: -72.55, note: 'alternativa meno regolamentata al Cammino Inca, stesso arrivo a Machu Picchu' },
      { city: 'Vinicunca (Montagna dei Sette Colori)', country: 'Perù', lat: -13.88, lon: -71.31, note: 'strisce minerali naturali, quota oltre i 5000m: mal di montagna reale anche in giornata' },
      { city: 'Huayhuash', country: 'Perù', lat: -10.28, lon: -76.9, note: 'circuito trekking tra i più spettacolari e meno battuti delle Ande peruviane' },
      { city: 'La Paz (Cordillera Real)', country: 'Bolivia', lat: -16.29, lon: -68.13, note: 'l\'Illimani domina la città più alta del mondo, trekking d\'alta quota' },
      { city: 'Uyuni', country: 'Bolivia', lat: -20.13, lon: -67.49, note: 'altopiani andini tra i più estremi del pianeta, non trekking di vetta in senso stretto' },
      { city: 'Valle di Cocora', country: 'Colombia', lat: 4.64, lon: -75.49, note: 'le palme di cera più alte del mondo, simbolo della Colombia andina' },
      { city: 'Sierra Nevada de Santa Marta', country: 'Colombia', lat: 10.83, lon: -73.68, note: 'il trek della Ciudad Perdida, città precolombiana perduta nella giungla andina' },
      { city: 'Roraima', country: 'Venezuela', lat: 5.14, lon: -60.76, note: 'il tepui che ispirò "Il mondo perduto" di Conan Doyle, trek di più giorni con guida obbligatoria' },
      { city: 'Bariloche (estate)', country: 'Argentina', lat: -41.13, lon: -71.31, note: 'Patagonia andina, sentieri tra laghi e boschi di lenga nell\'estate australe' },
      { city: 'Aconcagua (Mendoza)', country: 'Argentina', lat: -32.65, lon: -70.01, note: 'la vetta più alta delle Americhe, trekking al campo base senza tecnica alpinistica' },
      { city: 'Ushuaia', country: 'Argentina', lat: -54.81, lon: -68.31, note: 'la città più australe del mondo, trekking alla Laguna Esmeralda tra ghiacciai' },
      { city: 'Pucón', country: 'Cile', lat: -39.28, lon: -71.98, note: 'vulcano Villarrica attivo, si sale con guida e ramponi anche d\'estate' },
      { city: 'Cajón del Maipo', country: 'Cile', lat: -33.6, lon: -70.35, note: 'canyon andino a un\'ora da Santiago, cascate e terme' },
      { city: 'Tongariro', country: 'Nuova Zelanda', lat: -39.13, lon: 175.57, note: 'il Tongariro Alpine Crossing, uno dei trek in giornata più famosi al mondo' },
      { city: 'Routeburn Track', country: 'Nuova Zelanda', lat: -44.73, lon: 168.2, note: 'uno dei "grandi cammini", tra foreste pluviali e passi alpini' },
      { city: 'Kepler Track', country: 'Nuova Zelanda', lat: -45.48, lon: 167.65, note: 'circuito ad anello vicino Te Anau, laghi e creste alpine' },
      { city: 'Aoraki / Mount Cook', country: 'Nuova Zelanda', lat: -43.59, lon: 170.14, note: 'la vetta più alta della Nuova Zelanda, Hooker Valley Track per tutti' },
      { city: 'Overland Track', country: 'Australia', lat: -41.68, lon: 145.95, note: 'Tasmania: 65km attraverso la wilderness UNESCO, prenotazione obbligatoria in alta stagione' },
      { city: 'Grampians', country: 'Australia', lat: -37.23, lon: 142.52, note: 'formazioni rocciose e cascate a poche ore da Melbourne' },
      { city: 'Cradle Mountain', country: 'Australia', lat: -41.69, lon: 145.95, note: 'Tasmania: il lago Dove sotto la vetta dentellata, simbolo del parco' },
      { city: 'Kosciuszko', country: 'Australia', lat: -36.46, lon: 148.26, note: 'la vetta più alta dell\'Australia continentale, sentiero accessibile senza tecnica alpinistica' },
      { city: 'Gressoney', country: 'Italia', lat: 45.78, lon: 7.82, note: 'Monte Rosa versante Walser, villaggi di origine germanica tra i 2000m' },
      { city: 'Sesto (Dolomiti)', country: 'Italia', lat: 46.7, lon: 12.36, note: 'le Tre Cime viste dal versante opposto a Cortina' },
      { city: 'Passo Gavia', country: 'Italia', lat: 46.35, lon: 10.49, note: 'uno dei passi escursionistici e ciclistici più duri delle Alpi italiane' },
      { city: 'Val Camonica (Adamello)', country: 'Italia', lat: 46.16, lon: 10.5, note: 'ghiacciaio più esteso delle Alpi italiane, incisioni rupestri UNESCO a valle' },
      { city: 'Pieve di Cadore', country: 'Italia', lat: 46.43, lon: 12.37, note: 'Dolomiti bellunesi, terra natale di Tiziano' },
      { city: 'Sila', country: 'Italia', lat: 39.3, lon: 16.5, note: 'altopiano calabrese, laghi artificiali tra pinete secolari' },
      { city: 'Maiella', country: 'Italia', lat: 42.13, lon: 14.13, note: 'Abruzzo: parco nazionale selvaggio, camosci appenninici e eremi rupestri' },
      { city: 'Mercantour', country: 'Francia', lat: 44.1, lon: 7.13, note: 'alpi marittime francesi, incisioni rupestri della Valle delle Meraviglie' },
      { city: 'Queyras', country: 'Francia', lat: 44.68, lon: 6.83, note: 'una delle valli alpine francesi più isolate, architettura in legno' },
      { city: 'Cirque de Mafate', country: 'Riunione (Francia)', lat: -21.05, lon: 55.42, note: 'cratere vulcanico raggiungibile solo a piedi o in elicottero, Oceano Indiano' },
      { city: 'Val d\'Anniviers', country: 'Svizzera', lat: 46.22, lon: 7.6, note: 'vallese svizzero, villaggi di baite in legno annerite dal sole' },
      { city: 'Bettmeralp (Aletsch)', country: 'Svizzera', lat: 46.43, lon: 8.04, note: 'il ghiacciaio più lungo delle Alpi, patrimonio UNESCO' },
      { city: 'Jungfraujoch', country: 'Svizzera', lat: 46.55, lon: 7.98, note: 'il "tetto d\'Europa" raggiungibile in treno, la stazione ferroviaria più alta del continente' },
      { city: 'Wilder Kaiser', country: 'Austria', lat: 47.53, lon: 12.3, note: 'pareti calcaree del Tirolo, tra le mete di arrampicata storiche delle Alpi' },
      { city: 'Dachstein', country: 'Austria', lat: 47.47, lon: 13.6, note: 'ghiacciaio e ponte sospeso panoramico nel Salzkammergut' },
      { city: 'Valle dell\'Isonzo (Soča)', country: 'Slovenia', lat: 46.24, lon: 13.63, note: 'il fiume smeraldo delle Alpi Giulie, rafting e sentieri lungo le sponde' },
      { city: 'Peak District', country: 'Regno Unito', lat: 53.28, lon: -1.75, note: 'il primo parco nazionale del Regno Unito, brughiere e valli calcaree' },
      { city: 'Yorkshire Dales', country: 'Regno Unito', lat: 54.25, lon: -2.15, note: 'valli verdi punteggiate da muretti a secco e cascate' },
      { city: 'Isle of Arran', country: 'Regno Unito', lat: 55.58, lon: -5.25, note: 'la "Scozia in miniatura", Goatfell come vetta simbolo' },
      { city: 'Aiguestortes', country: 'Spagna', lat: 42.58, lon: 0.95, note: 'unico parco nazionale della Catalogna, oltre 200 laghi glaciali' },
      { city: 'Montserrat', country: 'Spagna', lat: 41.6, lon: 1.83, note: 'montagna sacra catalana dalle forme scolpite dall\'erosione, monastero benedettino' },
      { city: 'Peneda-Gerês', country: 'Portogallo', lat: 41.75, lon: -8.2, note: 'l\'unico parco nazionale del Portogallo, pony selvatici e incisioni megalitiche' },
      { city: 'Vitosha', country: 'Bulgaria', lat: 42.56, lon: 23.28, note: 'montagna a un\'ora da Sofia, sentieri accessibili in giornata' },
      { city: 'Štrbské Pleso (Alti Tatra)', country: 'Slovacchia', lat: 49.12, lon: 20.06, note: 'versante slovacco degli Alti Tatra, laghi glaciali d\'alta quota' },
      { city: 'Prokletije', country: 'Albania', lat: 42.5, lon: 19.83, note: 'le "montagne maledette", tra le catene più selvagge e meno battute d\'Europa' },
      { city: 'Mavrovo', country: 'Macedonia del Nord', lat: 41.7, lon: 20.75, note: 'parco nazionale tra laghi e villaggi ottomani, meno noto ai turisti stranieri' },
      { city: 'Femundsmarka', country: 'Norvegia', lat: 62.2, lon: 11.85, note: 'wilderness norvegese al confine con la Svezia, renne e laghi glaciali' },
      { city: 'Sarek', country: 'Svezia', lat: 67.4, lon: 17.75, note: 'uno dei parchi nazionali più selvaggi d\'Europa, senza sentieri segnati: solo per esperti' },
      { city: 'Skaftafell', country: 'Islanda', lat: 64.02, lon: -16.97, note: 'ghiacciai e vulcani nel parco Vatnajökull, il più esteso d\'Europa' },
      { city: 'Landmannalaugar', country: 'Islanda', lat: 63.99, lon: -19.06, note: 'il trek Laugavegur, montagne multicolori e sorgenti termali naturali' },
      { city: 'Vestmanna', country: 'Isole Faroe (Danimarca)', lat: 62.16, lon: -7.17, note: 'scogliere a picco e villaggi remoti nell\'Atlantico settentrionale' },
      { city: 'Aragats', country: 'Armenia', lat: 40.53, lon: 44.19, note: 'la vetta più alta dell\'Armenia, quattro cime intorno a un cratere centrale' },
      { city: 'Sheki', country: 'Azerbaigian', lat: 41.2, lon: 47.17, note: 'Caucaso azero, città UNESCO base per il trekking del Grande Caucaso' },
      { city: 'Wadi Rum', country: 'Giordania', lat: 29.58, lon: 35.42, note: 'deserto roccioso lunare, trekking tra formazioni di arenaria millenarie' },
      { city: 'Bsharri (Cedri di Dio)', country: 'Libano', lat: 34.25, lon: 36.05, note: 'foresta millenaria sul monte Libano, base per il trekking della Qadisha Valley' },
      { city: 'Charyn Canyon', country: 'Kazakistan', lat: 43.35, lon: 79.07, note: 'il "piccolo Grand Canyon", formazioni rocciose rosse nel sud-est del paese' },
      { city: 'Ala Archa', country: 'Kirghizistan', lat: 42.57, lon: 74.48, note: 'parco nazionale a un\'ora da Bishkek, ghiacciai accessibili in giornata' },
      { city: 'Cameron Highlands', country: 'Malesia', lat: 4.47, lon: 101.38, note: 'piantagioni di tè in altura, clima fresco raro ai tropici' },
      { city: 'Ha Giang', country: 'Vietnam', lat: 22.83, lon: 104.98, note: 'loop panoramico tra le montagne carsiche del nord Vietnam, tornanti vertiginosi' },
      { city: 'Mount Kerinci', country: 'Indonesia', lat: -1.7, lon: 101.26, note: 'il vulcano attivo più alto dell\'Indonesia, foresta pluviale di Sumatra' },
      { city: 'Ijen', country: 'Indonesia', lat: -8.06, lon: 114.24, note: 'fiamme blu notturne di zolfo, discesa nel cratere con maschera antigas' },
      { city: 'Ourika Valley', country: 'Marocco', lat: 31.29, lon: -7.66, note: 'cascate e villaggi berberi a un\'ora da Marrakech, alternativa breve al Toubkal' },
      { city: 'Hoggar', country: 'Algeria', lat: 23.28, lon: 5.53, note: 'altopiano vulcanico nel Sahara centrale, formazioni rocciose tra le più remote al mondo' },
      { city: 'Tibesti', country: 'Ciad', lat: 20.83, lon: 17.0, note: 'vulcani sahariani tra i più isolati al mondo, accesso solo con guida e permessi speciali' },
      { city: 'Nyiragongo', country: 'Congo (RDC)', lat: -1.52, lon: 29.25, note: 'vulcano attivo con uno dei laghi di lava più grandi al mondo, trekking notturno alla vetta' },
      { city: 'Ngorongoro', country: 'Tanzania', lat: -3.16, lon: 35.59, note: 'cratere vulcanico più grande del mondo intatto, sentieri sull\'orlo oltre al safari' },
      { city: 'Nyika Plateau', country: 'Malawi', lat: -10.57, lon: 33.8, note: 'altopiano ondulato unico in Africa australe, zebre selvatiche libere' },
      { city: 'Mulanje', country: 'Malawi', lat: -15.95, lon: 35.6, note: 'il massiccio isolato più alto dell\'Africa centrale, foreste di cedro endemico' },
      { city: 'Chimanimani', country: 'Zimbabwe', lat: -19.8, lon: 32.87, note: 'montagne di confine con il Mozambico, sentieri tra grotte e cascate' },
      { city: 'Fish River Canyon', country: 'Namibia', lat: -27.57, lon: 17.62, note: 'il secondo canyon più grande al mondo, trekking di più giorni solo in stagione fresca' },
      { city: 'Erta Ale', country: 'Etiopia', lat: 13.6, lon: 40.67, note: 'vulcano attivo nella depressione della Dancalia, uno dei luoghi più estremi della Terra' },
      { city: 'Sedona', country: 'Stati Uniti', lat: 34.87, lon: -111.76, note: 'formazioni rocciose rosse dell\'Arizona, sentieri tra canyon e vortici energetici' },
      { city: 'Adirondacks', country: 'Stati Uniti', lat: 44.13, lon: -73.85, note: 'New York: le "46 vette alte", tradizione escursionistica centenaria' },
      { city: 'Olympic NP', country: 'Stati Uniti', lat: 47.8, lon: -123.6, note: 'Washington: foresta pluviale temperata e vette innevate nello stesso parco' },
      { city: 'Haleakalā', country: 'Stati Uniti', lat: 20.71, lon: -156.25, note: 'Maui: vulcano spento, alba sopra le nuvole tra i panorami più fotografati delle Hawaii' },
      { city: 'Algonquin', country: 'Canada', lat: 45.58, lon: -78.4, note: 'Ontario: laghi e foreste boreali, canoa e trekking nello stesso parco' },
      { city: 'Fundy', country: 'Canada', lat: 45.6, lon: -65.0, note: 'Nuovo Brunswick: le maree più alte al mondo, sentieri costieri sul dislivello' },
      { city: 'Chapada Diamantina', country: 'Brasile', lat: -12.6, lon: -41.47, note: 'altopiani e cascate nel cuore della Bahia, trekking multi-giorno tra canyon' },
      { city: 'Serra dos Órgãos', country: 'Brasile', lat: -22.45, lon: -43.04, note: 'guglie di granito vicino Rio, il Dedo de Deus tra le vette simbolo' },
      { city: 'Talampaya', country: 'Argentina', lat: -29.98, lon: -67.93, note: 'canyon rosso UNESCO nella Rioja argentina, formazioni scolpite dal vento' },
      { city: 'Perito Moreno', country: 'Argentina', lat: -50.49, lon: -73.14, note: 'ghiacciaio ancora in avanzata, passerelle e trekking sul ghiaccio con ramponi' },
      { city: 'Cerro Castillo', country: 'Cile', lat: -45.9, lon: -72.15, note: 'Patagonia cilena meno battuta, alternativa selvaggia a Torres del Paine' },
      { city: 'San Pedro de Atacama', country: 'Cile', lat: -22.91, lon: -68.2, note: 'il deserto più arido del mondo, trekking tra vulcani e geyser d\'alta quota' },
      { city: 'Doubtful Sound', country: 'Nuova Zelanda', lat: -45.28, lon: 167.0, note: 'fiordo meno turistico di Milford, trekking e kayak tra pareti a picco' },
      { city: 'Waiheke Island', country: 'Nuova Zelanda', lat: -36.79, lon: 175.09, note: 'colline vitate e sentieri costieri a un\'ora di traghetto da Auckland' },
      { city: 'Flinders Ranges', country: 'Australia', lat: -31.4, lon: 138.68, note: 'outback sudaustraliano, formazioni rocciose antichissime e canyon incisi' },
      { city: 'Karijini', country: 'Australia', lat: -22.5, lon: 118.35, note: 'gole profonde nel Pilbara, nuotate in pozze naturali tra le pareti rosse' },
      { city: 'Lord Howe Island', country: 'Australia', lat: -31.55, lon: 159.08, note: 'isola vulcanica UNESCO, il Mount Gower tra i trek di un giorno più belli del Pacifico' },
      { city: 'Nebrodi', country: 'Italia', lat: 38.0, lon: 14.65, note: 'Sicilia: faggete e altopiani meno noti, tra Etna e Madonie' },
      { city: 'Madonie', country: 'Italia', lat: 37.87, lon: 14.03, note: 'Sicilia: parco montano con agrifogli giganti e villaggi arabo-normanni' },
      { city: 'Alpi Apuane', country: 'Italia', lat: 44.03, lon: 10.2, note: 'cave di marmo di Carrara e vette a picco sul mare della Versilia' },
      { city: 'Karkonosze', country: 'Polonia', lat: 50.73, lon: 15.74, note: 'i Monti dei Giganti al confine polacco-ceco, altopiano glaciale' },
      { city: 'Svizzera Boema', country: 'Cechia', lat: 50.85, lon: 14.25, note: 'formazioni di arenaria e archi di roccia, la Porta di Pravčice' },
      { city: 'Retezat', country: 'Romania', lat: 45.37, lon: 22.87, note: 'Carpazi meridionali, oltre 80 laghi glaciali in un solo massiccio' },
      { city: 'Şahdağ', country: 'Azerbaigian', lat: 41.18, lon: 47.85, note: 'sci d\'inverno, trekking d\'estate sulle vette del Grande Caucaso azero' },
      { city: 'Elbrus', country: 'Russia', lat: 43.35, lon: 42.44, note: 'la vetta più alta d\'Europa per convenzione geografica, campo base senza tecnica per gli escursionisti' },
      { city: 'Ararat', country: 'Turchia', lat: 39.7, lon: 44.3, note: 'la montagna biblica al confine con Armenia e Iran, permesso speciale necessario' },
      { city: 'Nemrut Dağı', country: 'Turchia', lat: 37.98, lon: 38.74, note: 'teste colossali di pietra in vetta, tramonto e alba tra i più fotografati d\'Anatolia' },
      { city: 'Cappadocia (Rose Valley)', country: 'Turchia', lat: 38.65, lon: 34.83, note: 'trekking tra camini di fata, meglio all\'alba con le mongolfiere in volo' },
      { city: 'Golden Gate Highlands', country: 'Sudafrica', lat: -28.52, lon: 28.62, note: 'arenaria dorata nel Free State, formazioni ad arco naturali' },
      { city: 'Marsabit', country: 'Kenya', lat: 2.33, lon: 37.98, note: 'altopiano vulcanico isolato nel nord del Kenya, foresta relitta nel deserto' },
      { city: 'Aberdare', country: 'Kenya', lat: -0.4, lon: 36.7, note: 'foresta di bambù e altopiani, base per il Treetops reso famoso dalla Regina Elisabetta' },
      { city: 'Cordillera de Talamanca', country: 'Costa Rica', lat: 9.35, lon: -83.2, note: 'catena montuosa condivisa con Panama, foresta nuvolosa e páramo tropicale' },
      { city: 'Nevados de Chillán', country: 'Cile', lat: -36.9, lon: -71.4, note: 'vulcano attivo nel sud del Cile, trekking tra fumarole e boschi di araucaria' },
      { city: 'Coyhaique', country: 'Cile', lat: -45.57, lon: -72.07, note: 'Patagonia settentrionale cilena, riserva nazionale meno affollata' },
      { city: 'Waimea Canyon', country: 'Stati Uniti', lat: 22.07, lon: -159.66, note: 'Kauai: il "Grand Canyon del Pacifico", sentieri tra pareti rosse e cascate' },
      { city: 'Passo dello Stelvio (versante svizzero)', country: 'Svizzera', lat: 46.53, lon: 10.45, note: 'il versante di Umbrail, meno affollato di quello italiano, panorami sull\'Ortles' },
      { city: 'Vercors', country: 'Francia', lat: 45.05, lon: 5.5, note: 'altopiano calcareo prealpino, gole e grotte tra Grenoble e Valence' },
      { city: 'Peloponneso (Taigeto)', country: 'Grecia', lat: 36.98, lon: 22.35, note: 'la catena montuosa più alta del Peloponneso, gola del Rindomo poco battuta' },
    ],
  },
  {
    id: 'parchi-tematici',
    emoji: '🎢',
    label: 'Parchi a tema',
    days: 1,
    brief:
      'Tema PARCHI A TEMA: divertimento pianificato con onestà pratica — mai promettere "tutto il parco in un giorno" se è grande: dichiara sempre quali attrazioni/aree priorizzare in base al tempo disponibile, e quando conviene un pass salta-fila a pagamento (è un costo aggiuntivo: dillo, non nasconderlo). Limiti di altezza per le attrazioni family: parlane in generale quando è informazione nota, senza inventare cifre esatte che non conosci con certezza. L\'esperienza gastronomica e a tema (ristoranti tematizzati, dolci iconici, negozi di merchandise) fa parte del divertimento quanto le giostre: raccontala. Consiglio pratico su affollamento (bassa stagione, giorni infrasettimanali, apertura anticipata) SOLO se è informazione generalmente nota e verificabile, mai inventata. Onestà sui costi: sono luoghi commerciali cari (biglietto, cibo, parcheggio, pass) — dillo chiaramente, mai vendere la giornata come economica. Tono energico e divertente ma con i piedi per terra.',
    places: [
      { city: 'Anaheim (Disneyland Resort)', country: 'Stati Uniti', lat: 33.81, lon: -117.92, note: 'il Disneyland originale del 1955 e Disney California Adventure affiancati' },
      { city: 'Orlando (Magic Kingdom)', country: 'Stati Uniti', lat: 28.42, lon: -81.58, note: 'il castello più fotografato al mondo, il primo dei 4 parchi Disney di Orlando' },
      { city: 'Orlando (EPCOT)', country: 'Stati Uniti', lat: 28.37, lon: -81.55, note: 'i padiglioni dei paesi del World Showcase e le attrazioni a tema scientifico' },
      { city: 'Orlando (Hollywood Studios)', country: 'Stati Uniti', lat: 28.36, lon: -81.56, note: 'Star Wars: Galaxy\'s Edge e Toy Story Land' },
      { city: 'Orlando (Animal Kingdom)', country: 'Stati Uniti', lat: 28.35, lon: -81.59, note: 'zoo e parco a tema insieme, l\'Albero della Vita e Pandora - Avatar' },
      { city: 'Tokyo Disneyland', country: 'Giappone', lat: 35.63, lon: 139.88, note: 'il primo parco Disney fuori dagli Stati Uniti, aperto nel 1983' },
      { city: 'Tokyo DisneySea', country: 'Giappone', lat: 35.63, lon: 139.89, note: 'unico al mondo tra i parchi Disney, sette porti tematizzati sul mare' },
      { city: 'Parigi (Disneyland Paris)', country: 'Francia', lat: 48.87, lon: 2.78, note: 'due parchi affiancati, Disneyland Park e Walt Disney Studios' },
      { city: 'Hong Kong Disneyland', country: 'Cina', lat: 22.31, lon: 114.04, note: 'il più piccolo dei parchi Disney nel mondo, sull\'isola di Lantau' },
      { city: 'Shanghai Disneyland', country: 'Cina', lat: 31.14, lon: 121.66, note: 'il più recente dei Disney, col castello Disney più grande al mondo' },
      { city: 'Orlando (Universal Studios Florida)', country: 'Stati Uniti', lat: 28.47, lon: -81.47, note: 'il Wizarding World of Harry Potter - Diagon Alley' },
      { city: 'Orlando (Islands of Adventure)', country: 'Stati Uniti', lat: 28.47, lon: -81.47, note: 'Wizarding World - Hogsmeade e i coaster a tema Marvel' },
      { city: 'Orlando (Epic Universe)', country: 'Stati Uniti', lat: 28.45, lon: -81.42, note: 'il nuovo parco Universal aperto nel 2025, quinto polo del complesso di Orlando' },
      { city: 'Hollywood (Universal Studios)', country: 'Stati Uniti', lat: 34.14, lon: -118.35, note: 'il tour degli studios originale con attrazioni sugli stessi backlot dei film' },
      { city: 'Osaka (Universal Studios Japan)', country: 'Giappone', lat: 34.67, lon: 135.43, note: 'Super Nintendo World e il Wizarding World versione giapponese' },
      { city: 'Singapore (Universal Studios)', country: 'Singapore', lat: 1.25, lon: 103.82, note: 'l\'unico Universal del sud-est asiatico, sull\'isola di Sentosa' },
      { city: 'Pechino (Universal Studios Beijing)', country: 'Cina', lat: 39.87, lon: 116.72, note: 'il parco Universal più recente e più grande dell\'Asia' },
      { city: 'Rust (Europa Park)', country: 'Germania', lat: 48.27, lon: 7.72, note: 'il secondo parco più visitato d\'Europa, 18 aree a tema per nazione' },
      { city: 'Kaatsheuvel (Efteling)', country: 'Paesi Bassi', lat: 51.65, lon: 5.05, note: 'il parco a tema fiabesco più antico d\'Europa, aperto nel 1952' },
      { city: 'Salou (PortAventura)', country: 'Spagna', lat: 41.09, lon: 1.15, note: 'il più grande parco a tema della Spagna, sei aree tematiche mediterranee' },
      { city: 'Castelnuovo del Garda (Gardaland)', country: 'Italia', lat: 45.47, lon: 10.72, note: 'il parco a tema più visitato d\'Italia' },
      { city: 'Copenaghen (Tivoli Gardens)', country: 'Danimarca', lat: 55.67, lon: 12.57, note: 'uno dei parchi divertimenti più antichi al mondo, aperto nel 1843' },
      { city: 'Göteborg (Liseberg)', country: 'Svezia', lat: 57.7, lon: 11.99, note: 'il parco divertimenti più visitato di Scandinavia' },
      { city: 'Alton (Alton Towers)', country: 'Regno Unito', lat: 52.99, lon: -1.89, note: 'il parco a tema più grande del Regno Unito, coaster tra i più premiati d\'Europa' },
      { city: 'Chertsey (Thorpe Park)', country: 'Regno Unito', lat: 51.4, lon: -0.51, note: 'focalizzato su coaster estremi, meno family-friendly di Alton Towers' },
      { city: 'Les Epesses (Puy du Fou)', country: 'Francia', lat: 46.89, lon: -0.85, note: 'spettacoli storici dal vivo invece delle giostre, secondo parco più visitato di Francia' },
      { city: 'Brühl (Phantasialand)', country: 'Germania', lat: 50.8, lon: 6.88, note: 'tematizzazioni immersive pluripremiate, tra i migliori coaster d\'Europa' },
      { city: 'Blackpool Pleasure Beach', country: 'Regno Unito', lat: 53.79, lon: -3.05, note: 'storico luna park sul lungomare, coaster in legno centenari' },
      { city: 'Valencia (Six Flags Magic Mountain)', country: 'Stati Uniti', lat: 34.42, lon: -118.6, note: 'record mondiale di montagne russe nello stesso parco (19)' },
      { city: 'Sandusky (Cedar Point)', country: 'Stati Uniti', lat: 41.48, lon: -82.68, note: 'la "capitale mondiale dei coaster", 17 montagne russe' },
      { city: 'Mason (Kings Island)', country: 'Stati Uniti', lat: 39.35, lon: -84.26, note: 'replica della Torre Eiffel e coaster in legno storici' },
      { city: 'Jackson (Six Flags Great Adventure)', country: 'Stati Uniti', lat: 40.14, lon: -74.44, note: 'il coaster più alto e veloce degli USA, Kingda Ka' },
      { city: 'Tampa (Busch Gardens)', country: 'Stati Uniti', lat: 28.04, lon: -82.42, note: 'parco a tema con safari africano integrato tra i coaster' },
      { city: 'San Diego (SeaWorld)', country: 'Stati Uniti', lat: 32.76, lon: -117.23, note: 'parco marino con spettacoli e attrazioni, non solo vasche' },
      { city: 'Orlando (SeaWorld)', country: 'Stati Uniti', lat: 28.41, lon: -81.46, note: 'coaster e mondo marino insieme, dibattuto per gli spettacoli con orche' },
      { city: 'Williamsburg (Busch Gardens)', country: 'Stati Uniti', lat: 37.23, lon: -76.65, note: 'aree tematizzate come villaggi europei storici' },
      { city: 'Abu Dhabi (Ferrari World)', country: 'Emirati Arabi Uniti', lat: 24.48, lon: 54.61, note: 'il coaster più veloce al mondo, Formula Rossa, sotto un tetto rosso gigante' },
      { city: 'Abu Dhabi (Warner Bros World)', country: 'Emirati Arabi Uniti', lat: 24.48, lon: 54.6, note: 'il parco indoor Warner Bros più grande al mondo, su Yas Island' },
      { city: 'Dubai (IMG Worlds of Adventure)', country: 'Emirati Arabi Uniti', lat: 25.16, lon: 55.42, note: 'parco indoor Marvel e Cartoon Network, tra i più grandi al coperto' },
      { city: 'Dubai (Motiongate)', country: 'Emirati Arabi Uniti', lat: 25.0, lon: 55.0, note: 'aree tematizzate DreamWorks, Sony Pictures e Lionsgate' },
      { city: 'Guangzhou (Chimelong Ocean Kingdom)', country: 'Cina', lat: 22.11, lon: 113.32, note: 'il più grande parco marino al mondo per numero di specie' },
      { city: 'Hong Kong (Ocean Park)', country: 'Cina', lat: 22.25, lon: 114.18, note: 'parco marino su una collina con funivia panoramica' },
      { city: 'Yongin (Everland)', country: 'Corea del Sud', lat: 37.29, lon: 127.2, note: 'il parco a tema più grande della Corea del Sud, zoo safari incluso' },
      { city: 'Seoul (Lotte World)', country: 'Corea del Sud', lat: 37.51, lon: 127.1, note: 'il più grande parco a tema indoor al mondo, dentro un centro commerciale' },
      { city: 'Nagashima (Nagashima Spa Land)', country: 'Giappone', lat: 35.06, lon: 136.72, note: 'coaster in acciaio da record e terme adiacenti' },
      { city: 'Fujiyoshida (Fuji-Q Highland)', country: 'Giappone', lat: 35.49, lon: 138.78, note: 'coaster estremi con vista sul Monte Fuji' },
      { city: 'Billund (Legoland Denmark)', country: 'Danimarca', lat: 55.73, lon: 9.13, note: 'il primo Legoland al mondo, accanto alla fabbrica Lego storica' },
      { city: 'Windsor (Legoland Windsor)', country: 'Regno Unito', lat: 51.42, lon: -0.62, note: 'un Miniland con i monumenti di Londra in mattoncini' },
      { city: 'Günzburg (Legoland Deutschland)', country: 'Germania', lat: 48.46, lon: 10.28, note: 'il Legoland più grande d\'Europa' },
      { city: 'Carlsbad (Legoland California)', country: 'Stati Uniti', lat: 33.13, lon: -117.31, note: 'il primo Legoland americano, vicino San Diego' },
      { city: 'Winter Haven (Legoland Florida)', country: 'Stati Uniti', lat: 27.99, lon: -81.69, note: 'costruito sul sito dell\'ex parco acquatico Cypress Gardens' },
      { city: 'Johor (Legoland Malaysia)', country: 'Malesia', lat: 1.42, lon: 103.63, note: 'il primo Legoland in Asia' },
      { city: 'Dubai (Legoland Dubai)', country: 'Emirati Arabi Uniti', lat: 24.97, lon: 55.0, note: 'parte del complesso Dubai Parks and Resorts' },
      { city: 'Nagoya (Legoland Japan)', country: 'Giappone', lat: 35.06, lon: 136.88, note: 'sul fiume Kiso, il più recente Legoland asiatico' },
      { city: 'Gyeongju (Legoland Korea)', country: 'Corea del Sud', lat: 35.86, lon: 129.28, note: 'aperto nel 2022 vicino al lago Bomun' },
      { city: 'Gold Coast (Dreamworld)', country: 'Australia', lat: -27.87, lon: 153.33, note: 'coaster e riserva di tigri insieme, il parco più grande d\'Australia' },
      { city: 'Gold Coast (Warner Bros Movie World)', country: 'Australia', lat: -27.9, lon: 153.32, note: 'parata di supereroi e coaster a tema Superman' },
      { city: 'Gold Coast (Sea World Australia)', country: 'Australia', lat: -27.94, lon: 153.42, note: 'parco marino storico con delfini e coaster' },
      { city: 'Penha (Beto Carrero World)', country: 'Brasile', lat: -26.77, lon: -48.77, note: 'il parco a tema più grande dell\'America Latina' },
      { city: 'Città del Messico (Six Flags México)', country: 'Messico', lat: 19.29, lon: -99.2, note: 'il parco a tema più alto del mondo per altitudine, oltre 2200m' },
      { city: 'Ravenna (Mirabilandia)', country: 'Italia', lat: 44.36, lon: 12.27, note: 'il coaster più alto d\'Italia, iSpeed' },
      { city: 'Valmontone (Rainbow MagicLand)', country: 'Italia', lat: 41.79, lon: 12.93, note: 'vicino Roma, aree tematizzate sui cartoni Rainbow' },
      { city: 'Rimini (Italia in Miniatura)', country: 'Italia', lat: 44.06, lon: 12.44, note: 'parco a tema con l\'Italia ricostruita in scala' },
      { city: 'Roma (Cinecittà World)', country: 'Italia', lat: 41.79, lon: 12.65, note: 'parco a tema dentro gli storici studios di Cinecittà' },
      { city: 'Bottrop (Movie Park Germany)', country: 'Germania', lat: 51.55, lon: 6.96, note: 'parco a tema cinema nella regione della Ruhr' },
      { city: 'Romsey (Paultons Park - Peppa Pig World)', country: 'Regno Unito', lat: 50.96, lon: -1.55, note: 'il parco a tema Peppa Pig più grande al mondo' },
      { city: 'De Panne (Plopsaland)', country: 'Belgio', lat: 51.07, lon: 2.62, note: 'parco belga basato sui personaggi dei cartoni fiamminghi' },
      { city: 'Biddinghuizen (Walibi Holland)', country: 'Paesi Bassi', lat: 52.45, lon: 5.68, note: 'coaster estremi, gemello olandese di Walibi Belgium' },
      { city: 'Ypres (Bellewaerde)', country: 'Belgio', lat: 50.85, lon: 2.99, note: 'parco belga con area safari integrata' },
      { city: 'Soltau (Heide Park)', country: 'Germania', lat: 52.98, lon: 9.98, note: 'il secondo parco più grande della Germania dopo Europa Park' },
      { city: 'Zator (Energylandia)', country: 'Polonia', lat: 49.99, lon: 19.2, note: 'il parco più grande della Polonia, coaster da record' },
      { city: 'Istanbul (Vialand/Isfanbul)', country: 'Turchia', lat: 41.05, lon: 28.9, note: 'parco a tema con repliche di monumenti ottomani turchi' },
      { city: 'Mumbai (Adlabs Imagica)', country: 'India', lat: 18.86, lon: 73.29, note: 'tra i primi grandi parchi a tema indiani in stile occidentale' },
      { city: 'Bangalore (Wonderla)', country: 'India', lat: 12.87, lon: 77.4, note: 'catena indiana con più sedi (Bangalore, Kochi, Hyderabad)' },
      { city: 'Nanchang (Wanda Cultural Tourism City)', country: 'Cina', lat: 28.68, lon: 115.86, note: 'il più grande dei parchi della catena cinese Wanda' },
      { city: 'Vaughan (Canada\'s Wonderland)', country: 'Canada', lat: 43.84, lon: -79.54, note: 'il parco a tema più visitato del Canada' },
      { city: 'Montréal (La Ronde)', country: 'Canada', lat: 45.52, lon: -73.53, note: 'storico parco Six Flags sull\'isola di Sainte-Hélène' },
      { city: 'Doswell (Kings Dominion)', country: 'Stati Uniti', lat: 37.85, lon: -77.42, note: 'coaster storici e area Planet Snoopy per famiglie' },
      { city: 'Allentown (Dorney Park)', country: 'Stati Uniti', lat: 40.58, lon: -75.55, note: 'storico parco della Pennsylvania, oltre 130 anni di storia' },
      { city: 'Buena Park (Knott\'s Berry Farm)', country: 'Stati Uniti', lat: 33.84, lon: -117.99, note: 'il primo parco a tema d\'America, nato da una fattoria di frutti di bosco' },
      { city: 'San Antonio (Six Flags Fiesta Texas)', country: 'Stati Uniti', lat: 29.6, lon: -98.61, note: 'costruito dentro una vecchia cava di pietra calcarea' },
      { city: 'Arlington (Six Flags Over Texas)', country: 'Stati Uniti', lat: 32.75, lon: -97.07, note: 'il primo parco della catena Six Flags, aperto nel 1961' },
      { city: 'Branson (Silver Dollar City)', country: 'Stati Uniti', lat: 36.66, lon: -93.34, note: 'parco a tema artigianale ambientato nel 1880, coaster tra i meglio valutati d\'America' },
      { city: 'Pigeon Forge (Dollywood)', country: 'Stati Uniti', lat: 35.79, lon: -83.53, note: 'il parco a tema di Dolly Parton, coaster in legno pluripremiati' },
      { city: 'Hershey (Hersheypark)', country: 'Stati Uniti', lat: 40.29, lon: -76.65, note: 'nato dalla fabbrica di cioccolato Hershey, profuma di cacao all\'ingresso' },
      { city: 'Vienna (Prater)', country: 'Austria', lat: 48.22, lon: 16.4, note: 'storico parco divertimenti viennese, la ruota panoramica del 1897' },
      { city: 'Madrid (Parque Warner)', country: 'Spagna', lat: 40.24, lon: -3.72, note: 'parco Warner Bros con aree tematizzate Cartoon Network e DC' },
      { city: 'Madrid (Parque de Atracciones)', country: 'Spagna', lat: 40.42, lon: -3.75, note: 'storico luna park della Casa de Campo' },
      { city: 'Barcellona (Tibidabo)', country: 'Spagna', lat: 41.42, lon: 2.12, note: 'il parco divertimenti più antico di Spagna, in cima a una collina panoramica' },
      { city: 'Mosca (Dream Island)', country: 'Russia', lat: 55.7, lon: 37.66, note: 'il parco a tema indoor più grande d\'Europa, aperto nel 2020' },
    ],
  },
];

export function themeDescriptors(): LibraryDescriptor[] {
  const out: LibraryDescriptor[] = [];
  for (const t of THEMES) {
    // Luoghi aggiuntivi del 22/08/2026 (libraryDescriptorsExtra.ts e il
    // secondo lotto in libraryDescriptorsExtra2.ts): stesso tema, stesso
    // brief, altre città. Un luogo già presente (stesso nome città, in
    // QUALSIASI dei lotti) non si duplica: chi arriva prima vince.
    const nomiEsistenti = new Set(t.places.map((p) => slugify(p.city)));
    const extraCandidati = [
      ...(EXTRA_THEME_PLACES[t.id] || []),
      ...(EXTRA_THEME_PLACES_2[t.id] || []),
    ];
    const extra: typeof t.places = [];
    for (const p of extraCandidati) {
      const key = slugify(p.city);
      if (nomiEsistenti.has(key)) continue;
      nomiEsistenti.add(key);
      extra.push(p);
    }
    const placesConExtra = [...t.places, ...extra];
    // Due città omonime nello stesso tema producevano lo STESSO slug e la
    // seconda spariva dalla biblioteca (caso reale: Lagos in Portogallo e
    // Lagos in Nigeria nel tema "mare"). La prima tiene lo slug storico —
    // gli item già generati restano validi — la seconda prende il suffisso
    // del paese.
    const usedKeys = new Set<string>();
    for (const pl of placesConExtra) {
      const cityKey = usedKeys.has(slugify(pl.city))
        ? `${slugify(pl.city)}-${slugify(pl.country)}`
        : slugify(pl.city);
      usedKeys.add(cityKey);
      const brief = [
        t.brief,
        `CONTESTO LOCALE: ${pl.city}, ${pl.country}${pl.note ? ` — aggancio del tema: ${pl.note}` : ''}.`,
      ].join('\n');
      out.push({
        slug: `theme-${t.id}-${cityKey}`,
        kind: 'theme',
        title: `${t.emoji} ${t.label} · ${pl.city}`,
        city: pl.city,
        country: pl.country,
        coords: { lat: pl.lat, lon: pl.lon },
        days: pl.days ?? t.days,
        theme: t.id,
        angle: t.id, // per i temi l'angolo È il tema
        brief,
        contextHints: t.hints,
      });
      // Regola committente, senza eccezioni: OGNI destinazione della
      // biblioteca deve avere anche la versione TUTTA GRATIS e quella con
      // un'esperienza/biglietto prenotabile (Tiqets/Viator/GetYourGuide).
      // Per i temi l'angolo diventa gratis/esperienze e il tema resta il
      // filo conduttore (campo `theme` invariato: le regole tematiche della
      // verifica in codice continuano ad applicarsi).
      for (const a of [FREE_ANGLE, BOOKABLE_ANGLE]) {
        out.push({
          slug: `theme-${t.id}-${cityKey}-${a.id}`,
          kind: 'theme',
          title: `${t.emoji} ${t.label} · ${pl.city} — ${a.label}`,
          city: pl.city,
          country: pl.country,
          coords: { lat: pl.lat, lon: pl.lon },
          days: pl.days ?? t.days,
          theme: t.id,
          angle: a.id,
          brief: [
            a.brief,
            brief,
            a.id === FREE_ANGLE.id
              ? `IL TEMA RESTA IL FILO CONDUTTORE, ma a costo zero: se l'esperienza-simbolo del tema si paga (degustazione, ingresso, impianto), sostituiscila con la declinazione gratuita REALE dello stesso tema in questa zona — visite libere, cantine/botteghe che non fanno pagare l'assaggio d'ingresso, eventi aperti, sentieri e punti d'osservazione — e dichiara con onestà cosa resta fuori dall'itinerario perché a pagamento.`
              : `IL TEMA RESTA IL FILO CONDUTTORE: le 2-3 esperienze prenotabili devono essere COERENTI col tema (${t.label.toLowerCase()}), non attività generiche della città.`,
          ].join('\n'),
          contextHints: {
            ...(t.hints || {}),
            ...(a.id === BOOKABLE_ANGLE.id ? { bookable: true } : {}),
          },
        });
      }
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────
// 5) ZONE — 30 città top (italiane + mondiali) × 8 angoli × 1-2-3 giorni
//    È la sostanza delle "centinaia" di itinerari pronti.
// ─────────────────────────────────────────────────────────────────────

interface ZoneCity {
  city: string;
  country: string;
  lat: number;
  lon: number;
  /** Una riga di contesto locale che entra nel brief. */
  note: string;
}

export const ZONE_CITIES: ZoneCity[] = [
  // ── Italia ──
  { city: 'Roma', country: 'Italia', lat: 41.89, lon: 12.49, note: 'stratificazione unica antico/barocco/moderno; distanze ingannevoli, il centro si gira a piedi ma i rioni sono mondi diversi' },
  { city: 'Firenze', country: 'Italia', lat: 43.77, lon: 11.25, note: 'Rinascimento concentrato in pochi km2; musei con prenotazione obbligatoria di fatto, Oltrarno per respirare' },
  { city: 'Venezia', country: 'Italia', lat: 45.44, lon: 12.34, note: 'si visita SOLO a piedi e in vaporetto; sestieri lontani dal flusso (Cannaregio, Castello) e isole con frequenze lente' },
  { city: 'Napoli', country: 'Italia', lat: 40.85, lon: 14.27, note: 'città verticale e viscerale: centro antico UNESCO, Vomero, lungomare; la strada è metà dell\'esperienza' },
  { city: 'Milano', country: 'Italia', lat: 45.46, lon: 9.19, note: 'oltre Duomo e Navigli: design, cortili nascosti, quartieri nuovi; la metro accorcia tutto' },
  { city: 'Torino', country: 'Italia', lat: 45.07, lon: 7.69, note: 'eleganza sabauda, portici per 18 km, caffè storici, Museo Egizio; il Po e la collina cambiano il ritmo' },
  { city: 'Bologna', country: 'Italia', lat: 44.49, lon: 11.34, note: 'portici UNESCO, torri e la capitale gastronomica; tutto raggiungibile a piedi dal Nettuno' },
  { city: 'Palermo', country: 'Italia', lat: 38.12, lon: 13.36, note: 'arabo-normanno UNESCO, mercati urlati, liberty decadente; il caos è parte del fascino' },
  { city: 'Genova', country: 'Italia', lat: 44.41, lon: 8.93, note: 'il centro medievale più grande d\'Europa: caruggi, Rolli e porto; saliscendi con funicolari e ascensori' },
  { city: 'Verona', country: 'Italia', lat: 45.44, lon: 10.99, note: 'romana e scaligera in un\'ansa dell\'Adige; l\'Arena e i marmi rosa, ma anche le rive e le torricelle' },
  // ── Mondo ──
  { city: 'Parigi', country: 'Francia', lat: 48.86, lon: 2.35, note: 'arrondissement come cerchi di una spirale; musei giganti da dosare, la vita vera è nei quartieri e nei bistrot' },
  { city: 'Londra', country: 'Regno Unito', lat: 51.51, lon: -0.13, note: 'policentrica: ogni zona è una città; musei nazionali gratuiti, la Tube è cara ma capillare' },
  { city: 'Barcellona', country: 'Spagna', lat: 41.39, lon: 2.17, note: 'Gaudí da prenotare SEMPRE; Gotico, Gràcia e la spiaggia urbana; occhio ai borseggi sulla Rambla' },
  { city: 'Madrid', country: 'Spagna', lat: 40.42, lon: -3.7, note: 'il triangolo dell\'arte e la vita di quartiere (La Latina, Malasaña); orari spagnoli: si cena tardi' },
  { city: 'Lisbona', country: 'Portogallo', lat: 38.72, lon: -9.14, note: 'sette colline, tram storici e miradouros; Alfama e Belém da alternare con le salite giuste' },
  { city: 'Amsterdam', country: 'Paesi Bassi', lat: 52.37, lon: 4.9, note: 'canali UNESCO da girare a piedi o in bici; musei da prenotare, il Jordaan per la dimensione umana' },
  { city: 'Berlino', country: 'Germania', lat: 52.52, lon: 13.4, note: 'storia del Novecento a cielo aperto; distanze grandi, S-Bahn/U-Bahn indispensabili, quartieri con identità forti' },
  { city: 'Praga', country: 'Cechia', lat: 50.09, lon: 14.42, note: 'gotico e barocco intatti; il ponte Carlo all\'alba o mai, Vinohrady e Letná per uscire dal flusso' },
  { city: 'Vienna', country: 'Austria', lat: 48.21, lon: 16.37, note: 'imperiale e musicale; il Ring, i musei-gioiello e i caffè patrimonio UNESCO come istituzione sociale' },
  { city: 'Budapest', country: 'Ungheria', lat: 47.5, lon: 19.04, note: 'Buda collinare e Pest vitale divise dal Danubio; terme storiche da incastrare nell\'itinerario' },
  { city: 'Atene', country: 'Grecia', lat: 37.98, lon: 23.73, note: 'Acropoli all\'apertura per la luce e il fresco; Plaka e i quartieri veri (Koukaki, Exarchia) sotto' },
  { city: 'Istanbul', country: 'Turchia', lat: 41.01, lon: 28.97, note: 'due continenti, moschee attive (orari di preghiera!), bazar e traghetti sul Bosforo come mezzo e gita' },
  { city: 'New York', country: 'Stati Uniti', lat: 40.71, lon: -74.01, note: 'griglia di Manhattan + i borough; si cammina tantissimo, la metro 24h, i musei meritano mezze giornate' },
  { city: 'Tokyo', country: 'Giappone', lat: 35.68, lon: 139.69, note: 'costellazione di quartieri-mondo attorno alla Yamanote; contante ancora utile, silenzio sui treni' },
  { city: 'Kyoto', country: 'Giappone', lat: 35.01, lon: 135.77, note: 'duemila templi: sceglierne pochi e bene, alba o tramonto per Fushimi e Arashiyama; bus lenti, meglio treni' },
  { city: 'Bangkok', country: 'Thailandia', lat: 13.75, lon: 100.5, note: 'templi sfolgoranti e klong; il caldo detta i ritmi, spostamenti in barca e BTS contro il traffico' },
  { city: 'Singapore', country: 'Singapore', lat: 1.29, lon: 103.85, note: 'città-stato pulita e verticale: hawker centre patrimonio UNESCO, quartieri etnici, giardini futuristici' },
  { city: 'Dubai', country: 'Emirati Arabi Uniti', lat: 25.2, lon: 55.27, note: 'record e souk: alternare l\'iper-moderno al creek storico con gli abra; d\'estate si vive al coperto' },
  { city: 'Sydney', country: 'Australia', lat: -33.87, lon: 151.21, note: 'la baia è la protagonista: traghetti come attrazione, coastal walk, quartieri (Newtown, Surry Hills)' },
  { city: 'Marrakech', country: 'Marocco', lat: 31.63, lon: -8.01, note: 'la medina disorienta ed è il punto: perdersi con metodo, riad, souk e la piazza che cambia volto la sera' },
];

const ZONE_DAYS = [1, 2, 3] as const;

export function zoneDescriptors(): LibraryDescriptor[] {
  const out: LibraryDescriptor[] = [];
  for (const z of ZONE_CITIES) {
    for (const d of ZONE_DAYS) {
      for (const a of PORT_ZONE_ANGLES) {
        const brief = [
          a.brief,
          `CONTESTO CITTÀ: ${z.city}, ${z.country} — ${z.note}.`,
          `Durata: ${d} ${d === 1 ? 'giorno pieno' : 'giorni'}. ${
            d === 1
              ? 'Un solo giorno: selezione spietata, zero tempi morti, tutto in una zona compatta o lungo un asse solo.'
              : d === 2
                ? 'Due giorni: un giorno per l\'essenziale, il secondo per scendere in profondità nel taglio scelto.'
                : 'Tre giorni: ritmo umano, un quartiere diverso al giorno e almeno mezza giornata senza programma.'
          }`,
        ].join('\n');
        out.push({
          slug: `zone-${slugify(z.city)}-${d}g-${a.id}`,
          kind: 'zone',
          title: `${z.city} in ${d} ${d === 1 ? 'giorno' : 'giorni'} — ${a.label}`,
          city: z.city,
          country: z.country,
          coords: { lat: z.lat, lon: z.lon },
          days: d,
          angle: a.id,
          brief,
          ...(a.id === BOOKABLE_ANGLE.id ? { contextHints: { bookable: true } } : {}),
          // Taglio gastronomico: produttori e cantine reali dal nostro DB.
          ...(a.id === 'gastronomica' ? { contextHints: { osmGusto: true, osmWinery: true } } : {}),
        });
      }
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────
// 5-bis) ZONE MONDIALI — le mete più visitate del pianeta (WORLD_ZONES,
//    src/lib/libraryZonesWorld.ts) × 2 durate (2 e 3 giorni) × 8 angoli.
//    Regola committente: itinerari SEMPRE da 2-3 giorni, ABBINABILI tra
//    loro sulla stessa zona (chi resta 5 giorni prende il 3 giorni
//    "classica" + il 2 giorni "nascosta" e non rivede le stesse cose).
//    Le 30 città di ZONE_CITIES non sono ripetute qui: hanno già i loro
//    itinerari 1-2-3 giorni.
// ─────────────────────────────────────────────────────────────────────

const WORLD_ZONE_DAYS = [2, 3] as const;

/** Il blocco che rende gli itinerari della stessa zona componibili:
 *  entra in ogni brief e cambia in base al taglio. */
function combinabilityRule(angleId: string, city: string): string {
  const others = PORT_ZONE_ANGLES.filter(a => a.id !== angleId).map(a => a.label).join(', ');
  const base =
    `COMBINABILITÀ (vincolante): di ${city} esistono in biblioteca anche i tagli ${others}, ` +
    'da 2 e da 3 giorni. Questo itinerario deve reggersi da solo MA essere sommabile agli altri ' +
    'senza doppioni: chi lo abbina a un altro taglio non deve rivedere le stesse tappe.';
  return angleId === 'classica'
    ? `${base} Essendo il taglio CLASSICO, qui stanno i simboli imprescindibili: prendili tutti, sono gli altri tagli a doverli evitare.`
    : `${base} Dai per scontato che i 3-4 simboli più ovvi della città siano già coperti dal taglio "Classica": non costruire la giornata attorno a quelli, al massimo sfiorali di passaggio, e porta invece luoghi che nessun altro taglio userebbe.`;
}

export function worldZoneDescriptors(): LibraryDescriptor[] {
  const out: LibraryDescriptor[] = [];
  // Le città già coperte da ZONE_CITIES non vanno duplicate, e nessuno
  // slug può ripetersi (due zone con lo stesso nome slugificato). Le zone
  // aggiuntive (EXTRA_WORLD_ZONES e il secondo lotto EXTRA_WORLD_ZONES_2,
  // 22/08/2026) hanno la stessa forma di WORLD_ZONES e passano dallo stesso
  // taken-set: chi arriva prima nell'ordine dello spread vince, i doppioni
  // fra i lotti si scartano da soli.
  const taken = new Set(ZONE_CITIES.map(z => slugify(z.city)));
  for (const z of [...WORLD_ZONES, ...EXTRA_WORLD_ZONES, ...EXTRA_WORLD_ZONES_2]) {
    const key = slugify(z.c);
    if (taken.has(key)) continue;
    taken.add(key);
    for (const d of WORLD_ZONE_DAYS) {
      for (const a of PORT_ZONE_ANGLES) {
        const brief = [
          a.brief,
          `CONTESTO ZONA: ${z.c}, ${z.k} — ${z.n}.`,
          `Durata: ${d} giorni. ${
            d === 2
              ? 'Due giorni: il primo dà la spina dorsale del taglio scelto, il secondo scende in profondità o esce di un passo dal centro; niente tappe-riempitivo.'
              : 'Tre giorni: ritmo umano, una zona diversa al giorno, e almeno mezza giornata lenta senza programma fitto.'
          }`,
          combinabilityRule(a.id, z.c),
        ].join('\n');
        out.push({
          slug: `zone-${key}-${d}g-${a.id}`,
          kind: 'zone',
          title: `${z.c} in ${d} giorni — ${a.label}`,
          city: z.c,
          country: z.k,
          coords: { lat: z.lat, lon: z.lon },
          days: d,
          angle: a.id,
          brief,
          ...(a.id === BOOKABLE_ANGLE.id ? { contextHints: { bookable: true } } : {}),
          // Taglio gastronomico: produttori e cantine reali dal nostro DB.
          ...(a.id === 'gastronomica' ? { contextHints: { osmGusto: true, osmWinery: true } } : {}),
        });
      }
    }
  }
  return out;
}

/** Le zone mondiali ordinate per priorità di semina (tier 1 → 3), a parità
 *  di tier nell'ordine di catalogo (Italia, Francia, Spagna, resto). */
function worldZonesByTier(): WorldZone[] {
  return [...WORLD_ZONES].sort((a, b) => a.t - b.t);
}

// ─────────────────────────────────────────────────────────────────────
// 6) FILM — seed curato "film-first": ~150 titoli iconici mondiali di
//    tutte le epoche, ciascuno con le SUE location di ripresa reali e
//    verificabili citate per nome nel brief. Slug 'film-<titolo>'.
//    (I film raccolti in automatico da Wikidata usano invece
//    'film-<qid>' e vivono in api_cache, lato server.)
// ─────────────────────────────────────────────────────────────────────

interface FilmDef {
  /** Titolo col quale il film è noto in Italia. */
  t: string;
  /** Anno di uscita (prima stagione per le serie). */
  y: number;
  /** Città/area principale delle riprese visitabili. */
  city: string;
  country: string;
  lat: number;
  lon: number;
  /** Giorni dell'itinerario (default 1). */
  days?: number;
  /** 3-6 location REALI del film, per nome, con la scena girata lì. */
  locs: string;
  /** Nota di onestà (scene in studio, luoghi non visitabili) o aneddoto. */
  note?: string;
}

const FILMS: FilmDef[] = [
  // ── Italia (classici italiani + Hollywood in Italia) ──
  { t: 'Vacanze romane', y: 1953, city: 'Roma', country: 'Italia', lat: 41.9, lon: 12.48, locs: 'la Bocca della Verità a Santa Maria in Cosmedin (la mano "mangiata" di Gregory Peck), la scalinata di Trinità dei Monti (il gelato di Audrey), il Colosseo in Vespa, Castel Sant\'Angelo (la festa sul barcone e la rissa), la Galleria di Palazzo Colonna (la conferenza stampa dell\'addio)', note: 'fu il primo film americano girato interamente a Roma: raccontalo come una rivoluzione produttiva' },
  { t: 'La dolce vita', y: 1960, city: 'Roma', country: 'Italia', lat: 41.9, lon: 12.49, locs: 'la Fontana di Trevi (il bagno notturno di Anita Ekberg), via Veneto (il salotto dei paparazzi), la cupola di San Pietro (il Cristo in elicottero dell\'apertura), le Terme di Caracalla (la notte al locale)', note: 'la via Veneto del film fu in gran parte ricostruita a Cinecittà da Piero Gherardi: raccontalo passeggiando su quella vera' },
  { t: 'La grande bellezza', y: 2013, city: 'Roma', country: 'Italia', lat: 41.89, lon: 12.47, locs: 'il Fontanone del Gianicolo (l\'apertura col turista giapponese), il Tempietto del Bramante, il Giardino degli Aranci e il buco della serratura dei Cavalieri di Malta all\'Aventino, il Parco degli Acquedotti (l\'alba con le rovine)', note: 'le terrazze delle feste di Jep sono in palazzi privati con vista Colosseo: si raccontano dai punti pubblici giusti' },
  { t: 'Ladri di biciclette', y: 1948, city: 'Roma', country: 'Italia', lat: 41.89, lon: 12.5, locs: 'il mercato di Porta Portese e quello di piazza Vittorio (la caccia alla bicicletta rubata), il quartiere di Val Melaina (le case popolari dell\'inizio), l\'ex stadio Nazionale al Flaminio (la tentazione finale di Antonio)', note: 'neorealismo puro: strade vere, luce vera, attori presi dalla strada — il confronto ieri/oggi è il cuore del percorso' },
  { t: 'Roma città aperta', y: 1945, city: 'Roma', country: 'Italia', lat: 41.89, lon: 12.53, locs: 'via Raimondo Montecuccoli al Prenestino (la corsa e la morte di Pina, la scena più famosa del neorealismo), il Museo storico della Liberazione in via Tasso (il vero carcere nazista che il film racconta), il quartiere Prenestino-Casilino', note: 'girato nel 1945 tra le macerie vere della città appena liberata: tono grave e rispettoso' },
  { t: 'Il sorpasso', y: 1962, city: 'Castiglioncello', country: 'Italia', lat: 43.4, lon: 10.41, locs: 'Castiglioncello e il suo porticciolo (le sequenze balneari), la via Aurelia tra Castiglioncello e Calafuria (la strada del gran finale sulla Lancia Aurelia), i tornanti di Calafuria', note: 'il film parte da una Roma deserta di Ferragosto: qui si segue la seconda metà del viaggio' },
  { t: 'Il Gattopardo', y: 1963, city: 'Palermo', country: 'Italia', lat: 38.12, lon: 13.36, locs: 'Palazzo Valguarnera-Gangi (il ballo di 40 minuti, visitabile solo su prenotazione/eventi — dillo), Villa Boscogrande (il palazzo Salina), il borgo di Ciminna (la "Donnafugata" del film, a un\'ora)', note: 'Visconti pretese autenticità maniacale: biancheria vera nei cassetti mai aperti in scena' },
  { t: 'Il Padrino', y: 1972, city: 'Savoca', country: 'Italia', lat: 37.955, lon: 15.34, locs: 'il Bar Vitelli a Savoca (dove Michael chiede la mano di Apollonia, con i cimeli), la chiesa di San Nicolò a Savoca (le nozze), il borgo di Forza d\'Agrò (le scene di paese), il Castello degli Schiavi a Fiumefreddo (la villa della trilogia)', note: 'la vera Corleone era troppo moderna già nel 1971: Coppola scelse i borghi dei Peloritani — aneddoto da raccontare' },
  { t: 'Il Padrino - Parte III', y: 1990, city: 'Palermo', country: 'Italia', lat: 38.12, lon: 13.36, locs: 'il Teatro Massimo (la scalinata della Cavalleria rusticana e dell\'epilogo tragico), Villa Malfitano (gli interni nobiliari), la Cattedrale di Palermo', note: '' },
  { t: 'Nuovo Cinema Paradiso', y: 1988, city: 'Palazzo Adriano', country: 'Italia', lat: 37.68, lon: 13.38, locs: 'piazza Umberto I a Palazzo Adriano (la piazza del cinema Paradiso, con la fontana ottagonale e il museo dedicato al film), il molo di Cefalù (la proiezione all\'aperto sul mare), Bagheria (la Giancaldo natale di Tornatore)', note: 'il cinema Paradiso fu costruito in piazza come scenografia: il museo conserva foto e cimeli del set' },
  { t: 'Il postino', y: 1994, city: 'Procida', country: 'Italia', lat: 40.76, lon: 14.02, locs: 'Marina Corricella (la casa e le passeggiate di Mario con Neruda), la spiaggia del Pozzo Vecchio (oggi detta "spiaggia del Postino"), il borgo di Terra Murata; trasferta ideale: Pollara a Salina, Eolie (la casa di Neruda)', note: 'l\'ultimo film di Massimo Troisi, girato mentre era gravemente malato: tono affettuoso' },
  { t: 'Chiamami col tuo nome', y: 2017, city: 'Crema', country: 'Italia', lat: 45.36, lon: 9.68, locs: 'piazza del Duomo a Crema (l\'aperitivo e i giri in bici), Villa Albergoni a Moscazzano (la villa dei Perlman — privata, si ammira dall\'esterno), la campagna cremasca dei fontanili, Bergamo Alta e le cascate del Serio a Valbondione (la gita finale)', note: '' },
  { t: 'Il commissario Montalbano', y: 1999, city: 'Ragusa', country: 'Italia', lat: 36.93, lon: 14.72, days: 2, locs: 'la casa di Montalbano a Punta Secca (oggi B&B, con la terrazza sulla spiaggia), il municipio di Scicli diventato commissariato di Vigata, piazza Duomo a Ragusa Ibla, il castello di Donnafugata (la villa del boss Balduccio Sinagra)', note: 'la "Vigata" della serie è un collage del barocco ibleo: due giorni tra Ragusa, Scicli e la costa' },
  { t: 'Malèna', y: 2000, city: 'Siracusa', country: 'Italia', lat: 37.06, lon: 15.29, locs: 'piazza Duomo a Ortigia (la passeggiata di Monica Bellucci sotto gli sguardi del paese), il lungomare di Ortigia, i vicoli barocchi', note: 'la "Castelcutò" del film è un montaggio tra Siracusa e cittadine del Val di Noto: dillo' },
  { t: 'La vita è bella', y: 1997, city: 'Arezzo', country: 'Italia', lat: 43.46, lon: 11.88, locs: 'piazza Grande (le corse in bici di Guido), il Caffè dei Costanti (il caffè del film, in piazza San Francesco), Corso Italia e la Pieve di Santa Maria ("buongiorno principessa"), Badia delle Sante Flora e Lucilla', note: 'la seconda parte fu girata in set fuori Arezzo: qui si segue la metà luminosa del film' },
  { t: 'Amici miei', y: 1975, city: 'Firenze', country: 'Italia', lat: 43.776, lon: 11.248, locs: 'la stazione di Santa Maria Novella (la "supercazzola" degli schiaffi ai passeggeri in partenza, binari 9-10), le strade dell\'Oltrarno delle zingarate, piazza del Carmine', note: 'il bar Necchi era una scenografia: ispirato ai bar veri del centro, raccontalo' },
  { t: 'Totò, Peppino e la malafemmina', y: 1956, city: 'Milano', country: 'Italia', lat: 45.464, lon: 9.19, locs: 'piazza del Duomo (il "noio volevam savuar" al vigile, con colbacchi in piena estate), la Galleria Vittorio Emanuele II, la Stazione Centrale (l\'arrivo dei fratelli Caponi)', note: '' },
  { t: 'Morte a Venezia', y: 1971, city: 'Venezia', country: 'Italia', lat: 45.417, lon: 12.368, locs: 'il Grand Hotel des Bains al Lido (l\'albergo di Aschenbach — oggi chiuso, si ammira da fuori), la spiaggia del Lido con le capanne, piazza San Marco e il molo (gli arrivi in vaporetto)', note: '' },
  { t: 'Don Camillo', y: 1952, city: 'Brescello', country: 'Italia', lat: 44.9, lon: 10.51, locs: 'la piazza di Brescello con le statue di Peppone e don Camillo, la chiesa di Santa Maria Nascente (il Crocifisso "parlante": quello di scena è nel museo), il museo Peppone e Don Camillo, l\'argine del Po', note: '' },
  { t: 'Ladyhawke', y: 1985, city: 'Rocca Calascio', country: 'Italia', lat: 42.33, lon: 13.69, locs: 'la Rocca di Calascio (il castello dell\'incontro tra Navarre e Isabeau), l\'altopiano di Campo Imperatore (le cavalcate), il borgo di Santo Stefano di Sessanio', note: 'altre scene ai castelli di Torrechiara e Soncino, in Emilia-Lombardia: citali come estensione, non come tappe' },
  { t: 'Il talento di Mr. Ripley', y: 1999, city: 'Ischia', country: 'Italia', lat: 40.73, lon: 13.95, locs: 'Ischia Ponte col Castello Aragonese (la "Mongibello" di Dickie, insieme a Procida), Marina Corricella a Procida (la piazzetta e il bar del paese), il porto di Ischia (le barche e le partenze di Dickie e Tom)', note: 'Mongibello non esiste: è un collage di Ischia e Procida — il gioco è riconoscere i pezzi' },
  { t: 'Angeli e demoni', y: 2009, city: 'Roma', country: 'Italia', lat: 41.91, lon: 12.47, locs: 'piazza del Popolo e la cappella Chigi in Santa Maria del Popolo (il primo "altare della scienza"), la fontana dei Quattro Fiumi a piazza Navona (l\'acqua), il Pantheon, Castel Sant\'Angelo e il Passetto di Borgo', note: 'il Vaticano negò i permessi: San Pietro e i musei furono ricostruiti in studio e in digitale — dillo' },
  { t: 'Spectre', y: 2015, city: 'Roma', country: 'Italia', lat: 41.89, lon: 12.47, locs: 'i lungotevere dell\'inseguimento notturno Aston Martin-Jaguar fino a ponte Sisto, il Museo della Civiltà Romana all\'EUR (l\'esterno del funerale), ponte Umberto I (la discesa in Tevere)', note: '' },
  { t: 'No Time to Die', y: 2021, city: 'Matera', country: 'Italia', lat: 40.666, lon: 16.61, locs: 'i Sassi e via Madonna delle Virtù (l\'inseguimento con la DB5 e le sgommate in piazza), il belvedere di Murgia Timone (la vista sui Sassi "da film"), il ponte acquedotto di Gravina in Puglia (il lancio col cavo dell\'apertura, a 25 km)', note: '' },
  { t: 'Casino Royale', y: 2006, city: 'Venezia', country: 'Italia', lat: 45.437, lon: 12.33, locs: 'il Canal Grande (l\'arrivo in barca a vela con Vesper), piazza San Marco, il mercato di Rialto', note: 'il palazzo che affonda fu un set galleggiante costruito in bacino: nessun palazzo vero crollò — dillo; la convalescenza finale è a Villa del Balbianello, lago di Como (trasferta da citare)' },
  { t: 'Star Wars: la Reggia di Caserta', y: 1999, city: 'Caserta', country: 'Italia', lat: 41.073, lon: 14.327, locs: 'lo scalone d\'onore e gli appartamenti reali della Reggia di Caserta (gli interni del palazzo di Theed su Naboo negli Episodi I e II), il parco reale e le fontane, il giardino inglese', note: 'gli esterni di Naboo sono digitali o al lago di Como (Villa del Balbianello, il matrimonio di Anakin e Padmé): citali come estensione' },
  { t: 'È stata la mano di Dio', y: 2021, city: 'Napoli', country: 'Italia', lat: 40.84, lon: 14.25, locs: 'la Galleria Umberto I, il lungomare di via Caracciolo (i giri in motorino di Fabietto), lo stadio Maradona a Fuorigrotta (il tempio del Napoli di Diego), piazza del Plebiscito', note: '' },
  { t: 'Gomorra - La serie', y: 2014, city: 'Napoli', country: 'Italia', lat: 40.9, lon: 14.24, locs: 'le Vele di Scampia (in parte demolite: il racconto ieri/oggi si fa dal quartiere nuovo, con rispetto per chi ci vive), il centro storico di Napoli (i vicoli delle riprese), San Giovanni a Teduccio', note: 'tono documentario e rispettoso: niente voyeurismo, molto contesto sociale e sulla rigenerazione in corso' },
  { t: 'L\'amica geniale', y: 2018, city: 'Napoli', country: 'Italia', lat: 40.85, lon: 14.27, locs: 'il Rione Luzzatti (il rione vero di Elena Ferrante — il set fu però ricostruito a Caserta, dillo), piazza dei Martiri (il negozio Solara dei libri), il centro storico, la spiaggia dei Maronti a Ischia (l\'estate di Lenù — trasferta)', note: '' },
  { t: 'Benvenuti al Sud', y: 2010, city: 'Castellabate', country: 'Italia', lat: 40.28, lon: 14.95, locs: 'il borgo di Castellabate col belvedere San Costabile ("qui non si muore": la targa c\'è davvero), la "posta" del film nel centro storico, Santa Maria di Castellabate col porto delle Gatte e la spiaggia', note: '' },
  { t: 'Mediterraneo', y: 1991, city: 'Kastellorizo', country: 'Grecia', lat: 36.15, lon: 29.59, locs: 'il porto e i vicoli di Megisti a Kastellorizo (dove fu girato quasi tutto il film premio Oscar), la piazza della chiesa di Agios Konstantinos, i belvedere sull\'isola', note: 'l\'isola si raggiunge da Rodi o dalla turca Kaş: logistica da spiegare onestamente' },
  { t: 'Stromboli (Terra di Dio)', y: 1950, city: 'Stromboli', country: 'Italia', lat: 38.8, lon: 15.23, locs: 'il borgo di San Vincenzo coi vicoli bianchi, la casa di Ingrid Bergman con la targa, la Sciara del Fuoco vista dal mare in barca, la salita guidata verso il cratere', note: 'il film dello scandalo Rossellini-Bergman: l\'eruzione nel film è quella vera del 1949' },
  { t: 'The White Lotus (stagione 2)', y: 2022, city: 'Taormina', country: 'Italia', lat: 37.852, lon: 15.287, locs: 'il San Domenico Palace (l\'hotel della serie, oggi Four Seasons: si entra almeno per un caffè se ospiti/eventi lo consentono — sennò dillo), piazza IX Aprile e corso Umberto, l\'Isola Bella, il Teatro Antico', note: '' },
  { t: 'The Italian Job', y: 1969, city: 'Torino', country: 'Italia', lat: 45.07, lon: 7.69, locs: 'la pista sul tetto del Lingotto (l\'inseguimento delle Mini Cooper), piazza San Carlo e i portici (le fughe nel traffico "organizzato"), la scalinata della Gran Madre di Dio, il Palavela (il salto sul tetto)', note: '' },
  { t: 'Eat Pray Love', y: 2010, city: 'Roma', country: 'Italia', lat: 41.899, lon: 12.473, locs: 'piazza Navona, il quartiere di Trastevere (le passeggiate "del piacere"), la Barcaccia a piazza di Spagna; trasferta golosa: L\'Antica Pizzeria da Michele a Napoli (la pizza di Julia Roberts, con la fila vera)', note: '' },
  { t: 'Camera con vista', y: 1985, city: 'Firenze', country: 'Italia', lat: 43.77, lon: 11.25, locs: 'piazza della Signoria (lo svenimento di Lucy dopo l\'accoltellamento), la basilica di Santa Croce (la visita "senza Baedeker"), il lungarno con la vista della pensione Bertolini, le colline verso Fiesole (il bacio nel campo di grano)', note: '' },
  { t: 'Letters to Juliet', y: 2010, city: 'Verona', country: 'Italia', lat: 45.44, lon: 10.99, locs: 'il cortile e il balcone della Casa di Giulietta (il muro delle lettere e le "segretarie di Giulietta", che esistono davvero), piazza delle Erbe, piazza dei Signori, le colline del vino veronese (le scene in campagna)', note: '' },
  { t: 'Il paziente inglese', y: 1996, city: 'Pienza', country: 'Italia', lat: 43.08, lon: 11.68, locs: 'il monastero di Sant\'Anna in Camprena (il convento dove Hana accudisce il paziente: si visita e ci si dorme), Pienza e i belvedere della Val d\'Orcia, la campagna delle crete', note: 'le scene "africane" furono girate in Tunisia: qui si segue il filo toscano del film' },
  { t: 'Don Matteo', y: 2000, city: 'Gubbio', country: 'Italia', lat: 43.35, lon: 12.57, locs: 'piazza Grande col Palazzo dei Consoli, la chiesa di San Giovanni (la canonica delle prime stagioni), corso Garibaldi (le pedalate di don Matteo); estensione: Spoleto (piazza Duomo e Rocca Albornoziana, le stagioni recenti)', note: '' },
  // ── Europa ──
  { t: 'Notting Hill', y: 1999, city: 'Londra', country: 'Regno Unito', lat: 51.512, lon: -0.2, locs: 'Portobello Road col mercato (le passeggiate di William/Hugh Grant nelle quattro stagioni), la porta blu al 280 di Westbourne Park Road (la casa del film), la libreria di viaggio (l\'insegna "The Travel Book Shop" ispirata alla libreria vera di Blenheim Crescent), i giardini privati di Rosmead Gardens (la scalata notturna del cancello con Julia Roberts — si guardano da fuori)', note: '' },
  { t: 'Harry Potter a Londra', y: 2001, city: 'Londra', country: 'Regno Unito', lat: 51.51, lon: -0.11, locs: 'la stazione di King\'s Cross (il binario 9¾ col carrello nel muro e il negozio ufficiale), il Leadenhall Market (l\'ingresso del Paiolo Magico verso Diagon Alley), il Millennium Bridge (distrutto dai Mangiamorte nel Principe Mezzosangue), l\'Australia House sullo Strand (gli interni della banca Gringott — non visitabile: si ammira l\'esterno), Piccadilly Circus (la fuga dei tre nei Doni della Morte)', note: '' },
  { t: 'Harry Potter: Alnwick e Durham', y: 2001, city: 'Alnwick', country: 'Regno Unito', lat: 55.415, lon: -1.706, locs: 'il castello di Alnwick (la prima lezione di volo di Harry/Daniel Radcliffe con Madama Bumb; oggi ci si allena con la scopa nei "broomstick training"), i chiostri della cattedrale di Durham (i corridoi di Hogwarts, a 40 minuti)', note: '' },
  { t: 'Harry Potter nelle Highlands', y: 2002, city: 'Fort William', country: 'Regno Unito', lat: 56.82, lon: -5.11, locs: 'il viadotto di Glenfinnan (il passaggio dell\'Hogwarts Express: il treno a vapore Jacobite ci passa davvero, orari da incastrare), il Loch Shiel (il Lago Nero), la valle di Glencoe (la zona della capanna di Hagrid nel Prigioniero di Azkaban), le Steall Falls di Glen Nevis (il Torneo Tremaghi)', note: '' },
  { t: 'Skyfall in Scozia', y: 2012, city: 'Glencoe', country: 'Regno Unito', lat: 56.68, lon: -5.1, locs: 'la strada single-track di Glen Etive (la sosta di Bond/Daniel Craig e M/Judi Dench con l\'Aston Martin DB5 davanti alla valle), il belvedere delle Three Sisters di Glencoe, il Glencoe Visitor Centre', note: 'la tenuta Skyfall non esiste: fu un set costruito in Inghilterra — dillo ai fan che la cercano' },
  { t: 'Trainspotting', y: 1996, city: 'Edimburgo', country: 'Regno Unito', lat: 55.95, lon: -3.19, locs: 'Princes Street (la corsa iniziale di Renton/Ewan McGregor su Lust for Life), Calton Road (dove la corsa finisce sotto il ponte), i pub della Old Town', note: 'gran parte degli interni (e il "peggior cesso di Scozia") fu girata a Glasgow: onestà da cinefili' },
  { t: 'Monty Python e il Sacro Graal', y: 1975, city: 'Doune', country: 'Regno Unito', lat: 56.185, lon: -4.05, locs: 'il castello di Doune (quasi tutti i castelli del film: le guardie francesi sprezzanti, "Camelot... it\'s only a model" — con l\'audioguida registrata da Terry Jones e le noci di cocco in prestito alla biglietteria), il castello di Stalker visto da Appin ("Castle Aaargh", trasferta panoramica)', note: '' },
  { t: 'Outlander', y: 2014, city: 'Culross', country: 'Regno Unito', lat: 56.056, lon: -3.63, locs: 'il borgo di Culross (la Cranesmuir della serie, coi vicoli color ocra), Blackness Castle (il Fort William delle punizioni di Black Jack), Midhope Castle (l\'esterno di Lallybroch, pellegrinaggio dei fan), il castello di Doune (Castle Leoch)', note: '' },
  { t: 'Downton Abbey', y: 2010, city: 'Highclere', country: 'Regno Unito', lat: 51.33, lon: -1.36, locs: 'Highclere Castle (la Downton vera dei Crawley: aperta in stagione, prenotare con largo anticipo), il villaggio di Bampton nell\'Oxfordshire (il "villaggio di Downton": la chiesa di St Mary e la biblioteca diventata ospedale)', note: '' },
  { t: 'Orgoglio e pregiudizio', y: 2005, city: 'Bakewell', country: 'Regno Unito', lat: 53.21, lon: -1.68, locs: 'Chatsworth House (la Pemberley di Mr Darcy: la galleria delle sculture della scena col busto), Stanage Edge (Elizabeth/Keira Knightley sulla rupe nel vento), Haddon Hall (la locanda di Lambton), il villaggio di Bakewell (la Meryton del film)', note: '' },
  { t: 'Doc Martin', y: 2004, city: 'Port Isaac', country: 'Regno Unito', lat: 50.593, lon: -4.83, locs: 'il villaggio di Port Isaac in Cornovaglia (la "Portwenn" della serie), il Fern Cottage sul porto (l\'ambulatorio del dottor Martin Ellingham, si riconosce dalla salita), il porto e la baia', note: '' },
  { t: 'Il codice Da Vinci', y: 2006, city: 'Parigi', country: 'Francia', lat: 48.861, lon: 2.336, locs: 'la piramide e la Grande Galleria del Louvre (il Louvre concesse riprese notturne vere per il delitto di Saunière), la chiesa di Saint-Sulpice (con la targa che smentisce la leggenda della "Rose Line" — da leggere sul posto), il Ritz di place Vendôme (l\'albergo di Langdon/Tom Hanks)', note: '' },
  { t: 'Il favoloso mondo di Amélie', y: 2001, city: 'Parigi', country: 'Francia', lat: 48.887, lon: 2.334, locs: 'il Café des Deux Moulins in rue Lepic (il bancone dove Amélie/Audrey Tautou fa la cameriera: ancora aperto, crème brûlée d\'ordinanza), la drogheria "Au Marché de la Butte" in rue des Trois Frères (la bottega di Collignon, con l\'insegna del film), la giostra ai piedi del Sacré-Cœur e i cannocchiali (la caccia al tesoro), il canal Saint-Martin (il lancio dei sassi piatti)', note: '' },
  { t: 'Midnight in Paris', y: 2011, city: 'Parigi', country: 'Francia', lat: 48.85, lon: 2.35, locs: 'la scalinata di Saint-Étienne-du-Mont (dove la Peugeot d\'epoca raccoglie Gil/Owen Wilson a mezzanotte), il pont Alexandre III (la passeggiata finale sotto la pioggia), il museo Rodin (la guida gelosa di Rodin), la libreria Shakespeare and Company', note: '' },
  { t: 'Inception', y: 2010, city: 'Parigi', country: 'Francia', lat: 48.855, lon: 2.289, locs: 'il pont de Bir-Hakeim (la scena degli specchi di Ariadne/Elliot Page con la Tour Eiffel sullo sfondo), l\'angolo tra rue César Franck e rue Bouchut (il café dell\'esplosione al rallentatore), il Trocadéro', note: 'il "ripiegamento" di Parigi è digitale: qui si riconoscono le inquadrature di partenza' },
  { t: 'Emily in Paris', y: 2020, city: 'Parigi', country: 'Francia', lat: 48.845, lon: 2.348, locs: 'place de l\'Estrapade (la casa di Emily e la piazzetta), il ristorante Terra Nera (il "Chez Gabriel" della serie, si mangia davvero), il Panthéon a due passi, i giardini del Palais-Royal (le colonne di Buren dei servizi social di Emily)', note: '' },
  { t: 'Lupin', y: 2021, city: 'Parigi', country: 'Francia', lat: 48.861, lon: 2.336, locs: 'il Louvre (il furto della collana della regina di Assane/Omar Sy), il théâtre du Châtelet (l\'asta), place Vendôme; trasferta letteraria: le falesie di Étretat con l\'Aiguille creuse (il finale di stagione nel regno di Arsène Lupin)', note: '' },
  { t: 'Giù al Nord', y: 2008, city: 'Bergues', country: 'Francia', lat: 50.97, lon: 2.43, locs: 'il beffroi di Bergues (il giro del carillon di Antoine/Dany Boon), la piazza col municipio, la baraque à frites (il rito delle patatine col maroilles come nel film)', note: '' },
  { t: 'Chocolat', y: 2000, city: 'Flavigny-sur-Ozerain', country: 'Francia', lat: 47.51, lon: 4.52, locs: 'il borgo di Flavigny (la "Lansquenet" di Vianne/Juliette Binoche), la piazza della chiesa di Saint-Genest (dove fu allestita la vetrina della chocolaterie), la fabbrica vera degli Anis de Flavigny nell\'antica abbazia (visita e spaccio)', note: '' },
  { t: 'Un\'ottima annata', y: 2006, city: 'Bonnieux', country: 'Francia', lat: 43.82, lon: 5.31, locs: 'lo Château La Canorgue (la tenuta "La Siroque" di Max/Russell Crowe: cantina bio vera, degustazione possibile), il borgo di Bonnieux e Gordes, la piazza con la vasca di Cucuron (il ristorante di Fanny Chenal/Marion Cotillard)', note: '' },
  { t: 'Caccia al ladro', y: 1955, city: 'Nizza', country: 'Francia', lat: 43.7, lon: 7.27, locs: 'il mercato dei fiori di cours Saleya (la fuga iniziale di Cary Grant), la Grande Corniche (l\'inseguimento in decappottabile con Grace Kelly), il Carlton di Cannes (l\'hotel del film, riconoscibilissimo dalla Croisette)', note: 'i tornanti sopra Monaco sono legati anche alla memoria vera di Grace Kelly: tono sobrio' },
  { t: 'Le Grand Bleu', y: 1988, city: 'Amorgos', country: 'Grecia', lat: 36.83, lon: 25.9, locs: 'il monastero di Hozoviotissa incastonato nella falesia (la scalinata bianca del film di Luc Besson), la baia di Agia Anna (i tuffi di Jacques/Jean-Marc Barr ed Enzo/Jean Reno), la Chora di Amorgos', note: '' },
  { t: 'Zorba il greco', y: 1964, city: 'Chania', country: 'Grecia', lat: 35.59, lon: 24.08, locs: 'la spiaggia di Stavros sulla penisola di Akrotiri (il sirtaki finale di Anthony Quinn e Alan Bates sotto la montagna della teleferica), il porto veneziano di Chania, la penisola di Akrotiri', note: '' },
  { t: 'Mamma Mia!', y: 2008, city: 'Skopelos', country: 'Grecia', lat: 39.12, lon: 23.73, locs: 'la chiesetta di Agios Ioannis sto Kastri (il matrimonio in cima ai ~200 scalini sullo sperone), la spiaggia di Kastani (i balli di Sophie e Sky), il porto e la Chora di Skopelos', note: 'la villa di Donna/Meryl Streep era un set: gli esterni "di casa" furono girati anche a Damouchari sul Pelion — dillo' },
  { t: 'Mamma Mia! Ci risiamo', y: 2018, city: 'Vis', country: 'Croazia', lat: 43.06, lon: 16.18, locs: 'l\'isola di Vis diventata "Kalokairi" (la Grecia del primo film qui è Croazia: dillo), il porto di Komiža, la spiaggia di Stiniva, la città di Vis', note: '' },
  { t: 'Il capitano Corelli', y: 2001, city: 'Sami', country: 'Grecia', lat: 38.25, lon: 20.64, locs: 'la baia di Antisamos (l\'accampamento italiano del film con Nicolas Cage e Penélope Cruz), il porto di Sami (l\'"Argostoli" ricostruita per le riprese), il belvedere sulla spiaggia di Myrtos', note: 'storia vera e tragica della divisione Acqui a Cefalonia: accanto al film, il memoriale merita rispetto' },
  { t: 'Solo per i tuoi occhi', y: 1981, city: 'Kalambaka', country: 'Grecia', lat: 39.72, lon: 21.63, locs: 'il monastero della Santissima Trinità (Agia Triada) alle Meteore (la scalata finale di Bond/Roger Moore), i belvedere delle Meteore, Kalambaka e Kastraki', note: '' },
  { t: 'Il Trono di Spade a Dubrovnik', y: 2011, city: 'Dubrovnik', country: 'Croazia', lat: 42.64, lon: 18.11, locs: 'il forte Lovrijenac (la Fortezza Rossa dei tornei di Approdo del Re), lo Stradun e la scalinata dei Gesuiti (la Camminata dell\'espiazione di Cersei/Lena Headey), la torre Minčeta (la Casa degli Eterni a Qarth), l\'isola di Lokrum (i giardini di Qarth, col trono-replica su cui sedersi), Porta Pile (la rivolta contro Joffrey)', note: '' },
  { t: 'Il Trono di Spade a Siviglia', y: 2015, city: 'Siviglia', country: 'Spagna', lat: 37.38, lon: -5.99, locs: 'il Real Alcázar (i Giardini dell\'Acqua di Dorne dei Martell), le rovine romane di Italica a Santiponce (la Fossa del Drago dei summit finali), la Casa de Pilatos (gli interni dorniani)', note: '' },
  { t: 'Il Trono di Spade a Girona', y: 2016, city: 'Girona', country: 'Spagna', lat: 41.987, lon: 2.825, locs: 'la scalinata della cattedrale di Girona (il Grande Tempio di Baelor e la marcia di Jaime a cavallo), il call ebraico e i vicoli del Barri Vell (le strade di Braavos dove Arya cieca mendica), le mura carolinge', note: '' },
  { t: 'In Bruges - La coscienza dell\'assassino', y: 2008, city: 'Bruges', country: 'Belgio', lat: 51.209, lon: 3.225, locs: 'il Belfort sul Markt (il campanile che Ken/Brendan Gleeson sale e da cui tutto precipita nel finale), il canale dal Rozenhoedkaai (i giri in barca di Ray/Colin Farrell), il Groeningemuseum (il Giudizio Universale di Bosch commentato dai due killer), la piazza Burg', note: '' },
  { t: 'Grand Budapest Hotel', y: 2014, city: 'Görlitz', country: 'Germania', lat: 51.153, lon: 14.99, locs: 'il Görlitzer Warenhaus (i grandi magazzini liberty trasformati nell\'atrio dell\'hotel di Gustave H/Ralph Fiennes — apertura variabile, dillo), l\'Untermarkt coi portici (le strade di Lutz), e a Dresda la Pfunds Molkerei ("la latteria più bella del mondo", la pasticceria Mendl\'s) e lo Zwinger (il museo dell\'inseguimento)', note: 'l\'hotel non esiste come edificio unico: Wes Anderson lo assemblò tra Görlitz e i modellini — raccontalo' },
  { t: 'Le vite degli altri', y: 2006, city: 'Berlino', country: 'Germania', lat: 52.515, lon: 13.44, locs: 'la sede della Stasi in Normannenstraße (oggi Stasimuseum: gli uffici d\'epoca del mondo di Wiesler/Ulrich Mühe), la Karl-Marx-Allee (i viali della DDR del film), il memoriale del carcere di Hohenschönhausen (il contesto vero degli interrogatori)', note: 'tono sobrio: il film è finzione, i luoghi della sorveglianza sono storia vera' },
  { t: 'Good Bye, Lenin!', y: 2003, city: 'Berlino', country: 'Germania', lat: 52.52, lon: 13.42, locs: 'la Karl-Marx-Allee (i palazzi monumentali della DDR di Alex/Daniel Brühl), Alexanderplatz con la Fernsehturm (l\'elicottero che porta via la statua di Lenin fu girato in zona: la statua non c\'è più, dillo), il quartiere di Friedrichshain', note: '' },
  { t: 'Il ponte delle spie', y: 2015, city: 'Potsdam', country: 'Germania', lat: 52.41, lon: 13.06, locs: 'il ponte di Glienicke tra Berlino e Potsdam (il vero "ponte delle spie" degli scambi di prigionieri, dove Spielberg ha girato davvero la scena con Tom Hanks), gli studi di Babelsberg (i più antichi del mondo), il centro di Potsdam', note: '' },
  { t: 'Il terzo uomo', y: 1949, city: 'Vienna', country: 'Austria', lat: 48.21, lon: 16.37, locs: 'la ruota panoramica del Prater (il monologo del "cucù svizzero" di Harry Lime/Orson Welles), il portone al n. 8 della Mölker Bastei (dove Lime appare nell\'ombra col gatto), le fogne di Vienna (si visitano col Third Man Tour ufficiale), lo Zentralfriedhof (il viale dei funerali che apre e chiude il film)', note: '' },
  { t: 'Prima dell\'alba (Before Sunrise)', y: 1995, city: 'Vienna', country: 'Austria', lat: 48.21, lon: 16.38, locs: 'la ruota del Prater (il primo bacio di Jesse/Ethan Hawke e Céline/Julie Delpy), il Café Sperl (la telefonata immaginaria), il ponte Zollamtssteg (l\'inizio della passeggiata), il Kleines Café in Franziskanerplatz, il Friedhof der Namenlosen (il cimitero dei senza nome)', note: '' },
  { t: 'La principessa Sissi', y: 1955, city: 'Vienna', country: 'Austria', lat: 48.185, lon: 16.313, locs: 'il castello di Schönbrunn (le scene di corte della trilogia con Romy Schneider girate nelle sale vere), la Hofburg (il mondo di Francesco Giuseppe), il Sisi Museum (la Sissi vera contro quella del film: confronto perfetto)', note: 'molti interni furono ricostruiti in studio a Vienna: il museo aiuta a separare mito e realtà' },
  { t: 'Tutti insieme appassionatamente', y: 1965, city: 'Salisburgo', country: 'Austria', lat: 47.8, lon: 13.04, locs: 'i giardini di Mirabell con la scalinata (il finale di Do-Re-Mi di Julie Andrews), il gazebo di "Sixteen Going on Seventeen" al parco di Hellbrunn, la fontana della Residenzplatz, l\'abbazia di Nonnberg (il convento vero di Maria), la Felsenreitschule (il festival dell\'addio), il palazzo di Leopoldskron (il lago della barca rovesciata)', note: '' },
  { t: 'Amadeus', y: 1984, city: 'Praga', country: 'Cechia', lat: 50.088, lon: 14.42, locs: 'il Teatro degli Stati (dove Forman girò le scene d\'opera: qui il VERO Don Giovanni di Mozart debuttò nel 1787), i vicoli di Malá Strana (la Vienna settecentesca del film), il Castello e Hradčany', note: '' },
  { t: 'Schindler\'s List', y: 1993, city: 'Cracovia', country: 'Polonia', lat: 50.05, lon: 19.95, locs: 'la Fabbrica di Schindler in ulica Lipowa (oggi museo, con la storia vera di Oskar Schindler/Liam Neeson), il quartiere di Kazimierz (dove Spielberg girò le scene del ghetto — il ghetto storico era però a Podgórze: dillo), la piazza Bohaterów Getta con le sedie-memoriale', note: 'tono grave e rispettoso, come per i luoghi della memoria: niente checklist allegre' },
  { t: 'La casa di carta', y: 2017, city: 'Madrid', country: 'Spagna', lat: 40.44, lon: -3.69, locs: 'la facciata della sede del CSIC in calle Serrano (la "Zecca di Stato" della serie del Professore), la vera Fábrica Nacional de Moneda y Timbre (il confronto con quella vera), plaza de Callao e la Gran Vía (le scene di massa coi murales di Dalí)', note: '' },
  { t: 'Vicky Cristina Barcelona', y: 2008, city: 'Barcellona', country: 'Spagna', lat: 41.39, lon: 2.16, locs: 'il Parc Güell (le passeggiate col Gaudí di Juan Antonio/Javier Bardem), Els Quatre Gats (la cena modernista), il Tibidabo con le giostre d\'epoca, la Fundació Miró', note: '' },
  { t: 'Il buono, il brutto e il cattivo', y: 1966, city: 'Santo Domingo de Silos', country: 'Spagna', lat: 41.96, lon: -3.42, locs: 'il cimitero di Sad Hill a Contreras (l\'arena circolare del triello di Leone con Eastwood, Van Cleef e Wallach: ricostruita nel 2015 dai volontari — storia bellissima da raccontare), il monastero di Santo Domingo de Silos, il piccolo museo di Sad Hill', note: 'colonna sonora di Morricone d\'ordinanza arrivando al centro dell\'arena' },
  { t: 'Per qualche dollaro in più', y: 1965, city: 'Tabernas', country: 'Spagna', lat: 37.05, lon: -2.39, locs: 'il deserto di Tabernas (l\'unico deserto d\'Europa, casa del western all\'italiana), il set di Mini Hollywood-Oasys (costruito come "El Paso" proprio per questo film di Leone, con stuntman e saloon), Fort Bravo/Texas Hollywood, il villaggio di Los Albaricoques (il duello finale)', note: '' },
  { t: 'Dunkirk', y: 2017, city: 'Dunkerque', country: 'Francia', lat: 51.04, lon: 2.38, locs: 'la spiaggia di Malo-les-Bains (Nolan ha girato l\'evacuazione sulla spiaggia vera del 1940), la jetée Est (il molo delle file di soldati), il museo Dunkerque 1940 - Operazione Dynamo', note: 'tono rispettoso: il film è spettacolo, la storia dell\'Operazione Dynamo è vera' },
  { t: 'Braveheart in Irlanda', y: 1995, city: 'Trim', country: 'Irlanda', lat: 53.555, lon: -6.79, locs: 'il castello di Trim (la "York" assediata e molte scene di battaglia: il colossal scozzese di Mel Gibson fu girato soprattutto in Irlanda, con l\'esercito di riservisti irlandesi come comparse — aneddoto d\'obbligo), la valle del Boyne, il borgo di Trim', note: '' },
  { t: 'Un uomo tranquillo', y: 1952, city: 'Cong', country: 'Irlanda', lat: 53.54, lon: -9.29, locs: 'il villaggio di Cong (la "Innisfree" di John Ford, col museo-cottage replica), il Pat Cohan\'s (il pub della scazzottata di John Wayne, oggi pub vero dove mangiare), l\'abbazia di Cong, Ashford Castle (le scene nel parco e la base della troupe)', note: '' },
  { t: 'Star Wars a Skellig Michael', y: 2015, city: 'Portmagee', country: 'Irlanda', lat: 51.887, lon: -10.37, locs: 'l\'isola di Skellig Michael (l\'eremo di Luke Skywalker: le celle ad alveare dei monaci del VI secolo — sbarchi contingentati e meteo-dipendenti, prenotare mesi prima; in alternativa la crociera senza sbarco), le scogliere di Kerry, il porto di Portmagee coi pub dei set', note: '' },
  { t: 'GoldenEye', y: 1995, city: 'Valle Verzasca', country: 'Svizzera', lat: 46.184, lon: 8.852, locs: 'la diga di Contra in Val Verzasca (il bungee jump d\'apertura di Bond/Pierce Brosnan, votato tra gli stunt più belli di sempre: il "007 Jump" si fa davvero), Lavertezzo col ponte dei Salti, Locarno', note: '' },
  { t: 'Agente 007 - Al servizio segreto di Sua Maestà', y: 1969, city: 'Mürren', country: 'Svizzera', lat: 46.56, lon: 7.89, locs: 'il Piz Gloria sullo Schilthorn (il ristorante girevole diventato il covo di Blofeld, oggi con la mostra Bond World e la colazione 007), la funivia da Stechelberg, il villaggio senz\'auto di Mürren, la valle di Lauterbrunnen', note: '' },
  { t: 'Interstellar', y: 2014, city: 'Skaftafell', country: 'Islanda', lat: 64.016, lon: -16.97, locs: 'il ghiacciaio Svínafellsjökull (il pianeta di ghiaccio del dottor Mann/Matt Damon: si ammira dai sentieri segnati, sul ghiaccio solo con guida), il parco di Skaftafell, la piana glaciale (il pianeta d\'acqua fu girato in zona)', note: '' },
  { t: 'I sogni segreti di Walter Mitty', y: 2013, city: 'Seyðisfjörður', country: 'Islanda', lat: 65.26, lon: -14.01, locs: 'la strada 93 verso Seyðisfjörður (la discesa in longboard di Ben Stiller, una delle scene più imitate del decennio), il paese coi suoi tetti colorati, Stykkishólmur (il porto che "recita" la Groenlandia — trasferta lunga, dillo)', note: 'nel film l\'Islanda interpreta anche Groenlandia e Afghanistan: onestà geografica' },
  { t: 'Skyfall a Istanbul', y: 2012, city: 'Istanbul', country: 'Turchia', lat: 41.01, lon: 28.97, locs: 'il Gran Bazar (l\'inseguimento in moto sui tetti veri del bazar), Eminönü e la Yeni Cami (le corse nel traffico), il quartiere di Sultanahmet; il salto dal treno fu girato sul viadotto di Varda vicino Adana (trasferta lontana: solo da citare)', note: '' },
  // ── Americhe ──
  { t: 'Colazione da Tiffany', y: 1961, city: 'New York', country: 'Stati Uniti', lat: 40.763, lon: -73.974, locs: 'la vetrina di Tiffany & Co. sulla Fifth Avenue (Holly/Audrey Hepburn col croissant e il caffè all\'alba), il brownstone di Holly al 169 East 71st Street (esterno privato: rispetto per i residenti), la New York Public Library (la dedica sul libro), Central Park', note: '' },
  { t: 'C\'era una volta in America', y: 1984, city: 'New York', country: 'Stati Uniti', lat: 40.703, lon: -73.99, locs: 'il Manhattan Bridge visto da Washington Street a Dumbo (l\'inquadratura-manifesto di Sergio Leone), le strade del Lower East Side (il quartiere dei ragazzi, in parte ricostruito a Brooklyn — dillo), il Tenement Museum (il contesto vero dell\'infanzia di Noodles/Robert De Niro)', note: '' },
  { t: 'Ghostbusters', y: 1984, city: 'New York', country: 'Stati Uniti', lat: 40.72, lon: -74.006, locs: 'la caserma Hook & Ladder 8 a Tribeca (il quartier generale, coi loghi dipinti sull\'asfalto), i leoni della New York Public Library (la bibliotecaria fantasma dell\'apertura), il 55 Central Park West ("Spook Central" di Gozer), la Columbia University (i laboratori di Venkman/Bill Murray)', note: '' },
  { t: 'Harry ti presento Sally', y: 1989, city: 'New York', country: 'Stati Uniti', lat: 40.722, lon: -73.987, locs: 'il Katz\'s Delicatessen (il tavolo della scena più famosa, segnalato dal cartello "Where Harry met Sally": pastrami d\'ordinanza), il Washington Square Arch (l\'arrivo in città di Meg Ryan e Billy Crystal), Central Park in autunno (le passeggiate)', note: '' },
  { t: 'Rocky', y: 1976, city: 'Philadelphia', country: 'Stati Uniti', lat: 39.965, lon: -75.181, locs: 'la scalinata del Philadelphia Museum of Art (i "Rocky Steps": la corsa con le braccia al cielo di Stallone si rifà all\'alba), la statua di Rocky ai piedi della scalinata, l\'Italian Market della 9th Street (la corsa tra i banchi con l\'arancia al volo)', note: '' },
  { t: 'The Blues Brothers', y: 1980, city: 'Chicago', country: 'Stati Uniti', lat: 41.88, lon: -87.63, locs: 'Daley Plaza (lo schianto finale della Bluesmobile attraverso le vetrine, sotto il Picasso), il ponte mobile della 95th Street a Calumet (il salto), l\'ex penitenziario di Joliet (l\'uscita di Jake/John Belushi — trasferta)', note: '' },
  { t: 'Il cavaliere oscuro', y: 2008, city: 'Chicago', country: 'Stati Uniti', lat: 41.879, lon: -87.632, locs: 'il canyon di LaSalle Street (l\'inseguimento col Batpod e il camion ribaltato del Joker/Heath Ledger), Lower Wacker Drive (le corse della Batmobile), la Chicago Board of Trade (la torre della Gotham finanziaria), l\'IBM Building (gli uffici Wayne Enterprises)', note: '' },
  { t: 'Ricomincio da capo', y: 1993, city: 'Woodstock', country: 'Stati Uniti', lat: 42.315, lon: -88.449, locs: 'la piazza di Woodstock, Illinois (la "Punxsutawney" del giorno della marmotta: l\'angolo della pozzanghera ha la targa "Bill Murray stepped here"), il palco della marmotta nel square, l\'Opera House, il B&B vittoriano del film (Cherry Street, esterno)', note: '' },
  { t: 'La donna che visse due volte', y: 1958, city: 'San Francisco', country: 'Stati Uniti', lat: 37.802, lon: -122.44, locs: 'Fort Point sotto il Golden Gate (il tuffo di Madeleine/Kim Novak nella baia), la Mission Dolores (il cimitero e la lapide), i Brocklebank Apartments a Nob Hill (la casa di Madeleine), la Mission San Juan Bautista (il campanile del dramma — la torre fu in parte trucco scenico, dillo; trasferta di 1h30)', note: '' },
  { t: 'La La Land', y: 2016, city: 'Los Angeles', country: 'Stati Uniti', lat: 34.118, lon: -118.3, locs: 'il Griffith Observatory (il valzer nel planetario di Mia/Emma Stone e Sebastian/Ryan Gosling), Cathy\'s Corner su Mount Hollywood Drive (il tip-tap al tramonto delle "lovely night"), la funicolare Angels Flight (il bacio), il Grand Central Market, il Lighthouse Café a Hermosa Beach (il jazz club)', note: '' },
  { t: 'Blade Runner', y: 1982, city: 'Los Angeles', country: 'Stati Uniti', lat: 34.05, lon: -118.248, locs: 'il Bradbury Building (l\'atrio in ferro battuto della casa di Sebastian e del duello finale con Roy Batty/Rutger Hauer), la Union Station (il commissariato), il 2nd Street Tunnel (le corse dello spinner nella pioggia al neon)', note: '' },
  { t: 'Ritorno al futuro', y: 1985, city: 'Los Angeles', country: 'Stati Uniti', lat: 34.14, lon: -118.13, locs: 'la Gamble House a Pasadena (la casa di Doc Brown/Christopher Lloyd), il Puente Hills Mall (il parcheggio del "Twin Pines Mall" dove la DeLorean tocca le 88 miglia), il municipio di Hill Valley (è il backlot Universal: si vede solo con lo Studio Tour — dillo)', note: '' },
  { t: 'Top Gun', y: 1986, city: 'San Diego', country: 'Stati Uniti', lat: 32.716, lon: -117.17, locs: 'il Kansas City Barbeque (il bar del pianoforte di "Great Balls of Fire", con i cimeli alle pareti: si mangia davvero), il molo con vista sulla USS Midway (il contesto portaerei, oggi museo), la base di Miramar vista da fuori (la "Fightertown USA" di Maverick/Tom Cruise)', note: '' },
  { t: 'Ocean\'s Eleven', y: 2001, city: 'Las Vegas', country: 'Stati Uniti', lat: 36.113, lon: -115.176, locs: 'le fontane del Bellagio (la scena finale della banda di Clooney e Pitt su Clair de Lune: gli spettacoli d\'acqua sono a orari fissi), il casinò del Bellagio, la Strip di notte', note: 'il caveau era interamente in studio: qui si gioca a riconoscere gli esterni veri' },
  { t: 'Thelma & Louise', y: 1991, city: 'Moab', country: 'Stati Uniti', lat: 38.57, lon: -109.55, locs: 'il Dead Horse Point (il "Grand Canyon" del volo finale della Thunderbird fu girato qui, sopra il Colorado — dillo), la Shafer Trail a Canyonlands (le piste sterrate della fuga), l\'Arches National Park', note: '' },
  { t: 'Sentieri selvaggi', y: 1956, city: 'Monument Valley', country: 'Stati Uniti', lat: 36.98, lon: -110.11, locs: 'la Monument Valley di John Ford (le Mittens e i belvedere della Valley Drive: l\'inquadratura della porta che si chiude su John Wayne è il western intero), il John Ford\'s Point, il Goulding\'s Trading Post (la base storica di Ford e Wayne, oggi museo)', note: 'terra Navajo: guide locali e rispetto delle regole del parco tribale' },
  { t: 'Incontri ravvicinati del terzo tipo', y: 1977, city: 'Devils Tower', country: 'Stati Uniti', lat: 44.59, lon: -104.72, locs: 'la Devils Tower nel Wyoming (il monolite delle visioni di Roy/Richard Dreyfuss e dell\'arrivo dell\'astronave), i sentieri alla base della torre, il campeggio KOA che d\'estate proietta il film ogni sera sotto la torre vera', note: '' },
  { t: 'Shining', y: 1980, city: 'Mount Hood', country: 'Stati Uniti', lat: 45.33, lon: -121.71, locs: 'il Timberline Lodge sul Monte Hood (l\'esterno dell\'Overlook Hotel di Jack Torrance/Jack Nicholson), il lago Trillium con la vista del monte, Government Camp', note: 'gli interni furono set in Inghilterra e il labirinto non esiste qui; fu l\'hotel a chiedere a Kubrick di cambiare la stanza 217 in 237 — aneddoto vero' },
  { t: 'I Goonies', y: 1985, city: 'Astoria', country: 'Stati Uniti', lat: 46.19, lon: -123.83, locs: 'la casa dei Goonies (esterno su collina: si guarda da strada rispettando i residenti), l\'Oregon Film Museum nell\'ex carcere della contea (l\'evasione dell\'apertura), Cannon Beach con Haystack Rock (la costa della mappa di Willy l\'Orbo), Ecola State Park', note: '' },
  { t: 'I segreti di Twin Peaks', y: 1990, city: 'Snoqualmie', country: 'Stati Uniti', lat: 47.53, lon: -121.78, locs: 'le cascate Snoqualmie col Salish Lodge (il Great Northern Hotel della sigla), il Twede\'s Café a North Bend (il Double R Diner: cherry pie e "damn fine coffee" d\'ordinanza), Reinig Road (il viale dei pioppi della sigla)', note: '' },
  { t: 'Twilight', y: 2008, city: 'Forks', country: 'Stati Uniti', lat: 47.95, lon: -124.39, locs: 'la cittadina di Forks (la casa della saga: il tour della camera di Bella e i cartelli di benvenuto ai fan), la spiaggia di La Push/First Beach (la riserva Quileute della leggenda dei lupi), la foresta di Hoh', note: 'gran parte del primo film fu girata in Oregon: Forks è la città della STORIA più che del set — onestà' },
  { t: 'Breaking Bad', y: 2008, city: 'Albuquerque', country: 'Stati Uniti', lat: 35.08, lon: -106.65, locs: 'la casa di Walter White (esterno privato, celebre per la recinzione anti-lancio-di-pizza: solo dalla strada e con rispetto), il Twisters diventato Los Pollos Hermanos (col murale, si mangia), il Crossroads Motel, The Candy Lady in Old Town (il negozio che produsse le "caramelle blu" di scena e le vende ancora)', note: '' },
  { t: 'Forrest Gump', y: 1994, city: 'Savannah', country: 'Stati Uniti', lat: 32.076, lon: -81.09, locs: 'Chippewa Square (dove stava la panchina della scatola di cioccolatini: oggi è conservata al Savannah History Museum — vederle entrambe), le squares alberate del centro storico, il fiume e River Street', note: '' },
  { t: 'Dirty Dancing', y: 1987, city: 'Pembroke', country: 'Stati Uniti', lat: 37.36, lon: -80.54, locs: 'il Mountain Lake Lodge in Virginia (il "Kellerman\'s" di Baby e Johnny/Patrick Swayze: weekend a tema con le lezioni di ballo), il gazebo e la scalinata delle prove, il lago', note: 'il sollevamento in acqua fu girato a Lake Lure, North Carolina: i due resort si dividono il mito — dillo' },
  { t: 'The Truman Show', y: 1998, city: 'Seaside', country: 'Stati Uniti', lat: 30.32, lon: -86.14, locs: 'la cittadina di Seaside in Florida (la "Seahaven" di Truman/Jim Carrey: il paese new urbanist era così perfetto che quasi non servirono scenografie), la casa di Truman su Natchez Street (esterno), la spiaggia e i padiglioni bianchi', note: '' },
  { t: 'L\'ultimo dei Mohicani', y: 1992, city: 'Chimney Rock', country: 'Stati Uniti', lat: 35.43, lon: -82.25, locs: 'il Chimney Rock State Park (le rupi del finale con Daniel Day-Lewis), le cascate Hickory Nut, il lago Lure (dove fu girato anche il tuffo di Dirty Dancing: incrocio di set da raccontare)', note: '' },
  { t: 'Jurassic Park', y: 1993, city: 'Oahu', country: 'Stati Uniti', lat: 21.52, lon: -157.84, locs: 'il Kualoa Ranch a Oahu (la valle della corsa dei gallimimus: i tour ufficiali portano ai punti esatti coi tronchi di scena), la costa di Kaneohe; a Kauai le cascate Manawaiopuna (il volo in elicottero dell\'arrivo: si vedono solo in tour aereo) e la Na Pali Coast', note: '' },
  { t: 'Moonraker', y: 1979, city: 'Rio de Janeiro', country: 'Brasile', lat: -22.95, lon: -43.163, locs: 'la funivia del Pan di Zucchero (la lotta di Bond/Roger Moore con lo Squalo sul tetto della cabina — girata con controfigure vere sul cavo), Copacabana, il belvedere del Corcovado', note: '' },
  { t: 'Evita', y: 1996, city: 'Buenos Aires', country: 'Argentina', lat: -34.608, lon: -58.373, locs: 'il balcone della Casa Rosada (Madonna cantò "Don\'t Cry for Me Argentina" dal balcone vero, con permesso presidenziale — aneddoto celebre), il cimitero della Recoleta con la tomba vera di Eva Perón, il Café Tortoni, plaza de Mayo', note: '' },
  { t: 'Frida', y: 2002, city: 'Città del Messico', country: 'Messico', lat: 19.355, lon: -99.163, locs: 'la Casa Azul di Coyoacán (la casa vera di Frida Kahlo/Salma Hayek, oggi museo, che il film ricrea e sfiora), le trajineras colorate di Xochimilco, il centro di Coyoacán coi suoi mercati', note: '' },
  // ── Asia, Medio Oriente, Africa, Oceania ──
  { t: 'Lost in Translation', y: 2003, city: 'Tokyo', country: 'Giappone', lat: 35.69, lon: 139.7, locs: 'il New York Bar del Park Hyatt a Shinjuku (i whisky di Bob Harris/Bill Murray e Charlotte/Scarlett Johansson, con la vista del film: dress code e coperto serale, dillo), l\'incrocio di Shibuya (la traversata sotto i megaschermi col dinosauro), Kabukichō e le insegne di Shinjuku, il Karaoke Kan di Shibuya (la stanza del karaoke con vista)', note: '' },
  { t: 'Your Name.', y: 2016, city: 'Tokyo', country: 'Giappone', lat: 35.686, lon: 139.72, locs: 'la scalinata del santuario Suga a Yotsuya (l\'inquadratura finale dell\'incontro: pellegrinaggio anime con la fila per la foto), la stazione di Shinanomachi e i ponti pedonali del film, i belvedere sul panorama di Shinjuku', note: 'è un anime: i luoghi sono disegnati dal vero con precisione fotografica — il gioco è il confronto disegno/realtà' },
  { t: 'Memorie di una geisha', y: 2005, city: 'Kyoto', country: 'Giappone', lat: 34.98, lon: 135.77, locs: 'il Fushimi Inari-taisha (la corsa della piccola Chiyo tra i torii rossi fu girata davvero qui), il quartiere di Gion (il mondo vero delle geiko: regole di rispetto ferree, niente inseguimenti fotografici), Pontocho', note: 'la hanamachi del film fu ricostruita in California: a Kyoto si visita la realtà che l\'ha ispirata — dillo' },
  { t: 'In the Mood for Love', y: 2000, city: 'Hong Kong', country: 'Cina', lat: 22.28, lon: 114.17, locs: 'il Goldfinch Restaurant a Causeway Bay (le cene di Chow/Tony Leung e della signora Chan/Maggie Cheung: verificare che sia ancora aperto, la sua storia va raccontata comunque), le scale e i vicoli di Central e Sheung Wan (le salite sotto la pioggia), i palazzi anni \'60 superstiti', note: 'parte della Hong Kong anni \'60 fu ricreata a Bangkok: qui si cerca l\'atmosfera, non la mappa esatta' },
  { t: 'Hong Kong Express', y: 1994, city: 'Hong Kong', country: 'Cina', lat: 22.3, lon: 114.172, locs: 'le Chungking Mansions a Tsim Sha Tsui (il labirinto del primo episodio di Wong Kar-wai), la Central–Mid-Levels Escalator (la scala mobile che passa davanti alla casa del poliziotto 663), Lan Kwai Fong (dove stava il chiosco Midnight Express, oggi scomparso — dillo)', note: '' },
  { t: 'Parasite', y: 2019, city: 'Seoul', country: 'Corea del Sud', lat: 37.55, lon: 126.95, locs: 'il supermercato Doijissal ad Ahyeon-dong (dove i Kim brindano in strada), le scale del tunnel di Jahamun a Buam-dong (la fuga sotto il diluvio, discesa simbolica dalla città alta a quella bassa), la Sky Pizza a Noryangjin (la pizzeria delle scatole)', note: 'la villa dei Park e il semi-interrato erano set costruiti: le scale vere di Seoul sono il vero protagonista — raccontalo' },
  { t: 'La tigre e il dragone', y: 2000, city: 'Hongcun', country: 'Cina', lat: 29.9, lon: 117.99, locs: 'il villaggio UNESCO di Hongcun (il lago a mezzaluna e i ponti dell\'apertura, con Li Mu Bai/Chow Yun-fat che conduce il cavallo), il villaggio di Xidi, il mare di bambù dell\'Anji nello Zhejiang (il duello sulle cime di bambù — trasferta lunga, da citare)', note: '' },
  { t: 'Avatar e le montagne di Zhangjiajie', y: 2009, city: 'Zhangjiajie', country: 'Cina', lat: 29.32, lon: 110.43, locs: 'il parco nazionale di Zhangjiajie (i pinnacoli di arenaria che ispirarono le montagne fluttuanti di Pandora: la vetta è stata ufficialmente ribattezzata "Avatar Hallelujah Mountain"), l\'ascensore di Bailong, la Tianzi Mountain', note: 'ispirazione dichiarata, non riprese dal vero: il film è in digitale — onestà, il paesaggio vero non ne ha bisogno' },
  { t: 'Lara Croft: Tomb Raider', y: 2001, city: 'Siem Reap', country: 'Cambogia', lat: 13.43, lon: 103.89, locs: 'il tempio di Ta Prohm ad Angkor (le radici giganti sotto cui Lara/Angelina Jolie trova l\'ingresso: oggi lo chiamano "il tempio di Tomb Raider"), Angkor Wat all\'alba, il Bayon dai volti di pietra', note: '' },
  { t: 'The Beach', y: 2000, city: 'Ko Phi Phi', country: 'Thailandia', lat: 7.68, lon: 98.77, locs: 'Maya Bay su Ko Phi Phi Leh (la spiaggia segreta di Richard/Leonardo DiCaprio: chiusa anni per far rinascere i coralli, oggi visite contingentate senza balneazione — raccontala come lezione di overtourism), il viewpoint di Ko Phi Phi Don, la laguna di Pileh', note: '' },
  { t: 'Agente 007 - L\'uomo dalla pistola d\'oro', y: 1974, city: 'Phang Nga', country: 'Thailandia', lat: 8.27, lon: 98.5, locs: 'l\'isolotto di Khao Phing Kan nella baia di Phang Nga (il covo di Scaramanga/Christopher Lee, ribattezzato "James Bond Island"), il faraglione di Ko Ta Pu (l\'inquadratura simbolo), il villaggio su palafitte di Ko Panyi', note: '' },
  { t: 'Crazy & Rich', y: 2018, city: 'Singapore', country: 'Singapore', lat: 1.29, lon: 103.85, locs: 'i Gardens by the Bay (la festa tra i Supertree), il CHIJMES (il matrimonio nella ex cappella con l\'acqua nella navata), il Raffles Hotel, il Newton Food Centre (la sagra dell\'hawker food con Rachel e Nick)', note: '' },
  { t: 'The Millionaire', y: 2008, city: 'Mumbai', country: 'India', lat: 18.97, lon: 72.83, locs: 'la stazione Chhatrapati Shivaji (il balletto finale di "Jai Ho" di Danny Boyle), Dharavi (solo coi tour delle ONG locali, con rispetto e senza fotografie invadenti), i dhobi ghat di Mahalaxmi', note: 'tono rispettoso: quartieri vivi, non scenografie' },
  { t: 'Octopussy', y: 1983, city: 'Udaipur', country: 'India', lat: 24.576, lon: 73.68, locs: 'il Taj Lake Palace sul lago Pichola (il palazzo galleggiante di Octopussy: ci si dorme o si ammira in barca), il Monsoon Palace (il covo di Kamal Khan sulle colline), il City Palace, i ghat del Pichola', note: '' },
  { t: 'Lawrence d\'Arabia', y: 1962, city: 'Wadi Rum', country: 'Giordania', lat: 29.57, lon: 35.42, locs: 'il deserto del Wadi Rum (le cavalcate di Peter O\'Toole dove il vero Lawrence passò davvero), la sorgente detta "Lawrence\'s Spring", i canyon di Khazali, il campo tendato beduino per la notte', note: 'qui hanno girato anche The Martian e Dune: il deserto più cinematografico del mondo — Siviglia recitò invece Il Cairo' },
  { t: 'Indiana Jones e l\'ultima crociata', y: 1989, city: 'Petra', country: 'Giordania', lat: 30.32, lon: 35.44, locs: 'il Siq (la cavalcata finale di Indy/Harrison Ford e Henry Jones/Sean Connery), Al-Khazneh il Tesoro (il tempio del Graal: solo la facciata è vera, gli interni erano set — dillo), il teatro nabateo, Petra by night a lume di candela', note: '' },
  { t: 'Star Wars in Tunisia', y: 1977, city: 'Tozeur', country: 'Tunisia', lat: 33.92, lon: 8.13, locs: 'il set di Mos Espa vicino a Nefta (le cupole del mercato dell\'Episodio I ancora in piedi tra le dune), Ong Jemel (la roccia del cammello e i punti di ripresa), lo chott el-Jerid (l\'igloo della fattoria Lars di Una nuova speranza, ricostruito dai fan), l\'hotel Sidi Driss a Matmata (gli interni veri della casa di zio Owen: ci si dorme e si cena)', note: 'i set nel deserto soffrono le dune che avanzano: raccontare anche la corsa dei fan per salvarli' },
  { t: 'Il gladiatore', y: 2000, city: 'Aït Benhaddou', country: 'Marocco', lat: 31.05, lon: -7.13, locs: 'lo ksar di Aït Benhaddou (le mura dove Massimo/Russell Crowe combatte da schiavo gladiatore: patrimonio UNESCO), gli Atlas Studios di Ouarzazate (i set visitabili di decine di kolossal), la kasbah Taourirt', note: 'il Colosseo del film fu costruito a Fort Ricasoli, Malta, e poi smantellato — dillo' },
  { t: 'La mia Africa', y: 1985, city: 'Nairobi', country: 'Kenya', lat: -1.34, lon: 36.71, locs: 'il Karen Blixen Museum (la vera fattoria di Karen Blixen/Meryl Streep ai piedi delle Ngong Hills, usata per il film), le Ngong Hills (i panorami del volo di Denys/Robert Redford), il quartiere di Karen', note: '' },
  { t: 'Mr. Crocodile Dundee', y: 1986, city: 'Kakadu', country: 'Australia', lat: -12.86, lon: 132.81, locs: 'le Gunlom Falls a Kakadu (la piscina naturale sull\'orlo della cascata dove Mick/Paul Hogan porta Sue), il belvedere di Ubirr sulla piana alluvionale (la scena del bufalo "ipnotizzato"), le gole dell\'East Alligator River', note: 'terra aborigena: guide locali e stagionalità delle piste da rispettare' },
  { t: 'Il Signore degli Anelli: Hobbiton', y: 2001, city: 'Matamata', country: 'Nuova Zelanda', lat: -37.86, lon: 175.68, locs: 'il set di Hobbiton (l\'unico set permanente della trilogia: Casa Baggins in cima alla collina, il Party Tree della festa di Bilbo, il ponte del mulino), la locanda The Green Dragon (la birra dell\'Ovest come nel film), le colline verdi della fattoria Alexander', note: '' },
  { t: 'Il Signore degli Anelli: Wellington', y: 2001, city: 'Wellington', country: 'Nuova Zelanda', lat: -41.29, lon: 174.78, locs: 'la Weta Workshop a Miramar (il laboratorio degli effetti di Peter Jackson: tour coi materiali di scena), il monte Victoria (il bosco della fuga dal Cavaliere Nero: "fuori dal sentiero!"), il Kaitoke Regional Park (Gran Burrone/Rivendell, coi cartelli sul punto esatto)', note: '' },
  { t: 'Lezioni di piano', y: 1993, city: 'Piha', country: 'Nuova Zelanda', lat: -36.99, lon: 174.48, locs: 'la spiaggia nera di Karekare (il pianoforte abbandonato sulla battigia di Ada/Holly Hunter: una delle immagini più potenti del cinema anni \'90), la spiaggia di Piha col Lion Rock, le Waitakere Ranges', note: '' },
  { t: '3 Idiots', y: 2009, city: 'Leh', country: 'India', lat: 34.16, lon: 77.58, locs: 'il lago Pangong Tso in Ladakh (la scena finale con Aamir Khan, oggi meta di pellegrinaggio con le "3 Idiots seats"), la Druk White Lotus School di Shey (la "scuola di Rancho", col Rancho\'s Café), i monasteri della valle dell\'Indo', note: 'quote e permessi: il Ladakh richiede acclimatazione e permessi per il Pangong — logistica onesta' },
  { t: 'Dilwale Dulhania Le Jayenge', y: 1995, city: 'Interlaken', country: 'Svizzera', lat: 46.69, lon: 7.87, locs: 'la statua di Yash Chopra a Interlaken (l\'omaggio svizzero al regista che rese l\'Oberland il set di Bollywood), i prati e i villaggi dell\'Oberland bernese dei numeri musicali di Raj/Shah Rukh Khan e Simran/Kajol, Saanen e Gstaad (le tappe del viaggio in Europa), la ferrovia della Jungfrau', note: 'il film più longevo della storia indiana (in sala a Mumbai da decenni): raccontalo' },
  { t: 'Sholay', y: 1975, city: 'Ramanagara', country: 'India', lat: 12.72, lon: 77.28, locs: 'le rupi granitiche di Ramanagara vicino Bangalore (il "Ramgarh" del più celebre curry-western, il villaggio fu costruito qui tra le rocce di Gabbar Singh), la linea ferroviaria della rapina al treno, le colline di arrampicata', note: '' },
  { t: 'Winter Sonata', y: 2002, city: 'Nami Island', country: 'Corea del Sud', lat: 37.79, lon: 127.53, locs: 'il viale dei metasequoia di Namiseom (la passeggiata simbolo della coppia del K-drama che lanciò la hallyu, con la statua di Bae Yong-joon e Choi Ji-woo), l\'isola di Nami coi suoi viali, Chuncheon (la città e il dakgalbi)', note: '' },
  { t: 'Cast Away', y: 2000, city: 'Monuriki', country: 'Figi', lat: -17.61, lon: 177.03, locs: 'l\'isola di Monuriki nelle Mamanuca (l\'isola deserta di Chuck Noland/Tom Hanks e di Wilson: escursioni in barca dalle isole vicine), la spiaggia del naufragio, lo snorkeling della barriera', note: '' },
];

/** Brief editoriale di un film del seed: regole identiche a quelle della
 *  generazione on-demand/harvest lato server (tappe = location vere,
 *  scena descritta in ogni tappa, attori/personaggi citati, locali del
 *  film come tappa pranzo/pausa quando esistono davvero). */
function filmBrief(f: FilmDef): string {
  return [
    `Itinerario SUL SET di "${f.t}" (${f.y}), nell'area di ${f.city}: le tappe principali SONO le location reali del film.`,
    `LOCATION CHIAVE VERIFICATE (usa QUESTE come tappe, citate per nome): ${f.locs}.`,
    f.note ? `NOTA DI ONESTÀ/ANEDDOTO: ${f.note}.` : '',
    'REGOLA SCENE (vincolante): nel campo "attivita" di OGNI tappa-location descrivi concretamente la scena girata lì — cosa succede, quali personaggi con i loro attori (nome attore/nome personaggio, e regista dove rilevante), perché è memorabile — poi il confronto scena/realtà: cosa si riconosce oggi sul posto e da dove mettersi per ritrovare l\'inquadratura; aggiungi un aneddoto di lavorazione SOLO se documentato. Niente spoiler pesanti del finale: se inevitabile, premetti "attenzione spoiler". Il consiglio_guida può suggerire la foto "come nel film".',
    'LOCALI DEL FILM: se tra le location c\'è un bar/caffè/ristorante/hotel reale e visitabile (es. un bar o una locanda citati nell\'elenco), usalo come tappa pranzo o pausa: scena + cosa ordinare + avviso onesto se è diventato molto turistico. MAI spacciare un locale per "quello del film" se non è certo: nel dubbio ometti.',
    'VIETATO attribuire al film luoghi, attori o aneddoti non presenti in questo brief e non certi; se una scena celebre fu girata in studio o un interno non è visitabile, dillo apertamente e proponi il miglior punto di vista esterno. Completa la giornata con pasti in locali reali lungo il percorso e al massimo 2-3 tappe di contorno coerenti con la zona. Tono da cinefilo entusiasta ma rigoroso.',
  ].filter(Boolean).join('\n');
}

/** I descrittori del seed film curato (slug 'film-<titolo-slug>'). */
export function filmDescriptors(): LibraryDescriptor[] {
  return FILMS.map(f => ({
    slug: `film-${slugify(f.t)}`,
    kind: 'theme' as LibraryKind,
    title: `🎬 ${f.t} — i luoghi del film`,
    city: f.city,
    country: f.country,
    coords: { lat: f.lat, lon: f.lon },
    days: f.days ?? 1,
    theme: 'cinema',
    angle: 'cinema',
    brief: filmBrief(f),
    contextHints: { wikidataFilm: true },
  }));
}

/** I ~30 film iconici da seminare per primi (subito dopo i porti
 *  italiani): ordinati per fama GLOBALE, non per italianità (regola del
 *  committente). Titoli esattamente come in FILMS, slugificati al volo. */
const FILM_PRIORITY_TITLES = [
  'Harry Potter a Londra', 'Il Signore degli Anelli: Hobbiton',
  'Il Trono di Spade a Dubrovnik', 'Il Padrino', 'Vacanze romane',
  'La dolce vita', 'Il favoloso mondo di Amélie', 'Notting Hill',
  'Mamma Mia!', 'Tutti insieme appassionatamente', 'Lost in Translation',
  'Indiana Jones e l\'ultima crociata', 'Il gladiatore',
  'Star Wars in Tunisia', 'Lara Croft: Tomb Raider', 'The Beach',
  'Parasite', 'Colazione da Tiffany', 'La La Land', 'Rocky',
  'Ghostbusters', 'Jurassic Park', 'No Time to Die', 'Casino Royale',
  'Nuovo Cinema Paradiso', 'Midnight in Paris', 'Amadeus',
  'Il buono, il brutto e il cattivo', 'Crazy & Rich', '3 Idiots',
];

// ─────────────────────────────────────────────────────────────────────
// 7) LIBRI — seed curato "book-first": ~80 opere iconiche mondiali con i
//    LORO luoghi reali (dove sono ambientate o dove vive la loro memoria
//    letteraria) citati per nome nel brief. Slug 'book-<titolo-slug>'.
//    Regola citazioni: testo letterale SOLO per autori di pubblico
//    dominio (pd: true = morto da 70+ anni); altrimenti mai.
// ─────────────────────────────────────────────────────────────────────

interface BookDef {
  /** Titolo col quale l'opera è nota in Italia. */
  t: string;
  /** Autore (citato nelle tappe come gli attori per i film). */
  a: string;
  /** Anno di pubblicazione. */
  y: number;
  city: string;
  country: string;
  lat: number;
  lon: number;
  days?: number;
  /** 3-6 luoghi REALI del libro, per nome, col passaggio ambientato lì. */
  locs: string;
  /** Nota di onestà (ispirazioni, attribuzioni tradizionali) o aneddoto. */
  note?: string;
  /** true = opera di pubblico dominio: ammesse brevi citazioni testuali. */
  pd?: boolean;
}

const BOOKS: BookDef[] = [
  // ── Italia ──
  { t: 'La Divina Commedia', a: 'Dante Alighieri', y: 1321, pd: true, city: 'Firenze', country: 'Italia', lat: 43.77, lon: 11.26, locs: 'il Battistero ("il mio bel San Giovanni" dell\'Inferno XIX), la chiesa di Santa Margherita dei Cerchi (la "chiesa di Dante e Beatrice"), il Museo Casa di Dante, il "sasso di Dante" vicino al Duomo (attribuzione tradizionale — dillo); estensione: la tomba di Dante a Ravenna e l\'esilio mai perdonato', note: '' },
  { t: 'I promessi sposi', a: 'Alessandro Manzoni', y: 1840, pd: true, city: 'Lecco', country: 'Italia', lat: 45.86, lon: 9.39, locs: '"quel ramo del lago di Como" visto dal lungolago di Lecco, il rione di Pescarenico (il convento di fra Cristoforo e l\'addio ai monti di Lucia), la presunta casa di Lucia a Olate e il palazzotto di don Rodrigo (attribuzioni tradizionali — dillo), il castello dell\'Innominato sopra Vercurago', note: '' },
  { t: 'Il Gattopardo (il romanzo)', a: 'Giuseppe Tomasi di Lampedusa', y: 1958, city: 'Palermo', country: 'Italia', lat: 38.12, lon: 13.36, locs: 'i resti di palazzo Lampedusa (bombardato nel 1943: la ferita da cui nacque il romanzo), palazzo Filangeri-Cutò a Santa Margherita di Belice (la "Donnafugata" letteraria, oggi museo del Gattopardo — trasferta lunga, dillo), la Palermo nobiliare di don Fabrizio tra via Maqueda e i Quattro Canti', note: '' },
  { t: 'Il nome della rosa (il romanzo)', a: 'Umberto Eco', y: 1980, city: 'Sant\'Ambrogio di Torino', country: 'Italia', lat: 45.1, lon: 7.34, locs: 'la Sacra di San Michele in val di Susa (l\'ispirazione dichiarata da Eco per l\'abbazia del romanzo), lo Scalone dei Morti, il borgo di Sant\'Ambrogio ai piedi del monte Pirchiriano', note: 'l\'abbazia del romanzo è immaginaria: qui si visita la sua matrice dichiarata — onestà d\'obbligo' },
  { t: 'Montalbano: la Vigàta di Camilleri', a: 'Andrea Camilleri', y: 1994, city: 'Porto Empedocle', country: 'Italia', lat: 37.29, lon: 13.53, locs: 'Porto Empedocle (la Vigàta letteraria: il paese si è perfino ribattezzato "Porto Empedocle Vigàta" per qualche anno — raccontalo), la statua di Montalbano sul corso, la Scala dei Turchi (la marna bianca dei romanzi), Agrigento, la "Montelusa" dei libri', note: '' },
  { t: 'L\'amica geniale (il romanzo)', a: 'Elena Ferrante', y: 2011, city: 'Napoli', country: 'Italia', lat: 40.85, lon: 14.27, locs: 'il Rione Luzzatti (il "rione" di Lila e Lenù), lo stradone e il tunnel verso il mare (la fuga fallita delle bambine), piazza dei Martiri (il negozio di scarpe Solara), via Mezzocannone e il Rettifilo (gli anni degli studi di Elena)', note: '' },
  { t: 'Cristo si è fermato a Eboli', a: 'Carlo Levi', y: 1945, city: 'Aliano', country: 'Italia', lat: 40.31, lon: 16.23, locs: 'il borgo di Aliano (la "Gagliano" del confino), la casa del confino di Levi (museo), i calanchi lunari, la tomba di Carlo Levi nel piccolo cimitero (scelse di essere sepolto qui, tra i suoi contadini)', note: '' },
  { t: 'Pirandello: il Caos e Girgenti', a: 'Luigi Pirandello', y: 1904, pd: true, city: 'Agrigento', country: 'Italia', lat: 37.29, lon: 13.55, locs: 'la casa natale di Pirandello in contrada Caos ("son figlio del Caos", oggi museo), il pino sotto cui sono sepolte le sue ceneri, la Valle dei Templi, la Girgenti del Fu Mattia Pascal e delle novelle', note: '' },
  { t: 'La coscienza di Zeno', a: 'Italo Svevo', y: 1923, pd: true, city: 'Trieste', country: 'Italia', lat: 45.65, lon: 13.77, locs: 'il Caffè San Marco (il caffè letterario di Svevo e del suo maestro d\'inglese James Joyce: ci si pranza), il Museo Sveviano, la statua di Svevo in piazza Hortis, il molo Audace e le rive dell\'"ultima sigaretta"', note: '' },
  { t: 'Canne al vento', a: 'Grazia Deledda', y: 1913, pd: true, city: 'Galtellì', country: 'Italia', lat: 40.38, lon: 9.61, locs: 'il borgo di Galtellì (il "Galte" del romanzo, oggi parco letterario Deledda), la casa delle dame Pintor, la chiesa di San Pietro col cimitero, il monte Tuttavista sui campi di Efix', note: 'l\'unico Nobel letterario femminile italiano: raccontala' },
  { t: 'Le avventure di Pinocchio', a: 'Carlo Collodi', y: 1883, pd: true, city: 'Collodi', country: 'Italia', lat: 43.9, lon: 10.65, locs: 'il borgo di Collodi (il paese materno da cui Lorenzini prese lo pseudonimo), il Parco di Pinocchio, la villa e il giardino Garzoni, l\'Osteria del Gambero Rosso del parco (il nome viene dal romanzo)', note: '' },
  { t: 'Romeo e Giulietta', a: 'William Shakespeare', y: 1597, pd: true, city: 'Verona', country: 'Italia', lat: 45.44, lon: 10.99, locs: 'la casa di Giulietta col cortile (il balcone fu aggiunto nel Novecento: dillo mentre tutti fotografano), la tomba di Giulietta a San Francesco al Corso, la casa di Romeo (esterno privato), piazza delle Erbe e le vie delle faide tra Montecchi e Capuleti', note: 'Shakespeare non vide mai Verona: la città è diventata il suo palcoscenico per fede letteraria — raccontalo' },
  { t: 'Memorie di Adriano', a: 'Marguerite Yourcenar', y: 1951, city: 'Tivoli', country: 'Italia', lat: 41.94, lon: 12.77, locs: 'Villa Adriana a Tivoli (il cuore del romanzo: il Canopo e il Teatro Marittimo dove l\'imperatore-filosofo si ritira), il Pantheon a Roma (l\'orgoglio architettonico di Adriano — trasferta), Castel Sant\'Angelo (il suo mausoleo e la piccola anima "vagula blandula")', note: '' },
  { t: 'Il Milione', a: 'Marco Polo', y: 1298, pd: true, city: 'Venezia', country: 'Italia', lat: 45.44, lon: 12.34, locs: 'la corte seconda del Milion a Cannaregio (la zona delle case dei Polo, accanto al teatro Malibran), Rialto e il mercato (la Venezia mercantile da cui partì il viaggio), il molo di San Marco delle galee', note: '' },
  // ── Europa ──
  { t: 'Il conte di Montecristo', a: 'Alexandre Dumas', y: 1844, pd: true, city: 'Marsiglia', country: 'Francia', lat: 43.28, lon: 5.33, locs: 'il Château d\'If (la cella di Edmond Dantès e dell\'abate Faria: si visita in battello, con le celle "dei personaggi"), il Vieux-Port (l\'arrivo del Pharaon), il quartiere dei Catalans (Mercédès), la corniche verso il largo dove Dantès nuota libero', note: '' },
  { t: 'Festa mobile', a: 'Ernest Hemingway', y: 1964, city: 'Parigi', country: 'Francia', lat: 48.85, lon: 2.33, locs: 'la Closerie des Lilas (il tavolo di Hemingway con la targhetta d\'ottone: ci si beve un caffè), il 74 di rue du Cardinal Lemoine (la prima casa con Hadley, targa), i giardini del Luxembourg (le passeggiate a stomaco vuoto), Shakespeare and Company (la libreria attuale raccoglie l\'eredità di quella di Sylvia Beach in rue de l\'Odéon — dillo)', note: '' },
  { t: 'Ulisse', a: 'James Joyce', y: 1922, pd: true, city: 'Dublino', country: 'Irlanda', lat: 53.34, lon: -6.26, locs: 'la Martello Tower di Sandycove (il James Joyce Tower & Museum: la prima pagina del romanzo), Davy Byrne\'s in Duke Street (il panino al gorgonzola e il borgogna di Leopold Bloom: ordina lo stesso), Sweny\'s Pharmacy (la saponetta al limone, oggi letture joyciane quotidiane), la spiaggia di Sandymount, il n.7 di Eccles Street (demolito: la porta originale è al James Joyce Centre — dillo)', note: 'il 16 giugno Dublino diventa il romanzo: Bloomsday' },
  { t: 'Dracula', a: 'Bram Stoker', y: 1897, pd: true, city: 'Whitby', country: 'Regno Unito', lat: 54.49, lon: -0.61, locs: 'l\'abbazia di Whitby sulla scogliera (il naufragio della Demeter e il cane nero che risale i gradini), i 199 gradini, il cimitero di St Mary (la panchina di Mina e Lucy), il porto e la statua-panchina di Stoker', note: '' },
  { t: 'Dracula in Transilvania', a: 'Bram Stoker', y: 1897, pd: true, city: 'Bran', country: 'Romania', lat: 45.52, lon: 25.37, locs: 'il castello di Bran (il "castello di Dracula" per tradizione turistica: Stoker non lo cita e non visitò mai la Romania — dillo con eleganza), Sighișoara (la casa natale del vero Vlad III Dracul), il passo del Borgo/Tihuța (l\'unico luogo davvero nel romanzo: qui sorge l\'hotel Castel Dracula — trasferta lunga)', note: 'itinerario di onestà letteraria: separare il romanzo, il principe storico e il marketing' },
  { t: 'Sherlock Holmes', a: 'Arthur Conan Doyle', y: 1887, pd: true, city: 'Londra', country: 'Regno Unito', lat: 51.52, lon: -0.16, locs: 'il 221B di Baker Street (lo Sherlock Holmes Museum: il civico non esisteva ai tempi di Doyle — dillo), il Criterion a Piccadilly Circus (dove Watson sente parlare per la prima volta di Holmes, targa), il St Bartholomew\'s Hospital (l\'incontro "Lei è stato in Afghanistan, vedo"), lo Sherlock Holmes Pub a Northumberland Street (la ricostruzione del salotto: tappa pranzo)', note: '' },
  { t: 'La Londra di Dickens', a: 'Charles Dickens', y: 1838, pd: true, city: 'Londra', country: 'Regno Unito', lat: 51.52, lon: -0.12, locs: 'il Charles Dickens Museum al 48 di Doughty Street (la casa dove scrisse Oliver Twist), i vicoli di Clerkenwell e Saffron Hill (la tana di Fagin), il George Inn a Southwark (la locanda a galleria citata in Little Dorrit: tappa pranzo), Seven Dials e i mercati', note: '' },
  { t: 'Orgoglio e pregiudizio (il romanzo)', a: 'Jane Austen', y: 1813, pd: true, city: 'Bath', country: 'Regno Unito', lat: 51.38, lon: -2.36, locs: 'le Assembly Rooms e la Pump Room (i balli e i corteggiamenti del mondo Austen: la scrittrice visse a Bath 1801-1806), il Jane Austen Centre in Gay Street, il Royal Crescent e il Circus, Sydney Gardens (di fronte c\'è la casa dei suoi anni migliori al n.4 di Sydney Place)', note: 'estensione: il cottage-museo di Chawton, dove revisionò il romanzo' },
  { t: 'Cime tempestose', a: 'Emily Brontë', y: 1847, pd: true, city: 'Haworth', country: 'Regno Unito', lat: 53.83, lon: -1.96, locs: 'il Brontë Parsonage Museum a Haworth (la canonica delle tre sorelle), la brughiera verso Top Withens (il rudere che la tradizione lega a Wuthering Heights — attribuzione, dillo), le cascatelle Brontë Falls, il sentiero di Penistone Hill', note: '' },
  { t: 'Lo strano caso del dottor Jekyll e del signor Hyde', a: 'Robert Louis Stevenson', y: 1886, pd: true, city: 'Edimburgo', country: 'Regno Unito', lat: 55.95, lon: -3.19, locs: 'i close e i vicoli della Old Town (il doppio della città che ispirò il romanzo, ambientato a Londra ma nato qui — dillo), il Deacon Brodie\'s Tavern (l\'ebanista-ladro gentiluomo che ispirò Jekyll/Hyde: tappa pranzo), il Writers\' Museum a Lady Stair\'s Close, la New Town georgiana dove Stevenson crebbe', note: '' },
  { t: 'Peter Pan', a: 'James Matthew Barrie', y: 1911, pd: true, city: 'Londra', country: 'Regno Unito', lat: 51.51, lon: -0.18, locs: 'la statua di Peter Pan nei Kensington Gardens (voluta e fatta installare di nascosto, in una notte, dallo stesso Barrie — aneddoto vero), la Serpentine e l\'isola degli uccelli dei "Kensington Gardens", la casa di Barrie al 100 di Bayswater Road (targa), il Great Ormond Street Hospital (a cui Barrie donò i diritti di Peter Pan per sempre)', note: '' },
  { t: 'Alice nel Paese delle Meraviglie', a: 'Lewis Carroll', y: 1865, pd: true, city: 'Oxford', country: 'Regno Unito', lat: 51.75, lon: -1.26, locs: 'il Christ Church College (dove Charles Dodgson insegnava matematica e conobbe la vera Alice Liddell: la Great Hall e il giardino della decana), l\'Alice\'s Shop di St Aldate\'s (il negozio "della Pecora" di Attraverso lo specchio, esiste davvero), il fiume Isis/Tamigi (la gita in barca del 4 luglio 1862 in cui nacque la storia), il museo di storia naturale col dodo', note: '' },
  { t: 'Winnie the Pooh', a: 'Alan Alexander Milne', y: 1926, city: 'Hartfield', country: 'Regno Unito', lat: 51.07, lon: 0.03, locs: 'la Ashdown Forest nel Sussex (il vero Bosco dei Cento Acri), il Poohsticks Bridge (il ponte dei bastoncini: si gioca davvero), il negozio Pooh Corner a Hartfield (tappa merenda), il memoriale di Milne e Shepard a Gills Lap', note: '' },
  { t: 'Tre uomini in barca', a: 'Jerome K. Jerome', y: 1889, pd: true, city: 'Kingston upon Thames', country: 'Regno Unito', lat: 51.41, lon: -0.3, locs: 'Kingston upon Thames (la partenza della remata sul Tamigi), il labirinto di Hampton Court (la scena comica di Harris perso col cartografo improvvisato: ci si perde davvero), le chiuse di Boulter\'s Lock, Marlow e i pub fluviali', note: '' },
  { t: 'Il giro del mondo in 80 giorni', a: 'Jules Verne', y: 1872, pd: true, city: 'Londra', country: 'Regno Unito', lat: 51.51, lon: -0.13, locs: 'il Reform Club di Pall Mall (la scommessa di Phileas Fogg: club privato, si ammira l\'esterno), Savile Row (la casa di Fogg al n.7, strada vera dei sarti), la stazione di Charing Cross (la partenza), il Royal Geographical Society (lo spirito dell\'epoca)', note: '' },
  { t: 'Agatha Christie: Torquay e la Riviera inglese', a: 'Agatha Christie', y: 1920, city: 'Torquay', country: 'Regno Unito', lat: 50.46, lon: -3.53, locs: 'l\'Agatha Christie Mile sul lungomare di Torquay (la città natale, col busto), Greenway (la casa delle vacanze della scrittrice, National Trust, scenario di Dead Man\'s Folly), il Grand Hotel (la prima notte di nozze), l\'Imperial Hotel (l\'ultimo capitolo di Sleeping Murder)', note: '' },
  { t: 'Assassinio sull\'Orient Express', a: 'Agatha Christie', y: 1934, city: 'Istanbul', country: 'Turchia', lat: 41.01, lon: 28.98, locs: 'la stazione di Sirkeci (il capolinea storico dell\'Orient Express, col piccolo museo ferroviario), il Pera Palace Hotel (la camera 411 dove la tradizione vuole che Christie scrivesse — "tradizione", dillo; tè in salotto liberty), Galata e il ponte verso l\'Europa dei vagoni letto', note: '' },
  { t: 'Il processo e la Praga di Kafka', a: 'Franz Kafka', y: 1925, pd: true, city: 'Praga', country: 'Cechia', lat: 50.09, lon: 14.42, locs: 'il Vicolo d\'Oro n.22 al Castello (la casetta azzurra dove Kafka scrisse nel 1916-17), la casa natale accanto a San Nicola in Città Vecchia (targa), il Museo Kafka sulla Moldava, la testa rotante di Kafka di David Černý, il nuovo cimitero ebraico di Žižkov (la tomba)', note: '' },
  { t: 'Il buon soldato Švejk', a: 'Jaroslav Hašek', y: 1921, pd: true, city: 'Praga', country: 'Cechia', lat: 50.07, lon: 14.43, locs: 'la birreria U Kalicha ("Al Calice": qui Švejk dà l\'appuntamento "alle sei di sera, dopo la guerra" — vive del romanzo, tappa pranzo con giudizio sui prezzi), i vicoli di Nové Město delle avventure, Žižkov (i quartieri popolari di Hašek)', note: '' },
  { t: 'Il maestro e Margherita', a: 'Michail Bulgakov', y: 1967, pd: true, city: 'Mosca', country: 'Russia', lat: 55.76, lon: 37.59, locs: 'gli stagni Patriaršie (la panchina dell\'apparizione di Woland nel primo capitolo), la "casa maledetta" di Bolšaja Sadovaja 10 (l\'appartamento 50, oggi museo Bulgakov, con le scale piene di graffiti dei lettori), l\'Arbat (le passeggiate di Margherita), le colline dei Passeri', note: '' },
  { t: 'Delitto e castigo', a: 'Fëdor Dostoevskij', y: 1866, pd: true, city: 'San Pietroburgo', country: 'Russia', lat: 59.93, lon: 30.31, locs: 'l\'angolo tra Graždanskaja e Stoljarnyj pereulok (la "casa di Raskol\'nikov", col bassorilievo commemorativo), il canale Griboedova (i vagabondaggi febbrili), la piazza Sennaja (il Fieno: l\'inginocchiarsi di Raskol\'nikov), il museo Dostoevskij in Kuznečnyj pereulok', note: '' },
  { t: 'Don Chisciotte della Mancia', a: 'Miguel de Cervantes', y: 1605, pd: true, city: 'Campo de Criptana', country: 'Spagna', lat: 39.4, lon: -3.12, locs: 'i mulini a vento di Campo de Criptana (i "giganti" del capitolo VIII: dieci mulini superstiti sulla collina), i mulini di Consuegra col castello (il profilo più fotografato della Mancha), El Toboso (la casa-museo di Dulcinea e il museo cervantino)', note: '' },
  { t: 'L\'ombra del vento', a: 'Carlos Ruiz Zafón', y: 2001, city: 'Barcellona', country: 'Spagna', lat: 41.38, lon: 2.17, locs: 'il quartiere Gotico e carrer de l\'Arc del Teatre (dove Zafón colloca l\'ingresso del Cimitero dei Libri Dimenticati — luogo immaginario, il vicolo è vero: dillo), Els Quatre Gats (il caffè di Fermín e delle confidenze: tappa pranzo), la Rambla e la Boqueria, Montjuïc (il castello delle pagine più cupe)', note: '' },
  { t: 'La cattedrale del mare', a: 'Ildefonso Falcones', y: 2006, city: 'Barcellona', country: 'Spagna', lat: 41.384, lon: 2.182, locs: 'la basilica di Santa Maria del Mar (la "cattedrale del popolo" costruita dai bastaixos come Arnau: guarda i portatori di pietra scolpiti sul portale), il quartiere della Ribera e il Born, il carrer Montcada dei palazzi mercantili', note: '' },
  { t: 'Carmen', a: 'Prosper Mérimée', y: 1845, pd: true, city: 'Siviglia', country: 'Spagna', lat: 37.38, lon: -5.99, locs: 'la Real Fábrica de Tabacos (la manifattura dove Carmen arrotola sigari, oggi università: si entra), la plaza de toros della Maestranza (il finale tragico della novella e dell\'opera), Triana oltre il fiume (il mondo gitano di Carmen), la statua di Carmen di fronte all\'arena', note: '' },
  { t: 'Il libro dell\'inquietudine', a: 'Fernando Pessoa', y: 1982, pd: true, city: 'Lisbona', country: 'Portogallo', lat: 38.71, lon: -9.14, locs: 'la rua dos Douradores (l\'ufficio e la pensione di Bernardo Soares: la strada "di tutta la mia vita"), il café A Brasileira al Chiado (la statua di Pessoa al tavolino: caffè d\'ordinanza), la Casa Fernando Pessoa a Campo de Ourique, il Martinho da Arcada (l\'altro caffè del poeta, tappa pranzo)', note: 'Pessoa morì nel 1935: i suoi versi si possono citare — con parsimonia' },
  { t: 'Sostiene Pereira', a: 'Antonio Tabucchi', y: 1994, city: 'Lisbona', country: 'Portogallo', lat: 38.72, lon: -9.14, locs: 'la praça da Alegria (la redazione del Lisboa dove Pereira cura la pagina culturale), il Terreiro do Paço, il tram 28 e la Baixa della Lisbona del 1938 sotto Salazar; il Café Orquídea del romanzo è immaginario (dillo): il suo mondo sta tra il Rato e il Chiado', note: 'romanzo sotto copyright: niente citazioni letterali, racconta con parole tue' },
  { t: 'Notre-Dame de Paris', a: 'Victor Hugo', y: 1831, pd: true, city: 'Parigi', country: 'Francia', lat: 48.853, lon: 2.35, locs: 'la cattedrale di Notre-Dame (il romanzo la salvò letteralmente: la campagna di Hugo portò al restauro di Viollet-le-Duc — raccontalo davanti alle torri di Quasimodo), il parvis e la cripta archeologica (la Parigi medievale di Esmeralda), l\'Hôtel de Ville sull\'antica place de Grève (le esecuzioni del romanzo)', note: '' },
  { t: 'I miserabili', a: 'Victor Hugo', y: 1862, pd: true, city: 'Parigi', country: 'Francia', lat: 48.855, lon: 2.365, locs: 'il giardino del Luxembourg (gli sguardi tra Marius e Cosette), il quartiere delle Halles e la zona dell\'antica rue de la Chanvrerie (la barricata di Gavroche — la strada non esiste più, dillo), la place de la Bastille (l\'elefante di gesso in cui dorme Gavroche, sparito: ne resta la memoria), la Maison Victor Hugo in place des Vosges', note: '' },
  { t: 'Madame Bovary', a: 'Gustave Flaubert', y: 1857, pd: true, city: 'Rouen', country: 'Francia', lat: 49.44, lon: 1.1, locs: 'la cattedrale di Rouen (l\'appuntamento di Emma e Léon e la corsa infinita in fiacre a tende chiuse — lo scandalo del processo), il vecchio ospedale Hôtel-Dieu (il museo Flaubert: il padre era chirurgo qui), il borgo di Ry (la "Yonville" della tradizione, col percorso Bovary — attribuzione, dillo)', note: '' },
  { t: 'Alla ricerca del tempo perduto', a: 'Marcel Proust', y: 1913, pd: true, city: 'Illiers-Combray', country: 'Francia', lat: 48.3, lon: 1.24, locs: 'Illiers-Combray (il paese si è ufficialmente ribattezzato col nome del romanzo), la casa di zia Léonie (il museo Proust: la camera, la madeleine), il Pré Catelan (il "giardino di Swann"), la chiesa di Saint-Jacques (il campanile di Combray)', note: 'la madeleine inzuppata nel tè va assaggiata sul posto: rito obbligato' },
  { t: 'Il commissario Maigret', a: 'Georges Simenon', y: 1931, city: 'Parigi', country: 'Francia', lat: 48.855, lon: 2.344, locs: 'il 36 di quai des Orfèvres (la mitica sede della polizia giudiziaria di Maigret sull\'île de la Cité), il boulevard Richard-Lenoir (la casa del commissario e di madame Maigret, strada vera), le brasserie dell\'île de la Cité per la scelta birra-e-panini (la brasserie Dauphine del romanzo è immaginaria: dillo)', note: 'opera sotto copyright: niente citazioni letterali' },
  { t: 'Frankenstein', a: 'Mary Shelley', y: 1818, pd: true, city: 'Ginevra', country: 'Svizzera', lat: 46.22, lon: 6.15, locs: 'Villa Diodati a Cologny (l\'estate senza sole del 1816 in cui la sfida tra Byron, Polidori e Mary fece nascere il romanzo — villa privata, si ammira dal sentiero), il lago Lemano (le fughe della Creatura), la piana di Plainpalais (il primo delitto del romanzo); estensione: la Mer de Glace a Chamonix (il faccia a faccia col mostro)', note: '' },
  { t: 'Heidi', a: 'Johanna Spyri', y: 1880, pd: true, city: 'Maienfeld', country: 'Svizzera', lat: 47.0, lon: 9.53, locs: 'Maienfeld e il Heididorf (il villaggio di Heidi con la casa-museo), il sentiero di Heidi verso l\'alpe (Heidialp-Ochsenberg, la baita del nonno), i vigneti della Bündner Herrschaft', note: '' },
  { t: 'La montagna incantata', a: 'Thomas Mann', y: 1924, pd: true, city: 'Davos', country: 'Svizzera', lat: 46.8, lon: 9.84, locs: 'lo Schatzalp (l\'ex sanatorio Liberty del romanzo di Hans Castorp, oggi hotel: si sale con la funicolare storica e si pranza in terrazza), la passeggiata panoramica di Davos (le "camminate igieniche" dei pazienti), il centro di Davos Platz con la memoria dell\'epoca dei sanatori', note: '' },
  { t: 'I Buddenbrook', a: 'Thomas Mann', y: 1901, pd: true, city: 'Lubecca', country: 'Germania', lat: 53.87, lon: 10.69, locs: 'la Buddenbrookhaus in Mengstraße 4 (la casa dei nonni di Mann e della famiglia del romanzo), il centro anseatico con la Marienkirche (il mondo mercantile in declino), il caffè Niederegger (il marzapane di Lubecca: tappa dolce)', note: '' },
  { t: 'I dolori del giovane Werther', a: 'Johann Wolfgang von Goethe', y: 1774, pd: true, city: 'Wetzlar', country: 'Germania', lat: 50.55, lon: 8.5, locs: 'la Lottehaus a Wetzlar (la casa di Charlotte Buff, la Lotte del romanzo, oggi museo), la Jerusalemhaus (dove il vero suicidio di Karl Wilhelm Jerusalem diede a Goethe il finale — tono sobrio), il Duomo e la piazza del ballo', note: '' },
  { t: 'Faust', a: 'Johann Wolfgang von Goethe', y: 1808, pd: true, city: 'Lipsia', country: 'Germania', lat: 51.34, lon: 12.37, locs: 'l\'Auerbachs Keller nel Mädlerpassage (la taverna della scena della botte, attiva dal 1525 e frequentata dal giovane Goethe: tappa pranzo obbligata), le statue di Faust e Mefistofele all\'ingresso del passage (tocca la scarpa di Faust: porta fortuna, dicono), il Naschmarkt e la vecchia borsa', note: '' },
  { t: 'La signora Dalloway', a: 'Virginia Woolf', y: 1925, pd: true, city: 'Londra', country: 'Regno Unito', lat: 51.5, lon: -0.13, locs: 'Westminster e il Big Ben (le ore che scandiscono il romanzo: "l\'ora irrevocabile"), Bond Street (la passeggiata per i fiori di Clarissa), Regent\'s Park (i pensieri di Septimus), Bloomsbury e Gordon Square (il mondo della Woolf)', note: '' },
  { t: '1984', a: 'George Orwell', y: 1949, pd: true, city: 'Londra', country: 'Regno Unito', lat: 51.52, lon: -0.13, locs: 'la Senate House di Bloomsbury (l\'ispirazione dichiarata del Ministero della Verità: Orwell la conosceva come Ministry of Information), la BBC Broadcasting House (la stanza 101 prende il nome da una sala riunioni BBC dove Orwell si annoiava — aneddoto vero), la statua di Orwell davanti alla BBC con la scritta sulla libertà di dire "ciò che non si vuol sentire"', note: '' },
  { t: 'L\'Odissea a Itaca', a: 'Omero', y: -700, pd: true, city: 'Itaca', country: 'Grecia', lat: 38.37, lon: 20.72, locs: 'la baia di Dexa (la tradizionale "baia di Forco" dello sbarco di Odisseo), la fonte Aretusa e la grotta delle Ninfe (attribuzioni tradizionali — dillo con il sorriso del filologo), Stavros col busto di Ulisse e il piccolo museo, il monte Aetos ("la scuola di Omero")', note: 'nessuna certezza archeologica: qui si cammina dentro una tradizione di tremila anni, ed è questo il bello' },
  { t: 'La ragazza con l\'orecchino di perla (il romanzo)', a: 'Tracy Chevalier', y: 1999, city: 'Delft', country: 'Paesi Bassi', lat: 52.01, lon: 4.36, locs: 'il Markt di Delft con la Nieuwe Kerk (il mondo quotidiano di Griet), il Vermeer Centrum (la casa-bottega ricostruita del pittore), l\'Oude Kerk (la tomba vera di Vermeer), i canali e il punto della "Veduta di Delft"', note: 'romanzo sotto copyright: niente citazioni letterali' },
  { t: 'Le ceneri di Angela', a: 'Frank McCourt', y: 1996, city: 'Limerick', country: 'Irlanda', lat: 52.66, lon: -8.63, locs: 'il Frank McCourt Museum nella ex scuola Leamy (i banchi dell\'infanzia del memoir), i vicoli attorno a Roden Lane (i "lanes" della povertà — molti demoliti, racconto ieri/oggi), i ponti sullo Shannon delle passeggiate', note: 'tono empatico e senza pietismo; opera sotto copyright: niente citazioni' },
  // ── Americhe ──
  { t: 'Il vecchio e il mare', a: 'Ernest Hemingway', y: 1952, city: 'L\'Avana', country: 'Cuba', lat: 23.14, lon: -82.36, locs: 'il villaggio di pescatori di Cojímar (il mondo del vecchio Santiago, col busto di Hemingway fuso coi bronzi donati dai pescatori — storia vera), la Finca Vigía (la casa-museo dove il romanzo fu scritto, con la barca Pilar), El Floridita (il daiquiri di Papa: tappa con avviso "molto turistico"), la Bodeguita del Medio', note: 'opera sotto copyright: niente citazioni letterali' },
  { t: 'Cent\'anni di solitudine', a: 'Gabriel García Márquez', y: 1967, city: 'Aracataca', country: 'Colombia', lat: 10.59, lon: -74.19, locs: 'la casa natale di Gabo ad Aracataca (il museo: la vera Macondo è questo paese della zona bananera — Gabo lo disse sempre), la stazione e la ferrovia delle bananeras, il telegrafo del padre, il fiume dalle pietre "come uova preistoriche"', note: 'opera sotto copyright: niente citazioni letterali; Macondo è immaginaria, Aracataca è la sua matrice dichiarata' },
  { t: 'Il giovane Holden', a: 'J.D. Salinger', y: 1951, city: 'New York', country: 'Stati Uniti', lat: 40.78, lon: -73.97, locs: 'il laghetto delle anatre a Central Park (la domanda ossessiva di Holden: dove vanno d\'inverno?), la giostra di Central Park (Phoebe sotto la pioggia, senza spoiler pesanti), l\'American Museum of Natural History (le vetrine "dove niente cambia mai"), la Fifth Avenue di dicembre', note: 'opera sotto copyright: niente citazioni letterali' },
  { t: 'Moby Dick', a: 'Herman Melville', y: 1851, pd: true, city: 'New Bedford', country: 'Stati Uniti', lat: 41.64, lon: -70.93, locs: 'la Seamen\'s Bethel di New Bedford (la cappella del sermone con il pulpito a forma di prua, citata nel romanzo: le lapidi dei dispersi in mare ci sono davvero), il New Bedford Whaling Museum (la balenottera e la Lagoda), il porto storico; estensione: Nantucket, l\'isola del Pequod', note: '' },
  { t: 'Il grande Gatsby', a: 'Francis Scott Fitzgerald', y: 1925, pd: true, city: 'Great Neck', country: 'Stati Uniti', lat: 40.8, lon: -73.73, locs: 'Great Neck e Sands Point a Long Island (le vere "West Egg" ed "East Egg": le ville della Gold Coast come Oheka Castle, tra le ispirazioni delle feste di Gatsby), il Plaza Hotel a Manhattan (la resa dei conti nella suite afosa), la valle delle ceneri di Flushing (oggi Flushing Meadows: ieri/oggi perfetto)', note: '' },
  { t: 'Il buio oltre la siepe', a: 'Harper Lee', y: 1960, city: 'Monroeville', country: 'Stati Uniti', lat: 31.53, lon: -87.32, locs: 'il tribunale di Monroeville (l\'aula vera che ispirò il processo di Tom Robinson, oggi museo: ogni primavera vi si recita il dramma), il centro della "Maycomb" reale, i luoghi dell\'infanzia di Harper Lee e Truman Capote (vicini di casa veri — aneddoto)', note: 'opera sotto copyright: niente citazioni letterali; tono rispettoso sui temi razziali' },
  { t: 'Anna dai capelli rossi', a: 'Lucy Maud Montgomery', y: 1908, pd: true, city: 'Cavendish', country: 'Canada', lat: 46.49, lon: -63.38, locs: 'Green Gables Heritage Place a Cavendish (la fattoria dai tetti verdi del romanzo), il Sentiero degli Innamorati e il Bosco Stregato (i nomi li diede Anne), la casa dei nonni di Montgomery, le scogliere rosse dell\'Isola del Principe Edoardo', note: '' },
  { t: 'Le avventure di Tom Sawyer', a: 'Mark Twain', y: 1876, pd: true, city: 'Hannibal', country: 'Stati Uniti', lat: 39.71, lon: -91.36, locs: 'la casa d\'infanzia di Mark Twain a Hannibal (museo, con la staccionata bianca di Tom da imbiancare — foto d\'obbligo), la Mark Twain Cave (la grotta di Injun Joe e del tesoro), il Mississippi coi battelli a pale, il faro di Cardiff Hill', note: '' },
  { t: 'La lettera scarlatta', a: 'Nathaniel Hawthorne', y: 1850, pd: true, city: 'Salem', country: 'Stati Uniti', lat: 42.52, lon: -70.89, locs: 'la Custom House di Salem (la dogana dove Hawthorne lavorò e dove ambienta l\'introduzione del romanzo), la House of the Seven Gables (la casa vera dell\'altro suo romanzo, visitabile), la casa natale di Hawthorne, il vecchio cimitero e la memoria dei processi alle streghe', note: '' },
  { t: 'Walden', a: 'Henry David Thoreau', y: 1854, pd: true, city: 'Concord', country: 'Stati Uniti', lat: 42.44, lon: -71.34, locs: 'il Walden Pond (il sito originale della capanna segnato dai cippi e la replica fedele accanto al parcheggio), il sentiero attorno allo stagno (i "perché" della vita nei boschi), il centro di Concord con la Concord Museum (la scrivania verde di Thoreau)', note: '' },
  { t: 'Piccole donne', a: 'Louisa May Alcott', y: 1868, pd: true, city: 'Concord', country: 'Stati Uniti', lat: 42.46, lon: -71.35, locs: 'la Orchard House di Concord (la casa vera dove Alcott scrisse e ambientò il romanzo: la scrivania a mezzaluna di Louisa c\'è ancora), il Wayside (l\'altra casa delle sorelle), lo Sleepy Hollow Cemetery (l\'Authors\' Ridge con le tombe di Alcott, Emerson, Thoreau e Hawthorne)', note: '' },
  { t: 'Pablo Neruda a Isla Negra', a: 'Pablo Neruda', y: 1974, city: 'Isla Negra', country: 'Cile', lat: -33.44, lon: -71.7, locs: 'la casa di Isla Negra (la più amata delle tre case-museo di Neruda: le polene, le conchiglie, la tomba sua e di Matilde davanti al mare), la spiaggia delle "onde che si rompono senza pace"; estensione: La Sebastiana a Valparaíso', note: 'opera sotto copyright: niente citazioni letterali dei versi' },
  { t: 'Borges e Buenos Aires', a: 'Jorge Luis Borges', y: 1949, city: 'Buenos Aires', country: 'Argentina', lat: -34.6, lon: -58.38, locs: 'il barrio di Palermo (la "fondazione mitica" della sua Buenos Aires, calle Jorge Luis Borges), il Café Tortoni (il tavolo dei letterati: tappa merenda con avviso di coda turistica), la Biblioteca Nacional vecchia in calle México (Borges ne fu direttore da cieco — ironia che raccontava lui stesso), la Recoleta', note: 'opera sotto copyright: niente citazioni letterali' },
  // ── Asia, Africa, Oceania ──
  { t: 'Norwegian Wood', a: 'Haruki Murakami', y: 1987, city: 'Tokyo', country: 'Giappone', lat: 35.7, lon: 139.72, locs: 'il campus della Waseda University (il dormitorio e gli anni di Toru Watanabe), il jazz café DUG a Shinjuku (citato nel romanzo: whisky e vinili come Toru e Midori), Kichijōji e il parco Inokashira (la Tokyo malinconica dei vagabondaggi)', note: 'opera sotto copyright: niente citazioni letterali' },
  { t: 'Il padiglione d\'oro', a: 'Yukio Mishima', y: 1956, city: 'Kyoto', country: 'Giappone', lat: 35.04, lon: 135.73, locs: 'il Kinkaku-ji (il Padiglione d\'oro: il romanzo ricostruisce l\'incendio VERO del 1950 appiccato da un giovane monaco — il tempio che vedi è la ricostruzione del 1955, dillo), lo stagno Kyōko-chi coi riflessi dell\'ossessione di Mizoguchi, il quartiere dei templi del nord-ovest', note: 'opera sotto copyright: niente citazioni letterali; tono sobrio sull\'evento storico' },
  { t: 'Botchan', a: 'Natsume Sōseki', y: 1906, pd: true, city: 'Matsuyama', country: 'Giappone', lat: 33.84, lon: 132.77, locs: 'il Dōgo Onsen Honkan (il bagno termale ottocentesco dove Botchan si concede il lusso del bagno: ci si immerge davvero), il treno "Botchan Ressha" (la locomotiva d\'epoca ribattezzata dal romanzo), il castello di Matsuyama, gli orologi e le statue dei personaggi a Dōgo', note: '' },
  { t: 'La storia di Genji a Uji', a: 'Murasaki Shikibu', y: 1010, pd: true, city: 'Uji', country: 'Giappone', lat: 34.89, lon: 135.8, locs: 'il Museo del Genji monogatari a Uji (gli ultimi dieci capitoli, i "capitoli di Uji", sono ambientati qui), il Byōdō-in (la Sala della Fenice del mondo Heian), il ponte di Uji coi personaggi in bronzo, il tè di Uji (tappa merenda)', note: 'il primo romanzo della storia, scritto da una donna mille anni fa: raccontalo' },
  { t: 'Shantaram', a: 'Gregory David Roberts', y: 2003, city: 'Mumbai', country: 'India', lat: 18.92, lon: 72.83, locs: 'il Leopold Café a Colaba (il quartier generale del romanzo, coi segni veri della storia recente — tappa pranzo con rispetto), la Gateway of India e Colaba Causeway, i vicoli di Colaba del mercato nero anni \'80', note: 'opera sotto copyright: niente citazioni; sui bassifondi tono rispettoso, niente safari della povertà' },
  { t: 'Il dio delle piccole cose', a: 'Arundhati Roy', y: 1997, city: 'Kottayam', country: 'India', lat: 9.59, lon: 76.52, locs: 'Ayemenem/Aymanam (il villaggio vero del romanzo sulle backwaters del Kerala), il fiume Meenachal (il cuore tragico della storia, senza spoiler), le backwaters in barca, Kottayam', note: 'opera sotto copyright: niente citazioni letterali' },
  { t: 'Il vicolo del Mortaio', a: 'Naguib Mahfouz', y: 1947, city: 'Il Cairo', country: 'Egitto', lat: 30.05, lon: 31.26, locs: 'il vicolo Zuqāq al-Midaqq nel quartiere di Khan el-Khalili (il vicolo vero che dà il titolo al romanzo del Nobel egiziano), il caffè El Fishawy (aperto da oltre due secoli: il mondo dei caffè di Mahfouz, tappa tè), la Gamaliya dell\'infanzia dello scrittore, la moschea di al-Husayn', note: 'opera sotto copyright: niente citazioni letterali' },
  { t: 'Robinson Crusoe', a: 'Daniel Defoe', y: 1719, pd: true, city: 'Isola Robinson Crusoe', country: 'Cile', lat: -33.64, lon: -78.83, locs: 'l\'isola Robinson Crusoe nell\'arcipelago Juan Fernández (ribattezzata così dal Cile: qui visse DAVVERO il naufrago Alexander Selkirk che ispirò Defoe — il romanzo è ambientato nei Caraibi, dillo), il mirador de Selkirk (la vedetta da cui scrutava l\'orizzonte), il villaggio di San Juan Bautista', note: 'itinerario remoto: voli piccoli e mare — logistica onesta' },
  // ── ONDATA 2: 22 titoli per portare il seed da 78 a 100, spread globale.
  //    NOTA: la prima stesura di questo blocco duplicava 13 titoli già
  //    presenti più sopra (slug identico) più 1 duplicato semantico
  //    ("Il nome della rosa (il romanzo)" già in elenco): qui restano solo
  //    i 7 davvero nuovi di quella stesura + 15 titoli sostitutivi, zero
  //    collisioni di slug (verificato con scratch/verify-library-seeds-nuovi-media.mjs). ──
  { t: 'Il libro della giungla', a: 'Rudyard Kipling', y: 1894, pd: true, city: 'Seoni', country: 'India', lat: 22.09, lon: 79.54, locs: 'i boschi della zona di Seoni e Pench (l\'area che Kipling, pur non avendola mai visitata di persona, scelse per ambientare la giungla di Mowgli: oggi Pench Tiger Reserve), il Pench National Park dove si organizzano safari a tema "giungla di Mowgli"', note: 'Kipling scrisse il libro a Vermont, negli Stati Uniti, basandosi su resoconti e mappe dell\'India coloniale: dillo con onestà, non finse mai di averla visitata' },
  { t: 'Il crollo (Things Fall Apart)', a: 'Chinua Achebe', y: 1958, city: 'Ogidi', country: 'Nigeria', lat: 6.18, lon: 6.85, locs: 'Ogidi, il villaggio igbo natale di Achebe che ispirò l\'Umuofia del romanzo (memoriale e biblioteca a lui dedicati), la regione dell\'Anambra con i villaggi tradizionali igbo ancora riconoscibili nella struttura sociale descritta', note: 'opera sotto copyright: niente citazioni letterali; il romanzo più tradotto della letteratura africana moderna — raccontalo con il suo peso storico, non come semplice ambientazione esotica' },
  { t: 'Il richiamo della foresta', a: 'Jack London', y: 1903, pd: true, city: 'Dawson City', country: 'Canada', lat: 64.06, lon: -139.43, locs: 'Dawson City nello Yukon (il cuore della corsa all\'oro del Klondike che London visse in prima persona nel 1897-98, oggi città storica conservata), il Jack London Museum con la replica della sua cabina di cercatore d\'oro, i sentieri della Klondike Gold Rush', note: '' },
  { t: 'Furore', a: 'John Steinbeck', y: 1939, city: 'Sallisaw', country: 'Stati Uniti', lat: 35.46, lon: -94.78, locs: 'Sallisaw in Oklahoma (punto di partenza della famiglia Joad in fuga dal Dust Bowl), la Route 66 seguita nel romanzo verso ovest, la Salinas Valley in California (dove Steinbeck stesso crebbe e dove il romanzo si chiude tra i campi di raccolta)', note: 'opera sotto copyright: niente citazioni letterali; racconta la Grande Depressione e le sue migrazioni interne con il rigore storico che il romanzo stesso rivendicava' },
  { t: 'Anna Karenina', a: 'Lev Tolstoj', y: 1877, pd: true, city: 'Jasnaja Poljana', country: 'Russia', lat: 54.08, lon: 37.52, locs: 'la tenuta di Jasnaja Poljana (la casa-museo dove Tolstoj visse e scrisse quasi tutta la sua opera, con la sua tomba senza lapide nel bosco, per sua esplicita volontà), la stazione ferroviaria di Astapovo dove Tolstoj morì nel 1910 (oggi museo, eco tragica del finale del romanzo)', note: '' },
  { t: 'Jane Eyre', a: 'Charlotte Brontë', y: 1847, pd: true, city: 'Haworth', country: 'Regno Unito', lat: 53.83, lon: -1.96, locs: 'la Brontë Parsonage Museum (la casa di famiglia, con lo studio di Charlotte), North Lees Hall nel Derbyshire (la magione che ispirò Thornfield Hall, la casa di Mr. Rochester), la brughiera dello Yorkshire attraversata da Jane in fuga', note: '' },
  { t: 'Pinocchio', a: 'Carlo Collodi', y: 1883, pd: true, city: 'Collodi', country: 'Italia', lat: 43.92, lon: 10.66, locs: 'il Parco di Pinocchio a Collodi (il paese che diede lo pseudonimo a Carlo Lorenzini, con il parco a tema dedicato alle avventure del burattino), Villa Garzoni e il suo giardino storico accanto, Firenze dove Collodi visse e lavorò come giornalista', note: '' },
  { t: 'L\'amore ai tempi del colera', a: 'Gabriel García Márquez', y: 1985, city: 'Cartagena', country: 'Colombia', lat: 10.39, lon: -75.51, locs: 'il centro storico coloniale di Cartagena de Indias UNESCO (la città non nominata esplicitamente nel romanzo ma riconoscibile in ogni via, dove García Márquez visse), i portici del mercato sul fiume, il molo dei battelli fluviali sul Magdalena della traversata finale del romanzo', note: 'opera sotto copyright: niente citazioni letterali' },
  { t: 'Kim', a: 'Rudyard Kipling', y: 1901, pd: true, city: 'Lahore', country: 'Pakistan', lat: 31.58, lon: 74.31, locs: 'lo Zam-Zammah, il grande cannone davanti al Lahore Museum (la prima scena del romanzo, "il ragazzo si sedeva a cavalcioni del cannone Zam-Zammah": cannone e museo esistono davvero), il Lahore Museum (dove il curatore ispirò il personaggio del "Guardiano delle Meraviglie"), la Grand Trunk Road percorsa nel romanzo', note: '' },
  { t: 'Petali viola', a: 'Chimamanda Ngozi Adichie', y: 2003, city: 'Enugu', country: 'Nigeria', lat: 6.44, lon: 7.5, locs: 'Enugu (la città della Nigeria sud-orientale dove è ambientata la casa oppressiva di Kambili, e dove l\'autrice stessa è cresciuta), Nsukka (il rifugio di zia Ifeoma nel campus universitario, luogo reale della University of Nigeria dove il padre di Adichie insegnava)', note: 'opera sotto copyright: niente citazioni letterali' },
  { t: 'Neve', a: 'Orhan Pamuk', y: 2002, city: 'Kars', country: 'Turchia', lat: 40.6, lon: 43.09, locs: 'Kars, la città dell\'Anatolia orientale al confine con l\'Armenia dove è ambientato l\'intero romanzo (le vie innevate, gli edifici russi e armeni della città vecchia che Pamuk descrive con precisione da reportage), il teatro nazionale di Kars (sede della scena centrale del romanzo)', note: 'opera sotto copyright: niente citazioni letterali; Pamuk è premio Nobel per la letteratura 2006' },
  { t: 'Il cacciatore di aquiloni', a: 'Khaled Hosseini', y: 2003, city: 'Kabul', country: 'Afghanistan', lat: 34.56, lon: 69.21, locs: 'il quartiere di Wazir Akbar Khan a Kabul (il quartiere benestante dell\'infanzia di Amir, oggi profondamente cambiato dai decenni di guerra: dillo con onestà), lo stadio Ghazi (le competizioni di aquiloni della tradizione afghana raccontate nel romanzo)', note: 'opera sotto copyright: niente citazioni letterali; sul contesto storico-politico afghano tono sobrio e informato, mai da cartolina' },
  { t: 'Cuore di tenebra', a: 'Joseph Conrad', y: 1899, pd: true, city: 'Kinshasa', country: 'Repubblica Democratica del Congo', lat: -4.32, lon: 15.31, locs: 'il fiume Congo risalito nel romanzo (Conrad lo percorse davvero nel 1890 come ufficiale di marina, esperienza diretta alla base del libro), Kinshasa/l\'ex Léopoldville come punto di partenza del viaggio fluviale', note: 'il romanzo denuncia gli orrori del colonialismo belga in Congo ma con uno sguardo europeo dell\'epoca oggi criticato: presentalo con questo contesto storico-critico, mai come avventura esotica' },
  { t: 'Picnic ad Hanging Rock', a: 'Joan Lindsay', y: 1967, city: 'Hanging Rock', country: 'Australia', lat: -37.36, lon: 144.6, locs: 'Hanging Rock nel Victoria (la formazione vulcanica reale su cui è ambientata la sparizione del romanzo, oggi riserva naturale percorribile con sentieri), il villaggio di Woodend ai piedi della formazione', note: 'la storia è presentata dall\'autrice come "forse vera forse no": è FICTION, nessuna sparizione reale è mai stata documentata a Hanging Rock — dillo con chiarezza, è un equivoco diffuso tra i turisti' },
  { t: 'Paese delle nevi', a: 'Yasunari Kawabata', y: 1937, pd: true, city: 'Yuzawa', country: 'Giappone', lat: 36.93, lon: 138.81, locs: 'Echigo-Yuzawa (la stazione termale di montagna dove Kawabata soggiornò e ambientò il romanzo, con le sorgenti calde e i lunghi inverni nevosi descritti), il museo letterario locale dedicato al romanzo, il tunnel ferroviario dell\'incipit più famoso della letteratura giapponese ("Attraversato il lungo tunnel di confine, si era nel paese della neve")', note: 'Kawabata è il primo autore giapponese a vincere il Nobel per la letteratura (1968)' },
  { t: 'La tigre bianca', a: 'Aravind Adiga', y: 2008, city: 'Bangalore', country: 'India', lat: 12.97, lon: 77.59, locs: 'Bangalore (la metropoli tecnologica dove il protagonista Balram arriva a fare fortuna, simbolo della nuova India globalizzata), Nuova Delhi (la città degli anni da autista del suo padrone, coi contrasti tra i quartieri ricchi e i bassifondi raccontati nel romanzo)', note: 'opera sotto copyright: niente citazioni letterali; vincitore del Booker Prize 2008' },
  { t: 'American Gods', a: 'Neil Gaiman', y: 2001, city: 'Spring Green', country: 'Stati Uniti', lat: 43.18, lon: -90.06, locs: 'House on the Rock nel Wisconsin (l\'eccentrica attrazione turistica reale, con la giostra da record mondiale, che nel romanzo diventa il luogo d\'incontro degli dei antichi in America), la Route 66 e le strade secondarie americane percorse nel romanzo', note: 'opera sotto copyright: niente citazioni letterali' },
  { t: 'Amatissima', a: 'Toni Morrison', y: 1987, city: 'Cincinnati', country: 'Stati Uniti', lat: 39.1, lon: -84.51, locs: 'Cincinnati in Ohio (la città sulla riva libera dell\'Ohio River dove è ambientata la casa di Sethe, tappa storica della Underground Railroad per gli schiavi in fuga verso il Nord), il fiume Ohio come confine simbolico tra schiavitù e libertà nel romanzo', note: 'opera sotto copyright: niente citazioni letterali; Premio Nobel per la letteratura 1993, romanzo ispirato a una storia vera di schiavitù — tono grave e rispettoso' },
  { t: 'Persepolis', a: 'Marjane Satrapi', y: 2000, city: 'Teheran', country: 'Iran', lat: 35.69, lon: 51.39, locs: 'i quartieri di Teheran dell\'infanzia dell\'autrice negli anni della rivoluzione islamica e della guerra Iran-Iraq (il romanzo grafico autobiografico racconta luoghi e famiglia reali), la scuola francese di Teheran frequentata da Satrapi bambina', note: 'opera sotto copyright: niente citazioni letterali; graphic novel autobiografico, tono storico rispettoso su un periodo difficile' },
  { t: 'La casa degli spiriti', a: 'Isabel Allende', y: 1982, city: 'Santiago del Cile', country: 'Cile', lat: -33.45, lon: -70.65, locs: 'Santiago del Cile (la capitale dove è ambientata la saga della famiglia Trueba, attraverso decenni di storia cilena fino al golpe del 1973, raccontato senza nominarlo esplicitamente ma riconoscibile), i quartieri storici del centro che ispirarono la "grande casa d\'angolo" del romanzo', note: 'opera sotto copyright: niente citazioni letterali; il colpo di stato cileno del 1973 sullo sfondo del finale: tono storico grave' },
  { t: 'Le mille e una notte', a: 'tradizione araba, persiana e indiana', y: 900, pd: true, city: 'Baghdad', country: 'Iraq', lat: 33.31, lon: 44.36, locs: 'Baghdad califfale (l\'ambientazione di molti dei racconti più celebri, nella città che fu capitale abbaside e centro del sapere del mondo islamico medievale), il fiume Tigri che attraversa i racconti, la tradizione orale del cantastorie ancora viva in alcuni caffè storici del mondo arabo', note: 'raccolta stratificata nei secoli da più tradizioni, senza un autore unico: presentala come tale, non come opera di un singolo scrittore' },
  { t: 'Suite francese', a: 'Irène Némirovsky', y: 1942, city: 'Issy-l\'Évêque', country: 'Francia', lat: 46.69, lon: 4.09, locs: 'Issy-l\'Évêque in Borgogna (il villaggio dove Némirovsky visse nascosta durante l\'occupazione nazista e scrisse il manoscritto poi ritrovato dalla figlia decenni dopo), la stazione ferroviaria da cui l\'autrice fu deportata ad Auschwitz nel 1942, dove morì', note: 'romanzo incompiuto per la morte dell\'autrice nella Shoah: tono grave e rispettoso; opera sotto copyright, niente citazioni letterali' },
];

/** Brief editoriale di un libro del seed: regole speculari ai film
 *  (passaggi al posto delle scene, autore al posto degli attori,
 *  citazioni testuali SOLO per opere di pubblico dominio). */
function bookBrief(b: BookDef): string {
  return [
    `Itinerario NEI LUOGHI di "${b.t}" di ${b.a} (${b.y}), nell'area di ${b.city}: le tappe principali SONO i luoghi reali del libro.`,
    `LUOGHI CHIAVE VERIFICATI (usa QUESTI come tappe, citati per nome): ${b.locs}.`,
    b.note ? `NOTA DI ONESTÀ/ANEDDOTO: ${b.note}.` : '',
    `REGOLA PASSAGGI (vincolante): nel campo "attivita" di OGNI tappa-luogo racconta concretamente il passaggio o capitolo ambientato lì — cosa accade, quali personaggi, perché conta nel libro — citando SEMPRE l'autore (${b.a}); poi il confronto pagina/realtà: cosa si riconosce oggi e da dove guardare per "entrare nella pagina". Niente spoiler pesanti del finale (se inevitabile premetti "attenzione spoiler").`,
    b.pd
      ? 'CITAZIONI TESTUALI: opera di pubblico dominio: puoi citare AL MASSIMO 2-3 righe testuali per tappa, SOLO se le conosci con certezza; nel dubbio racconta con parole tue.'
      : 'CITAZIONI TESTUALI: opera SOTTO COPYRIGHT: VIETATO riportare testo letterale, racconta i passaggi SOLO con parole tue.',
    'LOCALI DEL LIBRO: se tra i luoghi c\'è un caffè/locanda/hotel reale e visitabile legato al libro o all\'autore, usalo come tappa pranzo o pausa: passaggio + cosa ordinare + avviso onesto se è diventato molto turistico. MAI attribuire un locale al libro se non è certo: nel dubbio ometti.',
    'VIETATO attribuire al libro luoghi, personaggi o aneddoti non presenti in questo brief e non certi; dove il brief segnala ispirazioni o attribuzioni tradizionali, presentale come tali. Completa la giornata con pasti in locali reali lungo il percorso e al massimo 2-3 tappe di contorno coerenti con la zona. Tono da lettore innamorato ma rigoroso.',
  ].filter(Boolean).join('\n');
}

/** I descrittori del seed libri curato (slug 'book-<titolo-slug>'). */
export function bookDescriptors(): LibraryDescriptor[] {
  return BOOKS.map(b => ({
    slug: `book-${slugify(b.t)}`,
    kind: 'theme' as LibraryKind,
    title: `📚 ${b.t} — i luoghi del libro`,
    city: b.city,
    country: b.country,
    coords: { lat: b.lat, lon: b.lon },
    days: b.days ?? 1,
    theme: 'libri',
    angle: 'libri',
    brief: bookBrief(b),
    contextHints: {},
  }));
}

// ─────────────────────────────────────────────────────────────────────
// 8) ONDATA 2 — "LUOGHI DI": sei nuovi media col seed curato mondiale.
//    Stessa filosofia di FILM/BOOKS: ogni voce porta i SUOI luoghi reali
//    citati per nome con la storia specifica; l'harvest Wikidata (dove
//    esiste: storia, arte, scienza) vive lato server con slug <media>-<qid>,
//    qui gli slug sono per titolo: nessuna collisione.
// ─────────────────────────────────────────────────────────────────────

/** Voce del seed di un media "luoghi di" (musica/arte/storia/scienza/
 *  sport/moda): compatta come FilmDef, con `who` = protagonisti citabili
 *  come materiale certo (artisti, scienziati, maison…). */
interface MediaWorkDef {
  /** Titolo dell'itinerario (già autoesplicativo, es. 'Waterloo 1815'). */
  t: string;
  /** Protagonisti/opere citabili come materiale CERTO. */
  who?: string;
  /** Anno o periodo (stringa libera). */
  y?: string | number;
  city: string;
  country: string;
  lat: number;
  lon: number;
  days?: number;
  /** 2-5 luoghi REALI, per nome, con la storia specifica di ciascuno. */
  locs: string;
  /** Nota di onestà (leggende, chiusure, attribuzioni) o aneddoto. */
  note?: string;
}

/** Definizione di un media del seed: tema, prefisso slug e regole
 *  editoriali che entrano nel brief di OGNI voce. */
interface MediaSeedDef {
  theme: string;
  slugPrefix: string;
  emoji: string;
  /** Etichetta leggibile del media (per le chips e i badge). */
  label: string;
  /** Regole editoriali del media (accodate al brief di ogni voce). */
  rules: string[];
  works: MediaWorkDef[];
}

/** Brief di una voce media: stessa architettura di filmBrief/bookBrief. */
function mediaWorkBrief(def: MediaSeedDef, w: MediaWorkDef): string {
  return [
    `Itinerario "${w.t}"${w.who ? ` — protagonisti (materiale certo, citali nelle tappe): ${w.who}` : ''}${w.y ? ` (${w.y})` : ''}, nell'area di ${w.city}: le tappe principali SONO i luoghi reali indicati qui sotto.`,
    `LUOGHI CHIAVE VERIFICATI (usa QUESTI come tappe, citati per nome): ${w.locs}.`,
    w.note ? `NOTA DI ONESTÀ/ANEDDOTO: ${w.note}.` : '',
    ...def.rules,
    'VIETATO attribuire al tema luoghi, persone o aneddoti non presenti in questo brief e non certi; dove il brief segnala leggende o attribuzioni tradizionali, presentale come tali. Completa la giornata con pranzo e cena in locali reali lungo il percorso e al massimo 2-3 tappe di contorno coerenti con la zona.',
  ].filter(Boolean).join('\n');
}

/** Descrittori di un media del seed (slug '<prefix>-<titolo-slug>'). */
function mediaSeedDescriptors(def: MediaSeedDef): LibraryDescriptor[] {
  return def.works.map(w => ({
    slug: `${def.slugPrefix}-${slugify(w.t)}`,
    kind: 'theme' as LibraryKind,
    title: `${def.emoji} ${w.t}`,
    city: w.city,
    country: w.country,
    coords: { lat: w.lat, lon: w.lon },
    days: w.days ?? 1,
    theme: def.theme,
    angle: def.theme,
    brief: mediaWorkBrief(def, w),
    contextHints: {},
  }));
}

// ── 🎵 MUSICA — i luoghi di canzoni, album, artisti ───────────────────
const MUSIC_SEED: MediaSeedDef = {
  theme: 'musica',
  slugPrefix: 'music',
  emoji: '🎵',
  label: 'Musica',
  rules: [
    'REGOLA MUSICA (vincolante): nel campo "attivita" di OGNI tappa racconta il momento musicale specifico legato al luogo — la canzone, la sessione, il concerto, l\'aneddoto documentato — citando artisti e opere SOLO tra quelli indicati o di cui sei assolutamente certo; poi il confronto ieri/oggi: cosa si riconosce e da dove ritrovare la scena (la copertina, il palco, la strada). Il consiglio_guida può suggerire il brano da ascoltare in cuffia sul posto.',
    'LOCALI DELLA MUSICA: se un club/caffè/studio dell\'elenco è visitabile o attivo, usalo come tappa con orari onesti (molti locali vivono la sera: dillo); MAI spacciare un locale per "quello della canzone" se non è nell\'elenco. Rispetto per i luoghi di memoria dei musicisti scomparsi: tono affettuoso, mai morboso.',
  ],
  works: [
    // ── Europa ──
    { t: 'Abbey Road e la Londra dei Beatles', who: 'The Beatles', y: 1969, city: 'Londra', country: 'Regno Unito', lat: 51.53, lon: -0.18, locs: 'le strisce pedonali di Abbey Road (la copertina: la foto si fa aspettando il varco nel traffico vero — pazienza e rispetto dei residenti), il muro degli Abbey Road Studios (si firma; dentro non si entra: dillo), il tetto del 3 di Savile Row (l\'ultimo concerto del 30 gennaio 1969, dalla strada), la stazione di Marylebone (le corse di A Hard Day\'s Night)', note: '' },
    { t: 'Liverpool dei Beatles', who: 'The Beatles', y: '1957-1963', city: 'Liverpool', country: 'Regno Unito', lat: 53.41, lon: -2.98, locs: 'il Cavern Club di Mathew Street (ricostruito coi mattoni originali a pochi metri dal sito vero: dillo), Penny Lane (il barbiere e la banca della canzone esistono), i cancelli rossi di Strawberry Field (oggi centro visite), le case d\'infanzia di Lennon e McCartney (National Trust, solo tour prenotato), la statua dei Fab Four al Pier Head', note: '' },
    { t: 'Camden e Soho: la Londra del rock', who: 'Amy Winehouse, David Bowie, Rolling Stones, Sex Pistols', y: '1962-2011', city: 'Londra', country: 'Regno Unito', lat: 51.54, lon: -0.14, locs: 'la statua di Amy Winehouse allo Stables Market di Camden (il suo quartiere), il Roundhouse (i debutti leggendari), Denmark Street (la "Tin Pan Alley" dei negozi di chitarre), Heddon Street (la copertina di Ziggy Stardust, targa), il 100 Club di Oxford Street (il punk del 1976)', note: '' },
    { t: 'Amburgo: i Beatles prima dei Beatles', who: 'The Beatles', y: '1960-1962', city: 'Amburgo', country: 'Germania', lat: 53.55, lon: 9.96, locs: 'la Große Freiheit col Kaiserkeller e l\'ex Star-Club (la targa nel cortile: qui suonarono centinaia di notti), la Beatles-Platz a forma di vinile con le sagome d\'acciaio, la Reeperbahn di Sankt Pauli (il rodaggio più duro della loro storia — "siamo nati a Liverpool ma cresciuti ad Amburgo", disse Lennon)', note: '' },
    { t: 'Berlino di Bowie e degli Hansa', who: 'David Bowie, Iggy Pop, Depeche Mode, U2', y: '1976-1991', city: 'Berlino', country: 'Germania', lat: 52.5, lon: 13.38, locs: 'gli Hansa Studios a Potsdamer Platz (la sala di "Heroes", a vista del Muro: si visita con tour dedicati), la casa di Hauptstraße 155 a Schöneberg (Bowie e Iggy coinquilini, targa commemorativa), il SO36 a Kreuzberg (il club della scena), l\'East Side Gallery come chiusura', note: '' },
    { t: 'Vienna dei grandi compositori', who: 'Mozart, Beethoven, Schubert, Strauss', y: 'XVIII-XIX secolo', city: 'Vienna', country: 'Austria', lat: 48.21, lon: 16.37, locs: 'la Mozarthaus in Domgasse (l\'unico appartamento viennese superstite di Mozart: qui scrisse Le nozze di Figaro), la casa del Testamento di Heiligenstadt (la lettera mai spedita di Beethoven sulla sordità — tono partecipe), il Musikverein (la Sala Dorata del concerto di Capodanno), il Cimitero Centrale col "quartiere dei musicisti" (Beethoven, Schubert, Brahms, gli Strauss)', note: '' },
    { t: 'Salisburgo di Mozart', who: 'Wolfgang Amadeus Mozart', y: 1756, city: 'Salisburgo', country: 'Austria', lat: 47.8, lon: 13.04, locs: 'la casa natale al 9 di Getreidegasse (il violino da bambino e i cimeli veri), la Casa di Residenza sul Makartplatz, il Duomo (dove fu battezzato e suonò l\'organo), il Festival estivo e il cimitero di San Sebastiano (la famiglia)', note: 'Mozart lasciò Salisburgo in rotta con l\'arcivescovo: raccontala senza oleografia' },
    { t: 'Bonn di Beethoven', who: 'Ludwig van Beethoven', y: 1770, city: 'Bonn', country: 'Germania', lat: 50.74, lon: 7.1, locs: 'la Beethoven-Haus in Bonngasse (la casa natale, coi corni acustici e i quaderni di conversazione), il monumento della Münsterplatz (inaugurato nel 1845 con Liszt tra gli organizzatori), il Reno delle passeggiate giovanili', note: '' },
    { t: 'Lipsia di Bach', who: 'Johann Sebastian Bach', y: '1723-1750', city: 'Lipsia', country: 'Germania', lat: 51.34, lon: 12.37, locs: 'la Thomaskirche (i 27 anni da Kantor, il coro dei Thomaner che canta ancora, la tomba nel coro), il Bach-Museum di fronte, il Gewandhaus, il caffè? no: la tradizione dei caffè di Zimmermann dove Bach suonava il venerdì (il locale non esiste più: dillo e racconta la Kaffeekantate)', note: '' },
    { t: 'Bayreuth di Wagner', who: 'Richard Wagner', y: 1876, city: 'Bayreuth', country: 'Germania', lat: 49.95, lon: 11.58, locs: 'il Festspielhaus sulla collina verde (il teatro costruito per il Ring, con la buca d\'orchestra invisibile: acustica unica, visite fuori festival), villa Wahnfried (il museo Wagner e la tomba nel giardino), il teatro dell\'Opera dei Margravi (il barocco UNESCO che attirò Wagner in città)', note: 'i biglietti del Festival richiedono anni di attesa: dillo; sul rapporto tra Wagner e il nazismo posteriore serve una parola onesta e sobria' },
    { t: 'Varsavia di Chopin', who: 'Fryderyk Chopin', y: '1810-1830', city: 'Varsavia', country: 'Polonia', lat: 52.23, lon: 21.02, locs: 'le panchine musicali del percorso Chopin (premi il tasto: suonano), il museo Chopin a palazzo Ostrogski, la chiesa di Santa Croce (il cuore di Chopin è murato in una colonna — storia vera e commovente), il monumento ai Łazienki coi recital gratuiti d\'estate, Żelazowa Wola (la casa natale, gita fuori città)', note: '' },
    { t: 'Valldemossa: Chopin e George Sand', who: 'Fryderyk Chopin, George Sand', y: 1838, city: 'Valldemossa', country: 'Spagna', lat: 39.71, lon: 2.62, locs: 'la Cartuja di Valldemossa (la cella dell\'inverno maiorchino, col pianoforte Pleyel arrivato per mare tra mille dogane — nel frattempo Chopin compose sui Preludi su un piano locale: raccontalo), il borgo di pietra, i belvedere della Tramuntana', note: '"Un inverno a Maiorca" di Sand racconta quel soggiorno tutt\'altro che idilliaco: onestà' },
    { t: 'Bergen di Grieg', who: 'Edvard Grieg', y: '1885-1907', city: 'Bergen', country: 'Norvegia', lat: 60.39, lon: 5.32, locs: 'Troldhaugen (la villa-museo di Grieg col capanno del compositore in riva al lago: scriveva solo lì, con vista acqua), la sala concerti seminterrata coi recital quotidiani estivi, il Bryggen come contorno', note: '' },
    { t: 'Montreux: Queen e Smoke on the Water', who: 'Queen, Freddie Mercury, Deep Purple', y: '1971-1991', city: 'Montreux', country: 'Svizzera', lat: 46.43, lon: 6.91, locs: 'la statua di Freddie Mercury sul lungolago (il pugno al cielo verso il lago che amava), il Queen Studio Experience al Casinò (i Mountain Studios veri, gratuito), il Casinò stesso (l\'incendio del 1971 durante un concerto ispirò Smoke on the Water dei Deep Purple che registravano lì accanto — raccontala guardando il lago e il fumo immaginario)', note: '' },
    { t: 'Dublino del rock', who: 'U2, Thin Lizzy, Glen Hansard', y: '1976-oggi', city: 'Dublino', country: 'Irlanda', lat: 53.34, lon: -6.26, locs: 'il muro dei fan ai Windmill Lane Studios (gli studi storici degli U2), la statua di Phil Lynott in Harry Street (i Thin Lizzy), Grafton Street dei busker (il mondo di Once), i pub con sessioni di musica tradizionale vere (non i medley per turisti: distingui)', note: '' },
    { t: 'Manchester: da Joy Division agli Oasis', who: 'Joy Division, The Smiths, Oasis, Sex Pistols', y: '1976-1996', city: 'Manchester', country: 'Regno Unito', lat: 53.48, lon: -2.24, locs: 'il Salford Lads Club (la foto degli Smiths sotto l\'insegna: si rifà), il sito dell\'Haçienda su Whitworth Street (oggi condominio con lo stesso nome — ieri/oggi onesto), la Free Trade Hall (il concerto dei Sex Pistols del 1976 davanti a 40 persone che fondarono tutte una band — leggenda vera), il Northern Quarter dei dischi e dei murales', note: '' },
    { t: 'Lisbona del fado', who: 'Amália Rodrigues, Maria Severa', y: 'XIX secolo-oggi', city: 'Lisbona', country: 'Portogallo', lat: 38.71, lon: -9.13, locs: 'il Museu do Fado ad Alfama, la Mouraria della Severa (la prima fadista leggendaria, rua do Capelão con le targhe), la casa-museo di Amália Rodrigues in rua de São Bento, il Pantheon Nazionale (la tomba di Amália), una casa de fado seria per la cena (spiega il silenzio dovuto durante il canto)', note: '' },
    { t: 'Siviglia e il flamenco', who: 'la scuola sivigliana e Triana', y: 'XVIII secolo-oggi', city: 'Siviglia', country: 'Spagna', lat: 37.38, lon: -5.99, locs: 'Triana oltre il ponte (la culla dei cantaores, il mercato e la ceramica), il Museo del Baile Flamenco di Cristina Hoyos, l\'Alameda de Hércules dei locali vivi, un tablao onesto la sera (distingui il duende dallo spettacolo da pullman)', note: '' },
    { t: 'Bologna di Lucio Dalla', who: 'Lucio Dalla', y: '1943-2012', city: 'Bologna', country: 'Italia', lat: 44.49, lon: 11.34, locs: 'la casa di Lucio Dalla in via D\'Azeglio 15 (aperta con visite della fondazione: prenotare), piazza Cavour e i portici di "Piazza Grande" (Dalla raccontò che la piazza della canzone era questa, non piazza Maggiore — aneddoto da dire), la targa e i luoghi del centro tra osterie e conservatorio', note: '' },
    { t: 'Genova di De André', who: 'Fabrizio De André', y: '1940-1999', city: 'Genova', country: 'Italia', lat: 44.41, lon: 8.93, locs: 'via del Campo (la strada della canzone, con "viadelcampo29rosso": il museo-bottega coi dischi e la chitarra), i caruggi di Crêuza de mä tra Maddalena e porto (le voci e gli odori del disco), piazza? no: il porto vecchio e la città vecchia "dove il sole del buon Dio non dà i suoi raggi"', note: '' },
    { t: 'Napoli in musica', who: 'la canzone napoletana, Pino Daniele', y: '1880-oggi', city: 'Napoli', country: 'Italia', lat: 40.84, lon: 14.25, locs: 'Santa Lucia e il borgo marinari (la canzone omonima), la finestrella di Marechiaro con la targa dei versi di Salvatore Di Giacomo, Piedigrotta (la festa da cui passò un secolo di canzoni), il Gran Caffè Gambrinus dei poeti, i vicoli di Pino Daniele tra piazza del Gesù e Santa Chiara ("Napule è" come colonna sonora)', note: '\'O sole mio fu scritta da Eduardo di Capua in tournée a Odessa: aneddoto vero da raccontare' },
    { t: 'Sanremo della canzone italiana', who: 'il Festival di Sanremo', y: '1951-oggi', city: 'Sanremo', country: 'Italia', lat: 43.82, lon: 7.78, locs: 'il Teatro Ariston (il palco del Festival: fuori stagione si visita con eventi), il Casinò (le prime edizioni dal 1951 al 1976), via Matteotti del red carpet, la città vecchia (la Pigna) per respirare la Sanremo vera', note: '' },
    { t: 'Milano di Verdi e della Scala', who: 'Giuseppe Verdi, Arturo Toscanini', y: '1839-1901', city: 'Milano', country: 'Italia', lat: 45.47, lon: 9.19, locs: 'il Teatro alla Scala col museo (i palchi, i ritratti, le bacchette), la Casa di Riposo per Musicisti fondata da Verdi (la "mia opera più bella", disse: nella cripta riposa con la moglie Giuseppina — si visita con rispetto), il Grand Hotel et de Milan (la stanza dove morì nel 1901, con la città che stese paglia in strada per attutire i rumori — storia vera)', note: '' },
    { t: 'Busseto: le terre di Verdi', who: 'Giuseppe Verdi', y: 1813, city: 'Busseto', country: 'Italia', lat: 44.98, lon: 10.04, locs: 'la casa natale alle Roncole (l\'organo su cui imparò), il Teatro Verdi di Busseto (che il maestro non volle mai inaugurare di persona — aneddoto), villa Sant\'Agata (la tenuta dove visse 50 anni: verifica aperture, gestione in evoluzione — dillo), la casa Barezzi del primo mecenate', note: '' },
    { t: 'Torre del Lago di Puccini', who: 'Giacomo Puccini', y: '1891-1924', city: 'Torre del Lago', country: 'Italia', lat: 43.83, lon: 10.29, locs: 'la villa-museo Puccini sul lago di Massaciuccoli (lo studio, i fucili da caccia, la tomba nella cappella), il Gran Teatro all\'aperto del Festival Puccini (luglio-agosto), Lucca con la casa natale in corte San Lorenzo (estensione)', note: '' },
    { t: 'Pesaro di Rossini', who: 'Gioachino Rossini', y: 1792, city: 'Pesaro', country: 'Italia', lat: 43.91, lon: 12.91, locs: 'la casa natale di via Rossini, il Teatro Rossini, il Rossini Opera Festival (agosto), il conservatorio che porta il suo nome e il museo nazionale Rossini', note: 'gourmet fino al mito (i tournedos alla Rossini): l\'aggancio gastronomico è d\'obbligo' },
    { t: 'Catania di Bellini', who: 'Vincenzo Bellini', y: 1801, city: 'Catania', country: 'Italia', lat: 37.5, lon: 15.09, locs: 'il museo Belliniano nella casa natale in piazza San Francesco, il Teatro Massimo Bellini (l\'acustica celebre e le stagioni), la tomba nel Duomo di Catania (rientrata da Parigi nel 1876 tra folle commosse), il giardino Bellini', note: 'la pasta alla Norma prende il nome dalla sua opera: aneddoto goloso vero' },
    { t: 'Cremona del violino', who: 'Stradivari, Guarneri, Amati', y: 'XVI-XVIII secolo', city: 'Cremona', country: 'Italia', lat: 45.13, lon: 10.02, locs: 'il Museo del Violino (gli Stradivari veri e l\'audizione quotidiana: uno strumento storico suonato dal vivo — prenota), le botteghe dei liutai di oggi (più di 150 in città: il saper fare UNESCO), la piazza del Comune col Torrazzo', note: '' },
    { t: 'Venezia di Vivaldi', who: 'Antonio Vivaldi', y: '1678-1741', city: 'Venezia', country: 'Italia', lat: 45.44, lon: 12.34, locs: 'la chiesa della Pietà sulla riva degli Schiavoni (l\'ospedale delle putte dove il Prete Rosso insegnò violino per decenni: le sue orfane erano l\'orchestra più famosa d\'Europa), il museo della musica in San Maurizio (gratuito), la chiesa di San Giovanni in Bragora (il battesimo)', note: '' },
    { t: 'Praga di Dvořák e Smetana', who: 'Antonín Dvořák, Bedřich Smetana', y: 'XIX secolo', city: 'Praga', country: 'Cechia', lat: 50.08, lon: 14.42, locs: 'il museo Dvořák nella villa America, il museo Smetana in riva alla Moldava (davanti al fiume della sua Má vlast), il Rudolfinum (la sala Dvořák), il Vyšehrad col cimitero degli artisti (le tombe di entrambi)', note: '' },
    { t: 'Budapest di Liszt', who: 'Franz Liszt', y: 'XIX secolo', city: 'Budapest', country: 'Ungheria', lat: 47.5, lon: 19.06, locs: 'il museo Liszt nell\'appartamento vero dell\'Accademia Vecchia (i pianoforti su cui insegnava), l\'Accademia di Musica Liszt (la sala liberty tra le più belle d\'Europa: concerti quasi ogni sera), l\'Opera di Andrássy út', note: '' },
    { t: 'Stoccolma degli ABBA', who: 'ABBA', y: '1972-1982', city: 'Stoccolma', country: 'Svezia', lat: 59.32, lon: 18.1, locs: 'ABBA The Museum a Djurgården (i costumi, lo studio Polar ricostruito, il pianoforte collegato a casa di Benny che suona quando suona lui — vero), Gamla Stan e i luoghi delle copertine, lo Skansen come contorno', note: '' },
    { t: 'Parigi di Piaf e del jazz', who: 'Édith Piaf, Django Reinhardt, Jim Morrison', y: '1915-1971', city: 'Parigi', country: 'Francia', lat: 48.86, lon: 2.34, locs: 'Belleville (la leggenda della nascita di Piaf sul marciapiede del 72 di rue de Belleville — leggenda, c\'è la targa: dillo), il museo? no: l\'Olympia (il tempio della chanson dove Piaf risorse nel 1961), le caves del Quartiere Latino (il Caveau de la Huchette di Whiplash e del bebop, si balla ancora), il Père-Lachaise (Piaf e Jim Morrison: il rito silenzioso)', note: '' },
    // ── Americhe ──
    { t: 'Memphis: Graceland e Sun Studio', who: 'Elvis Presley, Johnny Cash, B.B. King', y: '1953-1977', city: 'Memphis', country: 'Stati Uniti', lat: 35.13, lon: -90.02, locs: 'Graceland (le stanze ferme agli anni \'70, la Jungle Room, il Meditation Garden con la tomba), il Sun Studio (il microfono dove Elvis incise That\'s All Right e la storia del Million Dollar Quartet — il tour lo fa toccare), Beale Street (i neon del blues), lo Stax Museum of American Soul Music', note: '' },
    { t: 'Nashville, Music City', who: 'Johnny Cash, Dolly Parton, Elvis', y: '1925-oggi', city: 'Nashville', country: 'Stati Uniti', lat: 36.16, lon: -86.78, locs: 'il Ryman Auditorium (la "chiesa madre" della country music: si incide un 45 giri nel backstage), il Country Music Hall of Fame con lo Studio B della RCA (dove Elvis incise centinaia di brani, si visita), la Grand Ole Opry (lo show radiofonico più longevo d\'America), gli honky-tonk di Broadway (musica dal vivo gratis dalle 10 del mattino)', note: '' },
    { t: 'New Orleans, la culla del jazz', who: 'Louis Armstrong, Jelly Roll Morton', y: '1895-oggi', city: 'New Orleans', country: 'Stati Uniti', lat: 29.96, lon: -90.06, locs: 'Congo Square nel Louis Armstrong Park (dove gli schiavi potevano suonare la domenica: qui affondano le radici di tutto), la Preservation Hall (concerti acustici in una stanza spoglia: la coda vale la pena), Frenchmen Street (i club veri, meglio di Bourbon Street: dillo), il French Quarter delle brass band di strada', note: '' },
    { t: 'Clarksdale e il Delta blues', who: 'Robert Johnson, Muddy Waters', y: '1920-1950', city: 'Clarksdale', country: 'Stati Uniti', lat: 34.2, lon: -90.57, locs: 'il crossroads delle highway 61 e 49 (la leggenda di Robert Johnson che vende l\'anima al diavolo — leggenda, con le chitarre sul palo: raccontala come tale), il Delta Blues Museum (la capanna di Muddy Waters), un juke joint vero la sera (Red\'s: niente vetrina, solo blues), Dockery Farms a mezz\'ora (per molti storici la vera culla del blues)', note: '' },
    { t: 'Detroit della Motown', who: 'Motown, Stevie Wonder, Marvin Gaye, Supremes', y: '1959-1972', city: 'Detroit', country: 'Stati Uniti', lat: 42.36, lon: -83.09, locs: 'Hitsville U.S.A. (il Motown Museum: lo Studio A è rimasto intatto e nel tour si canta in coro sul serio), il West Grand Boulevard delle case-uffici della label, il teatro Fox e la rinascita del centro', note: '' },
    { t: 'Chicago elettrica: il blues del Nord', who: 'Muddy Waters, Chess Records, Buddy Guy', y: '1947-1967', city: 'Chicago', country: 'Stati Uniti', lat: 41.85, lon: -87.62, locs: 'il 2120 di South Michigan Avenue (gli studi Chess, oggi fondazione di Willie Dixon: i Rolling Stones vi incisero il brano intitolato proprio 2120 South Michigan Avenue), Buddy Guy\'s Legends (il club del patriarca vivente), la vecchia Maxwell Street (dove il blues si elettrificò per farsi sentire nel mercato — ieri/oggi)', note: '' },
    { t: 'New York: dal Village al punk', who: 'Bob Dylan, Ramones, John Lennon', y: '1961-1980', city: 'New York', country: 'Stati Uniti', lat: 40.73, lon: -73.99, locs: 'il Greenwich Village di Dylan (Jones Street: la copertina di The Freewheelin\' si rifà in trenta secondi; il Cafe Wha? dove debuttò), il 315 Bowery (l\'insegna del CBGB non c\'è più, dentro c\'è un negozio ma i muri restano: ieri/oggi del punk), l\'Apollo Theater di Harlem (la Amateur Night che lanciò Ella Fitzgerald), Strawberry Fields e il Dakota (il ricordo di Lennon: tono sobrio)', note: '' },
    { t: 'Seattle del grunge', who: 'Nirvana, Pearl Jam, Jimi Hendrix', y: '1988-1994', city: 'Seattle', country: 'Stati Uniti', lat: 47.61, lon: -122.33, locs: 'il MoPOP di Frank Gehry (le chitarre distrutte e la galleria Nirvana), la statua di Jimi Hendrix a Capitol Hill, la panchina di Viretta Park accanto alla casa di Kurt Cobain (il memoriale spontaneo dei fan: rispetto e niente foto invadenti), il Central Saloon di Pioneer Square (i primi palchi)', note: '' },
    { t: 'Los Angeles: Sunset Strip e Laurel Canyon', who: 'The Doors, Joni Mitchell, Guns N\' Roses', y: '1965-1990', city: 'Los Angeles', country: 'Stati Uniti', lat: 34.09, lon: -118.39, locs: 'il Whisky a Go Go (la casa dei Doors), il Troubadour (il debutto di Elton John in America), il Laurel Canyon dei cantautori (il Country Store e le strade delle case di Joni Mitchell e CSN — si guarda con discrezione), la torre della Capitol Records a Hollywood', note: '' },
    { t: 'San Francisco della Summer of Love', who: 'Grateful Dead, Janis Joplin, Jefferson Airplane', y: 1967, city: 'San Francisco', country: 'Stati Uniti', lat: 37.77, lon: -122.45, locs: 'Haight-Ashbury (l\'incrocio simbolo, la casa dei Grateful Dead al 710 di Ashbury e quella di Janis Joplin al 122 di Lyon — esterni privati: dillo), il Golden Gate Park del Human Be-In, il Fillmore (i poster psichedelici e le mele all\'ingresso, tradizione vera)', note: '' },
    { t: 'L\'Avana del son', who: 'Buena Vista Social Club, Compay Segundo', y: '1930-oggi', city: 'L\'Avana', country: 'Cuba', lat: 23.13, lon: -82.37, locs: 'il Callejón de Hamel (la rumba della domenica pomeriggio tra i murales), gli studios Areito della Egrem (dove Ry Cooder registrò Buena Vista Social Club: il club originale di Marianao non esiste più — dillo), il Malecón al tramonto con i musicisti di strada, la Fábrica de Arte Cubano', note: '' },
    { t: 'Kingston di Bob Marley', who: 'Bob Marley, Peter Tosh', y: '1962-1981', city: 'Kingston', country: 'Giamaica', lat: 18.02, lon: -76.79, locs: 'il Bob Marley Museum al 56 di Hope Road (la casa con i fori dei proiettili dell\'attentato del 1976 lasciati a vista — raccontalo), il Trench Town Culture Yard (il cortile dove imparò a suonare: solo con le guide della comunità), i Tuff Gong studios, lo stadio? no: il National Heroes Park come contesto', note: 'quartieri da girare con guide locali e buon senso: dillo con franchezza' },
    { t: 'Buenos Aires del tango', who: 'Carlos Gardel, Astor Piazzolla', y: '1900-oggi', city: 'Buenos Aires', country: 'Argentina', lat: -34.6, lon: -58.42, locs: 'l\'Abasto di Gardel (il mercato monumentale diventato mall, la statua e il barrio del "Morocho"), la tomba di Gardel alla Chacarita (la sigaretta accesa tra le dita di bronzo: rito vero dei devoti), San Telmo delle milonghe autentiche (distingui la milonga vera dalla cena-show), Caminito a La Boca (il tango da cartolina: bello ma dichiaratamente turistico)', note: '' },
    { t: 'Rio della bossa nova', who: 'Tom Jobim, Vinícius de Moraes', y: '1958-1965', city: 'Rio de Janeiro', country: 'Brasile', lat: -22.98, lon: -43.2, locs: 'il bar Garota de Ipanema in rua Vinícius de Moraes (l\'ex Veloso dove Jobim e Vinícius videro passare Helô Pinheiro e nacque la canzone: targa e spartito al muro), il Beco das Garrafas a Copacabana (i clubetti dove la bossa prese forma), Lapa e il Circo Voador per il samba di oggi, l\'aeroporto? no: il pianinho di Jobim al Jardim Botânico (il palco della memoria)', note: '' },
    { t: 'Salvador: tamburi di Bahia', who: 'Olodum, Dorival Caymmi', y: '1979-oggi', city: 'Salvador', country: 'Brasile', lat: -12.97, lon: -38.51, locs: 'il Pelourinho con le prove aperte degli Olodum (i martedì storici: qui Michael Jackson girò They Don\'t Care About Us con Spike Lee — vero), la Casa do Carnaval, il Rio Vermelho dei concerti e dell\'acarajé serale', note: '' },
    { t: 'Port of Spain e la steelpan', who: 'la steelband di Trinidad', y: '1940-oggi', city: 'Port of Spain', country: 'Trinidad e Tobago', lat: 10.66, lon: -61.52, locs: 'i panyard delle steelband (le prove serali aperte nei mesi pre-carnevale: l\'unico strumento acustico inventato nel Novecento, nato dai bidoni di petrolio — raccontalo), il Queen\'s Park Savannah del Panorama, il museo? no: Laventille, la collina dove tutto cominciò (con guida locale)', note: '' },
    { t: 'Austin, live music capital', who: 'Willie Nelson, Stevie Ray Vaughan', y: '1970-oggi', city: 'Austin', country: 'Stati Uniti', lat: 30.27, lon: -97.74, locs: 'la Sixth Street e Red River dei club (musica dal vivo ogni sera dell\'anno), la statua di Willie Nelson davanti al teatro dell\'Austin City Limits, la statua di Stevie Ray Vaughan sul lago, il Continental Club (dal 1955)', note: '' },
    // ── Africa, Asia, Oceania ──
    { t: 'Lagos di Fela Kuti', who: 'Fela Kuti, Femi e Seun Kuti', y: '1970-1997', city: 'Lagos', country: 'Nigeria', lat: 6.58, lon: 3.35, locs: 'il New Afrika Shrine a Ikeja (il tempio laico dell\'afrobeat, oggi guidato dai figli Femi e Seun: i concerti del weekend), il Kalakuta Republic Museum (la casa-comune di Fela con la tomba nel cortile), il quartiere di Ikeja con guida locale', note: 'metropoli intensa: spostamenti organizzati e guida del posto, dillo chiaramente' },
    { t: 'Mindelo di Cesária Évora', who: 'Cesária Évora', y: '1941-2011', city: 'Mindelo', country: 'Capo Verde', lat: 16.89, lon: -25.0, locs: 'la casa-museo di Cesária Évora (la "diva a piedi nudi" che cantò la morna, oggi patrimonio UNESCO), i bar con morna dal vivo attorno alla rua de Lisboa, il lungomare della baia di Porto Grande, il mercato del pesce', note: '' },
    { t: 'Essaouira gnaoua', who: 'i maalem gnaoua', y: '1998-oggi', city: 'Essaouira', country: 'Marocco', lat: 31.51, lon: -9.77, locs: 'la medina UNESCO dei maalem (le botteghe dei guembri e le confraternite gnaoua), il festival Gnaoua di giugno (la world music sul porto), i bastioni della Skala, il porto dei gabbiani', note: '' },
    { t: 'Tokyo in vinile', who: 'i jazz kissa e il city pop', y: '1950-oggi', city: 'Tokyo', country: 'Giappone', lat: 35.69, lon: 139.7, locs: 'i jazz kissa di Shinjuku e Yotsuya (i caffè dove si ascolta jazz in silenzio su impianti leggendari: spiega il rito), i negozi di dischi di Shimokitazawa e Ochanomizu (le pile di city pop tornato di moda), il Blue Note di Aoyama, la yamanote? no: Shibuya come sfondo sonoro', note: '' },
    { t: 'Seul del K-pop', who: 'BTS, la Hallyu', y: '2005-oggi', city: 'Seul', country: 'Corea del Sud', lat: 37.52, lon: 127.02, locs: 'la K-Star Road di Apgujeong (gli orsetti delle agenzie e le sedi tra Gangnam e Cheongdam), gli store ufficiali del K-pop al COEX e a Myeongdong, il busking di Hongdae (le future star si esibiscono in strada ogni sera), gli studi delle photocard e i café a tema (il fandom spiegato con simpatia)', note: '' },
    { t: 'Melbourne rock city', who: 'AC/DC, Nick Cave', y: '1975-oggi', city: 'Melbourne', country: 'Australia', lat: -37.82, lon: 144.96, locs: 'la ACDC Lane (la laneway ufficialmente intitolata alla band, murales e rock bar), il Corner Hotel di Richmond e il Tote di Collingwood (i pub del live australiano), lo stato? no: il vinile di Fitzroy e i busker del centro', note: '' },
  ],
};

// ── 🎨 ARTE — dove l'opera fu creata o è ambientata ───────────────────
const ART_SEED: MediaSeedDef = {
  theme: 'arte',
  slugPrefix: 'art',
  emoji: '🎨',
  label: 'Arte',
  rules: [
    'REGOLA ARTE (vincolante): nel campo "attivita" di OGNI tappa racconta l\'opera o il momento creativo specifico legato al luogo — cosa fu dipinto/creato qui, cosa raffigura, perché conta — citando artisti e opere SOLO tra quelli indicati o di cui sei assolutamente certo; poi il confronto quadro/realtà: cosa si riconosce oggi e da dove mettersi per ritrovare l\'inquadratura del quadro. Se l\'opera originale è conservata altrove, dillo sempre (museo e città).',
    'MUSEI E CASE D\'ARTISTA: indica prenotazioni obbligatorie e giorni di chiusura in modo onesto; distingui l\'atelier autentico dalla ricostruzione. MAI attribuire un\'opera a un luogo se non è nel materiale.',
  ],
  works: [
    { t: 'Arles di Van Gogh', who: 'Vincent van Gogh', y: '1888-1889', city: 'Arles', country: 'Francia', lat: 43.68, lon: 4.63, locs: 'la place du Forum del Caffè di notte (il café dipinto ha chiuso: si ritrova l\'inquadratura dalla piazza — dillo), l\'Espace Van Gogh (l\'ex ospedale col giardino del quadro, ricostruito sui colori), il ponte di Langlois-Van Gogh (ricostruito fuori città), la Fondation Vincent van Gogh, i punti dei Girasoli e della Notte stellata sul Rodano (pannelli col confronto)', note: 'ad Arles Vincent dipinse ~300 opere in 15 mesi e qui avvenne l\'episodio dell\'orecchio: tono partecipe, mai macabro' },
    { t: 'Saint-Rémy: Van Gogh e la Notte stellata', who: 'Vincent van Gogh', y: '1889-1890', city: 'Saint-Rémy-de-Provence', country: 'Francia', lat: 43.79, lon: 4.83, locs: 'il monastero di Saint-Paul-de-Mausole (la clinica dove si fece ricoverare: la camera ricostruita, il giardino degli iris, il campo di grano visto dalla finestra), il percorso Van Gogh coi pannelli nei punti esatti, le Antiche di Glanum accanto', note: 'la Notte stellata nacque da questa finestra (il quadro è al MoMA di New York: dillo)' },
    { t: 'Auvers-sur-Oise: gli ultimi 70 giorni di Van Gogh', who: 'Vincent van Gogh', y: 1890, city: 'Auvers-sur-Oise', country: 'Francia', lat: 49.07, lon: 2.17, locs: 'l\'Auberge Ravoux (la stanza n.5 dove visse e morì, lasciata vuota: la visita più toccante), la chiesa di Auvers del quadro (l\'inquadratura si ritrova esatta), il campo di grano coi corvi, le tombe affiancate di Vincent e Theo coperte d\'edera', note: 'un quadro al giorno per 70 giorni: raccontalo con sobrietà' },
    { t: 'Giverny di Monet', who: 'Claude Monet', y: '1883-1926', city: 'Giverny', country: 'Francia', lat: 49.08, lon: 1.53, locs: 'la casa rosa e i giardini di Monet (il Clos Normand e lo stagno delle ninfee col ponte giapponese: le Ninfee dell\'Orangerie nascono qui — prenota e vai all\'apertura), il museo degli Impressionismi, la tomba nella chiesa di Sainte-Radegonde; estensione: la cattedrale di Rouen della serie delle facciate', note: '' },
    { t: 'Parigi degli impressionisti', who: 'Monet, Renoir, Degas', y: '1860-1890', city: 'Parigi', country: 'Francia', lat: 48.88, lon: 2.34, locs: 'Montmartre col Bateau-Lavoir e il moulin de la Galette (il ballo di Renoir: il quadro è all\'Orsay), il Musée d\'Orsay (la navata delle opere), la Gare Saint-Lazare dipinta da Monet (i binari ci sono ancora), l\'Orangerie con l\'ovale delle Ninfee', note: '' },
    { t: 'Aix-en-Provence di Cézanne', who: 'Paul Cézanne', y: '1870-1906', city: 'Aix-en-Provence', country: 'Francia', lat: 43.53, lon: 5.45, locs: 'l\'atelier des Lauves (lasciato come alla sua morte: cappotto, nature morte, la vetrata nord), il Terrain des Peintres (i punti esatti da cui dipinse la montagne Sainte-Victoire, coi pannelli), il Jas de Bouffan di famiglia, i caffè del cours Mirabeau', note: '' },
    { t: 'Albi di Toulouse-Lautrec', who: 'Henri de Toulouse-Lautrec', y: '1864-1901', city: 'Albi', country: 'Francia', lat: 43.93, lon: 2.14, locs: 'il museo Toulouse-Lautrec nel Palais de la Berbie (la più grande collezione al mondo, coi manifesti del Moulin Rouge), la cattedrale-fortezza di Sainte-Cécile, la città episcopale UNESCO dove nacque', note: 'il mondo che dipinse era Montmartre: il museo lo riporta a casa — raccontа il contrasto' },
    { t: 'Pont-Aven di Gauguin', who: 'Paul Gauguin, la scuola di Pont-Aven', y: '1886-1894', city: 'Pont-Aven', country: 'Francia', lat: 47.86, lon: -3.75, locs: 'il Bois d\'Amour lungo l\'Aven (dove Gauguin diceva di "dipingere come i bambini"), il museo di Pont-Aven, la targa della pensione Gloanec (la tavolata degli artisti squattrinati), la cappella di Trémalo (il Cristo giallo in legno che ispirò il quadro omonimo — c\'è davvero)', note: '' },
    { t: 'Atuona: Gauguin e Brel alle Marchesi', who: 'Paul Gauguin, Jacques Brel', y: '1901-1903', city: 'Atuona', country: 'Polinesia Francese', lat: -9.8, lon: -139.03, locs: 'il cimitero del Calvario (le tombe di Gauguin e di Jacques Brel, a pochi metri), il centro culturale Paul Gauguin (la ricostruzione della Maison du Jouir), la baia di Atuona sotto il monte Temetiu', note: 'itinerario remoto (Hiva Oa, Marchesi): logistica onesta; su Gauguin in Polinesia serve anche uno sguardo critico contemporaneo — dillo con equilibrio' },
    { t: 'Collioure dei Fauves', who: 'Henri Matisse, André Derain', y: 1905, city: 'Collioure', country: 'Francia', lat: 42.53, lon: 3.08, locs: 'il Chemin du Fauvisme (le riproduzioni installate nei punti esatti dove Matisse e Derain piantarono il cavalletto: l\'estate del 1905 che "inventò" il colore puro), il campanile-faro di Notre-Dame-des-Anges (il soggetto più dipinto), il castello reale e le barche catalane', note: '' },
    { t: 'Nizza e Vence: Matisse e Chagall', who: 'Henri Matisse, Marc Chagall', y: '1917-1954', city: 'Nizza', country: 'Francia', lat: 43.72, lon: 7.27, locs: 'il museo Matisse a Cimiez (accanto all\'hotel Régina dove visse) e la sua tomba nel cimitero del monastero, il museo nazionale Marc Chagall (il ciclo del Messaggio Biblico), la Chapelle du Rosaire a Vence (la cappella che Matisse considerava il suo capolavoro: la disegnò tutta, dai vetri alle pianete)', note: '' },
    { t: 'Delft di Vermeer', who: 'Johannes Vermeer', y: '1650-1675', city: 'Delft', country: 'Paesi Bassi', lat: 52.01, lon: 4.36, locs: 'il punto della Veduta di Delft sul canale (segnalato: il quadro è al Mauritshuis dell\'Aia, a 20 minuti — dillo e suggerisci l\'accoppiata), il Vermeer Centrum (la bottega e la camera oscura spiegate), l\'Oude Kerk con la tomba, il Markt della vita quotidiana dei quadri', note: '' },
    { t: 'Amsterdam di Rembrandt e Van Gogh', who: 'Rembrandt, Vincent van Gogh', y: 'XVII e XIX secolo', city: 'Amsterdam', country: 'Paesi Bassi', lat: 52.37, lon: 4.9, locs: 'la Rembrandthuis (la casa-atelier vera, con le dimostrazioni di incisione), il Rijksmuseum (la Ronda di notte nella Galleria d\'Onore), il Van Gogh Museum (prenotazione obbligatoria di fatto), la Westerkerk (Rembrandt vi fu sepolto da povero, punto esatto ignoto: dillo)', note: '' },
    { t: 'Guernica: il quadro e il paese', who: 'Pablo Picasso', y: 1937, city: 'Guernica', country: 'Spagna', lat: 43.32, lon: -2.68, locs: 'il Museo della Pace di Gernika (il bombardamento del 26 aprile 1937 raccontato dalle vittime), l\'Albero di Gernika al parlamento basco (il simbolo delle libertà forali risparmiato dalle bombe), la riproduzione in ceramica del quadro in strada (l\'originale è al Reina Sofía di Madrid: dillo)', note: 'tono grave: qui l\'arte incontra una strage — niente estetizzazione' },
    { t: 'Málaga di Picasso', who: 'Pablo Picasso', y: 1881, city: 'Málaga', country: 'Spagna', lat: 36.72, lon: -4.42, locs: 'la casa natale in plaza de la Merced (i primi disegni e la storia del padre pittore), il Museo Picasso nel palazzo Buenavista, la chiesa di Santiago (il battesimo), la piazza dei piccioni che disegnava da bambino', note: '' },
    { t: 'Barcellona: il giovane Picasso e Miró', who: 'Pablo Picasso, Joan Miró', y: '1895-1983', city: 'Barcellona', country: 'Spagna', lat: 41.38, lon: 2.18, locs: 'Els Quatre Gats (il caffè dove il diciassettenne Picasso fece la prima mostra e disegnò il menù — si pranza), il museo Picasso al Born (le Meninas reinterpretate), la Fundació Miró a Montjuïc, il mosaico di Miró sulla Rambla (ci cammini sopra senza saperlo: fermati)', note: '' },
    { t: 'Figueres e Cadaqués di Dalí', who: 'Salvador Dalí, Gala', y: '1904-1989', city: 'Figueres', country: 'Spagna', lat: 42.27, lon: 2.96, locs: 'il Teatre-Museu Dalí (le uova sul tetto, la Cadillac piovosa, la tomba di Dalí sotto la cupola: il museo è la sua ultima opera), la casa di Portlligat a Cadaqués (il labirinto di stanze sul mare: prenotare con largo anticipo), il castello di Púbol donato a Gala', note: '' },
    { t: 'Toledo di El Greco', who: 'El Greco', y: '1577-1614', city: 'Toledo', country: 'Spagna', lat: 39.86, lon: -4.03, locs: 'la chiesa di Santo Tomé (l\'Entierro del Señor de Orgaz, nel posto per cui fu dipinto), il Museo del Greco nel quartiere ebraico, il mirador del Valle (il punto della Vista di Toledo — il cielo tempestoso si riconosce ancora), la cattedrale con l\'Espolio', note: '' },
    { t: 'Vienna di Klimt e Schiele', who: 'Gustav Klimt, Egon Schiele', y: '1897-1918', city: 'Vienna', country: 'Austria', lat: 48.19, lon: 16.38, locs: 'il Belvedere Superiore (Il Bacio nella sua sala), il palazzo della Secessione (il Fregio di Beethoven nel seminterrato, l\'edicola "d\'oro" di Olbrich), il Leopold Museum al MuseumsQuartier (la più grande raccolta di Schiele), il Kunsthistorisches per il contesto', note: '' },
    { t: 'Oslo di Munch', who: 'Edvard Munch', y: '1893-1944', city: 'Oslo', country: 'Norvegia', lat: 59.91, lon: 10.76, locs: 'il MUNCH sul fiordo (l\'Urlo nelle sue versioni, esposte a rotazione per la fragilità: dillo), il punto dell\'Urlo sulla collina di Ekeberg (la vista sul fiordo con la targa: il cielo rosso era vero, probabilmente il tramonto dopo il Krakatoa — ipotesi affascinante da raccontare come tale), la Nasjonalmuseet', note: '' },
    { t: 'Skagen: i pittori della luce', who: 'P.S. Krøyer, Anna e Michael Ancher', y: '1875-1910', city: 'Skagen', country: 'Danimarca', lat: 57.72, lon: 10.58, locs: 'gli Skagens Museum (la colonia dei pittori della "luce blu"), la spiaggia di Sønderstrand (la passeggiata di Estate sulla spiaggia sud di Krøyer: l\'ora blu si vive dal vivo), la casa degli Ancher, Grenen dove i due mari si incontrano', note: '' },
    { t: 'Bruges dei primitivi fiamminghi', who: 'Jan van Eyck, Hans Memling, Michelangelo', y: 'XV secolo', city: 'Bruges', country: 'Belgio', lat: 51.21, lon: 3.22, locs: 'il Groeningemuseum (la Madonna del canonico van der Paele di van Eyck), il Sint-Janshospitaal (i reliquiari di Memling nell\'ospedale medievale vero), la Madonna di Bruges di Michelangelo in Onze-Lieve-Vrouwekerk (l\'unica sua opera uscita dall\'Italia lui vivente — raccontala)', note: '' },
    { t: 'Anversa di Rubens', who: 'Pieter Paul Rubens', y: '1608-1640', city: 'Anversa', country: 'Belgio', lat: 51.22, lon: 4.4, locs: 'la Rubenshuis (la casa-atelier col portico barocco disegnato da lui: verifica lo stato dei lavori di restauro, il giardino resta visitabile — dillo), la cattedrale di Nostra Signora (le due Deposizioni monumentali), la chiesa di San Giacomo (la tomba con la sua Madonna)', note: '' },
    { t: 'Firenze di Michelangelo', who: 'Michelangelo Buonarroti', y: '1475-1564', city: 'Firenze', country: 'Italia', lat: 43.77, lon: 11.26, locs: 'la Galleria dell\'Accademia (il David e i Prigioni che "escono" dal marmo), le Cappelle Medicee (l\'Aurora e il Crepuscolo nella Sagrestia Nuova), Casa Buonarroti (i primi rilievi adolescenti), il Museo dell\'Opera del Duomo (la Pietà Bandini che tentò di distruggere — raccontalo), Santa Croce (la tomba)', note: '' },
    { t: 'Roma di Caravaggio', who: 'Caravaggio', y: '1592-1606', city: 'Roma', country: 'Italia', lat: 41.9, lon: 12.47, locs: 'San Luigi dei Francesi (il ciclo di San Matteo: porta monete per la luce), Santa Maria del Popolo (la Crocifissione di Pietro e la Conversione di Paolo), Sant\'Agostino (la Madonna dei Pellegrini coi piedi sporchi che scandalizzò), la Galleria Borghese (prenota), i vicoli di Campo Marzio delle sue risse (la fuga da Roma dopo l\'omicidio: raccontala)', note: '' },
    { t: 'Napoli di Caravaggio', who: 'Caravaggio', y: '1606-1610', city: 'Napoli', country: 'Italia', lat: 40.85, lon: 14.26, locs: 'il Pio Monte della Misericordia (le Sette opere di Misericordia nel luogo esatto per cui furono dipinte: rarità assoluta), Capodimonte (la Flagellazione), i Quartieri Spagnoli della latitanza, la memoria della Locanda del Cerriglio (l\'agguato che lo sfigurò — storia vera)', note: '' },
    { t: 'La Valletta di Caravaggio', who: 'Caravaggio', y: '1607-1608', city: 'La Valletta', country: 'Malta', lat: 35.9, lon: 14.51, locs: 'la Concattedrale di San Giovanni (la Decollazione del Battista: l\'unica opera firmata — la firma nel sangue del Battista, raccontala davanti alla tela), l\'Oratorio, Forte Sant\'Angelo (la prigione da cui fuggì calandosi dalle mura — da cavaliere a espulso in un anno)', note: '' },
    { t: 'Milano di Leonardo', who: 'Leonardo da Vinci', y: '1482-1499', city: 'Milano', country: 'Italia', lat: 45.47, lon: 9.17, locs: 'il Cenacolo a Santa Maria delle Grazie (prenotazione con mesi di anticipo: dillo subito), la Vigna di Leonardo alla Casa degli Atellani (il regalo di Ludovico il Moro), la Sala delle Asse al Castello Sforzesco, la Pinacoteca Ambrosiana (il Codice Atlantico e il Musico), i navigli con le chiuse che studiò', note: '' },
    { t: 'Vinci: le radici di Leonardo', who: 'Leonardo da Vinci', y: 1452, city: 'Vinci', country: 'Italia', lat: 43.79, lon: 10.92, locs: 'la casa natale ad Anchiano (l\'olivetta e la vista sul Montalbano che ritorna negli sfondi dei quadri), il Museo Leonardiano nel castello dei Conti Guidi (le macchine ricostruite dai codici), la chiesa di Santa Croce col fonte battesimale', note: '' },
    { t: 'Urbino di Raffaello', who: 'Raffaello Sanzio', y: 1483, city: 'Urbino', country: 'Italia', lat: 43.73, lon: 12.64, locs: 'la casa natale di Raffaello (con l\'affresco giovanile della Madonna attribuito al ragazzo), Palazzo Ducale e la Galleria Nazionale delle Marche (la Muta e la Città ideale), la vista dei torricini che si porterà negli sfondi', note: '' },
    { t: 'Padova di Giotto', who: 'Giotto', y: 1305, city: 'Padova', country: 'Italia', lat: 45.41, lon: 11.88, locs: 'la Cappella degli Scrovegni (ingresso contingentato con camera di stabilizzazione: prenota; il blu del cielo stellato e il Bacio di Giuda), gli Eremitani accanto, il Palazzo della Ragione col salone affrescato, il ciclo trecentesco UNESCO diffuso in città', note: '' },
    { t: 'Assisi di Giotto e Cimabue', who: 'Giotto, Cimabue', y: '1290-1300', city: 'Assisi', country: 'Italia', lat: 43.07, lon: 12.61, locs: 'la Basilica Superiore (le Storie di san Francesco: la predica agli uccelli e il dono del mantello), la Basilica Inferiore (Cimabue e la Maestà), San Damiano e l\'Eremo delle Carceri per il contesto francescano vero', note: 'il terremoto del 1997 ferì le volte: il restauro è una storia da raccontare' },
    { t: 'Arezzo e Sansepolcro di Piero della Francesca', who: 'Piero della Francesca', y: '1452-1466', city: 'Arezzo', country: 'Italia', lat: 43.46, lon: 11.88, locs: 'la Leggenda della Vera Croce in San Francesco ad Arezzo (prenotazione contingentata), la Madonna del Parto a Monterchi, la Resurrezione a Sansepolcro ("il più bel dipinto del mondo" per Aldous Huxley: la frase salvò la città dai cannoni nel 1944 — il capitano Clarke si fermò ricordandola, storia vera)', note: '' },
    { t: 'Venezia dei pittori', who: 'Tiziano, Tintoretto, Bellini', y: 'XVI secolo', city: 'Venezia', country: 'Italia', lat: 45.44, lon: 12.33, locs: 'la Scuola Grande di San Rocco (il ciclo torrenziale di Tintoretto: lo "Sistina di Venezia", con gli specchi per il soffitto), i Frari (l\'Assunta di Tiziano sull\'altare maggiore e la sua tomba), le Gallerie dell\'Accademia, la casa di Tintoretto a Cannaregio (esterno con targa)', note: '' },
    { t: 'Mantova di Mantegna', who: 'Andrea Mantegna', y: '1465-1474', city: 'Mantova', country: 'Italia', lat: 45.16, lon: 10.8, locs: 'la Camera degli Sposi a Palazzo Ducale (l\'oculo col cielo finto e i putti in scorcio: ingressi contingentati), la casa del Mantegna (l\'atrio circolare che si disegnò da solo), la basilica di Sant\'Andrea (la cappella funeraria con la sua tomba in bronzo)', note: '' },
    { t: 'Città del Messico di Frida e Diego', who: 'Frida Kahlo, Diego Rivera', y: '1907-1957', city: 'Città del Messico', country: 'Messico', lat: 19.35, lon: -99.16, locs: 'la Casa Azul di Coyoacán (la casa natale e finale di Frida: letto, corsetti, cucina in maiolica — prenota con giorni di anticipo, le code sono vere), il museo Anahuacalli di Diego (la piramide di pietra lavica per gli idoli), i murales di Rivera al Palacio Nacional e alla SEP, il mercato di Coyoacán', note: '' },
    { t: 'Abiquiú di Georgia O\'Keeffe', who: 'Georgia O\'Keeffe', y: '1934-1986', city: 'Abiquiú', country: 'Stati Uniti', lat: 36.21, lon: -106.32, locs: 'la casa-studio di Abiquiú (le pareti di adobe e la porta nel patio dipinta decine di volte: tour prenotato), il Ghost Ranch (i paesaggi rossi dei quadri, con le escursioni "nel quadro"), il museo O\'Keeffe a Santa Fe', note: '' },
    { t: 'New York di Warhol e Basquiat', who: 'Andy Warhol, Jean-Michel Basquiat', y: '1962-1988', city: 'New York', country: 'Stati Uniti', lat: 40.73, lon: -73.99, locs: 'gli indirizzi delle Factory (Union Square W 33 e la prima "Silver Factory" sulla 47ª: edifici cambiati — ieri/oggi onesto), il 57 di Great Jones Street (lo studio dove Basquiat morì, coi graffiti d\'omaggio sulla facciata), il MoMA e il Whitney per le opere, l\'East Village della scena', note: '' },
    { t: 'Pittsburgh di Warhol', who: 'Andy Warhol', y: 1928, city: 'Pittsburgh', country: 'Stati Uniti', lat: 40.45, lon: -79.99, locs: 'The Andy Warhol Museum (sette piani: il più grande museo americano dedicato a un solo artista, con le Time Capsules), la tomba al cimitero di St. John the Baptist a Bethel Park (i fan lasciano lattine di zuppa Campbell — rito vero), i luoghi dell\'infanzia operaia a Oakland', note: '' },
    { t: 'La Boca di Quinquela Martín', who: 'Benito Quinquela Martín', y: '1920-1977', city: 'Buenos Aires', country: 'Argentina', lat: -34.64, lon: -58.36, locs: 'il museo Benito Quinquela Martín (la casa che il pittore dei porti costruì e donò al barrio, con la sua camera intatta), il Caminito (fu IDEA sua trasformare il vicolo in museo a cielo aperto: raccontalo), i conventillos colorati e il porto che dipinse per tutta la vita', note: '' },
    { t: 'Obuse di Hokusai', who: 'Katsushika Hokusai', y: '1842-1848', city: 'Obuse', country: 'Giappone', lat: 36.7, lon: 138.31, locs: 'lo Hokusai-kan (il museo del "vecchio pazzo per la pittura" che qui lavorò ottantenne ospite di Takai Kōzan), il tempio Ganshō-in (la fenice che guarda in tutte le direzioni sul soffitto: il capolavoro finale), i carri del festival da lui decorati, le botteghe delle castagne', note: 'la Grande Onda è una composizione, non una veduta: chi cerca "il punto esatto" va deluso — dillo con il sorriso' },
    { t: 'Tangeri di Matisse e Delacroix', who: 'Henri Matisse, Eugène Delacroix', y: '1832 e 1912', city: 'Tangeri', country: 'Marocco', lat: 35.78, lon: -5.81, locs: 'il Grand Hôtel Villa de France (la camera 35 di Matisse, conservata: la Finestra a Tangeri fu dipinta da qui), la kasbah e la porta della medina dei suoi acquerelli, il caffè Hafa sulle scogliere (il tè alla menta con vista Gibilterra), la memoria del viaggio di Delacroix che sdoganò l\'Oriente in pittura', note: '' },
  ],
};

// ── ⚔️ STORIA — battaglie, trattati, rivoluzioni nel luogo esatto ─────
const HISTORY_SEED: MediaSeedDef = {
  theme: 'storia',
  slugPrefix: 'history',
  emoji: '⚔️',
  label: 'Storia',
  rules: [
    'REGOLA STORIA (vincolante): nel campo "attivita" di OGNI tappa ricostruisci concretamente cosa accadde ESATTAMENTE in quel punto — schieramenti, decisioni, l\'ora del giorno se nota, i protagonisti — poi il confronto ieri/oggi: cosa si vede ora (monumento, museo, terreno rimasto integro) e cosa invece è cambiato o non è più visibile. TONO RIGOROSO E MAI CELEBRATIVO: niente retorica patriottica, niente estetizzazione della violenza; sulle stragi e sulle sconfitte tono grave e sobrio, sui vincitori nessuna trionfalità. Numeri di vittime SOLO se sono stime storiche condivise, mai inventati o arrotondati a effetto.',
    'FONTI: cita solo fatti, date, nomi e luoghi presenti in questo brief o di cui sei assolutamente certo; se una tradizione locale non è storicamente accertata, presentala come tale ("secondo la tradizione..."). Includi il museo o memoriale del sito se esiste, con orari e la parte più significativa da non perdere.',
  ],
  works: [
    // ── Antichità e Medioevo ──
    { t: 'Battaglia delle Termopili', who: 'Leonida e i 300 spartani, Serse I', y: '480 a.C.', city: 'Termopili', country: 'Grecia', lat: 38.8, lon: 22.54, locs: 'il monumento a Leonida sul passo (la statua e l\'iscrizione "straniero, va\' a dire agli Spartani..."), il colle di Kolonos dove caddero gli ultimi difensori, il piccolo museo del sito, la linea di costa antica (oggi arretrata di km rispetto al mare del 480 a.C.: dillo)', note: 'lo scontro reale durò 3 giorni, non fu il "tutti contro tutti" del mito hollywoodiano: raccontalo con rigore' },
    { t: 'Battaglia di Maratona', who: 'Milziade, l\'esercito ateniese', y: '490 a.C.', city: 'Maratona', country: 'Grecia', lat: 38.12, lon: 23.98, locs: 'il Tumulo dei Maratomachi (la tomba collettiva dei 192 ateniesi caduti, ancora nel punto esatto), il piccolo museo archeologico del sito, la piana dove si scontrarono gli opliti contro l\'esercito persiano', note: 'la leggenda della corsa di Fidippide fino ad Atene è tarda e probabilmente non storica: dillo come leggenda, non come fatto' },
    { t: 'Caduta di Costantinopoli', who: 'Costantino XI Paleologo, Mehmed II', y: 1453, city: 'Istanbul', country: 'Turchia', lat: 41.03, lon: 28.93, locs: 'le mura teodosiane (i tratti ancora in piedi dove si concentrò l\'assedio finale del 29 maggio), la Porta di Adrianopoli (dove secondo la tradizione cadde l\'ultimo imperatore, corpo mai identificato con certezza), Santa Sofia (da cattedrale a moschea nel giro di ore quel giorno stesso)', note: 'evento cardine tra Medioevo ed età moderna: tono equidistante tra le due narrazioni storiche, greca e turca' },
    { t: 'Battaglia di Hastings', who: 'Guglielmo il Conquistatore, Aroldo II', y: 1066, city: 'Battle', country: 'Regno Unito', lat: 50.91, lon: 0.49, locs: 'il campo di battaglia di Battle Abbey (English Heritage: percorso segnato con audioguida sul terreno vero), il punto dove Aroldo cadde colpito all\'occhio (secondo la tradizione dell\'arazzo di Bayeux, segnato dall\'altare dell\'abbazia costruita lì apposta), il paese di Battle nato dalla battaglia stessa', note: '' },
    { t: 'Assedio di Vienna', who: 'Jan III Sobieski, Kara Mustafa Pascià', y: 1683, city: 'Vienna', country: 'Austria', lat: 48.26, lon: 16.29, locs: 'il colle del Kahlenberg (da dove le truppe di soccorso polacche piombarono sull\'esercito ottomano, con la chiesa commemorativa), le mura del centro storico dove resistette l\'assedio, il museo della Storia militare con i cimeli della battaglia', note: 'la vittoria fermò l\'ultima grande avanzata ottomana in Europa centrale: raccontala senza toni da scontro di civiltà' },
    { t: 'Battaglia di Poitiers-Tours', who: 'Carlo Martello, Abd al-Rahman al-Ghafiqi', y: 732, city: 'Moussais', country: 'Francia', lat: 46.73, lon: 0.5, locs: 'la zona tra Moussais e Vouneuil-sur-Vienne dove gli storici collocano lo scontro (nessun monumento imponente: il sito esatto resta dibattuto, dillo con onestà), il museo di Poitiers per il contesto', note: 'la portata "salva-Europa" della battaglia fu amplificata dalla storiografia successiva: presentala con le dovute cautele storiografiche' },
    { t: 'Magna Carta', who: 'Giovanni Senzaterra, i baroni ribelli', y: 1215, city: 'Runnymede', country: 'Regno Unito', lat: 51.44, lon: -0.56, locs: 'il prato di Runnymede sul Tamigi (il memoriale della Magna Carta dell\'American Bar Association, il memoriale a John F. Kennedy accanto), il castello di Windsor a vista sull\'altra sponda', note: '' },
    { t: 'Caduta di Granada', who: 'Boabdil, i Re Cattolici', y: 1492, city: 'Granada', country: 'Spagna', lat: 37.18, lon: -3.59, locs: 'l\'Alhambra (la Torre della Vela da cui fu issata la croce il 2 gennaio 1492), il "Suspiro del Moro" sulla strada per le Alpujarras (il punto dove secondo la tradizione Boabdil pianse voltandosi indietro), la Capilla Real con le tombe dei Re Cattolici', note: 'fine della Reconquista e inizio dell\'espulsione di ebrei e musulmani dalla Spagna nello stesso anno: il contesto va detto, non solo la vittoria' },
    { t: 'Battaglia di Navarino', who: 'flotte alleate anglo-franco-russe, flotta ottomano-egiziana', y: 1827, city: 'Pylos', country: 'Grecia', lat: 36.91, lon: 21.7, locs: 'la baia di Navarino/Pylos (l\'ultima grande battaglia navale a vele, decisiva per l\'indipendenza greca), il museo di Pylos, il forte di Niokastro sulla baia', note: '' },
    // ── Età moderna europea ──
    { t: 'Presa della Bastiglia', who: 'i rivoltosi parigini, Luigi XVI', y: 1789, city: 'Parigi', country: 'Francia', lat: 48.85, lon: 2.37, locs: 'place de la Bastille (la fortezza fu demolita entro l\'anno: oggi solo la linea di pietre nel selciato ne segna il perimetro — dillo chiaramente), la Colonna di Luglio (monumento a rivoluzioni successive, 1830, non al 1789: nota da chiarire), il Musée Carnavalet per gli oggetti veri del 14 luglio', note: 'la Bastiglia il giorno dell\'assalto custodiva solo 7 prigionieri: il valore fu simbolico, non carcerario — raccontalo con precisione' },
    { t: 'Battaglia di Austerlitz', who: 'Napoleone Bonaparte, imperatori d\'Austria e Russia', y: 1805, city: 'Slavkov u Brna', country: 'Cechia', lat: 49.16, lon: 16.86, locs: 'la collina di Pratzen (il punto chiave della manovra napoleonica), il museo del Cairn de la Paix, il castello di Slavkov dove fu firmato l\'armistizio', note: 'la "battaglia dei tre imperatori": tono analitico sulla strategia, non celebrativo di Napoleone' },
    { t: 'Battaglia di Waterloo', who: 'Napoleone Bonaparte, Duca di Wellington, Blücher', y: 1815, city: 'Waterloo', country: 'Belgio', lat: 50.68, lon: 4.41, locs: 'il Leone di Waterloo sul tumulo artificiale (il punto panoramico sul campo, costruito nell\'Ottocento con la terra del campo stesso), il Memorial 1815 sotterraneo con la ricostruzione della battaglia, la fattoria di Hougoumont (il punto più conteso della giornata, ancora visitabile), la fattoria di La Haye Sainte', note: 'la sconfitta definitiva di Napoleone e la fine del suo potere: racconta la battaglia nella sua complessità tattica, non come semplice epilogo eroico o tragico' },
    { t: 'Battaglia di Trafalgar e Portsmouth', who: 'Horatio Nelson', y: 1805, city: 'Portsmouth', country: 'Regno Unito', lat: 50.8, lon: -1.11, locs: 'la HMS Victory nel Portsmouth Historic Dockyard (la nave ammiraglia di Nelson, conservata: il punto esatto dove cadde ferito a morte è segnato in coperta), il National Museum of the Royal Navy accanto', note: 'la battaglia si svolse al largo di Capo Trafalgar (Spagna), oggi senza sito visitabile: la nave a Portsmouth è il modo onesto di raccontarla' },
    { t: 'Congresso di Vienna', who: 'Metternich, Talleyrand, Castlereagh', y: '1814-1815', city: 'Vienna', country: 'Austria', lat: 48.2, lon: 16.37, locs: 'l\'Hofburg (le sale dove si ridisegnò la mappa d\'Europa dopo Napoleone), il palazzo del Belvedere (residenza di Metternich, artefice del sistema), la Konzerthaus/sale da ballo dove il congresso "danzava ma non concludeva" (celebre battuta dell\'epoca)', note: '' },
    { t: 'Rivoluzioni del 1848 a Parigi', who: 'i moti del \'48, Luigi Filippo', y: 1848, city: 'Parigi', country: 'Francia', lat: 48.86, lon: 2.35, locs: 'place de la Concorde e i boulevard delle barricate, l\'Hôtel de Ville (proclamazione della Seconda Repubblica), il Panthéon come simbolo repubblicano', note: 'il \'48 fu una "primavera dei popoli" europea: menzionare il contesto continentale, non solo Parigi' },
    { t: 'Battaglia di Solferino e San Martino', who: 'Napoleone III, Vittorio Emanuele II, Francesco Giuseppe', y: 1859, city: 'Solferino', country: 'Italia', lat: 45.38, lon: 10.58, locs: 'la Rocca di Solferino (torre di osservazione sul campo di battaglia), l\'Ossario di San Martino con la Torre monumentale, il Museo della Croce Rossa (Henry Dunant assistette al massacro dei feriti e ne nacque l\'idea della Croce Rossa: racconta questa origine, è il cuore della storia)', note: 'da qui nacque il diritto umanitario moderno: è l\'angolo più importante da raccontare, più della vittoria militare in sé' },
    { t: 'Spedizione dei Mille', who: 'Giuseppe Garibaldi', y: 1860, city: 'Marsala', country: 'Italia', lat: 37.8, lon: 12.43, locs: 'lo sbarco dei Mille a Marsala (monumento sul lungomare nel punto tradizionale), Calatafimi-Segesta (la prima battaglia vinta, "qui si fa l\'Italia o si muore"), Palermo (la presa della città)', note: '' },
    { t: 'Breccia di Porta Pia', who: 'l\'esercito italiano, lo Stato Pontificio', y: 1870, city: 'Roma', country: 'Italia', lat: 41.91, lon: 12.5, locs: 'Porta Pia (il tratto di mura dove si aprì la breccia il 20 settembre, ancora visibile e segnalato), il Museo storico dei bersaglieri accanto, via XX Settembre come asse simbolico dell\'unità nazionale', note: '' },
    { t: 'Rivolta ungherese', who: 'Imre Nagy, i rivoltosi ungheresi', y: 1956, city: 'Budapest', country: 'Ungheria', lat: 47.5, lon: 19.04, locs: 'il Memento Park (le statue sovietiche rimosse, raccolte fuori città con onestà museale), il Museo del Terrore in Andrássy út (sede della polizia politica), piazza Kossuth col monumento ai caduti del 1956', note: 'repressa dai carri armati sovietici in pochi giorni: tono grave, senza trionfalismi da guerra fredda' },
    { t: 'Primavera di Praga', who: 'Alexander Dubček', y: 1968, city: 'Praga', country: 'Cechia', lat: 50.08, lon: 14.42, locs: 'piazza San Venceslao (dove Jan Palach si diede fuoco nel gennaio 1969 in protesta: il memoriale a terra), il Museo del Comunismo, la Radio Nazionale in Vinohradská (resistenza armata simbolica ai carri sovietici, i segni sui muri)', note: '' },
    { t: 'Caduta del Muro di Berlino', who: 'i cittadini di Berlino Est e Ovest', y: 1989, city: 'Berlino', country: 'Germania', lat: 52.52, lon: 13.38, locs: 'il Bernauer Straße Memorial (il tratto di muro conservato con la "striscia della morte" ricostruita: il memoriale più serio, non turistico), Checkpoint Charlie (oggi molto commerciale: avvisa), il Mauerpark dove il muro fu abbattuto a picconate', note: 'angolo diverso da "scoperta urbana" (che guarda l\'East Side Gallery come arte): qui il taglio è politico e storico' },
    // ── Rivoluzioni e indipendenze extraeuropee ──
    { t: 'Rivoluzione americana: Lexington e Concord', who: 'i minutemen, l\'esercito britannico', y: 1775, city: 'Concord', country: 'Stati Uniti', lat: 42.46, lon: -71.35, locs: 'l\'Old North Bridge di Concord ("lo sparo udito in tutto il mondo", monumento del Minute Man), Lexington Green (il primo sangue versato della guerra), il Minute Man National Historical Park lungo la via di ritirata britannica', note: '' },
    { t: 'Dichiarazione d\'Indipendenza', who: 'i Padri Fondatori', y: 1776, city: 'Filadelfia', country: 'Stati Uniti', lat: 39.95, lon: -75.15, locs: 'l\'Independence Hall (la stanza dove fu firmata il 4 luglio), la Liberty Bell accanto (la crepa è autentica, la leggenda del suono all\'annuncio è successiva: dillo), il Museo della Costituzione', note: '' },
    { t: 'Battaglia di Yorktown', who: 'George Washington, Lord Cornwallis', y: 1781, city: 'Yorktown', country: 'Stati Uniti', lat: 37.24, lon: -76.51, locs: 'lo Yorktown Battlefield (National Park Service, con le trincee originali), il Moore House (dove furono negoziati i termini della resa britannica), il campo dove Cornwallis si arrese', note: 'la battaglia decisiva che chiuse la guerra d\'indipendenza americana' },
    { t: 'Battaglia di Gettysburg', who: 'Robert E. Lee, George Meade', y: 1863, city: 'Gettysburg', country: 'Stati Uniti', lat: 39.82, lon: -77.23, locs: 'Cemetery Ridge e Little Round Top (i punti chiave dei tre giorni di battaglia, National Military Park), il cimitero nazionale dove Lincoln pronunciò il Gettysburg Address, il centro visitatori con il ciclorama', note: 'la battaglia più sanguinosa della Guerra Civile americana: tono grave, senza romanticizzare la Confederazione' },
    { t: 'Alamo', who: 'i difensori texani, Antonio López de Santa Anna', y: 1836, city: 'San Antonio', country: 'Stati Uniti', lat: 29.43, lon: -98.49, locs: 'la missione dell\'Alamo nel centro di San Antonio (l\'edificio originale, oggi santuario laico texano), il Riverwalk accanto per il contesto della città', note: '"Remember the Alamo" divenne mito fondativo del Texas: raccontalo come mito consapevole, distinguendo fatti e narrazione successiva' },
    { t: 'Attacco a Pearl Harbor', who: 'la marina imperiale giapponese, gli Stati Uniti', y: 1941, city: 'Honolulu', country: 'Stati Uniti', lat: 21.36, lon: -157.95, locs: 'il memoriale della USS Arizona (la nave affondata è ancora sul fondo, con la perdita di carburante visibile: si visita in barca, prenotazione consigliata), la USS Missouri accanto (dove fu firmata la resa giapponese nel 1945: i due eventi della guerra nello stesso molo)', note: 'tono grave e commemorativo su entrambi i lati del conflitto' },
    { t: 'Rivoluzione haitiana', who: 'Toussaint Louverture, Jean-Jacques Dessalines', y: '1791-1804', city: 'Cap-Haïtien', country: 'Haiti', lat: 19.76, lon: -72.2, locs: 'la Citadelle Laferrière (la fortezza costruita da Henri Christophe per difendere la neonata Haiti, patrimonio UNESCO), il Palazzo di Sans-Souci ai piedi della cittadella, la memoria della prima repubblica nera indipendente della storia', note: 'evento capitale poco raccontato nella storiografia occidentale: dagli il peso che merita' },
    { t: 'Rivoluzione messicana', who: 'Pancho Villa, Emiliano Zapata, Francisco Madero', y: 1910, city: 'Città del Messico', country: 'Messico', lat: 19.43, lon: -99.13, locs: 'il Museo Nazionale della Rivoluzione (nella base del Monumento alla Rivoluzione, con le tombe di Villa, Zapata, Madero, Cárdenas), Chihuahua per il museo di Pancho Villa (la sua casa vera), Morelos per la memoria di Zapata', note: '' },
    { t: 'Rivoluzione cubana', who: 'Fidel Castro, Che Guevara', y: 1959, city: 'L\'Avana', country: 'Cuba', lat: 23.13, lon: -82.36, locs: 'il Museo della Rivoluzione nell\'ex Palazzo Presidenziale (coi fori di proiettile del 1957 lasciati a vista), la Sierra Maestra (il quartier generale ribelle sulle montagne, gita fuori città), piazza della Rivoluzione con l\'iconico murale del Che', note: 'racconta senza propaganda né demonizzazione: fatti, non slogan' },
    { t: 'Marcia del Sale', who: 'Mahatma Gandhi', y: 1930, city: 'Dandi', country: 'India', lat: 20.86, lon: 72.85, locs: 'la spiaggia di Dandi (il monumento Dandi Kutir col memoriale della marcia di 24 giorni da Sabarmati), l\'Ashram di Sabarmati ad Ahmedabad (punto di partenza, la casa di Gandhi conservata)', note: 'atto di disobbedienza civile non violenta più celebre del Novecento' },
    { t: 'Massacro di Amritsar', who: 'Reginald Dyer, i manifestanti indiani', y: 1919, city: 'Amritsar', country: 'India', lat: 31.62, lon: 74.88, locs: 'il Jallianwala Bagh (il giardino recintato dove le truppe britanniche spararono sulla folla inerme: i fori di proiettile sono ancora visibili sui muri, il pozzo dove molti si gettarono), il memoriale con la fiamma eterna', note: 'tono grave, mai spettacolarizzato: fu una strage di civili disarmati' },
    { t: 'Rivoluzione cinese: Piazza Tienanmen', who: 'Mao Zedong', y: 1949, city: 'Pechino', country: 'Cina', lat: 39.9, lon: 116.4, locs: 'piazza Tienanmen (dove Mao proclamò la Repubblica Popolare il 1° ottobre 1949, dalla porta della Città Proibita), il Museo Nazionale della Cina sul lato est della piazza', note: 'sui fatti del 1989 nella stessa piazza mantieni un tono fattuale e prudente, coerente con quanto verificabile' },
    { t: 'Bomba atomica su Hiroshima', who: 'le vittime civili di Hiroshima', y: 1945, city: 'Hiroshima', country: 'Giappone', lat: 34.4, lon: 132.45, locs: 'il Parco della Pace con la Cupola della Bomba Atomica (l\'unico edificio lasciato in rovina come monito, patrimonio UNESCO), il Museo Memoriale della Pace, il monumento a Sadako Sasaki e le mille gru di carta', note: 'REGOLA ASSOLUTA: tono grave, mai spettacolarizzato, nessuna giustificazione né condanna sommaria — solo i fatti e la memoria delle vittime civili' },
    // ── Africa e Medio Oriente ──
    { t: 'Battaglia di Adua', who: 'Menelik II, l\'esercito coloniale italiano', y: 1896, city: 'Adua', country: 'Etiopia', lat: 14.17, lon: 38.9, locs: 'il campo di battaglia di Adua (dove l\'esercito etiope sconfisse le truppe coloniali italiane, una delle poche vittorie africane contro un esercito europeo nell\'Ottocento), la città di Axum poco distante per il contesto storico etiope', note: 'racconta la sconfitta italiana con onestà, senza minimizzarla né esotizzare la vittoria etiope' },
    { t: 'Guerra anglo-zulu: Isandlwana e Rorke\'s Drift', who: 'il re Cetshwayo, l\'esercito britannico', y: 1879, city: 'Isandlwana', country: 'Sudafrica', lat: -28.36, lon: 30.65, locs: 'il campo di battaglia di Isandlwana (i cairn bianchi segnano dove caddero i soldati britannici, sonora sconfitta coloniale), Rorke\'s Drift a poca distanza (la difesa successiva, oggi museo), il paesaggio dello Zululand rimasto pressoché intatto', note: '' },
    { t: 'Fine dell\'apartheid: Robben Island', who: 'Nelson Mandela', y: 1990, city: 'Città del Capo', country: 'Sudafrica', lat: -33.81, lon: 18.37, locs: 'Robben Island (la cella di Mandela nel penitenziario, visitabile in traghetto con ex-detenuti come guide: esperienza unica e autentica), il District Six Museum (la memoria degli sgomberi forzati), il municipio dal cui balcone Mandela parlò da uomo libero nel 1990', note: 'racconta la fine di un sistema di oppressione con rigore, dando voce a chi lo ha vissuto' },
    // ── Trattati e diplomazia ──
    { t: 'Pace di Westfalia', who: 'i plenipotenziari d\'Europa', y: 1648, city: 'Münster', country: 'Germania', lat: 51.96, lon: 7.63, locs: 'la Sala della Pace nel municipio di Münster (dove fu firmato il trattato che chiuse la Guerra dei Trent\'anni e fondò il sistema degli stati sovrani moderni), il municipio gemello di Osnabrück a un\'ora di distanza (l\'altra metà del trattato)', note: 'evento fondativo del diritto internazionale moderno: spiegalo con chiarezza, non solo come cerimonia' },
    { t: 'Trattato di Versailles', who: 'i vincitori della Prima guerra mondiale, la delegazione tedesca', y: 1919, city: 'Versailles', country: 'Francia', lat: 48.8, lon: 2.12, locs: 'la Galleria degli Specchi della Reggia di Versailles (dove fu firmato il trattato, lo stesso salone dove nel 1871 era stato proclamato l\'Impero tedesco: la scelta del luogo fu deliberatamente simbolica), i giardini della Reggia', note: 'le sue clausole punitive verso la Germania sono spesso citate tra le cause della Seconda guerra mondiale: menzionalo con equilibrio storiografico' },
    { t: 'Editto di Milano', who: 'Costantino, Licinio', y: 313, city: 'Milano', country: 'Italia', lat: 45.46, lon: 9.19, locs: 'la Basilica di San Lorenzo Maggiore (nell\'area della Milano tardoantica dove si incontrarono gli imperatori), il Museo Archeologico con i resti della Milano romana, la memoria della libertà di culto cristiano concessa nell\'impero', note: '' },
    // ── Rivoluzioni industriali e sociali ──
    { t: 'Rivoluzione industriale a Manchester', who: 'gli operai delle prime fabbriche', y: '1780-1850', city: 'Manchester', country: 'Regno Unito', lat: 53.48, lon: -2.24, locs: 'il Museum of Science and Industry (nella prima stazione ferroviaria passeggeri del mondo), il canale di Castlefield con i magazzini vittoriani, il sito del massacro di Peterloo (1819, la carica della cavalleria su una manifestazione operaia per il voto: targa commemorativa in St Peter\'s Square)', note: 'racconta anche il costo umano della rivoluzione industriale, non solo il progresso tecnico' },
    { t: 'Comune di Parigi', who: 'i comunardi parigini', y: 1871, city: 'Parigi', country: 'Francia', lat: 48.86, lon: 2.4, locs: 'il muro dei Federati al cimitero di Père-Lachaise (dove furono fucilati gli ultimi comunardi il 28 maggio 1871: luogo di memoria della sinistra europea), Montmartre (dove scoppiò l\'insurrezione), l\'Hôtel de Ville ricostruito dopo l\'incendio della Comune', note: 'tono grave sulla repressione (la "settimana di sangue"), senza mitizzare né demonizzare' },
  ],
};

// ── 🔬 SCIENZA — dove nacque la scoperta ────────────────────────────
const SCIENCE_SEED: MediaSeedDef = {
  theme: 'scienza',
  slugPrefix: 'science',
  emoji: '🔬',
  label: 'Scienza',
  rules: [
    'REGOLA SCIENZA (vincolante): nel campo "attivita" di OGNI tappa spiega con parole semplici MA corrette la scoperta o l\'esperimento legato al luogo — cosa fu capito o dimostrato lì, perché fu importante, l\'aneddoto SE documentato (distinguilo dalla leggenda: molti aneddoti scientifici famosi, come la mela di Newton, sono tradizioni non verificate — dillo). Evita la scienza-spettacolo: niente affermazioni sensazionalistiche, i risultati SOLO come li descrive la comunità scientifica.',
    'MUSEI E LABORATORI: molti siti richiedono prenotazione (soprattutto CERN e i laboratori attivi) o sono visitabili solo in parte per motivi di sicurezza/ricerca in corso: dillo. Distingui il laboratorio ancora attivo dal sito-museo storico.',
  ],
  works: [
    // ── Europa ──
    { t: 'Pisa di Galileo', who: 'Galileo Galilei', y: '1564-1642', city: 'Pisa', country: 'Italia', lat: 43.72, lon: 10.4, locs: 'la Torre pendente (la leggenda dell\'esperimento della caduta dei gravi dalla torre non è documentata da fonti dell\'epoca: presentala come tradizione, non fatto), il Duomo di Pisa (la lampada la cui oscillazione regolare ispirò, secondo un aneddoto tardo, gli studi sul pendolo), l\'Università di Pisa dove insegnò matematica', note: '' },
    { t: 'Firenze e Arcetri di Galileo', who: 'Galileo Galilei', y: '1610-1642', city: 'Firenze', country: 'Italia', lat: 43.75, lon: 11.24, locs: 'il Museo Galileo (i suoi telescopi originali, il dito medio della sua mano imbalsamato esposto come reliquia laica), Villa Il Gioiello ad Arcetri (dove visse gli ultimi anni agli arresti domiciliari dopo il processo dell\'Inquisizione), la Basilica di Santa Croce con la sua tomba', note: 'il processo del 1633 è parte imprescindibile della storia: raccontalo con rigore storico, non come semplice aneddoto' },
    { t: 'Cambridge di Newton', who: 'Isaac Newton', y: '1661-1727', city: 'Cambridge', country: 'Regno Unito', lat: 52.2, lon: 0.12, locs: 'il Trinity College (la sua stanza, la Wren Library coi suoi manoscritti originali, il melo discendente da quello della leggenda piantato nel cortile), la Cambridge University della sua carriera accademica', note: 'la mela che gli cadde in testa è un aneddoto raccontato da Newton stesso in vecchiaia, quindi probabile ma non contemporaneo ai fatti: dillo' },
    { t: 'Woolsthorpe Manor di Newton', who: 'Isaac Newton', y: 1666, city: 'Woolsthorpe', country: 'Regno Unito', lat: 52.8, lon: -0.63, locs: 'la casa natale di Woolsthorpe Manor (National Trust: qui, durante la peste che chiuse Cambridge, Newton elaborò gravitazione, ottica e calcolo nell\'"anno dei miracoli" 1666), il melo nel giardino (discendente diretto, con tanto di analisi genetica, dell\'albero originale)', note: '' },
    { t: 'Down House di Darwin', who: 'Charles Darwin', y: '1842-1882', city: 'Downe', country: 'Regno Unito', lat: 51.33, lon: 0.05, locs: 'Down House (English Heritage: lo studio dove scrisse L\'origine delle specie, il "sandwalk" il sentiero dove camminava ogni giorno pensando, la serra degli esperimenti botanici)', note: 'qui Darwin lavorò per vent\'anni prima di pubblicare, temendo le reazioni: raccontalo come scelta ponderata, non codardia' },
    { t: 'Isole Galápagos di Darwin', who: 'Charles Darwin', y: 1835, city: 'Santa Cruz', country: 'Ecuador', lat: -0.74, lon: -90.31, locs: 'la Charles Darwin Research Station (le tartarughe giganti e gli studi in corso), Isola Española e le altre isole visitate dal Beagle (accesso solo con guide autorizzate del parco nazionale), le iguane marine uniche al mondo', note: 'Darwin qui raccolse le osservazioni, ma la teoria dell\'evoluzione maturò negli anni successivi a Londra: non dire che "la inventò qui"' },
    { t: 'Londra della Royal Society e Darwin', who: 'Charles Darwin', y: '1809-1882', city: 'Londra', country: 'Regno Unito', lat: 51.51, lon: -0.13, locs: 'il Natural History Museum (la statua di Darwin nella Hintze Hall), la Linnean Society dove nel 1858 fu letto per la prima volta pubblicamente il principio della selezione naturale, l\'Abbazia di Westminster dove è sepolto vicino a Newton', note: '' },
    { t: 'Ginevra e Meyrin del CERN', who: 'i fisici del CERN', y: '1954-oggi', city: 'Meyrin', country: 'Svizzera', lat: 46.23, lon: 6.05, locs: 'il CERN Science Gateway (il nuovo centro visitatori, gratuito, con exhibit interattivi sul Modello Standard), i tour guidati (gratuiti ma prenotazione con settimane di anticipo: dillo) che, quando possibile, scendono a vedere un rilevatore come CMS o ATLAS, la scultura dello Shiva danzante donata dall\'India', note: 'il Bosone di Higgs fu confermato qui nel 2012: spiegalo in parole semplici senza banalizzare' },
    { t: 'Bletchley Park di Turing', who: 'Alan Turing', y: '1939-1945', city: 'Bletchley', country: 'Regno Unito', lat: 51.9, lon: -0.74, locs: 'Bletchley Park (il Cottage 8 dove Turing lavorò alla decrittazione di Enigma, la Bombe ricostruita funzionante, il National Museum of Computing con repliche di Colossus, il primo calcolatore elettronico programmabile)', note: 'il lavoro qui fu tenuto segreto per decenni dopo la guerra; su Turing serve anche ricordare la persecuzione legale che subì per la sua omosessualità e la morte nel 1954 — tono rispettoso e onesto' },
    { t: 'Manchester di Rutherford', who: 'Ernest Rutherford', y: 1917, city: 'Manchester', country: 'Regno Unito', lat: 53.47, lon: -2.23, locs: 'il Museum of Science and Industry (il contesto dei laboratori vittoriani di fisica), l\'Università di Manchester dove Rutherford descrisse per primo la struttura del nucleo atomico', note: 'la "scissione dell\'atomo" fu un processo di anni con molti collaboratori, non un singolo colpo di genio: dillo' },
    { t: 'Parigi di Marie Curie', who: 'Marie Curie, Pierre Curie', y: '1867-1934', city: 'Parigi', country: 'Francia', lat: 48.84, lon: 2.34, locs: 'il Musée Curie all\'Institut du Radium (il laboratorio originale, i suoi quaderni ancora radioattivi conservati in scatole di piombo: si osservano, non si toccano), il Panthéon dove riposa (prima donna sepolta lì per meriti propri), la Sorbona dove insegnò', note: 'unica persona ad aver vinto due Nobel in due scienze diverse (fisica e chimica): raccontalo con i fatti, non con l\'aneddotica da santa laica' },
    { t: 'Varsavia di Marie Curie', who: 'Maria Skłodowska Curie', y: 1867, city: 'Varsavia', country: 'Polonia', lat: 52.25, lon: 20.99, locs: 'la casa natale in ulica Freta (oggi museo Marie Curie, con gli strumenti e le lettere), il Palazzo della Cultura come contesto della Varsavia scientifica di oggi', note: 'lasciò la Polonia perché alle donne era vietato l\'accesso alle università: dillo, è parte essenziale della sua storia' },
    { t: 'Ulma e Berna di Einstein', who: 'Albert Einstein', y: '1879 e 1905', city: 'Berna', country: 'Svizzera', lat: 46.95, lon: 7.44, locs: 'la Einstein-Haus in Kramgasse a Berna (l\'appartamento dove nel 1905, l\'"anno miracoloso", scrisse quattro articoli che cambiarono la fisica lavorando come impiegato all\'ufficio brevetti), l\'Ufficio Federale della Proprietà Intellettuale dove lavorava, il museo storico di Berna con una sezione Einstein', note: 'non era un impiegato mediocre come vuole il mito: il posto in ufficio brevetti gli lasciava tempo per pensare — raccontalo con precisione' },
    { t: 'Princeton di Einstein', who: 'Albert Einstein', y: '1933-1955', city: 'Princeton', country: 'Stati Uniti', lat: 40.35, lon: -74.66, locs: 'la casa al 112 di Mercer Street (esterno visibile, oggi proprietà privata: non si entra, dillo), l\'Institute for Advanced Study dove lavorò gli ultimi 22 anni, l\'Università di Princeton con cimeli nella biblioteca', note: 'qui scrisse anche la celebre lettera a Roosevelt sul rischio della bomba atomica tedesca: episodio da raccontare con il suo contesto storico, senza semplificazioni' },
    { t: 'Copenaghen di Bohr', who: 'Niels Bohr', y: '1921-1962', city: 'Copenaghen', country: 'Danimarca', lat: 55.7, lon: 12.55, locs: 'il Niels Bohr Institute (fondato da lui, crocevia della fisica quantistica del Novecento: molti Nobel vi passarono), la sua casa d\'onore alla Carlsberg (concessa dalla fondazione della birreria ai danesi più illustri), la statua nel parco dell\'istituto', note: '' },
    { t: 'Frombork di Copernico', who: 'Nicolaus Copernicus', y: '1510-1543', city: 'Frombork', country: 'Polonia', lat: 54.35, lon: 19.67, locs: 'la cattedrale-fortezza di Frombork (dove Copernico lavorò come canonico e osservò il cielo dalla torre), il museo Copernico nel palazzo vescovile, la sua tomba riscoperta nel 2005 sotto il pavimento della cattedrale e identificata col DNA', note: 'pubblicò la teoria eliocentrica solo in punto di morte, temendo le conseguenze: raccontalo con il suo vero contesto, non come atto di sfida' },
    { t: 'Uraniborg di Tycho Brahe', who: 'Tycho Brahe', y: '1576-1597', city: 'Isola di Hven', country: 'Svezia', lat: 55.9, lon: 12.69, locs: 'i resti dell\'osservatorio di Uraniborg sull\'isola di Hven (le fondamenta visibili, ricostruite in un piccolo museo), il giardino rinascimentale ricreato, il contesto dell\'astronomia pre-telescopica: qui furono raccolti i dati più precisi mai misurati a occhio nudo', note: 'i dati di Tycho servirono poi a Keplero per le leggi del moto planetario: il nesso va spiegato' },
    { t: 'San Pietroburgo di Mendeleev', who: 'Dmitrij Mendeleev', y: 1869, city: 'San Pietroburgo', country: 'Russia', lat: 59.94, lon: 30.31, locs: 'il Museo-Appartamento Mendeleev all\'Università statale (lo studio dove elaborò la tavola periodica degli elementi), l\'Istituto di Metrologia che porta il suo nome', note: 'la leggenda che vide la tavola periodica in sogno è un aneddoto raccontato da lui stesso, non verificabile: presentalo come tale' },
    { t: 'Bologna e Pontecchio di Marconi', who: 'Guglielmo Marconi', y: '1895', city: 'Pontecchio Marconi', country: 'Italia', lat: 44.41, lon: 11.16, locs: 'Villa Griffone (la casa di famiglia dove nel granaio-laboratorio trasmise il primo segnale radio attraverso la collina dei Celestini, oggi Museo Marconi), il mausoleo dove riposa nel parco della villa, il Museo del Patrimonio Industriale di Bologna', note: '' },
    { t: 'Londra di Fleming e la penicillina', who: 'Alexander Fleming', y: 1928, city: 'Londra', country: 'Regno Unito', lat: 51.52, lon: -0.17, locs: 'il St Mary\'s Hospital (il piccolo Fleming Museum nel laboratorio originale dove la muffa Penicillium contaminò per caso una piastra dimenticata: la scoperta fu una fortunata osservazione, non un esperimento pianificato — dillo con esattezza), Paddington come contesto', note: 'ci vollero altri 15 anni e il lavoro di Florey e Chain per rendere la penicillina un farmaco: menzionalo, la scoperta non fu immediata' },
    { t: 'Parigi di Pasteur', who: 'Louis Pasteur', y: '1822-1895', city: 'Parigi', country: 'Francia', lat: 48.84, lon: 2.31, locs: 'l\'Institut Pasteur (il museo con il suo laboratorio conservato e la sua tomba in una cripta bizantina all\'interno dell\'istituto), i suoi studi sulla rabbia e la pastorizzazione', note: '' },
    { t: 'Arbois di Pasteur', who: 'Louis Pasteur', y: '1854-1874', city: 'Arbois', country: 'Francia', lat: 46.9, lon: 5.77, locs: 'la Maison de Pasteur ad Arbois (la casa di famiglia con il laboratorio domestico dove studiò la fermentazione del vino locale, punto di partenza dei suoi studi sui microrganismi), le vigne del Jura', note: '' },
    // ── Americhe ──
    { t: 'Menlo Park di Edison', who: 'Thomas Edison', y: '1876-1886', city: 'Menlo Park', country: 'Stati Uniti', lat: 40.44, lon: -74.42, locs: 'il Thomas Edison Center a Menlo Park (torre commemorativa e museo sul sito del laboratorio originale, demolito e in parte ricostruito a Dearborn nel museo Ford: dillo), la lampadina a incandescenza perfezionata qui nel 1879', note: 'Edison lavorava con squadre di decine di assistenti: il mito del genio solitario va corretto con i fatti' },
    { t: 'West Orange di Edison', who: 'Thomas Edison', y: '1887-1931', city: 'West Orange', country: 'Stati Uniti', lat: 40.79, lon: -74.24, locs: 'il Thomas Edison National Historical Park (il laboratorio più grande, dove nacquero il fonografo perfezionato e i primi film: la Black Maria, primo studio cinematografico della storia, ricostruita), la sua casa Glenmont accanto', note: '' },
    { t: 'Kitty Hawk dei fratelli Wright', who: 'Orville e Wilbur Wright', y: 1903, city: 'Kill Devil Hills', country: 'Stati Uniti', lat: 36.02, lon: -75.67, locs: 'il Wright Brothers National Memorial (le pietre segnano i 4 punti di atterraggio del primo volo del 17 dicembre 1903, il più lungo di soli 260 metri), il monumento sulla collina di Kill Devil Hill, il centro visitatori con la replica del Flyer', note: 'scelsero Kitty Hawk per il vento costante, non per comodità: erano di Dayton, Ohio, dove avevano l\'officina di biciclette' },
    { t: 'Los Alamos e il Progetto Manhattan', who: 'J. Robert Oppenheimer', y: '1943-1945', city: 'Los Alamos', country: 'Stati Uniti', lat: 35.88, lon: -106.3, locs: 'il Bradbury Science Museum (la storia del laboratorio segreto), Fuller Lodge nel centro storico (il cuore della cittadina-laboratorio nata dal nulla), il sito Trinity nel New Mexico del sud (il primo test nucleare, aperto al pubblico solo 2 giorni l\'anno: dillo)', note: 'REGOLA GRAVE: racconta la scienza e le sue conseguenze umane con serietà, senza trionfalismo né spettacolarizzazione della bomba' },
    { t: 'Cape Canaveral e il volo spaziale', who: 'la NASA', y: '1958-oggi', city: 'Cape Canaveral', country: 'Stati Uniti', lat: 28.52, lon: -80.65, locs: 'il Kennedy Space Center Visitor Complex (l\'Apollo/Saturn V Center con il vero razzo lunare orizzontale, il Rocket Garden), la piattaforma di lancio LC-39A da cui partì l\'Apollo 11 (visibile da lontano nei tour, attiva per i lanci commerciali odierni)', note: '' },
    { t: 'Mountain View e la nascita di Internet', who: 'i pionieri di ARPANET e Xerox PARC', y: '1969-1979', city: 'Menlo Park', country: 'Stati Uniti', lat: 37.45, lon: -122.18, locs: 'lo SRI International (dove nel 1969 fu inviato il primo messaggio ARPANET tra due computer, l\'antenato di Internet), il Computer History Museum a Mountain View (la storia completa, dal telaio Jacquard ai microchip)', note: 'diverso dal tema "musei-impresa" di Silicon Valley: qui il taglio è la scienza informatica, non i brand' },
    { t: 'Woods Hole e l\'oceanografia', who: 'gli oceanografi di Woods Hole', y: '1930-oggi', city: 'Woods Hole', country: 'Stati Uniti', lat: 41.52, lon: -70.67, locs: 'il Woods Hole Oceanographic Institution Exhibit Center (da qui partì la missione che nel 1985 localizzò il relitto del Titanic), l\'acquario NOAA aperto al pubblico, il porto dei battelli di ricerca', note: '' },
    // ── Asia e Oceania ──
    { t: 'Alessandria antica e la misura della Terra', who: 'Eratostene', y: '240 a.C.', city: 'Alessandria d\'Egitto', country: 'Egitto', lat: 31.2, lon: 29.92, locs: 'la Bibliotheca Alexandrina moderna (ricostruzione simbolica sul sito dell\'antica Biblioteca, con un planetario e mostre sulla scienza ellenistica), il sito archeologico di Kom el-Shoqafa per il contesto della città antica', note: 'la Biblioteca antica fu distrutta e la sua fine resta storiograficamente dibattuta: non attribuirla a un singolo evento con certezza assoluta' },
    { t: 'Siracusa di Archimede', who: 'Archimede', y: '287-212 a.C.', city: 'Siracusa', country: 'Italia', lat: 37.06, lon: 15.29, locs: 'il Parco Archeologico della Neapolis (il contesto della Siracusa greca), il Museo Archeologico Paolo Orsi (reperti dell\'epoca), la memoria dell\'assedio romano del 212 a.C. in cui morì', note: 'l\'"eureka" nella vasca da bagno è raccontato da Vitruvio due secoli dopo i fatti: presentalo come aneddoto tramandato, non fatto certo' },
    { t: 'Atene del Liceo di Aristotele', who: 'Aristotele', y: '335 a.C.', city: 'Atene', country: 'Grecia', lat: 37.98, lon: 23.74, locs: 'il sito archeologico del Liceo di Aristotele (riscoperto nel 1996 nel centro di Atene, con i resti della palestra dove insegnava passeggiando — da cui "peripatetici"), il Museo dell\'Agorà antica per il contesto filosofico-scientifico ateniese', note: '' },
    { t: 'Beijing e l\'astronomia imperiale cinese', who: 'gli astronomi della corte imperiale', y: 'XIII-XVII secolo', city: 'Pechino', country: 'Cina', lat: 39.91, lon: 116.43, locs: 'l\'Antico Osservatorio Astronomico di Pechino (sulle mura della città, con gli strumenti bronzei originali dei gesuiti del Seicento e la tradizione astronomica cinese precedente)', note: '' },
    { t: 'Bangalore e l\'ISRO', who: 'l\'Indian Space Research Organisation', y: '1969-oggi', city: 'Bangalore', country: 'India', lat: 12.97, lon: 77.59, locs: 'il Visvesvaraya Industrial and Technological Museum (con una sezione dedicata al programma spaziale indiano), il contesto della città che ospita i centri di ricerca ISRO (accesso ai siti operativi solo su invito ufficiale: dillo)', note: '' },
    { t: 'Tsukuba, la città della scienza', who: 'i ricercatori di Tsukuba Science City', y: '1970-oggi', city: 'Tsukuba', country: 'Giappone', lat: 36.08, lon: 140.11, locs: 'lo Space Center di JAXA (il centro spaziale giapponese, con visite guidate gratuite), il Museum of Map and Survey, la città pianificata interamente attorno alla ricerca scientifica', note: '' },
    { t: 'Parkes e il radiotelescopio', who: 'gli astronomi di Parkes', y: 1969, city: 'Parkes', country: 'Australia', lat: -33.0, lon: 148.26, locs: 'il radiotelescopio di Parkes (il "Dish", che captò le immagini dello sbarco sulla Luna dell\'Apollo 11 e le ritrasmise al mondo: la storia raccontata anche nel film "The Dish"), il centro visitatori', note: '' },
  ],
};

// ── 🏟 SPORT — luoghi leggendari e i loro momenti ────────────────────
const SPORT_SEED: MediaSeedDef = {
  theme: 'sport',
  slugPrefix: 'sport',
  emoji: '🏟',
  label: 'Sport',
  rules: [
    'REGOLA SPORT (vincolante): nel campo "attivita" di OGNI tappa racconta il momento sportivo specifico legato al luogo — la partita, l\'impresa, il record — con nomi di atleti e anno SOLO se certi; poi il confronto ieri/oggi: cosa si vede oggi visitando (museo, tour dello stadio, il tracciato) e cosa è cambiato. Se il luogo è visitabile solo nei giorni di gara o con tour a pagamento, dillo con orari onesti.',
    'RISPETTO DEI TIFOSI E DELLE RIVALITÀ: racconta le rivalità storiche con equilibrio, senza schierarti; evita stereotipi su tifoserie o nazionalità.',
  ],
  works: [
    { t: 'Il Maracanã', who: 'la nazionale brasiliana, il Maracanazo del 1950', y: 1950, city: 'Rio de Janeiro', country: 'Brasile', lat: -22.91, lon: -43.23, locs: 'lo stadio Maracanã (il tour dello stadio più mitico del calcio, con la Hall of Fame delle firme sul pavimento), il Maracanazo del 16 luglio 1950 (la sconfitta del Brasile contro l\'Uruguay in finale davanti a 200.000 persone, il più grande trauma collettivo del calcio brasiliano)', note: '' },
    { t: 'Wembley, la casa del calcio', who: 'la nazionale inglese, la finale del 1966', y: 1966, city: 'Londra', country: 'Regno Unito', lat: 51.56, lon: -0.28, locs: 'il Wembley Stadium (tour dello stadio, il tunnel dei giocatori, il "Twin Towers Bridge" che ricorda le vecchie torri demolite nel 2003), il gol contestato di Geoff Hurst nella finale mondiale del 1966 contro la Germania', note: '' },
    { t: 'Il quadrilatero del calcio spagnolo', who: 'Real Madrid, Barcellona', y: '1902-oggi', city: 'Madrid', country: 'Spagna', lat: 40.45, lon: -3.69, locs: 'il Santiago Bernabéu (il tour col museo dei trofei e la nuova copertura retrattile), il Camp Nou a Barcellona (in ristrutturazione: verifica lo stato dei lavori prima di prenotare il tour), il Clásico come rivalità storica da raccontare con equilibrio', note: '' },
    { t: 'San Siro/Meazza', who: 'Milan, Inter', y: '1926-oggi', city: 'Milano', country: 'Italia', lat: 45.48, lon: 9.12, locs: 'lo stadio San Siro (tour e museo condiviso dalle due squadre milanesi, unico caso al mondo), le scale elicoidali esterne diventate simbolo architettonico, il derby della Madonnina come rivalità cittadina', note: 'lo stadio è destinato a una possibile demolizione futura per un nuovo impianto: informati sullo stato del progetto prima di prenotare' },
    { t: 'Old Trafford, il Teatro dei Sogni', who: 'Manchester United, Bobby Charlton', y: '1910-oggi', city: 'Manchester', country: 'Regno Unito', lat: 53.46, lon: -2.29, locs: 'Old Trafford (il tour con la statua della Trinità di Best, Law e Charlton), il memoriale al disastro aereo di Monaco del 1958 (la squadra dei Busby Babes, tono grave e rispettoso)', note: '' },
    { t: 'Anfield, You\'ll Never Walk Alone', who: 'Liverpool FC', y: '1892-oggi', city: 'Liverpool', country: 'Regno Unito', lat: 53.43, lon: -2.96, locs: 'Anfield (il tour del Kop, la targa "This Is Anfield" che i giocatori toccano entrando in campo), il memoriale a Hillsborough (la strage dei tifosi del 1989: tono grave, mai da semplice tappa turistica)', note: '' },
    { t: 'Estadio Azteca', who: 'la nazionale messicana, il "gol del secolo" di Maradona', y: 1986, city: 'Città del Messico', country: 'Messico', lat: 19.3, lon: -99.15, locs: 'lo stadio Azteca (unico stadio ad aver ospitato due finali mondiali, 1970 e 1986), il campo dove Maradona segnò il "gol del secolo" e la "mano de Dios" nello stesso quarto di finale del 1986', note: '' },
    { t: 'Fenway Park', who: 'Boston Red Sox', y: 1912, city: 'Boston', country: 'Stati Uniti', lat: 42.35, lon: -71.1, locs: 'il Fenway Park (il più antico stadio di baseball ancora in uso, tour del "Green Monster" il muro verde del campo sinistro), la maledizione del Bambino (la vendita di Babe Ruth nel 1919 e gli 86 anni senza titoli fino al 2004: storia vera diventata leggenda cittadina)', note: '' },
    { t: 'Lord\'s, la Home of Cricket', who: 'il Marylebone Cricket Club', y: 1814, city: 'Londra', country: 'Regno Unito', lat: 51.53, lon: -0.17, locs: 'Lord\'s Cricket Ground (il tour col Long Room, il museo con le Ashes urn originali), il pendio naturale del campo (unico tra i grandi stadi, parte della tradizione)', note: '' },
    { t: 'Melbourne Cricket Ground', who: 'lo sport australiano', y: 1853, city: 'Melbourne', country: 'Australia', lat: -37.82, lon: 144.98, locs: 'l\'MCG (tour con la Australian Sports Museum annessa, il campo che ha ospitato Olimpiadi 1956, Coppa del Mondo di cricket e finali di football australiano nello stesso anno)', note: '' },
    { t: 'Roland Garros', who: 'gli Internazionali di Francia', y: 1928, city: 'Parigi', country: 'Francia', lat: 48.85, lon: 2.25, locs: 'lo stadio Roland Garros (il Court Philippe-Chatrier, la terra rossa iconica), il tour del complesso con il museo del tennis francese', note: '' },
    { t: 'Wimbledon', who: 'i campionati di Wimbledon', y: 1877, city: 'Londra', country: 'Regno Unito', lat: 51.43, lon: -0.21, locs: 'l\'All England Lawn Tennis Club (il tour con il Centre Court, il museo del tennis con la coppa originale), la tradizione delle fragole con panna e del rigoroso bianco d\'obbligo', note: '' },
    { t: 'Augusta National', who: 'il Masters di golf', y: 1934, city: 'Augusta', country: 'Stati Uniti', lat: 33.5, lon: -82.02, locs: 'Augusta National Golf Club (accesso quasi impossibile fuori dal torneo: il club è privatissimo, si osserva da fuori o si punta ai biglietti del Masters con mesi di anticipo — dillo con chiarezza), Amen Corner (le buche 11-12-13, le più drammatiche del golf mondiale)', note: '' },
    { t: 'St Andrews, la casa del golf', who: 'il Royal and Ancient Golf Club', y: 'XV secolo', city: 'St Andrews', country: 'Regno Unito', lat: 56.34, lon: -2.8, locs: 'l\'Old Course di St Andrews (il campo più antico del mondo, aperto anche ai golfisti non soci con prenotazione tramite ballottaggio), lo Swilcan Bridge (il ponticello di pietra fotografato da ogni grande campione), il British Golf Museum', note: '' },
    { t: 'Circuito di Monaco', who: 'il Gran Premio di Monaco', y: 1929, city: 'Monte Carlo', country: 'Monaco', lat: 43.73, lon: 7.42, locs: 'il tracciato cittadino (percorribile a piedi fuori dal weekend di gara: il tunnel, la Rascasse, il tornante della Fairmont Hairpin), il porto dove si affacciano gli yacht durante il Gran Premio', note: '' },
    { t: 'Nürburgring Nordschleife', who: 'la "Green Hell"', y: 1927, city: 'Nürburg', country: 'Germania', lat: 50.33, lon: 6.95, locs: 'il Nürburgring Nordschleife (20 km di curve soprannominati "l\'Inferno Verde" da Jackie Stewart; nei giorni "Touristenfahrten" chiunque con un\'auto omologata può percorrerlo, a proprio rischio: dillo chiaramente), il centro visitatori Ring°Werk', note: '' },
    { t: 'Monza, il Tempio della Velocità', who: 'il Gran Premio d\'Italia', y: 1922, city: 'Monza', country: 'Italia', lat: 45.62, lon: 9.28, locs: 'l\'Autodromo di Monza (il tracciato nel parco storico, il "catino" sopraelevato dismesso ancora visibile e percorribile a piedi), il museo della velocità', note: '' },
    { t: 'Alpe d\'Huez', who: 'il Tour de France', y: 1952, city: 'Alpe d\'Huez', country: 'Francia', lat: 45.09, lon: 6.07, locs: 'i 21 tornanti numerati dell\'Alpe d\'Huez (ognuno intitolato a un vincitore di tappa, si percorrono in bici o a piedi tutto l\'anno), il tornante 7 detto "olandese" per il tifo arancione storico', note: '' },
    { t: 'Mont Ventoux', who: 'il Tour de France, Tom Simpson', y: 1967, city: 'Bédoin', country: 'Francia', lat: 44.17, lon: 5.28, locs: 'la salita del Mont Ventoux dal versante di Bédoin (il "Gigante della Provenza", gli ultimi km spogli di vegetazione, quasi lunari), il memoriale a Tom Simpson vicino alla vetta (il ciclista morto durante il Tour del 1967, tono grave e rispettoso, senza glorificare il doping che contribuì alla tragedia)', note: '' },
    { t: 'Passo dello Stelvio', who: 'il Giro d\'Italia, la Cima Coppi', y: 1953, city: 'Stelvio', country: 'Italia', lat: 46.53, lon: 10.45, locs: 'i 48 tornanti numerati dello Stelvio (una delle salite simbolo del Giro d\'Italia, spesso "Cima Coppi" il punto più alto della corsa), il Passo dello Stelvio con vista sui ghiacciai', note: '' },
    { t: 'Boston e la maratona', who: 'la Boston Marathon', y: 1897, city: 'Boston', country: 'Stati Uniti', lat: 42.35, lon: -71.06, locs: 'Heartbreak Hill a Newton (la salita al 20° miglio dove si decidono le gare), la linea di arrivo su Boylston Street (memoriale all\'attentato del 2013, tono grave), la maratona più antica del mondo ancora corsa ogni anno', note: '' },
    { t: 'Olimpia antica', who: 'i giochi olimpici antichi', y: '776 a.C.', city: 'Olimpia', country: 'Grecia', lat: 37.64, lon: 21.63, locs: 'il sito archeologico di Olimpia (lo stadio antico dove si correva nudi, il Museo Archeologico con la Nike di Paionios), il tempio di Zeus dove ardeva la fiamma, l\'origine di ogni cerimonia olimpica moderna', note: '' },
    { t: 'Atene 1896, le prime Olimpiadi moderne', who: 'Pierre de Coubertin, Spiridon Louis', y: 1896, city: 'Atene', country: 'Grecia', lat: 37.97, lon: 23.74, locs: 'lo Stadio Panatenaico (interamente in marmo bianco, ospitò le prime Olimpiadi moderne del 1896 ed è ancora usato oggi), la memoria della maratona vinta dal pastore greco Spiridon Louis', note: '' },
    { t: 'Kitzbühel e l\'Hahnenkamm', who: 'lo sci alpino', y: 1931, city: 'Kitzbühel', country: 'Austria', lat: 47.45, lon: 12.39, locs: 'la pista Streif (la discesa libera più temuta del circo bianco, percorribile a piedi d\'estate seguendo il tracciato con i pannelli informativi sui punti critici come la Mausefalle), il museo dello sci di Kitzbühel', note: '' },
    { t: 'Chamonix e le prime Olimpiadi invernali', who: 'i Giochi olimpici invernali', y: 1924, city: 'Chamonix', country: 'Francia', lat: 45.92, lon: 6.87, locs: 'il centro di Chamonix (targhe e memoriali dei primi Giochi invernali della storia), lo stadio olimpico originale, il massiccio del Monte Bianco come sfondo', note: '' },
    { t: 'Le Mans, la 24 Ore', who: 'la 24 Ore di Le Mans', y: 1923, city: 'Le Mans', country: 'Francia', lat: 47.95, lon: 0.21, locs: 'il Circuit de la Sarthe (il rettilineo Mulsanne, tra i più lunghi del motorsport mondiale), il Musée des 24 Heures con le auto vincitrici storiche', note: '' },
    { t: 'Indianapolis Motor Speedway', who: 'la Indy 500', y: 1911, city: 'Indianapolis', country: 'Stati Uniti', lat: 39.79, lon: -86.24, locs: 'l\'Indianapolis Motor Speedway (il "Brickyard", il tratto di mattoni originali ancora visibile sul traguardo), lo Speedway Museum con le auto vincitrici', note: '' },
    { t: 'Twickenham, la casa del rugby', who: 'la nazionale inglese di rugby', y: 1909, city: 'Londra', country: 'Regno Unito', lat: 51.46, lon: -0.34, locs: 'Twickenham Stadium (il World Rugby Museum annesso, tour dello stadio), la tradizione del "Rugby, football played in heaven" celebrata nel museo', note: '' },
    { t: 'Eden Park e gli All Blacks', who: 'la nazionale neozelandese di rugby', y: 1900, city: 'Auckland', country: 'Nuova Zelanda', lat: -36.87, lon: 174.74, locs: 'Eden Park (lo stadio degli All Blacks, tour disponibili), la tradizione della haka prima di ogni incontro (spiegane il significato culturale maori con rispetto, non come semplice folklore da spettacolo)', note: '' },
    { t: 'Soccer City e il Mondiale 2010', who: 'la nazionale sudafricana, il Mondiale 2010', y: 2010, city: 'Johannesburg', country: 'Sudafrica', lat: -26.24, lon: 27.98, locs: 'il FNB Stadium/Soccer City (a forma di calabash, la zucca tradizionale africana; qui si giocò la finale del primo Mondiale in Africa), il quartiere di Soweto vicino', note: '' },
    { t: 'Estadio Centenario, il primo Mondiale', who: 'la nazionale uruguaiana, il Mondiale 1930', y: 1930, city: 'Montevideo', country: 'Uruguay', lat: -34.9, lon: -56.16, locs: 'l\'Estadio Centenario (patrimonio storico FIFA, ospitò la primissima finale mondiale nel 1930, vinta dall\'Uruguay padrone di casa), il Museo del Fútbol al suo interno', note: '' },
    { t: 'La Bombonera e il Monumental', who: 'Boca Juniors, River Plate, Diego Maradona', y: '1940-oggi', city: 'Buenos Aires', country: 'Argentina', lat: -34.64, lon: -58.36, locs: 'La Bombonera a La Boca (lo stadio-scatola di cioccolatini di Boca Juniors, tra i più intensi al mondo il giorno del Superclásico), l\'Estadio Monumental di Núñez (River Plate, dove l\'Argentina vinse il Mondiale 1978), il museo di Boca con i cimeli di Maradona', note: 'il Superclásico Boca-River è tra le rivalità più accese del calcio mondiale: raccontala con equilibrio' },
    { t: 'Westfalenstadion e il Muro Giallo', who: 'Borussia Dortmund', y: 1974, city: 'Dortmund', country: 'Germania', lat: 51.49, lon: 7.45, locs: 'il Signal Iduna Park (il "Muro Giallo", la Südtribüne da 25.000 posti in piedi, la più grande curva d\'Europa), il museo del Borussia Dortmund nel bacino della Ruhr', note: '' },
    { t: 'Allianz Arena', who: 'Bayern Monaco', y: 2005, city: 'Monaco di Baviera', country: 'Germania', lat: 48.22, lon: 11.62, locs: 'l\'Allianz Arena (la facciata gonfiabile che cambia colore, tour dello stadio e del museo FC Bayern), il quartiere di Fröttmaning raggiungibile in metro', note: '' },
    { t: 'Stadio Olimpico e la Roma calcistica', who: 'AS Roma, Lazio', y: 1953, city: 'Roma', country: 'Italia', lat: 41.93, lon: 12.45, locs: 'lo Stadio Olimpico (condiviso da Roma e Lazio, il derby della Capitale come rito cittadino), il Foro Italico circostante con i marmi del ventennio (contesto storico da spiegare con onestà)', note: '' },
    { t: 'Ibrox e Celtic Park, l\'Old Firm', who: 'Rangers, Celtic', y: '1888-oggi', city: 'Glasgow', country: 'Regno Unito', lat: 55.85, lon: -4.31, locs: 'Ibrox Stadium (Rangers) e Celtic Park (Celtic) a poca distanza l\'uno dall\'altro, la rivalità dell\'Old Firm intrecciata a identità religiose e comunitarie della città: raccontala con rispetto e senza schierarti', note: '' },
    { t: 'Madison Square Garden', who: 'New York Knicks, il basket NBA', y: 1968, city: 'New York', country: 'Stati Uniti', lat: 40.75, lon: -73.99, locs: 'il Madison Square Garden ("The World\'s Most Famous Arena", sopra la stazione di Penn Station), la 33ª strada dei concerti e delle notti NBA più leggendarie', note: '' },
    { t: 'United Center e l\'era di Jordan', who: 'Michael Jordan, Chicago Bulls', y: 1994, city: 'Chicago', country: 'Stati Uniti', lat: 41.88, lon: -87.67, locs: 'lo United Center (la statua di Michael Jordan "The Spirit" all\'ingresso), il museo dei trofei dei sei titoli NBA dei Bulls anni \'90', note: '' },
    { t: 'Lambeau Field', who: 'Green Bay Packers, Vince Lombardi', y: 1957, city: 'Green Bay', country: 'Stati Uniti', lat: 44.5, lon: -88.06, locs: 'il Lambeau Field (il più antico stadio NFL ancora in uso, il "Frozen Tundra" delle partite invernali sotto zero), la statua di Vince Lombardi, il Green Bay Packers Hall of Fame', note: '' },
    { t: 'Eden Gardens', who: 'il cricket indiano', y: 1864, city: 'Calcutta', country: 'India', lat: 22.56, lon: 88.34, locs: 'l\'Eden Gardens (uno dei templi del cricket più capienti al mondo, l\'atmosfera delle notti di test match), il museo del cricket bengalese al suo interno', note: '' },
    { t: 'Sydney Cricket Ground', who: 'il cricket australiano', y: 1848, city: 'Sydney', country: 'Australia', lat: -33.89, lon: 151.22, locs: 'lo Sydney Cricket Ground (lo storico "SCG", tour dello stadio e del suo museo), il Sydney Football Stadium accanto per il rugby', note: '' },
    { t: 'Millennium Stadium/Principality Stadium', who: 'il rugby gallese', y: 1999, city: 'Cardiff', country: 'Regno Unito', lat: 51.48, lon: -3.18, locs: 'il Principality Stadium nel cuore di Cardiff (il tetto retrattile, l\'inno "Land of My Fathers" cantato da 70.000 voci prima del calcio d\'inizio), il Millennium Walkway lungo il fiume Taff', note: '' },
    { t: 'Crucible Theatre, il tempio dello snooker', who: 'i campionati del mondo di snooker', y: 1977, city: 'Sheffield', country: 'Regno Unito', lat: 53.38, lon: -1.47, locs: 'il Crucible Theatre (277 posti, la sala più piccola e più iconica dello sport mondiale per un solo torneo l\'anno, ad aprile-maggio), il World Snooker Hall of Fame in città', note: '' },
    { t: 'Ascot e il Kentucky Derby', who: 'l\'ippica britannica e americana', y: '1711 e 1875', city: 'Ascot', country: 'Regno Unito', lat: 51.41, lon: -0.68, locs: 'l\'ippodromo di Ascot (il Royal Ascot di giugno, il rituale dei cappelli e del defilé reale), il parallelo americano di Churchill Downs a Louisville col Kentucky Derby (Run for the Roses, dal 1875)', note: '' },
    { t: 'Iffley Road, il miglio in 4 minuti', who: 'Roger Bannister', y: 1954, city: 'Oxford', country: 'Regno Unito', lat: 51.73, lon: -1.24, locs: 'la pista di Iffley Road a Oxford (dove il 6 maggio 1954 Bannister corse il primo miglio sotto i 4 minuti della storia, un limite ritenuto invalicabile), la targa commemorativa sulla pista tuttora in uso', note: '' },
  ],
};

// ── 👗 MODA — atelier, vie e set iconici ─────────────────────────────
const FASHION_SEED: MediaSeedDef = {
  theme: 'moda',
  slugPrefix: 'fashion',
  emoji: '👗',
  label: 'Moda',
  rules: [
    'REGOLA MODA (vincolante): nel campo "attivita" di OGNI tappa racconta il momento o l\'eredità dello stilista/atelier legato al luogo — cosa fu creato o presentato lì, perché ha fatto scuola — citando nomi SOLO tra quelli indicati o di cui sei assolutamente certo. Distingui la boutique-flagship di oggi (aperta a tutti) dall\'atelier storico di alta moda (spesso chiuso al pubblico, visitabile solo per i clienti o in occasione di mostre): dillo sempre.',
    'MAI attribuire una via o una casa di moda a un designer non citato nel materiale.',
  ],
  works: [
    { t: 'Il Quadrilatero della moda', who: 'Armani, Versace, Prada, Dolce&Gabbana', y: '1970-oggi', city: 'Milano', country: 'Italia', lat: 45.47, lon: 9.19, locs: 'via Montenapoleone e via della Spiga (le vie simbolo dello shopping di lusso italiano), l\'Armani/Silos in via Bergognone (l\'archivio-museo di 40 anni di collezioni Armani, aperto al pubblico), la sede storica di Versace in via Gesù', note: '' },
    { t: 'Firenze di Ferragamo e Gucci', who: 'Salvatore Ferragamo, Guccio Gucci', y: '1927-oggi', city: 'Firenze', country: 'Italia', lat: 43.77, lon: 11.25, locs: 'il Museo Salvatore Ferragamo a Palazzo Spini Feroni (le celebri scarpe per le star di Hollywood, coi calchi dei piedi di Marilyn Monroe e Audrey Hepburn), la Gucci Garden in piazza della Signoria (il museo-boutique nel palazzo storico dove nacque il marchio nel 1921)', note: '' },
    { t: '31 rue Cambon di Chanel', who: 'Coco Chanel', y: '1910-1971', city: 'Parigi', country: 'Francia', lat: 48.87, lon: 2.33, locs: 'il 31 di rue Cambon (l\'atelier storico con la celebre scala a specchi da cui Coco Chanel osservava le sfilate nascosta; visitabile solo su invito privato per i clienti haute couture: dillo chiaramente), il suo appartamento sopra la boutique, oggi in parte visitabile con mostre temporanee', note: '' },
    { t: 'Avenue Montaigne di Dior', who: 'Christian Dior', y: 1947, city: 'Parigi', country: 'Francia', lat: 48.87, lon: 2.3, locs: 'il 30 di Avenue Montaigne (la casa madre Dior, con il museo permanente "La Galerie Dior" aperto al pubblico dal 2022, sul sito dove nel 1947 debuttò il "New Look" che rivoluzionò la moda del dopoguerra)', note: '' },
    { t: 'Savile Row, la sartoria inglese', who: 'le sartorie di Savile Row', y: 'XIX secolo-oggi', city: 'Londra', country: 'Regno Unito', lat: 51.51, lon: -0.14, locs: 'Savile Row (la strada delle sartorie su misura più celebri del mondo, alcune aperte dal 1806: Henry Poole & Co, Gieves & Hawkes), il tetto del numero 3 (dove i Beatles tennero il loro ultimo concerto nel 1969, aneddoto diverso ma nello stesso luogo)', note: '' },
    { t: 'Rue du Faubourg Saint-Honoré', who: 'Hermès, le grandi maison parigine', y: 'XIX secolo-oggi', city: 'Parigi', country: 'Francia', lat: 48.87, lon: 2.32, locs: 'la boutique storica Hermès al 24 di Faubourg Saint-Honoré (dal 1880, sede originaria del marchio nato come sellería per cavalli: da qui il logo con la carrozza), le gallerie d\'arte e le boutique di lusso lungo la via', note: '' },
    { t: 'Getaria e San Sebastián di Balenciaga', who: 'Cristóbal Balenciaga', y: 1895, city: 'Getaria', country: 'Spagna', lat: 43.31, lon: -2.2, locs: 'il Cristóbal Balenciaga Museoa a Getaria (costruito nel paese natale del sarto, con centinaia di abiti originali), il negozio di San Sebastián dove iniziò la carriera cucendo per l\'aristocrazia locale', note: '' },
    { t: 'Anversa, la scuola belga', who: 'gli Antwerp Six, Dries Van Noten', y: '1986-oggi', city: 'Anversa', country: 'Belgio', lat: 51.22, lon: 4.4, locs: 'il MoMu, Fashion Museum di Anversa (la storia della scuola belga di moda concettuale), l\'Accademia Reale di Belle Arti da cui uscirono gli "Antwerp Six" che rivoluzionarono la moda negli anni \'80, le boutique nel quartiere della moda', note: '' },
    { t: 'Central Saint Martins e McQueen', who: 'Alexander McQueen', y: '1992-2010', city: 'Londra', country: 'Regno Unito', lat: 51.53, lon: -0.13, locs: 'la Central Saint Martins (la scuola dove McQueen si laureò con una collezione che Isabella Blow comprò intera, lanciandolo), il V&A Museum (che gli ha dedicato la più grande retrospettiva di moda della sua storia, "Savage Beauty")', note: 'McQueen morì nel 2010: raccontane l\'eredità creativa con rispetto, senza morbosità sulla sua morte' },
    { t: 'World\'s End di Vivienne Westwood', who: 'Vivienne Westwood, Malcolm McLaren', y: 1971, city: 'Londra', country: 'Regno Unito', lat: 51.49, lon: -0.19, locs: 'il negozio World\'s End sulla King\'s Road a Chelsea (con l\'orologio che gira all\'indietro sulla facciata: qui nacque l\'estetica punk che vestì i Sex Pistols), la King\'s Road come strada simbolo delle controculture londinesi', note: '' },
    { t: 'San Francisco e la nascita dei jeans', who: 'Levi Strauss, Jacob Davis', y: 1873, city: 'San Francisco', country: 'Stati Uniti', lat: 37.79, lon: -122.4, locs: 'il Levi\'s Plaza (sede storica del marchio), il Levi Strauss & Co. archivio (visitabile su prenotazione per gruppi: i primi jeans rivettati nacquero qui dalla tela per tende dei minatori della corsa all\'oro)', note: '' },
    { t: 'Quinta Strada, i grandi magazzini di New York', who: 'Ralph Lauren, Tiffany & Co', y: 'XX secolo', city: 'New York', country: 'Stati Uniti', lat: 40.76, lon: -73.97, locs: 'la Ralph Lauren Mansion sulla Madison Avenue (un intero palazzo neo-georgiano trasformato in boutique-museo dello stile americano), la Quinta Strada dei grandi department store storici', note: '' },
    { t: 'Harajuku, la moda di strada', who: 'la street fashion giapponese', y: '1980-oggi', city: 'Tokyo', country: 'Giappone', lat: 35.67, lon: 139.7, locs: 'Takeshita Street a Harajuku (l\'epicentro della moda di strada giapponese, kawaii e alternativa), Omotesandō (i flagship store di architettura firmata dei grandi marchi internazionali), il contrasto tra le due anime della stessa zona', note: '' },
    { t: 'Marrakech di Yves Saint Laurent', who: 'Yves Saint Laurent, Pierre Bergé', y: '1966-2008', city: 'Marrakech', country: 'Marocco', lat: 31.64, lon: -8.0, locs: 'il Jardin Majorelle (il giardino che YSL e Bergé salvarono dalla speculazione edilizia e amarono per decenni), il Musée Yves Saint Laurent Marrakech accanto (l\'archivio delle sue collezioni ispirate al Marocco), le sue ceneri sparse nel giardino', note: '' },
    { t: 'Deauville di Coco Chanel', who: 'Coco Chanel', y: 1913, city: 'Deauville', country: 'Francia', lat: 49.36, lon: 0.07, locs: 'il negozio storico di Deauville dove Chanel aprì la sua prima boutique fuori Parigi nel 1913, lanciando i capi in jersey un tempo riservati alla biancheria intima maschile: la rivoluzione del guardaroba femminile iniziò da qui, non da Parigi', note: '' },
    { t: 'Como, la seta italiana', who: 'i setifici comaschi', y: 'XIX secolo-oggi', city: 'Como', country: 'Italia', lat: 45.81, lon: 9.08, locs: 'il Museo Didattico della Seta di Como (la storia del distretto che veste ancora oggi le grandi maison mondiali), le fabbriche storiche sul lago (alcune con tour su prenotazione), il museo che spiega l\'intera filiera dal baco al tessuto', note: '' },
    { t: 'Biella, il distretto della lana', who: 'i lanifici biellesi', y: 'XVIII secolo-oggi', city: 'Biella', country: 'Italia', lat: 45.57, lon: 8.06, locs: 'il DocBi Museo del Territorio Biellese (la storia dei lanifici storici come Zegna e Cerruti), Oasi Zegna (il parco naturale creato dall\'azienda per i suoi operai, oggi aperto a tutti: un caso più unico che raro), i vecchi lanifici lungo i torrenti', note: '' },
    { t: 'Ginza di Tokyo, il lusso giapponese', who: 'i flagship store internazionali', y: 'XX secolo-oggi', city: 'Tokyo', country: 'Giappone', lat: 35.67, lon: 139.77, locs: 'Ginza (il quartiere dello shopping di lusso dal 1872, con le architetture firmate dei marchi internazionali), Chuo-dori chiusa al traffico la domenica per le passeggiate', note: '' },
    { t: 'Aoyama e Harajuku dei designer giapponesi', who: 'Rei Kawakubo (Comme des Garçons), Issey Miyake, Yohji Yamamoto', y: '1970-oggi', city: 'Tokyo', country: 'Giappone', lat: 35.66, lon: 139.71, locs: 'il flagship Comme des Garçons di Aoyama (l\'ingresso a specchi deformanti, coerente con l\'estetica anticonformista di Kawakubo), il negozio Issey Miyake, il quartiere dove negli anni \'80 il decostruttivismo giapponese sconvolse la moda occidentale a Parigi', note: '' },
    { t: 'Reggio Calabria di Gianni Versace', who: 'Gianni Versace', y: 1946, city: 'Reggio Calabria', country: 'Italia', lat: 38.11, lon: 15.65, locs: 'il quartiere natale di Gianni Versace (dove la madre sarta gli trasmise il mestiere), il lungomare di Reggio Calabria, la memoria del percorso che lo portò da qui a Milano e infine a Miami', note: 'Versace fu ucciso a Miami nel 1997: tono rispettoso, l\'itinerario racconta le origini, non la tragedia' },
    { t: 'Miami e la Casa Casuarina di Versace', who: 'Gianni Versace', y: 1992, city: 'Miami Beach', country: 'Stati Uniti', lat: 25.78, lon: -80.13, locs: 'la Casa Casuarina su Ocean Drive (l\'ex villa di Versace, oggi hotel-ristorante: gli esterni in stile mediterraneo che colpirono South Beach), Ocean Drive art déco che Versace contribuì a rilanciare come scena internazionale', note: 'davanti a questa villa Versace fu ucciso nel 1997: menzionalo con sobrietà, senza morbosità, il taglio resta sulla sua eredità creativa' },
    { t: 'Piacenza di Giorgio Armani', who: 'Giorgio Armani', y: 1934, city: 'Piacenza', country: 'Italia', lat: 45.05, lon: 9.69, locs: 'il centro storico di Piacenza dove Armani nacque e crebbe prima di trasferirsi a Milano, la Galleria del Sole con negozi storici della città che lo videro ragazzo', note: 'sulla città natale non ci sono musei dedicati: è un itinerario di contesto biografico, dillo apertamente' },
    { t: 'Place Vendôme di Schiaparelli', who: 'Elsa Schiaparelli', y: 1934, city: 'Parigi', country: 'Francia', lat: 48.87, lon: 2.33, locs: 'il 21 di place Vendôme (l\'atelier storico riaperto dalla maison contemporanea, con l\'iconico "Shocking Pink" che Schiaparelli inventò), la collaborazione con Salvador Dalí e i surrealisti negli anni \'30 (l\'abito-aragosta, il cappello-scarpa)', note: '' },
    { t: 'Arles di Christian Lacroix', who: 'Christian Lacroix', y: 1951, city: 'Arles', country: 'Francia', lat: 43.68, lon: 4.63, locs: 'il centro di Arles dove Lacroix nacque e trasse ispirazione dai costumi tradizionali provenzali e dalla corrida per le sue collezioni sgargianti, il museo Réattu con alcuni suoi bozzetti', note: 'stessa città di "Arles di Van Gogh" (tema arte): due storie diverse nello stesso luogo, senza confonderle' },
    { t: 'Amburgo di Karl Lagerfeld', who: 'Karl Lagerfeld', y: 1933, city: 'Amburgo', country: 'Germania', lat: 53.55, lon: 9.99, locs: 'i quartieri di Amburgo dell\'infanzia di Lagerfeld prima del trasferimento a Parigi nel 1952, dove costruì la carriera che lo portò a dirigere Chanel, Fendi e il proprio marchio', note: 'la sua vita professionale si svolse quasi interamente a Parigi: qui l\'itinerario racconta solo le radici' },
    { t: 'Firenze di Emilio Pucci', who: 'Emilio Pucci', y: 1922, city: 'Firenze', country: 'Italia', lat: 43.77, lon: 11.25, locs: 'Palazzo Pucci in via de\' Pucci (la sede storica della maison, dimora nobiliare della famiglia da secoli), gli stampati psichedelici anni \'60 che resero Pucci sinonimo di jet-set e Capri', note: '' },
    { t: 'Sumirago di Missoni', who: 'Ottavio e Rosita Missoni', y: 1953, city: 'Sumirago', country: 'Italia', lat: 45.72, lon: 8.75, locs: 'lo stabilimento e la Missoni Home Collection a Sumirago (Varese), dove le trame a zigzag multicolore nacquero da un piccolo laboratorio artigiano di maglieria', note: '' },
    { t: 'Quarona di Loro Piana', who: 'la famiglia Loro Piana', y: 1924, city: 'Quarona', country: 'Italia', lat: 45.72, lon: 8.24, locs: 'il lanificio storico di Quarona in Valsesia (cashmere e lana vergine lavorati dagli anni \'20), il Loro Piana Golf & Country Club creato dall\'azienda per la comunità locale', note: '' },
    { t: 'Basingstoke/Horseferry Road di Burberry', who: 'Thomas Burberry', y: 1856, city: 'Londra', country: 'Regno Unito', lat: 51.49, lon: -0.13, locs: 'la sede di Burberry a Horseferry Road (l\'iconico motivo tartan e il trench coat inventato per gli ufficiali della Prima guerra mondiale), il negozio storico di Basingstoke dove Burberry aprì la prima bottega nel 1856', note: '' },
    { t: 'Dongdaemun di Seoul', who: 'il distretto della moda coreana', y: '1970-oggi', city: 'Seoul', country: 'Corea del Sud', lat: 37.57, lon: 127.01, locs: 'il Dongdaemun Design Plaza (l\'edificio futuristico di Zaha Hadid), i mercati tessili h24 di Dongdaemun dove nascono migliaia di capi ogni notte per il mercato coreano e l\'export asiatico', note: '' },
    { t: 'Portofino e la Riviera di Dolce&Gabbana', who: 'Domenico Dolce, Stefano Gabbana', y: '1985-oggi', city: 'Portofino', country: 'Italia', lat: 44.3, lon: 9.21, locs: 'il borgo di Portofino (fonte di ispirazione ricorrente per stampe e sfilate della maison, spesso scelto per eventi ed sfilate en plein air), la Sicilia natale di Dolce come seconda fonte iconografica ricorrente (merletti, carretti, agrumi)', note: '' },
  ],
};

/** I sei registri "luoghi di" dell'ONDATA 2 in un unico array: usato per
 *  wiring/label (es. buildAngleLabels lato client) senza dover elencare
 *  ogni singolo *_SEED a mano nei consumatori esterni. */
export const MEDIA_SEEDS: MediaSeedDef[] = [MUSIC_SEED, ART_SEED, HISTORY_SEED, SCIENCE_SEED, SPORT_SEED, FASHION_SEED];

// ─────────────────────────────────────────────────────────────────────
// 🚲 CICLOVIE — percorsi cicloturistici reali, MULTI-TAPPA con lo STESSO
//    meccanismo dei cammini (PILGRIM_ROUTES): stages elencate per intero
//    nel brief, un giorno per tappa, km reali, nessun trasferimento in
//    auto. Dati locali a QUESTO modulo (non da transitCatalog.ts, che
//    resta la fonte di sola lettura per porti/scali/cammini): qui basta
//    il pattern "brief multi-giorno con le tappe elencate per nome".
// ─────────────────────────────────────────────────────────────────────

interface CycleStage {
  day: number;
  from: string;
  to: string;
  km: number;
  note?: string;
}

interface CycleRoute {
  id: string;
  emoji: string;
  name: string;
  country: string;
  start: string;
  end: string;
  lat: number;
  lon: number;
  difficulty: string;
  surface: string;
  stages: CycleStage[];
}

const CYCLE_ROUTES: CycleRoute[] = [
  {
    id: 'vento-po', emoji: '🚲', name: 'VenTo lungo il Po (Torino-Piacenza)', country: 'Italia',
    start: 'Torino', end: 'Piacenza', lat: 45.07, lon: 7.69, difficulty: 'facile, pianeggiante', surface: 'sterrato e asfalto misti, alcuni tratti da verificare stagionalmente',
    stages: [
      { day: 1, from: 'Torino', to: 'Chivasso', km: 28, note: 'uscita dalla città lungo il Po, argini e golene' },
      { day: 2, from: 'Chivasso', to: 'Casale Monferrato', km: 48, note: 'campagna vercellese, risaie' },
      { day: 3, from: 'Casale Monferrato', to: 'Pavia', km: 62, note: 'confluenza col Ticino, il Ponte Coperto di Pavia' },
      { day: 4, from: 'Pavia', to: 'Cremona', km: 68, note: 'golene del Po, torrazzo di Cremona in lontananza' },
      { day: 5, from: 'Cremona', to: 'Piacenza', km: 45, note: 'tratto finale, arrivo sotto la Gotico piacentino' },
    ],
  },
  {
    id: 'loira-a-velo', emoji: '🚲', name: 'La Loira in bici (Orléans-Angers)', country: 'Francia',
    start: 'Orléans', end: 'Angers', lat: 47.9, lon: 1.9, difficulty: 'facile, pianeggiante', surface: 'pista ciclabile dedicata quasi ovunque (Loire à Vélo, EuroVelo 6)',
    stages: [
      { day: 1, from: 'Orléans', to: 'Blois', km: 65, note: 'argini della Loira, il castello di Chambord in deviazione' },
      { day: 2, from: 'Blois', to: 'Amboise', km: 34, note: 'il castello di Amboise e Clos Lucé, ultima casa di Leonardo da Vinci' },
      { day: 3, from: 'Amboise', to: 'Tours', km: 36, note: 'vigneti della Touraine' },
      { day: 4, from: 'Tours', to: 'Saumur', km: 65, note: 'il castello di Villandry e i suoi giardini, cantine scavate nel tufo' },
      { day: 5, from: 'Saumur', to: 'Angers', km: 55, note: 'confluenza Loira-Maine, il castello di Angers e l\'Apocalisse di Angers' },
    ],
  },
  {
    id: 'danubio-passau-vienna', emoji: '🚲', name: 'Danubio in bici (Passau-Vienna)', country: 'Austria',
    start: 'Passau', end: 'Vienna', lat: 48.57, lon: 13.46, difficulty: 'facile, pianeggiante', surface: 'pista ciclabile dedicata (Donauradweg), tra le più frequentate al mondo',
    stages: [
      { day: 1, from: 'Passau', to: 'Schlögen', km: 35, note: 'l\'ansa a gomito del Danubio (Schlögener Schlinge)' },
      { day: 2, from: 'Schlögen', to: 'Linz', km: 40, note: 'gole boscose, arrivo nella capitale dell\'Alta Austria' },
      { day: 3, from: 'Linz', to: 'Grein', km: 45, note: 'castelli sulle rive, il canale di Struden' },
      { day: 4, from: 'Grein', to: 'Melk', km: 40, note: 'l\'abbazia barocca di Melk, ingresso della Wachau' },
      { day: 5, from: 'Melk', to: 'Krems', km: 40, note: 'la Wachau UNESCO: vigneti terrazzati, Dürnstein e il castello di Riccardo Cuor di Leone' },
      { day: 6, from: 'Krems', to: 'Vienna', km: 80, note: 'tratto lungo, alternativa: treno fino a Tulln e bici da lì (45 km)' },
    ],
  },
  {
    id: 'via-claudia-augusta', emoji: '🚲', name: 'Via Claudia Augusta (Val Venosta-Verona)', country: 'Italia',
    start: 'Malles Venosta', end: 'Verona', lat: 46.68, lon: 10.54, difficulty: 'facile, in prevalenza discesa dolce', surface: 'pista ciclabile dedicata, asfaltata',
    stages: [
      { day: 1, from: 'Malles Venosta', to: 'Merano', km: 60, note: 'melo in fiore a primavera, leggera discesa lungo l\'Adige' },
      { day: 2, from: 'Merano', to: 'Bolzano', km: 32, note: 'vigneti e castelli della Bassa Atesina' },
      { day: 3, from: 'Bolzano', to: 'Trento', km: 60, note: 'la Val d\'Adige, ciclabile pianeggiante lungo il fiume' },
      { day: 4, from: 'Trento', to: 'Verona', km: 90, note: 'tratto lungo tra le Dolomiti che scompaiono e la pianura veronese: possibile spezzare a Rovereto' },
    ],
  },
  {
    id: 'reno-basel-colonia', emoji: '🚲', name: 'Il Reno in bici (Basilea-Colonia)', country: 'Germania',
    start: 'Basilea', end: 'Colonia', lat: 47.56, lon: 7.59, difficulty: 'facile, pianeggiante', surface: 'pista ciclabile dedicata (EuroVelo 15)',
    stages: [
      { day: 1, from: 'Basilea', to: 'Strasburgo', km: 80, note: 'confine franco-tedesco, tratto lungo: si può spezzare a Neuf-Brisach' },
      { day: 2, from: 'Strasburgo', to: 'Karlsruhe', km: 75, note: 'foreste renane e canali' },
      { day: 3, from: 'Karlsruhe', to: 'Magonza', km: 90, note: 'tratto lungo: alternativa treno fino a Spira poi bici' },
      { day: 4, from: 'Magonza', to: 'Coblenza', km: 60, note: 'la valle del Reno Medio UNESCO: castelli su ogni sperone di roccia, la Loreley' },
      { day: 5, from: 'Coblenza', to: 'Colonia', km: 95, note: 'ultimo tratto verso il Duomo di Colonia: possibile spezzare a Bonn' },
    ],
  },
  {
    id: 'gap-c-and-o', emoji: '🚲', name: 'Great Allegheny Passage + C&O Canal (Pittsburgh-Washington)', country: 'Stati Uniti',
    start: 'Pittsburgh', end: 'Washington D.C.', lat: 40.44, lon: -79.99, difficulty: 'facile, fondo sterrato compatto, mai trafficato', surface: 'ex sedime ferroviario e alzaia del canale, sterrato battuto',
    stages: [
      { day: 1, from: 'Pittsburgh', to: 'Ohiopyle', km: 90, note: 'lungo il fiume Youghiogheny tra le Laurel Highlands' },
      { day: 2, from: 'Ohiopyle', to: 'Cumberland', km: 80, note: 'il punto più alto del percorso (Eastern Continental Divide) poi discesa' },
      { day: 3, from: 'Cumberland', to: 'Hancock', km: 100, note: 'inizio del C&O Canal Towpath, alzaia lungo il Potomac' },
      { day: 4, from: 'Hancock', to: 'Harpers Ferry', km: 100, note: 'confluenza Potomac-Shenandoah, il paese storico di Harpers Ferry' },
      { day: 5, from: 'Harpers Ferry', to: 'Washington D.C.', km: 100, note: 'ultimo tratto fino al Georgetown, arrivo nella capitale' },
    ],
  },
  {
    id: 'shimanami-kaido', emoji: '🚲', name: 'Shimanami Kaido (Onomichi-Imabari)', country: 'Giappone',
    start: 'Onomichi', end: 'Imabari', lat: 34.41, lon: 133.2, difficulty: 'facile-media, alcuni ponti in salita dolce', surface: 'pista ciclabile dedicata con corsia blu segnata, ponti sospesi attrezzati per bici',
    stages: [
      { day: 1, from: 'Onomichi', to: 'Setoda (Ikuchijima)', km: 30, note: 'i primi due ponti sospesi sul Mare Interno di Seto, il tempio Kosanji' },
      { day: 2, from: 'Setoda', to: 'Imabari', km: 40, note: 'gli ultimi ponti (incluso l\'iconico Kurushima-Kaikyo, il ponte sospeso a tre campate più lungo del mondo), arrivo a Imabari' },
    ],
  },
];

const CICLOVIE_RULES: string[] = [
  'REGOLA CICLOVIA (vincolante): rispetta ESATTAMENTE le tappe indicate nel CONTESTO CICLOVIA, un giorno per tappa, senza aggiungerne o toglierne; nel campo "attivita" di ogni tappa racconta cosa si incontra pedalando quel tratto specifico (paesaggio, borghi, monumenti sul percorso) più UNA sosta gastronomica locale e UN punto di interesse fuori sella da vedere a piedi all\'arrivo.',
  'ALLOGGIO BIKE-FRIENDLY: per ogni tappa indica la TIPOLOGIA di alloggio adatta ai ciclisti nella località di arrivo (deposito bici sicuro, possibilità di lavaggio/piccola manutenzione, colazione anticipata per chi riparte presto) — mai il nome di una struttura specifica non certa: solo la tipologia e la zona.',
  'Nessun trasferimento in auto tra le tappe: si pedala lungo il percorso ufficiale. Se un tratto ha alternative (treno per accorciare, deviazione per il maltempo), dillo come opzione onesta, non come sostituto del percorso.',
];

function cycleContext(r: CycleRoute): string {
  const totKm = r.stages.reduce((s, st) => s + st.km, 0);
  const tappe = r.stages
    .map(s => `Giorno ${s.day}: ${s.from} → ${s.to}, ${s.km} km${s.note ? ` (${s.note})` : ''}`)
    .join('. ');
  return [
    `CONTESTO CICLOVIA: ${r.name} (${r.start} → ${r.end}, ${r.country}), ${r.stages.length} giorni, ~${totKm} km totali, fondo ${r.surface}, difficoltà ${r.difficulty}.`,
    `Tappe: ${tappe}.`,
  ].join('\n');
}

/** I descrittori delle ciclovie (slug 'cycle-<id>'), MULTI-TAPPA come i
 *  cammini: days = numero di tappe, maxKmPerDay dalla tappa più lunga. */
export function cycleDescriptors(): LibraryDescriptor[] {
  return CYCLE_ROUTES.map(r => {
    const maxKm = r.stages.reduce((m, s) => Math.max(m, s.km), 0);
    return {
      slug: `cycle-${r.id}`,
      kind: 'theme' as LibraryKind,
      title: `${r.emoji} ${r.name}`,
      city: r.start,
      country: r.country,
      coords: { lat: r.lat, lon: r.lon },
      days: r.stages.length,
      theme: 'ciclovie',
      angle: 'ciclovie',
      brief: [...CICLOVIE_RULES, cycleContext(r)].join('\n'),
      constraints: { maxKmPerDay: maxKm },
    };
  });
}

// ─────────────────────────────────────────────────────────────────────
// STRADE DEL VINO E DEL GUSTO — TASTE_ROUTES × 3 angoli
//
// Le stesse regole dei cammini: il percorso è dato, le tappe sono reali e
// il generatore non le tocca. Cambia il mezzo (auto, bici, treno) e cambia
// l'avvertenza: chi degusta non guida.
//
// Perché non un tema come "vino": i temi partono da una CITTÀ e chiedono
// al modello di costruire la giornata. Qui invece il percorso esiste già,
// con le sue tappe in ordine, ed è quello il valore — esattamente come per
// la Via Francigena. Un tema non può rispettare un tracciato.
// ─────────────────────────────────────────────────────────────────────

const TASTE_ANGLES: AngleDef[] = [
  {
    id: 'strada-classica',
    label: 'La strada completa',
    brief:
      'Variante COMPLETA: si percorre la strada tappa per tappa, nell\'ordine indicato, senza saltarne nessuna e senza aggiungerne. Per ogni tappa racconta cosa si assaggia lì e PERCHÉ proprio lì — il vitigno, il suolo, il gesto di lavorazione che cambia il prodotto — e alterna sempre un assaggio a una camminata o a una visita, perché nessuno arrivi a fine giornata saturo. Indica il tipo di produttore da cercare (cantina familiare, cooperativa, caseificio d\'alpeggio) e la zona, MAI nomi di aziende che non siano nel materiale reale fornito. Tono di chi conosce il mestiere e non fa lo snob: spiega senza gergo, e segnala sempre l\'alternativa onesta a poco prezzo.',
  },
  {
    id: 'strada-gratis',
    label: '🆓 Senza spendere',
    brief:
      'Variante SENZA SPENDERE: la strada si percorre lo stesso, ma tutto ciò che si paga esce dall\'itinerario. Privilegia i paesaggi e i punti panoramici sui vigneti, i sentieri fra i filari, i musei e le enoteche a ingresso libero, le cantine cooperative che non fanno pagare l\'assaggio d\'ingresso, i mercati, le sagre e le giornate di cantine aperte (indicane la stagione). Nella tabella_budget la voce "attrazioni" DEVE valere 0 € ogni giorno. Dichiara con onestà cosa resta fuori perché a pagamento, e come si potrebbe fare un\'eccezione sola.',
  },
  {
    id: 'strada-esperienze',
    label: '🎟 Con degustazioni prenotate',
    brief:
      'Variante CON DEGUSTAZIONI PRENOTATE: 2-3 tappe della giornata sono esperienze REALI prenotabili online (visita in cantina con degustazione, tour del caseificio, corso, escursione fra le vigne) scelte ESCLUSIVAMENTE dal materiale reale fornito nel prompt, ciascuna con l\'URL ESATTO copiato intatto nel campo "link_info". Le altre tappe collegano le esperienze in un percorso logico, con orari che tengano conto della durata dichiarata e del tempo per arrivare al punto d\'incontro. VIETATO inventare esperienze o URL.',
  },
];

export function tasteRouteDescriptors(): LibraryDescriptor[] {
  const out: LibraryDescriptor[] = [];
  for (const r of TASTE_ROUTES) {
    // La regola di sicurezza vale per tutto ciò che si beve, e va ripetuta
    // in ogni brief: è l'unica cosa di questo catalogo che, se ignorata,
    // fa male a qualcuno.
    const regolaGuida = r.kind === 'vino' || r.kind === 'birra' || r.kind === 'distillati'
      ? (r.transport === 'auto'
        ? 'REGOLA NON NEGOZIABILE: chi degusta NON guida. Questo percorso si fa in auto, quindi l\'itinerario DEVE dire esplicitamente come si risolve — autista designato, navetta, taxi, tour organizzato, o sputacchiera in cantina (si può assaggiare senza deglutire, e i produttori se lo aspettano). Se esiste un\'alternativa in treno o in bici, proponila come prima scelta.'
        : `Questo percorso si fa ${r.transport === 'bici' ? 'in bicicletta' : r.transport === 'treno' ? 'in treno' : r.transport === 'piedi' ? 'a piedi' : 'in barca'}, e questo È il motivo per cui funziona: si degusta senza il problema di guidare. Dillo esplicitamente.`)
      : '';
    for (const a of TASTE_ANGLES) {
      out.push({
        slug: `gusto-${r.id.replace(/^(wr|fr)-/, '')}-${a.id}`,
        // 'theme' e non un kind nuovo: la pipeline del server tratta tutti i
        // kind allo stesso modo, e aggiungerne uno avrebbe richiesto di
        // toccare anche la validazione lato server senza guadagnarci nulla.
        kind: 'theme',
        theme: 'strade-del-gusto',
        title: `${r.emoji} ${r.name} — ${a.label}`,
        city: r.stops[0]?.place || r.region,
        country: r.country,
        coords: r.coords,
        days: r.days,
        angle: a.id,
        brief: [a.brief, tasteRouteContext(r), regolaGuida].filter(Boolean).join('\n'),
        contextHints: {
          osmWinery: r.kind === 'vino',
          osmGusto: true,
          ...(a.id === 'strada-esperienze' ? { bookable: true } : {}),
        },
      });
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────
// LUOGHI SACRI — PERCORSI_SACRI × 4 angoli
//
// Perché una famiglia a sé e non un tema "religione" fra gli altri.
// Un pellegrinaggio ha tre cose che nessun altro itinerario ha:
//   • un ORDINE che non si può cambiare (i quattro luoghi del Buddha si
//     visitano nella sequenza della sua vita, non per comodità stradale);
//   • REGOLE DI ACCESSO che decidono se si entra o no, e che in alcuni casi
//     sono legge dello Stato (la Mecca) o consuetudine millenaria (Athos);
//   • un PUBBLICO DOPPIO: chi ci va per fede e chi ci va per l'arte, e ai
//     due va parlato in modo diverso senza che nessuno dei due si senta
//     ospite di riguardo o intruso.
//
// Gli angoli qui sotto nascono da quella doppiezza: "il pellegrinaggio" e
// "arte e storia" raccontano gli stessi luoghi a due persone diverse. La
// coppia gratis/prenotabile resta obbligatoria come ovunque — e nel caso
// religioso è quasi sempre facile, perché la stragrande maggioranza dei
// luoghi di culto non fa pagare l'ingresso.
// ─────────────────────────────────────────────────────────────────────

const SACRED_ANGLES: AngleDef[] = [
  {
    id: 'sacro-pellegrinaggio',
    label: '🙏 Il pellegrinaggio',
    brief:
      'Variante PELLEGRINAGGIO: il percorso si fa nel suo ordine e per il suo significato. Per ogni tappa spiega COSA È SUCCESSO lì secondo la tradizione, cosa fanno concretamente i fedeli quando arrivano (il gesto, la preghiera, il giro attorno, l\'offerta) e come ci si comporta stando accanto a loro senza disturbare. Metti gli orari delle celebrazioni quando li conosci con certezza, e i momenti della giornata in cui il luogo è raccolto invece che pieno — l\'alba e la sera tardi quasi sempre. Tono rispettoso ma non devoto: si racconta una fede, non la si predica, e chi legge può crederci o no. VIETATO il tono da brochure spirituale e le frasi sull\'"energia del luogo".',
  },
  {
    id: 'sacro-arte',
    label: '🎨 Arte e storia',
    brief:
      'Variante ARTE E STORIA: gli stessi luoghi letti da chi non condivide la fede ma vuole capire. Racconta chi ha costruito e con quali soldi, quale stile e perché proprio quello, cosa guardare con gli occhi (un mosaico, una cupola, un capitello, una scritta sul muro) e cosa quel dettaglio significava per chi lo commissionò. Spiega le stratificazioni quando ci sono — una moschea che era chiesa, una chiesa che era tempio — senza farne una polemica: sono i fatti dell\'edificio. Tono colto e concreto, con la sincerità di dire cosa è originale e cosa è ricostruito.',
  },
  FREE_ANGLE,
  BOOKABLE_ANGLE,
];

/**
 * La regola che vale su OGNI itinerario religioso e che nessun angolo può
 * annullare. Sta qui e non nel catalogo perché il catalogo dice le regole del
 * SINGOLO luogo, questa dice come ci si comporta ovunque.
 */
const REGOLA_LUOGHI_DI_CULTO =
  'RISPETTO (non negoziabile, vale per ogni tappa): sono luoghi di culto VIVI, non attrazioni. ' +
  'L\'itinerario DEVE dire, per ogni luogo dove serve: come ci si veste (spalle e ginocchia coperte è la regola più diffusa e quella che ferma più gente all\'ingresso), se si tolgono le scarpe, se il capo va coperto e per chi, se si può fotografare e dove no. ' +
  'Se un luogo È VIETATO a chi non professa quella fede, o a un genere, o richiede un permesso da ottenere in anticipo, DEVI dirlo come prima cosa della tappa e non in una nota a fondo pagina: mandare qualcuno dove non può entrare è il modo peggiore di sbagliare un itinerario. ' +
  'Durante le funzioni la visita turistica si sospende: indica gli orari da evitare. Non si fotografa chi prega. ' +
  'VIETATO trattare i fedeli come parte del panorama.';

export function sacredRouteDescriptors(): LibraryDescriptor[] {
  const out: LibraryDescriptor[] = [];
  for (const r of PERCORSI_SACRI) {
    for (const a of SACRED_ANGLES) {
      out.push({
        slug: `sacro-${r.id.replace(/^sr-/, '')}-${a.id}`,
        // 'theme' come le strade del gusto: la pipeline del server tratta
        // tutti i kind allo stesso modo e aggiungerne uno costringerebbe a
        // toccare la validazione lato server senza guadagnarci nulla.
        kind: 'theme',
        theme: 'luoghi-sacri',
        title: `${r.emoji} ${r.name} — ${a.label}`,
        city: r.stops[0]?.place || r.region,
        country: r.country,
        coords: r.coords,
        days: r.days,
        angle: a.id,
        brief: [a.brief, percorsoSacroContext(r), REGOLA_LUOGHI_DI_CULTO].join('\n'),
        contextHints: {
          ...(a.id === BOOKABLE_ANGLE.id ? { bookable: true } : {}),
        },
      });
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────
// FIERE E FESTIVAL DEL GUSTO — FOOD_FESTIVALS × 2 angoli
//
// Una fiera non è una tappa fra le altre: è il motivo per cui si è lì
// quella settimana, e riscrive la giornata attorno a sé. Ma è anche la cosa
// più facile da sbagliare, perché le date cambiano ogni anno: per questo
// ogni brief ripete che si scrive la FINESTRA e si manda a verificare.
// ─────────────────────────────────────────────────────────────────────

const FESTIVAL_ANGLES: AngleDef[] = [
  {
    id: 'fiera-giornata',
    label: 'La giornata della fiera',
    brief:
      'Variante GIORNATA DELLA FIERA: la manifestazione è il centro della giornata e tutto il resto le gira attorno. Dì a che ora conviene arrivare e perché, cosa vedere PRIMA che i banchi si riempiano, come si mangia quando c\'è la coda ovunque, e dove rifugiarsi nelle ore di punta. Spiega come funziona concretamente — biglietti, gettoni, prenotazioni, code — perché è lì che si perde il tempo. Chiudi con la parte di città o di territorio che si visita quando la fiera chiude. Tono di chi ci è già stato e sa dove si sbaglia.',
  },
  {
    id: 'fiera-weekend',
    label: 'Il weekend attorno alla fiera',
    brief:
      'Variante WEEKEND: due giorni in cui la fiera è mezza giornata e il resto è il territorio che quella fiera racconta — i produttori, il paesaggio, i borghi, il museo che spiega da dove viene quel prodotto. Se il prodotto della fiera ha una stagione (raccolta, molitura, vendemmia), portala dentro l\'itinerario: è quello che nessuna guida generica fa. Alterna sempre il pieno della folla al vuoto della campagna. Tono di chi consiglia a un amico come sfruttare il viaggio invece di sprecarlo in coda.',
  },
];

export function festivalDescriptors(): LibraryDescriptor[] {
  const out: LibraryDescriptor[] = [];
  for (const f of FOOD_FESTIVALS) {
    // Le voci "tutto l'anno" (la cerimonia del caffè etiope, Jemaa el-Fna)
    // non sono fiere con una data: restano nel catalogo per la mappa e per
    // il contesto, ma non generano un itinerario "vai alla fiera".
    if (f.months.length >= 12) continue;
    for (const a of FESTIVAL_ANGLES) {
      out.push({
        slug: `fiera-${f.id.replace(/^ff-/, '')}-${a.id}`,
        kind: 'theme',
        theme: 'fiere-del-gusto',
        title: `${f.emoji} ${f.name} — ${a.label}`,
        city: f.city,
        country: f.country,
        coords: f.coords,
        days: a.id === 'fiera-weekend' ? 2 : 1,
        angle: a.id,
        brief: [a.brief, festivalContext(f)].join('\n'),
        contextHints: { osmGusto: true, osmWinery: f.kind === 'vino' || f.kind === 'raccolto' },
      });
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────
// ZONE DEL GUSTO — TASTE_ZONES × durate × 4 angoli
//
// Perché una terza famiglia enogastronomica, oltre alle strade e alle fiere.
//
// Le strade del vino (wineRoutesCatalog) sono un catalogo curato: percorsi
// con un tracciato che esiste già, e il valore sta nel rispettarlo. Le fiere
// sono un appuntamento: valgono nella settimana giusta. Restano fuori le
// ZONE — un territorio dove il gusto è denso ma non c'è nessun percorso
// ufficiale da seguire, e dove si va semplicemente a mangiare e bere bene
// per due o tre giorni.
//
// Sono anche le zone che il catalogo scritto a mano non poteva contenere:
// 98 delle 130 strade sono di vino e 87 stanno in Europa, perché quelle sono
// le rotte di cui si scrive. Contando i 199.000 produttori importati da
// OpenStreetMap emergono invece Taipei, Buenos Aires, Katmandu, Bangalore,
// Oakland, la Moravia meridionale — dove i produttori ci sono davvero e
// nessuna guida italiana li racconta.
//
// Ogni zona esce in 2 e 3 giorni × 4 angoli, ABBINABILI tra loro; la coppia
// gratis/prenotabile è obbligatoria come su porti e zone (regola fissa del
// committente).
// ─────────────────────────────────────────────────────────────────────

const TASTE_ZONE_ANGLES: AngleDef[] = [
  {
    id: 'gusto-territorio',
    label: 'Il territorio a tavola',
    brief:
      'Variante TERRITORIO A TAVOLA: due o tre giorni costruiti sul rapporto fra quello che si mangia e il posto in cui si mangia. Ogni giornata deve rispondere a una domanda concreta — perché proprio QUI nasce questo prodotto: il suolo, l\'altitudine, il clima, il gesto di lavorazione, la storia di chi ci è arrivato prima. Alterna sempre un assaggio a una camminata, a un mercato o a una visita, perché nessuno arrivi a metà pomeriggio saturo. Indica il TIPO di posto da cercare (cooperativa, azienda familiare, bottega storica, mercato coperto) e la zona esatta; i nomi propri usali SOLO se stanno nel materiale reale fornito. Segnala il piatto o il prodotto da non perdere e la trappola per turisti da evitare. Tono di chi conosce il mestiere e non fa lo snob: spiega senza gergo e dà sempre l\'alternativa onesta a poco prezzo.',
  },
  {
    id: 'gusto-produttori',
    label: 'Si visita dove nasce',
    brief:
      'Variante DOVE NASCE: la giornata gira attorno ai luoghi di PRODUZIONE — cantine, caseifici, frantoi, birrifici, distillerie, apicolture, torrefazioni — scelti ESCLUSIVAMENTE fra quelli del materiale reale fornito nel prompt, con nome e coordinate copiati esatti. Per ognuno racconta cosa si vede davvero entrando (la vasca, la caldaia, la sala di stagionatura, l\'alambicco) e A CHE ORA ha senso andarci: il caseificio lavora all\'alba, il frantoio da ottobre, la cantina in vendemmia è nel caos. Ripeti sempre che la visita va PRENOTATA, perché quasi nessuno di questi posti è un museo con orari. Se il materiale non basta a riempire la giornata, NON inventare produttori: racconta il territorio, le denominazioni e i mercati, e dillo apertamente.',
  },
  FREE_ANGLE,
  BOOKABLE_ANGLE,
];

const TASTE_ZONE_DAYS = [2, 3] as const;

/** Le regole che non si negoziano su un itinerario che si beve. */
function tasteZoneRules(z: TasteZone): string {
  const guida = z.a
    ? 'REGOLA NON NEGOZIABILE: chi degusta NON guida. Questa zona si gira in auto fra i poderi, quindi l\'itinerario DEVE dire esplicitamente come si risolve — autista designato, navetta, taxi, tour organizzato, o sputacchiera in cantina (si assaggia senza deglutire, e i produttori se lo aspettano). Se esiste un\'alternativa in treno o in bici, proponila come prima scelta.'
    : 'Se nella giornata ci sono degustazioni alcoliche, dì come ci si sposta dopo: mezzi pubblici, a piedi o taxi. Mai dare per scontato che si guidi.';
  const scala = z.u
    ? 'Questa è una zona URBANA: le distanze si fanno a piedi o coi mezzi, i produttori sono botteghe e laboratori dentro la città, e il mercato coperto è quasi sempre il punto di partenza giusto della prima mattina.'
    : 'Questa è una zona di CAMPAGNA: si guida fra paesi e poderi, le distanze contano e i produttori chiudono presto. Costruisci ogni giornata attorno a una base (un paese dove si dorme e si cena) e a un anello che ci ritorna, mai a un percorso che finisce a 80 km dal letto.';
  return `${scala}\n${guida}`;
}

export function tasteZoneDescriptors(): LibraryDescriptor[] {
  const out: LibraryDescriptor[] = [];
  const taken = new Set<string>();
  for (const z of TASTE_ZONES) {
    const key = slugify(z.c);
    if (!key || taken.has(key)) continue;
    taken.add(key);
    // Il tier 3 esce solo da 2 giorni: sono zone vere ma meno dense, e tre
    // giorni si reggerebbero solo allungando il brodo.
    const durate = z.t === 3 ? [2] : TASTE_ZONE_DAYS;
    for (const d of durate) {
      for (const a of TASTE_ZONE_ANGLES) {
        const altri = TASTE_ZONE_ANGLES.filter(x => x.id !== a.id).map(x => x.label).join(', ');
        const brief = [
          a.brief,
          `CONTESTO ZONA DEL GUSTO: ${z.c}, ${z.k}. Qui il nostro database conta ${z.n} luoghi del gusto mappati, soprattutto ${z.p}: è questo che rende la zona un itinerario e non una tappa.`,
          tasteZoneRules(z),
          `Durata: ${d} giorni. ${
            d === 2
              ? 'Due giorni: il primo dà il quadro del territorio e del suo prodotto simbolo, il secondo scende in profondità su una sola valle, un solo quartiere o una sola lavorazione. Niente tappe-riempitivo.'
              : 'Tre giorni: una sottozona al giorno, e almeno un pasto lento senza programma. Il terzo giorno è quello in cui si torna dove si è mangiato meglio, non quello in cui si aggiunge la decima cantina.'
          }`,
          `COMBINABILITÀ (vincolante): di ${z.c} esistono in biblioteca anche i tagli ${altri}, da 2 e da 3 giorni. Questo itinerario deve reggersi da solo MA essere sommabile agli altri senza doppioni: chi lo abbina non deve rivedere gli stessi produttori né rimangiare gli stessi piatti.`,
          'ONESTÀ SUI PREZZI: dì sempre quanto costa davvero una degustazione in questa zona e cosa comprende, perché è la voce che fa saltare il budget di chi non se lo aspetta.',
          // Senza questa riga i due tagli nuovi riempivano la giornata di
          // produttori e ignoravano l'elenco prenotabile: la prima prova
          // (Verona, 20/08/2026) e' stata bocciata tre volte di fila dalla
          // verifica "manca il link a un'esperienza prenotabile", che vale
          // per OGNI itinerario della biblioteca.
          'ESPERIENZA PRENOTABILE (obbligatoria): se nel materiale c\'è un elenco di esperienze prenotabili, DEVI usarne almeno una. Se una tappa della giornata le corrisponde, metti l\'URL ESATTO e INTATTO nel suo "link_info"; altrimenti aggiungi in info_viaggio.suggerimenti la voce "🎟 Esperienza consigliata: <nome> — <URL>". L\'URL contiene il codice partner: copiarlo, mai modificarlo, mai inventarne altri.',
        ].join('\n');
        out.push({
          slug: `gustozona-${key}-${d}g-${a.id}`,
          // 'theme' come le strade del gusto: la pipeline del server tratta
          // tutti i kind allo stesso modo e aggiungerne uno costringerebbe a
          // toccare la validazione lato server senza guadagnarci nulla.
          kind: 'theme',
          theme: 'zone-del-gusto',
          title: `${z.u ? '🍽' : '🍇'} ${z.c} del gusto in ${d} giorni — ${a.label}`,
          city: z.c,
          country: z.k,
          coords: { lat: z.lat, lon: z.lon },
          days: d,
          angle: a.id,
          brief,
          contextHints: {
            osmGusto: true,
            // Il vino si chiede solo dove c'è: nelle zone del tè o del
            // cioccolato riempirebbe il prompt di cantine assenti.
            osmWinery: /cantine|enoteche|vigneti|strade del vino/.test(z.p),
            ...(a.id === BOOKABLE_ANGLE.id ? { bookable: true } : {}),
          },
        });
      }
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────
// VERTICALI TEMATICI — THEMATIC_PLACES × 3 angoli (21/08/2026)
// I cataloghi (src/data/tematici/*.json) nascono da una ricerca redazionale
// mondiale sulle fonti specializzate di ogni paese; qui diventano itinerari.
// Come per il gusto: kind 'theme' (nessun kind nuovo da validare sul server)
// e theme 'tematici-<key>', così la Biblioteca può filtrarli in blocco.
// ─────────────────────────────────────────────────────────────────────

/** Il "carattere" di ogni verticale: come si racconta e cosa NON si fa. */
const TEMA_DEF: Record<ThematicKey, {
  emoji: string; label: string; giorni: number;
  /** Istruzione specifica del tema, comune a tutti gli angoli. */
  brief: string;
  /** Tipi da chiedere al database (vuoto = tutti quelli della categoria). */
  types?: string[];
}> = {
  terme: {
    emoji: '🛁', label: 'Terme e sorgenti', giorni: 2,
    brief: 'Tema TERME E ACQUE: costruisci la giornata attorno al bagno, non attorno ai monumenti — il bagno è l\'evento, il resto lo prepara o lo prolunga. Indica SEMPRE, per ogni acqua, se è libera o a pagamento, la temperatura reale se la conosci, cosa serve portare (ciabatte, accappatoio, telo, scarpe da scoglio) e come ci si arriva davvero (sterrato, sentiero, parcheggio lontano). Alterna acqua calda e cammino: dopo un bagno lungo nessuno visita un museo. REGOLE DI SICUREZZA NON NEGOZIABILI, da scrivere esplicitamente: mai da soli in pozze isolate al buio; niente alcol prima del bagno caldo; massimo 15-20 minuti consecutivi in acqua sopra i 38 °C; sconsigliato in gravidanza e con problemi cardiaci senza parere medico; nelle sorgenti libere l\'acqua non è controllata e non si beve; mai tuffi dove il fondale non si vede. Nelle sorgenti naturali ricorda di non lasciare rifiuti e di non usare sapone o shampoo.',
  },
  cinema: {
    emoji: '🎬', label: 'Location di film e serie', giorni: 1,
    brief: 'Tema CINEMA: ogni tappa è un luogo REALE dove è stata girata una scena, e va raccontata come tale — che film o serie, che anno, che scena, che inquadratura si riconosce stando in quel punto preciso. Dì dove mettersi per ritrovare l\'inquadratura del film e cosa è cambiato dal set a oggi. VIETATO inventare titoli, anni o scene: usa SOLO le opere elencate nel materiale reale fornito. Se un luogo è privato o visibile solo da fuori, dillo prima che qualcuno ci vada. Alterna le location a ciò che quel quartiere offre davvero (un caffè, un mercato, una piazza), altrimenti diventa una caccia al tesoro senza respiro.',
  },
  cieli: {
    emoji: '🌌', label: 'Cieli bui e stelle', giorni: 1,
    brief: 'Tema CIELO NOTTURNO: l\'itinerario è costruito sull\'ORARIO — il giorno serve ad arrivare, riposare e scegliere il punto, la notte è l\'evento. Indica l\'ora del tramonto e quella in cui il cielo diventa davvero buio (circa 1 ora e mezza dopo), e organizza la sera attorno a quella finestra. Per ogni punto di osservazione: come ci si arriva al buio, se la strada è asfaltata, dove si parcheggia, se c\'è un riparo dal vento. Ricorda SEMPRE cosa portare: strato caldo in più (di notte la temperatura crolla anche d\'estate), torcia a luce ROSSA per non bruciare l\'adattamento al buio, coperta o sdraio, batterie cariche. Spiega che la LUNA PIENA cancella le stelle deboli: la settimana della luna nuova è quella giusta. Racconta cosa si vede in quel periodo dell\'anno (costellazioni stagionali, Via Lattea da giugno a settembre nell\'emisfero nord, eventuali sciami meteorici). Se il posto è isolato: mai da soli, avvisa qualcuno, copertura telefonica incerta.',
  },
  street_art: {
    emoji: '🎨', label: 'Street art', giorni: 1,
    brief: 'Tema ARTE URBANA: è un itinerario a piedi, di quartiere, e va costruito come una passeggiata continua — muro dopo muro, con le distanze reali fra un\'opera e l\'altra. Per ogni opera: chi l\'ha dipinta, quando, e cosa racconta di quel quartiere (una lotta, una fabbrica chiusa, un santo di casa, un festival). Usa SOLO gli artisti e le opere del materiale reale fornito: mai attribuzioni inventate. Avverti che i muri cambiano: qualche pezzo potrebbe essere già stato coperto, ed è parte del gioco. Intreccia sempre l\'arte con la vita del quartiere — il bar dove si fa colazione, il mercato, il negozio storico — perché la street art senza il suo quartiere è una galleria all\'aperto senza sale. Rispetto: non si entra in proprietà private per una foto e non si disturbano i residenti.',
  },
  mercati: {
    emoji: '🛍️', label: 'Mercati e mercatini', giorni: 1,
    brief: 'Tema MERCATI: l\'itinerario vive di ORARI e di GIORNI — un mercato sbagliato di giorno è una piazza vuota. Indica SEMPRE il giorno della settimana e le ore in cui il mercato è vivo, e costruisci la giornata attorno a quella finestra (i mercati dell\'usato la mattina presto, i mercatini di Natale al tramonto quando accendono le luci). Racconta cosa si compra DAVVERO lì e a che prezzo indicativo, come si contratta se è d\'uso, e cosa non vale la pena. Ricorda il contante, le borse riutilizzabili e l\'attenzione ai borseggi nella calca. Alterna il mercato a una sosta seduta: girare fra i banchi stanca più di un museo.',
  },
  fioriture: {
    emoji: '🌸', label: 'Fioriture', giorni: 1,
    brief: 'Tema FIORITURE: è l\'itinerario più fragile di tutti, perché dipende dalla stagione e dal meteo dell\'annata. Dichiara SUBITO la finestra giusta (settimane, non mesi) e avverti che può spostarsi di 10-15 giorni secondo l\'inverno appena passato: suggerisci di verificare lo stato della fioritura prima di partire (sito del parco, social del comune, webcam). Costruisci la giornata sulla LUCE: prima mattina e ultima ora sono le uniche in cui i campi si vedono bene e non c\'è folla. Per ogni luogo: dove ci si mette per vedere l\'insieme, dove si parcheggia, se si cammina su sterrato. REGOLA DI RISPETTO da scrivere sempre: non si entra nei campi coltivati (la lavanda, il grano e i girasoli sono un raccolto, non uno sfondo), non si colgono fiori, si resta sui sentieri e sui bordi. Aggiungi cosa fare nella stessa zona se la fioritura fosse già finita.',
  },
  memoria: {
    emoji: '🕯️', label: 'Memoria e case-museo', giorni: 1,
    brief: 'Tema MEMORIA: si visitano luoghi dove qualcuno ha vissuto, lavorato o è sepolto, e il tono deve essere all\'altezza — mai macabro, mai lacrimoso, mai "instagrammabile". Racconta la PERSONA, non la tomba: cosa ha fatto, perché la ricordiamo, cosa di lei si capisce stando in quel luogo. Per i cimiteri monumentali indica gli orari (chiudono presto), il percorso fra le sepolture che vale davvero e le regole di comportamento: voce bassa, niente foto ai funerali in corso, si resta sui vialetti. Per le case-museo: cosa è originale e cosa è ricostruito, e l\'oggetto che merita il viaggio. Per i luoghi di memoria delle stragi e delle guerre: rispetto assoluto, nessun dettaglio compiaciuto sulla violenza, e spazio a chi ha resistito. Alterna sempre un luogo di memoria a un momento di vita normale nella stessa zona.',
  },
  lento: {
    emoji: '🚂', label: 'Viaggio lento', giorni: 2,
    brief: 'Tema VIAGGIO LENTO: il mezzo È la destinazione — un treno panoramico, una funicolare, un traghetto, una ciclovia. Dai le informazioni pratiche VERE: dove si prende, quanto dura, se il biglietto va prenotato con anticipo (su molte linee panoramiche i posti finiscono settimane prima), quale lato del vagone o della barca ha la vista migliore, se ci sono fermate dove si può scendere e riprendere il mezzo dopo. Costruisci la giornata attorno all\'orario di partenza, con il tempo per arrivare in stazione o al molo. Racconta cosa scorre dal finestrino nell\'ordine in cui appare, così chi viaggia sa quando alzare gli occhi. Indica sempre l\'alternativa se il servizio è stagionale o sospeso, e cosa si vede alle due estremità del percorso.',
  },
};

/** ISO2 → nome del paese in italiano (il resto del catalogo usa i nomi). */
const ISO2_NOMI: Record<string, string> = {
  IT: 'Italia', FR: 'Francia', ES: 'Spagna', PT: 'Portogallo', DE: 'Germania', AT: 'Austria', CH: 'Svizzera',
  BE: 'Belgio', NL: 'Paesi Bassi', LU: 'Lussemburgo', GB: 'Regno Unito', IE: 'Irlanda', IS: 'Islanda',
  NO: 'Norvegia', SE: 'Svezia', FI: 'Finlandia', DK: 'Danimarca', EE: 'Estonia', LV: 'Lettonia', LT: 'Lituania',
  PL: 'Polonia', CZ: 'Repubblica Ceca', SK: 'Slovacchia', HU: 'Ungheria', SI: 'Slovenia', HR: 'Croazia',
  BA: 'Bosnia ed Erzegovina', RS: 'Serbia', ME: 'Montenegro', MK: 'Macedonia del Nord', AL: 'Albania',
  GR: 'Grecia', RO: 'Romania', BG: 'Bulgaria', UA: 'Ucraina', MD: 'Moldavia', TR: 'Turchia', CY: 'Cipro',
  MT: 'Malta', RU: 'Russia', GE: 'Georgia', AM: 'Armenia', AZ: 'Azerbaigian', IR: 'Iran', IL: 'Israele',
  JO: 'Giordania', SA: 'Arabia Saudita', AE: 'Emirati Arabi Uniti', OM: 'Oman', LB: 'Libano', PS: 'Palestina',
  MA: 'Marocco', TN: 'Tunisia', DZ: 'Algeria', EG: 'Egitto', SN: 'Senegal', KE: 'Kenya', ET: 'Etiopia',
  TZ: 'Tanzania', UG: 'Uganda', RW: 'Ruanda', ZA: 'Sudafrica', NA: 'Namibia', ZM: 'Zambia', MG: 'Madagascar',
  CV: 'Capo Verde', JP: 'Giappone', KR: 'Corea del Sud', CN: 'Cina', TW: 'Taiwan', HK: 'Hong Kong',
  MN: 'Mongolia', IN: 'India', NP: 'Nepal', BT: 'Bhutan', LK: 'Sri Lanka', TH: 'Thailandia', MY: 'Malesia',
  SG: 'Singapore', ID: 'Indonesia', PH: 'Filippine', VN: 'Vietnam', LA: 'Laos', KH: 'Cambogia', MM: 'Myanmar',
  NZ: 'Nuova Zelanda', AU: 'Australia', FJ: 'Figi', PG: 'Papua Nuova Guinea', NU: 'Niue',
  US: 'Stati Uniti', CA: 'Canada', MX: 'Messico', CU: 'Cuba', PR: 'Porto Rico', DO: 'Repubblica Dominicana',
  GT: 'Guatemala', CR: 'Costa Rica', PA: 'Panama', HN: 'Honduras', NI: 'Nicaragua', SV: 'El Salvador',
  DM: 'Dominica', GP: 'Guadalupa', BS: 'Bahamas', VC: 'Saint Vincent e Grenadine',
  AR: 'Argentina', BR: 'Brasile', CL: 'Cile', PE: 'Perù', BO: 'Bolivia', EC: 'Ecuador', CO: 'Colombia',
  VE: 'Venezuela', UY: 'Uruguay', PY: 'Paraguay',
};

/** Nomi dei mesi per i temi stagionali (fioriture, mercatini). */
const MESI_IT = ['', 'gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
  'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

/** Il contesto del luogo: cosa c'è davvero lì, quanti luoghi, e quando. */
function thematicContext(p: ThematicPlaceSummary): string {
  const def = TEMA_DEF[p.key];
  const righe = [
    `LUOGO: ${p.city} (${ISO2_NOMI[p.country] || p.country}).`,
    `Nel nostro database ci sono ${p.n} luoghi di questo tema in zona${p.top.length ? `, fra cui: ${p.top.join(', ')}` : ''}.`,
    'Il MATERIALE REALE fornito più avanti nel prompt contiene i luoghi con le loro coordinate: usa SOLO quelli, con i loro nomi esatti, e non aggiungerne di inventati.',
  ];
  if (p.months.length && p.months.length < 12) {
    const elenco = p.months.map((m) => MESI_IT[m]).filter(Boolean).join(', ');
    righe.push(`STAGIONE: questo tema qui vale nei mesi di ${elenco}. Scrivilo all'inizio dell'itinerario: fuori stagione il viaggio non ha senso, e va detto onestamente.`);
  }
  righe.push(def.brief);
  return righe.join('\n');
}

/** Un descrittore per (luogo × angolo): il taglio del tema + la coppia
 *  gratis/prenotabile obbligatoria per ogni destinazione. */
export function thematicDescriptors(): LibraryDescriptor[] {
  const out: LibraryDescriptor[] = [];
  for (const p of THEMATIC_PLACES) {
    const def = TEMA_DEF[p.key];
    if (!def) continue;
    const contesto = thematicContext(p);
    const angoli: AngleDef[] = [
      { id: 'tema', label: def.label, brief: `Variante IMMERSIVA: la giornata ruota attorno al tema, senza diluirlo in un giro turistico generico. Almeno metà delle tappe sono luoghi del tema; le altre servono a mangiare, riposare e collegare.` },
      FREE_ANGLE,
      BOOKABLE_ANGLE,
    ];
    for (const a of angoli) {
      out.push({
        slug: `tema-${p.key}-${slugify(p.country)}-${slugify(p.city)}-${a.id}`,
        kind: 'theme',
        theme: `tematici-${p.key}`,
        title: `${def.emoji} ${def.label} a ${p.city} — ${a.label}`,
        city: p.city,
        country: ISO2_NOMI[p.country] || p.country,
        coords: { lat: p.lat, lon: p.lon },
        days: def.giorni,
        angle: a.id,
        brief: [a.brief, contesto].join('\n'),
        contextHints: {
          wipTheme: { category: p.key, ...(def.types ? { types: def.types } : {}) },
          ...(p.key === 'cinema' ? { wikidataFilm: true } : {}),
          ...(p.key === 'street_art' ? { osmArtwork: true } : {}),
          ...(a.id === BOOKABLE_ANGLE.id ? { bookable: true } : {}),
        },
      });
    }
  }
  return out;
}

let _all: LibraryDescriptor[] | null = null;

/** Tutti i descrittori del catalogo (calcolati una volta, poi cache). */
export function getAllDescriptors(): LibraryDescriptor[] {
  if (!_all) {
    _all = [
      ...portDescriptors(),
      ...airportDescriptors(),
      ...pilgrimDescriptors(),
      ...tasteRouteDescriptors(),
      ...tasteZoneDescriptors(),
      ...sacredRouteDescriptors(),
      ...festivalDescriptors(),
      ...thematicDescriptors(),
      ...themeDescriptors(),
      ...filmDescriptors(),
      ...bookDescriptors(),
      ...cycleDescriptors(),
      ...mediaSeedDescriptors(MUSIC_SEED),
      ...mediaSeedDescriptors(ART_SEED),
      ...mediaSeedDescriptors(HISTORY_SEED),
      ...mediaSeedDescriptors(SCIENCE_SEED),
      ...mediaSeedDescriptors(SPORT_SEED),
      ...mediaSeedDescriptors(FASHION_SEED),
      ...zoneDescriptors(),
      ...worldZoneDescriptors(),
    ];
  }
  return _all;
}

/** Le 4 città-zona da seminare per prime. */
const PRIORITY_ZONE_CITIES = ['Napoli', 'Roma', 'Venezia', 'Firenze'];

/** Porti mondiali (non italiani) più trafficati, in ordine di semina. */
const PRIORITY_WORLD_PORTS = [
  'port-barcellona',
  'port-pireo',
  'port-santorini',
  'port-dubrovnik',
  'port-istanbul',
  'port-marsiglia',
  'port-palma',
  'port-lisbona',
  'port-valletta',
  'port-copenaghen',
  'port-miami',
  'port-cozumel',
  'port-nassau',
  'port-singapore',
  'port-dubai',
  'port-sydney',
];

/** I 20 titoli più famosi globalmente dei sei nuovi media "luoghi di",
 *  da seminare subito dopo i 30 film iconici (regola del committente:
 *  fama mondiale, non italianità). {prefix} è lo slugPrefix del media. */
const MEDIA_PRIORITY_TITLES: Array<{ prefix: string; title: string }> = [
  { prefix: 'music', title: 'Abbey Road e la Londra dei Beatles' },
  { prefix: 'music', title: 'Memphis: Graceland e Sun Studio' },
  { prefix: 'music', title: 'Vienna dei grandi compositori' },
  { prefix: 'music', title: 'Kingston di Bob Marley' },
  { prefix: 'art', title: 'Arles di Van Gogh' },
  { prefix: 'art', title: 'Firenze di Michelangelo' },
  { prefix: 'art', title: 'Città del Messico di Frida e Diego' },
  { prefix: 'art', title: 'Roma di Caravaggio' },
  { prefix: 'history', title: 'Battaglia di Waterloo' },
  { prefix: 'history', title: 'Caduta del Muro di Berlino' },
  { prefix: 'history', title: 'Bomba atomica su Hiroshima' },
  { prefix: 'history', title: 'Attacco a Pearl Harbor' },
  { prefix: 'science', title: 'Ginevra e Meyrin del CERN' },
  { prefix: 'science', title: 'Pisa di Galileo' },
  { prefix: 'science', title: 'Cape Canaveral e il volo spaziale' },
  { prefix: 'sport', title: 'Il Maracanã' },
  { prefix: 'sport', title: 'Wimbledon' },
  { prefix: 'sport', title: 'Wembley, la casa del calcio' },
  { prefix: 'fashion', title: 'Il Quadrilatero della moda' },
  { prefix: 'fashion', title: '31 rue Cambon di Chanel' },
];

/**
 * Lista ORDINATA per la semina degli itinerari pronti. L'ordine:
 *   1. Porti ITALIANI, sosta 8h (o la più lunga disponibile): prima
 *      "classica" e "gastronomica" — il pubblico più caldo dell'app —
 *      e SUBITO DOPO, per lo stesso porto, "gratis" ed "esperienze":
 *      la coppia gratuita/prenotabile chiesta dal committente arriva
 *      così tra i primissimi item seminati di ogni porto.
 *   1-bis. I ~30 film iconici del seed curato (FILM_PRIORITY_TITLES).
 *   1-ter. I 20 titoli più famosi globalmente dei sei nuovi media
 *      (MEDIA_PRIORITY_TITLES: musica, arte, storia, scienza, sport, moda).
 *   2. Zone Napoli/Roma/Venezia/Firenze, 1 e 2 giorni, TUTTI gli angoli
 *      (gratis ed esperienze inclusi: stanno in PORT_ZONE_ANGLES).
 *   2-ter. Le altre città di ZONE_CITIES: 2 giorni classica + gratis +
 *      esperienze.
 *   2-bis. Zone mondiali TIER 1 (WORLD_ZONES, le mete più visitate del
 *      pianeta): 2 giorni classica + gratis + esperienze, poi 3 giorni
 *      classica.
 *   2-quater. ENOGASTRONOMIA, nell'ordine strade → zone → fiere, e dentro
 *      ognuna prima Italia/Francia/Spagna e poi il resto del mondo. Prima
 *      che questo blocco esistesse la sezione del gusto stava tutta nel
 *      punto 5 e in biblioteca c'erano ZERO itinerari del gusto su 1.122.
 *   3. Porti mondiali top (PRIORITY_WORLD_PORTS), sosta più lunga,
 *      angoli "classica" e "gastronomica".
 *   4. Temi nelle città ITALIANE (in ordine di definizione dei temi), ognuno
 *      seguito dalla propria coppia gratis/esperienze.
 *   4-bis. Zone mondiali TIER 2 e 3: 2 giorni classica + gratis +
 *      esperienze, poi 3 giorni classica.
 *   5. Tutto il resto, nell'ordine di getAllDescriptors() — qui, dentro
 *      ai media harvest lato server, l'ordine voluto è film → storia →
 *      libri (l'arte non ha harvest Wikidata: P1071 "luogo di creazione"
 *      non è popolato a sufficienza, resta solo seed curato + on-demand
 *      catalogo chiuso; vedi libLoadAllHarvestedDescriptors in server.ts).
 * Nessun duplicato: ogni slug compare una volta sola.
 */
export function getPriorityDescriptors(): LibraryDescriptor[] {
  const all = getAllDescriptors();
  const bySlug = new Map(all.map(d => [d.slug, d]));
  const seen = new Set<string>();
  const out: LibraryDescriptor[] = [];
  const push = (slug: string) => {
    const d = bySlug.get(slug);
    if (d && !seen.has(slug)) {
      seen.add(slug);
      out.push(d);
    }
  };

  // 1) Porti italiani, sosta 8h (o massima): classica + gastronomica e
  //    subito dopo la coppia gratis + esperienze dello stesso porto
  for (const p of CRUISE_PORTS) {
    if (p.country !== 'Italia' || !p.coords || !p.options.length) continue;
    const hours =
      p.options.find(o => o.hours === 8)?.hours ??
      Math.max(...p.options.map(o => o.hours));
    for (const angle of ['classica', 'gastronomica', FREE_ANGLE.id, BOOKABLE_ANGLE.id]) {
      push(`${p.id}-${hours}h-${angle}`);
    }
  }

  // 1-bis) I ~30 film iconici del seed curato, subito dopo i porti italiani
  for (const t of FILM_PRIORITY_TITLES) push(`film-${slugify(t)}`);

  // 1-ter) I 20 titoli più famosi dei sei nuovi media (musica/arte/storia/
  //        scienza/sport/moda), subito dopo i film
  for (const m of MEDIA_PRIORITY_TITLES) push(`${m.prefix}-${slugify(m.title)}`);

  // 2) Zone Napoli/Roma/Venezia/Firenze 1-2 giorni, tutti gli angoli
  for (const city of PRIORITY_ZONE_CITIES) {
    for (const d of [1, 2]) {
      for (const a of PORT_ZONE_ANGLES) {
        push(`zone-${slugify(city)}-${d}g-${a.id}`);
      }
    }
  }

  // 2-ter) Le altre 26 città storiche di ZONE_CITIES (Parigi, Londra,
  //    Tokyo, Barcellona…): 2 giorni classica + la coppia obbligatoria
  //    gratis/esperienze. Senza questo blocco la loro versione gratuita e
  //    quella con biglietto finivano in fondo alla coda (posizione ~8900).
  for (const z of ZONE_CITIES) {
    const key = slugify(z.city);
    for (const combo of ['2g-classica', `2g-${FREE_ANGLE.id}`, `2g-${BOOKABLE_ANGLE.id}`]) {
      push(`zone-${key}-${combo}`);
    }
  }

  // 2-bis) Zone mondiali TIER 1 (le mete più visitate del pianeta): per
  //    ognuna prima il 2 giorni classico e la coppia commerciale
  //    gratis/esperienze, poi il 3 giorni classico. Il resto dei tagli
  //    arriva col blocco 5.
  for (const z of worldZonesByTier()) {
    if (z.t !== 1) continue;
    const key = slugify(z.c);
    for (const combo of [`2g-classica`, `2g-${FREE_ANGLE.id}`, `2g-${BOOKABLE_ANGLE.id}`, `3g-classica`]) {
      push(`zone-${key}-${combo}`);
    }
  }

  // 2-quater) ENOGASTRONOMIA. Prima di questo blocco la sezione del gusto
  //    non era in NESSUNA posizione prioritaria: strade, fiere e zone
  //    cadevano tutte nel blocco 5, dietro a ~14.000 descrittori, e il
  //    risultato misurato il 20/08/2026 era ZERO itinerari del gusto in
  //    biblioteca su 1.122 (le 130 strade curate incluse). Non era un
  //    problema di generazione: non ci arrivava mai il turno.
  //
  //    L'ordine qui dentro: prima le strade dei tre mercati dell'app, poi
  //    le zone dense di casa, poi il mondo. Ogni voce porta con sé la
  //    coppia gratis/prenotabile, come ovunque.
  const MERCATI_CASA = ['Italia', 'Francia', 'Spagna'];
  for (const casa of [true, false]) {
    for (const r of TASTE_ROUTES) {
      if (MERCATI_CASA.includes(r.country) !== casa) continue;
      const key = r.id.replace(/^(wr|fr)-/, '');
      for (const a of ['strada-classica', 'strada-gratis', 'strada-esperienze']) {
        push(`gusto-${key}-${a}`);
      }
    }
  }
  // 2-quinquies) LUOGHI SACRI. Stessa lezione del gusto, applicata prima di
  //    sbagliare invece che dopo: senza un blocco prioritario finirebbero nel
  //    punto 5 e non verrebbero seminati mai.
  //    L'ordine dentro: prima le famiglie con più percorsi a catalogo, e
  //    dentro ognuna prima il taglio "pellegrinaggio" (il motivo per cui la
  //    sezione esiste) e la coppia gratis/prenotabile, poi "arte e storia".
  //    La coppia commerciale qui è quasi sempre facile: i luoghi di culto
  //    raramente fanno pagare l'ingresso, quindi la variante gratis è vera
  //    senza forzature.
  for (const r of PERCORSI_SACRI) {
    const key = r.id.replace(/^sr-/, '');
    for (const a of ['sacro-pellegrinaggio', FREE_ANGLE.id, BOOKABLE_ANGLE.id, 'sacro-arte']) {
      push(`sacro-${key}-${a}`);
    }
  }

  // Le fiere prima delle zone, non dopo: sono solo 74 voci ma valgono
  // esclusivamente nella settimana in cui si tengono, e dietro alle zone
  // cadevano in posizione 3.470 — cioè settimane di semina, cioè stagioni
  // perse.
  for (const f of FOOD_FESTIVALS) {
    if (f.months.length >= 12) continue;
    const key = f.id.replace(/^ff-/, '');
    push(`fiera-${key}-fiera-giornata`);
    push(`fiera-${key}-fiera-weekend`);
  }
  for (const casa of [true, false]) {
    for (const tier of [1, 2, 3]) {
      for (const z of TASTE_ZONES) {
        if (z.t !== tier || MERCATI_CASA.includes(z.k) !== casa) continue;
        const key = slugify(z.c);
        // Le zone dense escono subito complete; quelle di terzo livello
        // portano solo il 2 giorni con la coppia obbligatoria, altrimenti
        // da sole occuperebbero giorni di semina prima che il resto del
        // catalogo veda un turno.
        const combos = z.t === 3
          ? ['2g-gusto-territorio', `2g-${FREE_ANGLE.id}`, `2g-${BOOKABLE_ANGLE.id}`]
          : ['2g-gusto-territorio', `2g-${FREE_ANGLE.id}`, `2g-${BOOKABLE_ANGLE.id}`,
             '2g-gusto-produttori', '3g-gusto-territorio'];
        for (const combo of combos) push(`gustozona-${key}-${combo}`);
      }
    }
  }

  // 2-quinquies) VERTICALI TEMATICI (21/08/2026). Stessa lezione delle
  //    strade del gusto: senza una posizione prioritaria non arriverebbe mai
  //    il loro turno. Ordine: prima i luoghi famosi (fame 5 e 4) di ogni
  //    tema, poi i temi STAGIONALI del mese corrente — un mercatino di
  //    Natale seminato a febbraio è una stagione persa — poi il resto.
  const meseCorrente = new Date().getMonth() + 1;
  const temiOrdinati: ThematicPlaceSummary[] = [...THEMATIC_PLACES].sort((a, b) => {
    const stagA = a.months.length && a.months.length < 12 ? (a.months.includes(meseCorrente) ? 0 : 2) : 1;
    const stagB = b.months.length && b.months.length < 12 ? (b.months.includes(meseCorrente) ? 0 : 2) : 1;
    if (stagA !== stagB) return stagA - stagB;
    if (b.fame !== a.fame) return b.fame - a.fame;
    return b.n - a.n;
  });
  for (const p of temiOrdinati) {
    if (p.fame < 4) continue; // il resto cade nel blocco generale
    const base = `tema-${p.key}-${slugify(p.country)}-${slugify(p.city)}`;
    for (const a of ['tema', FREE_ANGLE.id, BOOKABLE_ANGLE.id]) push(`${base}-${a}`);
  }

  // 3) Porti mondiali top, sosta più lunga, classica + gastronomica
  for (const id of PRIORITY_WORLD_PORTS) {
    const p = CRUISE_PORTS.find(x => x.id === id);
    if (!p || !p.coords || !p.options.length) continue;
    const hours = Math.max(...p.options.map(o => o.hours));
    for (const angle of ['classica', 'gastronomica']) {
      push(`${p.id}-${hours}h-${angle}`);
    }
  }

  // 4) Temi nelle città italiane, ognuno seguito dalla sua coppia
  //    gratis/esperienze (obbligatoria per ogni destinazione).
  for (const t of THEMES) {
    for (const pl of t.places) {
      if (pl.country !== 'Italia') continue;
      const base = `theme-${t.id}-${slugify(pl.city)}`;
      push(base);
      push(`${base}-${FREE_ANGLE.id}`);
      push(`${base}-${BOOKABLE_ANGLE.id}`);
    }
  }

  // 4-bis) Zone mondiali TIER 2 e 3: il 2 giorni classico con SUBITO dopo
  //    la coppia obbligatoria gratis + esperienze, poi il 3 giorni
  //    classico. Regola committente: nessuna destinazione deve restare
  //    senza la versione a costo zero e senza quella con un biglietto
  //    prenotabile, nemmeno per qualche giro di semina.
  for (const tier of [2, 3]) {
    for (const z of worldZonesByTier()) {
      if (z.t !== tier) continue;
      const key = slugify(z.c);
      for (const combo of ['2g-classica', `2g-${FREE_ANGLE.id}`, `2g-${BOOKABLE_ANGLE.id}`, '3g-classica']) {
        push(`zone-${key}-${combo}`);
      }
    }
  }

  // 5) Il resto, nell'ordine del catalogo
  for (const d of all) push(d.slug);

  return out;
}

export interface DescriptorSearchOptions {
  kind?: LibraryKind;
  theme?: string;
  city?: string;
  /** Solo descrittori orari con hours <= maxHours. */
  maxHours?: number;
  days?: number;
  /** Tetto sui risultati (default 60, massimo 300). Serve al chip "Tutti"
   *  di una categoria, che deve mostrare tutto quello che c'è e non i primi
   *  sessanta in ordine di catalogo. */
  limit?: number;
}

const SEARCH_MAX_RESULTS = 60;
const SEARCH_HARD_MAX = 300;

/** Ricerca client-side: filtro case-insensitive su title/city/country/
 *  theme/angle, con filtri strutturati opzionali. Max 60 risultati. */
export function searchDescriptors(
  query: string,
  opts: DescriptorSearchOptions = {},
): LibraryDescriptor[] {
  // Ricerca senza accenti: "Sao Paulo" trova "São Paulo" e viceversa.
  const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const terms = fold(query || '')
    .split(/\s+/)
    .filter(Boolean);
  const max = Math.min(SEARCH_HARD_MAX, Math.max(1, opts.limit || SEARCH_MAX_RESULTS));
  const out: LibraryDescriptor[] = [];
  for (const d of getAllDescriptors()) {
    if (opts.kind && d.kind !== opts.kind) continue;
    if (opts.theme && (d.theme || '').toLowerCase() !== opts.theme.toLowerCase()) continue;
    if (opts.city && !d.city.toLowerCase().includes(opts.city.toLowerCase())) continue;
    if (opts.maxHours !== undefined && (d.hours === undefined || d.hours > opts.maxHours)) continue;
    if (opts.days !== undefined && d.days !== opts.days) continue;
    if (terms.length) {
      // Anche lo slug (con i trattini resi spazi): è l'unico campo che porta
      // sempre la forma "canonica" del nome, utile quando il titolo è
      // editoriale ("Skagen: i pittori della luce"). Eventuali campi
      // tradotti (title_en/titleEn) entrano se un giorno esisteranno.
      const extra = (d as any).title_en || (d as any).titleEn || '';
      const haystack = fold(`${d.title} ${d.city} ${d.country} ${d.theme || ''} ${d.angle} ${String(d.slug || '').replace(/[-_]+/g, ' ')} ${extra}`);
      if (!terms.every(t => haystack.includes(t))) continue;
    }
    out.push(d);
    if (out.length >= max) break;
  }
  return out;
}
