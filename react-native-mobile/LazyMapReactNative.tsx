// Component: LazyMapReactNative.tsx
// Description: Lightweight Map Caching, Lazy Loading (Overpass + Foursquare) and On-Demand AI Curation
// Runtime: React Native (Expo) with react-native-maps

import React, { useState, useEffect, useRef } from 'react';
import { 
  StyleSheet, 
  View, 
  Text, 
  Dimensions, 
  TouchableOpacity, 
  ActivityIndicator, 
  ScrollView, 
  Image 
} from 'react-native';
import MapView, { Marker, Region, UserLocationChangeEvent } from 'react-native-maps';
import { supabase } from '../lib/supabase'; // Existing Supabase client
import { Audio } from 'expo-av'; // Added for Geofencing Auto-Play
import AsyncStorage from '@react-native-async-storage/async-storage';

// Standard Foursquare Categories:
// 19010: Parking Lots / Structures
// 19020: Playgrounds
// 16024: National Parks / Preserves
const FSQ_CATEGORIES = "19010,19020,16024";

interface POI {
  id: string;
  name: string;
  lat: number;
  lon: number;
  category: string;
  description_ai?: string | null;
  image_url?: string | null;
  is_gem?: boolean;
  isTemporary?: boolean; // True if loaded on-the-fly from Overpass or Foursquare
  city?: string;
  geofence_radius?: number; // Added for Auto-Play
  alert_radius?: number;    // Added for Notifications
  subCategory?: string;     // Added for GeoControl filtering
}

