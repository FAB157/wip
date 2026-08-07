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
import { getMapboxRoute, getRoadDistance, getNextNavInstruction } from '../lib/mapboxRouter';
import { getApiUrl } from '../lib/api';
import { audioQueueManager } from '../lib/AudioQueueManager';
import { radiiForTransport, resolveTransportMode, getTransportPreference, markPlayed } from '../lib/guideSettings';

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
}

export type LocationListener = (location: LocationUpdate) => void;
export type AudioStateListener = (state: AudioState) => void;

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
  private audioQueue: Array<{ text?: string, url?: string, poiName?: string, poiCategory?: string, poiId?: string, character?: 'nicky' | 'dante' }> = [];

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
    isMegaphone: false
  };

  private audioCtx: AudioContext | null = null;
  private audioNodes: {
    source: MediaElementAudioSourceNode;
    highpass: BiquadFilterNode;
    lowpass: BiquadFilterNode;
    gain: GainNode;
  } | null = null;

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

          ItaintaBackgroundPoiPlugin.addListener('poiApproaching', (data: any) => {
            if (data) {
               window.dispatchEvent(new CustomEvent('poi-approaching', {
                  detail: { poiId: data.poiId, poiName: data.poiName, lat: data.lat, lon: data.lon }
               }));
            }
          });

          ItaintaBackgroundPoiPlugin.addListener('poiArrived', (data: any) => {
            if (data) {
               window.dispatchEvent(new CustomEvent('poi-arrived', {
                  detail: { poiId: data.poiId, poiName: data.poiName, lat: data.lat, lon: data.lon, teaser: data.teaser }
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
    return this.isNativePlayback || this.activeGuideAudio !== null;
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
      // Il grafo dei filtri (megafono) va agganciato appena speechPlayer
      // esiste: prima veniva creato SOLO se il player c'era già alla prima
      // chiamata, altrimenti restava scollegato per sempre e il megafono
      // diventava un no-op silenzioso.
      if (this.speechPlayer && !this.audioNodes) {
        const source = this.audioCtx.createMediaElementSource(this.speechPlayer);
        const highpass = this.audioCtx.createBiquadFilter();
        highpass.type = "highpass";
        const lowpass = this.audioCtx.createBiquadFilter();
        lowpass.type = "lowpass";
        const gain = this.audioCtx.createGain();
        source.connect(highpass);
        highpass.connect(lowpass);
        lowpass.connect(gain);
        gain.connect(this.audioCtx.destination);
        this.audioNodes = { source, highpass, lowpass, gain };
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

  public setVibration(enabled: boolean) {
      this.isVibrationEnabled = enabled;
  }
  
  public setCategories(categories: string[]) {
      this.activeCategories = categories;
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
        // Sempre rinfresca le impostazioni se il servizio è attivo o deve esserlo
        this.startNativeBackgroundService();
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

      if (this.activeCategories.length > 0) {
        pois = pois.filter(p => {
          const cat = (p.category || '').toLowerCase();
          // Gemme sempre attive (checkbox bloccata nel setup GeoControl),
          // come nel filtro nativo (SupabaseClient.parsePoiList).
          const isGem = p.premium || p.is_gem || cat === 'gemme';
          return isGem || this.activeCategories.includes(cat);
        });
      }

      this.geofenceCandidates = pois;
      window.dispatchEvent(new CustomEvent('pois-updated', { detail: pois }));
    } catch (e) {
      console.warn("[LocationService] Instant fetch failed", e);
    }
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
      const coords = isNative ? position : position.coords;
      if (!coords) return;
      const now = Date.now();
      const update: LocationUpdate = {
        latitude: coords.latitude,
        longitude: coords.longitude,
        speed: coords.speed || 0,
        heading: coords.heading || 0,
        accuracy: coords.accuracy || 10,
        timestamp: isNative ? (position.time || now) : (position.timestamp || now),
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
      // Notifica il banner di avvicinamento per aggiornare le distanze in tempo reale
      window.dispatchEvent(new CustomEvent('wip-location-update', {
        detail: { lat: update.latitude, lon: update.longitude, heading: update.heading }
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
          
          if (this.activeCategories.length > 0) {
            pois = pois.filter(p => {
              const cat = (p.category || '').toLowerCase();
              // Gemme sempre attive, allineato al percorso nativo
              const isGem = p.premium || p.is_gem || cat === 'gemme';
              return isGem || this.activeCategories.includes(cat);
            });
          }
          
          this.geofenceCandidates = pois;
          window.dispatchEvent(new CustomEvent('pois-updated', { detail: pois }));
        } catch (e) {
          console.warn("[LocationService] Failed to fetch web POIs", e);
        }
      }
    };

    if (typeof window !== 'undefined' && Capacitor.isNativePlatform()) {
      try {
        this.watchId = await Geolocation.watchPosition(
          { enableHighAccuracy: true, timeout: 10000 },
          (position) => { if (position) handlePosition(position, true); }
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

  public async playAudio(text: string, poiName?: string, poiCategory?: string, poiId?: string, character?: 'nicky' | 'dante'): Promise<boolean> {
    if (this.isGuideMuted || !text) return false;

    // Se stiamo già riproducendo questo specifico POI, facciamo solo toggle play/pause se richiesto esternamente
    // Ma qui la logica è "avvia riproduzione", quindi se è lo stesso e siamo in pausa, riprendiamo
    if (poiId && this.audioState.poiId === poiId && this.isGuidePlaybackActive()) {
       this.resumeGuideAudio();
       return true;
    }

    if (this.isGuidePlaybackActive()) {
      this.audioQueue.push({ text, poiName, poiCategory, poiId, character });
      return true;
    }

    // Interrompe l'eventuale narrazione avviata da ttsService (PoiCard / popup mappa)
    // per evitare due audioguide sovrapposte.
    this.stopExternalSpeech();

    this.initAudioContext();
    if (this.audioCtx?.state === "suspended") this.audioCtx.resume();

    if (this.ambientPlayer) this.ambientPlayer.volume = 0.02;

    this.audioState.poiId = poiId || null;
    this.audioState.poiName = poiName || null;
    this.notifyAudioState();

    try {
      // Il personaggio scelto nella scheda POI (Nicky = femminile, Dante =
      // maschile) ha priorità sullo stato globale: senza questo override la
      // voce restava quella di guideMode (default Nicky) anche selezionando
      // Dante, in tutte le lingue.
      const voice = this.getNeuralVoiceName(this.language, character || this.guideMode);
      const res = await fetch(getApiUrl('/api/tts/smart'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice })
      });
      if (!res.ok) throw new Error(`TTS ${res.status}`);
      const blob = await res.blob();
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
      if (this.ambientPlayer) this.ambientPlayer.volume = 0.15;
      this.audioState.isPlaying = false;
      this.notifyAudioState();
      return false;
    }
  }

  public async playAudioUrl(url: string, poiId?: string, poiName?: string): Promise<boolean> {
    if (this.isGuideMuted || !url) return false;
    if (this.isGuidePlaybackActive()) return false;

    this.stopExternalSpeech();
    this.initAudioContext();
    if (this.audioCtx?.state === "suspended") this.audioCtx.resume();

    if (this.ambientPlayer) this.ambientPlayer.volume = 0.02;

    this.audioState.poiId = poiId || null;
    this.audioState.poiName = poiName || null;
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

        await this.recordPlaybackStart();
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
      this.notifyAudioState();

      await this.recordPlaybackStart();
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
      this.playAudio(next.text, next.poiName, next.poiCategory, next.poiId, next.character);
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
    if (this.isNativePlayback) {
      WipBackgroundAudio.pause().catch(() => {});
    }
    this.audioState.isPlaying = false;
    this.notifyAudioState();
  }

  public resumeGuideAudio() {
    if (this.activeGuideAudio) this.activeGuideAudio.play().catch(() => {});
    if (this.isNativePlayback) {
      WipBackgroundAudio.resume().catch(() => {});
    }
    this.audioState.isPlaying = true;
    this.notifyAudioState();
  }

  public stopGuideAudio() {
    if (this.activeGuideAudio) {
      this.activeGuideAudio.pause();
      this.activeGuideAudio.src = "";
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
    this.notifyAudioState();
    if (this.ambientPlayer) this.ambientPlayer.volume = 0.15;
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
