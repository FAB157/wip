/**
 * premiumGuideService.ts
 * Service layer for the WIP Premium Guide module.
 * Handles API calls, hashing, Supabase upload and html2pdf.js PDF rendering.
 */

import { supabase } from '../lib/supabase';
import { get as idbGet, set as idbSet } from 'idb-keyval';
import { Capacitor } from '@capacitor/core';

// ── Salvataggio file: browser (<a download>) oppure nativo (Filesystem) ──────
// Nel WebView di Capacitor il click su un <a download> con blob: URL non fa
// NULLA (nessun download listener), ma il codice tornava `true` e il toast
// diceva «scaricato». Stesso schema di AppGuide.writePdfNative: Documenti,
// in fallback i file esterni dell'app. Torna false se il salvataggio non è
// avvenuto davvero: il chiamante mostra il toast solo in quel caso.
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') resolve(reader.result.split(',')[1]);
      else reject(new Error('Conversione base64 fallita'));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export async function saveBlobAsFile(blob: Blob, filename: string): Promise<boolean> {
  if (Capacitor.isNativePlatform()) {
    try {
      const { Filesystem, Directory } = await import('@capacitor/filesystem');
      const data = await blobToBase64(blob);
      try {
        await Filesystem.writeFile({ path: filename, data, directory: Directory.Documents, recursive: true });
      } catch {
        await Filesystem.writeFile({ path: filename, data, directory: Directory.External, recursive: true });
      }
      return true;
    } catch (e) {
      console.warn('[saveBlobAsFile] salvataggio nativo fallito:', e);
      return false;
    }
  }
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  } catch {
    return false;
  }
}

export type GuideStyle = 'art' | 'family' | 'shopping' | 'food' | 'essential';

export interface PremiumGuidePoi {
  poi_id: string;
  titolo: string;
  categoria_pdf: string;
  valutazione: number;
  indirizzo: string;
  trasporti: string;
  orario_visita?: string;
  descrizione_lunga: string;
  curiosita?: string[];
  dettaglio_storico_tecnico: string;
  consiglio_insider: string;
  migliori_piatti?: (string | { nome: string; descrizione?: string; prezzo?: string })[];
  info_utili: {
    orari: string;
    best_time: string;
    prezzo: string;
    telefono?: string;
    sito_web?: string;
  };
  image_url?: string;
}

export interface PremiumGuideDay {
  giorno: number;
  titolo_giorno: string;
  tema_giorno?: string;
  pois: PremiumGuidePoi[];
}

export interface PremiumGuideContent {
  guida_titolo: string;
  sottotitolo?: string;
  /** Dedica regalo (opzionale): appare in copertina, es. "A Maria, per i tuoi 50 anni — Fabrizio" */
  dedica?: string;
  introduzione: string;
  citta_intro?: {
    titolo: string;
    storia: string;
    cultura_tradizioni: string;
    consigli_pratici: string;
  };
  stile: GuideStyle;
  giorni: PremiumGuideDay[];
}

export interface GenerateGuideResult {
  content: PremiumGuideContent;
  media_manifest: Record<string, string>;
  hash: string;
  fromCache: boolean;
}

// ── Hash stabile dell'itinerario ────────────────────────────────────────────
// La chiave di cache è calcolata su una PROIEZIONE dell'itinerario: prima
// entrava l'oggetto intero — id random per utente, «📚» nel titolo della
// libreria, podcast_cache, contatori di sostituzione, badge di verifica — e
// lo stesso itinerario produceva un hash diverso a ogni apertura: la guida
// pagata non si ritrovava mai in cache e si rigenerava (e ripagava).
export function stableGuideProjection(itinerary: any): any {
  const round4 = (v: any) => (Number.isFinite(Number(v)) ? Math.round(Number(v) * 1e4) / 1e4 : null);
  const coordOf = (t: any) => {
    const lat = t?.coordinate?.lat ?? t?.lat;
    const lon = t?.coordinate?.lng ?? t?.coordinate?.lon ?? t?.lng ?? t?.lon;
    const la = round4(lat), lo = round4(lon);
    return la != null && lo != null && la !== 0 ? [la, lo] : null;
  };
  const pulisci = (s: any) => String(s || '').replace(/^[\p{Extended_Pictographic}\s]+/u, '').trim().toLowerCase();
  return {
    destinazione: pulisci(itinerary?.destinazione || itinerary?.destination || itinerary?.citta || itinerary?.titolo),
    giorni: (itinerary?.giorni || []).map((g: any) => ({
      n: g?.giorno,
      tappe: (g?.tappe || []).map((t: any) => ({
        titolo: pulisci(t?.titolo_tappa || t?.name || t?.title),
        coord: coordOf(t),
      })),
    })),
  };
}

