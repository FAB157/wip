// =====================================================================
// ITAINTA · AudioQueueManager — Coda sequenziale audioguide
// =====================================================================

import { locationService } from '../services/locationService';
import { getOrCreateAudioguideText } from '../services/audioguideService';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Capacitor } from '@capacitor/core';
import type { GeofencePoi, GuideCharacter } from '../types/poi';

export type PoiState = 'idle' | 'alert_fired' | 'trigger_fired' | 'playing' | 'completed' | 'dismissed' | 'passed';

export interface QueuedPoi {
  poi: GeofencePoi;
  state: PoiState;
  distance: number;
  prevDistance: number;
  isCar: boolean;
  alertFired: boolean;
  triggerFired: boolean;
  enteredAt: number;
  alertRadius: number;
  triggerRadius: number;
}

class AudioQueueManager {
  private queue: QueuedPoi[] = [];
  private isProcessing = false;
  private activeNotificationId: string | null = null;

  public currentLanguage: string = 'IT';
  public currentCharacter: GuideCharacter = 'nicky';

  public get activationMode(): 'automatic' | 'manual' {
    return (localStorage.getItem('wip_activation_mode') as 'automatic' | 'manual') || 'automatic';
  }

  public update(poi: GeofencePoi, dist: number, isCar: boolean, alertRadius: number, triggerRadius: number): void {
    let item = this.queue.find(q => q.poi.id === poi.id);
    const now = Date.now();

    if (!item) {
      if (dist > alertRadius) return;
      item = { poi, state: 'idle', distance: dist, prevDistance: dist, isCar, alertFired: false, triggerFired: false, enteredAt: now, alertRadius, triggerRadius };
      this.queue.push(item);
      this.sortQueue();
    } else {
      item.prevDistance = item.distance;
      item.distance = dist;
      item.isCar = isCar;
    }

    // Abbandono / Timeout
    const timeInZone = now - item.enteredAt;
    const abandonmentRadius = isCar ? alertRadius * 2.5 : alertRadius * 1.5;
    if ((item.state === 'alert_fired' || item.state === 'trigger_fired') && (dist > abandonmentRadius || (timeInZone > 300000 && dist > triggerRadius * 2))) {
      this.markPassed(item.poi.id);
      return;
    }

    // Aggiorna UI
    const leadPoi = this.getLeadPoi();
    if (leadPoi && leadPoi.poi.id === poi.id) {
        if (item.state === 'alert_fired' || item.state === 'trigger_fired') {
            this.dispatchDistanceUpdate(poi, dist, isCar);
            this.updateLocalNotification(poi, dist);
        }
    }

    this.processQueue();
  }

  private getLeadPoi(): QueuedPoi | null {
    const active = this.queue.filter(q => ['alert_fired', 'trigger_fired', 'playing'].includes(q.state));
    if (active.length === 0) return null;
    return active.sort((a, b) => {
        if (a.state === 'playing') return -1;
        const aIsGem = a.poi.is_gem || a.poi.category === 'gemme';
        const bIsGem = b.poi.is_gem || b.poi.category === 'gemme';
        if (aIsGem && !bIsGem) return -1;
        if (!aIsGem && bIsGem) return 1;
        return a.distance - b.distance;
    })[0];
  }

  private sortQueue(): void {
    this.queue.sort((a, b) => (a.distance - b.distance));
  }

