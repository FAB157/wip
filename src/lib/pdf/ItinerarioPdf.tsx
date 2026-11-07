/**
 * L'itinerario come documento: titolo che apre la pagina, un capitolo per
 * giorno con le tappe che scorrono senza salti, il budget del giorno, i
 * consigli, il totale e in chiusura la mappa del percorso (immagine statica
 * Mapbox con i numeri delle tappe, gia' scaricata da generaPdf).
 */
import React from 'react';
import { Document, Page, Text, View, Image } from '@react-pdf/renderer';
import { PDF_C, pdfStili as S, pulisci, Elenco, PiedePagina } from './base.js';
import { tappeMappa } from './tappeMappa.js';

export interface ItinerarioPdfEtichette {
  pagina: string; giorno: string; giorni: string; giornoSingolo: string; curatoDa: string;
  intro: string; consiglioGuida: string; tempoVisita: string; spostamento: string;
  budgetGiorno: string; totaleGiorno: string; consigli: string; suggerimenti: string;
  precauzioni: string; zoneDaEvitare: string; totaleViaggio: string; mappa: string;
  /** Etichetta della riga dei mezzi pubblici (Transitous) sulle tratte lunghe. */
  mezzi?: string;
  /** Riga del tragitto fra una tappa e la successiva. */
  tratta?: string; aPiedi?: string; inAuto?: string;
}

/**
 * Tragitto verso la tappa successiva: i tempi veri calcolati dall'app (`plan.tratte[giorno][tappa]`,
 * rete stradale) quando ci sono; altrimenti la stima dalle coordinate (linea d'aria ×1,3, 80 m al
 * minuto a piedi), segnata con «~». Niente auto nella stima: non si inventa.
 */
function trattaVersoLaProssima(plan: any, gi: number, i: number, tappe: any[]): { piedi: number; auto: number; km: number; stima: boolean } | null {
  const a = tappe[i], b = tappe[i + 1];
  if (!a || !b) return null;
  if (String(a.tipo || '') === 'trasferimento' || String(b.tipo || '') === 'trasferimento') return null;
  const vera = plan?.tratte?.[gi]?.[i];
  if (vera && !vera.soloMezzi && Number(vera.km) > 0.02) return { piedi: Number(vera.walkMin) || 0, auto: Number(vera.carMin) || 0, km: Number(vera.km), stima: false };
  const xy = (t: any) => { const lat = Number(t?.coordinate?.lat), lon = Number(t?.coordinate?.lng ?? t?.coordinate?.lon); return Number.isFinite(lat) && Number.isFinite(lon) && (lat !== 0 || lon !== 0) ? { lat, lon } : null; };
  const p = xy(a), q = xy(b);
  if (!p || !q) return null;
  const r = Math.PI / 180, x = (q.lon - p.lon) * r * Math.cos(((p.lat + q.lat) / 2) * r), y = (q.lat - p.lat) * r;
  const m = Math.sqrt(x * x + y * y) * 6371000 * 1.3;
  if (m < 40) return null;
  return { piedi: Math.max(1, Math.round(m / 80)), auto: 0, km: m / 1000, stima: true };
}

const RigaTratta = ({ tr, et, rientro }: { tr: { piedi: number; auto: number; km: number; stima: boolean }; et: ItinerarioPdfEtichette; rientro: number }) => {
  const s = tr.stima ? '~' : '';
  const pezzi = [
    tr.piedi > 0 ? `${s}${tr.piedi} min ${et.aPiedi || 'a piedi'}` : '',
    tr.auto > 0 ? `${tr.auto} min ${et.inAuto || 'in auto'}` : '',
    `${s}${tr.km.toFixed(1).replace('.', ',')} km`,
  ].filter(Boolean).join('  ·  ');
  return (
    <Text style={[S.sans, S.piccolo, { marginLeft: rientro, marginTop: 1, marginBottom: 2, color: PDF_C.navy }]}>
      <Text style={S.sansBold}>{et.tratta || 'Per arrivare qui'}: </Text>{pezzi}
    </Text>
  );
};

export interface ItinerarioPdfProps {
  plan: any;
  etichette: ItinerarioPdfEtichette;
  /** Data URL della mappa statica del percorso; assente = nessuna pagina mappa. */
  mappa?: string;
}

const PASTI = ['colazione', 'pranzo', 'cena', 'pausa', 'ristorante', 'spostamento'];

