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

import { getApiUrl } from "./api";

export type BathingQuality = "excellent" | "good" | "sufficient" | "poor" | "unknown";

export interface BathingSite {
  name: string;
  lat: number;
  lon: number;
  quality: BathingQuality;
  /** Stagione balneare della classificazione (annuale) */
  year: number;
  /** Temperatura dell'acqua in °C, dal vivo (NASA JPL MUR via NOAA ERDDAP) */
  temperatura?: number;
  /** Altezza delle onde in metri, dal vivo */
  onde?: number;
}

/**
 * MISURE DAL VIVO PER OGNI SPIAGGIA.
 *
 * La classificazione EEA dice se l'acqua è PULITA, ma è un dato annuale: in
 * spiaggia la domanda vera è "è calda? c'è mare mosso?". La fonte è NASA JPL
 * MUR (temperatura) e WaveWatch III (onde) via l'ERDDAP di NOAA, attraverso il
 * nostro `/api/mare/griglia`: dominio pubblico, nessuna chiave, nessun vincolo
 * d'uso commerciale — a differenza di Open-Meteo Marine, che era la scelta
 * iniziale e che il piano gratuito riserva all'uso non commerciale.
 * Una sola chiamata copre l'intero riquadro: torna una griglia di celle di
 * mare e ogni spiaggia prende la più vicina, invece di una richiesta per
 * spiaggia.
 *
 * Cache separata e corta (1 ora): la pulizia si aggiorna una volta l'anno,
 * la temperatura del mare no.
 */
const MISURE_TTL_MS = 60 * 60 * 1000;

export async function aggiungiMisure(sites: BathingSite[]): Promise<BathingSite[]> {
  if (!sites.length) return sites;
  // Tetto prudente: oltre un centinaio di punti l'URL diventa enorme e le
  // spiagge in vista non sono mai così tante.
  const quanti = Math.min(sites.length, 100);
  const scelte = sites.slice(0, quanti);
  const chiave = `wip_mare_misure_${scelte[0].lat.toFixed(1)}_${scelte[0].lon.toFixed(1)}_${quanti}`;

  let misure: Array<{ t?: number; o?: number }> | null = null;
  try {
    const raw = localStorage.getItem(chiave);
    if (raw) {
      const p = JSON.parse(raw);
      if (p && typeof p.ts === 'number' && Date.now() - p.ts < MISURE_TTL_MS && Array.isArray(p.misure)) {
        misure = p.misure;
      }
    }
  } catch { /* cache corrotta */ }

  if (!misure) {
    try {
      // Una sola chiamata al nostro server copre l'intero riquadro: torna una
      // griglia di celle di mare con la temperatura, e ogni spiaggia prende
      // la più vicina. La fonte è NASA JPL MUR via ERDDAP di NOAA — dominio
      // pubblico, quindi niente vincoli d'uso commerciale (Open-Meteo, che
      // usavamo prima, li ha).
      const lats = scelte.map(s => s.lat), lons = scelte.map(s => s.lon);
      const url = getApiUrl('/api/mare/griglia'
        + `?south=${Math.min(...lats).toFixed(3)}&west=${Math.min(...lons).toFixed(3)}`
        + `&north=${Math.max(...lats).toFixed(3)}&east=${Math.max(...lons).toFixed(3)}`);
      const r = await fetch(url, { signal: AbortSignal.timeout(25000) });
      if (!r.ok) return sites;
      const j = await r.json();
      const celle: Array<{ lat: number; lon: number; t: number }> = Array.isArray(j?.celle) ? j.celle : [];
      const celleOnde: Array<{ lat: number; lon: number; h: number }> = Array.isArray(j?.onde) ? j.onde : [];
      if (!celle.length && !celleOnde.length) return sites;

      /** Cella più vicina entro una soglia, altrimenti niente. */
      const vicina = <T extends { lat: number; lon: number }>(elenco: T[], s: BathingSite, maxKm: number): T | null => {
        let best: { c: T; d: number } | null = null;
        for (const c of elenco) {
          const dLat = (c.lat - s.lat) * 111;
          const dLon = (c.lon - s.lon) * 111 * Math.cos((s.lat * Math.PI) / 180);
          const d = Math.sqrt(dLat * dLat + dLon * dLon);
          if (!best || d < best.d) best = { c, d };
        }
        return best && best.d <= maxKm ? best.c : null;
      };

      misure = scelte.map((s) => {
        // Temperatura: griglia da 1 km, quindi si pretende una cella vicina.
        // Onde: il modello ha celle da 55 km, quindi la soglia è più larga —
        // e nel Mediterraneo semplicemente non ci sono dati.
        const t = vicina(celle, s, 25);
        const o = vicina(celleOnde, s, 60);
        return { ...(t ? { t: t.t } : {}), ...(o ? { o: o.h } : {}) };
      });
      try { localStorage.setItem(chiave, JSON.stringify({ ts: Date.now(), misure })); } catch { /* storage pieno */ }
    } catch {
      return sites; // niente misure: la classificazione da sola vale comunque
    }
  }

  return sites.map((s, i) => (i < quanti && misure![i]
    ? { ...s, temperatura: misure![i].t, onde: misure![i].o }
    : s));
}

