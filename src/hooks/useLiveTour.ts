import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { locationService } from '../services/locationService';
import { getTranslation, linguaCorrente } from '../lib/i18n';
import { notify } from '../lib/toast';

import { riceviVisitaDalLeader } from '../lib/museumVisit';

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
// Ultimo avviso della sessione (canale non connesso, leader assente, chiusura
// non riuscita): mostrato dal pannello e dal toast (25/10/2026).
let moduleAvviso: string | null = null;
let leaderAudioListener: ((e: any) => void) | null = null;
// TOUR DI GRUPPO DENTRO IL MUSEO (11/09/2026, richiesta del committente).
// Il leader apre la visita di un museo e sceglie un'opera: i follower vedono
// lo stesso percorso e sentono la stessa audioguida, senza pagare — l'ha
// già pagata il leader. Due messaggi in più sullo stesso canale realtime.
let leaderMuseumVisitListener: ((e: any) => void) | null = null;
let leaderMuseumStopListener: ((e: any) => void) | null = null;
let leaderMuseumRoomListener: ((e: any) => void) | null = null;
let restoreAttempted = false;
// Ultimo audio annunciato dal leader: serve al pulsante «Ascolta ora» del
// follower quando la partenza automatica non è andata a buon fine.
let ultimoAudioLeader: any = null;
// LEADER ASSENTE (25/10/2026): se la presence resta senza leader per più di
// 30 s il follower viene avvisato, invece di aspettare in silenzio.
let leaderAssenteTimer: ReturnType<typeof setTimeout> | null = null;
const LEADER_ASSENTE_MS = 30000;
// Avvisi «una volta per sessione»: lingua del leader diversa, mittente
// respinto, secondo leader.
let avvisoLinguaDato = false;
let avvisoMittenteDato = false;
let avvisoDueLeaderDato = false;
const sessionListeners = new Set<() => void>();

const PIN_STORAGE_KEY = 'wip_live_tour_pin';

function notifySessionChanged() {
  sessionListeners.forEach(l => l());
}

/** Testo nella lingua dell'app (stesse chiavi di LiveTourPanel). */
function tl(chiave: string): string {
  return getTranslation(chiave, linguaCorrente());
}

/**
 * Un difetto del tour che l'utente deve VEDERE (25/10/2026): prima canale non
 * connesso, leader sparito e chiusura fallita restavano solo in console. Qui:
 * toast, avviso nel pannello, evento `wip-live-tour-error` per chi ascolta.
 */
function segnalaErrore(messaggio: string, codice: string) {
  moduleAvviso = messaggio;
  console.warn('[LiveTour]', codice, '—', messaggio);
  try { notify(messaggio, 'error', 7000, { chiave: `live-tour-${codice}` }); } catch { /* niente DOM */ }
  try {
    window.dispatchEvent(new CustomEvent('wip-live-tour-error', { detail: { codice, message: messaggio } }));
  } catch { /* niente DOM */ }
  notifySessionChanged();
}

function fermaTimerLeaderAssente() {
  if (leaderAssenteTimer) { clearTimeout(leaderAssenteTimer); leaderAssenteTimer = null; }
}

function avviaTimerLeaderAssente() {
  if (moduleIsLeader || leaderAssenteTimer || !moduleSession) return;
  leaderAssenteTimer = setTimeout(() => {
    leaderAssenteTimer = null;
    if (!moduleSession || moduleIsLeader) return;
    const cePresente = moduleMembers.some(m => m.role === 'leader');
    if (!cePresente) segnalaErrore(tl('vr_a_lt_err_leader_assente'), 'leader_assente');
  }, LEADER_ASSENTE_MS);
}

/**
 * VERIFICA DEL MITTENTE (25/10/2026, difesa in profondità oltre alla policy
 * Realtime sul canale privato): ogni messaggio porta `da` = id del leader;
 * quello che non combacia con `leader_id` della sessione si ignora.
 */
