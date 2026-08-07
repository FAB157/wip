/**
 * audioDirector.ts
 * Genera e pronuncia istruzioni audio contestuali
 * Stile navigatore: "Tra 300 metri, svolta a destra: il Duomo"
 */

import type { TransportMode } from './transportDetector';
import type { TriggerEvent } from './triggerManager';
import { getCategoryLabel } from './categoryFilter';

// Anti-repeat: non riannunciare lo stesso POI per N ms
const AUDIO_REPEAT_COOLDOWN_MS = 30_000;
const lastAudioTime = new Map<string, number>();

function formatDistance(meters: number, mode: TransportMode): string {
  if (mode === 'driving') {
    if (meters >= 1000) return `${(meters / 1000).toFixed(1)} chilometri`;
    if (meters >= 100) return `${Math.round(meters / 50) * 50} metri`;
    return `${Math.round(meters / 10) * 10} metri`;
  } else {
    if (meters >= 500) return `${Math.round(meters / 100) * 100} metri`;
    if (meters >= 50) return `${Math.round(meters / 10) * 10} metri`;
    return `${Math.round(meters)} metri`;
  }
}

function buildBannerMessage(event: TriggerEvent): string {
  const { poi, remainingDistance, mode, nextStep } = event;
  const category = getCategoryLabel(poi);
  const dist = formatDistance(remainingDistance, mode);
  const name = poi.name;

  if (mode === 'driving') {
    if (nextStep && nextStep !== 'Inizia il percorso') {
      // "Tra 350 metri, svolta a destra: il Castello Doria"
      return `Tra ${dist}, ${nextStep.toLowerCase()}: ${name}`;
    }
    return `Tra ${dist} trovi ${name}, ${category}`;
  } else {
    // Walking
    if (nextStep && nextStep !== 'Inizia il percorso') {
      return `Tra ${dist} ${nextStep.toLowerCase()} per raggiungere ${name}`;
    }
    return `Tra ${dist} si trova ${name}, ${category}`;
  }
}

function buildCardMessage(event: TriggerEvent): string {
  const { poi, mode } = event;
  const category = getCategoryLabel(poi);

  if (mode === 'driving') {
    return `Stai arrivando a ${poi.name}. ${category} sulla tua destra.`;
  }
  return `Sei arrivato a ${poi.name}. Benvenuto in questo ${category}.`;
}

let currentUtterance: SpeechSynthesisUtterance | null = null;

/**
 * Pronuncia testo con Web Speech API
 */
export function speak(text: string, priority: 'normal' | 'high' = 'normal') {
  if (!('speechSynthesis' in window)) return;

  if (priority === 'high') {
    window.speechSynthesis.cancel();
  } else if (window.speechSynthesis.speaking) {
    return; // non interrompere audio in corso
  }

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'it-IT';
  utterance.rate = 0.95;
  utterance.pitch = 1.0;
  utterance.volume = 1.0;

  // Preferisci voce italiana se disponibile
  const voices = window.speechSynthesis.getVoices();
  const italianVoice = voices.find(v =>
    v.lang.startsWith('it') && (v.name.includes('Alice') || v.name.includes('Google'))
  ) || voices.find(v => v.lang.startsWith('it'));

  if (italianVoice) utterance.voice = italianVoice;

  currentUtterance = utterance;
  window.speechSynthesis.speak(utterance);
}

/**
 * Gestisce evento trigger e genera audio appropriato
 */
export function handleTriggerAudio(event: TriggerEvent) {
  const { type, poi } = event;
  const now = Date.now();

  // Anti-repeat
  const audioKey = `${poi.id}:${type}`;
  const lastTime = lastAudioTime.get(audioKey) ?? 0;
  if (now - lastTime < AUDIO_REPEAT_COOLDOWN_MS) return;
  lastAudioTime.set(audioKey, now);

  let message = '';

  switch (type) {
    case 'banner':
      message = buildBannerMessage(event);
      speak(message, 'normal');
      break;

    case 'card':
      message = buildCardMessage(event);
      speak(message, 'high'); // priorità alta: siamo arrivati
      break;

    case 'dismiss':
      // Nessun audio per dismiss
      break;
  }

  return message;
}

export function stopAudio() {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}
