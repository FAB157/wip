// =====================================================================
// ITAINTA · Text-To-Speech
// - Audioguide (testo ricco)  -> Azure neural via /api/tts/smart (qualita')
//   con fallback sulla VOCE DI SISTEMA se offline / errore (speakWithSystemVoice:
//   TTS nativo del telefono su app, Web Speech su browser).
// - Avvisi & turn-by-turn (frasi brevi) -> Web Speech API (gratis, istantaneo).
// - Fix iOS: sblocco di speechSynthesis al primo gesto utente.
//
// REGOLA (29/08/2026, decisione utente): se Azure/Google non rispondono, si
// ripiega SEMPRE sul TTS nativo, che non muore mai. Prima la coda nativa
// rifiutava a servizio in background spento e nella WebView Android
// speechSynthesis spesso non esiste: l'audioguida on the fly restava muta.
// Ora il plugin (speakText force:true) parla con un motore proprio anche a
// servizio spento e avvisa a fine lettura (directSpeechFinished).
// =====================================================================

import type { GuideCharacter } from '../types/poi';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { WipBackgroundAudio } from '../plugins/WipBackgroundAudio';
import { getNativeAudioUri } from '../lib/capacitor/nativeAudioHelper';
import { getApiUrl } from '../lib/api';
import { postForAudioBlob } from '../lib/audioFetch';
import { getTranslation, linguaCorrente } from '../lib/i18n';

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
/**
 * L'utterance Web Speech di una frase breve (speakInstruction) in corso.
 * Prima non si teneva traccia: isSpeechActive() diceva "muto" mentre il
 * navigatore parlava, e il direttore audio del giro poteva far partire un
 * incontro sopra l'istruzione (22/08/2026).
 */
let activeUtterance: SpeechSynthesisUtterance | null = null;
let activeUtteranceWatchdog: ReturnType<typeof setTimeout> | null = null;

