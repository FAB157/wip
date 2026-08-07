import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { locationService } from '../services/locationService';

export interface LiveSession {
  id: string;
  pin: string;
  leader_id: string;
  is_active: boolean;
  current_poi_id?: string;
}

// ─── Stato a livello di MODULO ────────────────────────────────────────────
// La sessione e il canale realtime NON vivono nello state del componente:
// LiveTourPanel è montato solo quando il tab "livetour" è aperto, e con lo
// stato dentro l'hook uscire dal tab chiudeva il canale e uccideva il tour
// (il leader non poteva nemmeno andare sulla mappa a far partire un'audio-
// guida). Qui invece la sessione sopravvive alla navigazione; i componenti
// montati si ri-sincronizzano via listener.
let moduleSession: LiveSession | null = null;
let moduleIsLeader = false;
let moduleChannel: any = null;
let moduleParticipants = 0;
let leaderAudioListener: ((e: any) => void) | null = null;
let restoreAttempted = false;
const sessionListeners = new Set<() => void>();

const PIN_STORAGE_KEY = 'wip_live_tour_pin';

function notifySessionChanged() {
  sessionListeners.forEach(l => l());
}

function teardownModuleChannel() {
  if (leaderAudioListener) {
    window.removeEventListener('wip-leader-audio-start', leaderAudioListener);
    leaderAudioListener = null;
  }
  if (moduleChannel) {
    supabase.removeChannel(moduleChannel);
    moduleChannel = null;
  }
  moduleParticipants = 0;
}

function clearModuleSession() {
  teardownModuleChannel();
  moduleSession = null;
  moduleIsLeader = false;
  try { localStorage.removeItem(PIN_STORAGE_KEY); } catch { /* ignore */ }
  notifySessionChanged();
}

function subscribeModuleChannel(pin: string, leader: boolean) {
  teardownModuleChannel();
  // Presence: ogni membro si "registra" sul canale con una chiave propria →
  // conteggio partecipanti reale senza tabelle aggiuntive.
  const presenceKey = `${leader ? 'leader' : 'member'}-${Math.random().toString(36).slice(2, 10)}`;
  const channel = supabase.channel(`live_tour:${pin}`, {
    config: { presence: { key: presenceKey } }
  });

  channel
    .on('broadcast', { event: 'audio-start' }, (payload: any) => {
      if (!moduleIsLeader) {
        // Follower: riproduci l'audio sbloccato dal leader
        const { audioUrl, textToSpeak, poiName } = payload.payload || {};
        if (audioUrl) {
          locationService.playAudioUrl(audioUrl);
        } else if (textToSpeak) {
          locationService.playAudio(textToSpeak, poiName || 'Punto di interesse', 'monumenti');
        }
        if (audioUrl || textToSpeak) {
          window.dispatchEvent(new CustomEvent('wip-live-audio', {
            detail: { poiName, message: `📻 Il leader ha sbloccato: ${poiName || 'un luogo'}` }
          }));
        }
      }
    })
    .on('broadcast', { event: 'session-ended' }, () => {
      // Il leader ha terminato: i follower escono subito invece di restare
      // in ascolto di un canale morto.
      if (!moduleIsLeader) {
        window.dispatchEvent(new CustomEvent('wip-live-tour-ended', {
          detail: { message: 'Il leader ha terminato il tour di gruppo.' }
        }));
        clearModuleSession();
      }
    })
    .on('presence', { event: 'sync' }, () => {
      try {
        moduleParticipants = Object.keys(channel.presenceState() || {}).length;
      } catch { moduleParticipants = 0; }
      notifySessionChanged();
    })
    .subscribe((status: string) => {
      if (status === 'SUBSCRIBED') {
        console.log('[LiveTour] Connesso alla sessione', pin);
        channel.track({ role: leader ? 'leader' : 'follower', joined_at: Date.now() }).catch(() => {});
      }
    });

  moduleChannel = channel;

  // Il broadcast del leader è agganciato QUI, a livello di modulo: prima il
  // listener viveva in LiveTourPanel (montato solo nel tab livetour) e
  // l'evento 'wip-leader-audio-start' non veniva comunque mai emesso da
  // nessuno — il tour di gruppo non trasmetteva NULLA.
  if (leader) {
    leaderAudioListener = (e: any) => {
      const { audioUrl, textToSpeak, poiName } = e?.detail || {};
      if (!moduleChannel || !moduleIsLeader) return;
      moduleChannel.send({
        type: 'broadcast',
        event: 'audio-start',
        payload: { audioUrl, poiName, textToSpeak }
      }).catch((err: any) => console.warn('[LiveTour] Broadcast fallito:', err));
    };
    window.addEventListener('wip-leader-audio-start', leaderAudioListener);
  }
}

