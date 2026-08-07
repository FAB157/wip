export class AudioOutputManager {
  private currentDeviceId: string = 'default';
  private onDeviceChangeCallback?: (devices: MediaDeviceInfo[]) => void;
  private autoDetectEnabled: boolean = true;
  private isBrowserSupported: boolean = true;

  constructor() {
    if (typeof navigator !== 'undefined' && navigator.mediaDevices) {
      navigator.mediaDevices.addEventListener('devicechange', this.handleDeviceChange.bind(this));
      
      const stored = localStorage.getItem('wip_audio_device');
      if (stored) this.currentDeviceId = stored;

      const autoDetectStr = localStorage.getItem('wip_bt_autodetect');
      if (autoDetectStr) this.autoDetectEnabled = autoDetectStr === 'true';

      if (this.autoDetectEnabled) {
        this.autoDetectBluetooth();
      }
    } else {
      this.isBrowserSupported = false;
    }
  }

  private async handleDeviceChange() {
    if (!this.isBrowserSupported) return;
    const devices = await this.getAudioDevices();
    if (this.onDeviceChangeCallback) {
      this.onDeviceChangeCallback(devices);
    }
    
    if (this.autoDetectEnabled) {
      await this.autoDetectBluetooth();
    }
  }

  public async getAudioDevices(): Promise<MediaDeviceInfo[]> {
    if (!this.isBrowserSupported) return [];
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true }); // Request permissions if needed
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter(device => device.kind === 'audiooutput');
    } catch (e) {
      console.warn('[Audio] Non è stato possibile enumerare i dispositivi audio', e);
      return [];
    }
  }

  public async setOutputDevice(deviceId: string): Promise<void> {
    this.currentDeviceId = deviceId;
    localStorage.setItem('wip_audio_device', deviceId);
    console.log(`[Audio] Impostato dispositivo di output: ${deviceId}`);
  }

  public async autoDetectBluetooth(): Promise<boolean> {
    if (!this.isBrowserSupported) return false;
    
    const devices = await this.getAudioDevices();
    const btDevice = devices.find(d => {
      const label = d.label.toLowerCase();
      return label.includes('bluetooth') || 
             label.includes('car') || 
             label.includes('auto') || 
             label.includes('handsfree') || 
             label.includes('a2dp');
    });

    if (btDevice && btDevice.deviceId !== this.currentDeviceId) {
      console.log(`[Audio] Auto-rilevato dispositivo Bluetooth: ${btDevice.label}`);
      await this.setOutputDevice(btDevice.deviceId);
      return true;
    }
    return false;
  }

  public setAutoDetectEnabled(enabled: boolean) {
    this.autoDetectEnabled = enabled;
    localStorage.setItem('wip_bt_autodetect', String(enabled));
    if (enabled) this.autoDetectBluetooth();
  }

  public isAutoDetectEnabled(): boolean {
    return this.autoDetectEnabled;
  }

  public getCurrentDeviceId(): string {
    return this.currentDeviceId;
  }

  public onDeviceChange(callback: (devices: MediaDeviceInfo[]) => void): void {
    this.onDeviceChangeCallback = callback;
  }

  public speak(text: string, priority: 'normal' | 'high'): void {
    console.log(`[Audio] Speak (${priority}): ${text} [Device: ${this.currentDeviceId}]`);
    
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'it-IT';
    
    if (priority === 'high') {
      window.speechSynthesis.cancel();
    }

    // Experimental: routing Web Speech API output via an Audio element if setSinkId is supported.
    // In standard browsers, SpeechSynthesis cannot be directly routed to a sinkId yet.
    // However, if we're using a backend TTS like ElevenLabs/Azure that returns a Blob,
    // we would route it here via HTMLAudioElement.setSinkId()
    
    // For now, we fire standard speech synthesis. If the OS handles BT routing, it goes to BT.
    window.speechSynthesis.speak(utterance);
  }
}

export const audioOutputManager = new AudioOutputManager();
