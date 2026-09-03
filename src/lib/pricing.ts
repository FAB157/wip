import { supabase } from './supabase';
import { getUserProfile } from './quotaManager';
import { getApiUrl } from './api';

export const PRICING_LIST = {
  poi_detail: 5,         // Arricchimento POI
  photo_search: 5,       // Vision
  audio_guide: 15,       // Audioguida (TTS)
  itinerary_daily: 10,     // Pianificazione itinerario (per giorno)
  // Sostituzione di una singola tappa. Voce dedicata e INTERA: prima si usava
  // `audio_guide * 0.5` = 7,5 crediti, un valore frazionario che il wallet
  // (e la RPC consume_credits) non è pensato per gestire.
  replace_stop: 8,
  // "➕ Aggiungi un giorno" / "➕ Aggiungi una tappa vicina" (gita fuori
  // porta) su un itinerario ESISTENTE. Prezzo pieno; se il giorno viene
  // servito dalla cache della Libreria (già generato e verificato) il
  // server rimborsa automaticamente metà del costo a fine richiesta.
  extend_itinerary_day: 12,
  premium_guide_daily: 20, // Guida in PDF (per giorno)
  podcast_daily: 15,       // Podcast (per giorno)
  chat_session: 3,         // Chat sessione (10 messaggi)
  day_pass: 200,           // WIP Day Pass: 24h hands-free, max 40 audioguide (mappe offline gratuite)
  museum_pass: 100,        // Pass Museo: riconoscimenti Vision illimitati per 4 ore (indoor)
  // PERCORSO SU MISURA (03/09/2026): luoghi di qualsiasi categoria scelti
  // dalla mappa, ordine ottimizzato e navigatore WIP, SENZA audioguida e
  // senza Day Pass. Un addebito a percorso, tre modifiche incluse. Allineare
  // a PERCORSO_COSTO / PERCORSO_MODIFICHE_MAX in server.ts.
  custom_route: 30,
};

/** Modifiche (aggiungi/togli luogo) incluse nel prezzo del percorso su misura. */
export const CUSTOM_ROUTE_MAX_CHANGES = 3;

/** Durata del Pass Museo in ore. Allineare a MUSEUM_PASS_HOURS in server.ts. */
export const MUSEUM_PASS_HOURS = 4;

/** Cap audioguide del Day Pass nelle 24 ore. */
export const DAY_PASS_GUIDE_CAP = 40;

export type PricingFeature = keyof typeof PRICING_LIST;

/**
 * LISTINO MODIFICABILE SENZA DEPLOY.
 *
 * I prezzi qui sopra restano i valori di riferimento cablati, ma l'admin puo'
 * sovrascriverli dal pannello (rotta `/api/admin/pricing`, salvataggio in
 * `api_cache`). Il server e' comunque l'autorita': addebita usando il proprio
 * listino effettivo. Questa funzione serve solo a far vedere all'utente lo
 * STESSO prezzo che gli verra' addebitato, invece di uno vecchio.
 *
 * Si chiama una volta all'avvio (App.tsx) ed e' volutamente fail-open: se la
 * rotta non risponde restano i valori cablati, che e' esattamente ciò che
 * l'app faceva prima.
 */
let listinoAllineato = false;
export async function allineaListino(): Promise<void> {
  if (listinoAllineato) return;
  listinoAllineato = true;
  try {
    const r = await fetch(getApiUrl('/api/pricing'), { signal: AbortSignal.timeout(6000) });
    if (!r.ok) return;
    const j = await r.json();
    const remoto = j?.pricing;
    if (!remoto || typeof remoto !== 'object') return;
    for (const [k, v] of Object.entries(remoto)) {
      // Solo voci gia' note e solo numeri interi sensati: una risposta
      // malformata non deve poter azzerare o gonfiare un prezzo.
      if (k in PRICING_LIST && Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) <= 10000) {
        (PRICING_LIST as Record<string, number>)[k] = Math.round(Number(v));
      }
    }
  } catch { /* listino cablato: comportamento identico a prima */ }
}

