/**
 * La Guida Premium come libro: copertina, sommario, introduzione, un capitolo
 * per giorno con le schede dei luoghi che scorrono di pagina in pagina senza
 * salti. Stessi dati della versione online (PremiumGuideContent), stessa
 * palette; le foto arrivano gia' scaricate come data URL (vedi generaPdf).
 */
import React from 'react';
import { Document, Page, Text, View, Image } from '@react-pdf/renderer';
import type { PremiumGuideContent, PremiumGuidePoi } from '../../services/premiumGuideService';
import { PDF_C, pdfStili as S, pulisci, Elenco, stelle, PiedePagina } from './base';

export interface GuidaPdfEtichette {
  guida: string; sommario: string; giorno: string; introduzione: string;
  storia: string; cultura: string; consigliPratici: string; curiosita: string;
  dettaglio: string; consiglioInsider: string; infoUtili: string; orari: string;
  periodoMigliore: string; prezzo: string; telefono: string; sito: string;
  piatti: string; indirizzo: string; comeArrivare: string; pagina: string; stile: string;
}

export interface GuidaPdfProps {
  content: PremiumGuideContent;
  /** poi_id → data URL (o URL http) della foto; 'cover' per la copertina. */
  immagini: Record<string, string>;
  etichette: GuidaPdfEtichette;
}

const Copertina = ({ content, cover, et }: { content: PremiumGuideContent; cover?: string; et: GuidaPdfEtichette }) => {
  const titolo = pulisci(content.guida_titolo) || et.guida;
  const dim = titolo.length > 44 ? 26 : titolo.length > 26 ? 30 : 36;
  return (
    <Page size="A4" style={{ backgroundColor: PDF_C.navy, padding: 0 }} bookmark={{ title: titolo }}>
      {cover ? <Image src={cover} style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.32 }} /> : null}
      <View style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', paddingTop: 30 * 2.835, paddingHorizontal: 18 * 2.835, paddingBottom: 16 * 2.835, justifyContent: 'space-between' }}>
        <View>
          <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: dim, color: PDF_C.bianco, lineHeight: 1.1, marginBottom: 14 }}>{titolo}</Text>
          <View style={{ alignSelf: 'flex-start', backgroundColor: PDF_C.oro, borderRadius: 3, paddingVertical: 4, paddingHorizontal: 12, marginBottom: 18 }}>
            <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 9, color: PDF_C.navy, letterSpacing: 2.5 }}>{pulisci(et.stile).toUpperCase()}</Text>
          </View>
          {content.sottotitolo ? <Text style={{ fontFamily: 'Times-Italic', fontSize: 15, color: '#e6ecf7', lineHeight: 1.35, maxWidth: 400 }}>{pulisci(content.sottotitolo)}</Text> : null}
          {content.dedica ? (
            <View style={{ marginTop: 24, borderLeftWidth: 2, borderLeftColor: PDF_C.oro, paddingLeft: 10 }}>
              <Text style={{ fontFamily: 'Times-Italic', fontSize: 12, color: '#f3e7c3', lineHeight: 1.4 }}>{pulisci(content.dedica)}</Text>
            </View>
          ) : null}
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', borderTopWidth: 0.8, borderTopColor: PDF_C.oro, paddingTop: 10 }}>
          <View>
            <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 16, color: PDF_C.bianco }}>WIP</Text>
            <Text style={{ fontFamily: 'Helvetica', fontSize: 8, color: '#c9d3ea', letterSpacing: 1 }}>WORLD IN POCKET · {et.guida.toUpperCase()}</Text>
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