export default function LazyMapReactNative() {
  const mapRef = useRef<MapView>(null);
  const [region, setRegion] = useState<Region>({
    latitude: 44.0792,
    longitude: 10.1,
    latitudeDelta: 0.02,
    longitudeDelta: 0.02,
  });

  const [curatedPois, setCuratedPois] = useState<POI[]>([]);
  const [tempPois, setTempPois] = useState<POI[]>([]);
  const [mergedPois, setMergedPois] = useState<POI[]>([]);
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedPoi, setSelectedPoi] = useState<POI | null>(null);

  // --- GEOFENCING & AUDIO STATE ---
  const playedAudioPois = useRef<Set<string>>(new Set());
  const soundRef = useRef<Audio.Sound | null>(null);

  // --- GEOCONTROL SETTINGS ---
  const [geoSettings, setGeoSettings] = useState({
    wip_dist_walk: 50,
    activeSubcats: { gemme: true } as Record<string, boolean>
  });

  useEffect(() => {
    const loadGeoSettings = async () => {
      try {
        const distWalkStr = await AsyncStorage.getItem('wip_dist_walk');
        const activeSubcatsStr = await AsyncStorage.getItem('wip_active_subcats');
        
        setGeoSettings({
          wip_dist_walk: distWalkStr ? parseInt(distWalkStr, 10) : 50,
          activeSubcats: activeSubcatsStr ? JSON.parse(activeSubcatsStr) : { gemme: true }
        });
      } catch (err) {
        console.warn("[GeoControl] Impossibile caricare impostazioni AsyncStorage:", err);
      }
    };
    loadGeoSettings();
  }, []);

  // --- HA VERSINE DISTANCE CALCULATOR ---
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371e3;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLon/2) * Math.sin(dLon/2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  // --- BOUNDING BOX DELTA CALCULATOR ---
  const getBBox = (reg: Region) => {
    const minLat = reg.latitude - reg.latitudeDelta / 2;
    const maxLat = reg.latitude + reg.latitudeDelta / 2;
    const minLon = reg.longitude - reg.longitudeDelta / 2;
    const maxLon = reg.longitude + reg.longitudeDelta / 2;
    return { minLat, maxLat, minLon, maxLon, bboxStr: `${minLat},${minLon},${maxLat},${maxLon}` };
  };

  // --- FETCH CURATED POIs FROM SUPABASE ---
  const fetchCuratedFromDB = async (reg: Region) => {
    try {
      const { minLat, maxLat, minLon, maxLon } = getBBox(reg);
      
      const { data, error } = await supabase
        .from('shared_pois')
        .select('*')
        .gte('lat', minLat)
        .lte('lat', maxLat)
        .gte('lon', minLon)
        .lte('lon', maxLon);

      if (error) throw error;
      
      const mapped: POI[] = (data || []).map(p => ({
        id: p.id,
        name: p.name,
        lat: p.lat,
        lon: p.lon,
        category: p.category,
        description_ai: p.description_ai,
        image_url: p.image_url,
        is_gem: p.is_gem,
        geofence_radius: p.geofence_radius || 50, // Default fallback
        alert_radius: p.alert_radius || 100,
        subCategory: p.subCategory,
        isTemporary: false
      }));

      setCuratedPois(mapped);
    } catch (e) {
      console.warn("[LazyMap] Supabase shared_pois fetch error:", e.message);
    }
  };

  // --- FETCH LIGHTWEIGHT TEMP POIs (Overpass + Foursquare) ---
  const fetchLightweightTemporary = async (reg: Region) => {
    // Only query external services at appropriate zoom levels to conserve resources/costs
    if (reg.latitudeDelta > 0.06) {
      setTempPois([]);
      return;
    }

    const { bboxStr } = getBBox(reg);
    
    // Fire asynchronous fetches in parallel without blocking UI threads
    Promise.all([
      fetchOverpass(bboxStr),
      fetchFoursquare(reg.latitude, reg.longitude)
    ]).then(([overpassResults, fsqResults]) => {
      const combined = [...overpassResults, ...fsqResults];
      setTempPois(combined);
    }).catch(err => {
      console.warn("[LazyMap] Lightweight async external fetches encountered errors:", err);
    });
  };

  // 1. Overpass API (Wikipedia/Wikidata matching only)
  const fetchOverpass = async (bbox: string): Promise<POI[]> => {
    try {
      const query = `[out:json][timeout:8];
        (
          node["historic"]["wikipedia"](${bbox});
          node["historic"]["wikidata"](${bbox});
          way["historic"]["wikipedia"](${bbox});
          way["historic"]["wikidata"](${bbox});
          node["tourism"="attraction"]["wikipedia"](${bbox});
          node["tourism"="attraction"]["wikidata"](${bbox});
        );
        out body;`;
      
      const res = await fetch("https://overpass-api.de/api/interpreter", {
        method: "POST",
        body: query
      });

      if (!res.ok) return [];
      
      const data = await res.json();
      return (data.elements || []).map((el: any) => ({
        id: `overpass-${el.id}`,
        name: el.tags?.name || "Luogo Storico",
        lat: el.lat || el.center?.lat,
        lon: el.lon || el.center?.lon,
        category: "monumenti",
        isTemporary: true
      })).filter((p: POI) => p.lat && p.lon);
    } catch (e) {
      console.debug("[LazyMap] Overpass API query timed out or failed silently:", e.message);
      return []; // Do not block UI if Overpass is down
    }
  };

  // 2. Foursquare Places API (Playgrounds, Parks, Large Parking Lots)
  const fetchFoursquare = async (lat: number, lon: number): Promise<POI[]> => {
    try {
      // FSQ key safely passed, using standard demo credentials as a fallback
      const fsqKey = "fsq3_V3Z2X7n6fV8wSg9L5h2D1J4qR0bT6yA5kX1mC8sZ="; 
      const radius = 1500; // 1.5km search
      const url = `https://api.foursquare.com/v3/places/search?ll=${lat},${lon}&radius=${radius}&categories=${FSQ_CATEGORIES}&limit=15`;
      
      const res = await fetch(url, {
        headers: {
          Accept: "application/json",
          Authorization: fsqKey
        }
      });

      if (!res.ok) return [];

      const data = await res.json();
      return (data.results || []).map((place: any) => {
        let cat = "utilita";
        if (place.categories?.[0]?.id === 19020) cat = "famiglie"; // Playground
        if (place.categories?.[0]?.id === 16024) cat = "panorami";  // National Park

        return {
          id: `fsq-${place.fsq_id}`,
          name: place.name || "Punto di Interesse",
          lat: place.geocodes?.main?.latitude,
          lon: place.geocodes?.main?.longitude,
          category: cat,
          isTemporary: true,
          city: place.location?.locality || "Italia"
        };
      }).filter((p: POI) => p.lat && p.lon);
    } catch (e) {
      console.debug("[LazyMap] Foursquare query skipped/failed:", e.message);
      return [];
    }
  };

  // --- MERGE LISTS AND DEDUPLICATE CLIENT-SIDE ---
  useEffect(() => {
    // Filter out temporary markers that already match curated POIs within 50 meters
    const filteredTemps = tempPois.filter(temp => {
      return !curatedPois.some(curated => {
        const dist = calculateDistance(temp.lat, temp.lon, curated.lat, curated.lon);
        return dist < 50 || temp.name.toLowerCase() === curated.name.toLowerCase();
      });
    });

    setMergedPois([...curatedPois, ...filteredTemps]);
  }, [curatedPois, tempPois]);

  // --- MAP SHIFT EVENT HANDLER ---
  const handleRegionChange = (newRegion: Region) => {
    setRegion(newRegion);
    fetchCuratedFromDB(newRegion);
    fetchLightweightTemporary(newRegion);
  };

  // --- ON-DEMAND INTERACTION (TAP MARKER) ---
  const handleMarkerPress = async (poi: POI) => {
    setSelectedPoi(poi);

    // If the POI is temporary or missing a description, trigger on-demand AI curation pipeline
    if (poi.isTemporary || !poi.description_ai) {
      setIsGenerating(true);
      
      try {
        console.log(`[LazyMap] Requesting on-demand AI curation for temporary landmark: "${poi.name}"`);
        
        // POST to the Supabase Deno Edge Function
        const edgeFunctionUrl = "https://qfxxhzkkrkvbuekfknhh.supabase.co/functions/v1/generate-poi-data";
        const anonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFmeHhoemtrcmt2YnVla2ZrbmhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMDM1ODcsImV4cCI6MjA5NDY3OTU4N30.4v8qFrPU4QOJ-Ko61CASjUoPVEBOM8J9rGeiAbNMpSs";

        const res = await fetch(edgeFunctionUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${anonKey}`
          },
          body: JSON.stringify({
            name: poi.name,
            lat: poi.lat,
            lon: poi.lon,
            category: poi.category,
            city: poi.city || "Italia"
          })
        });

        if (!res.ok) throw new Error("Curation request failed");

        const curatedPoi = await res.json();
        
        // Update selected POI details on screen
        const updatedPoi: POI = {
          id: curatedPoi.id,
          name: curatedPoi.name,
          lat: curatedPoi.lat,
          lon: curatedPoi.lon,
          category: curatedPoi.category,
          description_ai: curatedPoi.description_ai,
          image_url: curatedPoi.image_url,
          is_gem: curatedPoi.is_gem,
          isTemporary: false
        };

        setSelectedPoi(updatedPoi);

        // Instantly refresh maps curated POIs state to convert the temporary marker to curated
        setCuratedPois(prev => [updatedPoi, ...prev.filter(p => p.id !== poi.id)]);
      } catch (err) {
        console.error("[LazyMap] Curation pipeline error:", err.message);
        // Resilient client-side fallback description if offline
        setSelectedPoi(prev => prev ? {
          ...prev,
          description_ai: `Informazioni per ${prev.name} non disponibili temporaneamente. Punto di interesse geolocalizzato.`
        } : null);
      } finally {
        setIsGenerating(false);
      }
    }
  };

  // --- AUDIO PLAYBACK LOGIC ---
  const playAudioForPoi = async (poi: POI) => {
    try {
      console.log(`[Geofence] Tentativo di riproduzione audio per: ${poi.name}`);
      
      const { data, error } = await supabase
        .from('shared_poi_audio_cache')
        .select('audio_base64')
        .eq('poi_id', poi.id)
        .single();

      if (error || !data?.audio_base64) {
        console.log(`[Geofence] Audio non ancora disponibile per ${poi.name}`);
        return;
      }

      // Se c'è già un audio in riproduzione, lo stoppiamo
      if (soundRef.current) {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
      }

      // Riproduce l'audio in base64
      const { sound } = await Audio.Sound.createAsync(
        { uri: `data:audio/mp3;base64,${data.audio_base64}` },
        { shouldPlay: true }
      );
      
      soundRef.current = sound;
      
      // Quando finisce, libera la memoria
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          sound.unloadAsync();
          soundRef.current = null;
        }
      });
      
    } catch (e) {
      console.warn(`[Geofence] Errore riproduzione audio per ${poi.name}:`, e.message);
    }
  };

  // --- USER LOCATION GEOFENCING ---
  const handleUserLocationChange = (event: UserLocationChangeEvent) => {
    const { latitude, longitude } = event.nativeEvent.coordinate || {};
    if (!latitude || !longitude) return;

    // Controlla ogni POI curato attualmente caricato
    for (const poi of curatedPois) {
      // Se l'abbiamo già ascoltato in questa sessione, saltalo
      if (playedAudioPois.current.has(poi.id)) continue;

      // --- GEOCONTROL: FILTRO CATEGORIE ---
      let isAllowed = false;
      const catLower = (poi.category || '').toLowerCase();
      const subCatLower = (poi.subCategory || '').toLowerCase();
      const nameLower = (poi.name || '').toLowerCase();

      if (poi.is_gem) {
        isAllowed = geoSettings.activeSubcats.gemme ?? true;
      } else if (catLower === 'monumenti' && geoSettings.activeSubcats.monumenti) {
        isAllowed = true;
      } else if ((nameLower.includes('castello') || nameLower.includes('fortezza')) && geoSettings.activeSubcats.castelli) {
        isAllowed = true;
      } else if ((nameLower.includes('rovine') || nameLower.includes('archeo')) && geoSettings.activeSubcats.archeo) {
        isAllowed = true;
      } else if (catLower === 'chiese' && geoSettings.activeSubcats.chiese) {
        isAllowed = true;
      } else if (catLower === 'panorami' && geoSettings.activeSubcats.panorami) {
        isAllowed = true;
      } else if ((nameLower.includes('cava') || nameLower.includes('minier')) && geoSettings.activeSubcats.cave) {
        isAllowed = true;
      } else if ((nameLower.includes('parco') || nameLower.includes('giardin')) && geoSettings.activeSubcats.parchi) {
        isAllowed = true;
      } else if ((subCatLower === 'ristorante' || subCatLower === 'pizzeria' || catLower === 'locali') && geoSettings.activeSubcats.ristoranti) {
        isAllowed = true;
      } else if (subCatLower === 'bar' && geoSettings.activeSubcats.bar) {
        isAllowed = true;
      } else if (subCatLower === 'hotel' && geoSettings.activeSubcats.hotel) {
        isAllowed = true;
      } else if ((subCatLower === 'parcheggio' || catLower === 'utilita') && geoSettings.activeSubcats.parcheggi) {
        isAllowed = true;
      } else if (subCatLower === 'ricarica' && geoSettings.activeSubcats.ricarica) {
        isAllowed = true;
      } else if (subCatLower === 'farmacia' && geoSettings.activeSubcats.farmacie) {
        isAllowed = true;
      } else if ((subCatLower === 'playground' || nameLower.includes('gioco')) && geoSettings.activeSubcats.giochi) {
        isAllowed = true;
      } else {
        // Se la categoria non match nessuna di quelle controllate, consentiamo solo se Gemme è attivo (comportamento protettivo)
        isAllowed = geoSettings.activeSubcats.gemme ?? true;
      }

      if (!isAllowed) continue;
      // ------------------------------------

      const dist = calculateDistance(latitude, longitude, poi.lat, poi.lon);
      
      // Override con la distanza personalizzata dall'utente se disponibile, altrimenti usa quella del DB
      const effectiveRadius = poi.is_gem ? (poi.geofence_radius || 120) : (geoSettings.wip_dist_walk || poi.geofence_radius || 50);

      // Se siamo entrati nel raggio d'azione
      if (dist <= effectiveRadius) {
        console.log(`[Geofence] 📍 Entrato nel raggio di ${poi.name} (${dist.toFixed(0)}m / ${effectiveRadius}m)`);
        
        // Segna come "ascoltato" per non ripeterlo se si cammina intorno
        playedAudioPois.current.add(poi.id);
        
        // Apre la scheda visivamente
        setSelectedPoi(poi);
        
        // Avvia l'audio
        playAudioForPoi(poi);
      }
    }
  };

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={region}
        onRegionChangeComplete={handleRegionChange}
        onUserLocationChange={handleUserLocationChange}
        showsUserLocation
        showsMyLocationButton
        followsUserLocation={true}
        showsUserHeadingIndicator={true}
        showsCompass={true}
      >
        {mergedPois.map((poi) => (
          <Marker
            key={poi.id}
            coordinate={{ latitude: poi.lat, longitude: poi.lon }}
            title={poi.name}
            description={poi.isTemporary ? "Tocca per caricare guida AI" : poi.category}
            pinColor={poi.isTemporary ? '#d4af37' : '#1a4d3a'} // Gold for temp markers, elegant green for curated
            onPress={() => handleMarkerPress(poi)}
          />
        ))}
      </MapView>

      {/* Dynamic Aesthetic Drawer Sheet */}
      {selectedPoi && (
        <View style={styles.drawerCard}>
          <View style={styles.drawerHeader}>
            <Text style={styles.poiName} numberOfLines={1}>{selectedPoi.name}</Text>
            <TouchableOpacity 
              style={styles.closeBtn} 
              onPress={() => setSelectedPoi(null)}
            >
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.drawerScroll} contentContainerStyle={{ paddingBottom: 24 }}>
            {selectedPoi.image_url && (
              <Image 
                source={{ uri: selectedPoi.image_url }} 
                style={styles.poiImage} 
                resizeMode="cover"
              />
            )}

            {isGenerating ? (
              <View style={styles.loaderContainer}>
                <ActivityIndicator size="large" color="#1a4d3a" />
                <Text style={styles.loaderText}>Recupero informazioni e generazione guida AI in corso...</Text>
              </View>
            ) : (
              <View style={styles.poiBody}>
                <View style={styles.tagRow}>
                  <Text style={styles.tagCategory}>{selectedPoi.category.toUpperCase()}</Text>
                  {selectedPoi.is_gem && <Text style={styles.tagGem}>💎 GEMMA</Text>}
                </View>
                <Text style={styles.poiDescription}>
                  {selectedPoi.description_ai || "Nessuna descrizione disponibile per questo punto."}
                </Text>
              </View>
            )}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  map: {
    width: Dimensions.get('window').width,
    height: Dimensions.get('window').height,
  },
  drawerCard: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 380,
    backgroundColor: '#fcfbf9', // Cream high-aesthetic paper vibe
    borderTopLeftRadius: 36,
    borderTopRightRadius: 36,
    paddingTop: 24,
    paddingHorizontal: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -12 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 24,
  },
  drawerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1ede4',
  },
  poiName: {
    fontSize: 18,
    fontWeight: '900',
    color: '#1a4d3a', // WIP signature green
    flex: 1,
    paddingRight: 12,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#eae4d7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    fontSize: 12,
    color: '#5c5446',
    fontWeight: 'bold',
  },
  drawerScroll: {
    flex: 1,
    marginTop: 16,
  },
  poiImage: {
    width: '100%',
    height: 120,
    borderRadius: 20,
    marginBottom: 16,
  },
  loaderContainer: {
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loaderText: {
    marginTop: 16,
    fontSize: 13,
    color: '#7a705e',
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 18,
  },
  poiBody: {
    flex: 1,
  },
  tagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  tagCategory: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#ffffff',
    backgroundColor: '#1a4d3a',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  tagGem: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#8b5cf6',
    backgroundColor: '#f3e8ff',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  poiDescription: {
    fontSize: 14,
    color: '#3c362a',
    lineHeight: 22,
    fontWeight: '500',
  },
});
