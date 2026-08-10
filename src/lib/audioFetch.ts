import { Capacitor, CapacitorHttp } from '@capacitor/core';

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
 */
export async function postForAudioBlob(
  url: string,
  body: any
): Promise<{ ok: boolean; status: number; blob: Blob | null; errorText?: string }> {
  if (Capacitor.isNativePlatform()) {
    const res = await CapacitorHttp.request({
      url,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      data: body,
      responseType: 'blob',
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

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let errorText: string | undefined;
    try { errorText = await res.text(); } catch { /* niente */ }
    return { ok: false, status: res.status, blob: null, errorText };
  }
  return { ok: true, status: res.status, blob: await res.blob() };
}
