// =====================================================================
// ITAINTA · useMapPois — POI sulla mappa con logica DB-first + fallback
// Step 1: get_nearby_pois(500m)
// Step 2: se >= 5 risultati -> usa il DB, stop
// Step 3: se < 5 -> area gia' indicizzata? si -> stop (rispetta cancellazioni)
//                   no -> Overpass discovery -> ricarica dal DB
// Cache React Query: staleTime 60s · refetch solo se spostamento > 200m
// =====================================================================

import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getNearbyPois, isAreaIndexed } from '../services/poiRepository';
import { runOverpassDiscovery } from '../services/poiDiscovery';
import { haversineMeters } from '../lib/geo';
import type { NearbyPoi } from '../types/poi';

const MIN_RESULTS = 8; // Aumentato per una mappa più densa
const RADIUS = 800;    // Raggio di ricerca aumentato
const MOVE_THRESHOLD_M = 300; // Riduce i refetch non necessari
const STALE_MS = 60_000;

export interface Center {
  lat: number;
  lon: number;
}

async function loadPois(lat: number, lon: number): Promise<NearbyPoi[]> {
  const dbPois = await getNearbyPois(lat, lon, RADIUS);
  // Rimosso: if (dbPois.length >= MIN_RESULTS) return dbPois;
  // Questo permette a Overpass di girare (se l'area non è indicizzata) 
  // e di scaricare farmacie, taxi, parchi, ecc., arricchendo sempre il database locale!

  const isIndexed = await isAreaIndexed(lat, lon);
  if (isIndexed) return dbPois;

  // Area non indicizzata e pochi risultati: semina il DB tramite Overpass
  const discoveryResult = await runOverpassDiscovery(lat, lon, RADIUS);
  
  // Rilegge dal DB dopo il seeding
  const updatedDbPois = await getNearbyPois(lat, lon, RADIUS);
  
  // Fallback istantaneo: se per latenza il DB non li mostra subito, uniamo i nuovi scoperti (mockandoli come NearbyPoi)
  if (updatedDbPois.length < MIN_RESULTS && discoveryResult.freshPois && discoveryResult.freshPois.length > 0) {
    const immediatePois: NearbyPoi[] = discoveryResult.freshPois.map(p => ({
      id: p.osm_id.toString().startsWith('osm-') || p.osm_id.toString().startsWith('fsq_') || p.osm_id.toString().startsWith('geo_')
          ? p.osm_id.toString()
          : `osm-${p.osm_id}`,
      name: p.name,
      lat: p.lat,
      lon: p.lon,
      category: p.category as any,
      status: 'verified',
      is_gem: false,
      distance_meters: haversineMeters(lat, lon, p.lat, p.lon)
    } as unknown as NearbyPoi));
    
    // Uniamo senza duplicati
    const existingIds = new Set(updatedDbPois.map(p => p.id));
    const toAdd = immediatePois.filter(p => !existingIds.has(p.id));
    return [...updatedDbPois, ...toAdd];
  }
  
  return updatedDbPois;
}

export interface UseMapPoisResult {
  pois: NearbyPoi[];
  isLoading: boolean;
  isFetching: boolean;
  refetch: () => void;
}

/**
 * @param center centro mappa corrente (null = disabilitato)
 */
export function useMapPois(center: Center | null): UseMapPoisResult {
  // "Centro stabile": aggiornato solo quando ci si sposta oltre la soglia,
  // cosi' React Query non rifetcha a ogni micro-movimento.
  const [stableCenter, setStableCenter] = useState<Center | null>(center);
  const lastRef = useRef<Center | null>(center);

  useEffect(() => {
    if (!center) return;
    const timeoutId = setTimeout(() => {
      const last = lastRef.current;
      if (!last || haversineMeters(last.lat, last.lon, center.lat, center.lon) > MOVE_THRESHOLD_M) {
        lastRef.current = center;
        setStableCenter(center);
      }
    }, 800); // 800ms time-based debounce
    
    return () => clearTimeout(timeoutId);
  }, [center]);

  const key = stableCenter
    ? [
        'map-pois',
        stableCenter.lat.toFixed(3),
        stableCenter.lon.toFixed(3),
      ]
    : ['map-pois', 'none'];

  const query = useQuery({
    queryKey: key,
    queryFn: () => loadPois(stableCenter!.lat, stableCenter!.lon),
    enabled: !!stableCenter,
    staleTime: STALE_MS,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  // Accumula i POI per evitare che scompaiano durante lo spostamento
  const [accumulatedPois, setAccumulatedPois] = useState<NearbyPoi[]>([]);
  
  useEffect(() => {
    if (query.data && query.data.length > 0) {
      setAccumulatedPois(prev => {
        // Map of incoming POIs, keeping the FIRST one for each ID (which is the best one due to DB ordering)
        const dataMap = new Map();
        for (const p of query.data) {
          if (!dataMap.has(p.id)) {
            dataMap.set(p.id, p);
          }
        }
        
        // Update existing POIs with incoming fresh data (which might contain photos now)
        const updatedPrev = prev.map(p => dataMap.has(p.id) ? { ...p, ...dataMap.get(p.id) } : p);
        
        // Find completely new ones
        const prevIds = new Set(prev.map(p => p.id));
        const newPois = query.data.filter(p => !prevIds.has(p.id));
        
        let updated = [...updatedPrev, ...newPois];

        // DEDUPLICAZIONE per nome e vicinanza (se hanno lo stesso nome ed entro 100m, tieni quello con foto)
        const nameMap = new Map<string, NearbyPoi>();
        for (const p of updated) {
          const key = p.name?.toLowerCase().trim();
          if (!key) continue;
          
          if (nameMap.has(key)) {
            const existing = nameMap.get(key)!;
            // Se sono vicini (meno di 100m), deduplichiamo
            if (haversineMeters(p.lat, p.lon, existing.lat, existing.lon) < 100) {
               // Chi vince? Quello con la foto!
               const existingHasPhoto = !!(existing.photo_url || (existing as any).image_url || (existing as any).description_ai);
               const newHasPhoto = !!(p.photo_url || (p as any).image_url || (p as any).description_ai);
               if (newHasPhoto && !existingHasPhoto) {
                 nameMap.set(key, p);
               } else if (!newHasPhoto && !existingHasPhoto && (p as any).is_gem && !(existing as any).is_gem) {
                 nameMap.set(key, p);
               }
            } else {
              // Stesso nome ma lontani: tieni entrambi (aggiungi un suffisso finto per non sovrascrivere)
              nameMap.set(`${key}_${p.id}`, p);
            }
          } else {
            nameMap.set(key, p);
          }
        }
        
        updated = Array.from(nameMap.values());

        // Limite di sicurezza: mantieni solo gli ultimi 500 POI
        if (updated.length > 500) {
          updated = updated.slice(-500);
        }
        return updated;
      });
    }
  }, [query.data]);

  return {
    pois: accumulatedPois.length > 0 ? accumulatedPois : (query.data ?? []),
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    refetch: () => query.refetch(),
  };
}
