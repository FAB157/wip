// =====================================================================
// ITAINTA · Wrapper tipizzato del plugin nativo ItaintaBackgroundPoiPlugin
// (Kotlin: plugin/ItaintaBackgroundPoiPlugin.kt — Swift: ItaintaBackgroundPoiPlugin.swift)
//
// Fino al 28/08/2026 ogni file faceva `registerPlugin<any>(...)` per conto
// suo: nessun contratto, nessun posto dove dichiarare un metodo nuovo. Qui
// vive l'interfaccia condivisa; la firma `[key: string]: any` in coda resta
// per i metodi storici non ancora tipizzati, cosi' i chiamanti esistenti non
// si rompono e si tipizza a mano a mano.
//
// Ogni helper esportato e' best-effort: su web (nessuna implementazione) o
// su build native vecchie senza il metodo, non deve mai propagare l'errore.
// =====================================================================

import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';

export interface NativeUserContext {
  userId: string;
  accessToken: string;
}

export interface ItaintaBackgroundPoiPlugin {
  /** Identita' utente + token Supabase per lo storico ascolti e le RLS. */
  setUserContext(options: NativeUserContext): Promise<void>;
  /** Logout / cambio account: azzera userId, token e cache utente nel nativo. */
  clearUserContext(): Promise<void>;
  /** Apre la scheda dell'app nelle Impostazioni di sistema (permessi). */
  openAppSettings(): Promise<void>;

  startBackgroundPoiService(options: Record<string, any>): Promise<void>;
  stopBackgroundPoiService(): Promise<void>;
  syncManualSelection(options: { poisJson: string }): Promise<void>;
  clearManualSelection(): Promise<void>;
  setSilentMode(options: { enabled: boolean }): Promise<void>;
  getTeaserState(): Promise<{ isSpeaking: boolean; speakingPoiId: string; lastPoiId: string; lastFinishedAt: number }>;
  stopNativeTeaser(): Promise<void>;
  getPendingDeepLink(): Promise<any>;
  /**
   * Voce TTS di sistema. Senza `force` entra nella coda dei teaser e, a
   * servizio in background spento, risponde ok:false. Con `force:true`
   * (29/08/2026) a servizio spento parla COMUNQUE con un motore tutto del
   * plugin — il ripiego che non muore mai quando Azure/Google non rispondono
   * — e risponde `direct:true, id`: la fine arriva con l'evento
   * `directSpeechFinished {id}`, non stimata.
   */
  speakText(options: { text: string; poiId?: string; kind?: string; priority?: number; force?: boolean }): Promise<{ ok?: boolean; direct?: boolean; id?: string; reason?: string }>;
  /** Ferma la voce diretta avviata con speakText({force:true}). */
  stopSpeakText(): Promise<void>;

  /**
   * Cruscotto del navigatore a display spento. Android: riscrive la notifica
   * (ongoing) del foreground service. iOS: avvia/aggiorna/termina la Live
   * Activity su lock screen e Dynamic Island. `ok:false` = il nativo non l'ha
   * preso in carico (servizio spento, Live Activities non disponibili) e il
   * chiamante deve ripiegare sulla notifica locale.
   */
  updateNavBanner(options: {
    titolo: string;
    corpo: string;
    attivo: boolean;
    nomeTappa?: string;
    indiceTappa?: number;
    tappeTotali?: number;
    metriAllaTappa?: number;
    istruzione?: string;
    metriAllaSvolta?: number;
    metriRimanenti?: number;
    eta?: string;
    nomeProssima?: string;
    /** URL della foto della tappa (vuoto = nessuna): icona grande / miniatura. */
    foto?: string;
  }): Promise<{ ok?: boolean; reason?: string }>;

  setDayPass(options: { expiresAt: number; cap: number; used: number }): Promise<void>;
  getDayPassState(): Promise<{ active?: boolean; expiresAt?: number; used?: number; cap?: number }>;
  consumeDayPassGuide(): Promise<{ ok?: boolean }>;
  getOfflineSpendState(): Promise<{ pendingCredits?: number }>;
  markSpendReconciled(): Promise<void>;
  setWalletBalance(options: { credits: number }): Promise<void>;
  playOfflineGuide(options: { poiId: string; cost: number }): Promise<any>;

