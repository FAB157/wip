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
 */
import { Polyline, Marker } from 'react-leaflet';
import L from 'leaflet';
import { useEffect, useState } from 'react';
import { tourService, type VistaGiro } from '../services/tourService';

const BLU = '#1e3a8a';
const FATTA = '#94a3b8';

/** Pin numerato: fatto (grigio, spuntato), corrente (blu pieno), da fare (bianco). */
function iconaTappa(numero: number, stato: 'fatta' | 'corrente' | 'da_fare'): L.DivIcon {
  const sfondo = stato === 'corrente' ? BLU : stato === 'fatta' ? FATTA : '#ffffff';
  const testo = stato === 'da_fare' ? BLU : '#ffffff';
  const bordo = stato === 'da_fare' ? BLU : sfondo;
  const contenuto = stato === 'fatta' ? '✓' : String(numero);
  // La tappa corrente e` piu` grande: a colpo d'occhio si vede dove si sta
  // andando senza dover leggere i numeri.
  const lato = stato === 'corrente' ? 34 : 26;
  return L.divIcon({
    className: 'wip-tappa-giro',
    html: `<div style="
      width:${lato}px;height:${lato}px;border-radius:50%;
      background:${sfondo};border:2.5px solid ${bordo};color:${testo};
      display:flex;align-items:center;justify-content:center;
      font-weight:800;font-size:${stato === 'corrente' ? 15 : 12}px;
      font-family:system-ui,-apple-system,sans-serif;
      box-shadow:0 2px 8px rgba(0,0,0,.3);
    ">${contenuto}</div>`,
    iconSize: [lato, lato],
    iconAnchor: [lato / 2, lato / 2],
  });
}

export default function TourRouteLayer() {
  const [v, setV] = useState<VistaGiro | null>(tourService.vista());
  useEffect(() => tourService.ascolta(setV), []);

  const giro = tourService.datiGiro();
  if (!giro || !v) return null;

  const punti = giro.geometria as [number, number][];

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

      {giro.ordine.map((indice, posizione) => {
        const t = giro.tappe[indice];
        if (!t) return null;
        const p = t.ingresso ?? { lat: t.lat, lon: t.lon };
        const stato = t.fatta || t.saltata ? 'fatta' : posizione === v.tappaCorrente ? 'corrente' : 'da_fare';
        return (
          <Marker
            key={`giro-${t.id}-${posizione}`}
            position={[p.lat, p.lon]}
            icon={iconaTappa(posizione + 1, stato)}
            zIndexOffset={stato === 'corrente' ? 1000 : 500}
          />
        );
      })}
    </>
  );
}
