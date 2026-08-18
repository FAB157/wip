// =====================================================================
// ITAINTA · LocationService — Gestore centralizzato posizione e audio
// =====================================================================

import { checkUserQuota, incrementUserQuota } from '../lib/quotaManager';
import { Language, getTranslation } from '../lib/i18n';
import { supabase } from '../lib/supabase';
import { getGeofencePois } from './poiRepository';
import { getOrCreateAudioguideText } from './audioguideService';
import { recordListening } from '../lib/listeningHistory';
import type { GeofencePoi } from '../types/poi';
import { fetchWalkingRoute } from './osrmService';
import { getApiUrl } from '../lib/api';
import { postForAudioBlob } from '../lib/audioFetch';
import { radiiForTransport, resolveTransportMode, getTransportPreference, markPlayed, isCategoryAllowed } from '../lib/guideSettings';

import { Capacitor, registerPlugin } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
// Import statico: il vecchio require() non esiste nel bundle ESM e lanciava
// ReferenceError su device, lasciando il player bloccato in stato "playing".
import { WipBackgroundAudio } from '../plugins/WipBackgroundAudio';

const ItaintaBackgroundPoiPlugin = (typeof window !== 'undefined' && Capacitor.isNativePlatform())
  ? registerPlugin<any>('ItaintaBackgroundPoiPlugin') 
  : null;

export interface LocationUpdate {
  latitude: number;
  longitude: number;
  speed: number | null; // in m/s
  heading: number | null;
  accuracy: number;
  timestamp: number;
}

export interface AudioState {
  isPlaying: boolean;
  /** true se c'e' una traccia caricata (in riproduzione o in pausa). */
  isActive: boolean;
  poiId: string | null;
  poiName: string | null;
  currentTime: number;
  duration: number;
  progress: number;
  playbackSpeed: number;
  isMegaphone: boolean;
  /** 🎭 Duetto: indice della battuta in riproduzione (-1 = non è un duetto). */
  duetIndex: number;
}

export type LocationListener = (location: LocationUpdate) => void;
export type AudioStateListener = (state: AudioState) => void;

/**
 * 🎭 Riconosce il formato "duetto" (registro nicky_duetto/dante_duetto): una
 * battuta per riga, prefissata ESATTAMENTE da "NICKY:" o "DANTE:" (contratto
 * col prompt server di regenerateAudioguideText). Le righe senza prefisso che
 * seguono una battuta sono trattate come continuazione (battuta andata a capo).
 * Ritorna null se il testo non è un duetto ben formato: il chiamante ricade
 * sulla lettura intera con la voce del personaggio base.
 */
export function parseDuetLines(text: string | null | undefined): Array<{ speaker: 'nicky' | 'dante'; text: string }> | null {
  if (!text) return null;
  const rows = String(text).split(/\r?\n/).map(r => r.trim()).filter(Boolean);
  if (rows.length < 2) return null;
  const lines: Array<{ speaker: 'nicky' | 'dante'; text: string }> = [];
  for (const row of rows) {
    const m = row.match(/^(NICKY|DANTE)\s*:\s*(.+)$/i);
    if (m) {
      lines.push({ speaker: m[1].toLowerCase() === 'dante' ? 'dante' : 'nicky', text: m[2].trim() });
    } else if (lines.length > 0) {
      lines[lines.length - 1].text += ' ' + row;
    } else {
      // Testo prima della prima battuta: non è un duetto ben formato
      return null;
    }
  }
  return lines.length >= 2 ? lines : null;
}

class LocationService {
  private watchId: number | null = null;
  private listeners: Set<LocationListener> = new Set();
  private audioListeners: Set<AudioStateListener> = new Set();
  private lastLocation: LocationUpdate | null = null;
  private isOnline = true;
  private isHighAccuracy: boolean = true;
  private geofenceCandidates: GeofencePoi[] = [];

  // Settings sync
  private guideMode: 'nicky' | 'dante' = 'nicky';
  private language: Language = 'IT';
  private isTourActive = false;
  private isGuideMuted = false;

  // Audio system
  private ambientPlayer: HTMLAudioElement | null = null;
  private speechPlayer: HTMLAudioElement | null = null;
  private activeGuideAudio: HTMLAudioElement | null = null;
  private audioUnlocked = false;
  private audioQueue: Array<{ text?: string, url?: string, poiName?: string, poiCategory?: string, poiId?: string, character?: 'nicky' | 'dante', authorize?: () => Promise<boolean> }> = [];
  /** Personaggio della traccia corrente (per i metadati Media Session). */
  private currentCharacter: 'nicky' | 'dante' = 'nicky';
  /** Utterance Web Speech del fallback degradato (TTS server irraggiungibile). */
  private fallbackUtterance: SpeechSynthesisUtterance | null = null;
  /** Timer del progresso stimato per il fallback Web Speech (nessun evento nativo). */
  private fallbackProgressTimer: ReturnType<typeof setInterval> | null = null;
  /** Guardia anti-rientranza per stopGuideAudio (l'evento wip-audio-stopped
   *  può a sua volta richiamare stopGuideAudio via AudioQueueManager). */
  private isStoppingGuide = false;

  /** true quando la riproduzione corrente e' gestita dal player nativo (ExoPlayer). */
  private isNativePlayback = false;
  /** Object URL della traccia corrente, da revocare a fine riproduzione. */
  private currentObjectUrl: string | null = null;

  private audioState: AudioState = {
    isPlaying: false,
    isActive: false,
    poiId: null,
    poiName: null,
    currentTime: 0,
    duration: 0,
    progress: 0,
    playbackSpeed: 1,
    isMegaphone: false,
    duetIndex: -1
  };

  private audioCtx: AudioContext | null = null;
  private audioNodes: {
    source: MediaElementAudioSourceNode;
    highpass: BiquadFilterNode;
    lowpass: BiquadFilterNode;
    gain: GainNode;
    /** 🎧 Pan direzionale: null dove StereoPannerNode non è supportato. */
    panner: StereoPannerNode | null;
  } | null = null;
  /**
   * Sorgenti WebAudio già create per elemento: createMediaElementSource si può
   * chiamare UNA SOLA volta per <audio> (la seconda lancia InvalidStateError).
   * La WeakMap permette di ricostruire il grafo riusando la stessa source.
   */
  private mediaSources: WeakMap<HTMLAudioElement, MediaElementAudioSourceNode> = new WeakMap();
  /** Elemento a cui è agganciato il grafo corrente (ricostruito se cambia). */
  private audioNodesElement: HTMLAudioElement | null = null;

  // ── 🎧 Audio direzionale (solo web): pan stereo verso il POI in ascolto ──
  private directionalTimer: ReturnType<typeof setInterval> | null = null;
  private orientationListener: ((e: DeviceOrientationEvent) => void) | null = null;
  /** Heading bussola (gradi da nord, orario) o null se il sensore tace. */
  private deviceHeading: number | null = null;
  /** Pan corrente smussato (-0.8 … +0.8). */
  private currentPan = 0;
  /** Coordinate del POI in riproduzione (per il calcolo del bearing). */
  private currentPoiCoords: { lat: number; lon: number } | null = null;

  // ── 🎭 Duetto Nicky & Dante: battute in sequenza, una voce per battuta ──
  private duetState: {
    lines: Array<{ speaker: 'nicky' | 'dante'; text: string }>;
    index: number;
    nextBlob: Promise<Blob | null> | null;
    nextBlobIndex: number;
  } | null = null;

  // ── 🤫 Trigger geofencing: origine del play (per silenziosa + feedback) ──
  /** Ultimo trigger geofencing con autoPlay (da 'wip-poi-trigger'). */
  private lastGeoTrigger: { poiId: string; ts: number } | null = null;
  /** true se la traccia corrente è partita da un trigger geofencing. */
  private currentPlaybackFromTrigger = false;

  private lastWebPoiFetchTime: number = 0;
// ... (rest of class until constructor)

  private isVibrationEnabled = true;
  private activeCategories: string[] = [];

  private isDeviceStationary: boolean = false;
  private lastMotionTime: number = Date.now();
  // Ultima modalità di spostamento comunicata al servizio nativo
  private lastTravelMode: 'walk' | 'car' | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      // Activity Detection (Motion)
      window.addEventListener('devicemotion', (event) => {
        const acc = event.acceleration;
        if (!acc) return;
        const total = Math.abs(acc.x || 0) + Math.abs(acc.y || 0) + Math.abs(acc.z || 0);
        if (total > 0.15) {
          this.lastMotionTime = Date.now();
          this.isDeviceStationary = false;
        } else {
          if (!this.isDeviceStationary && Date.now() - this.lastMotionTime > 40000) {
            this.isDeviceStationary = true;
          }
        }
      });

      this.isOnline = navigator.onLine;
      window.addEventListener('online', () => { this.isOnline = true; });
      window.addEventListener('offline', () => { this.isOnline = false; });

