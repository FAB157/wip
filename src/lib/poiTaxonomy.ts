// =====================================================================
// TASSONOMIA DEI POI — unica fonte di verita' per il filtro delle chips
// =====================================================================
// Logica pura, senza dipendenze da React o Leaflet: viveva dentro
// MapArea.tsx e non era verificabile fuori dal browser (il componente
// importa il CSS di Leaflet). Qui si puo' testare, ed e' proprio la parte
// dove un errore si vede subito dall'utente: POI deselezionati che
// restano sulla mappa.
/**
 * Riconduce una subCategory (etichetta italiana da normalizeSubCategory, tag
 * OSM grezzo o id già canonico) all'id chip usato dai sub-filtri. Senza questa
 * mappa i confronti subFilter.includes(p.subCategory) non matchavano mai:
 * i chip usano id ("farmacia") mentre i POI portavano etichette ("Farmacia").
 */
export function subCategoryToFilterId(subCat?: string | null): string {
  if (!subCat) return "";
  const l = subCat.toLowerCase();
  const map: Record<string, string> = {
    "farmacia": "farmacia", "pharmacy": "farmacia",
    "ospedale": "ospedale", "hospital": "ospedale",
    "taxi": "taxi",
    "stazione": "stazione_ferroviaria", "station": "stazione_ferroviaria",
    "fermata metro": "metropolitana", "subway_entrance": "metropolitana",
    "casello autostradale": "casello_autostradale", "toll_booth": "casello_autostradale", "motorway_junction": "casello_autostradale",
    "fontanella": "fontanelle", "drinking_water": "fontanelle",
    "mercato locale": "mercato", "marketplace": "mercato",
    "polizia": "polizia", "police": "polizia",
    "parco giochi": "parco_giochi", "playground": "parco_giochi",
    "parco a tema": "parco_divertimenti", "theme_park": "parco_divertimenti",
    // Montagne russe (import 27/08/2026 da Wikidata/OSM): stanno nel sotto-chip
    // dei parchi divertimento, non hanno un chip proprio.
    "roller_coaster": "parco_divertimenti", "montagne russe": "parco_divertimenti",
    "acquario": "acquario", "aquarium": "acquario",
    "zoo": "zoo",
    "gelateria": "gelateria", "ice_cream": "gelateria",
    "ristorante": "ristorante", "restaurant": "ristorante",
    "bar caffè": "bar", "cafe": "bar", "bar": "bar",
  };
  return map[l] || l;
}

/**
 * REGOLA FERREA DEL FILTRAGGIO — unica fonte di verità.
 *
 * Ogni POI appartiene a UNA sola macro-categoria (gli id delle chip principali)
 * e a UNA sola sotto-categoria (gli id dei sub-chip). Un POI è visibile solo se
 * la sua macro è selezionata E, quando l'utente ha scelto sub-chip DI QUELLA
 * macro, se la sua sotto-categoria è tra quelli scelti. I sub-chip di altre
 * macro non lo riguardano.
 *
 * Prima la stessa logica era sparsa in tre punti con liste divergenti e
 * percorsi che finivano su `return true`: chiese e musei restavano sulla mappa
 * anche da deselezionati.
 */
export const MACRO_CATEGORIES = ["gemme", "monumenti", "locali", "utilita", "famiglie", "community", "beni_culturali", "tematiche", "localita"] as const;

/**
 * VERTICALI TEMATICI (21/08/2026) — le otto chiavi della macro 🧭 "Tematici".
 *
 * Sono insieme categoria in `shared_pois` (`category = 'terme'`, …), id del
 * sotto-chip e chiave i18n: una chiave sola per tutta la catena, come per
 * `community`. La macro `tematiche` NON è una chiave di filtro (non finisce
 * in `wip_active_subcategories`): lo sono queste otto, perché ognuna si
 * accende e si spegne da sola, in mappa come in GeoControl.
 */
export const TEMATICI_KEYS = [
  "terme", "cinema", "cieli", "street_art", "mercati", "fioriture", "memoria", "lento",
] as const;

export type TematicoKey = typeof TEMATICI_KEYS[number];

/**
 * Vero se il POI appartiene a uno degli otto verticali tematici.
 * Guarda sia `category` (la colonna del DB: 'terme', 'cinema'…) sia
 * `baseCategory`, che la fetch per bbox della mappa mette a 'tematiche'.
 */
export function isTematico(p: any): boolean {
  const cat = String(p?.category || "").toLowerCase();
  if ((TEMATICI_KEYS as readonly string[]).includes(cat)) return true;
  const base = String(p?.baseCategory || "").toLowerCase();
  return base === "tematiche" || (TEMATICI_KEYS as readonly string[]).includes(base);
}