  private processQueue(): void {
    if (this.isProcessing) return;
    this.isProcessing = true;
    try {
      if (this.queue.some(q => q.state === 'playing')) return;

      for (const item of this.queue) {
        if (['completed', 'dismissed', 'passed'].includes(item.state)) continue;

        if (!item.alertFired && item.distance <= item.alertRadius) {
          item.alertFired = true;
          item.state = 'alert_fired';
          this.fireAlert(item);
          break;
        }

        if (item.alertFired && !item.triggerFired && item.distance <= item.triggerRadius) {
          item.triggerFired = true;
          item.state = 'trigger_fired';
          this.fireTrigger(item);
          if (this.activationMode === 'automatic') {
            setTimeout(() => this.userTriggeredPlay(item.poi.id), 2000);
          }
          break;
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }

  public userTriggeredPlay(poiId: string): void {
    const item = this.queue.find(q => q.poi.id === poiId);
    if (item && item.state !== 'playing') {
      item.state = 'playing';
      this.executePlay(item);
    }
  }

  private async executePlay(item: QueuedPoi) {
    // CANCELLO PAGAMENTI: prima l'autoplay (e il tasto Ascolta) riproduceva
    // la guida completa GRATIS, bypassando crediti e Day Pass. Ora: acquisto
    // pregresso → gratis; Day Pass attivo → scala il contatore; altrimenti
    // niente audio e si apre la scheda POI col tasto "Ascolta" e il modale
    // di acquisto da 15 crediti (stessa logica del percorso nativo).
    try {
      const { authorizeGuidePlayback } = await import('../services/dayPassService');
      const auth = await authorizeGuidePlayback(String(item.poi.id));
      if (!auth.allowed) {
        item.state = 'trigger_fired';
        window.dispatchEvent(new CustomEvent('wip-poi-trigger', {
          detail: { poiId: item.poi.id, poi: item.poi, alreadyPaid: false, autoPlay: false, needsPayment: true }
        }));
        return;
      }
    } catch {
      // Fail-closed: in dubbio niente riproduzione gratuita
      item.state = 'trigger_fired';
      return;
    }

    const text = await getOrCreateAudioguideText(item.poi, this.currentLanguage, this.currentCharacter);
    if (!text) { this.markPassed(item.poi.id); return; }

    const success = await locationService.playAudio(text, item.poi.name);
    this.cancelLocalNotification(item.poi.id);
    item.state = success ? 'completed' : 'dismissed';
    this.queue = this.queue.filter(q => q.poi.id !== item.poi.id);
    this.processQueue();
  }

  private markPassed(poiId: string) {
    this.cancelLocalNotification(poiId);
    this.queue = this.queue.filter(q => q.poi.id !== poiId);
    window.dispatchEvent(new CustomEvent('wip-poi-exit', { detail: { poiId } }));
    this.processQueue();
  }

  private async fireAlert(item: QueuedPoi) {
    const isGem = item.poi.is_gem || item.poi.category === 'gemme';
    if (Capacitor.isNativePlatform()) {
      if (isGem) await Haptics.vibrate({ duration: 500 });
      else await Haptics.impact({ style: ImpactStyle.Light });
    }
    this.triggerLocalNotification(item.poi, item.distance);
    window.dispatchEvent(new CustomEvent('wip-poi-approach', { detail: item }));
  }

  private fireTrigger(item: QueuedPoi) {
    if (Capacitor.isNativePlatform()) Haptics.vibrate({ duration: 200 });
    window.dispatchEvent(new CustomEvent('wip-poi-trigger', { detail: { poi: item.poi } }));
  }

  private async triggerLocalNotification(poi: GeofencePoi, dist: number) {
    if (!Capacitor.isNativePlatform()) return;
    const id = this.getNotificationId(poi.id);
    this.activeNotificationId = poi.id;
    await LocalNotifications.schedule({
      notifications: [{
        title: poi.name,
        body: `📍 Distanza: ${Math.round(dist)}m. Tocca per ascoltare.`,
        id, ongoing: true, autoCancel: false,
        actionTypeId: 'GEOFENCE_ACTIONS',
        extra: { poiId: poi.id },
        channelId: 'geofence-alerts'
      }]
    });
  }

  private async updateLocalNotification(poi: GeofencePoi, dist: number) {
    if (!Capacitor.isNativePlatform()) return;
    await LocalNotifications.schedule({
      notifications: [{
        title: poi.name,
        body: `📍 Distanza: ${Math.round(dist)}m.`,
        id: this.getNotificationId(poi.id),
        ongoing: true, autoCancel: false,
        channelId: 'geofence-alerts',
        sound: undefined
      }]
    });
  }

  private async cancelLocalNotification(poiId: string) {
    if (!Capacitor.isNativePlatform()) return;
    await LocalNotifications.cancel({ notifications: [{ id: this.getNotificationId(poiId) }] });
  }

  private getNotificationId(poiId: string): number {
    let hash = 0;
    for (let i = 0; i < poiId.length; i++) hash = ((hash << 5) - hash) + poiId.charCodeAt(i);
    return Math.abs(hash % 100000);
  }

  private dispatchDistanceUpdate(poi: GeofencePoi, dist: number, isCar: boolean) {
    window.dispatchEvent(new CustomEvent('wip-poi-distance-update', {
      detail: { poiId: poi.id, distance: Math.round(dist), isCar, entries: this.queue.filter(q => q.state !== 'idle').map(q => ({ poi: q.poi, distance: q.distance, isGem: q.poi.is_gem })) }
    }));
  }

  public dequeue(id: string) { this.markPassed(id); }

  public getQueue(): QueuedPoi[] { return this.queue; }

  public userStoppedAudio(): void {
    const playing = this.queue.find(q => q.state === 'playing');
    if (playing) {
      playing.state = 'dismissed';
      locationService.stopGuideAudio();
    }
  }
}

export const audioQueueManager = new AudioQueueManager();