export async function computeItineraryHash(itinerary: any, style: string): Promise<string> {
  const raw = JSON.stringify({ itinerary: stableGuideProjection(itinerary), style });
  const encoder = new TextEncoder();
  const data = encoder.encode(raw);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── Cache locale (IndexedDB): la guida acquistata resta fruibile offline ────
export async function saveGuideLocally(result: GenerateGuideResult): Promise<void> {
  try {
    await idbSet(`premium_guide_${result.hash}`, {
      content: result.content,
      media_manifest: result.media_manifest,
      savedAt: Date.now(),
    });
  } catch (e) {
    console.warn('[PremiumGuide] Salvataggio locale fallito:', e);
  }
}

export async function getLocalGuide(hash: string): Promise<GenerateGuideResult | null> {
  try {
    const stored: any = await idbGet(`premium_guide_${hash}`);
    if (!stored?.content) return null;
    return {
      content: stored.content as PremiumGuideContent,
      media_manifest: stored.media_manifest || {},
      hash,
      fromCache: true,
    };
  } catch {
    return null;
  }
}

// ── Check cache: PRIMA IndexedDB (istantaneo e offline), poi Supabase ───────
export async function getCachedGuide(hash: string): Promise<GenerateGuideResult | null> {
  const local = await getLocalGuide(hash);
  if (local) return local;

  try {
    const { data, error } = await supabase
      .from('itinerary_guides')
      .select('*')
      .eq('itinerary_hash', hash)
      .eq('status', 'completed')
      .single();

    if (error || !data) return null;

    const result: GenerateGuideResult = {
      content: data.content_data as PremiumGuideContent,
      media_manifest: (data.media_manifest as Record<string, string>) || {},
      hash,
      fromCache: true,
    };
    // Replica in locale: la prossima apertura è istantanea anche in aereo
    saveGuideLocally(result);
    return result;
  } catch {
    return null;
  }
}

// ── Main generate function ───────────────────────────────────────────────────
export async function generatePremiumGuide(
  itinerary: any,
  style: GuideStyle,
  userId: string,
  language: string = 'IT',
  dedica?: string
): Promise<GenerateGuideResult> {
  const hash = await computeItineraryHash(itinerary, style + "_" + language);

  // 1. Cache check
  const cached = await getCachedGuide(hash);
  if (cached) {
    // Guida già in cache (nessuna rigenerazione): la dedica resta solo locale.
    if (dedica?.trim()) cached.content = { ...cached.content, dedica: dedica.trim() };
    return cached;
  }

  // 2. Call server endpoint (quota check + Groq + Unsplash are server-side)
  const response = await fetch('/api/premium-guide/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${await getAccessToken()}`,
    },
    body: JSON.stringify({ itinerary, style, userId, hash, language, dedica: dedica?.trim() || undefined }),
  });

  if (response.status === 403) {
    const body = await response.json();
    throw new Error(body.error || 'QUOTA_EXCEEDED');
  }

  // 402: crediti insufficienti (addebito ora server-side). Il client non ha
  // scalato nulla, quindi non deve rimborsare — solo segnalarlo.
  if (response.status === 402) {
    throw new Error('INSUFFICIENT_CREDITS');
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || 'GENERATION_ERROR');
  }

  const data = await response.json();
  const verifiedContent = await verifyGuideAntiAllucinazioni(data.content, itinerary, language);
  const result: GenerateGuideResult = {
    content: verifiedContent as PremiumGuideContent,
    media_manifest: data.media_manifest || {},
    hash,
    fromCache: false,
  };
  // Download in background degli asset testuali: la guida appena acquistata
  // è subito disponibile anche in modalità aereo.
  saveGuideLocally(result);
  return result;
}

/**
 * Verifica anti-allucinazione della guida d'autore: un motore AI DIVERSO
 * dal generatore rilegge i POI della guida e marca quelli sospetti
 * (campi verifica/nota_verifica per POI). Fail-open: su errore o timeout
 * la guida passa com'è.
 */
async function verifyGuideAntiAllucinazioni(content: any, itinerary: any, language: string = 'IT'): Promise<any> {
  try {
    if (!content?.giorni?.length) return content;
    const destination = itinerary?.titolo || itinerary?.destinazione || content?.guida_titolo || '';
    if (!destination) return content;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 30000);
    const res = await fetch('/api/itinerary/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itinerary: content, destination, language }),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!res.ok) return content;
    const v = await res.json();
    return v?.itinerary?.giorni ? v.itinerary : content;
  } catch {
    return content;
  }
}