      // Le impostazioni GeoControl (distanze avvisi, categorie, modalità)
      // devono raggiungere il servizio nativo anche a guida già attiva:
      // onStartCommand rilegge gli extra a ogni chiamata. Debounce per i
      // click ripetuti sui bottoni +/- del profilo.
      let settingsSyncTimer: ReturnType<typeof setTimeout> | null = null;
      window.addEventListener('wip-settings-updated', () => {
        if (!this.isTourActive || !Capacitor.isNativePlatform()) return;
        if (settingsSyncTimer) clearTimeout(settingsSyncTimer);
        settingsSyncTimer = setTimeout(() => this.startNativeBackgroundService(), 1000);
      });

      // Origine trigger: memorizza l'ultimo trigger geofencing con autoPlay.
      // Serve a playAudio per distinguere il play automatico (geofence) dal
      // play manuale: modalità silenziosa e barra feedback valgono solo per
      // il primo.
      window.addEventListener('wip-poi-trigger', (e: any) => {
        const d = e?.detail || {};
        const id = d.poiId ?? d.poi?.id;
        if (id && d.autoPlay) this.lastGeoTrigger = { poiId: String(id), ts: Date.now() };
      });

      // 🎧 Audio direzionale già attivo da una sessione precedente: riparte
      // senza gesto (il permesso bussola iOS, se serve, verrà richiesto al
      // prossimo toggle; senza sensore il pan resta semplicemente a 0).
      if (this.isDirectionalAudioEnabled()) this.startDirectionalUpdates();

      // Unlock audio on first interaction
      const unlock = () => {
        if (this.audioUnlocked) return;
        const audio = new Audio();
        audio.src = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";
        audio.play().catch(() => {});
        this.audioUnlocked = true;
        document.removeEventListener('touchstart', unlock);
        document.removeEventListener('click', unlock);
      };
      document.addEventListener('touchstart', unlock, { once: true });
      document.addEventListener('click', unlock, { once: true });

      // NATIVE PLUGIN LISTENERS (Only on Native)
      if (ItaintaBackgroundPoiPlugin) {
        try {
          ItaintaBackgroundPoiPlugin.addListener('poisDownloaded', (data: any) => {
            if (data && data.data) {
               try {
                 const pois = JSON.parse(data.data);
                 this.geofenceCandidates = pois;
                 window.dispatchEvent(new CustomEvent('pois-updated', { detail: pois }));
                 // Invia i POI grezzi nel detail, così il banner può filtrare per categoria
                 window.dispatchEvent(new CustomEvent('pois-loaded', { detail: { count: pois.length, pois } }));
               } catch(e) { }
            }
          });

          ItaintaBackgroundPoiPlugin.addListener('statusUpdate', (data: any) => {
            if (data && data.data) {
               window.dispatchEvent(new CustomEvent('audioguide-status', { detail: data.data }));
            }
          });

          // Il payload ricco (lat/lon/ts/distanceM) viaggia nel JSON "data":
          // ts serve a scartare gli eventi trattenuti dal nativo e consegnati
          // solo al risveglio della WebView (banner di POI ormai superati).
          const parseNativePoiEvent = (data: any) => {
            let extra: any = {};
            try { if (data?.data) extra = JSON.parse(data.data) || {}; } catch (e) { }
            return {
              poiId: data.poiId ?? extra.poiId,
              poiName: data.poiName ?? extra.poiName,
              lat: extra.lat ?? data.lat,
              lon: extra.lon ?? data.lon,
              distance: Number(extra.distanceM),
              ts: Number(extra.ts),
            };
          };

          ItaintaBackgroundPoiPlugin.addListener('poiApproaching', (data: any) => {
            if (data) {
               window.dispatchEvent(new CustomEvent('poi-approaching', {
                  detail: parseNativePoiEvent(data)
               }));
            }
          });

          ItaintaBackgroundPoiPlugin.addListener('poiArrived', (data: any) => {
            if (data) {
               window.dispatchEvent(new CustomEvent('poi-arrived', {
                  detail: { ...parseNativePoiEvent(data), teaser: data.teaser }
               }));
            }
          });

          ItaintaBackgroundPoiPlugin.addListener('wip-poi-distance-update', (data: any) => {
            if (data && data.data) {
               try {
                 const parsed = JSON.parse(data.data);
                 window.dispatchEvent(new CustomEvent('wip-poi-distance-update', {
                    detail: { entries: parsed.entries }
                 }));
               } catch(e) { }
            }
          });

          // Il TTS nativo segnala inizio/fine del teaser: PoiDetailSheet usa
          // 'wip-teaser-finished' per avviare la guida completa al momento giusto
          // invece del vecchio timer cieco da 3.5s.
          ItaintaBackgroundPoiPlugin.addListener('teaserStarted', (data: any) => {
            let detail: any = { poiId: data?.poiId || null, kind: null };
            try { if (data?.data) detail = { ...detail, ...JSON.parse(data.data) }; } catch(e) { }
            window.dispatchEvent(new CustomEvent('wip-teaser-started', { detail }));
          });

          ItaintaBackgroundPoiPlugin.addListener('teaserFinished', (data: any) => {
            let detail: any = { poiId: data?.poiId || null, kind: null };
            try { if (data?.data) detail = { ...detail, ...JSON.parse(data.data) }; } catch(e) { }
            window.dispatchEvent(new CustomEvent('wip-teaser-finished', { detail }));
          });

          // Tap sul corpo della notifica con WebView già sveglia: il nativo
          // emette 'deep-link-poi' live, ma nessuno lo bridgeava a window —
          // funzionava solo il recupero del deep link pendente a cold start.
          ItaintaBackgroundPoiPlugin.addListener('deep-link-poi', (data: any) => {
            let detail: any = { poiId: data?.poiId || null, guide: 'nicky' };
            try { if (data?.data) detail = { ...detail, ...JSON.parse(data.data) }; } catch (e) { }
            if (detail.poiId) window.dispatchEvent(new CustomEvent('deep-link-poi', { detail }));
          });

          // Uscita/superamento del POI: chiudono il banner corrispondente.
          // Prima non erano bridgeati e il banner restava (o veniva chiuso
          // solo dalla pulizia per distanza).
          ItaintaBackgroundPoiPlugin.addListener('poiExited', (data: any) => {
            const detail = parseNativePoiEvent(data);
            if (detail.poiId) window.dispatchEvent(new CustomEvent('wip-poi-exit', { detail }));
          });
          ItaintaBackgroundPoiPlugin.addListener('poiPassed', (data: any) => {
            const detail = parseNativePoiEvent(data);
            if (detail.poiId) window.dispatchEvent(new CustomEvent('wip-poi-exit', { detail }));
          });
        } catch (e) {
          console.warn("[LocationService] Native listeners setup failed", e);
        }
      }