// NIENTE PAGINE VUOTE (05/09/2026, committente: «le pagine vuote non ci devono
// essere»). Sommario, introduzione e giorni NON sono pagine separate: sono
// sezioni di un unico flusso dopo la copertina, come i capitoli di un libro
// che continuano sulla stessa pagina. I titoli tengono con se' il testo che
// segue (minPresenceAhead), cosi' nessun titolo resta orfano a fondo pagina.
const Sommario = ({ content, et }: { content: PremiumGuideContent; et: GuidaPdfEtichette }) => (
  <View bookmark={{ title: et.sommario }}>
    <Text style={S.occhiello}>{et.guida}</Text>
    <Text style={S.h1}>{et.sommario}</Text>
    <View style={S.separatore} />
    <View style={{ marginBottom: 10 }}>
      <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 11, color: PDF_C.navy, marginBottom: 2 }}>{et.introduzione}</Text>
      {content.citta_intro?.titolo ? <Text style={[S.piccolo, { marginLeft: 12 }]}>{pulisci(content.citta_intro.titolo)}</Text> : null}
    </View>
    {(content.giorni || []).map((g) => (
      <View key={g.giorno} style={{ marginBottom: 9 }} wrap={false}>
        <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 11, color: PDF_C.navy, marginBottom: 2 }}>
          {et.giorno} {g.giorno} · {pulisci(g.titolo_giorno)}
        </Text>
        {g.tema_giorno ? <Text style={[S.piccolo, S.corsivo, { marginLeft: 12, marginBottom: 2 }]}>{pulisci(g.tema_giorno)}</Text> : null}
        {(g.pois || []).map((p, i) => (
          <View key={p.poi_id || i} style={{ flexDirection: 'row', marginLeft: 12, marginBottom: 1.5 }}>
            <Text style={{ width: 16, color: PDF_C.oro, fontFamily: 'Helvetica-Bold', fontSize: 9.5 }}>{i + 1}.</Text>
            <Text style={{ fontSize: 9.5, flex: 1 }}>{pulisci(p.titolo)}</Text>
            <Text style={{ fontSize: 8, color: PDF_C.tenue, marginLeft: 6 }}>{pulisci(p.categoria_pdf)}</Text>
          </View>
        ))}
      </View>
    ))}
    <View style={S.separatore} />
  </View>
);

