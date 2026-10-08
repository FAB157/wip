// =====================================================================
// ITAINTA · Navigatore pedonale via OSRM (router.project-osrm.org, gratis)
// Routing a piedi + traduzione manovre in voce (Web Speech / Azure).
// =====================================================================

import type { LatLon } from '../lib/geo';
import { getApiUrl, apiFetch } from '../lib/api';

// Base OSRM per il routing PEDONALE, condivisa da TUTTI i consumatori
// (osrmService, routeEngine, NavigatorEngine, PlanScreen): un'unica costante.
// Il demo pubblico router.project-osrm.org espone SOLO il grafo AUTO anche sul
// profilo "foot": le indicazioni a piedi erano in realtà su strade carrabili.
// Si usa l'istanza FOSSGIS routed-foot (profilo pedonale vero: marciapiedi, ZTL
// pedonali, scorciatoie). Override con VITE_OSRM_FOOT_BASE.
// PRODUZIONE: un OSRM self-hosted o Mapbox "walking" sono le opzioni robuste
// (Mapbox NON è il default per non alzare i costi).
// DAL 19/08 si passa dalla NOSTRA rotta, non piu' dal servizio esterno diretto.
// Dietro /api/route/foot c'e' una catena di cinque fonti — FOSSGIS OSRM,
// FOSSGIS Valhalla, OpenRouteService, Geoapify, Mapbox — provate in
// quest'ordine. Motivo: routing.openstreetmap.de e' ottimo (misurato: 10
// percorsi su 10, mediana 122 ms) ma e' di un'associazione senza scopo di
// lucro, senza garanzia di continuita'; se ci limitano, l'app resta muta.
// La rotta risponde nel DIALETTO OSRM, quindi qui cambia solo l'indirizzo e
// nessuna logica di navigazione.
// Con VITE_OSRM_FOOT_BASE si puo' ancora puntare altrove (utile per provare un
// OSRM self-hosted senza toccare il codice).
export const OSRM_FOOT_BASE: string =
  (import.meta.env as any)?.VITE_OSRM_FOOT_BASE ||
  `${getApiUrl('/api/route/foot/')}`;

export interface RouteStep {
  /** Testo gia' tradotto, pronto da leggere. */
  instruction: string;
  /** Coordinata del punto di manovra. */
  location: LatLon;
  /** Distanza (m) da questa manovra alla SEGUENTE (OSRM step.distance: il tratto che parte qui). */
  distance: number;
  maneuverType: string;
  maneuverModifier?: string;
  /** Nome della strada del segmento (da OSRM `step.name`), se non vuoto. */
  name?: string;
}

export interface WalkingRoute {
  steps: RouteStep[];
  /** Distanza totale in metri. */
  distance: number;
  /** Durata stimata in secondi. */
  duration: number;
  /** Polilinea [lat, lon] per disegnare il percorso su Leaflet. */
  geometry: [number, number][];
}

// Frasi delle manovre in tutte le lingue dell'app (prima solo IT/EN: le
// altre lingue ricevevano le indicazioni in inglese).
type ManeuverPhrases = {
  arrive: (poi: string) => string;
  destination: string;
  depart: string;
  roundabout: string;
  /** Rotonda CON numero di uscita: "prendi la 2ª uscita" ecc. */
  roundaboutExit: (n: number) => string;
  // Manovre con nome via OPZIONALE: OSRM lo espone in step.name, ma lo
  // restituisce vuoto per le strade senza nome (percorsi pedonali,
  // scorciatoie...) — in quel caso queste funzioni ricadono sulla frase
  // generica invariata (nessuna interpolazione con stringa vuota).
  right: (name?: string) => string;
  left: (name?: string) => string;
  straight: (name?: string) => string;
  slightRight: (name?: string) => string;
  slightLeft: (name?: string) => string;
  uturn: (name?: string) => string;
};

/** Ordinale inglese: 1st/2nd/3rd/4th… (per "take the Nth exit"). */
function enOrdinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