/** La chiave del verticale ('terme', 'cinema'…) o "" se il POI non è tematico. */
export function chiaveTematica(p: any): string {
  const cat = String(p?.category || "").toLowerCase();
  if ((TEMATICI_KEYS as readonly string[]).includes(cat)) return cat;
  const base = String(p?.baseCategory || "").toLowerCase();
  return (TEMATICI_KEYS as readonly string[]).includes(base) ? base : "";
}

/**
 * Etichette italiane dei `poi_type` dei verticali tematici.
 *
 * Il `poi_type` arriva dal catalogo in inglese ("hot_spring", "film_location"):
 * senza questa mappa la scheda mostrerebbe la chiave grezza. Sono TUTTI i tipi
 * previsti dai cataloghi curati — se l'harvest ne aggiunge uno, va aggiunto qui,
 * altrimenti la scheda ricade sul nome della categoria.
 *
 * NB: le stesse etichette, parola per parola, stanno in `lib/tematici.ts`
 * (TEMATICI_TYPE_LABELS), che le usa nella sheet dei temi. Sono tenute
 * separate perché quel modulo carica i cataloghi JSON con `import.meta.glob`
 * e questa tassonomia deve restare logica pura, senza dipendenze da Vite: se
 * si tocca un'etichetta, va cambiata in tutti e due i posti.
 */
export const TEMATICI_TYPE_LABELS: Record<string, string> = {
  // terme
  hot_spring: "Sorgente termale", thermal_town: "Città termale",
  historic_bath: "Bagno storico", spa_resort: "Centro termale",
  thermal_park: "Parco termale", onsen: "Onsen", hammam: "Hammam",
  sauna: "Sauna", mud_spa: "Fanghi termali", thermal_lake: "Lago termale",
  // cinema
  film_location: "Set cinematografico", series_location: "Set di una serie",
  studio_tour: "Studios visitabili", cinema_museum: "Museo del cinema",
  festival_venue: "Sede di un festival",
  // cieli
  dark_sky_park: "Parco del cielo buio", dark_sky_reserve: "Riserva del cielo buio",
  dark_sky_community: "Comunità del cielo buio", stargazing_spot: "Punto per osservare le stelle",
  observatory: "Osservatorio astronomico", planetarium: "Planetario",
  aurora_spot: "Punto per l'aurora", astro_village: "Borgo astronomico",
  // street_art
  mural: "Murale", street_art_district: "Quartiere di street art",
  open_air_museum: "Museo a cielo aperto", graffiti_hall_of_fame: "Muro libero dei graffiti",
  sculpture_trail: "Percorso di sculture", festival_site: "Sede del festival",
  street_art_museum: "Museo di street art",
  // mercati
  christmas_market: "Mercatino di Natale", flea_market: "Mercato delle pulci",
  antiques_market: "Mercato dell'antiquariato", food_market: "Mercato alimentare",
  craft_market: "Mercato dell'artigianato", night_market: "Mercato notturno",
  floating_market: "Mercato galleggiante", historic_market_hall: "Mercato coperto storico",
  // fioriture
  cherry_blossom: "Fioritura dei ciliegi", lavender: "Fioritura della lavanda",
  tulips: "Fioritura dei tulipani", wisteria: "Fioritura del glicine",
  sunflowers: "Campi di girasoli", foliage: "Foliage d'autunno",
  almond_blossom: "Fioritura dei mandorli", rhododendron: "Fioritura dei rododendri",
  wildflowers: "Fiori spontanei", botanical_garden: "Giardino botanico",
  // memoria
  monumental_cemetery: "Cimitero monumentale", war_memorial: "Memoriale di guerra",
  house_museum: "Casa-museo", birthplace: "Casa natale",
  grave_of_notable: "Tomba di un personaggio", memorial_site: "Luogo della memoria",
  mausoleum: "Mausoleo",
  // lento
  scenic_railway: "Treno panoramico", heritage_railway: "Ferrovia storica",
  cable_car: "Funivia", funicular: "Funicolare", scenic_ferry: "Traghetto panoramico",
  cycle_route: "Ciclovia", canal_boat: "Battello sul canale",
  scenic_road: "Strada panoramica",
};

/** Etichetta IT leggibile di un `poi_type` tematico ("" se sconosciuto). */
export function etichettaTipoTematico(poiType?: string | null): string {
  if (!poiType) return "";
  return TEMATICI_TYPE_LABELS[String(poiType).toLowerCase()] || "";
}

