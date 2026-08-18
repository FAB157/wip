// =====================================================================
// ITAINTA · Text-To-Speech
// - Audioguide (testo ricco)  -> Azure neural via /api/tts/smart (qualita')
//   con fallback Web Speech se offline / errore.
// - Avvisi & turn-by-turn (frasi brevi) -> Web Speech API (gratis, istantaneo).
// - Fix iOS: sblocco di speechSynthesis al primo gesto utente.
// =====================================================================

import type { GuideCharacter } from '../types/poi';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { WipBackgroundAudio } from '../plugins/WipBackgroundAudio';
import { getNativeAudioUri } from '../lib/capacitor/nativeAudioHelper';
import { getApiUrl } from '../lib/api';
import { postForAudioBlob } from '../lib/audioFetch';

let speechUnlocked = false;
let activeAudio: HTMLAudioElement | null = null;
/** true se la narrazione corrente e' in riproduzione sul player nativo. */
let nativePlaybackActive = false;
/** Callback di fine traccia in attesa (percorso nativo). */
let pendingOnEnd: (() => void) | null = null;
let nativeListenersReady = false;
/** Utterance Web Speech del fallback audioguida + watchdog di fine traccia. */
let fallbackUtterance: SpeechSynthesisUtterance | null = null;
let fallbackWatchdog: ReturnType<typeof setTimeout> | null = null;
function clearFallback() {
  if (fallbackWatchdog) { clearTimeout(fallbackWatchdog); fallbackWatchdog = null; }
  fallbackUtterance = null;
}

// BCP-47 corretti: `${prefix}-${prefix.toUpperCase()}` generava en-EN/zh-ZH NON
// validi (nessuna voce → muto su alcuni motori). Mappa allineata a
// locationService.speakWithWebSpeech.
const LOCALE_MAP: Record<string, string> = {
  it: 'it-IT', en: 'en-US', fr: 'fr-FR', es: 'es-ES', de: 'de-DE', ru: 'ru-RU', zh: 'zh-CN',
};
function bcp47(lang: string): string {
  const p = (lang || 'it').toLowerCase().slice(0, 2);
  return LOCALE_MAP[p] || `${p}-${p.toUpperCase()}`;
}

function emitAudioState(isPlaying: boolean, isVisible: boolean) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('wip-audio-state-change', { detail: { isPlaying, isVisible } }));
}

/**
 * Il player nativo e' l'unica sorgente affidabile di "fine traccia" quando lo
 * schermo e' spento: senza questi listener la callback onEnd non veniva mai
 * chiamata e il banner restava bloccato su "in riproduzione".
 */
function ensureNativeListeners() {
  if (nativeListenersReady || !Capacitor.isNativePlatform()) return;
  nativeListenersReady = true;
  try {
    const finish = () => {
      if (!nativePlaybackActive) return;
      nativePlaybackActive = false;
      emitAudioState(false, false);
      const cb = pendingOnEnd;
      pendingOnEnd = null;
      if (cb) cb();
    };
    WipBackgroundAudio.addListener('playbackEnded', finish);
    WipBackgroundAudio.addListener('playbackError', finish);
    WipBackgroundAudio.addListener('playbackStatus', ({ isPlaying }) => {
      if (nativePlaybackActive) emitAudioState(isPlaying, true);
    });
  } catch {
    /* ignore */
  }
}

// Se l'audioguida "principale" (locationService) parte, la narrazione di
// ttsService deve zittirsi per non sovrapporsi.
if (typeof window !== 'undefined') {
  window.addEventListener('wip-stop-external-audio', () => {
    if (activeAudio) {
      activeAudio.pause();
      activeAudio = null;
    }
    nativePlaybackActive = false;
    pendingOnEnd = null;
    clearFallback();
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    emitAudioState(false, false);
  });
}

/** Voce neurale Azure per lingua + personaggio (allineata a locationService). */
export function azureVoiceName(lang: string, character: GuideCharacter): string {
  const l = (lang || 'it').toUpperCase();
  if (l === 'EN') return character === 'nicky' ? 'en-US-JennyNeural' : 'en-US-GuyNeural';
  if (l === 'FR') return character === 'nicky' ? 'fr-FR-DeniseNeural' : 'fr-FR-HenriNeural';
  if (l === 'ES') return character === 'nicky' ? 'es-ES-ElviraNeural' : 'es-ES-AlvaroNeural';
  if (l === 'DE') return character === 'nicky' ? 'de-DE-KatjaNeural' : 'de-DE-ConradNeural';
  if (l === 'RU') return character === 'nicky' ? 'ru-RU-SvetlanaNeural' : 'ru-RU-DmitryNeural';
  if (l === 'ZH') return character === 'nicky' ? 'zh-CN-XiaoxiaoNeural' : 'zh-CN-YunxiNeural';
  return character === 'nicky' ? 'it-IT-ElsaNeural' : 'it-IT-DiegoNeural';
}

