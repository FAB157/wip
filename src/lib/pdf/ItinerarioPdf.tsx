/**
 * L'itinerario come documento: titolo che apre la pagina, un capitolo per
 * giorno con le tappe che scorrono senza salti, il budget del giorno, i
 * consigli, il totale e in chiusura la mappa del percorso (immagine statica
 * Mapbox con i numeri delle tappe, gia' scaricata da generaPdf).
 */
import React from 'react';
import { Document, Page, Text, View, Image } from '@react-pdf/renderer';
import { PDF_C, pdfStili as S, pulisci, Elenco, PiedePagina } from './base.js';

export interface ItinerarioPdfEtichette {
  pagina: string; giorno: string; giorni: string; giornoSingolo: string; curatoDa: string;
  intro: string; consiglioGuida: string; tempoVisita: string; spostamento: string;
  budgetGiorno: string; totaleGiorno: string; consigli: string; suggerimenti: string;
  precauzioni: string; zoneDaEvitare: string; totaleViaggio: string; mappa: string;
}

export interface ItinerarioPdfProps {
  plan: any;
  etichette: ItinerarioPdfEtichette;
  /** Data URL della mappa statica del percorso; assente = nessuna pagina mappa. */
  mappa?: string;
}

const PASTI = ['colazione', 'pranzo', 'cena', 'pausa', 'ristorante', 'spostamento'];

const Tappa: React.FC<{ t: any; et: ItinerarioPdfEtichette }> = ({ t, et }) => {
  const durata = [
    t.tempo_necessario ? `${et.tempoVisita}: ${pulisci(t.tempo_necessario)}` : '',
    t.spostamento_precedente && t.spostamento_precedente !== 'null' ? `${et.spostamento}: ${pulisci(t.spostamento_precedente)}` : '',
  ].filter(Boolean).join('   ·   ');
  return (
    <View style={{ marginBottom: 7 }}>
      <View minPresenceAhead={70}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
          {t.ora ? <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 9.5, color: PDF_C.oro, width: 34 }}>{pulisci(t.ora)}</Text> : null}
          <Text style={[S.h3, { marginTop: 0, marginBottom: 1, flex: 1 }]}>{pulisci(t.titolo_tappa)}</Text>
        </View>
        {durata ? <Text style={[S.sans, S.piccolo, { marginLeft: t.ora ? 34 : 0, marginBottom: 3 }]}>{durata}</Text> : null}
      </View>
      {t.attivita ? <Text style={[S.paragrafo, { marginLeft: t.ora ? 34 : 0, marginBottom: 3 }]}>{pulisci(t.attivita)}</Text> : null}
      {t.consiglio_guida ? (
        <View style={[S.riquadroOro, { marginLeft: t.ora ? 34 : 0, marginTop: 2, marginBottom: 4 }]}>
          <Text style={{ fontSize: 9.5 }}><Text style={S.sansBold}>{et.consiglioGuida}: </Text><Text style={S.corsivo}>{pulisci(t.consiglio_guida)}</Text></Text>
        </View>
      ) : null}
    </View>
  );
};

const Budget = ({ b, et }: { b: any; et: ItinerarioPdfEtichette }) => {
  const voci = (['attrazioni', 'trasporti', 'colazione', 'pranzo', 'cena'] as const).filter((v) => b[v]);
  if (!voci.length && !b.totale_giorno) return null;
  return (
    <View style={[S.riquadro, { paddingVertical: 4 }]} wrap={false}>
      <Text style={S.riquadroTitolo}>{et.budgetGiorno}</Text>
      {voci.map((v) => {
        const r = b[v];
        return (
          <View key={v} style={S.tabellaRiga}>
            <Text style={[S.tabellaCella, S.sansBold, { width: 70, color: PDF_C.navy, textTransform: 'capitalize' }]}>{v}</Text>
            <Text style={[S.tabellaCella, { flex: 1 }]}>{pulisci(typeof r === 'string' ? r : r?.dettaglio)}</Text>
            <Text style={[S.tabellaCella, S.sansBold, { width: 50, textAlign: 'right' }]}>{pulisci(typeof r === 'string' ? '' : r?.stima_pp)}</Text>
          </View>
        );
      })}
      {b.totale_giorno ? (
        <View style={[S.tabellaRiga, { borderBottomWidth: 0, marginTop: 2 }]}>
          <Text style={[S.tabellaCella, S.sansBold, { flex: 1, color: PDF_C.navy }]}>{et.totaleGiorno}</Text>
          <Text style={[S.tabellaCella, S.sansBold, { width: 50, textAlign: 'right', color: PDF_C.navy }]}>{pulisci(b.totale_giorno)}</Text>
        </View>
      ) : null}
    </View>
  );
};

