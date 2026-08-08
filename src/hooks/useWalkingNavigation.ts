// =====================================================================
// ITAINTA · useWalkingNavigation — navigatore pedonale "WIP Nav" (OSRM)
// Stati: idle / routing / navigating / arrived
// - Turn-by-turn vocale (Web Speech) quando la svolta e' < 30 m.
// - Audioguide automatiche per i POI scelti lungo il percorso
//   (dispatch 'wip-poi-trigger' quando l'utente ci passa vicino).
// - Fuori rotta: ricalcolo automatico del percorso con annuncio vocale.
// - Distanza/ETA calcolate lungo il tracciato reale, non in linea d'aria.
// - Wake lock dello schermo durante la navigazione (dove supportato).
// All'arrivo emette 'wip-nav-arrived' (trigger audioguida del POI).
// Usa il GPS condiviso di locationService (nessun secondo watchPosition).
// =====================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { locationService } from '../services/locationService';
import { fetchWalkingRoute, type WalkingRoute } from '../services/osrmService';
import { speakInstruction } from '../services/ttsService';
import { haversineMeters, type LatLon } from '../lib/geo';

export type NavState = 'idle' | 'routing' | 'navigating' | 'arrived';

const SPEAK_DISTANCE_M = 30;    // leggi la manovra entro 30 m dalla svolta
const ARRIVE_DISTANCE_M = 25;   // soglia di arrivo
const WALK_SPEED_MS = 1.3;      // ~4.7 km/h per stima ETA
const POI_TRIGGER_M = 80;       // audioguida automatica entro 80 m dal POI scelto
const OFF_ROUTE_M = 45;         // oltre 45 m dal tracciato = fuori rotta
const OFF_ROUTE_FIXES = 2;      // fix GPS consecutivi fuori rotta prima del ricalcolo
const RECALC_COOLDOWN_MS = 20000;

const REROUTE_PHRASES: Record<string, string> = {
  it: 'Percorso ricalcolato',
  en: 'Route recalculated',
  fr: 'Itinéraire recalculé',
  es: 'Ruta recalculada',
  de: 'Route neu berechnet',
  ru: 'Маршрут пересчитан',
  zh: '路线已重新计算',
};

export interface NavTarget extends LatLon {
  poiId?: number | string;
  poiName?: string;
}

/** POI lungo il percorso scelto nel modal WIP Nav. */
export interface RoutePoi {
  id: string | number;
  name?: string;
  nome?: string;
  lat: number;
  lon: number;
  category?: string;
  [key: string]: any;
}

export interface UseWalkingNavigationResult {
  state: NavState;
  currentInstruction: string | null;
  distanceToNext: number | null;
  distanceToDestination: number | null;
  etaSeconds: number | null;
  routeGeometry: [number, number][];
  startNavigation: (target: NavTarget, originOverride?: LatLon | null, routePois?: RoutePoi[]) => Promise<void>;
  stopNavigation: () => void;
  /** Ripete a voce l'istruzione corrente (bottone 🔊 nell'overlay). */
  repeatInstruction: () => void;
}

