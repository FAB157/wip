// =====================================================================
// ITAINTA · Impostazioni guida/geofencing persistite in localStorage
// - distanze trigger per modalita' A PIEDI / IN AUTO (con slider UI)
// - modalita' attivazione (automatica / semi-automatica)
// - personaggio guida (nicky / dante)
// - anti-ripetizione: set dei POI gia' riprodotti (NON si resetta da solo)
// =====================================================================

import type { GuideCharacter } from '../types/poi';

export type ActivationMode = 'automatic' | 'semi-automatic';
export type TransportMode = 'walk' | 'car';
export type TransportPreference = 'auto' | 'walk' | 'car';

const KEYS = {
  walkAlert: 'wip_walk_alert',
  walkTrigger: 'wip_walk_trigger',
  carAlert: 'wip_car_alert',
  carTrigger: 'wip_car_trigger',
  mode: 'wip_activation_mode',
  character: 'wip_guide_character',
  transport: 'wip_transport_pref',
  played: 'wip_played_pois',
} as const;

/** Default e range per gli slider (spec sezione 6). */
export const DISTANCE_CONFIG = {
  // Spec confermata: alert 150m a piedi / 300m in auto; arrivo (teaser)
  // 30m a piedi / 50m in auto. Stessi default nel servizio Kotlin
  // (ItaintaBackgroundPoiService.kt): tenerli allineati.
  walkAlert:   { default: 150, min: 50,  max: 400 },
  walkTrigger: { default: 30,  min: 15,  max: 100 },
  carAlert:    { default: 300, min: 100, max: 600 },
  carTrigger:  { default: 50,  min: 20,  max: 150 },
} as const;

export type DistanceKey = keyof typeof DISTANCE_CONFIG;

// =====================================================================
// ACCURATEZZA DEL FIX: UNA SOLA SOGLIA PER DECIDERE, UNA PIU' LARGA PER
// «SONO NEI PARAGGI» (23/08/2026)
// =====================================================================
// Fino a oggi il numero era scritto in tre posti: 50 m in foregroundTriggers
// (ACCURACY_MAX_M), 50 m in bearingGate (ACCURATEZZA_MASSIMA_M), 50 m nel
// predittore nativo (MAX_ACCURACY_FOR_PREDICTION_M) — e 100 m nel servizio
// Android. Sembravano incoerenti; in realta' rispondono a due domande diverse,
// e tenerle separate e' la correzione giusta:
//
//  • DECIDERE (questa soglia, 50 m): far partire un racconto, calcolare un
//    CPA, stabilire se il POI e' davanti o dietro. Con ±80 m di errore la
//    geometria dice il contrario del vero: meglio tacere e riprovare al fix
//    successivo.
//  • ESSERE NEI PARAGGI (SOGLIA_ACCURATEZZA_PARAGGI_M, 100 m): registrare i
//    geofence di sistema, sapere in che citta' si e', decidere se vale la pena
//    scaricare i POI. Qui un errore di 80 m non cambia la risposta, e alzare
//    l'asticella significherebbe solo non registrare nulla in un centro
//    storico. E' il valore che usa gia' ItaintaBackgroundPoiService.kt:1106.
//
// Chi decide usa la prima. Chi si orienta usa la seconda. Non vanno unificate.
/** Fix peggiore di cosi' non fa scattare nulla e non alimenta il CPA. */
export const SOGLIA_ACCURATEZZA_TRIGGER_M = 50;
/** Soglia larga per le decisioni «di zona» (registrazione geofence, fetch POI). */
export const SOGLIA_ACCURATEZZA_PARAGGI_M = 100;

export interface GuideDistances {
  walkAlert: number;
  walkTrigger: number;
  carAlert: number;
  carTrigger: number;
}

