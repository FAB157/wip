// Servizio pacchetti area offline — bridge verso il nativo Android.
//
// Il download/sync/gestione dei pacchetti vive in Kotlin (PackageDownloadManager
// + Room con R-tree): a display spento la WebView è morta e il geofencing
// offline deve leggere i dati dal DB nativo. Qui c'è solo l'orchestrazione UI:
// addebito crediti, progress, verifica voce TTS.
//
// Su web/PWA (nessun nativo) resta il flusso Dexie esistente di OfflineMapsTab:
// lì il geofencing hardware non esiste comunque.

import { Capacitor, registerPlugin } from '@capacitor/core';

const plugin = registerPlugin<any>('ItaintaBackgroundPoiPlugin');

export interface OfflinePackageInfo {
  id: string;
  name: string;
  centerLat: number;
  centerLon: number;
  radiusKm: number;
  language: string;
  poiCount: number;
  sizeBytes: number;
  downloadedAt: number;
  lastSyncAt: string;
  status: 'downloading' | 'ready' | 'error';
}

export interface OfflinePackageProgress {
  packageId: string;
  done: number;
  total: number;
  phase: 'downloading' | 'ready' | 'error';
}

/** Flusso nativo: Android (Room + geofencing hardware) e iOS (PoiStore + CoreLocation). */
export function isNativeOfflineSupported(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * Verifica (con la rete ancora viva) che la voce TTS di sistema per la lingua
 * sia installata e utilizzabile offline. Da chiamare PRIMA del download.
 */
export async function checkOfflineVoice(
  language: string
): Promise<{ available: boolean; offlineVoice: boolean }> {
  if (!isNativeOfflineSupported()) return { available: true, offlineVoice: true };
  try {
    const res = await plugin.checkOfflineTtsVoice({ language });
    return { available: !!res?.available, offlineVoice: !!res?.offlineVoice };
  } catch {
    return { available: false, offlineVoice: false };
  }
}

/** Apre le impostazioni di installazione dati voce TTS del sistema. */
export async function openTtsVoiceInstall(): Promise<void> {
  if (!isNativeOfflineSupported()) return;
  try { await plugin.openTtsVoiceInstall(); } catch { /* best effort */ }
}

export async function listOfflinePackages(): Promise<OfflinePackageInfo[]> {
  if (!isNativeOfflineSupported()) return [];
  try {
    const res = await plugin.listOfflinePackages();
    const raw = res?.packages;
    // Il bridge può consegnare l'array già parsato o come stringa JSON
    const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    console.warn('[offlinePackage] list failed:', e);
    return [];
  }
}

export async function deleteOfflinePackage(id: string): Promise<void> {
  if (!isNativeOfflineSupported()) return;
  await plugin.deleteOfflinePackage({ id });
}

/** Delta sync (solo POI cambiati + cancellati). Gratuito: si paga solo il download. */
export async function syncOfflinePackage(id: string): Promise<OfflinePackageInfo> {
  if (!isNativeOfflineSupported()) throw new Error('Offline nativo non disponibile');
  return await plugin.syncOfflinePackage({ id });
}

/**
 * Ascolta il progresso di un download/sync. Ritorna la funzione di unsubscribe.
 */
export function onPackageProgress(
  packageId: string,
  cb: (p: OfflinePackageProgress) => void
): () => void {
  if (!isNativeOfflineSupported()) return () => {};
  const handlePromise = plugin.addListener('offlinePackageProgress', (event: any) => {
    try {
      const data = typeof event?.data === 'string' ? JSON.parse(event.data) : event;
      if (data?.packageId === packageId) {
        cb({
          packageId: data.packageId,
          done: Number(data.done) || 0,
          total: Number(data.total) || 0,
          phase: data.phase || 'downloading',
        });
      }
    } catch { /* evento malformato: ignora */ }
  });
  return () => { handlePromise?.then?.((h: any) => h?.remove?.()); };
}

/**
 * Download di un pacchetto area CON addebito crediti.
 *
 * Flusso pagamento (stesso pattern del bundle audio di PlanScreen):
 * 1) verifica saldo, 2) consume_credits PRIMA del download (earned prima di
 * purchased, RPC atomica), 3) su QUALSIASI fallimento del download rimborso
 * integrale. Il sync successivo è gratuito.
 */
/** Id deterministico: calcolabile PRIMA del download per agganciare il progress. */
export function makeOfflinePackageId(name: string, radiusKm: number): string {
  return `pkg_${name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_${Math.round(radiusKm)}km`;
}

/**
 * Download GRATUITO del pacchetto area (modello freemium: mappe e teaser
 * gratis per tutti, si paga solo l'ascolto — per-listen o Day Pass).
 */
export async function downloadOfflinePackage(opts: {
  id?: string;
  name: string;
  lat: number;
  lon: number;
  radiusKm: number;
  language: string;
}): Promise<OfflinePackageInfo> {
  if (!isNativeOfflineSupported()) {
    throw new Error('Il pacchetto offline completo è disponibile solo nell\'app Android.');
  }
  const pkg = await plugin.downloadOfflinePackage({
    id: opts.id ?? makeOfflinePackageId(opts.name, opts.radiusKm),
    name: opts.name,
    lat: opts.lat,
    lon: opts.lon,
    radiusKm: opts.radiusKm,
    language: opts.language,
  });
  return pkg as OfflinePackageInfo;
}