/**
 * Stagione balneare da cui partire a cercare.
 *
 * ATTENZIONE — questa costante NON va più aggiornata a mano, ed è importante
 * capire perché: il nome del MapServer dell'EEA è versionato per anno, e i
 * server vecchi vengono RITIRATI. Verificato il 19/08/2026: 2025 e 2024
 * rispondono, 2026 non è ancora pubblicato (404) e **2023 è già sparito**.
 * Con l'anno cablato, il giorno in cui l'EEA ritira il 2025 la funzione
 * smetterebbe di trovare qualsiasi sito — in silenzio, senza errori, come se
 * il mare non fosse balneabile da nessuna parte.
 * Ora l'anno buono si scopre da solo: si prova dall'anno corrente
 * all'indietro e si ricorda quale ha risposto.
 */
export const BATHING_SEASON_YEAR = new Date().getFullYear();

/** Quanti anni indietro provare prima di arrendersi. */
const ANNI_INDIETRO = 3;
const ANNO_KEY = 'wip_bathing_season';
const ANNO_TTL_MS = 7 * 24 * 60 * 60 * 1000; // si ricontrolla una volta a settimana

const serviceUrl = (anno: number) =>
  `https://water.discomap.eea.europa.eu/arcgis/rest/services/BathingWater/BathingWater_Dyna_WM_${anno}/MapServer/14/query`;

/** Anno scoperto in precedenza, se ancora fresco. */
function annoInCache(): number | null {
  try {
    const raw = localStorage.getItem(ANNO_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (typeof p?.anno === 'number' && typeof p?.ts === 'number' && Date.now() - p.ts < ANNO_TTL_MS) return p.anno;
  } catch { /* cache corrotta */ }
  return null;
}
function ricordaAnno(anno: number): void {
  try { localStorage.setItem(ANNO_KEY, JSON.stringify({ anno, ts: Date.now() })); } catch { /* storage pieno */ }
}

/**
 * Qual è l'ultima stagione pubblicata? Si interroga il catalogo del
 * MapServer (una richiesta minuscola) partendo dall'anno corrente.
 * Restituisce null se nessuno degli ultimi anni risponde: a quel punto il
 * servizio EEA è cambiato davvero e va guardato a mano.
 */
async function stagioneDisponibile(): Promise<number | null> {
  const memoria = annoInCache();
  if (memoria) return memoria;
  const partenza = new Date().getFullYear();
  for (let anno = partenza; anno >= partenza - ANNI_INDIETRO; anno--) {
    try {
      const r = await fetch(`${serviceUrl(anno)}?f=json&where=1%3D1&returnCountOnly=true`,
        { signal: AbortSignal.timeout(8000) });
      if (!r.ok) continue;
      const j = await r.json();
      if (j?.error) continue;
      ricordaAnno(anno);
      return anno;
    } catch { /* anno non disponibile: si prova il precedente */ }
  }
  return null;
}

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

  const stagione = await stagioneDisponibile();
  if (stagione === null) {
    throw new Error('Servizio EEA acque di balneazione non raggiungibile per nessuna stagione recente');
  }

  // ── Cache-first: cella di 0,1° (~11 km) sul centro ──
  const key = `wip_bathing_${centerLat.toFixed(1)}_${centerLon.toFixed(1)}`;
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.ts === "number" &&
          Date.now() - parsed.ts < CACHE_TTL_MS &&
          parsed.year === stagione &&
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
    const res = await fetch(`${serviceUrl(stagione)}?${params.toString()}`, { signal: ctrl.signal });
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
      year: stagione,
    });
    if (sites.length >= MAX_SITES) break;
  }

  try {
    localStorage.setItem(key, JSON.stringify({ ts: Date.now(), year: stagione, sites }));
  } catch { /* quota localStorage piena: si vive senza cache */ }

  return sites;
}
