// =====================================================================
// WIP · Verticali tematici (21/08/2026) — accesso ai cataloghi
//
// Gli 8 temi (terme, cinema, cieli, street art, mercati, fioriture,
// memoria, viaggio lento) hanno un catalogo curato in
// `src/data/tematici/<key>.json`. Sono file grossi e servono solo a chi
// apre la sheet: qui si caricano SEMPRE in modo dinamico (un chunk per
// tema) e si tengono in una cache di modulo, così il secondo giro è
// istantaneo e il bundle principale non li vede nemmeno.
//
// Perché `import.meta.glob` e non `await import(\`...${key}.json\`)`:
// il plugin dynamic-import-vars di Vite RISOLVE il template a build time
// e, se la cartella è vuota o non esiste ancora (i cataloghi arrivano da
// una pipeline separata), fa fallire la build. `import.meta.glob` in quel
// caso restituisce semplicemente una mappa vuota — assenza gestita senza
// errori, che è il requisito. Il risultato compilato è identico: un
// `import()` pigro per file.
// =====================================================================
import type { ThematicKey } from './thematicDescriptors';

export type { ThematicKey } from './thematicDescriptors';

/** Una voce del catalogo compatto `src/data/tematici/<key>.json`. */
export interface ThematicPlace {
  /** `<key>-<cc>-<slug>`: lo stesso id con cui il luogo entra in shared_pois. */
  id: string;
  name: string;
  /** Uno dei poi_type ammessi per il tema (vedi TEMATICI_TYPE_LABELS). */
  type: string;
  /** ISO2 maiuscolo. */
  country: string;
  region?: string;
  city?: string;
  lat: number;
  lon: number;
  /** Una riga su cosa si vede (finisce in description_short). */
  highlights?: string;
  /** Quando conviene andarci, in parole ("da maggio a settembre"). */
  best_time?: string;
  url?: string;
  /** Fama 1-5: ordina la vista "Nel mondo". */
  fame?: number;
  /** Campi propri del verticale (temperatura acqua, Bortle, artisti…). */
  extra?: Record<string, any>;
}

/** Un luogo del catalogo con il tema di provenienza e la distanza calcolata. */
export interface ThematicPlaceNear extends ThematicPlace {
  key: ThematicKey;
  distanza_km: number;
}

/** Ordine delle chip nella sheet: dal tema più "da subito" al più lento. */
export const TEMATICI_KEYS: ThematicKey[] = [
  'terme', 'cinema', 'cieli', 'street_art', 'mercati', 'fioriture', 'memoria', 'lento',
];

export const TEMATICI_META: Record<ThematicKey, { emoji: string; label: string; labelKey: string; colore: string }> = {
  terme:      { emoji: '🛁',  label: 'Terme e sorgenti',        labelKey: 'terme',      colore: '#0ea5e9' },
  cinema:     { emoji: '🎬',  label: 'Location di film e serie', labelKey: 'cinema',     colore: '#7c3aed' },
  cieli:      { emoji: '🌌',  label: 'Cieli bui e stelle',       labelKey: 'cieli',      colore: '#312e81' },
  street_art: { emoji: '🎨',  label: 'Street art',               labelKey: 'street_art', colore: '#ec4899' },
  mercati:    { emoji: '🛍️', label: 'Mercati e mercatini',      labelKey: 'mercati',    colore: '#f59e0b' },
  fioriture:  { emoji: '🌸',  label: 'Fioriture',                labelKey: 'fioriture',  colore: '#f472b6' },
  memoria:    { emoji: '🕯️', label: 'Memoria e case-museo',     labelKey: 'memoria',    colore: '#57534e' },
  lento:      { emoji: '🚂',  label: 'Viaggio lento',            labelKey: 'lento',      colore: '#16a34a' },
};

