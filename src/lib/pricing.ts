import { supabase } from './supabase';
import { getUserProfile } from './quotaManager';

export const PRICING_LIST = {
  poi_detail: 5,         // Arricchimento POI
  photo_search: 5,       // Vision
  audio_guide: 15,       // Audioguida (TTS)
  itinerary_daily: 10,     // Pianificazione itinerario (per giorno)
  premium_guide_daily: 20, // Guida in PDF (per giorno)
  podcast_daily: 15,       // Podcast (per giorno)
  chat_session: 3,         // Chat sessione (10 messaggi)
  day_pass: 200,           // WIP Day Pass: 24h hands-free, max 40 audioguide (mappe offline gratuite)
};

/** Cap audioguide del Day Pass nelle 24 ore. */
export const DAY_PASS_GUIDE_CAP = 40;

export type PricingFeature = keyof typeof PRICING_LIST;

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
  
  try {
    const { data, error } = await supabase.rpc('consume_credits', { p_user_id: userId, p_amount: cost });
    if (error) {
      console.warn('[pricing] RPC consume_credits failed, using fallback:', error.message);
      return await consumeCreditsFallback(userId, cost);
    }
    if (data === true) notifyCreditsChanged({ userId, delta: -cost });
    return data === true;
  } catch (err) {
    console.error('[pricing] Exception consuming credits:', err);
    return await consumeCreditsFallback(userId, cost);
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
  try {
    const { data, error } = await supabase.rpc('refund_credits', { p_amount: cost });
    if (!error) {
      if (data === true) notifyCreditsChanged({ userId, delta: cost });
      return data === true;
    }
    console.warn('[pricing] RPC refund_credits non disponibile, uso il fallback:', error.message);
  } catch (e) {
    console.warn('[pricing] RPC refund_credits exception:', e);
  }

  try {
    const profile = await getUserProfile(userId);
    const purchased = Number(profile.purchased_credits) || 0;
    const { error } = await supabase.from('user_profiles').update({
      purchased_credits: purchased + cost
    }).eq('id', userId);

    if (error) {
      console.error('[pricing] Refund failed:', error);
      return false;
    }
    notifyCreditsChanged({ userId, delta: cost });
    return true;
  } catch (e) {
    console.error('[pricing] Refund exception:', e);
    return false;
  }
}

async function consumeCreditsFallback(userId: string, cost: number): Promise<boolean> {
  try {
    const profile = await getUserProfile(userId);
    let earned = Number(profile.earned_credits) || 0;
    let purchased = Number(profile.purchased_credits) || 0;
    
    if (earned + purchased < cost) {
      return false;
    }
    
    let remainingCost = cost;
    if (earned >= remainingCost) {
      earned -= remainingCost;
      remainingCost = 0;
    } else {
      remainingCost -= earned;
      earned = 0;
    }
    
    if (remainingCost > 0) {
      // Guardia anti-negativo: tra la lettura e la scrittura il saldo può
      // essere cambiato (doppio click, seconda scheda) — mai sotto zero.
      if (purchased < remainingCost) return false;
      purchased -= remainingCost;
    }
    
    const { error } = await supabase.from('user_profiles').update({
      earned_credits: earned,
      purchased_credits: purchased
    }).eq('id', userId);
    
    if (error) {
      console.error('[pricing] Fallback update failed:', error);
      return false;
    }
    notifyCreditsChanged({ userId, delta: -cost });
    return true;
  } catch (e) {
    console.error('[pricing] Fallback exception:', e);
    return false;
  }
}
