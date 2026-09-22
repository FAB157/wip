/**
 * PDF «come un libro» (05/09/2026). Fino a oggi i PDF dell'itinerario e della
 * Guida Premium erano FOTOGRAFIE della pagina (html2pdf.js = html2canvas +
 * jsPDF): testo rasterizzato e grigio, non selezionabile, e ogni blocco che
 * toccava il bordo del foglio spinto alla pagina dopo — mezza pagina bianca
 * ogni scheda, 39 pagine per un documento da 20. Qui il documento e' descritto
 * come componenti @react-pdf/renderer: un motore di impaginazione vero, testo
 * reale con flusso continuo fra le pagine, piede con numero di pagina e
 * «wip.guide» su ogni foglio, segnalibri (outline) per navigare come in un
 * libro. La versione online non cambia: cambia solo come si stampa.
 *
 * Caratteri: quelli incorporati in ogni lettore PDF (Helvetica, Times), che
 * coprono le lingue latine (IT/EN/FR/ES/DE). Per RU e ZH servirebbe un font
 * scaricato a runtime: per ora quelle lingue restano sulla vecchia via.
 */
import React from 'react';
import { Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer';
import { pulisci } from './pulisci.js';

export { pulisci, haCaratteriNonLatini } from './pulisci.js';

export const PDF_C = {
  navy: '#1e3a8a',
  navyScuro: '#152b66',
  blu: '#2563a8',
  oro: '#d4af37',
  arancio: '#e8611a',
  testo: '#1c1c1c',
  medio: '#444444',
  tenue: '#777777',
  fondo: '#f7f8fa',
  bordo: '#e2e6ea',
  bianco: '#ffffff',
  rosso: '#be123c',
  ambra: '#b45309',
};

export const pdfStili = StyleSheet.create({
  pagina: {
    paddingTop: 16 * 2.835, paddingBottom: 20 * 2.835, paddingHorizontal: 18 * 2.835,
    fontFamily: 'Times-Roman', fontSize: 10.5, lineHeight: 1.45, color: PDF_C.testo,
    backgroundColor: PDF_C.bianco,
  },
  piede: {
    position: 'absolute', left: 18 * 2.835, right: 18 * 2.835, bottom: 9 * 2.835,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderTopWidth: 0.6, borderTopColor: PDF_C.bordo, paddingTop: 4,
    fontFamily: 'Helvetica', fontSize: 7.5, color: PDF_C.tenue,
  },
  piedeMarchio: { color: PDF_C.navy, fontFamily: 'Helvetica-Bold', letterSpacing: 0.5 },
  h1: { fontFamily: 'Helvetica-Bold', fontSize: 22, color: PDF_C.navy, lineHeight: 1.15, marginBottom: 6 },
  h2: { fontFamily: 'Helvetica-Bold', fontSize: 15, color: PDF_C.navy, lineHeight: 1.2, marginTop: 10, marginBottom: 6 },
  h3: { fontFamily: 'Helvetica-Bold', fontSize: 12.5, color: PDF_C.navy, lineHeight: 1.2, marginTop: 8, marginBottom: 3 },
  occhiello: { fontFamily: 'Helvetica-Bold', fontSize: 7.5, color: PDF_C.arancio, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 3 },
  paragrafo: { marginBottom: 6, textAlign: 'justify' },
  corsivo: { fontFamily: 'Times-Italic' },
  grassetto: { fontFamily: 'Times-Bold' },
  sans: { fontFamily: 'Helvetica' },
  sansBold: { fontFamily: 'Helvetica-Bold' },
  piccolo: { fontSize: 8.5, color: PDF_C.medio },
  tenue: { color: PDF_C.tenue },
  bandaGiorno: {
    backgroundColor: PDF_C.navy, color: PDF_C.bianco, paddingVertical: 6, paddingHorizontal: 10,
    borderRadius: 3, marginTop: 12, marginBottom: 8,
  },
  bandaGiornoTitolo: { fontFamily: 'Helvetica-Bold', fontSize: 13, color: PDF_C.bianco },
  bandaGiornoTema: { fontFamily: 'Helvetica', fontSize: 9, color: PDF_C.oro, marginTop: 2 },
  riquadro: {
    borderWidth: 0.8, borderColor: PDF_C.bordo, borderRadius: 4, backgroundColor: PDF_C.fondo,
    paddingVertical: 6, paddingHorizontal: 9, marginTop: 4, marginBottom: 8,
  },
  riquadroOro: {
    borderLeftWidth: 3, borderLeftColor: PDF_C.oro, backgroundColor: '#fffaf0',
    paddingVertical: 5, paddingHorizontal: 9, marginTop: 4, marginBottom: 8,
  },
  riquadroTitolo: { fontFamily: 'Helvetica-Bold', fontSize: 8, color: PDF_C.navy, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 3 },
  puntoElenco: { flexDirection: 'row', marginBottom: 2.5 },
  pallino: { width: 10, color: PDF_C.oro, fontFamily: 'Helvetica-Bold' },
  elencoTesto: { flex: 1 },
  tabellaRiga: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: PDF_C.bordo, paddingVertical: 3 },
  tabellaCella: { fontSize: 9.5 },
  separatore: { borderBottomWidth: 0.6, borderBottomColor: PDF_C.oro, marginVertical: 8 },
});

