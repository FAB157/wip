import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { apiFetch, bearerHeaders as bearerHeadersApi } from './api';

/** Timeout MP3 (TTS/audioguide): 30 s in lettura, 15 s per connettersi. */
const AUDIO_CONNECT_TIMEOUT_MS = 15000;
const AUDIO_READ_TIMEOUT_MS = 30000;

/**
 * Intestazioni con il token di sessione (Bearer), se c'e` una sessione.
 * Le rotte audio (/api/tts/smart, /api/poi/audioguide) fanno quota e
 * addebito PER UTENTE solo se sanno chi chiama: senza token il server
 * vede una richiesta anonima e non puo` ne' contare ne' addebitare.
 * Best-effort: senza sessione si manda la richiesta com'era.
 */
export async function bearerHeaders(): Promise<Record<string, string>> {
  // Stessa logica (e stessa cache del token) di lib/api.ts.
  return bearerHeadersApi();
}

/**
 * POST che riceve un MP3 come Blob in modo affidabile ANCHE su app nativa.
 *
 * Con CapacitorHttp abilitato (capacitor.config) window.fetch è patchato:
 * le POST passano dal layer nativo che, senza responseType, decodifica il
 * corpo BINARIO come testo → blob vuoto o corrotto. È la causa del test voci
 * con "audio non valido (0 byte)" su TUTTE le voci da iPhone, mentre la
 * stessa route dal browser risponde un MP3 valido.
 *
 * Su nativo si usa quindi l'API CapacitorHttp diretta con responseType
 * 'blob' (base64 → Blob); sul web resta la fetch standard.
 *
 * Manda SEMPRE il Bearer della sessione (se esiste): e` cio` che permette al
 * server di fare quota e addebito per utente.
 */
export async function postForAudioBlob(
  url: string,
  body: any
): Promise<{ ok: boolean; status: number; blob: Blob | null; errorText?: string }> {
  const headers = { 'Content-Type': 'application/json', ...(await bearerHeaders()) };

  if (Capacitor.isNativePlatform()) {
    // Senza connectTimeout/readTimeout CapacitorHttp aspettava per sempre
    // (28/08/2026): un MP3 da 200 KB su rete a singhiozzo bloccava la coda.
    const res = await CapacitorHttp.request({
      url,
      method: 'POST',
      headers,
      data: body,
      responseType: 'blob',
      connectTimeout: AUDIO_CONNECT_TIMEOUT_MS,
      readTimeout: AUDIO_READ_TIMEOUT_MS,
    });
    const okStatus = res.status >= 200 && res.status < 300;
    if (!okStatus || typeof res.data !== 'string' || !res.data) {
      // In errore il corpo (JSON diagnostico) arriva base64: si prova a leggerlo.
      let errorText: string | undefined;
      if (typeof res.data === 'string' && res.data) {
        try { errorText = atob(res.data); } catch { errorText = res.data; }
      } else if (res.data && typeof res.data === 'object') {
        try { errorText = JSON.stringify(res.data); } catch { /* niente */ }
      }
      return { ok: false, status: res.status, blob: null, errorText };
    }
    const bin = atob(res.data);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { ok: true, status: res.status, blob: new Blob([bytes], { type: 'audio/mpeg' }) };
  }

  const res = await apiFetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  }, AUDIO_READ_TIMEOUT_MS);
  if (!res.ok) {
    let errorText: string | undefined;
    try { errorText = await res.text(); } catch { /* niente */ }
    return { ok: false, status: res.status, blob: null, errorText };
  }
  return { ok: true, status: res.status, blob: await res.blob() };
}