/** Fine di una frase breve: chi ha voci in coda (giroDriver) le dice adesso. */
function emitSpeechEnded(text: string) {
  if (typeof window === 'undefined') return;
  try { window.dispatchEvent(new CustomEvent('wip-speech-ended', { detail: { text } })); } catch { /* ignore */ }
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
    activeUtterance = null;
    stopNativeDirect();
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

// Nomi propri delle voci di sistema per genere, nelle sette lingue dell'app.
// Servono perché fuori da Android il nome NON dice il sesso: su iOS/macOS si
// chiamano "Alice", "Thomas", "Milena"; su Windows/Edge "Microsoft Elsa —
// Italian (Italy)". La sola euristica «contiene female/male» funzionava solo
// su Android (dove il nome è tipo `it-it-x-kda#female_1-local`) e altrove
// lasciava passare la prima voce disponibile: Dante parlava con voce di donna.
const VOCI_FEMMINILI = [
  // Windows / Edge
  'elsa', 'isabella', 'jenny', 'aria', 'michelle', 'ana', 'zira', 'denise', 'eloise',
  'katja', 'amala', 'hedda', 'elvira', 'helena', 'laura', 'svetlana', 'dariya', 'irina',
  'xiaoxiao', 'xiaoyi', 'huihui', 'yaoyao',
  // iOS / macOS
  'alice', 'federica', 'samantha', 'karen', 'moira', 'tessa', 'victoria', 'allison',
  'amelie', 'amélie', 'audrey', 'aurelie', 'marie', 'anna', 'petra', 'monica', 'mónica',
  'paulina', 'marisol', 'soledad', 'milena', 'katya', 'ting-ting', 'tingting', 'sinji', 'sin-ji', 'meijia',
];
const VOCI_MASCHILI = [
  // Windows / Edge
  'diego', 'cosimo', 'giuseppe', 'guy', 'eric', 'christopher', 'roger', 'steffan', 'david', 'mark',
  'henri', 'paul', 'claude', 'conrad', 'killian', 'stefan', 'bernd', 'alvaro', 'álvaro', 'pablo',
  'dmitry', 'pavel', 'yunxi', 'yunjian', 'yunyang', 'kangkang',
  // iOS / macOS
  'luca', 'alex', 'daniel', 'fred', 'aaron', 'arthur', 'oliver', 'rishi', 'thomas', 'nicolas',
  'markus', 'yannick', 'martin', 'jorge', 'juan', 'carlos', 'yuri', 'li-mu', 'limu', 'liangliang',
];

function nomeIndicaFemmina(name: string): boolean {
  // Android: `it-it-x-kda#female_1-local`. Il controllo su '#female'/'#male'
  // viene PRIMA di 'female'/'male' perché "female" contiene "male".
  if (name.includes('#female') || name.includes('femmina') || name.includes('femenina')) return true;
  if (name.includes('#male')) return false;
  if (VOCI_FEMMINILI.some(n => name.includes(n))) return true;
  if (VOCI_MASCHILI.some(n => name.includes(n))) return false;
  if (/\bfemale\b|\bwoman\b|\bgirl\b/.test(name)) return true;
  return false;
}
function nomeIndicaMaschio(name: string): boolean {
  if (name.includes('#male')) return true;
  if (name.includes('#female')) return false;
  if (VOCI_MASCHILI.some(n => name.includes(n))) return true;
  if (VOCI_FEMMINILI.some(n => name.includes(n))) return false;
  if (/\bmale\b|\bman\b|\bboy\b|maschile/.test(name)) return true;
  return false;
}

/**
 * Voce di SISTEMA per lingua + personaggio: sempre nella lingua dell'utente e
 * col genere del personaggio (Nicky = femminile, Dante = maschile). È il
 * ripiego quando l'MP3 neurale non arriva (offline, TTS server giù): deve
 * suonare come la voce Azure che sostituisce, non come "la prima che c'è".
 */
export function pickVoice(lang: string, character: GuideCharacter = 'nicky'): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  const prefix = (lang || 'it').toLowerCase().slice(0, 2);
  const voices = window.speechSynthesis.getVoices();
  const langVoices = voices.filter(v => (v.lang || '').toLowerCase().startsWith(prefix));
  if (langVoices.length === 0) return null;

  const cercaFemmina = character === 'nicky';
  const combacia = (v: SpeechSynthesisVoice) => {
    const name = (v.name || '').toLowerCase();
    return cercaFemmina ? nomeIndicaFemmina(name) : nomeIndicaMaschio(name);
  };

  // A parità di genere si preferisce la voce LOCALE: funziona anche offline,
  // che è esattamente il caso in cui questo ripiego entra in scena.
  const perGenere = langVoices.filter(combacia);
  return (
    perGenere.find(v => v.localService) ||
    perGenere[0] ||
    langVoices.find(v => v.localService) ||
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
    const finish = () => {
      if (activeUtterance !== u) return;
      activeUtterance = null;
      if (activeUtteranceWatchdog) { clearTimeout(activeUtteranceWatchdog); activeUtteranceWatchdog = null; }
      emitSpeechEnded(text);
    };
    u.onend = finish;
    u.onerror = finish;
    window.speechSynthesis.cancel(); // interrompe l'istruzione precedente
    activeUtterance = u;
    window.speechSynthesis.speak(u);
    // Alcuni motori non emettono 'end' (schermo spento, tab in background):
    // senza watchdog la frase resterebbe "attiva" per sempre.
    if (activeUtteranceWatchdog) clearTimeout(activeUtteranceWatchdog);
    activeUtteranceWatchdog = setTimeout(finish, Math.max(3000, (text.length / 15) * 1000) + 2000);
  } catch {
    activeUtterance = null;
  }
}

/** Plugin nativo (Android/iOS): registrato una volta sola, solo su nativo. */
const nativePoiPlugin = (typeof window !== 'undefined' && Capacitor.isNativePlatform())
  ? registerPlugin<any>('ItaintaBackgroundPoiPlugin')
  : null;

/**
 * Voce DIRETTA del plugin (speakText force:true): la lettura in corso, con la
 * callback di fine che il nativo scatena via evento `directSpeechFinished`.
 * Una sola alla volta: il motore nativo è uno. Si tiene anche il testo per la
 * ripresa dopo una pausa (il TTS di sistema non sa riprendere: si rilegge).
 */
let directSpeech: { id: string; text: string; lang: string; character: GuideCharacter; onEnd?: () => void } | null = null;
let directListenerReady = false;
function ensureDirectListener() {
  if (directListenerReady || !nativePoiPlugin) return;
  directListenerReady = true;
  try {
    nativePoiPlugin.addListener('directSpeechFinished', (data: { id?: string }) => {
      const cur = directSpeech;
      if (!cur || !data?.id || data.id !== cur.id) return; // stop/pausa: già azzerato
      directSpeech = null;
      const cb = cur.onEnd;
      if (cb) cb();
    });
  } catch { /* build nativa senza l'evento: la fine sarà stimata */ }
}

/** Ferma la voce diretta SENZA chiamare onEnd (stop voluto, non fine lettura). */
function stopNativeDirect() {
  if (!directSpeech) return;
  directSpeech = null; // prima dello stop: l'evento che segue non trova nulla
  try { nativePoiPlugin?.stopSpeakText?.().catch?.(() => {}); } catch { /* ignore */ }
}