const MANEUVER_LANGS: Record<string, ManeuverPhrases> = {
  it: {
    arrive: p => `Sei arrivato a ${p}`, destination: 'destinazione', depart: 'Inizia il percorso',
    roundabout: 'Prendi la rotonda', roundaboutExit: n => `Alla rotonda prendi la ${n}ª uscita`,
    right: name => name ? `Gira a destra in ${name}` : 'gira a destra',
    left: name => name ? `Gira a sinistra in ${name}` : 'gira a sinistra',
    straight: name => name ? `Continua dritto su ${name}` : 'continua dritto',
    slightRight: name => name ? `Mantieni la destra su ${name}` : 'mantieni la destra',
    slightLeft: name => name ? `Mantieni la sinistra su ${name}` : 'mantieni la sinistra',
    uturn: name => name ? `Fai inversione su ${name}` : 'fai inversione',
  },
  en: {
    arrive: p => `You have arrived at ${p}`, destination: 'your destination', depart: 'Start the route',
    roundabout: 'Take the roundabout', roundaboutExit: n => `At the roundabout take the ${enOrdinal(n)} exit`,
    right: name => name ? `Turn right onto ${name}` : 'turn right',
    left: name => name ? `Turn left onto ${name}` : 'turn left',
    straight: name => name ? `Continue straight on ${name}` : 'continue straight',
    slightRight: name => name ? `Keep right onto ${name}` : 'keep right',
    slightLeft: name => name ? `Keep left onto ${name}` : 'keep left',
    uturn: name => name ? `Make a U-turn onto ${name}` : 'make a U-turn',
  },
  fr: {
    arrive: p => `Vous êtes arrivé à ${p}`, destination: 'destination', depart: 'Commencez le trajet',
    roundabout: 'Prenez le rond-point', roundaboutExit: n => `Au rond-point prenez la ${n === 1 ? '1re' : `${n}e`} sortie`,
    right: name => name ? `Tournez à droite sur ${name}` : 'tournez à droite',
    left: name => name ? `Tournez à gauche sur ${name}` : 'tournez à gauche',
    straight: name => name ? `Continuez tout droit sur ${name}` : 'continuez tout droit',
    slightRight: name => name ? `Serrez à droite sur ${name}` : 'serrez à droite',
    slightLeft: name => name ? `Serrez à gauche sur ${name}` : 'serrez à gauche',
    uturn: name => name ? `Faites demi-tour sur ${name}` : 'faites demi-tour',
  },
  es: {
    arrive: p => `Has llegado a ${p}`, destination: 'tu destino', depart: 'Inicia el recorrido',
    roundabout: 'Toma la rotonda', roundaboutExit: n => `En la rotonda toma la ${n}ª salida`,
    right: name => name ? `Gira a la derecha en ${name}` : 'gira a la derecha',
    left: name => name ? `Gira a la izquierda en ${name}` : 'gira a la izquierda',
    straight: name => name ? `Sigue recto por ${name}` : 'sigue recto',
    slightRight: name => name ? `Mantente a la derecha en ${name}` : 'mantente a la derecha',
    slightLeft: name => name ? `Mantente a la izquierda en ${name}` : 'mantente a la izquierda',
    uturn: name => name ? `Da la vuelta en ${name}` : 'da la vuelta',
  },
  de: {
    arrive: p => `Sie haben ${p} erreicht`, destination: 'Ihr Ziel', depart: 'Route starten',
    roundabout: 'Nehmen Sie den Kreisverkehr', roundaboutExit: n => `Nehmen Sie am Kreisverkehr die ${n}. Ausfahrt`,
    right: name => name ? `Rechts abbiegen auf ${name}` : 'rechts abbiegen',
    left: name => name ? `Links abbiegen auf ${name}` : 'links abbiegen',
    straight: name => name ? `Geradeaus weiter auf ${name}` : 'geradeaus weiter',
    slightRight: name => name ? `Rechts halten auf ${name}` : 'rechts halten',
    slightLeft: name => name ? `Links halten auf ${name}` : 'links halten',
    uturn: name => name ? `Wenden auf ${name}` : 'wenden',
  },
  ru: {
    arrive: p => `Вы прибыли: ${p}`, destination: 'пункт назначения', depart: 'Начните маршрут',
    roundabout: 'Проезжайте круговой перекрёсток', roundaboutExit: n => `На кольце сверните на ${n}-й съезд`,
    right: name => name ? `Поверните направо на ${name}` : 'поверните направо',
    left: name => name ? `Поверните налево на ${name}` : 'поверните налево',
    straight: name => name ? `Продолжайте прямо по ${name}` : 'продолжайте прямо',
    slightRight: name => name ? `Держитесь правее на ${name}` : 'держитесь правее',
    slightLeft: name => name ? `Держитесь левее на ${name}` : 'держитесь левее',
    uturn: name => name ? `Развернитесь на ${name}` : 'развернитесь',
  },
  zh: {
    arrive: p => `您已到达${p}`, destination: '目的地', depart: '开始路线',
    roundabout: '进入环岛', roundaboutExit: n => `在环岛走第${n}个出口`,
    right: name => name ? `右转进入${name}` : '右转',
    left: name => name ? `左转进入${name}` : '左转',
    straight: name => name ? `沿${name}直行` : '直行',
    slightRight: name => name ? `靠右行驶进入${name}` : '靠右行驶',
    slightLeft: name => name ? `靠左行驶进入${name}` : '靠左行驶',
    uturn: name => name ? `在${name}掉头` : '掉头',
  },
};