/** Da chiamare su un gesto utente (click) per sbloccare il TTS su iOS. */
export function unlockSpeech(): void {
  if (speechUnlocked || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  try {
    const u = new SpeechSynthesisUtterance('');
    u.volume = 0;
    window.speechSynthesis.speak(u);
    speechUnlocked = true;
  } catch {
    /* ignore */
  }
}

function pickVoice(lang: string, character: GuideCharacter = 'nicky'): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  const prefix = (lang || 'it').toLowerCase().slice(0, 2);
  const voices = window.speechSynthesis.getVoices();
  const langVoices = voices.filter(v => v.lang.toLowerCase().startsWith(prefix));
  if (langVoices.length === 0) return null;

  const isFemale = character === 'nicky';
  const genderMatch = langVoices.find(v => {
    const name = v.name.toLowerCase();
    if (isFemale) return name.includes('female') || name.includes('woman') || name.includes('girl') || name.includes('elsa') || name.includes('jenny');
    return name.includes('male') || name.includes('man') || name.includes('boy') || name.includes('diego') || name.includes('guy') || name.includes('luca');
  });

  return (
    genderMatch ||
    langVoices.find((v) => v.localService) ||
    langVoices[0] ||
    null
  );
}

import { locationService } from './locationService';

/** Legge una frase breve con la voce nativa del browser (gratis). */
export function speakInstruction(text: string, lang = 'it', character: GuideCharacter = 'nicky'): void {
  if (locationService.getIsGuideMuted()) return;

  // Notifica il banner ApproachBanner dell'istruzione corrente
  try {
    window.dispatchEvent(new CustomEvent('wip-nav-instruction', { detail: { text } }));
  } catch { /* ignore */ }

  const hasWebSpeech = typeof window !== 'undefined' && 'speechSynthesis' in window;

  // Su WebView nativa (Android) speechSynthesis è spesso ASSENTE: il turn-by-turn
  // restava MUTO. Instradiamo la frase al TTS nativo/Azure (stesso canale delle
  // audioguide su nativo) così le indicazioni si sentono anche in-app.
  if (Capacitor.isNativePlatform() || !hasWebSpeech) {
    void speakInstructionNative(text, lang, character);
    return;
  }

  try {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = bcp47(lang); // BCP-47 valido (niente più en-EN/zh-ZH)
    const v = pickVoice(lang, character);
    if (v) u.voice = v;
    window.speechSynthesis.cancel(); // interrompe l'istruzione precedente
    window.speechSynthesis.speak(u);
  } catch {
    /* ignore */
  }
}

/** Plugin nativo (Android/iOS): registrato una volta sola, solo su nativo. */
const nativePoiPlugin = (typeof window !== 'undefined' && Capacitor.isNativePlatform())
  ? registerPlugin<any>('ItaintaBackgroundPoiPlugin')
  : null;

/**
 * Pronuncia una frase breve con la voce TTS di SISTEMA, accodandola alla coda
 * nativa dei teaser (unica coda: "Sei arrivato" e il teaser non si accavallano).
 * Ritorna true solo se la frase è stata davvero presa in carico: se il servizio
 * in background non è attivo la coda scarterebbe l'item, quindi si risponde
 * false e il chiamante ripiega sul TTS di rete.
 * `priority` 0 = massima, come gli item d'itinerario.
 */
async function speakViaNativeQueue(
  text: string,
  opts?: { poiId?: string; kind?: string; priority?: number },
): Promise<boolean> {
  if (!nativePoiPlugin) return false;
  try {
    const res = await nativePoiPlugin.speakText({
      text,
      poiId: opts?.poiId,
      kind: opts?.kind || 'nav',
      priority: opts?.priority ?? 0,
    });
    return res?.ok === true;
  } catch {
    // Metodo assente (build nativa più vecchia del JS) o errore: si ripiega.
    return false;
  }
}

/**
 * Annuncio d'arrivo con la voce di sistema: "Sei arrivato a X" entra nella
 * STESSA coda del teaser, quindi il teaser parte subito dopo senza
 * sovrapporsi, e solo allora scatta la logica normale dell'audioguida
 * (notifica ▶ Ascolta / paywall). Tutto offline e a costo zero.
 * Ritorna false su web o se la coda non ha preso in carico la frase.
 */
export async function speakArrivalNative(text: string, poiId?: string): Promise<boolean> {
  return speakViaNativeQueue(text, { poiId, kind: 'arrival', priority: 0 });
}