/**
 * Pronuncia una frase con la voce TTS di SISTEMA, accodandola alla coda
 * nativa dei teaser (unica coda: "Sei arrivato" e il teaser non si accavallano).
 * Ritorna true solo se la frase è stata davvero presa in carico; quando lo è,
 * `onEnd` viene chiamata UNA volta: dall'evento nativo se la lettura è diretta
 * (force, servizio spento), altrimenti da una stima (la coda non ha callback
 * per questa chiamata).
 * Senza `force`, a servizio in background spento la coda scarterebbe l'item:
 * si risponde false e il chiamante ripiega. Con `force` (audioguida, turn by
 * turn) si parla comunque col motore del plugin.
 * `priority` 0 = massima, come gli item d'itinerario.
 */
async function speakViaNativeQueue(
  text: string,
  opts?: { poiId?: string; kind?: string; priority?: number; force?: boolean; lang?: string; character?: GuideCharacter },
  onEnd?: () => void,
): Promise<boolean> {
  if (!nativePoiPlugin) return false;
  try {
    ensureDirectListener();
    const res = await nativePoiPlugin.speakText({
      text,
      poiId: opts?.poiId,
      kind: opts?.kind || 'nav',
      priority: opts?.priority ?? 0,
      force: opts?.force === true,
    });
    if (res?.ok !== true) return false;
    if (res.direct && res.id) {
      // Il nativo ha già sostituito la lettura precedente (flush): qui si
      // dimentica soltanto il record vecchio — NON stopSpeakText, che
      // fermerebbe la lettura appena partita. La onEnd della precedente non
      // viene chiamata, come dopo uno stop.
      directSpeech = { id: String(res.id), text, lang: opts?.lang || 'it', character: opts?.character || 'nicky', onEnd };
      return true;
    }
    if (onEnd) setTimeout(onEnd, Math.max(2500, (text.length / 15) * 1000) + 1000);
    return true;
  } catch {
    // Metodo assente (build nativa più vecchia del JS) o errore: si ripiega.
    return false;
  }
}

/**
 * Voce di sistema NATIVA (app Android/iOS) per un testo lungo: coda dei
 * teaser se il servizio è acceso, motore del plugin altrimenti. Su web
 * ritorna false. `onEnd` è chiamata una volta sola a fine lettura, mai dopo
 * uno stop esplicito.
 */
export async function speakNativeSystemVoice(
  text: string,
  lang: string,
  character: GuideCharacter,
  onEnd?: () => void,
): Promise<boolean> {
  if (!nativePoiPlugin || !text) return false;
  return speakViaNativeQueue(text, { kind: 'guide', priority: 2, force: true, lang, character }, onEnd);
}

/**
 * IL RIPIEGO CHE NON MUORE MAI. Legge `text` con la voce di sistema: nativo
 * (coda o motore diretto) sull'app, Web Speech nel browser. Ritorna false
 * solo se il dispositivo non ha nessuna voce; in quel caso `onEnd` non viene
 * chiamata. Chi la usa: l'audioguida on the fly quando Azure/Google non
 * rispondono, la Guida d'Autore, il podcast.
 */
export async function speakWithSystemVoice(
  text: string,
  lang: string,
  character: GuideCharacter,
  onEnd?: () => void,
): Promise<boolean> {
  if (!text) return false;
  if (await speakNativeSystemVoice(text, lang, character, onEnd)) {
    try { window.dispatchEvent(new CustomEvent('wip-nav-instruction', { detail: { text } })); } catch { /* ignore */ }
    clearFallback();
    emitAudioState(true, true);
    return true;
  }
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return false;
  try {
    try { window.dispatchEvent(new CustomEvent('wip-nav-instruction', { detail: { text } })); } catch { /* ignore */ }
    const u = new SpeechSynthesisUtterance(text);
    u.lang = bcp47(lang);
    const v = pickVoice(lang, character);
    if (v) u.voice = v;
    const finish = () => {
      if (fallbackUtterance !== u) return; // nel frattempo è partita un'altra traccia
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
    fallbackWatchdog = setTimeout(finish, Math.max(3000, (text.length / 15) * 1000) + 2000);
    return true;
  } catch {
    clearFallback();
    return false;
  }
}

/** Ferma la voce di sistema (nativa o Web Speech) senza chiamare onEnd. */
export function stopSystemVoice(): void {
  stopNativeDirect();
  clearFallback();
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
  }
}

/**
 * Pausa della voce di sistema. Il TTS nativo non sa riprendere a metà: si
 * ferma e alla ripresa si rilegge da capo (come fa la coda dei teaser). Web
 * Speech invece ha pause/resume veri.
 */
