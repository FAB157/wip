// =====================================================================
// ITAINTA · mapboxRouter.ts
//
// PRINCIPIO FONDAMENTALE:
//   Le distanze usate per alert e trigger del geofencing sono SEMPRE
//   distanze stradali calcolate da Mapbox Directions API.
//   ─ driving : tiene conto di strade, sensi unici, edifici, ecc.
//   ─ walking  : tiene conto di marciapiedi, pedonali, passaggi, ecc.
//
//   L'Haversine (linea d'aria) è usato SOLO come pre-filtro per
//   evitare chiamate Mapbox quando il POI è palesemente troppo lontano
//   (> 3× il raggio di alert). Non viene mai confrontato con le soglie.
//
// CACHE E THROTTLE:
//   - Cache per modalità: la stessa route è riusata per 3s (piedi) / 2s (auto)
//   - Richieste duplicate collassate (pendingRequests)
//   - Timeout 4s per evitare blocchi
// =====================================================================

export interface LatLon {
  lat: number;
  lon: number;
}

export type MapboxMode = 'walking' | 'driving';

export interface NavStep {
  distance: number;      // metri
  instruction: string;   // es. "Gira a destra in Via Roma"
  type: string;          // "turn" | "depart" | "arrive" | ...
  modifier?: string;     // "right" | "left" | "straight" | ...
}

export interface MapboxRouteResult {
  distance: number;      // distanza stradale totale in metri
  duration: number;      // durata stimata in secondi
  steps: NavStep[];      // istruzioni turn-by-turn
}

interface CacheEntry {
  result: MapboxRouteResult;
  cachedAt: number;
  mode: MapboxMode;
}

// Cache TTL diversa per modalità: in auto si percorrono ~83m in 3s
// quindi serve un refresh più frequente per non perdere la soglia trigger.
const CACHE_TTL: Record<MapboxMode, number> = {
  driving: 2_500,   // 2.5s — a 60km/h ci si sposta di ~42m
  walking: 4_000,   // 4s   — a 5km/h ci si sposta di ~6m
};

const REQUEST_TIMEOUT_MS = 4_000;

// Arrotondamento per chiave cache: ~11m (4 decimali lat/lon)
const ROUND_FACTOR = 1e4;

const routeCache    = new Map<string, CacheEntry>();
const pendingRequests = new Map<string, Promise<MapboxRouteResult | null>>();

function cacheKey(from: LatLon, to: LatLon, mode: MapboxMode): string {
  const r = (n: number) => Math.round(n * ROUND_FACTOR) / ROUND_FACTOR;
  return `${r(from.lat)},${r(from.lon)}_${r(to.lat)},${r(to.lon)}_${mode}`;
}

function mbLang(lang: string): string {
  const l = (lang || 'it').toLowerCase().slice(0, 2);
  const m: Record<string, string> = { it: 'it', en: 'en', fr: 'fr', es: 'es', de: 'de', ru: 'ru', zh: 'zh' };
  return m[l] || 'it';
}

// ─────────────────────────────────────────────────────────────────────
// getMapboxRoute — distanza e istruzioni stradali reali
// ─────────────────────────────────────────────────────────────────────

/**
 * Recupera il percorso stradale tra due punti usando Mapbox Directions API.
 *
 * @param mode  'driving' per auto (strade, sensi unici, ecc.)
 *              'walking' per piedi (marciapiedi, ZTL pedonali, ecc.)
 * @returns     Distanza in metri lungo la strada, oppure null se offline/errore.
 */
