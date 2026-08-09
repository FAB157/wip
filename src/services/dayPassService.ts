// WIP Day Pass + billing offline — orchestrazione JS.
//
// Modello freemium: mappe e teaser gratuiti; audioguida completa a pagamento:
// - Day Pass (PRICING_LIST.day_pass crediti): 24h hands-free, cap 40 guide.
//   Acquisto via consume_credits + riga in user_passes; il mirror nativo
//   (prefs) permette al receiver di farla rispettare a display spento e offline.
// - Per-listen: online il flusso esistente; offline il plugin annota la spesa
//   nel registro locale (tetto = snapshot saldo) e qui la riconciliamo.

import { registerPlugin } from '@capacitor/core';
import { supabase } from '../lib/supabase';
import {
  PRICING_LIST,
  DAY_PASS_GUIDE_CAP,
  consumeCredits,
  refundCredits,
  hasEnoughCredits,
  getWalletBalance,
  notifyCreditsChanged,
  CREDITS_UPDATED_EVENT,
} from '../lib/pricing';
import { isNativeOfflineSupported } from './offlinePackageService';

const plugin = registerPlugin<any>('ItaintaBackgroundPoiPlugin');

export const DAY_PASS_COST = PRICING_LIST.day_pass;
export const DAY_PASS_CAP = DAY_PASS_GUIDE_CAP;
export const DAY_PASS_UPDATED_EVENT = 'wip-daypass-updated';

export interface DayPassState {
  active: boolean;
  expiresAt: number; // epoch ms
  used: number;
  cap: number;
}

/** Stato del pass: fonte nativa (vale anche offline), fallback server. */
export async function getDayPassState(): Promise<DayPassState> {
  if (isNativeOfflineSupported()) {
    try {
      const s = await plugin.getDayPassState();
      return {
        active: !!s?.active,
        expiresAt: Number(s?.expiresAt) || 0,
        used: Number(s?.used) || 0,
        cap: Number(s?.cap) || 0,
      };
    } catch { /* fallthrough al server */ }
  }
  try {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id;
    if (!userId) return { active: false, expiresAt: 0, used: 0, cap: 0 };
    const { data } = await supabase
      .from('user_passes')
      .select('expires_at,guides_used,guides_cap')
      .eq('user_id', userId)
      .gt('expires_at', new Date().toISOString())
      .order('expires_at', { ascending: false })
      .limit(1);
    const row = data?.[0];
    if (!row) return { active: false, expiresAt: 0, used: 0, cap: 0 };
    const expiresAt = new Date(row.expires_at).getTime();
    return {
      active: row.guides_used < row.guides_cap,
      expiresAt,
      used: row.guides_used,
      cap: row.guides_cap,
    };
  } catch {
    return { active: false, expiresAt: 0, used: 0, cap: 0 };
  }
}

/**
 * Acquisto del Day Pass: scala i crediti (earned prima di purchased, RPC
 * atomica), registra il pass sul server e lo specchia nel nativo. Rimborso
 * integrale se la registrazione fallisce.
 */
export async function activateDayPass(): Promise<DayPassState> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id;
  if (!userId) throw new Error('Accedi per attivare il Day Pass.');

  // ATTIVAZIONE ATOMICA VIA RPC: l'INSERT diretto su user_passes è stato
  // rimosso (permetteva un pass gratis con cap arbitrario). activate_day_pass
  // verifica "nessun pass attivo", addebita 200 crediti e inserisce con
  // cap=40/24h lato server, tutto in una transazione.
  const { data: passRow, error: rpcError } = await supabase.rpc('activate_day_pass');
  if (rpcError) {
    const m = rpcError.message || '';
    if (m.includes('insufficient_credits')) {
      throw new Error(`Crediti insufficienti: il Day Pass costa ${DAY_PASS_COST} crediti.`);
    }
    if (m.includes('pass_already_active')) throw new Error('Hai già un Day Pass attivo.');
    if (m.includes('login_required')) throw new Error('Accedi per attivare il Day Pass.');
    throw new Error('Attivazione non riuscita. Riprova.');
  }
  const expiresAtMs = passRow?.expires_at ? new Date(passRow.expires_at).getTime() : Date.now() + 24 * 60 * 60 * 1000;
  notifyCreditsChanged({ userId });

  // Mirror nativo: da qui in poi receiver e service lo applicano da soli,
  // anche a display spento e senza rete.
  if (isNativeOfflineSupported()) {
    try {
      await plugin.setDayPass({ expiresAt: expiresAtMs, cap: DAY_PASS_CAP, used: 0 });
    } catch { /* il fallback server resta valido */ }
  }

  const state: DayPassState = { active: true, expiresAt: expiresAtMs, used: 0, cap: DAY_PASS_CAP };
  try { window.dispatchEvent(new CustomEvent(DAY_PASS_UPDATED_EVENT, { detail: state })); } catch { /* SSR */ }
  return state;
}

/**
 * Riconciliazione (da chiamare online): 1) spesa per-listen offline →
 * consume_credits e svuotamento del registro; 2) contatore pass nativo →
 * server (mai a scendere, il trigger DB fa da guardia); 3) snapshot saldo →
 * nativo, come tetto per la prossima sessione offline.
 */