const Introduzione = ({ content, et }: { content: PremiumGuideContent; et: GuidaPdfEtichette }) => {
  const ci = content.citta_intro;
  return (
    <View bookmark={{ title: et.introduzione }}>
      <View wrap={false}>
        <Text style={S.occhiello}>{et.introduzione}</Text>
        <Text style={S.h1}>{pulisci(content.guida_titolo)}</Text>
      </View>
      {content.sottotitolo ? <Text style={[S.corsivo, { color: PDF_C.arancio, fontSize: 11.5, marginBottom: 8 }]}>{pulisci(content.sottotitolo)}</Text> : null}
      <View style={S.riquadroOro}>
        <Text style={[S.paragrafo, { marginBottom: 0 }]}>{pulisci(content.introduzione)}</Text>
      </View>
      {ci ? (
        <View>
          <Text style={S.h2} minPresenceAhead={60}>{pulisci(ci.titolo)}</Text>
          {ci.storia ? (<View><Text style={S.occhiello} minPresenceAhead={40}>{et.storia}</Text><Text style={S.paragrafo}>{pulisci(ci.storia)}</Text></View>) : null}
          {ci.cultura_tradizioni ? (<View><Text style={S.occhiello} minPresenceAhead={40}>{et.cultura}</Text><Text style={S.paragrafo}>{pulisci(ci.cultura_tradizioni)}</Text></View>) : null}
          {ci.consigli_pratici ? (
            <View style={S.riquadro} wrap={false}>
              <Text style={S.riquadroTitolo}>{et.consigliPratici}</Text>
              <Text style={{ fontSize: 9.5 }}>{pulisci(ci.consigli_pratici)}</Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
};

const RigaInfo = ({ k, v }: { k: string; v?: string }) => (!v ? null : (
  <View style={{ flexDirection: 'row', marginBottom: 2 }}>
    <Text style={{ width: 92, fontFamily: 'Helvetica-Bold', fontSize: 8.5, color: PDF_C.navy }}>{k}</Text>
    <Text style={{ flex: 1, fontSize: 9 }}>{pulisci(v)}</Text>
  </View>
));

const SchedaPoi: React.FC<{ p: PremiumGuidePoi; n: number; foto?: string; et: GuidaPdfEtichette }> = ({ p, n, foto, et }) => {
  const piatti = (p.migliori_piatti || []).map((x) => typeof x === 'string' ? x : [x?.nome, x?.descrizione, x?.prezzo].filter(Boolean).join(' — '));
  const meta = [pulisci(p.categoria_pdf), p.valutazione ? stelle(p.valutazione) : '', pulisci(p.orario_visita)].filter(Boolean).join('   ·   ');
  return (
    <View>
      <View wrap={false} minPresenceAhead={60}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 10 }}>
          <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 11, color: PDF_C.oro, width: 22 }}>{n}.</Text>
          <Text style={[S.h3, { marginTop: 0, flex: 1 }]}>{pulisci(p.titolo)}</Text>
        </View>
        {meta ? <Text style={[S.sans, S.piccolo, { marginLeft: 22, marginBottom: 4, color: PDF_C.arancio }]}>{meta}</Text> : null}
      </View>
      {foto ? <Image src={foto} style={{ width: '100%', maxHeight: 62 * 2.835, objectFit: 'cover', borderRadius: 4, marginBottom: 6 }} /> : null}
      <Text style={S.paragrafo}>{pulisci(p.descrizione_lunga)}</Text>
      {p.curiosita && p.curiosita.length ? (
        <View>
          <Text style={S.occhiello} minPresenceAhead={30}>{et.curiosita}</Text>
          <Elenco voci={p.curiosita} />
        </View>
      ) : null}
      {p.dettaglio_storico_tecnico ? (
        <View>
          <Text style={S.occhiello} minPresenceAhead={30}>{et.dettaglio}</Text>
          <Text style={S.paragrafo}>{pulisci(p.dettaglio_storico_tecnico)}</Text>
        </View>
      ) : null}
      {p.consiglio_insider ? (
        <View style={S.riquadroOro} wrap={false}>
          <Text style={S.riquadroTitolo}>{et.consiglioInsider}</Text>
          <Text style={[S.corsivo, { fontSize: 10 }]}>{pulisci(p.consiglio_insider)}</Text>
        </View>
      ) : null}
      {piatti.length ? (
        <View>
          <Text style={S.occhiello} minPresenceAhead={30}>{et.piatti}</Text>
          <Elenco voci={piatti} stile={{ fontSize: 9.5 }} />
        </View>
      ) : null}
      <View style={S.riquadro} wrap={false}>
        <Text style={S.riquadroTitolo}>{et.infoUtili}</Text>
        <RigaInfo k={et.indirizzo} v={p.indirizzo} />
        <RigaInfo k={et.comeArrivare} v={p.trasporti} />
        <RigaInfo k={et.orari} v={p.info_utili?.orari} />
        <RigaInfo k={et.periodoMigliore} v={p.info_utili?.best_time} />
        <RigaInfo k={et.prezzo} v={p.info_utili?.prezzo} />
        <RigaInfo k={et.telefono} v={p.info_utili?.telefono} />
        <RigaInfo k={et.sito} v={p.info_utili?.sito_web} />
      </View>
    </View>
  );
};

export default function GuidaPremiumPdf({ content, immagini, etichette: et }: GuidaPdfProps) {
  const titolo = pulisci(content.guida_titolo) || et.guida;
  return (
    <Document title={titolo} author="WIP · World in Pocket · wip.guide" subject={pulisci(content.sottotitolo)} creator="wip.guide" producer="wip.guide">
      <Copertina content={content} cover={immagini.cover} et={et} />
      {/* Un solo flusso dopo la copertina: le pagine si riempiono tutte. */}
      <Page size="A4" style={S.pagina}>
        <PiedePagina titolo={titolo} etichettaPagina={et.pagina} />
        <Sommario content={content} et={et} />
        <Introduzione content={content} et={et} />
        {(content.giorni || []).map((g) => (
          <View key={g.giorno} bookmark={{ title: `${et.giorno} ${g.giorno} · ${pulisci(g.titolo_giorno)}` }}>
            {/* La banda del giorno vuole almeno la prima scheda sotto di se'. */}
            <View style={S.bandaGiorno} wrap={false} minPresenceAhead={100}>
              <Text style={S.bandaGiornoTitolo}>{et.giorno} {g.giorno} · {pulisci(g.titolo_giorno)}</Text>
              {g.tema_giorno ? <Text style={S.bandaGiornoTema}>{pulisci(g.tema_giorno)}</Text> : null}
            </View>
            {(g.pois || []).map((p, i) => (
              <SchedaPoi key={p.poi_id || i} p={p} n={i + 1} foto={immagini[p.poi_id]} et={et} />
            ))}
          </View>
        ))}
      </Page>
    </Document>
  );
}
