// =====================================================================
// Layer servizi pratici (fontanelle, bagni pubblici, panchine)
// Interroga Overpass attorno al centro mappa (raggio 2 km) con cache
// localStorage 24h per cella di ~1 km (2 decimali). Usato da MapArea
// per il toggle 🚰: logica pura, nessuna dipendenza da Leaflet/React.
// =====================================================================

export type ServiceType = "drinking_water" | "toilets" | "bench";

export interface ServicePoint {
  id: string;
  type: ServiceType;
  lat: number;
  lon: number;
  name?: string;
}

export const SERVICE_EMOJI: Record<ServiceType, string> = {
  drinking_water: "💧",
  toilets: "🚻",
  bench: "🪑",
};

export const SERVICE_LABEL: Record<ServiceType, string> = {
  drinking_water: "Fontanella",
  toilets: "Bagni pubblici",
  bench: "Panchina",
};

const RADIUS_M = 2000;          // raggio massimo di ricerca
const MAX_PER_TYPE = 60;        // tetto per tipo: le panchine in città sono migliaia
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const FETCH_TIMEOUT_MS = 20000;

// Endpoint primario + fallback (stessi mirror già usati dal fetch POI di MapArea)
const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

function cacheKey(lat: number, lon: number): string {
  // 2 decimali ≈ celle di ~1.1 km: query vicine riusano la stessa cache
  return `wip_services_${lat.toFixed(2)}_${lon.toFixed(2)}`;
}

/**
 * Restituisce fontanelle/bagni/panchine entro 2 km dal punto dato.
 * Cache-first (localStorage, TTL 24h); lancia se TUTTI gli endpoint
 * Overpass falliscono — il chiamante decide come degradare (toast + toggle off).
 */
export async function fetchServicesAround(lat: number, lon: number): Promise<ServicePoint[]> {
  // ── Cache-first ──
  const key = cacheKey(lat, lon);
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.ts === "number" && Date.now() - parsed.ts < CACHE_TTL_MS && Array.isArray(parsed.points)) {
        return parsed.points as ServicePoint[];
      }
    }
  } catch { /* cache corrotta: si rifà la query */ }

  const query = `[out:json][timeout:20];
(
  nwr["amenity"="drinking_water"](around:${RADIUS_M},${lat},${lon});
  nwr["amenity"="toilets"](around:${RADIUS_M},${lat},${lon});
  nwr["amenity"="bench"](around:${RADIUS_M},${lat},${lon});
);
out center ${MAX_PER_TYPE * 3 * 2};`;

  let data: any = null;
  let lastError: any = null;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `data=${encodeURIComponent(query)}`,
        signal: ctrl.signal,
      });
      if (res.ok) {
        data = await res.json();
        break;
      }
      lastError = new Error(`Overpass HTTP ${res.status}`);
    } catch (e) {
      lastError = e;
    } finally {
      clearTimeout(timer);
    }
  }

  if (!data) {
    throw new Error("Overpass non raggiungibile (servizi): " + (lastError?.message || "errore sconosciuto"));
  }

  // ── Parsing con tetto per tipo ──
  const byType: Record<ServiceType, ServicePoint[]> = {
    drinking_water: [],
    toilets: [],
    bench: [],
  };

  for (const el of (data.elements || [])) {
    const eLat = typeof el.lat === "number" ? el.lat : el.center?.lat;
    const eLon = typeof el.lon === "number" ? el.lon : el.center?.lon;
    if (typeof eLat !== "number" || typeof eLon !== "number") continue;
    const amenity = el.tags?.amenity as ServiceType | undefined;
    if (amenity !== "drinking_water" && amenity !== "toilets" && amenity !== "bench") continue;
    if (byType[amenity].length >= MAX_PER_TYPE) continue;
    byType[amenity].push({
      id: `svc-${el.type}-${el.id}`,
      type: amenity,
      lat: eLat,
      lon: eLon,
      name: el.tags?.name || undefined,
    });
  }

  const points = [...byType.drinking_water, ...byType.toilets, ...byType.bench];

  try {
    localStorage.setItem(key, JSON.stringify({ ts: Date.now(), points }));
  } catch { /* quota localStorage piena: si vive senza cache */ }

  return points;
}