/** Etichetta leggibile di ogni poi_type dei cataloghi (chiave DB → italiano). */
export const TEMATICI_TYPE_LABELS: Record<string, string> = {
  // terme 🛁
  hot_spring: 'Sorgente termale',
  thermal_town: 'Città termale',
  historic_bath: 'Bagno storico',
  spa_resort: 'Centro termale',
  thermal_park: 'Parco termale',
  onsen: 'Onsen',
  hammam: 'Hammam',
  sauna: 'Sauna',
  mud_spa: 'Fanghi termali',
  thermal_lake: 'Lago termale',
  // cinema 🎬
  film_location: 'Set cinematografico',
  series_location: 'Set di una serie',
  studio_tour: 'Studios visitabili',
  cinema_museum: 'Museo del cinema',
  festival_venue: 'Sede di un festival',
  // cieli 🌌
  dark_sky_park: 'Parco del cielo buio',
  dark_sky_reserve: 'Riserva del cielo buio',
  dark_sky_community: 'Comunità del cielo buio',
  stargazing_spot: 'Punto per osservare le stelle',
  observatory: 'Osservatorio astronomico',
  planetarium: 'Planetario',
  aurora_spot: 'Punto per l\'aurora',
  astro_village: 'Borgo astronomico',
  // street art 🎨
  mural: 'Murale',
  street_art_district: 'Quartiere di street art',
  open_air_museum: 'Museo a cielo aperto',
  graffiti_hall_of_fame: 'Muro libero dei graffiti',
  sculpture_trail: 'Percorso di sculture',
  festival_site: 'Sede del festival',
  street_art_museum: 'Museo di street art',
  // mercati 🛍️
  christmas_market: 'Mercatino di Natale',
  flea_market: 'Mercato delle pulci',
  antiques_market: 'Mercato dell\'antiquariato',
  food_market: 'Mercato alimentare',
  craft_market: 'Mercato dell\'artigianato',
  night_market: 'Mercato notturno',
  floating_market: 'Mercato galleggiante',
  historic_market_hall: 'Mercato coperto storico',
  // fioriture 🌸
  cherry_blossom: 'Fioritura dei ciliegi',
  lavender: 'Fioritura della lavanda',
  tulips: 'Fioritura dei tulipani',
  wisteria: 'Fioritura del glicine',
  sunflowers: 'Campi di girasoli',
  foliage: 'Foliage d\'autunno',
  almond_blossom: 'Fioritura dei mandorli',
  rhododendron: 'Fioritura dei rododendri',
  wildflowers: 'Fiori spontanei',
  botanical_garden: 'Giardino botanico',
  // memoria 🕯️
  monumental_cemetery: 'Cimitero monumentale',
  war_memorial: 'Memoriale di guerra',
  house_museum: 'Casa-museo',
  birthplace: 'Casa natale',
  grave_of_notable: 'Tomba di un personaggio',
  memorial_site: 'Luogo della memoria',
  mausoleum: 'Mausoleo',
  // viaggio lento 🚂
  scenic_railway: 'Treno panoramico',
  heritage_railway: 'Ferrovia storica',
  cable_car: 'Funivia',
  funicular: 'Funicolare',
  scenic_ferry: 'Traghetto panoramico',
  cycle_route: 'Ciclovia',
  canal_boat: 'Battello sul canale',
  scenic_road: 'Strada panoramica',
};

/** Etichetta del tipo, con l'ultima spiaggia leggibile (snake_case → parole). */
export function etichettaTipo(type?: string): string {
  if (!type) return '';
  return TEMATICI_TYPE_LABELS[type] || String(type).replace(/_/g, ' ');
}

/** I temi che hanno senso filtrare per "Gratis / Con biglietto". */
export const TEMATICI_CON_ACCESSO: ThematicKey[] = ['terme', 'cieli'];

/** I temi che esistono solo in certi mesi: la sheet accende "Solo in stagione". */
export const TEMATICI_STAGIONALI: ThematicKey[] = ['mercati', 'fioriture'];

// ── Cataloghi ────────────────────────────────────────────────────────
// Mappa "percorso → funzione che importa il file". Vuota finché la
// cartella non esiste: nessun errore, né in build né a runtime.
const CATALOGHI = import.meta.glob('../data/tematici/*.json') as Record<string, () => Promise<any>>;

const cache = new Map<ThematicKey, ThematicPlace[]>();