/**
 * La frase per uno step OSRM grezzo (legs[].steps[]): la stessa regola di
 * fetchWalkingRoute — il testo della fonte se c'e' (ORS/Geoapify lo mettono in
 * maneuver.instruction), altrimenti la traduzione da type/modifier. La usa
 * anche Dieci Tappe, che tiene le legs del server e prima non le leggeva mai.
 */
export function istruzionePerStep(s: any, lang: string, poiName?: string): string {
  const testoFonte = typeof s?.maneuver?.instruction === 'string' && s.maneuver.instruction.trim() ? s.maneuver.instruction.trim() : undefined;
  if (testoFonte) return testoFonte;
  const name: string | undefined = typeof s?.name === 'string' && s.name.trim() ? s.name.trim() : undefined;
  return translateManeuver(s?.maneuver?.type ?? 'continue', s?.maneuver?.modifier, lang, poiName, s?.maneuver?.exit, name);
}

/** Traduce una manovra OSRM in una frase vocale nella lingua data. */
export function translateManeuver(
  type: string,
  modifier: string | undefined,
  lang: string,
  poiName?: string,
  exit?: number,
  streetName?: string,
): string {
  const l = (lang || 'it').toLowerCase().slice(0, 2);
  const t = MANEUVER_LANGS[l] || MANEUVER_LANGS.en;
  // OSRM restituisce '' (non undefined) per le strade senza nome: va trattato
  // come "assente", altrimenti si otterrebbe "gira a destra in " a vuoto.
  const name = streetName && streetName.trim() ? streetName.trim() : undefined;

  if (type === 'arrive') return t.arrive(poiName || t.destination);
  if (type === 'depart') return t.depart;
  // Rotonda: se OSRM fornisce il numero di uscita lo annunciamo ("2ª uscita"),
  // altrimenti la frase generica (mai un ordinale vuoto/malformato).
  if (type === 'roundabout' || type === 'rotary') {
    return typeof exit === 'number' && exit > 0 ? t.roundaboutExit(exit) : t.roundabout;
  }
  // 'continue' = la strada PIEGA, non c'è un incrocio da svoltare: OSRM manda
  // comunque modifier left/right e si finiva per dire "gira a destra in Via X"
  // restando sulla stessa via (visto davvero sul percorso Avenza→Alberica,
  // "continue/right" su Via Campiglia). Si annuncia come proseguimento.
  if (type === 'continue' && modifier !== 'uturn') return t.straight(name);

  switch (modifier) {
    case 'right':
    case 'sharp right':
      return t.right(name);
    case 'left':
    case 'sharp left':
      return t.left(name);
    case 'slight right':
      return t.slightRight(name);
    case 'slight left':
      return t.slightLeft(name);
    case 'uturn':
      return t.uturn(name);
    case 'straight':
    default:
      return t.straight(name);
  }
}