async function joinByPin(pin: string): Promise<void> {
  // Solo sessioni attive e NON scadute (prima le sessioni oltre le 12h
  // restavano joinabili per sempre)
  const { data, error: fetchError } = await supabase
    .from('live_sessions')
    .select('*')
    .eq('pin', pin)
    .eq('is_active', true)
    .gt('expires_at', new Date().toISOString())
    .single();

  if (fetchError || !data) throw new Error("Sessione non trovata, scaduta o terminata.");

  const { data: { user } } = await supabase.auth.getUser();
  const leader = user?.id === data.leader_id;
  moduleSession = data;
  moduleIsLeader = leader;
  try { localStorage.setItem(PIN_STORAGE_KEY, data.pin); } catch { /* ignore */ }
  subscribeModuleChannel(data.pin, leader);
  notifySessionChanged();
}

/**
 * Ripristino al riavvio dell'app: se c'era una sessione attiva (PIN salvato)
 * prova a riagganciarla in silenzio. Una sola volta per avvio.
 */
async function restoreSessionIfAny(): Promise<void> {
  if (restoreAttempted || moduleSession) return;
  restoreAttempted = true;
  let savedPin: string | null = null;
  try { savedPin = localStorage.getItem(PIN_STORAGE_KEY); } catch { /* ignore */ }
  if (!savedPin) return;
  try {
    await joinByPin(savedPin);
    console.log('[LiveTour] Sessione ripristinata dopo il riavvio:', savedPin);
  } catch {
    // Sessione finita nel frattempo: pulizia silenziosa
    try { localStorage.removeItem(PIN_STORAGE_KEY); } catch { /* ignore */ }
  }
}

export function useLiveTour() {
  const [, forceRender] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Ri-renderizza quando la sessione di modulo cambia (anche da altri mount)
  useEffect(() => {
    const l = () => forceRender(n => n + 1);
    sessionListeners.add(l);
    restoreSessionIfAny();
    return () => { sessionListeners.delete(l); };
  }, []);

  const generatePin = () => Math.floor(100000 + Math.random() * 900000).toString();

  const createSession = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Devi essere loggato per creare un tour di gruppo.");

      // Fino a 3 tentativi: il PIN è UNIQUE e una collisione random è possibile
      let data: any = null;
      let lastErr: any = null;
      for (let attempt = 0; attempt < 3 && !data; attempt++) {
        const pin = generatePin();
        const res = await supabase
          .from('live_sessions')
          .insert([{ pin, leader_id: user.id }])
          .select()
          .single();
        if (!res.error) { data = res.data; break; }
        lastErr = res.error;
        if (res.error.code !== '23505') break; // errore diverso da PIN duplicato
      }
      if (!data) throw lastErr || new Error('Creazione sessione fallita.');

      moduleSession = data;
      moduleIsLeader = true;
      try { localStorage.setItem(PIN_STORAGE_KEY, data.pin); } catch { /* ignore */ }
      subscribeModuleChannel(data.pin, true);
      notifySessionChanged();
    } catch (err: any) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const joinSession = useCallback(async (pin: string) => {
    setLoading(true);
    setError(null);
    try {
      await joinByPin(pin);
    } catch (err: any) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const leaveSession = useCallback(async () => {
    // Il leader TERMINA davvero la sessione: chiude la riga nel DB e avvisa
    // i follower via broadcast (prima la riga restava attiva e chiunque col
    // PIN continuava a poter entrare).
    if (moduleSession && moduleIsLeader) {
      try {
        await moduleChannel?.send({ type: 'broadcast', event: 'session-ended', payload: {} });
      } catch { /* best effort */ }
      try {
        await supabase.from('live_sessions')
          .update({ is_active: false })
          .eq('id', moduleSession.id);
      } catch { /* best effort */ }
    }
    clearModuleSession();
  }, []);

  return {
    activeSession: moduleSession,
    isLeader: moduleIsLeader,
    participantCount: moduleParticipants,
    loading,
    error,
    createSession,
    joinSession,
    leaveSession
  };
}