/** Sub-chip disponibili per ogni macro (ids esatti di CategoryChips). */
export const SUBS_BY_MACRO: Record<string, string[]> = {
  // Gemme e Monumenti hanno SOLO le quattro famiglie con l'audioguida
  // (decisione utente 22/08/2026). Le gemme naturali (spiagge, vette...)
  // si chiedono dalla macro Natura, che e' selezionabile a parte.
  gemme: ["monumenti_sub", "chiese", "musei", "panorami"],
  monumenti: ["monumenti_sub", "chiese", "musei", "panorami"],
  // NATURA: macro a se' (committente, 22/08/2026: «spiagge fino a parchi e
  // riserve devono avere una categoria a se' stante, non con i monumenti»).
  // Cinque famiglie, stesse chiavi di wip_active_subcategories, di
  // CategoryMap.kt e di PoiCategories.swift.
  // (Elenco letterale e non NATURA_FAMIGLIE: quella e' dichiarata piu' sotto
  // e un `const` letto prima della sua riga fa esplodere il modulo.)
  natura: ["spiagge", "vette", "acque", "grotte", "parchi"],
  locali: ["ristorante", "pizzeria", "pesce", "carne", "sushi", "vegetariano", "glutenfree", "gluten_free_only", "gluten_free_options", "bar", "gelateria"],
  // ev_charging (27/08/2026): colonnine di ricarica EV da OpenChargeMap
  // (CC BY 4.0). Stesso schema delle altre utilita': `category` sul DB e'
  // gia' il valore specifico ('ev_charging'), non un bucket generico.
  utilita: ["farmacia", "ospedale", "mercato", "fontanelle", "stazione_ferroviaria", "metropolitana", "taxi", "casello_autostradale", "polizia", "ev_charging"],
  famiglie: ["parco_giochi", "parco_divertimenti", "acquario", "zoo"],
  // WIP Community: i POI nati dalle foto Vision approvate. Nessun sub-chip:
  // il tipo reale (chiesa, statua...) vive in poi_type/subCategory.
  community: [],
  // Atlante dei beni vincolati (tabella beni_culturali): un layer informativo,
  // non una categoria turistica. Nessun sub-chip — dentro c'è di tutto, dalla
  // cattedrale al muro di cinta, e i sub-chip culturali riguardano la mappa
  // turistica.
  beni_culturali: [],
  // Verticali tematici: qui i sotto-chip sono le categorie stesse (terme,
  // cinema, cieli…), non etichette derivate da poi_type. Vedi TEMATICI_KEYS.
  tematiche: [...TEMATICI_KEYS],
};

export const CHIESE_TYPES = ["church", "chiesa", "chiese", "place_of_worship", "cathedral", "cattedrale", "chapel", "cappella", "basilica", "monastery", "monastero", "abbey", "abbazia", "shrine", "santuario"];
export const MUSEI_TYPES = ["museum", "musei", "museo", "gallery", "galleria", "art_gallery"];
// "natura" e i tipi naturali specifici mancavano: un POI con category
// 'natura' (o 'beach', 'waterfall'…) usciva da resolvePoiTaxonomy con
// macro null, e il filtro della mappa scarta tutto ciò che non ha una
// macro — quindi restava INVISIBILE sotto ogni chip. È emerso importando
// 30.068 sentieri, ma riguardava già spiagge, cascate e riserve.
// I sentieri e i cammini stanno qui: chi cerca panorami cerca anche dove
// camminare, ed è l'unica famiglia che non richiede una chip in più.
// NATURA — sei famiglie, non un mucchio solo.
//
// Fino al 21/08/2026 spiagge, vette, cascate, grotte e parchi finivano
// tutti dentro il sotto-filtro «panorami»: o li prendevi tutti o niente, e
// chi cercava una spiaggia si portava dietro anche i ghiacciai. Ora ogni
// famiglia ha il suo, con la sua icona.
//
// `panorami` resta, ma solo per quello che e' davvero un punto di vista —
// piu' il generico «natura» e i sentieri, che una famiglia precisa non ce
// l'hanno. Da tenere allineato a CategoryMap.kt (Android),
// PoiCategories.map (iOS) e guideSettings.isCategoryAllowed.
export const SPIAGGE_TYPES = ["beach", "spiaggia", "spiagge", "bay", "baia", "island", "isola", "cliff", "falesia", "coast", "costa", "dune"];
export const VETTE_TYPES = ["peak", "vetta", "vette", "volcano", "vulcano", "glacier", "ghiacciaio", "mountain_pass", "valico", "ridge", "arete", "saddle"];
export const ACQUE_TYPES = ["waterfall", "cascata", "cascate", "spring", "sorgente", "hot_spring", "lake", "lago", "laghi", "river", "fiume", "gorge", "gola", "canyon"];
export const GROTTE_TYPES = ["cave", "grotta", "grotte", "cave_entrance", "sinkhole", "abisso"];
export const PARCHI_TYPES = ["park", "parchi", "parco", "garden", "giardino", "botanical_garden", "nature_reserve", "riserva", "geopark", "forest", "foresta", "wood", "bosco", "desert", "deserto", "tree", "albero", "national_park"];
/** Le cinque famiglie della macro Natura, nell'ordine dei sotto-chip. */
export const NATURA_FAMIGLIE = ["spiagge", "vette", "acque", "grotte", "parchi"] as const;
/**
 * Tutti i valori di `shared_pois.category` che la macro Natura chiede al DB
 * con una fetch dedicata per bbox (MapArea.fetchNaturaPoisInBounds). Serve
 * perche' la RPC nearby_pois restituisce i 1.000 POI piu' vicini di
 * QUALUNQUE categoria: in una citta' i monumenti riempiono tutti i posti e
 * le 10.000 spiagge del DB non arrivavano mai sulla mappa (22/08/2026).
 */