let directPaused: { text: string; lang: string; character: GuideCharacter; onEnd?: () => void } | null = null;
export function pauseSystemVoice(): void {
  const cur = directSpeech;
  if (cur) {
    directPaused = { text: cur.text, lang: cur.lang, character: cur.character, onEnd: cur.onEnd };
    stopNativeDirect();
    return;
  }
  if (fallbackUtterance && typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try { window.speechSynthesis.pause(); } catch { /* ignore */ }
  }
}
export function resumeSystemVoice(): void {
  const p = directPaused;
  if (p) {
    directPaused = null;
    void speakNativeSystemVoice(p.text, p.lang, p.character, p.onEnd);
    return;
  }
  if (fallbackUtterance && typeof window !== 'undefined' && 'speechSynthesis' in window && window.speechSynthesis.paused) {
    try { window.speechSynthesis.resume(); } catch { /* ignore */ }
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
  //    force: a servizio spento (utente in app, guida non avviata) parla lo
  //    stesso il motore del plugin — prima si scendeva su Azure, e senza
  //    Azure la svolta restava muta. La fine arriva dall'evento nativo se la
  //    lettura è diretta, stimata se è in coda: chi aspetta il silenzio
  //    (giroDriver) non resta appeso.
  //    Non si forza se un'audioguida sta suonando sul player nativo: la coda
  //    (servizio acceso) la mette in pausa e riprende (AUD-01), il motore
  //    diretto invece le parlerebbe sopra — in quel caso si resta al
  //    comportamento di prima (frase a schermo, riaccodata dal direttore).
  const guidaInCorso = nativePlaybackActive || (() => { try { return !!locationService.getAudioState()?.isActive; } catch { return false; } })();
  if (await speakViaNativeQueue(text, { force: !guidaInCorso, lang, character }, () => emitSpeechEnded(text))) {
    return;
  }

  try {
    // Ripiego Azure. Qui vale ancora la vecchia cautela: se un'audioguida sta
    // suonando sul player nativo non la interrompiamo (romperemmo il tracking
    // di fine traccia → onEnd anticipato).
    if (nativePlaybackActive) return;
    // Stessa cautela per l'audioguida di locationService: WipBackgroundAudio
    // ha UN player, e play() qui SOSTITUIREBBE la narrazione in corso con
    // una frase di tre secondi. Si salta: la frase e' gia' a schermo
    // (wip-nav-instruction) e il direttore audio del giro la riaccoda.
    // Prima (22/08/2026) la svolta tagliava l'audioguida a meta'.
    try {
      if (locationService.getAudioState()?.isActive) {
        console.debug('[ttsService] audioguida in corso: istruzione non sovrapposta', text.slice(0, 40));
        emitSpeechEnded(text);
        return;
      }
    } catch { /* ok */ }
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
      subtitle: getTranslation('nav_sottotitolo', linguaCorrente()),
    });
    setTimeout(() => emitSpeechEnded(text), Math.max(2500, (text.length / 15) * 1000) + 1000);
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
    activeUtterance = null;
    directPaused = null;
    stopNativeDirect();
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
    if (directSpeech) pauseSystemVoice();
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
    if (directPaused) resumeSystemVoice();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window && window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }
    emitAudioState(true, true);
  } catch {
    /* ignore */
  }
}

/**
 * true se ttsService sta parlando: narrazione (nativa o web), fallback Web
 * Speech dell'audioguida, o una frase breve del navigatore ancora in corso.
 */
export function isSpeechActive(): boolean {
  return nativePlaybackActive || activeAudio !== null || fallbackUtterance !== null || activeUtterance !== null || directSpeech !== null;
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

  // RIPIEGO SULLA VOCE DI SISTEMA (il ripiego che non muore mai): motore
  // nativo del telefono sull'app — coda dei teaser o motore diretto del
  // plugin, anche a servizio spento — Web Speech nel browser. Prima, a
  // servizio spento e senza speechSynthesis (WebView Android), qui si
  // restava muti.
  if (await speakWithSystemVoice(text, lang, character, () => {
    emitAudioState(false, false);
    if (onEnd) onEnd();
  })) return;

  // Nessuna voce sul dispositivo: l'unica cosa onesta è chiudere subito, così
  // chi aspetta la fine (giro, coda) non resta appeso. Il testo è comunque a
  // schermo (wip-nav-instruction).
  console.warn('[ttsService] nessuna voce disponibile: audioguida non letta');
  try { window.dispatchEvent(new CustomEvent('wip-nav-instruction', { detail: { text } })); } catch { /* ignore */ }
  emitAudioState(false, false);
  if (onEnd) onEnd();
}

// Pre-carica le voci (alcuni browser le popolano in modo asincrono)
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  window.speechSynthesis.onvoiceschanged = () => {
    /* trigger del caricamento voci */
  };
}