/** Il piede fisso di ogni pagina: chi lo legge deve sapere da dove viene. */
// Text fissi e assoluti, non un View contenitore: il View con figli fissi non
// compariva (05/09/2026, verificato con un documento minimo). Il NUMERO DI
// PAGINA non sta qui: il `render` di react-pdf 4.9 oltre ~15 pagine in una
// stessa Page produce coordinate assurde (unsupported number) o sparisce —
// riprodotto con un documento di solo testo. Lo stampa `numeraPagine`
// (generaPdf.ts) con pdf-lib, in un secondo passaggio, nello stesso punto e
// con lo stesso carattere. `etichettaPagina` resta nella firma per quel passo.
export const PIEDE_Y = 9 * 2.835;
export const PIEDE_X = 18 * 2.835;
export const PIEDE_FONT = 7.5;
export const PiedePagina = ({ titolo }: { titolo: string; etichettaPagina?: string }) => (
  <>
    <View fixed style={{ position: 'absolute', left: PIEDE_X, right: PIEDE_X, bottom: PIEDE_Y + 13, borderTopWidth: 0.6, borderTopColor: PDF_C.bordo }} />
    <Text fixed style={{ position: 'absolute', left: PIEDE_X, bottom: PIEDE_Y, fontFamily: 'Helvetica', fontSize: PIEDE_FONT, color: PDF_C.tenue }}>
      <Text style={pdfStili.piedeMarchio}>wip.guide</Text>{'   ·   ' + pulisci(titolo).slice(0, 70)}
    </Text>
  </>
);

/**
 * LA FOTO SI VEDE INTERA (20/09/2026, committente sul PDF del Duomo: «verifica
 * perche' le foto vengono tagliate»). Prima: `width: 100%` + `maxHeight: 62mm`
 * + `objectFit: cover` — una fascia larga 174 mm e alta 62: QUALSIASI foto
 * (una 3:2 a quella larghezza e' alta 116 mm) veniva ritagliata a meta', e di
 * una verticale — una statua, una vetrata, un portale — restava la striscia
 * centrale. Ora la foto tiene le SUE proporzioni: con le misure note
 * (`misure`, lette quando la si scarica) il riquadro e' esattamente il suo,
 * largo quanto serve e alto al massimo `maxAltezza`; senza misure si ripiega
 * su `contain`, che la mostra comunque tutta.
 */
export const PDF_LARGHEZZA_TESTO = 595.28 - 2 * 18 * 2.835;
export interface MisureFoto { w: number; h: number }
export function riquadroFoto(misure: MisureFoto | undefined, maxLarghezza: number, maxAltezza: number): { width: number; height: number } | null {
  if (!misure || !(misure.w > 0) || !(misure.h > 0)) return null;
  const rapporto = misure.w / misure.h;
  let width = maxLarghezza, height = width / rapporto;
  if (height > maxAltezza) { height = maxAltezza; width = height * rapporto; }
  return { width, height };
}
export const FotoIntera = ({ src, misure, maxLarghezza = PDF_LARGHEZZA_TESTO, maxAltezza = 62 * 2.835, stile }: { src: string; misure?: MisureFoto; maxLarghezza?: number; maxAltezza?: number; stile?: any }) => {
  const r = riquadroFoto(misure, maxLarghezza, maxAltezza);
  if (!r) return <Image src={src} style={[{ width: '100%', maxHeight: maxAltezza, objectFit: 'contain' }, stile || {}]} />;
  return <Image src={src} style={[{ width: r.width, height: r.height, borderRadius: 4, alignSelf: 'center' }, stile || {}]} />;
};

/**
 * FOTO E TESTO CHE SCORRONO (20/09/2026, collaudo del PDF del Duomo in
 * produzione: mezza pagina bianca dopo l'introduzione, e a pagina dell'Organo
 * il titolo sovrapposto al sottotitolo con una fascia grigia in mezzo al
 * testo). Causa: l'INTERA scheda dell'opera era un blocco indivisibile
 * (`wrap={false}`). Con i testi veri (2.000-4.000 caratteri) la scheda non
 * entrava nello spazio rimasto e saltava alla pagina dopo, lasciando il vuoto;
 * quando era piu' alta di una pagina il motore la schiacciava.
 * Ora si tiene unito SOLO cio' che e' piccolo: intestazione + foto (e la parte
 * di testo che le sta accanto). Il resto del testo e' un paragrafo normale, che
 * va a capo di pagina dove serve.
 *  - foto VERTICALE o quadrata → in verticale, col testo accanto: le prime frasi
 *    che stanno nell'altezza della foto; il resto sotto, a tutta larghezza;
 *  - foto ORIZZONTALE → sopra il testo, ridotta e centrata;
 *  - nessuna foto → intestazione + testo.
 */