/** Normalizza una voce grezza del JSON: coordinate numeriche, campi stringa. */
function normalizza(v: any): ThematicPlace | null {
  const lat = Number(v?.lat);
  const lon = Number(v?.lon);
  if (!v?.name || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return {
    id: String(v.id || `${v.name}-${lat.toFixed(3)}-${lon.toFixed(3)}`),
    name: String(v.name),
    type: String(v.type || ''),
    country: String(v.country || '').toUpperCase(),
    region: v.region ? String(v.region) : undefined,
    city: v.city ? String(v.city) : undefined,
    lat,
    lon,
    highlights: v.highlights ? String(v.highlights) : undefined,
    best_time: v.best_time ? String(v.best_time) : undefined,
    url: v.url ? String(v.url) : undefined,
    fame: Number.isFinite(Number(v.fame)) ? Number(v.fame) : undefined,
    extra: v.extra && typeof v.extra === 'object' ? v.extra : undefined,
  };
}

/**
 * Carica (una volta sola) il catalogo di un tema.
 * Catalogo assente o malformato → `[]`, mai un'eccezione.
 */
export async function loadTematico(key: ThematicKey): Promise<ThematicPlace[]> {
  const inCache = cache.get(key);
  if (inCache) return inCache;
  let voci: ThematicPlace[] = [];
  try {
    const loader = CATALOGHI[`../data/tematici/${key}.json`];
    if (loader) {
      const mod: any = await loader();
      const raw = Array.isArray(mod?.default) ? mod.default : Array.isArray(mod) ? mod : [];
      voci = raw.map(normalizza).filter(Boolean) as ThematicPlace[];
    }
  } catch (e) {
    // Catalogo non ancora generato: la sheet mostra lo stato vuoto.
    console.warn(`[tematici] catalogo "${key}" non disponibile`, e);
    voci = [];
  }
  cache.set(key, voci);
  return voci;
}

/** Carica più cataloghi in parallelo (usata dalla vista "Vicino a me"). */
export async function loadTematici(keys: ThematicKey[] = TEMATICI_KEYS): Promise<Map<ThematicKey, ThematicPlace[]>> {
  const out = new Map<ThematicKey, ThematicPlace[]>();
  await Promise.all(keys.map(async (k) => { out.set(k, await loadTematico(k)); }));
  return out;
}

/** Haversine in km (locale: questo modulo non deve dipendere dalla mappa). */
export function distanzaKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * I luoghi tematici entro `raggioKm` da un punto, dal più vicino.
 * `keys` assente = tutti e otto i temi.
 */
export async function tematiciNear(
  lat: number,
  lon: number,
  raggioKm = 200,
  keys: ThematicKey[] = TEMATICI_KEYS,
): Promise<ThematicPlaceNear[]> {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return [];
  const cataloghi = await loadTematici(keys);
  const out: ThematicPlaceNear[] = [];
  for (const [key, voci] of cataloghi) {
    for (const p of voci) {
      const d = distanzaKm(lat, lon, p.lat, p.lon);
      if (d <= raggioKm) out.push({ ...p, key, distanza_km: d });
    }
  }
  return out.sort((a, b) => a.distanza_km - b.distanza_km);
}

/**
 * I mesi (1-12) in cui il luogo ha senso.
 * Legge `extra.months`; in mancanza ricava l'intervallo da
 * `extra.season_from`/`extra.season_to` (gestendo lo scavalco d'anno,
 * es. mercatini 11 → 1). Array vuoto = tutto l'anno.
 */
export function mesiAttivi(p: ThematicPlace): number[] {
  const e = p?.extra || {};
  const grezzi = Array.isArray(e.months) ? e.months : [];
  const mesi = grezzi
    .map((m: any) => Number(m))
    .filter((m: number) => Number.isInteger(m) && m >= 1 && m <= 12);
  if (mesi.length) return [...new Set<number>(mesi)].sort((a, b) => a - b);

  const da = Number(e.season_from);
  const a = Number(e.season_to);
  if (Number.isInteger(da) && da >= 1 && da <= 12 && Number.isInteger(a) && a >= 1 && a <= 12) {
    const out: number[] = [];
    let m = da;
    for (let i = 0; i < 12; i++) {
      out.push(m);
      if (m === a) break;
      m = m === 12 ? 1 : m + 1;
    }
    return out;
  }
  return [];
}

/** True se il luogo è "in stagione" nel mese dato (nessun mese = sempre). */
export function isInStagione(p: ThematicPlace, mese: number = new Date().getMonth() + 1): boolean {
  const mesi = mesiAttivi(p);
  return mesi.length === 0 || mesi.includes(mese);
}

/** "gen, feb, mar" per i badge stagionali. */
export const MESI_BREVI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];

export function etichettaMesi(mesi: number[]): string {
  return mesi.map((m) => MESI_BREVI[m - 1] || String(m)).join(', ');
}
