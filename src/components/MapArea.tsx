import {
  useState,
  useRef,
  useEffect,
  FormEvent,
  useCallback,
  useMemo,
  ReactNode,
  Fragment,
  memo,
} from "react";
import { getApiUrl } from "../lib/api";
import {
  CATEGORY_COLORS,
  CATEGORY_EMOJIS,
  CATEGORY_HEX,
  SUB_CATEGORY_EMOJIS,
} from "../lib/mapConstants";
import {
  MapContainer,
  Marker,
  useMap,
  ZoomControl,
  useMapEvents,
  Popup,
  LayerGroup,
  Polyline,
  CircleMarker,
  Tooltip,
} from "react-leaflet";
import L from "leaflet";
import { createCachedTileLayer } from "../lib/offlineTiles";
import MarkerClusterGroup from "react-leaflet-cluster";
import { Search, Crosshair, Loader2, Info, Layers, X, MapPin, Headphones, WifiOff, ChevronDown } from "lucide-react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";

import { setCachedPoiDetails, getCachedPoiDetails, getCachedCityName } from "../lib/poiCache";
import { fetchCityNameQueued } from "../lib/nominatimQueue";
import { gygSearchUrl, viatorSearchUrl, tiqetsHomeUrl, trackAffiliateClick } from "../lib/affiliates";
import { supabase } from "../lib/supabase";
import { Language, getTranslation } from "../lib/i18n";
import { puntoArrivo } from "../lib/puntoArrivo";
import { logApiCall } from "../lib/apiLogger";
import { locationService } from "../services/locationService";
import { haversineMeters } from "../lib/geo";
import { supabaseCircuitBreaker } from "../lib/circuitBreaker";
import { fetchServicesAround, SERVICE_EMOJI, SERVICE_LABEL } from "../lib/servicesLayer";
import { markVisited, getVisitedCells, cityCoveragePercent, FOG_CELL_DEG } from "../lib/visitedFog";
import { startZtlWatch, stopZtlWatch, fetchZtlZonesAround } from "../lib/ztlAlert";
import { tasteRoutesInBounds, TASTE_KIND_LABELS } from "../lib/wineRoutesCatalog";
import { ENO_PRODUTTORI, ENO_BOTTEGHE, TEMATICI_KEYS, ENO_SUB_BY_TYPE, MERCATI_TYPES } from "../lib/poiTaxonomy";
import { fetchRouteLines, drawRouteLines, drawRouteStops, creaGruppoPercorsi, livelloDaZoom, setRouteAttribution, ATTRIB_SENTIERI, ATTRIB_GUSTO } from "../lib/routeLines";
import { TASTE_ROUTE_LINES } from "../lib/tasteRouteLines";
import { decodeSegments } from "../lib/polyline";
import type { ZtlAlertEvent } from "../lib/ztlAlert";
import { fetchDatiSole, livelloUv, consiglioSole } from "../lib/sunIndex";
import type { DatiSole } from "../lib/sunIndex";
import { orariSole, oraBreve, mancaAllOraOro, fusoDelPunto } from "../lib/sunTimes";
import type { OrariSole } from "../lib/sunTimes";
import { fetchBathingSites, aggiungiMisure, BATHING_QUALITY_COLOR } from "../lib/bathingWater";
import { fetchValanghe, VALANGHE_COLORE } from "../lib/valanghe";
import { fetchAreeProtette, COLORE_AREA, schedaNatura2000 } from "../lib/areeProtette";
import { fetchAreeDenominazioni } from "../lib/denominazioniAree";

import type { PoiCategory } from "../types/poi";

import { useNetworkStatus } from "../hooks/useNetworkStatus";
import { db } from "../lib/db";

// Fix for default marker icons in Leaflet
import "leaflet/dist/leaflet.css";
// Clustering marker (react-leaflet-cluster): CSS non più auto-importata dalla
// v3+ della libreria, va inclusa esplicitamente.
import "react-leaflet-cluster/dist/assets/MarkerCluster.css";
import "react-leaflet-cluster/dist/assets/MarkerCluster.Default.css";

import { getInitialMapCenter, saveLastMapCenter, shouldFlyToGpsOnFirstFix } from "../lib/mapStart";
import { vibra } from "./hapticsHelper";

// Non più Carrara per tutti (22/08/2026): la città scelta dall'utente,
// altrimenti l'ultimo centro visto, altrimenti il fallback. Letto una volta
// al caricamento del modulo: la mappa si monta con quel centro.
const INITIAL_CENTER: [number, number] = getInitialMapCenter();

/**
 * Marker emoji dei layer tematici (sentieri, ciclabili, neve, gusto…) in un
 * cerchio bianco di almeno 28 px (UX-14): prima erano emoji nude da 14-22 px,
 * illeggibili sulle tile scure e sotto la soglia di tocco. Stesso stile dei
 * marker dei servizi (fontanelle/bagni). `iconAnchor` = metà lato.
 */
const MARKER_CERCHIO_PX = 28;
function cerchioMarker(inner: string, size = MARKER_CERCHIO_PX, fontSize = 15, innerStyle = ''): string {
  return `<div style="width:${size}px;height:${size}px;border-radius:50%;background:#fff;border:1.5px solid rgba(0,0,0,.15);box-shadow:0 1px 3px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;font-size:${fontSize}px;line-height:1;"><span style="${innerStyle}">${inner}</span></div>`;
}
function cerchioMarkerOpts(size = MARKER_CERCHIO_PX): { iconSize: [number, number]; iconAnchor: [number, number]; popupAnchor: [number, number] } {
  const half = Math.round(size / 2);
  return { iconSize: [size, size], iconAnchor: [half, half], popupAnchor: [0, -(half + 2)] };
}

// "TUTTO NEL RAGGIO" (28/08/2026): le fonti descrivono la stessa categoria
// con chiavi diverse — OSM/utility in inglese ("church", "viewpoint",
// "museum"), shared_pois in italiano ("chiese", "panorami", "musei") — e il
// pannello mostrava "Chiese" E "Church" come due gruppi. Qui ogni chiave
// grezza torna alla chiave delle chip, che ha già emoji, colore e traduzione
// in sette lingue. Le famiglie della natura confluiscono in `natura`,
// castelli e archeologia in `monumenti`, come nei filtri dell'audioguida
// (guideSettings.isCategoryAllowed).
const EVERYTHING_CANON: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  const add = (canon: string, keys: string[]) => keys.forEach((k) => { m[k] = canon; });
  add('chiese', ['church', 'chiesa', 'place_of_worship', 'cathedral', 'cattedrale', 'chapel', 'cappella',
    'basilica', 'monastery', 'monastero', 'abbey', 'abbazia', 'shrine', 'santuario', 'baptistery',
    'bell_tower', 'cloister', 'crypt', 'synagogue', 'mosque', 'temple', 'religione']);
  add('monumenti', ['monument', 'monumento', 'artwork', 'attraction', 'square', 'piazza', 'bridge', 'ponte',
    'fountain', 'fontana', 'theatre', 'teatro', 'opera_house', 'palace', 'palazzo', 'tower', 'torre',
    'skyscraper', 'cemetery', 'library', 'windmill', 'aqueduct', 'observatory', 'stadium', 'memorial',
    'sculpture', 'university', 'town_hall', 'city_gate', 'city_walls', 'villa', 'amphitheatre',
    'mausoleum', 'obelisk', 'triumphal_arch', 'archaeological_park', 'archaeological_site', 'ruins',
    'archeo', 'castle', 'castello', 'castelli', 'fortress', 'stronghold', 'harbour', 'pier', 'mine', 'quarry']);
  // Famiglie: parchi, zoo, acquari e le montagne russe importate il 28/08
  add('famiglie', ['theme_park', 'parco_divertimenti', 'zoo', 'aquarium', 'acquario', 'water_park', 'playground', 'parco_giochi', 'roller_coaster']);
  add('musei', ['museum', 'museo', 'gallery', 'art_museum', 'art_gallery', 'natural_history_museum',
    'house_museum']);
  add('panorami', ['viewpoint', 'panorama', 'belvedere', 'lighthouse', 'faro', 'scenic_road', 'aerialway',
    'trail', 'sentiero', 'hiking', 'via_ferrata', 'ski_resort']);
  add('natura', ['beach', 'spiaggia', 'spiagge', 'bay', 'baia', 'island', 'isola', 'cliff', 'coast', 'dune',
    'peak', 'vetta', 'vette', 'volcano', 'glacier', 'mountain_pass', 'waterfall', 'cascata', 'cascate',
    'spring', 'hot_spring', 'lake', 'lago', 'laghi', 'river', 'fiume', 'gorge', 'canyon', 'cave', 'grotta',
    'grotte', 'park', 'parco', 'parchi', 'garden', 'giardino', 'botanical_garden', 'nature_reserve',
    'riserva', 'forest', 'wood', 'bosco', 'national_park', 'acque', 'nature', 'natural']);
  add('localita', ['city', 'town', 'village', 'hamlet', 'borgo', 'locality', 'località']);
  add('enogastronomia', ['winery', 'cantina', 'vineyard', 'vigneto', 'brewery', 'birrificio', 'distillery',
    'distilleria', 'frantoio', 'caseificio', 'enoteca']);
  return m;
})();
function everythingCanonKey(raw: string): string {
  const k = String(raw || '').toLowerCase().trim();
  return EVERYTHING_CANON[k] || k;
}

/**
 * GRUPPO DI UNA RIGA DI "TUTTO NEL RAGGIO" (29/08/2026): gli stessi gruppi
 * delle chip, decisi dalla stessa tassonomia (`resolvePoiTaxonomy`), non da
 * una mappa locale. Prima Carrara a 5 km dava 50 gruppi, con «formaggi»,
 * «pasticceria» e «cantina» separati da «Vino e Gusto» e «marketplace» fra
 * le utilità. Regola del committente: pochi gruppi, quelli delle chip,
 * mercati sotto Mercatini, gemme per prime.
 * Le fonti che non sono POI (neve, fontanelle, beni vincolati, percorsi)
 * hanno il loro gruppo fisso.
 */
const EVERYTHING_ORDER = [
  'gemme', 'monumenti', 'chiese', 'musei', 'panorami', 'natura', 'localita', 'enogastronomia',
  'famiglie', 'locali', 'mercati', 'terme', 'cinema', 'cieli', 'street_art', 'fioriture', 'memoria', 'lento',
  'shopping', 'lusso', 'beni_culturali', 'community', 'neve', 'fontanelle', 'percorsi', 'utilita', 'altro',
];
function everythingGroupOf(row: { category: string; sub_category: string | null; fonte: string; group_key: string; is_gem?: boolean }): string {
  if (row.is_gem === true || row.group_key === 'gemme') return 'gemme';
  const raw = String(row.category || '').toLowerCase().trim();
  const sub = String(row.sub_category || '').toLowerCase().trim();
  if (row.fonte === 'route_geometries' || row.group_key.startsWith('percorsi_')) return 'percorsi';
  if (row.fonte === 'beni_culturali') return 'beni_culturali';
  if (row.fonte === 'utility_pois') {
    if (raw === 'neve') return 'neve';
    if (raw === 'fontanelle' || sub === 'drinking_water' || sub === 'fontanella') return 'fontanelle';
    return 'utilita';
  }
  // Vino e Gusto: sia le righe con category='enogastronomia' sia quelle
  // vecchie col tipo direttamente in category (cantina, formaggi, pasticceria…)
  if (raw === 'enogastronomia' || raw in ENO_SUB_BY_TYPE || ENO_PRODUTTORI.includes(raw) || ENO_BOTTEGHE.includes(raw)) return 'enogastronomia';
  if (MERCATI_TYPES.includes(raw)) return 'mercati';
  if (raw === 'shopping' || raw === 'lusso') return raw;
  const t = resolvePoiTaxonomy({ category: raw, subCategory: sub });
  if (t.macro === 'tematiche') return t.subId || 'altro';
  if (t.macro === 'monumenti') return t.subId === 'chiese' || t.subId === 'musei' || t.subId === 'panorami' ? t.subId : 'monumenti';
  if (t.macro) return t.macro;
  return everythingCanonKey(raw) in EVERYTHING_LABEL_KEY ? everythingCanonKey(raw) : 'altro';
}
/** Chiavi canoniche che hanno una voce in i18n (le stesse delle chip). */
const EVERYTHING_LABEL_KEY: Record<string, string> = {
  monumenti: 'monumenti', chiese: 'chiese', musei: 'musei', panorami: 'panorami', natura: 'natura',
  gemme: 'gemme', localita: 'localita', utilita: 'utilita', enogastronomia: 'enogastronomia',
  beni_culturali: 'beni_culturali', famiglie: 'famiglie', locali: 'locali', community: 'community',
  // Verticali tematici e i due nuovi del 28/08: la chiave è già quella i18n
  terme: 'terme', cinema: 'cinema', cieli: 'cieli', street_art: 'street_art', mercati: 'mercati',
  fioriture: 'fioriture', memoria: 'memoria', lento: 'lento', shopping: 'shopping', lusso: 'lusso',
  percorsi: 'everything_group_percorsi', altro: 'everything_group_altro',
};

const CATEGORY_BORDER_COLORS: Record<string, string> = {
  gemme: "border-t-[#0f766e]",
  monumenti: "border-t-[#92400e]",
  chiese: "border-t-[#4338ca]",
  musei: "border-t-[#7c3aed]",
  panorami: "border-t-[#0369a1]",
  locali: "border-t-[#e11d48]",
  utilita: "border-t-[#1e1b4b]",
  famiglie: "border-t-[#b45309]",
  esperienze_locali: "border-t-[#ea580c]",
  eventi: "border-t-[#7e22ce]"
};

const LAYER_QUERIES: Record<string, (bbox: string, around?: string) => string> = {
  all: (bbox) => {
    const [south, west, north, east] = bbox.split(",");
    return `
      [out:json][timeout:40];
      (
        nwr["tourism"~"^(museum|gallery|viewpoint|artwork|attraction|theme_park|zoo|winery)$"](${south},${west},${north},${east});
        nwr["historic"](${south},${west},${north},${east});
        nwr["amenity"="place_of_worship"](${south},${west},${north},${east});
        nwr["amenity"~"^(restaurant|cafe|bar|pub|pharmacy|drinking_water|hospital|toilets|marketplace)$"](${south},${west},${north},${east});
        nwr["leisure"~"^(park|playground)$"](${south},${west},${north},${east});
        nwr["place"="square"](${south},${west},${north},${east});
        nwr["highway"="pedestrian"]["area"="yes"](${south},${west},${north},${east});
        nwr["railway"="station"](${south},${west},${north},${east});
        nwr["craft"](${south},${west},${north},${east});
        nwr["shop"="bakery"](${south},${west},${north},${east});
      );
      out center tags;
    `;
  },
  monumenti: (bbox) => `
    nwr["historic"~"^(monument|castle|ruins|archaeological_site|city_gate|fort|fortress|tower|memorial|milestone|manor|wayside_cross|boundary_stone|tomb|rune_stone|building)$"](${bbox});
    nwr["tourism"="attraction"](${bbox});
    nwr["place"="square"](${bbox});
    nwr["highway"="pedestrian"]["area"="yes"](${bbox});
    nwr["heritage"](${bbox});
    nwr["historic"="monument"](${bbox});
    nwr["historic"="ruins"](${bbox});
    nwr["historic"="archaeological_site"](${bbox});
    nwr["historic"="castle"](${bbox});
  `,
  musei: (bbox) => `
    nwr["tourism"~"^(museum|gallery)$"](${bbox});
  `,
  gemme: (bbox) => `
    nwr["tourism"~"^(artwork|viewpoint|museum|gallery|attraction)$"](${bbox});
    nwr["historic"~"^(monument|castle|ruins|archaeological_site|city_gate|fort|fortress|tower|memorial|tomb|building)$"](${bbox});
    nwr["natural"="peak"](${bbox});
    nwr["historic"="archaeological_site"](${bbox});
    nwr["historic"="ruins"](${bbox});
    nwr["historic"="castle"](${bbox});
    nwr["tourism"="attraction"]["wikidata"](${bbox});
    nwr["tourism"="attraction"]["wikipedia"](${bbox});
  `,
  chiese: (bbox) => `
    nwr["amenity"="place_of_worship"](${bbox});
    nwr["building"~"church|cathedral|chapel|basilica|mosque|temple|synagogue"](${bbox});
    nwr["historic"~"church|monastery|abbey|convent|monastery"](${bbox});
  `,
  panorami: (bbox) => `
    nwr["tourism"="viewpoint"](${bbox});
    nwr["natural"="peak"](${bbox});
    nwr["landuse"="quarry"]["wikidata"](${bbox});
    nwr["landuse"="quarry"]["wikipedia"](${bbox});
  `,
  locali: (bbox) => `
    nwr["amenity"~"restaurant|cafe|fast_food|bar|pub|ice_cream"](${bbox});
  `,
  utilita: (bbox) => `
    nwr["amenity"="taxi"](${bbox});
    nwr["railway"="station"]["name"](${bbox});
    nwr["barrier"="toll_booth"](${bbox});
    nwr["amenity"~"hospital|pharmacy|police|post_office|drinking_water"](${bbox});
    nwr["railway"="subway_entrance"](${bbox});
    nwr["amenity"="marketplace"](${bbox});
  `,
  famiglie: (bbox) => `
    nwr["leisure"="playground"](${bbox});
    nwr["tourism"~"theme_park|aquarium|zoo"](${bbox});
  `,
};

export const getSubCategoryEmoji = (subCat?: string) => {
  if (!subCat) return "";
  const normalized = subCat.toLowerCase().replace(/\s+/g, "_").replace(/[èé]/g, "e").replace(/à/g, "a").replace(/ì/g, "i").replace(/ò/g, "o").replace(/ù/g, "u");
  return SUB_CATEGORY_EMOJIS[normalized] || SUB_CATEGORY_EMOJIS[subCat] || "";
};

interface Poi {
  id: number | string;
  lat: number;
  lon: number;
  name?: string;
  category: string;
  amenity?: string;
  originalCategory?: string;
  subCategory?: string;
  types?: string[];
  baseCategory?: string;
  isFromDb?: boolean;
  image_url?: string | null;
  description?: string | null;
  description_short?: string | null;
  description_long?: string | null;
  photo_url?: string | null;
  status?: string | null;
  is_gem?: boolean | null;
}

export const getCategory = (tags: any) => {
  if (tags.tourism === "museum" || tags.tourism === "gallery") return "musei";
  if (tags.tourism === "viewpoint") return "panorami";
  // Luoghi di culto — include tutte le religioni
  if (
    tags.historic === "church" || tags.amenity === "place_of_worship" ||
    tags.building === "church" || tags.building === "cathedral" || tags.building === "mosque" ||
    tags.building === "temple" || tags.building === "synagogue" ||
    tags.historic === "monastery" || tags.historic === "abbey"
  ) return "chiese";
  // Siti storici e architettonici → tutti in 'monumenti'
  if (
    tags.historic === "monument" || tags.historic === "ruins" || tags.historic === "castle" ||
    tags.historic === "archaeological_site" || tags.historic === "fort" || tags.historic === "fortress" ||
    tags.historic === "tower" || tags.historic === "city_gate" || tags.historic === "memorial" ||
    tags.historic === "tomb" || tags.historic === "milestone" || tags.historic === "manor" ||
    tags.historic === "building" || tags.historic === "rune_stone" || tags.historic === "boundary_stone"
  ) return "monumenti";
  if (tags.amenity === "restaurant" || tags.amenity === "cafe" || tags.amenity === "bar" || tags.amenity === "pub") return "locali";
  if (tags.amenity === "pharmacy" || tags.amenity === "drinking_water" || tags.amenity === "hospital" || tags.amenity === "toilets" || tags.railway === "station" || tags.highway === "motorway_junction" || tags.amenity === "marketplace") return "utilita";
  if (tags.leisure === "park" || tags.leisure === "playground" || tags.tourism === "theme_park" || tags.tourism === "zoo") return "famiglie";
  if (tags.tourism === "attraction" || tags.tourism === "artwork") return "gemme";
  return "monumenti"; // fallback
};

export function normalizeSubCategory(subCat: string): string {
  if (!subCat) return "Altro";
  const map: Record<string, string> = {
    "place_of_worship": "Luogo di Culto",
    "fast_food": "Fast Food",
    "ice_cream": "Gelateria",
    "ice_cream_shop": "Gelateria",
    "theme_park": "Parco a Tema",
    "toll_booth": "Casello Autostradale",
    "motorway_junction": "Casello Autostradale",
    "subway_entrance": "Fermata Metro",
    "drinking_water": "Fontanella",
    "pharmacy": "Farmacia",
    "hospital": "Ospedale",
    "police": "Polizia",
    "taxi": "Taxi",
    "post_office": "Ufficio Postale",
    "station": "Stazione",
    "railway": "Stazione",
    "bakery": "Panetteria",
    "winery": "Cantina / Enoteca",
    "marketplace": "Mercato Locale",
    "craft": "Bottega Artigiana",
    "cheese": "Gastronomia",
    "museum": "Museo",
    "viewpoint": "Punto Panoramico",
    "church": "Chiesa",
    "monument": "Monumento",
    "castle": "Castello",
    "ruins": "Rovine",
    "archaeological_site": "Sito Archeologico",
    "artwork": "Opera d'Arte",
    "attraction": "Attrazione Turistica",
    "restaurant": "Ristorante",
    "cafe": "Bar Caffè",
    "bar": "Bar",
    "pub": "Pub",
    "playground": "Parco Giochi",
    "aquarium": "Acquario",
    "zoo": "Zoo"
  };
  return map[subCat.toLowerCase()] || subCat.charAt(0).toUpperCase() + subCat.slice(1).replace(/_/g, ' ');
}

// La tassonomia dei POI (macro-categoria, sotto-categoria e regola ferrea del
// filtro) vive in src/lib/poiTaxonomy.ts: e' logica pura e li' e' testabile,
// mentre questo componente non e' importabile fuori dal browser.
import {
  subCategoryToFilterId,
  SUBS_BY_MACRO,
  resolvePoiTaxonomy,
  matchesSubByHeuristics,
  passesCategoryRule,
  isTematico,
  chiaveTematica,
  NATURA_DB_CATEGORIES,
  CHIESE_TYPES,
  MUSEI_TYPES,
  PANORAMI_TYPES,
  MONUMENTI_TYPES,
  LOCALI_TYPES,
  FAMIGLIE_TYPES,
  UTILITA_TYPES,
} from "../lib/poiTaxonomy";

// Ri-esportata: altri componenti la importano storicamente da qui.
export { subCategoryToFilterId };

// Cache di sessione per le coordinate TripAdvisor: la search non le
// restituisce (servono i /details, che consumano quota API) — ogni locale
// viene risolto una sola volta per sessione.
const tripCoordsCache = new Map<string, { lat: number; lon: number } | null>();

export function getSubCategory(tags: any): string {
  let sub = getCategory(tags);
  if (tags.amenity) sub = tags.amenity;
  else if (tags.leisure) sub = tags.leisure;
  else if (tags.craft) sub = tags.craft;
  else if (tags.shop) sub = tags.shop;
  else if (tags.railway) sub = tags.railway;
  else if (tags.highway) sub = tags.highway;
  else if (tags.tourism) sub = tags.tourism;
  else if (tags.historic) sub = tags.historic;
  
  return normalizeSubCategory(sub);
};

export function isGenericUtilityName(name?: string | null): boolean {
  if (!name || name.trim() === "") return true;
  const lower = name.trim().toLowerCase();
  
  const genericWords = [
    "parcheggio", "parco", "giardino", "giardinetti", "giardinetto", "villa",
    "parking", "park", "garden", "playground", "posteggio", "sosta", "stazionamento",
    "luogo d'interesse", "luogo d interesse", "area camper", "area sosta", "area di sosta", "sito", "punto",
    // Placeholder generici del vecchio import CSV/OSM (nessun contenuto): vanno nascosti
    "punto di interesse", "punto d'interesse", "punto d interesse",
    "luogo di interesse", "point of interest", "points of interest"
  ];

  if (genericWords.includes(lower)) return true;

  const genericRegex = /^(parcheggio|parco|giardino|giardini|giardinetto|giardinetti|parking|park|garden|area verde|area di sosta|area sosta|posteggio|sosta)\b/i;
  
  if (genericRegex.test(lower)) {
    const genericDescriptors = [
      "pubblico", "pubblici", "comunale", "comunali", "gratuito", "gratuiti", "pagamento", "privato", "privati",
      "riservato", "riservati", "clienti", "coperto", "scoperto", "cittadino", "cittadini", "auto", "camper",
      "moto", "disabili", "residenti", "gratis", "free", "public", "private", "custodito", "interrato", "multipiano"
    ];
    
    const words = lower.split(/\s+/);
    if (words.length <= 4) {
      const isAllGeneric = words.slice(1).every(w => genericDescriptors.includes(w) || w === "a" || w === "di" || w === "per" || w === "e");
      if (isAllGeneric) {
        return true;
      }
    }
  }

  return false;
}

export function isAccessible(poi: Poi): boolean {
  // Solo segnali REALI: il tag OSM wheelchair (yes/limited/designated) o un
  // nome parlante. Prima ~33% dei POI risultava accessibile da un hash
  // dell'id → disinformazione sull'accessibilità (badge ♿, filtro "No
  // Barriere", popup). Nel dubbio: nessun claim.
  const wc = String((poi as any).wheelchair || (poi as any).accessible || "").toLowerCase();
  if (wc === "yes" || wc === "limited" || wc === "designated" || wc === "true") return true;
  if (!poi.name) return false;
  const nameLower = poi.name.toLowerCase();
  if (nameLower.includes("accessib") || nameLower.includes("disabil") || nameLower.includes("wheelchair") || nameLower.includes("scivolo") || nameLower.includes("rampa") || nameLower.includes("carrozzin")) return true;
  return false;
}

/**
 * Sfondo mappa. Sostituisce il <TileLayer> di react-leaflet con il layer di
 * `offlineTiles`, che legge le tile dalla Cache API senza passare dal service
 * worker: su iOS (WebView su `capacitor://localhost`) il SW non si registra
 * nemmeno, quindi le tile scaricate per l'offline non si vedevano MAI.
 * L'URL richiesto resta identico a prima (stesso template, stessi subdomain
 * 'abc', stesso '@2x'), altrimenti non colpirebbe la cache già scaricata.
 */
function CachedTiles({ url, attribution }: { url: string; attribution: string }) {
  const map = useMap();
  useEffect(() => {
    const { layer, dispose } = createCachedTileLayer(url, { attribution });
    layer.addTo(map);
    return () => {
      map.removeLayer(layer);
      dispose();
    };
  }, [map, url, attribution]);
  return null;
}

function MapController({
  center,
  zoom,
}: {
  center: [number, number];
  zoom?: number;
}) {
  const map = useMap();
  useEffect(() => {
    let isMounted = true;
    if (center && center.length >= 2) {
      const lat = typeof center[0] === "number" ? center[0] : parseFloat(center[0]);
      const lng = typeof center[1] === "number" ? center[1] : parseFloat(center[1]);
      let targetZoom =
        typeof zoom === "number" && Number.isFinite(zoom) && !isNaN(zoom)
          ? zoom
          : map.getZoom();
      if (!Number.isFinite(targetZoom)) targetZoom = 13;

      if (Number.isFinite(lat) && Number.isFinite(lng) && !isNaN(lat) && !isNaN(lng)) {
        try {
          if (map) {
            const currentCenter = map.getCenter();
            if (
               Math.abs(currentCenter.lat - lat) > 0.0001 ||
               Math.abs(currentCenter.lng - lng) > 0.0001
            ) {
               map.flyTo([lat, lng], targetZoom, { duration: 1.5 });
            }
          }
        } catch (e) {
          try {
            if (map) map.setView([lat, lng], targetZoom);
          } catch(e2) {}
          console.error(
            "Leaflet flyTo error:",
            e,
            "center:",
            center,
            "zoom:",
            targetZoom,
          );
        }
      } else {
        console.warn("MapController received invalid center:", center);
      }
    }
    return () => {
      isMounted = false;
      // Stop ongoing animations on unmount to prevent errors
      try {
        if (map) map.stop();
      } catch (e) {
        // ignore errors during cleanup
      }
    };
  }, [center, zoom, map]);
  return null;
}

/** Sotto questa distanza, in follow-me, un `moveend` è solo il GPS che
 *  respira: non vale un salvataggio, un evento né una geocodifica. */
const FOLLOW_MOVEEND_SOGLIA_M = 100;
/** Debounce di salvataggio centro + evento `wip-map-center-change`. */
const MOVEEND_DEBOUNCE_MS = 2000;

function MapEventsHandler({
  onMoveEnd,
  onCenterChange,
  onDragStart,
  isFollowing,
}: {
  onMoveEnd: (bounds: L.LatLngBounds) => void;
  onCenterChange?: (center: [number, number]) => void;
  onDragStart?: () => void;
  /** Follow-me attivo? Letto a ogni moveend (ref del genitore), mai in deps. */
  isFollowing?: () => boolean;
}) {
  const onMoveEndRef = useRef(onMoveEnd);
  const onCenterChangeRef = useRef(onCenterChange);
  const onDragStartRef = useRef(onDragStart);
  const isFollowingRef = useRef(isFollowing);
  // MAP-12: in follow-me `panTo` a ogni fix GPS produceva un moveend ogni
  // 1-5 s, e ognuno scriveva localStorage, dispatchava l'evento (che fa
  // ripartire le ricerche esterne) e accodava una geocodifica. Si tiene
  // l'ultimo centro "contabilizzato" e un timer di debounce.
  const ultimoCentroRef = useRef<L.LatLng | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    onMoveEndRef.current = onMoveEnd;
    onCenterChangeRef.current = onCenterChange;
    onDragStartRef.current = onDragStart;
    isFollowingRef.current = isFollowing;
  }, [onMoveEnd, onCenterChange, onDragStart, isFollowing]);

  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  const map = useMapEvents({
    dragstart: () => {
      onDragStartRef.current?.();
    },
    moveend: () => {
      try {
        if (!map) return;
        const bounds = map.getBounds();
        if (
          bounds &&
          typeof bounds.isValid === "function" &&
          bounds.isValid()
        ) {
          onMoveEndRef.current(bounds);

          const center = map.getCenter();
          if (onCenterChangeRef.current) {
            onCenterChangeRef.current([center.lat, center.lng]);
          }

          // Follow-me: spostamento piccolo dal centro già contabilizzato ⇒
          // nessuna delle tre azioni qui sotto.
          const seguendo = !!isFollowingRef.current?.();
          const prev = ultimoCentroRef.current;
          if (seguendo && prev && map.distance(prev, center) < FOLLOW_MOVEEND_SOGLIA_M) return;

          // Ancoraggio geografico delle ricerche esterne (Viator, GetYourGuide,
          // Virgilio, Ticketmaster): il riferimento è ciò che l'utente sta
          // guardando, non dove si trova fisicamente. Il raggio è quello del
          // riquadro visibile, così ricerca e mappa coincidono.
          const ne = bounds.getNorthEast();
          const radiusKm = Math.max(
            1,
            Math.round(map.distance(center, ne) / 1000),
          );

          if (debounceRef.current) clearTimeout(debounceRef.current);
          debounceRef.current = setTimeout(() => {
            debounceRef.current = null;
            ultimoCentroRef.current = center;
            // «Dove ero l'ultima volta»: l'ultimo centro visto riapre la mappa
            // al prossimo avvio (lib/mapStart.ts).
            saveLastMapCenter(center.lat, center.lng);
            window.dispatchEvent(new CustomEvent('wip-map-center-change', {
              detail: { lat: center.lat, lon: center.lng, radiusKm },
            }));
          }, MOVEEND_DEBOUNCE_MS);

          // Pre-cache del nome città per il nuovo centro. La coda globale
          // serializza a 1 req/1.2s, deduplica per cella e rispetta la
          // policy Nominatim anche con pan ripetuti.
          fetchCityNameQueued(center.lat, center.lng).catch(() => {});
        }
      } catch (e) {
        console.warn("Leaflet moveend bounds error:", e);
      }
    },
  });

  useEffect(() => {
    if (!map) return;
    const timer = setTimeout(() => {
      try {
        const bounds = map.getBounds();
        if (bounds && typeof bounds.isValid === "function" && bounds.isValid()) {
          onMoveEndRef.current(bounds);
        }
      } catch (e) {
        console.warn("Initial map bounds error:", e);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [map]);

  return null;
}

interface MapAreaProps {
  selectedCategories: string[];
  onSelectPoi: (poi: any, nearbyPois: any[]) => void;
  onCenterChange?: (center: [number, number]) => void;
  subFilter?: string[];
  onSetSubFilter?: (filter: string | null) => void;
  language: Language;
  activeTab?: string;
  isRadarMode?: boolean;
  radarPois?: any[];
}

// Haversine formula
export const getDistanceFromLatLonInM = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
) => {
  const R = 6371e3; // Radius of the earth in m
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in meters
};


// ── Meteo sulla mappa (MET Norway, via /api/meteo/punto) ─────────────
// La fonte è passata da Open-Meteo a MET Norway il 19/08/2026: il piano
// gratuito di Open-Meteo è esplicitamente non-commerciale e cita le app
// con abbonamenti, mentre MET è gratuita anche per uso commerciale.
// La chiamata NON può partire dal browser perché MET pretende uno
// User-Agent identificabile e `fetch()` non può impostarlo: passa dal
// nostro server, che aggiunge anche una cache condivisa fra utenti.
// Cache 30 min in localStorage per cella di ~11 km (1 decimale): il chip
// non deve costare una richiesta a ogni pan.
interface MeteoData {
  temp: number;      // temperatura attuale °C
  code: number;      // WMO weather_code
  rainProb: number;  // probabilità pioggia max nelle prossime 3 ore (%)
}

const METEO_TTL_MS = 30 * 60 * 1000;

function weatherEmoji(code: number): string {
  if (code === 0) return "☀️";
  if (code === 1 || code === 2) return "🌤️";
  if (code === 3) return "☁️";
  if (code === 45 || code === 48) return "🌫️";
  if (code >= 51 && code <= 57) return "🌦️";
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return "🌧️";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "🌨️";
  if (code >= 95) return "⛈️";
  return "🌡️";
}

async function fetchMeteoCached(lat: number, lon: number): Promise<MeteoData | null> {
  const key = `wip_meteo_${lat.toFixed(1)}_${lon.toFixed(1)}`;
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.ts === "number" && Date.now() - parsed.ts < METEO_TTL_MS && parsed.data) {
        return parsed.data as MeteoData;
      }
    }
  } catch { /* cache corrotta: rifetch */ }

  try {
    // Il server fa da tramite verso MET Norway (che pretende uno User-Agent
    // che il browser non può mandare) e traduce i simboli MET nei codici WMO
    // che questa interfaccia già usa.
    const res = await fetch(getApiUrl(`/api/meteo/punto?lat=${lat.toFixed(3)}&lon=${lon.toFixed(3)}`),
      { signal: AbortSignal.timeout(12000) });
    if (!res.ok) return null;
    const j = await res.json();
    if (typeof j?.temp !== "number") return null;

    const data: MeteoData = {
      temp: j.temp,
      code: typeof j.code === "number" ? j.code : 0,
      rainProb: typeof j.rainProb === "number" ? j.rainProb : 0,
    };
    try { localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data })); } catch { /* quota piena */ }
    return data;
  } catch {
    return null;
  }
}

// Modalità "al coperto": evidenziazione VISIVA temporanea dei POI indoor
// (musei, chiese, gallerie…). Non tocca i filtri persistenti dell'utente
// (wip_active_subcategories): agisce solo sull'opacità dei marker.
function isIndoorPoi(p: Poi): boolean {
  const cat = String(p.baseCategory || p.category || "").toLowerCase();
  if (cat === "musei" || cat === "chiese" || cat === "museum" || cat === "gallery" || cat === "church") return true;
  const sub = String(p.subCategory || "").toLowerCase();
  return sub === "museo" || sub === "chiesa" || sub === "luogo di culto" || sub === "galleria" || sub === "acquario";
}

// Escape minimo per i popup HTML dei marker servizi (nomi da OSM)
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

import PoiPopupContent from "./PoiPopupContent";
import { tourService, MAX_TAPPE } from "../services/tourService";
import { useBozzaGiro, useVistaGiro } from "../lib/tour/useGiro";
import TourRouteLayer from "./TourRouteLayer";
import NavRouteLayer from "./NavRouteLayer";
import PoiRadarPanel from "./PoiRadarPanel";

/** L'atlante dei beni vincolati carica solo da questo zoom (quartiere). */
const BENI_CULTURALI_MIN_ZOOM = 13;

// CARTO ha smesso di servire le tile anonime senza chiave (26/08/2026,
// watermark "API KEY REQUIRED" su tutta la mappa). URL e chiave vivono in
// lib/cartoTiles.ts: se la build non aveva VITE_CARTO_API_KEY (IPA di CI del
// 28/08/2026) la chiave viene chiesta a runtime al server.
import { cartoTileUrl, ensureCartoKey, onCartoKeyChange } from '../lib/cartoTiles';

function MapArea({
  selectedCategories,
  onSelectPoi,
  onCenterChange,
  subFilter,
  onSetSubFilter,
  language,
  activeTab,
  isRadarMode,
  radarPois = [],
}: MapAreaProps) {
  const [center, setCenter] = useState<[number, number]>(INITIAL_CENTER);
  const [mapZoom, setMapZoom] = useState(13);

  // URL delle tile CARTO: se la chiave manca nella build arriva a runtime
  // (vedi lib/cartoTiles.ts) e il layer viene ridisegnato con l'URL buono.
  const [cartoUrl, setCartoUrl] = useState<string>(() => cartoTileUrl());
  useEffect(() => {
    const off = onCartoKeyChange(() => setCartoUrl(cartoTileUrl()));
    ensureCartoKey().then(() => setCartoUrl(cartoTileUrl())).catch(() => {});
    return off;
  }, []);

  // Stato di rete del dispositivo (Capacitor Network + fallback navigator.onLine):
  // pilota il banner offline discreto più sotto.
  const isOnline = useNetworkStatus();

  // Chip partner in home (CategoryChips): apre la ricerca Viator/GetYourGuide
  // (o i biglietti Tiqets) con la zona del centro mappa già compilata e il
  // codice affiliato.
  useEffect(() => {
    const openExperiences = async (e: Event) => {
      const partner = (e as CustomEvent).detail?.partner;
      const map = mapRef.current;
      const c = map ? map.getCenter() : { lat: center[0], lng: center[1] };
      // La finestra va aperta SUBITO, in modo sincrono dentro il gesto utente:
      // dopo l'await il popup blocker del browser la bloccherebbe in silenzio.
      const win = window.open('about:blank', '_blank');
      let city = '';
      try {
        city = await fetchCityNameQueued(c.lat, c.lng);
      } catch { /* senza città si apre la home del partner */ }

      let url: string;
      if (partner === 'tiqets') {
        // Tiqets non ha una pagina di ricerca testuale generica (solo
        // pagine città con slug/ID): si passa dall'API prodotti già usata da
        // PlanScreen/EventsScreen e si apre il primo biglietto della zona,
        // che arriva dal server già affiliato (mai riscritto, vedi fetchTiqetsProducts).
        const lang = (language || 'IT').toLowerCase();
        url = tiqetsHomeUrl(lang);
        try {
          // getApiUrl: su Capacitor un path relativo punta agli asset locali.
          const res = await fetch(getApiUrl('/api/tiqets'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lat: c.lat, lon: c.lng, radius: 30, cityName: city, lang })
          });
          if (res.ok) {
            const products = await res.json();
            const first = Array.isArray(products) ? products.find((p: any) => p?.url) : null;
            if (first?.url) url = first.url;
          }
        } catch { /* fallback alla home Tiqets già impostato in url */ }
      } else {
        url = partner === 'viator' ? viatorSearchUrl(city) : gygSearchUrl(city);
      }

      trackAffiliateClick(url, `Ricerca esperienze ${city || 'zona corrente'}`, city, 'home_chip');
      if (win) {
        win.location.href = url;
      } else {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    };
    window.addEventListener('wip-open-experiences', openExperiences);
    return () => window.removeEventListener('wip-open-experiences', openExperiences);
  }, [language]);

  // NOTA refactoring: qui c'era una seconda pipeline POI "DB-first"
  // (useMapPois + PoiCard) mai renderizzata: il suo risultato era shadowato
  // dal dbPois locale di performFetchPois e il centro restava congelato su
  // INITIAL_CENTER, generando query Supabase/Overpass inutili a ogni mount.
  const [activePopupId, setActivePopupId] = useState<string | null>(null);
  // Oggetto POI del popup condiviso, catturato AL CLICK: risolverlo a ogni
  // render dentro markerData faceva rimontare la scheda (rifetch di foto e
  // descrizione = sfarfallio) ogni volta che un fetch aggiornava la lista.
  const [activePoi, setActivePoi] = useState<Poi | null>(null);

  // Centra la mappa sul POI mettendo il pin poco sotto il centro: la scheda,
  // che si apre verso l'alto, risulta così centrata nella vista.
  const centerMapOnPoi = useCallback((poi: Poi, targetZoom?: number) => {
    const map = mapRef.current;
    if (!map) return;
    const zoom = targetZoom ?? map.getZoom();
    const targetPoint = map.project([poi.lat, poi.lon], zoom);
    const mapSize = map.getSize();
    const newCenterPoint = targetPoint.subtract(L.point(0, mapSize.y * 0.22));
    map.flyTo(map.unproject(newCenterPoint, zoom), zoom, { duration: 0.6 });
  }, []);

  useEffect(() => {
    if (activeTab === "map" && mapRef.current) {
      const timer = setTimeout(() => {
        if (mapRef.current) {
          mapRef.current.invalidateSize();
          // Fetch immediato all'apertura del tab: la mappa era montata
          // nascosta (size 0) e il fetch iniziale girava su bounds nulli —
          // i POI comparivano solo dopo il primo pan col dito.
          try {
            const b = mapRef.current.getBounds();
            if (b && typeof b.isValid === "function" && b.isValid()) {
              performFetchPois(b);
            }
          } catch (e) { /* bounds non pronti: ci pensa il moveend */ }
        }
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [activeTab]);

  const [searchQuery, setSearchQuery] = useState("");
  // La riga di ricerca si APRE sopra la barra (30/08/2026). Prima il campo
  // stava in mezzo ai tasti, con flex-1: su ~360 px i tasti shrink-0 si
  // prendevano tutta la riga e il campo collassava a larghezza ZERO —
  // restava solo la lente, e sembrava un tasto rotto. La barra ora resta
  // una riga sola e la ricerca ha una riga tutta sua, sopra.
  const [ricercaAperta, setRicercaAperta] = useState(false);
  const campoRicercaRef = useRef<HTMLInputElement | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  // Accessibilità ricerca: indice del suggerimento evidenziato (frecce ↑↓)
  // e flag "nessun risultato" per non lasciare l'utente senza feedback.
  const [activeSuggestionIdx, setActiveSuggestionIdx] = useState(-1);
  const [searchNoResults, setSearchNoResults] = useState(false);
  // La tendina si apre verso l'ALTO (bottom-full): invertiamo così il
  // risultato migliore resta adiacente alla casella di ricerca.
  // I NOSTRI risultati (/api/search/poi, 23/08/2026): categorie, POI per nome
  // e percorsi. Arrivano in parallelo a Mapbox e si AGGIUNGONO sotto i
  // luoghi: la gerarchia e' luoghi → categorie → POI → percorsi, e Mapbox non
  // aspetta mai nessuno (la ricerca deve restare immediata).
  const [nostri, setNostri] = useState<any[]>([]);
  const displayedSuggestions = useMemo(() => [...suggestions, ...nostri].reverse(), [suggestions, nostri]);
  useEffect(() => { setActiveSuggestionIdx(-1); }, [suggestions]);
  const [pois, setPois] = useState<Poi[]>([]);
  // --- LOCAL STORAGE CATEGORIES ---
  // Rimosso activeSubcats perché causava bug di stale state rispetto a selectedCategories

  // Ref sempre allineati a pois/radarPois: servono a evitare che il listener
  // 'focus-poi' venga rimosso e ri-registrato a ogni fetch/merge POI durante
  // il pan della mappa (pois cambia in continuazione). L'effetto sotto che
  // registra il listener resta con deps [] e legge i dati aggiornati da qui.
  const poisRef = useRef<Poi[]>(pois);
  const radarPoisRef = useRef<any[]>(radarPois);
  useEffect(() => {
    poisRef.current = pois;
    radarPoisRef.current = radarPois;
  }, [pois, radarPois]);

  useEffect(() => {
    const handleFocusPoi = (e: any) => {
      if (e.detail) focusPoiOnMap(e.detail);
    };
    window.addEventListener('focus-poi', handleFocusPoi);
    return () => window.removeEventListener('focus-poi', handleFocusPoi);
  }, []); // Registrato una sola volta: handleFocusPoi non chiude più su pois/radarPois

  // "Apri sulla mappa" da Mappe Offline: centra sull'area scaricata senza
  // passare da alcun geocoder (funziona offline, le tile sono in cache).
  useEffect(() => {
    const handleOpenMapArea = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (!d || typeof d.lat !== 'number' || typeof d.lon !== 'number') return;
      setCenter([d.lat, d.lon]);
      setMapZoom(d.zoom || 13);
      mapRef.current?.setView([d.lat, d.lon], d.zoom || 13);
    };
    window.addEventListener('wip-open-map-area', handleOpenMapArea);
    return () => window.removeEventListener('wip-open-map-area', handleOpenMapArea);
  }, []);

  const [nearbyPois, setNearbyPois] = useState<Poi[]>([]);
  const [showNearbyList, setShowNearbyList] = useState(false);

  // ── "Tutto nel raggio" (27/08/2026): a differenza di Trova Vicino (solo
  // le categorie con chip accesa, 1 km fisso), questa interroga la RPC
  // nearby_everything — TUTTE le fonti (shared_pois, utility_pois/neve,
  // beni_culturali, percorsi), raggio scelto dall'utente, raggruppate per
  // categoria con un tetto per gruppo deciso nel database. Vedi migration
  // 20260827120000_nearby_everything.sql per il perché di quattro strategie
  // di filtro diverse (non tutte le fonti hanno un indice spaziale).
  interface EverythingItem {
    id: string; name: string; lat: number; lon: number;
    category: string; sub_category: string | null; image_url: string | null;
    distanza_m: number; fonte: string; group_key: string; group_count: number;
    /** Dalla migration 20260829100000: le gemme arrivano già nel gruppo 'gemme'. */
    is_gem?: boolean;
  }
  const [showEverythingPanel, setShowEverythingPanel] = useState(false);
  const [everythingRadius, setEverythingRadius] = useState(15000);
  const [everythingLoading, setEverythingLoading] = useState(false);
  const [everythingGroups, setEverythingGroups] = useState<{ key: string; count: number; items: EverythingItem[] }[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  // (28/08/2026) Il pannello deve "ricordare": chi tocca un luogo, lo vede
  // sulla mappa e riapre il pannello, ritrova la stessa lista allo stesso
  // punto — non una lista nuova ripartita dall'alto. Quindi: centro e raggio
  // dell'ultima ricerca, posizione di scorrimento, flag "riapri senza rifare
  // la fetch", e i luoghi già toccati, che restano segnati sulla mappa.
  const everythingCenterRef = useRef<{ lat: number; lng: number; radius: number } | null>(null);
  const everythingScrollTopRef = useRef(0);
  const everythingScrollElRef = useRef<HTMLDivElement | null>(null);
  const everythingKeepRef = useRef(false);
  const [everythingFullLoaded, setEverythingFullLoaded] = useState(false);
  const [everythingPinned, setEverythingPinned] = useState<Poi[]>([]);

  const fetchEverythingNearby = useCallback(async (radiusM: number, perGroup = 50) => {
    const map = mapRef.current;
    if (!map) return;
    let centerPoint: { lat: number; lng: number };
    try {
      // Il centro della mappa, non la posizione utente: "cosa c'è QUI",
      // coerente con Trova Vicino che usa lo stesso criterio.
      centerPoint = map.getCenter();
    } catch {
      return;
    }
    setEverythingLoading(true);
    try {
      const { data, error } = await supabase.rpc('nearby_everything', {
        p_lat: centerPoint.lat,
        p_lon: centerPoint.lng,
        p_radius_m: radiusM,
        p_per_group_limit: perGroup,
      });
      if (error) {
        console.warn('[nearby_everything]', error.message);
        // Una lista già a schermo non va cancellata da un errore del
        // "carica tutti" (timeout sul raggio grande): resta quella parziale.
        setEverythingGroups((prev) => (perGroup > 50 && prev.length ? prev : []));
        return;
      }
      const rows = (data || []) as EverythingItem[];
      // Chiavi normalizzate PRIMA di raggruppare (vedi EVERYTHING_CANON):
      // "church" e "chiese" finiscono nello stesso gruppo, con il conteggio
      // sommato e gli elementi in ordine di distanza.
      const byKey = new Map<string, { items: EverythingItem[]; count: number; raw: Set<string> }>();
      for (const row of rows) {
        const key = everythingGroupOf(row);
        let g = byKey.get(key);
        if (!g) { g = { items: [], count: 0, raw: new Set() }; byKey.set(key, g); }
        g.items.push(row);
        if (!g.raw.has(row.group_key)) { g.raw.add(row.group_key); g.count += Number(row.group_count) || 0; }
      }
      const groups = Array.from(byKey.entries())
        .map(([key, g]) => ({
          key,
          count: Math.max(g.count, g.items.length),
          items: g.items.sort((a, b) => a.distanza_m - b.distanza_m),
        }))
        // Ordine FISSO, quello delle chip: l'utente trova i gruppi sempre allo
        // stesso posto; le gemme per prime.
        .sort((a, b) => {
          const ia = EVERYTHING_ORDER.indexOf(a.key), ib = EVERYTHING_ORDER.indexOf(b.key);
          return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || b.count - a.count;
        });
      setEverythingGroups(groups);
      // Le gemme già aperte: sono il motivo per cui si apre il pannello.
      if (groups.some((g) => g.key === 'gemme')) setExpandedGroups((prev) => (prev.size ? prev : new Set(['gemme'])));
      setEverythingFullLoaded(perGroup > 50);
      everythingCenterRef.current = { lat: centerPoint.lat, lng: centerPoint.lng, radius: radiusM };
    } catch (e) {
      console.warn('[nearby_everything] fetch error', e);
      setEverythingGroups((prev) => (perGroup > 50 && prev.length ? prev : []));
    } finally {
      setEverythingLoading(false);
    }
  }, []);

  const handleOpenEverythingPanel = useCallback(() => {
    setShowEverythingPanel(true);
    // Riapertura dopo aver toccato un luogo: la lista resta quella e lo
    // scroll viene ripristinato (effetto sotto). Idem se centro e raggio non
    // sono cambiati: niente fetch, niente lista che riparte dall'alto.
    if (everythingKeepRef.current && everythingGroups.length) {
      everythingKeepRef.current = false;
      return;
    }
    const last = everythingCenterRef.current;
    if (last && last.radius === everythingRadius && everythingGroups.length) {
      try {
        const c = mapRef.current?.getCenter();
        if (c && getDistanceFromLatLonInM(c.lat, c.lng, last.lat, last.lng) < 300) return;
      } catch { /* mappa non pronta: si rifà la fetch */ }
    }
    setExpandedGroups(new Set());
    everythingScrollTopRef.current = 0;
    void fetchEverythingNearby(everythingRadius);
  }, [everythingRadius, everythingGroups.length, fetchEverythingNearby]);

  const handleChangeEverythingRadius = useCallback((radiusM: number) => {
    setEverythingRadius(radiusM);
    setExpandedGroups(new Set());
    everythingScrollTopRef.current = 0;
    void fetchEverythingNearby(radiusM);
  }, [fetchEverythingNearby]);

  /** "+N": la RPC taglia ogni gruppo a 50 elementi; chi vuole il resto lo
   * chiede toccando il "+N" e si rifà la fetch con il tetto alto, una volta. */
  const loadMoreEverything = useCallback(() => {
    if (everythingFullLoaded || everythingLoading) return;
    void fetchEverythingNearby(everythingRadius, 500);
  }, [everythingFullLoaded, everythingLoading, everythingRadius, fetchEverythingNearby]);

  // Scroll riportato dov'era, dopo che la lista è stata renderizzata.
  useEffect(() => {
    if (!showEverythingPanel) return;
    const el = everythingScrollElRef.current;
    if (el && everythingScrollTopRef.current > 0) el.scrollTop = everythingScrollTopRef.current;
  }, [showEverythingPanel, everythingGroups]);

  const toggleEverythingGroup = useCallback((key: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  /** Etichetta + emoji per un group_key: le categorie note vengono dal
   * dizionario condiviso (CATEGORY_EMOJIS/mapConstants), le fonti senza
   * voce lì (neve, fontanelle, i quattro tipi di percorso) hanno un
   * fallback locale; tutto il resto prettifica la chiave grezza. */
  const EVERYTHING_GROUP_FALLBACK: Record<string, { emoji: string; label: string }> = {
    neve: { emoji: '❄️', label: getTranslation('everything_group_neve', language) },
    fontanelle: { emoji: '🚰', label: getTranslation('everything_group_fontanelle', language) },
    beni_culturali: { emoji: '🏺', label: getTranslation('beni_culturali', language) },
    percorsi_cai: { emoji: '🥾', label: getTranslation('everything_group_percorsi_cai', language) },
    percorsi_osm: { emoji: '🥾', label: getTranslation('everything_group_percorsi_osm', language) },
    percorsi_pdipr: { emoji: '🥾', label: getTranslation('everything_group_percorsi_pdipr', language) },
    percorsi_gusto: { emoji: '🍷', label: getTranslation('everything_group_percorsi_gusto', language) },
    percorsi: { emoji: '🥾', label: getTranslation('everything_group_percorsi', language) },
    mercati: { emoji: '🧺', label: getTranslation('mercati', language) },
    altro: { emoji: '📍', label: getTranslation('everything_group_altro', language) },
  };
  /** Icona della SOTTO-categoria di una riga (in colonna sotto quella del
   * gruppo): il tipo del POI se ha un'emoji, altrimenti la categoria grezza. */
  const everythingRowEmoji = (item: EverythingItem, groupEmoji: string): string | null => {
    const sub = String(item.sub_category || '').toLowerCase();
    const cat = String(item.category || '').toLowerCase();
    if (item.fonte === 'route_geometries') {
      const k = item.group_key.replace('percorsi_', '');
      return k === 'gusto' ? '🍷' : k === 'bici' ? '🚲' : '🥾';
    }
    const e = (SUB_CATEGORY_EMOJIS as any)[sub] || (SUB_CATEGORY_EMOJIS as any)[cat] || (CATEGORY_EMOJIS as any)[cat] || null;
    return e && e !== groupEmoji ? e : null;
  };
  const everythingGroupInfo = (key: string): { emoji: string; label: string } => {
    if (EVERYTHING_GROUP_FALLBACK[key]) return EVERYTHING_GROUP_FALLBACK[key];
    const emoji = (CATEGORY_EMOJIS as any)[key] || '📍';
    // Le chiavi canoniche hanno la traduzione delle chip; il resto si
    // prettifica (ultima spiaggia, non dovrebbe più capitare per le
    // categorie principali).
    const labelKey = EVERYTHING_LABEL_KEY[key];
    const label = labelKey
      ? getTranslation(labelKey, language)
      : key.replace(/^percorsi_/, '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    return { emoji, label };
  };

  /** Apre un elemento della lista "Tutto nel raggio": stesso effetto di
   * focusPoiOnMap, ma l'oggetto arriva dalla RPC (forma diversa da Poi),
   * quindi qui si costruisce l'oggetto minimo che il popup/scheda si
   * aspetta invece di forzare un cast. */
  const openEverythingItem = (item: { id: string; name: string; lat: number; lon: number; category: string; sub_category: string | null; is_gem?: boolean }) => {
    setShowEverythingPanel(false);
    // Alla riapertura la lista non si rifà (e lo scroll torna dov'era).
    everythingKeepRef.current = true;
    const poi = {
      id: item.id,
      name: item.name,
      lat: item.lat,
      lon: item.lon,
      category: item.category,
      subCategory: item.sub_category || undefined,
      // Serve al percorso (29/08): una gemma parla qualunque sia la categoria.
      is_gem: item.is_gem === true,
    } as unknown as Poi;
    // Resta segnato sulla mappa anche quando si tocca il luogo successivo.
    setEverythingPinned((prev) => (prev.some((p) => p.id === poi.id) ? prev : [...prev, poi]));
    if (mapRef.current) {
      centerMapOnPoi(poi, 18);
    } else {
      setCenter([item.lat, item.lon]);
      setMapZoom(18);
    }
    if (onCenterChange) onCenterChange([item.lat, item.lon]);
    setActivePopupId(poi.id);
    setActivePoi(poi);
  };
  const [isLoadingPois, setIsLoadingPois] = useState(false);
  const [isRateLimited, setIsRateLimited] = useState(false);
  const [fetchErrors, setFetchErrors] = useState<Record<string, string>>({});
  // Circuit breaker (src/lib/circuitBreaker.ts, condiviso con poiRepository.ts):
  // true quando le RPC del fetch mappa vengono rifiutate perché il breaker è
  // aperto (troppi fallimenti di rete recenti), non per un singolo errore isolato.
  const [mapDataDegraded, setMapDataDegraded] = useState(false);

  // poiRepository.ts (non toccato qui) dispatcha questo evento quando TUTTE le
  // fonti del radar (RPC + fallback diretto + Dexie) sono risultate vuote:
  // riusiamo lo stesso banner del fetchErrors di mappa, con una chiave dedicata.
  useEffect(() => {
    const handleRadarDegraded = () => {
      setFetchErrors((prev) => ({
        ...prev,
        db: getTranslation('mp_luoghi_vicini_errore', language),
      }));
    };
    window.addEventListener('wip-radar-degraded', handleRadarDegraded);
    return () => window.removeEventListener('wip-radar-degraded', handleRadarDegraded);
  }, [language]);

  const [userLocation, setUserLocation] = useState<[number, number] | null>(
    null,
  );
  const [followMode, setFollowMode] = useState(false);
  // Copia in ref: fetchPois è memoizzata e non deve ricrearsi al toggle del
  // follow-me (ricrearla farebbe ripartire i listener della mappa).
  const followModeRef = useRef(false);
  useEffect(() => { followModeRef.current = followMode; }, [followMode]);

  /**
   * IL MIRINO SEGUE CHI CAMMINA (28/08/2026).
   *
   * Con un giro in corso la mappa resta centrata sulla posizione: durante il
   * giro la mappa E` la funzione, e ricentrarla a mano a ogni isolato non e`
   * un compito da dare a chi cammina guardando la strada. Si accende il
   * follow-me che esiste gia` (stesso `panTo`, stesso percorso di `moveend`
   * con la soglia dei 100 m: nessuna scrittura e nessuna geocodifica in piu`).
   * Guardare avanti resta possibile — un trascinamento sospende il follow, e
   * dopo dieci secondi di mano ferma torna da solo, come nei navigatori.
   */
  const RIPRESA_FOLLOW_MS = 10_000;
  const [giroAttivoMappa, setGiroAttivoMappa] = useState(() => {
    const v = tourService.vista();
    return !!v && v.stato !== 'FINITO';
  });
  useEffect(() => tourService.ascolta((v) => setGiroAttivoMappa(!!v && v.stato !== 'FINITO')), []);
  const giroAttivoRef = useRef(giroAttivoMappa);
  useEffect(() => { giroAttivoRef.current = giroAttivoMappa; }, [giroAttivoMappa]);
  const ripresaFollowRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Il follow era gia` acceso dall'utente prima del giro? Allora resta acceso dopo. */
  const followPrimaDelGiroRef = useRef(false);
  /** Accuratezza dell'ultimo fix: non si insegue un punto a 500 m di errore. */
  const accuratezzaFixRef = useRef<number | null>(null);
  const [userHeading, setUserHeading] = useState<number | null>(null);
  const [mapRotation, setMapRotation] = useState(0);
  const compassListenerRef = useRef<((e: DeviceOrientationEvent) => void) | null>(null);

  // Stop follow mode & compass when user manually pans the map
  const stopFollowMode = useCallback((perGesto = false) => {
    // L'utente ha messo mano alla mappa: il volo automatico al primo fix
    // non deve più rubargli la vista.
    userDraggedRef.current = true;
    if (ripresaFollowRef.current) { clearTimeout(ripresaFollowRef.current); ripresaFollowRef.current = null; }
    // Durante il giro il trascinamento SOSPENDE il follow, non lo spegne:
    // guardare avanti sul percorso è normale, e riprendere a mano no. Il
    // tocco esplicito sulla bussola o sul mirino resta invece definitivo.
    if (perGesto && giroAttivoRef.current) {
      ripresaFollowRef.current = setTimeout(() => {
        ripresaFollowRef.current = null;
        if (giroAttivoRef.current) setFollowMode(true);
      }, RIPRESA_FOLLOW_MS);
    }
    if (followMode) {
      setFollowMode(false);
      // Stop compass
      if (compassListenerRef.current) {
        window.removeEventListener('deviceorientationabsolute' as any, compassListenerRef.current);
        window.removeEventListener('deviceorientation', compassListenerRef.current);
        compassListenerRef.current = null;
      }
      // Reset map rotation to north
      if (mapRef.current) {
        (mapRef.current as any).setBearing?.(0);
      }
      setMapRotation(0);
    }
  }, [followMode]);

  useEffect(() => {
    return () => {
      // Cleanup on unmount
      if (compassListenerRef.current) {
        window.removeEventListener('deviceorientationabsolute' as any, compassListenerRef.current);
        window.removeEventListener('deviceorientation', compassListenerRef.current);
      }
    };
  }, []);

  // Al PRIMO fix GPS la mappa vola sulla posizione dell'utente — una volta
  // sola, e solo se la preferenza è «la mia posizione» e l'utente non ha
  // già trascinato la mappa. Prima il fix aggiornava il marker e basta: un
  // utente a Roma restava su Carrara.
  const flewToGpsRef = useRef(false);
  const userDraggedRef = useRef(false);

  // Sincronizza la posizione dell'utente con il locationService centrale
  useEffect(() => {
    const unsub = locationService.subscribe((loc) => {
      const acc = Number((loc as any)?.accuracy);
      accuratezzaFixRef.current = Number.isFinite(acc) ? acc : null;
      setUserLocation([loc.latitude, loc.longitude]);
      if (!flewToGpsRef.current && !userDraggedRef.current && shouldFlyToGpsOnFirstFix()
          && Number.isFinite(loc.latitude) && Number.isFinite(loc.longitude)) {
        flewToGpsRef.current = true;
        try { mapRef.current?.flyTo([loc.latitude, loc.longitude], Math.max(mapRef.current.getZoom(), 14), { duration: 1.2 }); } catch { /* mappa non pronta */ }
      }
      if (loc.heading !== null) {
        setUserHeading(loc.heading);
      }
    });
    return unsub;
  }, []);

  // Handle follow mode panning reactively when userLocation changes.
  // Solo il CENTRO: lo zoom resta quello scelto dall'utente — riportarlo a un
  // valore fisso a ogni fix sarebbe insopportabile mentre si guarda la mappa.
  useEffect(() => {
    if (!followMode || !userLocation || !mapRef.current) return;
    const [la, lo] = userLocation;
    if (!Number.isFinite(la) || !Number.isFinite(lo)) return;
    // Un fix con 500 m di errore non è una posizione: non ci si insegue dietro.
    const acc = accuratezzaFixRef.current;
    if (acc != null && Number.isFinite(acc) && acc > 100) return;
    try {
      mapRef.current.panTo(userLocation, { animate: true, duration: 0.5 });
    } catch (e) {}
  }, [userLocation, followMode]);

  // Giro in corso → il mirino segue. Giro finito o terminato → si torna al
  // comportamento di prima: se il follow lo aveva acceso l'utente resta acceso.
  useEffect(() => {
    if (giroAttivoMappa) {
      followPrimaDelGiroRef.current = followModeRef.current;
      if (!followModeRef.current) setFollowMode(true);
      return;
    }
    if (ripresaFollowRef.current) { clearTimeout(ripresaFollowRef.current); ripresaFollowRef.current = null; }
    if (!followPrimaDelGiroRef.current && followModeRef.current) setFollowMode(false);
  }, [giroAttivoMappa]);

  useEffect(() => () => { if (ripresaFollowRef.current) clearTimeout(ripresaFollowRef.current); }, []);

  const mapRef = useRef<L.Map | null>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  // Contatore di generazione dei fetch: le risposte di un fetch superato vengono scartate
  const fetchSeqRef = useRef(0);
  const lastFetchedStateRef = useRef<{ bounds: L.LatLngBounds; categoriesKey: string; subFilter: string[] | undefined; beniLivello?: number } | null>(null);
  // Ancora dell'ultimo fetch (centro + zoom): serve alla soglia di movimento
  // che evita di rifare il fetch per i pan programmatici (follow-me, flyTo).
  const lastFetchAnchorRef = useRef<{ lat: number; lon: number; zoom: number } | null>(null);

  // AbortController delle fetch POI, legati al ciclo di vita del componente.
  // Da variabili di modulo un remount (hot reload, error boundary) poteva
  // abortire richieste valide dell'istanza nuova.
  const overpassAbortRef = useRef<AbortController | null>(null);
  const googlePlacesAbortRef = useRef<AbortController | null>(null);
  const wikiAbortRef = useRef<AbortController | null>(null);
  // Long-press del bottone "posizione": stato LOCALE al componente. Prima
  // viveva su window (`longPressTimer`/`isLongPress`), condiviso tra istanze
  // e mai ripulito allo smontaggio.
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLongPressRef = useRef(false);

  // ── Layer servizi pratici (fontanelle 💧, bagni 🚻, panchine 🪑) ──────
  // Toggle 🚰 nei controlli mappa: layerGroup Leaflet separato dai POI,
  // alimentato da src/lib/servicesLayer.ts (Overpass, cache 24h).
  const [servicesActive, setServicesActive] = useState(false);
  const [servicesLoading, setServicesLoading] = useState(false);
  const servicesLayerRef = useRef<L.LayerGroup | null>(null);
  // Centro dell'ultima query servizi: sopra 1,5 km di pan il layer si aggiorna
  const servicesCenterRef = useRef<{ lat: number; lon: number } | null>(null);
  // Posizione utente letta al momento dell'apertura del popup (mai stantia)
  const userLocationRef = useRef<[number, number] | null>(null);
  useEffect(() => { userLocationRef.current = userLocation; }, [userLocation]);

  const loadServices = useCallback(async (lat: number, lon: number): Promise<boolean> => {
    const map = mapRef.current;
    if (!map) return false;
    setServicesLoading(true);
    try {
      const points = await fetchServicesAround(lat, lon);
      if (!servicesLayerRef.current) servicesLayerRef.current = L.layerGroup();
      const group = servicesLayerRef.current;
      group.clearLayers();

      for (const pt of points) {
        const icon = L.divIcon({
          html: cerchioMarker(SERVICE_EMOJI[pt.type], MARKER_CERCHIO_PX, 14),
          className: "wip-service-marker",
          ...cerchioMarkerOpts(),
        });
        const marker = L.marker([pt.lat, pt.lon], { icon });
        // Contenuto calcolato all'apertura: la distanza usa la posizione
        // utente corrente, non quella di quando il layer è stato creato.
        marker.bindPopup(() => {
          const title = pt.name ? escapeHtml(pt.name) : SERVICE_LABEL[pt.type];
          const subtitle = pt.name ? `<div style="font-size:10px;color:#6b7280;">${SERVICE_LABEL[pt.type]}</div>` : "";
          const loc = userLocationRef.current;
          const distHtml = loc
            ? `<div style="font-size:10px;color:#374151;margin-top:2px;">📍 ${Math.round(getDistanceFromLatLonInM(loc[0], loc[1], pt.lat, pt.lon))} m da te</div>`
            : "";
          return `<div style="font-family:system-ui,sans-serif;min-width:120px;"><div style="font-size:12px;font-weight:700;color:#111827;">${SERVICE_EMOJI[pt.type]} ${title}</div>${subtitle}${distHtml}</div>`;
        });
        group.addLayer(marker);
      }

      if (!map.hasLayer(group)) group.addTo(map);
      servicesCenterRef.current = { lat, lon };
      return true;
    } catch (e) {
      // Overpass giù su tutti gli endpoint: niente crash, banner e toggle off
      console.warn("[Servizi] fetch fallito:", e);
      setFetchErrors((prev) => ({
        ...prev,
        servizi: getTranslation('mp_servizi_errore', language),
      }));
      return false;
    } finally {
      setServicesLoading(false);
    }
  }, [language]);

  const toggleServices = useCallback(async () => {
    const map = mapRef.current;
    if (servicesActive) {
      setServicesActive(false);
      if (map && servicesLayerRef.current) map.removeLayer(servicesLayerRef.current);
      return;
    }
    if (!map) return;
    setServicesActive(true);
    const c = map.getCenter();
    const ok = await loadServices(c.lat, c.lng);
    if (!ok) setServicesActive(false);
  }, [servicesActive, loadServices]);

  // Aggiornamento del layer quando l'utente sposta la mappa di molto
  // (>1,5 km dal centro dell'ultima query) mentre il toggle è attivo
  useEffect(() => {
    if (!servicesActive) return;
    const map = mapRef.current;
    if (!map) return;
    const onMoveEnd = () => {
      const last = servicesCenterRef.current;
      if (!last) return;
      try {
        const c = map.getCenter();
        if (getDistanceFromLatLonInM(last.lat, last.lon, c.lat, c.lng) > 1500) {
          loadServices(c.lat, c.lng);
        }
      } catch { /* bounds non pronti */ }
    };
    map.on("moveend", onMoveEnd);
    return () => { map.off("moveend", onMoveEnd); };
  }, [servicesActive, loadServices]);

  // ── Fog of war dei luoghi visitati (src/lib/visitedFog.ts) ────────────
  // Toggle 👣 nei controlli mappa: layer canvas di rettangoli Leaflet
  // sulle celle ~150×150 m già calpestate — un "diario che si costruisce
  // camminando", non una nebbia scura. Zero impatto col toggle spento:
  // l'effetto esce subito e il layer non esiste.
  const [fogActive, setFogActive] = useState(() => {
    try { return localStorage.getItem('wip_fog_enabled') === '1'; } catch { return false; }
  });
  // Percentuale di esplorazione dell'area a schermo (null = mai calcolata)
  const [fogCoverage, setFogCoverage] = useState<number | null>(null);
  const fogLayerRef = useRef<L.LayerGroup | null>(null);
  // Un renderer canvas dedicato: fino a ~1500 rettangoli senza costi DOM/SVG
  const fogRendererRef = useRef<L.Renderer | null>(null);
  // Retry se la mappa non è ancora pronta quando il toggle è già attivo
  // (ripristino da localStorage al mount)
  const [fogTick, setFogTick] = useState(0);
  const fogFirstFixRef = useRef(false);

  // markVisited al primo fix della mappa (i successivi arrivano dal
  // listener 'wip-location-update' interno a visitedFog.ts)
  useEffect(() => {
    if (!userLocation || fogFirstFixRef.current) return;
    fogFirstFixRef.current = true;
    markVisited(userLocation[0], userLocation[1]);
  }, [userLocation]);

  const renderFog = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    let viewBounds: L.LatLngBounds;
    try { viewBounds = map.getBounds(); } catch { return; }
    // Margine del 10%: niente celle "che spuntano" durante piccoli pan
    const b = viewBounds.pad(0.1);
    const cells = getVisitedCells({
      south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast(),
    });
    if (!fogRendererRef.current) fogRendererRef.current = L.canvas({ padding: 0.2 });
    if (!fogLayerRef.current) fogLayerRef.current = L.layerGroup();
    const group = fogLayerRef.current;
    group.clearLayers();
    const style: L.PolylineOptions = {
      stroke: false,                 // niente bordi: solo un velo di colore
      fillColor: '#1e3a8a',          // blu brand
      fillOpacity: 0.12,             // la mappa sotto resta leggibile
      interactive: false,
      renderer: fogRendererRef.current,
    };
    if (cells.length > 1500) {
      // Troppe celle a schermo (zoom largo): aggrega in super-celle 2×2,
      // stessa area coperta con ~1/4 dei rettangoli
      const supers = new Map<string, { si: number; sj: number }>();
      for (const c of cells) {
        const si = Math.floor(c.i / 2);
        const sj = Math.floor(c.j / 2);
        supers.set(`${si}_${sj}`, { si, sj });
      }
      const step = FOG_CELL_DEG * 2;
      for (const s of supers.values()) {
        group.addLayer(L.rectangle(
          [[s.si * step, s.sj * step], [(s.si + 1) * step, (s.sj + 1) * step]],
          style,
        ));
      }
    } else {
      for (const c of cells) {
        group.addLayer(L.rectangle([[c.south, c.west], [c.north, c.east]], style));
      }
    }
    if (!map.hasLayer(group)) group.addTo(map);
    // Badge "Hai esplorato ~X%": metrica su ciò che è davvero a schermo
    setFogCoverage(cityCoveragePercent({
      south: viewBounds.getSouth(), west: viewBounds.getWest(),
      north: viewBounds.getNorth(), east: viewBounds.getEast(),
    }));
  }, []);

  const toggleFog = useCallback(() => {
    setFogActive((prev) => {
      const next = !prev;
      try { localStorage.setItem('wip_fog_enabled', next ? '1' : '0'); } catch { /* storage pieno */ }
      return next;
    });
  }, []);

  useEffect(() => {
    if (!fogActive) return;
    const map = mapRef.current;
    if (!map) {
      // Toggle ripristinato prima che Leaflet esista: riprova a breve
      const retry = setTimeout(() => setFogTick((t) => t + 1), 500);
      return () => clearTimeout(retry);
    }
    renderFog();
    let timer: ReturnType<typeof setTimeout> | null = null;
    // Throttle: il ridisegno avviene a mappa ferma, mai durante il pan
    const onMoveEnd = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(renderFog, 250);
    };
    // Nuovi fix GPS mentre si cammina: la cella nuova appare con calma
    const onLoc = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(renderFog, 3000);
    };
    map.on('moveend', onMoveEnd);
    window.addEventListener('wip-location-update', onLoc);
    return () => {
      map.off('moveend', onMoveEnd);
      window.removeEventListener('wip-location-update', onLoc);
      if (timer) clearTimeout(timer);
      if (fogLayerRef.current && map.hasLayer(fogLayerRef.current)) {
        map.removeLayer(fogLayerRef.current);
      }
      setFogCoverage(null);
    };
  }, [fogActive, fogTick, renderFog]);

  // Pannello dei servizi mappa: chiuso di default, si apre dal tasto ⓘ.
  // Non persiste: è un menù, non una preferenza — gli stati dei singoli
  // layer invece restano salvati come prima.
  const [serviziAperti, setServiziAperti] = useState(false);
  // Lo zoom di adesso, per dire nel pannello «avvicinati»: un layer acceso
  // che non mostra niente perché si sta guardando mezza Europa sembra
  // rotto, e la spiegazione deve stare dove si è appena toccato.
  const [zoomCorrente, setZoomCorrente] = useState(13);
  // Chi ha chiesto al telefono di ridurre le animazioni ha spesso un
  // motivo serio (vertigini, emicrania vestibolare, nausea da movimento).
  // Il pannello compare lo stesso, senza scivolare né rimpicciolirsi.
  const menoMovimento = useReducedMotion();
  // Dichiarato qui, prima dei sentieri, perché anche quel layer deve
  // sapere se la neve è accesa: i rifugi li disegna uno solo dei due.
  const [neveActive, setNeveActive] = useState(() => {
    try { return localStorage.getItem('wip_neve_enabled') === '1'; } catch { return false; }
  });

  // ── Sentieri e cammini ────────────────────────────────────────────────
  // 30.068 percorsi internazionali, nazionali e regionali importati da OSM.
  // Stanno nel pannello ⓘ e non fra le chip: una chip in più affollava la
  // barra, e questi sono un layer che si accende quando servono — come le
  // fontanelle. Il punto è quello di PARTENZA del percorso, non il tracciato.
  const [sentieriActive, setSentieriActive] = useState(() => {
    try { return localStorage.getItem('wip_sentieri_enabled') === '1'; } catch { return false; }
  });
  const [sentieriLoading, setSentieriLoading] = useState(false);
  const sentieriLayerRef = useRef<L.LayerGroup | null>(null);
  // I tracciati stanno in un gruppo a parte: le palline raggruppano i PIN,
  // e una linea in mezzo ai marcatori raggruppati non ha senso.
  const sentieriLineeRef = useRef<L.LayerGroup | null>(null);
  // Zoom 7 come le spiagge e gli altri POI naturali: un cammino lungo
  // centinaia di chilometri va visto da lontano, altrimenti lo si scopre
  // solo quando ci si è già sopra. Sotto zoom 10 però si mostrano soltanto
  // i percorsi di rilevanza internazionale e nazionale e le tappe CAI:
  // a scala regionale i sentieri locali sarebbero centinaia di pin
  // indistinguibili.
  // BUGFIX 26/08/2026: era 7 e spegneva ANCHE i punti di partenza già
  // clusterizzati (creaGruppoPercorsi, come i marker POI) — non solo le
  // linee, che restano correttamente gestite a parte da livelloDaZoom
  // (routeLines.ts, che sotto zoom 8 già non le richiede). Risultato: sotto
  // zoom 7 il livello spariva del tutto invece di mostrare solo i cluster,
  // esattamente come le categorie POI (aggregati con numero a zoom basso,
  // singoli marker a zoom alto). Soglia bassa: i punti restano sempre
  // visibili, l'aggregazione fa il resto.
  const SENTIERI_MIN_ZOOM = 2;
  const SENTIERI_ZOOM_TUTTI = 10;
  // Lo zoom in cui il gruppo si apre: sotto, una pallina col numero di
  // percorsi; da qui in su i pin singoli E il tracciato disegnato. Un
  // numero solo per le due cose, così quello che si vede e quello che si
  // tocca cambiano insieme.
  const SENTIERI_ZOOM_APERTURA = 12;

  const toggleSentieri = useCallback(() => {
    setSentieriActive((prev) => {
      const next = !prev;
      try { localStorage.setItem('wip_sentieri_enabled', next ? '1' : '0'); } catch { /* storage pieno */ }
      return next;
    });
  }, []);

  const caricaSentieri = useCallback(async (bounds: L.LatLngBounds) => {
    const map = mapRef.current;
    if (!map) return;
    setSentieriLoading(true);
    try {
      // Filtro per riquadro sull'indice lat/lon, poi per fonte: è la stessa
      // strada dell'atlante, e non tocca colonne senza indice.
      // TUTTE le fonti di percorsi, non solo OSM: prima restavano fuori le
      // 535 tappe del Sentiero Italia e i 17.702 percorsi francesi.
      // A zoom lontano solo i cammini importanti, riconosciuti dalla FONTE.
      // Distinguerli dalla descrizione («…di rilevanza nazionale») voleva
      // dire un ilike su colonna non indicizzata: misurato 6,4 s in Toscana
      // e statement timeout in Provenza. I percorsi internazionali e
      // nazionali sono stati marcati `osm_sentieri_top` apposta.
      // TRE soglie, non due. Dopo l'import del 21/08/2026 le reti LOCALI
      // sono 138.000 anelli comunali: bellissimi quando sei lì, rumore
      // puro quando guardi una regione. Compaiono solo da zoom 12, che è
      // anche lo zoom in cui il gruppo si apre e appaiono i tracciati.
      const zoomFonti = map.getZoom();
      const lontano = zoomFonti < SENTIERI_ZOOM_TUTTI;
      // I RIFUGI stanno nel layer della neve insieme a comprensori e
      // impianti, ed è un abbinamento sbagliato: chi cammina in agosto
      // cerca un rifugio, non uno skilift, e non gli verrebbe mai in mente
      // di accendere ❄️. Quindi compaiono anche qui — ma solo se il layer
      // della neve è spento, altrimenti si disegnerebbero due volte.
      const rifugiQui = !neveActive && zoomFonti >= SENTIERI_ZOOM_APERTURA;
      const fonti = lontano
        ? ['osm_sentieri_top', 'cai_sentiero_italia', 'osm_storici']
        : zoomFonti < SENTIERI_ZOOM_APERTURA
          ? ['osm_sentieri_top', 'osm_sentieri', 'cai_sentiero_italia', 'pdipr_fr', 'osm_storici']
          : ['osm_sentieri_top', 'osm_sentieri', 'cai_sentiero_italia', 'pdipr_fr',
            'osm_sentieri_locali', 'osm_ippovie', 'osm_storici', 'osm_corsa', 'osm_canoa'];
      const { data } = await supabase
        .from('shared_pois')
        .select('id,name,lat,lon,description_short,source')
        .in('source', fonti)
        // I pin nascosti restano fuori. Servono davvero: ricucendo la rete
        // francese, 2.727 pezzi della stessa traccia sono stati messi da
        // parte (la Via Garona da sola ne aveva 378) e senza questo filtro
        // tornerebbero tutti sulla mappa.
        .or('is_hidden.is.null,is_hidden.eq.false')
        .gte('lat', bounds.getSouth()).lte('lat', bounds.getNorth())
        .gte('lon', bounds.getWest()).lte('lon', bounds.getEast())
        .limit(lontano ? 120 : 200);
      if (!sentieriLayerRef.current) sentieriLayerRef.current = creaGruppoPercorsi('#059669', SENTIERI_ZOOM_APERTURA);
      if (!sentieriLineeRef.current) sentieriLineeRef.current = L.layerGroup();
      const group = sentieriLayerRef.current;
      const linee = sentieriLineeRef.current;
      group.clearLayers();
      linee.clearLayers();
      for (const s of data || []) {
        // Un'icona per famiglia, come per i luoghi del gusto: a cavallo non
        // si va con gli scarponi, e il Sentiero Italia non è un anello
        // comunale. Chi guarda la mappa lo capisce senza aprire niente.
        const emojiFonte = s.source === 'osm_ippovie' ? '🐴'
          : s.source === 'cai_sentiero_italia' ? '🏔'
          : s.source === 'osm_sentieri_top' ? '🎒'
          : s.source === 'osm_corsa' ? '🏃'
          : s.source === 'osm_canoa' ? '🛶'
          : s.source === 'osm_storici' ? '🏛'
          : '🥾';
        const icon = L.divIcon({
          html: cerchioMarker(emojiFonte),
          className: 'wip-sentiero-marker',
          ...cerchioMarkerOpts(),
        });
        L.marker([Number(s.lat), Number(s.lon)], { icon })
          .bindPopup(`<div style="font-family:system-ui,sans-serif;min-width:150px;max-width:230px;">
            <div style="font-size:12px;font-weight:700;color:#111827;">${emojiFonte} ${escapeHtml(s.name || '')}</div>
            <div style="font-size:11px;color:#374151;margin-top:3px;">${escapeHtml(s.description_short || '')}</div>
            <div style="font-size:9px;color:#6b7280;margin-top:4px;">${getTranslation('mp_punto_partenza_osm', language)}</div>
          </div>`)
          .addTo(group);
      }
      // I rifugi lungo il cammino, dalla tabella dei servizi.
      if (rifugiQui) {
        const { data: rifugi } = await supabase
          .from('utility_pois')
          .select('id,name,lat,lon')
          .eq('category', 'neve')
          .eq('sub_category', 'rifugio_alpino')
          .gte('lat', bounds.getSouth()).lte('lat', bounds.getNorth())
          .gte('lon', bounds.getWest()).lte('lon', bounds.getEast())
          .limit(60);
        for (const r of rifugi || []) {
          const icon = L.divIcon({
            html: cerchioMarker('🏔'),
            className: 'wip-rifugio-marker',
            ...cerchioMarkerOpts(),
          });
          L.marker([Number(r.lat), Number(r.lon)], { icon })
            .bindPopup(`<div style="font-family:system-ui,sans-serif;min-width:150px;">
              <div style="font-size:12px;font-weight:700;color:#111827;">🏔 ${escapeHtml(r.name || '')}</div>
              <div style="font-size:11px;color:#374151;margin-top:2px;">${getTranslation('mp_rifugio_alpino', language)}</div>
              <div style="font-size:9px;color:#6b7280;margin-top:4px;">${getTranslation('mp_osm_contributori', language)}</div>
            </div>`)
            .addTo(group);
        }
      }

      // IL TRACCIATO, non solo la partenza. Dal 21/08/2026 le geometrie
      // stanno in route_geometries: si prendono quelle che ATTRAVERSANO il
      // riquadro (un cammino di 200 km passa sullo schermo senza che né
      // partenza né arrivo ci stiano dentro) e si disegnano a puntini,
      // come il giro a più tappe.
      const nomiSentieri = new Map<string, string>(
        (data || []).map((s: any) => [String(s.id), String(s.name || '')]),
      );
      // I TRACCIATI, per livelli di dettaglio. Da zoom 8 — cioè
      // inquadrando una regione — si vedono già i grandi cammini che la
      // attraversano, nella versione grossolana che pesa ~36 KB invece di
      // 850. Avvicinandosi arriva la linea intera, e poi le tappe.
      const zoomOra = map.getZoom();
      const livello = livelloDaZoom(zoomOra);
      if (livello) {
        const lineeSentieri = await fetchRouteLines(
          bounds,
          ['cai', 'osm', 'pdipr', 'cavallo'],
          livello === 'regionale' ? 60 : livello === 'medio' ? 120 : 150,
          livello === 'medio' ? 2 : 1,
          livello,
        );
        drawRouteLines(linee, lineeSentieri, '#059669', nomiSentieri);
        // I percorsi in CANOA in blu: una linea verde sull'acqua non si
        // legge, e soprattutto non si capisce che è un percorso d'acqua.
        const lineeCanoa = await fetchRouteLines(
          bounds, ['acqua'],
          livello === 'regionale' ? 30 : 60,
          livello === 'medio' ? 2 : 1,
          livello,
        );
        drawRouteLines(linee, lineeCanoa, '#0284c7', nomiSentieri);
        // Le tappe numerate solo da zoom 13: prima i numeri si
        // accavallerebbero e si leggerebbe una macchia.
        if (livello === 'pieno') {
          for (const l of lineeSentieri) {
            if (l.stops?.length) drawRouteStops(linee, l.stops, '#059669', nomiSentieri.get(l.poiId));
          }
        }
      }
      if (map.getZoom() >= SENTIERI_MIN_ZOOM) {
        if (!map.hasLayer(group)) group.addTo(map);
        if (!map.hasLayer(linee)) linee.addTo(map);
      }
    } catch (e) {
      console.warn('[Sentieri] fetch fallito:', e); // rifugi compresi
    } finally {
      setSentieriLoading(false);
    }
    // neveActive serve: se accendi la neve i rifugi li disegna quel layer,
    // e questo deve smettere di farlo per non raddoppiarli.
  }, [language, neveActive]);

  useEffect(() => {
    const map = mapRef.current;
    const spegni = () => {
      for (const r of [sentieriLayerRef, sentieriLineeRef]) {
        if (map && r.current && map.hasLayer(r.current)) map.removeLayer(r.current);
      }
    };
    if (!sentieriActive) {
      spegni();
      setRouteAttribution(map, ATTRIB_SENTIERI, false);
      return;
    }
    if (!map) return;
    setRouteAttribution(map, ATTRIB_SENTIERI, true);
    const aggiorna = () => {
      setZoomCorrente(map.getZoom());
      if (map.getZoom() < SENTIERI_MIN_ZOOM) {
        spegni();
        return;
      }
      void caricaSentieri(map.getBounds());
    };
    aggiorna();
    map.on('moveend', aggiorna);
    return () => { map.off('moveend', aggiorna); };
  }, [sentieriActive, caricaSentieri]);

  // ── BICI ──────────────────────────────────────────────────────────────
  //
  // Layer nuovo del 21/08/2026. Il censimento di OSM ha mostrato un buco
  // intero: 20.580 ciclovie di rete internazionale, nazionale o regionale
  // (EuroVelo, ciclabili nazionali), 33.375 percorsi ciclabili locali e
  // 3.152 tracciati mountain bike, e noi non ne avevamo NESSUNO — l'import
  // dei sentieri chiedeva solo route=hiking|foot|pilgrimage.
  //
  // Layer separato e non dentro 🥾: chi pedala e chi cammina non cercano la
  // stessa cosa, e una ciclovia di 1.200 km in mezzo ai sentieri di valle
  // confonde e basta. Arancione, che non e' usato da nessun altro layer.
  const [ciclabiliActive, setCiclabiliActive] = useState(() => {
    try { return localStorage.getItem('wip_ciclabili_enabled') === '1'; } catch { return false; }
  });
  const [ciclabiliLoading, setCiclabiliLoading] = useState(false);
  const ciclabiliLayerRef = useRef<L.LayerGroup | null>(null);
  const ciclabiliLineeRef = useRef<L.LayerGroup | null>(null);
  // BUGFIX 26/08/2026: stessa correzione di SENTIERI_MIN_ZOOM sopra.
  const CICLABILI_MIN_ZOOM = 2;
  const CICLABILI_ZOOM_LOCALI = 12;

  const toggleCiclabili = useCallback(() => {
    setCiclabiliActive((prev) => {
      const next = !prev;
      try { localStorage.setItem('wip_ciclabili_enabled', next ? '1' : '0'); } catch { /* storage pieno */ }
      return next;
    });
  }, []);

  const caricaCiclabili = useCallback(async (bounds: L.LatLngBounds) => {
    const map = mapRef.current;
    if (!map) return;
    setCiclabiliLoading(true);
    try {
      const zoom = map.getZoom();
      // Fino a zoom 11 solo le ciclovie vere (EuroVelo e reti nazionali);
      // le ciclabili di quartiere e i tracciati mtb da 12 in su.
      const fonti = zoom < CICLABILI_ZOOM_LOCALI
        ? ['osm_ciclabili']
        : ['osm_ciclabili', 'osm_ciclabili_locali', 'osm_mtb'];
      const { data } = await supabase
        .from('shared_pois')
        .select('id,name,lat,lon,description_short,source')
        .in('source', fonti)
        .or('is_hidden.is.null,is_hidden.eq.false')
        .gte('lat', bounds.getSouth()).lte('lat', bounds.getNorth())
        .gte('lon', bounds.getWest()).lte('lon', bounds.getEast())
        .limit(zoom < CICLABILI_ZOOM_LOCALI ? 120 : 200);

      if (!ciclabiliLayerRef.current) ciclabiliLayerRef.current = creaGruppoPercorsi('#ea580c', CICLABILI_ZOOM_LOCALI);
      if (!ciclabiliLineeRef.current) ciclabiliLineeRef.current = L.layerGroup();
      const group = ciclabiliLayerRef.current;
      const linee = ciclabiliLineeRef.current;
      group.clearLayers();
      linee.clearLayers();

      for (const c of data || []) {
        const emojiFonte = c.source === 'osm_mtb' ? '🚵' : '🚲';
        const icon = L.divIcon({
          html: cerchioMarker(emojiFonte),
          className: 'wip-ciclabile-marker',
          ...cerchioMarkerOpts(),
        });
        L.marker([Number(c.lat), Number(c.lon)], { icon })
          .bindPopup(`<div style="font-family:system-ui,sans-serif;min-width:150px;max-width:230px;">
            <div style="font-size:12px;font-weight:700;color:#111827;">${emojiFonte} ${escapeHtml(c.name || '')}</div>
            <div style="font-size:11px;color:#374151;margin-top:3px;">${escapeHtml(c.description_short || '')}</div>
            <div style="font-size:9px;color:#6b7280;margin-top:4px;">${getTranslation('mp_punto_partenza_osm', language)}</div>
          </div>`)
          .addTo(group);
      }

      const nomi = new Map<string, string>((data || []).map((c: any) => [String(c.id), String(c.name || '')]));
      const livelloBici = livelloDaZoom(zoom);
      if (livelloBici) {
        const lineeBici = await fetchRouteLines(
          bounds, ['bici'],
          livelloBici === 'regionale' ? 60 : livelloBici === 'medio' ? 120 : 150,
          livelloBici === 'medio' ? 2 : 1,
          livelloBici,
        );
        drawRouteLines(linee, lineeBici, '#ea580c', nomi);
        if (livelloBici === 'pieno') {
          for (const l of lineeBici) {
            if (l.stops?.length) drawRouteStops(linee, l.stops, '#ea580c', nomi.get(l.poiId));
          }
        }
      }
      if (zoom >= CICLABILI_MIN_ZOOM) {
        if (!map.hasLayer(group)) group.addTo(map);
        if (!map.hasLayer(linee)) linee.addTo(map);
      }
    } catch (e) {
      console.warn('[Ciclabili] fetch fallito:', e);
    } finally {
      setCiclabiliLoading(false);
    }
  }, [language]);

  useEffect(() => {
    const map = mapRef.current;
    const spegniBici = () => {
      for (const r of [ciclabiliLayerRef, ciclabiliLineeRef]) {
        if (map && r.current && map.hasLayer(r.current)) map.removeLayer(r.current);
      }
    };
    if (!ciclabiliActive) {
      spegniBici();
      setRouteAttribution(map, ATTRIB_SENTIERI, false);
      return;
    }
    if (!map) return;
    setRouteAttribution(map, ATTRIB_SENTIERI, true);
    const aggiorna = () => {
      setZoomCorrente(map.getZoom());
      if (map.getZoom() < CICLABILI_MIN_ZOOM) { spegniBici(); return; }
      void caricaCiclabili(map.getBounds());
    };
    aggiorna();
    map.on('moveend', aggiorna);
    return () => { map.off('moveend', aggiorna); };
  }, [ciclabiliActive, caricaCiclabili]);

  // ── VINO E GUSTO ──────────────────────────────────────────────────────
  //
  // 199.280 luoghi del gusto e ~390 percorsi. Sta accanto ai sentieri nel
  // pannello ⓘ, e NON è una chip: non è patrimonio culturale, è un
  // verticale a sé che si accende quando serve. Una cantina non deve
  // comparire fra i monumenti solo perché è nel raggio del radar.
  //
  // Tre livelli, per zoom crescente — stessa logica dei sentieri, dove da
  // lontano si vedono solo le reti internazionali:
  //  · zoom ≥5  le STRADE: catalogo curato (nel codice, quindi anche
  //             offline) + le 156 relazioni OSM + le 96 dalle directory.
  //  · zoom ≥11 i PRODUTTORI: cantine, caseifici, frantoi, birrifici,
  //             distillerie, vigneti — dove il prodotto nasce.
  //  · zoom ≥14 le BOTTEGHE: enoteche, gastronomie, pasticcerie,
  //             torrefazioni. Sono 130.000: hanno senso a piedi, non prima.
  const [stradeGustoActive, setStradeGustoActive] = useState(() => {
    try { return localStorage.getItem('wip_strade_gusto_enabled') === '1'; } catch { return false; }
  });
  const [stradeGustoLoading, setStradeGustoLoading] = useState(false);
  const stradeGustoLayerRef = useRef<L.LayerGroup | null>(null);
  const stradeGustoLineeRef = useRef<L.LayerGroup | null>(null);
  // BUGFIX 26/08/2026: stessa correzione di SENTIERI_MIN_ZOOM sopra.
  const STRADE_GUSTO_MIN_ZOOM = 2;
  const GUSTO_PRODUTTORI_ZOOM = 11;
  const GUSTO_BOTTEGHE_ZOOM = 14;
  // Come per i sentieri: sotto questo zoom una pallina bordeaux col numero
  // di strade e cantine, sopra i pin singoli e i tracciati.
  const GUSTO_ZOOM_APERTURA = 12;
  // Zone di denominazione (AVA, aree UE derivate): confini, non pin.
  const GUSTO_AREE_ZOOM = 8;

  const toggleStradeGusto = useCallback(() => {
    setStradeGustoActive((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('wip_strade_gusto_enabled', next ? '1' : '0');
        // (28/08/2026, collaudo) IL LIVELLO MOSTRA, NON RACCONTA. Prima qui si
        // scriveva `enogastronomia: true` in wip_active_subcategories — l'oggetto
        // che il servizio nativo legge come «categorie da raccontare» — e chi
        // accendeva le strade del vino PER VEDERLE si sentiva partire
        // l'audioguida di una pasticceria (Martinelli, Carrara). Le categorie
        // dell'audioguida le decide SOLO il setup (Profilo → GeoControl).
      } catch { /* storage pieno */ }
      return next;
    });
  }, []);

  const caricaStradeGusto = useCallback(async (bounds: L.LatLngBounds) => {
    const map = mapRef.current;
    if (!map) return;
    setStradeGustoLoading(true);
    try {
      if (!stradeGustoLayerRef.current) stradeGustoLayerRef.current = creaGruppoPercorsi('#7f1d1d', GUSTO_ZOOM_APERTURA);
      if (!stradeGustoLineeRef.current) stradeGustoLineeRef.current = L.layerGroup();
      const group = stradeGustoLayerRef.current;
      const linee = stradeGustoLineeRef.current;
      group.clearLayers();
      linee.clearLayers();

      // 1) Catalogo curato: nessuna rete, sempre disponibile.
      const curate = tasteRoutesInBounds(bounds.getSouth(), bounds.getWest(), bounds.getNorth(), bounds.getEast());
      for (const r of curate) {
        const icon = L.divIcon({
          html: cerchioMarker(r.emoji, 30, 17),
          className: 'wip-strada-gusto-marker',
          ...cerchioMarkerOpts(30),
        });
        const tappe = r.stops
          .map((s) => `<li style="margin:1px 0;">${escapeHtml(s.place)} — ${escapeHtml(s.what)}</li>`)
          .join('');
        const mezzo = { auto: 'in auto', bici: 'in bici', treno: 'in treno', piedi: 'a piedi', navetta: 'in navetta', barca: 'in barca' }[r.transport];
        L.marker([r.coords.lat, r.coords.lon], { icon })
          .bindPopup(`<div style="font-family:system-ui,sans-serif;min-width:210px;max-width:280px;">
            <div style="font-size:12.5px;font-weight:800;color:#7f1d1d;">${r.emoji} ${escapeHtml(r.name)}</div>
            <div style="font-size:10.5px;color:#6b7280;margin-top:2px;">${escapeHtml(r.region)}, ${escapeHtml(r.country)} · ${r.days} ${r.days === 1 ? 'giorno' : 'giorni'} ${mezzo} · ${TASTE_KIND_LABELS[r.kind].label}</div>
            <div style="font-size:11px;color:#111827;margin-top:5px;"><b>${escapeHtml(r.products)}</b></div>
            <ol style="font-size:10.5px;color:#374151;margin:5px 0 0 14px;padding:0;">${tappe}</ol>
            <div style="font-size:10px;color:#6b7280;margin-top:5px;">${escapeHtml(r.season)}</div>
          </div>`, { maxHeight: 260 })
          .addTo(group);
      }

      // 2) I percorsi importati (relazioni OSM + directory ufficiali).
      const { data: percorsi } = await supabase
        .from('shared_pois')
        .select('id,name,lat,lon,description_short,contact_website,is_hidden,status')
        .eq('poi_type', 'strada_del_vino')
        .gte('lat', bounds.getSouth()).lte('lat', bounds.getNorth())
        .gte('lon', bounds.getWest()).lte('lon', bounds.getEast())
        .limit(150);
      for (const s of percorsi || []) {
        if (s.is_hidden === true || s.status === 'needs_revision') continue;
        const icon = L.divIcon({
          html: cerchioMarker('🍇', MARKER_CERCHIO_PX, 14, 'opacity:.85'),
          className: 'wip-strada-osm-marker',
          ...cerchioMarkerOpts(),
        });
        L.marker([Number(s.lat), Number(s.lon)], { icon })
          .bindPopup(`<div style="font-family:system-ui,sans-serif;min-width:150px;max-width:240px;">
            <div style="font-size:12px;font-weight:700;color:#111827;">🍇 ${escapeHtml(s.name || '')}</div>
            <div style="font-size:11px;color:#374151;margin-top:3px;">${escapeHtml(s.description_short || '')}</div>
            ${s.contact_website ? `<a href="${escapeHtml(s.contact_website)}" target="_blank" rel="noopener" style="font-size:10px;color:#7f1d1d;font-weight:700;display:block;margin-top:4px;">${getTranslation('mp_sito_ufficiale', language)} ↗</a>` : ''}
            <div style="font-size:9px;color:#6b7280;margin-top:4px;">${getTranslation('mp_punto_partenza_percorso', language)}</div>
          </div>`)
          .addTo(group);
      }

      // 2-bis) I TRACCIATI. Le strade del gusto non esistono su OSM come
      // percorso: la linea è calcolata col routing FRA LE TAPPE, sul grafo
      // giusto (auto, bici, piedi), quindi segue strade vere e non taglia
      // per i campi. Dove il mezzo è il treno o la barca il routing
      // mentirebbe: quelle righe hanno profile='dritta' e drawRouteLines le
      // disegna grigie e tratteggiate, senza spacciarle per un percorso.
      const nomiGusto = new Map<string, string>([
        ...curate.map((r) => [r.id, r.name] as [string, string]),
        ...(percorsi || []).map((s: any) => [String(s.id), String(s.name || '')] as [string, string]),
      ]);
      // I tracciati arrivano quando il gruppo si apre, come per i sentieri.
      // Le 154 curate stanno nel CODICE (158 KB): una strada del vino si
      // percorre in campagna, dove il campo manca, e vedere i pin senza la
      // linea proprio lì sarebbe il difetto peggiore.
      const zoomGusto = map.getZoom();
      const livelloGusto = livelloDaZoom(zoomGusto);
      if (livelloGusto) {
        // Le 154 curate stanno nel codice: si disegnano sempre per intero,
        // sono poche e non costano rete.
        drawRouteLines(linee, curate.flatMap((r) => {
          const t = TASTE_ROUTE_LINES[r.id];
          if (!t) return [];
          return [{ poiId: r.id, kind: 'gusto', profile: t.p, segments: decodeSegments(t.l), km: t.km }];
        }), '#7f1d1d', nomiGusto);
        // Le TAPPE delle strade curate: sono nel catalogo, con giorno e
        // motivo della sosta. Da zoom 13, come per i sentieri.
        if (livelloGusto === 'pieno') {
          for (const r of curate) {
            if (!r.stops?.length) continue;
            drawRouteStops(linee, r.stops.map((s, i) => ({
              n: i + 1, luogo: s.place, lat: s.lat, lon: s.lon,
              note: `Giorno ${s.day} · ${s.what}`,
            })), '#7f1d1d', r.name);
          }
        }
        // Dal DB solo le relazioni OSM: le curate le abbiamo già disegnate.
        const lineeGusto = await fetchRouteLines(bounds, ['gusto_osm'], 120, 1, livelloGusto);
        drawRouteLines(linee, lineeGusto, '#7f1d1d', nomiGusto);
      }

      // 3) I luoghi del gusto. Due livelli per zoom: prima i produttori
      // (dove nasce), poi anche le botteghe (dove si compra).
      const zoom = map.getZoom();
      if (zoom >= GUSTO_PRODUTTORI_ZOOM) {
        const tipi = zoom >= GUSTO_BOTTEGHE_ZOOM
          ? [...ENO_PRODUTTORI, ...ENO_BOTTEGHE]
          : ENO_PRODUTTORI;
        const { data: luoghi } = await supabase
          .from('shared_pois')
          .select('id,name,lat,lon,poi_type,description_short,contact_website,contact_phone,is_hidden,status')
          .eq('category', 'enogastronomia')
          .in('poi_type', tipi)
          .gte('lat', bounds.getSouth()).lte('lat', bounds.getNorth())
          .gte('lon', bounds.getWest()).lte('lon', bounds.getEast())
          .limit(zoom >= GUSTO_BOTTEGHE_ZOOM ? 350 : 200);
        for (const p of luoghi || []) {
          if (p.is_hidden === true || p.status === 'needs_revision') continue;
          const emoji = SUB_CATEGORY_EMOJIS[String(p.poi_type)] || '🍷';
          const produttore = ENO_PRODUTTORI.includes(String(p.poi_type));
          const icon = L.divIcon({
            // I produttori sono più grandi e pieni, le botteghe più discrete:
            // a colpo d'occhio si distingue dove si visita da dove si compra.
            // Mai sotto i 28 px (UX-14).
            html: cerchioMarker(emoji, produttore ? 30 : MARKER_CERCHIO_PX, produttore ? 16 : 13, produttore ? '' : 'opacity:.75'),
            className: 'wip-gusto-marker',
            ...cerchioMarkerOpts(produttore ? 30 : MARKER_CERCHIO_PX),
          });
          L.marker([Number(p.lat), Number(p.lon)], { icon })
            .bindPopup(`<div style="font-family:system-ui,sans-serif;min-width:150px;max-width:240px;">
              <div style="font-size:12px;font-weight:700;color:#111827;">${emoji} ${escapeHtml(p.name || '')}</div>
              <div style="font-size:11px;color:#374151;margin-top:3px;">${escapeHtml(p.description_short || '')}</div>
              ${p.contact_website ? `<a href="${escapeHtml(p.contact_website)}" target="_blank" rel="noopener" style="font-size:10px;color:#7f1d1d;font-weight:700;display:block;margin-top:4px;">${getTranslation('mp_sito', language)} ↗</a>` : ''}
              ${p.contact_phone ? `<div style="font-size:10px;color:#6b7280;margin-top:2px;">${escapeHtml(p.contact_phone)}</div>` : ''}
              <div style="font-size:9px;color:#6b7280;margin-top:4px;">${getTranslation('mp_verifica_orari_osm', language)}</div>
            </div>`)
            .addTo(group);
        }
      }

      // 4) LE ZONE DI DENOMINAZIONE (27/08/2026). Dove un confine esiste in
      // forma aperta si disegna: le AVA americane (ufficiali, CC0) e le aree
      // UE derivate dai comuni collegati su Wikidata (indicative, e il popup
      // lo dice). Campitura bordeaux leggera sotto le linee delle strade, da
      // zoom 8: più lontano una regione vinicola è una macchia senza nome.
      if (map.getZoom() >= GUSTO_AREE_ZOOM) {
        const aree = await fetchAreeDenominazioni({
          south: bounds.getSouth(), west: bounds.getWest(), north: bounds.getNorth(), east: bounds.getEast(),
        });
        for (const a of aree) {
          if (!a.geom) continue;
          const ufficiale = a.qualita === 'ufficiale';
          const poly = L.geoJSON(a.geom, {
            style: { color: '#7f1d1d', weight: ufficiale ? 1.2 : 0.8, opacity: 0.7, dashArray: ufficiale ? undefined : '4 4', fillColor: '#9f1239', fillOpacity: 0.07 },
            interactive: true,
          });
          poly.bindPopup(`<div style="font-family:system-ui,sans-serif;min-width:160px;max-width:240px;">
              <div style="font-size:12px;font-weight:800;color:#7f1d1d;">🍷 ${escapeHtml(a.nome)}${a.tipo ? ` <span style="font-size:9px;color:#9f1239;">${escapeHtml(a.tipo)}</span>` : ''}</div>
              <div style="font-size:11px;color:#374151;margin-top:3px;">${getTranslation('mp_denominazione_area', language)}${a.area_kmq ? ` · ${Math.round(a.area_kmq).toLocaleString()} km²` : ''}</div>
              <div style="font-size:10px;color:${ufficiale ? '#166534' : '#9a3412'};margin-top:2px;">${getTranslation(ufficiale ? 'mp_area_ufficiale' : 'mp_area_indicativa', language)}</div>
              ${a.url ? `<a href="${escapeHtml(a.url)}" target="_blank" rel="noopener" style="font-size:10px;color:#7f1d1d;font-weight:700;display:block;margin-top:4px;">${getTranslation('mp_sito_ufficiale', language)} ↗</a>` : ''}
              ${a.attribuzione ? `<div style="font-size:9px;color:#6b7280;margin-top:4px;line-height:1.3;">${escapeHtml(a.attribuzione)}</div>` : ''}
            </div>`);
          linee.addLayer(poly);
        }
      }

      if (map.getZoom() >= STRADE_GUSTO_MIN_ZOOM) {
        if (!map.hasLayer(group)) group.addTo(map);
        if (!map.hasLayer(linee)) linee.addTo(map);
      }
    } catch (e) {
      console.warn('[StradeGusto] fetch fallito:', e);
    } finally {
      setStradeGustoLoading(false);
    }
  }, [language]);

  useEffect(() => {
    const map = mapRef.current;
    const spegniGusto = () => {
      for (const r of [stradeGustoLayerRef, stradeGustoLineeRef]) {
        if (map && r.current && map.hasLayer(r.current)) map.removeLayer(r.current);
      }
    };
    if (!stradeGustoActive) {
      spegniGusto();
      setRouteAttribution(map, ATTRIB_GUSTO, false);
      return;
    }
    if (!map) return;
    setRouteAttribution(map, ATTRIB_GUSTO, true);
    const aggiorna = () => {
      if (map.getZoom() < STRADE_GUSTO_MIN_ZOOM) {
        spegniGusto();
        return;
      }
      void caricaStradeGusto(map.getBounds());
    };
    aggiorna();
    map.on('moveend', aggiorna);
    return () => { map.off('moveend', aggiorna); };
  }, [stradeGustoActive, caricaStradeGusto]);

  // ── Neve: località sciistiche e rifugi ────────────────────────────────
  // 32.789 località importate da OSM in tutto il mondo: 3.620 comprensori,
  // 17.346 stazioni di impianti, 11.823 rifugi alpini. Il pin mostra il
  // luogo; le condizioni (temperatura, neve prevista) si chiedono a MET
  // Norway solo quando si apre la scheda — sono dati orari, non si importano.
  const [neveLoading, setNeveLoading] = useState(false);
  const neveLayerRef = useRef<L.LayerGroup | null>(null);
  // Le piste sono linee, non pin: gruppo a parte come per gli altri layer.
  const neveLineeRef = useRef<L.LayerGroup | null>(null);
  // BUGFIX 26/08/2026: stessa correzione di SENTIERI_MIN_ZOOM sopra.
  const NEVE_MIN_ZOOM = 2;

  // ── Copertura neve reale (NASA GIBS MODIS/Terra NDSI Snow Cover, 26/08/2026) ──
  // L'utente ha chiesto: i pin di comprensori/impianti/rifugi dicono DOVE si
  // scia, non SE nevica lì adesso. Prima non c'era nessuna fonte di
  // innevamento: MET Norway (già usata per le condizioni al pin) non ha
  // affatto un campo neve, restituisce solo temperatura. Questo overlay
  // satellitare è gratis, senza chiave, licenza pubblica NASA — ma resta un
  // "sì c'è neve / no non c'è" a 500 m di risoluzione, aggiornato una volta
  // al giorno, non i centimetri in tempo reale (quello richiederebbe una
  // fonte a pagamento o una pipeline di rianalisi, valutato e rimandato).
  const neveModisRef = useRef<L.TileLayer | null>(null);
  // GoogleMapsCompatible_Level8: il tile set nativo del layer (da GetCapabilities
  // GIBS), oltre non ha più dettaglio da dare, solo lo stesso tile ingrandito.
  const NEVE_MODIS_MAX_NATIVE_ZOOM = 8;
  /** T-2: il giorno più recente quasi sempre già processato ed elaborato
   * (T-0/T-1 spesso restituiscono un tile vuoto perché la pipeline NASA non
   * ha ancora finito). */
  function dataModisNeve(): string {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 2);
    return d.toISOString().slice(0, 10);
  }

  const toggleNeve = useCallback(() => {
    setNeveActive((prev) => {
      const next = !prev;
      try { localStorage.setItem('wip_neve_enabled', next ? '1' : '0'); } catch { /* storage pieno */ }
      return next;
    });
  }, []);

  const caricaNeve = useCallback(async (bounds: L.LatLngBounds) => {
    const map = mapRef.current;
    if (!map) return;
    setNeveLoading(true);
    try {
      const { data } = await supabase
        .from('utility_pois')
        .select('id,name,lat,lon,sub_category')
        .eq('category', 'neve')
        .gte('lat', bounds.getSouth()).lte('lat', bounds.getNorth())
        .gte('lon', bounds.getWest()).lte('lon', bounds.getEast())
        .limit(150);
      if (!neveLayerRef.current) neveLayerRef.current = L.layerGroup();
      const group = neveLayerRef.current;
      group.clearLayers();
      const emoji: Record<string, string> = {
        comprensorio_sci: '⛷', impianto_risalita: '🚡', rifugio_alpino: '🏔',
        pista_sci: '🎿',
      };
      const etichetta: Record<string, string> = {
        comprensorio_sci: getTranslation('mp_comprensorio_sci', language),
        impianto_risalita: getTranslation('mp_impianto_risalita', language),
        rifugio_alpino: getTranslation('mp_rifugio_alpino', language),
        pista_sci: getTranslation('mp_pista_sci', language),
      };
      for (const l of data || []) {
        const sub = String(l.sub_category || '');
        const icon = L.divIcon({
          html: cerchioMarker(emoji[sub] || '❄️'),
          className: 'wip-neve-marker',
          ...cerchioMarkerOpts(),
        });
        const marker = L.marker([Number(l.lat), Number(l.lon)], { icon });
        marker.bindPopup(`<div style="font-family:system-ui,sans-serif;min-width:170px;max-width:230px;">
          <div style="font-size:12px;font-weight:700;color:#111827;">${emoji[sub] || '❄️'} ${escapeHtml(l.name || '')}</div>
          <div style="font-size:11px;color:#374151;margin-top:2px;">${escapeHtml(etichetta[sub] || '')}</div>
          <div id="neve-${escapeHtml(String(l.id))}" style="font-size:11px;color:#0369a1;margin-top:5px;font-weight:700;">…</div>
          <div id="valanghe-${escapeHtml(String(l.id))}" style="font-size:11px;margin-top:4px;"></div>
          <div style="font-size:9px;color:#6b7280;margin-top:4px;">${getTranslation('mp_osm_contributori', language)} · MET Norway</div>
        </div>`);
        // Le condizioni si chiedono solo all'apertura: 150 pin non devono
        // valere 150 chiamate.
        marker.on('popupopen', async () => {
          const box = document.getElementById(`neve-${l.id}`);
          if (!box) return;
          // Pericolo valanghe (avalanche.report, solo Euregio): parte insieme
          // alle condizioni, e fuori dall'Euregio il server risponde subito
          // "dentro:false" senza scaricare nulla — la riga resta vuota.
          void fetchValanghe(Number(l.lat), Number(l.lon), language).then((v) => {
            const riga = document.getElementById(`valanghe-${l.id}`);
            if (!riga || !riga.isConnected || !v?.dentro || !v.pericolo) return;
            const liv = Math.max(0, Math.min(5, Number(v.pericolo.livello) || 0));
            riga.innerHTML = `<span style="display:inline-block;width:10px;height:10px;border-radius:5px;background:${VALANGHE_COLORE[liv]};vertical-align:middle;margin-right:5px;"></span>`
              + `<b>${getTranslation('mp_valanghe', language)}: ${liv} · ${getTranslation(`mp_valanghe_${liv}`, language)}</b>`
              + (v.stagione_attiva ? '' : `<div style="font-size:9px;color:#9a3412;margin-top:1px;">${getTranslation('mp_valanghe_fuori_stagione', language)}</div>`)
              + `<div style="font-size:9px;color:#6b7280;margin-top:1px;"><a href="${escapeHtml(String(v.url || 'https://avalanche.report'))}" target="_blank" rel="noopener" style="color:#6b7280;">${getTranslation('mp_valanghe_fonte', language)}</a></div>`;
          });
          const d = await fetchDatiSole(Number(l.lat), Number(l.lon));
          if (!box.isConnected) return;
          box.textContent = d
            ? `${Math.round(d.temperatura)}°C${d.percepita ? ` · ${getTranslation('mp_percepiti', language)} ${Math.round(d.percepita)}°` : ''}`
            : getTranslation('mp_condizioni_non_disponibili', language);
        });
        group.addLayer(marker);
      }

      // LE PISTE, disegnate. Un comprensorio è un punto; la pista è una
      // linea, ed è quella che dice davvero com'è messa la montagna — dove
      // scende, quanto è lunga, se ti porta dove vuoi tornare. Azzurro
      // ghiaccio, che sulla neve del fondo mappa si vede e non si confonde
      // né col verde dei sentieri né con l'arancione delle ciclabili.
      const livelloNeve = livelloDaZoom(map.getZoom());
      if (livelloNeve) {
        if (!neveLineeRef.current) neveLineeRef.current = L.layerGroup();
        const lineeNeve = neveLineeRef.current;
        lineeNeve.clearLayers();
        const nomiNeve = new Map<string, string>(
          (data || []).map((l: any) => [String(l.id), String(l.name || '')]),
        );
        const tracce = await fetchRouteLines(
          bounds, ['neve'],
          livelloNeve === 'regionale' ? 40 : 120,
          livelloNeve === 'medio' ? 2 : 1,
          livelloNeve,
        );
        drawRouteLines(lineeNeve, tracce, '#38bdf8', nomiNeve);
        if (!map.hasLayer(lineeNeve) && map.getZoom() >= NEVE_MIN_ZOOM) lineeNeve.addTo(map);
      }
      if (!map.hasLayer(group) && map.getZoom() >= NEVE_MIN_ZOOM) group.addTo(map);
    } catch (e) {
      console.warn('[Neve] fetch fallito:', e);
    } finally {
      setNeveLoading(false);
    }
  }, [language]);

  useEffect(() => {
    const map = mapRef.current;
    const spegniNeve = () => {
      for (const r of [neveLayerRef, neveLineeRef, neveModisRef]) {
        if (map && r.current && map.hasLayer(r.current)) map.removeLayer(r.current);
      }
    };
    if (!neveActive) { spegniNeve(); return; }
    if (!map) return;
    // La copertura satellitare è un vero TileLayer Leaflet: si crea una
    // volta sola e poi carica le tessere da sé man mano che la mappa si
    // sposta, come il fondo mappa — a differenza dei pin/piste sopra non
    // serve un fetch legato a moveend.
    if (!neveModisRef.current) {
      neveModisRef.current = L.tileLayer(
        `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_NDSI_Snow_Cover/default/${dataModisNeve()}/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png`,
        {
          maxNativeZoom: NEVE_MODIS_MAX_NATIVE_ZOOM,
          opacity: 0.55,
          attribution: 'NASA GIBS · MODIS Terra NDSI Snow Cover',
        },
      );
    }
    if (!map.hasLayer(neveModisRef.current)) neveModisRef.current.addTo(map);
    const aggiorna = () => {
      setZoomCorrente(map.getZoom());
      if (map.getZoom() < NEVE_MIN_ZOOM) { spegniNeve(); return; }
      void caricaNeve(map.getBounds());
    };
    aggiorna();
    map.on('moveend', aggiorna);
    return () => { map.off('moveend', aggiorna); };
  }, [neveActive, caricaNeve]);

  // ── Sole: UV e caldo percepito (src/lib/sunIndex.ts) ──────────────────
  // Sostituisce l'avviso ZTL, tolto il 19/08/2026: scattava solo sopra i
  // 20 km/h, quindi chi visita a piedi — cioè chiunque usi un'audioguida —
  // non lo vedeva mai, e per farlo bene servirebbero varchi e orari che
  // un'app che non è un navigatore non ha. Il codice resta in ztlAlert.ts.
  const [soleActive, setSoleActive] = useState(() => {
    try { return localStorage.getItem('wip_sole_enabled') === '1'; } catch { return false; }
  });
  const [soleLoading, setSoleLoading] = useState(false);
  const [datiSole, setDatiSole] = useState<DatiSole | null>(null);
  // Orari di alba/tramonto/ora d'oro: calcolo locale, nessuna chiamata.
  const [oreLuce, setOreLuce] = useState<OrariSole | null>(null);
  // Il fuso del punto guardato: gli orari si mostrano nell'ora locale del
  // luogo, non in quella del telefono (Miami dall'Italia diceva 01:00).
  const [fusoSole, setFusoSole] = useState<string | null>(null);

  const toggleSole = useCallback(() => {
    setSoleActive((prev) => {
      const next = !prev;
      try { localStorage.setItem('wip_sole_enabled', next ? '1' : '0'); } catch { /* storage pieno */ }
      if (!next) setDatiSole(null);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!soleActive) return;
    let vivo = true;
    const carica = async () => {
      const map = mapRef.current;
      if (!map) return;
      const c = map.getCenter();
      // Gli orari del Sole non passano dalla rete: si calcolano subito, così
      // la scheda ha già qualcosa da mostrare mentre arriva l'UV.
      setOreLuce(orariSole(c.lat, c.lng));
      setFusoSole(fusoDelPunto(c.lat, c.lng));
      setSoleLoading(true);
      const d = await fetchDatiSole(c.lat, c.lng);
      if (vivo) { setDatiSole(d); setSoleLoading(false); }
    };
    carica();
    // Si aggiorna quando ci si sposta parecchio e comunque ogni mezz'ora.
    const map = mapRef.current;
    const onMoveEnd = () => { void carica(); };
    map?.on('moveend', onMoveEnd);
    const timer = setInterval(carica, 30 * 60 * 1000);
    return () => {
      vivo = false;
      map?.off('moveend', onMoveEnd);
      clearInterval(timer);
    };
  }, [soleActive]);

  // ── Allarme ZTL (src/lib/ztlAlert.ts) ─────────────────────────────────
  // Toggle 🚫 nei controlli mappa: in auto (>20 km/h) avvisa quando la
  // posizione (o la proiezione 150 m avanti) entra in una zona a traffico
  // limitato mappata su OSM. Persistente ma default OFF.
  const [ztlActive, setZtlActive] = useState(() => {
    try { return localStorage.getItem('wip_ztl_enabled') === '1'; } catch { return false; }
  });
  const [ztlBanner, setZtlBanner] = useState<{ name: string; pre: boolean } | null>(null);
  // Disclaimer una tantum sulla copertura OSM (flag localStorage)
  const [ztlDisclaimer, setZtlDisclaimer] = useState(false);
  const ztlLayerRef = useRef<L.LayerGroup | null>(null);
  // Centro dell'ultimo fetch perimetri: sopra 5 km di pan si ricarica
  const ztlCenterRef = useRef<{ lat: number; lon: number } | null>(null);
  const ztlBannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Retry se la mappa non è ancora pronta (ripristino da localStorage al mount)
  const [ztlTick, setZtlTick] = useState(0);

  const onZtlAlert = useCallback((ev: ZtlAlertEvent) => {
    // I nomi OSM spesso iniziano già con "ZTL" ("ZTL Centro Storico"):
    // si toglie il prefisso per non leggere "ZTL ZTL ..." nel banner
    const cleanName = ev.zone.name.replace(/^\s*(ZTL|Zona a Traffico Limitato)\s*[-–:]*\s*/i, '').trim();
    setZtlBanner({ name: cleanName, pre: ev.preWarning });
    if (ztlBannerTimerRef.current) clearTimeout(ztlBannerTimerRef.current);
    ztlBannerTimerRef.current = setTimeout(() => setZtlBanner(null), 15000);
    // Vibrazione: arriva anche con lo schermo in tasca (haptics nativi su
    // iOS, dove navigator.vibrate non esiste — UX-08)
    vibra('errore');
    // Beep vocale SOLO se non interferisce con audio già in corso
    // (audioguida in riproduzione/caricata o TTS già attivo → solo banner+vibrazione)
    try {
      const audio = locationService.getAudioState();
      if (!audio.isPlaying && !audio.isActive &&
          'speechSynthesis' in window && !window.speechSynthesis.speaking) {
        const u = new SpeechSynthesisUtterance(
          getTranslation('mp_ztl_vocale', language)
        );
        // BCP-47 della lingua UI: la voce di sintesi deve parlare la lingua
        // della frase, non sempre italiano/inglese.
        const bcp47: Record<Language, string> = {
          IT: 'it-IT', EN: 'en-US', FR: 'fr-FR', ES: 'es-ES',
          DE: 'de-DE', RU: 'ru-RU', ZH: 'zh-CN',
        };
        u.lang = bcp47[language] || 'en-US';
        u.rate = 1;
        window.speechSynthesis.speak(u);
      }
    } catch { /* TTS best-effort: il banner resta comunque */ }
  }, [language]);

  const toggleZtl = useCallback(() => {
    setZtlActive((prev) => {
      const next = !prev;
      try { localStorage.setItem('wip_ztl_enabled', next ? '1' : '0'); } catch { /* storage pieno */ }
      // Onestà sulla copertura: al primo ON, disclaimer una tantum
      if (next) {
        try {
          if (localStorage.getItem('wip_ztl_disclaimer_shown') !== '1') {
            localStorage.setItem('wip_ztl_disclaimer_shown', '1');
            setZtlDisclaimer(true);
            setTimeout(() => setZtlDisclaimer(false), 12000);
          }
        } catch { /* senza storage il disclaimer riapparirà: accettabile */ }
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (!ztlActive) return;
    startZtlWatch(onZtlAlert);
    const map = mapRef.current;
    if (!map) {
      // Toggle ripristinato prima che Leaflet esista: riprova a breve
      const retry = setTimeout(() => setZtlTick((t) => t + 1), 500);
      return () => { clearTimeout(retry); stopZtlWatch(); };
    }
    // Disegno dei perimetri vicini in rosso translucido (best-effort:
    // se Overpass è giù il watch resta comunque attivo e riproverà da sé)
    const loadZones = async (lat: number, lon: number) => {
      try {
        const zones = await fetchZtlZonesAround(lat, lon);
        if (!ztlLayerRef.current) ztlLayerRef.current = L.layerGroup();
        const group = ztlLayerRef.current;
        group.clearLayers();
        for (const z of zones) {
          for (const ring of z.rings) {
            const poly = L.polygon(ring, {
              color: '#dc2626',
              weight: 1.5,
              opacity: 0.7,
              fillColor: '#dc2626',
              fillOpacity: 0.15,
            });
            poly.bindTooltip(`🚫 ${z.name}`, { sticky: true });
            group.addLayer(poly);
          }
        }
        if (!map.hasLayer(group)) group.addTo(map);
        ztlCenterRef.current = { lat, lon };
      } catch (e) {
        console.warn('[ZTL] fetch perimetri fallito:', e);
      }
    };
    try {
      const c = map.getCenter();
      loadZones(c.lat, c.lng);
    } catch { /* mappa non pronta: ci pensa il moveend */ }
    const onMoveEnd = () => {
      try {
        const c = map.getCenter();
        const last = ztlCenterRef.current;
        if (!last || getDistanceFromLatLonInM(last.lat, last.lon, c.lat, c.lng) > 5000) {
          loadZones(c.lat, c.lng);
        }
      } catch { /* bounds non pronti */ }
    };
    map.on('moveend', onMoveEnd);
    return () => {
      stopZtlWatch();
      map.off('moveend', onMoveEnd);
      if (ztlLayerRef.current && map.hasLayer(ztlLayerRef.current)) {
        map.removeLayer(ztlLayerRef.current);
      }
      if (ztlBannerTimerRef.current) clearTimeout(ztlBannerTimerRef.current);
      setZtlBanner(null);
    };
  }, [ztlActive, ztlTick, onZtlAlert]);

  // ── «Si può fare il bagno qui?» (src/lib/bathingWater.ts) ─────────────
  // Toggle 🏖 nei controlli mappa: marker colorati con la classificazione
  // annuale EEA delle acque di balneazione (dati aperti UE). Persistente,
  // default OFF. Copertura solo Europa: fuori arrivano 0 siti, in silenzio.
  // Il layer è visibile solo a zoom ≥9 (i siti sono puntuali).
  const BATHING_MIN_ZOOM = 9;
  // Atlante beni vincolati: 1,78 M di punti nel mondo. Sotto lo zoom 13
  // (scala di quartiere) sarebbero migliaia di pin sovrapposti su una query
  // inutilmente larga, quindi il layer semplicemente non si carica.
  const [bathingActive, setBathingActive] = useState(() => {
    try { return localStorage.getItem('wip_bathing_enabled') === '1'; } catch { return false; }
  });
  const [bathingLoading, setBathingLoading] = useState(false);
  // Toast una tantum sulla copertura europea (flag localStorage)
  const [bathingDisclaimer, setBathingDisclaimer] = useState(false);
  const bathingLayerRef = useRef<L.LayerGroup | null>(null);
  // Centro dell'ultimo fetch: sopra 10 km di pan il layer si aggiorna
  const bathingCenterRef = useRef<{ lat: number; lon: number } | null>(null);
  // Retry se la mappa non è ancora pronta (ripristino da localStorage al mount)
  const [bathingTick, setBathingTick] = useState(0);

  const loadBathingSites = useCallback(async (bounds: L.LatLngBounds) => {
    const map = mapRef.current;
    if (!map) return;
    setBathingLoading(true);
    try {
      const grezzi = await fetchBathingSites({
        south: bounds.getSouth(), west: bounds.getWest(),
        north: bounds.getNorth(), east: bounds.getEast(),
      });
      // La classificazione EEA dice se l'acqua è pulita, ma è annuale: la
      // domanda che uno si fa in spiaggia è "è calda? c'è mare mosso?".
      // Le misure dal vivo arrivano con UNA sola chiamata per tutte le
      // spiagge in vista, quindi costano quanto niente.
      const sites = await aggiungiMisure(grezzi);
      if (!bathingLayerRef.current) bathingLayerRef.current = L.layerGroup();
      const group = bathingLayerRef.current;
      group.clearLayers();
      for (const site of sites) {
        const color = BATHING_QUALITY_COLOR[site.quality];
        const icon = L.divIcon({
          // Pallino colorato dentro il cerchio bianco standard (28 px, UX-14):
          // il colore resta l'informazione, il bersaglio diventa toccabile.
          html: cerchioMarker(`<span style="display:block;width:14px;height:14px;border-radius:7px;background:${color};"></span>`),
          className: 'wip-bathing-marker',
          ...cerchioMarkerOpts(),
        });
        const marker = L.marker([site.lat, site.lon], { icon });
        // Le etichette bilingue di bathingWater.ts coprono solo it/en: le
        // 7 lingue stanno nel dizionario mp_acqua_* (una chiave per classe).
        const label = getTranslation(`mp_acqua_${site.quality}`, language);
        marker.bindPopup(
          `<div style="font-family:system-ui,sans-serif;min-width:150px;max-width:210px;">
            <div style="font-size:12px;font-weight:700;color:#111827;">🏖 ${escapeHtml(site.name)}</div>
            <div style="font-size:11px;color:#374151;margin-top:3px;display:flex;align-items:center;gap:5px;">
              <span style="display:inline-block;width:10px;height:10px;border-radius:5px;background:${color};flex:none;"></span>
              ${getTranslation('mp_qualita', language)} ${site.year}: <b>${label}</b>
            </div>
            ${site.temperatura !== undefined || site.onde !== undefined ? `
            <div style="font-size:12px;color:#0369a1;margin-top:5px;font-weight:700;display:flex;gap:10px;align-items:center;">
              ${site.temperatura !== undefined ? `<span>🌡 ${site.temperatura.toFixed(1)}°C</span>` : ''}
              ${site.onde !== undefined ? `<span>🌊 ${site.onde.toFixed(1)} m</span>` : ''}
            </div>
            <div style="font-size:9px;color:#6b7280;margin-top:2px;">${getTranslation('mp_acqua_onde_ora', language)}</div>` : ''}
            <div style="font-size:9px;color:#6b7280;margin-top:4px;line-height:1.3;">${getTranslation('mp_classificazione_eea', language)}</div>
          </div>`
        );
        group.addLayer(marker);
      }
      // Il fetch è async: nel frattempo l'utente può aver zoomato sotto soglia
      if (!map.hasLayer(group) && map.getZoom() >= BATHING_MIN_ZOOM) group.addTo(map);
      const c = bounds.getCenter();
      bathingCenterRef.current = { lat: c.lat, lon: c.lng };
    } catch (e) {
      // Servizio EEA giù: nessun crash, il layer resta com'era e si
      // riproverà al prossimo pan (fuori Europa NON si passa di qui:
      // arrivano semplicemente 0 siti)
      console.warn('[Balneazione] fetch EEA fallito:', e);
    } finally {
      setBathingLoading(false);
    }
  }, [language]);

  const toggleBathing = useCallback(() => {
    setBathingActive((prev) => {
      const next = !prev;
      try { localStorage.setItem('wip_bathing_enabled', next ? '1' : '0'); } catch { /* storage pieno */ }
      // Onestà sulla copertura: al primo ON, toast una tantum (solo Europa)
      if (next) {
        try {
          if (localStorage.getItem('wip_bathing_disclaimer_shown') !== '1') {
            localStorage.setItem('wip_bathing_disclaimer_shown', '1');
            setBathingDisclaimer(true);
            setTimeout(() => setBathingDisclaimer(false), 12000);
          }
        } catch { /* senza storage il toast riapparirà: accettabile */ }
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (!bathingActive) return;
    const map = mapRef.current;
    if (!map) {
      // Toggle ripristinato prima che Leaflet esista: riprova a breve
      const retry = setTimeout(() => setBathingTick((t) => t + 1), 500);
      return () => clearTimeout(retry);
    }
    const refresh = () => {
      try {
        if (map.getZoom() < BATHING_MIN_ZOOM) {
          // Zoom troppo largo: layer nascosto ma dati/centro conservati
          if (bathingLayerRef.current && map.hasLayer(bathingLayerRef.current)) {
            map.removeLayer(bathingLayerRef.current);
          }
          return;
        }
        if (bathingLayerRef.current && !map.hasLayer(bathingLayerRef.current)) {
          bathingLayerRef.current.addTo(map);
        }
        const c = map.getCenter();
        const last = bathingCenterRef.current;
        // Refresh solo su pan >10 km (le classificazioni non cambiano certo col pan)
        if (!last || getDistanceFromLatLonInM(last.lat, last.lon, c.lat, c.lng) > 10000) {
          loadBathingSites(map.getBounds());
        }
      } catch { /* bounds non pronti: ci pensa il prossimo moveend */ }
    };
    refresh();
    map.on('moveend', refresh);
    map.on('zoomend', refresh);
    return () => {
      map.off('moveend', refresh);
      map.off('zoomend', refresh);
      if (bathingLayerRef.current && map.hasLayer(bathingLayerRef.current)) {
        map.removeLayer(bathingLayerRef.current);
      }
      bathingCenterRef.current = null; // al riaccendersi si ricarica subito
    };
  }, [bathingActive, bathingTick, loadBathingSites]);

  // ── Aree protette: Natura 2000 + aree nazionali CDDA (EEA, CC BY 4.0) ──
  // 27/08/2026. Confini, non pin: un poligono per sito, colorato per tipo
  // (habitat / uccelli / nazionale). Stesso schema del layer balneazione:
  // default OFF, solo Europa, refresh su pan > 10 km. Zoom minimo 9: sotto,
  // un intero paese di poligoni sarebbe una macchia verde e una risposta da
  // megabyte.
  const AREE_MIN_ZOOM = 9;
  const AREE_ZOOM_FINE = 12;
  const [areeActive, setAreeActive] = useState(() => {
    try { return localStorage.getItem('wip_aree_enabled') === '1'; } catch { return false; }
  });
  const [areeLoading, setAreeLoading] = useState(false);
  const [areeDisclaimer, setAreeDisclaimer] = useState(false);
  const areeLayerRef = useRef<L.LayerGroup | null>(null);
  const areeCenterRef = useRef<{ lat: number; lon: number; fine: boolean } | null>(null);
  const [areeTick, setAreeTick] = useState(0);

  const loadAreeProtette = useCallback(async (bounds: L.LatLngBounds, fine: boolean) => {
    const map = mapRef.current;
    if (!map) return;
    setAreeLoading(true);
    try {
      const aree = await fetchAreeProtette({
        south: bounds.getSouth(), west: bounds.getWest(),
        north: bounds.getNorth(), east: bounds.getEast(),
      }, fine);
      if (!areeLayerRef.current) areeLayerRef.current = L.layerGroup();
      const group = areeLayerRef.current;
      group.clearLayers();
      for (const a of aree) {
        const colore = COLORE_AREA[a.tipo];
        const etichetta = a.tipo === 'n2k_habitat'
          ? getTranslation('mp_n2k_habitat', language)
          : a.tipo === 'n2k_uccelli'
            ? getTranslation('mp_n2k_uccelli', language)
            : `${getTranslation('mp_cdda_nazionale', language)}${a.iucn ? ` · IUCN ${escapeHtml(a.iucn)}` : ''}`;
        const link = a.tipo === 'nazionale' ? '' :
          `<div style="font-size:10px;margin-top:4px;"><a href="${schedaNatura2000(a.codice)}" target="_blank" rel="noopener" style="color:${colore};font-weight:700;">${getTranslation('mp_n2k_scheda', language)} ↗</a></div>`;
        const poly = L.geoJSON(a.geometry, {
          style: { color: colore, weight: 1.5, opacity: 0.9, fillColor: colore, fillOpacity: 0.12 },
          interactive: true,
        });
        poly.bindPopup(`<div style="font-family:system-ui,sans-serif;min-width:160px;max-width:230px;">
            <div style="font-size:12px;font-weight:700;color:#111827;">🌿 ${escapeHtml(a.nome)}</div>
            <div style="font-size:11px;color:#374151;margin-top:3px;display:flex;align-items:center;gap:5px;">
              <span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${colore};flex:none;"></span>
              ${etichetta}
            </div>
            ${a.kmq != null ? `<div style="font-size:11px;color:#374151;margin-top:2px;">${a.kmq} km² · ${escapeHtml(a.codice)}</div>` : ''}
            ${link}
            <div style="font-size:9px;color:#6b7280;margin-top:4px;line-height:1.3;">${getTranslation('mp_n2k_fonte', language)}</div>
          </div>`);
        group.addLayer(poly);
      }
      if (!map.hasLayer(group) && map.getZoom() >= AREE_MIN_ZOOM) group.addTo(map);
      const c = bounds.getCenter();
      areeCenterRef.current = { lat: c.lat, lon: c.lng, fine };
    } catch (e) {
      // EEA giù: il layer resta com'era, si riprova al prossimo pan
      console.warn('[Aree protette] fetch EEA fallito:', e);
    } finally {
      setAreeLoading(false);
    }
  }, [language]);

  const toggleAree = useCallback(() => {
    setAreeActive((prev) => {
      const next = !prev;
      try { localStorage.setItem('wip_aree_enabled', next ? '1' : '0'); } catch { /* storage pieno */ }
      if (next) {
        try {
          if (localStorage.getItem('wip_aree_disclaimer_shown') !== '1') {
            localStorage.setItem('wip_aree_disclaimer_shown', '1');
            setAreeDisclaimer(true);
            setTimeout(() => setAreeDisclaimer(false), 12000);
          }
        } catch { /* senza storage il toast riapparirà: accettabile */ }
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (!areeActive) return;
    const map = mapRef.current;
    if (!map) {
      const retry = setTimeout(() => setAreeTick((t) => t + 1), 500);
      return () => clearTimeout(retry);
    }
    const refresh = () => {
      try {
        if (map.getZoom() < AREE_MIN_ZOOM) {
          if (areeLayerRef.current && map.hasLayer(areeLayerRef.current)) map.removeLayer(areeLayerRef.current);
          return;
        }
        if (areeLayerRef.current && !map.hasLayer(areeLayerRef.current)) areeLayerRef.current.addTo(map);
        const c = map.getCenter();
        const fine = map.getZoom() >= AREE_ZOOM_FINE;
        const last = areeCenterRef.current;
        // Refresh su pan > 10 km o quando si passa alla precisione fine
        if (!last || last.fine !== fine || getDistanceFromLatLonInM(last.lat, last.lon, c.lat, c.lng) > 10000) {
          loadAreeProtette(map.getBounds(), fine);
        }
      } catch { /* bounds non pronti */ }
    };
    refresh();
    map.on('moveend', refresh);
    map.on('zoomend', refresh);
    return () => {
      map.off('moveend', refresh);
      map.off('zoomend', refresh);
      if (areeLayerRef.current && map.hasLayer(areeLayerRef.current)) map.removeLayer(areeLayerRef.current);
      areeCenterRef.current = null;
    };
  }, [areeActive, areeTick, loadAreeProtette]);

  // ── Meteo sulla mappa + modalità "al coperto" ─────────────────────────
  const [meteo, setMeteo] = useState<MeteoData | null>(null);
  const [indoorMode, setIndoorMode] = useState(false);
  const [rainBannerDismissed, setRainBannerDismissed] = useState(false);
  // Cella (1 decimale) dell'ultimo fetch riuscito: evita richieste a ogni pan
  const meteoKeyRef = useRef<string>("");

  const refreshMeteo = useCallback(async (lat: number, lon: number) => {
    const key = `${lat.toFixed(1)}_${lon.toFixed(1)}`;
    if (meteoKeyRef.current === key) return;
    const m = await fetchMeteoCached(lat, lon);
    if (m) {
      meteoKeyRef.current = key;
      setMeteo(m);
    }
  }, []);

  // Ritentativo finche' Leaflet non esiste (29/08/2026): l'effetto gira una
  // volta all'apertura del tab e, se la mappa non e` ancora creata, usciva
  // con `return` senza riprovare — il listener di moveend non veniva mai
  // agganciato e la chip meteo non compariva piu` (visto in produzione:
  // nessuna richiesta a /api/meteo/punto nemmeno spostando la mappa). Stesso
  // schema del layer balneazione: un tick ogni mezzo secondo finche' non c'e`.
  const [meteoTick, setMeteoTick] = useState(0);
  useEffect(() => {
    if (activeTab !== undefined && activeTab !== "map") return;
    const map = mapRef.current;
    if (!map) {
      const retry = setTimeout(() => setMeteoTick((t) => t + 1), 500);
      return () => clearTimeout(retry);
    }
    try {
      const c = map.getCenter();
      refreshMeteo(c.lat, c.lng);
    } catch { /* mappa non pronta: ci pensa il moveend */ }
    const onMoveEnd = () => {
      try {
        const c = map.getCenter();
        refreshMeteo(c.lat, c.lng);
      } catch { /* ignora */ }
    };
    map.on("moveend", onMoveEnd);
    return () => { map.off("moveend", onMoveEnd); };
  }, [activeTab, refreshMeteo, meteoTick]);

  // Cleanup completo per gli unmount reali (hot reload, error boundary):
  // il timer di debounce e i fetch in volo non devono sopravvivere al componente.
  // La mappa Leaflet viene già rimossa da react-leaflet (MapContainer chiama map.remove()).
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
      fetchSeqRef.current++; // invalida le risposte in volo
      overpassAbortRef.current?.abort();
      googlePlacesAbortRef.current?.abort();
      wikiAbortRef.current?.abort();
    };
  }, []);

  // Autocomplete real-time logic with Mapbox
  useEffect(() => {
    if (searchQuery.length < 3) {
      setSuggestions([]);
      setNostri([]);
      setSearchNoResults(false);
      return;
    }

    // Abort al cambio di query: senza, una risposta lenta della ricerca
    // precedente poteva sovrascrivere i suggerimenti di quella nuova.
    const abortCtrl = new AbortController();
    const timer = setTimeout(async () => {
      setIsSearching(true);
      // In parallelo, senza await sulla strada di Mapbox: i nostri dati.
      (async () => {
        try {
          const c = mapRef.current?.getCenter();
          const r = await fetch(getApiUrl(
            `/api/search/poi?q=${encodeURIComponent(searchQuery)}&lang=${language.toLowerCase()}`
            + (c ? `&lat=${c.lat.toFixed(4)}&lon=${c.lng.toFixed(4)}` : '')
          ), { signal: abortCtrl.signal });
          if (!r.ok || abortCtrl.signal.aborted) return;
          const d = await r.json();
          if (abortCtrl.signal.aborted) return;
          const voci: any[] = [];
          for (const k of (d.categorie || [])) voci.push({ kind: 'categoria', id: `cat-${k.macro}-${k.sub || ''}`, ...k });
          for (const p of (d.poi || [])) voci.push({ kind: 'poi', ...p });
          for (const p of (d.percorsi || [])) voci.push({ kind: 'percorso', ...p });
          setNostri(voci);
          if (voci.length) setSearchNoResults(false);
        } catch { /* vuoto: Mapbox basta */ }
      })();
      try {
        // Proxy server-side (/api/geocode): il token Mapbox non è più esposto
        // nel bundle client. `types` larghi: qui si cercano anche i luoghi.
        const res = await fetch(getApiUrl(
          `/api/geocode?q=${encodeURIComponent(searchQuery)}`
          + `&lang=${language.toLowerCase()}&limit=5&types=place,locality,region,country,poi,address`
        ), { signal: abortCtrl.signal });
        if (res.ok) {
          const data = await res.json();
          if (abortCtrl.signal.aborted) return;
          const feats = data.features || [];
          setSuggestions(feats.map((f: any) => ({
            id: f.id,
            description: f.description,
            lat: f.lat,
            lon: f.lon,
            isMapbox: true
          })));
          setSearchNoResults(feats.length === 0);
        }
      } catch (e) {
        if (!abortCtrl.signal.aborted) console.error("Geocode search error:", e);
      } finally {
        if (!abortCtrl.signal.aborted) setIsSearching(false);
      }
    }, 800);

    return () => {
      clearTimeout(timer);
      abortCtrl.abort();
    };
  }, [searchQuery, language]);

  // Background Pre-fetching for POI details (Speed Optimization)
  useEffect(() => {
    if (pois.length === 0 || mapZoom < 15) return;

    // Pick top 5 most relevant POIs to pre-fetch details for
    const topPois = [...pois]
      .filter(p => !getCachedPoiDetails(p.id))
      .sort((a, b) => {
        // Gemme always first
        if (a.category === "gemme" && b.category !== "gemme") return -1;
        if (b.category === "gemme" && a.category !== "gemme") return 1;
        
        // Closest to center
        const distA = getDistanceFromLatLonInM(center[0], center[1], a.lat, a.lon);
        const distB = getDistanceFromLatLonInM(center[0], center[1], b.lat, b.lon);
        return distA - distB;
      })
      .slice(0, 5);

    // Reverse geocode dei candidati tramite la coda globale: max 1 req/1.2s
    // verso Nominatim anche se l'effect scatta a ogni pan/zoom (la coda
    // deduplica per cella e salta le celle già in cache o già fallite).
    topPois.forEach((poi) => {
      if (poi.lat && poi.lon) {
        fetchCityNameQueued(poi.lat, poi.lon).catch(() => {});
      }
    });
  }, [pois, center, mapZoom]);

  /**
   * POI community (Vision approvate) per bbox, SENZA clamp di raggio: sono
   * pochi e curati (uno per luogo, accorpati all'approvazione) e devono
   * restare visibili anche a zoom lontani, dove la RPC nearby (25km/1000)
   * li perderebbe. SELECT pubblica diretta su shared_pois.
   */
  const fetchCommunityPoisInBounds = async (
    south: number, west: number, north: number, east: number
  ): Promise<Poi[]> => {
    try {
      const { data } = await supabase
        .from('shared_pois')
        .select('id, name, lat, lon, category, poi_type, description_short, description_ai, image_url, status, is_hidden')
        .eq('category', 'community')
        .gte('lat', south).lte('lat', north)
        .gte('lon', west).lte('lon', east)
        .limit(300);
      // Denylist status COMPLETA (isVisiblePoiStatus): il solo check su
      // 'draft' lasciava visibili i POI community auto-sospesi dalle
      // segnalazioni utente (status 'needs_revision') e quelli rifiutati.
      // In più si nascondono i contenuti degli autori bloccati dall'utente
      // (App Store Guideline 1.2, cache locale da /api/community/blocked-pois).
      const { isVisiblePoiStatus } = await import('../services/poiRepository');
      const { getBlockedCommunityPoiIds } = await import('../lib/communityModeration');
      const blockedIds = getBlockedCommunityPoiIds();
      return (data || [])
        .filter((i: any) => isVisiblePoiStatus(i) && i.name && !blockedIds.has(String(i.id)))
        .map((i: any) => ({
          id: i.id,
          lat: Number(i.lat),
          lon: Number(i.lon),
          name: i.name,
          category: 'community',
          baseCategory: 'community',
          subCategory: i.poi_type || 'community',
          description: i.description_ai || i.description_short,
          image_url: i.image_url,
          is_gem: false,
          isFromDb: true,
          status: i.status || 'verified'
        } as Poi));
    } catch {
      return [];
    }
  };

  /**
   * NATURA (spiagge, vette, acque, grotte, parchi) per bbox.
   *
   * Stessa strada dei tematici, per lo stesso motivo: la RPC `nearby_pois`
   * restituisce i 1.000 POI piu' vicini di QUALUNQUE categoria, e in una
   * citta' monumenti e chiese occupano tutti i posti. Le 10.000 spiagge del
   * DB c'erano, ma non arrivavano mai sulla mappa (segnalato 22/08/2026:
   * «ho selezionato spiagge e isole, non e' apparso nulla»). Qui si chiede
   * al DB ESATTAMENTE la natura, e solo quando la chip e' accesa.
   * `category` resta quella vera (beach, peak…), che da' famiglia e icona;
   * `baseCategory` porta la macro.
   */
  const fetchNaturaPoisInBounds = async (
    south: number, west: number, north: number, east: number,
  ): Promise<Poi[]> => {
    try {
      const { data } = await supabase
        .from('shared_pois')
        .select('id, name, lat, lon, category, poi_type, description_short, description_ai, image_url, status, is_hidden, country, city, is_gem')
        // Il DB tiene la maggioranza dei POI naturali sotto il bucket
        // GENERICO category='natura' (255.000 righe), famiglia vera in
        // poi_type — non nei valori specifici (beach, peak…) che questa
        // lista elenca. Prima si chiedevano SOLO quei valori specifici e la
        // query non trovava quasi nulla (24/08/2026). Si chiedono entrambi:
        // il bucket generico E gli eventuali valori specifici già in category.
        .in('category', ['natura', ...NATURA_DB_CATEGORIES])
        .gte('lat', south).lte('lat', north)
        .gte('lon', west).lte('lon', east)
        .limit(500);
      const { isVisiblePoiStatus } = await import('../services/poiRepository');
      return (data || [])
        .filter((i: any) => isVisiblePoiStatus(i) && i.name)
        .map((i: any) => ({
          id: i.id,
          lat: Number(i.lat),
          lon: Number(i.lon),
          name: i.name,
          category: i.category,
          baseCategory: 'natura',
          subCategory: i.poi_type || i.category,
          description: i.description_ai || i.description_short,
          image_url: i.image_url,
          city: i.city,
          country: i.country,
          is_gem: i.is_gem === true,
          isFromDb: true,
          status: i.status || 'verified'
        } as unknown as Poi));
    } catch {
      return [];
    }
  };

  /**
   * GEMME per bbox, per le viste piu' larghe del raggio della RPC.
   *
   * La RPC `nearby_pois` copre al massimo 25 km attorno al centro. Con la
   * chip Gemme accesa e la mappa allontanata (una regione a schermo) i pin
   * comparivano solo in un cerchio al centro, e spostandosi verso Siena da
   * Grosseto la zona nuova restava vuota (segnalato 23/08/2026). Le gemme
   * sono poche e sono i luoghi che a quella scala si cercano: si chiedono
   * per riquadro, come natura e tematici. La mappatura e' la stessa della
   * RPC (categoria UI + is_gem), cosi' il marker e la tassonomia non cambiano
   * fra un POI arrivato da qui e lo stesso POI arrivato dalla RPC.
   */
  const fetchGemmePoisInBounds = async (
    south: number, west: number, north: number, east: number,
  ): Promise<Poi[]> => {
    try {
      const { data } = await supabase
        .from('shared_pois')
        // 'sub_category' non esiste sulla tabella (colonna vera: poi_type —
        // la RPC nearby_pois la alias 'sub_category', qui e' una select
        // diretta): con la colonna sbagliata la query falliva SEMPRE, in
        // silenzio (24/08/2026, trovato mentre si indagava "gemme" vuote a
        // vista larga). Bug preesistente, non introdotto oggi.
        .select('id, name, lat, lon, category, poi_type, description_short, description_ai, image_url, status, is_hidden, country, city, is_gem')
        .eq('is_gem', true)
        .gte('lat', south).lte('lat', north)
        .gte('lon', west).lte('lon', east)
        .limit(600);
      const { isVisiblePoiStatus } = await import('../services/poiRepository');
      const osmToUi: Record<string, string> = {
        church: 'chiese', museum: 'musei', viewpoint: 'panorami',
        monument: 'monumenti', castle: 'monumenti', ruins: 'monumenti',
        archaeological_site: 'monumenti', artwork: 'monumenti',
      };
      return (data || [])
        .filter((i: any) => isVisiblePoiStatus(i) && i.name)
        .map((i: any) => {
          const cat = i.category === 'gemme' ? 'gemme' : (osmToUi[i.category] || i.category || 'monumenti');
          return {
            id: i.id,
            lat: Number(i.lat),
            lon: Number(i.lon),
            name: i.name,
            category: cat,
            baseCategory: cat,
            subCategory: i.poi_type || i.category,
            description: i.description_ai || i.description_short,
            image_url: i.image_url,
            city: i.city,
            country: i.country,
            is_gem: true,
            isFromDb: true,
            status: i.status || 'verified',
          } as unknown as Poi;
        });
    } catch {
      return [];
    }
  };

  /**
   * MONUMENTI/CHIESE/MUSEI/PANORAMI, LOCALI, UTILITA', FAMIGLIE per bbox
   * (24/08/2026) — stessa ragione di natura/gemme/community/tematici: la RPC
   * `nearby_pois` copre al massimo un cerchio di 25 km attorno al centro, e
   * sotto zoom 8 il fetch principale si ferma del tutto. "Tutte le categorie
   * devono mostrare i POI a qualsiasi livello di mappa, anche dell'Europa
   * intera" (richiesta utente) — qui si chiede al DB per riquadro, con un
   * tetto per chip: a scala di continente non ha senso scaricare l'intera
   * Europa, il cluster accorpa quello che arriva e mostra i numeri, ma la
   * lista deve restare un CAMPIONE, non il totale.
   * Una sola funzione, parametrizzata sui valori `category` della famiglia
   * (le liste *_TYPES di poiTaxonomy.ts) e sulla macro UI da scrivere in
   * `baseCategory` — cosi` resolvePoiTaxonomy classifica questi POI esattamente
   * come quelli arrivati dalla RPC.
   */
  const fetchTassonomiaPoisInBounds = async (
    south: number, west: number, north: number, east: number,
    tipiDb: string[], macro: string, limite = 500,
  ): Promise<Poi[]> => {
    try {
      // CAMPIONE SPARSO SU TUTTA LA VISTA, non un grumo (30/08/2026).
      //
      // Prima: UNA select sul riquadro con `.limit(n)` e NESSUN ordinamento.
      // Postgres in quel caso restituisce le righe nell'ordine in cui le
      // trova sul disco, cioe' nell'ordine in cui sono state importate — e i
      // POI sono stati importati per paese e per regione. Risultato: con
      // l'Europa sullo schermo i 600 pin venivano tutti dalla stessa zona, e
      // il resto del continente restava vuoto. Non era un tetto troppo
      // basso: era il campione preso male.
      //
      // Ora il riquadro si divide in una griglia e si chiede una quota a
      // OGNI cella, in parallelo. Ogni interrogazione lavora su un rettangolo
      // piccolo — quindi e' anche piu' rapida della singola grande — e i pin
      // risultano distribuiti su tutta la vista. A vista stretta la griglia
      // non serve e si resta a una sola interrogazione.
      const COLONNE = 'id, name, lat, lon, category, poi_type, description_short, description_ai, image_url, status, is_hidden, country, city, is_gem';
      const altezza = Math.abs(north - south);
      const larghezza = Math.abs(east - west);
      const lato = (altezza > 1 || larghezza > 1) ? 3 : 1;   // 3×3 = 9 celle
      const perCella = Math.max(20, Math.ceil(limite / (lato * lato)));

      const richieste: any[] = [];
      for (let r = 0; r < lato; r++) {
        for (let c = 0; c < lato; c++) {
          const s = south + (altezza * r) / lato;
          const n = south + (altezza * (r + 1)) / lato;
          const w = west + (larghezza * c) / lato;
          const e = west + (larghezza * (c + 1)) / lato;
          richieste.push(
            supabase.from('shared_pois').select(COLONNE)
              .in('category', tipiDb)
              .gte('lat', s).lte('lat', n)
              .gte('lon', w).lte('lon', e)
              .limit(perCella)
              .then((res: any) => res.data || [], () => []),
          );
        }
      }
      const perCelle = await Promise.all(richieste);
      // Le celle confinano: lo stesso POI puo' tornare da due riquadri.
      const visti = new Set<string>();
      const data = perCelle.flat().filter((i: any) => {
        const k = String(i?.id ?? '');
        if (!k || visti.has(k)) return false;
        visti.add(k);
        return true;
      }).slice(0, limite);

      const { isVisiblePoiStatus } = await import('../services/poiRepository');
      return (data || [])
        .filter((i: any) => isVisiblePoiStatus(i) && i.name)
        .map((i: any) => ({
          id: i.id,
          lat: Number(i.lat),
          lon: Number(i.lon),
          name: i.name,
          category: i.category,
          baseCategory: macro,
          subCategory: i.poi_type || i.category,
          description: i.description_ai || i.description_short,
          image_url: i.image_url,
          city: i.city,
          country: i.country,
          is_gem: i.is_gem === true,
          isFromDb: true,
          status: i.status || 'verified',
        } as unknown as Poi));
    } catch {
      return [];
    }
  };

  /**
   * LOCALITÀ TURISTICHE per bbox (24/08/2026): borghi e villaggi che sono
   * meta di per sé — Riomaggiore, Volterra, Colonnata — non un monumento
   * dentro una città. Popolati da scratch/importa-localita-mondo.mjs
   * (categoria 'localita' in shared_pois, foto+descrizione da Wikidata).
   * Stessa strada di gemme/natura/tematici: la RPC nearby_pois li perderebbe
   * a scala larga (clamp 25 km), e un borgo è esattamente il tipo di posto
   * che si cerca guardando una regione intera, non stando già dentro.
   */
  const fetchLocalitaPoisInBounds = async (
    south: number, west: number, north: number, east: number,
    limite = 500,
    // Celle (26/08/2026, RITIRATO): un tentativo di griglia qui — lanciare
    // 9-16 query per riquadro geograficamente distribuito, per rompere il
    // bias "Europa sempre prima" — ha peggiorato le cose invece di
    // risolverle: il carico concorrente extra sul DB ha fatto scattare il
    // circuit breaker condiviso (src/lib/circuitBreaker.ts, soglia 3
    // fallimenti) anche sul fetch POI principale ("Luoghi Vicini" andava in
    // pausa di sicurezza). Anche un semplice `.order('id')` sull'intero
    // mondo, provato come alternativa a costo-zero, si è rivelato ANCH'ESSO
    // lento abbastanza da andare in timeout (8+s, verificato) — la tabella
    // non ha un indice che copra questa combinazione di filtro+ordinamento.
    // Il parametro resta per compatibilità di firma ma NON viene più usato:
    // query semplice, esattamente come prima di tutti questi tentativi. Il
    // bias geografico (mondo = solo Europa) RESTA un problema aperto: la
    // soluzione vera è lato DB (un indice dedicato o un aggregato
    // server-side), non un trucco lato client — rischia troppo su questa
    // tabella per essere improvvisata senza poter testare con calma.
    _celle = 1,
  ): Promise<Poi[]> => {
    const eseguiQuery = () => supabase
      .from('shared_pois')
      .select('id, name, lat, lon, description_short, description_ai, image_url, status, is_hidden, country, city')
      .eq('category', 'localita')
      .gte('lat', south).lte('lat', north)
      .gte('lon', west).lte('lon', east)
      .limit(limite);
    try {
      let { data, error } = await eseguiQuery();
      // Un timeout del server (query lenta sotto carico concorrente) non è
      // "questa zona non ha località": è un fallimento transitorio. Un
      // singolo retry basta quasi sempre (verificato: le stesse query,
      // ripetute da sole, rispondono in 0.1-0.4s).
      if (error) {
        ({ data, error } = await eseguiQuery());
        if (error) throw error;
      }
      const { isVisiblePoiStatus } = await import('../services/poiRepository');
      return (data || [])
        .filter((i: any) => isVisiblePoiStatus(i) && i.name)
        .map((i: any) => ({
          id: i.id,
          lat: Number(i.lat),
          lon: Number(i.lon),
          name: i.name,
          category: 'localita',
          baseCategory: 'localita',
          subCategory: 'localita',
          description: i.description_ai || i.description_short,
          image_url: i.image_url,
          city: i.city,
          country: i.country,
          is_gem: false,
          isFromDb: true,
          status: i.status || 'verified',
        } as unknown as Poi));
    } catch {
      return [];
    }
  };

  /**
   * Quali verticali tematici sono accesi. Le otto chiavi stanno in
   * selectedCategories come le macro (vedi CategoryChips): se è accesa solo la
   * macro 🧭 — succede quando la selezione arriva da GeoControl — valgono
   * tutte, altrimenti solo quelle scelte.
   */
  const categorieTematicheAttive = (attive: string[]): string[] => {
    const scelte = (TEMATICI_KEYS as readonly string[]).filter(k => attive.includes(k));
    if (scelte.length > 0) return scelte;
    return attive.includes('tematiche') ? [...TEMATICI_KEYS] : [];
  };

  /**
   * VERTICALI TEMATICI (terme, cinema, cieli, street art, mercati, fioriture,
   * memoria, viaggio lento) per bbox.
   *
   * Stessa strada dei POI community, e per lo stesso motivo: la RPC
   * `nearby_pois` ha colonne fisse, clamp a 25 km e tetto 1000 righe, quindi
   * un catalogo curato e sparso nel mondo ci passerebbe attraverso. Qui è una
   * SELECT pubblica diretta filtrata sulle categorie ACCESE (`.in`), così una
   * sola query serve tutti i verticali attivi.
   */
  const fetchTematiciPoisInBounds = async (
    south: number, west: number, north: number, east: number,
    categorieAttive: string[]
  ): Promise<Poi[]> => {
    if (!categorieAttive || categorieAttive.length === 0) return [];
    try {
      const { data } = await supabase
        .from('shared_pois')
        .select('id, name, lat, lon, category, poi_type, description_short, description_ai, image_url, status, is_hidden, country, city, contact_website')
        .in('category', categorieAttive)
        .gte('lat', south).lte('lat', north)
        .gte('lon', west).lte('lon', east)
        .limit(400);
      const { isVisiblePoiStatus } = await import('../services/poiRepository');
      return (data || [])
        .filter((i: any) => isVisiblePoiStatus(i) && i.name)
        .map((i: any) => ({
          id: i.id,
          lat: Number(i.lat),
          lon: Number(i.lon),
          name: i.name,
          // `category` resta il verticale vero (terme, cinema…): è quella che
          // dà colore ed emoji al pin e che il filtro delle chip confronta.
          // `baseCategory` porta la macro, per la scheda e i gradienti.
          category: i.category,
          baseCategory: 'tematiche',
          subCategory: i.poi_type,
          description: i.description_ai || i.description_short,
          image_url: i.image_url,
          city: i.city,
          country: i.country,
          contact_website: i.contact_website,
          is_gem: false,
          isFromDb: true,
          status: i.status || 'verified'
        } as unknown as Poi));
    } catch {
      return [];
    }
  };

  /**
   * ATLANTE DEI BENI VINCOLATI (tabella `beni_culturali`, ~1,78 M nel mondo).
   *
   * È un layer informativo, non una categoria turistica: dentro c'è tutto il
   * patrimonio protetto dai registri nazionali, comprese le cose che non si
   * possono visitare. Da qui la scheda ridotta e nessuna audioguida.
   *
   * I beni di fascia A/B sono anche POI veri in shared_pois (colonna
   * `promoted_poi_id`): quelli conservano la scheda completa con audioguida
   * anche quando li si apre da questa chip, e se sono già in mappa come POI
   * non vengono raddoppiati — il merge a valle li scarta per id.
   *
   * Visibile a qualsiasi zoom come le altre categorie (26/08/2026): a scala
   * larga un campione con tetto e griglia (fetchBeniCulturaliInBounds), non
   * tutti gli 1,78 M — lo stesso principio di monumenti/musei/gemme sopra.
   */
  const fetchBeniCulturaliInBounds = async (
    south: number, west: number, north: number, east: number,
    // Le fasce da chiedere: a scala di regione solo la A (22/08/2026: «i
    // beni devono apparire anche con la Toscana intera»), in citta' tutte.
    fasce: string[] | null = null,
    limite = 400,
    // Celle per lato (23/08/2026): a scala di paese UNA query sul riquadro
    // intero con `limit 300` si riempiva tutta nella parte piu' densa o
    // semplicemente con le prime righe che il DB trovava — con l'Olanda a
    // schermo tornavano 300 beni olandesi, e spostandosi verso la Francia i
    // francesi non arrivavano mai perche' il tetto era gia' pieno. Con la
    // griglia ogni cella della vista ha la sua quota: la mappa si riempie
    // dappertutto, non solo dove il DB e' piu' fitto.
    celle = 1,
  ): Promise<Poi[]> => {
    if (celle > 1) {
      const dLat = (north - south) / celle;
      const dLon = (east - west) / celle;
      const quota = Math.max(20, Math.ceil(limite / (celle * celle)));
      const pezzi: Promise<Poi[]>[] = [];
      for (let r = 0; r < celle; r++) {
        for (let c = 0; c < celle; c++) {
          pezzi.push(fetchBeniCulturaliInBounds(
            south + dLat * r, west + dLon * c,
            south + dLat * (r + 1), west + dLon * (c + 1),
            fasce, quota, 1,
          ));
        }
      }
      const visti = new Set<string>();
      const out: Poi[] = [];
      for (const blocco of await Promise.all(pezzi)) {
        for (const p of blocco) {
          const k = String(p.id);
          if (visti.has(k)) continue;
          visti.add(k);
          out.push(p);
        }
      }
      return out;
    }
    try {
      let q = supabase
        .from('beni_culturali')
        // `geocode_source` dice DA DOVE viene il punto: dall'edificio, dal
        // civico, dalla via o — per i beni del catalogo ministeriale che non
        // hanno indirizzo — dal centro del comune. Serve al popup per
        // dichiarare quando la posizione e' approssimata invece di lasciar
        // credere che il pin sia sulla porta.
        // `image_url`/`image_attribution`: la foto libera (Commons) quando
        // c'e'. `catalog_url`: la scheda del catalogo nazionale, che e' cio'
        // che resta quando la foto non si puo' mostrare — i beni italiani
        // l'hanno ma con licenza non commerciale (vedi la migration
        // 20260824110000_beni_culturali_foto.sql).
        .select('id, name, lat, lon, tier, category_wip, typology, comune, address, description, promoted_poi_id, matched_poi_id, wikidata_id, geocode_source, image_url, image_attribution, catalog_url')
        .gte('lat', south).lte('lat', north)
        .gte('lon', west).lte('lon', east);
      if (fasce && fasce.length > 0) q = q.in('tier', fasce);
      const { data } = await q
        // Ordine per fascia (A < B < C in ordine alfabetico) perche' il limite
        // di 400 si riempie sempre nelle citta' storiche: senza ordine, a
        // Londra tornavano 357 case a schiera vincolate e nessun monumento.
        // Cosi' i beni turistici vincono il taglio e il resto riempie.
        .order('tier', { ascending: true })
        .limit(limite);
      return (data || [])
        .filter((i: any) => i.name && i.lat != null && i.lon != null)
        .map((i: any) => {
        // Due colonne portano allo stesso POI: `promoted_poi_id` quando il POI
        // è nato promuovendo il bene, `matched_poi_id` quando il bene è stato
        // agganciato a un POI che c'era già. Guardarne una sola raddoppiava il
        // pin di ogni bene agganciato (tutti i 43 beni FAI, per esempio).
        const poiCollegato = i.promoted_poi_id || i.matched_poi_id || null;
        return ({
          // Se il bene è già un POI, ne prende l'id: cliccandolo si apre la
          // scheda completa e non si crea un doppione sulla mappa.
          id: poiCollegato || `bc-atlante-${i.id}`,
          lat: Number(i.lat),
          lon: Number(i.lon),
          name: i.name,
          category: 'beni_culturali',
          baseCategory: 'beni_culturali',
          subCategory: i.category_wip || i.typology || '',
          description: i.description || i.typology || '',
          address: i.address || undefined,
          city: i.comune || undefined,
          is_gem: false,
          isFromDb: true,
          status: 'verified',
          // Letto da PoiPopupContent per la scheda ridotta: vero solo per i
          // beni di solo atlante, cioè quelli senza un POI corrispondente.
          isHeritageAtlas: !poiCollegato,
          heritageTier: i.tier,
          // Serve al popup per la foto (fotoDaWikidata, P18): l'unica fonte
          // legittima per un bene di solo atlante, che non ha colonna
          // immagine propria (24/08/2026).
          wikidata: i.wikidata_id || undefined,
          // Vero quando il punto e' il centro del comune e non il bene: il
          // popup lo dice a chiare lettere. Un pin che sembra preciso e non
          // lo e' manda la gente dalla parte sbagliata del paese.
          posizioneApprossimata: /comune/i.test(String(i.geocode_source || '')),
          // La foto libera gia' in casa (Wikimedia Commons) e il suo credito:
          // CC BY-SA obbliga a nominare l'autore, quindi viaggiano insieme.
          image_url: i.image_url || undefined,
          imageAttribution: i.image_attribution || undefined,
          // La scheda del catalogo nazionale: si apre in una scheda dentro
          // l'app (vedi src/lib/apriScheda.ts). E' la porta che resta ai beni
          // italiani, le cui foto di catalogo non sono riusabili.
          catalogUrl: i.catalog_url || undefined,
        } as unknown as Poi);
        });
    } catch {
      return [];
    }
  };

  /**
   * DOPPIA APPARTENENZA: quali POI in vista sono ANCHE beni vincolati.
   *
   * Sono i beni con `matched_poi_id`: il POI c'era già (una chiesa importata da
   * Wikidata) e l'atlante ci ha detto che è tutelato. Restano POI pieni — scheda
   * e audioguida — ma vanno mostrati anche accendendo la chip Beni Culturali e
   * portano il badge sulla scheda.
   *
   * Perché una query a parte e non la colonna sul POI: la RPC `nearby_pois`
   * espone un elenco fisso di colonne (id, nome, lat, lon, category, source,
   * sub_category, status, is_gem, image_url, description_*, *_radius,
   * entrance_*) e non porta `technical_data`. Un marcatore scritto sul POI non
   * arriverebbe mai al client dalla strada primaria: sarebbe muto come
   * `api_cache`. Questa invece è una select per bbox sui soli beni agganciati —
   * poche righe, stesso indice lat/lon della chip atlante.
   *
   * Non è gated sulla chip: il badge dice cos'è il POI, e non deve dipendere da
   * quali chip sono accese.
   */
  const fetchAgganciBeniInBounds = async (
    south: number, west: number, north: number, east: number
  ): Promise<Map<string, { registro?: string; tutela?: string }>> => {
    const agganci = new Map<string, { registro?: string; tutela?: string }>();
    try {
      const { data } = await supabase
        .from('beni_culturali')
        .select('matched_poi_id, source, tier, typology')
        .not('matched_poi_id', 'is', null)
        .gte('lat', south).lte('lat', north)
        .gte('lon', west).lte('lon', east)
        .limit(500);
      for (const b of (data || []) as any[]) {
        if (!b.matched_poi_id) continue;
        agganci.set(String(b.matched_poi_id), {
          registro: b.source || undefined,
          tutela: b.typology || (b.tier ? `fascia ${b.tier}` : undefined),
        });
      }
    } catch {
      // Silenzio: senza agganci si perde il badge, non la mappa.
    }
    return agganci;
  };

  const performFetchPois = async (bounds: L.LatLngBounds) => {
    // Nuova generazione di fetch: quelle precedenti diventano stale
    const fetchSeq = ++fetchSeqRef.current;
    // If wheelchair filter is active, fetch across all categories to enable cross-category override!
    const activeCategories = (subFilter && subFilter.includes("disabili"))
      ? ["gemme", "monumenti", "chiese", "musei", "panorami", "locali", "utilita", "famiglie"]
      : selectedCategories;

    if (activeCategories.length === 0) {
      return;
    }

    const zoom = mapRef.current?.getZoom() || 13;
    if (zoom < 8) {
      // (27/08/2026) TUTTE LE CHIP INSIEME, NON UNA DOPO L'ALTRA.
      // Qui sotto c'erano SETTE interrogazioni in fila, ognuna che aspettava
      // la precedente: community, tematici, gemme, localita', natura, le
      // quattro macro-categorie e i beni vincolati. Con piu' chip accese si
      // sommavano sette andate e ritorno, e le ultime della fila — famiglie e
      // beni — comparivano molto dopo le prime. Ora partono tutte insieme e
      // ognuna si disegna appena arriva: si paga solo la piu' lenta invece
      // della somma.
      const compiti: Array<Promise<void>> = [];
      /** Aggiunge i POI arrivati, senza toccare quelli gia' disegnati. */
      const unisci = (arrivati: Poi[], sovrascrivi = false) => {
        if (!arrivati.length || fetchSeq !== fetchSeqRef.current) return;
        setPois(prev => {
          const m = new Map<string, Poi>(prev.map(p => [String(p.id), p]));
          arrivati.forEach(p => { if (sovrascrivi || !m.has(String(p.id))) m.set(String(p.id), p); });
          return Array.from(m.values());
        });
      };

      // A zoom lontani si evita il carico pesante, MA i pin community
      // restano visibili (richiesta esplicita: si vedono anche da lontano).
      if (activeCategories.includes('community') && bounds && typeof bounds.getSouth === 'function') {
        const b = bounds.pad(0.2);
        compiti.push(fetchCommunityPoisInBounds(b.getSouth(), b.getWest(), b.getNorth(), b.getEast())
          .then(r => unisci(r, true)));   // community sovrascrive, come prima
      }
      // Stessa eccezione per i verticali tematici: sono cataloghi curati e
      // radi (una città termale, un set, un parco del cielo stellato ogni
      // tanto), e chi accende 🧭 a scala di regione vuole proprio vedere dove
      // sono, non una mappa vuota.
      const farTematici = categorieTematicheAttive(activeCategories);
      if (farTematici.length > 0 && bounds && typeof bounds.getSouth === 'function') {
        const b = bounds.pad(0.2);
        compiti.push(fetchTematiciPoisInBounds(b.getSouth(), b.getWest(), b.getNorth(), b.getEast(), farTematici)
          .then(r => unisci(r, true)));
      }
      // Gemme anche a scala di paese (23/08/2026): sono poche, sono i
      // luoghi che a quella scala si cercano, e il cluster le raggruppa.
      // Prima sotto zoom 8 la chip Gemme non caricava niente.
      if (activeCategories.includes('gemme') && bounds && typeof bounds.getSouth === 'function') {
        const b = bounds.pad(0.2);
        compiti.push(fetchGemmePoisInBounds(b.getSouth(), b.getWest(), b.getNorth(), b.getEast()).then(r => unisci(r)));
      }
      // Località anche a scala di paese/continente: stesso motivo di Gemme,
      // e il caso d'uso principale — "cosa c'è di bello in Toscana" — è
      // proprio guardare la regione da lontano.
      if (activeCategories.includes('localita') && bounds && typeof bounds.getSouth === 'function') {
        const b = bounds.pad(0.2);
        // zoom < 8 qui dentro: vista di continente/mondo, griglia 4×4 così
        // ogni zona ha la sua quota (vedi nota sopra fetchLocalitaPoisInBounds).
        compiti.push(fetchLocalitaPoisInBounds(b.getSouth(), b.getWest(), b.getNorth(), b.getEast(), 500).then(r => unisci(r)));
      }
      // NATURA anche a scala di paese/continente (24/08/2026): mancava del
      // tutto sotto zoom 8, mentre community/tematici/gemme avevano gia'
      // l'eccezione. Con l'Italia o l'Europa intera a schermo la chip
      // Natura restava vuota anche dopo il fix del bucket generico.
      if (activeCategories.includes('natura') && bounds && typeof bounds.getSouth === 'function') {
        const b = bounds.pad(0.2);
        compiti.push(fetchNaturaPoisInBounds(b.getSouth(), b.getWest(), b.getNorth(), b.getEast()).then(r => unisci(r)));
      }
      // MONUMENTI/CHIESE/MUSEI/PANORAMI, LOCALI, UTILITA, FAMIGLIE anche a
      // scala di paese/continente (24/08/2026, richiesta esplicita: "tutte
      // le categorie devono mostrare i POI a qualsiasi livello di mappa").
      // Prima queste sette chip non caricavano NIENTE sotto zoom 8: solo
      // community/tematici/gemme/beni_culturali/natura avevano un'eccezione.
      // Il cluster (MarkerClusterGroup) accorpa e mette i numeri: il tetto
      // per chip resta contenuto (vedi fetchTassonomiaPoisInBounds) apposta,
      // perche' a scala di continente non ha senso scaricare l'intera Europa
      // — serve un campione rappresentativo, non tutto.
      const macroFarMap: Array<{ macro: string; tipi: string[]; limite: number }> = [
        { macro: 'monumenti', tipi: [...CHIESE_TYPES, ...MUSEI_TYPES, ...PANORAMI_TYPES, ...MONUMENTI_TYPES], limite: 600 },
        { macro: 'locali', tipi: LOCALI_TYPES, limite: 400 },
        { macro: 'utilita', tipi: UTILITA_TYPES, limite: 400 },
        { macro: 'famiglie', tipi: FAMIGLIE_TYPES, limite: 300 },
      ];
      const macroFarAttivi = macroFarMap.filter(m => activeCategories.includes(m.macro));
      if (macroFarAttivi.length > 0 && bounds && typeof bounds.getSouth === 'function') {
        const b = bounds.pad(0.2);
        // (27/08/2026) IN PARALLELO, non in fila. Prima erano quattro `await`
        // uno dopo l'altro, e `famiglie` era l'ULTIMA: aspettava che
        // `monumenti` — sessanta tipi diversi con tetto 600, la piu' pesante
        // delle quattro — avesse finito. Da qui la lentezza segnalata dal
        // committente: le famiglie non erano lente, erano in coda.
        // Ogni risposta si scrive appena arriva, quindi la piu' veloce compare
        // per prima invece che per ultima.
        for (const { macro, tipi, limite } of macroFarAttivi) {
          compiti.push(fetchTassonomiaPoisInBounds(b.getSouth(), b.getWest(), b.getNorth(), b.getEast(), tipi, macro, limite)
            .then(r => unisci(r)));
        }
      }
      // Beni vincolati anche a scala di paese/continente (26/08/2026,
      // richiesta esplicita: "come tutte le altre categorie, a qualsiasi
      // zoom"). Prima sotto zoom 8 caricava SOLO fascia A: la chip trattava
      // l'atlante in modo diverso dalle altre nove categorie che già
      // mostrano un campione a ogni scala (vedi macroFarMap sopra). Ora
      // nessun filtro di fascia: un campione rappresentativo come tutte le
      // altre, non solo i "grandi monumenti".
      if (activeCategories.includes('beni_culturali') && bounds && typeof bounds.getSouth === 'function') {
        const b = bounds.pad(0.2);
        // Griglia 3×3 (23/08/2026): con un paese intero a schermo una sola
        // query da 300 tornava solo i beni della zona piu' fitta — l'Olanda
        // mostrava i suoi, la Francia accanto restava vuota.
        compiti.push(fetchBeniCulturaliInBounds(b.getSouth(), b.getWest(), b.getNorth(), b.getEast(), null, 600, 3)
          .then(r => unisci(r)));
      }
      // Si aspetta la FINE DI TUTTE solo per spegnere la rotellina: i pin sono
      // gia' comparsi mano a mano, ognuno appena la sua interrogazione e'
      // tornata. `allSettled` e non `all`: se una chip fallisce, le altre
      // devono restare sulla mappa invece di sparire tutte insieme.
      await Promise.allSettled(compiti);
      setIsLoadingPois(false);
      return;
    }

    let bbox = "";
    const categoriesKey = activeCategories.slice().sort().join(',');
    let pendingCacheState: any = null;
    let south = 0;
    let west = 0;
    let north = 0;
    let east = 0;

    try {
      if (!bounds || typeof bounds.getSouth !== "function" || typeof bounds.contains !== "function") {
        console.warn("Invalid bounds passed to performFetchPois");
        setIsLoadingPois(false);
        return;
      }
      
      // Cache check
      if (lastFetchedStateRef.current) {
        const { bounds: lastBounds, categoriesKey: lastCat, subFilter: lastSub } = lastFetchedStateRef.current;
        
        const currentCatsArr = activeCategories;
        const lastCatsArr = lastCat ? lastCat.split(',') : [];
        const isSubset = currentCatsArr.every(c => lastCatsArr.includes(c));

        const lastSubStr = lastSub ? lastSub.slice().sort().join(',') : "";
        const currentSubStr = subFilter ? subFilter.slice().sort().join(',') : "";

        // BENI CULTURALI (22/08/2026): la fetch dell'atlante parte solo da
        // zoom 13. Se l'ultima fetch e' stata fatta piu' lontano, con la chip
        // gia' accesa, i suoi bounds contengono la vista di adesso e la cache
        // diceva "gia' caricato": i beni non comparivano MAI finche' non si
        // usciva dall'area. La cache deve ricordare se i beni li ha presi.
        // Livello di dettaglio dei beni: 0 nessuno, 1/2/3 = quanti punti si
        // caricano per zona (26/08/2026: non più filtro di fascia, solo
        // tetto — vedi fetchBeniCulturaliInBounds). Se ora serve un tetto
        // più alto di quello in cache, si rifa' la fetch.
        const beniLivelloOra = !activeCategories.includes('beni_culturali') ? 0 : zoom >= BENI_CULTURALI_MIN_ZOOM ? 3 : zoom >= 10 ? 2 : 1;
        const beniMancanoInCache = beniLivelloOra > (lastFetchedStateRef.current.beniLivello || 0);

        if (isSubset && currentSubStr === lastSubStr && !beniMancanoInCache) {
           if (lastBounds.contains(bounds)) {
             // We have already fetched a larger area that contains the current view.
             // We update the cache key if needed and skip fetching!
             lastFetchedStateRef.current.categoriesKey = categoriesKey;
             setIsLoadingPois(false);
             return;
           }
        }
      }
      
      // Expand bounds by 20% for fetching to create a cache margin (smaller = faster Overpass for dense cities)
      const expandedBounds = bounds.pad(0.2);

      // AREA DAVVERO COPERTA dal fetch, non il riquadro chiesto (23/08/2026).
      // La RPC `nearby_pois` carica un cerchio di al massimo 25 km attorno al
      // centro; quando la vista e' piu' larga (da zoom ~10 in giu') il
      // riquadro allargato NON e' coperto, ma la cache lo ricordava per
      // intero: spostandosi da Grosseto verso Siena la vista nuova stava
      // ancora dentro il vecchio riquadro, la cache rispondeva "gia'
      // caricato" e nessun fetch partiva — la zona nuova restava vuota. Qui
      // si ricorda il quadrato INSCRITTO nel cerchio dei 25 km (lato
      // 25/√2 km dal centro): tutto cio' che sta li' dentro e' davvero gia'
      // in mappa, il resto no, e il prossimo pan fuori da quel quadrato
      // rifa' il fetch attorno al centro nuovo.
      const centroVista = bounds.getCenter();
      const raggioVistaM = haversineMeters(centroVista.lat, centroVista.lng, bounds.getNorthEast().lat, bounds.getNorthEast().lng);
      let copertura: L.LatLngBounds = expandedBounds;
      if (raggioVistaM > 25000) {
        const mezzoLatoM = 25000 / Math.SQRT2;
        const dLat = mezzoLatoM / 111320;
        const dLon = mezzoLatoM / (111320 * Math.max(0.2, Math.cos(centroVista.lat * Math.PI / 180)));
        copertura = L.latLngBounds(
          [Math.max(expandedBounds.getSouth(), centroVista.lat - dLat), Math.max(expandedBounds.getWest(), centroVista.lng - dLon)],
          [Math.min(expandedBounds.getNorth(), centroVista.lat + dLat), Math.min(expandedBounds.getEast(), centroVista.lng + dLon)],
        );
      }

      pendingCacheState = {
        bounds: copertura,
        categoriesKey,
        subFilter,
        beniLivello: !activeCategories.includes('beni_culturali') ? 0 : zoom >= BENI_CULTURALI_MIN_ZOOM ? 3 : zoom >= 10 ? 2 : 1,
      };
      
      south = expandedBounds.getSouth();
      west = expandedBounds.getWest();
      north = expandedBounds.getNorth();
      east = expandedBounds.getEast();
      
      bbox = `${south},${west},${north},${east}`;
      if (bbox.includes("NaN")) {
        console.warn("BBox contains NaN:", bbox);
        setIsLoadingPois(false);
        return;
      }
    } catch (e) {
      console.error("Error calculating bounds/cache:", e);
      setIsLoadingPois(false);
      return;
    }

    setIsLoadingPois(true);
    setIsRateLimited(false);
    setFetchErrors({});
    setMapDataDegraded(false);

    // Carica i POI dall'area geografica salvati in Supabase per il merge ibrido
    let dbPois: Poi[] = [];
    try {
      const center = bounds.getCenter();
      const radius = Math.round(haversineMeters(center.lat, center.lng, bounds.getNorthEast().lat, bounds.getNorthEast().lng));

      // ✅ [OTTIMIZZAZIONE MASSIMA] - Usa l'RPC PostGIS invece del bounding box manuale
      // Questo è drasticamente più veloce su tabelle grandi (100k+ record)
      // Raggio legato alla vista reale (clamp 25km): con il vecchio tetto di
      // 5km a zoom bassi la mappa mostrava solo il centro dell'area e i POI
      // del DB "sparivano" ai bordi.
      // Le due RPC (shared_pois + utility_pois) partono INSIEME: in serie
      // sommavano le latenze e ritardavano il primo paint dei pin.
      const UTILITY_UI_CATS = ['locali', 'utilita', 'famiglie'];
      const wantsUtility = activeCategories.some(c => UTILITY_UI_CATS.includes(c));

      // NIENTE PAUSA DI SICUREZZA SULLA MAPPA (30/08/2026, decisione del
      // committente: «il nostro database non deve bloccare la chiamata anche
      // se dura 10 secondi — la pausa di sicurezza non deve esistere»).
      //
      // Qui prima passava il circuit breaker condiviso con poiRepository: dopo
      // qualche risposta lenta si apriva e da quel momento le chiamate al
      // database venivano RIFIUTATE SUBITO, senza nemmeno provare. La mappa
      // restava senza POI — e quindi senza foto — e compariva «Troppi errori
      // di rete recenti». Era il rimedio peggiore del male: il database e'
      // lento, non irraggiungibile, e una risposta lenta e' comunque una
      // risposta.
      //
      // Ora ogni chiamata viene sempre tentata. Un errore singolo si limita a
      // lasciare i pin che c'erano: la fetch successiva riprova. Il breaker
      // resta in uso altrove (poiRepository, geofencing), dove serve davvero
      // a non consumare batteria a vuoto in background.
      const runPoiRpc = async (
        fn: () => Promise<{ data: any; error: any }>,
        label: string,
      ): Promise<{ data: any; error: any }> => {
        try {
          const res = await fn();
          if (res.error) throw new Error(res.error.message);
          return res;
        } catch (e: any) {
          console.warn(`[MapArea] ${label} fallita (si riprovera' al prossimo spostamento):`, e?.message || e);
          return { data: null, error: e };
        }
      };

      const [{ data, error }, utilRes] = await Promise.all([
        runPoiRpc(
          () => supabase.rpc('nearby_pois', {
            p_lat: center.lat,
            p_lon: center.lng,
            radius_m: Math.min(radius, 25000),
            // REGOLA (30/08/2026): sulla mappa compaiono TUTTI i pin di quel
            // livello di zoom, e allargando se ne aggiungono FINO A 500. Il
            // tetto era 1000: oltre la meta' non erano pin in piu' ma peso in
            // piu' — piu' righe da trasferire e da disegnare, su una RPC che
            // gia' oggi ondeggia intorno al timeout. Il raggio resta quello
            // del cerchio circoscritto al riquadro visibile, quindi la vista
            // e' coperta per intero anche agli angoli; quando i POI sono piu'
            // di 500 si tengono i 500 PIU` VICINI al centro dello schermo.
            limit_num: 500
          }),
          'nearby_pois',
        ),
        wantsUtility
          ? runPoiRpc(
              () => supabase.rpc('get_utility_pois', {
                user_lat: center.lat,
                user_lon: center.lng,
                radius_meters: Math.min(radius, 25000),
                limit_num: 400
              }),
              'get_utility_pois',
            )
          : Promise.resolve({ data: null, error: null } as any)
      ]);

      if (data && !error) {
        dbPois = (data as any[])
          // Stesso filtro del ramo select diretto e dei POI community: mai
          // mostrare bozze o POI nascosti/senza nome. Prima il ramo RPC li
          // mappava soltanto (status incluso) ma non li scartava.
          .filter((item: any) => item.is_hidden !== true && item.status !== 'draft' && (item.nome || item.name))
          .map((item: any) => {
          // Mappa categoria OSM → categoria UI
          const osmToUiCategory: Record<string, string> = {
            church: "chiese", museum: "musei", viewpoint: "panorami",
            monument: "monumenti", castle: "monumenti", ruins: "monumenti",
            archaeological_site: "monumenti", artwork: "monumenti",
            restaurant: "locali", cafe: "locali", bar: "locali",
            fast_food: "locali", pub: "locali", ice_cream: "locali",
            bakery: "locali", nightclub: "locali", biergarten: "locali",
            pharmacy: "utilita", hospital: "utilita", police: "utilita",
            playground: "famiglie", marketplace: "utilita"
          };

          const derivedCategory = item.category === 'gemme' ? 'gemme' : (osmToUiCategory[item.category] || item.category || "monumenti");

          return {
            id: item.id,
            lat: Number(item.lat),
            lon: Number(item.lon),
            // La RPC deployata restituisce la colonna "nome" (non "name"):
            // senza questo alias tutti i POI DB arrivavano senza nome e il
            // filtro finale li scartava — mappa vuota dove il DB è l'unica
            // fonte (es. Sud America).
            name: item.nome || item.name,
            category: derivedCategory,
            baseCategory: derivedCategory,
            subCategory: item.sub_category || item.category,
            description: item.description_ai || item.description_short,
            image_url: item.image_url,
            is_gem: item.is_gem || item.category === 'gemme',
            isFromDb: true,
            status: item.status || 'verified'
          };
        }).filter(p => (p.category === 'utilita' || p.category === 'famiglie') ? true : !isGenericUtilityName(p.name));

        console.log(`[Fast Cache] Loaded ${dbPois.length} POIs using PostGIS RPC`);
      } else {
        if (error) console.error("RPC Error:", error.message);
      }

      // Cache dei POI di servizio (utility_pois, dove finiscono i risultati
      // Foursquare/Overpass salvati): prima era WRITE-ONLY — i locali
      // venivano salvati ma mai riletti, quindi senza API live la categoria
      // restava vuota.
      if (wantsUtility) {
        try {
          const { data: utilData, error: utilErr } = utilRes;
          if (utilData && !utilErr) {
            // FONTANELLE E BAGNI FUORI DAI RISULTATI GENERICI.
            // Sono 390.815 fontanelle importate da OSM: a Firenze occupavano
            // 189 dei 400 posti restituiti dalla RPC, spingendo fuori
            // farmacie, ospedali e stazioni — cioè quello che si cerca
            // quando si ha davvero un problema. Ora compaiono solo se
            // richieste: dal sub-chip «fontanelle» o dal layer 🚰 del
            // pannello ⓘ, che le ha tutte e non ruba posti a nessuno.
            const vuoleFontanelle = Array.isArray(subFilter) && subFilter.includes('fontanelle');
            const daNascondere = new Set(['fontanella', 'drinking_water', 'bagni_pubblici', 'toilets', 'panchina', 'bench']);
            const utili = (utilData as any[]).filter((item: any) =>
              vuoleFontanelle || !daNascondere.has(String(item.sub_category || '').toLowerCase()));
            const mapped = utili.map((item: any) => ({
              id: item.id,
              lat: Number(item.lat),
              lon: Number(item.lon),
              name: item.name || item.nome,
              category: item.category || 'locali',
              baseCategory: item.category || 'locali',
              subCategory: item.sub_category || item.category,
              image_url: item.image_url || item.photo_url || null,
              is_gem: false,
              isFromDb: true,
              status: 'verified'
            }));
            dbPois = dbPois.concat(mapped as any);
            console.log(`[Fast Cache] +${mapped.length} POI da utility_pois`);
          }
        } catch (utilEx) {
          console.warn('get_utility_pois non disponibile:', utilEx);
        }
      }

      // I POI community non devono dipendere dal clamp 25km / limit 1000
      // della RPC: fetch dedicato per bbox e merge (la versione bbox vince
      // sugli eventuali doppioni della RPC).
      if (activeCategories.includes('community')) {
        const communityExtra = await fetchCommunityPoisInBounds(south, west, north, east);
        if (communityExtra.length > 0) {
          const seen = new Set(communityExtra.map(p => String(p.id)));
          dbPois = dbPois.filter(p => !seen.has(String(p.id))).concat(communityExtra);
          console.log(`[MapArea] +${communityExtra.length} POI community (fetch bbox dedicato)`);
        }
      }

      // NATURA: fetch dedicata, vedi fetchNaturaPoisInBounds. La versione
      // bbox vince sui doppioni della RPC (porta poi_type e baseCategory).
      if (activeCategories.includes('natura')) {
        const naturaExtra = await fetchNaturaPoisInBounds(south, west, north, east);
        if (naturaExtra.length > 0) {
          const visti = new Set(naturaExtra.map(p => String(p.id)));
          dbPois = dbPois.filter(p => !visti.has(String(p.id))).concat(naturaExtra);
          console.log(`[MapArea] +${naturaExtra.length} POI natura (fetch bbox dedicato)`);
        }
      }

      // GEMME a scala larga: oltre i 25 km della RPC il cerchio non copre la
      // vista, e le gemme sono proprio i pin che a quella scala si cercano.
      // Vedi fetchGemmePoisInBounds. Sotto i 25 km la RPC basta e avanza.
      if (activeCategories.includes('gemme') && radius > 25000) {
        const gemmeExtra = await fetchGemmePoisInBounds(south, west, north, east);
        if (gemmeExtra.length > 0) {
          const visti = new Set(gemmeExtra.map(p => String(p.id)));
          dbPois = dbPois.filter(p => !visti.has(String(p.id))).concat(gemmeExtra);
          console.log(`[MapArea] +${gemmeExtra.length} gemme (fetch bbox dedicato, vista > 25 km)`);
        }
      }

      // MONUMENTI/CHIESE/MUSEI/PANORAMI, LOCALI, UTILITA, FAMIGLIE a scala
      // larga (24/08/2026): stessa ragione delle gemme sopra — oltre i 25 km
      // della RPC il cerchio non copre piu' la vista. Sotto i 25 km la RPC
      // (con l'osmToUiCategory di sopra) basta e avanza.
      if (radius > 25000) {
        const macroLargaMap: Array<{ macro: string; tipi: string[]; limite: number }> = [
          { macro: 'monumenti', tipi: [...CHIESE_TYPES, ...MUSEI_TYPES, ...PANORAMI_TYPES, ...MONUMENTI_TYPES], limite: 600 },
          { macro: 'locali', tipi: LOCALI_TYPES, limite: 400 },
          { macro: 'utilita', tipi: UTILITA_TYPES, limite: 400 },
          { macro: 'famiglie', tipi: FAMIGLIE_TYPES, limite: 300 },
        ];
        // (27/08/2026) IN PARALLELO, non in fila: erano quattro interrogazioni
        // una dopo l'altra e `famiglie` era l'ultima, dietro `monumenti` che
        // e' la piu' pesante (sessanta tipi, tetto 600). Con quattro chip
        // accese si sommavano quattro tempi di andata e ritorno invece di
        // pagare solo il piu' lento.
        const attivi = macroLargaMap.filter(m => activeCategories.includes(m.macro));
        const risposte = await Promise.all(attivi.map(({ macro, tipi, limite }) =>
          fetchTassonomiaPoisInBounds(south, west, north, east, tipi, macro, limite)
            .then(extra => ({ macro, extra }))));
        for (const { macro, extra } of risposte) {
          if (!extra.length) continue;
          const visti = new Set(extra.map(p => String(p.id)));
          dbPois = dbPois.filter(p => !visti.has(String(p.id))).concat(extra);
          console.log(`[MapArea] +${extra.length} ${macro} (fetch bbox dedicato, vista > 25 km)`);
        }
      }

      // LOCALITÀ TURISTICHE: sempre per bbox, come gemme oltre i 25 km — i
      // borghi sono radi (poche migliaia nel mondo, non milioni) e sono
      // esattamente ciò che si cerca a scala larga.
      if (activeCategories.includes('localita')) {
        const localitaExtra = await fetchLocalitaPoisInBounds(south, west, north, east, 500);
        if (localitaExtra.length > 0) {
          const visti = new Set(localitaExtra.map(p => String(p.id)));
          dbPois = dbPois.filter(p => !visti.has(String(p.id))).concat(localitaExtra);
          console.log(`[MapArea] +${localitaExtra.length} località (fetch bbox dedicato)`);
        }
      }

      // VERTICALI TEMATICI: stessa ragione dei community — la RPC non li
      // porterebbe mai tutti (clamp 25 km, tetto 1000) e sono cataloghi
      // curati, non riempitivo. Una sola query per tutti i verticali accesi.
      const temAttivi = categorieTematicheAttive(activeCategories);
      if (temAttivi.length > 0) {
        const tematiciExtra = await fetchTematiciPoisInBounds(south, west, north, east, temAttivi);
        if (tematiciExtra.length > 0) {
          const visti = new Set(tematiciExtra.map(p => String(p.id)));
          dbPois = dbPois.filter(p => !visti.has(String(p.id))).concat(tematiciExtra);
          console.log(`[MapArea] +${tematiciExtra.length} POI tematici (${temAttivi.join(', ')})`);
        }
      }

      // Atlante dei beni vincolati: tabella a parte, quindi fetch a parte.
      // Nessun filtro di fascia a nessuno zoom (26/08/2026): prima sotto
      // zoom 13 mostrava solo A, poi A+B — trattando l'atlante diversamente
      // dalle altre categorie, che a scala larga mostrano un campione senza
      // discriminare per "importanza". Qui resta solo il tetto di punti, che
      // cresce con lo zoom (più vicino, più densità reale nella vista).
      if (activeCategories.includes('beni_culturali')) {
        // Sotto zoom 10 la vista e' una regione o un paese: griglia 3×3, cosi'
        // il tetto si divide fra le celle e ogni zona porta i suoi beni.
        const beniExtra = await fetchBeniCulturaliInBounds(
          south, west, north, east, null,
          zoom >= BENI_CULTURALI_MIN_ZOOM ? 400 : 600,
          zoom < 10 ? 3 : 1,
        );
        if (beniExtra.length > 0) {
          // I beni già presenti come POI (stesso id) restano quelli veri, con
          // scheda e audioguida: si aggiungono solo quelli che mancano.
          const giaInMappa = new Set(dbPois.map(p => String(p.id)));
          const nuovi = beniExtra.filter(p => !giaInMappa.has(String(p.id)));
          dbPois = dbPois.concat(nuovi);
          console.log(`[MapArea] +${nuovi.length} beni culturali (${beniExtra.length - nuovi.length} già in mappa come POI)`);
        }
      }

      // Marcatura dei POI che sono ANCHE beni vincolati: badge sulla scheda e
      // presenza sotto entrambe le chip. Vale a chip atlante spenta o accesa.
      if (zoom >= BENI_CULTURALI_MIN_ZOOM && dbPois.length > 0) {
        const agganci = await fetchAgganciBeniInBounds(south, west, north, east);
        if (agganci.size > 0) {
          let marcati = 0;
          dbPois = dbPois.map((p: any) => {
            const bene = agganci.get(String(p.id));
            if (!bene) return p;
            marcati++;
            return { ...p, beneCulturale: bene };
          });
          console.log(`[MapArea] ${marcati} POI sono anche beni vincolati`);
        }
      }
    } catch (err: any) {
      console.warn("Fast POI fetch failed:", err);
    }

    // Risposta stale: nel frattempo è partito un fetch più recente, inutile proseguire
    if (fetchSeq !== fetchSeqRef.current) return;

    // Filtro per categorie attive, condiviso tra paint immediato e merge finale
    const matchesActiveFilters = (p: Poi): boolean => {
      if (!p.name || p.name.trim() === "") {
        const isUtility = p.category === "utilita" || p.category === "famiglie" || p.category === "locali";
        const hasSpecificIcon = p.subCategory && SUB_CATEGORY_EMOJIS[p.subCategory];
        if (!hasSpecificIcon && !isUtility) return false;
      }
      if (activeCategories.length === 0) return true;
      // Stessa tassonomia del rendering (resolvePoiTaxonomy): qui filtriamo
      // solo per macro — i sub-chip agiscono a valle in visiblePois, così
      // cambiarli non impone un nuovo fetch di rete.
      const { macro } = resolvePoiTaxonomy(p);
      return !!macro && activeCategories.includes(macro);
    };

    // ✅ PAINT IMMEDIATO: i POI del DB sono già pronti — mostrarli SUBITO,
    // senza aspettare Overpass/API esterne (fino a 20s). Il merge completo
    // a valle sovrascriverà comunque la lista con i dati arricchiti.
    if (dbPois.length > 0) {
      const quickPois = dbPois.filter(matchesActiveFilters);
      if (quickPois.length > 0) {
        setPois(prev => {
          const m = new Map<string, Poi>(prev.map(p => [String(p.id), p]));
          let added = false;
          quickPois.forEach(p => {
            if (!m.has(String(p.id))) { m.set(String(p.id), p); added = true; }
          });
          if (!added) return prev;
          console.log(`[MapArea] Paint immediato: +${quickPois.length} POI dal DB`);
          return Array.from(m.values());
        });
      }
    }

    // We'll fetch in parallel: Overpass + External APIs
    const fetchPromises: Promise<Poi[]>[] = [];

    // 1. Overpass Query Builder
    const centerLatLng = bounds.getCenter();
    const aroundStr = `around:30000,${centerLatLng.lat},${centerLatLng.lng}`;
    
    let query = "";
    let hasOverpassTags = false;

    // --- OVERPASS CATEGORY-AWARE SMART FALLBACK ---
    const dbCategoryCounts: Record<string, number> = {};
    dbPois.forEach(p => {
      const c = p.baseCategory || p.category;
      if (c) dbCategoryCounts[c] = (dbCategoryCounts[c] || 0) + 1;
    });

    const queriedCats = new Set<string>();

    // Categorie pratiche con Overpass come fallback. "locali" incluso:
    // Foursquare è la fonte primaria, ma se il DB/Foursquare hanno poco
    // (<15 risultati in zona) OSM fa da rete di sicurezza.
    const allowedOverpassCats = ["locali", "utilita", "famiglie", "eventi"];
    
    const categoriesToIterate = activeCategories.length > 0 
      ? activeCategories.filter(c => allowedOverpassCats.includes(c))
      : allowedOverpassCats;

    categoriesToIterate.forEach((cat) => {
      // Se abbiamo già moltissimi POI nel DB locale per questa categoria, possiamo saltare Overpass
      if ((dbCategoryCounts[cat] || 0) >= 15) {
        console.log(`[Overpass Smart] Skipping ${cat}, Supabase found ${dbCategoryCounts[cat]} results.`);
        return;
      }

      if (!queriedCats.has(cat)) {
        queriedCats.add(cat);
        const queryFn = LAYER_QUERIES[cat];
        if (queryFn) {
          hasOverpassTags = true;
          const subQuery = queryFn(bbox, cat === "eventi" ? aroundStr : undefined);
          query += subQuery;
        }
      }
    });

    const shouldFetchOverpass = true;

    if (hasOverpassTags && shouldFetchOverpass) {
        overpassAbortRef.current?.abort();
        // Istanza catturata nella closure: il timeout da 20s aborta SOLO la
        // propria richiesta, non quella più recente partita nel frattempo.
        const overpassCtrl = new AbortController();
        overpassAbortRef.current = overpassCtrl;

        const fetchOverpass = async () => {
          logApiCall('overpass', 'mappa_ricerca_attiva');
          const timeoutId = setTimeout(() => {
            overpassCtrl.abort();
            console.warn("[MapArea] Overpass API query aborted due to 20s timeout");
          }, 20000);

          try {
            const finalQuery = `[out:json][timeout:40];(${query});out 1000 center tags;`;
            
            const overpassMirrors = [
              "https://overpass-api.de/api/interpreter",
              "https://z.overpass-api.de/api/interpreter",
              "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
              "https://overpass.kumi.systems/api/interpreter"
            ];

            let res;
            let success = false;
            let lastError;

            for (const mirror of overpassMirrors) {
              try {
                res = await fetch(mirror, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/x-www-form-urlencoded"
                  },
                  body: `data=${encodeURIComponent(finalQuery)}`,
                  signal: overpassCtrl.signal,
                });
                if (res.ok) {
                  success = true;
                  break;
                }
              } catch (e) {
                lastError = e;
              }
            }

            if (!success || !res) {
              // Tutti e 4 i mirror hanno fallito (rete, timeout o errore HTTP):
              // il ramo UI del banner "overpass" esiste già (righe più sotto),
              // solo mai alimentato finora. Guardia sul fetchSeq: se nel
              // frattempo è già partito un fetch più recente, non sovrascrivere
              // il suo stato con un errore ormai superato.
              if (fetchSeq === fetchSeqRef.current) {
                setFetchErrors((prev) => ({
                  ...prev,
                  overpass: getTranslation('mp_overpass_errore', language),
                }));
              }
              throw new Error("Overpass API error on all mirrors: " + (lastError?.message || ""));
            }
            const data = await res.json();

            return data.elements
              .map((el: any) => {
                const lat = el.lat || el.center?.lat;
                const lon = el.lon || el.center?.lon;
                if (!lat || !lon) return null;

                const name = el.tags?.name || el.tags?.["name:it"] || el.tags?.["name:en"];
                const wikidata = el.tags?.wikidata;
                const wikipedia = el.tags?.wikipedia;

                // Categorizzazione esplicita e completa di ogni tipo OSM
                let cat = "monumenti"; // default per tutti i tipi storici
                const hist = el.tags?.historic || "";
                const amenity = el.tags?.amenity || "";
                const tourism = el.tags?.tourism || "";
                const building = el.tags?.building || "";
                // Luoghi di culto
                if (amenity === "place_of_worship" || building.match(/church|cathedral|chapel|basilica|mosque|temple|synagogue/) || hist.match(/church|monastery|abbey|convent/)) cat = "chiese";
                // Musei
                else if (tourism.match(/museum|gallery/)) cat = "musei";
                // Panorami
                else if (tourism === "viewpoint" || el.tags?.natural === "peak") cat = "panorami";
                // Siti storici → sempre monumenti (archaeological_site, ruins, castle, fort, ecc.)
                else if (hist.match(/monument|castle|ruins|archaeological_site|fort|fortress|tower|city_gate|memorial|tomb|milestone|manor|rune_stone|boundary_stone|building/)) cat = "monumenti";
                // Locali
                else if (amenity.match(/restaurant|cafe|fast_food|bar|pub|ice_cream/)) cat = "locali";
                // Utilità (i mercati rionali confluiscono qui come sub "mercato")
                else if (amenity.match(/hospital|pharmacy|police|library|post_office|drinking_water|taxi|toilets|marketplace/) || el.tags?.railway === "station" || el.tags?.barrier === "toll_booth" || el.tags?.railway === "subway_entrance") cat = "utilita";
                // Famiglie
                else if (el.tags?.leisure === "playground" || tourism.match(/theme_park|aquarium|zoo/)) cat = "famiglie";

                return {
                  id: `osm-${el.id}`,
                  lat,
                  lon,
                  name: name || "",
                  category: cat,
                  baseCategory: cat,
                  subCategory: normalizeSubCategory(el.tags?.amenity || el.tags?.tourism || el.tags?.historic || el.tags?.building || el.tags?.leisure || el.tags?.shop || el.tags?.craft || el.tags?.barrier || el.tags?.railway || el.tags?.highway || "monument"),
                  isFromDb: false,
                  is_gem: !!(wikidata || wikipedia),
                  wikidata,
                  wikipedia,
                  status: "verified" // Per poter essere visualizzato e cliccato
                };
              })
              .filter(Boolean);
          } catch (err) {
            console.error("Overpass query failed:", err);
            return [];
          } finally {
            clearTimeout(timeoutId);
          }
        };

        fetchPromises.push(fetchOverpass());
    } else if (hasOverpassTags) {
      const fetchOverpassDisabled = async () => {
        console.log("Overpass fetching is DISABLED for this category (using DB/Wiki only).");
        return [];
      };
      fetchPromises.push(fetchOverpassDisabled());
    }

    // 2. Locali live: Foursquare + TripAdvisor IN PARALLELO (Overpass parte
    // già con le altre categorie al punto 1). Google Places rimosso: era
    // codice morto, mai aggiunto alle fetchPromises.
    if (activeCategories.length === 0 || activeCategories.includes("locali")) {
      const fetchLocaliLive = async () => {
        const center = bounds.isValid()
          ? bounds.getCenter()
          : { lat: INITIAL_CENTER[0], lng: INITIAL_CENTER[1] };

        // (29/08/2026) PRIMA LA TABELLA locali_pois: i locali di Overture
        // importati in casa (nome, cucina, indirizzo con civico, sito,
        // telefono, marchio, stato). Foursquare ha esaurito il credito e
        // rispondeva 429 a ogni chiamata; TripAdvisor consuma quota a ogni
        // spostamento della mappa. Le due API restano SOLO come rete di
        // sicurezza per i riquadri dove la tabella e' vuota.
        if (bounds.isValid() && (bounds.getNorth() - bounds.getSouth()) < 0.6) {
          try {
            const { data: locali } = await supabase
              .from('locali_pois')
              .select('id,name,lat,lon,sub_category,cucina,brand,address,city,website,phone,socials,operating_status,confidence')
              .gte('lat', bounds.getSouth()).lte('lat', bounds.getNorth())
              .gte('lon', bounds.getWest()).lte('lon', bounds.getEast())
              .neq('operating_status', 'closed')
              .order('confidence', { ascending: false })
              .limit(400);
            if (locali && locali.length > 0) {
              return locali.map((l: any) => ({
                id: l.id,
                lat: Number(l.lat),
                lon: Number(l.lon),
                name: l.name,
                category: 'locali',
                baseCategory: 'locali',
                subCategory: l.sub_category || 'ristorante',
                poi_type: l.cucina || null,
                brand: l.brand || null,
                address: l.address || null,
                city: l.city || null,
                contact_website: l.website || null,
                contact_phone: l.phone || null,
                socials: Array.isArray(l.socials) ? l.socials : null,
                operating_status: l.operating_status || null,
                source: 'overture',
                status: 'verified',
                is_gem: false,
                isFromDb: true,
              }));
            }
          } catch (e) {
            console.warn('[MapArea] locali_pois non leggibile, passo alle API live', e);
          }
        }

        const fsqPromise = (async () => {
          logApiCall('foursquare', 'mappa_ricerca_locali');
          try {
            const res = await fetch('/api/foursquare', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ lat: center.lat, lon: center.lng, radius: 2000 })
            });
            if (res.ok) {
              const data = await res.json();
              return data.results || []; // Già mappati dal backend
            }
          } catch (e) {
            console.error("Foursquare fetch error:", e);
          }
          return [];
        })();

        const taPromise = (async () => {
          logApiCall('tripadvisor', 'mappa_ricerca_locali');
          try {
            // getApiUrl: percorso relativo = bundle locale sull'app nativa.
            const res = await fetch(getApiUrl(`/api/trip/search?searchQuery=ristorante&latLong=${center.lat},${center.lng}`));
            if (!res.ok) return [];
            const data = await res.json();
            const rows = (data.data || []).slice(0, 8);

            // La search TripAdvisor NON restituisce le coordinate: servono i
            // /details (a quota). Cache di sessione + max 6 lookup per fetch;
            // i locali senza coordinate risolte vengono scartati (il vecchio
            // fallback li ammucchiava tutti al centro mappa).
            let lookups = 0;
            const resolved = await Promise.all(rows.map(async (loc: any) => {
              const id = String(loc.location_id);
              let coords = tripCoordsCache.get(id);
              if (coords === undefined && lookups < 6) {
                lookups++;
                try {
                  const dRes = await fetch(`/api/trip/details?locationId=${id}`);
                  const d = dRes.ok ? await dRes.json() : null;
                  const dlat = parseFloat(d?.latitude);
                  const dlon = parseFloat(d?.longitude);
                  coords = (Number.isFinite(dlat) && Number.isFinite(dlon)) ? { lat: dlat, lon: dlon } : null;
                } catch {
                  coords = null;
                }
                tripCoordsCache.set(id, coords);
              }
              if (!coords) return null;
              return {
                id: `trip-${id}`,
                lat: coords.lat,
                lon: coords.lon,
                name: loc.name,
                category: "locali",
                subCategory: "ristorante",
                source: "tripadvisor",
                status: "verified"
              };
            }));
            return resolved.filter(Boolean);
          } catch (e) {
            console.error("TripAdvisor fetch error:", e);
          }
          return [];
        })();

        const [fsq, ta] = await Promise.all([fsqPromise, taPromise]);

        // Dedup per nome: lo stesso ristorante su entrambe le piattaforme
        // deve produrre UN pin solo (vince Foursquare: dati più ricchi)
        const seen = new Set(fsq.map((p: any) => (p.name || '').trim().toLowerCase()).filter(Boolean));
        const merged = fsq.concat((ta as any[]).filter((p: any) => {
          const k = (p.name || '').trim().toLowerCase();
          return k && !seen.has(k);
        }));

        if (merged.length > 0) return merged;

        // Fallback: database locale se entrambe le API sono giù/vuote
        console.log("[MapArea] Foursquare+TripAdvisor vuoti. Fallback su database locale.");
        return dbPois.filter(p => p.category === 'locali');
      };

      fetchPromises.push(fetchLocaliLive());
    }

    // 3. Wikipedia API (Monumenti, Chiese, Musei, Panorami, Gemme)
    const wikiCategories = ["monumenti", "chiese", "musei", "panorami", "gemme"];
    const hasWikiCategories = activeCategories.length === 0 || activeCategories.some(cat => wikiCategories.includes(cat));

    if (hasWikiCategories) {
      wikiAbortRef.current?.abort();
      const wikiCtrl = new AbortController();
      wikiAbortRef.current = wikiCtrl;

      const fetchWikiPois = async () => {
        logApiCall('wikipedia', 'mappa_ricerca_wiki');
        try {
          const center = bounds.isValid()
            ? bounds.getCenter()
            : { lat: INITIAL_CENTER[0], lng: INITIAL_CENTER[1] };
          
          let boundsRadius = 5000;
          if (mapRef.current) {
            try {
              const ne = mapRef.current.getBounds().getNorthEast();
              const sw = mapRef.current.getBounds().getSouthWest();
              boundsRadius = ne.distanceTo(sw) / 2;
            } catch(e){}
          }
          const radius = Math.min(Math.max(Math.round(boundsRadius), 1000), 20000); // between 1km and 20km
          const res = await fetch(`/api/wiki/pois?lat=${center.lat}&lon=${center.lng}&radius=${radius}&limit=200`, { signal: wikiCtrl.signal });
          if (res.ok) {
            const data = await res.json();
            const pages = data.query?.pages || {};
            const wikiRowsToSave: any[] = [];
            const wikiPois = Object.values(pages).map((p: any) => {
              const coords = p.coordinates?.[0];
              const rawLat = coords?.lat;
              const rawLon = coords?.lon;
              const latNum = typeof rawLat === "number" ? rawLat : parseFloat(rawLat);
              const lonNum = typeof rawLon === "number" ? rawLon : parseFloat(rawLon);
              
              let category = "monumenti";
              const titleLower = p.title.toLowerCase();
              const descLower = (p.description || "").toLowerCase();
              
              // Detect churches/religious places (multilingual)
              if (
                titleLower.includes("chiesa") || titleLower.includes("basilica") || titleLower.includes("cattedrale") || titleLower.includes("santuario") || titleLower.includes("duomo") || titleLower.includes("tempio") || titleLower.includes("convento") || titleLower.includes("chiostro") ||
                titleLower.includes("church") || titleLower.includes("cathedral") || titleLower.includes("mosque") || titleLower.includes("synagogue") || titleLower.includes("temple") || titleLower.includes("monastery") || titleLower.includes("abbey") || titleLower.includes("chapel") ||
                titleLower.includes("iglesia") || titleLower.includes("église") ||
                descLower.includes("church") || descLower.includes("cathedral") || descLower.includes("chiesa") || descLower.includes("religioso") || descLower.includes("religious")
              ) category = "chiese";
              // Detect panoramic spots
              else if (
                titleLower.includes("belvedere") || titleLower.includes("terrazza") || titleLower.includes("poggio") || titleLower.includes("viewpoint") ||
                descLower.includes("panoramico") || descLower.includes("panoramic") || descLower.includes("vista") || descLower.includes("overlook")
              ) category = "panorami";
              // Detect museums
              else if (
                titleLower.includes("museo") || titleLower.includes("museum") || titleLower.includes("musée") || titleLower.includes("galleria") || titleLower.includes("gallery") ||
                descLower.includes("museum") || descLower.includes("museo")
              ) category = "musei";
              // All other landmarks: monuments, ruins, archaeological sites, palaces, castles, etc.
              // Accept everything from Wikipedia geosearch — if Wiki has coordinates it's worth showing
              else {
                category = "monumenti";
              }
              
              const originalCategory = category;
              const finalCategory = "gemme";

              const isSelected = activeCategories.length === 0 || activeCategories.includes(finalCategory) || activeCategories.includes(originalCategory);
              
              const wikiPoi = {
                id: `wiki-${p.pageid}`,
                name: p.title,
                lat: latNum,
                lon: lonNum,
                category: finalCategory,
                baseCategory: originalCategory,
                originalCategory: originalCategory !== finalCategory ? originalCategory : undefined,
                wikipedia_extract: p.description || "",
                imageUrl: p.thumbnail?.source,
                hidden: !isSelected // Keep it but mark as hidden to help deduplication if needed
              };

              // Accumula per un UNICO upsert batch a fine mappatura: prima ogni
              // POI Wikipedia faceva la sua upsert singola (~200 richieste a
              // shared_pois per ogni pan/zoom della mappa). Solo coordinate
              // valide, così una riga NaN non fa fallire l'intero chunk.
              if (Number.isFinite(latNum) && Number.isFinite(lonNum)) {
                wikiRowsToSave.push({
                  id: wikiPoi.id,
                  lat: wikiPoi.lat,
                  lon: wikiPoi.lon,
                  name: wikiPoi.name,
                  category: wikiPoi.category,
                  technical_data: { wikipedia_raw: p },
                  description_ai: wikiPoi.wikipedia_extract,
                  created_at: new Date().toISOString()
                });
              }

              return wikiPoi;
            }).filter((poi: any) => poi !== null && typeof poi.lat === "number" && Number.isFinite(poi.lat) && !isNaN(poi.lat) && typeof poi.lon === "number" && Number.isFinite(poi.lon) && !isNaN(poi.lon) && !poi.hidden);

            // Persist in blocco (chunk da 50, stesso pattern di newPoisToSave):
            // fire-and-forget, non ritarda il primo paint dei pin.
            if (wikiRowsToSave.length > 0) {
              (async () => {
                for (let i = 0; i < wikiRowsToSave.length; i += 50) {
                  const chunk = wikiRowsToSave.slice(i, i + 50);
                  const { error } = await supabase.from('shared_pois').upsert(chunk, { onConflict: "id" });
                  if (error) console.warn("[MapArea] Failed to persist wiki POIs to DB:", error);
                }
              })();
            }

            return wikiPois;
          }
        } catch (e: any) {
            console.warn("Wiki fetch skipped:", e.message);
        }
        return [];
      };
      fetchPromises.push(fetchWikiPois());
    }

    // OVERPASS FALLBACK (CULTURAL)
    const culturalDbPois = dbPois.filter(p => ["monumenti", "chiese", "musei"].includes(p.category || ""));
    const hasCultural = activeCategories.length === 0 || activeCategories.some(c => ["monumenti", "chiese", "musei"].includes(c));
    
    if (culturalDbPois.length < 5 && hasCultural) {
       const fetchOverpassCultural = async () => {
          logApiCall('overpass', 'mappa_ricerca_culturale');
          try {
            const center = bounds.isValid() ? bounds.getCenter() : { lat: INITIAL_CENTER[0], lng: INITIAL_CENTER[1] };
            const res = await fetch(`/api/overpass/cultural?lat=${center.lat}&lon=${center.lng}&radius=2000`);
            if (res.ok) {
               const data = await res.json();
               if (data.results && data.results.length > 0) {
                  return data.results;
               }
            }
          } catch(e) {
            console.error("Overpass fallback error:", e);
          }
          return [];
       };
       fetchPromises.push(fetchOverpassCultural());
    }

    try {
      const results = await Promise.all(fetchPromises);
      // Scarta le risposte stale: il merge e il setPois spettano solo al fetch più recente
      if (fetchSeq !== fetchSeqRef.current) return;
      const allPois = results.flat();

      // 1. Crea mappe per il merge ibrido
      const dbMap = new Map<string, Poi>();
      dbPois.forEach(p => {
        const coordKey = `${p.lat.toFixed(4)},${p.lon.toFixed(4)}`;
        dbMap.set(coordKey, p);
      });

      const mergedPoisMap = new Map<string, Poi>();
      const newPoisToSave: Poi[] = [];

      // 2. Processa tutti i POI scaricati in tempo reale (live)
      allPois.forEach((poi) => {
        const idStr = String(poi.id);
        const coordKey = `${poi.lat.toFixed(4)},${poi.lon.toFixed(4)}`;
        
        // Cerca per ID esatto o per coordinate
        let cached = dbMap.get(idStr);
        if (!cached) {
          const cachedByCoord = dbMap.get(coordKey);
          // Se troviamo un POI alle stesse coordinate, uniamo SOLO se la categoria è la stessa
          // Questo evita che un "Bar" prenda la descrizione di un "Museo" (Teatro) adiacente
          // …e SOLO se anche il nome combacia (22/08/2026): a 4 decimali
          // (~11 m) chiesa e campanile, o due chiese adiacenti, stanno sulla
          // stessa chiave e si scambiavano foto e descrizione.
          const norm = (s: any) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
          const tok = (s: any) => norm(s).split(' ').filter(t => t.length >= 4);
          const stessoNome = (a: any, b: any) => {
            const na = norm(a), nb = norm(b);
            if (!na || !nb) return false;
            if (na === nb || na.includes(nb) || nb.includes(na)) return true;
            const tb = tok(b);
            return tok(a).some(t => tb.includes(t));
          };
          if (cachedByCoord
              && (cachedByCoord.category === poi.category || cachedByCoord.baseCategory === poi.category)
              && stessoNome(cachedByCoord.name, poi.name)) {
            cached = cachedByCoord;
          }
        }

        if (cached) {
          // Unione: mantiene le proprietà, preferisce il DB per i dati ricchi se presenti,
          // ma salvaguarda i dati live (come immagine o descrizione) se il DB ha campi null!
          mergedPoisMap.set(idStr, {
            ...poi,
            ...cached,
            id: poi.id, // Mantiene l'ID live per coerenza con i marker del client
            description: cached.description || poi.description || (poi as any).wikipedia_extract || null,
            description_short: cached.description_short || (poi as any).description_short || null,
            description_long: cached.description_long || (poi as any).description_long || null,
            image_url: cached.image_url || poi.image_url || (poi as any).imageUrl || null,
            photo_url: cached.photo_url || (poi as any).photo_url || null,
            status: cached.status || (poi as any).status || null,
            // MAI azzerare is_gem quando la riga DB non ce l'ha: `?? null`
            // buttava via il valore live e faceva oscillare key e icona del
            // marker tra un fetch e l'altro (pin distrutto e ricreato).
            is_gem: cached.is_gem ?? poi.is_gem ?? null,
            isFromDb: true
          });
        } else {
          // Nuovo punto mai salvato! Lo mostra e lo prepara per il salvataggio automatico
          mergedPoisMap.set(idStr, poi);
          newPoisToSave.push(poi);
        }
      });

      // 3. Aggiunge i POI presenti solo nel database (es. visioni, ecc.) non restituiti dalle API live
      dbPois.forEach((item) => {
        const idStr = String(item.id);
        if (!mergedPoisMap.has(idStr)) {
          mergedPoisMap.set(idStr, item);
        }
      });

      const finalMergedList = Array.from(mergedPoisMap.values());

      // Filtra i POI in base alle categorie attualmente attive
      const finalPois = finalMergedList.filter(matchesActiveFilters);
      console.log(`[MapArea] Hybrid Merge: Live ${allPois.length} + DB ${dbPois.length} = Merged ${finalMergedList.length}`);

      // 4. Salva silenziosamente i nuovi POI scoperti nel database in background per il caching geografico
      if (newPoisToSave.length > 0) {
        (async () => {
          try {
            const filteredNewPois = newPoisToSave.filter((poi: any) => {
              if (isGenericUtilityName(poi.name)) {
                // EXEMPTION: Important utilities and metro stops should not be discarded
                const safeSubCats = ["Fermata Metro", "Farmacia", "Ospedale", "Polizia", "Taxi", "Stazione", "Bagni Pubblici", "Fontanella", "Casello Autostradale", "Mercato Locale", "farmacia", "ospedale", "polizia", "taxi", "stazione_ferroviaria", "metropolitana", "fontanelle", "casello_autostradale", "mercato"];
                if (poi.category === "utilita" && poi.subCategory && safeSubCats.includes(poi.subCategory)) {
                  return true;
                }
                return false; // Discard generic/unnamed park or parking from saving universally!
              }
              return true;
            });

            if (filteredNewPois.length === 0) return;

            const rowsToInsert = filteredNewPois.map(poi => {
              // Usa l'ID originale (es. fsq-..., osm-...) per evitare collisioni spaziali
              // Se non ha id proprio, usiamo un fallback
              const uniqueId = poi.id ? String(poi.id) : `${poi.lat.toFixed(5).replace('.', '_')}_${poi.lon.toFixed(5).replace('.', '_')}_${Math.random().toString(36).substr(2, 5)}`;
              
              return {
                id: uniqueId,
                lat: poi.lat,
                lon: poi.lon,
                name: poi.name || "Luogo d'interesse",
                category: poi.baseCategory || poi.category,
                // Cache crowdsourced dal client: SEMPRE 'auto' (mai 'verified',
                // che spetta alla revisione/cron). La policy RLS accetta dai
                // client solo INSERT con status='auto' e is_gem=false.
                status: "auto",
                is_gem: false,
                description_ai: (poi as any).wikipedia_extract || (poi as any).description || null,
                image_url: (poi as any).imageUrl || (poi as any).image_url || null,
                created_at: new Date().toISOString()
              };
            });

            // Inserisci in gruppi da 50 per massimizzare le performance di rete
            const utilityCats = ["locali", "utilita", "famiglie"];
            const historicalPois = rowsToInsert.filter(p => !utilityCats.includes(p.category));
            const utilityPois = rowsToInsert.filter(p => utilityCats.includes(p.category));

            const upsertChunk = async (table: string, chunk: any[]) => {
              if (chunk.length === 0) return;
              for (let i = 0; i < chunk.length; i += 50) {
                const subChunk = chunk.slice(i, i + 50);
                let { error } = await supabase
                  .from(table)
                  .upsert(subChunk, { onConflict: "id", ignoreDuplicates: true } as any);
                
                if (error && (error.code === 'PGRST204' || error.message?.includes('column'))) {
                  console.warn(`[Background Cache] Column mismatch detected on ${table}, retrying...`);
                  const minimalChunk = subChunk.map((item: any) => ({
                    id: item.id,
                    lat: item.lat,
                    lon: item.lon,
                    name: item.name,
                    category: item.category,
                    created_at: item.created_at
                  }));
                  const retryRes = await supabase
                    .from(table)
                    .upsert(minimalChunk, { onConflict: "id", ignoreDuplicates: true } as any);
                  error = retryRes.error;
                }
                if (error) {
                  console.debug(`[Background Cache] Failed to upsert ${table}:`, error.message);
                } else {
                  console.log(`[Background Cache] Successfully cached ${subChunk.length} POIs in ${table}.`);
                }
              }
            };

            await upsertChunk("shared_pois", historicalPois);
            await upsertChunk("utility_pois", utilityPois);

          } catch (e: any) {
            console.debug("[Background Cache] Exception skipped:", e.message);
          }
        })();
      }

      setPois((prev) => {
        const poiMap = new Map<string, Poi>();
        
        // 1. Carica i POI precedenti attivi (solo se sono all'interno o nelle vicinanze della mappa corrente per ottimizzare Android)
        // Margine 100%: col vecchio 50% bastava un pan modesto per far uscire
        // ed eliminare pin che il fetch successivo riscaricava → blink ai bordi.
        const paddedBounds = bounds.pad(1.0);
        prev.forEach(p => {
          // Stessa tassonomia del rendering: niente più liste "espanse" che
          // riammettevano chiese e musei deselezionati.
          const { macro } = resolvePoiTaxonomy(p);
          const keep = !!macro && activeCategories.includes(macro);

          if (keep && ((p.category === 'utilita' || p.category === 'famiglie') ? true : !isGenericUtilityName(p.name))) {
            // Android Perf: scarta i vecchi POI lontani dalla vista attuale
            try {
              if (paddedBounds.contains([p.lat, p.lon])) {
                poiMap.set(String(p.id), p);
              }
            } catch (e) {
              poiMap.set(String(p.id), p); // Fallback
            }
          }
        });
        
        // 2. Aggiunge i nuovi POI uniti (sovrascrive se ID coincide)
        finalPois.forEach(p => {
          // Sfarfallio del pin appena aperto (26/08/2026): i marker sono
          // raggruppati per categoria in MarkerClusterGroup separate — se
          // durante l'arricchimento la classificazione del POI cambia (dato
          // grezzo → dato Overpass/beneCulturale), React deve smontarlo da un
          // gruppo Leaflet e rimontarlo in un altro: un remove/add completo,
          // molto visibile proprio sul pin appena centrato/aperto (il pan di
          // centerMapOnPoi allarga i bounds e fa ripartire questo stesso
          // fetch). Mentre la scheda è aperta si tiene ferma la categoria già
          // mostrata: tutto il resto (foto, descrizione...) si aggiorna lo
          // stesso, l'utente non perde l'arricchimento.
          const attuale = poiMap.get(String(p.id));
          if (attuale && String(p.id) === String(activePoi?.id) && p.category !== attuale.category) {
            poiMap.set(String(p.id), { ...p, category: attuale.category, baseCategory: attuale.baseCategory });
            return;
          }
          poiMap.set(String(p.id), p);
        });

        let merged = Array.from(poiMap.values());

        // Se la lista è identica alla precedente (stessi id), riusa l'array
        // esistente: evita di ricostruire tutti i <Marker> a ogni moveend
        // (era una delle cause dello sfarfallio dei pin).
        // Confronto sull'INSIEME degli id, non solo sulla lunghezza: bastava
        // che un POI entrasse e un altro uscisse per rigenerare l'array e far
        // ricostruire tutti i marker (pin che sparivano e riapparivano).
        const prevIds = new Set(prev.map(p => String(p.id)));
        if (merged.length === prevIds.size && merged.every(p => prevIds.has(String(p.id)))) {
          return prev;
        }

        // Per i POI già presenti riusiamo l'oggetto precedente quando i campi
        // che influenzano il marker (posizione, categoria, icona) non sono
        // cambiati: identità stabile ⇒ react-leaflet non tocca il DOM.
        const prevById = new Map<string, Poi>(prev.map(p => [String(p.id), p] as [string, Poi]));
        merged = merged.map(p => {
          let cur = p;
          const old = prevById.get(String(cur.id));
          if (!old) return cur;
          // Upgrade MONOTONO dei campi che disegnano il marker: quando un giro
          // di fetch non riceve la riga DB (raggio/limite 1000 della RPC), il
          // POI torna "live-only" e is_gem/categoria regredirebbero cambiando
          // key e icona → pin distrutto e ricreato (sfarfallio). La versione
          // arricchita già mostrata vince finché il nuovo giro non porta
          // anch'esso dati DB.
          if ((old as any).isFromDb && !(cur as any).isFromDb) {
            cur = {
              ...cur,
              category: old.category,
              baseCategory: (old as any).baseCategory ?? (cur as any).baseCategory,
              subCategory: (old as any).subCategory ?? (cur as any).subCategory,
              is_gem: (old.is_gem ?? cur.is_gem) as any,
              status: ((old as any).status ?? (cur as any).status) as any,
              isFromDb: true,
            } as Poi;
          } else if ((cur.is_gem === null || cur.is_gem === undefined) && old.is_gem != null) {
            cur = { ...cur, is_gem: old.is_gem };
          }
          const same =
            old.lat === cur.lat && old.lon === cur.lon &&
            old.category === cur.category && old.baseCategory === cur.baseCategory &&
            old.subCategory === cur.subCategory && old.is_gem === cur.is_gem &&
            old.name === cur.name;
          return same ? old : cur;
        });

        // Safety cap per performance: max 500 marker su web (prioritiamo gemme e siti con wikidata).
        // ISTERESI: a parità di score vincono i pin GIÀ visibili — col vecchio
        // sort puro sulla distanza dal centro, un micro-pan cambiava quali 500
        // sopravvivevano e a ogni ciclo un gruppo diverso di pin spariva e
        // riappariva (sfarfallio a lotti).
        if (merged.length > 500) {
            const currentCenter = bounds.getCenter();
            // I beni di solo atlante sono gli ULTIMI a essere tenuti: sono un
            // layer informativo e in una città storica sono tanti, quindi senza
            // questa priorità sfratterebbero i POI turistici veri dal tetto dei
            // 500. Gemme e siti con wikidata restano davanti a tutto.
            const rank = (p: any) => {
                if (p.is_gem || p.wikidata || p.category === 'gemme') return 0;
                if (p.category === 'beni_culturali') return 2;
                return 1;
            };
            merged.sort((a: any, b: any) => {
                const scoreA = rank(a);
                const scoreB = rank(b);
                if (scoreA !== scoreB) return scoreA - scoreB;
                const keepA = prevIds.has(String(a.id)) ? 0 : 1;
                const keepB = prevIds.has(String(b.id)) ? 0 : 1;
                if (keepA !== keepB) return keepA - keepB;
                const distA = getDistanceFromLatLonInM(currentCenter.lat, currentCenter.lng, a.lat, a.lon);
                const distB = getDistanceFromLatLonInM(currentCenter.lat, currentCenter.lng, b.lat, b.lon);
                return distA - distB;
            });
            merged = merged.slice(0, 500);
        }
        
        console.log(`[MapArea] Final POIs to render: ${merged.length}`);
        return merged;
      });
      lastFetchedStateRef.current = pendingCacheState;
    } catch (e) {
      console.error("General POI fetch error:", e);
    } finally {
      // Solo il fetch corrente può spegnere lo spinner (un fetch più recente lo sta gestendo)
      if (fetchSeq === fetchSeqRef.current) setIsLoadingPois(false);
    }
  };

  const fetchPois = useCallback(
    (bounds: L.LatLngBounds) => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      debounceTimerRef.current = setTimeout(() => {
        // `moveend` scatta anche per i movimenti PROGRAMMATICI (flyTo di
        // MapController, panTo del follow-me a ogni fix GPS, centratura su un
        // POI). Senza una soglia il follow-me lanciava un fetch al secondo:
        // ogni risposta riscriveva la lista POI e i pin sfarfallavano.
        try {
          const center = bounds.getCenter();
          const zoom = mapRef.current?.getZoom() ?? 13;
          const last = lastFetchAnchorRef.current;
          if (last && last.zoom === zoom) {
            const movedM = getDistanceFromLatLonInM(last.lat, last.lon, center.lat, center.lng);
            // In follow-me la mappa insegue il GPS: rinfreschiamo solo dopo uno
            // spostamento reale, non a ogni aggiornamento di posizione.
            const thresholdM = followModeRef.current ? 400 : 120;
            if (movedM < thresholdM) return;
          }
          lastFetchAnchorRef.current = { lat: center.lat, lon: center.lng, zoom };
        } catch { /* bounds non validi: procediamo comunque */ }

        performFetchPois(bounds);
      }, 350);
    },
    [selectedCategories, subFilter],
  );

  const visiblePois = useMemo(() => {
    // Se la modalità Radar è attiva, mostriamo SOLO i POI monitorati dall'audioguida
    if (isRadarMode) {
      return radarPois || [];
    }

    return pois.filter((originalPoi) => {
      // 0. Correggi farmacie e stazioni al volo (cross-lingua e molto più aggressivo)
      const p = { ...originalPoi };
      const nameL = p.name?.toLowerCase() || '';
      const am = (p.amenity || '').toLowerCase();
      // Niente JSON.stringify dell'intero POI (fino a 500 stringify per
      // ricalcolo sul main thread = scatti visibili): controlli mirati.
      const rawTags: any = (p as any).tags || {};
      const railwayVal = String((p as any).railway ?? rawTags.railway ?? '').toLowerCase();
      const hasPublicTransport = (p as any).public_transport != null || rawTags.public_transport != null;
      
      const isUtilityWord = nameL.includes('farmacia') || nameL.includes('farmacie') || nameL.includes('stazion') || nameL.includes('station') || nameL.includes('ospedal') || nameL.includes('hospital') || nameL.includes('fontanella') || nameL.includes('polizia') || nameL.includes('police') || nameL.includes('taxi') || nameL.includes('ufficio postale') || nameL.includes('post office') || nameL.includes('parcheggio') || nameL.includes('parking') || nameL.includes('fermata') || nameL.includes('bus stop') || nameL.includes('terminal') || /\basl\b/.test(nameL) || /\bserd\b/.test(nameL) || nameL.includes('consultorio') || nameL.includes('clinica') || nameL.includes('ambulatorio') || nameL.includes('pronto soccorso') || nameL.includes('veterinar') || nameL.includes('medico') || nameL.includes('centro salute');
      const isUtilityTag = am === 'pharmacy' || am === 'hospital' || am === 'clinic' || am === 'doctors' || am === 'dentist' || am === 'social_facility' || am === 'veterinary' || am === 'police' || am === 'taxi' || am === 'drinking_water' || am === 'post_office' || am === 'parking' || railwayVal === 'station' || hasPublicTransport;
      
      // I verticali tematici sono esclusi da questa correzione: un treno
      // storico, una funicolare o un traghetto panoramico si chiamano quasi
      // sempre "Stazione …" e l'euristica li ribattezzerebbe utilità,
      // facendoli sparire dalla chip 🧭 che l'utente ha appena acceso.
      if ((isUtilityWord || isUtilityTag) && !isTematico(p)) {
        p.category = 'utilita';
        // Non sovrascrivere una subCategory reale (es. 'farmacia' dal DB):
        // serve al match dei sub-filtri
        if (!p.subCategory || p.subCategory === p.baseCategory) p.subCategory = 'utilita';
        p.is_gem = false;
        p.baseCategory = 'utilita';
      }

      // Nascondi i POI utilità/famiglie VUOTI o con nome generico ("luogo
      // d'interesse", parcheggio, punto, area sosta…). I servizi con nome reale
      // (Farmacia Rossi, Stazione Centrale) restano. Queste categorie erano
      // esentate dal filtro anti-vuoti a monte; qui lo applichiamo — cattura
      // anche i POI utilità da Overpass live che saltano le RPC filtrate.
      if ((p.category === 'utilita' || p.category === 'famiglie') && isGenericUtilityName(p.name)) {
        return false;
      }

      // Cross-category disabili (wheelchair accessible) filter override!
      if (subFilter && subFilter.includes("disabili")) {
        return isAccessible(p);
      }

      // REGOLA FERREA: macro selezionata e, quando ci sono sub-chip attivi di
      // quella macro, sotto-categoria selezionata. Tutta la regola sta in
      // passesCategoryRule (src/lib/poiTaxonomy.ts), euristiche comprese.
      return passesCategoryRule(p, selectedCategories, subFilter);
    });
  }, [pois, selectedCategories, subFilter, isRadarMode, radarPois]);


  // Initial fetch when map is ready — e a ogni cambio di categorie/sotto-filtro.
  useEffect(() => {
    if (mapRef.current) {
      try {
        // Le chip sono cambiate: l'ancora anti-sfarfallio (120/400 m) vale
        // solo per i MOVIMENTI della mappa, non per un filtro nuovo. Senza
        // questo reset, toccare «Locali» a mappa ferma non caricava nulla
        // finché non si trascinava.
        lastFetchAnchorRef.current = null;
        const bounds = mapRef.current.getBounds();
        if (
          bounds &&
          typeof bounds.isValid === "function" &&
          bounds.isValid()
        ) {
          fetchPois(bounds);
        }
      } catch (e) {
        console.warn("Initial bounds error:", e);
      }
    }
  }, [fetchPois, selectedCategories, subFilter]);

  // (23/08/2026) Qui c'era il vecchio "Radar Proximity Check": ogni 3 s, con
  // l'audioguida accesa, apriva la scheda del PRIMO POI della lista entro
  // 120 m chiamando onSelectPoi direttamente — senza accuracy, senza
  // avvicinamento, senza cooldown e senza passare da 'wip-poi-trigger'.
  // Chiudevi la scheda e tre secondi dopo era di nuovo li' (Stadio dei Marmi
  // in loop, da casa, con un fix WiFi). Il geofencing web in foreground lo fa
  // lib/geofencing/foregroundTriggers.ts con tutte le guardie: quel blocco
  // era un doppione senza regole ed e' stato tolto, non rattoppato.

  const selectLocation = (latStr: string, lonStr: string) => {
    const latNum = parseFloat(latStr);
    const lonNum = parseFloat(lonStr);

    if (isNaN(latNum) || isNaN(lonNum)) {
      console.error(
        "Invalid coordinates received from search:",
        latStr,
        lonStr,
      );
      return;
    }

    // Direct map manipulation for snappier feel
    if (mapRef.current) {
      mapRef.current.stop();
      mapRef.current.flyTo([latNum, lonNum], 15, { duration: 1.2 });
    }

    setCenter([latNum, lonNum]);
    setMapZoom(15);
    setSuggestions([]);
    setSearchQuery("");
    
    // Clear the bounding box cache ref on explicit search execution
    lastFetchedStateRef.current = null;

    // Snappy update for external components
    if (onCenterChange) {
      onCenterChange([latNum, lonNum]);
    }
  };

  const handleSuggestionClick = async (suggestion: any) => {
    // Immediate feedback: clear suggestions
    setSuggestions([]);
    setNostri([]);
    // Scelto un risultato, la riga di ricerca si richiude: la mappa e' quello
    // che si vuole guardare, non la casella (30/08/2026).
    setRicercaAperta(false);

    // I nostri risultati (23/08/2026).
    if (suggestion.kind === 'categoria') {
      // Accende la chip (App.tsx ascolta) e, se la frase portava un luogo
      // ("spiagge toscana"), centra li' a scala di regione: i pin arrivano
      // dalla fetch per bbox di quella categoria.
      window.dispatchEvent(new CustomEvent('wip-set-category', { detail: { macro: suggestion.macro, sub: suggestion.sub || null } }));
      setSearchQuery(suggestion.luogo ? `${suggestion.label} · ${suggestion.luogo.name}` : suggestion.label);
      if (suggestion.luogo && mapRef.current) {
        lastFetchedStateRef.current = null;
        mapRef.current.flyTo([suggestion.luogo.lat, suggestion.luogo.lon], 9, { duration: 1.2 });
        onCenterChange?.([suggestion.luogo.lat, suggestion.luogo.lon]);
      }
      return;
    }
    if (suggestion.kind === 'poi' || suggestion.kind === 'percorso') {
      const p: any = {
        id: suggestion.id, name: suggestion.name, lat: suggestion.lat, lon: suggestion.lon,
        category: suggestion.category, subCategory: suggestion.poi_type || suggestion.category,
        city: suggestion.city || undefined, country: suggestion.country || undefined,
        image_url: suggestion.image_url || undefined, is_gem: !!suggestion.is_gem,
        isFromDb: true, status: 'verified',
      };
      setSearchQuery(suggestion.name);
      // Il pin deve esistere per avere il popup: se non e' gia' in mappa si aggiunge.
      setPois(prev => (prev.some(x => String(x.id) === String(p.id)) ? prev : [...prev, p as Poi]));
      focusPoiOnMap(p as Poi);
      return;
    }

    const text = suggestion.isMapbox
      ? suggestion.description.split(",")[0]
      : (suggestion.isNominatim ? suggestion.description.split(",")[0] : suggestion.description);

    setSearchQuery(text);

    if (suggestion.lat && suggestion.lon) {
      selectLocation(suggestion.lat.toString(), suggestion.lon.toString());
      return;
    }
  };

  const handleSearch = async (e: FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setSuggestions([]);
    setIsSearching(true);
    
    const searchAbort = new AbortController();
    const timeoutId = setTimeout(() => {
      searchAbort.abort();
      console.warn("[MapArea] Nominatim search aborted due to 8s timeout");
    }, 8000);

    try {
      // getApiUrl e non un percorso relativo (30/08/2026): sull'app nativa la
      // pagina sta su capacitor://localhost, quindi «/api/...» puntava al
      // bundle dentro l'APK e la ricerca non trovava NIENTE — mentre sulla
      // PWA, dove l'origine e' wip.guide, funzionava. E` la ragione per cui la
      // ricerca della citta' andava sul sito e non nell'app.
      const response = await fetch(
        getApiUrl(`/api/nominatim/search?q=${encodeURIComponent(searchQuery)}&format=json&lang=${language.toLowerCase()}`),
        { signal: searchAbort.signal }
      );

      if (!response.ok) {
        throw new Error(`Search API error: ${response.status}`);
      }

      const data = await response.json();
      if (data && data.length > 0) {
        selectLocation(data[0].lat, data[0].lon);
      }
    } catch (error) {
      console.error("Search error:", error);
    } finally {
      clearTimeout(timeoutId);
      setIsSearching(false);
    }
  };

  const handleMyLocation = (isLongPress = false) => {
    // Se è un click normale, centra solo una volta senza attivare il follow permanente
    if (!isLongPress && !followMode) {
      // Avvia comunque il watch: così i click successivi (e il follow) hanno
      // sempre una posizione fresca senza dover rifare la richiesta one-shot.
      try { locationService.startWatching(true); } catch (e) {}
      if (userLocation && mapRef.current) {
        mapRef.current.flyTo(userLocation, 18, { duration: 1.2 });
      } else {
        // Fallback al locationService per richiedere la posizione attuale
        import('@capacitor/geolocation').then(async ({ Geolocation }) => {
          // Su iOS/Android senza permesso concesso getCurrentPosition fallisce
          // subito: chiediamolo qui, è il gesto esplicito dell'utente.
          try {
            const perm = await Geolocation.checkPermissions();
            if (perm.location !== 'granted' && perm.coarseLocation !== 'granted') {
              await Geolocation.requestPermissions({ permissions: ['location'] });
            }
          } catch { /* su web il check non esiste: si prosegue */ }
          Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 8000 }).then(pos => {
            const lat = pos.coords.latitude;
            const lon = pos.coords.longitude;
            if (Number.isFinite(lat) && Number.isFinite(lon) && mapRef.current) {
               setUserLocation([lat, lon]);
               mapRef.current.flyTo([lat, lon], 18, { duration: 1.2 });
            }
          }).catch(err => {
            console.warn('[GPS] Centering error:', err);
            setFetchErrors((prev) => ({
              ...prev,
              location: getTranslation("geolocation_error_unsupported", language),
            }));
            setTimeout(() => setFetchErrors((prev) => { const n = {...prev}; delete n.location; return n; }), 6000);
          });
        }).catch(() => {
           // Fallback browser standard se non c'è Capacitor
           if (navigator.geolocation) {
             navigator.geolocation.getCurrentPosition(
               (pos) => {
                  const lat = pos.coords.latitude;
                  const lon = pos.coords.longitude;
                  setUserLocation([lat, lon]);
                  if (mapRef.current) mapRef.current.flyTo([lat, lon], 18, { duration: 1.2 });
               },
               () => {
                  // Prima falliva in silenzio: l'utente premeva il mirino e
                  // non succedeva nulla. Ora almeno lo segnaliamo.
                  setFetchErrors((prev) => ({
                    ...prev,
                    location: getTranslation("geolocation_error_unsupported", language),
                  }));
                  setTimeout(() => setFetchErrors((prev) => { const n = {...prev}; delete n.location; return n; }), 6000);
               }
             );
           }
        });
      }
      return;
    }

    // Se è un long press o se siamo già in follow mode, attiva/disattiva il follow permanente
    if (followMode) {
      stopFollowMode();
      return;
    }

    setFollowMode(true);

    // 1. Centra mappa immediatamente sulla posizione corrente se disponibile
    if (userLocation && mapRef.current) {
      mapRef.current.flyTo(userLocation, 18, { duration: 1.2 });
    }

    // 2. Assicuriamoci che locationService stia guardando attivamente
    locationService.startWatching(true);

    // 3. Attiva la bussola se non attiva
    if (!compassListenerRef.current) {
      const startCompass = (handler: (e: DeviceOrientationEvent) => void) => {
        compassListenerRef.current = handler;
        if ('ondeviceorientationabsolute' in window) {
          (window as any).addEventListener('deviceorientationabsolute', handler);
        } else {
          (window as any).addEventListener('deviceorientation', handler);
        }
      };

      const compassHandler = (e: DeviceOrientationEvent) => {
        let heading: number | null = null;
        const webkitEvent = e as any;
        if (webkitEvent.webkitCompassHeading !== undefined && webkitEvent.webkitCompassHeading !== null) {
          heading = webkitEvent.webkitCompassHeading;
        } else if (e.absolute && e.alpha !== null) {
          heading = (360 - (e.alpha ?? 0)) % 360;
        } else if (e.alpha !== null && e.alpha !== undefined) {
          heading = (360 - (e.alpha ?? 0)) % 360;
        }

        if (heading !== null && Number.isFinite(heading)) {
          setUserHeading(heading);
          setMapRotation(heading);
          if (mapRef.current) {
            const m = mapRef.current as any;
            if (typeof m.setBearing === 'function') {
              m.setBearing(heading);
            }
          }
        }
      };

      const reqOrientPermission = (window as any).DeviceOrientationEvent;
      if (reqOrientPermission && typeof reqOrientPermission.requestPermission === 'function') {
        reqOrientPermission.requestPermission()
          .then((state: string) => {
            if (state === 'granted') startCompass(compassHandler);
          })
          .catch((err: any) => console.warn('[Compass] permission denied:', err));
      } else {
        startCompass(compassHandler);
      }
    }
  };


  // Cache delle icone dei marker: l'icona dipende solo da (gemma, categoria effettiva,
  // sotto-categoria, accessibilità), quindi riusiamo le L.divIcon già create invece di
  // ricrearle a ogni render (evita il churn di setIcon su centinaia di marker)
  const iconCacheRef = useRef<Map<string, L.DivIcon>>(new Map());

  /**
   * DIECI TAPPE — il "+" verde sul pin (28/08/2026).
   *
   * La X rossa per TOGLIERE una tappa sta gia` sul pin numerato del giro
   * (TourRouteLayer). Per AGGIUNGERE, invece, bisognava aprire la scheda: due
   * gesti diversi per due azioni simmetriche. Qui il pallino verde col "+" —
   * stesso verde, stessa forma e stessa dimensione (22 px) di quello dei
   * posti "lungo la strada" — compare in alto a DESTRA del pin (il posto e`
   * libero: `subLeftBadge` sta in alto a sinistra, `subRightBadge` in basso a
   * destra) e un tocco mette il POI nella bozza o nel giro in corso.
   */
  const createPoiIcon = (poi: Poi, conPiu = false) => {
    const isGem = !!(poi.is_gem || poi.category === "gemme");
    const pinSize = isGem ? 46 : 34;
    const effectiveCat = poi.baseCategory || poi.category;
    const osmSubCat = poi.subCategory || "";

    const CAT_HEX = {
      gemme:             "#0f766e",
      monumenti:         "#92400e",
      monument:          "#92400e",
      castle:            "#78350f",
      ruins:             "#57534e",
      archaeological_site: "#a16207",
      artwork:           "#be185d",
      fountain:          "#0ea5e9",
      chiese:            "#4338ca",
      church:            "#4338ca",
      musei:             "#7c3aed",
      museum:            "#7c3aed",
      panorami:          "#0369a1",
      viewpoint:         "#0369a1",
      locali:            "#e11d48",
      restaurant:        "#e11d48",
      utilita:           "#1e1b4b",
      famiglie:          "#b45309",
      esperienze_locali: "#ea580c",
      attraction:        "#16a34a",
      community:         "#ec4899",
      beni_culturali:    "#78716c",
    };

    // I POI WIP Community hanno SEMPRE il pin magenta: il colore della
    // sotto-categoria (monument, church...) non deve mai vincere, altrimenti
    // il pin community diventa indistinguibile da quello ufficiale accanto.
    const isCommunity = effectiveCat === "community";
    // Stesso ragionamento per l'atlante: pin grigio pietra, spento di
    // proposito. Sono beni vincolati senza audioguida, non devono competere
    // visivamente con i POI turistici che stanno accanto.
    const isAtlante = effectiveCat === "beni_culturali";
    // VERTICALI TEMATICI: il pin prende colore ed emoji del VERTICALE
    // (terme azzurro 🛁, street art magenta 🎨, cieli indaco 🌌…), non della
    // sotto-categoria: sotto la stessa macro 🧭 convivono una sorgente termale
    // e un murale, e il pin deve dire subito quale dei due è. La chiave sta in
    // `poi.category`, perché `baseCategory` qui vale 'tematiche' per tutti.
    const catTematica = chiaveTematica(poi);
    const isTematicoPin = catTematica !== "";

    let bgHex: string;
    if (isCommunity) {
      bgHex = CAT_HEX.community;
    } else if (isAtlante) {
      bgHex = CAT_HEX.beni_culturali;
    } else if (isTematicoPin) {
      bgHex = CATEGORY_HEX[catTematica] || "#4f46e5";
    } else if (isGem) {
      bgHex = (CAT_HEX as any)[osmSubCat] || (CAT_HEX as any)[effectiveCat] || "#0f766e";
    } else {
      bgHex = (CAT_HEX as any)[osmSubCat] || (CAT_HEX as any)[effectiveCat] || "#6b7280";
    }

    // Sull'atlante l'emoji della sotto-categoria (chiesa, castello...) darebbe
    // un pin identico a quello turistico: qui vince sempre l'anfora.
    const emoji = isAtlante
      ? "🏺"
      : isTematicoPin
        ? ((CATEGORY_EMOJIS as any)[catTematica] || "🧭")
        : (CATEGORY_EMOJIS as any)[osmSubCat] || (CATEGORY_EMOJIS as any)[effectiveCat] || "📍";

    const accessible = isAccessible(poi);
    const subIcon = getSubCategoryEmoji(poi.subCategory);

    const isCultural = effectiveCat === "monumenti" || effectiveCat === "chiese" || effectiveCat === "musei" || effectiveCat === "panorami" || effectiveCat === "gemme";
    const subRightBadge = isGem ? "💎" : (isCommunity ? "📸" : (isCultural ? "" : subIcon));
    const subLeftBadge = accessible ? "♿" : "";

    // POSIZIONE APPROSSIMATA (beni del catalogo ministeriale collocati al
    // centro del comune, 23/08/2026): il pin si vede ma non finge. Contorno
    // tratteggiato e leggera trasparenza — chi guarda la mappa capisce prima
    // di aprire la scheda che quel punto indica il paese, non la porta.
    const approssimato = (poi as any).posizioneApprossimata === true;
    const html = `
      <div style="position:relative;width:34px;height:42px;filter:drop-shadow(0 3px 5px rgba(0,0,0,.3));transform: rotate(calc(-1 * var(--map-rotation, 0deg)));transition: transform 0.15s ease-out;${approssimato ? 'opacity:.75;' : ''}">
        <svg viewBox="0 0 34 42" width="34" height="42" xmlns="http://www.w3.org/2000/svg">
          <path d="M17 0C7.6 0 0 7.6 0 17c0 12.7 17 25 17 25S34 29.7 34 17C34 7.6 26.4 0 17 0z"
            fill="${bgHex}" stroke="${approssimato ? '#ffffff' : (isGem ? '#fbbf24' : '#ffffff')}" stroke-width="${isGem ? '2.5' : '1.5'}"${approssimato ? ' stroke-dasharray="3 2"' : ''}/>
          <circle cx="17" cy="16" r="11" fill="white" opacity="0.95"/>
            <text x="17" y="21" text-anchor="middle" font-size="14" font-family="system-ui,sans-serif">${emoji}</text>
        </svg>
        ${subLeftBadge ? `<div style="position:absolute;top:-4px;left:-8px;min-width:18px;height:18px;background:#fff;border-radius:9px;border:1.5px solid #e5e7eb;display:flex;align-items:center;justify-content:center;font-size:9px;box-shadow:0 1px 4px rgba(0,0,0,.25);z-index:10;">${subLeftBadge}</div>` : ""}
        ${conPiu ? `<div class="wip-poi-piu" title="${getTranslation('tour_aggiungi', language).replace(/"/g, '&quot;')}" style="position:absolute;top:-9px;right:-9px;width:22px;height:22px;border-radius:50%;background:#ffffff;border:2px solid #059669;color:#059669;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:15px;line-height:1;font-family:system-ui,-apple-system,sans-serif;box-shadow:0 1px 4px rgba(0,0,0,.3);cursor:pointer;z-index:11;">+</div>` : ""}
        ${subRightBadge ? `<div style="position:absolute;bottom:6px;right:-8px;min-width:18px;height:18px;background:#fff;border-radius:9px;border:1.5px solid ${isGem ? '#fbbf24' : '#e5e7eb'};display:flex;align-items:center;justify-content:center;font-size:9px;box-shadow:0 1px 4px rgba(0,0,0,.25);z-index:10;">${subRightBadge}</div>` : ""}
      </div>
    `;

    return L.divIcon({
      html,
      className: "custom-poi-marker",
      iconSize: [34, 42],
      iconAnchor: [17, 42],
      popupAnchor: [0, -42]
    });
  };

  // Restituisce l'icona dalla cache (identità stabile tra i render) o la crea una sola volta
  const getPoiIcon = (poi: Poi, conPiu = false) => {
    // `poi.category` fa parte della chiave: nei verticali tematici la
    // baseCategory è 'tematiche' per tutti e otto, ed è la categoria vera
    // (terme, cinema…) a decidere colore ed emoji del pin.
    // `posizioneApprossimata` fa parte della chiave: senza, il primo pin
    // disegnato deciderebbe l'aspetto di tutti i beni della stessa categoria
    // e i punti al centro del comune sembrerebbero precisi.
    // `conPiu` fa parte della chiave: senza, il primo pin disegnato deciderebbe
    // per tutti e il "+" verde non comparirebbe (o non sparirebbe entrando nel
    // giro). E` un solo bit: la cache resta efficace.
    const cacheKey = `${!!(poi.is_gem || poi.category === "gemme")}|${poi.baseCategory || poi.category}|${poi.category || ""}|${poi.subCategory || ""}|${isAccessible(poi)}|${(poi as any).posizioneApprossimata ? 'approx' : ''}|${conPiu ? 'piu' : ''}`;
    let icon = iconCacheRef.current.get(cacheKey);
    if (!icon) {
      icon = createPoiIcon(poi, conPiu);
      iconCacheRef.current.set(cacheKey, icon);
    }
    return icon;
  };

  const userIcon = useMemo(() => {
    const hasHeading = userHeading !== null && Number.isFinite(userHeading);
    if (hasHeading) {
      return L.divIcon({
        html: `
          <div class="relative flex items-center justify-center" style="width:40px;height:40px;transform: rotate(calc(-1 * var(--map-rotation, 0deg)));transition: transform 0.15s ease-out;">
            <div class="absolute w-10 h-10 bg-blue-500 rounded-full opacity-20 animate-ping"></div>
            <div class="w-8 h-8 bg-blue-600 rounded-full border-3 border-white shadow-xl flex items-center justify-center" style="border:3px solid white;">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="white" style="transform: rotate(${userHeading}deg); display:block;">
                <path d="M12 2L8 20l4-3 4 3z"/>
              </svg>
            </div>
          </div>
        `,
        className: 'user-location-arrow-icon',
        iconSize: [40, 40],
        iconAnchor: [20, 20],
      });
    }
    return L.divIcon({
      html: `
        <div class="relative flex items-center justify-center" style="transform: rotate(calc(-1 * var(--map-rotation, 0deg)));">
          <div class="absolute w-8 h-8 bg-blue-500 rounded-full animate-ping opacity-25"></div>
          <div class="w-4 h-4 bg-blue-500 rounded-full border-2 border-white shadow-lg ring-2 ring-blue-500/20"></div>
        </div>
      `,
      className: 'user-location-icon',
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    });
  }, [userHeading]);


  const markerRefs = useRef<{ [key: string]: L.Marker | null }>({});

  const selectPoi = useCallback((poi: Poi) => {
    setShowNearbyList(false);

    const nearbyPoisForThis = pois.filter((p) => {
      if (p.id === poi.id) return false;
      const dist = getDistanceFromLatLonInM(poi.lat, poi.lon, p.lat, p.lon);
      return dist <= 1000;
    });

    // La foto e la descrizione già mostrate nel popup del pin devono comparire
    // SUBITO nella scheda: senza questo merge la scheda ripartiva dal POI
    // "nudo" e la foto arrivava solo a fine enrichment.
    const cached = getCachedPoiDetails(String(poi.id));
    const merged: any = cached ? {
      ...poi,
      image_url: (poi as any).image_url || cached.imageUrl || undefined,
      photo_url: (poi as any).photo_url || cached.imageUrl || undefined,
      description_short: (poi as any).description_short || cached.description || undefined,
      description_long: (poi as any).description_long || cached.descriptionLong || undefined,
      audioScript: (poi as any).audioScript || (poi as any).audio_script || cached.audioScript || undefined,
    } : poi;

    onSelectPoi(merged, nearbyPoisForThis);
  }, [pois, onSelectPoi]);

  // Pre-calcola posizione e icona una sola volta per lista POI: identità stabili,
  // così react-leaflet riusa i marker esistenti (per key) senza richiamare
  // setLatLng/setIcon a ogni re-render (es. aggiornamenti GPS o bussola)
  // LA CAUSA DELLO SFARFALLIO (22/08/2026). `position: [poi.lat, poi.lon]`
  // era un array NUOVO a ogni ricalcolo: react-leaflet confronta l'identità
  // (`props.position !== prevProps.position`) e chiama `marker.setLatLng()`,
  // che in Leaflet emette SEMPRE l'evento `move`, anche a coordinate
  // identiche. leaflet.markercluster ascolta `move` e toglie/rimette il
  // marker nel cluster (`_moveChild`), con animazione: ogni pin lampeggiava a
  // ogni cambio di visiblePois (chip, radar, fetch lontani). Qui la tupla
  // posizione vive in una cache per (id, lat, lon): stessa identità finché
  // il POI non si sposta davvero, quindi setLatLng non viene mai chiamata.
  const positionCacheRef = useRef<Map<string, [number, number]>>(new Map());

  // DIECI TAPPE: chi e` gia` dentro (bozza o giro) non porta il "+".
  const bozzaGiro = useBozzaGiro();
  const vistaGiroMappa = useVistaGiro();
  const idsNelGiro = useMemo(() => {
    const s = new Set<string>();
    for (const t of bozzaGiro.tappe) s.add(String(t.id));
    const g = tourService.datiGiro();
    if (g) for (const t of g.tappe) if (!t.esclusa) s.add(String(t.id));
    return s;
    // `vistaGiroMappa` e` la dipendenza che dice "il giro e` cambiato".
  }, [bozzaGiro, vistaGiroMappa]);
  /** Dieci tappe vive e non se ne aggiungono altre: il "+" sparisce da tutti. */
  const giroPieno = useMemo(() => {
    const g = tourService.datiGiro();
    if (g && tourService.inCorso()) return g.tappe.filter((t) => !t.esclusa).length >= MAX_TAPPE;
    return bozzaGiro.tappe.length >= MAX_TAPPE;
  }, [bozzaGiro, vistaGiroMappa]);
  /** Il "+" ha senso solo con il radar/giro acceso: altrove e` rumore sul pin. */
  const mostraPiuSuiPin = !!isRadarMode && !giroPieno && !tourService.eSospeso();

  /** Un tocco sul "+" del pin: alla bozza, o al giro se e` gia` partito. */
  const aggiungiAlGiroDaPin = useCallback((poi: any) => {
    if (tourService.inCorso()) { void tourService.aggiungiTappaAlVolo(poi); return; }
    tourService.bozzaAlterna(poi);
  }, []);

  const markerData = useMemo(
    () => {
      const cache = positionCacheRef.current;
      const alive = new Set<string>();
      const data = visiblePois
        .filter(
          (p) =>
            p &&
            typeof p.lat === "number" &&
            Number.isFinite(p.lat) &&
            typeof p.lon === "number" &&
            Number.isFinite(p.lon),
        )
        .map((poi) => {
          const k = `${poi.id}|${poi.lat}|${poi.lon}`;
          alive.add(k);
          let position = cache.get(k);
          if (!position) { position = [poi.lat, poi.lon]; cache.set(k, position); }
          const conPiu = mostraPiuSuiPin && !idsNelGiro.has(String(poi.id));
          return { poi, position, icon: getPoiIcon(poi, conPiu) };
        });
      // Niente accumulo infinito: via le tuple dei POI non più in vista.
      if (cache.size > data.length * 2 + 200) {
        for (const k of cache.keys()) if (!alive.has(k)) cache.delete(k);
      }
      return data;
    },
    [visiblePois, mostraPiuSuiPin, idsNelGiro],
  );

  // Memoizza gli elementi Marker: vengono ricostruiti SOLO quando cambia la
  // lista dei POI. Il popup non è più figlio di ogni Marker: prima bastava
  // aprire/chiudere una scheda per ricostruire tutti i ~500 <Marker> (era la
  // causa principale della lentezza di apertura). Ora c'è un unico <Popup>
  // condiviso renderizzato a livello mappa (vedi activePoi più sotto).
  // Il colore della categoria, in esadecimale: CATEGORY_COLORS lo tiene
  // dentro una classe Tailwind («bg-[#0f766e]») perché serve così ai pin,
  // ma il cerchio del raggruppamento è HTML disegnato a mano.
  const coloreCategoria = useCallback((cat: string): string => {
    const cls = CATEGORY_COLORS[cat] || '';
    const m = /#([0-9a-fA-F]{6})/.exec(cls);
    return m ? `#${m[1]}` : '#1e3a8a';
  }, []);

  /**
   * Il cerchio col numero, nel colore della categoria.
   *
   * Un cerchio grigio uguale per tutti dice solo «qui ce ne sono dodici»;
   * col colore dice anche DI COSA, e su una mappa dove convivono musei,
   * gemme, spiagge e beni vincolati è la differenza fra un numero e
   * un'informazione. Stessa forma dei cerchi dei percorsi, così la
   * grammatica della mappa resta una sola.
   */
  const iconaCluster = useCallback((colore: string, emoji: string, nomeCat: string) => (cluster: any) => {
    const n = cluster.getChildCount();
    // Più grande di prima: 34 px era sotto la soglia comoda per il pollice
    // (44 px è il minimo che Apple e Google raccomandano da anni).
    const lato = n < 10 ? 44 : n < 100 ? 48 : 54;
    const testo = n < 1000 ? String(n) : `${Math.floor(n / 1000)}k`;
    // Il COLORE NON BASTA. Un uomo su dodici non distingue rosso e verde:
    // dodici cerchi colorati diversi, per lui, sono dodici cerchi uguali.
    // L'icona della categoria dentro il cerchio dice di cosa si tratta
    // senza dipendere dalla vista dei colori, e `title` lo dice a parole a
    // chi usa un lettore di schermo.
    return L.divIcon({
      html: `<div title="${nomeCat}: ${n}" style="width:${lato}px;height:${lato}px;border-radius:50%;background:${colore};
        border:2.5px solid rgba(255,255,255,.95);box-shadow:0 2px 10px rgba(0,0,0,.35);
        color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;line-height:1;
        font-family:system-ui,-apple-system,sans-serif;">
        <span style="font-size:${n < 100 ? 13 : 12}px;">${emoji}</span>
        <span style="font-weight:800;font-size:${n < 100 ? 12 : 11}px;margin-top:1px;">${testo}</span>
      </div>`,
      className: 'wip-cluster-categoria',
      iconSize: L.point(lato, lato, true),
    });
  }, []);

  const poiMarkers = useMemo(
    () =>
      markerData.map(({ poi, position, icon }) => (
        <Marker
          key={`marker-${poi.id}`}
          // Modalità "al coperto": i POI indoor restano pieni, gli altri si
          // attenuano. Solo visuale: nessun filtro persistente viene toccato.
          opacity={indoorMode && !isIndoorPoi(poi) ? 0.25 : 1}
          ref={(r) => {
            if (r) {
              markerRefs.current[poi.id] = r;
            } else {
              delete markerRefs.current[poi.id];
            }
          }}
          position={position}
          icon={icon}
          eventHandlers={{
            click: (e: any) => {
              // Il "+" verde e` dentro il marker: Leaflet da` un evento solo
              // per tutto il pin, quindi si guarda che cosa e` stato toccato
              // (stessa tecnica della X sulle tappe, TourRouteLayer).
              const el = e?.originalEvent?.target as HTMLElement | null | undefined;
              if (el?.closest?.('.wip-poi-piu')) {
                L.DomEvent.stopPropagation(e.originalEvent);
                aggiungiAlGiroDaPin(poi);
                return;
              }
              setActivePopupId(poi.id);
              setActivePoi(poi);
              centerMapOnPoi(poi);
            }
          }}
        />
      )),
    [markerData, indoorMode, aggiungiAlGiroDaPin],
  );

  // I marker divisi per categoria: un gruppo per categoria vuol dire un
  // cerchio per categoria, col suo colore. Dove due categorie si
  // sovrappongono compaiono due cerchi affiancati invece di uno solo che
  // non dice di cosa è fatto.
  const gruppiPerCategoria = useMemo(() => {
    const per = new Map<string, typeof poiMarkers>();
    markerData.forEach(({ poi }, i) => {
      const cat = String((poi as any).category || 'altro');
      if (!per.has(cat)) per.set(cat, []);
      per.get(cat)!.push(poiMarkers[i]);
    });
    return [...per.entries()];
  }, [markerData, poiMarkers]);

  /**
   * I LIVELLI DELLA MAPPA, in un posto solo.
   *
   * Erano scritti dentro il JSX del pannello, quindi per sapere «quali sono
   * accesi» bisognava ripetere sette condizioni in tre punti diversi — ed è
   * esattamente il genere di elenco che si dimentica di aggiornare quando se
   * ne aggiunge uno (è già successo col layer della bici).
   *
   * Il `gruppo` divide le due nature che convivono nel pannello: le RETI che
   * attraversano il territorio (dove si cammina, si pedala, si beve) e le
   * CONDIZIONI di adesso (sole, mare, neve). Sono cose diverse e vanno
   * separate anche a vedersi, non solo a capirsi.
   */
  const LIVELLI = useMemo(() => [
    {
      id: 'sentieri', gruppo: 'reti', on: sentieriActive, loading: sentieriLoading, emoji: '🥾',
      tinta: 'bg-emerald-600 border-emerald-400', zoomMin: SENTIERI_MIN_ZOOM,
      nome: getTranslation('mp_layer_sentieri_nome', language),
      dettaglio: getTranslation('mp_layer_sentieri_det', language),
      onClick: toggleSentieri,
    },
    {
      id: 'ciclabili', gruppo: 'reti', on: ciclabiliActive, loading: ciclabiliLoading, emoji: '🚲',
      tinta: 'bg-orange-600 border-orange-400', zoomMin: CICLABILI_MIN_ZOOM,
      nome: getTranslation('mp_layer_ciclabili_nome', language),
      dettaglio: getTranslation('mp_layer_ciclabili_det', language),
      onClick: toggleCiclabili,
    },
    {
      id: 'strade-gusto', gruppo: 'reti', on: stradeGustoActive, loading: stradeGustoLoading, emoji: '🍷',
      tinta: 'bg-[#7f1d1d] border-red-400', zoomMin: STRADE_GUSTO_MIN_ZOOM,
      nome: getTranslation('mp_layer_gusto_nome', language),
      dettaglio: getTranslation('mp_layer_gusto_det', language),
      onClick: toggleStradeGusto,
    },
    {
      id: 'servizi', gruppo: 'reti', on: servicesActive, loading: servicesLoading, emoji: '🚰',
      tinta: 'bg-sky-600 border-sky-400', zoomMin: 0,
      nome: getTranslation('mp_layer_servizi_nome', language),
      dettaglio: '', onClick: toggleServices,
    },
    {
      id: 'neve', gruppo: 'condizioni', on: neveActive, loading: neveLoading, emoji: '❄️',
      tinta: 'bg-indigo-500 border-indigo-300', zoomMin: 0,
      nome: getTranslation('mp_layer_neve_nome', language),
      dettaglio: getTranslation('mp_layer_neve_det', language),
      onClick: toggleNeve,
    },
    {
      id: 'sole', gruppo: 'condizioni', on: soleActive, loading: soleLoading, emoji: '☀️',
      tinta: 'bg-amber-500 border-amber-300', zoomMin: 0,
      nome: getTranslation('mp_layer_sole_nome', language),
      dettaglio: '', onClick: toggleSole,
    },
    {
      id: 'balneazione', gruppo: 'condizioni', on: bathingActive, loading: bathingLoading, emoji: '🏖',
      tinta: 'bg-cyan-600 border-cyan-400', zoomMin: 0,
      nome: getTranslation('mp_layer_balneazione_nome', language),
      dettaglio: '', onClick: toggleBathing,
    },
    {
      id: 'aree-protette', gruppo: 'reti', on: areeActive, loading: areeLoading, emoji: '🌿',
      tinta: 'bg-green-700 border-green-500', zoomMin: AREE_MIN_ZOOM,
      nome: getTranslation('mp_layer_natura2000_nome', language),
      dettaglio: getTranslation('mp_layer_natura2000_det', language),
      onClick: toggleAree,
    },
  ], [
    language, sentieriActive, sentieriLoading, ciclabiliActive, ciclabiliLoading,
    stradeGustoActive, stradeGustoLoading, servicesActive, servicesLoading,
    neveActive, neveLoading, soleActive, soleLoading, bathingActive, bathingLoading,
    areeActive, areeLoading, AREE_MIN_ZOOM,
    toggleSentieri, toggleCiclabili, toggleStradeGusto, toggleServices, toggleNeve, toggleSole, toggleBathing, toggleAree,
  ]);

  const layerAccesi = useMemo(() => LIVELLI.filter((l) => l.on), [LIVELLI]);

  const spegniTuttiILivelli = useCallback(() => {
    for (const l of layerAccesi) l.onClick();
  }, [layerAccesi]);

  const focusPoiOnMap = (poi: Poi) => {
    setShowNearbyList(false);

    if (mapRef.current) {
      centerMapOnPoi(poi, 18);
    } else {
      setCenter([poi.lat, poi.lon]);
      setMapZoom(18);
    }

    if (onCenterChange) {
      onCenterChange([poi.lat, poi.lon]);
    }

    // Con il popup condiviso basta impostare id + oggetto: niente più timer
    // da 400ms in attesa che il marker fosse montato per chiamare openPopup().
    setActivePopupId(poi.id);
    setActivePoi(poi);
  };

  const handleFindNear = () => {
    if (!mapRef.current) return;

    let mapCenter;
    try {
      mapCenter = mapRef.current.getCenter();
    } catch (error) {
      console.warn("Could not get map center:", error);
      return;
    }

    const near = visiblePois.filter((poi) => {
      const dist = getDistanceFromLatLonInM(
        mapCenter.lat,
        mapCenter.lng,
        poi.lat,
        poi.lon,
      );
      return dist <= 1000;
    });

    near.sort((a, b) => {
      const distA = getDistanceFromLatLonInM(
        mapCenter.lat,
        mapCenter.lng,
        a.lat,
        a.lon,
      );
      const distB = getDistanceFromLatLonInM(
        mapCenter.lat,
        mapCenter.lng,
        b.lat,
        b.lon,
      );
      return distA - distB;
    });

    setNearbyPois(near);
    setShowNearbyList(true);
  };

  return (
    <div 
      className={`absolute inset-0 bg-[#e4e9d5] overflow-hidden z-0 ${isRadarMode ? 'radar-active' : ''}`}
      style={{
        '--map-rotation': `${mapRotation}deg`
      } as any}
    >
      <div className="w-full h-full">
        <MapContainer
          center={INITIAL_CENTER}
          zoom={mapZoom}
          scrollWheelZoom={true}
          className="w-full h-full font-sans"
          style={{ height: '100%', width: '100%' }}
          zoomControl={false}
          ref={mapRef}
        >
          <CachedTiles
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
            url={cartoUrl}
          />
          <MapController center={center} zoom={mapZoom} />
          <MapEventsHandler onMoveEnd={fetchPois} onCenterChange={onCenterChange} onDragStart={() => stopFollowMode(true)} isFollowing={() => followModeRef.current} />

          {userLocation &&
            typeof userLocation[0] === "number" &&
            typeof userLocation[1] === "number" &&
            Number.isFinite(userLocation[0]) &&
            Number.isFinite(userLocation[1]) && (
              <Marker position={userLocation} icon={userIcon} />
            )}

          {/* Clustering: senza, città dense mettevano fino a ~2000 L.divIcon
              simultanei nel DOM. disableClusteringAtZoom alto: quando l'utente
              è già zoomato su un singolo isolato i pin restano individuali,
              come prima del clustering. */}
          {/* Dieci Tappe: quando un giro e' in corso la mappa porta addosso il
              percorso e le tappe numerate. Si disegna da solo leggendo
              tourService, quindi non serve passargli niente da qui. */}
          <TourRouteLayer />
          {/* WIP Nav: il tracciato del navigatore pedonale (evento
              'wip-nav-route' da useWalkingNavigation). Prima stava solo in
              PlanMap, e dal radar non si vedeva nessuna linea. */}
          <NavRouteLayer />

          {gruppiPerCategoria.map(([categoria, marker]) => (
            <MarkerClusterGroup
              key={`cluster-${categoria}`}
              chunkedLoading
              maxClusterRadius={60}
              disableClusteringAtZoom={19}
              spiderfyOnMaxZoom
              showCoverageOnHover={false}
              zoomToBoundsOnClick
              iconCreateFunction={iconaCluster(
                coloreCategoria(categoria),
                CATEGORY_EMOJIS[categoria] || '📍',
                categoria,
              )}
            >
              {marker}
            </MarkerClusterGroup>
          ))}

          {/* LA PORTA. L'ingresso (entrance_lat/lon, 277.363 POI) si usava da
              sempre per navigare e per i geofence, ma sulla mappa non si
              vedeva: il pin resta sul centroide e l'utente non capiva perche'
              il percorso lo portasse "dall'altra parte". Un punto verde sulla
              porta e un filo fino al pin, solo sul POI aperto e solo se la
              porta non coincide col centro (sotto 8 m sarebbe un pallino sopra
              il pin). */}
          {/* Luoghi toccati in "Tutto nel raggio": restano segnati sulla
              mappa anche dopo averne aperto un altro (28/08/2026). Un tap
              riapre la scheda; si azzerano dal pannello. */}
          {everythingPinned.map((p) => (
            <Marker
              key={`everything-pin-${p.id}`}
              position={[p.lat, p.lon]}
              zIndexOffset={900}
              icon={L.divIcon({
                className: 'custom-poi-marker',
                html: cerchioMarker((CATEGORY_EMOJIS as any)[everythingCanonKey(String((p as any).category || ''))] || '📍', 30, 16),
                ...cerchioMarkerOpts(30),
              })}
              eventHandlers={{ click: () => { setActivePopupId(p.id); setActivePoi(p); } }}
            />
          ))}

          {activePoi && (() => {
            const a = puntoArrivo(activePoi);
            const cLat = Number(activePoi.lat), cLon = Number(activePoi.lon);
            if (!Number.isFinite(a.lat) || (a.lat === cLat && a.lon === cLon)) return null;
            const distM = Math.hypot((a.lat - cLat) * 111_320, (a.lon - cLon) * 111_320 * Math.cos(cLat * Math.PI / 180));
            if (distM < 8) return null;
            return (
              <LayerGroup key={`ingresso-${activePoi.id}`}>
                <Polyline
                  positions={[[cLat, cLon], [a.lat, a.lon]]}
                  pathOptions={{ color: '#16a34a', weight: 2, dashArray: '4 4', opacity: 0.85, interactive: false }}
                />
                <CircleMarker
                  center={[a.lat, a.lon]}
                  radius={7}
                  pathOptions={{ color: '#ffffff', weight: 2, fillColor: '#16a34a', fillOpacity: 1 }}
                >
                  <Tooltip direction="top" offset={[0, -8]} opacity={0.95}>
                    {getTranslation('entrance_label', language)}{(activePoi as any).address ? ` · ${(activePoi as any).address}` : ''}
                  </Tooltip>
                </CircleMarker>
              </LayerGroup>
            );
          })()}

          {/* Popup condiviso: uno solo per tutta la mappa. key per poi.id così
              cambiando POI la scheda rimonta pulita (stati e fetch propri). */}
          {activePoi && (
            <Popup
              key={`popup-${activePoi.id}`}
              className="custom-popup"
              minWidth={290}
              maxWidth={290}
              // La X nativa di Leaflet si sommava a quella disegnata da
              // PoiPopupContent: due X visibili nello stesso angolo
              // (24/08/2026, segnalato sui beni culturali). Ora ne resta
              // una sola, quella della card, più grande e coerente su ogni
              // variante — chiude comunque nello stesso modo (onClose sotto).
              closeButton={false}
              position={[activePoi.lat, activePoi.lon]}
              offset={[0, -42]}
              // L'autoPan di Leaflet combatteva col flyTo di centerMapOnPoi
              // (due animazioni simultanee sulla stessa mappa = schermo e pin
              // che sfarfallano all'apertura). Il flyTo posiziona già il pin
              // sotto il centro apposta per lasciare spazio al popup.
              autoPan={false}
              eventHandlers={{
                // Leaflet emette `remove` anche quando il popup viene solo
                // ri-agganciato durante un re-render: chiudere la scheda in
                // quel caso la faceva apparire e sparire in pochi millisecondi.
                // Chiudiamo solo se, esaurito il ciclo di render, il popup non
                // è più sulla mappa (chiusura vera dell'utente).
                remove: (e: any) => {
                  const closedId = activePoi.id;
                  setTimeout(() => {
                    const map = mapRef.current;
                    if (map && e?.target && map.hasLayer(e.target)) return;
                    setActivePopupId((cur) => (cur === closedId ? null : cur));
                    setActivePoi((cur) => (cur && cur.id === closedId ? null : cur));
                  }, 0);
                },
              }}
            >
              <PoiPopupContent
                poi={activePoi}
                onGuideClick={() => selectPoi(activePoi)}
                language={language}
                // Dieci Tappe: col radar acceso la scheda offre "Aggiungi al
                // giro", cosi` le tappe si scelgono anche toccando i pin.
                modalitaGiro={!!isRadarMode}
                // La X della card chiude davvero: si chiude il popup di
                // Leaflet e si azzera lo stato, altrimenti il popup resta
                // "aperto" per React e non si riapre sullo stesso POI.
                onClose={() => {
                  try { mapRef.current?.closePopup(); } catch { /* mappa gia' smontata */ }
                  setActivePopupId(null);
                  setActivePoi(null);
                }}
              />
            </Popup>
          )}

        </MapContainer>
      </div>

      {/* Banner offline discreto: stessa famiglia visiva del badge "Follow ON"
          qui sotto (pillola blur, testo maiuscolo). useNetworkStatus() era
          già importato ma mai invocato. */}
      <AnimatePresence>
        {!isOnline && (
          <motion.div
            key="offline-banner"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute top-[calc(0.75rem+env(safe-area-inset-top))] left-1/2 -translate-x-1/2 z-[1000] pointer-events-none"
          >
            <div className="bg-slate-800/80 dark:bg-slate-900/80 backdrop-blur-2xl text-white text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full shadow-2xl border border-white/20 flex items-center gap-2">
              <WifiOff className="w-3 h-3" />
              {getTranslation('mp_sei_offline', language)}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Allarme ZTL: banner rosso ben visibile + disclaimer copertura ── */}
      <div className="absolute top-[calc(2.75rem+env(safe-area-inset-top))] left-1/2 -translate-x-1/2 z-[1200] w-[calc(100%-4rem)] max-w-[420px] flex flex-col items-center gap-2 pointer-events-none">
        <AnimatePresence>
          {ztlBanner && (
            <motion.div
              key="ztl-alert"
              initial={{ opacity: 0, y: -24, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -24 }}
              className="pointer-events-auto w-full"
            >
              <div className="bg-red-600/95 backdrop-blur-2xl text-white rounded-2xl shadow-[0_8px_32px_rgba(220,38,38,0.5)] border border-red-300/60 px-4 py-3 flex items-start gap-2.5">
                <span className="text-[20px] leading-none mt-0.5">🚫</span>
                <p className="text-[13px] font-black leading-snug flex-1">
                  {getTranslation(ztlBanner.pre ? 'mp_ztl_entrando' : 'mp_ztl_dentro', language)
                    .replace('{name}', ztlBanner.name ? ` ${ztlBanner.name}` : '')}
                </p>
                <button
                  onClick={() => setZtlBanner(null)}
                  aria-label={getTranslation('mp_chiudi_avviso_ztl', language)}
                  className="shrink-0 p-1 rounded-full hover:bg-white/20 active:scale-90 transition-all"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {ztlDisclaimer && (
            <motion.div
              key="ztl-disclaimer"
              initial={{ opacity: 0, y: -16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              className="pointer-events-auto w-full"
            >
              <div className="bg-amber-500/95 backdrop-blur-2xl text-white rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.25)] border border-amber-300/60 px-4 py-2.5 flex items-start gap-2">
                <span className="text-[15px] leading-none mt-0.5">⚠️</span>
                <p className="text-[11px] font-bold leading-snug flex-1">
                  {getTranslation('mp_ztl_copertura', language)}
                </p>
                <button
                  onClick={() => setZtlDisclaimer(false)}
                  aria-label={getTranslation('mp_chiudi', language)}
                  className="shrink-0 p-1 rounded-full hover:bg-white/20 active:scale-90 transition-all"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Toast una tantum: copertura europea del layer balneazione */}
        <AnimatePresence>
          {bathingDisclaimer && (
            <motion.div
              key="bathing-disclaimer"
              initial={{ opacity: 0, y: -16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              className="pointer-events-auto w-full"
            >
              <div className="bg-cyan-600/95 backdrop-blur-2xl text-white rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.25)] border border-cyan-300/60 px-4 py-2.5 flex items-start gap-2">
                <span className="text-[15px] leading-none mt-0.5">🏖</span>
                <p className="text-[11px] font-bold leading-snug flex-1">
                  {getTranslation('mp_balneazione_disclaimer', language)}
                </p>
                <button
                  onClick={() => setBathingDisclaimer(false)}
                  aria-label={getTranslation('mp_chiudi', language)}
                  className="shrink-0 p-1 rounded-full hover:bg-white/20 active:scale-90 transition-all"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        {/* Toast una tantum: copertura europea del layer aree protette */}
        <AnimatePresence>
          {areeDisclaimer && (
            <motion.div
              key="aree-disclaimer"
              initial={{ opacity: 0, y: -16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              className="pointer-events-auto w-full"
            >
              <div className="bg-green-700/95 backdrop-blur-2xl text-white rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.25)] border border-green-400/60 px-4 py-2.5 flex items-start gap-2">
                <span className="text-[15px] leading-none mt-0.5">🌿</span>
                <p className="text-[11px] font-bold leading-snug flex-1">
                  {getTranslation('mp_natura2000_disclaimer', language)}
                </p>
                <button
                  onClick={() => setAreeDisclaimer(false)}
                  aria-label={getTranslation('mp_chiudi', language)}
                  className="shrink-0 p-1 rounded-full hover:bg-white/20 active:scale-90 transition-all"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Colonna controlli in alto a sinistra: meteo + servizi pratici ──
          Angolo non invasivo: il banner offline sta al centro, gli errori a
          destra, la ricerca in basso. */}
      {/* IN BASSO A SINISTRA, sopra la barra di ricerca (22/08/2026). Stava
          in alto a 0,75 rem, ma le chip partono a 0,25 rem con z-index 2000
          e le loro righe di sotto-chip crescono verso il basso: la chip
          Gemme copriva il tasto dei livelli, e la riga dei sotto-chip anche
          il meteo. In basso nessuna riga cresce, e il pannello dei livelli
          si apre verso l'alto (flex-col-reverse). */}
      <div className="absolute bottom-[calc(5.25rem+env(safe-area-inset-bottom))] left-3 z-[1000] flex flex-col-reverse items-start gap-2 pointer-events-none">
        {/* Chip meteo (Open-Meteo, cache 30 min) */}
        {meteo && (
          <div className="pointer-events-auto bg-white/70 dark:bg-[#1C1C1E]/70 backdrop-blur-2xl rounded-full shadow-[0_4px_16px_rgba(0,0,0,0.12)] border border-white/60 dark:border-white/10 px-3 py-1.5 flex items-center gap-1.5 text-[12px] font-black text-[#1e3a8a] dark:text-white select-none">
            <span className="text-[14px] leading-none">{weatherEmoji(meteo.code)}</span>
            {Math.round(meteo.temp)}°
          </div>
        )}

        {/* Banner pioggia: propone l'evidenziazione dei luoghi al coperto */}
        <AnimatePresence>
          {meteo && meteo.rainProb >= 50 && !rainBannerDismissed && !indoorMode && (
            <motion.div
              key="rain-banner"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="pointer-events-auto max-w-[240px] bg-white/85 dark:bg-[#1C1C1E]/85 backdrop-blur-2xl rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.15)] border border-white/60 dark:border-white/10 p-3"
            >
              <p className="text-[11px] font-bold text-[#1e3a8a] dark:text-white leading-snug">
                🌧 {getTranslation('mp_pioggia_domanda', language)}
              </p>
              <div className="flex gap-1.5 mt-2">
                <button
                  onClick={() => { setIndoorMode(true); setRainBannerDismissed(true); }}
                  className="px-3 py-2 min-h-10 bg-[#1e3a8a] text-white rounded-lg text-[12px] font-black uppercase tracking-wider hover:opacity-90 active:scale-95 transition-all"
                >
                  {getTranslation('mp_al_coperto', language)}
                </button>
                <button
                  onClick={() => setRainBannerDismissed(true)}
                  className="px-3 py-2 min-h-10 bg-black/5 dark:bg-white/10 text-[#1e3a8a] dark:text-white rounded-lg text-[12px] font-bold hover:bg-black/10 active:scale-95 transition-all"
                >
                  {getTranslation('mp_no_grazie', language)}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Pillola per disattivare l'evidenziazione "al coperto" */}
        {indoorMode && (
          <button
            onClick={() => setIndoorMode(false)}
            className="pointer-events-auto bg-[#1e3a8a]/90 backdrop-blur-2xl text-white text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full shadow-2xl border border-white/20 flex items-center gap-1.5 active:scale-95 transition-all"
          >
            🏛 {getTranslation('mp_al_coperto_attivo', language)}
            <X className="w-3 h-3" />
          </button>
        )}

        {/*
          UN SOLO TASTO ⓘ CHE SI APRE.
          Prima qui c'erano quattro pulsanti sempre visibili in colonna: le
          chip delle categorie stanno al centro con z-index più alto e
          partono a 2rem dal bordo, quindi coprivano i pulsanti (che stanno a
          0,75rem). Raccoglierli dietro un solo tasto risolve la
          sovrapposizione e smette di occupare mezzo schermo.
          Il toggle "zone esplorate" è stato tolto su richiesta: era un
          diario, non un servizio, e non c'entrava con gli altri tre.
        */}
        {/* col-reverse: il tasto sta in basso e il pannello si apre sopra */}
        <div className="pointer-events-auto flex flex-col-reverse items-start gap-2">
          <button
            onClick={() => setServiziAperti((v) => !v)}
            // Era una ⓘ, che vuol dire «informazioni» e non «livelli»: chi
            // cercava i sentieri non aveva motivo di toccarla. L'icona a
            // strati è quella che usano tutte le mappe, e il nome per il
            // lettore di schermo dice anche quanti ne sono accesi.
            title={getTranslation('mp_livelli_mappa', language)}
            aria-label={`${getTranslation('mp_livelli_mappa', language)}${
              layerAccesi.length ? ` · ${layerAccesi.length} ${getTranslation('mp_attivi', language)}` : ''}`}
            aria-expanded={serviziAperti}
            // 44 px: la soglia sotto la quale il pollice sbaglia bersaglio.
            className={`relative w-11 h-11 rounded-full backdrop-blur-2xl shadow-[0_4px_16px_rgba(0,0,0,0.15)] border flex items-center justify-center transition-all active:scale-90 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/60 ${
              serviziAperti || layerAccesi.length
                ? 'bg-[#1e3a8a] text-white border-blue-400 ring-2 ring-blue-500/40'
                : 'bg-white/70 dark:bg-[#1C1C1E]/70 border-white/60 dark:border-white/10 text-[#1e3a8a] dark:text-white'
            }`}
          >
            {serviziAperti
              ? <X className="w-5 h-5" />
              : <Layers className="w-5 h-5" />}
            {/* Pallino col NUMERO: dice anche quanti, non solo che ce n'è
                qualcuno. Nascosto ai lettori di schermo perché il conto è
                già nell'aria-label del pulsante. */}
            {!serviziAperti && layerAccesi.length > 0 && (
              <span
                aria-hidden="true"
                className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-emerald-500 text-white text-[10px] font-black rounded-full border-2 border-white dark:border-[#1C1C1E] flex items-center justify-center"
              >
                {layerAccesi.length}
              </span>
            )}
          </button>

          {/* I layer accesi, quando il pannello è chiuso. Si sommano —
              sentieri, bici e gusto insieme sono tre linee di colore
              diverso sulla stessa valle — e senza questa fila non si vede
              quali si stanno tenendo aperti. Toccarla riapre il pannello. */}
          {!serviziAperti && layerAccesi.length > 0 && (
            <button
              onClick={() => setServiziAperti(true)}
              aria-label={`${getTranslation('mp_livelli_attivi', language)}: ${layerAccesi.map((l) => l.nome).join(', ')}`}
              className="pointer-events-auto flex items-center gap-1.5 h-11 bg-white/80 dark:bg-[#1C1C1E]/80 backdrop-blur-2xl rounded-full shadow-[0_2px_10px_rgba(0,0,0,0.15)] border border-white/60 dark:border-white/10 px-3 active:scale-95 transition-all focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/60"
            >
              {layerAccesi.map((l) => (
                <span key={l.id} aria-hidden="true" className="text-[15px] leading-none">{l.emoji}</span>
              ))}
            </button>
          )}

          <AnimatePresence>
            {serviziAperti && (
              <motion.div
                key="servizi-mappa"
                initial={menoMovimento ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.95 }}
                animate={menoMovimento ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
                exit={menoMovimento ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.95 }}
                transition={{ duration: menoMovimento ? 0.08 : 0.16 }}
                role="group"
                aria-label={getTranslation('mp_livelli_mappa', language)}
                // (29/08/2026) max-h-[70vh] fisso: con molti layer accesi (Vino
                // e gusto, Fontanelle, Aree protette, Neve, Sole, Mare...) il
                // pannello cresceva verso l'alto (col-reverse) fino a finire
                // SOTTO la barra delle chip in cima (z-[2000], sempre in
                // primo piano) — coperto a metà invece che scorrere dentro i
                // suoi bordi. Il tetto ora è anche la vista meno lo spazio
                // della barra chip + margine di rispetto, mai solo il 70%
                // fisso dello schermo.
                className="bg-white/85 dark:bg-[#1C1C1E]/85 backdrop-blur-2xl rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.18)] border border-white/60 dark:border-white/10 p-2 flex flex-col gap-0.5 min-w-[232px] max-h-[min(70vh,calc(100dvh-9rem-env(safe-area-inset-top)))] overflow-y-auto"
              >
                {(['reti', 'condizioni'] as const).map((gruppo) => (
                  <Fragment key={gruppo}>
                    {/* Due nature diverse, separate anche a vedersi: dove si
                        va e com'è adesso. */}
                    <div className="px-2 pt-1.5 pb-1 text-[10px] font-black uppercase tracking-wider text-[#1e3a8a]/55 dark:text-white/50">
                      {gruppo === 'reti'
                        ? getTranslation('mp_dove_andare', language)
                        : getTranslation('mp_come_adesso', language)}
                    </div>
                    {LIVELLI.filter((v) => v.gruppo === gruppo).map((v) => (
                      <button
                        key={v.id}
                        onClick={v.onClick}
                        aria-pressed={v.on}
                        // min-h-11 = 44 px, la soglia sotto la quale il dito
                        // sbaglia bersaglio. L'anello di focus serve a chi
                        // naviga da tastiera: senza, il fuoco è invisibile.
                        className={`w-full min-h-11 px-2.5 py-2 rounded-xl flex items-center gap-3 text-left transition-all active:scale-[0.97] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/60 ${
                          v.on ? `${v.tinta} text-white border` : 'hover:bg-black/5 dark:hover:bg-white/10 text-[#1e3a8a] dark:text-white border border-transparent'
                        }`}
                      >
                        {v.loading
                          ? <Loader2 className={`w-5 h-5 animate-spin shrink-0 ${v.on ? 'text-white' : 'text-[#1e3a8a]'}`} />
                          : <span aria-hidden="true" className="text-[17px] leading-none shrink-0 w-5 text-center">{v.emoji}</span>}
                        <span className="flex flex-col leading-tight flex-1">
                          <span className="text-[12.5px] font-bold leading-tight">{v.nome}</span>
                          {v.dettaglio && !v.on && (
                            <span className="text-[10.5px] opacity-65 mt-0.5">{v.dettaglio}</span>
                          )}
                          {/* Acceso ma troppo lontano: il layer non mostrerebbe
                              niente e sembrerebbe rotto. Lo si dice qui, dove
                              l'utente ha appena toccato. */}
                          {v.on && v.zoomMin > 0 && zoomCorrente < v.zoomMin && (
                            <span className="text-[10.5px] font-semibold opacity-95 mt-0.5">
                              ↗ {getTranslation('mp_avvicinati', language)}
                            </span>
                          )}
                        </span>
                        {/* Lo stato acceso non è solo colore: c'è anche il
                            segno di spunta, che si vede anche in bianco e nero. */}
                        {v.on && <span aria-hidden="true" className="text-[13px] font-black shrink-0">✓</span>}
                      </button>
                    ))}
                  </Fragment>
                ))}

                {layerAccesi.length > 1 && (
                  <button
                    onClick={spegniTuttiILivelli}
                    className="mt-1 w-full min-h-11 px-2.5 rounded-xl text-[11.5px] font-bold text-[#1e3a8a] dark:text-white hover:bg-black/5 dark:hover:bg-white/10 active:scale-[0.97] transition-all focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/60"
                  >
                    {getTranslation('mp_spegni_tutti', language).replace('{n}', String(layerAccesi.length))}
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Scheda sole: valore di adesso, fascia da evitare, consiglio.
              Non è una mappa di pallini come il mare perché dentro una città
              l'UV è lo stesso ovunque: quello che cambia è l'ora. */}
          <AnimatePresence>
            {soleActive && (datiSole || oreLuce) && (
              <motion.div
                key="scheda-sole"
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="bg-white/80 dark:bg-[#1C1C1E]/80 backdrop-blur-2xl rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.18)] border border-white/60 dark:border-white/10 px-3 py-2.5 max-w-[240px]"
              >
                {datiSole && (
                <div className="flex items-center gap-2.5">
                  <span
                    className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-[13px] font-black shrink-0"
                    style={{ background: livelloUv(datiSole.uv).colore }}
                  >
                    {Math.round(datiSole.uv)}
                  </span>
                  <div className="min-w-0">
                    <p className="text-[11px] font-black text-[#1e3a8a] dark:text-white leading-tight">
                      UV {getTranslation(`mp_uv_${livelloUv(datiSole.uv).chiave}`, language)}
                    </p>
                    <p className="text-[10px] text-primary/60 dark:text-white/60 leading-tight">
                      {getTranslation('mp_percepiti', language)} {Math.round(datiSole.percepita)}°
                      {datiSole.temperatura ? ` · ${Math.round(datiSole.temperatura)}° ${getTranslation('mp_reali', language)}` : ''}
                    </p>
                  </div>
                </div>
                )}

                {datiSole && datiSole.oreCritiche.length > 0 && (
                  <p className="text-[10px] text-orange-600 dark:text-orange-400 font-bold mt-2 leading-snug">
                    {getTranslation('mp_sole_forte', language)} {datiSole.oreCritiche[0]}–{datiSole.oreCritiche[datiSole.oreCritiche.length - 1]}
                  </p>
                )}

                {datiSole && (
                  <p className="text-[10px] text-primary/70 dark:text-white/70 mt-1.5 leading-snug">
                    {consiglioSole(datiSole, language)}
                  </p>
                )}

                {datiSole && datiSole.prossimeOre.length > 1 && (
                  <div className="flex gap-1 mt-2">
                    {datiSole.prossimeOre.slice(0, 6).map((o) => (
                      <div key={o.ora} className="flex-1 flex flex-col items-center gap-0.5">
                        <span className="w-full h-1.5 rounded-full" style={{ background: livelloUv(o.uv).colore }} />
                        <span className="text-[11px] text-primary/70 dark:text-white/70 leading-none">{o.ora.slice(0, 2)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Alba, tramonto e ora d'oro: calcolati in locale, senza
                    rete. Restano leggibili anche col telefono offline. */}
                {oreLuce && !oreLuce.sempreNotte && (
                  <div className="mt-2.5 pt-2 border-t border-black/5 dark:border-white/10 space-y-1">
                    {oreLuce.sempreGiorno ? (
                      <p className="text-[10px] text-primary/70 dark:text-white/70">
                        {getTranslation('mp_sole_sempre_alto', language)}
                      </p>
                    ) : (
                      <>
                        <div className="flex items-center justify-between text-[10px] text-primary/70 dark:text-white/70">
                          <span>🌅 {oraBreve(oreLuce.alba, fusoSole)}</span>
                          <span>🌇 {oraBreve(oreLuce.tramonto, fusoSole)}</span>
                          <span className="text-primary/45 dark:text-white/45">{oreLuce.durataLuce}</span>
                        </div>
                        {/* Fuso diverso dal telefono: lo si dice, altrimenti chi
                            legge «19:30» dall'Italia non sa di che ora si parla. */}
                        {fusoSole && fusoSole !== Intl.DateTimeFormat().resolvedOptions().timeZone && (
                          <p className="text-[9px] text-primary/50 dark:text-white/50 leading-snug">
                            🕒 {getTranslation('mp_ora_locale_di', language)} {fusoSole.split('/').pop()?.replace(/_/g, ' ')}
                          </p>
                        )}
                        {oreLuce.oraOroSeraInizio && (
                          <p className="text-[10px] font-bold text-amber-600 dark:text-amber-400 leading-snug">
                            ✨ {getTranslation('mp_ora_oro', language)} {oraBreve(oreLuce.oraOroSeraInizio, fusoSole)}
                            {mancaAllOraOro(oreLuce) ? ` · ${mancaAllOraOro(oreLuce)}` : ''}
                          </p>
                        )}
                      </>
                    )}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <AnimatePresence>
        {followMode && (
          <motion.div
            key="follow-banner"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            className="absolute bottom-16 md:bottom-20 right-2 md:right-4 z-[1001] flex flex-col items-center gap-2 pointer-events-auto"
          >
            {/* Bussola: era un <div onClick> muto per lo screen reader (UX-11).
                Tocco = esci dal follow-me; l'etichetta dice orientamento e azione. */}
            <button
              type="button"
              className={`w-12 h-12 bg-white/60 dark:bg-black/60 backdrop-blur-3xl rounded-full shadow-[0_8px_32px_rgba(0,0,0,0.15)] border border-white/50 dark:border-white/20 flex items-center justify-center cursor-pointer hover:scale-105 active:scale-95 transition-all ${followMode ? 'ring-2 ring-blue-500' : ''}`}
              title={`${getTranslation('map_orientamento', language)}: ${Math.round(mapRotation)}°`}
              aria-label={`${getTranslation('map_orientamento', language)}: ${Math.round(mapRotation)}°. ${getTranslation('a11y_esci_follow', language)}`}
              onClick={() => stopFollowMode()}
            >
              <svg
                viewBox="0 0 40 40"
                width="36"
                height="36"
                aria-hidden="true"
                className={followMode ? "animate-pulse-slow" : ""}
                style={{ transform: `rotate(-${mapRotation}deg)`, transition: 'transform 0.3s ease' }}
              >
                <path d="M20 4 L23 20 L20 18 L17 20 Z" fill="#e11d48" />
                <path d="M20 36 L17 20 L20 22 L23 20 Z" fill="#94a3b8" />
                <circle cx="20" cy="20" r="3" fill="#1e3a8a" />
                <text x="20" y="3" textAnchor="middle" fontSize="4" fill="#e11d48" fontWeight="bold">N</text>
              </svg>
            </button>

            <div className="bg-blue-600/80 backdrop-blur-2xl text-white text-[11px] font-black uppercase tracking-wider px-3 py-1.5 rounded-full shadow-2xl border border-white/20 flex items-center gap-2" aria-live="polite">
              <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse inline-block" aria-hidden="true" />
              {getTranslation('map_follow_on', language)}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className={`absolute md:top-[60px] right-4 z-[1000] flex flex-col gap-2 max-w-[280px] pointer-events-none ${followMode ? 'top-[160px]' : 'top-[60px]'}`}>
        <AnimatePresence>
          {Object.entries(fetchErrors).map(([key, error]) => (
            <motion.div
              key={key}
              initial={{ x: 50, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 50, opacity: 0 }}
              className="bg-white/70 dark:bg-[#1C1C1E]/70 backdrop-blur-2xl border border-amber-500/30 shadow-[0_8px_32px_rgba(0,0,0,0.12)] rounded-2xl p-3 flex items-start gap-3 relative group overflow-hidden pointer-events-auto"
            >
              <div className="absolute left-0 top-0 bottom-0 w-1 bg-amber-500" />
              <div className="mt-0.5 p-1 bg-amber-100 rounded-full shrink-0">
                <Info className="w-3.5 h-3.5 text-amber-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-black text-amber-900 leading-tight uppercase tracking-tight">
                  {key === "overpass" ? getTranslation("error_map_places", language) : (key === "location" ? getTranslation("error_position", language) : (key === "db" ? getTranslation('mp_err_db_titolo', language) : (key === "servizi" ? getTranslation('mp_err_servizi_titolo', language) : key)))}
                </p>
                <p className="text-[10px] text-amber-800/90 leading-tight mt-1 font-medium">
                  {String(error)}
                </p>
                {key === "overpass" && (
                  <button 
                    onClick={() => {
                        setFetchErrors(prev => {
                            const n = {...prev};
                            delete n.overpass;
                            return n;
                        });
                        const bounds = mapRef.current?.getBounds();
                        if (bounds) performFetchPois(bounds);
                    }}
                    className="mt-2 text-[9px] font-black bg-amber-600 text-white px-2 py-1 rounded-md hover:bg-amber-700 transition-colors uppercase tracking-wider"
                  >
                    {getTranslation("retry_btn", language)}
                  </button>
                )}
              </div>
              <button
                onClick={() =>
                  setFetchErrors((prev) => {
                    const newErrors = { ...prev };
                    delete newErrors[key];
                    return newErrors;
                  })
                }
                className="opacity-40 hover:opacity-100 p-0.5 hover:bg-black/5 rounded-md transition-all shrink-0"
              >
                <X className="w-3.5 h-3.5 text-amber-900" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {showNearbyList && (
          <Fragment key="nearby-wrapper">
            <motion.div
              key="nearby-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowNearbyList(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-md z-[1001]"
            />
            <motion.div
              key="nearby-panel"
              initial={{ y: "100%", opacity: 0.5, scale: 0.98 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: "100%", opacity: 0, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="absolute bottom-0 left-0 w-full md:left-6 md:bottom-6 md:w-[420px] max-h-[65dvh] md:max-h-[60dvh] bg-white/80 dark:bg-[#1C1C1E]/80 backdrop-blur-3xl shadow-[0_16px_64px_rgba(0,0,0,0.3)] border border-white/40 dark:border-white/10 rounded-t-[2.5rem] md:rounded-[2rem] z-[1002] flex flex-col overflow-hidden"
            >
              <div className="px-6 py-5 border-b border-black/5 dark:border-white/5 flex items-center justify-between sticky top-0 z-10">
                <div>
                  <h2 className="text-xl font-black text-[#1e3a8a] tracking-tight leading-none">
                    {getTranslation("near_you", language)}
                  </h2>
                  <p className="text-[10px] font-bold text-[#1e3a8a] uppercase tracking-widest mt-1.5 opacity-60">
                    {getTranslation("within_1000m", language)}
                  </p>
                </div>
                <button
                  onClick={() => setShowNearbyList(false)}
                  className="p-2 bg-secondary/5 hover:bg-secondary/10 text-secondary rounded-full transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto pt-4 px-4 pb-[calc(2rem+env(safe-area-inset-bottom))] space-y-3 custom-scrollbar min-h-[300px] overscroll-none select-none touch-pan-y">
                {nearbyPois.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-center opacity-60">
                    <MapPin className="w-12 h-12 mb-4 text-[#1e3a8a]/50" />
                    <p className="font-bold text-sm px-10 text-[#1e3a8a]">
                      {!userLocation 
                        ? getTranslation('mp_gps_attiva', language)
                        : getTranslation("no_pois_found_within_1000m", language)
                      }
                    </p>
                  </div>
                ) : (
                  nearbyPois.map((poi, idx) => (
                    <motion.button
                      key={`${poi.id}-${idx}`}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      onClick={() => focusPoiOnMap(poi)}
                      className="w-full flex items-center gap-4 p-3 bg-white/50 dark:bg-white/5 hover:bg-white/80 dark:hover:bg-white/10 border border-black/5 dark:border-white/5 hover:border-primary/30 rounded-2xl transition-all group shadow-sm"
                    >
                      <div
                        className={`w-12 h-12 rounded-xl ${(CATEGORY_COLORS as any)[poi.category] || "bg-[#fdfbf7]"} flex items-center justify-center text-xl shadow-sm grayscale-[0.2] group-hover:grayscale-0 transition-all relative`}
                      >
                        {(CATEGORY_EMOJIS as any)[poi.category] || "📍"}
                        {(poi.category === "gemme" && poi.originalCategory) && (
                          <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-white rounded-full border border-amber-100/50 flex items-center justify-center text-[10px] shadow-sm">
                            {(CATEGORY_EMOJIS as any)[poi.originalCategory]}
                          </div>
                        )}
                        {((poi.category === "locali" || poi.category === "utilita" || poi.category === "famiglie") && poi.subCategory) && (
                          <div className="absolute -top-1 -right-1 min-w-[14px] h-[14px] bg-white rounded-full border border-amber-100/60 flex items-center justify-center text-[8px] shadow-sm z-10">
                            {getSubCategoryEmoji(poi.subCategory)}
                          </div>
                        )}
                      </div>
                      <div className="flex-1 text-left">
                        <h3 className="font-black text-[#1e3a8a] text-sm line-clamp-1 leading-tight group-hover:text-primary transition-colors">
                          {poi.name}
                        </h3>
                        <p className="text-[10px] font-extrabold text-[#1e3a8a] uppercase tracking-wider mt-0.5 opacity-60">
                          {poi.category}
                        </p>
                      </div>
                      <div className="text-[10px] font-black text-secondary bg-secondary/5 px-2 py-1 rounded-md">
                        {(() => {
                          try {
                            if (!mapRef.current) return 0;
                            const map = mapRef.current;
                            if (typeof map.getCenter !== 'function') return 0;
                            
                            const c = map.getCenter();
                            return Math.round(
                              getDistanceFromLatLonInM(
                                c.lat,
                                c.lng,
                                poi.lat,
                                poi.lon,
                              ),
                            );
                          } catch (e) {
                            return 0;
                          }
                        })()}
                        m
                      </div>
                    </motion.button>
                  ))
                )}
              </div>
            </motion.div>
          </Fragment>
        )}

        {showEverythingPanel && (
          <Fragment key="everything-wrapper">
            <motion.div
              key="everything-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowEverythingPanel(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-md z-[1001]"
            />
            <motion.div
              key="everything-panel"
              initial={{ y: "100%", opacity: 0.5, scale: 0.98 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: "100%", opacity: 0, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="absolute bottom-0 left-0 w-full md:left-6 md:bottom-6 md:w-[420px] max-h-[70dvh] md:max-h-[65dvh] bg-white/80 dark:bg-[#1C1C1E]/80 backdrop-blur-3xl shadow-[0_16px_64px_rgba(0,0,0,0.3)] border border-white/40 dark:border-white/10 rounded-t-[2.5rem] md:rounded-[2rem] z-[1002] flex flex-col overflow-hidden"
            >
              <div className="px-6 py-5 border-b border-black/5 dark:border-white/5 sticky top-0 z-10">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-black text-[#1e3a8a] tracking-tight leading-none">
                    {getTranslation("everything_nearby_title", language)}
                  </h2>
                  <div className="flex items-center gap-1.5">
                    {everythingPinned.length > 0 && (
                      <>
                        {/* PERCORSO DALLE TAPPE SELEZIONATE (29/08/2026, committente):
                            le stesse regole di Dieci Tappe e degli itinerari —
                            chi ha l'audioguida la ascolta (al volo o col Day
                            Pass), chi non ce l'ha (ristorante, fontanella…) e`
                            solo una tappa del navigatore — ma senza il vincolo
                            delle dieci tappe. La bozza si riempie e si apre il
                            radar, dove il percorso e` gia` disegnato e c'e`
                            «Crea il giro» con pass e pagamento come sempre. */}
                        <button
                          onClick={() => {
                            const n = tourService.bozzaDaTappe(everythingPinned, { senzaLimite: true, ordinaServer: true });
                            if (!n) return;
                            setShowEverythingPanel(false);
                            window.dispatchEvent(new CustomEvent('wip-apri-radar'));
                          }}
                          title={getTranslation('everything_crea_percorso', language)}
                          aria-label={getTranslation('everything_crea_percorso', language)}
                          className="min-h-9 px-3 rounded-full bg-emerald-600 text-white text-[11px] font-black flex items-center gap-1.5 hover:bg-emerald-700 transition-colors shadow-sm"
                        >
                          🧭 {getTranslation('everything_crea_percorso', language)}
                        </button>
                        <button
                          onClick={() => { setEverythingPinned([]); }}
                          title={getTranslation('everything_pinned_clear', language)}
                          aria-label={getTranslation('everything_pinned_clear', language)}
                          className="min-h-9 px-2.5 rounded-full bg-[#1e3a8a]/10 text-[#1e3a8a] text-[11px] font-black flex items-center gap-1 hover:bg-[#1e3a8a]/20 transition-colors"
                        >
                          📍 {everythingPinned.length} <X className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => setShowEverythingPanel(false)}
                      aria-label={getTranslation('close', language)}
                      className="min-w-11 min-h-11 flex items-center justify-center bg-[#1e3a8a]/5 hover:bg-[#1e3a8a]/10 text-[#1e3a8a] rounded-full transition-colors"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>
                {/* Selettore raggio: rifà la fetch a ogni cambio, così la
                    lista/i conteggi restano coerenti col raggio mostrato. */}
                <div className="flex items-center gap-2 mt-3">
                  {/* Tetto a 25 km (27/08/2026): misurato dal vivo, 50 km su
                      un'area densa va sempre in timeout anche coi 20s
                      concessi alla RPC — 25 km è già a 10s, il limite
                      pratico per un tap-e-aspetta. Vedi nota nella
                      migration nearby_everything. */}
                  {[10000, 15000, 25000].map((r) => (
                    <button
                      key={r}
                      onClick={() => handleChangeEverythingRadius(r)}
                      className={`px-3 py-1.5 rounded-full text-[11px] font-black uppercase tracking-wide border transition-colors ${everythingRadius === r ? 'bg-[#1e3a8a] text-white border-[#1e3a8a]' : 'bg-white/50 dark:bg-white/5 text-[#1e3a8a] dark:text-white border-black/5 dark:border-white/10 hover:border-[#1e3a8a]/30'}`}
                    >
                      {r / 1000} km
                    </button>
                  ))}
                  {everythingLoading && (
                    <Loader2 className="w-4 h-4 animate-spin text-[#1e3a8a]/60 ml-1" />
                  )}
                </div>
              </div>

              <div
                ref={everythingScrollElRef}
                onScroll={(e) => { everythingScrollTopRef.current = e.currentTarget.scrollTop; }}
                className="flex-1 overflow-y-auto pt-3 px-4 pb-[calc(2rem+env(safe-area-inset-bottom))] space-y-2 custom-scrollbar min-h-[300px] overscroll-none select-none touch-pan-y"
              >
                {!everythingLoading && everythingGroups.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-center opacity-60">
                    <MapPin className="w-12 h-12 mb-4 text-[#1e3a8a]/50" />
                    <p className="font-bold text-sm px-10 text-[#1e3a8a]">
                      {getTranslation('everything_nearby_empty', language)}
                    </p>
                  </div>
                ) : (
                  everythingGroups.map((group) => {
                    const info = everythingGroupInfo(group.key);
                    const expanded = expandedGroups.has(group.key);
                    return (
                      <div key={group.key} className="rounded-2xl bg-white/50 dark:bg-white/5 border border-black/5 dark:border-white/5 overflow-hidden">
                        <button
                          onClick={() => toggleEverythingGroup(group.key)}
                          className="w-full flex items-center gap-3 p-3 hover:bg-white/60 dark:hover:bg-white/10 transition-colors"
                        >
                          <div className={`w-10 h-10 rounded-xl ${(CATEGORY_COLORS as any)[group.key] || "bg-[#fdfbf7]"} flex items-center justify-center text-lg shadow-sm shrink-0`}>
                            {info.emoji}
                          </div>
                          <span className="flex-1 text-left font-black text-[#1e3a8a] dark:text-white text-sm">
                            {info.label}
                          </span>
                          <span className="text-[10px] font-black text-white bg-[#1e3a8a] rounded-full px-2 py-1 shrink-0">
                            {group.count}
                          </span>
                          <ChevronDown className={`w-4 h-4 text-[#1e3a8a]/60 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                        </button>
                        {expanded && (
                          <div className="px-2 pb-2 space-y-1.5">
                            {group.items.map((item) => (
                              <button
                                key={item.id}
                                onClick={() => openEverythingItem(item)}
                                className="w-full flex items-center gap-3 p-2.5 bg-white/60 dark:bg-white/5 hover:bg-white/90 dark:hover:bg-white/15 rounded-xl transition-all text-left"
                              >
                                {/* Colonna icone: sopra il gruppo, sotto la sotto-categoria
                                    (regola del committente 29/08) — poi il nome. */}
                                <span className="flex flex-col items-center justify-center w-7 shrink-0 leading-none">
                                  <span className="text-[13px]">{info.emoji}</span>
                                  {(() => { const sub = everythingRowEmoji(item, info.emoji); return sub ? <span className="text-[11px] mt-0.5 opacity-80">{sub}</span> : null; })()}
                                </span>
                                <span className="flex-1 font-bold text-[#1e3a8a] dark:text-white text-xs line-clamp-1">
                                  {item.name}
                                </span>
                                <span className="text-[10px] font-black text-secondary bg-secondary/5 px-2 py-1 rounded-md shrink-0">
                                  {item.distanza_m >= 1000 ? `${(item.distanza_m / 1000).toFixed(1)} km` : `${Math.round(item.distanza_m)} m`}
                                </span>
                              </button>
                            ))}
                            {group.count > group.items.length && (
                              everythingFullLoaded ? (
                                <p className="text-[10px] text-center text-[#1e3a8a]/50 font-bold pt-1">
                                  +{group.count - group.items.length}
                                </p>
                              ) : (
                                <button
                                  onClick={loadMoreEverything}
                                  disabled={everythingLoading}
                                  className="w-full min-h-10 rounded-xl bg-[#1e3a8a]/10 text-[#1e3a8a] text-[11px] font-black flex items-center justify-center gap-2 hover:bg-[#1e3a8a]/20 transition-colors disabled:opacity-60"
                                >
                                  {everythingLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                  +{group.count - group.items.length} · {getTranslation('everything_show_all', language)}
                                </button>
                              )
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </motion.div>
          </Fragment>
        )}
      </AnimatePresence>

      <div
        /* UNA RIGA SOLA (30/08/2026): due tasti di pari larghezza, la lente e
           il mirino. Prima qui dentro c'era anche il campo di ricerca, con
           flex-1: su ~360 px i tasti shrink-0 si prendevano tutta la riga e il
           campo collassava a larghezza ZERO — restava solo la lente e
           sembrava un tasto rotto. E` il motivo per cui la ricerca della
           citta' «non funzionava» nell'app mentre sulla PWA, in una finestra
           larga, andava. Il campo ora si apre in una riga SOPRA la barra. */
        className="absolute bottom-[calc(1rem+env(safe-area-inset-bottom))] left-4 right-4 md:bottom-8 md:left-8 md:max-w-md md:mx-auto z-[1000] flex flex-row items-center bg-white/70 dark:bg-[#1C1C1E]/70 backdrop-blur-3xl rounded-[2rem] shadow-[0_8px_32px_rgba(0,0,0,0.15)] border border-white/60 dark:border-white/10 p-1.5 gap-2 select-none touch-manipulation"
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        {!showNearbyList && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleFindNear}
            /* flex-1 e non shrink-0 (30/08/2026): «Trova vicino» e «Trova
               tutto» ora dividono in parti uguali lo spazio della barra —
               prima il primo si prendeva tutto con l'etichetta intera e il
               secondo restava una sola emoji. */
            className="flex-1 min-w-0 px-2.5 py-2.5 bg-[#1e3a8a] text-white rounded-[1.5rem] font-black text-[10px] shadow-[0_4px_16px_rgba(30,58,138,0.4)] hover:bg-[#123628] transition-all flex items-center justify-center gap-1.5 group"
          >
            <MapPin className="w-4 h-4 fill-white/20 shrink-0" />
            <span className="uppercase tracking-[0.06em] truncate">{getTranslation("find_near", language)}</span>
            <span className="min-w-5 h-5 px-1 bg-[#2c6e54] text-white rounded-full flex items-center justify-center text-[11px] font-black shadow-inner">
              {
                visiblePois.filter((p) => {
                  try {
                    const map = mapRef.current;
                    if (!map || typeof map.getCenter !== 'function') return false;
                    
                    const c = map.getCenter();
                    return (
                      getDistanceFromLatLonInM(c.lat, c.lng, p.lat, p.lon) <=
                      1000
                    );
                  } catch (e) {
                    return false;
                  }
                }).length
              }
            </span>
          </motion.button>
        )}

        {!showNearbyList && !showEverythingPanel && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleOpenEverythingPanel}
            title={getTranslation('everything_nearby_title', language)}
            /* Stessa misura di «Trova vicino» e etichetta SEMPRE visibile:
               con `hidden sm:inline` sul telefono restava solo la bussola e
               non si capiva cosa fosse. */
            className="flex-1 min-w-0 px-2.5 py-2.5 bg-white/60 dark:bg-white/10 text-[#1e3a8a] dark:text-white rounded-[1.5rem] font-black text-[10px] shadow-sm hover:bg-white/90 dark:hover:bg-white/20 transition-all flex items-center justify-center gap-1.5 border border-[#1e3a8a]/10"
          >
            <span className="text-sm leading-none shrink-0">🧭</span>
            <span className="uppercase tracking-[0.06em] truncate">{getTranslation('everything_nearby_button', language)}</span>
          </motion.button>
        )}

        {/* LENTE: apre e chiude la riga di ricerca qui sopra. */}
        <button
          type="button"
          onClick={() => {
            setRicercaAperta((aperta) => {
              if (aperta) {
                setSearchQuery("");
                setSuggestions([]);
                setNostri([]);
                setSearchNoResults(false);
                return false;
              }
              setTimeout(() => campoRicercaRef.current?.focus(), 80);
              return true;
            });
          }}
          aria-label={getTranslation("search_city_placeholder", language)}
          aria-expanded={ricercaAperta}
          className={`shrink-0 p-2 rounded-full transition-all active:scale-90 ${
            ricercaAperta
              ? 'bg-[#1e3a8a] text-white shadow-md'
              : 'bg-white/60 dark:bg-white/10 text-[#1e3a8a] dark:text-white border border-[#1e3a8a]/10'
          }`}
        >
          <Search className="w-5 h-5" />
        </button>

        {/* LA RIGA DI RICERCA, sopra la barra: qui il campo ha tutta la
            larghezza dello schermo, non i quattro pixel che gli restavano
            fra i tasti. */}
        <AnimatePresence>
          {ricercaAperta && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ type: "spring", stiffness: 320, damping: 26 }}
              className="absolute bottom-full left-0 right-0 mb-2 flex items-center gap-1 px-4 py-1 bg-white/90 dark:bg-[#1C1C1E]/90 backdrop-blur-3xl rounded-[2rem] shadow-[0_8px_32px_rgba(0,0,0,0.15)] border border-white/60 dark:border-white/10"
            >
              <Search className="w-5 h-5 text-[#1e3a8a] dark:text-white mr-1 shrink-0" />
          <form
            onSubmit={handleSearch}
            className="flex-1 min-w-0 flex items-center"
          >
            <input
              ref={campoRicercaRef}
              type="text"
              placeholder={getTranslation("search_city_placeholder", language)}
              className="flex-1 min-w-0 bg-transparent py-2 text-base font-bold focus:outline-none text-[#1e3a8a] dark:text-white placeholder:text-[#1e3a8a]/50 w-full"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              role="combobox"
              aria-expanded={displayedSuggestions.length > 0}
              aria-controls="map-search-results"
              aria-autocomplete="list"
              aria-activedescendant={activeSuggestionIdx >= 0 ? `map-sr-${activeSuggestionIdx}` : undefined}
              onBlur={() => setTimeout(() => { setSuggestions([]); setNostri([]); setSearchNoResults(false); }, 200)}
              onKeyDown={(e) => {
                // Navigazione da tastiera: ↑↓ evidenziano, Invio seleziona,
                // Esc chiude. Senza selezione attiva Invio lancia la ricerca
                // classica (submit del form).
                if (e.key === 'Escape') {
                  setSuggestions([]);
                  setSearchNoResults(false);
                  return;
                }
                if (!displayedSuggestions.length) return;
                if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setActiveSuggestionIdx(i => (i <= 0 ? displayedSuggestions.length - 1 : i - 1));
                } else if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setActiveSuggestionIdx(i => (i >= displayedSuggestions.length - 1 ? 0 : i + 1));
                } else if (e.key === 'Enter' && activeSuggestionIdx >= 0) {
                  e.preventDefault();
                  handleSuggestionClick(displayedSuggestions[activeSuggestionIdx]);
                }
              }}
            />
          </form>
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => { setSearchQuery(""); campoRicercaRef.current?.focus(); }}
                  aria-label={getTranslation('a11y_cancella_ricerca', language)}
                  className="shrink-0 min-w-11 min-h-11 flex items-center justify-center hover:bg-surface-container rounded-full transition-colors text-[#1e3a8a] dark:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex items-center gap-0.5 shrink-0">
            {isSearching || isLoadingPois ? (
              <div className="p-1">
                <Loader2 className="w-4 h-4 text-primary animate-spin" />
              </div>
            ) : (
              <button
                type="button"
                onMouseDown={() => {
                  isLongPressRef.current = false;
                  longPressTimerRef.current = setTimeout(() => {
                    isLongPressRef.current = true;
                    handleMyLocation(true);
                  }, 600);
                }}
                onMouseUp={() => {
                  if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
                  if (!isLongPressRef.current) {
                    handleMyLocation(false);
                  }
                  isLongPressRef.current = false;
                }}
                onTouchStart={() => {
                  isLongPressRef.current = false;
                  longPressTimerRef.current = setTimeout(() => {
                    isLongPressRef.current = true;
                    handleMyLocation(true);
                  }, 600);
                }}
                onTouchEnd={() => {
                  if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
                  if (!isLongPressRef.current) {
                    handleMyLocation(false);
                  }
                  isLongPressRef.current = false;
                }}
                className={`p-2 rounded-full transition-all active:scale-90 relative ${
                  followMode
                    ? 'bg-blue-600 text-white shadow-xl ring-4 ring-blue-500/30'
                    : 'bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-100 shadow-sm'
                }`}
                title={followMode ? 'Disattiva follow mode' : getTranslation("my_position", language)}
              >
                <Crosshair className={`w-5 h-5 ${followMode ? 'text-white' : 'text-blue-700'}`} />
                {followMode && (
                  <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-green-400 rounded-full border border-white animate-pulse" />
                )}
              </button>
            )}
          </div>

          <AnimatePresence>
            {(displayedSuggestions.length > 0 || (searchQuery.length >= 3 && (isSearching || searchNoResults))) && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.98 }}
                transition={{ type: "spring", stiffness: 300, damping: 25 }}
                id="map-search-results"
                role="listbox"
                aria-label={getTranslation("search_city_placeholder", language)}
                /* mb-16 e non mb-4: i risultati stanno SOPRA la riga di
                   ricerca, che ora e' anch'essa sopra la barra. Con mb-4 le
                   due cose si sovrapponevano. */
                className="absolute bottom-full mb-16 left-0 right-0 bg-white/95 dark:bg-[#1C1C1E]/95 backdrop-blur-3xl rounded-[2rem] shadow-[0_16px_64px_rgba(0,0,0,0.2)] border border-white/50 dark:border-white/10 overflow-hidden max-h-[300px] overflow-y-auto overscroll-none select-none touch-pan-y"
              >
                {displayedSuggestions.length === 0 ? (
                  <div className="px-5 py-4 text-[15px] font-bold text-[#1e3a8a]/70 flex items-center gap-3" aria-live="polite">
                    {isSearching
                      ? (<><Loader2 className="w-4 h-4 animate-spin shrink-0" /> {getTranslation('mp_ricerca_in_corso', language)}</>)
                      : getTranslation('mp_nessun_risultato', language).replace('{q}', searchQuery)}
                  </div>
                ) : displayedSuggestions.map((res, idx) => (
                  <button
                    key={`${res.place_id || res.id || 'sg'}-${idx}`}
                    id={`map-sr-${idx}`}
                    role="option"
                    aria-selected={idx === activeSuggestionIdx}
                    ref={(el) => { if (idx === activeSuggestionIdx) el?.scrollIntoView({ block: 'nearest' }); }}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleSuggestionClick(res);
                    }}
                    className={`w-full px-5 py-4 min-h-[56px] text-left hover:bg-primary/5 flex items-start gap-4 transition-all border-t border-amber-100/40 first:border-t-0 group cursor-pointer ${idx === activeSuggestionIdx ? 'bg-primary/10' : ''}`}
                  >
                    <div className="mt-0.5 p-1.5 bg-surface-container rounded-lg group-hover:bg-primary/10 transition-colors shrink-0">
                      {res.kind === 'categoria' ? <span className="text-base leading-none">{res.emoji}</span>
                        : res.kind === 'percorso' ? <span className="text-base leading-none">🥾</span>
                        : res.kind === 'poi' ? <span className="text-base leading-none">{res.is_gem ? '💎' : (CATEGORY_EMOJIS as any)[res.category] || '📍'}</span>
                        : <MapPin className="w-4 h-4 text-primary" />}
                    </div>
                    <div className="flex flex-col flex-1 min-w-0">
                      <span className="font-bold text-[#1e3a8a] text-[15px] leading-tight whitespace-normal break-words">
                        {res.kind === 'categoria'
                          ? (res.luogo ? `${res.label} · ${res.luogo.name}` : res.label)
                          : res.kind
                            ? res.name
                            : res.isNominatim || res.isMapbox
                              ? res.description.split(",")[0]
                              : res.structured_formatting?.main_text || res.description}
                      </span>
                      <span className="text-xs text-[#1e3a8a]/80 leading-snug mt-0.5 whitespace-normal break-words">
                        {res.kind === 'categoria'
                          ? getTranslation('mp_accendi_categoria', language)
                          : res.kind === 'percorso'
                            ? `${getTranslation('mp_percorso', language)}${res.city ? ` · ${res.city}` : ''}`
                            : res.kind === 'poi'
                              ? [res.city, res.country, res.distanza_km != null ? `${res.distanza_km} km` : null].filter(Boolean).join(' · ')
                              : res.isNominatim || res.isMapbox
                                ? res.description.split(",").slice(1).join(",").trim() || res.description
                                : res.structured_formatting?.secondary_text || res.description}
                      </span>
                    </div>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
      </div>

      <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-b from-black/10 to-transparent pointer-events-none z-10" />
      <div className="absolute bottom-0 left-0 w-full h-32 bg-gradient-to-t from-black/10 to-transparent pointer-events-none z-10" />
    </div>
  );
}

// Comparatore custom per React.memo: ignora deliberatamente `onSetSubFilter`,
// che il parent passa come arrow function inline (identità nuova a ogni render)
// e che questo componente non usa — confrontarlo vanificherebbe la memoizzazione.
// Tutte le altre props vengono confrontate per identità come farebbe memo di default.
function areMapAreaPropsEqual(prev: MapAreaProps, next: MapAreaProps) {
  return (
    prev.selectedCategories === next.selectedCategories &&
    prev.onSelectPoi === next.onSelectPoi &&
    prev.onCenterChange === next.onCenterChange &&
    prev.subFilter === next.subFilter &&
    prev.language === next.language &&
    prev.activeTab === next.activeTab &&
    prev.isRadarMode === next.isRadarMode &&
    prev.radarPois === next.radarPois
  );
}

export default memo(MapArea, areMapAreaPropsEqual);