export const NATURA_DB_CATEGORIES: string[] = [...SPIAGGE_TYPES, ...VETTE_TYPES, ...ACQUE_TYPES, ...GROTTE_TYPES, ...PARCHI_TYPES];
/** Famiglia naturale di un valore grezzo di category/poi_type, o null. */
export function famigliaNatura(value: string): (typeof NATURA_FAMIGLIE)[number] | null {
  if (SPIAGGE_TYPES.includes(value)) return "spiagge";
  if (VETTE_TYPES.includes(value)) return "vette";
  if (ACQUE_TYPES.includes(value)) return "acque";
  if (GROTTE_TYPES.includes(value)) return "grotte";
  if (PARCHI_TYPES.includes(value)) return "parchi";
  return null;
}
// "natura" NON sta piu' qui (24/08/2026): un POI con category/baseCategory
// letteralmente 'natura' (il bucket generico che il DB usa per ~255.000
// righe, famiglia vera in poi_type) veniva riconosciuto QUI, prima ancora
// che il ramo dedicato piu' sotto (rawNatura) potesse leggere poi_type —
// finiva sempre sotto Monumenti→Panorami e la chip Natura non mostrava
// MAI nulla. I sentieri restano: non hanno una famiglia naturale precisa.
export const PANORAMI_TYPES = [
  "viewpoint", "panorami", "panorama", "lighthouse", "faro", "scenic_road", "aerialway",
  "sentiero", "sentieri", "hiking", "trail", "cammino", "via_ferrata",
];
export const MONUMENTI_TYPES = ["monument", "monumenti", "monumento", "artwork", "attraction", "attrazioni", "castle", "castelli", "ruins", "archaeological_site", "archeo", "memorial", "fort", "tower"];
export const LOCALI_TYPES = ["locali", "restaurant", "ristorante", "ristoranti", "cafe", "bar", "fast_food", "pub", "ice_cream", "gelateria", "bakery", "nightclub", "biergarten", "food_court"];
export const FAMIGLIE_TYPES = ["famiglie", "playground", "parco_giochi", "theme_park", "parco_divertimenti", "aquarium", "acquario", "zoo", "water_park", "roller_coaster"];
export const UTILITA_TYPES = ["utilita", "pharmacy", "farmacia", "hospital", "ospedale", "clinic", "doctors", "police", "polizia", "taxi", "drinking_water", "fontanelle", "marketplace", "mercato", "station", "stazione_ferroviaria", "subway_entrance", "metropolitana", "toll_booth", "casello_autostradale", "post_office", "parking", "ev_charging", "charging_station"];

/**
 * ENOGASTRONOMIA — dal `poi_type` importato da OSM al sub-chip.
 *
 * I nomi a sinistra sono esattamente i poi_type scritti da
 * `scratch/importa-enogastronomia.mjs`; a destra gli id dei sub-chip. Se un
 * giorno si aggiunge una famiglia all'harvest, va aggiunta anche qui,
 * altrimenti quei POI restano senza sotto-categoria e spariscono appena
 * l'utente accende un sub-chip (è già successo con i sentieri).
 */
export const ENO_SUB_BY_TYPE: Record<string, string> = {
  cantina: "cantine", enoteca: "cantine", wine_cellar: "cantine", winery: "cantine",
  vigneto: "vigneti", vineyard: "vigneti", uliveto: "frantoi",
  birrificio: "birrifici", brewery: "birrifici", distilleria: "birrifici", distillery: "birrifici",
  caseificio: "caseifici", formaggi: "caseifici", cheese: "caseifici", dairy: "caseifici",
  frantoio: "frantoi", oil_mill: "frantoi",
  risaia: "frantoi", salina: "botteghe_gusto", frutteto: "vigneti",
  piantagione: "botteghe_gusto", mulino: "botteghe_gusto", pastificio: "botteghe_gusto",
  frutta_secca: "botteghe_gusto", mercato: "botteghe_gusto",
  gastronomia: "botteghe_gusto", fattoria: "botteghe_gusto", pasticceria: "botteghe_gusto",
  cioccolato: "botteghe_gusto", caffe: "botteghe_gusto", te: "botteghe_gusto",
  miele: "botteghe_gusto", spezie: "botteghe_gusto", museo_gusto: "botteghe_gusto",
  panificio: "botteghe_gusto", macelleria: "botteghe_gusto", pescheria: "botteghe_gusto",
  ortofrutta: "botteghe_gusto", dolciumi: "botteghe_gusto",
  strada_del_vino: "strade_vino",
};

