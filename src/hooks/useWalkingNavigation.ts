// =====================================================================
// ITAINTA · useWalkingNavigation — navigatore pedonale (OSRM)
// Stati: idle / routing / navigating / arrived
// Turn-by-turn vocale (Web Speech) quando la svolta e' < 30 m.
// All'arrivo emette 'wip-nav-arrived' (trigger audioguida del POI).
// Usa il GPS condiviso di locationService (nessun secondo watchPosition).
// =====================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { locationService } from '../services/locationService';
import { fetchWalkingRoute, type WalkingRoute } from '../services/osrmService';
import { speakInstruction } from '../services/ttsService';
import { haversineMeters, type LatLon } from '../lib/geo';

export type NavState = 'idle' | 'routing' | 'navigating' | 'arrived';

const SPEAK_DISTANCE_M = 30;   // leggi la manovra entro 30 m dalla svolta
const ARRIVE_DISTANCE_M = 25;  // soglia di arrivo
const WALK_SPEED_MS = 1.3;     // ~4.7 km/h per stima ETA

export interface NavTarget extends LatLon {
  poiId?: number;
  poiName?: string;
}

export interface UseWalkingNavigationResult {
  state: NavState;
  currentInstruction: string | null;
  distanceToNext: number | null;
  distanceToDestination: number | null;
  etaSeconds: number | null;
  routeGeometry: [number, number][];
  startNavigation: (target: NavTarget, originOverride?: LatLon | null) => Promise<void>;
  stopNavigation: () => void;
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

  const stopNavigation = useCallback(() => {
    unsubRef.current?.();
    unsubRef.current = null;
    routeRef.current = null;
    targetRef.current = null;
    stepIdxRef.current = 0;
    spokenRef.current.clear();
    setState('idle');
    setCurrentInstruction(null);
    setDistanceToNext(null);
    setDistanceToDestination(null);
    setEtaSeconds(null);
    setRouteGeometry([]);
  }, []);

  const startNavigation = useCallback(
    async (target: NavTarget, originOverride?: LatLon | null) => {
      setState('routing');
      targetRef.current = target;
      spokenRef.current.clear();
      stepIdxRef.current = 0;

      // Origine esplicita (es. "Indirizzo personalizzato" dal modal WIP Nav):
      // prima veniva sempre ignorata e si partiva comunque dal GPS.
      const last = locationService.getLastLocation();
      const from: LatLon = originOverride
        ? originOverride
        : last
          ? { lat: last.latitude, lon: last.longitude }
          : { lat: target.lat, lon: target.lon };

      const route = await fetchWalkingRoute(from, target, language, target.poiName);
      if (!route || route.steps.length === 0) {
        setState('idle');
        return;
      }
      routeRef.current = route;
      setRouteGeometry(route.geometry);
      setState('navigating');
      setCurrentInstruction(route.steps[0]?.instruction ?? null);
      setEtaSeconds(Math.round(route.distance / WALK_SPEED_MS));

      // Sottoscrizione al flusso GPS condiviso
      unsubRef.current = locationService.subscribe((loc) => {
        const t = targetRef.current;
        const r = routeRef.current;
        if (!t || !r) return;

        const here: LatLon = { lat: loc.latitude, lon: loc.longitude };

        // Distanza dalla destinazione + ETA
        const dDest = haversineMeters(here.lat, here.lon, t.lat, t.lon);
        setDistanceToDestination(Math.round(dDest));
        setEtaSeconds(Math.round(dDest / WALK_SPEED_MS));

        // Arrivo
        if (dDest <= ARRIVE_DISTANCE_M) {
          setState('arrived');
          const arriveStep = r.steps[r.steps.length - 1];
          speakInstruction(
            arriveStep?.instruction ||
              (language.startsWith('it') ? `Sei arrivato a ${t.poiName || ''}` : `You arrived`),
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
  };
}