/**
 * Fallback NATIVO per le frasi brevi (turn-by-turn): scarica l'MP3 Azure con lo
 * stesso canale delle audioguide (postForAudioBlob evita la corruzione binaria
 * di CapacitorHttp) e lo riproduce sul player nativo. Best-effort: offline o
 * errore → niente voce, come prima.
 */
async function speakInstructionNative(text: string, lang: string, character: GuideCharacter): Promise<void> {
  // 1) VOCE DI SISTEMA (coda TTS nativa dei teaser). È la strada preferita:
  //    funziona OFFLINE, parte all'istante (niente MP3 da scaricare), non
  //    costa nulla — su un percorso di 27 manovre erano 27 chiamate Azure —
  //    e chiede il fuoco audio come un navigatore (USAGE_ASSISTANCE_
  //    NAVIGATION_GUIDANCE / .voicePrompt+.duckOthers): abbassa l'audioguida
  //    e ci parla sopra invece di restare muta come faceva prima.
  if (await speakViaNativeQueue(text)) return;

  try {
    // Ripiego Azure. Qui vale ancora la vecchia cautela: se un'audioguida sta
    // suonando sul player nativo non la interrompiamo (romperemmo il tracking
    // di fine traccia → onEnd anticipato).
    if (nativePlaybackActive) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    const { ok, blob } = await postForAudioBlob(
      getApiUrl('/api/tts/smart'),
      { text, voice: azureVoiceName(lang, character) }
    );
    if (!ok || !blob || blob.size < 500 || (blob.type || '').includes('json')) return;
    ensureNativeListeners();
    const nativeUri = await getNativeAudioUri(blob, `tts_instr_${Date.now()}.mp3`);
    // Frase breve: non marchiamo nativePlaybackActive (nessun onEnd atteso), per
    // non interferire con lo stato del banner dell'audioguida principale.
    await WipBackgroundAudio.play({
      url: nativeUri,
      title: text.length > 40 ? text.slice(0, 40) + '…' : text,
      subtitle: 'Navigazione',
    });
  } catch {
    /* best-effort: senza rete niente voce, come prima */
  }
}

/** Ferma qualsiasi audioguida/istruzione in corso (anche quella di locationService). */
export function stopSpeech(): void {
  try {
    if (Capacitor.isNativePlatform()) {
      WipBackgroundAudio.stop().catch(() => {});
    }
    nativePlaybackActive = false;
    pendingOnEnd = null;
    clearFallback();
    if (activeAudio) {
      activeAudio.pause();
      activeAudio = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    // Ferma anche l'audioguida gestita dal player principale, altrimenti
    // le due sorgenti possono suonare insieme.
    locationService.stopGuideAudio();
    emitAudioState(false, false);
  } catch {
    /* ignore */
  }
}

/** Pausa della narrazione ttsService (usata dal banner globale). */
export function pauseSpeech(): void {
  try {
    if (nativePlaybackActive) WipBackgroundAudio.pause().catch(() => {});
    if (activeAudio) activeAudio.pause();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.pause();
    }
    emitAudioState(false, true);
  } catch {
    /* ignore */
  }
}

/** Ripresa della narrazione ttsService. */
export function resumeSpeech(): void {
  try {
    if (nativePlaybackActive) WipBackgroundAudio.resume().catch(() => {});
    if (activeAudio) activeAudio.play().catch(() => {});
    if (typeof window !== 'undefined' && 'speechSynthesis' in window && window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }
    emitAudioState(true, true);
  } catch {
    /* ignore */
  }
}

/** true se ttsService ha una narrazione caricata (nativa o web). */
export function isSpeechActive(): boolean {
  return nativePlaybackActive || activeAudio !== null;
}

/**
 * Legge un'audioguida con Azure neural (qualita'); se offline o errore,
 * ripiega su Web Speech. Ritorna quando la riproduzione e' avviata.
 */
