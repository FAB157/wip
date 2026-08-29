// =====================================================================
// Layer servizi pratici (fontanelle, bagni pubblici, panchine)
// Interroga Overpass attorno al centro mappa (raggio 2 km) con cache
// localStorage 24h per cella di ~1 km (2 decimali). Usato da MapArea
// per il toggle 🚰: logica pura, nessuna dipendenza da Leaflet/React.
// =====================================================================

import { getApiUrl } from "./api";

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

  // ── Prima il nostro database ──
  // 390.815 fontanelle e 17.858 bagni sono già importati in `utility_pois`
  // da OSM (via QLever) e coprono tutto il mondo. Leggerli da lì è la
  // differenza fra un layer che funziona sempre e uno che dipende da
  // Overpass — che il 19/08/2026 era irraggiungibile da cinque mirror su
  // cinque, e dal server Vercel non risponde mai.
  try {
    const { supabase } = await import('./supabase');
    const gLat = RADIUS_M / 111000; // gradi di latitudine per il raggio
    // In longitudine i gradi si accorciano col coseno: a Oslo un riquadro
    // uguale in gradi sarebbe la meta` in metri.
    const gLon = gLat / Math.max(0.2, Math.cos((lat * Math.PI) / 180));
    const tipoDa: Record<string, ServiceType> = { fontanella: 'drinking_water', bagni_pubblici: 'toilets' };
    // UNA QUERY PER TIPO, CIASCUNA COL SUO TETTO (29/08/2026, collaudo: «i
    // bagni non sono mostrati»). Prima era una sola query da 180 righe senza
    // distinzione: in citta` entro 2 km ci sono centinaia di fontanelle, che
    // riempivano le 180 righe da sole, e i bagni non entravano mai.
    const risposte = await Promise.all(Object.keys(tipoDa).map((sub) => supabase
      .from('utility_pois')
      .select('id,name,lat,lon,sub_category')
      .eq('sub_category', sub)
      .gte('lat', lat - gLat).lte('lat', lat + gLat)
      .gte('lon', lon - gLon).lte('lon', lon + gLon)
      .limit(MAX_PER_TYPE)));
    const punti: ServicePoint[] = risposte
      .flatMap((r: any) => (r?.data || []))
      .map((p: any) => ({
        id: `svc-${p.id}`,
        type: tipoDa[String(p.sub_category)] as ServiceType,
        lat: Number(p.lat), lon: Number(p.lon),
        name: p.name || undefined,
      }))
      .filter((p) => p.type && isFinite(p.lat) && isFinite(p.lon));
    if (punti.length) {
      // LE PANCHINE NON SONO NEL DATABASE (non sono mai state importate: in
      // citta` sono decine di migliaia). Si chiedono a Overpass IN AGGIUNTA,
      // con un timeout corto e in silenzio: se risponde compaiono, se non
      // risponde fontanelle e bagni si vedono lo stesso. Prima, trovato
      // qualcosa nel database, non si chiedeva piu` niente a nessuno — e le
      // panchine dell'icona 🪑 non comparivano mai.
      try {
        const q = `[out:json][timeout:8];nwr["amenity"="bench"](around:${RADIUS_M},${lat},${lon});out center ${MAX_PER_TYPE};`;
        const res = await fetch(OVERPASS_ENDPOINTS[0], {
          method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: `data=${encodeURIComponent(q)}`, signal: AbortSignal.timeout(8000),
        });
        if (res.ok) {
          const j = await res.json();
          for (const el of (j.elements || []).slice(0, MAX_PER_TYPE)) {
            const eLat = typeof el.lat === "number" ? el.lat : el.center?.lat;
            const eLon = typeof el.lon === "number" ? el.lon : el.center?.lon;
            if (typeof eLat === "number" && typeof eLon === "number") {
              punti.push({ id: `svc-${el.type}-${el.id}`, type: "bench", lat: eLat, lon: eLon, name: el.tags?.name || undefined });
            }
          }
        }
      } catch { /* niente panchine stavolta: il resto del layer non ne risente */ }
      try { localStorage.setItem(key, JSON.stringify({ ts: Date.now(), points: punti })); } catch {}
      return punti;
    }
  } catch { /* database non raggiungibile: si tenta il server, poi Overpass */ }

  // ── Poi il nostro server (che a sua volta ha una cache di Overpass) ──
  try {
    const r = await fetch(getApiUrl(`/api/services/nearby?lat=${lat}&lon=${lon}&radius=${RADIUS_M}`),
      { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (r.ok) {
      const j = await r.json();
      if (Array.isArray(j?.punti)) {
        const punti: ServicePoint[] = j.punti
          .filter((p: any) => p && ['drinking_water', 'toilets', 'bench'].includes(p.type))
          .map((p: any) => ({ id: `svc-${p.id}`, type: p.type, lat: p.lat, lon: p.lon, name: p.name }));
        try { localStorage.setItem(key, JSON.stringify({ ts: Date.now(), points: punti })); } catch {}
        return punti;
      }
    }
  } catch { /* il server non risponde: si tenta Overpass direttamente */ }

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
