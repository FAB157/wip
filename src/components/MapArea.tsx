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
  SUB_CATEGORY_EMOJIS,
} from "../lib/mapConstants";
import {
  MapContainer,
  TileLayer,
  Marker,
  useMap,
  ZoomControl,
  useMapEvents,
  Popup,
  LayerGroup,
  Polyline,
} from "react-leaflet";
import L from "leaflet";
import { Search, Crosshair, Loader2, Info, X, MapPin, Headphones } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

import { setCachedPoiDetails, getCachedPoiDetails, getCachedCityName } from "../lib/poiCache";
import { fetchCityNameQueued } from "../lib/nominatimQueue";
import { gygSearchUrl, viatorSearchUrl, trackAffiliateClick } from "../lib/affiliates";
import { supabase } from "../lib/supabase";
import { Language, getTranslation } from "../lib/i18n";
import { logApiCall } from "../lib/apiLogger";
import { locationService } from "../services/locationService";
import { haversineMeters } from "../lib/geo";

import type { PoiCategory } from "../types/poi";

import { useNetworkStatus } from "../hooks/useNetworkStatus";
import { db } from "../lib/db";

// Fix for default marker icons in Leaflet
import "leaflet/dist/leaflet.css";

const INITIAL_CENTER: [number, number] = [44.0792, 10.1];

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

