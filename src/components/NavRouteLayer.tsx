/**
 * WIP NAV sulla mappa principale — il tracciato del navigatore pedonale.
 *
 * Fino al 23/08/2026 la polilinea di useWalkingNavigation finiva SOLO in
 * PlanMap, la mappa dentro un itinerario generato: chi avviava il WIP Nav
 * dal radar o dal popup di un POI veniva portato sulla tab Piano — dove,
 * senza un itinerario, una mappa non c'e' — e il percorso non si vedeva da
 * nessuna parte. Il navigatore "partiva" (overlay, voce) ma la linea no.
 *
 * Il layer non riceve props: ascolta 'wip-nav-route', che il hook emette a
 * ogni tracciato nuovo (avvio, ricalcolo) e con geometria vuota allo stop.
 * Cosi' MapArea non deve sapere nulla della navigazione, come per il giro
 * (TourRouteLayer). Stesso giallo di PlanMap, con una base bianca sotto per
 * staccare dalle strade chiare di Carto Voyager.
 */
import { Polyline, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import { useEffect, useState } from 'react';

export interface NavRouteDetail {
  geometry: [number, number][];
  destination?: { lat: number; lon: number; name?: string } | null;
  /** false = ricalcolo: la linea si aggiorna senza rimuovere la mappa. */
  fit?: boolean;
}

const GIALLO = '#eab308';

let iconaMeta: L.DivIcon | null = null;
function iconaDestinazione(): L.DivIcon {
  if (iconaMeta) return iconaMeta;
  iconaMeta = L.divIcon({
    className: 'wip-nav-meta',
    html: `<div style="
      width:28px;height:28px;border-radius:50%;
      background:${GIALLO};border:3px solid #fff;
      display:flex;align-items:center;justify-content:center;
      font-size:15px;line-height:1;box-shadow:0 2px 8px rgba(0,0,0,.35);
    ">🏁</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
  return iconaMeta;
}

export default function NavRouteLayer() {
  const map = useMap();
  const [route, setRoute] = useState<NavRouteDetail | null>(null);

  useEffect(() => {
    const onRoute = (e: Event) => {
      const d = (e as CustomEvent<NavRouteDetail>).detail;
      const geometry = Array.isArray(d?.geometry) ? d.geometry : [];
      if (geometry.length < 2) { setRoute(null); return; }
      setRoute({ geometry, destination: d?.destination ?? null });
      // Il tracciato intero in vista all'avvio: l'utente ha appena premuto
      // "Avvia" e vuole vedere dove va, non cercare la linea fuori schermo.
      // Solo sul primo tracciato (quando prima non c'era): i ricalcoli non
      // devono strappare la mappa a chi la sta guardando.
      if (d?.fit !== false) {
        try { map.fitBounds(L.latLngBounds(geometry as any), { padding: [48, 48], maxZoom: 17 }); } catch { /* mappa non pronta */ }
      }
    };
    window.addEventListener('wip-nav-route', onRoute);
    return () => window.removeEventListener('wip-nav-route', onRoute);
  }, [map]);

  if (!route) return null;
  const { geometry, destination } = route;
  return (
    <>
      <Polyline positions={geometry} pathOptions={{ color: '#ffffff', weight: 10, opacity: 0.85, lineCap: 'round', lineJoin: 'round' }} />
      <Polyline positions={geometry} pathOptions={{ color: GIALLO, weight: 6, opacity: 0.95, lineCap: 'round', lineJoin: 'round' }} />
      {destination && Number.isFinite(destination.lat) && Number.isFinite(destination.lon) && (
        <Marker position={[destination.lat, destination.lon]} icon={iconaDestinazione()} zIndexOffset={900} title={destination.name || ''} />
      )}
    </>
  );
}