function readInt(key: string, fallback: number): number {
  try {
    const v = localStorage.getItem(key);
    if (v === null) return fallback;
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : fallback;
  } catch {
    return fallback;
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

// --- Distanze trigger ---------------------------------------------------
export function getDistances(): GuideDistances {
  return {
    walkAlert: readInt(KEYS.walkAlert, DISTANCE_CONFIG.walkAlert.default),
    walkTrigger: readInt(KEYS.walkTrigger, DISTANCE_CONFIG.walkTrigger.default),
    carAlert: readInt(KEYS.carAlert, DISTANCE_CONFIG.carAlert.default),
    carTrigger: readInt(KEYS.carTrigger, DISTANCE_CONFIG.carTrigger.default),
  };
}

export function setDistance(key: DistanceKey, value: number): void {
  const cfg = DISTANCE_CONFIG[key];
  const clamped = clamp(value, cfg.min, cfg.max);
  try {
    localStorage.setItem(KEYS[key], String(clamped));
  } catch {
    /* ignore */
  }
}

/**
 * Raggi operativi (alert/trigger) per la modalita' di trasporto corrente.
 * Include una logica di espansione del raggio per edifici grandi (Musei, Castelli, ecc.)
 */
/**
 * Raggi calibrati sul perimetro reale del POI (footprint OSM), quando presenti.
 *
 * ATTENZIONE AI DEFAULT TRAVESTITI DA MISURE. Fino al 23/08/2026 la RPC
 * `get_geofence_pois` restituiva `coalesce(geofence_radius, 50)`: un POI mai
 * calibrato arrivava al client con un 50 indistinguibile da un raggio vero.
 * Qui devono entrare SOLO i valori GREZZI del DB (colonne `geofence_radius` /
 * `alert_radius` della migration 20260823140000), che sono `null` quando la
 * calibrazione non c'è. Passare un default significa spegnere lo slider
 * dell'utente.
 */
export interface PoiFootprint {
  /** Raggio di trigger/arrivo derivato dal perimetro (colonna geofence_radius). GREZZO: null = mai calibrato. */
  geofenceRadius?: number | null;
  /** Raggio di alert derivato dal perimetro (colonna alert_radius). GREZZO: null = mai calibrato. */
  alertRadius?: number | null;
  /** True se il POI è stato processato col footprint (entrance valorizzato). */
  hasEntrance?: boolean;
}

export function radiiForTransport(
  mode: TransportMode,
  category?: string | null,
  footprint?: PoiFootprint | null,
): {
  alert: number;
  trigger: number;
} {
  const d = getDistances();
  let { alert, trigger } = mode === 'car'
    ? { alert: d.carAlert, trigger: d.carTrigger }
    : { alert: d.walkAlert, trigger: d.walkTrigger };

  // RAGGI CALIBRATI SUL PERIMETRO REALE. Se il POI è stato processato col
  // footprint OSM (entrance valorizzato → hasEntrance) E porta un raggio
  // GREZZO dal DB, quel raggio VINCE: è misurato sul perimetro dell'edificio,
  // una piazza lo ha grande e una statua lo ha stretto. I POI non calibrati
  // (raggio null) restano alla preferenza dell'utente.
  //
  // Perché non è più un `Math.max` (23/08/2026). Il massimo faceva da
  // PAVIMENTO: il trigger a piedi non poteva mai scendere sotto il default di
  // modalità, e chi portava lo slider a 15 m non otteneva nulla — la guida
  // partiva comunque a 30 m o più. Con un raggio calibrato il default di
  // modalità non ha voce in capitolo: la misura batte la stima.
  //
  // ECCEZIONE, L'AUTO. A 50 km/h si percorrono 14 m al secondo: un raggio
  // calibrato di 15 m attorno a una statua si attraversa fra due fix GPS e la
  // guida non parte mai. In auto il raggio calibrato può solo ALLARGARE il
  // trigger dell'utente (Math.max), mai stringerlo — è il comportamento di
  // prima, e in auto era quello giusto. A piedi si cammina a 1,4 m/s e il
  // raggio stretto è esattamente ciò che serve per non parlare da lontano.
  //
  // L'alert (l'avviso "stai per arrivare") resta un `Math.max` in entrambe le
  // modalità: è un preavviso, accorciarlo non aggiunge precisione, toglie solo
  // il tempo di reagire.
  const fpTrigger = Number(footprint?.geofenceRadius) || 0;
  const fpAlert = Number(footprint?.alertRadius) || 0;
  if (footprint?.hasEntrance && (fpTrigger > 0 || fpAlert > 0)) {
    if (fpTrigger > 0) trigger = mode === 'car' ? Math.max(trigger, fpTrigger) : fpTrigger;
    if (fpAlert > 0) alert = Math.max(alert, fpAlert);
    return { alert, trigger };
  }

  // Fallback (comportamento attuale): bump forfettario per edifici grandi,
  // perché il centroide di un edificio massiccio è lontano dalla strada.
  const cat = (category || '').toLowerCase();
  const largeScaleCategories = [
    'castle', 'castelli', 'museum', 'musei', 'church', 'chiese',
    'place_of_worship', 'fortress', 'palazzo', 'palace', 'monastery', 'abbey',
    'archaeological_site', 'ruins', 'rovine', 'monument', 'monumento', 'attraction'
  ];

  if (largeScaleCategories.includes(cat)) {
    trigger += 40; // Aggiungiamo 40 metri di tolleranza per edifici massicci
    alert += 50;   // Espandiamo anche l'alert per dare tempo al GPS di stabilizzarsi
  }

  return { alert, trigger };
}

// =====================================================================
// FIDUCIA NEL PUNTO: quanto sappiamo DOV'E' LA PORTA
// =====================================================================
// Fino al 23/08/2026 il raggio dipendeva solo da categoria e mezzo. Ma un
// raggio e' un cerchio attorno a UN PUNTO, e quel punto puo' essere la porta
// misurata oppure il baricentro di un poligono che nessuno ha mai visto. Sono
// due cose diverse, e trattarle uguale produce i due difetti opposti:
//   • raggio stretto su un centroide sbagliato → il POI non parla MAI (su un
//     edificio lungo viene addirittura marcato «gia' superato»: e' il difetto
//     peggiore misurato, il silenzio);
//   • raggio largo su un ingresso noto → la guida attacca troppo presto, e in
//     auto «troppo presto» sono dieci secondi di strada.
//
// LA DOMANDA GIUSTA E' «ABBIAMO UN PUNTO?», NON «L'INDIRIZZO HA IL CIVICO?»
// (correzione del 23/08/2026). I punti della colonna `address_point_lat/lon`
// (migration 20260823160000) NON vengono da un geocoder che interpreta una
// stringa: vengono dalla CASA PIU' VICINA al POI nel dump Nominatim, cioe' da
// una vicinanza MISURATA, a pochi metri. Valgono quindi anche senza numero
// civico. Il civico conta solo quando si deve geocodificare una stringa dal
// vivo, ed e' gia' gestito altrove: `puntoArrivo.ts:96` rifiuta gli indirizzi
// senza cifre, perche' li' il geocoder tornerebbe il centro della via.
//
// Quattro livelli, in ordine di fiducia:
//
//  1. `perimetro`  il POI ha il footprint OSM: si misura dal MURO, non da un
//                  punto. Nessun allargamento (fattore 1,0).
//  2. `ingresso`   `entrance_lat/lon`: il punto E' la porta. Raggio base,
//                  stretto (fattore 1,0). Se il DB porta un `geofence_radius`
//                  calibrato, vince quello.
//  3. `indirizzo`  C'E' UN PUNTO: `address_point_lat/lon` dalla colonna nuova,
//                  oppure il punto geocodificato dal vivo (che esiste solo col
//                  civico). QUEL PUNTO E' L'ARRIVO A TUTTI GLI EFFETTI — «Via
//                  Roma 15»: il raggio parte da li', 30 m a piedi, e il
//                  navigatore punta li'. Fattore 1,0, nessun allargamento,
//                  esattamente come un ingresso.
//                  Fino a stamattina questo livello si portava dietro un
//                  «corridoio» di 50-90 m per l'incertezza sul civico: era
//                  sbagliato due volte, perche' allargava il cerchio attorno a
//                  un punto che invece e' buono, e perche' quel caso — la via
//                  senza un punto — non e' questo livello, e' il prossimo.
//  4. `centroide`  nessun punto: ne' porta, ne' facciata. Anche il POI di cui
//                  conosciamo solo il NOME DELLA VIA finisce qui, e non in un
//                  livello intermedio: senza un punto non c'e' niente su cui
//                  centrare un cerchio, e un cerchio allargato attorno a un
//                  punto inventato e' peggio di un cerchio onesto attorno al
//                  baricentro. Raggio base ×2: meglio parlare un po' presto
//                  che non parlare mai.
//
// TETTI, perche' in auto un raggio doppio significa parlare 10 secondi troppo
// presto: trigger max 80 m a piedi / 120 m in auto; avviso max 250 m a piedi /
// 400 m in auto. I bonus gemme/premium restano quelli di prima (stanno tutti
// sotto i tetti).
// =====================================================================

export type LivelloFiducia = 'perimetro' | 'ingresso' | 'indirizzo' | 'centroide';

export interface OpzioniFiducia {
  /** Il perimetro del POI e' gia' in memoria (footprints.perimetroNoto). */
  haPerimetro?: boolean;
  /** Il punto dell'indirizzo e' gia' stato geocodificato (cache di puntoArrivo). */
  puntoIndirizzoPronto?: boolean;
}

/** L'ingresso c'e' davvero? (0,0 e' il Golfo di Guinea, cioe' un campo vuoto). */
function haIngresso(poi: any): boolean {
  const lat = Number(poi?.entrance_lat ?? poi?.entranceLat);
  const lon = Number(poi?.entrance_lon ?? poi?.entranceLon);
  return Number.isFinite(lat) && Number.isFinite(lon) && (lat !== 0 || lon !== 0);
}

/**
 * Il POI porta gia' un PUNTO per il suo indirizzo? (`address_point_lat/lon`,
 * migration 20260823160000). Non e' una stringa interpretata da un geocoder:
 * e' la casa piu' vicina al POI nel dump Nominatim, misurata. Quando c'e', e'
 * pronta subito e non costa una chiamata di rete.
 * Come per l'ingresso, (0,0) e' un campo vuoto, non il Golfo di Guinea.
 */
export function puntoIndirizzo(poi: any): { lat: number; lon: number } | null {
  try {
    const lat = Number(poi?.address_point_lat ?? poi?.addressPointLat);
    const lon = Number(poi?.address_point_lon ?? poi?.addressPointLon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    if (lat === 0 && lon === 0) return null;
    return { lat, lon };
  } catch {
    return null;
  }
}

/**
 * Quanto ci fidiamo del punto da cui misuriamo il raggio di questo POI.
 * Puro: nessuna rete, nessun import — chi chiama passa in `opz` cio' che sa
 * (perimetro caricato, indirizzo gia' geocodificato dal vivo).
 */
export function fiduciaPunto(poi: any, opz: OpzioniFiducia = {}): LivelloFiducia {
  try {
    if (opz.haPerimetro || poi?.has_footprint === true) return 'perimetro';
    if (haIngresso(poi)) return 'ingresso';
    // Un PUNTO, da qualunque delle due strade arrivi:
    //  • `address_point_lat/lon` dal DB — gia' pronto, nessuna rete;
    //  • la geocodifica dal vivo gia' andata a buon fine (cache di puntoArrivo),
    //    che esiste solo per gli indirizzi col civico.
    // Il solo NOME della via, senza punto, non basta: quello e' `centroide`.
    if (puntoIndirizzo(poi) || opz.puntoIndirizzoPronto) return 'indirizzo';
    return 'centroide';
  } catch {
    return 'centroide';
  }
}

export interface FattoreFiducia {
  /** Moltiplicatore del raggio di TRIGGER. */
  fattore: number;
  /** Moltiplicatore del raggio di AVVISO. */
  fattoreAvviso: number;
  tettoTrigger: number;
  tettoAvviso: number;
}

/** Tetti: oltre questi non si va, qualunque sia la sfiducia nel punto. */
export const TETTO_TRIGGER_M: Record<TransportMode, number> = { walk: 80, car: 120 };
export const TETTO_AVVISO_M: Record<TransportMode, number> = { walk: 250, car: 400 };

export function fattoreFiducia(livello: LivelloFiducia, modo: TransportMode): FattoreFiducia {
  const tettoTrigger = TETTO_TRIGGER_M[modo] ?? TETTO_TRIGGER_M.walk;
  const tettoAvviso = TETTO_AVVISO_M[modo] ?? TETTO_AVVISO_M.walk;
  switch (livello) {
    case 'perimetro':
    case 'ingresso':
    case 'indirizzo':
      // Muro, porta o punto dell'indirizzo: in tutti e tre i casi si misura da
      // qualcosa di reale, e allargare peggiorerebbe e basta. «Via Roma 15» e'
      // un punto quanto lo e' un portone.
      return { fattore: 1, fattoreAvviso: 1, tettoTrigger, tettoAvviso };
    default:
      // Centroide puro: nessun punto, ne' porta ne' facciata. Meglio presto che mai.
      return { fattore: 2, fattoreAvviso: 2, tettoTrigger, tettoAvviso };
  }
}

/**
 * Applica la fiducia a un raggio base.
 * REGOLA D'ORO: la fiducia puo' solo ALLARGARE. Il tetto non deve mai
 * stringere cio' che l'utente ha scelto con gli slider (in auto il trigger
 * arriva a 150 m di preferenza: il tetto di 120 e' un limite all'allargamento,
 * non un massimo assoluto).
 */
export function applicaFiducia(raggioBase: number, f: FattoreFiducia, tipo: 'trigger' | 'avviso'): number {
  const base = Number(raggioBase) || 0;
  const molt = tipo === 'trigger' ? f.fattore : f.fattoreAvviso;
  const tetto = tipo === 'trigger' ? f.tettoTrigger : f.tettoAvviso;
  return Math.max(base, Math.min(base * molt, tetto));
}

// --- Categorie ammesse per il trigger audioguida -------------------------
// Fonte di verità JS per la stessa logica di GeofenceBroadcastReceiver.CATEGORY_MAP
// (Kotlin) / PoiCategories.map (Swift): traduce la categoria GREZZA del POI
// (tag OSM-like salvato in shared_pois.category) nel bucket del setup
// GeoControl (monumenti/musei/chiese/panorami/castelli/archeo/consigli/community/gemme).
// Usata da locationService.ts e GeofenceAudioGuide.tsx: prima confrontavano
// direttamente activeCategories (nomi bucket) con la categoria grezza del POI
// ("museum", "church", "viewpoint"...), un confronto che non poteva mai
// combaciare → il filtro per categoria del radar/audioguida sul web non
// applicava di fatto la selezione dell'utente.
export function isCategoryAllowed(
  poi: { category?: string | null; premium?: boolean; is_gem?: boolean },
  activeSubcats: Record<string, boolean>,
): boolean {
  const cat = (poi.category || '').toLowerCase();

  // BENI CULTURALI: scheda e foto, MAI audioguida.
  // Sono i beni dei registri nazionali del patrimonio promossi a POI (circa
  // 430.000): chiese di campagna, mulini, ma anche case private vincolate e
  // magazzini storici. Vanno visti sulla mappa e aperti se interessano, ma non
  // devono far partire un racconto — un turista che passa davanti a casa di
  // qualcuno non deve sentirsi parlare nell'orecchio, e su quei numeri
  // l'audioguida diventerebbe rumore continuo invece che un momento.
  // Chi merita l'audioguida ce l'ha lo stesso: se il bene combacia con un POI
  // che abbiamo gia' (una chiesa importata da Wikidata), quello conserva la
  // SUA categoria e passa da uno dei rami sotto. Solo i beni che esistono
  // unicamente come `beni_culturali` restano muti.
  if (cat === 'beni_culturali') return false;

  // WIP COMMUNITY E VERTICALI TEMATICI: MAI audioguida (committente,
  // 22/08/2026: "le categorie delle audioguide devono fermarsi a Consigli
  // gratuiti; da WIP Community in giu' non hanno audioguide"). Restano sulla
  // mappa, nelle chip, negli itinerari e negli eventi: cambia solo che non
  // fanno partire la voce. Il controllo sta QUI e non nella lista del setup,
  // perche' le chip mappa scrivono le stesse chiavi in wip_active_subcategories
  // (App.tsx) e una chiave gia' salvata a `true` riaccenderebbe tutto.
  // `return false` esplicito, come per beni_culturali: il default in fondo e'
  // gia' false, ma un ramo aggiunto domani fra qui e la fine non deve poterle
  // riprendere per sbaglio.
  if (SENZA_AUDIOGUIDA.has(cat)) return false;

  if (poi.premium || poi.is_gem || cat === 'gemme') return activeSubcats.gemme ?? true;
  // LOCALITÀ TURISTICHE (24/08/2026, richiesta esplicita "con audioguida"):
  // Riomaggiore, Volterra, Colonnata raccontano il borgo, non un singolo
  // monumento — merita la voce quanto una chiesa.
  if (cat === 'localita') return activeSubcats.localita ?? true;
  // Monumenti: include il patrimonio costruito importato in fase 2 (piazze,
  // ponti, fontane, teatri, palazzi, torri, grattacieli, cimiteri monumentali,
  // biblioteche storiche, mulini, acquedotti, osservatori, stadi).
  if (['monument', 'artwork', 'monumenti', 'attraction',
       'square', 'bridge', 'fountain', 'theatre', 'opera_house', 'palace',
       'tower', 'skyscraper', 'cemetery', 'library', 'windmill', 'aqueduct',
       'observatory', 'stadium',
       // Fasi 3-5: archeologia romana, difensivo, industria, memoria,
       // trasporti storici, cultura, scienza.
       'birthplace', 'house_museum', 'necropolis', 'catacomb', 'fortress',
       'city_walls', 'villa', 'harbour', 'mine', 'chimney', 'funicular',
       'amphitheatre', 'roman_baths', 'triumphal_arch', 'obelisk', 'mausoleum',
       'market_hall', 'train_station', 'dam', 'watermill', 'prison', 'museum_ship',
       'archaeological_park', 'memorial', 'sculpture', 'university', 'town_hall',
       'roman_theatre', 'roman_circus', 'roman_villa', 'domus', 'city_gate',
       'coastal_tower', 'stronghold', 'quarry', 'saltworks', 'racetrack',
       'racecourse', 'ski_jump', 'war_cemetery', 'concentration_camp',
       'rack_railway', 'pier', 'shipyard', 'archive', 'radio_telescope', 'hydro_plant',
      ].includes(cat)) return activeSubcats.monumenti ?? true;
  if (['castle', 'castelli'].includes(cat)) return activeSubcats.castelli ?? activeSubcats.monumenti ?? true;
  if (['ruins', 'archaeological_site', 'archeo'].includes(cat)) return activeSubcats.archeo ?? activeSubcats.monumenti ?? true;
  if (['church', 'chiese', 'chiesa', 'place_of_worship', 'cathedral', 'cattedrale',
       'chapel', 'cappella', 'basilica', 'monastery', 'monastero', 'abbey', 'abbazia',
       'shrine', 'santuario',
       // Sottotipi religiosi importati dalle fasi 3-5: NESSUN chip nuovo,
       // confluiscono tutti nel filtro "chiese" già esistente.
       'cathedral', 'basilica', 'baptistery', 'bell_tower', 'cloister', 'crypt',
       'abbey', 'synagogue', 'mosque', 'temple',
      ].includes(cat)) return activeSubcats.chiese ?? true;
  // Panorami e NATURA: oltre a belvedere e parchi, le verticali naturali
  // (spiagge, cascate, grotte, vette, sorgenti termali, isole, riserve, fari,
  // funivie panoramiche). Confluiscono qui invece di avere una categoria
  // propria perché "panorami" è già cablata ovunque — web, Kotlin, iOS, chip,
  // traduzioni — e soprattutto è già abilitata all'audioguida.
  // NATURA PER FAMIGLIE (21/08/2026): ognuna risponde al SUO interruttore,
  // e se quello non è mai stato toccato ricade su `panorami` — cioè sulla
  // scelta che l'utente aveva già fatto quando erano tutte insieme. Senza
  // questo doppio passaggio, chi aveva spento «panorami» si ritroverebbe
  // le spiagge riaccese da sole.
  // Dal 22/08/2026 c'e' anche la macro «natura» (chip mappa e setup): vale
  // per tutte e cinque le famiglie quando la famiglia non e' stata toccata.
  const naturaSub = (famiglia: string): boolean =>
    (activeSubcats as any)[famiglia] ?? (activeSubcats as any).natura ?? activeSubcats.panorami ?? true;
  if (['beach', 'spiaggia', 'spiagge', 'bay', 'baia', 'island', 'isola', 'cliff', 'falesia', 'coast', 'costa', 'dune',
      ].includes(cat)) return naturaSub('spiagge');
  if (['peak', 'vetta', 'vette', 'volcano', 'vulcano', 'glacier', 'ghiacciaio', 'mountain_pass', 'valico', 'ridge', 'arete', 'saddle',
      ].includes(cat)) return naturaSub('vette');
  if (['waterfall', 'cascata', 'cascate', 'spring', 'sorgente', 'hot_spring', 'lake', 'lago', 'laghi', 'river', 'fiume', 'gorge', 'gola', 'canyon',
      ].includes(cat)) return naturaSub('acque');
  if (['cave', 'grotta', 'grotte', 'cave_entrance', 'sinkhole', 'abisso',
      ].includes(cat)) return naturaSub('grotte');
  if (['park', 'parchi', 'parco', 'garden', 'giardino', 'botanical_garden', 'nature_reserve', 'riserva',
       'geopark', 'forest', 'foresta', 'wood', 'bosco', 'desert', 'deserto', 'tree', 'albero', 'national_park',
      ].includes(cat)) return naturaSub('parchi');
  if (['viewpoint', 'panorami', 'panorama', 'lighthouse', 'faro', 'scenic_road', 'aerialway', 'natura',
       'trail', 'sentiero', 'cammino', 'hiking', 'via_ferrata', 'ski_resort',
      ].includes(cat)) return activeSubcats.panorami ?? true;
  if (['museum', 'gallery', 'musei', 'art_museum', 'natural_history_museum',
       'art_gallery', 'house_museum'].includes(cat)) return activeSubcats.musei ?? true;
  if (['information', 'tourism_information', 'office', 'consigli'].includes(cat))
    return activeSubcats.consigli ?? false;
  // 'community' e gli otto tematici sono gia' stati rifiutati in cima
  // (SENZA_AUDIOGUIDA): qui non arrivano.
  // VINO E GUSTO: default OFF (come community), ma quando l'utente accende la
  // chip l'audioguida DEVE parlare — è il senso della categoria. Una cantina
  // o un frantoio hanno una storia da raccontare quanto una chiesa, e chi
  // accende "Vino e Gusto" ha chiesto esattamente quello.
  // La categoria in shared_pois è 'enogastronomia'; i poi_type sono elencati
  // qui perché un domani potrebbero arrivare come `category` grezza dal radar.
  if (['enogastronomia',
       'cantina', 'enoteca', 'vigneto', 'uliveto', 'birrificio', 'distilleria',
       'caseificio', 'formaggi', 'frantoio', 'gastronomia', 'fattoria',
       'pasticceria', 'cioccolato', 'caffe', 'te', 'miele', 'spezie',
       'museo_gusto', 'strada_del_vino', 'winery',
      ].includes(cat)) return activeSubcats.enogastronomia ?? false;
  // I verticali tematici (terme, cinema, cieli, street_art, mercati,
  // fioriture, memoria, lento) stavano qui con `activeSubcats[cat] ?? false`
  // fino al 22/08/2026: ora sono in SENZA_AUDIOGUIDA, vedi in cima.
  return false; // categorie commerciali/utilitarie (locali/utilita/famiglie) → mai audioguida
}

/**
 * Le categorie che NON hanno audioguida qualunque cosa dica
 * wip_active_subcategories: WIP Community e gli otto verticali tematici.
 * Decisione del committente del 22/08/2026. Usata da isCategoryAllowed e da
 * locationService, che non passa queste chiavi al servizio nativo.
 */
export const SENZA_AUDIOGUIDA: ReadonlySet<string> = new Set([
  'community',
  'terme', 'cinema', 'cieli', 'street_art', 'mercati', 'fioriture', 'memoria', 'lento',
]);

/**
 * Le chiavi di wip_active_subcategories che il servizio nativo deve vedere:
 * solo quelle con audioguida. Le chip mappa scrivono nello stesso oggetto
 * anche community/tematici/enogastronomia (servono alla mappa), e senza
 * questo filtro il nativo le prenderebbe per categorie da raccontare.
 */
export const CHIAVI_NATIVO_AUDIOGUIDA: ReadonlySet<string> = new Set([
  'gemme', 'monumenti', 'musei', 'panorami', 'chiese', 'consigli',
  'castelli', 'archeo', 'natura', 'spiagge', 'vette', 'acque', 'grotte', 'parchi',
  'enogastronomia', 'localita',
]);

// --- Modalita' attivazione ---------------------------------------------
export function getActivationMode(): ActivationMode {
  try {
    return (localStorage.getItem(KEYS.mode) as ActivationMode) || 'automatic';
  } catch {
    return 'automatic';
  }
}

export function setActivationMode(mode: ActivationMode): void {
  try {
    localStorage.setItem(KEYS.mode, mode);
  } catch {
    /* ignore */
  }
}

// --- Personaggio guida --------------------------------------------------
export function getGuideCharacter(): GuideCharacter {
  try {
    return (localStorage.getItem(KEYS.character) as GuideCharacter) || 'nicky';
  } catch {
    return 'nicky';
  }
}

export function setGuideCharacter(character: GuideCharacter): void {
  try {
    localStorage.setItem(KEYS.character, character);
  } catch {
    /* ignore */
  }
}

// --- Preferenza trasporto (auto = rileva da velocita') ------------------
export function getTransportPreference(): TransportPreference {
  try {
    return (localStorage.getItem(KEYS.transport) as TransportPreference) || 'auto';
  } catch {
    return 'auto';
  }
}

export function setTransportPreference(pref: TransportPreference): void {
  try {
    localStorage.setItem(KEYS.transport, pref);
  } catch {
    /* ignore */
  }
}

/** Soglie dell'isteresi piedi/auto, le STESSE del servizio nativo. */
const AUTO_SOPRA_KMH = 12;
const PIEDI_SOTTO_KMH = 6;
/** L'ultimo modo deciso in 'auto': e' lo stato che rende possibile l'isteresi. */
let ultimoModoAuto: TransportMode = 'walk';

/**
 * Modalita' trasporto effettiva data la velocita' (m/s) e la preferenza.
 * In 'auto' applica la stessa ISTERESI del nativo: sopra 12 km/h si passa
 * in auto, sotto 6 km/h si torna a piedi, in mezzo si resta come si era.
 * Prima c'era una soglia secca a 10 km/h: a ogni semaforo il modo
 * oscillava e locationService rilanciava il servizio nativo a ogni fix.
 */
export function resolveTransportMode(speedMetersPerSec: number | null): TransportMode {
  const pref = getTransportPreference();
  if (pref === 'walk') return 'walk';
  if (pref === 'car') return 'car';
  const kmh = (speedMetersPerSec || 0) * 3.6;
  if (kmh >= AUTO_SOPRA_KMH) ultimoModoAuto = 'car';
  else if (kmh <= PIEDI_SOTTO_KMH) ultimoModoAuto = 'walk';
  return ultimoModoAuto;
}

/** Azzera lo stato dell'isteresi (allo spegnimento dell'audioguida). */
export function resetTransportHysteresis(): void {
  ultimoModoAuto = 'walk';
}

// --- Anti-ripetizione (POI gia' riprodotti) -----------------------------
// Formato: { [poiId]: timestampMs }. Il vecchio formato (array di id) si
// migra al volo con timestamp "adesso": un POI ascoltato ieri resta in
// cooldown ancora un giorno, poi si libera — come sul nativo (24 h).

/** Cooldown per-POI dopo un ascolto: lo stesso del servizio nativo. */
export const PLAYED_COOLDOWN_MS = 24 * 3_600_000;

function readPlayed(): Record<string, number> {
  try {
    const raw = localStorage.getItem(KEYS.played);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const now = Date.now();
      const out: Record<string, number> = {};
      for (const id of parsed) out[String(id)] = now;
      return out;
    }
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writePlayed(map: Record<string, number>): void {
  try {
    localStorage.setItem(KEYS.played, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

/** Quando e' stato ascoltato l'ultima volta (ms), o null. */
export function playedAt(poiId: string | number): number | null {
  const ts = readPlayed()[String(poiId)];
  return Number.isFinite(ts) ? ts : null;
}

/** true se ascoltato da meno di `maxAgeMs` (default 24 h). */
export function isPlayed(poiId: string | number, maxAgeMs = PLAYED_COOLDOWN_MS): boolean {
  const ts = playedAt(poiId);
  return ts != null && Date.now() - ts < maxAgeMs;
}

export function markPlayed(poiId: string | number): void {
  const map = readPlayed();
  const now = Date.now();
  // Potatura: le voci piu' vecchie di 7 giorni non servono piu' a nessuno.
  for (const [id, ts] of Object.entries(map)) {
    if (!Number.isFinite(ts) || now - ts > 7 * 24 * 3_600_000) delete map[id];
  }
  map[String(poiId)] = now;
  writePlayed(map);
}

/** Reset esplicito di un singolo POI (es. click PLAY dalla scheda). */
export function resetPlayedOne(poiId: string | number): void {
  const map = readPlayed();
  if (String(poiId) in map) { delete map[String(poiId)]; writePlayed(map); }
}

/** Reset totale ("Reimposta audioguide ascoltate" nelle settings). */
export function resetAllPlayed(): void {
  try {
    localStorage.removeItem(KEYS.played);
  } catch {
    /* ignore */
  }
}
