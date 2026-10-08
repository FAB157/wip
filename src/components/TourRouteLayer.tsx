/**
 * DIECI TAPPE — la mappa che cambia mestiere.
 *
 * Non una schermata nuova: la stessa mappa, con addosso il percorso. Durante
 * il giro la mappa E` la funzione, e portare l'utente altrove gli farebbe
 * perdere il contesto proprio mentre cammina.
 *
 * Il percorso e` a puntini e non una linea piena: una linea piena su una mappa
 * cittadina si confonde con le strade, i puntini no. E ogni tappa porta il suo
 * NUMERO, perche' la domanda che ci si fa camminando e` "a che punto sono",
 * non "dove sono".
 *
 * DUE MOMENTI, UN SOLO DISEGNO. Prima del giro c'e` la BOZZA: le tappe scelte
 * dal radar o dalla mappa, col percorso d'anteprima che si rifa` a ogni
 * modifica. Poi c'e` il GIRO. In entrambi ogni tappa porta una X: toglierla
 * dalla bozza cambia l'anteprima, toglierla dal giro lo ricalcola da dove si
 * e`. Stesso gesto, stesso posto — la gente impara una cosa sola.
 */
import { Polyline, Marker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { useEffect, useState } from 'react';
import { tourService, metri as metriFra, type VistaGiro, type BozzaGiro, type TappaGiro } from '../services/tourService';
import { getTranslation, linguaCorrente, type Language } from '../lib/i18n';

/**
 * La lingua della UI (App.tsx la scrive in wip_language): il layer non riceve
 * props. Al primo avvio, senza scelta salvata, linguaCorrente() rileva quella
 * di sistema — prima qui si ripiegava su IT per chiunque nel mondo.
 */
function linguaUi(): Language {
  return linguaCorrente();
}
const tr = (k: string) => getTranslation(k, linguaUi());

const BLU = '#1e3a8a';
const FATTA = '#94a3b8';
const ROSSO = '#dc2626';

type StatoPin = 'fatta' | 'corrente' | 'da_fare' | 'fuori_tempo';

/**
 * Pin numerato: fatto (grigio, spuntato), corrente (blu pieno), da fare (bianco).
 * `conX` aggiunge il bottone rosso per togliere la tappa.
 * `sopraIlPin` alza il cerchio sulla testa del pin POI che sta sotto (34x42,
 * ancorato alla punta): in bozza i pin del radar sono visibili e il numero
 * deve coprire la testa, non la punta, altrimenti si legge male.
 */
function iconaTappa(numero: number, stato: StatoPin, opz: { conX: boolean; sopraIlPin: boolean; titoloX: string }): L.DivIcon {
  // "Fuori tempo": scelta ma non ci sta nel tempo che l'utente ha detto di
  // avere. Resta sulla mappa, spenta e tratteggiata: si vede cosa si perde.
  const fuori = stato === 'fuori_tempo';
  const sfondo = stato === 'corrente' ? BLU : stato === 'fatta' ? FATTA : fuori ? '#f1f5f9' : '#ffffff';
  const testo = stato === 'da_fare' ? BLU : fuori ? FATTA : '#ffffff';
  const bordo = stato === 'da_fare' ? BLU : fuori ? FATTA : sfondo;
  const stileBordo = fuori ? 'dashed' : 'solid';
  const contenuto = stato === 'fatta' ? '✓' : String(numero);
  // La tappa corrente e` piu` grande: a colpo d'occhio si vede dove si sta
  // andando senza dover leggere i numeri.
  const lato = stato === 'corrente' ? 34 : 26;
  // La X e` fuori dal cerchio, in alto a destra, e abbastanza grande da
  // prenderla col pollice camminando: 22 px, non 14.
  const x = opz.conX ? `<div class="wip-tappa-x" title="${opz.titoloX}" style="
      position:absolute;top:-9px;right:-9px;width:22px;height:22px;border-radius:50%;
      background:${ROSSO};border:2px solid #fff;color:#fff;
      display:flex;align-items:center;justify-content:center;
      font-weight:800;font-size:14px;line-height:1;
      font-family:system-ui,-apple-system,sans-serif;
      box-shadow:0 1px 4px rgba(0,0,0,.35);cursor:pointer;
    ">×</div>` : '';
  return L.divIcon({
    className: 'wip-tappa-giro',
    html: `<div style="position:relative;width:${lato}px;height:${lato}px;">
      <div style="
        width:${lato}px;height:${lato}px;border-radius:50%;
        background:${sfondo};border:2.5px ${stileBordo} ${bordo};color:${testo};
        display:flex;align-items:center;justify-content:center;
        font-weight:800;font-size:${stato === 'corrente' ? 15 : 12}px;
        font-family:system-ui,-apple-system,sans-serif;
        box-shadow:0 2px 8px rgba(0,0,0,.3);
      ">${contenuto}</div>${x}</div>`,
    iconSize: [lato, lato],
    iconAnchor: [lato / 2, opz.sopraIlPin ? lato / 2 + 26 : lato / 2],
  });
}

/**
 * Il puntino "+" dei posti lungo la strada (bozza): piccolo, verde, non
 * compete con le tappe numerate. Un tocco lo aggiunge al giro.
 */
let iconaLungoStradaCache: { lingua: string; icona: L.DivIcon } | null = null;
function iconaLungoStrada(): L.DivIcon {
  const lingua = linguaUi();
  if (iconaLungoStradaCache?.lingua === lingua) return iconaLungoStradaCache.icona;
  const icona = L.divIcon({
    className: 'wip-lungo-strada',
    html: `<div title="${tr('tour_aggiungi').replace(/"/g, '&quot;')}" style="
      width:20px;height:20px;border-radius:50%;
      background:#ffffff;border:2px solid #059669;color:#059669;
      display:flex;align-items:center;justify-content:center;
      font-weight:800;font-size:14px;line-height:1;
      font-family:system-ui,-apple-system,sans-serif;
      box-shadow:0 1px 4px rgba(0,0,0,.3);cursor:pointer;
    ">+</div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
  iconaLungoStradaCache = { lingua, icona };
  return icona;
}

/**
 * LE FRECCE DI DIREZIONE (28/08/2026).
 *
 * I puntini blu dicono «di qua si passa», non «da che parte si va»: su una
 * strada che il giro percorre due volte, o a un bivio, il tracciato da solo
 * non basta. Le frecce si mettono SOLO sul percorso vero (mai sulla linea
 * d'aria di ripiego, che una direzione non ce l'ha) e ruotano INSIEME alla
 * mappa: indicano un verso geografico, quindi — a differenza dei pin, che
 * compensano con `rotate(calc(-1 * var(--map-rotation)))` per restare dritti
 * — qui la contro-rotazione sarebbe l'errore.
 */
const PASSO_FRECCE_M: Record<'fitto' | 'largo' | 'radissimo', number> = { fitto: 150, largo: 200, radissimo: 350 };
/** Oltre questo numero le frecce diventano coriandoli e costano ridisegni. */
const MAX_FRECCE = 40;

/** Rotta (gradi, 0 = nord) fra due punti [lat, lon]. */
function rotta(a: [number, number], b: [number, number]): number {
  const rad = Math.PI / 180;
  const dLon = (b[1] - a[1]) * rad;
  const y = Math.sin(dLon) * Math.cos(b[0] * rad);
  const x = Math.cos(a[0] * rad) * Math.sin(b[0] * rad) - Math.sin(a[0] * rad) * Math.cos(b[0] * rad) * Math.cos(dLon);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

/**
 * Un punto ogni `passo` metri di percorso, con il verso del tratto su cui
 * cade. La distanza e` quella di `tourService.metri` — l'helper che gia` usa
 * tutto il giro, non una terza formula.
 */
function frecceLungo(punti: [number, number][], passo: number): { pos: [number, number]; angolo: number }[] {
  const out: { pos: [number, number]; angolo: number }[] = [];
  if (!Array.isArray(punti) || punti.length < 2 || passo <= 0) return out;
  let acc = 0;
  for (let i = 1; i < punti.length && out.length < MAX_FRECCE; i++) {
    const a = punti[i - 1], c = punti[i];
    if (!a || !c) continue;
    acc += metriFra({ lat: a[0], lon: a[1] }, { lat: c[0], lon: c[1] });
    if (acc < passo) continue;
    acc = 0;
    out.push({ pos: c, angolo: rotta(a, c) });
  }
  return out;
}

/** Le icone si riusano a scatti di 5°: un giro lungo non deve creare 40 DivIcon nuove a ogni fix. */
const cacheFrecce = new Map<number, L.DivIcon>();
function iconaFreccia(angolo: number): L.DivIcon {
  const a = (Math.round(angolo / 5) * 5) % 360;
  let icona = cacheFrecce.get(a);
  if (!icona) {
    icona = L.divIcon({
      className: 'wip-freccia-giro',
      // Nessuna `var(--map-rotation)` qui: vedi il commento sopra.
      html: `<div style="width:16px;height:16px;transform:rotate(${a}deg);">
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <path d="M8 1.4 L13.6 13.4 L8 10.4 L2.4 13.4 Z"
            fill="${BLU}" stroke="#ffffff" stroke-width="1.5" stroke-linejoin="round"/>
        </svg></div>`,
      iconSize: [16, 16],
      iconAnchor: [8, 8],
    });
    cacheFrecce.set(a, icona);
  }
  return icona;
}

/**
 * Il passo delle frecce secondo lo zoom. Sotto il 14 (livello citta`) niente:
 * a quella scala duecento metri sono pochi pixel e la linea sparirebbe sotto
 * le frecce.
 */
function passoPerZoom(zoom: number): number | null {
  if (zoom >= 17) return PASSO_FRECCE_M.fitto;
  if (zoom >= 15) return PASSO_FRECCE_M.largo;
  if (zoom >= 14) return PASSO_FRECCE_M.radissimo;
  return null;
}

/** Lo zoom corrente. Si aggiorna solo a `zoomend`: niente ridisegni durante il pan. */
function useZoomMappa(): number {
  const map = useMap();
  const [zoom, setZoom] = useState<number>(() => { try { return map.getZoom(); } catch { return 15; } });
  useMapEvents({ zoomend: () => { try { setZoom(map.getZoom()); } catch { /* mappa non pronta */ } } });
  return zoom;
}

/** Le frecce come marker: non interattive, sotto i pin delle tappe. */
function Frecce({ punti, zoom, chiave }: { punti: [number, number][]; zoom: number; chiave: string }) {
  const passo = passoPerZoom(zoom);
  if (passo == null) return null;
  return (
    <>
      {frecceLungo(punti, passo).map((f, i) => (
        <Marker
          key={`${chiave}-freccia-${i}`}
          position={f.pos}
          icon={iconaFreccia(f.angolo)}
          interactive={false}
          keyboard={false}
          zIndexOffset={100}
        />
      ))}
    </>
  );
}

/**
 * LA LINEA DI RIPIEGO SI DICHIARA ANCHE SULLA MAPPA (28/08/2026).
 *
 * Il pannello del radar spiega gia` perche' il percorso non c'e` (Day Pass,
 * posizione, rete), ma il pannello si chiude e si riduce: chi guarda solo la
 * mappa vedeva una retta grigia fra due monumenti e poteva prenderla per un
 * percorso. Una pillola piccola e grigia sul centro della linea, non un
 * allarme: dice cos'e`, non urla che qualcosa e` rotto.
 */
function iconaPillola(testo: string): L.DivIcon {
  return L.divIcon({
    className: 'wip-linea-stimata',
    html: `<div style="
      transform:translate(-50%,-50%);display:inline-block;white-space:nowrap;
      padding:3px 8px;border-radius:999px;background:rgba(255,255,255,.95);
      border:1px solid #cbd5e1;color:#475569;
      font-size:11px;font-weight:700;line-height:1.2;
      font-family:system-ui,-apple-system,sans-serif;
      box-shadow:0 1px 4px rgba(0,0,0,.18);
    ">${testo.replace(/</g, '&lt;')}</div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

/** Il tocco e` sulla X o sul numero? Leaflet da` un solo evento per tutto il marker. */
function toccoSullaX(e: any): boolean {
  const el = e?.originalEvent?.target as HTMLElement | null | undefined;
  return !!el?.closest?.('.wip-tappa-x');
}

/** La posizione per il ricalcolo: GPS se risponde in fretta, altrimenti l'ultima nota. */
function conPosizione(fn: (p?: { lat: number; lon: number }) => void) {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return fn();
  navigator.geolocation.getCurrentPosition(
    (p) => fn({ lat: p.coords.latitude, lon: p.coords.longitude }),
    () => fn(),
    { timeout: 4000, maximumAge: 15000 },
  );
}

export default function TourRouteLayer() {
  const [v, setV] = useState<VistaGiro | null>(tourService.vista());
  const [b, setB] = useState<BozzaGiro>(tourService.bozza());
  useEffect(() => tourService.ascolta(setV), []);
  useEffect(() => tourService.ascoltaBozza(setB), []);
  // Prima di ogni `return`: gli hook non ammettono uscite anticipate.
  const zoom = useZoomMappa();

  const giro = tourService.datiGiro();

  // GUIDA SPENTA: la mappa torna pulita — niente percorso, niente pin
  // numerati, niente "+" verdi. Il giro e la bozza restano interi in memoria
  // (vedi tourService.sospendi) e ricompaiono riaccendendo la guida.
  if (tourService.eSospeso()) return null;

  // ── IL GIRO IN CORSO ─────────────────────────────────────────────────────
  if (giro && v) {
    const punti = giro.geometria as [number, number][];
    const tappeInOrdine = giro.ordine.map((indice, posizione) => ({ t: giro.tappe[indice], indice, posizione }));
    // Dopo un ricalcolo `ordine` contiene solo le tappe da fare: le fatte
    // restano sulla mappa, grigie, perche' "dove sono gia` stato" e` parte
    // del quadro. Le escluse no: non dovevano esserci.
    const fatteFuoriOrdine = giro.tappe.filter((t, i) => !giro.ordine.includes(i) && (t.fatta || t.saltata) && !t.esclusa);
    // Numeri ASSOLUTI, come il cruscotto (03/09/2026): dopo un ricalcolo la
    // posizione in `ordine` riparte da zero e il pin diceva «1» alla tappa 3/4.
    const numeri = tourService.numeriTappe();

    const escludi = (t: TappaGiro) => conPosizione((p) => { tourService.escludi(t.id, p); });

    // AGGIUNGERE A GIRO IN CORSO (28/08/2026). Fino a oggi il "+" verde
    // esisteva solo in BOZZA: una volta partiti si poteva soltanto TOGLIERE
    // una tappa. Ma il giro si cammina, e camminando si incontra: il posto in
    // cui si scopre un luogo e` la strada, non il pannello prima di partire.
    // Stesso puntino, stesso gesto della bozza; il ricalcolo riparte da dove
    // si e` (aggiungiTappaAlVolo), non da capo.
    const vive = giro.tappe.filter((t) => !t.esclusa).length;
    // Il tetto e` del giro (dieci) o del percorso su misura (trenta).
    const aggiungibili = vive >= tourService.tettoTappe() ? [] : tourService.candidatiLungoIlPercorso(80)
      .filter(({ poi }) => Number.isFinite(Number(poi?.lat)) && Number.isFinite(Number(poi?.lon)));

    return (
      <>
        {/* Due tracciati sovrapposti: uno spesso e chiaro sotto per staccare dal
            fondo della mappa, i puntini blu sopra. Con i soli puntini su una
            strada scura il percorso sparisce. */}
        {punti.length > 1 && (
          <>
            <Polyline positions={punti} pathOptions={{ color: '#ffffff', weight: 9, opacity: 0.85, lineCap: 'round' }} />
            <Polyline positions={punti} pathOptions={{ color: BLU, weight: 5, opacity: 0.95, dashArray: '1 11', lineCap: 'round' }} />
            {/* Il verso di marcia: i puntini dicono dove si passa, le frecce
                da che parte si va. */}
            <Frecce punti={punti} zoom={zoom} chiave={`giro-${giro.id}`} />
          </>
        )}

        {fatteFuoriOrdine.map((t) => {
          const p = t.ingresso ?? { lat: t.lat, lon: t.lon };
          return (
            <Marker
              key={`giro-fatta-${t.id}`}
              position={[p.lat, p.lon]}
              icon={iconaTappa(0, 'fatta', { conX: false, sopraIlPin: false, titoloX: '' })}
              zIndexOffset={400}
            />
          );
        })}

        {/* I posti lungo la strada, a giro gia` partito: un tocco li aggiunge
            e il percorso si rifa` da dove si e`. */}
        {aggiungibili.map(({ poi, id }) => (
          <Marker
            key={`giro-lungo-${id}`}
            position={[Number(poi.lat), Number(poi.lon)]}
            icon={iconaLungoStrada()}
            zIndexOffset={300}
            eventHandlers={{ click: () => { void tourService.aggiungiTappaAlVolo(poi); } }}
          />
        ))}

        {tappeInOrdine.map(({ t, posizione }) => {
          if (!t || t.esclusa) return null;
          const p = t.ingresso ?? { lat: t.lat, lon: t.lon };
          const stato: StatoPin = t.fatta || t.saltata ? 'fatta' : posizione === v.tappaCorrente ? 'corrente' : 'da_fare';
          return (
            <Marker
              key={`giro-${t.id}-${posizione}`}
              position={[p.lat, p.lon]}
              icon={iconaTappa(numeri.get(String(t.id)) ?? posizione + 1, stato, { conX: stato !== 'fatta', sopraIlPin: false, titoloX: tr('tour_togli_tappa') })}
              zIndexOffset={stato === 'corrente' ? 1000 : 500}
              eventHandlers={{
                click: (e: any) => {
                  if (stato !== 'fatta' && toccoSullaX(e)) {
                    L.DomEvent.stopPropagation(e.originalEvent);
                    escludi(t);
                    return;
                  }
                  window.dispatchEvent(new CustomEvent('focus-poi', { detail: { id: t.id, name: t.nome, lat: t.lat, lon: t.lon } }));
                },
              }}
            />
          );
        })}
      </>
    );
  }

  // ── LA BOZZA: si sceglie guardando il giro che ne esce ───────────────────
  if (b.tappe.length === 0) return null;

  // L'ordine di cammino se il server l'ha dato, quello di scelta altrimenti.
  const sequenza = (b.ordine && b.ordine.length === b.tappe.length ? b.ordine : b.tappe.map((_, i) => i))
    .map((i) => b.tappe[i]).filter(Boolean);

  // Senza percorso (in calcolo, senza pass, senza GPS) una linea dritta fra
  // le tappe dice comunque "questo e` il giro che stai componendo" — e` un
  // disegno onesto: tratteggiato e grigio, non spacciato per percorso.
  const puntoDi = (t: TappaGiro) => t.ingresso ?? { lat: t.lat, lon: t.lon };
  // Il ritorno alla partenza si disegna SOLO ad anello (corretto 28/08/2026):
  // prima si chiudeva sempre, e chi aveva scelto «finisco all'ultima tappa»
  // vedeva comunque un anello — la linea diceva il contrario della scelta.
  const dritta: [number, number][] = [
    ...(b.partenza ? [[b.partenza.lat, b.partenza.lon] as [number, number]] : []),
    ...sequenza.map((t) => { const p = puntoDi(t); return [p.lat, p.lon] as [number, number]; }),
    ...(b.partenza && b.anello ? [[b.partenza.lat, b.partenza.lon] as [number, number]] : []),
  ];
  const percorso = b.geometria.length > 1 ? b.geometria : null;

  // Perche' la linea e` dritta, in due parole, sulla mappa. Mentre il calcolo
  // e` in corso non si dice niente: fra un attimo arriva il percorso vero.
  const motivoDritta = percorso || b.calcolando
    ? null
    : b.errore === 'PASS_RICHIESTO'
      ? tr('gr_linea_stimata_pass')
      : tr('gr_linea_stimata');
  const centroDritta: [number, number] | null = dritta.length > 1 ? dritta[Math.floor(dritta.length / 2)] : null;

  return (
    <>
      {percorso ? (
        <>
          <Polyline positions={percorso} pathOptions={{ color: '#ffffff', weight: 9, opacity: 0.8, lineCap: 'round' }} />
          <Polyline positions={percorso} pathOptions={{ color: BLU, weight: 5, opacity: b.calcolando ? 0.45 : 0.9, dashArray: '1 11', lineCap: 'round' }} />
          <Frecce punti={percorso as [number, number][]} zoom={zoom} chiave="bozza" />
        </>
      ) : dritta.length > 1 ? (
        <>
          <Polyline positions={dritta} pathOptions={{ color: '#64748b', weight: 3, opacity: 0.7, dashArray: '6 8', lineCap: 'round' }} />
          {/* Nessuna freccia qui: una retta fra due monumenti non ha un verso
              di marcia da mostrare, e disegnarne uno sarebbe una bugia. */}
          {motivoDritta && centroDritta && (
            <Marker
              key="linea-stimata"
              position={centroDritta}
              icon={iconaPillola(motivoDritta)}
              interactive={false}
              keyboard={false}
              zIndexOffset={200}
            />
          )}
        </>
      ) : null}

      {/* I posti lungo la strada: oltre la finestra del radar non hanno un
          pin sotto, quindi il puntino e` l'unico modo di vederli e toccarli. */}
      {b.lungoLaStrada
        .filter((p) => !b.tappe.some((t) => String(t.id) === String(p.id)))
        .map((p) => (
          <Marker
            key={`lungo-${p.id}`}
            position={[p.lat, p.lon]}
            icon={iconaLungoStrada()}
            zIndexOffset={300}
            eventHandlers={{ click: () => { tourService.bozzaAggiungi(p); } }}
          />
        ))}

      {sequenza.map((t, posizione) => {
        const p = puntoDi(t);
        const fuoriTempo = b.tappeNelTempo != null && posizione >= b.tappeNelTempo;
        return (
          <Marker
            key={`bozza-${t.id}`}
            position={[p.lat, p.lon]}
            icon={iconaTappa(posizione + 1, fuoriTempo ? 'fuori_tempo' : 'da_fare', { conX: true, sopraIlPin: true, titoloX: tr('tour_togli') })}
            zIndexOffset={800}
            eventHandlers={{
              click: (e: any) => {
                if (toccoSullaX(e)) {
                  L.DomEvent.stopPropagation(e.originalEvent);
                  tourService.bozzaTogli(t.id);
                  return;
                }
                window.dispatchEvent(new CustomEvent('focus-poi', { detail: { id: t.id, name: t.nome, lat: t.lat, lon: t.lon } }));
              },
            }}
          />
        );
      })}
    </>
  );
}
