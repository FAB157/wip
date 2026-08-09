// =====================================================================
// ITAINTA · Text-To-Speech
// - Audioguide (testo ricco)  -> Azure neural via /api/tts/smart (qualita')
//   con fallback Web Speech se offline / errore.
// - Avvisi & turn-by-turn (frasi brevi) -> Web Speech API (gratis, istantaneo).
// - Fix iOS: sblocco di speechSynthesis al primo gesto utente.
// =====================================================================

import type { GuideCharacter } from '../types/poi';
import { Capacitor } from '@capacitor/core';
import { WipBackgroundAudio } from '../plugins/WipBackgroundAudio';
import { getNativeAudioUri } from '../lib/capacitor/nativeAudioHelper';
import { getApiUrl } from '../lib/api';

let speechUnlocked = false;
let activeAudio: HTMLAudioElement | null = null;
/** true se la narrazione corrente e' in riproduzione sul player nativo. */
let nativePlaybackActive = false;
/** Callback di fine traccia in attesa (percorso nativo). */
let pendingOnEnd: (() => void) | null = null;
let nativeListenersReady = false;

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
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

  // Notifica il banner ApproachBanner dell'istruzione corrente
  try {
    window.dispatchEvent(new CustomEvent('wip-nav-instruction', { detail: { text } }));
  } catch { /* ignore */ }

  try {
    const u = new SpeechSynthesisUtterance(text);
    const prefix = (lang || 'it').toLowerCase().slice(0, 2);
    u.lang = `${prefix}-${prefix.toUpperCase()}`;
    const v = pickVoice(lang, character);
    if (v) u.voice = v;
    window.speechSynthesis.cancel(); // interrompe l'istruzione precedente
    window.speechSynthesis.speak(u);
  } catch {
    /* ignore */
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
      const res = await fetch(getApiUrl('/api/tts/smart'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice: azureVoiceName(lang, character) }),
      });
      if (res.ok) {
        const blob = await res.blob();

        // Un MP3 vero non è mai sotto i 500 byte: un 200 con corpo vuoto
        // (visto in produzione col test voci) non deve arrivare al player
        // come file muto — si passa alla voce di sistema.
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
      console.warn('[ttsService] TTS neurale non disponibile (HTTP', res.status, ')');
    } catch (e) {
      console.warn('[ttsService] Error in speakAudioguide online neural TTS:', e);
      /* fallthrough al fallback */
    }
  }

  // Fallback gratuito
  speakInstruction(text, lang, character);
  emitAudioState(true, true);
  // La fine viene stimata dalla lunghezza del testo: Web Speech non espone
  // un evento affidabile quando l'utente esce dall'app.
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