// EVITA SCALE (08/09/2026): preferenza dell'utente, persistente. Quando e'
// attiva il server salta le fonti che non sanno evitare le scalinate (OSRM
// foot, Geoapify, Mapbox) e usa Valhalla/ORS con profilo accessibile.
const EVITA_SCALE_KEY = 'wip_nav_evita_scale';
export function getEvitaScale(): boolean {
  try { return typeof localStorage !== 'undefined' && localStorage.getItem(EVITA_SCALE_KEY) === '1'; } catch { return false; }
}
export function setEvitaScale(on: boolean): void {
  try {
    if (on) localStorage.setItem(EVITA_SCALE_KEY, '1'); else localStorage.removeItem(EVITA_SCALE_KEY);
    window.dispatchEvent(new CustomEvent('wip-settings-updated', { detail: { evitaScale: on } }));
  } catch { /* storage non disponibile */ }
}

// SVOLTE A RAFFICA (04/10/2026, test virtuale a Carrara: «gira a sinistra»,
// «gira a sinistra», «gira a destra», «tra 70 metri gira a destra» in nove
// secondi, su tratti di 6-12 m). Due svolte a meno di 15 m l'una dall'altra
// non sono due istruzioni: sono una, «gira a sinistra, poi subito a destra».
// La seconda si fonde nella prima e sparisce dall'elenco; una terza e una
// quarta nello stesso groviglio spariscono e basta (il tracciato sulla mappa
// le mostra). Si fa QUI, sull'elenco dei passi, così la voce della pagina e il
// follower nativo (che riceve gli stessi passi) restano allineati.
const MANOVRE_VICINE_M = 15;
const POI_SUBITO: Record<string, string> = {
  it: 'poi subito', en: 'then immediately', fr: 'puis tout de suite', es: 'y enseguida', de: 'dann sofort', ru: 'затем сразу', zh: '然后立即',
};
export function accorpaManovreVicine(steps: RouteStep[], lang: string): void {
  const l2 = String(lang || 'it').slice(0, 2).toLowerCase();
  const lega = POI_SUBITO[l2] || POI_SUBITO.en;
  const svolta = (s: RouteStep) => { const t = String(s.maneuverType || '').toLowerCase(); return t !== 'depart' && t !== 'arrive'; };
  const fuse = new Set<RouteStep>();
  for (let i = 1; i < steps.length; ) {
    const prima = steps[i - 1], dopo = steps[i];
    // `distance` di un passo = metri dalla SUA manovra alla successiva.
    if (svolta(prima) && svolta(dopo) && (prima.distance ?? 0) < MANOVRE_VICINE_M) {
      if (!fuse.has(prima) && dopo.instruction) {
        prima.instruction = `${prima.instruction}, ${lega} ${dopo.instruction.charAt(0).toLowerCase()}${dopo.instruction.slice(1)}`;
        fuse.add(prima);
      }
      prima.distance = (prima.distance ?? 0) + (dopo.distance ?? 0);
      steps.splice(i, 1);
      continue;
    }
    i += 1;
  }
}

/**
 * La stessa fusione, sui passi GREZZI del server (legs[].steps[] in forma OSRM): la
 * usano il giro e il percorso su misura (tourService), che tengono le tratte del
 * server così come arrivano. Il testo composto va in `maneuver.instruction`, che
 * `istruzionePerStep` legge per primo: voce della pagina, cartello in alto e passi
 * consegnati al follower nativo escono tutti dallo stesso elenco già accorciato,
 * quindi Kotlin e Swift non cambiano. Partenza e arrivo non si toccano mai.
 */
export function accorpaPassiGrezzi(steps: any[], lang: string): void {
  if (!Array.isArray(steps) || steps.length < 3) return;
  const l2 = String(lang || 'it').slice(0, 2).toLowerCase();
  const lega = POI_SUBITO[l2] || POI_SUBITO.en;
  const svolta = (s: any) => { const t = String(s?.maneuver?.type || '').toLowerCase(); return t !== 'depart' && t !== 'arrive'; };
  const fuse = new Set<any>();
  for (let i = 1; i < steps.length; ) {
    const prima = steps[i - 1], dopo = steps[i];
    if (svolta(prima) && svolta(dopo) && (Number(prima?.distance) || 0) < MANOVRE_VICINE_M) {
      if (!fuse.has(prima)) {
        const a = istruzionePerStep(prima, lang), b = istruzionePerStep(dopo, lang);
        if (a && b) prima.maneuver = { ...(prima.maneuver || {}), instruction: `${a}, ${lega} ${b.charAt(0).toLowerCase()}${b.slice(1)}` };
        fuse.add(prima);
      }
      prima.distance = (Number(prima.distance) || 0) + (Number(dopo?.distance) || 0);
      if (prima.duration != null || dopo?.duration != null) prima.duration = (Number(prima.duration) || 0) + (Number(dopo?.duration) || 0);
      steps.splice(i, 1);
      continue;
    }
    i += 1;
  }
}