/**
 * TURISMO DELLO SHOPPING (28/08/2026) — dal `poi_type` importato da OSM/
 * Wikidata (`scratch/importa-shopping.mjs`) o dal catalogo curato degli
 * outlet (`src/lib/outletCatalog.ts`) all'id del sub-chip. Stesso schema di
 * ENO_SUB_BY_TYPE: se si aggiunge una famiglia all'harvest va aggiunta anche qui.
 */
export const SHOPPING_SUB_BY_TYPE: Record<string, string> = {
  shopping_street: "vie_shopping", historic_arcade: "vie_shopping",
  department_store: "grandi_magazzini",
  shopping_mall: "mall",
  outlet_village: "outlet",
  souk_bazaar: "souk",
  duty_free_zone: "duty_free",
};

/**
 * TURISMO DI LUSSO (28/08/2026) — dal `poi_type` del catalogo curato
 * (`src/lib/luxuryCatalog.ts`, popolato a mano: l'universo del lusso vero è
 * piccolo, non ha senso un harvest di massa) all'id del sub-chip.
 */
export const LUSSO_SUB_BY_TYPE: Record<string, string> = {
  palace_hotel: "hotel_lusso", hotel_5_stelle: "hotel_lusso",
  chiave_michelin: "hotel_lusso", resort_esclusivo: "hotel_lusso",
  ryokan_lusso: "hotel_lusso", isola_privata: "hotel_lusso",
  ristorante_stellato: "ristoranti_stellati",
  marina_yacht: "marine_yacht",
  club_esclusivo: "club_esclusivi",
  treno_lusso_storico: "treni_storici",
  stazione_sci_lusso: "sci_lusso",
  noleggio_yacht: "noleggio_lusso", jet_privato: "noleggio_lusso",
};

/**
 * I DUE LIVELLI DEL LAYER "VINO E GUSTO".
 *
 * Stessa scelta fatta con i sentieri, dove a zoom lontano si mostrano solo
 * le reti internazionali e nazionali: i 199.280 luoghi del gusto non possono
 * comparire tutti insieme, o una città diventa una macchia.
 *
 * PRODUTTORI: dove il prodotto NASCE. Sono ~65.000 e sono il motivo per cui
 * si accende il layer — una cantina, un caseificio, un frantoio si visitano.
 * BOTTEGHE: dove il prodotto si COMPRA. Sono ~130.000, valgono quando si è
 * già in centro a piedi, non mentre si guarda una valle dall'alto.
 */
export const ENO_PRODUTTORI = [
  "cantina", "vigneto", "caseificio", "frantoio", "uliveto",
  "birrificio", "distilleria", "museo_gusto",
  // Secondo giro (20/08/2026): i PAESAGGI del cibo tipico, che il primo
  // harvest non cercava. Una risaia terrazzata o una salina coi mulini
  // sono tappe quanto una cantina.
  "risaia", "salina", "frutteto", "piantagione", "mulino", "pastificio",
];
export const ENO_BOTTEGHE = [
  "enoteca", "formaggi", "gastronomia", "fattoria", "pasticceria",
  "cioccolato", "caffe", "te", "miele", "spezie", "frutta_secca",
  // Il mercato è il posto dove si capisce cosa si mangia in una città:
  // sta fra le botteghe perché ha senso quando si è già in centro.
  "mercato",
  "panificio", "macelleria", "pescheria", "ortofrutta", "dolciumi",
];

/**
 * Macro + sotto-categoria canoniche di un POI. `subId` usa gli id dei sub-chip
 * ("chiese", "monumenti_sub", "farmacia", …), stringa vuota se non deducibile.
 */
