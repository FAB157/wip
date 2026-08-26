// =====================================================================
// ITAINTA · Mappatura tag OSM/Overpass -> categorie itainta + filtro qualita'
// Usato sia dallo script di import CSV sia dal fallback Overpass runtime,
// cosi' la classificazione e' identica nelle due strade.
// =====================================================================

import type { PoiCategory } from '../types/poi';

/** Nomi generici/non-significativi da scartare. */
const GENERIC_NAMES = new Set([
  'yes', 'no', 'true', 'false', 'unknown', 'poi', 'n/a', 'na', '-', '?', '.',
]);

/**
 * Mappa un set di tag (OSM o colonne CSV omonime) a una categoria itainta.
 * Ritorna null se il punto non rientra nelle 9 categorie supportate
 * (es. highway/shop/craft/railway -> scartato).
 */
export function mapToItaintaCategory(
  tags: Record<string, string | undefined>,
): PoiCategory | null {
  const tourism = (tags.tourism || '').toLowerCase();
  const historic = (tags.historic || '').toLowerCase();
  const amenity = (tags.amenity || '').toLowerCase();
  const building = (tags.building || '').toLowerCase();

  // --- utilita FORCE FILTER (scarta prima di tutto) ---
  if (
    amenity === 'hospital' ||
    amenity === 'pharmacy' ||
    amenity === 'clinic' ||
    amenity === 'doctors' ||
    amenity === 'dentist' ||
    amenity === 'social_facility' ||
    amenity === 'veterinary' ||
    amenity === 'police' ||
    amenity === 'post_office' ||
    amenity === 'drinking_water' ||
    amenity === 'taxi' ||
    amenity === 'toilets' ||
    amenity === 'marketplace' ||
    tags.railway === 'station' ||
    tags.railway === 'subway_entrance' ||
    tags.barrier === 'toll_booth' ||
    tags.highway === 'motorway_junction'
  ) {
    return 'utilita';
  }

  // --- tourism ---
  if (tourism === 'museum' || tourism === 'gallery') return 'museum';
  if (tourism === 'viewpoint') return 'viewpoint';
  if (tourism === 'artwork') return 'artwork';
  if (tourism === 'attraction' || tourism === 'yes') return 'attraction';

  // --- historic ---
  if (historic === 'monument' || historic === 'memorial') return 'monument';
  if (
    historic === 'castle' ||
    historic === 'fort' ||
    historic === 'fortress' ||
    historic === 'city_gate' ||
    historic === 'tower'
  ) {
    return 'castle';
  }
  if (historic === 'ruins') return 'ruins';
  if (historic === 'archaeological_site') return 'archaeological_site';
  if (historic === 'artwork') return 'artwork';
  if (
    historic === 'church' ||
    historic === 'chapel' ||
    historic === 'cathedral' ||
    historic === 'monastery'
  ) {
    return 'church';
  }

  // --- luoghi di culto ---
  if (amenity === 'place_of_worship') return 'church';
  if (building === 'church' || building === 'cathedral' || building === 'chapel') {
    return 'church';
  }

  // --- famiglie ---
  if (
    tags.leisure === 'park' ||
    tags.leisure === 'playground' ||
    tourism === 'theme_park' ||
    tourism === 'aquarium' ||
    tourism === 'zoo'
  ) {
    return 'famiglie';
  }

  // --- locali ---
  if (
    amenity === 'restaurant' ||
    amenity === 'cafe' ||
    amenity === 'fast_food' ||
    amenity === 'bar' ||
    amenity === 'pub' ||
    amenity === 'ice_cream'
  ) {
    return 'locali';
  }

  // --- fallback storico generico ---
  if (historic && historic !== 'no') return 'monument';

  // --- piazze ---
  if (tags.place === 'square' || (tags.highway === 'pedestrian' && tags.area === 'yes')) {
    return 'monument';
  }

  return null;
}

/** Verifica che un POI superi il filtro qualita' (categoria valida + nome reale). */
export function isAcceptablePoi(
  name: string | undefined | null,
  category: PoiCategory | null,
): boolean {
  if (!category) return false;
  if (!name) return false;
  const n = name.trim().toLowerCase();
  if (n.length < 2) return false;
  if (GENERIC_NAMES.has(n)) return false;
  return true;
}

/**
 * Normalizza l'id di un POI di fonte terza per il dedup.
 *
 * SOLO gli id genuinamente OSM diventano id numerico puro:
 *   - "node/123" | "way/123" | "relation/123"  (Overpass live)
 *   - "123" | "@123"                            (CSV, colonna @id numerica)
 * confrontabili fra loro → poi diventeranno "osm-123" in shared_pois.
 *
 * Gli id con PREFISSO di altre sorgenti (Foursquare "fsq_…", Geoapify "geo_…")
 * NON sono OSM: estrarne le cifre finali creava collisioni "osm-<n>" con POI
 * OSM reali diversi. Si conserva un namespace distinto ("fsq-…", "geo-…"),
 * normalizzando il separatore a '-' (insertAutoPois lo tratta come id già
 * namespacizzato perché contiene '-').
 */