// La tratta e i mezzi stanno PRIMA della tappa che raggiungono (20/10/2026, committente: «la riga "Mezzi pubblici ·
// In alternativa coi mezzi…" deve essere messa prima della tappa — regola per tutti gli itinerari futuri»).
const Tappa: React.FC<{ t: any; et: ItinerarioPdfEtichette; tr?: { piedi: number; auto: number; km: number; stima: boolean } | null }> = ({ t, et, tr }) => {
  const durata = [
    t.tempo_necessario ? `${et.tempoVisita}: ${pulisci(t.tempo_necessario)}` : '',
    t.spostamento_precedente && t.spostamento_precedente !== 'null' ? `${et.spostamento}: ${pulisci(t.spostamento_precedente)}` : '',
  ].filter(Boolean).join('   ·   ');
  const rientro = t.ora ? 34 : 0;
  return (
    <View style={{ marginBottom: 7 }}>
      <View minPresenceAhead={70}>
        {tr ? <RigaTratta tr={tr} et={et} rientro={rientro} /> : null}
        {/* Mezzi pubblici sulla tratta lunga (Transitous, 06/10/2026): una riga, com'è, prima della tappa. */}
        {t.mezzi_precedente ? (
          <Text style={[S.sans, S.piccolo, { marginLeft: rientro, marginBottom: 3, color: PDF_C.navy }]}>
            <Text style={S.sansBold}>{et.mezzi || 'Mezzi'} · </Text>{pulisci(t.mezzi_precedente)}
          </Text>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
          {t.ora ? <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 9.5, color: PDF_C.oro, width: 34 }}>{pulisci(t.ora)}</Text> : null}
          <Text style={[S.h3, { marginTop: 0, marginBottom: 1, flex: 1 }]}>{pulisci(t.titolo_tappa)}</Text>
        </View>
        {durata ? <Text style={[S.sans, S.piccolo, { marginLeft: rientro, marginBottom: 3 }]}>{durata}</Text> : null}
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

/**
 * Legenda sotto la mappa: numero del pin + nome della tappa, gli stessi
 * numeri di tappeMappa() usati per i pin. Due colonne, un'intestazione per
 * giorno quando i giorni sono piu' di uno.
 */
const Legenda = ({ plan, et, nGiorni }: { plan: any; et: ItinerarioPdfEtichette; nGiorni: number }) => {
  const tappe = tappeMappa(plan);
  if (!tappe.length) return null;
  const righe: React.ReactNode[] = [];
  let giornoCorrente = -1;
  for (const t of tappe) {
    if (nGiorni > 1 && t.giorno !== giornoCorrente) {
      giornoCorrente = t.giorno;
      righe.push(
        <Text key={`g${t.giorno}`} style={[S.sansBold, { width: '100%', fontSize: 8.5, color: PDF_C.navy, textTransform: 'uppercase', letterSpacing: 0.8, marginTop: righe.length ? 4 : 0, marginBottom: 2 }]}>
          {et.giorno} {t.giorno}
        </Text>,
      );
    }
    righe.push(
      <View key={t.n} wrap={false} style={{ width: '50%', flexDirection: 'row', alignItems: 'flex-start', paddingRight: 8, marginBottom: 2 }}>
        {/* IL NUMERO NEL PALLINO (09/10/2026, committente: «le tappe hanno il punto blu… ma non è indicato il numero
            per capire che tappa è»). In tutti i PDF d'archivio il pallino usciva VUOTO: il numero era passato come
            numero (non come testo) dentro una scatola centrata col flex, e questo motore non lo disegnava. Ora è
            una stringa, con larghezza e allineamento dichiarati: è lo stesso numero del pin sulla mappa. */}
        <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: PDF_C.navy, marginRight: 5, marginTop: 0.2 }}>
          <Text style={{ width: 14, textAlign: 'center', fontFamily: 'Helvetica-Bold', fontSize: t.n > 9 ? 6.5 : 7.5, lineHeight: 1, color: '#ffffff', marginTop: t.n > 9 ? 3.9 : 3.4 }}>{String(t.n)}</Text>
        </View>
        <Text style={[S.sans, { fontSize: 8.5, flex: 1, lineHeight: 1.25 }]}>{pulisci(t.titolo) || '—'}</Text>
      </View>,
    );
  }
  return <View style={{ marginTop: 8, flexDirection: 'row', flexWrap: 'wrap' }}>{righe}</View>;
};

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
        {giorni.map((g: any, gi: number) => {
          const tema = (g.tappe || []).find((t: any) => !PASTI.includes(String(t.tipo || '').toLowerCase())) || (g.tappe || [])[0];
          return (
            <View key={g.giorno} bookmark={{ title: `${et.giorno} ${g.giorno} · ${pulisci(tema?.titolo_tappa) || ''}` }}>
              <View style={S.bandaGiorno} minPresenceAhead={80}>
                <Text style={S.bandaGiornoTitolo}>{et.giorno} {g.giorno}: {pulisci(tema?.titolo_tappa) || '—'}</Text>
              </View>
              {(g.tappe || []).map((t: any, i: number) => {
                // La tratta che ARRIVA a questa tappa (dalla precedente), stampata sopra di lei.
                const tr = i > 0 ? trattaVersoLaProssima(plan, gi, i - 1, g.tappe || []) : null;
                return (
                  <View key={t.id_tappa || i}>
                    <Tappa t={t} et={et} tr={tr} />
                  </View>
                );
              })}
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
          {/* Mappa ridotta all'80% e centrata: con 30-40 tappe la legenda sotto deve stare sulla stessa pagina. */}
          <View style={{ borderWidth: 1, borderColor: PDF_C.navy, borderRadius: 6, overflow: 'hidden', width: '80%', alignSelf: 'center' }}>
            <Image src={mappa} style={{ width: '100%' }} />
          </View>
          <Text style={[S.piccolo, { marginTop: 4 }]}>© Mapbox © OpenStreetMap contributors</Text>
          <Legenda plan={plan} et={et} nGiorni={nGiorni} />
        </Page>
      ) : null}
    </Document>
  );
}
