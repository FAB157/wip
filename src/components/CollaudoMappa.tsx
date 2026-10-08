// MAPPA DEL COLLAUDO (04/10/2026): la passeggiata di prova disegnata sulla
// mappa. La linea è la traccia; ogni X è uno scatto (verde = giusto, arancio =
// tardi, rosso = presto, grigio = recinto di sistema); il cerchio attorno al
// punto d'arrivo è il raggio con cui lo scatto è stato deciso; le bandierine
// sono i segni di chi collauda («qui ha sbagliato»). Solo admin.
// I dati arrivano già letti dal server (src/lib/collaudoRegistro.ts).
import { useEffect } from 'react';
import { MapContainer, TileLayer, Polyline, Circle, CircleMarker, Marker, Popup, Rectangle, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { RegistroLetto } from '../lib/collaudoRegistro';

const COLORE: Record<string, string> = { giusto: '#16a34a', giusta: '#16a34a', tardi: '#ea580c', presto: '#dc2626', rinviato: '#6b7280', recinto: '#6b7280' };

const icona = (testo: string, colore: string) => L.divIcon({
  className: '',
  html: `<div style="width:22px;height:22px;display:flex;align-items:center;justify-content:center;font:900 15px system-ui;color:#fff;background:${colore};border:2px solid #fff;border-radius:6px;box-shadow:0 1px 3px rgba(0,0,0,.4)">${testo}</div>`,
  iconSize: [22, 22], iconAnchor: [11, 11],
});

/**
 * Una mappa piccola centrata su UN luogo, per correggere il suo punto d'arrivo: il
 * punto di oggi (blu), il centro del luogo (grigio) e la stella dove si tocca.
 */
export function PuntoSuMappa({ lat, lon, proposto, onTocco }: { lat: number; lon: number; proposto: [number, number] | null; onTocco: (lat: number, lon: number) => void }) {
  return (
    <div className="rounded-xl overflow-hidden border border-gray-200" style={{ height: 300 }}>
      <MapContainer center={[lat, lon]} zoom={18} style={{ height: '100%', width: '100%' }} scrollWheelZoom>
        <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" maxZoom={19} />
        <CircleMarker center={[lat, lon]} radius={6} pathOptions={{ color: '#fff', weight: 2, fillColor: '#1e63ff', fillOpacity: 1 }}>
          <Popup>Punto d'arrivo di oggi</Popup>
        </CircleMarker>
        <Circle center={[lat, lon]} radius={30} pathOptions={{ color: '#1e63ff', weight: 1, fillOpacity: 0.05 }} />
        <Tocco onTocco={onTocco} />
        {proposto && <Marker position={proposto} icon={icona('★', '#0891b2')} />}
      </MapContainer>
    </div>
  );
}

/** Sposta la mappa sul fotogramma scelto, senza ricrearla. */
function Segui({ lat, lon }: { lat: number; lon: number }) {
  const mappa = useMap();
  useEffect(() => { try { mappa.panTo([lat, lon], { animate: false }); } catch { /* mappa non pronta */ } }, [lat, lon, mappa]);
  return null;
}

/**
 * FILM DELLA PROVA: la strada fatta fino al fotogramma scelto (blu), quella ancora da fare
 * (grigio), dove era il telefono davvero (pallino blu) e dove l'app credeva che fosse
 * (pallino rosso: il GPS che sbaglia). Le bandierine sono i secondi in cui è successo qualcosa.
 */
export function FilmMappa({ film, quadro }: { film: Array<{ lat: number; lon: number; gps: [number, number] | null; eventi: string[]; ora: string }>; quadro: number }) {
  const q = film[Math.min(quadro, film.length - 1)];
  if (!q) return null;
  const fatta = film.slice(0, quadro + 1).map(f => [f.lat, f.lon] as [number, number]);
  const daFare = film.slice(quadro).map(f => [f.lat, f.lon] as [number, number]);
  return (
    <div className="rounded-xl overflow-hidden border border-gray-200" style={{ height: 220 }}>
      <MapContainer center={[q.lat, q.lon]} zoom={18} style={{ height: '100%', width: '100%' }} scrollWheelZoom>
        <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" maxZoom={19} />
        <Segui lat={q.lat} lon={q.lon} />
        {daFare.length > 1 && <Polyline positions={daFare} pathOptions={{ color: '#9ca3af', weight: 3, opacity: 0.7 }} />}
        {fatta.length > 1 && <Polyline positions={fatta} pathOptions={{ color: '#1e3a8a', weight: 4, opacity: 0.8 }} />}
        {film.map((f, i) => f.eventi.length > 0 ? (
          <CircleMarker key={i} center={[f.lat, f.lon]} radius={5} pathOptions={{ color: '#fff', weight: 2, fillColor: i <= quadro ? '#7c3aed' : '#c4b5fd', fillOpacity: 1 }}>
            <Popup>{f.ora}<br />{f.eventi.join(' · ')}</Popup>
          </CircleMarker>
        ) : null)}
        {q.gps && <CircleMarker center={q.gps} radius={6} pathOptions={{ color: '#fff', weight: 2, fillColor: '#dc2626', fillOpacity: 1 }}><Popup>Dove l'app credeva che fosse</Popup></CircleMarker>}
        <CircleMarker center={[q.lat, q.lon]} radius={7} pathOptions={{ color: '#fff', weight: 3, fillColor: '#1e63ff', fillOpacity: 1 }}><Popup>Dove era davvero</Popup></CircleMarker>
      </MapContainer>
    </div>
  );
}

/** Il mondo a quadrati di 1°: verde dove le gemme hanno la strada vicina, rosso dove no. */
export function ZoneMappa({ zone }: { zone: Array<{ lat: number; lon: number; n: number; senza: number; senzaDati: number; conExtra: number; voto: number }> }) {
  const colore = (v: number) => (v >= 85 ? '#16a34a' : v >= 60 ? '#eab308' : v >= 30 ? '#ea580c' : '#dc2626');
  return (
    <div className="rounded-xl overflow-hidden border border-gray-200" style={{ height: 420 }}>
      <MapContainer center={[42, 12]} zoom={4} minZoom={2} style={{ height: '100%', width: '100%' }} scrollWheelZoom worldCopyJump>
        <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" maxZoom={12} />
        {zone.map((z, i) => (
          <Rectangle key={i} bounds={[[z.lat, z.lon], [z.lat + 1, z.lon + 1]]} pathOptions={{ color: colore(z.voto), weight: 0.5, fillOpacity: 0.45 }}>
            <Popup>
              <b>Voto {z.voto}</b><br />
              {z.n} gemme · {z.senza} senza strada vicina · {z.senzaDati} in celle senza dati stradali<br />
              strade di servizio caricate per {z.conExtra} su {z.n}
            </Popup>
          </Rectangle>
        ))}
      </MapContainer>
    </div>
  );
}

/** Il tocco sulla mappa, per proporre un punto d'arrivo nuovo. */
function Tocco({ onTocco }: { onTocco: (lat: number, lon: number) => void }) {
  useMapEvents({ click: (e) => onTocco(e.latlng.lat, e.latlng.lng) });
  return null;
}

export default function CollaudoMappa({ letto, onTocco, proposto }: { letto: RegistroLetto; onTocco?: (lat: number, lon: number) => void; proposto?: [number, number] | null }) {
  const linea = letto.traccia.map(p => [p.lat, p.lon] as [number, number]);
  const tutti: [number, number][] = [
    ...linea,
    ...letto.scatti.flatMap(s => [[s.lat, s.lon], [s.puntoLat, s.puntoLon]] as [number, number][]),
    ...letto.segni.filter(s => s.lat != null && s.lon != null).map(s => [s.lat as number, s.lon as number] as [number, number]),
  ];
  if (tutti.length === 0) return <p className="text-xs text-gray-500">Nessuna posizione in questo registro: la traccia si registra solo con la modalità collaudo accesa.</p>;
  const limiti = L.latLngBounds(tutti).pad(0.15);
  return (
    <div className="rounded-xl overflow-hidden border border-gray-200" style={{ height: 420 }}>
      <MapContainer bounds={limiti} style={{ height: '100%', width: '100%' }} scrollWheelZoom>
        <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" maxZoom={19} />
        {linea.length > 1 && <Polyline positions={linea} pathOptions={{ color: '#1e3a8a', weight: 3, opacity: 0.7 }} />}
        {letto.scatti.map((s, i) => (
          <span key={`s${i}`}>
            <Circle center={[s.puntoLat, s.puntoLon]} radius={Math.max(5, s.raggio)} pathOptions={{ color: COLORE[s.esito], weight: 1, fillOpacity: 0.06 }} />
            <CircleMarker center={[s.puntoLat, s.puntoLon]} radius={4} pathOptions={{ color: '#1e63ff', fillColor: '#1e63ff', fillOpacity: 1 }} />
            <Polyline positions={[[s.lat, s.lon], [s.puntoLat, s.puntoLon]]} pathOptions={{ color: COLORE[s.esito], weight: 1, dashArray: '4 4' }} />
            <Marker position={[s.lat, s.lon]} icon={icona(s.tipo === 'avviso' ? 'A' : '✕', COLORE[s.esito])}>
              <Popup>
                <b>{s.nome}</b><br />
                {s.tipo} · {s.ora}<br />
                strada {s.strada == null ? 'irraggiungibile' : `${Math.round(s.strada)} m`} · aria {s.aria} m · raggio {s.raggio} m · GPS ±{s.acc ?? '?'} m
                {s.nota && <><br />{s.nota}</>}
              </Popup>
            </Marker>
          </span>
        ))}
        {letto.svolte.map((v, i) => (
          <CircleMarker key={`v${i}`} center={[v.lat, v.lon]} radius={6} pathOptions={{ color: '#fff', weight: 2, fillColor: COLORE[v.esito], fillOpacity: 1 }}>
            <Popup>
              <b>{v.frase}</b><br />
              {v.ora} · {v.tipo || 'voce'} · dice {v.chi}<br />
              {v.strada == null ? '' : `a ${Math.round(v.strada)} m dalla svolta (soglia ${Math.round(v.vicino)} m)`}
            </Popup>
          </CircleMarker>
        ))}
        {onTocco && <Tocco onTocco={onTocco} />}
        {proposto && (
          <Marker position={proposto} icon={icona('★', '#0891b2')}>
            <Popup>Punto d'arrivo proposto</Popup>
          </Marker>
        )}
        {letto.segni.filter(s => s.lat != null && s.lon != null).map((s, i) => (
          <Marker key={`g${i}`} position={[s.lat as number, s.lon as number]} icon={icona(s.contenuto ? '✎' : '!', s.contenuto ? '#d97706' : '#7c3aed')}>
            <Popup><b>{s.nota}</b><br />{s.ora}</Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