export async function speakAudioguide(
  text: string,
  lang: string,
  character: GuideCharacter,
  onEnd?: () => void
): Promise<void> {
  if (locationService.getIsGuideMuted()) return;
  stopSpeech();

  const online = typeof navigator === 'undefined' ? true : navigator.onLine;
  if (online) {
    try {
      // getApiUrl: su app nativa il path relativo punterebbe a localhost e il TTS
      // neurale fallirebbe sempre, degradando a Web Speech.
      // postForAudioBlob: su nativo la fetch patchata da CapacitorHttp
      // corrompeva il corpo binario (MP3 → 0 byte); qui passa dal canale giusto.
      const { ok, status, blob } = await postForAudioBlob(
        getApiUrl('/api/tts/smart'),
        { text, voice: azureVoiceName(lang, character) }
      );
      if (ok && blob) {
        // Un MP3 vero non è mai sotto i 500 byte: un 200 con corpo vuoto non
        // deve arrivare al player come file muto — si passa alla voce di sistema.
        if (blob.size < 500 || (blob.type || '').includes('json')) {
          throw new Error(`TTS neurale: audio non valido (${blob.size} byte)`);
        }

        if (Capacitor.isNativePlatform()) {
          ensureNativeListeners();
          const nativeUri = await getNativeAudioUri(blob, `tts_guide_${Date.now()}.mp3`);
          pendingOnEnd = onEnd || null;
          nativePlaybackActive = true;
          await WipBackgroundAudio.play({
            url: nativeUri,
            title: text.length > 40 ? text.slice(0, 40) + '...' : text,
            subtitle: 'Audioguida'
          });
          emitAudioState(true, true);
          return;
        }

        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        activeAudio = audio;

        const finish = () => {
          URL.revokeObjectURL(url);
          if (activeAudio === audio) activeAudio = null;
          emitAudioState(false, false);
          if (onEnd) onEnd();
        };

        audio.addEventListener('ended', finish);
        audio.addEventListener('error', finish);
        audio.addEventListener('pause', () => {
          if (activeAudio === audio && !audio.ended) emitAudioState(false, true);
        });
        audio.addEventListener('play', () => emitAudioState(true, true));

        await audio.play();
        emitAudioState(true, true);
        return;
      }
      console.warn('[ttsService] TTS neurale non disponibile (HTTP', status, ')');
    } catch (e) {
      console.warn('[ttsService] Error in speakAudioguide online neural TTS:', e);
      /* fallthrough al fallback */
    }
  }

  // Fallback NATIVO senza rete: nella WebView Android `speechSynthesis` spesso
  // NON esiste, quindi offline l'audioguida restava del tutto MUTA. La si legge
  // con la voce di sistema (stessa coda dei teaser, che ducka la musica). La
  // fine resta stimata come nel ramo Web Speech qui sotto: la coda nativa non
  // espone un callback di fine per questa chiamata.
  if (await speakViaNativeQueue(text, { kind: 'guide', priority: 2 })) {
    try {
      window.dispatchEvent(new CustomEvent('wip-nav-instruction', { detail: { text } }));
    } catch { /* ignore */ }
    clearFallback();
    emitAudioState(true, true);
    const estimatedMs = Math.max(3000, (text.length / 15) * 1000) + 2000;
    fallbackWatchdog = setTimeout(() => {
      emitAudioState(false, false);
      if (onEnd) onEnd();
    }, estimatedMs);
    return;
  }

  // Fallback gratuito (Web Speech). Usiamo un'utterance PROPRIA con onend/onerror
  // REALI: prima si delegava a speakInstruction e la fine era un timer stimato
  // che (a) faceva partire onEnd anche se la voce continuava o era già stata
  // fermata, e (b) non veniva mai cancellato. Ora il timer è solo un watchdog,
  // azzerato alla fine vera o allo stop.
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      window.dispatchEvent(new CustomEvent('wip-nav-instruction', { detail: { text } }));
    } catch { /* ignore */ }
    const u = new SpeechSynthesisUtterance(text);
    u.lang = bcp47(lang);
    const v = pickVoice(lang, character);
    if (v) u.voice = v;
    const finish = () => {
      // Se nel frattempo è partita un'altra traccia, non toccare lo stato.
      if (fallbackUtterance !== u) return;
      clearFallback();
      emitAudioState(false, false);
      if (onEnd) onEnd();
    };
    u.onend = finish;
    u.onerror = finish;
    window.speechSynthesis.cancel();
    fallbackUtterance = u;
    window.speechSynthesis.speak(u);
    emitAudioState(true, true);
    // Watchdog: alcuni motori non emettono 'end' se l'utente esce dall'app.
    const estimatedMs = Math.max(3000, (text.length / 15) * 1000) + 2000;
    fallbackWatchdog = setTimeout(finish, estimatedMs);
    return;
  }

  // Nessun Web Speech (es. nativo offline): tentativo nativo + stima onEnd.
  speakInstruction(text, lang, character);
  emitAudioState(true, true);
  const estimatedMs = Math.max(3000, (text.length / 15) * 1000);
  setTimeout(() => {
    emitAudioState(false, false);
    if (onEnd) onEnd();
  }, estimatedMs);
}

// Pre-carica le voci (alcuni browser le popolano in modo asincrono)
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  window.speechSynthesis.onvoiceschanged = () => {
    /* trigger del caricamento voci */
  };
}