export async function getMapboxRoute(
  from: LatLon,
  to: LatLon,
  mode: MapboxMode = 'walking',
  lang: string = 'it'
): Promise<MapboxRouteResult | null> {
  const token = import.meta.env.VITE_MAPBOX_TOKEN;
  if (!token) {
    console.warn('[Mapbox] VITE_MAPBOX_TOKEN non configurato — impossibile calcolare distanza stradale');
    return null;
  }

  const key = cacheKey(from, to, mode);
  const now = Date.now();
  const cached = routeCache.get(key);

  // Cache hit: la posizione non è cambiata abbastanza da richiedere ricalcolo
  if (cached && now - cached.cachedAt < CACHE_TTL[mode]) {
    return cached.result;
  }

  // Richiesta già in volo per la stessa coppia di punti
  if (pendingRequests.has(key)) {
    return pendingRequests.get(key)!;
  }

  const fetchPromise = (async (): Promise<MapboxRouteResult | null> => {
    try {
      const language = mbLang(lang);
      const url =
        `https://api.mapbox.com/directions/v5/mapbox/${mode}/` +
        `${from.lon},${from.lat};${to.lon},${to.lat}` +
        `?geometries=geojson&overview=false&steps=true` +
        `&language=${language}&access_token=${token}`;

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);

      if (!res.ok) throw new Error(`Mapbox HTTP ${res.status}`);

      const data = await res.json();
      const route = data?.routes?.[0];
      if (!route) throw new Error('Nessun percorso trovato');

      const steps: NavStep[] = [];
      for (const leg of (route.legs || [])) {
        for (const step of (leg.steps || [])) {
          steps.push({
            distance:    step.distance ?? 0,
            instruction: step.maneuver?.instruction ?? '',
            type:        step.maneuver?.type ?? '',
            modifier:    step.maneuver?.modifier,
          });
        }
      }

      const result: MapboxRouteResult = {
        distance: route.distance ?? 0,
        duration: route.duration ?? 0,
        steps,
      };

      routeCache.set(key, { result, cachedAt: Date.now(), mode });
      return result;

    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        console.warn('[Mapbox] Errore Route API:', err?.message ?? err);
      }
      return null;
    } finally {
      pendingRequests.delete(key);
    }
  })();

  pendingRequests.set(key, fetchPromise);
  return fetchPromise;
}

// ─────────────────────────────────────────────────────────────────────
// getRoadDistance — distanza stradale con fallback Haversine
// ─────────────────────────────────────────────────────────────────────

/**
 * Restituisce la distanza **stradale** (Mapbox) tra due punti.
 *
 * IMPORTANTE: il confronto con le soglie di alert/trigger del geofencing
 * deve usare SEMPRE questo valore, mai la distanza Haversine diretta.
 *
 * @param haversineGuard   Distanza Haversine calcolata in precedenza.
 *                         Se supera `alertRadius * 3`, il POI è sicuramente
 *                         fuori portata e non vale la pena chiamare Mapbox.
 *                         Serve SOLO come guard, non come misura effettiva.
 * @param alertRadius      Raggio di alert configurato (per calcolare il guard).
 */
export async function getRoadDistance(
  from: LatLon,
  to: LatLon,
  mode: MapboxMode,
  lang: string,
  haversineGuard: number,
  alertRadius: number
): Promise<{ roadDist: number; fromMapbox: boolean }> {
  // Guard: se la linea d'aria supera 3× il raggio di alert, il percorso
  // stradale è certamente > alertRadius. Nessuna chiamata necessaria.
  if (haversineGuard > alertRadius * 3) {
    return { roadDist: haversineGuard, fromMapbox: false };
  }

  const route = await getMapboxRoute(from, to, mode, lang);

  if (!route) {
    // Fallback degradato: Mapbox non disponibile (offline, token assente)
    // Usiamo Haversine con un fattore di correzione per strade urbane (~1.3)
    const corrected = haversineGuard * 1.3;
    console.warn('[Mapbox] Fallback Haversine×1.3 —', Math.round(corrected), 'm');
    return { roadDist: corrected, fromMapbox: false };
  }

  return { roadDist: route.distance, fromMapbox: true };
}

// ─────────────────────────────────────────────────────────────────────
// getRealDistance — retrocompatibilità con il vecchio hook
// ─────────────────────────────────────────────────────────────────────

/** @deprecated Usare getRoadDistance per maggiore chiarezza semantica */
export async function getRealDistance(
  from: LatLon,
  to: LatLon,
  haversineDist: number,
  haversineThreshold: number,
  mode: MapboxMode = 'walking',
  lang: string = 'it'
): Promise<number> {
  const { roadDist } = await getRoadDistance(from, to, mode, lang, haversineDist, haversineThreshold / 3);
  return roadDist;
}

// ─────────────────────────────────────────────────────────────────────
// getNextNavInstruction — prossima svolta per navigazione vocale
// ─────────────────────────────────────────────────────────────────────

export interface NavManeuver {
  instruction: string;
  distance: number;
}

/**
 * Restituisce la prossima istruzione di navigazione utile
 * (salta "depart" e restituisce "arrive" solo se < 20m).
 */
