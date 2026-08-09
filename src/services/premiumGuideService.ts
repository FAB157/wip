/**
 * premiumGuideService.ts
 * Service layer for the WIP Premium Guide module.
 * Handles API calls, hashing, Supabase upload and html2pdf.js PDF rendering.
 */

import { supabase } from '../lib/supabase';
import { parsePartialJSON } from '../lib/partialJsonParser';
import { get as idbGet, set as idbSet } from 'idb-keyval';

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

// ── Compute SHA-256 hash from itinerary + style ─────────────────────────────
export async function computeItineraryHash(itinerary: any, style: string): Promise<string> {
  const raw = JSON.stringify({ itinerary, style });
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
  language: string = 'IT'
): Promise<GenerateGuideResult> {
  const hash = await computeItineraryHash(itinerary, style + "_" + language);

  // 1. Cache check
  const cached = await getCachedGuide(hash);
  if (cached) return cached;

  // 2. Call server endpoint (quota check + Groq + Unsplash are server-side)
  const response = await fetch('/api/premium-guide/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${await getAccessToken()}`,
    },
    body: JSON.stringify({ itinerary, style, userId, hash, language }),
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
  const verifiedContent = await verifyGuideAntiAllucinazioni(data.content, itinerary);
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

export async function generatePremiumGuideStream(
  itinerary: any,
  style: GuideStyle,
  userId: string,
  language: string,
  onChunk: (text: string) => void
): Promise<GenerateGuideResult> {
  const hash = await computeItineraryHash(itinerary, style + "_" + language);

  const cached = await getCachedGuide(hash);
  if (cached) return cached;

  const response = await fetch('/api/premium-guide/generate-stream', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${await getAccessToken()}`,
    },
    body: JSON.stringify({ itinerary, style, userId, hash, language }),
  });

  const reader = response.body?.getReader();
  const decoder = new TextDecoder();
  let fullJson = "";

  if (reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const dataStr = line.slice(6).trim();
          if (dataStr === '[DONE]') break;
          if (dataStr) {
            try {
              const parsed = JSON.parse(dataStr);
              if (parsed.text) {
                fullJson += parsed.text;
                const partialObj = parsePartialJSON(fullJson);
                if (partialObj && partialObj.giorni) {
                  onChunk(partialObj);
                }
              } else if (parsed.error) {
                throw new Error(parsed.error);
              }
            } catch (e) {}
          }
        }
      }
    }
  }

  // Parse difensivo del JSON finale: rimuove eventuali fence markdown e testo
  // spurio prima/dopo l'oggetto, invece di esplodere con un SyntaxError.
  let cleanJson = fullJson.replace(/^```json\s*/i, '').replace(/```\s*$/, '');
  const fb = cleanJson.indexOf('{');
  const lb = cleanJson.lastIndexOf('}');
  if (fb !== -1 && lb > fb) cleanJson = cleanJson.slice(fb, lb + 1);
  const data = JSON.parse(cleanJson);
  const verifiedContent = await verifyGuideAntiAllucinazioni(data, itinerary);
  const result: GenerateGuideResult = {
    content: verifiedContent as PremiumGuideContent,
    media_manifest: {}, // Le immagini possono mancare nello stream veloce
    hash,
    fromCache: false,
  };
  // La guida appena generata/acquistata resta disponibile offline
  saveGuideLocally(result);
  return result;
}

/**
 * Verifica anti-allucinazione della guida d'autore: un motore AI DIVERSO
 * dal generatore rilegge i POI della guida e marca quelli sospetti
 * (campi verifica/nota_verifica per POI). Fail-open: su errore o timeout
 * la guida passa com'è.
 */
async function verifyGuideAntiAllucinazioni(content: any, itinerary: any): Promise<any> {
  try {
    if (!content?.giorni?.length) return content;
    const destination = itinerary?.titolo || itinerary?.destinazione || content?.guida_titolo || '';
    if (!destination) return content;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 30000);
    const res = await fetch('/api/itinerary/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itinerary: content, destination }),
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
    // Fallback: stampa browser SOLO della guida. Il window.print() nudo
    // stampava l'itinerario, perché PrintView si autoattiva in @media print.
    const { printScoped } = await import('../lib/printScoped');
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
    const dlUrl = URL.createObjectURL(pdfBlob);
    const a = document.createElement('a');
    a.href = dlUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(dlUrl);
    return pdfBlob;
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
