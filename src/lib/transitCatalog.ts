// =====================================================================
// WIP · Itinerari speciali curati (porti di crociera, scali in
// aeroporto, cammini e pellegrinaggi). Tutto client-side: il tap
// pre-compila il form del planner (destinazione/coords/giorni/richieste)
// e la generazione resta il normale flusso itinerario a pagamento.
// Regole redazionali: tempi REALISTICI e prudenti, vincolo di rientro
// esplicito e non negoziabile (nave: 1h prima della fine sosta; volo:
// 2h prima della partenza), mai promettere gite impossibili (es. Roma
// da Civitavecchia con 6 ore di sosta).
// =====================================================================

/** Variante di visita per una data durata di sosta/scalo. */
export interface StopOption {
  /** Ore TOTALI di sosta a terra (porto) o di scalo (aeroporto). */
  hours: number;
  title: string;
  /** 3-6 tappe sintetiche in ordine. */
  outline: string[];
  /** Avvertenze redazionali (tempi, rischi, alternative). */
  notes: string;
  /** Solo aeroporti: l'opzione "resta in aeroporto/vicinanze". */
  stayNearAirport?: boolean;
}

export interface CruisePort {
  id: string;
  emoji: string;
  /** Nome del porto (es. "Porto di Civitavecchia"). */
  port: string;
  /** Città/area di riferimento per l'itinerario. */
  city: string;
  country: string;
  /** Assenti solo sulle voci AI se il geocoding server non era disponibile. */
  coords?: { lat: number; lon: number };
  /** Come si raggiunge il centro dal terminal, durata e costo indicativo. */
  transferNote: string;
  options: StopOption[];
  /** Voce generata dall'AI (/api/transit-guide), non dal seed curato. */
  aiGenerated?: boolean;
}

export interface AirportLayover {
  id: string;
  airport: string;
  /** Codice IATA. */
  code: string;
  city: string;
  country: string;
  /** Assenti solo sulle voci AI se il geocoding server non era disponibile. */
  coords?: { lat: number; lon: number };
  /** Ore minime di scalo per uscire sensatamente verso la città. */
  minLayoverForCity: number;
  /** Mezzo più rapido aeroporto↔centro con durata A/R e costo indicativo. */
  transferNote: string;
  /** Dove lasciare i bagagli (deposito), se noto. */
  luggageNote?: string;
  options: StopOption[];
  /** Voce generata dall'AI (/api/transit-guide), non dal seed curato. */
  aiGenerated?: boolean;
}

export interface PilgrimStage {
  day: number;
  from: string;
  to: string;
  km: number;
  /** Coordinate approssimate della località di ARRIVO della tappa
   *  (assenti solo sulle voci AI senza geocoding server). */
  lat?: number;
  lon?: number;
  note?: string;
  /** Profilo del terreno ('pianeggiante', 'collinare', '+800 m di salita'…). */
  terrain?: string;
  /** Alloggio tipico a fine tappa, con nota pratica (posti letto, timbro). */
  lodging?: string;
}

export type PilgrimDifficulty = 'facile' | 'media' | 'impegnativa';

export interface PilgrimRoute {
  id: string;
  emoji: string;
  name: string;
  start: string;
  end: string;
  country: string;
  /** Continente in italiano ('Europa', 'Asia', …) per i filtri della UI. */
  continent: string;
  difficulty: PilgrimDifficulty;
  /** Giorni della versione proposta (3-7). */
  days: number;
  /** Coordinate approssimate della località di PARTENZA. */
  coords?: { lat: number; lon: number };
  stages: PilgrimStage[];
  /** Credenziale/timbri, se il cammino la prevede. */
  credential?: string;
  /** Periodo migliore, difficoltà, bagaglio. */
  notes: string;
  /** Voce generata dall'AI (/api/transit-guide), non dal seed curato. */
  aiGenerated?: boolean;
}

// ─────────────────────────────────────────────────────────────────────
// Pre-fill per il form del planner
// ─────────────────────────────────────────────────────────────────────

/** Pre-compilazione a destinazione singola (porto/aeroporto, 1 giorno). */
export interface StopPrefill {
  destination: string;
  /** Assenti sulle voci AI non geocodificate: il planner geocodifica da sé. */
  coords?: { lat: number; lon: number };
  days: 1;
  interests: string[];
  specialRequests: string;
  /** Etichetta per il toast di conferma. */
  label: string;
}

/** Pre-compilazione roadtrip (cammino: tappe come legs con coordinate). */
export interface RoutePrefill {
  legs: Array<{ city: string; lat?: number; lon?: number }>;
  days: number;
  interests: string[];
  specialRequests: string;
  label: string;
}

/** Richieste speciali per un'escursione dalla nave: vincolo di rientro
 *  in termini di DURATA (mai orari assoluti), buffer 1h prima della
 *  fine sosta, sempre esplicito e non negoziabile per l'AI. */
export function buildPortPrefill(p: CruisePort, o: StopOption): StopPrefill {
  const rientro = Math.max(1, o.hours - 1);
  const specialRequests = [
    `Escursione a terra da nave da crociera — ${p.port} (${p.city}, ${p.country}). Sosta totale a terra: ${o.hours} ore dallo sbarco.`,
    `VINCOLO NON NEGOZIABILE: l'itinerario DEVE riportarmi al terminal crociere entro ${rientro} ore dall'inizio (buffer di rientro di almeno 1 ora prima della fine della sosta: la nave NON aspetta). Pianifica ogni spostamento con margine e indica per ogni tappa quanto tempo resta per il rientro.`,
    `Collegamento porto-centro: ${p.transferNote}`,
    `Traccia consigliata "${o.title}": ${o.outline.join(' → ')}.`,
    o.notes,
    'Solo tappe raggiungibili con certezza nei tempi: se una tappa è a rischio, sostituiscila con una più vicina al porto.',
  ].filter(Boolean).join('\n');
  return {
    destination: p.city,
    coords: p.coords,
    days: 1,
    interests: ['fotografia', 'gastronomia'],
    specialRequests,
    label: `${p.emoji} ${p.port} · ${o.hours}h`,
  };
}

/** Richieste speciali per uno scalo: rientro 2h prima del volo,
 *  deposito bagagli, prudenza sopra tutto. */
export function buildLayoverPrefill(a: AirportLayover, o: StopOption): StopPrefill {
  const inCitta = !o.stayNearAirport;
  const rientro = Math.max(1, o.hours - 2);
  const righe = [
    `Scalo aereo di ${o.hours} ore all'aeroporto ${a.airport} (${a.code}) di ${a.city}, ${a.country}.`,
  ];
  if (inCitta) {
    righe.push(
      `VINCOLO NON NEGOZIABILE: DEVO essere di ritorno in aeroporto entro ${rientro} ore dall'inizio dello scalo (2 ore prima del volo per controlli e imbarco). Pianifica i rientri con margine e non proporre tappe che mettano a rischio il volo.`,
      `Collegamento aeroporto-centro: ${a.transferNote}`,
      `Bagagli: prevedi come prima cosa il deposito bagagli — non pianificare la visita con le valigie al seguito. ${a.luggageNote || 'Verifica in loco dove si trova il deposito bagagli dell\'aeroporto.'}`,
    );
  } else {
    righe.push(
      'NON voglio uscire verso la città: itinerario dentro l\'aeroporto e nelle immediate vicinanze, con rientro al gate senza stress.',
      `VINCOLO NON NEGOZIABILE: al gate 2 ore prima del volo; niente tappe oltre ${rientro} ore dall'inizio dello scalo.`,
    );
  }
  righe.push(
    `Traccia consigliata "${o.title}": ${o.outline.join(' → ')}.`,
    o.notes,
  );
  return {
    destination: a.city,
    coords: a.coords,
    days: 1,
    interests: inCitta ? ['fotografia', 'gastronomia'] : ['gastronomia', 'shopping'],
    specialRequests: righe.filter(Boolean).join('\n'),
    label: `✈️ ${a.code} · ${o.hours}h`,
  };
}

/** Pre-fill roadtrip per un cammino: le tappe diventano legs
 *  [{city,lat,lon}] (partenza + arrivo di ogni tappa) e le richieste
 *  speciali impongono il ritmo del cammino (a piedi, partenze presto,
 *  credenziale). Con legs = tappe+1 e days = numero tappe il motore
 *  roadtrip assegna esattamente una tappa al giorno. */
export function buildPilgrimPrefill(r: PilgrimRoute): RoutePrefill {
  const legs: Array<{ city: string; lat?: number; lon?: number }> = [
    { city: r.start, lat: r.coords?.lat, lon: r.coords?.lon },
  ];
  for (const s of r.stages) {
    const prev = legs[legs.length - 1];
    if (prev && prev.city.trim().toLowerCase() === s.to.trim().toLowerCase()) continue;
    legs.push({ city: s.to, lat: s.lat, lon: s.lon });
  }
  const totKm = r.stages.reduce((acc, s) => acc + (s.km || 0), 0);
  const media = r.stages.length ? Math.round(totKm / r.stages.length) : 0;
  const tappe = r.stages
    .map(s => {
      const extra = [s.terrain, s.note, s.lodging ? `alloggio: ${s.lodging}` : '']
        .filter(Boolean).join('; ');
      return `Giorno ${s.day}: ${s.from} → ${s.to}, ${s.km} km${extra ? ` (${extra})` : ''}`;
    })
    .join('. ');
  const specialRequests = [
    `Cammino a piedi: ${r.name} (${r.start} → ${r.end}), ${r.days} giorni, ~${totKm} km totali (media ${media} km/giorno).`,
    'IMPORTANTE: i trasferimenti tra le città NON sono in auto — si cammina lungo il percorso ufficiale del cammino. Ogni giorno: partenza presto (entro le 8:00) per camminare col fresco, arrivo nel pomeriggio, poi visita lenta del borgo di tappa, cena tipica e riposo.',
    `Tappe: ${tappe}.`,
    r.credential
      ? `Credenziale: ${r.credential} Ricorda in ogni tappa DOVE far mettere il timbro (parrocchia, ostello, ufficio turistico).`
      : '',
    r.notes,
    'Ritmo cammino: poche tappe al giorno, pause acqua/ristoro segnalate, niente attività serali impegnative.',
  ].filter(Boolean).join('\n');
  return {
    legs,
    days: r.days,
    interests: ['spirituale', 'natura', 'borghi'],
    specialRequests,
    label: `${r.emoji} ${r.name}`,
  };
}

// ─────────────────────────────────────────────────────────────────────
// 🛳 PORTI DI CROCIERA — Mediterraneo e isole
// Nota redazionale: gli orari sono prudenti; dove la "gita famosa"
// non sta nei tempi (Roma da Civitavecchia in 6h) lo si dice e si
// propone l'alternativa locale.
// ─────────────────────────────────────────────────────────────────────