export function useWalkingNavigation(language = 'it'): UseWalkingNavigationResult {
  const [state, setState] = useState<NavState>('idle');
  const [currentInstruction, setCurrentInstruction] = useState<string | null>(null);
  const [distanceToNext, setDistanceToNext] = useState<number | null>(null);
  const [distanceToDestination, setDistanceToDestination] = useState<number | null>(null);
  const [etaSeconds, setEtaSeconds] = useState<number | null>(null);
  const [routeGeometry, setRouteGeometry] = useState<[number, number][]>([]);

  const routeRef = useRef<WalkingRoute | null>(null);
  const targetRef = useRef<NavTarget | null>(null);
  const stepIdxRef = useRef(0);
  const spokenRef = useRef<Set<number>>(new Set());
  const unsubRef = useRef<(() => void) | null>(null);
  // Lunghezze cumulate del tracciato (dal vertice i alla fine), per la
  // distanza residua lungo il percorso reale.
  const remainingFromVertexRef = useRef<number[]>([]);
  const pendingPoisRef = useRef<RoutePoi[]>([]);
  const offRouteCountRef = useRef(0);
  const lastRecalcRef = useRef(0);
  const recalcInFlightRef = useRef(false);
  const wakeLockRef = useRef<any>(null);
  // False finché l'utente non si avvicina al tracciato (solo con origine
  // personalizzata): sospende ricalcolo e arrivo finché non è "sul percorso".
  const joinedRouteRef = useRef(true);

  const releaseWakeLock = () => {
    try { wakeLockRef.current?.release?.(); } catch { /* già rilasciato */ }
    wakeLockRef.current = null;
  };

  const acquireWakeLock = async () => {
    try {
      const wl = (navigator as any).wakeLock;
      if (wl?.request) wakeLockRef.current = await wl.request('screen');
    } catch { /* non supportato o negato: si continua senza */ }
  };

  // Precalcola, per ogni vertice della polilinea, i metri che restano da lì
  // alla destinazione: distanza residua = remaining[vertice più vicino].
  const setRoute = (route: WalkingRoute) => {
    routeRef.current = route;
    const g = route.geometry;
    const remaining = new Array<number>(g.length).fill(0);
    for (let i = g.length - 2; i >= 0; i--) {
      remaining[i] = remaining[i + 1] + haversineMeters(g[i][0], g[i][1], g[i + 1][0], g[i + 1][1]);
    }
    remainingFromVertexRef.current = remaining;
    setRouteGeometry(g);
  };

  // Vertice del tracciato più vicino alla posizione + distanza da esso.
  const nearestVertex = (here: LatLon): { idx: number; dist: number } => {
    const g = routeRef.current?.geometry || [];
    let best = { idx: 0, dist: Infinity };
    for (let i = 0; i < g.length; i++) {
      const d = haversineMeters(here.lat, here.lon, g[i][0], g[i][1]);
      if (d < best.dist) best = { idx: i, dist: d };
    }
    return best;
  };

  // Audioguide automatiche: se l'utente passa entro POI_TRIGGER_M da un POI
  // scelto nel modal, si apre la scheda con autoplay (il pagamento/quota è
  // gestito a valle come per ogni altro ascolto). Dedupe condiviso con il
  // geofencing normale via __wipLastPoiTrigger.
  const checkRoutePois = (here: LatLon) => {
    const pending = pendingPoisRef.current;
    if (pending.length === 0) return;
    const stillPending: RoutePoi[] = [];
    for (const p of pending) {
      const d = haversineMeters(here.lat, here.lon, p.lat, p.lon);
      if (d <= POI_TRIGGER_M) {
        const lastTrig = (window as any).__wipLastPoiTrigger;
        const isDup = lastTrig && String(lastTrig.id) === String(p.id) && Date.now() - lastTrig.ts < 60000;
        if (!isDup) {
          (window as any).__wipLastPoiTrigger = { id: String(p.id), ts: Date.now() };
          window.dispatchEvent(new CustomEvent('wip-poi-trigger', {
            detail: {
              poiId: p.id,
              poi: { ...p, name: p.name || p.nome },
              alreadyPaid: false,
              autoPlay: true,
              fromWipNav: true,
            },
          }));
        }
      } else {
        stillPending.push(p);
      }
    }
    pendingPoisRef.current = stillPending;
  };

  // Fuori rotta: dopo OFF_ROUTE_FIXES fix consecutivi oltre OFF_ROUTE_M dal
  // tracciato, si ricalcola il percorso dalla posizione corrente.
  const maybeRecalc = async (here: LatLon, distFromRoute: number) => {
    if (distFromRoute <= OFF_ROUTE_M) { offRouteCountRef.current = 0; return; }
    offRouteCountRef.current += 1;
    if (offRouteCountRef.current < OFF_ROUTE_FIXES) return;
    if (recalcInFlightRef.current || Date.now() - lastRecalcRef.current < RECALC_COOLDOWN_MS) return;

    const t = targetRef.current;
    if (!t) return;
    recalcInFlightRef.current = true;
    try {
      const route = await fetchWalkingRoute(here, t, language, t.poiName);
      if (route && route.steps.length > 0 && targetRef.current === t) {
        setRoute(route);
        stepIdxRef.current = 0;
        spokenRef.current.clear();
        offRouteCountRef.current = 0;
        lastRecalcRef.current = Date.now();
        const phrase = REROUTE_PHRASES[(language || 'it').toLowerCase().slice(0, 2)] || REROUTE_PHRASES.en;
        setCurrentInstruction(phrase);
        speakInstruction(phrase, language);
      }
    } catch { /* rete assente: si continua col vecchio tracciato */ }
    finally { recalcInFlightRef.current = false; }
  };

  const stopNavigation = useCallback(() => {
    unsubRef.current?.();
    unsubRef.current = null;
    routeRef.current = null;
    targetRef.current = null;
    stepIdxRef.current = 0;
    spokenRef.current.clear();
    pendingPoisRef.current = [];
    remainingFromVertexRef.current = [];
    offRouteCountRef.current = 0;
    releaseWakeLock();
    setState('idle');
    setCurrentInstruction(null);
    setDistanceToNext(null);
    setDistanceToDestination(null);
    setEtaSeconds(null);
    setRouteGeometry([]);
  }, []);

  const repeatInstruction = useCallback(() => {
    if (currentInstruction) speakInstruction(currentInstruction, language);
  }, [currentInstruction, language]);

  const startNavigation = useCallback(
    async (target: NavTarget, originOverride?: LatLon | null, routePois?: RoutePoi[]) => {
      // Chiude un'eventuale navigazione già attiva: senza, la vecchia
      // subscription GPS restava zombie e all'arrivo spegneva quella nuova
      // ripetendo "Sei arrivato" a ogni fix.
      unsubRef.current?.();
      unsubRef.current = null;

      setState('routing');
      targetRef.current = target;
      spokenRef.current.clear();
      stepIdxRef.current = 0;
      offRouteCountRef.current = 0;
      pendingPoisRef.current = (routePois || []).filter(p => p && typeof p.lat === 'number' && typeof p.lon === 'number');
      // Con origine personalizzata (indirizzo) l'utente è tipicamente LONTANO
      // dal tracciato: ricalcolo e arrivo restano sospesi finché non si
      // "aggancia" il percorso, altrimenti il ricalcolo dalla posizione GPS
      // cancellava l'origine scelta dopo 2 fix.
      joinedRouteRef.current = !originOverride;

      // Origine esplicita (es. "Indirizzo personalizzato" dal modal WIP Nav):
      // prima veniva sempre ignorata e si partiva comunque dal GPS.
      const last = locationService.getLastLocation();
      const from: LatLon = originOverride
        ? originOverride
        : last
          ? { lat: last.latitude, lon: last.longitude }
          : { lat: target.lat, lon: target.lon };

      const route = await fetchWalkingRoute(from, target, language, target.poiName);
      // L'utente può aver premuto STOP durante il calcolo: senza questo guard
      // si ripartiva comunque, con overlay congelato e wake lock leakato.
      if (targetRef.current !== target) return;
      if (!route || route.steps.length === 0) {
        setState('idle');
        return;
      }
      setRoute(route);
      setState('navigating');
      setCurrentInstruction(route.steps[0]?.instruction ?? null);
      setDistanceToDestination(Math.round(route.distance));
      setEtaSeconds(Math.round(route.distance / WALK_SPEED_MS));
      acquireWakeLock();

      // Sottoscrizione al flusso GPS condiviso
      unsubRef.current = locationService.subscribe((loc) => {
        const t = targetRef.current;
        const r = routeRef.current;
        if (!t || !r) return;

        const here: LatLon = { lat: loc.latitude, lon: loc.longitude };

        // Audioguide dei POI scelti lungo il percorso
        checkRoutePois(here);

        // Distanza residua LUNGO IL TRACCIATO (non in linea d'aria) + ETA.
        // In linea d'aria un percorso a U dava ETA assurde ("200 m" con 15
        // minuti reali di cammino).
        const nearest = nearestVertex(here);
        const remaining = remainingFromVertexRef.current[nearest.idx] ?? 0;
        const dDestAir = haversineMeters(here.lat, here.lon, t.lat, t.lon);
        const dDest = Math.max(remaining, 0);
        setDistanceToDestination(Math.round(Math.min(Math.max(dDest, dDestAir), dDest + nearest.dist)));
        setEtaSeconds(Math.round((dDest + nearest.dist) / WALK_SPEED_MS));

        // Aggancio al tracciato (origine personalizzata): da qui in poi
        // ricalcolo e arrivo tornano attivi.
        if (!joinedRouteRef.current && nearest.dist <= 60) joinedRouteRef.current = true;

        // Fuori rotta → ricalcolo automatico (solo se già sul percorso)
        if (joinedRouteRef.current) maybeRecalc(here, nearest.dist);

        // Arrivo (in linea d'aria: conta la vicinanza fisica alla meta)
        if (joinedRouteRef.current && dDestAir <= ARRIVE_DISTANCE_M) {
          setState('arrived');
          releaseWakeLock();
          const arriveStep = r.steps[r.steps.length - 1];
          speakInstruction(
            arriveStep?.instruction ||
              (language.toLowerCase().startsWith('it') ? `Sei arrivato a ${t.poiName || ''}` : `You arrived`),
            language,
          );
          window.dispatchEvent(
            new CustomEvent('wip-nav-arrived', { detail: { poiId: t.poiId, poiName: t.poiName } }),
          );
          unsubRef.current?.();
          unsubRef.current = null;
          return;
        }

        // Avanzamento sui waypoint + lettura manovra entro 30 m
        let idx = stepIdxRef.current;
        while (idx < r.steps.length) {
          const step = r.steps[idx];
          const dStep = haversineMeters(here.lat, here.lon, step.location.lat, step.location.lon);
          if (dStep <= SPEAK_DISTANCE_M) {
            if (!spokenRef.current.has(idx)) {
              spokenRef.current.add(idx);
              setCurrentInstruction(step.instruction);
              speakInstruction(step.instruction, language);
              // Trigger local notification for background Android
              locationService.sendLocalNotification("Indicazione Stradale", step.instruction);
            }
            idx += 1; // passa alla manovra successiva
            stepIdxRef.current = idx;
          } else {
            setDistanceToNext(Math.round(dStep));
            break;
          }
        }
      });
    },
    [language],
  );

  // Cleanup su unmount
  useEffect(() => () => {
    unsubRef.current?.();
    unsubRef.current = null;
    releaseWakeLock();
  }, []);

  return {
    state,
    currentInstruction,
    distanceToNext,
    distanceToDestination,
    etaSeconds,
    routeGeometry,
    startNavigation,
    stopNavigation,
    repeatInstruction,
  };
}
