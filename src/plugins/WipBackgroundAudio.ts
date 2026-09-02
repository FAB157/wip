import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';

export interface WipAudioStatus {
  isPlaying: boolean;
  hasMedia: boolean;
  /** secondi */
  position: number;
  /** secondi (0 se sconosciuta) */
  duration: number;
}

export interface WipBackgroundAudioPlugin {
  /**
   * Prepara e riproduce l'audio nativamente in background,
   * forzando il MediaSession in Lock Screen.
   */
  play(options: {
    url: string;
    title: string;
    subtitle?: string;
    imageUri?: string
  }): Promise<{ playing: boolean }>;

  pause(): Promise<void>;
  resume(): Promise<void>;
  stop(): Promise<void>;
  setSpeed(options: { speed: number }): Promise<void>;

  /**
   * Attiva/disattiva l'effetto "megafono" (banda 700–3500Hz + boost) sul
   * player nativo. Sul web l'equivalente è il grafo WebAudio di locationService.
   */
  setMegaphone(options: { enabled: boolean }): Promise<void>;

  /**
   * Sposta la riproduzione: `position` = secondi assoluti,
   * `offset` = secondi relativi alla posizione corrente (anche negativi).
   */
  seek(options: { position?: number; offset?: number }): Promise<void>;

  /** Stato corrente del player nativo. */
  getStatus(): Promise<WipAudioStatus>;

  /**
   * Inizializza la MediaSession nativa e ascolta i controlli lock screen
   */
  setupMediaSession(): Promise<void>;

  /** Riproduzione terminata naturalmente (fine traccia). */
  addListener(
    eventName: 'playbackEnded',
    listener: () => void,
  ): Promise<PluginListenerHandle> & PluginListenerHandle;

  /** Errore del player nativo: il JS deve considerare la traccia conclusa. */
  addListener(
    eventName: 'playbackError',
    listener: (data: { message: string }) => void,
  ): Promise<PluginListenerHandle> & PluginListenerHandle;

  /** Play/pausa effettivi del player nativo (inclusi lock screen e audio focus). */
  addListener(
    eventName: 'playbackStatus',
    listener: (data: { isPlaying: boolean }) => void,
  ): Promise<PluginListenerHandle> & PluginListenerHandle;

  /** Avanzamento in secondi, emesso ogni 500ms durante la riproduzione. */
  addListener(
    eventName: 'playbackProgress',
    listener: (data: { position: number; duration: number }) => void,
  ): Promise<PluginListenerHandle> & PluginListenerHandle;

  /**
   * Il megafono non e' applicabile su questo dispositivo: Android non espone
   * gli audiofx (Equalizer/LoudnessEnhancer), oppure siamo su iOS dove
   * l'effetto non esiste. Il JS spegne il tasto invece di lasciarlo acceso su
   * un effetto che non arrivera' mai (01/09/2026).
   */
  addListener(
    eventName: 'megaphoneUnavailable',
    listener: () => void,
  ): Promise<PluginListenerHandle> & PluginListenerHandle;

  removeAllListeners(): Promise<void>;
}

export const WipBackgroundAudio = registerPlugin<WipBackgroundAudioPlugin>('WipBackgroundAudio');