// ── PDF generation (client-side via html2pdf.js) ─────────────────────────────
export async function downloadGuideAsPdf(
  elementId: string,
  filename: string
): Promise<Blob | null> {
  // Dynamically import html2pdf to avoid SSR issues
  let html2pdf: any;
  try {
    const mod = await import('html2pdf.js');
    html2pdf = mod.default || mod;
  } catch (e) {
    console.error('[PremiumGuide] html2pdf.js not available:', e);
    // Ripiego: stampa del browser, SOLO della guida (printScoped nasconde
    // gli altri documenti, e le regole in index.css nascondono l'app).
    //
    // IL NOME DEL FILE. Su questo ripiego il browser non usa `filename`: usa
    // il TITOLO DELLA PAGINA. Senza toccarlo, il PDF si chiamava come l'app
    // — «WIP guida premium.pdf» per qualunque città, e due guide diverse
    // finivano con lo stesso nome nella cartella Download. Qui il titolo
    // diventa quello vero della guida per il tempo della stampa, e poi si
    // rimette com'era: è lo stesso meccanismo per cui il PDF dell'itinerario
    // esce già col suo nome.
    const { printScoped } = await import('../lib/printScoped');
    const titoloPrima = document.title;
    document.title = filename.replace(/\.pdf$/i, '').replace(/_/g, ' ');
    let ripristinato = false;
    const ripristina = () => {
      if (ripristinato) return;
      ripristinato = true;
      document.title = titoloPrima;
      window.removeEventListener('afterprint', ripristina);
      window.removeEventListener('focus', ripristina);
    };
    window.addEventListener('afterprint', ripristina);
    // Rete di sicurezza: se 'afterprint' non arriva (succede su alcuni
    // browser quando l'utente annulla), il titolo torna al ritorno del
    // focus o comunque entro un minuto.
    window.addEventListener('focus', ripristina);
    setTimeout(ripristina, 60000);
    printScoped('guide');
    return null;
  }

  const element = document.getElementById(elementId);
  if (!element) {
    console.error('[PremiumGuide] Element not found:', elementId);
    return null;
  }

  const opt = {
    margin:       [10, 12, 15, 12],
    filename:     filename,
    image:        { type: 'jpeg', quality: 0.95 },
    html2canvas:  { 
      scale: 2, 
      useCORS: true, 
      logging: false, 
      allowTaint: true,
      scrollY: 0,
      windowHeight: element.scrollHeight,
      windowWidth: element.scrollWidth
    },
    jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' },
    pagebreak:    { mode: ['avoid-all', 'css', 'legacy'] },
  };

  try {
    // Il PDF viene renderizzato UNA volta sola: il vecchio codice rifaceva
    // l'intero rendering html2canvas una seconda volta per il download.
    const pdfBlob: Blob = await html2pdf().set(opt).from(element).outputPdf('blob');
    const saved = await saveBlobAsFile(pdfBlob, filename);
    return saved ? pdfBlob : null;
  } catch (err) {
    console.error('[PremiumGuide] PDF generation failed:', err);
    return null;
  }
}

// ── Upload PDF to Supabase Storage ───────────────────────────────────────────
export async function uploadPdfToStorage(
  hash: string,
  pdfBlob: Blob
): Promise<string | null> {
  try {
    const filename = `guides/${hash}.pdf`;
    const { error } = await supabase.storage
      .from('premium_guides')
      .upload(filename, pdfBlob, {
        contentType: 'application/pdf',
        upsert: true,
      });

    if (error) {
      console.error('[PremiumGuide] Storage upload error:', error.message);
      return null;
    }

    const { data } = supabase.storage.from('premium_guides').getPublicUrl(filename);
    const publicUrl = data?.publicUrl || null;

    // Update pdf_url in itinerary_guides
    if (publicUrl) {
      await supabase
        .from('itinerary_guides')
        .update({ pdf_url: publicUrl })
        .eq('itinerary_hash', hash);
    }

    return publicUrl;
  } catch (err) {
    console.error('[PremiumGuide] Upload exception:', err);
    return null;
  }
}

// ── Export EPUB (gratuito: contenuto già pagato) ─────────────────────────────
// La rotta costruisce un EPUB 3 senza dipendenze dalla guida cachata in
// itinerary_guides. postForAudioBlob: su nativo la fetch patchata da
// CapacitorHttp corrompe i corpi binari, serve il percorso responseType blob.
export async function downloadGuideAsEpub(hash: string, titolo: string, language: string = 'IT'): Promise<boolean> {
  const { getApiUrl } = await import('../lib/api');
  const { postForAudioBlob } = await import('../lib/audioFetch');
  const { ok, blob } = await postForAudioBlob(getApiUrl('/api/premium-guide/epub'), { hash, language });
  if (!ok || !blob) return false;
  const epubBlob = new Blob([blob], { type: 'application/epub+zip' });
  const filename = `WIP_${String(titolo || 'Guida').replace(/[^a-zA-Z0-9àèéìòù ]/g, '').trim().replace(/\s+/g, '_').slice(0, 40)}.epub`;
  return saveBlobAsFile(epubBlob, filename);
}

// ── Helper: get current Supabase access token ────────────────────────────────
export async function getAccessToken(): Promise<string> {
  try {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token || '';
  } catch {
    return '';
  }
}

// ── Style metadata dictionary ────────────────────────────────────────────────
export const GUIDE_STYLE_META: Record<GuideStyle, { emoji: string; color: string; gradient: string }> = {
  art:       { emoji: '🎨', color: '#7c3aed', gradient: 'from-violet-600 to-purple-800' },
  family:    { emoji: '👨‍👩‍👧‍👦', color: '#0891b2', gradient: 'from-cyan-500 to-sky-700' },
  shopping:  { emoji: '🛍️', color: '#db2777', gradient: 'from-pink-500 to-rose-700' },
  food:      { emoji: '🍷', color: '#c2410c', gradient: 'from-orange-600 to-red-800' },
  essential: { emoji: '⚡', color: '#0a6c44', gradient: 'from-emerald-600 to-teal-800' },
};
