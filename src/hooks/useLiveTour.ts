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

/** Un partecipante visto dalla presence del canale realtime. */
export interface LiveMember {
  key: string;
  name: string;
  role: 'leader' | 'follower';
  isMe: boolean;
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
let moduleMembers: LiveMember[] = [];
let modulePresenceKey = '';
let leaderAudioListener: ((e: any) => void) | null = null;
let restoreAttempted = false;
// Ultimo audio annunciato dal leader: serve al pulsante «Ascolta ora» del
// follower quando la partenza automatica non è andata a buon fine.
let ultimoAudioLeader: any = null;
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
  moduleMembers = [];
}

function clearModuleSession() {
  teardownModuleChannel();
  moduleSession = null;
  moduleIsLeader = false;
  ultimoAudioLeader = null;
  try { localStorage.removeItem(PIN_STORAGE_KEY); } catch { /* ignore */ }
  notifySessionChanged();
}

/**
 * Nome da mostrare agli altri del gruppo: quello scelto alla registrazione o
 * arrivato da Google, poi il profilo sul DB, infine la parte locale dell'email.
 * Stessa priorità di UserProfileSummary/PilgrimWaysSheet.
 */
async function nomeVisibile(): Promise<string> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return 'Ospite';
    const meta: any = user.user_metadata || {};
    const dalMeta = meta.display_name || meta.full_name;
    if (dalMeta) return String(dalMeta).trim().slice(0, 24);
    try {
      const { data: prof } = await supabase
        .from('user_profiles')
        .select('display_name')
        .eq('id', user.id)
        .single();
      if (prof?.display_name) return String(prof.display_name).trim().slice(0, 24);
    } catch { /* colonna/riga assente: si ripiega sull'email */ }
    if (user.email) return String(user.email).split('@')[0].slice(0, 24);
  } catch { /* non loggato */ }
  return 'Ospite';
}

/**
 * FOLLOWER: riproduce quello che il leader ha sbloccato.
 *
 * Prima questa era una singola chiamata a playAudio il cui esito veniva
 * buttato via: se il telefono bloccava la partenza automatica (nessun gesto
 * dell'utente sulla pagina), se l'audioguida era in muto o se il TTS falliva,
 * il follower restava in SILENZIO senza sapere perché — il difetto segnalato
 * il 09/09/2026. Ora ogni esito è visibile e recuperabile con un tocco.
 *
 * La lingua e il personaggio arrivano dal leader: stesso testo + stessa voce
 * = stessa chiave di cache sul server, quindi il follower riceve l'MP3 già
 * pagato dal leader senza consumare la propria quota.
 */
export async function riproduciDalLeader(payload: any, daGesto = false): Promise<boolean> {
  const { textToSpeak, poiName, character, language } = payload || {};
  if (!textToSpeak) return false;
  ultimoAudioLeader = payload;

  window.dispatchEvent(new CustomEvent('wip-live-audio', {
    detail: { poiName, message: `📻 Il leader ha sbloccato: ${poiName || 'un luogo'}` }
  }));

  if (locationService.getIsGuideMuted()) {
    if (!daGesto) {
      window.dispatchEvent(new CustomEvent('wip-live-audio-gate', {
        detail: { poiName, motivo: 'muto' }
      }));
      return false;
    }
    // Il tocco su «Ascolta ora» è una richiesta esplicita: si toglie il muto
    // (App.tsx ascolta e aggiorna lo switch) e si prosegue.
    window.dispatchEvent(new CustomEvent('wip-live-unmute'));
    locationService.setGuideMuted(false);
  }

  // Sblocco del contesto audio: sul web la riproduzione partita da un
  // messaggio realtime non ha un gesto utente dietro e il browser la rifiuta.
  try { locationService.unlockAudio(); } catch { /* niente contesto audio */ }

  let esito: any = false;
  try {
    // poiId volutamente assente: il follower non deve consumare quota né
    // finire nello storico ascolti di un POI che non ha aperto lui.
    esito = await locationService.playAudio(
      textToSpeak,
      poiName || 'Punto di interesse',
      'monumenti',
      undefined,
      character,
      undefined,
      undefined,
      language,
    );
  } catch (e) {
    console.warn('[LiveTour] Riproduzione follower fallita:', e);
  }

  if (esito) {
    window.dispatchEvent(new CustomEvent('wip-live-audio-gate', { detail: { chiudi: true } }));
    return true;
  }

  console.warn('[LiveTour] Nessun audio riprodotto per il follower (esito:', esito, ')');
  window.dispatchEvent(new CustomEvent('wip-live-audio-gate', {
    detail: { poiName, motivo: 'bloccato' }
  }));
  return false;
}