export const CRUISE_PORTS: CruisePort[] = [
  // ── Italia ──────────────────────────────────────────────────────────
  {
    id: 'port-civitavecchia', emoji: '🛳', port: 'Porto di Civitavecchia', city: 'Civitavecchia', country: 'Italia',
    coords: { lat: 42.094, lon: 11.793 },
    transferNote: 'navetta gratuita dal molo al varco Fortezza (10-15 min), poi 10 min a piedi alla stazione; treno regionale per Roma S. Pietro/Termini 45-80 min a tratta.',
    options: [
      {
        hours: 4, title: 'Civitavecchia in porto',
        outline: ['Forte Michelangelo', 'Lungomare e Marina', 'Mercato di piazza Regina Margherita', 'Pranzo di pesce vicino al porto'],
        notes: 'Con 4 ore Roma è fuori discussione: non tentare il treno. Tutto a piedi dal varco, rientro a bordo entro 3 ore dallo sbarco.',
      },
      {
        hours: 6, title: 'Niente Roma: Tarquinia etrusca',
        outline: ['Treno per Tarquinia (10-15 min)', 'Necropoli UNESCO di Monterozzi', 'Museo etrusco a palazzo Vitelleschi', 'Centro medievale e pranzo', 'Rientro in treno'],
        notes: 'Con 6 ore Roma NON è serena: tra navette, treno (fino a 80 min a tratta) e imprevisti restano meno di 2 ore in città con rischio nave. Tarquinia è la vera alternativa: vicina, straordinaria e senza ansia. Rientro al varco entro 5 ore dallo sbarco.',
      },
      {
        hours: 8, title: 'Roma essenziale col treno',
        outline: ['Treno diretto per Roma S. Pietro', 'Piazza San Pietro (esterno)', 'Castel Sant\'Angelo e ponte', 'Piazza Navona e Pantheon', 'Rientro da Roma S. Pietro con largo anticipo'],
        notes: 'Fattibile SOLO con treno diretto e orari cuscinetto: massimo 4 ore effettive in centro, niente musei con coda (Vaticano no), ultimo treno utile ben prima del limite. Rientro al varco entro 7 ore dallo sbarco.',
      },
    ],
  },
  {
    id: 'port-livorno', emoji: '🛳', port: 'Porto di Livorno', city: 'Livorno', country: 'Italia',
    coords: { lat: 43.549, lon: 10.310 },
    transferNote: 'navetta portuale fino a piazza del Municipio (10-15 min); stazione centrale a 10 min di bus/taxi; treno per Pisa ~15 min, per Firenze ~1h20 a tratta.',
    options: [
      {
        hours: 4, title: 'Livorno "Venezia Nuova"',
        outline: ['Quartiere Venezia Nuova e canali', 'Mercato delle Vettovaglie', 'Terrazza Mascagni', 'Cacciucco o "cinque e cinque" veloce'],
        notes: 'Tutto in città: niente treni con 4 ore. Rientro alla navetta entro 3 ore dallo sbarco.',
      },
      {
        hours: 6, title: 'Pisa e la Torre',
        outline: ['Treno o taxi per Pisa (~15-25 min)', 'Piazza dei Miracoli: Torre, Duomo, Battistero (esterni)', 'Borgo Stretto e lungarni', 'Rientro'],
        notes: 'Pisa è la gita giusta per 6 ore; la salita sulla Torre solo se prenotata e con orario compatibile. Firenze NO con 6 ore. Rientro in porto entro 5 ore dallo sbarco.',
      },
      {
        hours: 8, title: 'Firenze lampo (solo se tutto liscio)',
        outline: ['Treno per Firenze S.M. Novella (~1h20)', 'Duomo e Battistero (esterni)', 'Piazza della Signoria', 'Ponte Vecchio', 'Rientro col treno con 2 treni di margine'],
        notes: 'Con 8 ore Firenze significa ~3h30 in città e zero code (Uffizi/Accademia no). Alternativa più serena: Pisa + Lucca. Rientro in porto entro 7 ore dallo sbarco.',
      },
    ],
  },
  {
    id: 'port-napoli', emoji: '🌋', port: 'Porto di Napoli (Stazione Marittima)', city: 'Napoli', country: 'Italia',
    coords: { lat: 40.840, lon: 14.252 },
    transferNote: 'il terminal è già in centro: piazza Municipio a 5 min a piedi; metro Linea 1 sotto il terminal.',
    options: [
      {
        hours: 4, title: 'Napoli monumentale a piedi',
        outline: ['Castel Nuovo (Maschio Angioino)', 'Piazza del Plebiscito e Galleria Umberto I', 'Sfogliatella da Gambrinus o dintorni', 'Via Toledo'],
        notes: 'Tutto entro 15 min a piedi dal terminal. Rientro a bordo entro 3 ore dallo sbarco.',
      },
      {
        hours: 6, title: 'Spaccanapoli e pizza',
        outline: ['Metro fino a Dante', 'Spaccanapoli e San Gregorio Armeno', 'Cappella Sansevero (Cristo Velato, prenota)', 'Pizza nel centro storico', 'Ritorno a piedi via Toledo'],
        notes: 'Il centro storico è denso: meglio poche cose fatte bene. Pompei con 6 ore è tirata: sconsigliata. Rientro al terminal entro 5 ore dallo sbarco.',
      },
      {
        hours: 8, title: 'Pompei con la Circumvesuviana',
        outline: ['Circumvesuviana da Porta Nolana/Garibaldi (~35 min)', 'Scavi di Pompei: foro, terme, Villa dei Misteri', 'Pranzo al sacco o veloce fuori dagli scavi', 'Rientro e passeggiata al Plebiscito se avanza tempo'],
        notes: 'Fattibile con 8 ore ma senza sforare: massimo 3 ore dentro gli scavi, treni frequenti ma affollati (attenzione ai borseggi). Rientro al terminal entro 7 ore dallo sbarco.',
      },
    ],
  },
  {
    id: 'port-genova', emoji: '🛳', port: 'Porto di Genova (Stazione Marittima)', city: 'Genova', country: 'Italia',
    coords: { lat: 44.410, lon: 8.920 },
    transferNote: 'terminal a 15-20 min a piedi dal Porto Antico e da via del Campo; taxi 10 min per piazza De Ferrari.',
    options: [
      {
        hours: 4, title: 'Porto Antico e caruggi',
        outline: ['Acquario (esterno) e Porto Antico', 'Via del Campo e i caruggi', 'Cattedrale di San Lorenzo', 'Focaccia e pesto al volo'],
        notes: 'Tutto a piedi. L\'Acquario dentro solo se la coda è nulla (1h30 minimo). Rientro a bordo entro 3 ore dallo sbarco.',
      },
      {
        hours: 6, title: 'Genova dei Rolli',
        outline: ['Via Garibaldi e i palazzi dei Rolli', 'Piazza De Ferrari e teatro Carlo Felice', 'Boccadasse in bus/taxi', 'Rientro via corso Italia'],
        notes: 'Boccadasse merita ma è a 20 min di mezzi: partire per tempo. Rientro al terminal entro 5 ore dallo sbarco.',
      },
    ],
  },
  {
    id: 'port-savona', emoji: '🛳', port: 'Porto di Savona (Palacrociere)', city: 'Savona', country: 'Italia',
    coords: { lat: 44.307, lon: 8.481 },
    transferNote: 'terminal a 10 min a piedi dal centro (via Paleocapa); stazione a 20 min a piedi.',
    options: [
      {
        hours: 4, title: 'Savona sottovoce',
        outline: ['Fortezza del Priamàr', 'Torre Leon Pancaldo e darsena', 'Via Paleocapa e Cappella Sistina di Savona', 'Farinata in centro'],
        notes: 'Città compatta e sottovalutata: tutto a piedi. Rientro a bordo entro 3 ore dallo sbarco.',
      },
      {
        hours: 6, title: 'Noli e la riviera',
        outline: ['Bus/taxi per Noli (~25 min)', 'Borgo marinaro medievale e spiaggia', 'Pranzo di pesce', 'Rientro e darsena di Savona'],
        notes: 'Noli è uno dei borghi più belli della riviera: verifica gli orari bus del rientro PRIMA di partire. Rientro al terminal entro 5 ore dallo sbarco.',
      },
    ],
  },
  {
    id: 'port-laspezia', emoji: '🛳', port: 'Porto di La Spezia', city: 'La Spezia', country: 'Italia',
    coords: { lat: 44.108, lon: 9.828 },
    transferNote: 'navetta dal molo Garibaldi al centro (10 min); stazione centrale a 15-20 min a piedi; treno per le Cinque Terre 8-25 min.',
    options: [
      {
        hours: 4, title: 'La Spezia e il golfo',
        outline: ['Passeggiata Morin e giardini', 'Museo Lia o castello San Giorgio', 'Via del Prione', 'Focaccia e mescciüa'],
        notes: 'Con 4 ore le Cinque Terre sono una corsa inutile: meglio il golfo. Rientro a bordo entro 3 ore dallo sbarco.',
      },
      {
        hours: 6, title: 'Due Cinque Terre, non cinque',
        outline: ['Treno per Riomaggiore', 'Riomaggiore: marina e carruggio', 'Treno per Vernazza o Monterosso', 'Pranzo veloce e rientro in treno'],
        notes: 'DUE borghi al massimo: i treni estivi sono affollati e in ritardo, la Via dell\'Amore va verificata. Rientro in porto entro 5 ore dallo sbarco.',
      },
      {
        hours: 8, title: 'Monterosso e Vernazza con calma',
        // Portovenere tolta: con 8h nette (7h di margine) tre mete più i
        // trasferimenti reali (treno+battello+sentiero) è il motivo per cui
        // la generazione automatica falliva quasi sempre il vincolo di
        // rientro. Due borghi soli, stesso treno diretto per entrambe le
        // tratte, tempi di trasferimento SIMMETRICI (15 min a piedi
        // terminal-stazione in entrambe le direzioni): verificato che così
        // il generatore rientra nei tempi in modo affidabile.
        outline: ['Treno per Monterosso al Mare', 'Borgo, lungomare e passeggiata', 'Pranzo tipico', 'Treno per Vernazza', 'Porticciolo e vicoli (niente Castello Doria: a pagamento)', 'Treno di rientro a La Spezia con ampio margine'],
        notes: 'Niente Riomaggiore, niente Portovenere, niente sentiero costiero: con 8 ore e il rientro obbligatorio sono il motivo di sforo più frequente. Il tragitto a piedi terminal↔stazione è lo stesso percorso: usa SEMPRE la stessa durata in entrambe le direzioni. Rientro al terminal entro 7 ore dallo sbarco.',
      },
    ],
  },
  {
    id: 'port-venezia', emoji: '🛶', port: 'Porto di Venezia (Marittima/Marghera)', city: 'Venezia', country: 'Italia',
    coords: { lat: 45.440, lon: 12.250 },
    transferNote: 'dalle banchine di Marghera/Marittima navetta+people mover o bus per piazzale Roma (15-30 min), poi vaporetto Linea 1/2 sul Canal Grande.',
    options: [
      {
        hours: 4, title: 'Canal Grande e San Marco',
        outline: ['Vaporetto Linea 2 da p.le Roma', 'Piazza San Marco e Basilica (esterno)', 'Ponte dei Sospiri', 'Rientro in vaporetto'],
        notes: ' 4 ore = solo l\'essenziale, con i tempi dei vaporetti che comandano. Niente code (Basilica dentro solo se scorrevole). Rientro alla navetta entro 3 ore dallo sbarco.',
      },
      {
        hours: 6, title: 'Venezia oltre San Marco',
        outline: ['Rialto e mercato', 'Bacari con cicchetti', 'San Marco e riva degli Schiavoni', 'Dorsoduro e Salute', 'Vaporetto di rientro'],
        notes: 'Camminare più che navigare: le calli sono il viaggio. Attenzione all\'acqua alta in autunno. Rientro al terminal entro 5 ore dallo sbarco.',
      },
      {
        hours: 8, title: 'Venezia + Murano',
        outline: ['San Marco e Palazzo Ducale (prenota)', 'Vaporetto per Murano', 'Fornace e museo del vetro', 'Rientro via Fondamente Nove', 'Cicchetti finali a Cannaregio'],
        notes: 'Murano solo con 8 ore: i vaporetti della laguna hanno frequenze lunghe. Burano NON ci sta serenamente. Rientro al terminal entro 7 ore dallo sbarco.',
      },
    ],
  },
  {
    id: 'port-bari', emoji: '🛳', port: 'Porto di Bari', city: 'Bari', country: 'Italia',
    coords: { lat: 41.130, lon: 16.866 },
    transferNote: 'navetta o 15-20 min a piedi fino a Bari Vecchia (piazza del Ferrarese).',
    options: [
      {
        hours: 4, title: 'Bari Vecchia e le orecchiette',
        outline: ['Basilica di San Nicola', 'Strada delle orecchiette (via Arco Basso)', 'Cattedrale di San Sabino', 'Lungomare e focaccia barese'],
        notes: 'Tutto a piedi nel dedalo di Bari Vecchia. Rientro a bordo entro 3 ore dallo sbarco.',
      },
      {
        hours: 6, title: 'Bari + Polignano a Mare',
        outline: ['Bari Vecchia essenziale', 'Treno per Polignano (~30 min)', 'Lama Monachile e balconate', 'Caffè speciale e rientro in treno'],
        notes: 'Polignano è a mezz\'ora di treno ma verifica gli orari di rientro PRIMA: le corse non sono frequentissime. Rientro in porto entro 5 ore dallo sbarco.',
      },
      {
        hours: 8, title: 'Alberobello, con giudizio',
        outline: ['Treno/bus per Alberobello (~1h30)', 'Rione Monti e i trulli', 'Trullo Sovrano', 'Pranzo pugliese', 'Rientro con ampio margine'],
        notes: 'Fattibile solo con 8 ore e SOLO controllando le coincidenze di rientro (ferrovie Sud-Est lente): se gli orari non tornano, meglio Polignano. Rientro in porto entro 7 ore dallo sbarco.',
      },
    ],
  },
  {
    id: 'port-brindisi', emoji: '🛳', port: 'Porto di Brindisi', city: 'Brindisi', country: 'Italia',
    coords: { lat: 40.647, lon: 17.965 },
    transferNote: 'terminal a 10-15 min a piedi/navetta dal lungomare Regina Margherita.',
    options: [
      {
        hours: 4, title: 'Brindisi romana e marinara',
        outline: ['Colonne romane (capolinea della via Appia)', 'Scalinata Virgilio e lungomare', 'Duomo e piazza', 'Pranzo di pesce sul porto'],
        notes: 'Città raccolta, perfetta per una sosta breve. Rientro a bordo entro 3 ore dallo sbarco.',
      },
      {
        hours: 6, title: 'Ostuni, la città bianca',
        outline: ['Taxi/bus per Ostuni (~35-45 min)', 'Centro bianco e cattedrale', 'Belvedere sugli ulivi', 'Rientro con margine'],
        notes: 'Ostuni merita, ma i bus sono rari: valuta un taxi A/R concordato. Rientro in porto entro 5 ore dallo sbarco.',
      },
    ],
  },
  {
    id: 'port-messina', emoji: '🛳', port: 'Porto di Messina', city: 'Messina', country: 'Italia',
    coords: { lat: 38.194, lon: 15.556 },
    transferNote: 'terminal in pieno centro: Duomo a 10 min a piedi; per Taormina treno/bus ~1h-1h15 a tratta.',
    options: [
      {
        hours: 4, title: 'Messina e l\'orologio astronomico',
        outline: ['Duomo e campanile: mezzogiorno con l\'orologio animato', 'Fontana di Orione', 'Santissima Annunziata dei Catalani', 'Granita con brioche'],
        notes: 'Se possibile trovati al Duomo per mezzogiorno: lo spettacolo del campanile dura ~10 min. Rientro a bordo entro 3 ore dallo sbarco.',
      },
      {
        hours: 6, title: 'Taormina, ma di corsa',
        outline: ['Bus/treno per Taormina', 'Corso Umberto e piazza IX Aprile', 'Teatro antico con l\'Etna sullo sfondo', 'Rientro immediato dopo pranzo'],
        notes: 'Con 6 ore Taormina è tirata: ~2h30 sul posto se i mezzi filano. Se il mare è mosso o è alta stagione, resta a Messina. Rientro in porto entro 5 ore dallo sbarco.',
      },
      {
        hours: 8, title: 'Taormina con calma',
        outline: ['Bus per Taormina', 'Teatro antico', 'Corso Umberto, villa comunale', 'Funivia per Isola Bella (bagno veloce)', 'Rientro con corsa di riserva'],
        notes: 'Con 8 ore Taormina si gode: tieni comunque una corsa di rientro di riserva. Rientro in porto entro 7 ore dallo sbarco.',
      },
    ],
  },
  {
    id: 'port-palermo', emoji: '🛳', port: 'Porto di Palermo', city: 'Palermo', country: 'Italia',
    coords: { lat: 38.130, lon: 13.370 },
    transferNote: 'terminal a 15 min a piedi da via Cavour/Teatro Massimo; navette verso il centro nei giorni nave.',
    options: [
      {
        hours: 4, title: 'Palermo dei mercati',
        outline: ['Teatro Massimo (esterno)', 'Mercato del Capo o Vucciria', 'Cattedrale', 'Pane e panelle, cannolo'],
        notes: 'Street food come filo conduttore. Rientro a bordo entro 3 ore dallo sbarco.',
      },
      {
        hours: 6, title: 'Palermo arabo-normanna',
        outline: ['Cappella Palatina (prenota)', 'Cattedrale e tombe reali', 'Quattro Canti e piazza Pretoria', 'Mercato di Ballarò', 'Rientro a piedi'],
        notes: 'Il circuito UNESCO in centro: fattibile a piedi. Monreale solo se avanzano DAVVERO 2 ore. Rientro al terminal entro 5 ore dallo sbarco.',
      },
      {
        hours: 8, title: 'Palermo + Monreale',
        outline: ['Cappella Palatina', 'Bus/taxi per Monreale', 'Duomo di Monreale e chiostro', 'Rientro e pranzo a Ballarò', 'Quattro Canti'],
        notes: 'Monreale è a ~30-40 min di traffico: con 8 ore ci sta, con cuscinetti. Rientro al terminal entro 7 ore dallo sbarco.',
      },
    ],
  },
  {
    id: 'port-cagliari', emoji: '🛳', port: 'Porto di Cagliari', city: 'Cagliari', country: 'Italia',
    coords: { lat: 39.210, lon: 9.110 },
    transferNote: 'terminal in centro: via Roma a 5 min a piedi, quartiere Castello a 15-20 min in salita (o bus/ascensore).',
    options: [
      {
        hours: 4, title: 'Castello e bastioni',
        outline: ['Bastione di Saint Remy', 'Cattedrale e quartiere Castello', 'Torre dell\'Elefante', 'Pranzo in Marina'],
        notes: 'Salite ripide: usa l\'ascensore del bastione se serve. Rientro a bordo entro 3 ore dallo sbarco.',
      },
      {
        hours: 6, title: 'Cagliari + Poetto',
        outline: ['Castello essenziale', 'Bus per il Poetto', 'Spiaggia e Sella del Diavolo (vista)', 'Rientro e via Roma'],
        notes: 'Bagno vero solo da maggio a ottobre; fenicotteri possibili allo stagno di Molentargius. Rientro al terminal entro 5 ore dallo sbarco.',
      },
    ],
  },
  {
    id: 'port-olbia', emoji: '🛳', port: 'Porto di Olbia (Isola Bianca)', city: 'Olbia', country: 'Italia',
    coords: { lat: 40.923, lon: 9.500 },
    transferNote: 'dal molo Isola Bianca 20-25 min a piedi (o navetta) al corso Umberto.',
    options: [
      {
        hours: 4, title: 'Olbia e il suo museo',
        outline: ['Museo archeologico (relitti romani)', 'Corso Umberto e San Paolo', 'Basilica di San Simplicio', 'Pranzo sardo (seadas per finire)'],
        notes: 'Olbia è più interessante della sua fama di scalo. Rientro a bordo entro 3 ore dallo sbarco.',
      },
      {
        hours: 8, title: 'Assaggio di Costa Smeralda',
        outline: ['Taxi/tour per Porto Cervo (~30 min)', 'Piazzetta e marina', 'Spiaggia (Liscia Ruja o simile)', 'Rientro a Olbia con margine', 'Gelato sul corso'],
        notes: 'Solo con mezzi certi (taxi A/R concordato o tour): i bus di linea non sono affidabili per una nave. Rientro al terminal entro 7 ore dallo sbarco.',
      },
    ],
  },
  {
    id: 'port-trieste', emoji: '🛳', port: 'Porto di Trieste', city: 'Trieste', country: 'Italia',
    coords: { lat: 45.650, lon: 13.767 },
    transferNote: 'la stazione marittima è su piazza Unità: si scende praticamente in centro.',
    options: [
      {
        hours: 4, title: 'Trieste asburgica',
        outline: ['Piazza Unità d\'Italia', 'Molo Audace', 'Caffè storico (San Marco o Tommaseo)', 'Canal Grande e Sant\'Antonio'],
        notes: 'Il capoluogo più "a portata di nave" d\'Italia: tutto a piedi. Rientro a bordo entro 3 ore dallo sbarco.',
      },
      {
        hours: 6, title: 'Trieste + castello di Miramare',
        outline: ['Piazza Unità', 'Bus 6 o taxi per Miramare (~20-30 min)', 'Castello e parco sul mare', 'Rientro e caffè storico'],
        notes: 'Miramare è la gita perfetta da nave: parco gratuito, castello con biglietto. Rientro al terminal entro 5 ore dallo sbarco.',
      },
    ],
  },
  {
    id: 'port-ancona', emoji: '🛳', port: 'Porto di Ancona', city: 'Ancona', country: 'Italia',
    coords: { lat: 43.620, lon: 13.500 },
    transferNote: 'dal terminal 15-20 min a piedi al centro (piazza della Repubblica); il Duomo è in cima al colle Guasco.',
    options: [
      {
        hours: 4, title: 'Ancona greca e adriatica',
        outline: ['Arco di Traiano', 'Duomo di San Ciriaco (vista sul porto)', 'Piazza del Papa', 'Pesce all\'anconetana'],
        notes: 'La salita al Duomo ripaga con la vista migliore del porto. Rientro a bordo entro 3 ore dallo sbarco.',
      },
      {
        hours: 6, title: 'Riviera del Conero: Portonovo',
        outline: ['Ancona essenziale', 'Bus/taxi per Portonovo (~25 min)', 'Baia, chiesetta romanica e bagno', 'Rientro con margine'],
        notes: 'D\'estate la baia è affollata e i bus contingentati: taxi più sicuro. Rientro in porto entro 5 ore dallo sbarco.',
      },
    ],
  },
  {
    id: 'port-salerno', emoji: '🛳', port: 'Porto di Salerno', city: 'Salerno', country: 'Italia',
    coords: { lat: 40.675, lon: 14.767 },
    transferNote: 'la stazione marittima è a 10-15 min a piedi dal centro storico e dal lungomare.',
    options: [
      {
        hours: 4, title: 'Salerno medievale',
        outline: ['Duomo e cripta di San Matteo', 'Via dei Mercanti', 'Giardino della Minerva', 'Lungomare Trieste'],
        notes: 'Il giardino della Minerva (orto botanico medievale) è la sorpresa. Rientro a bordo entro 3 ore dallo sbarco.',
      },
      {
        hours: 8, title: 'Costiera: Amalfi via mare',
        outline: ['Traghetto di linea per Amalfi (~35 min)', 'Duomo di Amalfi e chiostro', 'Limoncello e sfusato', 'Eventuale salto a Atrani a piedi', 'Traghetto di rientro con corsa di riserva'],
        notes: 'Via mare, MAI in auto (la statale è imprevedibile). Controlla il meteo: col mare mosso i traghetti saltano — in quel caso resta a Salerno o vai a Vietri in bus. Rientro in porto entro 7 ore dallo sbarco.',
      },
    ],
  },
  // ── Mediterraneo occidentale ────────────────────────────────────────
  {
    id: 'port-barcellona', emoji: '🛳', port: 'Port de Barcelona', city: 'Barcellona', country: 'Spagna',
    coords: { lat: 41.375, lon: 2.177 },
    transferNote: 'navetta blu (Cruise Bus) dai moll Adossat a colonna di Colombo (~10 min), poi Rambla a piedi; taxi 15 min per il centro.',
    options: [
      {
        hours: 4, title: 'Rambla e Barrio Gótico',
        outline: ['Colonna di Colombo', 'La Rambla e mercato Boqueria', 'Cattedrale e Barrio Gótico', 'Tapas veloci'],
        notes: 'Tutto a piedi dalla navetta. Attenzione ai borseggi sulla Rambla. Rientro alla navetta entro 3 ore dallo sbarco.',
      },
      {
        hours: 6, title: 'Gaudí essenziale',
        outline: ['Sagrada Família (SOLO con biglietto prenotato)', 'Passeig de Gràcia: Casa Batlló e Pedrera (esterni)', 'Barrio Gótico', 'Rientro in taxi/metro'],
        notes: 'La Sagrada dentro solo con orario prenotato prima dello sbarco; senza biglietto, esterno + Gótico. Rientro al terminal entro 5 ore dallo sbarco.',
      },
      {
        hours: 8, title: 'Barcellona completa',
        outline: ['Sagrada Família (prenotata)', 'Park Güell (prenotato) o Barceloneta', 'Boqueria per pranzo', 'Gótico e Santa Maria del Mar', 'Taxi di rientro'],
        notes: 'Due prenotazioni al massimo: i tempi metro tra Sagrada e Park Güell si sottovalutano sempre. Rientro al terminal entro 7 ore dallo sbarco.',
      },
    ],
  },
  {
    id: 'port-marsiglia', emoji: '🛳', port: 'Port de Marseille (MPCT)', city: 'Marsiglia', country: 'Francia',
    coords: { lat: 43.310, lon: 5.365 },
    transferNote: 'il terminal crociere è FUORI dal centro: navetta della compagnia o taxi (20-30 min) per il Vieux-Port.',
    options: [
      {
        hours: 4, title: 'Vieux-Port essenziale',
        outline: ['Vieux-Port e mercato del pesce', 'Le Panier e la Vieille Charité', 'Mucem (esterno e passerella)', 'Navette (biscotto) e pastis'],
        notes: 'Il trasferimento porto-centro mangia quasi 1 ora A/R: restare in zona Vieux-Port. Rientro alla navetta entro 3 ore dallo sbarco.',
      },
      {
        hours: 6, title: 'Notre-Dame de la Garde',
        outline: ['Vieux-Port', 'Bus 60 o trenino per Notre-Dame de la Garde', 'Vista sulle Frioul e sul Château d\'If', 'Le Panier', 'Bouillabaisse o panisse'],
        notes: 'La "Bonne Mère" domina tutto: la salita a piedi è ripida, meglio il bus. Rientro al terminal entro 5 ore dallo sbarco.',
      },
    ],
  },
  {
    id: 'port-tolone', emoji: '🛳', port: 'Port de Toulon / La Seyne', city: 'Tolone', country: 'Francia',
    coords: { lat: 43.120, lon: 5.930 },
    transferNote: 'dalle banchine di La Seyne battello di linea per il centro di Tolone (~20 min); da Tolone centro tutto a piedi.',
    options: [
      {
        hours: 4, title: 'Tolone, rada e mercato',
        outline: ['Battello attraverso la rada', 'Mercato del cours Lafayette', 'Porto vecchio e Marina', 'Cade toulonnaise (farinata locale)'],
        notes: 'La rada di Tolone è tra le più belle d\'Europa: il battello è già la gita. Rientro entro 3 ore dallo sbarco.',
      },
      {
        hours: 6, title: 'Mont Faron in funivia',
        outline: ['Battello per Tolone', 'Funivia del Mont Faron', 'Memoriale e vista sulla rada', 'Discesa e porto vecchio', 'Rientro col battello'],
        notes: 'La funivia chiude col vento forte (mistral): in quel caso ripiega sul museo navale. Rientro al terminal entro 5 ore dallo sbarco.',
      },
    ],
  },
  {
    id: 'port-palma', emoji: '🛳', port: 'Port de Palma', city: 'Palma di Maiorca', country: 'Spagna',
    coords: { lat: 39.560, lon: 2.632 },
    transferNote: 'navetta o bus 1 dal molo Dique Oeste alla cattedrale (~15-20 min); taxi 10-15 min.',
    options: [
      {
        hours: 4, title: 'Palma e la Seu',
        outline: ['Cattedrale (La Seu) e Palau de l\'Almudaina', 'Bagni arabi', 'Vicoli del casco antiguo', 'Ensaimada in pasticceria storica'],
        notes: 'La cattedrale sul mare è tra le più scenografiche del Mediterraneo. Rientro alla navetta entro 3 ore dallo sbarco.',
      },
      {
        hours: 8, title: 'Valldemossa e la Tramuntana',
        outline: ['Bus/taxi per Valldemossa (~30-40 min)', 'Certosa di Chopin e George Sand', 'Coca de patata', 'Rientro a Palma', 'Cattedrale e lungomare'],
        notes: 'Solo con 8 ore: la strada di montagna non perdona i ritardi. Rientro al terminal entro 7 ore dallo sbarco.',
      },
    ],
  },
  {
    id: 'port-ibiza', emoji: '🛳', port: 'Port d\'Eivissa', city: 'Ibiza', country: 'Spagna',
    coords: { lat: 38.910, lon: 1.435 },
    transferNote: 'dal molo Botafoc navetta o 25-30 min a piedi lungo il porto fino a Dalt Vila.',
    options: [
      {
        hours: 4, title: 'Dalt Vila UNESCO',
        outline: ['Bastioni rinascimentali di Dalt Vila', 'Cattedrale e vista sul porto', 'La Marina e il mercato vecchio', 'Bullit de peix o tapas'],
        notes: 'L\'Ibiza patrimonio UNESCO, non quella dei club: salite ripide, scarpe comode. Rientro entro 3 ore dallo sbarco.',
      },
      {
        hours: 6, title: 'Dalt Vila + spiaggia',
        outline: ['Dalt Vila essenziale', 'Bus/taxi per Ses Salines', 'Bagno e saline', 'Rientro con margine'],
        notes: 'Ses Salines è a ~20 min: d\'estate ombrelloni finiti presto. Rientro al terminal entro 5 ore dallo sbarco.',
      },
    ],
  },
  {
    id: 'port-ajaccio', emoji: '🛳', port: 'Port d\'Ajaccio', city: 'Ajaccio', country: 'Francia (Corsica)',
    coords: { lat: 41.921, lon: 8.738 },
    transferNote: 'il terminal è in centro: casa di Napoleone a 10 min a piedi.',
    options: [
      {
        hours: 4, title: 'Ajaccio napoleonica',
        outline: ['Maison Bonaparte', 'Cattedrale del battesimo di Napoleone', 'Mercato di piazza Foch', 'Cannistrelli e brocciu'],
        notes: 'Tutto a piedi nel centro genovese-francese. Rientro a bordo entro 3 ore dallo sbarco.',
      },
      {
        hours: 6, title: 'Iles Sanguinaires',
        outline: ['Centro essenziale', 'Bus 5 o battello per la Parata', 'Torre genovese e vista sulle Sanguinaires', 'Rientro e gelato sul porto'],
        notes: 'Il tramonto lì è celebre ma per una nave conta il rientro: valuta il battello A/R con orari certi. Rientro al terminal entro 5 ore dallo sbarco.',
      },
    ],
  },
  // ── Adriatico e Ionio ───────────────────────────────────────────────
  {
    id: 'port-dubrovnik', emoji: '🛳', port: 'Port of Dubrovnik (Gruž)', city: 'Dubrovnik', country: 'Croazia',
    coords: { lat: 42.658, lon: 18.088 },
    transferNote: 'da Gruž bus 1A/1B o taxi (10-15 min) fino a porta Pile; a piedi sono 35-40 min.',
    options: [
      {
        hours: 4, title: 'Stradun e città vecchia',
        outline: ['Porta Pile e fontana di Onofrio', 'Stradun', 'Cattedrale e palazzo del Rettore', 'Porto vecchio'],
        notes: 'Con più navi in rada la città si intasa: parti presto. Le mura con 4 ore sono a rischio coda. Rientro al bus entro 3 ore dallo sbarco.',
      },
      {
        hours: 6, title: 'Le mura e il Forte Lovrijenac',
        outline: ['Giro completo delle mura (~2 ore, biglietto)', 'Stradun e vicoli', 'Forte Lovrijenac', 'Pranzo veloce al porto vecchio'],
        notes: 'Le mura al mattino presto: caldo e code crescono con le ore. Acqua con sé, pochissima ombra. Rientro a Gruž entro 5 ore dallo sbarco.',
      },
      {
        hours: 8, title: 'Città vecchia + funivia sul Srđ',
        outline: ['Mura di prima mattina', 'Funivia sul monte Srđ', 'Vista sull\'Adriatico e museo della guerra', 'Discesa e bagno a Banje', 'Rientro con margine'],
        notes: 'La funivia chiude col vento: alternativa isola di Lokrum (battello 15 min). Rientro a Gruž entro 7 ore dallo sbarco.',
      },
    ],
  },
  {
    id: 'port-kotor', emoji: '🛳', port: 'Port of Kotor', city: 'Kotor', country: 'Montenegro',
    coords: { lat: 42.425, lon: 18.771 },
    transferNote: 'si sbarca (o si tenderizza) davanti alle mura: porta del Mare a 5 min a piedi.',
    options: [
      {
        hours: 4, title: 'Kotor dentro le mura',
        outline: ['Porta del Mare e piazza d\'Armi', 'Cattedrale di San Trifone', 'Museo marittimo o chiese ortodosse', 'Vicoli e gatti di Kotor'],
        notes: 'La città vecchia è minuscola e perfetta per una sosta breve. Rientro al tender entro 3 ore dallo sbarco.',
      },
      {
        hours: 6, title: 'La scalinata di San Giovanni',
        outline: ['Città vecchia essenziale', 'Salita alle mura di San Giovanni (~1h30 A/R, 1350 gradini)', 'Vista sulle Bocche', 'Discesa e pranzo di pesce'],
        notes: 'Salita ripida, acqua e scarpe serie: d\'estate SOLO al mattino. Biglietto d\'ingresso alle mura. Rientro al tender entro 5 ore dallo sbarco.',
      },
    ],
  },
  {
    id: 'port-corfu', emoji: '🛳', port: 'Port of Corfu', city: 'Corfù', country: 'Grecia',
    coords: { lat: 39.625, lon: 19.900 },
    transferNote: 'navetta portuale + bus/taxi (10-15 min) per la Spianada; a piedi ~30 min.',
    options: [
      {
        hours: 4, title: 'Kerkyra veneziana',
        outline: ['Spianada e Liston', 'Fortezza Vecchia', 'Chiesa di San Spiridione', 'Vicoli (kantounia) e pastitsada'],
        notes: 'L\'eredità veneziana si respira ovunque: tutto a piedi dal centro. Rientro alla navetta entro 3 ore dallo sbarco.',
      },
      {
        hours: 6, title: 'Corfù + Achilleion',
        outline: ['Centro storico', 'Taxi/bus per l\'Achilleion (~25 min)', 'Palazzo di Sissi e giardini', 'Rientro e Liston per il caffè'],
        notes: 'L\'Achilleion è la gita classica: concorda il taxi A/R. Rientro al porto entro 5 ore dallo sbarco.',
      },
    ],
  },
  // ── Egeo e Levante ─────────────────────────────────────────────────
  {
    id: 'port-pireo', emoji: '🏛', port: 'Porto del Pireo', city: 'Atene', country: 'Grecia',
    coords: { lat: 37.942, lon: 23.646 },
    transferNote: 'metro M1 da Piraeus a Monastiraki (~20-25 min) o taxi 30-45 min col traffico; totale A/R ~1h30.',
    options: [
      {
        hours: 4, title: 'Pireo e Mikrolimano',
        outline: ['Marina Zeas', 'Mikrolimano e pescherecci', 'Museo archeologico del Pireo', 'Pranzo di pesce sul porticciolo'],
        notes: 'Con 4 ore Atene è una corsa: il Pireo ha i suoi angoli. Rientro a bordo entro 3 ore dallo sbarco.',
      },
      {
        hours: 6, title: 'Acropoli essenziale',
        outline: ['Metro per Monastiraki', 'Acropoli (biglietto/orario prenotato)', 'Plaka per un souvlaki', 'Metro di rientro'],
        notes: 'Solo Acropoli + Plaka, nient\'altro: il traffico ateniese è una variabile seria. Sali presto, caldo torrido d\'estate. Rientro al Pireo entro 5 ore dallo sbarco.',
      },
      {
        hours: 8, title: 'Atene classica',
        outline: ['Acropoli di prima mattina', 'Museo dell\'Acropoli', 'Plaka e Anafiotika', 'Agorà romana e Monastiraki', 'Metro di rientro con margine'],
        notes: 'Con 8 ore Atene si fa bene: resta comunque nel triangolo Acropoli-Plaka-Monastiraki. Rientro al Pireo entro 7 ore dallo sbarco.',
      },
    ],
  },
  {
    id: 'port-santorini', emoji: '🌅', port: 'Porto di Santorini (Athinios/Skala)', city: 'Santorini', country: 'Grecia',
    coords: { lat: 36.385, lon: 25.428 },
    transferNote: 'sbarco in tender a Skala, poi funivia per Fira (code lunghe con più navi); i muli sono sconsigliati.',
    options: [
      {
        hours: 4, title: 'Fira sulla caldera',
        outline: ['Funivia per Fira', 'Passeggiata sul bordo caldera', 'Museo preistorico (Akrotiri in miniatura)', 'Funivia di rientro CON ANTICIPO'],
        notes: 'La coda della funivia al rientro può superare 1 ora con più navi: mettersi in fila prestissimo. Rientro al tender entro 3 ore dallo sbarco.',
      },
      {
        hours: 6, title: 'Oia, andata e ritorno',
        outline: ['Funivia per Fira', 'Bus/taxi per Oia (~30 min)', 'Cupole blu e mulini', 'Rientro a Fira con largo anticipo', 'Funivia e tender'],
        notes: 'Oia è il cartolina-simbolo ma il collo di bottiglia è la funivia: calcola 1h di coda al rientro nei giorni pieni. Rientro al tender entro 5 ore dallo sbarco.',
      },
      {
        hours: 8, title: 'Akrotiri + Oia',
        outline: ['Bus/taxi per Akrotiri (la "Pompei egea")', 'Faro o spiaggia Rossa (vista)', 'Oia per il primo pomeriggio', 'Fira e funivia con ampio margine'],
        notes: 'Giornata piena, fattibile solo organizzando i mezzi (taxi/minibus concordato). Rientro al tender entro 7 ore dallo sbarco.',
      },
    ],
  },
  {
    id: 'port-mykonos', emoji: '🛳', port: 'Porto di Mykonos (Tourlos)', city: 'Mykonos', country: 'Grecia',
    coords: { lat: 37.450, lon: 25.325 },
    transferNote: 'dal nuovo porto di Tourlos sea-bus o navetta per Chora (~10-15 min); a piedi 30 min sul lungomare.',
    options: [
      {
        hours: 4, title: 'Chora e i mulini',
        outline: ['Vicoli bianchi di Chora', 'Piccola Venezia', 'Mulini di Kato Mili', 'Chiesa di Panagia Paraportiani'],
        notes: 'Il labirinto di Chora fu pensato per confondere i pirati: perdersi è il programma. Rientro al sea-bus entro 3 ore dallo sbarco.',
      },
      {
        hours: 6, title: 'Delos, l\'isola sacra',
        outline: ['Battello per Delos dal porto vecchio (~30 min)', 'Sito archeologico: terrazza dei Leoni, teatro', 'Rientro col battello', 'Chora veloce'],
        notes: 'Delos dipende dagli orari dei battelli e dal meteo: verifica la corsa di rientro PRIMA di partire; niente ombra sull\'isola. Rientro al tender entro 5 ore dallo sbarco.',
      },
    ],
  },
  {
    id: 'port-rodi', emoji: '🛳', port: 'Porto di Rodi', city: 'Rodi', country: 'Grecia',
    coords: { lat: 36.450, lon: 28.225 },
    transferNote: 'si sbarca a 5-10 min a piedi dalle mura della città vecchia (porta Marina).',
    options: [
      {
        hours: 4, title: 'La città dei Cavalieri',
        outline: ['Via dei Cavalieri', 'Palazzo del Gran Maestro', 'Moschea di Solimano e via Sokratous', 'Mura e fossato'],
        notes: 'La città medievale UNESCO è subito fuori dal molo: nessun mezzo necessario. Rientro a bordo entro 3 ore dallo sbarco.',
      },
      {
        hours: 8, title: 'Lindos e l\'acropoli sul mare',
        outline: ['Bus/taxi per Lindos (~1h)', 'Acropoli di Lindos', 'Borgo bianco e baia di San Paolo', 'Rientro a Rodi', 'Città vecchia veloce'],
        notes: 'Lindos solo con 8 ore: 2 ore di strada A/R e salita al sole (parti presto, acqua). Rientro in porto entro 7 ore dallo sbarco.',
      },
    ],
  },
  {
    id: 'port-heraklion', emoji: '🛳', port: 'Porto di Heraklion', city: 'Heraklion', country: 'Grecia (Creta)',
    coords: { lat: 35.345, lon: 25.145 },
    transferNote: 'navetta o 15-20 min a piedi dal molo alla fortezza veneziana e al centro.',
    options: [
      {
        hours: 4, title: 'Heraklion veneziana',
        outline: ['Fortezza Koules sul porto', 'Loggia e fontana Morosini', 'Mercato di via 1866', 'Bougatsa e caffè greco'],
        notes: 'L\'impronta di Candia veneziana è ovunque. Rientro a bordo entro 3 ore dallo sbarco.',
      },
      {
        hours: 6, title: 'Cnosso e il museo',
        outline: ['Bus/taxi per Cnosso (~20-30 min)', 'Palazzo di Minosse', 'Rientro in città', 'Museo archeologico (affreschi minoici)', 'Pranzo veloce'],
        notes: 'Cnosso + museo è il combo giusto: prenota gli ingressi, d\'estate vai a Cnosso per primo (niente ombra). Rientro in porto entro 5 ore dallo sbarco.',
      },
    ],
  },
  {
    id: 'port-kusadasi', emoji: '🏛', port: 'Port of Kuşadası', city: 'Kuşadası', country: 'Turchia',
    coords: { lat: 37.865, lon: 27.256 },
    transferNote: 'terminal in centro; per Efeso taxi/tour ~25-30 min a tratta.',
    options: [
      {
        hours: 4, title: 'Efeso essenziale',
        outline: ['Taxi/tour per Efeso', 'Biblioteca di Celso', 'Grande teatro e via dei Cureti', 'Rientro diretto al porto'],
        notes: 'Efeso è LA ragione dello scalo: con 4 ore solo il sito, senza deviazioni. Concorda il taxi A/R prima di partire. Rientro al terminal entro 3 ore dallo sbarco.',
      },
      {
        hours: 6, title: 'Efeso + Casa della Vergine',
        outline: ['Efeso con calma (2 ore nel sito)', 'Casa di Maria sul monte Solmisso', 'Tempio di Artemide (colonna superstite)', 'Bazar di Kuşadası', 'Rientro'],
        notes: 'Con 6 ore entra anche la Meryemana; contratta e concorda TUTTO il giro col driver prima. Rientro al terminal entro 5 ore dallo sbarco.',
      },
    ],
  },
  {
    id: 'port-istanbul', emoji: '🕌', port: 'Galataport Istanbul', city: 'Istanbul', country: 'Turchia',
    coords: { lat: 41.026, lon: 28.983 },
    transferNote: 'Galataport è a Karaköy: tram T1 o 20-30 min a piedi (ponte di Galata) per Sultanahmet.',
    options: [
      {
        hours: 4, title: 'Galata e il Corno d\'Oro',
        outline: ['Torre di Galata (esterno o salita se scorrevole)', 'Ponte di Galata e pescatori', 'Bazar egiziano (spezie)', 'Baklava e tè turco a Karaköy'],
        notes: 'Restare sul lato Galata: Sultanahmet con 4 ore significa code non gestibili. Rientro al terminal entro 3 ore dallo sbarco.',
      },
      {
        hours: 6, title: 'Sultanahmet essenziale',
        outline: ['Tram T1 per Sultanahmet', 'Moschea Blu', 'Santa Sofia (coda permettendo)', 'Ippodromo e Cisterna Basilica (prenota)', 'Tram di rientro'],
        notes: 'Due monumenti al massimo: le code di Santa Sofia sono imprevedibili. Abbigliamento coprente per le moschee. Rientro a Galataport entro 5 ore dallo sbarco.',
      },
      {
        hours: 8, title: 'Istanbul imperiale',
        outline: ['Santa Sofia di prima mattina', 'Moschea Blu e Ippodromo', 'Cisterna Basilica', 'Gran Bazar (un\'ora, non di più)', 'Tram e rientro con margine'],
        notes: 'Il Topkapi NON ci sta insieme al resto: scegli. Nel Gran Bazar il tempo evapora: metti una sveglia. Rientro a Galataport entro 7 ore dallo sbarco.',
      },
    ],
  },
  // ── Atlantico e stretto ────────────────────────────────────────────
  {
    id: 'port-valletta', emoji: '🛳', port: 'Valletta Cruise Port', city: 'La Valletta', country: 'Malta',
    coords: { lat: 35.898, lon: 14.512 },
    transferNote: 'dal Grand Harbour ascensore Barrakka (1 min) o salita a piedi (15 min) per il centro.',
    options: [
      {
        hours: 4, title: 'La Valletta dei Cavalieri',
        outline: ['Upper Barrakka Gardens (saluto del cannone alle 12)', 'Concattedrale di San Giovanni (Caravaggio)', 'Republic Street', 'Pastizzi e ftira'],
        notes: 'L\'ascensore Barrakka porta dal molo al cuore della città in un minuto. Rientro a bordo entro 3 ore dallo sbarco.',
      },
      {
        hours: 6, title: 'Valletta + Tre Città',
        outline: ['San Giovanni e Barrakka', 'Dgħajsa (taxi d\'acqua) per Birgu/Vittoriosa', 'Forte Sant\'Angelo e marina', 'Rientro in barca e gelato'],
        notes: 'Il giro in dgħajsa nel Grand Harbour è il momento migliore dello scalo. Rientro al terminal entro 5 ore dallo sbarco.',
      },
    ],
  },
  {
    id: 'port-lisbona', emoji: '🛳', port: 'Porto de Lisboa (Santa Apolónia)', city: 'Lisbona', country: 'Portogallo',
    coords: { lat: 38.705, lon: -9.145 },
    transferNote: 'i terminal (Santa Apolónia/Jardim do Tabaco) sono a 10-20 min a piedi da Alfama e dalla Baixa.',
    options: [
      {
        hours: 4, title: 'Alfama e i miradouros',
        outline: ['Alfama e cattedrale Sé', 'Miradouro de Santa Luzia', 'Baixa e praça do Comércio', 'Pastel de nata'],
        notes: 'Salite e discese: scarpe comode, tram 28 solo se non c\'è coda. Rientro a bordo entro 3 ore dallo sbarco.',
      },
      {
        hours: 6, title: 'Lisbona + Belém',
        outline: ['Praça do Comércio', 'Tram/taxi per Belém (~25 min)', 'Torre di Belém e monastero dos Jerónimos (esterni)', 'Pastéis de Belém originali', 'Rientro'],
        notes: 'A Belém gli interni hanno code lunghe: esterni + pasticceria è la versione onesta in 6 ore. Rientro al terminal entro 5 ore dallo sbarco.',
      },
      {
        hours: 8, title: 'Lisbona completa',
        outline: ['Alfama e castello de São Jorge', 'Baixa e elevador de Santa Justa (esterno)', 'Belém con Jerónimos (prenota)', 'Time Out Market per pranzo', 'Rientro con margine'],
        notes: 'Occhio: Lisbona è in salita e i tram sono lenti; il taxi tra i quartieri fa guadagnare ore. Rientro al terminal entro 7 ore dallo sbarco.',
      },
    ],
  },
  {
    id: 'port-cadice', emoji: '🛳', port: 'Puerto de Cádiz', city: 'Cadice', country: 'Spagna',
    coords: { lat: 36.535, lon: -6.292 },
    transferNote: 'il terminal è attaccato al centro storico: plaza de San Juan de Dios a 5 min a piedi. Per Siviglia treno ~1h45 a tratta.',
    options: [
      {
        hours: 4, title: 'Cádiz, la città più antica d\'Occidente',
        outline: ['Cattedrale e torre di poniente', 'Mercado Central (pescaíto frito)', 'Torre Tavira e camera oscura', 'Playa la Caleta e castello'],
        notes: 'Tutto a piedi: Cadice è un centro storico su un\'isola. Rientro a bordo entro 3 ore dallo sbarco.',
      },
      {
        hours: 8, title: 'Siviglia, solo con 8 ore piene',
        outline: ['Treno per Siviglia (~1h45)', 'Cattedrale e Giralda (esterni o prenotato)', 'Barrio Santa Cruz', 'Plaza de España', 'Treno di rientro con UNA corsa di riserva'],
        notes: 'Quasi 4 ore di treno A/R: restano ~3 ore in città. Fattibile solo con orari verificati e biglietti presi prima; con qualunque dubbio, resta a Cadice (che merita). Rientro al terminal entro 7 ore dallo sbarco.',
      },
    ],
  },
  {
    id: 'port-gibilterra', emoji: '🛳', port: 'Gibraltar Cruise Terminal', city: 'Gibilterra', country: 'Regno Unito (Gibilterra)',
    coords: { lat: 36.144, lon: -5.353 },
    transferNote: 'terminal a 15-20 min a piedi da Main Street (o navetta); funivia per la Rocca dal capolinea sud.',
    options: [
      {
        hours: 4, title: 'La Rocca e le scimmie',
        outline: ['Funivia per la Upper Rock', 'Bertorelle (macachi) — NON toccarle né dar cibo', 'St. Michael\'s Cave', 'Discesa e Main Street'],
        notes: 'La funivia ha code nei giorni nave: in alternativa i taxi-tour ufficiali della Rocca. Rientro al terminal entro 3 ore dallo sbarco.',
      },
      {
        hours: 6, title: 'Rocca completa + Europa Point',
        outline: ['Taxi-tour: Upper Rock, grande assedio, grotte', 'Europa Point: faro e vista sull\'Africa', 'Main Street per fish&chips', 'Rientro a piedi'],
        notes: 'In un giorno limpido dallo stretto si vede il Marocco. Sterline o euro accettati quasi ovunque. Rientro al terminal entro 5 ore dallo sbarco.',
      },
    ],
  },
  // ── Nord Europa ─────────────────────────────────────────────────────
  {
    id: 'port-copenaghen', emoji: '🧜‍♀️', port: 'Copenhagen Cruise Port (Oceankaj/Langelinie)', city: 'Copenaghen', country: 'Danimarca',
    coords: { lat: 55.706, lon: 12.601 },
    transferNote: 'da Langelinie 20-30 min a piedi al centro; da Oceankaj navetta o bus 27 (~20 min, pochi euro). La Sirenetta è vicina a Langelinie.',
    options: [
      {
        hours: 4, title: 'Sirenetta e Nyhavn',
        outline: ['La Sirenetta e il Kastellet', 'Amalienborg (cambio della guardia a mezzogiorno)', 'Nyhavn, le case colorate', 'Smørrebrød veloce'],
        notes: 'Percorso quasi tutto a piedi lungo l\'acqua. Rientro alla nave entro 3 ore dallo sbarco.',
      },
      {
        hours: 6, title: 'Copenaghen hygge',
        outline: ['Nyhavn e battello dei canali (1 ora)', 'Strøget e Rundetårn', 'Giardini di Tivoli (se aperti)', 'Rientro in bus/taxi'],
        notes: 'Tivoli apre in stagione: verifica. Città cara: carte accettate ovunque. Rientro al terminal entro 5 ore dallo sbarco.',
      },
    ],
  },
  {
    id: 'port-stoccolma', emoji: '🛳', port: 'Stockholm Cruise Port (Stadsgården/Frihamnen)', city: 'Stoccolma', country: 'Svezia',
    coords: { lat: 59.318, lon: 18.096 },
    transferNote: 'da Stadsgården 20 min a piedi (o navetta) a Gamla Stan; da Frihamnen bus/tram ~20-25 min.',
    options: [
      {
        hours: 4, title: 'Gamla Stan',
        outline: ['Isola di Gamla Stan: Stortorget', 'Palazzo Reale (cambio della guardia)', 'Vicolo Mårten Trotzig (90 cm)', 'Kanelbulle e caffè (fika)'],
        notes: 'La città vecchia è un\'isola compatta: perfetta per la sosta corta. Rientro a bordo entro 3 ore dallo sbarco.',
      },
      {
        hours: 6, title: 'Gamla Stan + museo Vasa',
        outline: ['Gamla Stan essenziale', 'Traghetto/tram per Djurgården', 'Museo Vasa: il galeone del 1628 intatto', 'Rientro via Skeppsholmen'],
        notes: 'Il Vasa è il museo più visitato della Scandinavia e vale da solo lo scalo: biglietto online. Rientro al terminal entro 5 ore dallo sbarco.',
      },
    ],
  },
  {
    id: 'port-bergen', emoji: '🛳', port: 'Port of Bergen (Skolten/Jekteviken)', city: 'Bergen', country: 'Norvegia',
    coords: { lat: 60.398, lon: 5.310 },
    transferNote: 'da Skolten 10 min a piedi al Bryggen; da Jekteviken navetta (~10 min).',
    options: [
      {
        hours: 4, title: 'Bryggen e il mercato',
        outline: ['Bryggen: le case anseatiche UNESCO', 'Mercato del pesce', 'Chiesa di Santa Maria', 'Salmone o zuppa di pesce'],
        notes: 'Piove 240 giorni l\'anno: guscio impermeabile anche col sole. Rientro a bordo entro 3 ore dallo sbarco.',
      },
      {
        hours: 6, title: 'Fløyen, il balcone sui fiordi',
        outline: ['Funicolare Fløibanen (coda: vai presto)', 'Vista su città e fiordi, breve passeggiata in quota', 'Discesa e Bryggen', 'Mercato del pesce'],
        notes: 'Con cielo coperto la vista sparisce: decidi guardando il monte dal molo. Rientro al terminal entro 5 ore dallo sbarco.',
      },
    ],
  },
  {
    id: 'port-reykjavik', emoji: '🌋', port: 'Reykjavik Cruise Port (Skarfabakki)', city: 'Reykjavik', country: 'Islanda',
    coords: { lat: 64.153, lon: -21.870 },
    transferNote: 'da Skarfabakki navetta o 30-40 min a piedi lungo il mare fino al centro; bus urbani frequenti.',
    options: [
      {
        hours: 4, title: 'Reykjavik essenziale',
        outline: ['Hallgrímskirkja (salita al campanile)', 'Laugavegur e le case colorate', 'Harpa, la sala concerti di vetro', 'Sun Voyager sul lungomare'],
        notes: 'Centro piccolo e caro; meteo che cambia in 10 minuti. Rientro a bordo entro 3 ore dallo sbarco.',
      },
      {
        hours: 8, title: 'Assaggio di Golden Circle',
        outline: ['Tour organizzato o auto: Þingvellir (faglia dei continenti)', 'Geysir e Strokkur', 'Cascata Gullfoss', 'Rientro diretto al porto'],
        notes: 'SOLO con tour/driver con rientro garantito per l\'orario nave: le distanze islandesi ingannano (~230 km totali). Rientro al terminal entro 7 ore dallo sbarco.',
      },
    ],
  },
  {
    id: 'port-amburgo', emoji: '🛳', port: 'Hamburg Cruise Center (HafenCity/Steinwerder)', city: 'Amburgo', country: 'Germania',
    coords: { lat: 53.541, lon: 9.984 },
    transferNote: 'da HafenCity 15 min a piedi al centro; da Steinwerder navetta/taxi (~15-20 min).',
    options: [
      {
        hours: 4, title: 'Speicherstadt e Elbphilharmonie',
        outline: ['Speicherstadt: i magazzini UNESCO sui canali', 'Elbphilharmonie: la Plaza panoramica (gratuita, ritira il biglietto)', 'HafenCity', 'Fischbrötchen sul porto'],
        notes: 'La Plaza dell\'Elphi è l\'affaccio giusto senza concerti. Rientro a bordo entro 3 ore dallo sbarco.',
      },
      {
        hours: 6, title: 'Amburgo anseatica',
        outline: ['Speicherstadt', 'Rathaus e Jungfernstieg sull\'Alster', 'Giro in battello dei canali o del porto', 'San Michele (torre)', 'Rientro'],
        notes: 'Il porto si capisce dall\'acqua: il giro in barca è la scelta giusta. Rientro al terminal entro 5 ore dallo sbarco.',
      },
    ],
  },
  {
    id: 'port-southampton', emoji: '🛳', port: 'Port of Southampton', city: 'Southampton', country: 'Regno Unito',
    coords: { lat: 50.897, lon: -1.411 },
    transferNote: 'terminal a 10-20 min a piedi/taxi dal centro; treno per Winchester ~20 min, per Londra ~1h20 a tratta.',
    options: [
      {
        hours: 4, title: 'Southampton e il Titanic',
        outline: ['SeaCity Museum (la storia del Titanic, partito da qui)', 'Mura medievali e Bargate', 'Old Town e Tudor House', 'Pub per fish&chips'],
        notes: 'La città fu il porto del Titanic: il museo è la cosa da vedere. Rientro a bordo entro 3 ore dallo sbarco.',
      },
      {
        hours: 6, title: 'Winchester, la vecchia capitale',
        outline: ['Treno per Winchester (~20 min)', 'Cattedrale (una delle più lunghe d\'Europa)', 'Great Hall e la "Tavola Rotonda"', 'High Street e rientro in treno'],
        notes: 'Londra con una sosta nave NON è una buona idea (3h di treni A/R): Winchester è la gita intelligente. Rientro in porto entro 5 ore dallo sbarco.',
      },
    ],
  },
  // ── Americhe ────────────────────────────────────────────────────────
  {
    id: 'port-miami', emoji: '🛳', port: 'PortMiami', city: 'Miami', country: 'Stati Uniti',
    coords: { lat: 25.774, lon: -80.170 },
    transferNote: 'taxi/rideshare per Downtown 10 min o South Beach 15-20 min (~15-25 $); Metromover gratuito da Downtown.',
    options: [
      {
        hours: 4, title: 'Downtown e Bayside',
        outline: ['Bayside Marketplace accanto al porto', 'Metromover panoramico su Downtown', 'Bayfront Park', 'Cuban sandwich'],
        notes: 'Restare lato Downtown: South Beach col traffico è un rischio inutile in 4 ore. Rientro a bordo entro 3 ore dallo sbarco.',
      },
      {
        hours: 6, title: 'Art Déco di South Beach',
        outline: ['Rideshare per Ocean Drive', 'Distretto Art Déco e Lummus Park', 'Española Way e Lincoln Road', 'Spiaggia veloce e rientro'],
        notes: 'Traffico dei ponti imprevedibile: parti da South Beach con 2 ore di margine. Rientro al terminal entro 5 ore dallo sbarco.',
      },
    ],
  },
  {
    id: 'port-canaveral', emoji: '🚀', port: 'Port Canaveral', city: 'Cape Canaveral', country: 'Stati Uniti',
    coords: { lat: 28.410, lon: -80.618 },
    transferNote: 'niente centro città: si esce solo in taxi/navetta; Kennedy Space Center a ~30-40 min, Cocoa Beach a 10-15 min.',
    options: [
      {
        hours: 4, title: 'Cocoa Beach',
        outline: ['Navetta/taxi per Cocoa Beach', 'Molo di Cocoa Beach', 'Surf shop storico Ron Jon (aperto 24h)', 'Fish tacos e rientro'],
        notes: 'La spiaggia dei surfisti della Space Coast: semplice e senza stress. Rientro a bordo entro 3 ore dallo sbarco.',
      },
      {
        hours: 8, title: 'Kennedy Space Center',
        outline: ['Taxi/navetta per il KSC Visitor Complex', 'Space Shuttle Atlantis', 'Rocket Garden e Saturn V (bus interno)', 'Rientro diretto'],
        notes: 'Il complesso merita una giornata intera: con 8 ore scegli Atlantis + Saturn V e basta. Biglietti online prima. Rientro al terminal entro 7 ore dallo sbarco.',
      },
    ],
  },
  {
    id: 'port-cozumel', emoji: '🐠', port: 'Puerto de Cozumel', city: 'Cozumel', country: 'Messico',
    coords: { lat: 20.510, lon: -86.949 },
    transferNote: 'i moli sono in centro o a 5-10 min di taxi da San Miguel; taxi con tariffe ufficiali esposte.',
    options: [
      {
        hours: 4, title: 'San Miguel e malecón',
        outline: ['Malecón e piazza di San Miguel', 'Museo dell\'isola', 'Tacos e agua fresca', 'Shopping di artigianato (contratta con garbo)'],
        notes: 'Tutto a piedi dal molo. Rientro a bordo entro 3 ore dallo sbarco.',
      },
      {
        hours: 6, title: 'Snorkeling sulla barriera',
        outline: ['Taxi per un beach club della costa ovest (Chankanaab o simili)', 'Snorkeling sulla barriera mesoamericana', 'Pranzo in spiaggia', 'Taxi di rientro'],
        notes: 'La corrente si rispetta: solo aree sorvegliate del club. Chichén Itzá NON esiste da Cozumel in giornata nave: non farti vendere il contrario. Rientro al molo entro 5 ore dallo sbarco.',
      },
    ],
  },
  {
    id: 'port-nassau', emoji: '🛳', port: 'Nassau Cruise Port', city: 'Nassau', country: 'Bahamas',
    coords: { lat: 25.078, lon: -77.339 },
    transferNote: 'il terminal sbuca direttamente su Bay Street: centro a piedi in 5 min.',
    options: [
      {
        hours: 4, title: 'Nassau coloniale',
        outline: ['Bay Street e Parliament Square', 'Queen\'s Staircase (la scalinata degli schiavi)', 'Forte Fincastle', 'Conch salad al mercato del pesce'],
        notes: 'Tutto raggiungibile a piedi con caldo umido: acqua e cappello. Rientro a bordo entro 3 ore dallo sbarco.',
      },
      {
        hours: 6, title: 'Spiaggia + centro',
        outline: ['Junkanoo Beach a piedi (10 min)', 'Bagno e sdraio', 'Bay Street per souvenir', 'Rientro senza fretta'],
        notes: 'Paradise Island/Atlantis mangia tempo e dollari: la spiaggia libera vicina è la scelta furba. Rientro al terminal entro 5 ore dallo sbarco.',
      },
    ],
  },
  {
    id: 'port-sanjuan', emoji: '🏰', port: 'Puerto de San Juan', city: 'San Juan', country: 'Porto Rico',
    coords: { lat: 18.466, lon: -66.106 },
    transferNote: 'i moli sono al bordo della città vecchia: Viejo San Juan interamente a piedi.',
    options: [
      {
        hours: 4, title: 'Viejo San Juan',
        outline: ['Calle Fortaleza e le facciate colorate', 'El Morro, la fortezza sull\'oceano', 'Paseo de la Princesa', 'Mofongo e piragua'],
        notes: 'Sampietrini azzurri e salite: scarpe comode. Rientro a bordo entro 3 ore dallo sbarco.',
      },
      {
        hours: 6, title: 'Le due fortezze',
        outline: ['El Morro con calma', 'Castillo San Cristóbal', 'Cimitero di Santa María Magdalena (vista)', 'Pranzo criollo in calle San Sebastián'],
        notes: 'Il biglietto unico copre entrambe le fortezze (parchi nazionali USA). Rientro al molo entro 5 ore dallo sbarco.',
      },
    ],
  },
  {
    id: 'port-juneau', emoji: '🏔', port: 'Port of Juneau', city: 'Juneau', country: 'Stati Uniti (Alaska)',
    coords: { lat: 58.301, lon: -134.420 },
    transferNote: 'i moli sono in centro; il ghiacciaio Mendenhall si raggiunge con navette dedicate (~30 min a tratta).',
    options: [
      {
        hours: 4, title: 'Juneau e la Mount Roberts Tramway',
        outline: ['Funivia Mount Roberts dal molo', 'Sentiero panoramico in quota (aquile frequenti)', 'Discesa e Red Dog Saloon', 'King crab o salmone'],
        notes: 'La funivia parte a pochi metri dalla nave: la gita d\'alta quota più facile dell\'Alaska. Rientro a bordo entro 3 ore dallo sbarco.',
      },
      {
        hours: 6, title: 'Ghiacciaio Mendenhall',
        outline: ['Navetta per il Mendenhall', 'Visitor center e sentiero alla cascata Nugget', 'Foto al fronte del ghiacciaio', 'Navetta di rientro e centro'],
        notes: 'Orsi possibili sui sentieri: rispetta le indicazioni dei ranger. Prendi la navetta con orario di rientro GARANTITO. Rientro al molo entro 5 ore dallo sbarco.',
      },
    ],
  },
  {
    id: 'port-vancouver', emoji: '🛳', port: 'Canada Place (Vancouver)', city: 'Vancouver', country: 'Canada',
    coords: { lat: 49.289, lon: -123.111 },
    transferNote: 'Canada Place È il centro: Gastown a 10 min a piedi, Stanley Park a 25 min o 10 in bici.',
    options: [
      {
        hours: 4, title: 'Gastown e waterfront',
        outline: ['Canada Place e la passeggiata sul porto', 'Gastown: steam clock e magazzini vittoriani', 'Idrovolanti in decollo dal Coal Harbour', 'Poutine o salmone'],
        notes: 'Tutto a piedi dal terminal, che è già un monumento (le "vele"). Rientro a bordo entro 3 ore dallo sbarco.',
      },
      {
        hours: 6, title: 'Stanley Park in bicicletta',
        outline: ['Noleggio bici al Coal Harbour', 'Seawall di Stanley Park (giro completo ~1h30)', 'Totem di Brockton Point', 'Gastown e rientro'],
        notes: 'Il seawall è a senso unico antiorario: il giro non si accorcia a metà — calcola i tempi interi. Rientro al terminal entro 5 ore dallo sbarco.',
      },
    ],
  },
  // ── Asia, Golfo e Oceania ───────────────────────────────────────────
  {
    id: 'port-singapore', emoji: '🦁', port: 'Marina Bay Cruise Centre', city: 'Singapore', country: 'Singapore',
    coords: { lat: 1.271, lon: 103.859 },
    transferNote: 'metro MRT da Marina South Pier (~15-20 min per il centro, pochi dollari) o taxi 10-15 min.',
    options: [
      {
        hours: 4, title: 'Marina Bay',
        outline: ['Gardens by the Bay: i Supertree', 'Marina Bay Sands (piazza e vista)', 'Merlion Park', 'Kaya toast o laksa veloce'],
        notes: 'Caldo umido costante: idratazione e tappe all\'ombra/al chiuso. Rientro a bordo entro 3 ore dallo sbarco.',
      },
      {
        hours: 6, title: 'Singapore dei quartieri',
        outline: ['Chinatown e tempio della Reliquia del Dente', 'Hawker centre per pranzo (Maxwell o Lau Pa Sat)', 'Gardens by the Bay', 'MRT di rientro'],
        notes: 'Un hawker centre è il pasto migliore del sud-est asiatico a 5 dollari: non perderlo. Rientro al terminal entro 5 ore dallo sbarco.',
      },
    ],
  },
  {
    id: 'port-hongkong', emoji: '🌃', port: 'Kai Tak Cruise Terminal', city: 'Hong Kong', country: 'Cina (Hong Kong)',
    coords: { lat: 22.306, lon: 114.213 },
    transferNote: 'Kai Tak è decentrato: navetta+MTR o taxi (~20-30 min) per Tsim Sha Tsui; alcune navi attraccano invece a Ocean Terminal, già in centro.',
    options: [
      {
        hours: 4, title: 'Kowloon e il Victoria Harbour',
        outline: ['Tsim Sha Tsui: Avenue of Stars', 'Star Ferry per Central (la traversata leggendaria)', 'Ritorno in ferry', 'Dim sum veloce'],
        notes: 'Lo Star Ferry costa centesimi ed è il miglior "giro turistico" della città. Rientro al terminal entro 3 ore dallo sbarco.',
      },
      {
        hours: 6, title: 'The Peak',
        outline: ['Star Ferry per Central', 'Peak Tram (coda: biglietto online)', 'Vista dal Victoria Peak e passeggiata Lugard Road', 'Discesa e rientro con margine'],
        notes: 'Col cielo coperto il Peak non rende: piano B il mercato di Temple Street. Rientro al terminal entro 5 ore dallo sbarco (Kai Tak è lontano: non tirare la corda).',
      },
    ],
  },
  {
    id: 'port-dubai', emoji: '🕌', port: 'Port Rashid (Dubai)', city: 'Dubai', country: 'Emirati Arabi Uniti',
    coords: { lat: 25.268, lon: 55.276 },
    transferNote: 'taxi dal terminal: Dubai Creek 10-15 min, Burj Khalifa/Dubai Mall 20-25 min (tassametro, costo contenuto).',
    options: [
      {
        hours: 4, title: 'La vecchia Dubai',
        outline: ['Quartiere storico Al Fahidi', 'Abra (barca tradizionale) sul Creek', 'Souk dell\'oro e delle spezie a Deira', 'Karak chai e shawarma'],
        notes: 'La Dubai autentica è al Creek, non nei mall: e l\'abra costa 1 dirham. Da giugno a settembre caldo estremo: tappe brevi. Rientro a bordo entro 3 ore dallo sbarco.',
      },
      {
        hours: 6, title: 'Burj Khalifa e Dubai Mall',
        outline: ['Taxi per Downtown', 'At the Top del Burj Khalifa (biglietto orario PRENOTATO)', 'Dubai Mall e acquario (esterno)', 'Fontane danzanti se in orario', 'Taxi di rientro'],
        notes: 'Senza biglietto prenotato il Burj è coda pura: in quel caso resta al Creek. Rientro al terminal entro 5 ore dallo sbarco.',
      },
    ],
  },
  {
    id: 'port-sydney', emoji: '🛳', port: 'Sydney Overseas Passenger Terminal (Circular Quay)', city: 'Sydney', country: 'Australia',
    coords: { lat: -33.858, lon: 151.210 },
    transferNote: 'si sbarca a Circular Quay: Opera House e The Rocks a 5-10 min a piedi.',
    options: [
      {
        hours: 4, title: 'Opera House e The Rocks',
        outline: ['Opera House dal molo', 'The Rocks: i vicoli della prima colonia', 'Harbour Bridge dal basso (pylon lookout)', 'Flat white e meat pie'],
        notes: 'Il terminal è nel punto più scenografico della città: tutto a piedi. Rientro a bordo entro 3 ore dallo sbarco.',
      },
      {
        hours: 6, title: 'Ferry per Manly',
        outline: ['Opera House', 'Ferry per Manly (30 min di baia spettacolare)', 'Spiaggia e Corso di Manly', 'Ferry di rientro con corsa di riserva'],
        notes: 'Il ferry di Manly è il giro di baia perfetto: verifica gli orari di rientro, le corse sono ogni 20-30 min. Rientro al terminal entro 5 ore dallo sbarco.',
      },
    ],
  },
  // ── Caraibi ─────────────────────────────────────────────────────────
  {
    id: 'port-stthomas', emoji: '🏝', port: 'Havensight/Crown Bay Cruise Port', city: 'Charlotte Amalie', country: 'Isole Vergini USA',
    coords: { lat: 18.343, lon: -64.923 },
    transferNote: 'da Havensight il centro storico è 10-15 min a piedi lungo il mare; da Crown Bay serve taxi condiviso (5-10 min).',
    options: [
      { hours: 4, title: 'Charlotte Amalie coloniale', outline: ['Fort Christian', 'Main Street e i negozi duty-free', 'Government Hill', 'Frutta locale al mercato'], notes: 'Tutto a piedi dal molo. Rientro a bordo entro 3 ore dallo sbarco.' },
      { hours: 6, title: 'Magens Bay', outline: ['Taxi condiviso per Magens Bay (~20 min)', 'La spiaggia più fotografata dei Caraibi', 'Rientro a Charlotte Amalie per un giro veloce', 'Taxi di rientro al molo'], notes: 'Prenota il taxi di ritorno con anticipo: nelle ore di punta la fila cresce. Rientro al molo entro 5 ore dallo sbarco.' },
      { hours: 8, title: 'Coral World e isola', outline: ['Coral World Ocean Park (osservatorio subacqueo)', 'Magens Bay per il bagno', 'Pranzo di pesce locale', 'Rientro con margine'], notes: 'Combinazione realistica solo con taxi privato prenotato per l\'intera giornata. Rientro al molo entro 7 ore dallo sbarco.' },
    ],
  },
  {
    id: 'port-stmaarten', emoji: '🏝', port: 'Philipsburg Cruise Terminal', city: 'Philipsburg', country: 'Sint Maarten',
    coords: { lat: 18.026, lon: -63.045 },
    transferNote: 'tender o molo fino a Front Street, tutto camminabile nel centro.',
    options: [
      { hours: 4, title: 'Front Street e il boardwalk', outline: ['Front Street: negozi e street food', 'Il boardwalk sul mare', 'Courthouse storico', 'Rum cake locale'], notes: 'Rientro a bordo entro 3 ore dallo sbarco.' },
      { hours: 6, title: 'Orient Beach', outline: ['Taxi per Orient Beach (~20 min, lato francese)', 'Spiaggia e sport acquatici', 'Rientro a Philipsburg', 'Ultimo giro sul Front Street'], notes: 'Rientro al molo entro 5 ore dallo sbarco.' },
      { hours: 8, title: 'Maho Beach e Marigot francese', outline: ['Maho Beach: gli aerei atterrano sopra la testa (fenomeno reale, non leggenda)', 'Marigot lato francese: mercato e baguette', 'Orient Beach per il bagno', 'Rientro con largo anticipo'], notes: 'Verifica online gli orari di atterraggio previsti a Maho prima di partire. Rientro al molo entro 7 ore dallo sbarco.' },
    ],
  },
  {
    id: 'port-aruba', emoji: '🏝', port: 'Aruba Cruise Terminal', city: 'Oranjestad', country: 'Aruba',
    coords: { lat: 12.524, lon: -70.027 },
    transferNote: 'il molo è nel centro di Oranjestad, tutto a piedi.',
    options: [
      { hours: 4, title: 'Oranjestad coloniale olandese', outline: ['Renaissance Mall e il centro colorato', 'Fort Zoutman', 'Lungomare Linear Park', 'Snack a base di keshi yena'], notes: 'Rientro a bordo entro 3 ore dallo sbarco.' },
      { hours: 6, title: 'Eagle Beach', outline: ['Taxi per Eagle Beach (~10 min)', 'Gli alberi fofoti iconici', 'Bagno in acque calmissime', 'Rientro in centro e al molo'], notes: 'Rientro al molo entro 5 ore dallo sbarco.' },
      { hours: 8, title: 'Arikok National Park', outline: ['Jeep tour nel parco nazionale (da prenotare)', 'Piscina naturale "Conchi" se il mare è calmo', 'Eagle Beach nel pomeriggio', 'Rientro con margine'], notes: 'Il jeep tour va prenotato prima dello sbarco: i posti si esauriscono. Rientro al molo entro 7 ore dallo sbarco.' },
    ],
  },
  {
    id: 'port-curacao', emoji: '🏝', port: 'Willemstad Cruise Port', city: 'Willemstad', country: 'Curaçao',
    coords: { lat: 12.108, lon: -68.933 },
    transferNote: 'il molo è a Otrobanda: si attraversa il ponte pedonale Queen Emma per Punda, tutto a piedi.',
    options: [
      { hours: 4, title: 'Willemstad UNESCO', outline: ['Otrobanda e le facciate colorate', 'Ponte galleggiante Queen Emma', 'Punda e il Floating Market', 'Rientro a piedi'], notes: 'Rientro a bordo entro 3 ore dallo sbarco.' },
      { hours: 6, title: 'Mambo Beach', outline: ['Taxi per Mambo Beach (~15 min)', 'Bagno e beach club', 'Rientro a Punda per uno scorcio finale', 'Rientro al molo'], notes: 'Rientro al molo entro 5 ore dallo sbarco.' },
      { hours: 8, title: 'Christoffel Park o grotte di Hato', outline: ['Grotte di Hato con stalattiti e pipistrelli', 'Mambo Beach per il bagno', 'Willemstad al rientro', 'Rientro con margine'], notes: 'Tour organizzato consigliato: le distanze interne richiedono auto. Rientro al molo entro 7 ore dallo sbarco.' },
    ],
  },
  {
    id: 'port-caymangrand', emoji: '🐢', port: 'George Town Cruise Port', city: 'George Town', country: 'Isole Cayman',
    coords: { lat: 19.293, lon: -81.375 },
    transferNote: 'tender fino al molo di George Town (niente attracco diretto per le navi grandi), poi tutto a piedi o taxi breve.',
    options: [
      { hours: 4, title: 'George Town e Seven Mile Beach', outline: ['Centro e i negozi duty-free', 'Taxi per un assaggio di Seven Mile Beach', 'Bagno breve', 'Rientro al tender'], notes: 'Il tender può richiedere attesa: calcola margine extra. Rientro al tender entro 3 ore dallo sbarco.' },
      { hours: 6, title: 'Stingray City', outline: ['Escursione in barca a Stingray City (banco di sabbia)', 'Snorkeling con le razze, guida inclusa nel tour', 'Rientro in barca', 'Rientro al molo'], notes: 'Prenota il tour prima dello sbarco: è l\'escursione più richiesta dell\'isola. Rientro al molo entro 5 ore dallo sbarco.' },
      { hours: 8, title: 'Stingray City e Seven Mile Beach', outline: ['Stingray City in barca', 'Seven Mile Beach per il pomeriggio', 'Turtle Centre se il tempo lo consente', 'Rientro con margine'], notes: 'Combinazione fattibile solo se il tour Stingray parte presto. Rientro al molo entro 7 ore dallo sbarco.' },
    ],
  },
  {
    id: 'port-roatan', emoji: '🐠', port: 'Mahogany Bay/Coxen Hole', city: 'Roatán', country: 'Honduras',
    coords: { lat: 16.32, lon: -86.53 },
    transferNote: 'da Mahogany Bay la spiaggia del terminal è a piedi; per West Bay serve taxi (~20-25 min).',
    options: [
      { hours: 4, title: 'Spiaggia del terminal', outline: ['Spiaggia privata del Mahogany Bay Beach Club', 'Snorkeling base sulla barriera vicina', 'Mercatino artigianale', 'Bagno libero'], notes: 'Rientro a bordo entro 3 ore dallo sbarco.' },
      { hours: 6, title: 'West Bay Beach', outline: ['Taxi per West Bay (~25 min)', 'Snorkeling sulla seconda barriera corallina più grande al mondo', 'Bagno in acque turchesi', 'Rientro con margine'], notes: 'Rientro al molo entro 5 ore dallo sbarco.' },
      { hours: 8, title: 'Zipline e barriera corallina', outline: ['Canopy tour zipline nella foresta', 'West Bay Beach per lo snorkeling', 'Pranzo locale', 'Rientro con margine'], notes: 'Prenota lo zipline prima dello sbarco. Rientro al molo entro 7 ore dallo sbarco.' },
    ],
  },
  {
    id: 'port-antigua', emoji: '⚓', port: "St. John's Cruise Pier", city: "St. John's", country: 'Antigua e Barbuda',
    coords: { lat: 17.12, lon: -61.85 },
    transferNote: 'il molo è a due passi dal centro, tutto a piedi.',
    options: [
      { hours: 4, title: "St. John's coloniale", outline: ['Redcliffe Quay', 'Cattedrale anglicana', 'Mercato locale', 'Rum punch da assaggio'], notes: 'Rientro a bordo entro 3 ore dallo sbarco.' },
      { hours: 6, title: "Nelson's Dockyard", outline: ['Taxi per English Harbour (~30 min)', "Nelson's Dockyard, cantiere navale georgiano restaurato", 'Shirley Heights per il panorama', 'Rientro con margine'], notes: 'Rientro al molo entro 5 ore dallo sbarco.' },
      { hours: 8, title: 'Half Moon Bay e Dockyard', outline: ["Nelson's Dockyard", 'Half Moon Bay per il bagno', 'Pranzo di pesce', 'Rientro con margine'], notes: 'Serve un tour privato o noleggio auto per coprire entrambe le tappe. Rientro al molo entro 7 ore dallo sbarco.' },
    ],
  },
  {
    id: 'port-barbados', emoji: '⚓', port: 'Bridgetown Cruise Terminal', city: 'Bridgetown', country: 'Barbados',
    coords: { lat: 13.096, lon: -59.616 },
    transferNote: 'navetta o taxi dal terminal al centro (~10-15 min).',
    options: [
      { hours: 4, title: 'Bridgetown UNESCO', outline: ['Garrison storico e Parliament Buildings', 'Careenage waterfront', 'Broad Street', 'Flying fish, il piatto simbolo'], notes: 'Rientro a bordo entro 3 ore dallo sbarco.' },
      { hours: 6, title: 'Catamarano con le tartarughe', outline: ['Escursione in catamarano lungo la costa', 'Snorkeling con le tartarughe marine', 'Bagno in Carlisle Bay', 'Rientro al terminal'], notes: 'Prenota il catamarano prima dello sbarco. Rientro al terminal entro 5 ore dallo sbarco.' },
      { hours: 8, title: 'Est selvaggio e Harrison\'s Cave', outline: ['Harrison\'s Cave, grotta calcarea in trenino elettrico', 'Costa orientale atlantica panoramica', 'Carlisle Bay al rientro', 'Rientro con margine'], notes: 'Tour organizzato consigliato per le distanze interne. Rientro al terminal entro 7 ore dallo sbarco.' },
    ],
  },
  {
    id: 'port-stlucia', emoji: '🌋', port: 'Castries Cruise Terminal', city: 'Castries', country: 'St. Lucia',
    coords: { lat: 14.017, lon: -60.985 },
    transferNote: 'il terminal è nel centro di Castries, mercato a 5 min a piedi.',
    options: [
      { hours: 4, title: 'Castries e il mercato', outline: ['Mercato coperto di Castries', 'Cattedrale dell\'Immacolata Concezione', 'Derek Walcott Square', 'Spezie e cacao locali'], notes: 'Rientro a bordo entro 3 ore dallo sbarco.' },
      { hours: 6, title: 'Catamarano verso i Pitons', outline: ['Catamarano lungo la costa ovest', 'Vista dei Piton Gemelli UNESCO dal mare', 'Bagno o snorkeling', 'Rientro in porto'], notes: 'Prenota il catamarano prima dello sbarco. Rientro al terminal entro 5 ore dallo sbarco.' },
      { hours: 8, title: 'Sulphur Springs e Pitons', outline: ['Trasferimento a Soufrière (~1h)', 'Sulphur Springs, il "vulcano drive-in"', 'Bagni termali fangosi', 'Vista dei Pitons dal Jardin de Malabar', 'Rientro con margine'], notes: 'Le strade interne sono tortuose: tour organizzato indispensabile. Rientro al terminal entro 7 ore dallo sbarco.' },
    ],
  },
  {
    id: 'port-grenada', emoji: '🌰', port: "St. George's Cruise Terminal", city: "St. George's", country: 'Grenada',
    coords: { lat: 12.05, lon: -61.75 },
    transferNote: 'il terminal affaccia sul Carenage, il centro è a piedi.',
    options: [
      { hours: 4, title: 'Il Carenage e la "Spice Isle"', outline: ['Passeggiata sul Carenage', 'Mercato delle spezie (noce moscata, cannella)', 'Fort George', 'Assaggio di cioccolato locale'], notes: 'Rientro a bordo entro 3 ore dallo sbarco.' },
      { hours: 6, title: 'Grand Anse Beach', outline: ['Taxi per Grand Anse (~15 min)', 'Una delle spiagge più belle dei Caraibi', 'Bagno e relax', 'Rientro al Carenage'], notes: 'Rientro al terminal entro 5 ore dallo sbarco.' },
      { hours: 8, title: 'Cascate e Grand Anse', outline: ['Cascate di Annandale o Concord nell\'entroterra', 'Grand Anse Beach nel pomeriggio', 'Pranzo di pesce alla griglia', 'Rientro con margine'], notes: 'Tour organizzato per coprire cascate e spiaggia in giornata. Rientro al terminal entro 7 ore dallo sbarco.' },
    ],
  },
  // ── Alaska ──────────────────────────────────────────────────────────
  {
    id: 'port-skagway', emoji: '⛏', port: 'Skagway Cruise Dock', city: 'Skagway', country: 'Stati Uniti (Alaska)',
    coords: { lat: 59.459, lon: -135.313 },
    transferNote: 'il molo è a due passi dalla città storica della corsa all\'oro, tutto a piedi.',
    options: [
      { hours: 4, title: 'La città della corsa all\'oro', outline: ['Broadway Street e le facciate d\'epoca', 'Arctic Brotherhood Hall', 'Museo della corsa all\'oro del Klondike', 'Caffè e pasticceria locale'], notes: 'Rientro a bordo entro 3 ore dallo sbarco.' },
      { hours: 6, title: 'White Pass Scenic Railway', outline: ['Treno panoramico White Pass & Yukon Route (da prenotare)', 'Gole, ponti e cascate lungo la salita al passo', 'Rientro in treno', 'Ultimo giro in centro'], notes: 'Il treno va prenotato con largo anticipo, è l\'escursione simbolo di Skagway. Rientro al molo entro 5 ore dallo sbarco.' },
      { hours: 8, title: 'White Pass e confine dello Yukon', outline: ['Treno panoramico fino al confine canadese', 'Rientro in treno o pullman', 'Tempo libero in centro', 'Rientro con margine'], notes: 'Rientro al molo entro 7 ore dallo sbarco.' },
    ],
  },
  {
    id: 'port-ketchikan', emoji: '🐻', port: 'Ketchikan Cruise Dock', city: 'Ketchikan', country: 'Stati Uniti (Alaska)',
    coords: { lat: 55.342, lon: -131.647 },
    transferNote: 'il molo è nel centro, Creek Street è a 5-10 min a piedi.',
    options: [
      { hours: 4, title: 'Creek Street e i totem', outline: ['Creek Street, il quartiere su palafitte', 'Totem Heritage Center', 'Salmone in risalita (in stagione)', 'Negozi locali'], notes: 'Rientro a bordo entro 3 ore dallo sbarco.' },
      { hours: 6, title: 'Misty Fjords in idrovolante', outline: ['Volo panoramico sui Misty Fjords (da prenotare)', 'Cascate e pareti di granito viste dall\'alto', 'Rientro in centro', 'Ultimo giro a Creek Street'], notes: 'Il volo dipende dal meteo: piano B il villaggio nativo di Saxman con i totem. Rientro al molo entro 5 ore dallo sbarco.' },
      { hours: 8, title: 'Misty Fjords e Saxman Village', outline: ['Volo o battello sui Misty Fjords', 'Villaggio nativo di Saxman e i totem', 'Spettacolo dei boscaioli (Lumberjack Show)', 'Rientro con margine'], notes: 'Rientro al molo entro 7 ore dallo sbarco.' },
    ],
  },
  {
    id: 'port-seward', emoji: '🐋', port: 'Seward Cruise Terminal', city: 'Seward', country: 'Stati Uniti (Alaska)',
    coords: { lat: 60.104, lon: -149.441 },
    transferNote: 'Anchorage è a 2,5 ore di treno/auto: troppo lontana per uno scalo, resta su Seward e il Kenai Fjords National Park.',
    options: [
      { hours: 4, title: 'Seward e l\'Alaska SeaLife Center', outline: ['Lungomare di Seward', 'Alaska SeaLife Center: foche, otarie, uccelli marini', 'Centro storico', 'Salmone affumicato locale'], notes: 'Rientro a bordo entro 3 ore dallo sbarco.' },
      { hours: 6, title: 'Crociera nel Kenai Fjords', outline: ['Battello per il Kenai Fjords National Park (da prenotare)', 'Ghiacciai marini e fauna: balene, orche, foche', 'Rientro in porto', 'Alaska SeaLife Center se il tempo lo consente'], notes: 'Prenota il battello prima dello sbarco: è l\'escursione simbolo di Seward. Rientro al molo entro 5 ore dallo sbarco.' },
      { hours: 8, title: 'Kenai Fjords lungo', outline: ['Crociera estesa nel Kenai Fjords con più ghiacciai', 'Avvistamento fauna marina', 'Alaska SeaLife Center al rientro', 'Rientro con margine'], notes: 'Rientro al molo entro 7 ore dallo sbarco.' },
    ],
  },
  // ── Sud America ─────────────────────────────────────────────────────
  {
    id: 'port-buenosaires', emoji: '💃', port: 'Puerto Madero Cruise Terminal', city: 'Buenos Aires', country: 'Argentina',
    coords: { lat: -34.608, lon: -58.363 },
    transferNote: 'taxi dal terminal al centro storico (~10-15 min).',
    options: [
      { hours: 4, title: 'Puerto Madero e Plaza de Mayo', outline: ['Puerto Madero, i docks riqualificati', 'Plaza de Mayo e Casa Rosada', 'Catedral Metropolitana', 'Un caffè in un café notable'], notes: 'Rientro a bordo entro 3 ore dallo sbarco.' },
      { hours: 6, title: 'La Boca e il tango', outline: ['Plaza de Mayo', 'La Boca: il Caminito colorato', 'Un assaggio di tango di strada', 'Taxi di rientro'], notes: 'La Boca oltre il Caminito richiede prudenza: resta nella zona turistica. Rientro al terminal entro 5 ore dallo sbarco.' },
      { hours: 8, title: 'Recoleta, San Telmo e La Boca', outline: ['Cimitero di Recoleta (tomba di Evita)', 'San Telmo, il quartiere bohemien', 'La Boca e il Caminito', 'Rientro con margine'], notes: 'Rientro al terminal entro 7 ore dallo sbarco.' },
    ],
  },
  {
    id: 'port-montevideo', emoji: '⚓', port: 'Puerto de Montevideo', city: 'Montevideo', country: 'Uruguay',
    coords: { lat: -34.906, lon: -56.211 },
    transferNote: 'il porto è a 5-10 min a piedi dalla Ciudad Vieja.',
    options: [
      { hours: 4, title: 'Ciudad Vieja', outline: ['Mercado del Puerto (asado e vino)', 'Plaza Independencia', 'Palacio Salvo (esterno)', 'Rambla per un tratto'], notes: 'Rientro a bordo entro 3 ore dallo sbarco.' },
      { hours: 6, title: 'La Rambla e Pocitos', outline: ['Ciudad Vieja', 'Rambla, la passeggiata costiera più lunga del mondo', 'Spiaggia urbana di Pocitos', 'Taxi di rientro'], notes: 'Rientro al terminal entro 5 ore dallo sbarco.' },
      { hours: 8, title: 'Città e mercati', outline: ['Ciudad Vieja e Mercado del Puerto', 'Rambla fino a Pocitos', 'Mercado Agrícola de Montevideo', 'Rientro con margine'], notes: 'Punta del Este è troppo lontana (2 ore): non tentarla in scalo. Rientro al terminal entro 7 ore dallo sbarco.' },
    ],
  },
  {
    id: 'port-riodejaneiro', emoji: '⛰', port: 'Pier Mauá', city: 'Rio de Janeiro', country: 'Brasile',
    coords: { lat: -22.895, lon: -43.183 },
    transferNote: 'taxi dal Pier Mauá a Centro/Copacabana (~15-30 min secondo traffico).',
    options: [
      { hours: 4, title: 'Centro storico', outline: ['Escadaria Selarón', 'Centro storico e Confeitaria Colombo', 'Boulevard Olímpico', 'Taxi di rientro'], notes: 'Con 4 ore né Cristo né Pan di Zucchero sono prudenti: resta in centro. Rientro a bordo entro 3 ore dallo sbarco.' },
      { hours: 6, title: 'Pan di Zucchero', outline: ['Taxi per l\'Urca', 'Funivia del Pan di Zucchero (da prenotare, coda variabile)', 'Vista sulla baia di Guanabara', 'Rientro al porto'], notes: 'Scegli UNA vetta iconica, non entrambe: il traffico di Rio è imprevedibile. Rientro al porto entro 5 ore dallo sbarco.' },
      { hours: 8, title: 'Cristo Redentore', outline: ['Trenino a cremagliera per il Corcovado (da prenotare con orario)', 'Cristo Redentore e panorama sulla città', 'Selarón o Copacabana al rientro se il tempo avanza', 'Rientro con largo margine'], notes: 'Prenota l\'orario del trenino online prima dello sbarco: è il collo di bottiglia. Rientro al porto entro 7 ore dallo sbarco.' },
    ],
  },
  {
    id: 'port-santos', emoji: '☕', port: 'Porto de Santos', city: 'Santos', country: 'Brasile',
    coords: { lat: -23.96, lon: -46.322 },
    transferNote: 'San Paolo è a 1h30-2h di strada: troppo lontana per uno scalo tipico, resta su Santos e dintorni.',
    options: [
      { hours: 4, title: 'Centro storico di Santos', outline: ['Museu do Café nel centro storico', 'Bondinho storico', 'Orla, il lungomare con il giardino più lungo del mondo', 'Caffè brasiliano da assaggiare dove nacque il commercio'], notes: 'San Paolo NON è raggiungibile in sicurezza in questo tempo: onestà prima di tutto. Rientro a bordo entro 3 ore dallo sbarco.' },
      { hours: 6, title: 'Guarujá', outline: ['Museu do Café', 'Traghetto o taxi per la spiaggia di Guarujá', 'Bagno e relax', 'Rientro al porto'], notes: 'Rientro al porto entro 5 ore dallo sbarco.' },
      { hours: 8, title: 'Santos e Guarujá con calma', outline: ['Centro storico e Museu do Café', 'Guarujá per il bagno', 'Pranzo di pesce', 'Rientro con margine'], notes: 'Anche con 8 ore San Paolo resta sconsigliata per il traffico imprevedibile. Rientro al porto entro 7 ore dallo sbarco.' },
    ],
  },
  {
    id: 'port-valparaiso', emoji: '🎨', port: 'Puerto de Valparaíso', city: 'Valparaíso', country: 'Cile',
    coords: { lat: -33.045, lon: -71.612 },
    transferNote: 'il porto è nel centro di Valparaíso; Santiago è a 1h15-1h30 di strada.',
    options: [
      { hours: 4, title: 'I cerros dipinti', outline: ['Cerro Alegre e Cerro Concepción', 'Street art e funicolari storiche (ascensores)', 'Plaza Sotomayor', 'Empanadas locali'], notes: 'Rientro a bordo entro 3 ore dallo sbarco.' },
      { hours: 6, title: 'Valparaíso e Viña del Mar', outline: ['I cerros dipinti', 'Viña del Mar, la vicina città giardino', 'Spiaggia e Reloj de Flores', 'Rientro al porto'], notes: 'Rientro al porto entro 5 ore dallo sbarco.' },
      { hours: 8, title: 'Santiago (solo se lo scalo è lungo davvero)', outline: ['Trasferimento a Santiago (~1h15)', 'Plaza de Armas e centro storico', 'Cerro San Cristóbal se il tempo avanza', 'Rientro con largo anticipo'], notes: 'Fattibile SOLO con partenza mattutina e nave che attracca tutto il giorno: in caso contrario resta su Valparaíso-Viña. Rientro al porto entro 7 ore dallo sbarco.' },
    ],
  },
  {
    id: 'port-callao', emoji: '🏛', port: 'Puerto del Callao', city: 'Lima', country: 'Perù',
    coords: { lat: -12.056, lon: -77.118 },
    transferNote: 'taxi da Callao a Lima Miraflores (~40-50 min con traffico).',
    options: [
      { hours: 4, title: 'La Fortaleza del Callao', outline: ['Real Felipe, la fortezza coloniale del porto', 'Centro storico del Callao', 'Barrio Chalaco', 'Ceviche vicino al porto'], notes: 'Con 4 ore Lima centro è rischiosa per il traffico: resta sul Callao. Rientro a bordo entro 3 ore dallo sbarco.' },
      { hours: 6, title: 'Miraflores', outline: ['Trasferimento a Lima Miraflores', 'Malecón sulla scogliera del Pacifico', 'Parque del Amor', 'Rientro con margine'], notes: 'Rientro al porto entro 5 ore dallo sbarco, calcolando il traffico del ritorno.' },
      { hours: 8, title: 'Lima storica e Miraflores', outline: ['Centro storico di Lima: Plaza Mayor e Convento di San Francisco', 'Miraflores e il Malecón', 'Ceviche in un cevichería locale', 'Rientro con largo margine'], notes: 'Il traffico di Lima è il vero rischio: parti presto e non tirare la corda. Rientro al porto entro 7 ore dallo sbarco.' },
    ],
  },
  {
    id: 'port-cartagena-co', emoji: '🏰', port: 'Puerto de Cartagena', city: 'Cartagena', country: 'Colombia',
    coords: { lat: 10.391, lon: -75.479 },
    transferNote: 'taxi dal terminal alla Ciudad Amurallada (~10-15 min).',
    options: [
      { hours: 4, title: 'La Ciudad Amurallada', outline: ['Le mura coloniali UNESCO', 'Plaza de los Coches e Plaza Santo Domingo', 'Getsemaní, il quartiere colorato', 'Frutta tropicale dalle palenqueras'], notes: 'Rientro a bordo entro 3 ore dallo sbarco.' },
      { hours: 6, title: 'Castillo San Felipe', outline: ['Ciudad Amurallada', 'Castillo San Felipe de Barajas, la fortezza spagnola', 'Getsemaní al tramonto', 'Taxi di rientro'], notes: 'Rientro al terminal entro 5 ore dallo sbarco.' },
      { hours: 8, title: 'Islas del Rosario', outline: ['Barca per le Islas del Rosario (partenza mattutina obbligatoria)', 'Snorkeling nella barriera protetta', 'Ciudad Amurallada al rientro se il tempo avanza', 'Rientro con largo margine'], notes: 'L\'escursione alle isole richiede uno scalo lungo con attracco mattutino: verifica gli orari nave prima di prenotarla. Rientro al terminal entro 7 ore dallo sbarco.' },
    ],
  },
  // ── USA e Canada, altre coste ──────────────────────────────────────
  {
    id: 'port-seattle', emoji: '☕', port: 'Pier 66/91 Cruise Terminal', city: 'Seattle', country: 'Stati Uniti',
    coords: { lat: 47.615, lon: -122.36 },
    transferNote: 'taxi o monorotaia dal molo al centro (~10-15 min).',
    options: [
      { hours: 4, title: 'Pike Place Market', outline: ['Pike Place Market e il primo Starbucks', 'Space Needle dal basso', 'Waterfront', 'Salmone affumicato'], notes: 'Rientro a bordo entro 3 ore dallo sbarco.' },
      { hours: 6, title: 'Space Needle e Chihuly Garden', outline: ['Pike Place Market', 'Space Needle (biglietto prenotato)', 'Chihuly Garden and Glass', 'Rientro con margine'], notes: 'Rientro al molo entro 5 ore dallo sbarco.' },
      { hours: 8, title: 'Ferry per Bainbridge Island', outline: ['Pike Place Market', 'Ferry per Bainbridge Island, vista sullo skyline dall\'acqua', 'Space Needle al rientro se il tempo avanza', 'Rientro con margine'], notes: 'Rientro al molo entro 7 ore dallo sbarco.' },
    ],
  },
  {
    id: 'port-sanfrancisco', emoji: '🌉', port: 'Pier 27/35 Cruise Terminal', city: 'San Francisco', country: 'Stati Uniti',
    coords: { lat: 37.808, lon: -122.41 },
    transferNote: 'il molo è a Fisherman\'s Wharf, tutto camminabile nel centro.',
    options: [
      { hours: 4, title: 'Fisherman\'s Wharf', outline: ['Pier 39 e i leoni marini', 'Cable car (biglietto o coda)', 'Lombard Street', 'Clam chowder in pagnotta'], notes: 'Rientro a bordo entro 3 ore dallo sbarco.' },
      { hours: 6, title: 'Golden Gate Bridge', outline: ['Fisherman\'s Wharf', 'Golden Gate Bridge dal Crissy Field o in bici', 'Cable car di rientro', 'Rientro con margine'], notes: 'Rientro al molo entro 5 ore dallo sbarco.' },
      { hours: 8, title: 'Alcatraz', outline: ['Traghetto per Alcatraz (biglietto PRENOTATO con settimane di anticipo)', 'Tour audioguidato del penitenziario', 'Fisherman\'s Wharf al rientro', 'Rientro con largo margine'], notes: 'Senza prenotazione anticipata Alcatraz salta: verifica prima di sbarcare. Rientro al molo entro 7 ore dallo sbarco.' },
    ],
  },
  {
    id: 'port-sandiego', emoji: '⚓', port: 'B Street Cruise Terminal', city: 'San Diego', country: 'Stati Uniti',
    coords: { lat: 32.715, lon: -117.174 },
    transferNote: 'il molo è nel centro, Gaslamp Quarter a 10 min a piedi.',
    options: [
      { hours: 4, title: 'Gaslamp Quarter e USS Midway', outline: ['USS Midway Museum, la portaerei visitabile', 'Gaslamp Quarter', 'Seaport Village sul lungomare', 'Fish taco locale'], notes: 'Rientro a bordo entro 3 ore dallo sbarco.' },
      { hours: 6, title: 'Balboa Park', outline: ['USS Midway Museum', 'Balboa Park e i suoi giardini/musei', 'Gaslamp Quarter al rientro', 'Rientro con margine'], notes: 'Rientro al molo entro 5 ore dallo sbarco.' },
      { hours: 8, title: 'La Jolla', outline: ['USS Midway Museum', 'La Jolla Cove: foche e leoni marini in libertà', 'Balboa Park se il tempo avanza', 'Rientro con largo margine'], notes: 'Rientro al molo entro 7 ore dallo sbarco.' },
    ],
  },
  {
    id: 'port-neworleans', emoji: '🎷', port: 'Erato Street Cruise Terminal', city: 'New Orleans', country: 'Stati Uniti',
    coords: { lat: 29.936, lon: -90.062 },
    transferNote: 'il terminal è a pochi minuti a piedi dal French Quarter.',
    options: [
      { hours: 4, title: 'French Quarter', outline: ['Bourbon Street di giorno', 'Jackson Square e la cattedrale', 'Café du Monde, i beignet', 'Musica jazz dal vivo'], notes: 'Rientro a bordo entro 3 ore dallo sbarco.' },
      { hours: 6, title: 'French Quarter e Garden District', outline: ['French Quarter', 'Tram storico per il Garden District', 'Case vittoriane e cimiteri storici', 'Rientro in tram'], notes: 'Rientro al terminal entro 5 ore dallo sbarco.' },
      { hours: 8, title: 'Swamp tour', outline: ['French Quarter al mattino', 'Escursione in bayou con avvistamento alligatori (da prenotare)', 'Café du Monde al rientro', 'Rientro con margine'], notes: 'Il tour nella palude richiede trasferimento fuori città: prenota con anticipo. Rientro al terminal entro 7 ore dallo sbarco.' },
    ],
  },
  {
    id: 'port-newyork', emoji: '🗽', port: 'Manhattan Cruise Terminal', city: 'New York', country: 'Stati Uniti',
    coords: { lat: 40.771, lon: -74.005 },
    transferNote: 'taxi o metro da Midtown West verso il resto di Manhattan (~10-20 min).',
    options: [
      { hours: 4, title: 'Times Square e Midtown', outline: ['Times Square', 'Central Park, ingresso sud', 'High Line', 'Hot dog da un chiosco storico'], notes: 'Rientro a bordo entro 3 ore dallo sbarco.' },
      { hours: 6, title: 'Statua della Libertà dal traghetto', outline: ['Metro per Battery Park', 'Traghetto Staten Island (gratuito, vista sulla Statua della Libertà)', 'Wall Street e il toro', 'Rientro in metro'], notes: 'Il traghetto Staten Island è gratuito e passa vicino alla statua senza bisogno di prenotazione. Rientro al molo entro 5 ore dallo sbarco.' },
      { hours: 8, title: 'Manhattan essenziale', outline: ['Traghetto Staten Island per la Statua della Libertà', 'Wall Street e il Financial District', 'Times Square', 'Central Park', 'Rientro con margine'], notes: 'Il traffico di Manhattan è imprevedibile: preferisci sempre metro/traghetto al taxi. Rientro al molo entro 7 ore dallo sbarco.' },
    ],
  },
  {
    id: 'port-boston', emoji: '🦞', port: 'Black Falcon Cruise Terminal', city: 'Boston', country: 'Stati Uniti',
    coords: { lat: 42.34, lon: -71.03 },
    transferNote: 'taxi o navetta dal terminal al centro (~10-15 min).',
    options: [
      { hours: 4, title: 'Freedom Trail (tratto centrale)', outline: ['Quincy Market e Faneuil Hall', 'Un tratto del Freedom Trail', 'North End, il quartiere italiano', 'Aragosta o clam chowder'], notes: 'Rientro a bordo entro 3 ore dallo sbarco.' },
      { hours: 6, title: 'Freedom Trail completo', outline: ['Quincy Market', 'Freedom Trail intero fino a Bunker Hill', 'North End per il pranzo', 'Taxi di rientro'], notes: 'Rientro al terminal entro 5 ore dallo sbarco.' },
      { hours: 8, title: 'Boston e Cambridge', outline: ['Freedom Trail', 'Metro per Cambridge: Harvard Yard', 'North End al rientro', 'Rientro con margine'], notes: 'Rientro al terminal entro 7 ore dallo sbarco.' },
    ],
  },
  {
    id: 'port-quebec', emoji: '🏰', port: 'Port de Québec', city: 'Québec', country: 'Canada',
    coords: { lat: 46.813, lon: -71.207 },
    transferNote: 'il molo è ai piedi della città vecchia, salita a piedi o funicolare.',
    options: [
      { hours: 4, title: 'Vieux-Québec UNESCO', outline: ['Funicolare per la città alta', 'Château Frontenac (esterno)', 'Place Royale nella città bassa', 'Tourtière, il piatto tipico'], notes: 'Rientro a bordo entro 3 ore dallo sbarco.' },
      { hours: 6, title: 'Le mura e la Terrasse Dufferin', outline: ['Città vecchia con le mura fortificate', 'Terrasse Dufferin con vista sul San Lorenzo', 'Quartier du Petit-Champlain', 'Rientro con margine'], notes: 'Rientro al molo entro 5 ore dallo sbarco.' },
      { hours: 8, title: 'Cascate di Montmorency', outline: ['Città vecchia al mattino', 'Cascate di Montmorency, più alte del Niagara (taxi ~20 min)', 'Petit-Champlain al rientro', 'Rientro con margine'], notes: 'Rientro al molo entro 7 ore dallo sbarco.' },
    ],
  },
  {
    id: 'port-halifax', emoji: '⚓', port: 'Halifax Seaport', city: 'Halifax', country: 'Canada',
    coords: { lat: 44.648, lon: -63.571 },
    transferNote: 'il terminal è sul lungomare, centro a piedi.',
    options: [
      { hours: 4, title: 'Waterfront Boardwalk', outline: ['Halifax Waterfront Boardwalk', 'Citadel Hill (esterno o visita)', 'Museo marittimo dell\'Atlantico (storia del Titanic)', 'Fish and chips locale'], notes: 'Rientro a bordo entro 3 ore dallo sbarco.' },
      { hours: 6, title: 'Citadel e Public Gardens', outline: ['Citadel Hill con la fortezza', 'Public Gardens vittoriani', 'Waterfront al rientro', 'Rientro con margine'], notes: 'Rientro al terminal entro 5 ore dallo sbarco.' },
      { hours: 8, title: "Peggy's Cove", outline: ["Taxi o tour per Peggy's Cove (~45 min)", 'Il faro più fotografato del Canada atlantico', 'Waterfront di Halifax al rientro', 'Rientro con margine'], notes: 'Rientro al terminal entro 7 ore dallo sbarco.' },
    ],
  },
  // ── Messico Pacifico ────────────────────────────────────────────────
  {
    id: 'port-puertovallarta', emoji: '🌵', port: 'Puerto Vallarta Cruise Terminal', city: 'Puerto Vallarta', country: 'Messico',
    coords: { lat: 20.6, lon: -105.235 },
    transferNote: 'taxi dal terminal al Malecón (~10-15 min).',
    options: [
      { hours: 4, title: 'Malecón e Zona Romántica', outline: ['Malecón e le sculture sul lungomare', 'Chiesa di Nuestra Señora de Guadalupe', 'Zona Romántica', 'Tacos al pastor'], notes: 'Rientro a bordo entro 3 ore dallo sbarco.' },
      { hours: 6, title: 'Zipline nella giungla', outline: ['Canopy tour zipline nella Sierra Madre (da prenotare)', 'Malecón al rientro', 'Zona Romántica', 'Rientro con margine'], notes: 'Rientro al molo entro 5 ore dallo sbarco.' },
      { hours: 8, title: 'Isole Marietas', outline: ['Barca per le Islas Marietas (Playa del Amor, da prenotare)', 'Snorkeling nella riserva marina protetta', 'Malecón al rientro', 'Rientro con largo margine'], notes: 'Accesso alla Playa del Amor contingentato: prenota prima dello sbarco. Rientro al molo entro 7 ore dallo sbarco.' },
    ],
  },
  {
    id: 'port-cabosanlucas', emoji: '🐳', port: 'Cabo San Lucas Tender Port', city: 'Cabo San Lucas', country: 'Messico',
    coords: { lat: 22.891, lon: -109.911 },
    transferNote: 'tender fino al molo cittadino (niente attracco diretto), poi tutto a piedi.',
    options: [
      { hours: 4, title: 'El Arco in barca', outline: ['Barca fino a El Arco, l\'arco di roccia simbolo di Cabo', 'Playa del Amor, tra Pacifico e Mar di Cortez', 'Marina e ristoranti', 'Margarita locale'], notes: 'Rientro a bordo entro 3 ore dallo sbarco.' },
      { hours: 6, title: 'Snorkeling e spiaggia', outline: ['Barca per El Arco', 'Snorkeling a Playa Santa María', 'Medano Beach nel pomeriggio', 'Rientro al tender'], notes: 'Rientro al molo entro 5 ore dallo sbarco.' },
      { hours: 8, title: 'Whale watching (stagionale)', outline: ['Whale watching (dicembre-aprile, megattere e balene grigie)', 'El Arco in barca', 'Medano Beach al rientro', 'Rientro con margine'], notes: 'Whale watching solo in stagione: fuori stagione sostituisci con snorkeling. Rientro al molo entro 7 ore dallo sbarco.' },
    ],
  },
  {
    id: 'port-ensenada', emoji: '🍷', port: 'Ensenada Cruise Terminal', city: 'Ensenada', country: 'Messico',
    coords: { lat: 31.86, lon: -116.6 },
    transferNote: 'il terminal è nel centro di Ensenada, tutto a piedi.',
    options: [
      { hours: 4, title: 'La Bufadora', outline: ['Taxi per La Bufadora, il soffione marino (~30 min)', 'Mercato del pesce di Ensenada', 'Fish taco all\'origine, dove sono nati', 'Malecón'], notes: 'Rientro a bordo entro 3 ore dallo sbarco.' },
      { hours: 6, title: 'La Bufadora e centro', outline: ['La Bufadora', 'Centro storico e Avenida Ruiz', 'Mercato del pesce', 'Rientro con margine'], notes: 'Rientro al terminal entro 5 ore dallo sbarco.' },
      { hours: 8, title: 'Valle de Guadalupe', outline: ['Trasferimento nella regione vinicola del Valle de Guadalupe (~45 min)', 'Degustazione in una o due cantine (prenotate)', 'Rientro verso Ensenada', 'Rientro con largo margine'], notes: 'Prenota il tour del vino prima dello sbarco: le cantine richiedono appuntamento. Rientro al terminal entro 7 ore dallo sbarco.' },
    ],
  },
  // ── Nord Europa e Baltico ───────────────────────────────────────────
  {
    id: 'port-oslo', emoji: '🛳', port: 'Oslo Cruise Port (Akershusstranda)', city: 'Oslo', country: 'Norvegia',
    coords: { lat: 59.907, lon: 10.735 },
    transferNote: 'il molo è a due passi dal centro, tutto a piedi.',
    options: [
      { hours: 4, title: 'Akershus e il municipio', outline: ['Fortezza di Akershus', 'Municipio (Rådhuset)', 'Aker Brygge sul fiordo', 'Salmone norvegese'], notes: 'Rientro a bordo entro 3 ore dallo sbarco.' },
      { hours: 6, title: 'Vigeland Park', outline: ['Akershus', 'Vigeland Park, le sculture di Gustav Vigeland', 'Karl Johans gate', 'Rientro con margine'], notes: 'Rientro al molo entro 5 ore dallo sbarco.' },
      { hours: 8, title: 'Musei vichinghi', outline: ['Traghetto per la penisola di Bygdøy', 'Museo delle navi vichinghe', 'Vigeland Park al rientro', 'Rientro con margine'], notes: 'Rientro al molo entro 7 ore dallo sbarco.' },
    ],
  },
  {
    id: 'port-helsinki', emoji: '🛳', port: 'Helsinki South Harbour', city: 'Helsinki', country: 'Finlandia',
    coords: { lat: 60.167, lon: 24.94 },
    transferNote: 'il molo è nel centro, Piazza del Mercato a 5 min a piedi.',
    options: [
      { hours: 4, title: 'Piazza del Senato e del Mercato', outline: ['Piazza del Mercato', 'Cattedrale di Helsinki e Piazza del Senato', 'Chiesa di roccia di Temppeliaukio', 'Cannella e caffè finlandese'], notes: 'Rientro a bordo entro 3 ore dallo sbarco.' },
      { hours: 6, title: 'Suomenlinna', outline: ['Traghetto per Suomenlinna, fortezza marittima UNESCO', 'Passeggiata tra i bastioni', 'Piazza del Mercato al rientro', 'Rientro con margine'], notes: 'Il traghetto per Suomenlinna è incluso nei trasporti pubblici cittadini. Rientro al molo entro 5 ore dallo sbarco.' },
      { hours: 8, title: 'Suomenlinna e Temppeliaukio', outline: ['Suomenlinna in traghetto', 'Chiesa di roccia di Temppeliaukio', 'Piazza del Senato', 'Rientro con margine'], notes: 'Rientro al molo entro 7 ore dallo sbarco.' },
    ],
  },
  {
    id: 'port-tallinn', emoji: '🏰', port: 'Tallinn Old City Harbour', city: 'Tallinn', country: 'Estonia',
    coords: { lat: 59.44, lon: 24.75 },
    transferNote: 'la Città Vecchia UNESCO è a 10 min a piedi dal molo.',
    options: [
      { hours: 4, title: 'Città Vecchia UNESCO', outline: ['Piazza del Municipio', 'Vicoli medievali della Città Vecchia', 'Colle di Toompea', 'Marzapane, dolce tradizionale'], notes: 'Rientro a bordo entro 3 ore dallo sbarco.' },
      { hours: 6, title: 'Toompea e le mura', outline: ['Città Vecchia', 'Colle di Toompea con la cattedrale ortodossa', 'Le mura e le torri difensive', 'Rientro con margine'], notes: 'Rientro al molo entro 5 ore dallo sbarco.' },
      { hours: 8, title: 'Tallinn con calma', outline: ['Città Vecchia e Toompea', 'Quartiere creativo di Telliskivi', 'Marzapane e caffè', 'Rientro con margine'], notes: 'Rientro al molo entro 7 ore dallo sbarco.' },
    ],
  },
  {
    id: 'port-riga', emoji: '🎨', port: 'Riga Passenger Terminal', city: 'Riga', country: 'Lettonia',
    coords: { lat: 56.947, lon: 24.106 },
    transferNote: 'taxi o bus dal terminal al centro storico (~10-15 min).',
    options: [
      { hours: 4, title: 'Città Vecchia', outline: ['Città Vecchia UNESCO', 'Duomo di Riga', 'Casa delle Teste Nere', 'Pane nero e miele locali'], notes: 'Rientro a bordo entro 3 ore dallo sbarco.' },
      { hours: 6, title: 'Art Nouveau', outline: ['Città Vecchia', 'Quartiere Art Nouveau, il più ricco d\'Europa', 'Mercato Centrale in vecchi hangar per zeppelin', 'Rientro con margine'], notes: 'Rientro al terminal entro 5 ore dallo sbarco.' },
      { hours: 8, title: 'Riga completa', outline: ['Città Vecchia', 'Quartiere Art Nouveau', 'Mercato Centrale', 'Parco Bastejkalns', 'Rientro con margine'], notes: 'Rientro al terminal entro 7 ore dallo sbarco.' },
    ],
  },
  {
    id: 'port-warnemunde', emoji: '🛳', port: 'Rostock/Warnemünde Cruise Pier', city: 'Rostock', country: 'Germania',
    coords: { lat: 54.18, lon: 12.08 },
    transferNote: 'Warnemünde è a piedi dal molo; Berlino è a 3 ore di treno, troppo lontana per uno scalo tipico.',
    options: [
      { hours: 4, title: 'Warnemünde', outline: ['Spiaggia e faro di Warnemünde', 'Alter Strom, il canale dei pescatori', 'Pesce affumicato locale', 'Passeggiata sul lungomare'], notes: 'Berlino NON è raggiungibile in sicurezza in questo tempo. Rientro a bordo entro 3 ore dallo sbarco.' },
      { hours: 6, title: 'Rostock storica', outline: ['Treno per Rostock (~20 min)', 'Centro storico anseatico', 'Chiesa di Santa Maria', 'Rientro a Warnemünde'], notes: 'Rientro al molo entro 5 ore dallo sbarco.' },
      { hours: 8, title: 'Rostock e Warnemünde', outline: ['Rostock storica in treno', 'Ritorno a Warnemünde per la spiaggia', 'Alter Strom', 'Rientro con margine'], notes: 'Rientro al molo entro 7 ore dallo sbarco.' },
    ],
  },
  {
    id: 'port-zeebrugge', emoji: '🛳', port: 'Zeebrugge Cruise Terminal', city: 'Zeebrugge', country: 'Belgio',
    coords: { lat: 51.33, lon: 3.2 },
    transferNote: 'Bruges è a 20-30 min di treno/bus dal terminal; Bruxelles a 1h15, più lontana.',
    options: [
      { hours: 4, title: 'Zeebrugge e dintorni', outline: ['Porto e diga di Zeebrugge', 'Spiaggia locale', 'Cozze e patatine fritte belghe', 'Passeggiata sul lungomare'], notes: 'Con 4 ore Bruges è troppo rischiosa: resta in zona. Rientro a bordo entro 3 ore dallo sbarco.' },
      { hours: 6, title: 'Bruges', outline: ['Treno o navetta per Bruges (~20-30 min)', 'Canali e Grote Markt', 'Basilica del Sacro Sangue', 'Cioccolato belga', 'Rientro in treno'], notes: 'Rientro al terminal entro 5 ore dallo sbarco.' },
      { hours: 8, title: 'Bruges con calma', outline: ['Bruges: canali, Grote Markt, Beguinaggio UNESCO', 'Giro in barca sui canali', 'Cioccolato e birra belga', 'Rientro con margine'], notes: 'Bruxelles resta sconsigliata anche con 8 ore: troppo distante per un rientro sereno. Rientro al terminal entro 7 ore dallo sbarco.' },
    ],
  },
  {
    id: 'port-lehavre', emoji: '🛳', port: 'Port du Havre', city: 'Le Havre', country: 'Francia',
    coords: { lat: 49.49, lon: 0.11 },
    transferNote: 'Parigi è a 2h10 di treno diretto da Le Havre; Étretat a 40 min di bus/taxi.',
    options: [
      { hours: 4, title: 'Le Havre moderna', outline: ['Le Havre, città UNESCO ricostruita da Perret', 'Chiesa di Saint-Joseph', 'Bassin du Commerce', 'Moules-frites sul porto'], notes: 'Parigi NON è prudente con 4 ore. Rientro a bordo entro 3 ore dallo sbarco.' },
      { hours: 6, title: 'Le scogliere di Étretat', outline: ['Taxi o tour per Étretat (~40 min)', 'Le celebri scogliere bianche e l\'arco naturale', 'Passeggiata sulla falaise', 'Rientro a Le Havre'], notes: 'Rientro al porto entro 5 ore dallo sbarco.' },
      { hours: 8, title: 'Parigi lampo col treno diretto', outline: ['Treno diretto per Parigi Saint-Lazare (~2h10)', 'Torre Eiffel e Champ de Mars', 'Rientro col treno con largo anticipo'], notes: 'Fattibile SOLO col treno diretto e senza coincidenze: restano circa 2-3 ore effettive a Parigi. Alternativa più serena: Étretat. Rientro al porto entro 7 ore dallo sbarco.' },
    ],
  },
  {
    id: 'port-dover', emoji: '🛳', port: 'Port of Dover', city: 'Dover', country: 'Regno Unito',
    coords: { lat: 51.13, lon: 1.31 },
    transferNote: 'Londra è a 1h05-1h15 di treno diretto da Dover Priory; il castello è a piedi dal porto.',
    options: [
      { hours: 4, title: 'Dover Castle e le White Cliffs', outline: ['Dover Castle, la "chiave d\'Inghilterra"', 'Le White Cliffs of Dover', 'Passeggiata sul lungomare', 'Fish and chips'], notes: 'Con 4 ore Londra è fuori discussione. Rientro a bordo entro 3 ore dallo sbarco.' },
      { hours: 6, title: 'Canterbury', outline: ['Treno per Canterbury (~20 min)', 'Cattedrale UNESCO', 'Centro medievale', 'Rientro in treno'], notes: 'Rientro al porto entro 5 ore dallo sbarco.' },
      { hours: 8, title: 'Londra lampo col treno diretto', outline: ['Treno diretto per Londra (~1h05)', 'Westminster e Big Ben', 'London Eye o Trafalgar Square', 'Rientro col treno con largo anticipo'], notes: 'Restano circa 3-4 ore effettive a Londra: niente musei con coda. Alternativa più serena: Canterbury o Dover Castle. Rientro al porto entro 7 ore dallo sbarco.' },
    ],
  },
  {
    id: 'port-kiel', emoji: '⚓', port: 'Kiel Cruise Terminal', city: 'Kiel', country: 'Germania',
    coords: { lat: 54.32, lon: 10.14 },
    transferNote: 'il terminal è vicino al centro, 15-20 min a piedi o navetta.',
    options: [
      { hours: 4, title: 'Kiel sul fiordo', outline: ['Fördepromenade, la passeggiata sul fiordo', 'Centro di Kiel', 'Mercato del pesce', 'Fischbrötchen, il panino al pesce locale'], notes: 'Rientro a bordo entro 3 ore dallo sbarco.' },
      { hours: 6, title: 'Memoriale navale di Laboe', outline: ['Kiel centro', 'Memoriale navale di Laboe con U-Boot visitabile', 'Fördepromenade al rientro', 'Rientro con margine'], notes: 'Rientro al terminal entro 5 ore dallo sbarco.' },
      { hours: 8, title: 'Kiel e Laboe con calma', outline: ['Centro di Kiel', 'Traghetto sul fiordo per Laboe', 'Memoriale navale e spiaggia', 'Rientro con margine'], notes: 'Rientro al terminal entro 7 ore dallo sbarco.' },
    ],
  },
  // ── Adriatico e Mediterraneo, altri porti ──────────────────────────
  {
    id: 'port-split', emoji: '🏛', port: 'Split Cruise Port', city: 'Split', country: 'Croazia',
    coords: { lat: 43.51, lon: 16.44 },
    transferNote: 'il Palazzo di Diocleziano è a 10-15 min a piedi dal molo.',
    options: [
      { hours: 4, title: 'Palazzo di Diocleziano', outline: ['Palazzo di Diocleziano UNESCO, il centro storico VIVE dentro le sue mura romane', 'Peristilio e cattedrale di San Doimo', 'Riva, il lungomare', 'Pesce alla griglia'], notes: 'Rientro a bordo entro 3 ore dallo sbarco.' },
      { hours: 6, title: 'Palazzo e collina di Marjan', outline: ['Palazzo di Diocleziano', 'Collina di Marjan per il panorama', 'Riva al rientro', 'Rientro con margine'], notes: 'Rientro al molo entro 5 ore dallo sbarco.' },
      { hours: 8, title: 'Split completa', outline: ['Palazzo di Diocleziano', 'Collina di Marjan', 'Mercato locale', 'Riva e gelato', 'Rientro con margine'], notes: 'Rientro al molo entro 7 ore dallo sbarco.' },
    ],
  },
  {
    id: 'port-zadar', emoji: '🎵', port: 'Zadar Cruise Port', city: 'Zadar', country: 'Croazia',
    coords: { lat: 44.12, lon: 15.23 },
    transferNote: 'il centro storico è a 10 min a piedi dal molo.',
    options: [
      { hours: 4, title: 'L\'organo marino', outline: ['Organo Marino, unico al mondo (le onde suonano)', 'Saluto al Sole, installazione solare', 'Foro romano', 'Maraschino, il liquore locale'], notes: 'Rientro a bordo entro 3 ore dallo sbarco.' },
      { hours: 6, title: 'Città vecchia e cattedrale', outline: ['Organo Marino e Saluto al Sole', 'Cattedrale di Sant\'Anastasia', 'Mura veneziane', 'Rientro con margine'], notes: 'Rientro al molo entro 5 ore dallo sbarco.' },
      { hours: 8, title: 'Zadar completa', outline: ['Organo Marino', 'Foro romano e cattedrale', 'Isole Kornati viste dal lungomare (o gita in barca se disponibile)', 'Rientro con margine'], notes: 'Rientro al molo entro 7 ore dallo sbarco.' },
    ],
  },
  {
    id: 'port-katakolon', emoji: '🏛', port: 'Katakolon Port', city: 'Olimpia', country: 'Grecia',
    coords: { lat: 37.65, lon: 21.32 },
    transferNote: 'Katakolon è un villaggio-porto; Olimpia antica è a 35-40 min di treno storico o bus.',
    options: [
      { hours: 4, title: 'Katakolon paese', outline: ['Il piccolo porto e il lungomare', 'Museo dell\'olio d\'oliva', 'Spiaggia locale', 'Olive e feta'], notes: 'Con 4 ore Olimpia è rischiosa tra andata/ritorno: resta sul porto. Rientro a bordo entro 3 ore dallo sbarco.' },
      { hours: 6, title: 'Olimpia antica', outline: ['Treno storico o bus per Olimpia (~35-40 min)', 'Sito archeologico, culla delle Olimpiadi', 'Museo archeologico', 'Rientro con margine'], notes: 'Rientro al porto entro 5 ore dallo sbarco.' },
      { hours: 8, title: 'Olimpia con calma', outline: ['Olimpia antica e museo', 'Katakolon al rientro per il lungomare', 'Olio d\'oliva locale', 'Rientro con margine'], notes: 'Rientro al porto entro 7 ore dallo sbarco.' },
    ],
  },
  {
    id: 'port-nafplio', emoji: '🏰', port: 'Nafplio Port', city: 'Nafplio', country: 'Grecia',
    coords: { lat: 37.57, lon: 22.8 },
    transferNote: 'il porto è nel centro di Nafplio; Micene ed Epidauro sono a 30-45 min d\'auto.',
    options: [
      { hours: 4, title: 'Nafplio veneziana', outline: ['Centro storico veneziano', 'Fortezza di Palamidi (vista dal basso o salita per i più allenati)', 'Bourtzi, il fortino sull\'acqua', 'Passeggiata sul porto'], notes: 'Rientro a bordo entro 3 ore dallo sbarco.' },
      { hours: 6, title: 'Micene', outline: ['Auto o tour per Micene (~40 min)', 'Sito miceneo UNESCO e Porta dei Leoni', 'Nafplio al rientro', 'Rientro con margine'], notes: 'Rientro al porto entro 5 ore dallo sbarco.' },
      { hours: 8, title: 'Epidauro e Micene', outline: ['Teatro di Epidauro, acustica perfetta duemila anni dopo', 'Micene e la Porta dei Leoni', 'Nafplio al rientro', 'Rientro con margine'], notes: 'Tour organizzato consigliato per coprire entrambi i siti in giornata. Rientro al porto entro 7 ore dallo sbarco.' },
    ],
  },
  {
    id: 'port-alicante', emoji: '🏖', port: 'Puerto de Alicante', city: 'Alicante', country: 'Spagna',
    coords: { lat: 38.35, lon: -0.48 },
    transferNote: 'il porto è a 10 min a piedi dal centro.',
    options: [
      { hours: 4, title: 'Castello di Santa Bárbara', outline: ['Ascensore per il Castello di Santa Bárbara', 'Vista sulla città e sul Mediterraneo', 'Explanada de España, la passeggiata a mosaico', 'Turrón locale'], notes: 'Rientro a bordo entro 3 ore dallo sbarco.' },
      { hours: 6, title: 'Castello e centro storico', outline: ['Castello di Santa Bárbara', 'Barrio de Santa Cruz, le case colorate', 'Explanada', 'Rientro con margine'], notes: 'Rientro al porto entro 5 ore dallo sbarco.' },
      { hours: 8, title: 'Alicante completa', outline: ['Castello di Santa Bárbara', 'Barrio de Santa Cruz', 'Spiaggia del Postiguet', 'Explanada al tramonto', 'Rientro con margine'], notes: 'Rientro al porto entro 7 ore dallo sbarco.' },
    ],
  },
  {
    id: 'port-malaga', emoji: '🎨', port: 'Puerto de Málaga', city: 'Málaga', country: 'Spagna',
    coords: { lat: 36.72, lon: -4.42 },
    transferNote: 'il porto è a 10-15 min a piedi dal centro storico.',
    options: [
      { hours: 4, title: 'Malaga di Picasso', outline: ['Museo Picasso (esterno o visita rapida)', 'Alcazaba, la fortezza moresca', 'Centro storico', 'Espetos, spiedini di sardine sulla spiaggia'], notes: 'Rientro a bordo entro 3 ore dallo sbarco.' },
      { hours: 6, title: 'Alcazaba e Gibralfaro', outline: ['Alcazaba', 'Castello di Gibralfaro con vista sul porto', 'Museo Picasso', 'Rientro con margine'], notes: 'Rientro al porto entro 5 ore dallo sbarco.' },
      { hours: 8, title: 'Malaga completa', outline: ['Alcazaba e Gibralfaro', 'Museo Picasso', 'Playa de la Malagueta', 'Rientro con margine'], notes: 'Il Caminito del Rey è troppo lontano (1h30) per uno scalo tipico: non tentarlo. Rientro al porto entro 7 ore dallo sbarco.' },
    ],
  },
  {
    id: 'port-cartagena-es', emoji: '🏛', port: 'Puerto de Cartagena', city: 'Cartagena', country: 'Spagna',
    coords: { lat: 37.6, lon: -0.98 },
    transferNote: 'il porto è a 5-10 min a piedi dal centro.',
    options: [
      { hours: 4, title: 'Cartagena romana', outline: ['Teatro Romano', 'Muralla del Mar', 'Plaza del Ayuntamiento', 'Marinera, lo snack locale'], notes: 'Rientro a bordo entro 3 ore dallo sbarco.' },
      { hours: 6, title: 'Cartagena punica e romana', outline: ['Teatro Romano', 'Museo del Teatro Romano', 'Muralla Púnica', 'Rientro con margine'], notes: 'Rientro al porto entro 5 ore dallo sbarco.' },
      { hours: 8, title: 'Cartagena completa', outline: ['Teatro Romano e museo', 'Muralla Púnica', 'Castillo de la Concepción', 'Rientro con margine'], notes: 'Rientro al porto entro 7 ore dallo sbarco.' },
    ],
  },
  // ── Canarie e Atlantico ─────────────────────────────────────────────
  {
    id: 'port-laspalmas', emoji: '🏖', port: 'Puerto de La Luz', city: 'Las Palmas de Gran Canaria', country: 'Spagna',
    coords: { lat: 28.15, lon: -15.43 },
    transferNote: 'navetta o taxi dal porto a Vegueta (~10-15 min).',
    options: [
      { hours: 4, title: 'Vegueta coloniale', outline: ['Vegueta, il quartiere coloniale', 'Cattedrale di Santa Ana', 'Casa di Colombo', 'Playa de Las Canteras'], notes: 'Rientro a bordo entro 3 ore dallo sbarco.' },
      { hours: 6, title: 'Vegueta e Las Canteras', outline: ['Vegueta', 'Playa de Las Canteras, tra le più belle spiagge urbane d\'Europa', 'Passeggio sul lungomare', 'Rientro con margine'], notes: 'Rientro al porto entro 5 ore dallo sbarco.' },
      { hours: 8, title: 'Gran Canaria completa', outline: ['Vegueta', 'Las Canteras per il bagno', 'Mercato del Puerto', 'Rientro con margine'], notes: 'Le dune di Maspalomas sono troppo lontane (45 min) per uno scalo di 8 ore prudente: resta in città. Rientro al porto entro 7 ore dallo sbarco.' },
    ],
  },
  {
    id: 'port-tenerife', emoji: '🌋', port: 'Puerto de Santa Cruz de Tenerife', city: 'Santa Cruz de Tenerife', country: 'Spagna',
    coords: { lat: 28.47, lon: -16.25 },
    transferNote: 'il centro è a piedi dal porto; il Teide è a 1h-1h15 d\'auto.',
    options: [
      { hours: 4, title: 'Santa Cruz', outline: ['Auditorio de Tenerife', 'Plaza de España', 'Mercado Nuestra Señora de África', 'Mojo picón e papas arrugadas'], notes: 'Rientro a bordo entro 3 ore dallo sbarco.' },
      { hours: 6, title: 'La Laguna UNESCO', outline: ['Santa Cruz', 'San Cristóbal de La Laguna, centro storico UNESCO (~20 min)', 'Rientro a Santa Cruz', 'Rientro con margine'], notes: 'Rientro al porto entro 5 ore dallo sbarco.' },
      { hours: 8, title: 'Parco Nazionale del Teide', outline: ['Trasferimento al Teide (~1h-1h15, tour organizzato consigliato)', 'Paesaggio lunare del parco nazionale', 'Funivia se il tempo lo consente (biglietto prenotato)', 'Rientro con largo margine'], notes: 'Serve un tour organizzato per rispettare i tempi: non tentarlo con mezzi pubblici. Rientro al porto entro 7 ore dallo sbarco.' },
    ],
  },
  {
    id: 'port-funchal', emoji: '🌸', port: 'Porto do Funchal', city: 'Funchal', country: 'Portogallo (Madeira)',
    coords: { lat: 32.65, lon: -16.91 },
    transferNote: 'il centro storico è a 10-15 min a piedi dal porto.',
    options: [
      { hours: 4, title: 'Funchal storica', outline: ['Mercado dos Lavradores, il mercato dei fiori e frutti tropicali', 'Zona Velha, il quartiere vecchio', 'Cattedrale Sé', 'Poncha, il liquore locale'], notes: 'Rientro a bordo entro 3 ore dallo sbarco.' },
      { hours: 6, title: 'Monte e slittino di vimini', outline: ['Funicolare per Monte', 'Giardini tropicali di Monte Palace', 'Discesa in slittino di vimini (carro de cesto), tradizione ottocentesca', 'Rientro in centro'], notes: 'Rientro al porto entro 5 ore dallo sbarco.' },
      { hours: 8, title: 'Monte e levada', outline: ['Monte e lo slittino di vimini', 'Breve passeggiata su una levada, i canali d\'irrigazione storici', 'Mercado dos Lavradores al rientro', 'Rientro con margine'], notes: 'Rientro al porto entro 7 ore dallo sbarco.' },
    ],
  },
  {
    id: 'port-pontadelgada', emoji: '🌋', port: 'Porto de Ponta Delgada', city: 'Ponta Delgada', country: 'Portogallo (Azzorre)',
    coords: { lat: 37.74, lon: -25.67 },
    transferNote: 'il centro è a piedi dal porto; Sete Cidades è a 40-45 min d\'auto.',
    options: [
      { hours: 4, title: 'Ponta Delgada', outline: ['Portas da Cidade, l\'ingresso storico', 'Forte de São Brás', 'Mercato locale con ananas delle Azzorre', 'Passeggiata sul lungomare'], notes: 'Rientro a bordo entro 3 ore dallo sbarco.' },
      { hours: 6, title: 'Lagoa das Furnas', outline: ['Trasferimento a Furnas (~50 min, tour consigliato)', 'Sorgenti termali e fumarole vulcaniche', 'Cozido das Furnas, cotto sottoterra dal calore vulcanico', 'Rientro con margine'], notes: 'Rientro al porto entro 5 ore dallo sbarco.' },
      { hours: 8, title: 'Sete Cidades', outline: ['Trasferimento al cratere di Sete Cidades (~45 min, tour consigliato)', 'I due laghi gemelli, uno verde uno blu, nella stessa caldera', 'Ponta Delgada al rientro', 'Rientro con largo margine'], notes: 'Serve un tour organizzato per i tempi. Rientro al porto entro 7 ore dallo sbarco.' },
    ],
  },
  // ── Nord Africa e Mar Rosso ─────────────────────────────────────────
  {
    id: 'port-alessandria', emoji: '🏛', port: 'Porto di Alessandria d\'Egitto', city: 'Alessandria', country: 'Egitto',
    coords: { lat: 31.2, lon: 29.92 },
    transferNote: 'il centro è a 10-15 min di taxi dal porto; il Cairo/Giza è a 3 ore di strada, troppo lontano per uno scalo tipico.',
    options: [
      { hours: 4, title: 'Alessandria antica', outline: ['Cittadella di Qaitbay, sul sito dell\'antico Faro', 'Bibliotheca Alexandrina (esterno o visita rapida)', 'Corniche sul Mediterraneo', 'Tè alla menta'], notes: 'Il Cairo e le Piramidi NON sono raggiungibili in sicurezza in questo tempo. Rientro a bordo entro 3 ore dallo sbarco.' },
      { hours: 6, title: 'Catacombe e biblioteca', outline: ['Bibliotheca Alexandrina', 'Catacombe di Kom el Shoqafa', 'Cittadella di Qaitbay', 'Rientro con margine'], notes: 'Rientro al porto entro 5 ore dallo sbarco.' },
      { hours: 8, title: 'Alessandria completa', outline: ['Cittadella di Qaitbay', 'Bibliotheca Alexandrina', 'Catacombe di Kom el Shoqafa', 'Corniche', 'Rientro con margine'], notes: 'Anche con 8 ore il Cairo resta sconsigliato: 6 ore di solo trasferimento A/R senza margine di sicurezza. Rientro al porto entro 7 ore dallo sbarco.' },
    ],
  },
  {
    id: 'port-portsaid', emoji: '⚓', port: 'Porto di Port Said', city: 'Port Said', country: 'Egitto',
    coords: { lat: 31.26, lon: 32.3 },
    transferNote: 'il centro è a piedi dal porto; il Cairo è a 3 ore, troppo lontano per uno scalo tipico.',
    options: [
      { hours: 4, title: 'Port Said coloniale', outline: ['Lungomare e i palazzi in stile coloniale', 'Museo Militare del Canale di Suez', 'Ingresso settentrionale del Canale di Suez', 'Mercato locale'], notes: 'Rientro a bordo entro 3 ore dallo sbarco.' },
      { hours: 6, title: 'Ismailia', outline: ['Trasferimento a Ismailia sul Canale (~1h)', 'Museo del Canale di Suez', 'Lungo canale', 'Rientro con margine'], notes: 'Rientro al porto entro 5 ore dallo sbarco.' },
      { hours: 8, title: 'Port Said e Ismailia', outline: ['Ismailia e il museo del Canale', 'Port Said al rientro', 'Lungomare', 'Rientro con margine'], notes: 'Il Cairo resta sconsigliato anche con 8 ore. Rientro al porto entro 7 ore dallo sbarco.' },
    ],
  },
  {
    id: 'port-safaga', emoji: '🏛', port: 'Porto di Safaga', city: 'Safaga', country: 'Egitto',
    coords: { lat: 26.73, lon: 33.94 },
    transferNote: 'Luxor è a 3-3,5 ore di strada da Safaga: è l\'escursione più richiesta ma richiede uno scalo lungo con partenza all\'alba.',
    options: [
      { hours: 4, title: 'Safaga e il Mar Rosso', outline: ['Spiaggia e snorkeling vicino al porto', 'Barriera corallina del Mar Rosso', 'Mercato locale', 'Tè egiziano'], notes: 'Con 4-6 ore Luxor è IMPOSSIBILE (6-7 ore di solo trasferimento A/R): resta sul Mar Rosso. Rientro a bordo entro 3 ore dallo sbarco.' },
      { hours: 6, title: 'Deserto e Mar Rosso', outline: ['Snorkeling sulla barriera corallina', 'Escursione in quad nel deserto vicino', 'Villaggio beduino', 'Rientro con margine'], notes: 'Rientro al porto entro 5 ore dallo sbarco.' },
      { hours: 8, title: 'Valle dei Re a Luxor (solo scali lunghi)', outline: ['Trasferimento a Luxor all\'alba (~3-3,5h)', 'Valle dei Re e Tempio di Karnak (tour organizzato obbligatorio)', 'Rientro a Safaga nel tardo pomeriggio/sera'], notes: 'ATTENZIONE: anche con 8 ore dichiarate questa escursione richiede tipicamente 10-12 ore reali con partenza prima delle 6: fattibile SOLO se la nave resta in porto un\'intera giornata lunga con partenza serale, mai con un scalo standard da 8h. Verifica sempre l\'orario reale di partenza della nave prima di prenotarla. Se il tempo è inferiore, resta sul Mar Rosso.' },
    ],
  },
  {
    id: 'port-salalah', emoji: '🐫', port: 'Porto di Salalah', city: 'Salalah', country: 'Oman',
    coords: { lat: 17.02, lon: 54.09 },
    transferNote: 'taxi dal porto al centro e ai siti (~15-30 min).',
    options: [
      { hours: 4, title: 'Salalah e l\'incenso', outline: ['Al Husn Souq, il mercato dell\'incenso', 'Tomba di Nabi Ayoub (Giobbe)', 'Palazzo del Sultano (esterno)', 'Datteri e caffè omanita'], notes: 'Rientro a bordo entro 3 ore dallo sbarco.' },
      { hours: 6, title: 'Wadi Darbat', outline: ['Wadi Darbat, cascate e laghi (spettacolari durante il monsone khareef)', 'Al Husn Souq', 'Rientro con margine'], notes: 'Rientro al porto entro 5 ore dallo sbarco.' },
      { hours: 8, title: 'Salalah completa', outline: ['Wadi Darbat', 'Grotta di Tiq o spiaggia di Mughsail con i suoi blowhole', 'Al Husn Souq al rientro', 'Rientro con margine'], notes: 'Rientro al porto entro 7 ore dallo sbarco.' },
    ],
  },
  {
    id: 'port-muscat', emoji: '🕌', port: 'Porto di Muscat', city: 'Muscat', country: 'Oman',
    coords: { lat: 23.59, lon: 58.4 },
    transferNote: 'taxi dal porto ai principali siti (~15-25 min).',
    options: [
      { hours: 4, title: 'Muttrah', outline: ['Corniche di Muttrah', 'Souq di Muttrah, uno dei più antichi del Golfo', 'Forti gemelli sulle alture', 'Halwa omanita e caffè alla cardamomo'], notes: 'Rientro a bordo entro 3 ore dallo sbarco.' },
      { hours: 6, title: 'Grande Moschea del Sultano Qaboos', outline: ['Grande Moschea del Sultano Qaboos (abbigliamento coperto obbligatorio)', 'Souq di Muttrah', 'Corniche', 'Rientro con margine'], notes: 'Rientro al porto entro 5 ore dallo sbarco.' },
      { hours: 8, title: 'Muscat completa', outline: ['Grande Moschea del Sultano Qaboos', 'Royal Opera House (esterno)', 'Souq di Muttrah', 'Corniche al tramonto', 'Rientro con margine'], notes: 'Rientro al porto entro 7 ore dallo sbarco.' },
    ],
  },
  {
    id: 'port-abudhabi', emoji: '🕌', port: 'Zayed Port', city: 'Abu Dhabi', country: 'Emirati Arabi Uniti',
    coords: { lat: 24.49, lon: 54.37 },
    transferNote: 'taxi dal porto ai principali siti (~15-25 min).',
    options: [
      { hours: 4, title: 'Corniche e centro', outline: ['Corniche di Abu Dhabi', 'Qasr Al Hosn, il forte storico', 'Souq tradizionale', 'Datteri e caffè arabo'], notes: 'Rientro a bordo entro 3 ore dallo sbarco.' },
      { hours: 6, title: 'Grande Moschea Sheikh Zayed', outline: ['Grande Moschea Sheikh Zayed (abbigliamento coperto obbligatorio)', 'Corniche', 'Rientro con margine'], notes: 'Rientro al porto entro 5 ore dallo sbarco.' },
      { hours: 8, title: 'Moschea e Louvre Abu Dhabi', outline: ['Grande Moschea Sheikh Zayed', 'Louvre Abu Dhabi (biglietto prenotato)', 'Corniche al tramonto', 'Rientro con margine'], notes: 'Rientro al porto entro 7 ore dallo sbarco.' },
    ],
  },
  // ── Asia ────────────────────────────────────────────────────────────
  {
    id: 'port-shanghai', emoji: '🏙', port: 'Shanghai Cruise Port', city: 'Shanghai', country: 'Cina',
    coords: { lat: 31.23, lon: 121.47 },
    transferNote: 'taxi o metro dal terminal al Bund (~20-30 min secondo il terminal).',
    options: [
      { hours: 4, title: 'Il Bund', outline: ['Il Bund, lo skyline sul fiume Huangpu', 'Nanjing Road pedonale', 'Yu Garden', 'Xiaolongbao, i ravioli al vapore'], notes: 'Rientro a bordo entro 3 ore dallo sbarco.' },
      { hours: 6, title: 'Bund e Pudong', outline: ['Il Bund', 'Metro per Pudong: skyline dei grattacieli', 'Yu Garden', 'Rientro con margine'], notes: 'Rientro al terminal entro 5 ore dallo sbarco.' },
      { hours: 8, title: 'Shanghai completa', outline: ['Il Bund e Pudong', 'Yu Garden e il quartiere della Città Vecchia', 'Nanjing Road', 'Rientro con margine'], notes: 'Rientro al terminal entro 7 ore dallo sbarco.' },
    ],
  },
  {
    id: 'port-yokohama', emoji: '🗼', port: 'Osanbashi Pier', city: 'Yokohama', country: 'Giappone',
    coords: { lat: 35.45, lon: 139.64 },
    transferNote: 'Yokohama Chinatown è a 15 min a piedi; Tokyo è a 30-40 min di treno.',
    options: [
      { hours: 4, title: 'Yokohama', outline: ['Minato Mirai, lo skyline sul mare', 'Chinatown, la più grande del Giappone', 'Cosmo World con la ruota panoramica', 'Ramen o dim sum'], notes: 'Rientro a bordo entro 3 ore dallo sbarco.' },
      { hours: 6, title: 'Tokyo lampo', outline: ['Treno per Tokyo (~30-40 min)', 'Shibuya crossing', 'Rientro in treno', 'Chinatown a Yokohama'], notes: 'Rientro al molo entro 5 ore dallo sbarco.' },
      { hours: 8, title: 'Tokyo essenziale', outline: ['Treno per Tokyo', 'Shibuya e Harajuku', 'Tempio Senso-ji ad Asakusa se il tempo lo consente', 'Rientro in treno con margine'], notes: 'A differenza di molti scali, Tokyo da Yokohama è genuinamente fattibile grazie al treno rapido. Rientro al molo entro 7 ore dallo sbarco.' },
    ],
  },
  {
    id: 'port-kobe', emoji: '⛩', port: 'Kobe Port Terminal', city: 'Kobe', country: 'Giappone',
    coords: { lat: 34.68, lon: 135.19 },
    transferNote: 'il centro di Kobe è a piedi; Osaka è a 25-30 min di treno.',
    options: [
      { hours: 4, title: 'Kobe', outline: ['Kobe Harborland', 'Quartiere di Kitano con le case straniere storiche', 'Chinatown di Nankinmachi', 'Manzo di Kobe (se il budget lo consente)'], notes: 'Rientro a bordo entro 3 ore dallo sbarco.' },
      { hours: 6, title: 'Osaka Castle', outline: ['Treno per Osaka (~25-30 min)', 'Castello di Osaka', 'Dotonbori per uno scorcio', 'Rientro in treno'], notes: 'Rientro al terminal entro 5 ore dallo sbarco.' },
      { hours: 8, title: 'Osaka completa', outline: ['Castello di Osaka', 'Dotonbori e i suoi neon', 'Kuromon Market per lo street food', 'Rientro con margine'], notes: 'Rientro al terminal entro 7 ore dallo sbarco.' },
    ],
  },
  {
    id: 'port-busan', emoji: '🐟', port: 'Busan Port International Terminal', city: 'Busan', country: 'Corea del Sud',
    coords: { lat: 35.1, lon: 129.04 },
    transferNote: 'taxi o metro dal terminal ai quartieri principali (~15-25 min).',
    options: [
      { hours: 4, title: 'Gamcheon Culture Village', outline: ['Gamcheon Culture Village, il villaggio colorato sulla collina', 'Jagalchi Fish Market, il più grande mercato del pesce della Corea', 'Nampo-dong', 'Sashimi coreano (hoe)'], notes: 'Rientro a bordo entro 3 ore dallo sbarco.' },
      { hours: 6, title: 'Haeundae Beach', outline: ['Gamcheon Culture Village', 'Haeundae Beach, la spiaggia più famosa della Corea', 'Jagalchi Market al rientro', 'Rientro con margine'], notes: 'Rientro al terminal entro 5 ore dallo sbarco.' },
      { hours: 8, title: 'Busan completa', outline: ['Gamcheon Culture Village', 'Haeundae Beach', 'Tempio Haedong Yonggungsa sul mare', 'Rientro con margine'], notes: 'Rientro al terminal entro 7 ore dallo sbarco.' },
    ],
  },
  {
    id: 'port-hochiminh', emoji: '🛺', port: 'Phu My Port', city: 'Ho Chi Minh City', country: 'Vietnam',
    coords: { lat: 10.58, lon: 107.02 },
    transferNote: 'Ho Chi Minh City è a 1h30-2h di strada da Phu My: uno degli scali con trasferimento più lungo, va gestito con prudenza.',
    options: [
      { hours: 4, title: 'Solo se il trasferimento è già incluso', outline: ['Nota: con 4 ore il trasferimento da solo consuma quasi tutto il tempo', 'Se possibile, mercato locale vicino al porto', 'Vita fluviale del delta del Mekong', 'Rientro immediato'], notes: 'Con 4-6 ore Ho Chi Minh City NON è raggiungibile in sicurezza: valuta di restare vicino al porto. Rientro a bordo entro 3 ore dallo sbarco.' },
      { hours: 6, title: 'Ancora rischioso', outline: ['Il trasferimento A/R consuma 3-4 ore da solo', 'Se il tour è organizzato dalla nave con partenza rapida, centro storico essenziale', 'Altrimenti resta in area portuale', 'Rientro con margine'], notes: 'Verifica sempre l\'orario reale di attracco: 6 ore dichiarate spesso significano 4 ore utili dopo sbarco/reimbarco. Rientro al porto entro 5 ore dallo sbarco.' },
      { hours: 8, title: 'Ho Chi Minh City essenziale', outline: ['Trasferimento organizzato per Ho Chi Minh City (~1h30-2h)', 'Palazzo della Riunificazione e Cattedrale di Notre-Dame', 'Mercato Ben Thanh', 'Rientro con largo margine'], notes: 'Fattibile SOLO con tour organizzato dalla nave/agenzia e partenza immediata allo sbarco. I tunnel di Cu Chi richiedono un\'intera giornata a sé: non abbinarli. Rientro al porto entro 7 ore dallo sbarco.' },
    ],
  },
  {
    id: 'port-laemchabang', emoji: '🛺', port: 'Laem Chabang Port', city: 'Bangkok', country: 'Thailandia',
    coords: { lat: 13.09, lon: 100.89 },
    transferNote: 'Bangkok è a 1h30-2h di strada da Laem Chabang; Pattaya è molto più vicina (~30 min).',
    options: [
      { hours: 4, title: 'Pattaya', outline: ['Taxi per Pattaya (~30 min)', 'Spiaggia e lungomare', 'Mercato locale', 'Pad thai di strada'], notes: 'Bangkok NON è raggiungibile in sicurezza con 4 ore. Rientro a bordo entro 3 ore dallo sbarco.' },
      { hours: 6, title: 'Pattaya con più tempo', outline: ['Pattaya: spiaggia e tempio Wat Phra Yai (Big Buddha)', 'Mercato galleggiante nei dintorni se il tempo lo consente', 'Rientro con margine'], notes: 'Rientro al porto entro 5 ore dallo sbarco.' },
      { hours: 8, title: 'Bangkok essenziale', outline: ['Trasferimento organizzato per Bangkok (~1h30-2h)', 'Grand Palace e Wat Phra Kaew', 'Wat Pho, il Buddha sdraiato', 'Rientro con largo margine'], notes: 'Fattibile SOLO con tour organizzato e partenza rapida allo sbarco: restano 3-4 ore effettive a Bangkok. Se il traffico è un rischio, preferisci Pattaya. Rientro al porto entro 7 ore dallo sbarco.' },
    ],
  },
  {
    id: 'port-benoa', emoji: '🌺', port: 'Benoa Harbour', city: 'Bali', country: 'Indonesia',
    coords: { lat: -8.75, lon: 115.21 },
    transferNote: 'taxi dal porto ai siti principali (~20-40 min secondo la zona).',
    options: [
      { hours: 4, title: 'Nusa Dua', outline: ['Spiaggia di Nusa Dua', 'Tempio Uluwatu (se il tempo lo consente, ~40 min)', 'Mercato dell\'artigianato', 'Nasi goreng locale'], notes: 'Rientro a bordo entro 3 ore dallo sbarco.' },
      { hours: 6, title: 'Uluwatu', outline: ['Tempio di Uluwatu sulla scogliera', 'Danza Kecak al tramonto (se gli orari coincidono)', 'Spiaggia di Nusa Dua', 'Rientro con margine'], notes: 'Ubud è troppo lontana (1h30+) per uno scalo di 6 ore. Rientro al porto entro 5 ore dallo sbarco.' },
      { hours: 8, title: 'Uluwatu e risaie', outline: ['Tempio di Uluwatu', 'Risaie a terrazza vicine (Jatiluwih è troppo lontana, meglio quelle di Bukit)', 'Nusa Dua per il bagno', 'Rientro con margine'], notes: 'Ubud e le sue risaie iconiche restano fuori portata anche con 8 ore: dichiaralo sempre. Rientro al porto entro 7 ore dallo sbarco.' },
    ],
  },
  {
    id: 'port-colombo', emoji: '🐘', port: 'Colombo Port', city: 'Colombo', country: 'Sri Lanka',
    coords: { lat: 6.95, lon: 79.84 },
    transferNote: 'il centro di Colombo è a piedi/taxi breve dal porto; Galle è a 2 ore di strada.',
    options: [
      { hours: 4, title: 'Colombo', outline: ['Galle Face Green, il lungomare cittadino', 'Pettah Market', 'Tempio Gangaramaya', 'Tè di Ceylon'], notes: 'Rientro a bordo entro 3 ore dallo sbarco.' },
      { hours: 6, title: 'Colombo completa', outline: ['Galle Face Green', 'Pettah Market e Tempio Gangaramaya', 'Museo Nazionale', 'Rientro con margine'], notes: 'Rientro al porto entro 5 ore dallo sbarco.' },
      { hours: 8, title: 'Galle Fort (solo scali lunghi)', outline: ['Trasferimento a Galle (~2h, tour organizzato)', 'Forte olandese UNESCO sul mare', 'Rientro a Colombo nel tardo pomeriggio'], notes: 'Il trasferimento consuma 4 ore A/R: fattibile solo con partenza mattutina immediata e nave con sosta lunga. Verifica sempre l\'orario reale di reimbarco. Rientro al porto entro 7 ore dallo sbarco.' },
    ],
  },
  {
    id: 'port-mumbai', emoji: '🕌', port: 'Mumbai Cruise Terminal', city: 'Mumbai', country: 'India',
    coords: { lat: 18.92, lon: 72.84 },
    transferNote: 'il centro (Colaba) è a 15-20 min di taxi dal terminal.',
    options: [
      { hours: 4, title: 'Gateway of India', outline: ['Gateway of India', 'Hotel Taj Mahal Palace (esterno)', 'Colaba Causeway', 'Vada pav, lo street food locale'], notes: 'Rientro a bordo entro 3 ore dallo sbarco.' },
      { hours: 6, title: 'Grotte di Elephanta', outline: ['Traghetto per le Grotte di Elephanta UNESCO (~1h di traversata)', 'Sculture rupestri dedicate a Shiva', 'Rientro in traghetto', 'Gateway of India'], notes: 'Verifica gli orari dei traghetti prima di partire: non sono frequentissimi. Rientro al terminal entro 5 ore dallo sbarco.' },
      { hours: 8, title: 'Mumbai completa', outline: ['Grotte di Elephanta in traghetto', 'Gateway of India e Colaba', 'Mercato di Crawford Market', 'Rientro con margine'], notes: 'Rientro al terminal entro 7 ore dallo sbarco.' },
    ],
  },
  // ── Oceania, altri porti ────────────────────────────────────────────
  {
    id: 'port-auckland', emoji: '⛵', port: 'Auckland Cruise Terminal', city: 'Auckland', country: 'Nuova Zelanda',
    coords: { lat: -36.84, lon: 174.77 },
    transferNote: 'il terminal è nel centro, tutto a piedi.',
    options: [
      { hours: 4, title: 'Sky Tower e Viaduct Harbour', outline: ['Sky Tower (vista o salita)', 'Viaduct Harbour', 'Queen Street', 'Meat pie neozelandese'], notes: 'Rientro a bordo entro 3 ore dallo sbarco.' },
      { hours: 6, title: 'Devonport', outline: ['Traghetto per Devonport, quartiere vittoriano sull\'altra sponda', 'Vista su Auckland dal Mount Victoria', 'Rientro in traghetto', 'Viaduct Harbour'], notes: 'Rientro al terminal entro 5 ore dallo sbarco.' },
      { hours: 8, title: 'Isola di Waiheke', outline: ['Traghetto per Waiheke Island (~40 min)', 'Degustazione in una cantina (da prenotare)', 'Spiaggia dell\'isola', 'Rientro in traghetto con margine'], notes: 'Prenota traghetto e cantina prima dello sbarco: le corse sono ogni ora. Rientro al terminal entro 7 ore dallo sbarco.' },
    ],
  },
  {
    id: 'port-melbourne', emoji: '☕', port: 'Station Pier', city: 'Melbourne', country: 'Australia',
    coords: { lat: -37.84, lon: 144.93 },
    transferNote: 'tram gratuito o taxi da Station Pier al centro (~15-20 min).',
    options: [
      { hours: 4, title: 'Federation Square e le laneways', outline: ['Federation Square', 'Le laneways con la street art', 'Queen Victoria Market', 'Flat white in un caffè di quartiere'], notes: 'Rientro a bordo entro 3 ore dallo sbarco.' },
      { hours: 6, title: 'St Kilda', outline: ['Federation Square e laneways', 'Tram per St Kilda: spiaggia e pinguini al tramonto (stagionali)', 'Rientro in tram', 'Rientro con margine'], notes: 'Rientro al molo entro 5 ore dallo sbarco.' },
      { hours: 8, title: 'Yarra Valley', outline: ['Trasferimento nella Yarra Valley, regione vinicola (~1h, tour consigliato)', 'Degustazione in cantina', 'Rientro a Melbourne', 'Rientro con margine'], notes: 'Serve un tour organizzato per rispettare i tempi. Rientro al molo entro 7 ore dallo sbarco.' },
    ],
  },
  {
    id: 'port-brisbane', emoji: '🌉', port: 'Brisbane International Cruise Terminal', city: 'Brisbane', country: 'Australia',
    coords: { lat: -27.38, lon: 153.17 },
    transferNote: 'il terminal è decentrato: navetta o taxi per il centro (~25-30 min).',
    options: [
      { hours: 4, title: 'South Bank', outline: ['South Bank Parklands e la spiaggia urbana artificiale', 'Story Bridge', 'Queen Street Mall', 'Caffè australiano'], notes: 'Rientro a bordo entro 3 ore dallo sbarco.' },
      { hours: 6, title: 'Lone Pine Koala Sanctuary', outline: ['South Bank', 'Lone Pine Koala Sanctuary, il più antico santuario di koala al mondo', 'Rientro in centro', 'Rientro con margine'], notes: 'Rientro al terminal entro 5 ore dallo sbarco.' },
      { hours: 8, title: 'Brisbane completa', outline: ['Lone Pine Koala Sanctuary', 'South Bank Parklands', 'Story Bridge al tramonto', 'Rientro con margine'], notes: 'Rientro al terminal entro 7 ore dallo sbarco.' },
    ],
  },
  {
    id: 'port-cairns', emoji: '🐠', port: 'Cairns Cruise Terminal', city: 'Cairns', country: 'Australia',
    coords: { lat: -16.92, lon: 145.78 },
    transferNote: 'il terminal è nel centro; la Grande Barriera Corallina si raggiunge solo in barca (1,5-2h di navigazione).',
    options: [
      { hours: 4, title: 'Cairns Esplanade', outline: ['Cairns Esplanade e la piscina lagunare gratuita', 'Mercato locale', 'Lungomare', 'Barramundi alla griglia'], notes: 'Con 4 ore la Grande Barriera è irraggiungibile: resta in città. Rientro a bordo entro 3 ore dallo sbarco.' },
      { hours: 6, title: 'Kuranda', outline: ['Treno panoramico o funivia Skyrail per Kuranda', 'Villaggio nella foresta pluviale', 'Mercati locali', 'Rientro con margine'], notes: 'Rientro al terminal entro 5 ore dallo sbarco.' },
      { hours: 8, title: 'Grande Barriera Corallina', outline: ['Escursione in barca sulla Grande Barriera Corallina (da prenotare, partenza mattutina)', 'Snorkeling o immersione guidata', 'Rientro in barca con margine'], notes: 'Prenota l\'escursione PRIMA dello sbarco: la navigazione da sola richiede 1,5-2 ore a tratta. Verifica che la nave resti in porto abbastanza a lungo. Rientro al terminal entro 7 ore dallo sbarco.' },
    ],
  },
  {
    id: 'port-noumea', emoji: '🏝', port: 'Port de Nouméa', city: 'Nouméa', country: 'Nuova Caledonia',
    coords: { lat: -22.28, lon: 166.46 },
    transferNote: 'il centro è a piedi/taxi breve dal porto; l\'isolotto Amédée si raggiunge in barca (~1h).',
    options: [
      { hours: 4, title: 'Baie des Citrons', outline: ['Baie des Citrons, la spiaggia cittadina', 'Centro culturale Tjibaou (architettura di Renzo Piano)', 'Mercato coperto', 'Baguette e influenza francese nel Pacifico'], notes: 'Rientro a bordo entro 3 ore dallo sbarco.' },
      { hours: 6, title: 'Tjibaou e spiaggia', outline: ['Centro culturale Tjibaou', 'Baie des Citrons per il bagno', 'Mercato coperto', 'Rientro con margine'], notes: 'Rientro al porto entro 5 ore dallo sbarco.' },
      { hours: 8, title: 'Isolotto di Amédée', outline: ['Barca per l\'isolotto di Amédée (da prenotare)', 'Snorkeling nella laguna UNESCO', 'Faro storico', 'Rientro in barca con margine'], notes: 'Prenota la barca prima dello sbarco: le corse sono limitate. Rientro al porto entro 7 ore dallo sbarco.' },
    ],
  },
  // ── Africa ──────────────────────────────────────────────────────────
  {
    id: 'port-capetown', emoji: '⛰', port: 'V&A Waterfront Cruise Terminal', city: 'Città del Capo', country: 'Sudafrica',
    coords: { lat: -33.92, lon: 18.42 },
    transferNote: 'il terminal è al V&A Waterfront, centro pieno di ristoranti e negozi a piedi.',
    options: [
      { hours: 4, title: 'V&A Waterfront e Table Mountain', outline: ['V&A Waterfront', 'Funivia per Table Mountain (meteo permettendo, biglietto prenotato)', 'Vista sulla città e su Robben Island', 'Rientro con margine'], notes: 'La funivia chiude con vento forte: verifica prima. Rientro a bordo entro 3 ore dallo sbarco.' },
      { hours: 6, title: 'Boulders Beach', outline: ['Table Mountain se il meteo lo consente', 'Taxi per Boulders Beach: i pinguini africani in libertà (~45 min)', 'Rientro con margine'], notes: 'Rientro al terminal entro 5 ore dallo sbarco.' },
      { hours: 8, title: 'Capo di Buona Speranza', outline: ['Tour della penisola del Capo (da prenotare)', 'Boulders Beach e i pinguini', 'Capo di Buona Speranza e Cape Point', 'Rientro con largo margine'], notes: 'Serve un tour organizzato per l\'intera penisola in giornata. Rientro al terminal entro 7 ore dallo sbarco.' },
    ],
  },
  {
    id: 'port-zanzibar', emoji: '🌶', port: 'Malindi Port', city: 'Zanzibar (Stone Town)', country: 'Tanzania',
    coords: { lat: -6.16, lon: 39.19 },
    transferNote: 'Stone Town è a 10-15 min a piedi/taxi dal porto.',
    options: [
      { hours: 4, title: 'Stone Town UNESCO', outline: ['Vicoli di Stone Town e le porte intagliate', 'Antico mercato degli schiavi (memoria storica)', 'Forodhani Gardens', 'Spezie locali sul mercato'], notes: 'Rientro a bordo entro 3 ore dallo sbarco.' },
      { hours: 6, title: 'Tour delle spezie', outline: ['Stone Town', 'Tour di una piantagione di spezie nell\'entroterra', 'Rientro con margine', 'Forodhani Gardens al tramonto'], notes: 'Rientro al porto entro 5 ore dallo sbarco.' },
      { hours: 8, title: "Prison Island", outline: ['Stone Town', "Barca per Prison Island: le tartarughe giganti secolari", 'Snorkeling vicino all\'isola', 'Rientro con margine'], notes: 'Rientro al porto entro 7 ore dallo sbarco.' },
    ],
  },
  {
    id: 'port-mombasa', emoji: '🦁', port: 'Kilindini Harbour', city: 'Mombasa', country: 'Kenya',
    coords: { lat: -4.05, lon: 39.67 },
    transferNote: 'taxi dal porto al centro storico (~15-20 min); Diani Beach è a ~40 min.',
    options: [
      { hours: 4, title: 'Fort Jesus e la città vecchia', outline: ['Fort Jesus UNESCO, fortezza portoghese', 'Old Town con le porte swahili intagliate', 'Mercato delle spezie', 'Chai keniano'], notes: 'Rientro a bordo entro 3 ore dallo sbarco.' },
      { hours: 6, title: 'Diani Beach', outline: ['Fort Jesus', 'Taxi per Diani Beach (~40 min)', 'Bagno in acque turchesi', 'Rientro con margine'], notes: 'Rientro al porto entro 5 ore dallo sbarco.' },
      { hours: 8, title: 'Mombasa e Diani', outline: ['Fort Jesus e Old Town', 'Diani Beach per il bagno', 'Mercato delle spezie al rientro', 'Rientro con margine'], notes: 'Un safari nel vicino Tsavo richiede un\'intera giornata a sé: non abbinarlo. Rientro al porto entro 7 ore dallo sbarco.' },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────
// ✈️ SCALI IN AEROPORTO — hub europei e mediterranei
// L'opzione più corta è SEMPRE "resta in aeroporto/vicinanze"; le
// opzioni città impongono rientro 2h prima del volo + deposito bagagli.
// ─────────────────────────────────────────────────────────────────────

export const AIRPORT_LAYOVERS: AirportLayover[] = [
  {
    id: 'lay-fco', airport: 'Roma Fiumicino "Leonardo da Vinci"', code: 'FCO', city: 'Roma', country: 'Italia',
    coords: { lat: 41.800, lon: 12.246 }, minLayoverForCity: 6,
    transferNote: 'Leonardo Express per Termini: 32 min a tratta, ogni 15-30 min, biglietto ~14 € (~1h15 A/R porta a porta).',
    luggageNote: 'deposito bagagli ufficiale al Terminal 3, arrivi (a pagamento, per fascia oraria).',
    options: [
      {
        hours: 3, stayNearAirport: true, title: 'Resta al Leonardo da Vinci',
        outline: ['Terminal 1: area imbarchi e mostre temporanee', 'Piazza food con cucina romana (carbonara decente esiste)', 'Osservazione piste dalle vetrate', 'Relax vicino al gate'],
        notes: 'FCO è tra i migliori aeroporti d\'Europa per servizi: con meno di 6 ore non ha senso uscire.',
      },
      {
        hours: 6, title: 'Roma lampo dal Leonardo Express',
        outline: ['Deposito bagagli al T1', 'Leonardo Express per Termini', 'Santa Maria Maggiore', 'Fontana di Trevi e Pantheon', 'Treno di rientro'],
        notes: 'Circa 2h30 effettive in centro: un assaggio, non una visita. Vaticano e Colosseo dentro: NO.',
      },
      {
        hours: 8, title: 'Centro storico essenziale',
        outline: ['Leonardo Express', 'Colosseo (esterno) e Fori dal belvedere', 'Pantheon e piazza Navona', 'Trevi', 'Rientro con un treno di margine'],
        notes: 'Con 8 ore Roma a piedi tra i simboli: niente musei con coda, pranzo veloce in piedi.',
      },
    ],
  },
  {
    id: 'lay-mxp', airport: 'Milano Malpensa', code: 'MXP', city: 'Milano', country: 'Italia',
    coords: { lat: 45.630, lon: 8.723 }, minLayoverForCity: 6,
    transferNote: 'Malpensa Express per Cadorna/Centrale: 43-52 min a tratta, biglietto ~13 € (~2h A/R porta a porta).',
    luggageNote: 'deposito bagagli al T1, piano arrivi (a pagamento).',
    options: [
      {
        hours: 4, stayNearAirport: true, title: 'Resta a Malpensa',
        outline: ['Terminal 1: galleria commerciale e design italiano', 'Osservatorio piste', 'Ristoranti con cucina lombarda', 'Relax al gate'],
        notes: 'Malpensa è LONTANA da Milano: sotto le 6 ore uscire è un azzardo inutile.',
      },
      {
        hours: 7, title: 'Milano dal Duomo',
        outline: ['Deposito bagagli T1', 'Malpensa Express per Cadorna', 'Duomo e Galleria Vittorio Emanuele II', 'Castello Sforzesco (esterno) e parco', 'Rientro da Cadorna'],
        notes: 'Con ~2h di treni A/R restano 3 ore scarse in centro: Duomo e Galleria bastano e avanzano.',
      },
    ],
  },
  {
    id: 'lay-lin', airport: 'Milano Linate', code: 'LIN', city: 'Milano', country: 'Italia',
    coords: { lat: 45.449, lon: 9.278 }, minLayoverForCity: 4,
    transferNote: 'Metro M4 da Linate a San Babila: 12-15 min a tratta (~40 min A/R).',
    options: [
      {
        hours: 3, stayNearAirport: true, title: 'Resta a Linate',
        outline: ['Terminal rinnovato e caffetteria', 'Idroscalo a 10 min a piedi (parco sul bacino)', 'Rientro tranquillo al gate'],
        notes: 'Linate è piccolo ma l\'Idroscalo lì accanto è una vera pausa verde.',
      },
      {
        hours: 5, title: 'San Babila e Duomo in metro',
        outline: ['Deposito bagagli', 'M4 fino a San Babila', 'Duomo, Galleria e piazza della Scala', 'Aperitivo o panzerotto', 'M4 di rientro'],
        notes: 'Con la M4 Linate è l\'unico aeroporto milanese da cui la città è davvero a portata di scalo.',
      },
    ],
  },
  {
    id: 'lay-bgy', airport: 'Milano Bergamo "Il Caravaggio"', code: 'BGY', city: 'Bergamo', country: 'Italia',
    coords: { lat: 45.669, lon: 9.700 }, minLayoverForCity: 5,
    transferNote: 'bus 1 per Bergamo stazione/Città Alta: ~30 min a tratta (~1h15 A/R con la funicolare).',
    options: [
      {
        hours: 3, stayNearAirport: true, title: 'Resta a Orio',
        outline: ['Oriocenter (uno dei centri commerciali più grandi d\'Italia, di fronte al terminal)', 'Pranzo bergamasco (casoncelli)', 'Rientro al gate'],
        notes: 'L\'Oriocenter è a 5 min a piedi: lo scalo corto passa in fretta.',
      },
      {
        hours: 6, title: 'Città Alta, gioiello sulle mura',
        outline: ['Deposito bagagli', 'Bus + funicolare per Città Alta', 'Piazza Vecchia e cappella Colleoni', 'Mura venete UNESCO', 'Polenta e osei (dolce) e rientro'],
        notes: 'Bergamo Alta è una delle gite da scalo migliori d\'Europa: vicina, compatta, memorabile.',
      },
    ],
  },
  {
    id: 'lay-vce', airport: 'Venezia Marco Polo', code: 'VCE', city: 'Venezia', country: 'Italia',
    coords: { lat: 45.505, lon: 12.352 }, minLayoverForCity: 6,
    transferNote: 'Alilaguna (linea arancio/blu) per San Marco: ~1h15 a tratta; bus ATVO per p.le Roma 20 min (~1h A/R).',
    options: [
      {
        hours: 4, stayNearAirport: true, title: 'Resta al Marco Polo',
        outline: ['Terminal con vista laguna', 'Cicchetti e spritz ai bar del landside', 'Passeggiata al water terminal (i taxi d\'acqua)', 'Gate con calma'],
        notes: 'Guardare i motoscafi-taxi partire per la laguna è già mezzo viaggio.',
      },
      {
        hours: 7, title: 'San Marco via laguna',
        outline: ['Deposito bagagli', 'Bus ATVO per p.le Roma + vaporetto (più affidabile dell\'Alilaguna diretta)', 'San Marco e riva degli Schiavoni', 'Bacaro veloce', 'Rientro'],
        notes: 'I tempi lagunari sono lenti e rigidi: contare SEMPRE la corsa dopo quella prevista come persa.',
      },
    ],
  },
  {
    id: 'lay-nap', airport: 'Napoli Capodichino', code: 'NAP', city: 'Napoli', country: 'Italia',
    coords: { lat: 40.884, lon: 14.291 }, minLayoverForCity: 4,
    transferNote: 'Alibus per piazza Garibaldi/porto: 20-30 min a tratta (~1h A/R); metro Linea 1 da Capodichino.',
    options: [
      {
        hours: 3, stayNearAirport: true, title: 'Resta a Capodichino',
        outline: ['Pizza fritta e sfogliatella nei locali del terminal', 'Caffè napoletano "come si deve"', 'Gate senza fretta'],
        notes: 'A Capodichino anche il bar d\'aeroporto fa un caffè migliore della media europea: approfittane.',
      },
      {
        hours: 5, title: 'Spaccanapoli mordi e fuggi',
        outline: ['Deposito bagagli', 'Alibus/metro per il centro', 'Spaccanapoli e San Gregorio Armeno', 'Pizza da un maestro del centro storico', 'Rientro'],
        notes: 'Napoli è a 6 km dall\'aeroporto: pochi hub al mondo mettono un centro così vicino. Traffico imprevedibile: margine largo.',
      },
    ],
  },
  {
    id: 'lay-cta', airport: 'Catania Fontanarossa', code: 'CTA', city: 'Catania', country: 'Italia',
    coords: { lat: 37.467, lon: 15.066 }, minLayoverForCity: 4,
    transferNote: 'Alibus per il centro: ~20 min a tratta (~50 min A/R).',
    options: [
      {
        hours: 3, stayNearAirport: true, title: 'Resta a Fontanarossa',
        outline: ['Vista Etna dalle vetrate (quando è limpido)', 'Arancino e granita al terminal', 'Gate rilassato'],
        notes: 'Se l\'Etna fuma, lo spettacolo è dal finestrone del terminal.',
      },
      {
        hours: 5, title: 'Catania barocca',
        outline: ['Deposito bagagli', 'Alibus per piazza Duomo', 'Elefante di piazza Duomo e via Etnea', 'Pescheria (mercato del pesce)', 'Arancino e rientro'],
        notes: 'Il barocco nero di lava dell\'UNESCO a 20 minuti dallo scalo: gita facile e d\'impatto.',
      },
    ],
  },
  {
    id: 'lay-pmo', airport: 'Palermo "Falcone e Borsellino"', code: 'PMO', city: 'Palermo', country: 'Italia',
    coords: { lat: 38.176, lon: 13.091 }, minLayoverForCity: 5,
    transferNote: 'treno Trinacria Express o bus Prestia e Comandè: 45-55 min a tratta (~2h A/R).',
    options: [
      {
        hours: 4, stayNearAirport: true, title: 'Resta a Punta Raisi',
        outline: ['Memoriale Falcone-Borsellino nel terminal', 'Cannolo e caffè', 'Vista sul golfo di Carini', 'Gate'],
        notes: 'L\'aeroporto è a 35 km dalla città: sotto le 5 ore non conviene uscire.',
      },
      {
        hours: 6, title: 'Palermo essenziale in treno',
        outline: ['Deposito bagagli', 'Trinacria Express per Palermo Centrale', 'Ballarò e Quattro Canti', 'Cattedrale (esterno)', 'Treno di rientro'],
        notes: 'Con ~2h di treni A/R restano 2h30 in centro: mercato + Quattro Canti e basta.',
      },
    ],
  },
  {
    id: 'lay-blq', airport: 'Bologna "Guglielmo Marconi"', code: 'BLQ', city: 'Bologna', country: 'Italia',
    coords: { lat: 44.535, lon: 11.288 }, minLayoverForCity: 4,
    transferNote: 'Marconi Express (monorotaia) per Bologna Centrale: 7 min a tratta, ~12-13 € (~30 min A/R), poi 10 min a piedi al centro.',
    options: [
      {
        hours: 3, stayNearAirport: true, title: 'Resta al Marconi',
        outline: ['Tagliere e Lambrusco ai banchi del terminal', 'Marconi Express: vederlo sfrecciare dal ponte', 'Gate con calma'],
        notes: 'Il monorotaia ha reso Bologna una delle città più raggiungibili d\'Europa da uno scalo.',
      },
      {
        hours: 5, title: 'Bologna la Grassa',
        outline: ['Deposito bagagli', 'Marconi Express', 'Piazza Maggiore e San Petronio', 'Due Torri e Quadrilatero', 'Tortellini o crescentine, rientro'],
        notes: 'Con 5 ore Bologna è perfetta: centro compatto, tutto a piedi dalla stazione in 15 min.',
      },
    ],
  },
  {
    id: 'lay-psa', airport: 'Pisa "Galileo Galilei"', code: 'PSA', city: 'Pisa', country: 'Italia',
    coords: { lat: 43.684, lon: 10.395 }, minLayoverForCity: 3,
    transferNote: 'PisaMover per Pisa Centrale: 5 min a tratta (~20 min A/R), poi 20 min a piedi (o bus) ai Miracoli.',
    options: [
      {
        hours: 2, stayNearAirport: true, title: 'Resta al Galilei',
        outline: ['Caffè e cecina nei bar del terminal', 'Spotting sul piazzale', 'Gate'],
        notes: 'Aeroporto piccolo e rapido: con 2 ore non serve altro.',
      },
      {
        hours: 4, title: 'La Torre in uno scalo',
        outline: ['Deposito bagagli', 'PisaMover + passeggiata per piazza dei Miracoli', 'Torre, Duomo e Battistero (esterni)', 'Foto di rito e rientro'],
        notes: 'Pochi aeroporti al mondo mettono un\'icona mondiale a 30 min porta a porta: la salita sulla Torre però richiede prenotazione e tempo — solo esterni.',
      },
    ],
  },
  {
    id: 'lay-cdg', airport: 'Paris Charles de Gaulle', code: 'CDG', city: 'Parigi', country: 'Francia',
    coords: { lat: 49.010, lon: 2.548 }, minLayoverForCity: 6,
    transferNote: 'RER B per Châtelet/Saint-Michel: 30-35 min a tratta, biglietto ~12 € (~1h30 A/R); occhio agli scioperi.',
    luggageNote: 'deposito Bagages du Monde al Terminal 2 (a pagamento).',
    options: [
      {
        hours: 4, stayNearAirport: true, title: 'Resta al CDG',
        outline: ['Terminal 2E/2F: boutique e macarons', 'Musei in miniatura (espositori del Louvre nel T2E quando attivi)', 'Champagne bar', 'CDGVAL tra i terminal per sgranchirsi'],
        notes: 'CDG è enorme e i controlli lenti: sotto le 6 ore non uscire, tra terminal servono anche 40 min.',
      },
      {
        hours: 7, title: 'Parigi essenziale in RER',
        outline: ['Deposito bagagli (Bagages du Monde, T2)', 'RER B per Saint-Michel', 'Notre-Dame (esterno) e Île de la Cité', 'Louvre (piramide, esterno) e Tuileries', 'RER di rientro'],
        notes: 'Circa 3 ore in città: un boulevard, un ponte, un caffè. La Torre Eiffel è fuori rotta: rimandala.',
      },
      {
        hours: 9, title: 'Parigi con la Torre',
        outline: ['RER B + metro', 'Trocadéro e Torre Eiffel (esterno)', 'Senna fino a Notre-Dame', 'Marais per pranzo', 'RER di rientro con margine doppio'],
        notes: 'Solo con 9 ore piene e nessuno sciopero annunciato: controlla lo stato del RER B prima di uscire.',
      },
    ],
  },
  {
    id: 'lay-ams', airport: 'Amsterdam Schiphol', code: 'AMS', city: 'Amsterdam', country: 'Paesi Bassi',
    coords: { lat: 52.310, lon: 4.768 }, minLayoverForCity: 5,
    transferNote: 'treno NS per Amsterdam Centraal: 15-20 min a tratta, ogni 10 min, ~5-6 € (~50 min A/R).',
    luggageNote: 'armadietti self-service a Schiphol Plaza e depositi tra le aree partenze.',
    options: [
      {
        hours: 3, stayNearAirport: true, title: 'Resta a Schiphol',
        outline: ['Annex del Rijksmuseum in aerostazione (gratuito, dopo i controlli)', 'Biblioteca aeroportuale', 'Terrazza panoramica (landside)', 'Formaggi e stroopwafel'],
        notes: 'Schiphol è l\'aeroporto con un museo vero dentro: lo scalo corto qui è un piacere.',
      },
      {
        hours: 6, title: 'Canali del centro',
        outline: ['Deposito bagagli a Schiphol Plaza', 'Treno per Centraal', 'Canali: Damrak, Dam, Jordaan', 'Aringa o pancake veloce', 'Treno di rientro'],
        notes: 'Il treno è frequentissimo: Amsterdam è tra gli scali-città più facili d\'Europa. Musei (Rijks/Van Gogh) NO: code e distanze non ci stanno.',
      },
    ],
  },
  {
    id: 'lay-fra', airport: 'Frankfurt am Main', code: 'FRA', city: 'Francoforte', country: 'Germania',
    coords: { lat: 50.037, lon: 8.562 }, minLayoverForCity: 5,
    transferNote: 'S-Bahn S8/S9 per Hauptwache: 12-15 min a tratta (~40 min A/R).',
    options: [
      {
        hours: 3, stayNearAirport: true, title: 'Resta a FRA',
        outline: ['Terrazza visitatori (T2, quando aperta)', 'Würstel e birra ai banchi bavaresi', 'Skyline dal terminal', 'Gate (calcola le distanze: FRA è vasto)'],
        notes: 'Tra controlli e passaporti FRA è lento: sotto le 5 ore resta dentro.',
      },
      {
        hours: 6, title: 'Römerberg e skyline',
        outline: ['Deposito bagagli', 'S-Bahn per Hauptwache', 'Römerberg (piazza ricostruita) e Duomo', 'Eiserner Steg: skyline sul Meno', 'Apfelwein veloce e rientro'],
        notes: 'Francoforte in 3 ore si assaggia bene: centro compatto attorno al Römer.',
      },
    ],
  },
  {
    id: 'lay-mad', airport: 'Madrid Barajas "Adolfo Suárez"', code: 'MAD', city: 'Madrid', country: 'Spagna',
    coords: { lat: 40.472, lon: -3.561 }, minLayoverForCity: 5,
    transferNote: 'metro Linea 8 + trasbordo o bus Exprés 203 per Atocha/Cibeles: 30-40 min a tratta (~1h20 A/R).',
    options: [
      {
        hours: 4, stayNearAirport: true, title: 'Resta a Barajas',
        outline: ['Il tetto ondulato di Rogers al T4 (architettura da premio)', 'Jamón e tortilla ai banchi', 'Relax nelle aree luminose del T4', 'Navetta tra terminal solo se necessaria'],
        notes: 'Il T4 è tra i terminal più belli del mondo: guardare in su vale la sosta.',
      },
      {
        hours: 6, title: 'Madrid degli Austrias',
        outline: ['Deposito bagagli', 'Bus Exprés per Cibeles', 'Puerta del Sol e Plaza Mayor', 'Mercado de San Miguel', 'Palazzo Reale (esterno) e rientro'],
        notes: 'Il Prado con uno scalo non è serio: mangiare al San Miguel sì.',
      },
    ],
  },
  {
    id: 'lay-bcn', airport: 'Barcelona El Prat', code: 'BCN', city: 'Barcellona', country: 'Spagna',
    coords: { lat: 41.297, lon: 2.083 }, minLayoverForCity: 5,
    transferNote: 'Aerobús per plaça Catalunya: 35 min a tratta, ogni 5-10 min, ~7-8 € a tratta (~1h20 A/R).',
    luggageNote: 'deposito bagagli al T1 e T2 (a pagamento).',
    options: [
      {
        hours: 3, stayNearAirport: true, title: 'Resta al Prat',
        outline: ['Tapas e pa amb tomàquet al T1', 'Spotting sulle piste dal mezzanino', 'Gate senza corse'],
        notes: 'Con meno di 5 ore il traffico della Gran Via può giocarsi il volo: resta dentro.',
      },
      {
        hours: 6, title: 'Gótico e Boqueria',
        outline: ['Deposito bagagli T1', 'Aerobús per plaça Catalunya', 'Rambla e mercato Boqueria', 'Cattedrale e Barrio Gótico', 'Aerobús di rientro'],
        notes: 'La Sagrada Família è dalla parte opposta: con uno scalo scegli il Gótico, è a piedi dal capolinea.',
      },
    ],
  },
  {
    id: 'lay-lhr', airport: 'London Heathrow', code: 'LHR', city: 'Londra', country: 'Regno Unito',
    coords: { lat: 51.470, lon: -0.454 }, minLayoverForCity: 6,
    transferNote: 'Elizabeth Line per Paddington: ~30 min a tratta, ~12-13 £ (Heathrow Express 15 min ma caro) — ~1h15 A/R.',
    luggageNote: 'left luggage (Excess Baggage Company) in ogni terminal, a pagamento.',
    options: [
      {
        hours: 4, stayNearAirport: true, title: 'Resta a Heathrow',
        outline: ['Terminal 5: gallerie e afternoon tea', 'Spotting al T5 (piste visibili)', 'Pub d\'aeroporto per fish&chips', 'Gate: i transfer tra terminal richiedono tempo'],
        notes: 'Occhio: se lo scalo implica passare l\'immigrazione UK servono anche 1-2 ore solo di controlli.',
      },
      {
        hours: 8, title: 'Westminster express',
        outline: ['Controllo requisiti d\'ingresso UK (ETA/visto!)', 'Deposito bagagli', 'Elizabeth Line + tube per Westminster', 'Big Ben, abbazia (esterno), St James\'s Park', 'Buckingham Palace e rientro'],
        notes: 'Solo con 8 ore e documenti a posto: l\'immigrazione in ingresso può mangiare 1 ora da sola.',
      },
    ],
  },
  {
    id: 'lay-ist', airport: 'Istanbul Airport', code: 'IST', city: 'Istanbul', country: 'Turchia',
    coords: { lat: 41.262, lon: 28.742 }, minLayoverForCity: 7,
    transferNote: 'metro M11 + M2 o bus Havaist per Sultanahmet/Taksim: 60-90 min a tratta (~3h A/R col traffico).',
    options: [
      {
        hours: 5, stayNearAirport: true, title: 'Resta a IST',
        outline: ['Il duty free più grande d\'Europa', 'Museo dell\'aeroporto (reperti anatolici, se attivo)', 'Kebap e baklava veri ai ristoranti del mezzanino', 'YOTEL per una doccia/riposo a ore'],
        notes: 'L\'aeroporto è a 40+ km dal centro: sotto le 7 ore NON uscire. Turkish Airlines offre tour gratuiti "Touristanbul" per scali lunghi: verifica se ne hai diritto.',
      },
      {
        hours: 9, title: 'Sultanahmet con lo scalo lungo',
        outline: ['Verifica visto/ingresso', 'Deposito bagagli', 'Havaist per Sultanahmet', 'Moschea Blu e Santa Sofia (esterni o una sola dentro)', 'Rientro con 3 ore di margine totale'],
        notes: 'Il traffico di Istanbul è tra i peggiori d\'Europa: il rientro va trattato come un volo a sé. Se esiste il tour ufficiale Touristanbul, preferiscilo.',
      },
    ],
  },
  {
    id: 'lay-ath', airport: 'Atene "Eleftherios Venizelos"', code: 'ATH', city: 'Atene', country: 'Grecia',
    coords: { lat: 37.936, lon: 23.947 }, minLayoverForCity: 6,
    transferNote: 'metro M3 per Syntagma: ~40 min a tratta, ogni 30 min (~1h30 A/R).',
    options: [
      {
        hours: 4, stayNearAirport: true, title: 'Resta al Venizelos',
        outline: ['Piccolo museo archeologico dentro l\'aerostazione (gratuito)', 'Yogurt greco e spanakopita', 'Terrazza/vetrate con vista Imetto', 'Gate'],
        notes: 'Il mini-museo con reperti veri trovati durante i lavori dell\'aeroporto è la sosta perfetta.',
      },
      {
        hours: 7, title: 'Acropoli in metropolitana',
        outline: ['Deposito bagagli', 'M3 per Syntagma', 'Plaka e Acropoli (biglietto prenotato)', 'Souvlaki a Monastiraki', 'M3 di rientro (frequenza 30 min: pianifica la corsa)'],
        notes: 'La M3 passa ogni mezz\'ora: perdere una corsa costa 30 min secchi, calcola i rientri sul suo orario.',
      },
    ],
  },
  {
    id: 'lay-muc', airport: 'München "Franz Josef Strauß"', code: 'MUC', city: 'Monaco di Baviera', country: 'Germania',
    coords: { lat: 48.354, lon: 11.786 }, minLayoverForCity: 6,
    transferNote: 'S-Bahn S1/S8 per Marienplatz: ~40-45 min a tratta (~1h40 A/R).',
    options: [
      {
        hours: 4, stayNearAirport: true, title: 'Resta al MUC',
        outline: ['Airbräu: il birrificio DENTRO l\'aeroporto (birra prodotta in loco)', 'Visitors Park con aerei storici', 'Brezel e weisswurst', 'Gate'],
        notes: 'L\'unico aeroporto d\'Europa col birrificio proprio: lo scalo corto qui è quasi un premio.',
      },
      {
        hours: 7, title: 'Marienplatz e mercato',
        outline: ['Deposito bagagli', 'S8 per Marienplatz', 'Glockenspiel del Neues Rathaus', 'Viktualienmarkt per pranzo', 'Frauenkirche e rientro'],
        notes: 'Il carillon suona a orari fissi (11, 12, e in stagione 17): se coincide, è il momento giusto per la piazza.',
      },
    ],
  },
  {
    id: 'lay-lis', airport: 'Lisbona Humberto Delgado', code: 'LIS', city: 'Lisbona', country: 'Portogallo',
    coords: { lat: 38.774, lon: -9.134 }, minLayoverForCity: 5,
    transferNote: 'metro linea rossa per il centro (Baixa con un cambio): 25-35 min a tratta (~1h10 A/R).',
    options: [
      {
        hours: 3, stayNearAirport: true, title: 'Resta all\'Humberto Delgado',
        outline: ['Pastéis de nata ai banchi del terminal', 'Vinho verde o ginjinha al bicchiere', 'Gate con calma'],
        notes: 'L\'aeroporto è DENTRO la città: ma con meno di 5 ore le code ai controlli consigliano comunque di restare.',
      },
      {
        hours: 6, title: 'Baixa e miradouro',
        outline: ['Deposito bagagli', 'Metro per Baixa-Chiado', 'Praça do Comércio e rua Augusta', 'Miradouro de Santa Justa (vista, esterno)', 'Pastel de nata e metro di rientro'],
        notes: 'Aeroporto urbano = gita facile; le salite di Lisbona però rallentano: resta in Baixa, niente Belém.',
      },
    ],
  },
  // ── Hub mondiali ────────────────────────────────────────────────────
  {
    id: 'lay-jfk', airport: 'New York John F. Kennedy', code: 'JFK', city: 'New York', country: 'Stati Uniti',
    coords: { lat: 40.641, lon: -73.778 }, minLayoverForCity: 7,
    transferNote: 'AirTrain + metro E/J (~60-75 min a tratta per Manhattan, pochi dollari) o taxi a tariffa fissa per Manhattan (~1h col traffico, fascia 70-90 $ con pedaggi).',
    luggageNote: 'depositi bagagli privati nei terminal (a pagamento, fascia oraria): verifica il tuo terminal prima di uscire.',
    options: [
      {
        hours: 5, stayNearAirport: true, title: 'Resta al JFK',
        outline: ['TWA Hotel al Terminal 5: la iconica aerostazione anni \'60 di Saarinen (bar nel Constellation d\'epoca)', 'Rooftop pool con vista piste (accesso a ore)', 'Diner americano', 'Gate con anticipo: i controlli TSA sono lenti'],
        notes: 'Il TWA Hotel si visita anche senza pernottare ed è la cosa più memorabile dell\'aeroporto. ATTENZIONE: se arrivi dall\'estero l\'immigrazione USA può richiedere 1-2 ore da sola.',
      },
      {
        hours: 9, title: 'Manhattan lampo',
        outline: ['Immigrazione + deposito bagagli', 'AirTrain e metro per Midtown', 'Grand Central e Fifth Avenue', 'Times Square o Bryant Park', 'Rientro con 3 ore totali di margine'],
        notes: 'Fattibile SOLO con 9+ ore, documenti ESTA a posto e zero indecisione: il rientro col traffico + sicurezza è un volo a sé. Con qualunque intoppo, il TWA Hotel è il piano B onesto.',
      },
    ],
  },
  {
    id: 'lay-lax', airport: 'Los Angeles International', code: 'LAX', city: 'Los Angeles', country: 'Stati Uniti',
    coords: { lat: 33.941, lon: -118.409 }, minLayoverForCity: 7,
    transferNote: 'rideshare/taxi obbligati (LAX-it pickup): Santa Monica o Venice ~20-40 min a tratta secondo traffico (fascia 25-45 $); la metro richiede navetta+tempo.',
    luggageNote: 'depositi privati fuori dai terminal (consegna/ritiro con navetta): organizzalo PRIMA, in aeroporto non ci sono armadietti.',
    options: [
      {
        hours: 5, stayNearAirport: true, title: 'Resta a LAX',
        outline: ['Osservazione del Theme Building spaziale anni \'60', 'In-N-Out Burger di Sepulveda: gli aerei atterrano sopra la testa (a 10 min, solo se il rientro è comodo)', 'Food hall dei terminal', 'Gate con anticipo'],
        notes: 'LAX è caotico e i controlli lunghi: sotto le 7 ore la città è una trappola da traffico.',
      },
      {
        hours: 8, title: 'Santa Monica e Venice',
        outline: ['Deposito bagagli organizzato', 'Rideshare per il molo di Santa Monica', 'Pier e spiaggia', 'Venice Beach boardwalk', 'Rientro con 3 ore di margine (il traffico della 405 non perdona)'],
        notes: 'Hollywood dall\'aeroporto è un miraggio (1h+ a tratta): la costa è la sola gita sensata da LAX.',
      },
    ],
  },
  {
    id: 'lay-dxb', airport: 'Dubai International', code: 'DXB', city: 'Dubai', country: 'Emirati Arabi Uniti',
    coords: { lat: 25.253, lon: 55.365 }, minLayoverForCity: 6,
    transferNote: 'metro linea rossa dal T1/T3 per Downtown (~35-40 min a tratta, pochi dirham) o taxi 15-25 min (fascia 10-20 €).',
    luggageNote: 'deposito bagagli ufficiale nei terminal (a pagamento per fascia oraria), attivo 24h.',
    options: [
      {
        hours: 4, stayNearAirport: true, title: 'Resta al DXB',
        outline: ['Duty free monumentale del T3', 'Zen Garden e piscina/spa a ore (T3)', 'Shawarma e karak ai food court', 'Sonnellino negli sleep pod'],
        notes: 'Il T3 è una piccola città climatizzata: di notte tutto aperto, lo scalo scorre.',
      },
      {
        hours: 7, title: 'Burj Khalifa o vecchia Dubai',
        outline: ['Deposito bagagli', 'Metro per Burj Khalifa/Dubai Mall (fontane e vista) OPPURE Creek: souk e abra', 'Cena/pranzo veloce', 'Metro di rientro'],
        notes: 'Transito notturno: il Creek dorme, meglio Downtown. Da giugno a settembre fuori fa 40°+ anche di sera: tappe brevi. Visto di transito: la maggior parte dei passaporti UE entra senza pratiche, verifica il tuo.',
      },
    ],
  },
  {
    id: 'lay-doh', airport: 'Doha Hamad International', code: 'DOH', city: 'Doha', country: 'Qatar',
    coords: { lat: 25.273, lon: 51.608 }, minLayoverForCity: 6,
    transferNote: 'metro linea rossa per il centro/Souq Waqif (~30 min a tratta, economica) o taxi 15-20 min.',
    luggageNote: 'left luggage in aerostazione (a pagamento); Qatar Airways offre anche tour di scalo organizzati: chiedi al transfer desk.',
    options: [
      {
        hours: 4, stayNearAirport: true, title: 'Resta all\'Hamad',
        outline: ['L\'orso giallo gigante di Urs Fischer sotto la volta', 'Orchard: il giardino tropicale interno con cascata', 'Spa/piscina a ore', 'Gate con calma'],
        notes: 'Regolarmente tra i migliori aeroporti del mondo: lo scalo qui è parte del viaggio.',
      },
      {
        hours: 7, title: 'Souq Waqif e Corniche',
        outline: ['Deposito bagagli', 'Metro per Souq Waqif', 'Souq: falchi, spezie e vicoli restaurati', 'Corniche con lo skyline', 'Museo d\'arte islamica (esterno o visita rapida)', 'Metro di rientro'],
        notes: 'Il souq vive la sera; d\'estate a mezzogiorno si scioglie qualunque programma. Transito senza visto per la maggior parte dei passaporti: verifica il tuo prima.',
      },
    ],
  },
  {
    id: 'lay-sin', airport: 'Singapore Changi', code: 'SIN', city: 'Singapore', country: 'Singapore',
    coords: { lat: 1.359, lon: 103.989 }, minLayoverForCity: 5,
    transferNote: 'MRT per il centro (~30-40 min a tratta, economica; ultimo treno prima di mezzanotte) o taxi 20-25 min.',
    luggageNote: 'left baggage in ogni terminal, 24h; se resti airside il bagaglio spesso è già imbarcato sulla coincidenza.',
    options: [
      {
        hours: 4, stayNearAirport: true, title: 'Resta a Changi (non è una rinuncia)',
        outline: ['Jewel: la cascata indoor più alta del mondo (Rain Vortex)', 'Foresta interna Shiseido Forest Valley', 'Butterfly garden e piscina rooftop (T1, a ore)', 'Food court per laksa e chicken rice'],
        notes: 'Changi è l\'unico aeroporto al mondo che è LUI l\'attrazione: il Jewel è landside, calcola il rientro nei controlli.',
      },
      {
        hours: 6, title: 'Marina Bay dallo scalo',
        outline: ['Deposito bagagli', 'MRT per Bayfront', 'Gardens by the Bay e Supertree', 'Merlion e Marina Bay Sands', 'MRT di rientro'],
        notes: 'Singapore offre anche il Free Singapore Tour ufficiale per scali 5.5h+: se gli orari coincidono, è la scelta zero-pensieri.',
      },
    ],
  },
  {
    id: 'lay-hnd', airport: 'Tokyo Haneda', code: 'HND', city: 'Tokyo', country: 'Giappone',
    coords: { lat: 35.549, lon: 139.780 }, minLayoverForCity: 6,
    transferNote: 'Tokyo Monorail o Keikyu line per il centro (~25-35 min a tratta, pochi euro); Haneda è MOLTO più comodo di Narita.',
    luggageNote: 'coin locker e banchi deposito in ogni terminal (contanti/IC card); efficienza giapponese: 10 minuti e sei libero.',
    options: [
      {
        hours: 4, stayNearAirport: true, title: 'Resta a Haneda',
        outline: ['Edo Market al T3: la viuzza in stile Edo con ramen e sushi veri', 'Osservatorio piste sul rooftop (gratuito)', 'Konbini e vending machine da esplorare', 'Gate'],
        notes: 'Il ponticello di legno dell\'Edo Market è la Tokyo in miniatura per chi non esce.',
      },
      {
        hours: 7, title: 'Assaggio di Tokyo',
        outline: ['Deposito bagagli', 'Keikyu per Sengakuji/Shinagawa poi metro', 'Asakusa: Sensō-ji e Nakamise', 'Ramen o sushi veloce', 'Rientro con margine (i treni sono puntuali: sei tu la variabile)'],
        notes: 'Una zona sola: Asakusa o Shibuya, mai entrambe. Contanti/IC card (Suica in app) preparati prima di uscire.',
      },
    ],
  },
  {
    id: 'lay-syd', airport: 'Sydney Kingsford Smith', code: 'SYD', city: 'Sydney', country: 'Australia',
    coords: { lat: -33.939, lon: 151.175 }, minLayoverForCity: 6,
    transferNote: 'Airport Link (treno) per Circular Quay: ~20-25 min a tratta (fascia 15-20 AU$ con la station access fee).',
    luggageNote: 'deposito bagagli al T1 (SmarteCarte, a pagamento); tra T1 internazionale e T2/T3 domestici serve navetta: calcola i tempi.',
    options: [
      {
        hours: 4, stayNearAirport: true, title: 'Resta a Kingsford Smith',
        outline: ['Osservazione piste con la baia di Botany', 'Flat white e avocado toast come si deve', 'Shopping di marchi australiani', 'Gate'],
        notes: 'Con l\'immigrazione australiana in mezzo (in ingresso), 4 ore volano senza uscire.',
      },
      {
        hours: 7, title: 'Opera House dallo scalo',
        outline: ['Deposito bagagli', 'Treno per Circular Quay', 'Opera House e Harbour Bridge dal molo', 'The Rocks per pranzo', 'Treno di rientro'],
        notes: 'Il treno sbuca a due passi dall\'Opera House: la gita da scalo più scenografica dell\'emisfero sud. Requisiti visto (ETA) anche solo per uscire: verifica prima.',
      },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────
// 🥾 CAMMINI E PELLEGRINAGGI — versioni proposte da 3-7 giorni
// Le coordinate delle tappe sono approssimate al centro della località
// di arrivo: servono al motore roadtrip come ancore geografiche.
// ─────────────────────────────────────────────────────────────────────

export const PILGRIM_ROUTES: PilgrimRoute[] = [
  {
    id: 'walk-francigena-siena', emoji: '🥾', name: 'Via Francigena — da San Gimignano a Siena',
    start: 'San Gimignano', end: 'Siena', country: 'Italia', continent: 'Europa', difficulty: 'facile', days: 3,
    coords: { lat: 43.468, lon: 11.043 },
    stages: [
      { day: 1, from: 'San Gimignano', to: 'Colle di Val d\'Elsa', km: 13, lat: 43.421, lon: 11.122, terrain: 'collinare', note: 'saliscendi dolci tra vigne, arrivo nella città del cristallo', lodging: 'ostello del pellegrino o B&B in centro; timbro alla pro loco o in parrocchia' },
      { day: 2, from: 'Colle di Val d\'Elsa', to: 'Monteriggioni', km: 12, lat: 43.390, lon: 11.223, terrain: 'collinare', note: 'l\'arrivo davanti alla cerchia turrita è il momento-cartolina del tratto', lodging: 'accoglienza pellegrina dentro le mura (pochi posti: prenota) o agriturismi fuori; timbro all\'ufficio turistico in piazza' },
      { day: 3, from: 'Monteriggioni', to: 'Siena', km: 20, lat: 43.318, lon: 11.331, terrain: 'collinare, boschi della Montagnola', note: 'ingresso a Siena da porta Camollia', lodging: 'ostelli e conventi con accoglienza a Siena; timbro finale in Duomo o al santuario di Santa Caterina' },
    ],
    credential: 'la credenziale ufficiale della Via Francigena (timbri in parrocchie, ostelli e uffici turistici di tappa).',
    notes: 'Periodo migliore: aprile-giugno e settembre-ottobre (luglio-agosto molto caldi). Difficoltà: facile/media, fondo bianco e sentiero. Bagaglio leggero, scarpe da trekking basse, borraccia da 1,5 l.',
  },
  {
    id: 'walk-francigena-lucca', emoji: '🥾', name: 'Via Francigena — da Lucca a San Gimignano',
    start: 'Lucca', end: 'San Gimignano', country: 'Italia', continent: 'Europa', difficulty: 'media', days: 4,
    coords: { lat: 43.843, lon: 10.508 },
    stages: [
      { day: 1, from: 'Lucca', to: 'Altopascio', km: 18, lat: 43.813, lon: 10.675, terrain: 'pianeggiante', note: 'pianura del Tau: Altopascio fu l\'ospitale dei "frati del Tau"', lodging: 'ostello comunale del pellegrino accanto alla chiesa del Tau; timbro lì o in comune' },
      { day: 2, from: 'Altopascio', to: 'San Miniato', km: 25, lat: 43.680, lon: 10.852, terrain: 'pianeggiante, poi salita finale alla rocca', note: 'via Ponte a Cappiano e Fucecchio, arrivo sulla rocca di Federico II', lodging: 'convento di San Francesco (accoglienza pellegrina, arriva entro le 17) o B&B; timbro al convento' },
      { day: 3, from: 'San Miniato', to: 'Gambassi Terme', km: 24, lat: 43.540, lon: 10.953, terrain: 'collinare, crinali', note: 'crinali della valle dell\'Elsa, pieve di Coiano', lodging: 'ostello Sigerico alla pieve di Chianni (storica accoglienza, prenota in stagione); timbro all\'ostello' },
      { day: 4, from: 'Gambassi Terme', to: 'San Gimignano', km: 13, lat: 43.468, lon: 11.043, terrain: 'collinare', note: 'santuario di Pancole e ingresso tra le torri', lodging: 'conventi e ostelli in centro; timbro al monastero di San Girolamo o alla pro loco' },
    ],
    credential: 'la credenziale ufficiale della Via Francigena (timbro anche all\'ospitale di Altopascio e alla pieve di Coiano).',
    notes: 'Periodo migliore: primavera e inizio autunno. Difficoltà: media (due tappe sopra i 24 km). Poca ombra sui crinali: cappello e acqua abbondante.',
  },
  {
    id: 'walk-viadeglidei', emoji: '⛰', name: 'Via degli Dei — da Bologna a Firenze',
    start: 'Bologna', end: 'Firenze', country: 'Italia', continent: 'Europa', difficulty: 'impegnativa', days: 5,
    coords: { lat: 44.494, lon: 11.343 },
    stages: [
      { day: 1, from: 'Bologna', to: 'Badolo', km: 16, lat: 44.400, lon: 11.256, terrain: '+600 m circa (San Luca e Monte Adone)', note: 'partenza dal portico di San Luca (666 archi), arrivo sotto il contrafforte di Monte Adone', lodging: 'agriturismi e B&B di Badolo/Brento (pochi: prenota PRIMA di partire); timbro sulla credenziale dove dormi' },
      { day: 2, from: 'Badolo', to: 'Madonna dei Fornelli', km: 25, lat: 44.216, lon: 11.253, terrain: 'saliscendi appenninici continui', note: 'Monte Adone e Monzuno: la tappa più varia', lodging: 'alberghetti e B&B del paese, abituati ai camminatori; timbro al bar/alloggio convenzionato' },
      { day: 3, from: 'Madonna dei Fornelli', to: 'Passo della Futa', km: 17, lat: 44.096, lon: 11.288, terrain: 'salita dolce fino ai 900 m del passo', note: 'lastricati romani della Flaminia militare e cimitero germanico della Futa', lodging: 'rifugio/ristoro al passo o strutture a Monte di Fò (campeggio con bungalow); timbro al ristoro' },
      { day: 4, from: 'Passo della Futa', to: 'San Piero a Sieve', km: 21, lat: 43.965, lon: 11.328, terrain: 'discesa lunga nel Mugello', note: 'discesa nel Mugello mediceo', lodging: 'B&B e affittacamere in paese; timbro all\'ufficio turistico del Mugello o dove dormi' },
      { day: 5, from: 'San Piero a Sieve', to: 'Firenze', km: 30, lat: 43.769, lon: 11.255, terrain: 'ultima salita a Monte Senario poi discesa su Fiesole', note: 'tappa lunga via Monte Senario e Fiesole: arrivo in piazza della Signoria — frazionabile dormendo a Fiesole', lodging: 'ostelli e hotel a Firenze (prenota: città sempre piena); timbro finale nei punti convenzionati del centro' },
    ],
    credential: 'esiste la credenziale ufficiale della Via degli Dei con timbri nei rifugi e nei bar convenzionati di tappa.',
    notes: 'Periodo migliore: maggio-giugno e settembre (d\'estate caldo, d\'inverno neve in quota). Difficoltà: media/impegnativa, dislivelli veri in Appennino. Scarponcini, bastoncini consigliati, ultima tappa frazionabile a Fiesole.',
  },
  {
    id: 'walk-sanbenedetto', emoji: '⛪', name: 'Cammino di San Benedetto — da Norcia a Rieti',
    start: 'Norcia', end: 'Rieti', country: 'Italia', continent: 'Europa', difficulty: 'media', days: 5,
    coords: { lat: 42.793, lon: 13.096 },
    stages: [
      { day: 1, from: 'Norcia', to: 'Cascia', km: 18, lat: 42.718, lon: 13.013, terrain: 'montano dolce, un valico', note: 'dalla città di Benedetto a quella di Santa Rita', lodging: 'case religiose e hotel presso il santuario di Santa Rita; timbro al santuario' },
      { day: 2, from: 'Cascia', to: 'Monteleone di Spoleto', km: 15, lat: 42.653, lon: 12.953, terrain: 'salita, si resta sopra i 900 m', note: 'borgo della biga etrusca', lodging: 'affittacamere del borgo (pochissimi posti: prenota); timbro in comune o parrocchia' },
      { day: 3, from: 'Monteleone di Spoleto', to: 'Leonessa', km: 14, lat: 42.566, lon: 12.961, terrain: 'altopiano, tappa corta', note: 'altopiano leonessano, panoramica', lodging: 'B&B e alberghi di Leonessa; timbro in parrocchia (San Francesco)' },
      { day: 4, from: 'Leonessa', to: 'Poggio Bustone', km: 22, lat: 42.503, lon: 12.884, terrain: 'saliscendi montani, ultimo strappo al borgo', note: 'ingresso nella valle Santa francescana', lodging: 'accoglienza presso il convento/ostello del borgo; timbro al santuario francescano' },
      { day: 5, from: 'Poggio Bustone', to: 'Rieti', km: 18, lat: 42.404, lon: 12.863, terrain: 'discesa nella piana reatina', note: 'santuari della valle (La Foresta) e arrivo all\'ombelico d\'Italia', lodging: 'ostelli e hotel a Rieti; timbro finale all\'ufficio del cammino/ufficio turistico' },
    ],
    credential: 'credenziale ufficiale del Cammino di San Benedetto (si timbra in parrocchie e strutture d\'accoglienza).',
    notes: 'Periodo migliore: maggio-ottobre (in quota l\'inverno è rigido). Difficoltà: media, tappe montane ma mai tecniche. Zone terremotate nel 2016: alcune strutture sono ancora provvisorie, prenota i pernotti.',
  },
  {
    id: 'walk-francesco', emoji: '☀️', name: 'Cammino di Francesco — da La Verna ad Assisi',
    start: 'Chiusi della Verna', end: 'Assisi', country: 'Italia', continent: 'Europa', difficulty: 'impegnativa', days: 7,
    coords: { lat: 43.706, lon: 11.930 },
    stages: [
      { day: 1, from: 'Chiusi della Verna', to: 'Pieve Santo Stefano', km: 15, lat: 43.670, lon: 12.043, terrain: 'discesa dal monte della Verna', note: 'partenza dal santuario delle Stimmate', lodging: 'accoglienza religiosa o alberghetto in paese; timbro alla partenza al santuario della Verna e all\'arrivo in parrocchia' },
      { day: 2, from: 'Pieve Santo Stefano', to: 'Sansepolcro', km: 25, lat: 43.571, lon: 12.143, terrain: 'collinare, valle del Tevere giovane', note: 'arrivo nella città di Piero della Francesca', lodging: 'ostelli e conventi con foresteria; timbro alla cattedrale o all\'ufficio turistico' },
      { day: 3, from: 'Sansepolcro', to: 'Città di Castello', km: 17, lat: 43.460, lon: 12.240, terrain: 'pianeggiante/collinare', note: 'alta valle tiberina umbra', lodging: 'foresterie religiose e B&B; timbro in duomo' },
      { day: 4, from: 'Città di Castello', to: 'Pietralunga', km: 30, lat: 43.440, lon: 12.435, terrain: 'boschi e saliscendi lunghi', note: 'tappa lunga: partenza all\'alba', lodging: 'ostello parrocchiale o agriturismi (prenota: paese piccolo); timbro in parrocchia' },
      { day: 5, from: 'Pietralunga', to: 'Gubbio', km: 26, lat: 43.353, lon: 12.578, terrain: 'boschi, poi discesa su Gubbio', note: 'arrivo nella città del lupo ammansito', lodging: 'conventi con accoglienza e ostelli; timbro a San Francesco della Pace' },
      { day: 6, from: 'Gubbio', to: 'Valfabbrica', km: 30, lat: 43.158, lon: 12.601, terrain: 'saliscendi continui, tappa lunga (variante con sosta a Biscina)', note: 'la tappa del "primo viaggio" di Francesco spogliato di tutto', lodging: 'ostello comunale o agriturismo a Biscina per frazionare; timbro dove dormi' },
      { day: 7, from: 'Valfabbrica', to: 'Assisi', km: 14, lat: 43.071, lon: 12.617, terrain: 'collinare, ultima salita alla basilica', note: 'arrivo alla basilica di San Francesco dalla porta di Ponte Grande', lodging: 'case religiose e ostelli ad Assisi (prenota SEMPRE); Testimonium allo Statio Peregrinorum della basilica' },
    ],
    credential: 'credenziale del pellegrino della Via di Francesco: con i timbri di tappa ad Assisi si ritira il Testimonium.',
    notes: 'Periodo migliore: aprile-giugno e settembre-ottobre. Difficoltà: media/impegnativa (due tappe da 30 km, frazionabili). Bagaglio essenziale; ad Assisi prenota il pernotto con anticipo.',
  },
  {
    id: 'walk-materano', emoji: '🪨', name: 'Cammino Materano (Via Peuceta) — da Bari a Matera',
    start: 'Bari', end: 'Matera', country: 'Italia', continent: 'Europa', difficulty: 'media', days: 5,
    coords: { lat: 41.125, lon: 16.867 },
    stages: [
      { day: 1, from: 'Bari', to: 'Bitetto', km: 21, lat: 41.039, lon: 16.749, terrain: 'pianeggiante tra gli ulivi', note: 'partenza dalla basilica di San Nicola', lodging: 'accoglienza parrocchiale o B&B; timbro alla partenza a San Nicola e all\'arrivo in parrocchia' },
      { day: 2, from: 'Bitetto', to: 'Cassano delle Murge', km: 21, lat: 40.889, lon: 16.772, terrain: 'prima salita dolce sulla Murgia', note: 'primi gradini della Murgia', lodging: 'B&B convenzionati col cammino; timbro al punto accoglienza del paese' },
      { day: 3, from: 'Cassano delle Murge', to: 'Santeramo in Colle', km: 18, lat: 40.794, lon: 16.755, terrain: 'altopiano murgiano', note: 'bosco di Mesola e masserie', lodging: 'affittacamere in paese; timbro in parrocchia' },
      { day: 4, from: 'Santeramo in Colle', to: 'Altamura', km: 21, lat: 40.827, lon: 16.549, terrain: 'altopiano, tratturi', note: 'arrivo nella città del pane DOP e della cattedrale federiciana', lodging: 'B&B in centro; timbro alla cattedrale, cena col pane di Altamura' },
      { day: 5, from: 'Altamura', to: 'Matera', km: 22, lat: 40.666, lon: 16.604, terrain: 'tratturi e jazzi, ingresso dalla Murgia materana', note: 'affaccio finale sui Sassi', lodging: 'ostelli e case nei Sassi (prenota); Testimonium al punto del Cammino Materano' },
    ],
    credential: 'credenziale ufficiale del Cammino Materano; a Matera si richiede il Testimonium alla rete del cammino.',
    notes: 'Periodo migliore: marzo-maggio e settembre-novembre (la Murgia d\'estate è un forno, pochissima ombra). Difficoltà: facile/media ma tappe assolate: partenze all\'alba, 2 litri d\'acqua a testa.',
  },
  {
    id: 'walk-appia', emoji: '🏛', name: 'Via Appia — tratto pugliese, da Taranto a Brindisi',
    start: 'Taranto', end: 'Brindisi', country: 'Italia', continent: 'Europa', difficulty: 'facile', days: 4,
    coords: { lat: 40.476, lon: 17.230 },
    stages: [
      { day: 1, from: 'Taranto', to: 'Grottaglie', km: 22, lat: 40.537, lon: 17.437, terrain: 'pianeggiante', note: 'dalla città vecchia bimare al quartiere delle ceramiche', lodging: 'B&B nel quartiere delle ceramiche; nessuna credenziale ufficiale: fai firmare/timbrare un diario di viaggio nei musei' },
      { day: 2, from: 'Grottaglie', to: 'Oria', km: 20, lat: 40.500, lon: 17.640, terrain: 'pianeggiante, qualche gravina', note: 'gravine e vigneti, arrivo sotto il castello svevo', lodging: 'affittacamere nel borgo medievale' },
      { day: 3, from: 'Oria', to: 'Mesagne', km: 17, lat: 40.558, lon: 17.810, terrain: 'pianeggiante', note: 'ulivi monumentali della piana messapica', lodging: 'B&B in centro storico' },
      { day: 4, from: 'Mesagne', to: 'Brindisi', km: 15, lat: 40.638, lon: 17.946, terrain: 'pianeggiante', note: 'arrivo alle colonne romane: il "chilometro zero" finale della Regina Viarum', lodging: 'hotel e B&B sul porto' },
    ],
    notes: 'La Regina Viarum è patrimonio UNESCO dal 2024: il tratto pugliese è pianeggiante e assolato. Periodo migliore: primavera e autunno. Difficoltà: facile; tratti su asfalto secondario, cappello e crema solare obbligatori.',
  },
  {
    id: 'walk-santiago-sarria', emoji: '🐚', name: 'Cammino di Santiago — ultimi 100 km da Sarria',
    start: 'Sarria', end: 'Santiago de Compostela', country: 'Spagna', continent: 'Europa', difficulty: 'media', days: 5,
    coords: { lat: 42.781, lon: -7.414 },
    stages: [
      { day: 1, from: 'Sarria', to: 'Portomarín', km: 22, lat: 42.807, lon: -7.616, terrain: 'collinare, boschi', note: 'boschi galiziani e il ponte sul Miño', lodging: 'albergue pubblici e privati (i pubblici non si prenotano: arriva entro le 14-15); primo timbro a Sarria, secondo all\'albergue' },
      { day: 2, from: 'Portomarín', to: 'Palas de Rei', km: 25, lat: 42.873, lon: -7.869, terrain: 'salita dolce a Sierra Ligonde, poi altopiano', note: 'altopiano tra eucalipti e horreos', lodging: 'albergue lungo tutta la tappa; 2 timbri al giorno obbligatori (bar, chiese, albergue)' },
      { day: 3, from: 'Palas de Rei', to: 'Arzúa', km: 29, lat: 42.930, lon: -8.161, terrain: 'saliscendi continui', note: 'la tappa più lunga: Melide e il pulpo á feira a metà strada', lodging: 'molti albergue ad Arzúa; in alta stagione i privati si prenotano la sera prima' },
      { day: 4, from: 'Arzúa', to: 'O Pedrouzo', km: 19, lat: 42.905, lon: -8.362, terrain: 'collinare dolce, boschi', note: 'tappa di respiro', lodging: 'albergue di O Pedrouzo/Arca; timbro anche nelle cappelle lungo il percorso' },
      { day: 5, from: 'O Pedrouzo', to: 'Santiago de Compostela', km: 20, lat: 42.881, lon: -8.545, terrain: 'collinare, Monte do Gozo', note: 'arrivo in praza do Obradoiro', lodging: 'ostelli e pensioni a Santiago; Compostela all\'Oficina del Peregrino mostrando la credenziale completa' },
    ],
    credential: 'credenziale del pellegrino OBBLIGATORIA con 2 timbri al giorno negli ultimi 100 km: è il requisito per la Compostela.',
    notes: 'Periodo migliore: maggio-giugno e settembre (luglio-agosto affollatissimi, pioggia possibile sempre in Galizia). Difficoltà: facile/media. Prenota gli albergues in stagione; mantella antipioggia sempre nello zaino.',
  },
  {
    id: 'walk-portoghese', emoji: '🐚', name: 'Cammino Portoghese — da Tui a Santiago (tratto finale della via da Porto)',
    start: 'Tui', end: 'Santiago de Compostela', country: 'Spagna', continent: 'Europa', difficulty: 'facile', days: 6,
    coords: { lat: 42.047, lon: -8.646 },
    stages: [
      { day: 1, from: 'Tui', to: 'O Porriño', km: 18, lat: 42.161, lon: -8.620, terrain: 'pianeggiante', note: 'dalla cattedrale-fortezza sul Miño, il confine col Portogallo', lodging: 'albergue municipale e privati; timbro alla cattedrale di Tui in partenza' },
      { day: 2, from: 'O Porriño', to: 'Redondela', km: 16, lat: 42.283, lon: -8.609, terrain: 'un valico dolce (alto de Santiaguiño)', note: 'primo affaccio sulla ría de Vigo', lodging: 'albergue di Redondela; 2 timbri al giorno (siamo negli ultimi 100 km)' },
      { day: 3, from: 'Redondela', to: 'Pontevedra', km: 18, lat: 42.431, lon: -8.644, terrain: 'collinare dolce', note: 'ponte medievale di Pontesampaio', lodging: 'albergue e pensioni in centro storico; timbro al santuario della Peregrina' },
      { day: 4, from: 'Pontevedra', to: 'Caldas de Reis', km: 21, lat: 42.605, lon: -8.641, terrain: 'pianeggiante, boschi', note: 'borgo termale: bagno dei piedi nelle acque calde', lodging: 'albergue e piccoli hotel termali; timbro all\'albergue' },
      { day: 5, from: 'Caldas de Reis', to: 'Padrón', km: 18, lat: 42.738, lon: -8.660, terrain: 'collinare dolce', note: 'dove la tradizione fa approdare la barca dell\'Apostolo; peperoni de Padrón a cena', lodging: 'albergue di Padrón; timbro alla chiesa di Santiago (il "pedrón" romano è lì)' },
      { day: 6, from: 'Padrón', to: 'Santiago de Compostela', km: 24, lat: 42.881, lon: -8.545, terrain: 'collinare', note: 'ultima tappa fino all\'abbraccio del Santo', lodging: 'ostelli e pensioni a Santiago; Compostela all\'Oficina del Peregrino con la credenziale completa' },
    ],
    credential: 'credenziale del pellegrino con 2 timbri/giorno da Tui in poi (oltre 100 km: dà diritto alla Compostela).',
    notes: 'Il Portoghese completo parte da Porto (~240 km): questa è la versione degli ultimi 115 km. Periodo migliore: maggio-settembre. Difficoltà: facile, il più dolce dei cammini principali.',
  },
  {
    id: 'walk-santommaso', emoji: '⛪', name: 'Via di San Tommaso — da Sulmona a Ortona',
    start: 'Sulmona', end: 'Ortona', country: 'Italia', continent: 'Europa', difficulty: 'media', days: 4,
    coords: { lat: 42.049, lon: 13.926 },
    stages: [
      { day: 1, from: 'Sulmona', to: 'Caramanico Terme', km: 25, lat: 42.157, lon: 14.004, terrain: 'montano dolce, porte della Majella', note: 'valle dell\'Orta', lodging: 'alberghi termali e B&B; timbro all\'ufficio turistico o in parrocchia' },
      { day: 2, from: 'Caramanico Terme', to: 'Manoppello', km: 20, lat: 42.257, lon: 14.058, terrain: 'collinare in discesa', note: 'arrivo al santuario del Volto Santo', lodging: 'foresteria del santuario o B&B in paese; timbro al santuario del Volto Santo' },
      { day: 3, from: 'Manoppello', to: 'Chieti', km: 25, lat: 42.351, lon: 14.168, terrain: 'colline teatine, saliscendi', note: 'la Chieti romana (Teate)', lodging: 'B&B in centro storico; timbro in cattedrale' },
      { day: 4, from: 'Chieti', to: 'Ortona', km: 25, lat: 42.356, lon: 14.404, terrain: 'discesa lunga verso l\'Adriatico', note: 'nella cattedrale di Ortona riposano le reliquie dell\'apostolo Tommaso', lodging: 'hotel e B&B sul mare; timbro finale alla basilica di San Tommaso Apostolo' },
    ],
    credential: 'esiste la credenziale della Via di San Tommaso (il cammino completo unisce Roma a Ortona).',
    notes: 'Versione abruzzese del cammino (il tracciato intero parte da Roma). Periodo migliore: maggio-giugno e settembre. Difficoltà: media, saliscendi collinari continui; tratti su strade secondarie.',
  },
  {
    id: 'walk-santantonio', emoji: '⛪', name: 'Cammino di Sant\'Antonio — da Padova ai Colli Euganei e al Po',
    start: 'Padova', end: 'Rovigo', country: 'Italia', continent: 'Europa', difficulty: 'facile', days: 3,
    coords: { lat: 45.407, lon: 11.876 },
    stages: [
      { day: 1, from: 'Padova', to: 'Abbazia di Praglia', km: 15, lat: 45.371, lon: 11.720, terrain: 'pianeggiante', note: 'partenza dalla basilica del Santo, arrivo all\'abbazia benedettina ai piedi dei colli', lodging: 'foresteria dell\'abbazia (contatta i monaci in anticipo) o B&B vicini; timbro alla basilica del Santo e in abbazia' },
      { day: 2, from: 'Abbazia di Praglia', to: 'Monselice', km: 20, lat: 45.237, lon: 11.750, terrain: 'collinare (Colli Euganei)', note: 'Arquà Petrarca poco fuori traccia', lodging: 'B&B sotto la Rocca; timbro al santuario delle Sette Chiese' },
      { day: 3, from: 'Monselice', to: 'Rovigo', km: 25, lat: 45.070, lon: 11.790, terrain: 'pianeggiante (Polesine)', note: 'pianura del Polesine lungo canali e argini', lodging: 'hotel e B&B in centro; timbro in parrocchia o al punto tappa del cammino' },
    ],
    credential: 'credenziale del Cammino di Sant\'Antonio (il "Lungo Cammino" prosegue fino a La Verna): timbro alla basilica del Santo alla partenza.',
    notes: 'Periodo migliore: aprile-giugno e settembre-ottobre (la pianura d\'estate è afosa). Difficoltà: facile, dislivelli solo sui colli. Ideale come primo cammino in assoluto.',
  },
  {
    id: 'walk-oropa', emoji: '⛰', name: 'Cammino di Oropa — da Santhià al santuario',
    start: 'Santhià', end: 'Oropa', country: 'Italia', continent: 'Europa', difficulty: 'media', days: 3,
    coords: { lat: 45.367, lon: 8.173 },
    stages: [
      { day: 1, from: 'Santhià', to: 'Roppolo', km: 16, lat: 45.421, lon: 8.070, terrain: 'pianeggiante, risaie e lago di Viverone', note: 'castello di Roppolo', lodging: 'ostello del castello o accoglienze del cammino (posti contati: prenota sul circuito ufficiale); timbro all\'ostello' },
      { day: 2, from: 'Roppolo', to: 'Sala Biellese', km: 14, lat: 45.457, lon: 7.960, terrain: 'collinare (Serra morenica d\'Ivrea)', note: 'la collina "disegnata" più lunga d\'Europa', lodging: 'accoglienza pellegrina di Sala Biellese; timbro all\'accoglienza' },
      { day: 3, from: 'Sala Biellese', to: 'Oropa', km: 20, lat: 45.628, lon: 7.980, terrain: '+1000 m circa di salita finale', note: 'arrivo al sacro monte UNESCO e alla Madonna Nera', lodging: 'si dorme AL santuario (camere delle antiche accoglienze reali); Testimonium e timbro finale a Oropa' },
    ],
    credential: 'credenziale ufficiale del Cammino di Oropa: con i timbri, al santuario si riceve il Testimonium.',
    notes: 'Il cammino "breve" perfetto per iniziare: 3 giorni veri. Periodo migliore: maggio-ottobre (l\'ultima tappa sale a 1.150 m: meteo da controllare). Difficoltà: media solo per la salita finale; si può dormire al santuario stesso.',
  },
  {
    id: 'walk-magnavia', emoji: '🥾', name: 'Magna Via Francigena — da Palermo ad Agrigento',
    start: 'Palermo', end: 'Agrigento', country: 'Italia', continent: 'Europa', difficulty: 'impegnativa', days: 7,
    coords: { lat: 38.116, lon: 13.362 },
    stages: [
      { day: 1, from: 'Palermo', to: 'Monreale', km: 8, lat: 38.082, lon: 13.289, terrain: 'salita breve alla conca d\'oro', note: 'tappa breve: partenza dalla cattedrale e pomeriggio per il duomo normanno', lodging: 'foresterie religiose e B&B; credenziale e primo timbro alla cattedrale di Palermo' },
      { day: 2, from: 'Monreale', to: 'Santa Cristina Gela', km: 23, lat: 37.985, lon: 13.328, terrain: 'collinare, boschi', note: 'comunità arbëreshë', lodging: 'agriturismi e case del cammino (pochi posti: prenota); timbro in comune' },
      { day: 3, from: 'Santa Cristina Gela', to: 'Corleone', km: 26, lat: 37.813, lon: 13.301, terrain: 'saliscendi d\'entroterra', note: 'arrivo nella Corleone dei laboratori antimafia', lodging: 'B&B e accoglienze parrocchiali; timbro al punto tappa della Magna Via' },
      { day: 4, from: 'Corleone', to: 'Prizzi', km: 21, lat: 37.722, lon: 13.428, terrain: 'salita, borgo a quasi 1.000 m', note: 'borgo d\'altura', lodging: 'affittacamere del borgo; timbro in comune o parrocchia' },
      { day: 5, from: 'Prizzi', to: 'Castronovo di Sicilia', km: 25, lat: 37.679, lon: 13.605, terrain: 'vallate del Platani', note: 'feudi e vallate', lodging: 'accoglienza pellegrina di Castronovo; timbro all\'accoglienza' },
      { day: 6, from: 'Castronovo di Sicilia', to: 'Sutera', km: 30, lat: 37.525, lon: 13.735, terrain: 'tappa lunga, saliscendi (via Cammarata)', note: 'arrivo nel borgo-presepe sotto il monte San Paolino', lodging: 'ostello di Sutera nel quartiere arabo Rabato; timbro all\'ostello' },
      { day: 7, from: 'Sutera', to: 'Agrigento', km: 28, lat: 37.311, lon: 13.576, terrain: 'lungo, collinare; accorciabile in bus da Racalmuto', note: 'chiusura alla Valle dei Templi', lodging: 'B&B ad Agrigento; Testimonium al punto ufficiale della Magna Via Francigena' },
    ],
    credential: 'credenziale ufficiale della Magna Via Francigena; ad Agrigento si ritira il Testimonium.',
    notes: 'Versione intensa in 7 giorni del tracciato ufficiale (che ne prevede 9): due tappe sfiorano i 30 km e sono frazionabili o accorciabili in bus. Periodo migliore: marzo-maggio e ottobre (MAI luglio-agosto: entroterra rovente e senz\'ombra). Difficoltà: impegnativa; scorte d\'acqua serie, alcuni paesi hanno servizi minimi.',
  },
  // ── Mondo ──────────────────────────────────────────────────────────
  {
    id: 'walk-kumano-kodo', emoji: '⛩', name: 'Kumano Kodo (Nakahechi) — da Takijiri a Nachi',
    start: 'Takijiri-oji', end: 'Nachisan', country: 'Giappone', continent: 'Asia', difficulty: 'impegnativa', days: 4,
    coords: { lat: 33.791, lon: 135.463 },
    stages: [
      { day: 1, from: 'Takijiri-oji', to: 'Chikatsuyu', km: 13, lat: 33.836, lon: 135.550, terrain: 'salita ripida iniziale, poi crinali (+800 m)', note: 'oji (santuari minori) lungo il sentiero, villaggio di Takahara a metà', lodging: 'minshuku (pensione familiare con cena kaiseki) — PRENOTA settimane prima, i posti sono pochissimi; timbro all\'oji e al minshuku' },
      { day: 2, from: 'Chikatsuyu', to: 'Hongu', km: 25, lat: 33.840, lon: 135.774, terrain: 'lunga, boschi di cedri e saliscendi', note: 'arrivo al grande santuario Kumano Hongu Taisha e al torii gigante di Oyunohara', lodging: 'ryokan o minshuku a Hongu/Yunomine Onsen (bagno termale dei pellegrini); timbro al Hongu Taisha' },
      { day: 3, from: 'Hongu', to: 'Koguchi', km: 13, lat: 33.771, lon: 135.858, terrain: 'saliscendi boscosi', note: 'tratto Kogumotori-goe', lodging: 'minshuku o casa del pellegrino a Koguchi (pochissimi posti: prenota); timbro al punto tappa' },
      { day: 4, from: 'Koguchi', to: 'Nachisan', km: 15, lat: 33.669, lon: 135.890, terrain: 'la salita più dura (Ogumotori-goe, +800 m su gradinate)', note: 'arrivo al Nachi Taisha e alla cascata di Nachi accanto alla pagoda', lodging: 'shukubo (alloggio nel tempio) o guesthouse a Nachisan/Kii-Katsuura; timbro finale al Nachi Taisha' },
    ],
    credential: 'passaporto del pellegrino Kumano Kodo (dual pilgrim con Santiago): timbri agli oji e ai santuari; il "Dual Pilgrim" si registra a Hongu.',
    notes: 'Periodo migliore: marzo-maggio e ottobre-novembre (giugno piovoso, agosto afoso, tifoni a fine estate). Difficoltà: impegnativa, gradinate di pietra scivolose con pioggia. Bagaglio minimo (esiste il servizio di trasporto zaini tra i minshuku); contanti: molti alloggi non accettano carte.',
  },
  {
    id: 'walk-shikoku', emoji: '⛩', name: 'Pellegrinaggio di Shikoku — i primi 11 templi (tratto di Tokushima)',
    start: 'Naruto', end: 'Yoshinogawa', country: 'Giappone', continent: 'Asia', difficulty: 'media', days: 3,
    coords: { lat: 34.156, lon: 134.504 },
    stages: [
      { day: 1, from: 'Naruto', to: 'Kamiita', km: 18, lat: 34.118, lon: 134.407, terrain: 'pianeggiante, campagna e paesi', note: 'si parte dal tempio 1 Ryōzenji (si compra qui il corredo del pellegrino) e si toccano i templi 2-6', lodging: 'shukubō del tempio 6 Anrakuji (alloggio nel tempio con preghiera serale) — esperienza da non saltare; timbro (nōkyō) a ogni tempio' },
      { day: 2, from: 'Kamiita', to: 'Awa', km: 17, lat: 34.102, lon: 134.295, terrain: 'pianeggiante lungo il fiume Yoshino', note: 'templi 7-10; al tempio 10 Kirihataji breve salita a gradini', lodging: 'minshuku o business hotel di zona (prenota: pochi); nōkyō a ogni tempio sul libretto nōkyōchō' },
      { day: 3, from: 'Awa', to: 'Yoshinogawa', km: 12, lat: 34.063, lon: 134.351, terrain: 'pianeggiante', note: 'arrivo al tempio 11 Fujiidera, dove il cammino "vero" sale in montagna: qui si chiude il tratto introduttivo', lodging: 'guesthouse per pellegrini henro; ultimo nōkyō del tratto a Fujiidera' },
    ],
    credential: 'il nōkyōchō (libro dei timbri): a ogni tempio calligrafia e sigillo rossi (piccola offerta per timbro). Abito bianco (hakui) e bastone kongōzue sono la tradizione.',
    notes: 'Il circuito completo è di 88 templi e ~1.200 km: questo è il tratto d\'ingresso classico. Periodo migliore: marzo-maggio e ottobre-novembre. Difficoltà: media (asfalto e sentiero misti). Gli henro (pellegrini) ricevono spesso osettai (doni): si accettano con un inchino, non si rifiutano.',
  },
  {
    id: 'walk-stolav', emoji: '❄️', name: 'Cammino di Sant\'Olav — da Stiklestad a Trondheim',
    start: 'Stiklestad', end: 'Trondheim', country: 'Norvegia', continent: 'Europa', difficulty: 'media', days: 5,
    coords: { lat: 63.795, lon: 11.567 },
    stages: [
      { day: 1, from: 'Stiklestad', to: 'Levanger', km: 19, lat: 63.746, lon: 11.299, terrain: 'collinare dolce, campi e fattorie', note: 'partenza dal luogo della battaglia dove morì re Olav (1030)', lodging: 'pilegrimsherberge (ostello del pellegrino) o pensioni; timbro al centro di Stiklestad e all\'ostello' },
      { day: 2, from: 'Levanger', to: 'Åsen', km: 22, lat: 63.604, lon: 11.058, terrain: 'boschi e riva del fiordo', note: 'il Trondheimsfjord accompagna quasi tutta la tappa', lodging: 'accoglienze del cammino e fattorie che ospitano pellegrini (avvisa in anticipo); timbro dove dormi' },
      { day: 3, from: 'Åsen', to: 'Stjørdal', km: 25, lat: 63.468, lon: 10.926, terrain: 'saliscendi boscosi', note: 'chiese medievali in pietra lungo la via', lodging: 'ostelli e hotel di Stjørdal; timbro in chiesa' },
      { day: 4, from: 'Stjørdal', to: 'Malvik', km: 20, lat: 63.430, lon: 10.655, terrain: 'costiero, saliscendi', note: 'vista sul fiordo verso Trondheim', lodging: 'accoglienza pellegrina o B&B; timbro al punto tappa' },
      { day: 5, from: 'Malvik', to: 'Trondheim', km: 20, lat: 63.430, lon: 10.395, terrain: 'costiero, ingresso urbano dolce', note: 'arrivo alla cattedrale di Nidaros, il "Santiago del Nord"', lodging: 'pilgrim centre di Trondheim (ostello ufficiale accanto alla cattedrale); qui si riceve l\'Olavsbrevet (attestato)' },
    ],
    credential: 'passaporto del pellegrino di Sant\'Olav: con i timbri delle tappe si riceve l\'Olavsbrevet al Nidaros Pilgrim Centre.',
    notes: 'Periodo: giugno-agosto SOLTANTO (luce lunga, sentieri asciutti); fuori stagione molte accoglienze chiudono. Difficoltà: media, ma meteo nordico mutevole: strati caldi e antipioggia sempre. Prezzi norvegesi alti: metti in conto più budget del solito.',
  },
  {
    id: 'walk-podiensis', emoji: '🐚', name: 'Via Podiensis (GR65) — da Le Puy-en-Velay all\'Aubrac',
    start: 'Le Puy-en-Velay', end: 'Saint-Chély-d\'Aubrac', country: 'Francia', continent: 'Europa', difficulty: 'media', days: 6,
    coords: { lat: 45.043, lon: 3.885 },
    stages: [
      { day: 1, from: 'Le Puy-en-Velay', to: 'Saint-Privat-d\'Allier', km: 23, lat: 44.988, lon: 3.672, terrain: 'altopiano vulcanico del Velay', note: 'partenza dopo la benedizione del pellegrino in cattedrale (ogni mattina)', lodging: 'gîte d\'étape (posti letto in camerata, mezza pensione tipica): prenota la sera prima; timbro in cattedrale e al gîte' },
      { day: 2, from: 'Saint-Privat-d\'Allier', to: 'Saugues', km: 19, lat: 44.960, lon: 3.548, terrain: 'discesa ripida alle gole dell\'Allier e risalita', note: 'ponte di Monistrol-d\'Allier', lodging: 'gîte comunali e privati; timbro all\'ufficio turistico' },
      { day: 3, from: 'Saugues', to: 'Saint-Alban-sur-Limagnole', km: 30, lat: 44.780, lon: 3.388, terrain: 'lunga, brughiere del Gévaudan (frazionabile al Sauvage)', note: 'il paese della "Bestia del Gévaudan"', lodging: 'gîte storico del Sauvage a metà tappa per chi fraziona; timbro al gîte' },
      { day: 4, from: 'Saint-Alban-sur-Limagnole', to: 'Aumont-Aubrac', km: 15, lat: 44.722, lon: 3.283, terrain: 'collinare dolce', note: 'tappa di respiro, si entra in Lozère', lodging: 'gîte e piccoli hotel; timbro in mairie o al gîte' },
      { day: 5, from: 'Aumont-Aubrac', to: 'Nasbinals', km: 27, lat: 44.664, lon: 3.043, terrain: 'altopiano dell\'Aubrac, esposto al vento', note: 'pascoli sconfinati e mucche dell\'Aubrac: il tratto più celebre della via', lodging: 'gîte di Nasbinals (pochi e ambiti: prenota); timbro al gîte' },
      { day: 6, from: 'Nasbinals', to: 'Saint-Chély-d\'Aubrac', km: 17, lat: 44.586, lon: 2.918, terrain: 'valico a 1.340 m poi discesa', note: 'passaggio dal borgo di Aubrac con la torre dei pellegrini; aligot come premio finale', lodging: 'gîte e auberge del paese; timbro finale sul ponte dei pellegrini (UNESCO)' },
    ],
    credential: 'la créanciale francese: timbri in cattedrali, gîte e uffici turistici (vale poi per proseguire fino a Santiago).',
    notes: 'La Podiensis intera arriva a Saint-Jean-Pied-de-Port (~740 km): questo è il primo tratto, il più amato. Periodo migliore: maggio-giugno e settembre (l\'Aubrac d\'inverno è innevato). Difficoltà: media. I gîte offrono mezza pensione: prenotare la demi-pension è la norma del cammino.',
  },
  {
    id: 'walk-jesustrail', emoji: '🕊', name: 'Jesus Trail — da Nazareth a Cafarnao',
    start: 'Nazareth', end: 'Cafarnao', country: 'Israele', continent: 'Asia', difficulty: 'media', days: 4,
    coords: { lat: 32.702, lon: 35.298 },
    stages: [
      { day: 1, from: 'Nazareth', to: 'Kafr Kanna', km: 14, lat: 32.747, lon: 35.339, terrain: 'collinare, uscita urbana poi uliveti', note: 'dalla basilica dell\'Annunciazione a Cana, il luogo del primo miracolo', lodging: 'guesthouse cristiane e ospitalità locali a Cana; nessuna credenziale ufficiale: molti fanno timbrare un diario nelle chiese' },
      { day: 2, from: 'Kafr Kanna', to: 'Kibbutz Lavi', km: 15, lat: 32.787, lon: 35.438, terrain: 'collinare, foresta di Lavi', note: 'campagna galilaica e resti della via romana', lodging: 'hotel del kibbutz (esperienza a sé) o campeggio attrezzato' },
      { day: 3, from: 'Kibbutz Lavi', to: 'Moshav Arbel', km: 13, lat: 32.824, lon: 35.478, terrain: 'i Corni di Hattin e discesa al moshav', note: 'il campo di battaglia del 1187 e la vista sul lago di Tiberiade', lodging: 'B&B rurali del moshav (prenota); acqua abbondante: zona calda' },
      { day: 4, from: 'Moshav Arbel', to: 'Cafarnao', km: 17, lat: 32.881, lon: 35.575, terrain: 'discesa ripida dalla falesia dell\'Arbel, poi riva del lago', note: 'monte delle Beatitudini, Tabgha e arrivo alla "città di Gesù" sul lago', lodging: 'foresterie religiose a Tabgha/Tiberiade (i siti di Cafarnao non ospitano: pernotta nei dintorni)' },
    ],
    credential: 'non esiste una credenziale ufficiale; le chiese francescane lungo il percorso timbrano volentieri un diario del pellegrino.',
    notes: 'Periodo migliore: febbraio-aprile (fioriture) e ottobre-novembre; d\'estate il caldo sotto il livello del mare è pericoloso. Difficoltà: media (discesa dell\'Arbel con corrimano in roccia). PRIMA di prenotare verifica gli avvisi di viaggio della Farnesina sulla zona.',
  },
  {
    id: 'walk-finisterre', emoji: '🌊', name: 'Epilogo di Santiago — da Santiago a Finisterre e Muxía',
    start: 'Santiago de Compostela', end: 'Muxía', country: 'Spagna', continent: 'Europa', difficulty: 'media', days: 5,
    coords: { lat: 42.881, lon: -8.545 },
    stages: [
      { day: 1, from: 'Santiago de Compostela', to: 'Negreira', km: 21, lat: 42.910, lon: -8.735, terrain: 'collinare, boschi di eucalipto', note: 'si parte dando le spalle alla cattedrale: unico cammino che INIZIA a Santiago', lodging: 'albergue pubblici e privati; timbro sulla credenziale (serve per la Fisterrana)' },
      { day: 2, from: 'Negreira', to: 'Olveiroa', km: 33, lat: 42.928, lon: -9.028, terrain: 'lunga, altopiani ventosi (frazionabile a Santa Mariña)', note: 'la tappa più dura dell\'epilogo', lodging: 'albergue di Olveiroa; chi fraziona dorme a Santa Mariña; timbro all\'albergue' },
      { day: 3, from: 'Olveiroa', to: 'Cee', km: 20, lat: 42.955, lon: -9.189, terrain: 'crinale e prima vista dell\'oceano', note: 'al Cruceiro da Armada appare la fine della terra', lodging: 'albergue e pensioni a Cee/Corcubión; timbro all\'albergue' },
      { day: 4, from: 'Cee', to: 'Finisterre', km: 16, lat: 42.908, lon: -9.264, terrain: 'costiero, spiagge', note: 'il faro del "chilometro 0,0" e il tramonto sull\'Atlantico', lodging: 'albergue di Fisterra; qui si ritira la Fisterrana (attestato) mostrando i timbri' },
      { day: 5, from: 'Finisterre', to: 'Muxía', km: 29, lat: 43.104, lon: -9.218, terrain: 'costiero, saliscendi solitari', note: 'santuario della Virxe da Barca sulle rocce oceaniche: chiusura vera del cammino', lodging: 'albergue di Muxía; attestato Muxiana all\'albergue municipale' },
    ],
    credential: 'la stessa credenziale del Cammino di Santiago: con i timbri si ritirano Fisterrana (a Fisterra) e Muxiana (a Muxía).',
    notes: 'Periodo migliore: maggio-settembre (la Costa da Morte è ventosa e piovosa fuori stagione). Difficoltà: media, una tappa da 33 km frazionabile. Tradizione: al faro si lascia andare un pensiero, NON si bruciano più i vestiti (vietato).',
  },
  {
    id: 'walk-norte', emoji: '🌊', name: 'Camino del Norte — da San Sebastián a Bilbao',
    start: 'San Sebastián', end: 'Bilbao', country: 'Spagna', continent: 'Europa', difficulty: 'impegnativa', days: 5,
    coords: { lat: 43.318, lon: -1.981 },
    stages: [
      { day: 1, from: 'San Sebastián', to: 'Zarautz', km: 22, lat: 43.284, lon: -2.170, terrain: 'costiero, saliscendi sul monte Igueldo', note: 'balcone continuo sul Cantabrico, vigneti di txakoli', lodging: 'albergue di Zarautz (arriva entro le 15 in estate) e pensioni; timbro all\'albergue' },
      { day: 2, from: 'Zarautz', to: 'Deba', km: 22, lat: 43.295, lon: -2.351, terrain: 'costiero, salite vere', note: 'Getaria (il paese di Elcano) e Zumaia con il flysch', lodging: 'albergue nella vecchia stazione di Deba (si ritira la chiave in ufficio turistico); timbro lì' },
      { day: 3, from: 'Deba', to: 'Markina-Xemein', km: 24, lat: 43.267, lon: -2.497, terrain: 'interno, la tappa più dura (boschi e fango frequente)', note: 'si lascia la costa per i monti baschi', lodging: 'albergue del convento del Carmen a Markina; timbro al convento' },
      { day: 4, from: 'Markina-Xemein', to: 'Gernika', km: 25, lat: 43.315, lon: -2.679, terrain: 'collinare, valli verdi', note: 'monastero di Zenarruza (timbro e birra dei monaci) e arrivo alla città dell\'albero e di Picasso', lodging: 'albergue e pensioni a Gernika; timbro al monastero di Zenarruza lungo la via' },
      { day: 5, from: 'Gernika', to: 'Bilbao', km: 31, lat: 43.263, lon: -2.935, terrain: 'lunga, monte Bizkargi poi discesa urbana (frazionabile a Lezama)', note: 'arrivo alla cattedrale di Santiago di Bilbao (sì: anche Bilbao è tappa jacobea) e Guggenheim come premio', lodging: 'albergue e ostelli a Bilbao; timbro alla cattedrale di Santiago' },
    ],
    credential: 'credenziale del pellegrino del Camino del Norte: timbri in albergue, conventi e uffici turistici.',
    notes: 'Il Norte completo arriva a Santiago (~830 km): questo è il tratto basco iniziale, il più spettacolare e il più duro. Periodo migliore: maggio-settembre (pioggia possibile sempre: è il nord). Difficoltà: impegnativa, dislivelli quotidiani; scarponi rodati e antipioggia.',
  },
  {
    id: 'walk-adamspeak', emoji: '🏔', name: 'Adam\'s Peak (Sri Pada) — la salita sacra dello Sri Lanka',
    start: 'Hatton', end: 'Maskeliya', country: 'Sri Lanka', continent: 'Asia', difficulty: 'impegnativa', days: 3,
    coords: { lat: 6.892, lon: 80.596 },
    stages: [
      { day: 1, from: 'Hatton', to: 'Nallathanniya', km: 14, lat: 6.845, lon: 80.489, terrain: 'collinare tra piantagioni di tè e il lago di Maskeliya', note: 'avvicinamento a piedi al villaggio base (Dalhousie); chi vuole accorcia col bus locale', lodging: 'guesthouse per pellegrini a Nallathanniya: cena presto e sveglia alle 2 di notte' },
      { day: 2, from: 'Nallathanniya', to: 'Sri Pada', km: 7, lat: 6.810, lon: 80.499, terrain: '~5.000 gradini, +1.000 m: salita notturna', note: 'si sale al buio con i pellegrini per l\'alba dalla vetta e l\'ombra triangolare della montagna; sulla cima l\'impronta sacra venerata da quattro religioni', lodging: 'nessun pernotto in vetta: si riscende alla base entro mezzogiorno e si dorme di nuovo a Nallathanniya (la "tappa" è l\'andata e ritorno)' },
      { day: 3, from: 'Nallathanniya', to: 'Maskeliya', km: 12, lat: 6.834, lon: 80.567, terrain: 'discesa dolce tra i villaggi del tè', note: 'gambe distrutte dai gradini: tappa corta apposta, tè nero in fabbrica come premio', lodging: 'guesthouse a Maskeliya o rientro a Hatton in bus' },
    ],
    credential: 'nessuna credenziale: il pellegrinaggio è rituale (campanella da suonare in vetta per ogni ascesa compiuta).',
    notes: 'Stagione di pellegrinaggio: dicembre-maggio SOLTANTO (il sentiero è illuminato e i chioschi aperti); fuori stagione la salita è buia e sconsigliata. Difficoltà: impegnativa per i gradini, non tecnica. Vestiti a strati: in vetta prima dell\'alba fa freddo davvero.',
  },
];