/**
 * Calcola il percorso pedonale da -> a.
 * Ritorna null se OSRM non risponde o non trova rotte.
 */
export async function fetchWalkingRoute(
  from: LatLon,
  to: LatLon,
  lang: string,
  poiName?: string,
): Promise<WalkingRoute | null> {
  try {
    const coords = `${from.lon},${from.lat};${to.lon},${to.lat}`;
    // `language`: il server la passa a Valhalla/ORS/Geoapify per le istruzioni
    // testuali; senza, usava 'it' per tutti (anche utenti EN/FR/DE).
    const langCode = String(lang || 'it').slice(0, 2).toLowerCase();
    const evita = getEvitaScale() ? '&evita=scale' : '';
    const url = `${OSRM_FOOT_BASE}${coords}?overview=full&geometries=geojson&steps=true&language=${encodeURIComponent(langCode)}${evita}`;
    // Timeout: senza, una richiesta appesa lasciava la navigazione bloccata in
    // "routing" all'infinito. Ma 6 s erano TROPPO POCHI: dietro /api/route/foot
    // il server prova cinque fonti in serie (6+7+8+8+8 s) e il client mollava
    // mentre la prima era ancora in corso — le quattro riserve non venivano mai
    // raggiunte (verificato il 22/08/2026). 45 s copre l'intera catena.
    // apiFetch, non fetch (21/09/2026): dal 10/09 la rotta esige il Bearer
    // (audit SEC-01) e la fetch nuda prendeva 401 — il WIP Nav a piedi verso
    // una meta sola non partiva per nessuno, loggato o no. apiFetch mette il
    // token e, per l'ospite, propone il login invece di fallire in silenzio.
    const res = await apiFetch(url, undefined, 45000);
    if (!res.ok) return null;
    const data = await res.json();
    const route = data?.routes?.[0];
    if (!route) return null;

    const legSteps = route.legs?.[0]?.steps ?? [];
    const steps: RouteStep[] = legSteps.map((s: any) => {
      const type = s.maneuver?.type ?? 'continue';
      const modifier = s.maneuver?.modifier;
      // Nome via del segmento (risposta OSRM standard, legs[].steps[].name).
      // OSRM lo restituisce '' per le strade senza nome: normalizzato a
      // undefined qui, così i consumatori non devono ripetere il controllo.
      const name: string | undefined = typeof s.name === 'string' && s.name.trim() ? s.name.trim() : undefined;
      const [lon, lat] = s.maneuver?.location ?? [from.lon, from.lat];
      // Le fonti di riserva (ORS, Geoapify) rispondono con type 'continue' e il
      // testo vero della manovra in maneuver.instruction: ignorarlo faceva dire
      // "continua dritto" a ogni svolta appena la prima fonte cadeva.
      const testoFonte: string | undefined = typeof s.maneuver?.instruction === 'string' && s.maneuver.instruction.trim() ? s.maneuver.instruction.trim() : undefined;
      return {
        instruction: testoFonte || translateManeuver(type, modifier, lang, poiName, s.maneuver?.exit, name),
        location: { lat, lon },
        distance: s.distance ?? 0,
        maneuverType: type,
        maneuverModifier: modifier,
        name,
      };
    });

    accorpaManovreVicine(steps, lang);

    const geometry: [number, number][] = (route.geometry?.coordinates ?? []).map(
      ([lon, lat]: [number, number]) => [lat, lon],
    );

    return {
      steps,
      distance: route.distance ?? 0,
      duration: route.duration ?? 0,
      geometry,
    };
  } catch {
    return null;
  }
}
