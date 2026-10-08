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

/**
 * LUOGHI SENZA PORTA (03/10/2026, committente: «la regola del muro solo per piazze, parchi,
 * ponti, panorami»). Per un edificio, una chiesa o un museo la guida parte SOLO a 30 m dal punto
 * d'arrivo (50 in auto), come fanno Google Maps e Mappe: i 30 m dal muro facevano scattare sul
 * retro o dal lato sbagliato. Il perimetro resta la misura giusta dove non c'è una porta a cui
 * arrivare: chi è in mezzo alla piazza è già arrivato.
 * Stesso elenco in Footprints.kt::senzaPorta (Android) e PoiFootprints.swift::senzaPorta (iOS).
 */
const TIPI_SENZA_PORTA = new Set([
  'square', 'piazza', 'piazze', 'bridge', 'ponte', 'ponti', 'viewpoint', 'panorami', 'panorama',
  'park', 'parchi', 'parco', 'garden', 'giardino', 'botanical_garden', 'national_park',
  'nature_reserve', 'riserva', 'geopark', 'forest', 'foresta', 'wood', 'bosco',
  'beach', 'spiaggia', 'spiagge', 'bay', 'baia', 'island', 'isola', 'cliff', 'falesia',
  'coast', 'costa', 'dune', 'lake', 'lago', 'laghi', 'river', 'fiume', 'gorge', 'gola',
  'canyon', 'desert', 'deserto', 'peak', 'vetta', 'vette', 'volcano', 'vulcano',
  'glacier', 'ghiacciaio', 'natura', 'trail', 'scenic_road',
  'cemetery', 'war_cemetery', 'archaeological_park', 'archaeological_site', 'archeo',
  'ruins', 'necropolis', 'city_walls', 'harbour', 'pier', 'aqueduct', 'quarry',
  'saltworks', 'dam', 'racetrack', 'racecourse',
]);
const NOME_SENZA_PORTA = /^(piazza|piazzale|piazzetta|ponte|parco|giardin[io]|belvedere|lungomare|plaza|puente|pont |place |jardin|parc )|( square| bridge| park| gardens?)$|platz$|brücke$/i;
export function luogoSenzaPorta(poi: { category?: string | null; poi_type?: string | null; name?: string | null } | null | undefined): boolean {
  const tipo = (v?: string | null) => !!v && TIPI_SENZA_PORTA.has(String(v).trim().toLowerCase());
  if (tipo(poi?.poi_type) || tipo(poi?.category)) return true;
  return !!poi?.name && NOME_SENZA_PORTA.test(String(poi.name).trim());
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

  // RAGGI CALIBRATI DAL DB (geofence_radius/alert_radius: misura sul
  // perimetro OSM quando c'è, altrimenti un default di categoria dai POI
  // Overture/OSM — comunque una misura, non una stima). VINCE sempre che sia
  // presente, CON O SENZA `hasEntrance` (01/09/2026, decisione utente).
  //
  // Fino a ieri era gated su `hasEntrance`: la maggioranza dei POI importati
  // da Overture porta già geofence_radius/alert_radius ma NON un
  // entrance_lat/lon geocodificato — il gate scartava una misura buona anche
  // su luoghi notissimi con indirizzo (Chiesa Evangelica ADI, Chiesa San
  // Pietro Avenza, Biblioteca della Camera di Commercio...) e li faceva
  // cadere nel bump "edifici grandi" qui sotto, con notifiche "Esplorazione"
  // a 200-400+ m su POI mai avvicinati.
  //
  // Perché non è più un `Math.max` a piedi (23/08/2026). Il massimo faceva da
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
  // (03/10/2026, committente dopo la simulazione su 20 luoghi d'Italia: «non va
  // bene, deve essere a 30 m e 50 in auto, 150 a piedi e 300 in auto») I RAGGI
  // DEL DATABASE NON CONTANO PIÙ. Quanto scritto qui sopra era sbagliato alla
  // radice: `geofence_radius`/`alert_radius` NON sono misure, li scrive il
  // trigger `assign_geofence_radii` alla nascita della riga, per categoria
  // (80/200 monumenti e chiese, 100/200 musei, 120/250 gemme; il 66% dei luoghi
  // ha 80/200, alcuni 300/800). Misurato (scratch/simula-trigger-20.mjs): guida
  // a 70-120 m dalla porta su 60 percorsi su 60, avviso a 200 m. Valgono SOLO i
  // raggi dell'utente; il perimetro vero dell'edificio (30 m dal muro, vedi
  // foregroundTriggers.alPerimetro) resta l'unica misura che conta.
  // Uguale in RaggiFiducia.calcola (Kotlin) e PoiRadii.effettivi (Swift).
  void footprint;

  // Nessun raggio calibrato: centroide puro, non sappiamo dove sia la porta.
  // Decisione utente 01/09/2026: il raggio non aumenta MAI per incertezza —
  // niente più bump forfettario per categoria (chiese, musei, castelli...),
  // resta la preferenza utente così com'è.
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
}