export function normalizeOsmId(raw: string | number): string {
  const s = String(raw).trim();
  // OSM esplicito: tipo/idnumerico.
  const typed = s.match(/^(?:node|way|relation)\/(\d+)$/i);
  if (typed) return typed[1];
  // OSM da CSV: id puramente numerico (con eventuale '@' del campo @id).
  const numeric = s.match(/^@?(\d+)$/);
  if (numeric) return numeric[1];
  // Fonte terza con prefisso alfabetico (fsq_/geo_/…): namespace preservato.
  const prefixed = s.match(/^([a-z]+)[_:\-](.+)$/i);
  if (prefixed) {
    const ns = prefixed[1].toLowerCase();
    const rest = prefixed[2].replace(/[^a-z0-9]+/gi, '');
    if (rest) return `${ns}-${rest}`;
  }
  // Fallback: id sconosciuto lasciato intatto, MAI ridotto alle cifre finali.
  return s;
}

/** Etichette IT per la UI. */
export const CATEGORY_LABELS_IT: Record<PoiCategory, string> = {
  museum: 'Museo',
  monument: 'Monumento',
  viewpoint: 'Punto panoramico',
  church: 'Chiesa',
  castle: 'Castello',
  ruins: 'Rovine',
  archaeological_site: 'Sito archeologico',
  artwork: "Opera d'arte",
  attraction: 'Attrazione',
  utilita: 'Utilità e Servizi',
  famiglie: 'Famiglie e Parchi',
  esperienze_locali: 'Esperienze Locali',
  locali: 'Locali e Ristorazione',
  eventi: 'Eventi',
  gemme: 'Gemme Nascoste',
  monumenti: 'Monumenti',
  musei: 'Musei',
  chiese: 'Chiese',
  panorami: 'Panorami',
  enogastronomia: 'Vino e Gusto',
  natura: 'Natura',
  beach: 'Spiaggia',
  bay: 'Baia',
  lake: 'Lago',
  island: 'Isola',
  waterfall: 'Cascata',
  spring: 'Sorgente termale',
  cave: 'Grotta',
  peak: 'Vetta',
  cliff: 'Falesia',
  glacier: 'Ghiacciaio',
  volcano: 'Vulcano',
  nature_reserve: 'Riserva naturale',
  lighthouse: 'Faro',
  aerialway: 'Funivia panoramica',
  winery: 'Cantina',
  square: 'Piazza', bridge: 'Ponte', fountain: 'Fontana', theatre: 'Teatro',
  opera_house: "Teatro d'opera", palace: 'Palazzo', tower: 'Torre',
  skyscraper: 'Grattacielo', cemetery: 'Cimitero monumentale', library: 'Biblioteca',
  windmill: 'Mulino a vento', aqueduct: 'Acquedotto', observatory: 'Osservatorio',
  stadium: 'Stadio', monastery: 'Monastero',
  art_museum: "Museo d'arte", natural_history_museum: 'Museo di storia naturale',
  trail: 'Sentiero', scenic_road: 'Strada panoramica', tree: 'Albero monumentale',
  desert: 'Deserto', forest: 'Foresta', garden: 'Giardino storico',
  aquarium: 'Acquario', water_park: 'Parco acquatico',
  birthplace: 'Casa natale', house_museum: 'Casa museo', necropolis: 'Necropoli',
  catacomb: 'Catacombe', fortress: 'Fortezza', city_walls: 'Cinta muraria',
  villa: 'Villa storica', harbour: 'Porto', mine: 'Miniera', chimney: 'Ciminiera',
  funicular: 'Funicolare', amphitheatre: 'Anfiteatro', roman_baths: 'Terme romane',
  triumphal_arch: 'Arco di trionfo', obelisk: 'Obelisco', mausoleum: 'Mausoleo',
  abbey: 'Abbazia', synagogue: 'Sinagoga', mosque: 'Moschea', temple: 'Tempio',
  botanical_garden: 'Orto botanico', market_hall: 'Mercato coperto',
  train_station: 'Stazione storica', dam: 'Diga', watermill: 'Mulino ad acqua',
  prison: 'Carcere storico', museum_ship: 'Nave museo',
  archaeological_park: 'Parco archeologico', geopark: 'Geoparco',
  memorial: 'Memoriale', sculpture: 'Scultura', university: 'Università storica',
  town_hall: 'Palazzo comunale', via_ferrata: 'Via ferrata', shrine: 'Santuario',
  roman_theatre: 'Teatro romano', roman_circus: 'Circo romano',
  roman_villa: 'Villa romana', domus: 'Domus', city_gate: 'Porta cittadina',
  coastal_tower: 'Torre costiera', stronghold: 'Rocca', quarry: 'Cava',
  saltworks: 'Salina', racetrack: 'Autodromo', racecourse: 'Ippodromo',
  ski_resort: 'Stazione sciistica', ski_jump: 'Trampolino',
  war_cemetery: 'Cimitero di guerra', concentration_camp: 'Campo di concentramento',
  rack_railway: 'Ferrovia a cremagliera', pier: 'Molo', shipyard: 'Cantiere navale',
  art_gallery: 'Pinacoteca', archive: 'Archivio storico',
  radio_telescope: 'Radiotelescopio', hydro_plant: 'Centrale idroelettrica',
  cathedral: 'Cattedrale', basilica: 'Basilica', baptistery: 'Battistero',
  bell_tower: 'Campanile', cloister: 'Chiostro', crypt: 'Cripta',
  // Verticali tematici (21/08/2026): la macro e le sue otto categorie.
  tematiche: 'Tematici',
  terme: 'Terme e sorgenti',
  cinema: 'Location di film e serie',
  cieli: 'Cieli bui e stelle',
  street_art: 'Street art',
  mercati: 'Mercati e mercatini',
  fioriture: 'Fioriture',
  memoria: 'Memoria e case-museo',
  lento: 'Viaggio lento',
};

