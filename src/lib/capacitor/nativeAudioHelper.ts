import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';

/**
 * Converte un Blob in una stringa Base64.
 */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        const base64data = reader.result.split(',')[1];
        resolve(base64data);
      } else {
        reject(new Error('Conversion to base64 failed'));
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** Prefisso dei file temporanei generati dal TTS. */
const TTS_PREFIX = 'tts_';
/** Un file piu' recente di questa soglia potrebbe essere ancora in riproduzione. */
const KEEP_RECENT_MS = 10 * 60 * 1000;

/**
 * Elimina le tracce TTS vecchie dalla cache: senza questa pulizia ogni
 * audioguida lasciava un mp3 nel dispositivo, senza limite.
 */
async function purgeOldAudioFiles(): Promise<void> {
  try {
    const res = await Filesystem.readdir({ path: '', directory: Directory.Cache });
    const now = Date.now();
    for (const file of res.files as any[]) {
      const name = typeof file === 'string' ? file : file.name;
      const mtime = typeof file === 'string' ? 0 : (file.mtime || 0);
      if (!name || !name.startsWith(TTS_PREFIX)) continue;
      if (mtime && now - mtime < KEEP_RECENT_MS) continue;
      try {
        await Filesystem.deleteFile({ path: name, directory: Directory.Cache });
      } catch { /* file gia' rimosso o in uso */ }
    }
  } catch {
    /* readdir non disponibile: non e' un errore bloccante */
  }
}

/**
 * AUDIO PERMANENTE (13/09/2026, committente: «le audioguide devono essere
 * già scaricate, con le voci»). Diverso dalla cache dei file tts_*: sta in
 * Directory.Data, non viene ripulito, e vale finché la visita resta nei
 * download. `path` relativo, es. musei/<museo>/<lingua>/<hash>.mp3.
 * Ritorna l'URI nativo del file, o '' sul web / in caso di errore.
 */
export async function salvaAudioPermanente(blob: Blob, path: string): Promise<string> {
  if (!Capacitor.isNativePlatform()) return '';
  try {
    const base64Data = await blobToBase64(blob);
    await Filesystem.writeFile({ path, data: base64Data, directory: Directory.Data, recursive: true });
    const uriResult = await Filesystem.getUri({ path, directory: Directory.Data });
    return uriResult.uri;
  } catch (error) {
    console.warn('[nativeAudioHelper] audio permanente non salvato:', error);
    return '';
  }
}

/** Il file permanente c'è ancora? (dopo una reinstallazione non c'è più). */
export async function audioPermanenteEsiste(path: string): Promise<boolean> {
  if (!Capacitor.isNativePlatform() || !path) return false;
  try { await Filesystem.stat({ path, directory: Directory.Data }); return true; } catch { return false; }
}

/**
 * Prende un Blob audio, lo scrive nella cache nativa del dispositivo
 * e ritorna il percorso nativo (es. file:///) compatibile con ExoPlayer.
 */
export async function getNativeAudioUri(blob: Blob, filename: string): Promise<string> {
  if (!Capacitor.isNativePlatform()) {
    return URL.createObjectURL(blob);
  }

  try {
    void purgeOldAudioFiles();
    const base64Data = await blobToBase64(blob);

    // Scrive il file temporaneo nella cache del dispositivo
    await Filesystem.writeFile({
      path: filename,
      data: base64Data,
      directory: Directory.Cache,
    });

    // Ottiene l'URI nativo del file salvato
    const uriResult = await Filesystem.getUri({
      path: filename,
      directory: Directory.Cache,
    });

    return uriResult.uri;
  } catch (error) {
    console.error('[nativeAudioHelper] Errore salvataggio file nativo:', error);
    // In caso di errore estremo, restituiamo unObjectURL locale (potrebbe fallire su background ma funziona in foreground)
    return URL.createObjectURL(blob);
  }
}
