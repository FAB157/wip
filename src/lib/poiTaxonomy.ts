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
export const MACRO_CATEGORIES = ["gemme", "monumenti", "locali", "utilita", "famiglie", "community", "beni_culturali"] as const;

/** Sub-chip disponibili per ogni macro (ids esatti di CategoryChips). */
export const SUBS_BY_MACRO: Record<string, string[]> = {
  gemme: ["monumenti_sub", "chiese", "musei", "panorami"],
  monumenti: ["monumenti_sub", "chiese", "musei", "panorami"],
  locali: ["ristorante", "pizzeria", "pesce", "carne", "sushi", "vegetariano", "glutenfree", "gluten_free_only", "gluten_free_options", "bar", "gelateria"],
  utilita: ["farmacia", "ospedale", "mercato", "fontanelle", "stazione_ferroviaria", "metropolitana", "taxi", "casello_autostradale", "polizia"],
  famiglie: ["parco_giochi", "parco_divertimenti", "acquario", "zoo"],
  // WIP Community: i POI nati dalle foto Vision approvate. Nessun sub-chip:
  // il tipo reale (chiesa, statua...) vive in poi_type/subCategory.
  community: [],
  // Atlante dei beni vincolati (tabella beni_culturali): un layer informativo,
  // non una categoria turistica. Nessun sub-chip — dentro c'è di tutto, dalla
  // cattedrale al muro di cinta, e i sub-chip culturali riguardano la mappa
  // turistica.
  beni_culturali: [],
};

const CHIESE_TYPES = ["church", "chiesa", "chiese", "place_of_worship", "cathedral", "cattedrale", "chapel", "cappella", "basilica", "monastery", "monastero", "abbey", "abbazia", "shrine", "santuario"];
const MUSEI_TYPES = ["museum", "musei", "museo", "gallery", "galleria", "art_gallery"];
// "natura" e i tipi naturali specifici mancavano: un POI con category
// 'natura' (o 'beach', 'waterfall'…) usciva da resolvePoiTaxonomy con
// macro null, e il filtro della mappa scarta tutto ciò che non ha una
// macro — quindi restava INVISIBILE sotto ogni chip. È emerso importando
// 30.068 sentieri, ma riguardava già spiagge, cascate e riserve.
// I sentieri e i cammini stanno qui: chi cerca panorami cerca anche dove
// camminare, ed è l'unica famiglia che non richiede una chip in più.
const PANORAMI_TYPES = [
  "viewpoint", "panorami", "panorama", "park", "parchi", "garden", "nature_reserve",
  "natura", "sentiero", "sentieri", "hiking", "trail", "cammino",
  "beach", "spiaggia", "bay", "baia", "lake", "lago", "island", "isola",
  "waterfall", "cascata", "spring", "cave", "grotta", "peak", "vetta",
  "cliff", "falesia", "glacier", "volcano", "forest", "foresta",
];
const MONUMENTI_TYPES = ["monument", "monumenti", "monumento", "artwork", "attraction", "attrazioni", "castle", "castelli", "ruins", "archaeological_site", "archeo", "memorial", "fort", "tower"];
const LOCALI_TYPES = ["locali", "restaurant", "ristorante", "ristoranti", "cafe", "bar", "fast_food", "pub", "ice_cream", "gelateria", "bakery", "nightclub", "biergarten", "food_court"];
const FAMIGLIE_TYPES = ["famiglie", "playground", "parco_giochi", "theme_park", "parco_divertimenti", "aquarium", "acquario", "zoo", "water_park"];
const UTILITA_TYPES = ["utilita", "pharmacy", "farmacia", "hospital", "ospedale", "clinic", "doctors", "police", "polizia", "taxi", "drinking_water", "fontanelle", "marketplace", "mercato", "station", "stazione_ferroviaria", "subway_entrance", "metropolitana", "toll_booth", "casello_autostradale", "post_office", "parking"];

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

  // Le gemme sono una macro a sé: restano gemme anche se sono chiese o musei,
  // ma conservano la sotto-categoria culturale per i sub-chip.
  const isGem = p.is_gem === true || raw === "gemme";

  const culturalSub = (value: string): string | null => {
    if (CHIESE_TYPES.includes(value)) return "chiese";
    if (MUSEI_TYPES.includes(value)) return "musei";
    if (PANORAMI_TYPES.includes(value)) return "panorami";
    if (MONUMENTI_TYPES.includes(value)) return "monumenti_sub";
    return null;
  };

  const cultural = culturalSub(raw) || culturalSub(sub);
  if (isGem) return { macro: "gemme", subId: cultural || "" };
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
