/**
 * «L'INGRESSO E` QUI» (03/09/2026, collaudo a Massa).
 *
 * WIP Nav ha portato il committente sul retro del Teatro Guglielmi: in banca
 * dati l'«ingresso» era il civico piu' vicino (la pizzeria dietro), e non
 * c'era nessun modo di correggerlo dall'app. Questo tasto, SOLO per gli
 * admin, prende la posizione GPS attuale — chi lo preme sta davanti alla
 * porta — e la scrive come ingresso dichiarato del POI
 * (POST /api/admin/poi/entrance: shared_pois.entrance_lat/lon +
 * poi_entrances livello 'dichiarato'). Da quel momento navigatore, giro e
 * geofence arrivano li'. Il server rifiuta punti a piu' di 250 m dal luogo.
 */
import { useState } from 'react';
import { DoorOpen, Loader2, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getApiUrl } from '../lib/api';
import { notify } from '../lib/toast';
import { getTranslation, type Language } from '../lib/i18n';

interface Props {
  poi: any;
  language: Language;
}

export default function IngressoQuiButton({ poi, language }: Props) {
  const [stato, setStato] = useState<'idle' | 'busy' | 'fatto'>('idle');
  const t = (k: string) => getTranslation(k, language);

  const salva = async () => {
    if (stato === 'busy' || !poi?.id) return;
    if (typeof navigator === 'undefined' || !navigator.geolocation) { notify(t('sk_ingresso_errore')); return; }
    setStato('busy');
    navigator.geolocation.getCurrentPosition(
      async (p) => {
        try {
          const { data: s } = await supabase.auth.getSession();
          const token = s?.session?.access_token;
          const res = await fetch(getApiUrl('/api/admin/poi/entrance'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            body: JSON.stringify({ poiId: poi.id, lat: p.coords.latitude, lon: p.coords.longitude, note: `accuratezza ${Math.round(p.coords.accuracy)} m` }),
          });
          const data = await res.json().catch(() => null);
          if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
          // Il POI in mano alla scheda cambia porta da subito: chi preme
          // «Naviga» un attimo dopo deve gia' andare li'.
          try { poi.entrance_lat = p.coords.latitude; poi.entrance_lon = p.coords.longitude; } catch { /* oggetto congelato */ }
          setStato('fatto');
          notify(t('sk_ingresso_salvato').replace('{m}', String(data?.distanza_m ?? '')), 'success');
        } catch (e: any) {
          setStato('idle');
          notify(`${t('sk_ingresso_errore')} ${e?.message || ''}`.trim());
        }
      },
      () => { setStato('idle'); notify(t('sk_ingresso_errore')); },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 },
    );
  };

  return (
    <button
      onClick={salva}
      disabled={stato !== 'idle'}
      className={`mb-6 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[12px] font-black border transition-all active:scale-95 ${
        stato === 'fatto'
          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
          : 'bg-amber-50 text-amber-900 border-amber-200 hover:bg-amber-100'
      } disabled:opacity-70`}
      title={t('sk_ingresso_qui_hint')}
    >
      {stato === 'busy' ? <Loader2 className="w-4 h-4 animate-spin" /> : stato === 'fatto' ? <Check className="w-4 h-4" /> : <DoorOpen className="w-4 h-4" />}
      {stato === 'fatto' ? t('sk_ingresso_salvato_breve') : t('sk_ingresso_qui')}
      <span className="text-[9px] font-bold uppercase tracking-wide opacity-60">admin</span>
    </button>
  );
}
