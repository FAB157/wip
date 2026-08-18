// =====================================================================
// WIP · Libreria Itinerari — SOLI tipi e costanti condivisi tra il
// server (regione "LIBRERIA ITINERARI" in server.ts) e il client
// (src/lib/libraryDescriptors.ts + componenti). NIENTE logica qui.
//
// Un "descrittore" è la ricetta editoriale di un item di libreria:
// dove (coords), che taglio (angle), che vincoli non negoziabili
// (constraints) e quali ancore reali raccogliere (contextHints).
// L'item generato ha SEMPRE lo stesso identico schema JSON degli
// itinerari di /api/groq/itinerary-stream (titolo, info_viaggio con le
// 4 sezioni precauzioni/suggerimenti/raccomandazioni/zone_da_evitare,
// giorni[].tappe[], giorni[].tabella_budget, totale_viaggio): è ciò che
// fa funzionare gratis viewer, budget, mappa, Guida Premium, podcast,
// PDF e calendario senza codice dedicato.
// =====================================================================

/** Famiglie di item della libreria (stesse dei transit + temi e zone). */
export type LibraryKind = 'port' | 'airport' | 'pilgrim' | 'theme' | 'zone';

export const LIBRARY_KINDS: LibraryKind[] = ['port', 'airport', 'pilgrim', 'theme', 'zone'];

/**
 * Taglio editoriale dell'itinerario. I sei valori canonici hanno un
 * brief di default lato server; resta aperto a stringhe libere per i
 * descrittori più creativi (es. 'cinema', 'vino', 'fauna').
 */
export type LibraryAngle =
  | 'classica'
  | 'gastronomica'
  | 'famiglie'
  | 'nascosta'
  | 'arte'
  | 'relax'
  | (string & {});

export const LIBRARY_ANGLES: LibraryAngle[] = ['classica', 'gastronomica', 'famiglie', 'nascosta', 'arte', 'relax'];

/** Vincoli NON negoziabili resi espliciti nel prompt e VERIFICATI in codice. */
export interface LibraryDescriptorConstraints {
  /**
   * Ore di margine prima della fine della finestra oraria (`hours`)
   * entro cui l'ultima tappa deve essere CONCLUSA.
   * Default server: 1 per i porti (la nave non aspetta), 2 per gli
   * aeroporti (sicurezza + imbarco).
   */
  returnBufferHours?: number;
  /** Tetto di km percorsi in un giorno (cammini/roadtrip a tema). */
  maxKmPerDay?: number;
  /** Località REALE in cui l'ultimo giorno deve terminare (es. arrivo del cammino). */
  mustEndAt?: string;
}

/** Ancore di contesto reale da raccogliere prima della generazione (fail-open). */
export interface LibraryContextHints {
  /** Film girati in zona (Wikidata SPARQL, P915 entro ~10 km). */
  wikidataFilm?: boolean;
  /** Botteghe artigiane (Overpass craft=*). */
  osmCraft?: boolean;
  /** Fauna osservabile per stagione (iNaturalist observations). */
  inaturalist?: boolean;
  /** Cantine ed enoteche (Overpass craft=winery / shop=wine). */
  osmWinery?: boolean;
  /** Esperienze prenotabili reali con link affiliato (Tiqets + Viator +
   *  GetYourGuide): obbligatorio per l'angolo 'esperienze' — senza prodotti
   *  trovati l'item viene scartato, MAI link inventati. */
  bookable?: boolean;
}

/** La "ricetta" completa di un item di libreria. */
export interface LibraryDescriptor {
  /** Identificatore stabile: minuscole, cifre e trattini (es. 'civitavecchia-porto-classica'). */
  slug: string;
  kind: LibraryKind;
  /** Titolo editoriale dell'item (es. "Roma in 8 ore dal porto di Civitavecchia"). */
  title: string;
  /** Città/area di riferimento: è l'ancora del geocheck (tolleranza 30 km). */
  city: string;
  country: string;
  coords: { lat: number; lon: number };
  /** Solo port/airport: ore totali della sosta/scalo (finestra dalle 9:00). */
  hours?: number;
  /** Giorni dell'itinerario (default 1; cammini 3-7). */
  days?: number;
  /** Tema libero per i kind 'theme'/'zone' (es. 'vino', 'cinema', 'fauna'). */
  theme?: string;
  angle: LibraryAngle;
  /** Indicazioni editoriali SPECIFICHE del pezzo (entrano nel prompt come brief). */
  brief: string;
  constraints?: LibraryDescriptorConstraints;
  contextHints?: LibraryContextHints;
}

/** Voce degli indici shard `lib_index_<kind>` e risposta di /api/library/search. */
export interface LibraryItemMeta {
  slug: string;
  kind: LibraryKind;
  title: string;
  city: string;
  country: string;
  theme?: string;
  angle: LibraryAngle;
  hours?: number;
  days?: number;
  /** Punteggio 0-100 assegnato dal motore AI revisore (≥ soglia server, oggi 70). */
  score: number;
  /** Motori coinvolti: [generatore, revisore] (es. ['agnes','groq']). */
  verifiedBy: string[];
  /** ISO timestamp della generazione. */
  createdAt: string;
  /**
   * Nessun prodotto prenotabile (Tiqets/Viator/GYG) trovato per la località
   * al momento della generazione: l'item è valido ma senza link affiliato
   * (solo l'angolo 'esperienze' viene scartato in quel caso).
   */
  no_experiences_available?: boolean;
}