/** Colore marker per categoria (cluster mappa). */
export const CATEGORY_COLORS: Record<PoiCategory, string> = {
  enogastronomia: '#7f1d1d',
  museum: '#8b5cf6',
  monument: '#b45309',
  viewpoint: '#0ea5e9',
  church: '#6366f1',
  castle: '#92400e',
  ruins: '#78716c',
  archaeological_site: '#a16207',
  artwork: '#db2777',
  attraction: '#16a34a',
  utilita: '#0284c7', // light blue
  famiglie: '#10b981', // emerald
  esperienze_locali: '#f59e0b', // amber
  locali: '#e11d48', // rose
  eventi: '#8b5cf6', // violet
  gemme: '#0f766e', // teal
  monumenti: '#b45309',
  musei: '#8b5cf6',
  chiese: '#6366f1',
  panorami: '#0ea5e9',
  natura: '#16a34a',
  beach: '#06b6d4',
  bay: '#0ea5e9',
  lake: '#0284c7',
  island: '#14b8a6',
  waterfall: '#0891b2',
  spring: '#0d9488',
  cave: '#4b5563',
  peak: '#64748b',
  cliff: '#78716c',
  glacier: '#38bdf8',
  volcano: '#dc2626',
  nature_reserve: '#15803d',
  lighthouse: '#0369a1',
  aerialway: '#0284c7',
  winery: '#7f1d1d',
  square: '#a16207', bridge: '#78716c', fountain: '#0891b2', theatre: '#9d174d',
  opera_house: '#831843', palace: '#92400e', tower: '#78350f', skyscraper: '#475569',
  cemetery: '#44403c', library: '#6d28d9', windmill: '#a16207', aqueduct: '#57534e',
  observatory: '#1e40af', stadium: '#166534', monastery: '#4338ca',
  art_museum: '#7c3aed', natural_history_museum: '#7c3aed',
  trail: '#65a30d', scenic_road: '#84cc16', tree: '#15803d', desert: '#d97706',
  forest: '#166534', garden: '#22c55e', aquarium: '#0e7490', water_park: '#06b6d4',
  birthplace: '#b45309', house_museum: '#a16207', necropolis: '#57534e',
  catacomb: '#44403c', fortress: '#78350f', city_walls: '#78716c',
  villa: '#92400e', harbour: '#0369a1', mine: '#57534e', chimney: '#7c2d12',
  funicular: '#0284c7', amphitheatre: '#a16207', roman_baths: '#0d9488',
  triumphal_arch: '#92400e', obelisk: '#78350f', mausoleum: '#57534e',
  abbey: '#4338ca', synagogue: '#4338ca', mosque: '#4338ca', temple: '#4338ca',
  botanical_garden: '#22c55e', market_hall: '#a16207', train_station: '#475569',
  dam: '#0891b2', watermill: '#0d9488', prison: '#44403c', museum_ship: '#0369a1',
  archaeological_park: '#a16207', geopark: '#65a30d', memorial: '#64748b',
  sculpture: '#be185d', university: '#6d28d9', town_hall: '#92400e',
  via_ferrata: '#65a30d', shrine: '#4338ca', roman_theatre: '#9d174d',
  roman_circus: '#a16207', roman_villa: '#92400e', domus: '#a16207',
  city_gate: '#78350f', coastal_tower: '#78350f', stronghold: '#78350f',
  quarry: '#78716c', saltworks: '#0891b2', racetrack: '#1e40af',
  racecourse: '#166534', ski_resort: '#38bdf8', ski_jump: '#38bdf8',
  war_cemetery: '#44403c', concentration_camp: '#44403c', rack_railway: '#0284c7',
  pier: '#0369a1', shipyard: '#0369a1', art_gallery: '#7c3aed', archive: '#6d28d9',
  radio_telescope: '#1e40af', hydro_plant: '#0891b2', cathedral: '#4338ca',
  basilica: '#4338ca', baptistery: '#4338ca', bell_tower: '#4338ca',
  cloister: '#4338ca', crypt: '#44403c',
  // Verticali tematici: un colore per verticale, scelto perché nessuno di
  // questi pin si confonda con i marroni del patrimonio culturale.
  tematiche: '#4f46e5',
  terme: '#0ea5e9',
  cinema: '#7c3aed',
  cieli: '#312e81',
  street_art: '#ec4899',
  mercati: '#f59e0b',
  fioriture: '#f472b6',
  memoria: '#57534e',
  lento: '#16a34a',
};