// Si allinea da solo all'avvio, ma SOLO nel browser: gli script di
// manutenzione importano questo modulo e non devono fare richieste di rete.
// Non si aspetta il risultato: nel frattempo valgono i prezzi cablati.
if (typeof window !== 'undefined') { void allineaListino(); }

export interface WalletBalance {
  purchased: number;
  earned: number;
  total: number;
}

/**
 * Evento globale emesso a ogni variazione del wallet (consumo, rimborso,
 * accredito). I componenti che mostrano il saldo (UserProfileSummary,
 * ProfileScreen, ShopScreen, ZeroCreditsBanner) lo ascoltano per
 * ri-fetchare subito il bilancio, senza aspettare un remount.
 */
export const CREDITS_UPDATED_EVENT = 'wip-credits-updated';

export function notifyCreditsChanged(detail?: { userId?: string; delta?: number }) {
  try {
    window.dispatchEvent(new CustomEvent(CREDITS_UPDATED_EVENT, { detail }));
  } catch { /* SSR/ambienti senza window */ }
}

/**
 * Ritorna il bilancio crediti attuale dell'utente
 */
export async function getWalletBalance(userId: string): Promise<WalletBalance> {
  const profile = await getUserProfile(userId);
  const purchased = Number(profile.purchased_credits) || 0;
  const earned = Number(profile.earned_credits) || 0;
  
  return {
    purchased,
    earned,
    total: purchased + earned
  };
}

/**
 * Controlla se l'utente ha abbastanza crediti per il servizio richiesto.
 */
export async function hasEnoughCredits(userId: string, cost: number): Promise<boolean> {
  const balance = await getWalletBalance(userId);
  return balance.total >= cost;
}

/**
 * Consuma i crediti necessari usando la stored procedure (che preleva prima da earned, poi da purchased).
 * Ritorna true se l'operazione ha successo.
 */
export async function consumeCredits(userId: string, cost: number): Promise<boolean> {
  if (cost <= 0) return true;

  // Consumo SERVER-SIDE: scrivere i crediti dal browser è bloccato dal trigger
  // anti-escalation su user_profiles (prima il fallback client-side falliva in
  // silenzio, lasciando il servizio gratis o l'utente senza addebito). Il
  // server addebita con la RPC atomica (o service key) e ritorna 402 se il
  // saldo non basta.
  try {
    const { data: sess } = await supabase.auth.getSession();
    const token = sess?.session?.access_token;
    if (!token) return false;

    const res = await fetch(getApiUrl('/api/credits/consume'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ amount: cost }),
    });
    if (res.ok) {
      notifyCreditsChanged({ userId, delta: -cost });
      return true;
    }
    return false; // 402 crediti insufficienti o errore
  } catch (err) {
    console.error('[pricing] Exception consuming credits:', err);
    return false;
  }
}

/**
 * Rimborsa i crediti (aggiungendoli ai purchased_credits).
 * Percorso primario: RPC atomica `refund_credits` (SECURITY DEFINER, opera solo
 * su auth.uid()). Il vecchio read-modify-write client-side resta come fallback
 * finché la migration 20260731120000_security_hardening non è applicata; dopo,
 * la RLS lo blocca e resta solo il percorso sicuro.
 */
export async function refundCredits(userId: string, cost: number): Promise<boolean> {
  if (cost <= 0) return true;
  // Rimborso SERVER-MEDIATO. La RPC self-service `refund_credits` è stata
  // revocata dal client (chiunque poteva rimborsarsi senza fallimento reale →
  // tutto gratis). Il vecchio fallback read-modify-write su purchased_credits è
  // ora bloccato dal trigger anti-escalation. Unico percorso: la rotta server
  // /api/credits/refund (service key, cap sull'importo).
  try {
    const { data: sess } = await supabase.auth.getSession();
    const token = sess?.session?.access_token;
    if (!token) return false;

    const res = await fetch(getApiUrl('/api/credits/refund'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ amount: cost }),
    });
    if (!res.ok) {
      console.warn('[pricing] Rimborso server fallito:', res.status);
      return false;
    }
    notifyCreditsChanged({ userId, delta: cost });
    return true;
  } catch (e) {
    console.error('[pricing] Refund exception:', e);
    return false;
  }
}

