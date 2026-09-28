/**
 * Pulizia del testo per i font incorporati nel PDF. Le classi di caratteri
 * si costruiscono con i codici (String.fromCharCode) e non con i caratteri
 * scritti nel sorgente: U+2028 e affini sono terminatori di riga per il
 * parser e spezzavano il letterale della regex.
 */
const cc = (...codes: number[]) => codes.map((c) => String.fromCharCode(c)).join('');

// Selettori di variante (FE0F), ZWJ (200D), spazi anomali: NBSP (A0),
// narrow NBSP (202F), figure space (2007), line/paragraph separator (2028/2029).
const SIMBOLI_INVISIBILI = new RegExp('[' + cc(0xfe0f, 0x200d) + ']', 'g');
const SPAZI_ANOMALI = new RegExp('[' + cc(0xa0, 0x202f, 0x2007, 0x2028, 0x2029) + ']', 'g');
const EMOJI = /\p{Extended_Pictographic}/gu;
// Cirillico 0400-04FF, kana 3040-30FF, CJK 4E00-9FFF, hangul AC00-D7AF.
const NON_LATINI = new RegExp('[' + cc(0x0400) + '-' + cc(0x04ff) + cc(0x3040) + '-' + cc(0x30ff) + cc(0x4e00) + '-' + cc(0x9fff) + cc(0xac00) + '-' + cc(0xd7af) + ']');

// Oltre Latin-1 i font incorporati (Helvetica/Times) hanno solo la punteggiatura WinAnsi: i segni tipografici e i
// caratteri scritti con codici. Il resto esce come simboli (British Museum 20/09/2026: «Ōban», «Hokusai Ō…» → «BAM», «M4n»).
const WINANSI_EXTRA = new Set(cc(0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0x017d, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178).split(''));
const SPECIALI: Record<string, string> = { 'ł': 'l', 'Ł': 'L', 'đ': 'd', 'Đ': 'D', 'ı': 'i', 'ħ': 'h', 'Ħ': 'H', 'ʻ': "'", 'ʼ': "'", '−': '-', '‐': '-', '‑': '-', '‒': '-', '―': '-', '′': "'", '″': '"', '⁄': '/' };
/** Un carattere fuori Latin-1 senza glifo nel font: si toglie il segno (ō→o, ū→u, ř→r), come fa un tipografo. */
function glifoSicuro(ch: string): string {
  if (WINANSI_EXTRA.has(ch) || SPECIALI[ch] === undefined && /[\u0000-ÿ]/.test(ch)) return ch;
  if (SPECIALI[ch] !== undefined) return SPECIALI[ch];
  const base = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
  return base !== ch && /^[\u0000-ÿ]+$/.test(base) ? base : ch;
}
const FUORI_LATIN1 = /[^\u0000-ÿ]/g;

/** Emoji, selettori invisibili e spazi anomali: via. I caratteri senza glifo diventano la lettera base. */
export function pulisci(s: unknown): string {
  return String(s ?? '')
    .replace(EMOJI, '')
    .replace(FUORI_LATIN1, glifoSicuro)
    .replace(SIMBOLI_INVISIBILI, '')
    .replace(SPAZI_ANOMALI, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/** Cirillico / CJK / hangul: i font incorporati non li coprono. Chi chiama ripiega sulla vecchia via. */
export function haCaratteriNonLatini(s: string): boolean {
  return NON_LATINI.test(s);
}
