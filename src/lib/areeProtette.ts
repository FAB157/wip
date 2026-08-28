// =====================================================================
// Aree protette d'Europa — Natura 2000 + aree nazionali (CDDA), dall'EEA
//
// Fonte: Agenzia Europea dell'Ambiente, servizi ArcGIS REST verificati il
// 27/08/2026 (CORS aperto: il server riflette qualsiasi Origin, si chiama
// dal browser/WebView senza proxy, come per le acque di balneazione):
//   ProtectedSites/Natura2000_Dyna_WM/MapServer/4  siti habitat (SIC/ZSC)
//   ProtectedSites/Natura2000_Dyna_WM/MapServer/8  zone uccelli (ZPS)
//   ProtectedSites/CDDAv21_Dyna_WM/MapServer/4     aree designate nazionali
// I layer 1 e 5 di Natura 2000 sono GRUPPI e non si interrogano: la query
// va sui sottolayer "Scale above 1:100,000". Un sito SITETYPE=C sta in
// entrambi i layer: si deduplica per SITECODE.
//
// Licenza: riuso libero anche commerciale con attribuzione (CC BY 4.0,
// legal notice EEA). Per la CDDA alcuni paesi limitano la diffusione dei
// confini: si chiedono SOLO i record con spatialDataDissemination='public',
// il resto non si scarica nemmeno.
//
// Geometrie: con maxAllowableOffset il server semplifica i poligoni prima
// di spedirli (misurato: 168 KB → 17 KB per 23 siti attorno a Trento).
// Un'area protetta è un confine, non un pin: a zoom 9-11 basta ±50 m, da
// 12 in su ±10 m. Cache in memoria per cella; localStorage solo come
// riserva, con tetto, perché i poligoni pesano.
//
// Copertura: solo Europa (UE + paesi che riportano all'EEA). Fuori arrivano
// 0 feature, in silenzio.
// =====================================================================

export type TipoArea = 'n2k_habitat' | 'n2k_uccelli' | 'nazionale';

export interface AreaProtetta {
  id: string;
  nome: string;
  tipo: TipoArea;
  /** Codice sito Natura 2000 (IT3120015…) o id CDDA */
  codice: string;
  kmq: number | null;
  /** Solo CDDA: categoria IUCN (Ia, II, IV…) e tipo di designazione */
  iucn?: string | null;
  designazione?: string | null;
  paese?: string | null;
  /** GeoJSON Polygon/MultiPolygon in WGS84, già semplificato dal server */
  geometry: any;
}

interface MapBounds { south: number; west: number; north: number; east: number; }

const BASE = 'https://bio.discomap.eea.europa.eu/arcgis/rest/services/ProtectedSites';
const FETCH_TIMEOUT_MS = 25000;
const MAX_PER_LAYER = 120;
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
// Riquadro fisso attorno al centro: più stabile della viewport ai fini
// della cache (una cella = una risposta), ~55×70 km a 45°N.
const BOX_HALF_LAT = 0.25;
const BOX_HALF_LON = 0.45;
const MAX_CELLE_LOCALSTORAGE = 12;

export const COLORE_AREA: Record<TipoArea, string> = {
  n2k_habitat: '#15803d', // verde
  n2k_uccelli: '#0e7490', // verde-azzurro
  nazionale: '#b45309',   // ambra
};

/** Scheda ufficiale del sito Natura 2000 (Standard Data Form dell'EEA) */
export const schedaNatura2000 = (codice: string) =>
  `https://natura2000.eea.europa.eu/Natura2000/SDF.aspx?site=${encodeURIComponent(codice)}`;

const memoria = new Map<string, { ts: number; aree: AreaProtetta[] }>();

function chiaveCella(lat: number, lon: number, fine: boolean) {
  return `wip_aree_${lat.toFixed(1)}_${lon.toFixed(1)}_${fine ? 'f' : 'g'}`;
}

function daLocalStorage(chiave: string): AreaProtetta[] | null {
  try {
    const raw = localStorage.getItem(chiave);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (p && typeof p.ts === 'number' && Date.now() - p.ts < CACHE_TTL_MS && Array.isArray(p.aree)) return p.aree;
  } catch { /* cache corrotta */ }
  return null;
}

function inLocalStorage(chiave: string, aree: AreaProtetta[]) {
  try {
    // Tetto alle celle salvate: i poligoni pesano e localStorage è piccolo.
    const indiceKey = 'wip_aree_celle';
    let celle: string[] = [];
    try { celle = JSON.parse(localStorage.getItem(indiceKey) || '[]'); } catch { celle = []; }
    celle = celle.filter((c) => c !== chiave);
    celle.push(chiave);
    while (celle.length > MAX_CELLE_LOCALSTORAGE) {
      const vecchia = celle.shift();
      if (vecchia) localStorage.removeItem(vecchia);
    }
    localStorage.setItem(chiave, JSON.stringify({ ts: Date.now(), aree }));
    localStorage.setItem(indiceKey, JSON.stringify(celle));
  } catch { /* quota piena: si vive con la cache in memoria */ }
}

