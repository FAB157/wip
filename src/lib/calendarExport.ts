/**
 * Esportazione dell'itinerario generato in formato iCalendar (RFC 5545).
 *
 * Produce un .ics universale (Apple Calendar / Google Calendar / Outlook)
 * con un VEVENT per ogni tappa. Le date/ore sono scritte come "floating
 * time" (senza TZID né suffisso Z): l'evento cade alle 09:00 *locali* di
 * qualunque fuso si trovi l'utente — per un viaggio è il comportamento
 * giusto (la visita delle 9 resta alle 9 anche se prenoti da un altro fuso).
 *
 * Struttura dati attesa (la stessa di PlanScreen/ProfileScreen):
 *   itinerary.giorni[].tappe[] con campi ora|orario, titolo_tappa,
 *   attivita, tipo, coordinate:{lat,lng} (o lat/lon piatti).
 * Tutti i campi sono trattati come opzionali: dati malformati producono
 * eventi più poveri, mai eccezioni.
 */

import { Capacitor } from '@capacitor/core';

export interface ItineraryIcsResult {
  filename: string;
  icsContent: string;
}

/* ── Slot orari di ripiego (minuti da mezzanotte) ─────────────────────── */
/* Se l'orario della tappa non è "HH:MM" si prova a riconoscere la fascia
 * testuale; altrimenti si accoda dopo la tappa precedente (+30 min). */
const TEXT_SLOTS: Array<{ re: RegExp; minutes: number }> = [
  { re: /colazion/i, minutes: 8 * 60 },        // Colazione → 08:00
  { re: /mattin/i, minutes: 9 * 60 },          // Mattina → 09:00
  { re: /pranzo/i, minutes: 12 * 60 + 30 },    // Pranzo → 12:30
  { re: /pomerigg/i, minutes: 15 * 60 },       // Pomeriggio → 15:00
  { re: /aperitiv/i, minutes: 18 * 60 + 30 },  // Aperitivo → 18:30
  { re: /(sera|cena|notte)/i, minutes: 20 * 60 }, // Sera/Cena → 20:00
];

const DEFAULT_DURATION_MIN = 90; // visita standard: 1h30
const MEAL_DURATION_MIN = 60;    // pasti: 1h

/** "09:00" / "9.30" / "ore 14:15" → minuti da mezzanotte, altrimenti null. */
function parseHhMm(raw: unknown): number | null {
  if (typeof raw !== 'string') return null;
  const m = raw.match(/(\d{1,2})[:.](\d{2})/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

function textSlotMinutes(raw: unknown): number | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  for (const slot of TEXT_SLOTS) {
    if (slot.re.test(raw)) return slot.minutes;
  }
  return null;
}

/** Una tappa è un pasto? (durata più corta) */
function isMeal(tappa: any): boolean {
  const tipo = String(tappa?.tipo || '').toLowerCase();
  if (tipo === 'ristorante' || tipo === 'pausa') return true;
  const text = `${tappa?.ora || tappa?.orario || ''} ${tappa?.titolo_tappa || ''}`;
  return /pranzo|cena|colazione|aperitiv|degustazion/i.test(text);
}

/** Coordinate della tappa, tolleranti ai due formati usati nel codebase. */
function coordOf(tappa: any): { lat: number; lon: number } | null {
  const lat = Number(tappa?.coordinate?.lat ?? tappa?.lat);
  const lon = Number(tappa?.coordinate?.lng ?? tappa?.coordinate?.lon ?? tappa?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) return null;
  return { lat, lon };
}

/** Emoji per tipo tappa — stessa mappa usata nelle card di PlanScreen. */
function emojiForTipo(tipo: unknown): string {
  switch (String(tipo || '').toLowerCase()) {
    case 'museo': return '🏛️';
    case 'chiesa': return '⛪';
    case 'monumento': return '🗿';
    case 'ristorante': return '🍕';
    case 'parco': case 'natura': return '🌿';
    case 'esperienza': return '🎟️';
    case 'evento': return '🎫';
    case 'trasferimento': case 'spostamento': return '🚗';
    default: return '📍';
  }
}

/* ── Primitive ICS ────────────────────────────────────────────────────── */

/** Escaping RFC 5545 per i valori TEXT: backslash, ; , e newline. */
function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/**
 * Folding a 75 OTTETTI (non caratteri): le continuazioni iniziano con uno
 * spazio. Si spezza per code point interi (mai a metà di un carattere
 * UTF-8 multi-byte, emoji comprese).
 */
function foldIcsLine(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out: string[] = [];
  let cur = '';
  let curBytes = 0;
  for (const ch of line) { // for..of itera per code point (surrogate ok)
    const chBytes = enc.encode(ch).length;
    if (curBytes + chBytes > 75) {
      out.push(cur);
      cur = ' ' + ch; // lo spazio di continuazione conta nel limite
      curBytes = 1 + chBytes;
    } else {
      cur += ch;
      curBytes += chBytes;
    }
  }
  if (cur) out.push(cur);
  return out.join('\r\n');
}

function pad2(n: number): string { return String(n).padStart(2, '0'); }

/** Data+minuti → "YYYYMMDDTHHMMSS" (floating local time). */
function toIcsLocal(date: Date, minutesOfDay: number): string {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const mins = Math.min(Math.max(minutesOfDay, 0), 23 * 60 + 59);
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}` +
    `T${pad2(Math.floor(mins / 60))}${pad2(mins % 60)}00`;
}

/** DTSTAMP in UTC come da RFC. */
function toIcsUtcNow(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}` +
    `T${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}${pad2(d.getUTCSeconds())}Z`;
}

