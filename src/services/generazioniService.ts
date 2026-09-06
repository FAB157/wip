/**
 * Generazioni in differita + notifiche (06/09/2026).
 *
 * L'utente chiede una guida premium (o un itinerario) e puo' chiudere l'app:
 * il server la prepara, la salva nell'Archivio e avvisa con email e push.
 * Qui: la coda (`/api/generazioni`), l'inbox delle notifiche, la
 * registrazione del dispositivo per le push (FCM via Capacitor) e la
 * notifica locale all'apertura per le notifiche non ancora lette.
 */
import { Capacitor } from '@capacitor/core';
import { supabase } from '../lib/supabase';
import { getApiUrl } from '../lib/api';

export interface Generazione {
  id: string;
  tipo: 'guida' | 'itinerario';
  stato: 'in_coda' | 'in_corso' | 'pronta' | 'fallita';
  titolo: string | null;
  risultato_id: string | null;
  errore: string | null;
  created_at: string;
  pronta_at: string | null;
}

export interface Notifica {
  id: string;
  tipo: 'servizio' | 'promo';
  titolo: string;
  corpo: string;
  dati: Record<string, string>;
  letta_at: string | null;
  created_at: string;
}

async function token(): Promise<string | null> {
  try { const { data } = await supabase.auth.getSession(); return data?.session?.access_token || null; } catch { return null; }
}

async function chiama<T>(percorso: string, body?: any, metodo: 'GET' | 'POST' = body ? 'POST' : 'GET'): Promise<T> {
  const t = await token();
  if (!t) throw new Error('login_required');
  const r = await fetch(getApiUrl(percorso), {
    method: metodo,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j?.error || `HTTP ${r.status}`), { status: r.status, dettaglio: j });
  return j as T;
}

/** Mette in coda una guida premium. Ritorna l'id del lavoro (o `gia_pronta`). */
export async function accodaGuida(p: { itinerary: any; style: string; hash: string; language: string; dedica?: string; emailExtra?: string[] }) {
  return chiama<{ id: string | null; stato?: string; crediti?: number; titolo?: string; gia_pronta?: boolean; risultato_id?: string }>(
    '/api/generazioni',
    { tipo: 'guida', language: p.language, email_extra: p.emailExtra || [], parametri: { itinerary: p.itinerary, style: p.style, hash: p.hash, language: p.language, dedica: p.dedica } },
  );
}

/** Mette in coda un itinerario (stesso body della generazione in diretta). */
export async function accodaItinerario(body: any, emailExtra: string[] = []) {
  return chiama<{ id: string | null; stato?: string; crediti?: number; titolo?: string }>(
    '/api/generazioni',
    { tipo: 'itinerario', language: body?.language, email_extra: emailExtra, parametri: body },
  );
}

export async function mieGenerazioni(): Promise<Generazione[]> {
  try { return (await chiama<{ generazioni: Generazione[] }>('/api/generazioni/mie')).generazioni || []; } catch { return []; }
}

export async function mieNotifiche(): Promise<{ notifiche: Notifica[]; non_lette: number }> {
  try { return await chiama('/api/notifiche/mie'); } catch { return { notifiche: [], non_lette: 0 }; }
}

export async function segnaLette(ids?: string[]): Promise<void> {
  try { await chiama('/api/notifiche/lette', { ids: ids || [] }); } catch { /* best-effort */ }
}

export async function salvaPreferenzePush(p: { push_servizio?: boolean; push_promo?: boolean }): Promise<void> {
  await chiama('/api/notifiche/preferenze', p);
}

// ── Push (FCM tramite @capacitor/push-notifications) ──────────────────────
const CHIAVE_TOKEN = 'wip_push_token';

/**
 * Registra il dispositivo per le push. Solo nativo; sul web non fa nulla.
 * Il plugin e' caricato con import dinamico: se non e' installato (build
 * senza Firebase) l'app continua senza push, senza errori visibili.
 */
export async function registraPush(lingua: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const mod: any = await import('@capacitor/push-notifications').catch(() => null);
    const Push = mod?.PushNotifications;
    if (!Push) return;
    let perm = await Push.checkPermissions();
    if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') perm = await Push.requestPermissions();
    if (perm.receive !== 'granted') return;
    await Push.removeAllListeners();
    await Push.addListener('registration', async (t: { value: string }) => {
      try {
        const precedente = localStorage.getItem(CHIAVE_TOKEN);
        if (precedente === t.value) return;
        await chiama('/api/push/registra', { token: t.value, piattaforma: Capacitor.getPlatform(), lingua });
        localStorage.setItem(CHIAVE_TOKEN, t.value);
      } catch (e) { console.warn('[push] registrazione fallita', e); }
    });
    await Push.addListener('registrationError', (e: any) => console.warn('[push] errore registrazione', e));
    // Tocco sulla notifica: apre l'Archivio (o l'azione indicata).
    await Push.addListener('pushNotificationActionPerformed', (a: any) => {
      const dati = a?.notification?.data || {};
      window.dispatchEvent(new CustomEvent('wip-notifica-apri', { detail: dati }));
    });
    await Push.register();
  } catch (e) {
    console.warn('[push] non disponibile', e);
  }
}

/** Alla disconnessione: il token non deve piu' ricevere le notifiche di quell'utente. */
export async function rimuoviPush(): Promise<void> {
  try {
    const t = localStorage.getItem(CHIAVE_TOKEN);
    if (t) { await chiama('/api/push/rimuovi', { token: t }); localStorage.removeItem(CHIAVE_TOKEN); }
  } catch { /* best-effort */ }
}

/**
 * All'apertura dell'app: se ci sono notifiche non lette (es. «la tua guida
 * e' pronta» arrivata mentre l'app era chiusa e senza push), le mostra come
 * notifica locale (nativo) o le lascia all'evento in-app, poi le segna lette.
 * Ritorna le non lette, cosi' chi chiama puo' mostrare un badge.
 */
export async function notificheAllApertura(): Promise<Notifica[]> {
  const { notifiche } = await mieNotifiche();
  const nonLette = notifiche.filter(n => !n.letta_at);
  if (!nonLette.length) return [];
  if (Capacitor.isNativePlatform()) {
    try {
      const { LocalNotifications } = await import('@capacitor/local-notifications');
      const perm = await LocalNotifications.checkPermissions();
      if (perm.display === 'granted') {
        await LocalNotifications.schedule({
          notifications: nonLette.slice(0, 3).map((n, i) => ({
            id: 71000 + i, title: n.titolo, body: n.corpo, extra: n.dati,
            schedule: { at: new Date(Date.now() + 1500 + i * 500) },
          })),
        });
      }
    } catch { /* senza permesso: resta il badge in-app */ }
  }
  window.dispatchEvent(new CustomEvent('wip-notifiche-non-lette', { detail: nonLette }));
  return nonLette;
}