async function interroga(url: string, params: Record<string, string>): Promise<any[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${url}?${new URLSearchParams(params).toString()}`, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`EEA HTTP ${res.status}`);
    const data = await res.json();
    // ArcGIS può rispondere 200 con {error:{...}} anche in modalità geojson
    if (data?.error) throw new Error(`EEA ArcGIS: ${data.error.message || 'errore servizio'}`);
    return Array.isArray(data?.features) ? data.features : [];
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Aree protette attorno al centro dei bounds. `fine` = geometrie a ±10 m
 * (zoom ≥ 12), altrimenti ±50 m. Lancia solo se TUTTE le fonti falliscono:
 * se cade la CDDA ma Natura 2000 risponde, si mostra quello che c'è.
 */
export async function fetchAreeProtette(bounds: MapBounds, fine: boolean): Promise<AreaProtetta[]> {
  const centerLat = (bounds.south + bounds.north) / 2;
  const centerLon = (bounds.west + bounds.east) / 2;
  const chiave = chiaveCella(centerLat, centerLon, fine);

  const m = memoria.get(chiave);
  if (m && Date.now() - m.ts < CACHE_TTL_MS) return m.aree;
  const ls = daLocalStorage(chiave);
  if (ls) { memoria.set(chiave, { ts: Date.now(), aree: ls }); return ls; }

  const envelope = [
    (centerLon - BOX_HALF_LON).toFixed(4), (centerLat - BOX_HALF_LAT).toFixed(4),
    (centerLon + BOX_HALF_LON).toFixed(4), (centerLat + BOX_HALF_LAT).toFixed(4),
  ].join(',');
  const comuni = {
    f: 'geojson', geometry: envelope, geometryType: 'esriGeometryEnvelope', inSR: '4326', outSR: '4326',
    spatialRel: 'esriSpatialRelIntersects', returnGeometry: 'true', geometryPrecision: '4',
    maxAllowableOffset: fine ? '0.0001' : '0.0005', resultRecordCount: String(MAX_PER_LAYER),
  };

  const [habitat, uccelli, nazionali] = await Promise.allSettled([
    interroga(`${BASE}/Natura2000_Dyna_WM/MapServer/4/query`, { ...comuni, where: '1=1', outFields: 'SITECODE,SITENAME,SITETYPE,Area_km2' }),
    interroga(`${BASE}/Natura2000_Dyna_WM/MapServer/8/query`, { ...comuni, where: '1=1', outFields: 'SITECODE,SITENAME,SITETYPE,Area_km2' }),
    interroga(`${BASE}/CDDAv21_Dyna_WM/MapServer/4/query`, {
      ...comuni, where: "spatialDataDissemination='public'",
      outFields: 'cddaId,siteName,designatedAreaType,iucnCategory,cddaCountryCode,siteArea',
    }),
  ]);
  if (habitat.status === 'rejected' && uccelli.status === 'rejected' && nazionali.status === 'rejected') {
    throw new Error(`EEA aree protette non raggiungibile: ${(habitat as PromiseRejectedResult).reason?.message || ''}`);
  }

  const aree: AreaProtetta[] = [];
  const visti = new Set<string>();
  const n2k = (features: any[], tipoDefault: TipoArea) => {
    for (const f of features) {
      const p = f?.properties || {};
      const codice = String(p.SITECODE || '').trim();
      if (!codice || visti.has(`n2k:${codice}`) || !f.geometry) continue;
      visti.add(`n2k:${codice}`);
      // SITETYPE: A = solo ZPS, B = solo SIC/ZSC, C = entrambi
      const st = String(p.SITETYPE || '').toUpperCase();
      const tipo: TipoArea = st === 'A' ? 'n2k_uccelli' : st === 'B' ? 'n2k_habitat' : tipoDefault;
      aree.push({
        id: `n2k-${codice}`, nome: String(p.SITENAME || '').trim() || codice, tipo, codice,
        kmq: Number.isFinite(Number(p.Area_km2)) ? Math.round(Number(p.Area_km2) * 10) / 10 : null,
        paese: codice.slice(0, 2), geometry: f.geometry,
      });
    }
  };
  if (habitat.status === 'fulfilled') n2k(habitat.value, 'n2k_habitat');
  if (uccelli.status === 'fulfilled') n2k(uccelli.value, 'n2k_uccelli');
  if (nazionali.status === 'fulfilled') {
    for (const f of nazionali.value) {
      const p = f?.properties || {};
      const codice = String(p.cddaId ?? '').trim();
      if (!codice || visti.has(`cdda:${codice}`) || !f.geometry) continue;
      visti.add(`cdda:${codice}`);
      aree.push({
        id: `cdda-${codice}`, nome: String(p.siteName || '').trim() || codice, tipo: 'nazionale', codice,
        // siteArea è in ettari
        kmq: Number.isFinite(Number(p.siteArea)) ? Math.round(Number(p.siteArea) / 10) / 10 : null,
        iucn: p.iucnCategory ? String(p.iucnCategory) : null,
        designazione: p.designatedAreaType ? String(p.designatedAreaType) : null,
        paese: p.cddaCountryCode ? String(p.cddaCountryCode) : null,
        geometry: f.geometry,
      });
    }
  }

  memoria.set(chiave, { ts: Date.now(), aree });
  inLocalStorage(chiave, aree);
  return aree;
}