const Sezione = ({ titolo, voci, colore }: { titolo: string; voci?: string[]; colore?: string }) => (!voci || !voci.length ? null : (
  // Elenchi corti: tutto insieme, mai il titolo orfano a fondo pagina.
  <View style={{ marginBottom: 6 }} wrap={voci.length > 8}>
    <Text style={[S.h3, { color: colore || PDF_C.navy, borderBottomWidth: 0.6, borderBottomColor: colore || PDF_C.oro, paddingBottom: 2, marginBottom: 4 }]} minPresenceAhead={60}>{titolo}</Text>
    <Elenco voci={voci} />
  </View>
));

export default function ItinerarioPdf({ plan, etichette: et, mappa }: ItinerarioPdfProps) {
  const titolo = pulisci(plan?.titolo) || 'WIP';
  const giorni: any[] = Array.isArray(plan?.giorni) ? plan.giorni : [];
  const nGiorni = giorni.length;
  const info = plan?.info_viaggio || {};
  return (
    <Document title={titolo} author="WIP · World in Pocket · wip.guide" creator="wip.guide" producer="wip.guide">
      <Page size="A4" style={S.pagina} bookmark={{ title: titolo }}>
        <PiedePagina titolo={titolo} etichettaPagina={et.pagina} />
        <Text style={S.h1}>{titolo}</Text>
        <Text style={[S.occhiello, { marginBottom: 6 }]}>wip.guide · {nGiorni} {nGiorni === 1 ? et.giornoSingolo : et.giorni} {et.curatoDa}</Text>
        <Text style={[S.piccolo, S.corsivo, { marginBottom: 6 }]}>{et.intro}</Text>
        <View style={S.separatore} />
        {giorni.map((g: any) => {
          const tema = (g.tappe || []).find((t: any) => !PASTI.includes(String(t.tipo || '').toLowerCase())) || (g.tappe || [])[0];
          return (
            <View key={g.giorno} bookmark={{ title: `${et.giorno} ${g.giorno} · ${pulisci(tema?.titolo_tappa) || ''}` }}>
              <View style={S.bandaGiorno} minPresenceAhead={80}>
                <Text style={S.bandaGiornoTitolo}>{et.giorno} {g.giorno}: {pulisci(tema?.titolo_tappa) || '—'}</Text>
              </View>
              {(g.tappe || []).map((t: any, i: number) => <Tappa key={t.id_tappa || i} t={t} et={et} />)}
              {g.tabella_budget ? <Budget b={g.tabella_budget} et={et} /> : null}
            </View>
          );
        })}
        {(info.raccomandazioni?.length || info.suggerimenti?.length || info.precauzioni?.length || info.zone_da_evitare?.length) ? (
          <View style={{ marginTop: 8 }}>
            <Sezione titolo={et.consigli} voci={info.raccomandazioni} />
            <Sezione titolo={et.suggerimenti} voci={info.suggerimenti} />
            <Sezione titolo={et.precauzioni} voci={info.precauzioni} colore={PDF_C.rosso} />
            <Sezione titolo={et.zoneDaEvitare} voci={info.zone_da_evitare} colore={PDF_C.ambra} />
          </View>
        ) : null}
        {plan?.totale_viaggio ? (
          <View style={{ marginTop: 8, borderWidth: 1, borderColor: PDF_C.navy, borderLeftWidth: 4, borderLeftColor: PDF_C.oro, borderRadius: 4, backgroundColor: PDF_C.fondo, paddingVertical: 7, paddingHorizontal: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }} wrap={false}>
            <Text style={[S.sansBold, { fontSize: 9.5, color: PDF_C.navy, letterSpacing: 1, textTransform: 'uppercase' }]}>{et.totaleViaggio}</Text>
            <Text style={[S.sansBold, { fontSize: 14, color: PDF_C.navy }]}>{pulisci(plan.totale_viaggio)}</Text>
          </View>
        ) : null}
      </Page>
      {mappa ? (
        <Page size="A4" style={S.pagina} bookmark={{ title: et.mappa }}>
          <PiedePagina titolo={titolo} etichettaPagina={et.pagina} />
          <Text style={S.occhiello}>{et.mappa}</Text>
          <Text style={[S.h2, { marginTop: 0 }]}>{titolo}</Text>
          <View style={{ borderWidth: 1, borderColor: PDF_C.navy, borderRadius: 6, overflow: 'hidden' }}>
            <Image src={mappa} style={{ width: '100%' }} />
          </View>
          <Text style={[S.piccolo, { marginTop: 6 }]}>© Mapbox © OpenStreetMap contributors</Text>
        </Page>
      ) : null}
    </Document>
  );
}