export function getNextNavInstruction(route: MapboxRouteResult | null): NavManeuver | null {
  if (!route?.steps?.length) return null;

  for (const step of route.steps) {
    if (step.type === 'depart') continue;
    if (step.type === 'arrive') {
      if (route.distance < 20) return { instruction: step.instruction, distance: route.distance };
      continue;
    }
    if (step.instruction && step.distance > 5) {
      return { instruction: step.instruction, distance: step.distance };
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────
// buildNavSpeechText — testo vocale turn-by-turn con distanza
// ─────────────────────────────────────────────────────────────────────

/**
 * Costruisce un testo TTS completo per la prossima manovra Mapbox.
 *
 * Esempi output (IT):
 *   "Fra circa 200 metri, svolta a destra in Via Roma"
 *   "Fra 40 metri, svolta a sinistra in Piazza del Duomo"
 *   "Continua dritto per 350 metri"
 *   "Sei quasi arrivato, il luogo è davanti a te"
 *
 * @param route  Risultato da getMapboxRoute (con steps)
 * @param lang   Codice lingua (it/en/fr/es/ru/zh)
 * @returns      Stringa da leggere con TTS, oppure null se niente da dire
 */
export function buildNavSpeechText(
  route: MapboxRouteResult | null,
  lang: string
): string | null {
  if (!route) return null;

  const l = (lang || 'it').toLowerCase().slice(0, 2);
  const maneuver = getNextNavInstruction(route);

  // ── Caso: stiamo arrivando (distanza totale < 30m) ──
  if (route.distance < 30) {
    const arrivals: Record<string, string> = {
      it: 'Sei quasi arrivato, il luogo è davanti a te',
      en: 'You are almost there, the place is right ahead',
      fr: 'Vous êtes presque arrivé, le lieu est juste devant vous',
      es: 'Ya casi has llegado, el lugar está justo enfrente',
      ru: 'Вы почти прибыли, место прямо перед вами',
      zh: '您快到了，目的地就在您前方',
    };
    return arrivals[l] || arrivals['en'];
  }

  if (!maneuver) return null;

  const d = maneuver.distance;

  // ── Prefisso distanza localizzato ──
  const distPrefix = buildDistPrefix(d, l);

  // ── L'istruzione di Mapbox è già localizzata (es. "svolta a destra in Via Roma") ──
  // La combiniamo con il prefisso distanza.
  // Per "continua dritto" non serve il prefisso se è la rotta principale.
  const instr = maneuver.instruction;

  const isStraight = /continu|dritto|straight|tout droit|recto|прямо|直走/i.test(instr);

  if (isStraight) {
    // Per "continua dritto" aggiungiamo la distanza in coda
    const straightTexts: Record<string, string> = {
      it: `Continua dritto per ${Math.round(d)} metri`,
      en: `Continue straight for ${Math.round(d)} meters`,
      fr: `Continuez tout droit pendant ${Math.round(d)} mètres`,
      es: `Continúe recto por ${Math.round(d)} metros`,
      ru: `Продолжайте прямо ${Math.round(d)} метров`,
      zh: `直行 ${Math.round(d)} 米`,
    };
    return straightTexts[l] || straightTexts['en'];
  }

  return `${distPrefix}${instr}`;
}

/** Prefisso distanza localizzato per la prossima manovra */
function buildDistPrefix(distMeters: number, l: string): string {
  const d10 = Math.round(distMeters / 10) * 10;

  const templates: Record<string, { far: string; near: string; close: string }> = {
    it: { far: `Fra circa ${d10} metri, `, near: `Fra ${Math.round(distMeters)} metri, `, close: 'Subito, ' },
    en: { far: `In about ${d10} meters, `, near: `In ${Math.round(distMeters)} meters, `, close: 'Shortly, ' },
    fr: { far: `Dans environ ${d10} mètres, `, near: `Dans ${Math.round(distMeters)} mètres, `, close: 'Bientôt, ' },
    es: { far: `En unos ${d10} metros, `, near: `En ${Math.round(distMeters)} metros, `, close: 'Enseguida, ' },
    ru: { far: `Примерно через ${d10} метров, `, near: `Через ${Math.round(distMeters)} метров, `, close: 'Скоро, ' },
    zh: { far: `大约 ${d10} 米后，`, near: `${Math.round(distMeters)} 米后，`, close: '马上，' },
  };

  const t = templates[l] || templates['en'];
  if (distMeters > 100) return t.far;
  if (distMeters > 25)  return t.near;
  return t.close;
}
