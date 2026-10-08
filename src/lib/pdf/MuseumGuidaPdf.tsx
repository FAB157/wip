/**
 * LA GUIDA DEL MUSEO COME LIBRO (13/09/2026). Fino a oggi «Stampa la guida»
 * in MuseumVisitSheet passava DIRETTAMENTE da html2pdf (screenshot della
 * pagina), saltando l'impaginazione vera che itinerario e Guida Premium
 * hanno già (vedi base.tsx: «PDF come un libro», 05/09/2026) — mai stata
 * portata qui. Un museo con molte opere (Kunsthistorisches, 30 tappe) produce
 * un #museum-print-view altissimo: html2canvas lo rasterizza in un unico
 * canvas che supera i limiti dimensionali del motore grafico del telefono
 * (specialmente iOS/WebKit) e fallisce silenziosamente — da qui "PDF non
 * riuscito" segnalato dal committente. Con @react-pdf/renderer il documento
 * si impagina a pagine vere, senza un canvas gigante da disegnare.
 * Stessa veste grafica di ItinerarioPdf/GuidaPremiumPdf (base.tsx): navy,
 * oro, Times per i testi lunghi, piede con "wip.guide" su ogni pagina —
 * COMPRESA la copertina fotografica (13/09/2026, segnalazione committente:
 * «stessa grafica e stessa qualita' di stampa di itinerari e guide premium»)
 * e la foto di ogni opera (`tappa.foto`, Wikimedia Commons via Wikidata P18,
 * gia' presente nei dati della visita ma finora mai disegnata nel PDF).
 */
import React from 'react';
import { Document, Page, Text, View, Image } from '@react-pdf/renderer';
import { PDF_C, pdfStili as S, pulisci, PiedePagina, FotoConTesto, type MisureFoto } from './base.js';
import type { MuseumVisit, ArtworkGuide, MuseumMap } from '../museumVisit.js';

export interface MuseumPdfEtichette {
  pagina: string; museo: string; nOpere: string; conSale: string; mappa: string;
  ancheCollezione: string; nessunaSala: string; guardaAnche: string; curiosita: string;
  soloCollezione: string; suEtichetta: string;
}

export interface MuseumPdfProps {
  visit: MuseumVisit;
  opere: Record<number, ArtworkGuide>;
  mappe?: MuseumMap[];
  etichette: MuseumPdfEtichette;
  /** Data URL delle piante, stesso indice di `mappe`; assente = niente immagine per quella pianta. */
  immaginiMappe?: Record<number, string>;
  /** Data URL della foto di ogni tappa (`tappa.foto`), stesso indice grezzo di `opere`. */
  immaginiTappe?: Record<number, string>;
  /** Larghezza e altezza di ogni foto di tappa: servono a mostrarla INTERA (vedi FotoIntera). */
  misureTappe?: Record<number, MisureFoto>;
  /** Data URL della foto del museo (venue_photo), per la copertina; assente = copertina senza foto. */
  copertina?: string;
}

// LA COPERTINA E' UNA PAGINA (20/09/2026, visto sul PDF del Duomo di Milano:
// foto a pagina 1, titolo da solo a pagina 2). Con `height: '100%'` foto e
// titolo misuravano ESATTAMENTE il foglio e il motore, al primo arrotondamento,
// spingeva il secondo alla pagina dopo. Misure esplicite, un punto sotto il
// foglio A4 (595.28 × 841.89).
const COPERTINA_L = 595.28;
const COPERTINA_H = 840;
const Copertina: React.FC<{ titolo: string; foto?: string }> = ({ titolo, foto }) => {
  const dim = titolo.length > 44 ? 26 : titolo.length > 26 ? 30 : 36;
  return (
    <Page size="A4" style={{ backgroundColor: PDF_C.navy, padding: 0 }} bookmark={{ title: titolo }}>
      {foto ? <Image src={foto} style={{ position: 'absolute', left: 0, top: 0, width: COPERTINA_L, height: COPERTINA_H, objectFit: 'cover', opacity: 0.32 }} /> : null}
      <View style={{ position: 'absolute', left: 0, top: 0, width: COPERTINA_L, height: COPERTINA_H, paddingTop: 30 * 2.835, paddingHorizontal: 18 * 2.835, paddingBottom: 16 * 2.835, justifyContent: 'space-between' }}>
        <View>
          <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: dim, color: PDF_C.bianco, lineHeight: 1.1, marginBottom: 14 }}>{titolo}</Text>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', borderTopWidth: 0.8, borderTopColor: PDF_C.oro, paddingTop: 10 }}>
          <View>
            <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 16, color: PDF_C.bianco }}>WIP</Text>
            <Text style={{ fontFamily: 'Helvetica', fontSize: 8, color: '#c9d3ea', letterSpacing: 1 }}>WORLD IN POCKET</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 12, color: PDF_C.oro, letterSpacing: 1 }}>wip.guide</Text>
            <Text style={{ fontFamily: 'Helvetica', fontSize: 8, color: '#c9d3ea' }}>{new Date().getFullYear()}</Text>
          </View>
        </View>
      </View>
    </Page>
  );
};

