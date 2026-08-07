/**
 * useSmartGeofence.ts
 * Hook React per integrare SmartGeofenceManager in itainta
 * 
 * Uso:
 * const { mode, activeBanner, activeCard, dismissBanner, setManualMode } = useSmartGeofence(pois);
 */

'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { SmartGeofenceManager } from './SmartGeofenceManager';
import type { TransportMode } from './transportDetector';
import type { POI } from './categoryFilter';

export interface BannerState {
  poi: POI;
  distance: number;
  message: string;
}

export interface GeofenceState {
  mode: TransportMode;
  activeBanner: BannerState | null;
  activeCard: POI | null;
  isRunning: boolean;
}

export function useSmartGeofence(pois: POI[]) {
  const managerRef = useRef<SmartGeofenceManager | null>(null);
  const [mode, setMode] = useState<TransportMode>('walking');
  const [activeBanner, setActiveBanner] = useState<BannerState | null>(null);
  const [activeCard, setActiveCard] = useState<POI | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  // Inizializza manager
  useEffect(() => {
    const manager = new SmartGeofenceManager({
      onBanner: (poi, distance, message) => {
        setActiveBanner({ poi, distance, message });
      },
      onCard: (poi) => {
        setActiveBanner(null);  // banner cede il posto alla scheda completa
        setActiveCard(poi);
      },
      onDismiss: (poi) => {
        setActiveBanner(prev => prev?.poi.id === poi.id ? null : prev);
      },
      onModeChange: (newMode) => {
        setMode(newMode);
      },
    });

    managerRef.current = manager;
    return () => { manager.stop(); };
  }, []);

  // Aggiorna POI quando cambiano
  useEffect(() => {
    managerRef.current?.setPOIs(pois);
  }, [pois]);

  const start = useCallback(() => {
    managerRef.current?.start();
    setIsRunning(true);
  }, []);

  const stop = useCallback(() => {
    managerRef.current?.stop();
    setIsRunning(false);
  }, []);

  const dismissBanner = useCallback(() => {
    if (activeBanner) {
      managerRef.current?.resetPOI(activeBanner.poi.id);
      setActiveBanner(null);
    }
  }, [activeBanner]);

  const dismissCard = useCallback(() => {
    if (activeCard) {
      managerRef.current?.resetPOI(activeCard.id);
      setActiveCard(null);
    }
  }, [activeCard]);

  const setManualMode = useCallback((m: TransportMode) => {
    managerRef.current?.setManualMode(m);
    setMode(m);
  }, []);

  return {
    mode,
    activeBanner,
    activeCard,
    isRunning,
    start,
    stop,
    dismissBanner,
    dismissCard,
    setManualMode,
  };
}
