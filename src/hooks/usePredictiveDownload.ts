import { useState } from 'react';
import { Geolocation } from '@capacitor/geolocation';
import { supabase } from '../lib/supabase';
import { getDayPassState } from '../services/dayPassService';

export interface PredictiveBundleState {
  isOpen: boolean;
  city: string;
  lat: number;
  lon: number;
  pois: any[];
}

// L'offerta contestuale non deve diventare spam: al massimo una volta ogni 24h.
const OFFER_THROTTLE_KEY = 'wip_daypass_offer_last';
const OFFER_THROTTLE_MS = 24 * 60 * 60 * 1000;

/**
 * Offerta predittiva del Day Pass: quando l'utente attiva le cuffie in una
 * zona ricca di luoghi culturali, proponiamo il pass (DayPassOfferModal).
 * Sostituisce il vecchio bundle regionale al 50%.
 */
export function usePredictiveDownload() {
  const [bundleState, setBundleState] = useState<PredictiveBundleState>({
    isOpen: false,
    city: '',
    lat: 0,
    lon: 0,
    pois: []
  });

  const triggerBundleCheck = async () => {
    // Evitiamo attivazioni multiple
    if (bundleState.isOpen) return;

    // Piccolo delay per assicurarci che la posizione sia stabilizzata
    setTimeout(() => {
      checkDayPassOffer();
    }, 1500);
  };

  const checkDayPassOffer = async () => {
    try {
      // 1. Throttle: proposta al massimo una volta al giorno
      const last = Number(localStorage.getItem(OFFER_THROTTLE_KEY) || 0);
      if (Date.now() - last < OFFER_THROTTLE_MS) return;

      // 2. Con un pass già attivo non c'è nulla da vendere
      const pass = await getDayPassState().catch(() => null);
      if (pass?.active) return;

      // 3. Posizione attuale
      let lat = 0;
      let lon = 0;
      try {
        const position = await Geolocation.getCurrentPosition({ enableHighAccuracy: false, timeout: 5000 });
        lat = position.coords.latitude;
        lon = position.coords.longitude;
      } catch (e) {
        console.warn('Geolocation non disponibile per offerta Day Pass:', e);
        return;
      }

      // 4. Nome della città per il copy del popup
      let city = 'questa zona';
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=10`);
        const data = await res.json();
        city = data.address?.city || data.address?.town || data.address?.county || 'questa zona';
      } catch (e) {
        // Fallback silently
      }

      // 5. L'offerta ha senso solo dove c'è abbastanza da ascoltare
      const { data: nearbyPois, error } = await supabase.rpc('nearby_pois', {
        p_lat: lat,
        p_lon: lon,
        radius_m: 20000,
        limit_num: 50
      });
      if (error || !nearbyPois) return;

      const culturalPois = (nearbyPois as any[]).filter(p =>
        ['castle', 'museum', 'archaeological_site', 'church', 'monument', 'attraction', 'gemme',
         'monumenti', 'musei', 'chiese', 'panorami'].includes((p.category || '').toLowerCase()) || p.is_gem
      );
      if (culturalPois.length < 5) return;

      localStorage.setItem(OFFER_THROTTLE_KEY, String(Date.now()));
      setBundleState({
        isOpen: true,
        city,
        lat,
        lon,
        pois: culturalPois
      });
    } catch (e) {
      console.error('Errore nel check offerta Day Pass:', e);
    }
  };

  const closeBundle = () => setBundleState(prev => ({ ...prev, isOpen: false }));

  /**
   * Apertura ESPLICITA dell'offerta, fuori dal throttle: la chiede chi ha
   * appena sbattuto contro il cancello (il giro Dieci Tappe dal radar, 402
   * PASS_RICHIESTO). Evento `wip-open-daypass` {detail:{city?}} — App.tsx lo
   * ascolta. Se il pass e' gia' attivo non si apre nulla.
   */
  const openOffer = async (city?: string) => {
    const pass = await getDayPassState().catch(() => null);
    if (pass?.active) return;
    setBundleState(prev => ({ ...prev, isOpen: true, city: city || prev.city || 'questa zona' }));
  };

  return { bundleState, closeBundle, triggerBundleCheck, openOffer };
}