const Tappa: React.FC<{ tappa: any; numero: number; g?: ArtworkGuide; et: MuseumPdfEtichette; foto?: string; misure?: MisureFoto; banda?: string }> = ({ tappa, numero, g, et, foto, misure, banda }) => {
  // LA FOTO STA A FIANCO DEL TESTO, INTERA E PICCOLA, come in un libro
  // (20/09/2026, committente: «le foto non devono essere a pagina intera,
  // solo la copertina»; «se sono orizzontali le metti orizzontali ma ridotte,
  // se sono verticali in verticale e il testo accanto — tutto armonico»).
  // La regola e il perche' del TESTO CHE SCORRE (niente blocco indivisibile:
  // mezza pagina bianca e titoli sovrapposti nel PDF del Duomo) stanno in
  // base.tsx › FotoConTesto.
  // La fascia della sala sta DENTRO il blocco unito (fascia + titolo + foto):
  // come elemento a se' restava sola in fondo alla pagina, staccata dall'opera
  // (collaudo 20/09/2026; `minPresenceAhead` in questa versione di react-pdf
  // non tratteneva nulla).
  const intestazione = (
    <View>
      {banda ? (
        <View style={S.bandaGiorno}>
          <Text style={S.bandaGiornoTitolo}>{banda}</Text>
        </View>
      ) : null}
      <Text style={[S.h3, { marginTop: 0, marginBottom: 1 }]}>
        {tappa.soloCollezione ? '' : `${numero}. `}{pulisci(tappa.nome)}{tappa.preferita ? ' *' : ''}
      </Text>
      {tappa.nomeFonte ? <Text style={[S.piccolo, S.corsivo]}>{pulisci(tappa.nomeFonte)}</Text> : null}
      {tappa.nomeOriginale ? <Text style={S.piccolo}>{et.suEtichetta}: {pulisci(tappa.nomeOriginale)}</Text> : null}
      {(tappa.autore || tappa.anno) ? (
        <Text style={[S.sans, S.piccolo, { marginTop: 1 }]}>{[tappa.autore, tappa.anno].filter(Boolean).map(pulisci).join(' · ')}</Text>
      ) : null}
      {(tappa.dove || tappa.puntoPreciso) ? (
        <Text style={[S.sansBold, { fontSize: 8.5, color: PDF_C.navy, marginTop: 1 }]}>{[tappa.dove, tappa.puntoPreciso].filter(Boolean).map(pulisci).join(' · ')}</Text>
      ) : null}
      {tappa.soloCollezione ? <Text style={[S.sans, S.piccolo, { marginTop: 1 }]}>{et.soloCollezione}</Text> : null}
    </View>
  );
  // Il testo dell'opera: la riga base della tappa e il racconto della scheda, in un flusso solo.
  const testo = [tappa.perche, g?.testo].filter(Boolean).map((x: any) => pulisci(x)).join('\n');
  return (
    <View style={{ marginBottom: 8 }}>
      <FotoConTesto intestazione={intestazione} foto={foto} misure={misure} testo={testo} stileTesto={[S.paragrafo, { marginBottom: 0 }]} />
      {g?.daGuardare?.length ? (
        <View style={[S.riquadro, { marginTop: 4 }]} wrap={false}>
          <Text style={S.riquadroTitolo}>{et.guardaAnche}</Text>
          {g.daGuardare.map((d, k) => <Text key={k} style={{ fontSize: 8.5, marginTop: k ? 1.5 : 0 }}>· {pulisci(d)}</Text>)}
        </View>
      ) : null}
      {g?.curiosita ? (
        <View style={[S.riquadroOro, { marginTop: 4 }]} wrap={false}>
          <Text style={S.riquadroTitolo}>{et.curiosita}</Text>
          <Text style={{ fontSize: 8.5 }}>{pulisci(g.curiosita)}</Text>
        </View>
      ) : null}
    </View>
  );
};