/**
 * Decisione utente 01/09/2026: IL RAGGIO NON AUMENTA MAI PER INCERTEZZA.
 * Fino a ieri un `centroide` puro raddoppiava il raggio (fattore 2, tetti 80m
 * piedi/120m auto per il trigger, 250m/400m per l'avviso) — ma la
 * maggioranza dei POI importati da Overture/OSM e' a centroide (nessun
 * entrance_lat/lon geocodificato) anche su luoghi notissimi con indirizzo
 * (Chiesa Evangelica ADI, Chiesa San Pietro Avenza, Biblioteca della Camera
 * di Commercio...), e il raddoppio produceva notifiche "Esplorazione" a
 * 200-400+ m su POI mai avvicinati davvero. Nessun livello allarga piu': il
 * fattore e' sempre 1, qualunque sia la fiducia nel punto.
 */
export function fattoreFiducia(_livello: LivelloFiducia, _modo: TransportMode): FattoreFiducia {
  return { fattore: 1, fattoreAvviso: 1 };
}

/**
 * Applica la fiducia a un raggio base. Con `fattoreFiducia` sempre a 1
 * questa funzione e' oggi un no-op protettivo: resta per non toccare i
 * chiamanti in foregroundTriggers.ts e per il giorno in cui un livello
 * dovesse tornare ad allargare (mai stringere sotto la preferenza utente).
 */
