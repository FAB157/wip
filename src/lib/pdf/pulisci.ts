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

/** Emoji, selettori invisibili e spazi anomali: via. */
export function pulisci(s: unknown): string {
  return String(s ?? '')
    .replace(EMOJI, '')
    .replace(SIMBOLI_INVISIBILI, '')
    .replace(SPAZI_ANOMALI, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/** Cirillico / CJK / hangul: i font incorporati non li coprono. Chi chiama ripiega sulla vecchia via. */
export function haCaratteriNonLatini(s: string): boolean {
  return NON_LATINI.test(s);
}