      if (Capacitor.isNativePlatform()) {
        this.registerNativeAudioListeners();
      }
    }
  }

  /**
   * Con lo schermo spento la WebView viene throttlata: gli eventi del tag <audio>
   * non sono affidabili. Lo stato dell'audioguida viene quindi guidato dagli
   * eventi del player nativo (fine traccia, progresso, play/pausa, errori).
   */
  private registerNativeAudioListeners() {
    try {
      WipBackgroundAudio.addListener('playbackProgress', ({ position, duration }) => {
        if (!this.isNativePlayback) return;
        this.audioState.currentTime = position;
        this.audioState.duration = duration;
        this.audioState.progress = duration > 0 ? (position / duration) * 100 : 0;
        this.notifyAudioState();
      });

      WipBackgroundAudio.addListener('playbackStatus', ({ isPlaying }) => {
        if (!this.isNativePlayback) return;
        this.audioState.isPlaying = isPlaying;
        this.notifyAudioState();
      });

      WipBackgroundAudio.addListener('playbackEnded', () => {
        if (!this.isNativePlayback) return;
        this.handlePlaybackFinished();
      });

      WipBackgroundAudio.addListener('playbackError', (data) => {
        console.warn('[LocationService] Native playback error:', data?.message);
        if (!this.isNativePlayback) return;
        this.handlePlaybackFinished();
      });
    } catch (e) {
      console.warn('[LocationService] Native audio listeners setup failed', e);
    }
  }

  /** Fine riproduzione (nativa o web): resetta lo stato e avvia il POI successivo in coda. */
  private handlePlaybackFinished() {
    // 🎭 Duetto: è finita una BATTUTA, non la traccia — avanza alla prossima.
    if (this.duetState && this.duetState.index + 1 < this.duetState.lines.length) {
      const st = this.duetState;
      this.releaseCurrentTrack();
      this.playDuetLine(st.index + 1).then(ok => {
        if (!ok && this.duetState === st) {
          // Nessuna battuta successiva riproducibile: chiusura normale
          this.clearDuetState();
          this.handlePlaybackFinished();
        }
      });
      return;
    }
    this.clearDuetState();

    // ⏱ Feedback trigger: la traccia partita da geofence è finita — chiedi
    // (throttlato) se il momento era quello giusto. poiId è ancora valorizzato.
    if (this.currentPlaybackFromTrigger) {
      this.currentPlaybackFromTrigger = false;
      this.maybeRequestTriggerFeedback(this.audioState.poiId);
    }
    this.currentPoiCoords = null;

    this.releaseCurrentTrack();
    this.audioState.isPlaying = false;
    this.audioState.isActive = false;
    this.audioState.progress = 100;
    this.notifyAudioState();

    if (this.ambientPlayer) this.ambientPlayer.volume = 0.15;

    setTimeout(() => {
      this.audioState.progress = 0;
      this.audioState.currentTime = 0;
      this.notifyAudioState();
      this.checkAudioQueue();
    }, 1000);
  }

  /** Libera la traccia corrente (element audio + object URL) senza toccare la coda. */
  private releaseCurrentTrack() {
    this.isNativePlayback = false;
    this.activeGuideAudio = null;
    if (this.currentObjectUrl) {
      try { URL.revokeObjectURL(this.currentObjectUrl); } catch { /* ignore */ }
      this.currentObjectUrl = null;
    }
  }

  /** true se una guida e' caricata (in play o in pausa), nativa o web. */
  private isGuidePlaybackActive(): boolean {
    // duetState conta come attivo anche nel breve intervallo tra una battuta
    // e la successiva (fetch del blob), quando activeGuideAudio è null.
    return this.isNativePlayback || this.activeGuideAudio !== null || this.fallbackUtterance !== null || this.duetState !== null;
  }

  public getIsGuideMuted(): boolean { return this.isGuideMuted; }
  public getIsTourActive(): boolean { return this.isTourActive; }
  public getLastLocation(): LocationUpdate | null { return this.lastLocation; }
  public getAudioState(): AudioState { return this.audioState; }

  public observeAudioState(listener: AudioStateListener): () => void {
    this.audioListeners.add(listener);
    listener(this.audioState);
    return () => { this.audioListeners.delete(listener); };
  }

  private notifyAudioState() {
    this.audioListeners.forEach(l => l({ ...this.audioState }));
  }

  public setPlaybackSpeed(speed: number) {
    this.audioState.playbackSpeed = speed;
    if (this.speechPlayer) this.speechPlayer.playbackRate = speed;
    if (Capacitor.isNativePlatform()) {
      WipBackgroundAudio.setSpeed({ speed }).catch(() => {});
    }
    this.notifyAudioState();
  }

  public setMegaphone(enabled: boolean) {
    this.audioState.isMegaphone = enabled;
    this.updateAudioFilters();
    // Su nativo l'audio passa dall'ExoPlayer del foreground service, non dal
    // tag <audio> della WebView: l'effetto va applicato lì (Equalizer/audiofx).
    if (typeof window !== 'undefined' && Capacitor.isNativePlatform()) {
      WipBackgroundAudio.setMegaphone({ enabled }).catch(() => {});
    }
    this.notifyAudioState();
  }

  private initAudioContext() {
    if (typeof window === 'undefined') return;
    try {
      if (!this.audioCtx) {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        this.audioCtx = new AudioCtx();
      }
      // Il grafo dei filtri (megafono + pan direzionale) va agganciato appena
      // speechPlayer esiste: prima veniva creato SOLO se il player c'era già
      // alla prima chiamata, altrimenti restava scollegato per sempre e il
      // megafono diventava un no-op silenzioso. Se l'elemento cambia il grafo
      // si ricostruisce, ma la MediaElementSource si riusa dalla WeakMap:
      // createMediaElementSource è chiamabile UNA sola volta per elemento.
      if (this.speechPlayer && (!this.audioNodes || this.audioNodesElement !== this.speechPlayer)) {
        let source = this.mediaSources.get(this.speechPlayer);
        if (!source) {
          source = this.audioCtx.createMediaElementSource(this.speechPlayer);
          this.mediaSources.set(this.speechPlayer, source);
        } else {
          try { source.disconnect(); } catch { /* mai connessa */ }
        }
        const highpass = this.audioCtx.createBiquadFilter();
        highpass.type = "highpass";
        const lowpass = this.audioCtx.createBiquadFilter();
        lowpass.type = "lowpass";
        const gain = this.audioCtx.createGain();
        // 🎧 StereoPanner solo dove supportato: senza, il grafo resta come prima
        let panner: StereoPannerNode | null = null;
        try {
          if (typeof (this.audioCtx as any).createStereoPanner === 'function') {
            panner = this.audioCtx.createStereoPanner();
          }
        } catch { panner = null; }
        source.connect(highpass);
        highpass.connect(lowpass);
        lowpass.connect(gain);
        if (panner) {
          gain.connect(panner);
          panner.connect(this.audioCtx.destination);
        } else {
          gain.connect(this.audioCtx.destination);
        }
        this.audioNodes = { source, highpass, lowpass, gain, panner };
        this.audioNodesElement = this.speechPlayer;
        this.updateAudioFilters();
      }
    } catch (e) {
      console.error("[LocationService] AudioContext init failed", e);
    }
  }

  private updateAudioFilters() {
    if (!this.audioNodes || !this.audioCtx) return;
    const { highpass, lowpass, gain } = this.audioNodes;
    const now = this.audioCtx.currentTime;
    if (this.audioState.isMegaphone) {
      highpass.frequency.setTargetAtTime(700, now, 0.1);
      lowpass.frequency.setTargetAtTime(3500, now, 0.1);
      gain.gain.setTargetAtTime(2.5, now, 0.1);
    } else {
      highpass.frequency.setTargetAtTime(0, now, 0.1);
      lowpass.frequency.setTargetAtTime(22050, now, 0.1);
      gain.gain.setTargetAtTime(1.0, now, 0.1);
    }
  }

  // ── 🤫 Modalità silenziosa (vibra + testo) ────────────────────────────
  // Chiave CONDIVISA coi service nativi Android/iOS: wip_silent_mode ('1'/'0').

  public isSilentModeEnabled(): boolean {
    try { return localStorage.getItem('wip_silent_mode') === '1'; } catch { return false; }
  }

  public setSilentMode(enabled: boolean) {
    try { localStorage.setItem('wip_silent_mode', enabled ? '1' : '0'); } catch { /* storage bloccato */ }
    // Ponte verso i service nativi: localStorage vive solo nel WebView, i
    // service Kotlin/Swift leggono CapacitorStorage → il plugin scrive lì.
    // Import dinamico e best-effort: su web o su build vecchie senza il
    // metodo non deve succedere nulla.
    (async () => {
      try {
        const { Capacitor, registerPlugin } = await import('@capacitor/core');
        if (!Capacitor.isNativePlatform()) return;
        const plugin = registerPlugin<any>('ItaintaBackgroundPoiPlugin');
        await plugin.setSilentMode({ enabled });
      } catch { /* best-effort: il nativo si allineerà alla prossima build */ }
    })();
  }

  /**
   * Consuma (lettura distruttiva) l'origine trigger per questo POI: true se il
   * play che sta partendo nasce da un trigger geofencing recente (< 2 min).
   */
  private consumeTriggerOrigin(poiId?: string): boolean {
    const t = this.lastGeoTrigger;
    if (!t || !poiId) return false;
    if (t.poiId !== String(poiId) || Date.now() - t.ts > 2 * 60_000) return false;
    this.lastGeoTrigger = null;
    return true;
  }

  /**
   * Barra feedback trigger ("Momento giusto / Troppo presto / Non ero qui"):
   * emette 'wip-trigger-feedback-request' al massimo una volta ogni 30 minuti
   * (throttle in localStorage). La UI vive in PoiAudioPlayer.
   */
  private maybeRequestTriggerFeedback(poiId: string | null) {
    if (!poiId || typeof window === 'undefined') return;
    try {
      const last = Number(localStorage.getItem('wip_feedback_last_ask') || '0');
      if (Date.now() - last < 30 * 60_000) return;
      localStorage.setItem('wip_feedback_last_ask', String(Date.now()));
    } catch { return; }
    window.dispatchEvent(new CustomEvent('wip-trigger-feedback-request', {
      detail: {
        poiId: String(poiId),
        lat: this.lastLocation?.latitude ?? null,
        lon: this.lastLocation?.longitude ?? null,
      }
    }));
  }

  // ── 🎧 Audio direzionale in cuffia (solo web) ─────────────────────────
  // Pan stereo (-0.8 … +0.8) verso il POI in riproduzione, calcolato da
  // posizione utente + heading bussola + coordinate POI, aggiornato ~1/s con
  // smoothing. Fail-safe totale: senza sensori/permessi/StereoPanner tutto
  // suona esattamente come oggi (pan neutro o grafo invariato).

  public isDirectionalAudioEnabled(): boolean {
    try { return localStorage.getItem('wip_directional_audio') === '1'; } catch { return false; }
  }

  /**
   * Da chiamare SU GESTO utente (toggle nel player): su iOS 13+ il permesso
   * bussola si può richiedere solo dentro un gesto.
   */
  public async setDirectionalAudio(enabled: boolean): Promise<void> {
    try { localStorage.setItem('wip_directional_audio', enabled ? '1' : '0'); } catch { /* storage bloccato */ }
    if (!enabled) {
      this.stopDirectionalUpdates();
      return;
    }
    try {
      const DOE: any = (window as any).DeviceOrientationEvent;
      if (DOE && typeof DOE.requestPermission === 'function') {
        await DOE.requestPermission().catch(() => null);
      }
    } catch { /* niente permesso: si userà l'heading GPS, o pan neutro */ }
    this.startDirectionalUpdates();
  }

  private startDirectionalUpdates() {
    if (typeof window === 'undefined') return;
    if (!this.orientationListener) {
      this.orientationListener = (e: DeviceOrientationEvent) => {
        const wk = (e as any).webkitCompassHeading; // iOS: già gradi bussola
        if (typeof wk === 'number' && Number.isFinite(wk)) {
          this.deviceHeading = wk;
        } else if (typeof e.alpha === 'number' && Number.isFinite(e.alpha)) {
          // alpha: 0 = nord, cresce in senso antiorario → bussola = 360 - alpha
          this.deviceHeading = (360 - e.alpha) % 360;
        }
      };
      try {
        window.addEventListener('deviceorientationabsolute' as any, this.orientationListener as any);
        window.addEventListener('deviceorientation', this.orientationListener as any);
      } catch { /* sensori assenti: pan neutro */ }
    }
    if (!this.directionalTimer) {
      this.directionalTimer = setInterval(() => this.updateDirectionalPan(), 1000);
    }
  }

  private stopDirectionalUpdates() {
    if (this.directionalTimer) { clearInterval(this.directionalTimer); this.directionalTimer = null; }
    if (this.orientationListener) {
      try {
        window.removeEventListener('deviceorientationabsolute' as any, this.orientationListener as any);
        window.removeEventListener('deviceorientation', this.orientationListener as any);
      } catch { /* ignore */ }
      this.orientationListener = null;
    }
    this.deviceHeading = null;
    this.currentPan = 0;
    try {
      if (this.audioNodes?.panner && this.audioCtx) {
        this.audioNodes.panner.pan.setTargetAtTime(0, this.audioCtx.currentTime, 0.2);
      }
    } catch { /* ignore */ }
  }

  /** Bearing geografico (gradi da nord, orario) dal punto 1 al punto 2. */
  private bearingTo(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const toRad = (d: number) => d * Math.PI / 180;
    const dLon = toRad(lon2 - lon1);
    const y = Math.sin(dLon) * Math.cos(toRad(lat2));
    const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
              Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }

  /** Tick ~1/s: calcola il bearing relativo e aggiorna il pan con smoothing. */
  private updateDirectionalPan() {
    try {
      if (!this.audioNodes?.panner || !this.audioCtx) return;
      let target = 0;
      const heading = this.deviceHeading ?? this.lastLocation?.heading ?? null;
      if (
        this.isDirectionalAudioEnabled() &&
        this.activeGuideAudio &&                 // solo percorso web (grafo agganciato)
        this.audioState.isPlaying &&
        heading !== null &&
        this.lastLocation && this.currentPoiCoords
      ) {
        const bearing = this.bearingTo(
          this.lastLocation.latitude, this.lastLocation.longitude,
          this.currentPoiCoords.lat, this.currentPoiCoords.lon
        );
        const rel = ((bearing - heading + 540) % 360) - 180; // -180 … 180
        // sin(rel): +1 a destra, -1 a sinistra, 0 davanti/dietro; tetto ±0.8
        target = Math.max(-0.8, Math.min(0.8, Math.sin(rel * Math.PI / 180) * 0.8));
      }
      // Smoothing: passo verso il target, mai salti secchi tra un tick e l'altro
      this.currentPan += (target - this.currentPan) * 0.35;
      if (Math.abs(this.currentPan) < 0.01 && target === 0) this.currentPan = 0;
      this.audioNodes.panner.pan.setTargetAtTime(this.currentPan, this.audioCtx.currentTime, 0.25);
    } catch { /* fail-safe: audio normale, pan invariato */ }
  }

  /** Risolve (best-effort, async) le coordinate del POI in riproduzione. */
  private resolveCurrentPoiCoords(poiId: string) {
    this.currentPoiCoords = null;
    try {
      const c: any = this.geofenceCandidates.find((p: any) => String(p.id) === poiId);
      const lat = Number(c?.lat ?? c?.latitude);
      const lon = Number(c?.lon ?? c?.longitude);
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        this.currentPoiCoords = { lat, lon };
        return;
      }
    } catch { /* si tenta dal repository */ }
    import('./poiRepository')
      .then(({ getPoiById }) => getPoiById(poiId))
      .then((poi: any) => {
        const lat = Number(poi?.lat), lon = Number(poi?.lon);
        if (this.audioState.poiId === poiId && Number.isFinite(lat) && Number.isFinite(lon)) {
          this.currentPoiCoords = { lat, lon };
        }
      })
      .catch(() => { /* niente coordinate: pan neutro */ });
  }

  public setVibration(enabled: boolean) {
      this.isVibrationEnabled = enabled;
  }
  
  public setCategories(categories: string[]) {
      this.activeCategories = categories;
  }

  /**
   * Legge le categorie attive del setup GeoControl (stessa chiave letta dal
   * nativo in startNativeBackgroundService). Fonte corretta per il filtro
   * categoria dell'audioguida: this.activeCategories arriva invece dai chip
   * mappa (CategoryChips), un elenco di categorie diverso e non compatibile
   * col confronto per-tag fatto da isCategoryAllowed.
   */
  private readActiveSubcats(): Record<string, boolean> {
    try {
      const stored = localStorage.getItem('wip_active_subcategories');
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  }

  public syncSettings(itinerary: any[], guideMode: 'nicky' | 'dante', language: Language, isTourActive: boolean, isMuted?: boolean) {
    this.guideMode = guideMode;
    this.language = language;
    const wasActive = this.isTourActive;
    this.isTourActive = isTourActive;
    if (isMuted !== undefined) this.isGuideMuted = isMuted;

    if (isTourActive) {
      // ✅ [FEEDBACK] - Notifica immediata all'utente
      window.dispatchEvent(new CustomEvent('audioguide-status', { detail: "📡 Attivazione radar e GPS..." }));

      // ✅ [OTTIMIZZAZIONE] - Forza il fetch immediato dei POI al cambio modalità
      this.lastWebPoiFetchTime = 0;

      this.startAmbientMusic();
      if (typeof window !== 'undefined' && Capacitor.isNativePlatform()) {
        // Sempre rinfresca le impostazioni se il servizio è attivo o deve esserlo.
        // Poi INOLTRA LE TAPPE al geofencing nativo: prima syncSettings riceveva
        // l'itinerario e lo ignorava, quindi le tappe non erano mai registrate
        // come geofence prioritari (isFromItinerary) e la notifica di check-in
        // nativa non poteva scattare. Ora le tappe arrivano allo store nativo.
        this.startNativeBackgroundService().then(() => {
          this.syncItineraryToNative(itinerary);
        }).catch(() => {});
      } else if (this.lastLocation) {
        // Su PWA, se abbiamo già una posizione, triggeriamo subito il fetch
        this.triggerWebPoiFetch(this.lastLocation);
      }
    } else {
      this.stopAmbientMusic();
      if (typeof window !== 'undefined' && Capacitor.isNativePlatform()) {
        this.stopNativeBackgroundService();
      }
    }
  }

  private async triggerWebPoiFetch(loc: LocationUpdate) {
    const now = Date.now();
    this.lastWebPoiFetchTime = now;
    try {
      const { supabase } = await import('../lib/supabase');
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData?.session?.user?.id || null;
      const { getGeofencePois } = await import('./poiRepository');
      let pois = await getGeofencePois(loc.latitude, loc.longitude, userId, 1000);

      // Filtro categoria allineato al setup GeoControl (stessa mappa
      // categoria→bucket del nativo), non ai chip mappa (CategoryChips).
      const activeSubcats = this.readActiveSubcats();
      pois = pois.filter(p => isCategoryAllowed(p, activeSubcats));

      this.geofenceCandidates = pois;
      window.dispatchEvent(new CustomEvent('pois-updated', { detail: pois }));
    } catch (e) {
      console.warn("[LocationService] Instant fetch failed", e);
    }
  }

  /**
   * Inoltra le tappe dell'itinerario al servizio nativo come selezione
   * manuale (isFromItinerary=true): sono i geofence prioritari su cui scatta
   * la notifica di check-in "Tappa completata!". Mappa il formato tappa del
   * piano AI ({id_tappa, titolo_tappa, coordinate:{lat,lng}}) al formato Poi
   * atteso dal nativo ({id, nome, lat, lon}). Best-effort.
   */
  private syncItineraryToNative(itinerary: any[]) {
    if (!ItaintaBackgroundPoiPlugin || !Array.isArray(itinerary) || itinerary.length === 0) return;
    try {
      const pois = itinerary
        .map((t: any) => {
          const lat = t?.coordinate?.lat ?? t?.lat;
          const lon = t?.coordinate?.lng ?? t?.coordinate?.lon ?? t?.lon;
          if (typeof lat !== 'number' || typeof lon !== 'number' || (!lat && !lon)) return null;
          return {
            id: String(t.id_tappa || t.id || `iti_${lat.toFixed(5)}_${lon.toFixed(5)}`),
            nome: t.titolo_tappa || t.name || t.nome || 'Tappa',
            lat, lon,
            isFromItinerary: true,
            isGem: false,
            guideDefault: (this.guideMode as any) || 'nicky',
            teaserText: t.descrizione || t.attivita || t.descrizione_breve || ''
          };
        })
        .filter(Boolean);
      if (pois.length === 0) return;
      ItaintaBackgroundPoiPlugin.syncManualSelection({ poisJson: JSON.stringify(pois) });
    } catch (e) { /* best-effort */ }
  }

  private async startNativeBackgroundService() {
    if (!ItaintaBackgroundPoiPlugin) return;
    try {
      let lat = this.lastLocation?.latitude;
      let lon = this.lastLocation?.longitude;

      if (!lat || !lon) {
        try {
          const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true });
          lat = pos.coords.latitude;
          lon = pos.coords.longitude;
        } catch (e) { }
      }

      // Default = quello del setup GeoControl (monumenti/musei/chiese attivi);
      // le gemme il nativo le include comunque (parsePoiList / receiver).
      // Il vecchio fallback ['gemme'] faceva monitorare SOLO le gemme al primo
      // avvio, mentre il web monitorava tutte le categorie di default.
      let categories: string[] = ['monumenti', 'musei', 'chiese'];
      try {
        const stored = localStorage.getItem('wip_active_subcategories');
        if (stored) {
          const parsed = JSON.parse(stored);
          categories = Object.keys(parsed).filter(k => parsed[k]);
        }
      } catch { }

      let isAutomaticMode = true;
      try {
        const mode = localStorage.getItem('wip_activation_mode');
        if (mode === 'semi-automatic') isAutomaticMode = false;
      } catch (e) {}

      // ⚠️ `guideMode` per il servizio nativo significa MODALITÀ DI SPOSTAMENTO
      // ("walking"/"driving"), non il personaggio. Prima gli veniva passato
      // this.guideMode (= "nicky"/"dante"), quindi `guideMode == "driving"`
      // era SEMPRE falso: in auto restavano i raggi a piedi (150/30 invece di
      // 300/50), il radar a 5 km e il refresh ogni 200 m. La modalità auto,
      // di fatto, non è mai esistita sul telefono.
      const travelMode = resolveTransportMode(this.lastLocation?.speed ?? null) === 'car'
        ? 'driving'
        : 'walking';

      await ItaintaBackgroundPoiPlugin.startBackgroundPoiService({
        isAutomaticMode,
        guideMode: travelMode,
        // Il personaggio viaggia in un campo suo, così il nativo può usarlo
        // per scegliere la voce senza confonderlo con la modalità.
        guideCharacter: this.guideMode,
        // Senza questo il nativo cadeva sempre su "it": messaggi di arrivo e
        // voce TTS in italiano anche per utenti EN/FR/ES/DE.
        language: String(this.language || 'IT').toLowerCase(),
        categories,
        lat, // ✅ Passiamo la posizione corrente per avvio immediato
        lon,
        // Con 'auto' il servizio nativo adatta da solo walking/driving alla
        // velocità GPS: a schermo spento la WebView è congelata e il rilancio
        // JS al cambio di modalità (vedi handlePosition) non può avvenire.
        transportPref: getTransportPreference(),
        alertRadiusWalk: radiiForTransport('walk').alert,
        arrivalRadiusWalk: radiiForTransport('walk').trigger,
        alertRadiusCar: radiiForTransport('car').alert,
        arrivalRadiusCar: radiiForTransport('car').trigger
      });
    } catch (e) { }
  }

  private async stopNativeBackgroundService() {
    if (ItaintaBackgroundPoiPlugin) {
      try {
        await ItaintaBackgroundPoiPlugin.stopBackgroundPoiService();
      } catch (e) { }
    }
  }

  /**
   * Stato del teaser vocale nativo (persistito lato Android).
   * Ritorna null su web o in caso di errore.
   */
  public async getNativeTeaserState(): Promise<{ isSpeaking: boolean; speakingPoiId: string; lastPoiId: string; lastFinishedAt: number } | null> {
    if (!ItaintaBackgroundPoiPlugin) return null;
    try {
      return await ItaintaBackgroundPoiPlugin.getTeaserState();
    } catch (e) {
      return null;
    }
  }

  /** Ferma subito la voce nativa del teaser (prima di avviare la guida completa). */
  public async stopNativeTeaser(): Promise<void> {
    if (!ItaintaBackgroundPoiPlugin) return;
    try { await ItaintaBackgroundPoiPlugin.stopNativeTeaser(); } catch (e) { }
  }

  /**
   * Deep link salvato da MainActivity quando l'app è stata aperta a freddo da
   * una notifica geofence (lettura distruttiva). Null se assente o stantio.
   */
  public async consumePendingDeepLink(maxAgeMs = 3 * 60 * 1000): Promise<{ poiId: string; guide: string } | null> {
    if (!ItaintaBackgroundPoiPlugin) return null;
    try {
      const res = await ItaintaBackgroundPoiPlugin.getPendingDeepLink();
      if (res?.poiId && res.timestamp && (Date.now() - res.timestamp) < maxAgeMs) {
        return { poiId: String(res.poiId), guide: res.guide || 'nicky' };
      }
    } catch (e) { }
    return null;
  }

  private startAmbientMusic() {
    if (typeof window === 'undefined' || this.ambientPlayer) return;
    try {
      const player = new Audio("https://assets.mixkit.co/music/preview/mixkit-ambient-tone-340.mp3");
      player.loop = true;
      player.volume = 0.15;
      player.play().catch(() => {});
      this.ambientPlayer = player;

      // PWA AUDIO UNLOCK: Inizializziamo anche il player vocale nel contesto interattivo
      if (!this.speechPlayer) {
        const sp = new Audio("data:audio/mp3;base64,//NExAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq");
        sp.play().catch(() => {});
        this.speechPlayer = sp;
      }
    } catch (e) {}
  }

  private stopAmbientMusic() {
    if (this.ambientPlayer) { this.ambientPlayer.pause(); this.ambientPlayer = null; }
    if (this.activeGuideAudio) { this.activeGuideAudio.pause(); this.activeGuideAudio = null; }
  }

  public subscribe(listener: LocationListener): () => void {
    this.listeners.add(listener);
    if (this.lastLocation) listener(this.lastLocation);
    if (!this.watchId) this.startWatching();
    return () => { this.listeners.delete(listener); };
  }

  public async startWatching(highAccuracy: boolean = true) {
    if (this.watchId !== null && this.isHighAccuracy === highAccuracy) return;
    this.stopWatching();
    this.isHighAccuracy = highAccuracy;

    const handlePosition = async (position: any, isNative: boolean = false) => {
      // @capacitor/geolocation restituisce { coords: {...}, timestamp } come il
      // browser; il vecchio codice trattava il payload nativo come piatto
      // (formato di background-geolocation) e leggeva latitude/longitude da un
      // oggetto che non le ha: su iOS e Android la posizione era sempre
      // undefined e il mirino/follow-me non funzionava. Accettiamo entrambe le
      // forme invece di indovinare in base alla piattaforma.
      const coords = position?.coords ?? position;
      if (!coords || !Number.isFinite(coords.latitude) || !Number.isFinite(coords.longitude)) return;
      const now = Date.now();
      const update: LocationUpdate = {
        latitude: coords.latitude,
        longitude: coords.longitude,
        speed: coords.speed || 0,
        // heading REALE o null: `|| 0` faceva credere al marker di avere
        // sempre una direzione → freccia sempre puntata a Nord anche da fermo.
        // Alcuni device usano -1/NaN per "assente": in quei casi → null (pallino).
        heading: (Number.isFinite(coords.heading) && coords.heading >= 0) ? coords.heading : null,
        accuracy: coords.accuracy || 10,
        timestamp: position?.timestamp || position?.time || now,
      };
      this.lastLocation = update;
      this.listeners.forEach(l => l(update));

      // Passaggio piedi ⇄ auto durante il tour: il servizio nativo va
      // rilanciato con la nuova modalità, altrimenti resta con i raggi
      // (e il raggio radar) con cui era partito.
      if (this.isTourActive && Capacitor.isNativePlatform()) {
        const mode = resolveTransportMode(update.speed ?? null);
        if (this.lastTravelMode && this.lastTravelMode !== mode) {
          this.lastTravelMode = mode;
          this.startNativeBackgroundService();
        } else if (!this.lastTravelMode) {
          this.lastTravelMode = mode;
        }
      }
      // Notifica il banner di avvicinamento per aggiornare le distanze in tempo
      // reale. accuracy inclusa: i trigger web foreground scartano i fix > 50 m
      // (foregroundTriggers.ts) senza dover risalire al servizio.
      window.dispatchEvent(new CustomEvent('wip-location-update', {
        detail: { lat: update.latitude, lon: update.longitude, heading: update.heading, accuracy: update.accuracy }
      }));

      // [WEB/PWA FALLBACK] Fetch POIs per Radar se non siamo su app nativa Android e se la guida è attiva
      if (this.isTourActive && !isNative && (now - this.lastWebPoiFetchTime > 15000)) {
        this.lastWebPoiFetchTime = now;
        try {
          const { supabase } = await import('../lib/supabase');
          const { data: sessionData } = await supabase.auth.getSession();
          const userId = sessionData?.session?.user?.id || null;
          const { getGeofencePois } = await import('./poiRepository');
          let pois = await getGeofencePois(update.latitude, update.longitude, userId, 1000);

          // Stesso filtro di triggerWebPoiFetch: categorie del setup
          // GeoControl, non i chip mappa.
          const activeSubcats = this.readActiveSubcats();
          pois = pois.filter(p => isCategoryAllowed(p, activeSubcats));

          this.geofenceCandidates = pois;
          window.dispatchEvent(new CustomEvent('pois-updated', { detail: pois }));
        } catch (e) {
          console.warn("[LocationService] Failed to fetch web POIs", e);
        }
      }
    };

    if (typeof window !== 'undefined' && Capacitor.isNativePlatform()) {
      try {
        // Il permesso va chiesto PRIMA del watch: su iOS e Android un
        // watchPosition senza autorizzazione fallisce (o resta muto) e il
        // mirino non riceveva mai un fix.
        try {
          const perm = await Geolocation.checkPermissions();
          if (perm.location !== 'granted' && perm.coarseLocation !== 'granted') {
            await Geolocation.requestPermissions({ permissions: ['location'] });
          }
        } catch (permErr) {
          console.warn('[LocationService] Permission check failed', permErr);
        }

        // Un fix immediato evita che il mirino resti inerte finché non arriva
        // il primo update del watch (fino a diversi secondi a freddo).
        Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 8000 })
          .then(pos => handlePosition(pos, true))
          .catch(() => {});

        this.watchId = await Geolocation.watchPosition(
          { enableHighAccuracy: true, timeout: 10000 },
          (position, err) => {
            if (err) { console.warn('[LocationService] watchPosition error', err); return; }
            if (position) handlePosition(position, true);
          }
        ) as any;
      } catch (e) {
        console.warn("[LocationService] Native watch failed, fallback to web", e);
        this.startWatchingWeb(handlePosition);
      }
    } else if (typeof window !== 'undefined') {
      this.startWatchingWeb(handlePosition);
    }
  }

  private startWatchingWeb(handlePosition: (p: any, n: boolean) => void) {
    if (typeof window === 'undefined') return;
    this.watchId = navigator.geolocation.watchPosition(
      p => handlePosition(p, false),
      e => console.error(e),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    ) as any;
  }

  public async stopWatching() {
    if (this.watchId) {
      if (typeof window !== 'undefined' && Capacitor.isNativePlatform()) {
        try {
          await Geolocation.clearWatch({ id: this.watchId.toString() });
        } catch (e) {}
      } else if (typeof window !== 'undefined') {
        navigator.geolocation.clearWatch(this.watchId as number);
      }
      this.watchId = null;
    }
  }

  public async playAudio(text: string, poiName?: string, poiCategory?: string, poiId?: string, character?: 'nicky' | 'dante', authorize?: () => Promise<boolean>): Promise<boolean> {
    if (this.isGuideMuted || !text) return false;

    // 🤫 «Solo vibrazione + testo»: se il play nasce da un trigger geofencing
    // e la modalità silenziosa è attiva, NIENTE audio (né addebito: siamo
    // prima di authorize): vibrazione breve, banner col rimando al testo
    // (già leggibile nella scheda aperta dal trigger) e richiesta feedback.
    // L'origine viene consumata: il ▶ manuale successivo suona normalmente.
    const fromTrigger = this.consumeTriggerOrigin(poiId);
    if (fromTrigger && this.isSilentModeEnabled()) {
      try { (navigator as any).vibrate?.([200, 100, 200]); } catch { /* niente vibrazione */ }
      window.dispatchEvent(new CustomEvent('audioguide-status', {
        detail: `🤫 ${poiName || 'Punto di interesse'}: modalità silenziosa — leggi il testo nella scheda o premi ▶ per ascoltare`
      }));
      this.maybeRequestTriggerFeedback(poiId || null);
      return false;
    }

    // Se stiamo già riproducendo questo specifico POI, facciamo solo toggle play/pause se richiesto esternamente
    // Ma qui la logica è "avvia riproduzione", quindi se è lo stesso e siamo in pausa, riprendiamo
    if (poiId && this.audioState.poiId === poiId && this.isGuidePlaybackActive()) {
       this.resumeGuideAudio();
       return true;
    }

    if (this.isGuidePlaybackActive()) {
      // NB: l'eventuale autorizzazione/addebito NON avviene all'accodamento,
      // ma quando la traccia parte davvero (vedi sotto).
      this.audioQueue.push({ text, poiName, poiCategory, poiId, character, authorize });
      return true;
    }

    // Autorizzazione pagamento SOLO al vero avvio della traccia: se fallisce
    // (crediti finiti, Day Pass esaurito) la traccia viene scartata e la coda
    // avanza; l'evento needsPayment lo emette il chiamante nel callback.
    if (authorize) {
      let allowed = false;
      try { allowed = await authorize(); } catch { allowed = false; }
      if (!allowed) {
        this.checkAudioQueue();
        return false;
      }
    }

    // Interrompe l'eventuale narrazione avviata da ttsService (PoiCard / popup mappa)
    // per evitare due audioguide sovrapposte.
    this.stopExternalSpeech();

    this.initAudioContext();
    if (this.audioCtx?.state === "suspended") this.audioCtx.resume();

    if (this.ambientPlayer) this.ambientPlayer.volume = 0.02;

    this.audioState.poiId = poiId || null;
    this.audioState.poiName = poiName || null;
    this.currentCharacter = character || this.guideMode;
    // Origine trigger → a fine ascolto (o allo stop) parte la barra feedback.
    this.currentPlaybackFromTrigger = fromTrigger;
    // 🎧 Coordinate del POI per il pan direzionale (best-effort, async).
    if (poiId) this.resolveCurrentPoiCoords(String(poiId));
    this.notifyAudioState();

    try {
      // 🎭 Duetto: se il testo è un dialogo NICKY:/DANTE:, ogni battuta viene
      // riprodotta in sequenza con la voce TTS del personaggio giusto,
      // pre-caricando la successiva mentre suona la corrente.
      const duetLines = parseDuetLines(text);
      if (duetLines) {
        const okDuet = await this.playDuet(duetLines);
        if (okDuet) {
          window.dispatchEvent(new CustomEvent('wip-leader-audio-start', {
            detail: { textToSpeak: text, poiName }
          }));
          return true;
        }
        // Parsing/TTS del duetto fallito: si prosegue col percorso mono-voce
        // (tutto il testo con la voce del personaggio base) — mai il silenzio.
      }
      // Il personaggio scelto nella scheda POI (Nicky = femminile, Dante =
      // maschile) ha priorità sullo stato globale: senza questo override la
      // voce restava quella di guideMode (default Nicky) anche selezionando
      // Dante, in tutte le lingue.
      const voice = this.getNeuralVoiceName(this.language, character || this.guideMode);
      // postForAudioBlob: su nativo la fetch patchata da CapacitorHttp
      // corrompeva il corpo binario (MP3 → 0 byte, "click a vuoto" su iPhone).
      const { ok, status, blob } = await postForAudioBlob(getApiUrl('/api/tts/smart'), { text, voice });
      if (!ok || !blob) throw new Error(`TTS ${status}`);
      // Un blob vuoto o una risposta JSON scambiata per audio produceva un
      // player "fantasma" con durata 0:00: meglio fallire esplicitamente.
      if (blob.size < 500 || blob.type.includes('json')) {
        throw new Error(`TTS blob non valido (${blob.size} bytes, ${blob.type})`);
      }

      const started = await this.playAudioBlob(blob, text);
      if (started) {
        // Live Tour: se l'utente è leader di una sessione, useLiveTour
        // ritrasmette questo audio ai follower via canale realtime.
        // (Per i non-leader l'evento è un no-op senza listener attivo.)
        window.dispatchEvent(new CustomEvent('wip-leader-audio-start', {
          detail: { textToSpeak: text, poiName }
        }));
      }
      return started;
    } catch (e) {
      console.error("[LocationService] Generazione audio TTS fallita:", e);
      // Degradazione: se c'è un testo da leggere non falliamo mai in silenzio.
      // Web Speech (voce di sistema, lingua corrente) legge il testo già pronto.
      const spoken = this.speakWithWebSpeech(text);
      if (spoken) {
        window.dispatchEvent(new CustomEvent('wip-leader-audio-start', {
          detail: { textToSpeak: text, poiName }
        }));
        return true;
      }
      if (this.ambientPlayer) this.ambientPlayer.volume = 0.15;
      this.audioState.isPlaying = false;
      this.notifyAudioState();
      return false;
    }
  }

  /**
   * Fallback degradato quando /api/tts/smart è irraggiungibile (offline, TTS
   * server giù): Web Speech API con la lingua corrente dell'app.
   */
  private speakWithWebSpeech(text: string): boolean {
    if (typeof window === 'undefined' || !('speechSynthesis' in window) || !text) return false;
    try {
      const u = new SpeechSynthesisUtterance(text);
      const prefix = (this.language || 'IT').toLowerCase().slice(0, 2);
      const localeMap: Record<string, string> = {
        it: 'it-IT', en: 'en-US', fr: 'fr-FR', es: 'es-ES',
        de: 'de-DE', ru: 'ru-RU', zh: 'zh-CN',
      };
      u.lang = localeMap[prefix] || `${prefix}-${prefix.toUpperCase()}`;
      u.rate = this.audioState.playbackSpeed || 1;
      const finish = () => {
        // Se nel frattempo è partita un'altra traccia, non toccare lo stato.
        if (this.fallbackUtterance !== u) return;
        if (this.fallbackProgressTimer) { clearInterval(this.fallbackProgressTimer); this.fallbackProgressTimer = null; }
        this.fallbackUtterance = null;
        this.handlePlaybackFinished();
      };
      u.onend = finish;
      u.onerror = finish;
      window.speechSynthesis.cancel();
      this.fallbackUtterance = u;
      window.speechSynthesis.speak(u);
      this.audioState.isPlaying = true;
      this.audioState.isActive = true;
      // La Web Speech API non espone né durata né posizione: il player
      // mostrava 00:00/00:00 con la barra ferma per tutta la lettura. Durata
      // STIMATA (~15 caratteri/secondo alla velocità corrente) e posizione da
      // timer: approssimate ma oneste, e la barra si muove.
      const estimatedDuration = Math.max(3, text.length / (15 * (u.rate || 1)));
      this.audioState.duration = estimatedDuration;
      this.audioState.currentTime = 0;
      this.audioState.progress = 0;
      const startedAt = Date.now();
      if (this.fallbackProgressTimer) clearInterval(this.fallbackProgressTimer);
      this.fallbackProgressTimer = setInterval(() => {
        if (this.fallbackUtterance !== u) {
          if (this.fallbackProgressTimer) { clearInterval(this.fallbackProgressTimer); this.fallbackProgressTimer = null; }
          return;
        }
        const elapsed = (Date.now() - startedAt) / 1000;
        this.audioState.currentTime = Math.min(elapsed, estimatedDuration);
        this.audioState.progress = Math.min(100, (elapsed / estimatedDuration) * 100);
        this.notifyAudioState();
      }, 500);
      this.notifyAudioState();
      this.recordPlaybackStart().catch(() => {});
      return true;
    } catch {
      this.fallbackUtterance = null;
      return false;
    }
  }

  // ── 🎭 Duetto Nicky & Dante ───────────────────────────────────────────

  /** Scarica l'MP3 di una singola battuta con la voce del suo personaggio. */
  private async fetchDuetBlob(line: { speaker: 'nicky' | 'dante'; text: string }): Promise<Blob | null> {
    try {
      const voice = this.getNeuralVoiceName(this.language, line.speaker);
      const { ok, blob } = await postForAudioBlob(getApiUrl('/api/tts/smart'), { text: line.text, voice });
      if (!ok || !blob || blob.size < 500 || blob.type.includes('json')) return null;
      return blob;
    } catch { return null; }
  }

  private clearDuetState() {
    this.duetState = null;
    if (this.audioState.duetIndex !== -1) this.audioState.duetIndex = -1;
  }

  /**
   * Avvia il duetto: battute in sequenza, ognuna con la voce del suo
   * personaggio. Ritorna false se nemmeno la prima battuta parte (il
   * chiamante ricade sulla lettura mono-voce del testo intero).
   */
  private async playDuet(lines: Array<{ speaker: 'nicky' | 'dante'; text: string }>): Promise<boolean> {
    this.duetState = { lines, index: 0, nextBlob: null, nextBlobIndex: -1 };
    const ok = await this.playDuetLine(0);
    if (!ok) this.clearDuetState();
    return ok;
  }

  /**
   * Riproduce la battuta i e pre-carica la i+1 mentre questa suona. Una
   * battuta il cui TTS fallisce viene SALTATA (si passa alla successiva)
   * invece di fermare il dialogo. L'avanzamento a fine battuta avviene in
   * handlePlaybackFinished (che copre sia il tag <audio> web sia ExoPlayer).
   */
  private async playDuetLine(i: number): Promise<boolean> {
    const st = this.duetState;
    if (!st || i >= st.lines.length) return false;
    st.index = i;
    const line = st.lines[i];
    // Blob della battuta: pre-caricato dalla precedente quando possibile
    const blobPromise = (st.nextBlobIndex === i && st.nextBlob) ? st.nextBlob : this.fetchDuetBlob(line);
    // Pre-carica la battuta successiva MENTRE questa scarica/suona
    if (i + 1 < st.lines.length) {
      st.nextBlobIndex = i + 1;
      st.nextBlob = this.fetchDuetBlob(st.lines[i + 1]);
    } else {
      st.nextBlob = null;
      st.nextBlobIndex = -1;
    }
    const blob = await blobPromise.catch(() => null);
    if (this.duetState !== st) return false; // stop o nuova traccia nel frattempo
    if (!blob) {
      if (i + 1 < st.lines.length) return this.playDuetLine(i + 1);
      return false;
    }
    // La voce corrente pilota i metadati Media Session della battuta
    this.currentCharacter = line.speaker;
    this.audioState.duetIndex = i;
    this.notifyAudioState();
    const ok = await this.playAudioBlob(blob, line.text);
    if (!ok && this.duetState === st && i + 1 < st.lines.length) {
      return this.playDuetLine(i + 1);
    }
    return ok;
  }

  public async playAudioUrl(url: string, poiId?: string, poiName?: string): Promise<boolean> {
    if (this.isGuideMuted || !url) return false;
    if (this.isGuidePlaybackActive()) {
      // Player occupato: accoda invece di scartare (la traccia partirà a fine
      // riproduzione via checkAudioQueue, come per playAudio).
      this.audioQueue.push({ url, poiId, poiName });
      return true;
    }

    this.stopExternalSpeech();
    this.initAudioContext();
    if (this.audioCtx?.state === "suspended") this.audioCtx.resume();

    if (this.ambientPlayer) this.ambientPlayer.volume = 0.02;

    this.audioState.poiId = poiId || null;
    this.audioState.poiName = poiName || null;
    // 🎧 Coordinate per il pan direzionale anche sugli MP3 offline/acquistati
    if (poiId) this.resolveCurrentPoiCoords(String(poiId));
    this.notifyAudioState();

    try {
      const res = await fetch(url);
      const blob = await res.blob();
      return await this.playAudioBlob(blob, "");
    } catch (e) {
      if (this.ambientPlayer) this.ambientPlayer.volume = 0.15;
      this.audioState.isPlaying = false;
      this.notifyAudioState();
      return false;
    }
  }

  private async playAudioBlob(blob: Blob, textLengthFallback: string): Promise<boolean> {
    // 1. Percorso nativo: ExoPlayer in foreground service, unico che sopravvive
    //    allo schermo spento. Il tag <audio> NON viene usato in parallelo.
    if (Capacitor.isNativePlatform()) {
      try {
        const { getNativeAudioUri } = await import('../lib/capacitor/nativeAudioHelper');

        const fileName = `tts_${Date.now()}.mp3`;
        const nativeUri = await getNativeAudioUri(blob, fileName);

        await WipBackgroundAudio.play({
          url: nativeUri,
          title: this.audioState.poiName || "ItaInta Audioguida",
          subtitle: "Narrazione in corso..."
        });
        await WipBackgroundAudio.setSpeed({ speed: this.audioState.playbackSpeed }).catch(() => {});

        this.isNativePlayback = true;
        // Riallinea l'effetto megafono sul player nativo: il service può
        // essere stato ricreato nel frattempo e aver perso il flag.
        WipBackgroundAudio.setMegaphone({ enabled: this.audioState.isMegaphone }).catch(() => {});
        this.audioState.isPlaying = true;
        this.audioState.isActive = true;
        this.audioState.progress = 0;
        this.audioState.currentTime = 0;
        this.notifyAudioState();

        // 🎭 In un duetto quota/storico si registrano solo alla PRIMA battuta
        if (!this.duetState || this.duetState.index === 0) await this.recordPlaybackStart();
        return true;
      } catch (e) {
        // Fallback in WebView: funziona solo con l'app in primo piano.
        console.error("[LocationService] Native audio playback failed, fallback WebView:", e);
        this.isNativePlayback = false;
      }
    }

    // 2. Percorso web / fallback
    const url = URL.createObjectURL(blob);
    this.currentObjectUrl = url;

    const audio = this.speechPlayer || new Audio();
    this.speechPlayer = audio;
    // Aggancia (se non già fatto) il player al grafo WebAudio del megafono:
    // qui speechPlayer esiste di sicuro, cosa non garantita nelle chiamate
    // precedenti a initAudioContext().
    this.initAudioContext();

    audio.src = url;
    audio.volume = 1; // il fallback dal percorso nativo poteva lasciarlo a 0 (audio muto)
    this.activeGuideAudio = audio;
    audio.playbackRate = this.audioState.playbackSpeed;

    audio.ontimeupdate = () => {
      if (audio.duration) {
        this.audioState.currentTime = audio.currentTime;
        this.audioState.duration = audio.duration;
        this.audioState.progress = (audio.currentTime / audio.duration) * 100;
        this.notifyAudioState();
      }
    };

    audio.onended = () => this.handlePlaybackFinished();
    audio.onerror = () => {
      console.warn("[LocationService] Audio element error");
      this.handlePlaybackFinished();
    };

    try {
      await audio.play();
      this.audioState.isPlaying = true;
      this.audioState.isActive = true;
      this.setupMediaSession(audio);
      this.notifyAudioState();

      // 🎭 In un duetto quota/storico si registrano solo alla PRIMA battuta
      if (!this.duetState || this.duetState.index === 0) await this.recordPlaybackStart();
      return true;
    } catch (e) {
      console.warn("[LocationService] Audio playback failed", e);
      this.releaseCurrentTrack();
      this.audioState.isPlaying = false;
      this.audioState.isActive = false;
      this.notifyAudioState();
      return false;
    }
  }

  /**
   * Media Session API (solo percorso web/PWA): metadati e controlli sulla
   * lock screen / notifica media del browser. Su nativo ci pensa ExoPlayer.
   */
  private setupMediaSession(audio: HTMLAudioElement) {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    try {
      const characterName = this.currentCharacter === 'dante' ? 'Dante' : 'Nicky';
      navigator.mediaSession.metadata = new MediaMetadata({
        title: this.audioState.poiName || 'Audioguida',
        artist: `WIP — ${characterName}`,
        album: 'World in Pocket',
      });
      navigator.mediaSession.setActionHandler('play', () => this.resumeGuideAudio());
      navigator.mediaSession.setActionHandler('pause', () => this.pauseGuideAudio());
      navigator.mediaSession.setActionHandler('stop', () => this.stopGuideAudio());
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (details && typeof details.seekTime === 'number' && this.activeGuideAudio) {
          this.activeGuideAudio.currentTime = details.seekTime;
        }
      });
      navigator.mediaSession.playbackState = 'playing';
    } catch { /* API parzialmente supportata: mai bloccare la riproduzione */ }
  }

  private setMediaSessionPlaybackState(state: 'none' | 'paused' | 'playing') {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    try { navigator.mediaSession.playbackState = state; } catch { /* ignore */ }
  }

  /** Quota + storico ascolti: non deve mai far fallire la riproduzione. */
  private async recordPlaybackStart(): Promise<void> {
    const poiId = this.audioState.poiId;
    if (!poiId) return;
    // Anti-ripetizione (wip_played_pois): il trigger web salta i POI già
    // ascoltati; "Azzera Storico" nel setup resetta questo set.
    try { markPlayed(poiId); } catch { /* storage non disponibile */ }
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const currentUserId = sessionData?.session?.user?.id || "mock-user-id";
      await incrementUserQuota(currentUserId, "audio_guide");
      const { getPoiById } = await import('./poiRepository');
      const poi = await getPoiById(poiId);
      if (poi) recordListening(poi, currentUserId);
    } catch (e) {
      console.warn("[LocationService] recordPlaybackStart failed", e);
    }
  }

  /** Ferma la narrazione gestita da ttsService (percorso PoiCard / popup mappa). */
  private stopExternalSpeech() {
    if (typeof window === 'undefined') return;
    try {
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
      window.dispatchEvent(new CustomEvent('wip-stop-external-audio'));
    } catch { /* ignore */ }
  }

  private checkAudioQueue() {
    const next = this.audioQueue.shift();
    if (!next) return;
    if (next.url) {
      this.playAudioUrl(next.url, next.poiId, next.poiName);
    } else if (next.text) {
      // authorize viene passato oltre: l'addebito avviene solo ORA che la
      // traccia parte davvero, non quando era stata accodata.
      this.playAudio(next.text, next.poiName, next.poiCategory, next.poiId, next.character, next.authorize);
    }
  }

  private getNeuralVoiceName(lang: Language, mode: 'nicky' | 'dante'): string {
    const l = lang.toUpperCase();
    const voiceMapping: Record<string, { nicky: string; dante: string }> = {
      IT: { nicky: "it-IT-ElsaNeural", dante: "it-IT-DiegoNeural" },
      EN: { nicky: "en-US-JennyNeural", dante: "en-US-GuyNeural" },
      FR: { nicky: "fr-FR-DeniseNeural", dante: "fr-FR-HenriNeural" },
      ES: { nicky: "es-ES-ElviraNeural", dante: "es-ES-AlvaroNeural" },
      RU: { nicky: "ru-RU-SvetlanaNeural", dante: "ru-RU-DmitryNeural" },
      ZH: { nicky: "zh-CN-XiaoxiaoNeural", dante: "zh-CN-YunxiNeural" },
      DE: { nicky: "de-DE-KatjaNeural", dante: "de-DE-ConradNeural" }
    };
    return voiceMapping[l]?.[mode] || "it-IT-ElsaNeural";
  }

  public unlockAudio() { this.audioUnlocked = true; this.initAudioContext(); }

  public pauseGuideAudio() {
    if (this.activeGuideAudio) this.activeGuideAudio.pause();
    if (this.fallbackUtterance && typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try { window.speechSynthesis.pause(); } catch { /* ignore */ }
    }
    if (this.isNativePlayback) {
      WipBackgroundAudio.pause().catch(() => {});
    }
    this.audioState.isPlaying = false;
    this.setMediaSessionPlaybackState('paused');
    this.notifyAudioState();
  }

  public resumeGuideAudio() {
    if (this.activeGuideAudio) this.activeGuideAudio.play().catch(() => {});
    if (this.fallbackUtterance && typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try { window.speechSynthesis.resume(); } catch { /* ignore */ }
    }
    if (this.isNativePlayback) {
      WipBackgroundAudio.resume().catch(() => {});
    }
    this.audioState.isPlaying = true;
    this.setMediaSessionPlaybackState('playing');
    this.notifyAudioState();
  }

  public stopGuideAudio() {
    // Guardia anti-rientranza: il dispatch di 'wip-audio-stopped' fa avanzare
    // la coda in AudioQueueManager, che a sua volta richiama stopGuideAudio.
    if (this.isStoppingGuide) return;
    this.isStoppingGuide = true;
    try {
      // ⏱ Feedback trigger anche alla CHIUSURA manuale di una traccia partita
      // da geofence (prima del reset di poiId qui sotto).
      if (this.currentPlaybackFromTrigger) {
        this.currentPlaybackFromTrigger = false;
        this.maybeRequestTriggerFeedback(this.audioState.poiId);
      }
      // 🎭 Il duetto si interrompe con la traccia; niente avanzamento battute.
      this.clearDuetState();
      this.currentPoiCoords = null;
      if (this.activeGuideAudio) {
        this.activeGuideAudio.pause();
        this.activeGuideAudio.src = "";
      }
      if (this.fallbackUtterance) {
        // Azzerato PRIMA del cancel: il finish() dell'utterance controlla
        // l'identità e così non richiama handlePlaybackFinished.
        this.fallbackUtterance = null;
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
          try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
        }
      }
      if (this.isNativePlayback || Capacitor.isNativePlatform()) {
        WipBackgroundAudio.stop().catch(() => {});
      }
      this.releaseCurrentTrack();
      this.audioQueue = [];
      this.audioState.isPlaying = false;
      this.audioState.isActive = false;
      this.audioState.poiId = null;
      this.audioState.poiName = null;
      this.audioState.progress = 0;
      this.audioState.currentTime = 0;
      this.audioState.duration = 0;
      this.setMediaSessionPlaybackState('none');
      this.notifyAudioState();
      if (this.ambientPlayer) this.ambientPlayer.volume = 0.15;
      // Notifica lo stop ai listener esterni: useGeofencing lo usa per far
      // avanzare la coda geofence quando l'utente preme STOP.
      if (typeof window !== 'undefined') {
        try { window.dispatchEvent(new CustomEvent('wip-audio-stopped')); } catch { /* ignore */ }
      }
    } finally {
      this.isStoppingGuide = false;
    }
  }

  public seek(seconds: number) {
    if (this.isNativePlayback) {
      WipBackgroundAudio.seek({ offset: seconds }).catch(() => {});
      return;
    }
    if (this.activeGuideAudio) {
      this.activeGuideAudio.currentTime += seconds;
    }
  }

  public restart() {
    if (this.isNativePlayback) {
      WipBackgroundAudio.seek({ position: 0 }).catch(() => {});
      this.resumeGuideAudio();
      return;
    }
    if (this.activeGuideAudio) {
      this.activeGuideAudio.currentTime = 0;
      this.resumeGuideAudio();
    }
  }

  public async sendLocalNotification(title: string, body: string) {
    if (!Capacitor.isNativePlatform()) return;
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    await LocalNotifications.schedule({ notifications: [{ title, body, id: Math.floor(Math.random() * 100000) }] });
  }

  public injectMockLocation(lat: number, lon: number) {
    const update: LocationUpdate = { latitude: lat, longitude: lon, speed: 0, heading: 0, accuracy: 10, timestamp: Date.now() };
    this.lastLocation = update;
    this.listeners.forEach(l => l(update));
  }
}

export const locationService = new LocationService();
if (typeof window !== 'undefined') (window as any).locationService = locationService;
