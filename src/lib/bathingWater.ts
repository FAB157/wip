// =====================================================================
// «Si può fare il bagno qui?» — qualità delle acque di balneazione UE
//
// Fonte: dati aperti EEA/WISE Bathing Water (Agenzia Europea dell'Ambiente),
// servizio ArcGIS REST verificato ad ago 2026:
//   https://water.discomap.eea.europa.eu/arcgis/rest/services/BathingWater/
//     BathingWater_Dyna_WM_<anno>/MapServer/14/query
// Il layer 14 ("Bathing water quality (symbol)") espone i siti puntuali con
// bathingWaterName, latitude/longitude e qualityStatus (classificazione
// annuale ex Direttiva 2006/7/CE: Excellent/Good/Sufficient/Poor/Not
// classified). Il server risponde con f=geojson e riflette qualsiasi
// Origin nell'header Access-Control-Allow-Origin → utilizzabile
// direttamente dal browser/WebView, nessun proxy necessario.
//
// COPERTURA: solo Europa (UE + Albania, Svizzera e altri paesi che
// riportano all'EEA). Fuori Europa la query restituisce semplicemente
// 0 siti: il chiamante degrada in silenzio, nessun errore.
//
// Cache: localStorage `wip_bathing_<lat1>_<lon1>` (centro arrotondato a
// 1 decimale), TTL 30 giorni — le classificazioni sono annuali.
// Usato da MapArea per il toggle 🏖: logica pura, niente Leaflet/React.
// =====================================================================

export type BathingQuality = "excellent" | "good" | "sufficient" | "poor" | "unknown";

export interface BathingSite {
  name: string;
  lat: number;
  lon: number;
  quality: BathingQuality;
  /** Stagione balneare della classificazione (annuale) */
  year: number;
}

/**
 * Stagione balneare pubblicata dall'EEA usata dal servizio.
 * Il nome del MapServer è versionato per anno: quando l'EEA pubblica la
 * stagione successiva basta aggiornare questa costante (la cache si
 * invalida da sola perché l'anno è salvato nel payload).
 */
export const BATHING_SEASON_YEAR = 2025;

const SERVICE_URL =
  `https://water.discomap.eea.europa.eu/arcgis/rest/services/BathingWater/BathingWater_Dyna_WM_${BATHING_SEASON_YEAR}/MapServer/14/query`;

/** Tetto siti per chiamata: le coste dense (es. Romagna) ne hanno a centinaia */
const MAX_SITES = 150;
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 giorni
const FETCH_TIMEOUT_MS = 20000;
// Riquadro fisso di query attorno al centro (≈ 110×160 km a 45°N):
// più stabile della viewport ai fini della cache per cella di 0,1°.
const BOX_HALF_LAT = 0.5;
const BOX_HALF_LON = 1.0;

/** Etichette leggibili della classificazione (IT/EN) */
export const BATHING_QUALITY_LABEL: Record<BathingQuality, { it: string; en: string }> = {
  excellent: { it: "Eccellente", en: "Excellent" },
  good: { it: "Buona", en: "Good" },
  sufficient: { it: "Sufficiente", en: "Sufficient" },
  poor: { it: "Scarsa", en: "Poor" },
  unknown: { it: "Non classificata", en: "Not classified" },
};

/** Colore del pallino per classe (stessi toni della legenda EEA) */
export const BATHING_QUALITY_COLOR: Record<BathingQuality, string> = {
  excellent: "#2563eb", // 🔵
  good: "#16a34a",      // 🟢
  sufficient: "#eab308",// 🟡
  poor: "#dc2626",      // 🔴
  unknown: "#9ca3af",   // ⚪
};

function normalizeQuality(raw: unknown): BathingQuality {
  const s = String(raw ?? "").trim().toLowerCase();
  if (s === "excellent") return "excellent";
  if (s === "good") return "good";
  if (s === "sufficient") return "sufficient";
  if (s === "poor") return "poor";
  return "unknown"; // "Not classified", campi vuoti, valori futuri
}

interface MapBounds { south: number; west: number; north: number; east: number; }

/**
 * Siti di balneazione EEA attorno al centro dei bounds dati.
 * Cache-first (localStorage, TTL 30 giorni, invalidata al cambio stagione).
 * Fuori Europa restituisce [] senza errore (il server risponde 0 feature);
 * lancia solo se la rete/il servizio EEA falliscono davvero — il chiamante
 * decide come degradare.
 */
export async function fetchBathingSites(bounds: MapBounds): Promise<BathingSite[]> {
  const centerLat = (bounds.south + bounds.north) / 2;
  const centerLon = (bounds.west + bounds.east) / 2;

  // ── Cache-first: cella di 0,1° (~11 km) sul centro ──
  const key = `wip_bathing_${centerLat.toFixed(1)}_${centerLon.toFixed(1)}`;
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.ts === "number" &&
          Date.now() - parsed.ts < CACHE_TTL_MS &&
          parsed.year === BATHING_SEASON_YEAR &&
          Array.isArray(parsed.sites)) {
        return parsed.sites as BathingSite[];
      }
    }
  } catch { /* cache corrotta: si rifà la query */ }

  // ── Query ArcGIS: envelope fisso attorno al centro, GeoJSON, no geometrie
  // (le coordinate arrivano già come attributi latitude/longitude) ──
  const envelope = [
    (centerLon - BOX_HALF_LON).toFixed(4),
    (centerLat - BOX_HALF_LAT).toFixed(4),
    (centerLon + BOX_HALF_LON).toFixed(4),
    (centerLat + BOX_HALF_LAT).toFixed(4),
  ].join(",");

  const params = new URLSearchParams({
    f: "geojson",
    where: "1=1",
    geometry: envelope,
    geometryType: "esriGeometryEnvelope",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: "bathingWaterName,qualityStatus,latitude,longitude",
    returnGeometry: "false",
    resultRecordCount: String(MAX_SITES),
  });

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  let data: any;
  try {
    const res = await fetch(`${SERVICE_URL}?${params.toString()}`, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`EEA HTTP ${res.status}`);
    data = await res.json();
  } finally {
    clearTimeout(timer);
  }
  // ArcGIS può rispondere 200 con {error:{...}} anche in modalità geojson
  if (data?.error) throw new Error(`EEA ArcGIS: ${data.error.message || "errore servizio"}`);

  const sites: BathingSite[] = [];
  for (const f of (data?.features || [])) {
    const p = f?.properties;
    if (!p || typeof p.latitude !== "number" || typeof p.longitude !== "number") continue;
    sites.push({
      name: String(p.bathingWaterName || "").trim() || "—",
      lat: p.latitude,
      lon: p.longitude,
      quality: normalizeQuality(p.qualityStatus),
      year: BATHING_SEASON_YEAR,
    });
    if (sites.length >= MAX_SITES) break;
  }

  try {
    localStorage.setItem(key, JSON.stringify({ ts: Date.now(), year: BATHING_SEASON_YEAR, sites }));
  } catch { /* quota localStorage piena: si vive senza cache */ }

  return sites;
}