function MapEventsHandler({
  onMoveEnd,
  onCenterChange,
  onDragStart,
}: {
  onMoveEnd: (bounds: L.LatLngBounds) => void;
  onCenterChange?: (center: [number, number]) => void;
  onDragStart?: () => void;
}) {
  const onMoveEndRef = useRef(onMoveEnd);
  const onCenterChangeRef = useRef(onCenterChange);
  const onDragStartRef = useRef(onDragStart);

  useEffect(() => {
    onMoveEndRef.current = onMoveEnd;
    onCenterChangeRef.current = onCenterChange;
    onDragStartRef.current = onDragStart;
  }, [onMoveEnd, onCenterChange, onDragStart]);

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

          // Ancoraggio geografico delle ricerche esterne (Viator, GetYourGuide,
          // Virgilio, Ticketmaster): il riferimento è ciò che l'utente sta
          // guardando, non dove si trova fisicamente. Il raggio è quello del
          // riquadro visibile, così ricerca e mappa coincidono.
          const ne = bounds.getNorthEast();
          const radiusKm = Math.max(
            1,
            Math.round(map.distance(center, ne) / 1000),
          );
          window.dispatchEvent(new CustomEvent('wip-map-center-change', {
            detail: { lat: center.lat, lon: center.lng, radiusKm },
          }));

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


import PoiPopupContent from "./PoiPopupContent";
import PoiRadarPanel from "./PoiRadarPanel";

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

  // Chip partner in home (CategoryChips): apre la ricerca Viator/GetYourGuide
  // con la città del centro mappa già compilata e il codice affiliato.
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
      const url = partner === 'viator' ? viatorSearchUrl(city) : gygSearchUrl(city);
      trackAffiliateClick(url, `Ricerca esperienze ${city || 'zona corrente'}`, city, 'home_chip');
      if (win) {
        win.location.href = url;
      } else {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    };
    window.addEventListener('wip-open-experiences', openExperiences);
    return () => window.removeEventListener('wip-open-experiences', openExperiences);
  }, []);

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
  const [isSearching, setIsSearching] = useState(false);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  // Accessibilità ricerca: indice del suggerimento evidenziato (frecce ↑↓)
  // e flag "nessun risultato" per non lasciare l'utente senza feedback.
  const [activeSuggestionIdx, setActiveSuggestionIdx] = useState(-1);
  const [searchNoResults, setSearchNoResults] = useState(false);
  // La tendina si apre verso l'ALTO (bottom-full): invertiamo così il
  // risultato migliore resta adiacente alla casella di ricerca.
  const displayedSuggestions = useMemo(() => [...suggestions].reverse(), [suggestions]);
  useEffect(() => { setActiveSuggestionIdx(-1); }, [suggestions]);
  const [pois, setPois] = useState<Poi[]>([]);
  // --- LOCAL STORAGE CATEGORIES ---
  // Rimosso activeSubcats perché causava bug di stale state rispetto a selectedCategories

  useEffect(() => {
    const handleFocusPoi = (e: any) => {
      if (e.detail) focusPoiOnMap(e.detail);
    };
    window.addEventListener('focus-poi', handleFocusPoi);
    return () => window.removeEventListener('focus-poi', handleFocusPoi);
  }, [pois, radarPois]); // Dependencies to ensure focusPoiOnMap is using latest data

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
  const [isLoadingPois, setIsLoadingPois] = useState(false);
  const [isRateLimited, setIsRateLimited] = useState(false);
  const [fetchErrors, setFetchErrors] = useState<Record<string, string>>({});
  const [userLocation, setUserLocation] = useState<[number, number] | null>(
    null,
  );
  const [followMode, setFollowMode] = useState(false);
  // Copia in ref: fetchPois è memoizzata e non deve ricrearsi al toggle del
  // follow-me (ricrearla farebbe ripartire i listener della mappa).
  const followModeRef = useRef(false);
  useEffect(() => { followModeRef.current = followMode; }, [followMode]);
  const [userHeading, setUserHeading] = useState<number | null>(null);
  const [mapRotation, setMapRotation] = useState(0);
  const compassListenerRef = useRef<((e: DeviceOrientationEvent) => void) | null>(null);

  // Stop follow mode & compass when user manually pans the map
  const stopFollowMode = useCallback(() => {
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

  // Stato reattivo del tour: fa partire/fermare l'interval di prossimità
  // invece di lasciarlo tickare a vuoto quando il tour è spento
  const [isTourRunning, setIsTourRunning] = useState<boolean>(() => locationService.getIsTourActive());

  // Sincronizza la posizione dell'utente con il locationService centrale
  useEffect(() => {
    const unsub = locationService.subscribe((loc) => {
      setUserLocation([loc.latitude, loc.longitude]);
      if (loc.heading !== null) {
        setUserHeading(loc.heading);
      }
      // Aggiorna lo stato del tour senza timer dedicati (stesso valore = nessun re-render)
      setIsTourRunning(locationService.getIsTourActive());
    });
    return unsub;
  }, []);

  // L'attivazione del tour emette 'audioguide-status' (locationService.syncSettings):
  // lo usiamo per far ripartire subito l'interval di prossimità senza polling a vuoto
  useEffect(() => {
    const handleGuideStatus = () => setIsTourRunning(locationService.getIsTourActive());
    window.addEventListener('audioguide-status', handleGuideStatus);
    return () => window.removeEventListener('audioguide-status', handleGuideStatus);
  }, []);

  // Handle follow mode panning reactively when userLocation changes
  useEffect(() => {
    if (followMode && userLocation && mapRef.current) {
      try {
        mapRef.current.panTo(userLocation, { animate: true, duration: 0.5 });
      } catch (e) {}
    }
  }, [userLocation, followMode]);

  const mapRef = useRef<L.Map | null>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  // Contatore di generazione dei fetch: le risposte di un fetch superato vengono scartate
  const fetchSeqRef = useRef(0);
  const lastFetchedStateRef = useRef<{ bounds: L.LatLngBounds; categoriesKey: string; subFilter: string[] | undefined } | null>(null);
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
      setSearchNoResults(false);
      return;
    }

    // Abort al cambio di query: senza, una risposta lenta della ricerca
    // precedente poteva sovrascrivere i suggerimenti di quella nuova.
    const abortCtrl = new AbortController();
    const timer = setTimeout(async () => {
      setIsSearching(true);
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
      return (data || [])
        .filter((i: any) => i.is_hidden !== true && i.status !== 'draft' && i.name)
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
      // A zoom lontani si evita il carico pesante, MA i pin community
      // restano visibili (richiesta esplicita: si vedono anche da lontano).
      if (activeCategories.includes('community') && bounds && typeof bounds.getSouth === 'function') {
        const b = bounds.pad(0.2);
        const farCommunity = await fetchCommunityPoisInBounds(b.getSouth(), b.getWest(), b.getNorth(), b.getEast());
        if (farCommunity.length > 0 && fetchSeq === fetchSeqRef.current) {
          setPois(prev => {
            const m = new Map<string, Poi>(prev.map(p => [String(p.id), p]));
            farCommunity.forEach(p => m.set(String(p.id), p));
            return Array.from(m.values());
          });
        }
      }
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

        if (isSubset && currentSubStr === lastSubStr) {
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
      
      pendingCacheState = {
        bounds: expandedBounds,
        categoriesKey,
        subFilter
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
      const [{ data, error }, utilRes] = await Promise.all([
        supabase.rpc('nearby_pois', {
          p_lat: center.lat,
          p_lon: center.lng,
          radius_m: Math.min(radius, 25000),
          limit_num: 1000
        }),
        wantsUtility
          ? supabase.rpc('get_utility_pois', {
              user_lat: center.lat,
              user_lon: center.lng,
              radius_meters: Math.min(radius, 25000),
              limit_num: 400
            })
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
            const mapped = (utilData as any[]).map((item: any) => ({
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

            if (!success || !res) throw new Error("Overpass API error on all mirrors: " + (lastError?.message || ""));
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
            const res = await fetch(`/api/trip/search?searchQuery=ristorante&latLong=${center.lat},${center.lng}`);
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
          if (cachedByCoord && (cachedByCoord.category === poi.category || cachedByCoord.baseCategory === poi.category)) {
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
            merged.sort((a: any, b: any) => {
                const scoreA = (a.is_gem || a.wikidata || a.category === 'gemme') ? 0 : 1;
                const scoreB = (b.is_gem || b.wikidata || b.category === 'gemme') ? 0 : 1;
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
      
      if (isUtilityWord || isUtilityTag) {
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


  // Initial fetch when map is ready
  useEffect(() => {
    if (mapRef.current) {
      try {
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

  // Radar Proximity Check (VELOCE: 3s)
  // L'interval esiste solo quando il tour è attivo e ci sono posizione utente e POI:
  // niente tick a vuoto con il tour spento
  useEffect(() => {
    if (!isTourRunning || !userLocation || visiblePois.length === 0) return;

    const interval = setInterval(() => {
      // Doppio controllo di sicurezza: se il tour è stato spento nel frattempo,
      // allinea lo stato e l'effect smonta l'interval
      if (!locationService.getIsTourActive()) {
        setIsTourRunning(false);
        return;
      }
      for (const poi of visiblePois) {
        const dist = getDistanceFromLatLonInM(
          userLocation[0],
          userLocation[1],
          poi.lat,
          poi.lon,
        );
        if (dist <= 120) {
          // Found a POI within 120m, trigger it!
          console.log("Proximity radar triggered at 120m:", poi.name);

          const nearbyPoisForThis = visiblePois.filter((p) => {
            if (p.id === poi.id) return false;
            const d = getDistanceFromLatLonInM(
              poi.lat,
              poi.lon,
              p.lat,
              p.lon,
            );
            return d <= 1000;
          });

          onSelectPoi(poi, nearbyPoisForThis);
          break; // Only open one
        }
      }
    }, 3000); // Ridotto da 15s a 3s per reattività

    return () => clearInterval(interval);
  }, [isTourRunning, userLocation, visiblePois, onSelectPoi]);

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
      // Remove viewbox restriction to allow worldwide search
      const response = await fetch(
        `/api/nominatim/search?q=${encodeURIComponent(searchQuery)}&format=json`,
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

  const createPoiIcon = (poi: Poi) => {
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
    };

    // I POI WIP Community hanno SEMPRE il pin magenta: il colore della
    // sotto-categoria (monument, church...) non deve mai vincere, altrimenti
    // il pin community diventa indistinguibile da quello ufficiale accanto.
    const isCommunity = effectiveCat === "community";

    let bgHex: string;
    if (isCommunity) {
      bgHex = CAT_HEX.community;
    } else if (isGem) {
      bgHex = (CAT_HEX as any)[osmSubCat] || (CAT_HEX as any)[effectiveCat] || "#0f766e";
    } else {
      bgHex = (CAT_HEX as any)[osmSubCat] || (CAT_HEX as any)[effectiveCat] || "#6b7280";
    }

    const emoji = (CATEGORY_EMOJIS as any)[osmSubCat] || (CATEGORY_EMOJIS as any)[effectiveCat] || "📍";

    const accessible = isAccessible(poi);
    const subIcon = getSubCategoryEmoji(poi.subCategory);

    const isCultural = effectiveCat === "monumenti" || effectiveCat === "chiese" || effectiveCat === "musei" || effectiveCat === "panorami" || effectiveCat === "gemme";
    const subRightBadge = isGem ? "💎" : (isCommunity ? "📸" : (isCultural ? "" : subIcon));
    const subLeftBadge = accessible ? "♿" : "";

    const html = `
      <div style="position:relative;width:34px;height:42px;filter:drop-shadow(0 3px 5px rgba(0,0,0,.3));transform: rotate(calc(-1 * var(--map-rotation, 0deg)));transition: transform 0.15s ease-out;">
        <svg viewBox="0 0 34 42" width="34" height="42" xmlns="http://www.w3.org/2000/svg">
          <path d="M17 0C7.6 0 0 7.6 0 17c0 12.7 17 25 17 25S34 29.7 34 17C34 7.6 26.4 0 17 0z"
            fill="${bgHex}" stroke="${isGem ? '#fbbf24' : '#ffffff'}" stroke-width="${isGem ? '2.5' : '1.5'}"/>
          <circle cx="17" cy="16" r="11" fill="white" opacity="0.95"/>
            <text x="17" y="21" text-anchor="middle" font-size="14" font-family="system-ui,sans-serif">${emoji}</text>
        </svg>
        ${subLeftBadge ? `<div style="position:absolute;top:-4px;left:-8px;min-width:18px;height:18px;background:#fff;border-radius:9px;border:1.5px solid #e5e7eb;display:flex;align-items:center;justify-content:center;font-size:9px;box-shadow:0 1px 4px rgba(0,0,0,.25);z-index:10;">${subLeftBadge}</div>` : ""}
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
  const getPoiIcon = (poi: Poi) => {
    const cacheKey = `${!!(poi.is_gem || poi.category === "gemme")}|${poi.baseCategory || poi.category}|${poi.subCategory || ""}|${isAccessible(poi)}`;
    let icon = iconCacheRef.current.get(cacheKey);
    if (!icon) {
      icon = createPoiIcon(poi);
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
  const markerData = useMemo(
    () =>
      visiblePois
        .filter(
          (p) =>
            p &&
            typeof p.lat === "number" &&
            Number.isFinite(p.lat) &&
            typeof p.lon === "number" &&
            Number.isFinite(p.lon),
        )
        .map((poi) => ({
          poi,
          position: [poi.lat, poi.lon] as [number, number],
          icon: getPoiIcon(poi),
        })),
    [visiblePois],
  );

  // Memoizza gli elementi Marker: vengono ricostruiti SOLO quando cambia la
  // lista dei POI. Il popup non è più figlio di ogni Marker: prima bastava
  // aprire/chiudere una scheda per ricostruire tutti i ~500 <Marker> (era la
  // causa principale della lentezza di apertura). Ora c'è un unico <Popup>
  // condiviso renderizzato a livello mappa (vedi activePoi più sotto).
  const poiMarkers = useMemo(
    () =>
      markerData.map(({ poi, position, icon }) => (
        <Marker
          key={`marker-${poi.id}`}
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
            click: () => {
              setActivePopupId(poi.id);
              setActivePoi(poi);
              centerMapOnPoi(poi);
            }
          }}
        />
      )),
    [markerData],
  );

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
          <TileLayer
            attribution='&copy; <a href="https://carto.com/attributions">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          />
          <MapController center={center} zoom={mapZoom} />
          <MapEventsHandler onMoveEnd={fetchPois} onCenterChange={onCenterChange} onDragStart={stopFollowMode} />

          {userLocation &&
            typeof userLocation[0] === "number" &&
            typeof userLocation[1] === "number" &&
            Number.isFinite(userLocation[0]) &&
            Number.isFinite(userLocation[1]) && (
              <Marker position={userLocation} icon={userIcon} />
            )}

          {poiMarkers}

          {/* Popup condiviso: uno solo per tutta la mappa. key per poi.id così
              cambiando POI la scheda rimonta pulita (stati e fetch propri). */}
          {activePoi && (
            <Popup
              key={`popup-${activePoi.id}`}
              className="custom-popup"
              minWidth={290}
              maxWidth={290}
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
              />
            </Popup>
          )}

        </MapContainer>
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
            <div
              className={`w-12 h-12 bg-white/60 dark:bg-black/60 backdrop-blur-3xl rounded-full shadow-[0_8px_32px_rgba(0,0,0,0.15)] border border-white/50 dark:border-white/20 flex items-center justify-center cursor-pointer hover:scale-105 active:scale-95 transition-all ${followMode ? 'ring-2 ring-blue-500' : ''}`}
              title={`Orientamento: ${Math.round(mapRotation)}°`}
              onClick={stopFollowMode}
            >
              <svg
                viewBox="0 0 40 40"
                width="36"
                height="36"
                className={followMode ? "animate-pulse-slow" : ""}
                style={{ transform: `rotate(-${mapRotation}deg)`, transition: 'transform 0.3s ease' }}
              >
                <path d="M20 4 L23 20 L20 18 L17 20 Z" fill="#e11d48" />
                <path d="M20 36 L17 20 L20 22 L23 20 Z" fill="#94a3b8" />
                <circle cx="20" cy="20" r="3" fill="#1e3a8a" />
                <text x="20" y="3" textAnchor="middle" fontSize="4" fill="#e11d48" fontWeight="bold">N</text>
              </svg>
            </div>

            <div className="bg-blue-600/80 backdrop-blur-2xl text-white text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full shadow-2xl border border-white/20 flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse inline-block" />
              Follow ON
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
                  {key === "overpass" ? getTranslation("error_map_places", language) : (key === "location" ? getTranslation("error_position", language) : key)}
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
                        ? (language === 'IT' ? "Attiva la posizione GPS per vedere i luoghi attorno a te." : "Enable GPS location to see places around you.")
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
      </AnimatePresence>

      <div
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
            className="px-4 py-2.5 bg-[#1e3a8a] text-white rounded-[1.5rem] font-black text-[11px] shadow-[0_4px_16px_rgba(30,58,138,0.4)] hover:bg-[#123628] transition-all flex items-center justify-center gap-2 group shrink-0"
          >
            <MapPin className="w-4 h-4 fill-white/20" />
            <span className="uppercase tracking-[0.1em]">{getTranslation("find_near", language)}</span>
            <span className="w-4 h-4 bg-[#2c6e54] text-white rounded-full flex items-center justify-center text-[9px] font-black shadow-inner">
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

        <div className="flex-1 relative flex items-center bg-transparent px-3">
          <Search className="w-5 h-5 text-[#1e3a8a] mr-2 shrink-0" />
          <form
            onSubmit={handleSearch}
            className="flex-1 flex items-center"
          >
            <input
              type="text"
              placeholder={getTranslation("search_city_placeholder", language)}
              className="flex-1 bg-transparent py-2 text-base font-bold focus:outline-none text-[#1e3a8a] placeholder:text-[#1e3a8a]/50 w-full"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              role="combobox"
              aria-expanded={displayedSuggestions.length > 0}
              aria-controls="map-search-results"
              aria-autocomplete="list"
              aria-activedescendant={activeSuggestionIdx >= 0 ? `map-sr-${activeSuggestionIdx}` : undefined}
              onBlur={() => setTimeout(() => { setSuggestions([]); setSearchNoResults(false); }, 200)}
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

          <div className="flex items-center gap-0.5 ml-1">
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="p-1 hover:bg-[#fcfaf8]-container rounded-full transition-colors text-[#1e3a8a]"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
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
                className="absolute bottom-full mb-4 left-0 right-0 bg-white/95 dark:bg-[#1C1C1E]/95 backdrop-blur-3xl rounded-[2rem] shadow-[0_16px_64px_rgba(0,0,0,0.2)] border border-white/50 dark:border-white/10 overflow-hidden max-h-[300px] overflow-y-auto overscroll-none select-none touch-pan-y"
              >
                {displayedSuggestions.length === 0 ? (
                  <div className="px-5 py-4 text-[15px] font-bold text-[#1e3a8a]/70 flex items-center gap-3" aria-live="polite">
                    {isSearching
                      ? (<><Loader2 className="w-4 h-4 animate-spin shrink-0" /> {language === 'IT' ? 'Ricerca in corso…' : 'Searching…'}</>)
                      : (language === 'IT' ? `Nessun risultato per "${searchQuery}"` : `No results for "${searchQuery}"`)}
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
                    <div className="mt-0.5 p-1.5 bg-[#fcfaf8]-container rounded-lg group-hover:bg-primary/10 transition-colors shrink-0">
                      <MapPin className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex flex-col flex-1 min-w-0">
                      <span className="font-bold text-[#1e3a8a] text-[15px] leading-tight whitespace-normal break-words">
                        {res.isNominatim || res.isMapbox
                          ? res.description.split(",")[0]
                          : res.structured_formatting?.main_text ||
                            res.description}
                      </span>
                      <span className="text-xs text-[#1e3a8a]/80 leading-snug mt-0.5 whitespace-normal break-words">
                        {res.isNominatim || res.isMapbox
                          ? res.description.split(",").slice(1).join(",").trim() || res.description
                          : res.structured_formatting?.secondary_text ||
                            res.description}
                      </span>
                    </div>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
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
