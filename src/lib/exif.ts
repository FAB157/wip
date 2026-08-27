/**
 * Lettore EXIF minimale per JPEG, senza dipendenze.
 *
 * Serve a Vision: una foto scelta dalla GALLERIA non deve mai ereditare le
 * coordinate del telefono, ma solo quelle scritte nella foto (GPS EXIF) e la
 * data dello scatto (DateTimeOriginal). Legge solo i primi 256 KB del file
 * (l'APP1/Exif sta in testa al JPEG) e ritorna null su qualsiasi errore:
 * file non JPEG (png/heic/webp), EXIF assente, offset fuori dal blocco letto.
 *
 * Struttura percorsa:
 *   SOI (FFD8) → segmenti → APP1 (FFE1) con header "Exif\0\0"
 *   → TIFF (byte order II/MM, magic 42, offset IFD0)
 *   → IFD0: 0x8769 (Exif IFD) e 0x8825 (GPS IFD)
 *   → Exif IFD: 0x9003 DateTimeOriginal (ASCII "YYYY:MM:DD HH:MM:SS"),
 *               0x9011 OffsetTimeOriginal (ASCII "+02:00", facoltativo)
 *   → GPS IFD:  0x0001 LatRef, 0x0002 Lat (3 RATIONAL),
 *               0x0003 LonRef, 0x0004 Lon (3 RATIONAL)
 */

export interface JpegExifInfo {
  lat: number | null;
  lon: number | null;
  /** ISO 8601 (con offset se la foto lo dichiara, altrimenti ora locale senza suffisso). */
  takenAt: string | null;
}

const EMPTY: JpegExifInfo = { lat: null, lon: null, takenAt: null };
const MAX_BYTES = 256 * 1024;

// Tag EXIF/TIFF usati
const TAG_EXIF_IFD = 0x8769;
const TAG_GPS_IFD = 0x8825;
const TAG_DATETIME_ORIGINAL = 0x9003;
const TAG_OFFSET_TIME_ORIGINAL = 0x9011;
const TAG_GPS_LAT_REF = 0x0001;
const TAG_GPS_LAT = 0x0002;
const TAG_GPS_LON_REF = 0x0003;
const TAG_GPS_LON = 0x0004;

type IfdEntry = { tag: number; type: number; count: number; valueOffset: number; inlineAt: number };

/** Dimensione in byte dei tipi TIFF (1 BYTE, 2 ASCII, 3 SHORT, 4 LONG, 5 RATIONAL, ...). */
const TYPE_SIZE: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8 };

/**
 * Legge lat/lon/data EXIF da un JPEG. Non lancia mai: in caso di problema
 * ritorna { lat: null, lon: null, takenAt: null }.
 */
export async function readJpegExif(file: File | Blob): Promise<JpegExifInfo> {
  try {
    if (!file || typeof (file as Blob).slice !== 'function') return { ...EMPTY };
    const head = (file as Blob).slice(0, MAX_BYTES);
    const buf = await head.arrayBuffer();
    return parseJpegExif(buf);
  } catch {
    return { ...EMPTY };
  }
}

/** Parser sincrono sul buffer (esportato per riuso/test). */
export function parseJpegExif(buf: ArrayBuffer): JpegExifInfo {
  const out: JpegExifInfo = { ...EMPTY };
  try {
    const view = new DataView(buf);
    if (view.byteLength < 4) return out;
    // SOI: se manca non è un JPEG (png/heic/webp) → tutto null.
    if (view.getUint8(0) !== 0xff || view.getUint8(1) !== 0xd8) return out;

    const tiffStart = findExifTiffStart(view);
    if (tiffStart < 0) return out;

    const bo = view.getUint16(tiffStart, false);
    let little: boolean;
    if (bo === 0x4949) little = true;       // "II" Intel
    else if (bo === 0x4d4d) little = false; // "MM" Motorola
    else return out;
    if (view.getUint16(tiffStart + 2, little) !== 42) return out;

    const ifd0Offset = view.getUint32(tiffStart + 4, little);
    const ifd0 = readIfd(view, tiffStart, ifd0Offset, little);

    const exifPtr = ifd0.find(e => e.tag === TAG_EXIF_IFD);
    const gpsPtr = ifd0.find(e => e.tag === TAG_GPS_IFD);

    // Data dello scatto: ogni sotto-lettura è isolata, un offset fuori dal
    // blocco letto (RangeError) non deve far perdere gli altri campi.
    if (exifPtr) {
      try {
        const exifIfd = readIfd(view, tiffStart, exifPtr.valueOffset, little);
        const dt = readAscii(view, tiffStart, exifIfd.find(e => e.tag === TAG_DATETIME_ORIGINAL), little);
        const tz = readAscii(view, tiffStart, exifIfd.find(e => e.tag === TAG_OFFSET_TIME_ORIGINAL), little);
        out.takenAt = exifDateToIso(dt, tz);
      } catch { /* data non leggibile */ }
    }

    if (gpsPtr) {
      try {
        const gpsIfd = readIfd(view, tiffStart, gpsPtr.valueOffset, little);
        const latRef = readAscii(view, tiffStart, gpsIfd.find(e => e.tag === TAG_GPS_LAT_REF), little);
        const lonRef = readAscii(view, tiffStart, gpsIfd.find(e => e.tag === TAG_GPS_LON_REF), little);
        const lat = readDms(view, tiffStart, gpsIfd.find(e => e.tag === TAG_GPS_LAT), little);
        const lon = readDms(view, tiffStart, gpsIfd.find(e => e.tag === TAG_GPS_LON), little);
        if (lat !== null && lon !== null) {
          const sLat = (latRef || '').toUpperCase().startsWith('S') ? -lat : lat;
          const sLon = (lonRef || '').toUpperCase().startsWith('W') ? -lon : lon;
          // Coordinate plausibili: finite, nei limiti e non l'origine (0,0)
          // che molte fotocamere scrivono quando il fix GPS manca.
          if (Number.isFinite(sLat) && Number.isFinite(sLon)
            && Math.abs(sLat) <= 90 && Math.abs(sLon) <= 180
            && !(sLat === 0 && sLon === 0)) {
            out.lat = sLat;
            out.lon = sLon;
          }
        }
      } catch { /* GPS non leggibile */ }
    }
  } catch {
    return { ...EMPTY };
  }
  return out;
}