export const PDF_TESTO_FONT = 10.5;
export const PDF_TESTO_INTERLINEA = 1.45;
const RE_FRASI = /[^.!?…\n]+[.!?…]+["»”')\]]*\s*|[^.!?…\n]*\n+|[^.!?…\n]+$/g;
/** Divide `testo` in (parte accanto alla foto, resto) a fine frase entro `budget` caratteri. */
export function dividiPerFianco(testo: string, budget: number): [string, string] {
  if (testo.length <= budget) return [testo, ''];
  let fine = 0;
  for (const m of testo.matchAll(RE_FRASI)) {
    const nuovo = (m.index ?? 0) + m[0].length;
    if (fine && nuovo > budget) break;
    fine = nuovo;
    if (fine > budget) break;
  }
  // Una frase sola lunghissima: si taglia a fine parola.
  if (fine === 0 || fine > budget * 1.3) fine = testo.slice(0, budget).replace(/\s+\S*$/, '').length;
  return [testo.slice(0, fine).trim(), testo.slice(fine).trim()];
}
export const FotoConTesto = ({ intestazione, foto, misure, testo, stileTesto }: {
  intestazione?: React.ReactNode; foto?: string; misure?: MisureFoto; testo?: string; stileTesto?: any;
}) => {
  const fianco = foto && misure && misure.w / misure.h < 1.1 ? riquadroFoto(misure, 62 * 2.835, 72 * 2.835) : null;
  const stile = stileTesto || pdfStili.paragrafo;
  if (fianco && foto) {
    const colonna = PDF_LARGHEZZA_TESTO - fianco.width - 10;
    // Righe che stanno nell'altezza della foto × caratteri per riga (Times ≈ 0.46 em/carattere).
    const budget = Math.max(3, Math.floor(fianco.height / (PDF_TESTO_FONT * PDF_TESTO_INTERLINEA)) - 1) * Math.floor(colonna / (PDF_TESTO_FONT * 0.46));
    const [accanto, resto] = dividiPerFianco(String(testo || ''), budget);
    return (
      <>
        <View wrap={false}>
          {intestazione}
          <View style={{ flexDirection: 'row', marginTop: 4 }}>
            <Image src={foto} style={{ width: fianco.width, height: fianco.height, borderRadius: 4 }} />
            <Text style={[stile, { width: colonna, marginLeft: 10, marginBottom: 0 }]}>{accanto}</Text>
          </View>
        </View>
        {resto ? <Text style={[stile, { marginTop: 4 }]}>{resto}</Text> : null}
      </>
    );
  }
  return (
    <>
      <View wrap={false}>
        {intestazione}
        {/* Orizzontale: ridotta e centrata. Senza misure (foto non leggibile dal browser): intera comunque, in un riquadro basso. */}
        {foto ? <FotoIntera src={foto} misure={misure} maxLarghezza={120 * 2.835} maxAltezza={66 * 2.835} stile={{ marginTop: 4, marginBottom: 2 }} /> : null}
      </View>
      {testo ? <Text style={[stile, { marginTop: 3 }]}>{testo}</Text> : null}
    </>
  );
};

export const Elenco = ({ voci, stile }: { voci: string[]; stile?: any }) => (
  <View style={{ marginBottom: 4 }}>
    {voci.filter(Boolean).map((v, i) => (
      <View key={i} style={pdfStili.puntoElenco} wrap={false}>
        <Text style={pdfStili.pallino}>•</Text>
        <Text style={stile ? [pdfStili.elencoTesto, stile] : pdfStili.elencoTesto}>{pulisci(v)}</Text>
      </View>
    ))}
  </View>
);

/** Le stelle con glifi che i font incorporati hanno: «★» non c'e'. */
export const stelle = (n: number) => {
  const k = Math.max(0, Math.min(5, Math.round(Number(n) || 4)));
  return '*'.repeat(k) + '·'.repeat(5 - k);
};

export const PaginaBase = ({ children, titolo, etichettaPagina, bookmark }: { children: React.ReactNode; titolo: string; etichettaPagina: string; bookmark?: any }) => (
  <Page size="A4" style={pdfStili.pagina} bookmark={bookmark}>
    {children}
    <PiedePagina titolo={titolo} etichettaPagina={etichettaPagina} />
  </Page>
);
