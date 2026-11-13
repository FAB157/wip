/**
 * IL REPORT «QUANDO VISITARE» IN PDF (24/09/2026). Stessa veste degli altri
 * documenti (base.tsx): copertina navy senza foto (il clima non ha una foto
 * del luogo), tabella dei 12 mesi, sezioni del report annuale o del mese,
 * fonti in coda, piede «wip.guide» su ogni pagina. Niente immagini: nessun
 * rischio di foto sbagliate, e il documento resta leggero.
 */
import React from 'react';
import { Document, Page, Text, View } from '@react-pdf/renderer';
import { PDF_C, pdfStili as S, pulisci, PiedePagina } from './base.js';
import type { DatiClima, ReportClima, ReportMese } from '../climaIndex.js';

export interface ClimaPdfEtichette {
  pagina: string; titolo: string; numeri: string; mese: string; temp: string; pioggia: string; sole: string; umidita: string; voto: string;
  migliore: string; evitare: string; panoramica: string; web: string; esperienze: string; mesi: string; portare: string; orari: string;
  avvertenze: string; statistiche: string; conclusioni: string; fonti: string; aspettarsi: string; eventi: string; alternativa: string;
  mare: string; tendenza: string; generato: string;
}

export interface ClimaPdfProps {
  citta: string;
  dati: DatiClima;
  report: ReportClima | null;
  mese: ReportMese | null;
  nomiMesi: string[];
  etichette: ClimaPdfEtichette;
}

const COPERTINA_L = 595.28;
const COPERTINA_H = 840;

const Sez: React.FC<{ titolo: string; children: React.ReactNode }> = ({ titolo, children }) => (
  <View style={{ marginTop: 12 }}>
    <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 11.5, color: PDF_C.navy, marginBottom: 4 }}>{pulisci(titolo)}</Text>
    {children}
  </View>
);
const P: React.FC<{ children: string }> = ({ children }) => (
  <Text style={{ fontFamily: 'Times-Roman', fontSize: 10.5, lineHeight: 1.45, color: PDF_C.testo }}>{pulisci(children)}</Text>
);
const Voci: React.FC<{ voci: { testo: string; fonte: string }[] }> = ({ voci }) => (
  <View>
    {voci.map((v, i) => (
      <Text key={i} style={{ fontFamily: 'Times-Roman', fontSize: 10.5, lineHeight: 1.4, color: PDF_C.testo, marginBottom: 2 }}>
        • {pulisci(v.testo)}{v.fonte ? <Text style={{ fontSize: 8, color: PDF_C.tenue }}> ({pulisci(v.fonte)})</Text> : null}
      </Text>
    ))}
  </View>
);