export function applicaFiducia(raggioBase: number, f: FattoreFiducia, tipo: 'trigger' | 'avviso'): number {
  const base = Number(raggioBase) || 0;
  const molt = tipo === 'trigger' ? f.fattore : f.fattoreAvviso;
  return Math.max(base, base * molt);
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
/**
 * COSA VALE UNA CATEGORIA DEL SETUP MAI TOCCATA (05/10/2026). Il setup (Profilo ›
 * Categorie audioguida) nasce con Monumenti, Musei e Chiese accesi e Panorami,
 * Natura e Consigli spenti. Fino a oggi però una chiave ASSENTE valeva «accesa»
 * qui e «non spuntata» nel setup: un belvedere parlava anche se la casella
 * Panorami appariva vuota. Un solo elenco, letto da entrambi: ciò che l'utente
 * vede spuntato è ciò che parla.
 */
export const PREDEFINITI_AUDIOGUIDA: Record<string, boolean> = {
  monumenti: true, musei: true, chiese: true, panorami: false, natura: false, consigli: false,
};
/** Lo stato di una categoria del setup, col suo predefinito se non è mai stata toccata. */
export function sceltaSetup(activeSubcats: Record<string, boolean> | null | undefined, chiave: string): boolean {
  const v = activeSubcats ? activeSubcats[chiave] : undefined;
  return typeof v === 'boolean' ? v : (PREDEFINITI_AUDIOGUIDA[chiave] ?? false);
}

export function isCategoryAllowed(
  poi: { category?: string | null; premium?: boolean; is_gem?: boolean },
  activeSubcats: Record<string, boolean>,
): boolean {
  const cat = (poi.category || '').toLowerCase();

  // GEMME PRIMA DI TUTTO (28/08/2026, regola del committente: «se gemma,
  // qualsiasi categoria — anche non turistica — deve avere foto, descrizione,
  // audioguida ed essere selezionata dal GeoControl»). Una gemma risponde
  // SOLO al suo interruttore: un murale, una terma o un bene vincolato
  // promossi a gemma parlano, anche se la loro categoria di per sé è muta.
  // Prima questo controllo stava dopo le due esclusioni qui sotto, e una
  // gemma tematica restava zitta. Il nativo fa già così (CategoryMap.isActive
  // guarda is_gem per primo).
  // Solo il FLAG, non la categoria (03/09/2026): `category='gemme'` e' il
  // contenitore dell'import CSV di Wikipedia e vale per 9.062 righe che il
  // modello ha giudicato NON gemme. Quelle rispondono all'interruttore dei
  // monumenti, come la macro in cui ora ricadono (vedi poiTaxonomy). Senza la
  // riga sotto resterebbero mute: `cat` vale 'gemme' e non combacia con
  // nessuno degli elenchi piu' avanti.
  // (05/10/2026, test virtuale a Roma: con «Gemme» spenta e «Monumenti» accesa la
  // Fontana di Trevi — gemma — restava muta, e al suo posto parlavano i doppioni
  // senza testo. Committente: «fai per la meglio, le audioguide siano quelle che
  // l'utente seleziona in setup».) Il SETUP dichiara le gemme «Default assoluto · sempre
  // attive» con la casella bloccata, ma la chiave `gemme` in memoria la scrive la
  // CHIP DELLA MAPPA (App.tsx, MAP_FILTER_KEYS): nascondere i pin delle gemme
  // spegneva di nascosto le loro audioguide. L'audioguida segue il setup, non la
  // mappa: una gemma parla sempre — come nei nativi, dove «gemme» non viene mai
  // inoltrata e le spegne solo la sentinella "gemme:off" del modo navigatore.
  if (poi.premium || poi.is_gem === true) return true;
  if (cat === 'gemme') return activeSubcats.monumenti ?? true;

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

  // LOCALITÀ TURISTICHE (24/08/2026, richiesta esplicita "con audioguida"):
  // Riomaggiore, Volterra, Colonnata raccontano il borgo, non un singolo
  // monumento — merita la voce quanto una chiesa.
  if (cat === 'localita') return activeSubcats.localita ?? true;
  // Monumenti: include il patrimonio costruito importato in fase 2 (piazze,
  // ponti, fontane, teatri, palazzi, torri, grattacieli, cimiteri monumentali,
  // biblioteche storiche, mulini, acquedotti, osservatori, stadi).
  // (05/10/2026, committente dopo il test a Roma, dove hanno parlato una
  // biblioteca e un teatro: «tra i monumenti togli biblioteche, teatri, stazioni
  // e stadi».) Fuori dall'audioguida dei monumenti: library, theatre, opera_house,
  // train_station, stadium. Restano sulla mappa e nelle schede; parlano solo se
  // sono gemme. Il teatro ROMANO (roman_theatre) è archeologia e resta.
  // Stesso elenco in CategoryMap.kt e PoiModels.swift.
  if (['monument', 'artwork', 'monumenti', 'attraction',
       'square', 'bridge', 'fountain', 'palace',
       'tower', 'skyscraper', 'cemetery', 'windmill', 'aqueduct',
       'observatory',
       // Fasi 3-5: archeologia romana, difensivo, industria, memoria,
       // trasporti storici, cultura, scienza.
       'birthplace', 'house_museum', 'necropolis', 'catacomb', 'fortress',
       'city_walls', 'villa', 'harbour', 'mine', 'chimney', 'funicular',
       'amphitheatre', 'roman_baths', 'triumphal_arch', 'obelisk', 'mausoleum',
       'market_hall', 'dam', 'watermill', 'prison', 'museum_ship',
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
    (activeSubcats as any)[famiglia] ?? (activeSubcats as any).natura ?? activeSubcats.panorami ?? PREDEFINITI_AUDIOGUIDA.natura;
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
      ].includes(cat)) return activeSubcats.panorami ?? PREDEFINITI_AUDIOGUIDA.panorami;
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
  // TURISMO DELLO SHOPPING e TURISMO DI LUSSO (28/08/2026): stesso schema di
  // Vino e Gusto — default OFF, ma se l'utente accende il layer un grande
  // magazzino storico o un palace hanno una storia da raccontare quanto una
  // cantina. Categoria in shared_pois 'shopping'/'lusso'.
  if (['shopping',
       'shopping_street', 'department_store', 'shopping_mall', 'historic_arcade',
       'outlet_village', 'souk_bazaar', 'duty_free_zone',
      ].includes(cat)) return activeSubcats.shopping ?? false;
  if (['lusso',
       'palace_hotel', 'hotel_5_stelle', 'ristorante_stellato', 'chiave_michelin',
       'resort_esclusivo', 'marina_yacht', 'club_esclusivo', 'treno_lusso_storico',
       'isola_privata', 'stazione_sci_lusso', 'ryokan_lusso',
       'noleggio_yacht', 'jet_privato', 'casino_lusso',
      ].includes(cat)) return activeSubcats.lusso ?? false;
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
  'enogastronomia', 'localita', 'shopping', 'lusso',
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
