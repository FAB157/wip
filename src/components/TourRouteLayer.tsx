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
import { Polyline, Marker } from 'react-leaflet';
import L from 'leaflet';
import { useEffect, useState } from 'react';
import { tourService, type VistaGiro, type BozzaGiro, type TappaGiro } from '../services/tourService';

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
let iconaLungoStradaCache: L.DivIcon | null = null;
function iconaLungoStrada(): L.DivIcon {
  if (iconaLungoStradaCache) return iconaLungoStradaCache;
  iconaLungoStradaCache = L.divIcon({
    className: 'wip-lungo-strada',
    html: `<div title="Aggiungi al giro" style="
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
  return iconaLungoStradaCache;
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

  const giro = tourService.datiGiro();

  // ── IL GIRO IN CORSO ─────────────────────────────────────────────────────
  if (giro && v) {
    const punti = giro.geometria as [number, number][];
    const tappeInOrdine = giro.ordine.map((indice, posizione) => ({ t: giro.tappe[indice], indice, posizione }));
    // Dopo un ricalcolo `ordine` contiene solo le tappe da fare: le fatte
    // restano sulla mappa, grigie, perche' "dove sono gia` stato" e` parte
    // del quadro. Le escluse no: non dovevano esserci.
    const fatteFuoriOrdine = giro.tappe.filter((t, i) => !giro.ordine.includes(i) && (t.fatta || t.saltata) && !t.esclusa);

    const escludi = (t: TappaGiro) => conPosizione((p) => { tourService.escludi(t.id, p); });

    return (
      <>
        {/* Due tracciati sovrapposti: uno spesso e chiaro sotto per staccare dal
            fondo della mappa, i puntini blu sopra. Con i soli puntini su una
            strada scura il percorso sparisce. */}
        {punti.length > 1 && (
          <>
            <Polyline positions={punti} pathOptions={{ color: '#ffffff', weight: 9, opacity: 0.85, lineCap: 'round' }} />
            <Polyline positions={punti} pathOptions={{ color: BLU, weight: 5, opacity: 0.95, dashArray: '1 11', lineCap: 'round' }} />
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

        {tappeInOrdine.map(({ t, posizione }) => {
          if (!t || t.esclusa) return null;
          const p = t.ingresso ?? { lat: t.lat, lon: t.lon };
          const stato: StatoPin = t.fatta || t.saltata ? 'fatta' : posizione === v.tappaCorrente ? 'corrente' : 'da_fare';
          return (
            <Marker
              key={`giro-${t.id}-${posizione}`}
              position={[p.lat, p.lon]}
              icon={iconaTappa(posizione + 1, stato, { conX: stato !== 'fatta', sopraIlPin: false, titoloX: 'Togli questa tappa dal giro' })}
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
  const dritta: [number, number][] = [
    ...(b.partenza ? [[b.partenza.lat, b.partenza.lon] as [number, number]] : []),
    ...sequenza.map((t) => { const p = puntoDi(t); return [p.lat, p.lon] as [number, number]; }),
    ...(b.partenza ? [[b.partenza.lat, b.partenza.lon] as [number, number]] : []),
  ];
  const percorso = b.geometria.length > 1 ? b.geometria : null;

  return (
    <>
      {percorso ? (
        <>
          <Polyline positions={percorso} pathOptions={{ color: '#ffffff', weight: 9, opacity: 0.8, lineCap: 'round' }} />
          <Polyline positions={percorso} pathOptions={{ color: BLU, weight: 5, opacity: b.calcolando ? 0.45 : 0.9, dashArray: '1 11', lineCap: 'round' }} />
        </>
      ) : dritta.length > 1 ? (
        <Polyline positions={dritta} pathOptions={{ color: '#64748b', weight: 3, opacity: 0.7, dashArray: '6 8', lineCap: 'round' }} />
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
            icon={iconaTappa(posizione + 1, fuoriTempo ? 'fuori_tempo' : 'da_fare', { conX: true, sopraIlPin: true, titoloX: 'Togli dal giro' })}
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