  /** iOS: l'utente ha declassato "Sempre" → "Mentre usi l'app" (o negato). */
  addListener(
    eventName: 'permissionDowngraded',
    listener: (data: { status?: string; message?: string }) => void,
  ): Promise<PluginListenerHandle> & PluginListenerHandle;
  /** Il token spinto con setUserContext e' scaduto: il JS deve rinnovarlo. */
  addListener(
    eventName: 'tokenExpired',
    listener: (data: { userId?: string }) => void,
  ): Promise<PluginListenerHandle> & PluginListenerHandle;
  /** iOS: il trigger in background voleva la guida completa ma l'utente non
   *  ha pass/crediti (il server ha risposto 402). Il JS riallinea pass e
   *  saldo e avvisa l'utente. */
  addListener(
    eventName: 'audioguideCreditsRequired',
    listener: (data: { poiId?: string; poiName?: string; lat?: number; lon?: number; ts?: number; data?: string }) => void,
  ): Promise<PluginListenerHandle> & PluginListenerHandle;
  /** Fine (o errore) della voce diretta avviata con speakText({force:true}). */
  addListener(
    eventName: 'directSpeechFinished',
    listener: (data: { id?: string }) => void,
  ): Promise<PluginListenerHandle> & PluginListenerHandle;
  addListener(
    eventName: string,
    listener: (data: any) => void,
  ): Promise<PluginListenerHandle> & PluginListenerHandle;

  [key: string]: any;
}

export const ItaintaBackgroundPoi = registerPlugin<ItaintaBackgroundPoiPlugin>('ItaintaBackgroundPoiPlugin');

const isNative = () => typeof window !== 'undefined' && Capacitor.isNativePlatform();

/**
 * Apre le Impostazioni dell'app (permessi posizione/notifiche/batteria).
 * Su web e' un no-op che ritorna false; su nativo ritorna true solo se il
 * plugin ha preso in carico la richiesta (build vecchie senza il metodo →
 * false, cosi' il chiamante puo' mostrare le istruzioni testuali).
 */
export async function apriImpostazioniApp(): Promise<boolean> {
  if (!isNative()) return false;
  try {
    await ItaintaBackgroundPoi.openAppSettings();
    return true;
  } catch {
    return false;
  }
}

/**
 * Spinge `{ userId, accessToken }` al servizio nativo. Prende la sessione
 * corrente da supabase-js se non viene passata. Va richiamata a SIGNED_IN,
 * a TOKEN_REFRESHED e alla riconciliazione offline: senza, il nativo
 * lavorava con un token scaduto dopo un'ora (SEC-03).
 */
export async function pushUserContextToNative(ctx?: Partial<NativeUserContext>): Promise<boolean> {
  if (!isNative()) return false;
  try {
    let userId = ctx?.userId;
    let accessToken = ctx?.accessToken;
    if (!userId || !accessToken) {
      const { supabase } = await import('../lib/supabase');
      const { data } = await supabase.auth.getSession();
      userId = userId || data?.session?.user?.id;
      accessToken = accessToken || data?.session?.access_token;
    }
    if (!userId) return false;
    await ItaintaBackgroundPoi.setUserContext({ userId, accessToken: accessToken || '' });
    return true;
  } catch {
    // Metodo assente su build vecchie o plugin non raggiungibile: best-effort.
    return false;
  }
}

/**
 * Logout / cambio account: azzera il contesto utente nel nativo (userId,
 * token, snapshot wallet, day pass). Best-effort: mai un errore al logout.
 */
export async function clearNativeUserContext(): Promise<void> {
  if (!isNative()) return;
  try {
    await ItaintaBackgroundPoi.clearUserContext();
  } catch {
    // Build nativa senza il metodo: si ripiega spingendo un contesto vuoto,
    // che e' l'equivalente funzionale per le build che hanno solo setUserContext.
    try { await ItaintaBackgroundPoi.setUserContext({ userId: '', accessToken: '' }); } catch { /* niente */ }
  }
}