const PiantaConLegenda: React.FC<{ mappa: MuseumMap; immagine?: string; et: MuseumPdfEtichette; indiceLabel: string }> = ({ mappa, immagine, et, indiceLabel }) => {
  if (!immagine) return null;
  return (
    <View style={{ marginBottom: 10 }} wrap={false}>
      <Text style={[S.occhiello, { marginBottom: 3 }]}>{et.mappa}{indiceLabel}</Text>
      <View style={{ borderWidth: 1, borderColor: PDF_C.navy, borderRadius: 6, overflow: 'hidden' }}>
        <Image src={immagine} style={{ width: '100%' }} />
      </View>
      {mappa.pins?.length ? (
        <Text style={[S.piccolo, { marginTop: 3 }]}>
          {mappa.pins.map((p) => pulisci(p.sala)).filter(Boolean).join(' · ')}
        </Text>
      ) : null}
    </View>
  );
};

export default function MuseumGuidaPdf({ visit, opere, mappe, etichette: et, immaginiMappe, immaginiTappe, misureTappe, copertina }: MuseumPdfProps) {
  const titolo = pulisci(visit.venue?.name) || 'WIP';
  const tappe = visit.guide?.tappe || [];
  const conSala = tappe.filter((x: any) => String(x.dove || '').trim()).length;

  return (
    <Document title={titolo} author="WIP · World in Pocket · wip.guide" creator="wip.guide" producer="wip.guide">
      <Copertina titolo={titolo} foto={copertina} />
      <Page size="A4" style={S.pagina} bookmark={{ title: titolo }}>
        <PiedePagina titolo={titolo} etichettaPagina={et.pagina} />
        <Text style={S.h1}>{titolo}</Text>
        <Text style={[S.occhiello, { marginBottom: 6 }]}>
          wip.guide · {et.museo} · {et.nOpere.replace('{n}', String(tappe.length))}
          {conSala > 0 ? ` · ${et.conSale}` : ''}
        </Text>
        {visit.guide?.intro ? <Text style={[S.piccolo, S.corsivo, { marginBottom: 6 }]}>{pulisci(visit.guide.intro)}</Text> : null}
        {visit.guide?.consiglio ? (
          <View style={[S.riquadroOro, { marginBottom: 8 }]} wrap={false}>
            <Text style={{ fontSize: 9 }}>{pulisci(visit.guide.consiglio)}</Text>
          </View>
        ) : null}
        <View style={S.separatore} />

        {(mappe || []).map((m) => (
          <PiantaConLegenda
            key={m.indice}
            mappa={m}
            immagine={immaginiMappe?.[m.indice]}
            et={et}
            indiceLabel={m.titolo ? ` · ${pulisci(m.titolo)}` : ((mappe || []).length > 1 ? ` ${m.indice}` : '')}
          />
        ))}

        {visit.guide?.saleDichiarate === false ? <Text style={[S.tenue, { fontSize: 8, fontStyle: 'italic', marginBottom: 6 }]}>{et.nessunaSala}</Text> : null}

        {tappe.map((tappa: any, i: number) => {
          const salaQui = tappa.soloCollezione ? '' : String(tappa.dove || '').trim();
          const salaPrima = i === 0 ? null : (tappe[i - 1].soloCollezione ? '' : String(tappe[i - 1].dove || '').trim());
          const apreSala = !!salaQui && salaQui !== salaPrima;
          const primaSenzaSala = !!tappa.soloCollezione && (i === 0 || !tappe[i - 1].soloCollezione);
          const numero = tappe.slice(0, i + 1).filter((x: any) => !x.soloCollezione).length;
          return (
            <React.Fragment key={`${i}-${tappa.nome}`}>
              <Tappa tappa={tappa} numero={numero} g={opere[i]} et={et} foto={immaginiTappe?.[i]} misure={misureTappe?.[i]} banda={apreSala ? pulisci(salaQui) : primaSenzaSala ? et.ancheCollezione : undefined} />
            </React.Fragment>
          );
        })}
      </Page>
    </Document>
  );
}