export function resolvePoiTaxonomy(p: any): { macro: string | null; subId: string } {
  const raw = String(p.baseCategory || p.category || "").toLowerCase();
  const sub = String(p.subCategory || "").toLowerCase();
  const subCanonical = subCategoryToFilterId(sub);

  // I POI WIP Community sono una macro a sé (pin e chip dedicati): la natura
  // reale (chiesa, statua, panorama) resta in subCategory ma non li sposta
  // mai in un'altra macro.
  if (raw === "community") return { macro: "community", subId: "" };

  // Atlante dei beni vincolati: macro a sé. Va risolto PRIMA della logica
  // culturale, perché molti di questi beni sono chiese o castelli e finirebbero
  // sotto "monumenti", comparendo anche a chip atlante spenta.
  if (raw === "beni_culturali") return { macro: "beni_culturali", subId: "" };

  // LOCALITÀ TURISTICHE (24/08/2026): borghi e villaggi che sono meta di per
  // sé — Riomaggiore, Volterra, Colonnata — non un monumento dentro una
  // città. Macro a sé come beni_culturali/tematiche, risolta PRIMA della
  // logica culturale per lo stesso motivo: molte hanno un centro storico che
  // altrimenti li farebbe classificare "monumenti".
  if (raw === "localita") return { macro: "localita", subId: "" };

  // VERTICALI TEMATICI. Vanno risolti PRIMA della logica culturale per lo
  // stesso motivo dei beni vincolati: una casa museo, un cimitero monumentale
  // o un osservatorio finirebbero sotto "monumenti"/"musei" e comparirebbero
  // sulla mappa a chip tematica spenta. La sotto-categoria è la categoria
  // stessa, perché è quella che l'utente accende.
  // Due strade portano qui e vanno gestite entrambe:
  //  - `raw` è già la chiave del verticale ('terme'): il POI arriva dalla RPC
  //    o dalla cache, dove `category` è la colonna del DB;
  //  - `raw` è 'tematiche': lo scrive la fetch per bbox della mappa in
  //    `baseCategory`, e la chiave vera resta in `category`.
  if ((TEMATICI_KEYS as readonly string[]).includes(raw)) {
    return { macro: "tematiche", subId: raw };
  }
  if (raw === "tematiche") {
    const chiave = String(p.category || "").toLowerCase();
    return { macro: "tematiche", subId: (TEMATICI_KEYS as readonly string[]).includes(chiave) ? chiave : "" };
  }

  // VINO E GUSTO — nessuna macro, e non è una dimenticanza.
  //
  // I 199.280 luoghi del gusto NON sono POI culturali: sono un verticale a
  // sé, come i sentieri, e vivono in un layer del pannello ⓘ che disegna i
  // propri pin. Restituire `macro: null` è esattamente ciò che li tiene
  // FUORI dalla mappa turistica: il filtro delle chip scarta chi non ha una
  // macro, e una cantina non deve comparire fra i monumenti solo perché si
  // trova nel raggio della RPC.
  // La sotto-categoria si risolve lo stesso, perché il layer e la scheda la
  // usano per scegliere l'icona.
  if (raw === "enogastronomia") {
    return { macro: null, subId: ENO_SUB_BY_TYPE[sub] || ENO_SUB_BY_TYPE[subCanonical] || "" };
  }

  // TURISMO DELLO SHOPPING e TURISMO DI LUSSO (28/08/2026) — stesso schema
  // di enogastronomia: macro null, layer a sé nel pannello ⓘ, fuori dalla
  // mappa turistica normale finché l'utente non accende il layer.
  if (raw === "shopping") {
    return { macro: null, subId: SHOPPING_SUB_BY_TYPE[sub] || SHOPPING_SUB_BY_TYPE[subCanonical] || "" };
  }
  if (raw === "lusso") {
    return { macro: null, subId: LUSSO_SUB_BY_TYPE[sub] || LUSSO_SUB_BY_TYPE[subCanonical] || "" };
  }

  // Le gemme sono una macro a sé: restano gemme anche se sono chiese o musei,
  // ma conservano la sotto-categoria culturale per i sub-chip.
  const isGem = p.is_gem === true || raw === "gemme";

  const culturalSub = (value: string): string | null => {
    if (CHIESE_TYPES.includes(value)) return "chiese";
    if (MUSEI_TYPES.includes(value)) return "musei";
    // Le famiglie naturali vanno provate PRIMA di panorami, che ormai e' il
    // contenitore di quello che non ha una famiglia sua.
    const fam = famigliaNatura(value);
    if (fam) return fam;
    if (PANORAMI_TYPES.includes(value)) return "panorami";
    if (MONUMENTI_TYPES.includes(value)) return "monumenti_sub";
    return null;
  };

  // `raw` puo' essere 'natura' scritto da MapArea.fetchNaturaPoisInBounds in
  // baseCategory: la famiglia vera sta in `category` (beach, peak…).
  const rawNatura = raw === "natura" ? String(p.category || "").toLowerCase() : "";
  const cultural = culturalSub(raw) || (rawNatura ? culturalSub(rawNatura) : null) || culturalSub(sub);
  // Una gemma naturale (spiaggia, vetta, cascata...) sta in Natura, non in
  // Gemme: Gemme e Monumenti hanno solo le quattro famiglie con l'audioguida
  // (decisione utente 22/08/2026).
  if (isGem && cultural && (NATURA_FAMIGLIE as readonly string[]).includes(cultural)) return { macro: "natura", subId: cultural };
  if (isGem) return { macro: "gemme", subId: cultural || "" };
  // NATURA e' una macro a se': spiagge, vette, acque, grotte e parchi non
  // stanno piu' sotto Monumenti (22/08/2026). 'natura' generico e i sentieri
  // restano "panorami" dentro Monumenti: non hanno una famiglia precisa.
  if (cultural && (NATURA_FAMIGLIE as readonly string[]).includes(cultural)) return { macro: "natura", subId: cultural };
  if (cultural) return { macro: "monumenti", subId: cultural };

  if (LOCALI_TYPES.includes(raw)) return { macro: "locali", subId: subCanonical };
  if (FAMIGLIE_TYPES.includes(raw)) return { macro: "famiglie", subId: subCanonical || subCategoryToFilterId(raw) };
  if (UTILITA_TYPES.includes(raw)) return { macro: "utilita", subId: subCanonical || subCategoryToFilterId(raw) };

  return { macro: null, subId: subCanonical };
}