/** Hash djb2 (stabile) dell'itinerario per UID deterministici. */
function itineraryHash(itinerary: any): string {
  const src = [
    itinerary?.titolo || '',
    (itinerary?.giorni || []).length,
    ...(itinerary?.giorni || []).flatMap((g: any) =>
      (g?.tappe || []).map((t: any) => t?.titolo_tappa || '')),
  ].join('|');
  let h = 5381;
  for (let i = 0; i < src.length; i++) {
    h = ((h << 5) + h + src.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

/** Città/destinazione: campo esplicito o prefisso del titolo ("Roma: ..."). */
function cityOf(itinerary: any): string {
  const explicit = itinerary?.destinazione || itinerary?.destination;
  if (typeof explicit === 'string' && explicit.trim()) return explicit.trim();
  const fromTitle = String(itinerary?.titolo || '').split(':')[0].trim();
  // Il prefisso è una città solo se è corto (evita di usare l'intero titolo)
  return fromTitle && fromTitle.length <= 40 ? fromTitle : '';
}

/* ── API principale ───────────────────────────────────────────────────── */

/**
 * Genera il VCALENDAR completo per l'itinerario a partire da `startDate`
 * (il giorno N cade su startDate + N-1). Ritorna nome file + contenuto.
 */
export function buildItineraryIcs(itinerary: any, startDate: Date): ItineraryIcsResult {
  const giorni: any[] = Array.isArray(itinerary?.giorni) ? itinerary.giorni : [];
  const hash = itineraryHash(itinerary);
  const city = cityOf(itinerary);
  const dtstamp = toIcsUtcNow();
  const calName = String(itinerary?.titolo || 'Itinerario WIP');

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//WIP World in Pocket//Itinerario AI//IT',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcsText(calName)}`,
  ];

  giorni.forEach((giorno: any, gIdx: number) => {
    const dayNumber = Number.isFinite(Number(giorno?.giorno)) && Number(giorno.giorno) >= 1
      ? Number(giorno.giorno)
      : gIdx + 1;
    const eventDate = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
    eventDate.setDate(eventDate.getDate() + (dayNumber - 1));

    const tappe: any[] = Array.isArray(giorno?.tappe) ? giorno.tappe : [];
    let prevEnd = 9 * 60 - 30; // così la prima tappa senza orario parte alle 09:00

    tappe.forEach((tappa: any, tIdx: number) => {
      const rawOra = tappa?.ora ?? tappa?.orario;
      // Orario: HH:MM esplicito → fascia testuale → dopo la tappa precedente
      const startMin = parseHhMm(rawOra)
        ?? textSlotMinutes(rawOra)
        ?? Math.min(Math.max(prevEnd + 30, 9 * 60), 21 * 60 + 30);
      const durationMin = isMeal(tappa) ? MEAL_DURATION_MIN : DEFAULT_DURATION_MIN;
      const endMin = Math.min(startMin + durationMin, 23 * 60 + 59);
      prevEnd = endMin;

      const titolo = String(tappa?.titolo_tappa || tappa?.nome || 'Tappa').trim() || 'Tappa';
      const summary = `${emojiForTipo(tappa?.tipo)} ${titolo}`;
      const descrizione = String(tappa?.attivita || '').trim().slice(0, 300);
      const location = city && !titolo.toLowerCase().includes(city.toLowerCase())
        ? `${titolo}, ${city}`
        : titolo;
      const geo = coordOf(tappa);

      lines.push(
        'BEGIN:VEVENT',
        `UID:wip-${hash}-${dayNumber}-${tIdx + 1}@wip.guide`,
        `DTSTAMP:${dtstamp}`,
        `DTSTART:${toIcsLocal(eventDate, startMin)}`,
        `DTEND:${toIcsLocal(eventDate, endMin)}`,
        `SUMMARY:${escapeIcsText(summary)}`,
      );
      if (descrizione) lines.push(`DESCRIPTION:${escapeIcsText(descrizione)}`);
      lines.push(`LOCATION:${escapeIcsText(location)}`);
      // GEO usa ';' come separatore strutturale: NON va escapato qui
      if (geo) lines.push(`GEO:${geo.lat.toFixed(6)};${geo.lon.toFixed(6)}`);
      lines.push(
        'BEGIN:VALARM',
        'ACTION:DISPLAY',
        'TRIGGER:-PT30M',
        `DESCRIPTION:${escapeIcsText(`Tra 30 minuti: ${titolo}`)}`,
        'END:VALARM',
        'END:VEVENT',
      );
    });
  });

  lines.push('END:VCALENDAR');

  const icsContent = lines.map(foldIcsLine).join('\r\n') + '\r\n';

  const slug = calName
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // via gli accenti
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'itinerario';
  const d = startDate;
  const filename = `WIP-${slug}-${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}.ics`;

  return { filename, icsContent };
}

/**
 * Consegna il file .ics all'utente, best-effort per piattaforma:
 *
 * - Web/PWA: Blob + <a download> (percorso affidabile ovunque).
 * - Nativo (Capacitor): l'<a download> nel WebView spesso non fa nulla,
 *   quindi si prova la Web Share API con file (l'utente sceglie
 *   "Calendario" dallo share sheet); se non disponibile si apre un
 *   data: URL. LIMITE NOTO: su alcuni WebView Android il data: URL viene
 *   bloccato — in quel caso l'unica via è lo share sheet, e se anche
 *   quello manca la funzione ritorna false (il chiamante avvisa l'utente).
 *
 * Ritorna true se un percorso di consegna è stato avviato.
 */
export async function deliverIcsFile(filename: string, icsContent: string): Promise<boolean> {
  const mime = 'text/calendar';
  const blob = new Blob([icsContent], { type: `${mime};charset=utf-8` });

  const isNative = Capacitor.isNativePlatform();

  // Sul nativo lo share sheet è il percorso principale; sul web è il
  // fallback (alcuni browser non supportano share di file).
  const tryShare = async (): Promise<boolean> => {
    try {
      const nav: any = navigator;
      if (typeof nav?.share !== 'function') return false;
      const file = new File([blob], filename, { type: mime });
      if (nav.canShare && !nav.canShare({ files: [file] })) return false;
      await nav.share({ files: [file], title: filename });
      return true;
    } catch (e: any) {
      // L'annullamento dell'utente conta come "consegnato" (ha visto lo sheet)
      if (e?.name === 'AbortError') return true;
      return false;
    }
  };

  const tryAnchorDownload = (): boolean => {
    try {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      return true;
    } catch {
      return false;
    }
  };

  const tryDataUrl = (): boolean => {
    try {
      const url = `data:${mime};charset=utf-8,${encodeURIComponent(icsContent)}`;
      const win = window.open(url, '_blank');
      return !!win;
    } catch {
      return false;
    }
  };

  if (isNative) {
    if (await tryShare()) return true;
    return tryDataUrl();
  }
  if (tryAnchorDownload()) return true;
  if (await tryShare()) return true;
  return tryDataUrl();
}