/** Riprova l'ultimo audio del leader a partire da un tocco dell'utente. */
export function riascoltaDalLeader(): Promise<boolean> {
  if (!ultimoAudioLeader) return Promise.resolve(false);
  return riproduciDalLeader(ultimoAudioLeader, true);
}

function subscribeModuleChannel(pin: string, leader: boolean, nome: string) {
  teardownModuleChannel();
  // Presence: ogni membro si "registra" sul canale con una chiave propria →
  // conteggio partecipanti reale senza tabelle aggiuntive.
  const presenceKey = `${leader ? 'leader' : 'member'}-${Math.random().toString(36).slice(2, 10)}`;
  modulePresenceKey = presenceKey;
  const channel = supabase.channel(`live_tour:${pin}`, {
    config: { presence: { key: presenceKey } }
  });

  channel
    .on('broadcast', { event: 'audio-start' }, (payload: any) => {
      console.log('[LiveTour] Ricevuto audio-start dal leader:', payload?.payload?.poiName);
      if (!moduleIsLeader) {
        // Follower: riproduci l'audio sbloccato dal leader.
        // NB: il leader trasmette solo { textToSpeak, poiName, character,
        // language } — un audioUrl (blob locale o file offline suo) non
        // sarebbe raggiungibile dagli altri telefoni, quindi non c'è un ramo
        // "riproduci da URL" da gestire qui.
        riproduciDalLeader(payload?.payload || {});
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
        const stato: Record<string, any[]> = channel.presenceState() || {};
        moduleParticipants = Object.keys(stato).length;
        // Nome di ognuno, non solo il numero (chiesto il 09/09/2026): la
        // guida deve poter contare le persone per nome prima di partire.
        moduleMembers = Object.entries(stato).map(([key, presenze]) => {
          const p: any = Array.isArray(presenze) ? presenze[0] : null;
          return {
            key,
            name: (p?.name && String(p.name)) || 'Ospite',
            role: (p?.role === 'leader' ? 'leader' : 'follower') as 'leader' | 'follower',
            isMe: key === modulePresenceKey,
          };
        }).sort((a, b) => (a.role === b.role ? a.name.localeCompare(b.name) : a.role === 'leader' ? -1 : 1));
      } catch {
        moduleParticipants = 0;
        moduleMembers = [];
      }
      notifySessionChanged();
    })
    .subscribe((status: string) => {
      if (status === 'SUBSCRIBED') {
        console.log('[LiveTour] Connesso alla sessione', pin);
        channel.track({ role: leader ? 'leader' : 'follower', name: nome, joined_at: Date.now() }).catch(() => {});
      }
    });

  moduleChannel = channel;

  // Il broadcast del leader è agganciato QUI, a livello di modulo: prima il
  // listener viveva in LiveTourPanel (montato solo nel tab livetour) e
  // l'evento 'wip-leader-audio-start' non veniva comunque mai emesso da
  // nessuno — il tour di gruppo non trasmetteva NULLA.
  if (leader) {
    leaderAudioListener = (e: any) => {
      const { textToSpeak, poiName, character, language } = e?.detail || {};
      if (!moduleChannel || !moduleIsLeader) return;
      // Senza testo non c'è nulla di riproducibile dall'altra parte (è il caso
      // dell'MP3 offline/acquistato, un file che vive solo sul telefono del
      // leader): meglio non trasmettere un messaggio muto.
      if (!textToSpeak) return;
      moduleChannel.send({
        type: 'broadcast',
        event: 'audio-start',
        payload: { poiName, textToSpeak, character, language }
      })
        // `send` non lancia: risponde 'ok' | 'timed out' | 'error'. Senza
        // guardare la risposta un tour muto non lasciava alcuna traccia.
        .then((esito: any) => console.log('[LiveTour] Broadcast al gruppo:', esito, '—', poiName))
        .catch((err: any) => console.warn('[LiveTour] Broadcast fallito:', err));
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
  // Il join nasce da un tocco: è il momento buono per sbloccare l'audio, così
  // il primo annuncio del leader parte da solo invece di finire nel gate.
  try { locationService.unlockAudio(); } catch { /* niente contesto audio */ }
  subscribeModuleChannel(data.pin, leader, await nomeVisibile());
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
      subscribeModuleChannel(data.pin, true, await nomeVisibile());
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
    members: moduleMembers,
    loading,
    error,
    createSession,
    joinSession,
    leaveSession
  };
}