function dalLeaderVero(payload: any): boolean {
  const atteso = moduleSession?.leader_id;
  if (atteso && payload && payload.da === atteso) return true;
  if (!avvisoMittenteDato) {
    avvisoMittenteDato = true;
    console.warn('[LiveTour] messaggio ignorato: mittente non è il leader della sessione', payload?.da, '≠', atteso);
  }
  return false;
}

function teardownModuleChannel() {
  if (leaderAudioListener) {
    window.removeEventListener('wip-leader-audio-start', leaderAudioListener);
    leaderAudioListener = null;
  }
  if (leaderMuseumVisitListener) {
    window.removeEventListener('wip-leader-museum-visit', leaderMuseumVisitListener);
    leaderMuseumVisitListener = null;
  }
  if (leaderMuseumStopListener) {
    window.removeEventListener('wip-leader-museum-stop', leaderMuseumStopListener);
    leaderMuseumStopListener = null;
  }
  if (leaderMuseumRoomListener) {
    window.removeEventListener('wip-leader-museum-room', leaderMuseumRoomListener);
    leaderMuseumRoomListener = null;
  }
  fermaTimerLeaderAssente();
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
  moduleAvviso = null;
  avvisoLinguaDato = false;
  avvisoMittenteDato = false;
  avvisoDueLeaderDato = false;
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
 *
 * (25/10/2026) Viaggiano anche `kind` e `voice`, ESATTAMENTE come li ha
 * mandati il leader a /api/tts/smart: la chiave di cache è (testo pulito dal
 * server secondo `kind`, voce), quindi solo gli stessi parametri danno il
 * colpo di cache. In più `soloCache: true`: se l'MP3 non c'è il server
 * risponde 204 e il follower legge con la voce del telefono — mai una sintesi
 * a pagamento, mai una quota, a carico di chi segue.
 */
export async function riproduciDalLeader(payload: any, daGesto = false): Promise<boolean> {
  const { textToSpeak, poiName, character, language, kind, voice } = payload || {};
  if (!textToSpeak) return false;
  ultimoAudioLeader = payload;

  window.dispatchEvent(new CustomEvent('wip-live-audio', {
    detail: { poiName, message: `📻 Il leader ha sbloccato: ${poiName || 'un luogo'}` }
  }));

  // AVVISO LINGUA (25/10/2026): l'audio è nella lingua del leader; se è
  // diversa da quella dell'app del follower lo si dice, una volta per sessione.
  try {
    const linguaLeader = String(language || '').toUpperCase().slice(0, 2);
    const linguaMia = String(linguaCorrente() || '').toUpperCase().slice(0, 2);
    if (linguaLeader && linguaMia && linguaLeader !== linguaMia && !avvisoLinguaDato) {
      avvisoLinguaDato = true;
      notify(tl('vr_a_lt_lingua_leader').replace('{l}', linguaLeader), 'info', 6000, { chiave: 'live-tour-lingua' });
    }
  } catch { /* solo un avviso */ }

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
    // finire nello storico ascolti di un POI che non ha aperto lui (e senza
    // poiId non c'è né authorize né Day Pass).
    esito = await locationService.playAudio(
      textToSpeak,
      poiName || 'Punto di interesse',
      'monumenti',
      undefined,
      character,
      undefined,
      undefined,
      language,
      { kind: kind === 'guida' ? 'guida' : undefined, voice: voice ? String(voice) : undefined, soloCache: true },
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

/** Il payload di ogni broadcast del leader porta `da` = suo id (25/10/2026). */
function conMittente(payload: any): any {
  return { ...(payload || {}), da: moduleSession?.leader_id || null };
}

async function subscribeModuleChannel(pin: string, leader: boolean, nome: string): Promise<void> {
  teardownModuleChannel();
  // CANALE PRIVATO (25/10/2026): le policy Realtime su `realtime.messages`
  // decidono chi riceve e chi trasmette (solo il leader). Prima di iscriversi
  // il socket deve avere il token di sessione (per un ospite resta la chiave
  // anon): senza setAuth la policy vedeva un anonimo anche per il leader.
  try { await (supabase as any).realtime?.setAuth?.(); } catch (e) { console.warn('[LiveTour] setAuth realtime fallito:', e); }
  // Presence: ogni membro si "registra" sul canale con una chiave propria →
  // conteggio partecipanti reale senza tabelle aggiuntive.
  const presenceKey = `${leader ? 'leader' : 'member'}-${Math.random().toString(36).slice(2, 10)}`;
  modulePresenceKey = presenceKey;
  const channel = supabase.channel(`live_tour:${pin}`, {
    config: { presence: { key: presenceKey }, private: true } as any
  });

  channel
    .on('broadcast', { event: 'audio-start' }, (payload: any) => {
      console.log('[LiveTour] Ricevuto audio-start dal leader:', payload?.payload?.poiName);
      if (!moduleIsLeader) {
        if (!dalLeaderVero(payload?.payload)) return;
        // Follower: riproduci l'audio sbloccato dal leader.
        // NB: il leader trasmette solo { textToSpeak, poiName, character,
        // language, kind, voice } — un audioUrl (blob locale o file offline
        // suo) non sarebbe raggiungibile dagli altri telefoni, quindi non c'è
        // un ramo "riproduci da URL" da gestire qui.
        riproduciDalLeader(payload?.payload || {});
      }
    })
    // MUSEO: il leader ha aperto una visita guidata. Il follower riceve il
    // percorso intero (opere, sale, foto) e gli si apre la stessa scheda.
    .on('broadcast', { event: 'museum-visit' }, (payload: any) => {
      if (moduleIsLeader) return;
      if (!dalLeaderVero(payload?.payload)) return;
      try { riceviVisitaDalLeader(payload?.payload || {}); } catch (e) { console.warn('[LiveTour] visita museo dal leader non aperta:', e); }
    })
    // MUSEO: il leader ha scelto un'opera. Qui si allinea solo la SCHEDA
    // (testo aperto sotto la tappa giusta): la voce arriva da 'audio-start',
    // che il leader manda subito dopo, così l'audio non parte due volte.
    .on('broadcast', { event: 'museum-stop' }, (payload: any) => {
      if (moduleIsLeader) return;
      if (!dalLeaderVero(payload?.payload)) return;
      window.dispatchEvent(new CustomEvent('wip-museum-stop-from-leader', { detail: payload?.payload || {} }));
    })
    // MUSEO: «il leader è in Sala 12». Chi segue si perde e chi guida non lo
    // sa: la sala del leader (dal cartello letto o dall'opera in ascolto)
    // arriva a tutti, e la scheda dice dove raggiungerlo.
    .on('broadcast', { event: 'museum-room' }, (payload: any) => {
      if (moduleIsLeader) return;
      if (!dalLeaderVero(payload?.payload)) return;
      window.dispatchEvent(new CustomEvent('wip-museum-room-from-leader', { detail: payload?.payload || {} }));
    })
    .on('broadcast', { event: 'session-ended' }, (payload: any) => {
      // Il leader ha terminato: i follower escono subito invece di restare
      // in ascolto di un canale morto.
      if (!moduleIsLeader) {
        if (!dalLeaderVero(payload?.payload)) return;
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
      // LEADER ASSENTE / DUE LEADER (25/10/2026).
      const leaderPresente = moduleMembers.some(m => m.role === 'leader');
      if (!moduleIsLeader) {
        if (leaderPresente) {
          fermaTimerLeaderAssente();
          if (moduleAvviso === tl('vr_a_lt_err_leader_assente')) moduleAvviso = null;
        } else {
          avviaTimerLeaderAssente();
        }
      } else if (!avvisoDueLeaderDato && moduleMembers.some(m => m.role === 'leader' && !m.isMe)) {
        // Lato client non si può decidere chi dei due resta: si avvisa, non si blocca.
        avvisoDueLeaderDato = true;
        segnalaErrore(tl('vr_a_lt_err_due_leader'), 'due_leader');
      }
      notifySessionChanged();
    })
    .on('presence', { event: 'leave' }, (ev: any) => {
      const key = String(ev?.key || '');
      if (!moduleIsLeader && key.startsWith('leader-')) avviaTimerLeaderAssente();
    })
    .subscribe((status: string, err?: any) => {
      if (status === 'SUBSCRIBED') {
        console.log('[LiveTour] Connesso alla sessione', pin);
        if (moduleAvviso === tl('vr_a_lt_err_canale')) { moduleAvviso = null; notifySessionChanged(); }
        channel.track({ role: leader ? 'leader' : 'follower', name: nome, joined_at: Date.now() }).catch(() => {});
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        // Prima un canale rifiutato (policy, token) lasciava il tour muto e
        // il pannello diceva «connesso».
        console.warn('[LiveTour] canale non connesso:', status, err?.message || err || '');
        segnalaErrore(tl('vr_a_lt_err_canale'), 'canale');
      }
    });

  moduleChannel = channel;

  // Il broadcast del leader è agganciato QUI, a livello di modulo: prima il
  // listener viveva in LiveTourPanel (montato solo nel tab livetour) e
  // l'evento 'wip-leader-audio-start' non veniva comunque mai emesso da
  // nessuno — il tour di gruppo non trasmetteva NULLA.
  if (leader) {
    leaderAudioListener = (e: any) => {
      const { textToSpeak, poiName, character, language, kind, voice } = e?.detail || {};
      if (!moduleChannel || !moduleIsLeader) return;
      // Senza testo non c'è nulla di riproducibile dall'altra parte (è il caso
      // dell'MP3 offline/acquistato, un file che vive solo sul telefono del
      // leader): meglio non trasmettere un messaggio muto.
      if (!textToSpeak) return;
      moduleChannel.send({
        type: 'broadcast',
        event: 'audio-start',
        // Il testo è ESATTAMENTE quello mandato a /api/tts/smart dal leader
        // (il server lo pulisce secondo `kind` prima della chiave di cache:
        // stessi parametri dal follower = stessa chiave).
        payload: conMittente({ poiName, textToSpeak, character, language, kind: kind || null, voice: voice || null })
      })
        // `send` non lancia: risponde 'ok' | 'timed out' | 'error'. Senza
        // guardare la risposta un tour muto non lasciava alcuna traccia.
        .then((esito: any) => {
          console.log('[LiveTour] Broadcast al gruppo:', esito, '—', poiName);
          if (esito !== 'ok') segnalaErrore(tl('vr_a_lt_err_invio'), 'invio');
        })
        .catch((err: any) => { console.warn('[LiveTour] Broadcast fallito:', err); segnalaErrore(tl('vr_a_lt_err_invio'), 'invio'); });
    };
    window.addEventListener('wip-leader-audio-start', leaderAudioListener);

    // Il leader apre un museo o sceglie un'opera: si inoltra al gruppo.
    // Il percorso pesa qualche decina di KB con le foto (solo URL): sta
    // comodamente dentro un messaggio di broadcast.
    leaderMuseumVisitListener = (e: any) => {
      if (!moduleChannel || !moduleIsLeader || !e?.detail?.guide) return;
      moduleChannel.send({ type: 'broadcast', event: 'museum-visit', payload: conMittente(e.detail) })
        .then((esito: any) => console.log('[LiveTour] Visita museo al gruppo:', esito))
        .catch((err: any) => console.warn('[LiveTour] Visita museo non inoltrata:', err));
    };
    leaderMuseumStopListener = (e: any) => {
      if (!moduleChannel || !moduleIsLeader) return;
      moduleChannel.send({ type: 'broadcast', event: 'museum-stop', payload: conMittente(e.detail || {}) })
        .catch((err: any) => console.warn('[LiveTour] Opera non inoltrata:', err));
    };
    window.addEventListener('wip-leader-museum-visit', leaderMuseumVisitListener);
    window.addEventListener('wip-leader-museum-stop', leaderMuseumStopListener);
    leaderMuseumRoomListener = (e: any) => {
      if (!moduleChannel || !moduleIsLeader || !e?.detail?.sala) return;
      moduleChannel.send({ type: 'broadcast', event: 'museum-room', payload: conMittente({ sala: String(e.detail.sala) }) })
        .catch((err: any) => console.warn('[LiveTour] Sala non inoltrata:', err));
    };
    window.addEventListener('wip-leader-museum-room', leaderMuseumRoomListener);
  }
}

/** Vero se questo telefono è il LEADER di un tour di gruppo in corso. */
export function isLiveLeader(): boolean {
  return !!moduleSession && moduleIsLeader;
}
/** Vero se questo telefono partecipa (da leader o da follower) a un tour. */
export function hasLiveSession(): boolean {
  return !!moduleSession;
}

async function joinByPin(pin: string): Promise<void> {
  // (25/10/2026) La riga arriva dalla RPC SECURITY DEFINER `live_tour_entra`:
  // la SELECT pubblica su live_sessions non c'è più. La funzione risponde la
  // sola sessione attiva e non scaduta con quel PIN (una riga o nulla).
  const { data, error: fetchError } = await supabase.rpc('live_tour_entra', { p_pin: String(pin || '').trim() });
  const riga: any = Array.isArray(data) ? data[0] : data;

  if (fetchError || !riga?.pin) throw new Error("Sessione non trovata, scaduta o terminata.");

  const { data: { user } } = await supabase.auth.getUser();
  const leader = user?.id === riga.leader_id;
  moduleSession = riga as LiveSession;
  moduleIsLeader = leader;
  try { localStorage.setItem(PIN_STORAGE_KEY, riga.pin); } catch { /* ignore */ }
  // Il join nasce da un tocco: è il momento buono per sbloccare l'audio, così
  // il primo annuncio del leader parte da solo invece di finire nel gate.
  try { locationService.unlockAudio(); } catch { /* niente contesto audio */ }
  await subscribeModuleChannel(riga.pin, leader, await nomeVisibile());
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
      await subscribeModuleChannel(data.pin, true, await nomeVisibile());
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
        await moduleChannel?.send({ type: 'broadcast', event: 'session-ended', payload: conMittente({}) });
      } catch { /* best effort */ }
      // (25/10/2026) L'esito si CONTROLLA: con la policy di UPDATE sbagliata
      // la riga restava attiva e nessuno lo sapeva. `expires_at = adesso`
      // chiude anche a chi guarda solo la scadenza.
      let chiusa = false;
      try {
        const { data, error } = await supabase.from('live_sessions')
          .update({ is_active: false, expires_at: new Date().toISOString() })
          .eq('id', moduleSession.id)
          .select('id');
        if (error) console.warn('[LiveTour] chiusura sessione fallita:', error.message || error);
        chiusa = !error && Array.isArray(data) && data.length > 0;
        if (!error && !chiusa) console.warn('[LiveTour] chiusura sessione: nessuna riga aggiornata (policy?)', moduleSession.id);
      } catch (e) { console.warn('[LiveTour] chiusura sessione: eccezione', e); }
      if (!chiusa) segnalaErrore(tl('vr_a_lt_err_chiusura'), 'chiusura');
    }
    clearModuleSession();
  }, []);

  return {
    activeSession: moduleSession,
    isLeader: moduleIsLeader,
    participantCount: moduleParticipants,
    members: moduleMembers,
    avviso: moduleAvviso,
    loading,
    error,
    createSession,
    joinSession,
    leaveSession
  };
}