/** Emoji per categoria (popup/scheda). */
export const CATEGORY_EMOJI: Record<PoiCategory, string> = {
  enogastronomia: '🍷',
  museum: '🏛️',
  monument: '🗿',
  viewpoint: '🌄',
  church: '⛪',
  castle: '🏰',
  ruins: '🏚️',
  archaeological_site: '⚱️',
  artwork: '🎨',
  attraction: '📍',
  utilita: '🏥',
  famiglie: '🎡',
  esperienze_locali: '🍷',
  locali: '🍝',
  eventi: '🎭',
  gemme: '💎',
  monumenti: '🗿',
  musei: '🏛️',
  chiese: '⛪',
  panorami: '🌄',
  natura: '🌿',
  beach: '🏖️',
  bay: '🌊',
  lake: '🏞️',
  island: '🏝️',
  waterfall: '💧',
  spring: '♨️',
  cave: '🕳️',
  peak: '⛰️',
  cliff: '🧗',
  glacier: '🏔️',
  volcano: '🌋',
  nature_reserve: '🌳',
  lighthouse: '🗼',
  aerialway: '🚡',
  winery: '🍷',
  square: '🏙️', bridge: '🌉', fountain: '⛲', theatre: '🎭', opera_house: '🎼',
  palace: '👑', tower: '🗼', skyscraper: '🏙️', cemetery: '⚰️', library: '📚',
  windmill: '🌾', aqueduct: '🏛️', observatory: '🔭', stadium: '🏟️', monastery: '🕍',
  art_museum: '🎨', natural_history_museum: '🦕',
  trail: '🥾', scenic_road: '🛣️', tree: '🌳', desert: '🏜️', forest: '🌲',
  garden: '🌺', aquarium: '🐠', water_park: '🎢',
  birthplace: '🏠', house_museum: '🏡', necropolis: '⚱️', catacomb: '🕯️',
  fortress: '🏰', city_walls: '🧱', villa: '🏛️', harbour: '⚓', mine: '⛏️',
  chimney: '🏭', funicular: '🚞', amphitheatre: '🏟️', roman_baths: '♨️',
  triumphal_arch: '🏛️', obelisk: '🗿', mausoleum: '⚱️', abbey: '⛪',
  synagogue: '🕍', mosque: '🕌', temple: '🛕', botanical_garden: '🌿',
  market_hall: '🏪', train_station: '🚂', dam: '🌊', watermill: '💧',
  prison: '🔒', museum_ship: '🚢', archaeological_park: '🏺', geopark: '🪨',
  memorial: '🕊️', sculpture: '🗿', university: '🎓', town_hall: '🏛️',
  via_ferrata: '🧗', shrine: '⛪', roman_theatre: '🎭', roman_circus: '🏟️',
  roman_villa: '🏛️', domus: '🏺', city_gate: '🚪', coastal_tower: '🗼',
  stronghold: '🏰', quarry: '⛰️', saltworks: '🧂', racetrack: '🏎️',
  racecourse: '🐎', ski_resort: '⛷️', ski_jump: '🎿', war_cemetery: '🕊️',
  concentration_camp: '🕯️', rack_railway: '🚞', pier: '⚓', shipyard: '🚢',
  art_gallery: '🖼️', archive: '📜', radio_telescope: '📡', hydro_plant: '⚡',
  cathedral: '⛪', basilica: '⛪', baptistery: '⛪', bell_tower: '🔔',
  cloister: '🏛️', crypt: '🕯️',
  // Verticali tematici (21/08/2026).
  tematiche: '🧭',
  terme: '🛁',
  cinema: '🎬',
  cieli: '🌌',
  street_art: '🎨',
  mercati: '🛍️',
  fioriture: '🌸',
  memoria: '🕯️',
  lento: '🚂',
};