/**
 * Molti POI da Overpass/Google arrivano senza subCategory: qui la deduciamo da
 * nome e tag, ma solo per verificare se corrispondono a uno dei sub-chip
 * ATTIVI. Non è mai un lasciapassare: se nulla combacia, il POI resta escluso.
 */
export function matchesSubByHeuristics(p: any, macro: string, activeSubs: string[]): boolean {
  const name = (p.name || "").toLowerCase();
  const amenity = (p.amenity || "").toLowerCase();
  const railway = (p.railway || "").toLowerCase();
  const types: string[] = p.types || [];
  const has = (s: string) => activeSubs.includes(s);

  if (macro === "locali") {
    if (has("ristorante") && (amenity.includes("restaurant") || types.includes("restaurant") || name.includes("ristorante") || name.includes("osteria") || name.includes("trattoria"))) return true;
    if (has("pizzeria") && (name.includes("pizz") || amenity.includes("pizza") || types.includes("pizza"))) return true;
    if (has("pesce") && (name.includes("pesce") || name.includes("mare") || name.includes("sea") || name.includes("fish") || types.includes("seafood_restaurant"))) return true;
    if (has("carne") && (name.includes("carne") || name.includes("steak") || name.includes("brace") || name.includes("grill") || types.includes("steak_house"))) return true;
    if (has("vegetariano") && (name.includes("vega") || name.includes("bio") || name.includes("vegetariano") || name.includes("salad") || types.includes("vegetarian_restaurant"))) return true;
    if ((has("glutenfree") || has("gluten_free_only") || has("gluten_free_options")) && (name.includes("senza glutine") || name.includes("gluten") || name.includes("celiac"))) return true;
    if (has("bar") && (amenity.includes("bar") || amenity.includes("cafe") || types.includes("bar") || types.includes("cafe") || name.includes("bar ") || name.includes("caffé"))) return true;
    if (has("gelateria") && (name.includes("gelat") || name.includes("ice cream"))) return true;
    if (has("sushi") && (name.includes("sushi") || name.includes("giapponese") || name.includes("japanese") || types.includes("sushi_restaurant"))) return true;
    return false;
  }

  if (macro === "utilita") {
    if (has("taxi") && (amenity.includes("taxi") || name.includes("taxi") || name.includes("radiotaxi"))) return true;
    if (has("stazione_ferroviaria") && (railway === "station" || name.includes("stazione fs") || name.includes("stazione ferrovia") || name.includes("gare ") || name.includes("bahnhof"))) return true;
    if (has("casello_autostradale") && (name.includes("casello") || name.includes("toll booth") || amenity.includes("toll"))) return true;
    if (has("ospedale") && (amenity.includes("hospital") || name.includes("ospedal") || name.includes("hospital") || name.includes("clinica"))) return true;
    if (has("farmacia") && (amenity.includes("pharmacy") || name.includes("farmac") || name.includes("pharma") || name.includes("apothe"))) return true;
    if (has("metropolitana") && (name.includes("metro") || amenity === "subway" || railway.includes("subway"))) return true;
    if (has("polizia") && (amenity.includes("police") || name.includes("polizia") || name.includes("carabinier"))) return true;
    if (has("fontanelle") && (amenity.includes("drinking_water") || name.includes("fontanell") || name.includes("drinking") || name.includes("fountain"))) return true;
    if (has("mercato") && (amenity.includes("marketplace") || name.includes("mercat") || name.includes("market") || name.includes("souk") || name.includes("bazar"))) return true;
    return false;
  }

  if (macro === "famiglie") {
    if (has("parco_giochi") && (name.includes("parco giochi") || name.includes("playground"))) return true;
    if (has("parco_divertimenti") && (name.includes("divertiment") || name.includes("theme park") || name.includes("luna park"))) return true;
    if (has("acquario") && (name.includes("acquario") || name.includes("aquarium"))) return true;
    if (has("zoo") && (name.includes("zoo") || name.includes("safari") || name.includes("bioparco"))) return true;
    return false;
  }

  // Cultura (monumenti e gemme): il tipo è già risolto da resolvePoiTaxonomy;
  // qui restano i POI con categoria generica ma nome parlante.
  if (has("chiese") && (name.includes("chiesa") || name.includes("duomo") || name.includes("basilica") || name.includes("santuario") || name.includes("cattedrale") || name.includes("abbazia") || name.includes("church"))) return true;
  if (has("musei") && (name.includes("museo") || name.includes("museum") || name.includes("pinacoteca") || name.includes("galleria"))) return true;
  if (has("panorami") && (name.includes("panoram") || name.includes("belvedere") || name.includes("viewpoint") || name.includes("giardin"))) return true;
  if (has("monumenti_sub") && (name.includes("monument") || name.includes("castello") || name.includes("torre") || name.includes("palazzo") || name.includes("rocca"))) return true;
  return false;
}

