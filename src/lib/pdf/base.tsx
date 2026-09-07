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
import { Page, Text, View, StyleSheet } from '@react-pdf/renderer';
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