/** Scorre i segmenti JPEG fino all'APP1 "Exif\0\0"; ritorna l'offset dell'header TIFF o -1. */
function findExifTiffStart(view: DataView): number {
  let offset = 2;
  const len = view.byteLength;
  while (offset + 4 <= len) {
    if (view.getUint8(offset) !== 0xff) return -1;
    const marker = view.getUint8(offset + 1);
    // Marker senza payload (padding FF, TEM, RSTn, SOI)
    if (marker === 0xff) { offset += 1; continue; }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) { offset += 2; continue; }
    // SOS: da qui in poi dati compressi, l'EXIF non c'è
    if (marker === 0xda || marker === 0xd9) return -1;
    const segLen = view.getUint16(offset + 2, false);
    if (segLen < 2) return -1;
    if (marker === 0xe1 && offset + 10 <= len) {
      // "Exif\0\0"
      if (view.getUint8(offset + 4) === 0x45 && view.getUint8(offset + 5) === 0x78
        && view.getUint8(offset + 6) === 0x69 && view.getUint8(offset + 7) === 0x66
        && view.getUint8(offset + 8) === 0x00) {
        return offset + 10;
      }
    }
    offset += 2 + segLen;
  }
  return -1;
}

/** Legge le entry di una IFD (12 byte l'una). Offset relativi all'header TIFF. */
function readIfd(view: DataView, tiffStart: number, ifdOffset: number, little: boolean): IfdEntry[] {
  const base = tiffStart + ifdOffset;
  const count = view.getUint16(base, little);
  // Una IFD reale non supera qualche centinaio di entry: oltre è spazzatura.
  if (count > 512) return [];
  const entries: IfdEntry[] = [];
  for (let i = 0; i < count; i++) {
    const at = base + 2 + i * 12;
    if (at + 12 > view.byteLength) break;
    entries.push({
      tag: view.getUint16(at, little),
      type: view.getUint16(at + 2, little),
      count: view.getUint32(at + 4, little),
      valueOffset: view.getUint32(at + 8, little),
      inlineAt: at + 8,
    });
  }
  return entries;
}

/** Posizione assoluta del valore: inline nei 4 byte se ci sta, altrimenti all'offset. */
function valuePosition(entry: IfdEntry, tiffStart: number): number {
  const size = (TYPE_SIZE[entry.type] || 1) * entry.count;
  return size <= 4 ? entry.inlineAt : tiffStart + entry.valueOffset;
}

function readAscii(view: DataView, tiffStart: number, entry: IfdEntry | undefined, _little: boolean): string | null {
  if (!entry || entry.type !== 2 || entry.count === 0 || entry.count > 256) return null;
  const pos = valuePosition(entry, tiffStart);
  if (pos + entry.count > view.byteLength) return null;
  let s = '';
  for (let i = 0; i < entry.count; i++) {
    const c = view.getUint8(pos + i);
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s.trim() || null;
}

/** Gradi/minuti/secondi come 3 RATIONAL → gradi decimali (null se non valido). */
function readDms(view: DataView, tiffStart: number, entry: IfdEntry | undefined, little: boolean): number | null {
  if (!entry || entry.type !== 5 || entry.count < 3) return null;
  const pos = tiffStart + entry.valueOffset;
  if (pos + 24 > view.byteLength) return null;
  const parts: number[] = [];
  for (let i = 0; i < 3; i++) {
    const num = view.getUint32(pos + i * 8, little);
    const den = view.getUint32(pos + i * 8 + 4, little);
    // Secondi a 0/0 capita (alcuni telefoni): vale 0, non invalida la lettura.
    if (den === 0) { if (i === 0) return null; parts.push(0); continue; }
    parts.push(num / den);
  }
  const [d, m, s] = parts;
  const dec = d + m / 60 + s / 3600;
  return Number.isFinite(dec) ? dec : null;
}

/** "2024:05:17 14:32:05" (+ "+02:00") → "2024-05-17T14:32:05+02:00". */
function exifDateToIso(dt: string | null, tz: string | null): string | null {
  if (!dt) return null;
  const m = dt.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  // Alcune fotocamere scrivono "0000:00:00 00:00:00" quando la data manca.
  if (y === '0000' || mo === '00' || d === '00') return null;
  const iso = `${y}-${mo}-${d}T${h}:${mi}:${s}`;
  const probe = new Date(iso);
  if (Number.isNaN(probe.getTime())) return null;
  const tzOk = tz && /^[+-]\d{2}:\d{2}$/.test(tz) ? tz : '';
  return iso + tzOk;
}