/**
 * Vero se il POI supera la regola ferrea per la selezione corrente di chip.
 * `subFilter` è la lista piatta dei sub-chip attivi di TUTTE le macro.
 */
/**
 * Il POI e' anche un bene vincolato di un registro nazionale?
 * Sono due cose diverse e vanno tenute distinte:
 *  - `category === 'beni_culturali'`: il bene esiste SOLO nell'atlante, non
 *    era gia' un nostro POI. Scheda e foto, nessuna audioguida.
 *  - il marcatore in `technical_data`: il POI c'era gia' (una chiesa importata
 *    da Wikidata) e l'atlante ci ha detto che e' anche tutelato. Conserva la
 *    sua categoria, la sua audioguida, e in piu' porta il riconoscimento.
 * Il secondo caso e' quello che merita il badge.
 */
export function isBeneCulturale(p: any): boolean {
  if (String(p?.category || '').toLowerCase() === 'beni_culturali') return true;
  return !!datiBeneCulturale(p);
}

/**
 * I dati del vincolo da mostrare nel badge, se ci sono.
 * Due provenienze, perche' due strade portano qui:
 *  - `beneCulturale`: lo stampa MapArea leggendo l'atlante per bbox. E' la
 *    strada della mappa, dove la RPC `nearby_pois` non porta technical_data.
 *  - `technical_data.bene_culturale`: lo scrive l'aggancio lato server, e
 *    arriva quando si legge la riga piena (scheda, pacchetti offline, nativo).
 */
export function datiBeneCulturale(p: any): { registro?: string; tutela?: string } | null {
  const diretto = p?.beneCulturale;
  if (diretto && typeof diretto === 'object') {
    return { registro: diretto.registro || undefined, tutela: diretto.tutela || undefined };
  }
  const t = p?.technical_data;
  if (!t || typeof t !== 'object' || !t.bene_culturale) return null;
  const b = t.bene_culturale;
  return { registro: b.registro || undefined, tutela: b.tutela || undefined };
}

export function passesCategoryRule(p: any, selectedCategories: string[], subFilter?: string[] | null): boolean {
  const { macro, subId } = resolvePoiTaxonomy(p);

  // DOPPIA APPARTENENZA. Un POI che e' anche bene vincolato compare sotto
  // ENTRAMBI i chip: la sua categoria turistica (una chiesa resta fra le
  // chiese, con la sua audioguida) e l'atlante. Senza questa riga il POI
  // sparirebbe accendendo il chip "beni culturali", perche' `resolvePoiTaxonomy`
  // assegna una macro sola e la sua e' quella turistica.
  if (selectedCategories.includes('beni_culturali') && isBeneCulturale(p)) return true;

  // VERTICALI TEMATICI. Le otto sotto-categorie sono anche chiavi di filtro
  // (stanno in selectedCategories, non in subFilter): il POI passa se la SUA
  // categoria è accesa. La macro 🧭 accesa da sola — succede quando arriva da
  // GeoControl, che salva solo le otto chiavi — vale come "tutte".
  if (macro === "tematiche") {
    if (subId && selectedCategories.includes(subId)) return true;
    const nessunaSub = !(TEMATICI_KEYS as readonly string[]).some(k => selectedCategories.includes(k));
    return selectedCategories.includes("tematiche") && nessunaSub;
  }

  if (!macro) return false;
  if (!selectedCategories.includes(macro)) return false;

  const subsOfMacro = SUBS_BY_MACRO[macro] || [];
  const activeSubs = (subFilter || []).filter(s => subsOfMacro.includes(s));
  // Nessun sub-chip di questa macro selezionato ⇒ il chip "Tutti" è attivo.
  if (activeSubs.length === 0) return true;

  if (subId && activeSubs.includes(subId)) return true;
  // glutenfree ha tre id equivalenti tra chip e dati.
  const GF = ["glutenfree", "gluten_free_only", "gluten_free_options"];
  if (GF.includes(subId) && activeSubs.some(s => GF.includes(s))) return true;

  // Molti POI da Overpass/Google non hanno subCategory (un ristorante con solo
  // amenity=restaurant). L'ultima parola spetta alle euristiche su nome e tag,
  // che però confrontano SOLO con i sub-chip attivi: mai un lasciapassare.
  return matchesSubByHeuristics(p, macro, activeSubs);
}