export async function reconcileOfflineBilling(): Promise<void> {
  if (!isNativeOfflineSupported()) return;
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id;
  if (!userId) return;

  // 0) Identità utente → nativo: serve al check "già ascoltato = già
  // acquistato" del trigger in background e all'insert dello storico ascolti
  // nativo (user_listening_history). Il token permette le RLS; se scade, il
  // nativo resta best-effort.
  try {
    const { data: sess } = await supabase.auth.getSession();
    await plugin.setUserContext({
      userId,
      accessToken: sess?.session?.access_token || '',
    });
  } catch { /* metodo assente su build vecchie: best-effort */ }

  // 1) Registro spese per-listen offline
  try {
    const spend = await plugin.getOfflineSpendState();
    const pending = Number(spend?.pendingCredits) || 0;
    if (pending > 0) {
      const ok = await consumeCredits(userId, pending);
      // Anche se il saldo reale è sceso sotto (altro dispositivo): il registro
      // va svuotato comunque, lo scoperto è il compromesso accettato del
      // modello prepagato offline.
      if (!ok) notifyCreditsChanged({ userId });
      await plugin.markSpendReconciled();
    }
  } catch (e) {
    console.warn('[dayPass] Ledger reconcile failed:', e);
  }

  // 2) Contatore Day Pass nativo → server
  try {
    const s = await plugin.getDayPassState();
    const used = Number(s?.used) || 0;
    if (used > 0 && Number(s?.expiresAt) > 0) {
      await supabase
        .from('user_passes')
        .update({ guides_used: used })
        .eq('user_id', userId)
        .gt('expires_at', new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString());
    }
  } catch (e) {
    console.warn('[dayPass] Pass counter sync failed:', e);
  }

  // 3) Snapshot saldo → nativo
  await pushWalletSnapshot(userId);
}

async function pushWalletSnapshot(userId: string): Promise<void> {
  try {
    const balance = await getWalletBalance(userId);
    await plugin.setWalletBalance({ credits: balance.total });
  } catch (e) {
    console.warn('[dayPass] Wallet snapshot push failed:', e);
  }
}

/**
 * Consuma 1 guida dal Day Pass. Nativo: contatore in prefs (vale anche
 * offline, stesso contatore del receiver). Web/PWA: contatore sul server.
 * Ritorna false se il pass non è attivo o il cap è esaurito.
 */
export async function consumeDayPassGuide(): Promise<boolean> {
  if (isNativeOfflineSupported()) {
    try {
      const r = await plugin.consumeDayPassGuide();
      return !!r?.ok;
    } catch {
      return false;
    }
  }
  try {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id;
    if (!userId) return false;
    const { data } = await supabase
      .from('user_passes')
      .select('id,guides_used,guides_cap')
      .eq('user_id', userId)
      .gt('expires_at', new Date().toISOString())
      .order('expires_at', { ascending: false })
      .limit(1);
    const row = data?.[0];
    if (!row || row.guides_used >= row.guides_cap) return false;
    await supabase.from('user_passes').update({ guides_used: row.guides_used + 1 }).eq('id', row.id);
    return true;
  } catch {
    return false;
  }
}

/**
 * Cancello unico per la riproduzione della guida COMPLETA (usato dal
 * percorso web AudioQueueManager). Ordine: acquisto pregresso (gratis, non
 * consuma il pass) → Day Pass (consuma 1 guida) → altrimenti si paga.
 * Fail-closed: in dubbio niente riproduzione gratuita.
 */
export async function authorizeGuidePlayback(poiId: string): Promise<{
  allowed: boolean;
  via?: 'day_pass' | 'purchased';
}> {
  try {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id;
    if (userId) {
      const { getListeningHistory } = await import('../lib/listeningHistory');
      const history = await getListeningHistory(userId);
      if (history.some((h: any) => String(h.poi_id) === String(poiId))) {
        return { allowed: true, via: 'purchased' };
      }
    }
  } catch { /* storia non disponibile: si prova col pass */ }

  const pass = await getDayPassState().catch(() => null);
  if (pass?.active && (await consumeDayPassGuide())) {
    return { allowed: true, via: 'day_pass' };
  }
  return { allowed: false };
}

/**
 * Ascolto offline dell'audioguida completa (tasto "Ascolta"): il plugin
 * applica Day Pass o per-listen (registro locale) e parla con la coda TTS
 * nativa. Ritorna l'esito per la UI.
 */
export async function playOfflineGuide(poiId: string): Promise<{
  ok: boolean;
  mode?: 'day_pass' | 'per_listen';
  reason?: 'no_text' | 'insufficient_credits';
  remaining?: number;
}> {
  if (!isNativeOfflineSupported()) return { ok: false, reason: 'no_text' };
  return await plugin.playOfflineGuide({ poiId, cost: PRICING_LIST.audio_guide });
}

let billingInitDone = false;

/**
 * Da chiamare una volta all'avvio dell'app (App.tsx): riconcilia subito se
 * online, poi a ogni ritorno della rete e a ogni variazione del wallet
 * ri-spinge lo snapshot al nativo.
 */
export function initOfflineBilling(): void {
  if (billingInitDone || !isNativeOfflineSupported()) return;
  billingInitDone = true;

  const run = () => { reconcileOfflineBilling().catch(() => {}); };
  // All'avvio (con piccolo ritardo: prima lascia montare sessione e listener)
  setTimeout(run, 5000);
  window.addEventListener('online', run);
  window.addEventListener(CREDITS_UPDATED_EVENT, () => {
    supabase.auth.getUser().then(({ data }) => {
      const id = data?.user?.id;
      if (id && navigator.onLine) pushWalletSnapshot(id);
    }).catch(() => {});
  });
}