const ClimaPdf: React.FC<ClimaPdfProps> = ({ citta, dati, report, mese, nomiMesi, etichette: E }) => {
  const periodo = (p: { da: number; a: number }) => (p.da === p.a ? nomiMesi[p.da - 1] : `${nomiMesi[p.da - 1]}–${nomiMesi[p.a - 1]}`);
  const titolo = mese ? `${citta} — ${nomiMesi[mese.m - 1]}` : `${citta}`;
  const cella = { fontFamily: 'Helvetica', fontSize: 8.5, color: PDF_C.testo, paddingVertical: 2.5 } as const;
  const testa = { ...cella, fontFamily: 'Helvetica-Bold', color: PDF_C.tenue, fontSize: 7.5 } as const;
  const larghezze = [70, 70, 60, 50, 55, 60];
  return (
    <Document title={pulisci(`${E.titolo} — ${titolo}`)} author="WIP · World in Pocket">
      <Page size="A4" style={{ backgroundColor: PDF_C.navy, padding: 0 }} bookmark={{ title: pulisci(titolo) }}>
        <View style={{ position: 'absolute', left: 0, top: 0, width: COPERTINA_L, height: COPERTINA_H, paddingTop: 30 * 2.835, paddingHorizontal: 18 * 2.835, paddingBottom: 16 * 2.835, justifyContent: 'space-between' }}>
          <View>
            <Text style={{ fontFamily: 'Helvetica', fontSize: 11, color: PDF_C.oro, letterSpacing: 2, marginBottom: 10 }}>{pulisci(E.titolo.toUpperCase())}</Text>
            <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: titolo.length > 30 ? 28 : 36, color: PDF_C.bianco, lineHeight: 1.1, marginBottom: 16 }}>{pulisci(titolo)}</Text>
            <Text style={{ fontFamily: 'Helvetica', fontSize: 12, color: '#c9d3ea' }}>{pulisci(`${E.migliore}: ${dati.migliori.map(periodo).join(', ') || '—'}`)}</Text>
            {dati.peggiori.length > 0 && <Text style={{ fontFamily: 'Helvetica', fontSize: 12, color: '#c9d3ea', marginTop: 4 }}>{pulisci(`${E.evitare}: ${dati.peggiori.map(periodo).join(', ')}`)}</Text>}
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

      <Page size="A4" style={S.pagina}>
        <Sez titolo={`${E.numeri} · ${dati.attribuzione}`}>
          <View style={{ flexDirection: 'row', borderBottomWidth: 0.8, borderBottomColor: PDF_C.navy }}>
            {[E.mese, E.temp, E.pioggia, E.sole, E.umidita, E.voto].map((t, i) => <Text key={i} style={{ ...testa, width: larghezze[i], textAlign: i ? 'right' : 'left' }}>{pulisci(t)}</Text>)}
          </View>
          {dati.mesi.map((x) => (
            <View key={x.m} style={{ flexDirection: 'row', borderBottomWidth: 0.3, borderBottomColor: '#d9d9d9', backgroundColor: mese && mese.m === x.m ? '#fff7e0' : undefined }}>
              <Text style={{ ...cella, width: larghezze[0], fontFamily: 'Helvetica-Bold' }}>{pulisci(nomiMesi[x.m - 1])}</Text>
              <Text style={{ ...cella, width: larghezze[1], textAlign: 'right' }}>{x.tmin ?? '?'}° / {x.tmax ?? '?'}°</Text>
              <Text style={{ ...cella, width: larghezze[2], textAlign: 'right' }}>{x.mm ?? '?'} mm</Text>
              <Text style={{ ...cella, width: larghezze[3], textAlign: 'right' }}>{x.sole ?? '?'}</Text>
              <Text style={{ ...cella, width: larghezze[4], textAlign: 'right' }}>{x.umidita ?? '?'}%</Text>
              <Text style={{ ...cella, width: larghezze[5], textAlign: 'right', fontFamily: 'Helvetica-Bold' }}>{x.punteggio}/100</Text>
            </View>
          ))}
        </Sez>
        {dati.mare && (
          <Sez titolo={`${E.mare} · ${dati.mare.attribuzione}`}>
            <P>{dati.mare.mesi.map((x) => `${nomiMesi[x.m - 1]} ${x.t ?? '?'}°`).join(' · ')}</P>
          </Sez>
        )}
        {dati.tendenza && (
          <Sez titolo={E.tendenza}>
            <P>{dati.tendenza.anni.map((a) => `${a.anno}: ${a.deltaT > 0 ? '+' : ''}${a.deltaT}°${a.deltaMmPct != null ? ` (${a.deltaMmPct > 0 ? '+' : ''}${a.deltaMmPct}% mm)` : ''}`).join(' · ')}</P>
          </Sez>
        )}

        {mese ? (
          <>
            <Sez titolo={E.aspettarsi}><P>{mese.sezioni.cosa_aspettarsi}</P></Sez>
            {mese.sezioni.dal_web.length > 0 && <Sez titolo={E.web}><Voci voci={mese.sezioni.dal_web} /></Sez>}
            {mese.sezioni.esperienze.length > 0 && <Sez titolo={E.esperienze}><Voci voci={mese.sezioni.esperienze} /></Sez>}
            {mese.sezioni.eventi.length > 0 && <Sez titolo={E.eventi}><Voci voci={mese.sezioni.eventi} /></Sez>}
            <Sez titolo={E.portare}><P>{mese.sezioni.cosa_portare}</P></Sez>
            <Sez titolo={E.orari}><P>{mese.sezioni.orari_migliori}</P></Sez>
            <Sez titolo={E.alternativa}><P>{mese.sezioni.alternativa}</P></Sez>
            <Sez titolo={E.conclusioni}><P>{mese.sezioni.conclusioni}</P></Sez>
          </>
        ) : report ? (
          <>
            <Sez titolo={E.panoramica}><P>{report.sezioni.panoramica}</P></Sez>
            <Sez titolo={E.migliore}><P>{report.sezioni.periodo_migliore}</P></Sez>
            {report.sezioni.statistiche.length > 0 && <Sez titolo={E.statistiche}><Voci voci={report.sezioni.statistiche.map((s) => ({ testo: `${s.voce}: ${s.valore}`, fonte: '' }))} /></Sez>}
            {report.sezioni.dal_web.length > 0 && <Sez titolo={E.web}><Voci voci={report.sezioni.dal_web} /></Sez>}
            {report.sezioni.esperienze.length > 0 && <Sez titolo={E.esperienze}><Voci voci={report.sezioni.esperienze} /></Sez>}
            {report.sezioni.mese_per_mese.length > 0 && <Sez titolo={E.mesi}><Voci voci={report.sezioni.mese_per_mese.map((x) => ({ testo: `${nomiMesi[x.m - 1]}: ${x.testo}`, fonte: '' }))} /></Sez>}
            <Sez titolo={E.portare}><P>{report.sezioni.cosa_portare}</P></Sez>
            <Sez titolo={E.orari}><P>{report.sezioni.orari_migliori}</P></Sez>
            <Sez titolo={E.avvertenze}><P>{report.sezioni.avvertenze}</P></Sez>
            {report.sezioni.conclusioni ? <Sez titolo={E.conclusioni}><P>{report.sezioni.conclusioni}</P></Sez> : null}
          </>
        ) : null}
        {(() => { const f = mese?.fontiWeb || report?.fontiWeb || []; return f.length ? (
          <Sez titolo={E.fonti}>
            {f.map((x) => <Text key={x.url} style={{ fontFamily: 'Helvetica', fontSize: 7.5, color: PDF_C.tenue, marginBottom: 1 }}>{pulisci(`${x.host} · ${x.url}`)}</Text>)}
          </Sez>
        ) : null; })()}
        <Text style={{ fontFamily: 'Helvetica', fontSize: 7.5, color: PDF_C.tenue, marginTop: 12 }}>{pulisci(`${E.generato} ${new Date().toLocaleDateString()}`)}</Text>
        <PiedePagina titolo={pulisci(`${E.titolo} — ${titolo}`)} />
      </Page>
    </Document>
  );
};

export default ClimaPdf;
