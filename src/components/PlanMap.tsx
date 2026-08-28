import React, { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap, Circle } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix Leaflet default icons
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

interface PlanMapProps {
  giorni: any[];
  isPrint?: boolean;
  navRouteGeometry?: [number, number][];
  onSelectPoi?: (tappa: any) => void;
  isAudioGuideActive?: boolean;
}

// Colors per day (polyline)
const DAY_COLORS = ['#1e3a8a', '#e17b3c', '#2563eb', '#9333ea', '#db2777', '#0891b2'];

// CARTO richiede la chiave gratuita dal 26/08/2026 (stessa nota di MapArea.tsx):
// URL e chiave vivono in lib/cartoTiles.ts, con ripiego a runtime se la build
// non aveva VITE_CARTO_API_KEY.
import { cartoTileUrl, ensureCartoKey, onCartoKeyChange } from '../lib/cartoTiles';

// Color + emoji based on stop type
function getMarkerStyle(tipo: string): { bg: string; border: string; emoji: string } {
  const t = (tipo || '').toLowerCase();
  if (t.includes('museo') || t.includes('museum') || t.includes('galleria'))
    return { bg: '#2563eb', border: '#1d4ed8', emoji: '🖼️' };
  if (t.includes('ristoran') || t.includes('food') || t.includes('pranzo') || t.includes('cena') || t.includes('osteria') || t.includes('trattor'))
    return { bg: '#f97316', border: '#ea580c', emoji: '🍽️' };
  if (t.includes('pausa') || t.includes('bar') || t.includes('caffè') || t.includes('caffe') || t.includes('gelat') || t.includes('colazione'))
    return { bg: '#f59e0b', border: '#d97706', emoji: '☕' };
  if (t.includes('panoram') || t.includes('belvedere') || t.includes('vista') || t.includes('viewpoint'))
    return { bg: '#7c3aed', border: '#6d28d9', emoji: '🌅' };
  if (t.includes('chies') || t.includes('basilic') || t.includes('duomo') || t.includes('santuario') || t.includes('cappella'))
    return { bg: '#0891b2', border: '#0e7490', emoji: '⛪' };
  if (t.includes('parco') || t.includes('giardin') || t.includes('natura') || t.includes('riserva') || t.includes('spiaggia'))
    return { bg: '#16a34a', border: '#15803d', emoji: '🌿' };
  // Default: visita / monumento
  return { bg: '#1e3a8a', border: '#166534', emoji: '📍' };
}

// SVG teardrop marker with number badge
function createTappaIcon(tipo: string, number: number, dayColor: string): L.DivIcon {
  const { bg, border, emoji } = getMarkerStyle(tipo);
  const html = `
    <div style="position:relative;width:34px;height:42px;filter:drop-shadow(0 3px 5px rgba(0,0,0,.3))">
      <svg viewBox="0 0 34 42" width="34" height="42" xmlns="http://www.w3.org/2000/svg">
        <path d="M17 0C7.6 0 0 7.6 0 17c0 12.7 17 25 17 25S34 29.7 34 17C34 7.6 26.4 0 17 0z"
          fill="${bg}" stroke="${border}" stroke-width="1.5"/>
        <circle cx="17" cy="16" r="10.5" fill="white" opacity="0.93"/>
        <text x="17" y="20.5" text-anchor="middle" font-size="11" font-family="system-ui,sans-serif" font-weight="900" fill="${bg}">${number}</text>
      </svg>
      <div style="position:absolute;top:-7px;right:-7px;background:${dayColor};color:white;border-radius:50%;width:16px;height:16px;font-size:9px;display:flex;align-items:center;justify-content:center;font-weight:900;border:1.5px solid white;box-shadow:0 1px 3px rgba(0,0,0,.3)">${emoji}</div>
    </div>
  `;
  return L.divIcon({
    html,
    className: '',
    iconSize: [34, 42],
    iconAnchor: [17, 42],
    popupAnchor: [0, -44],
  });
}

// Cache delle icone (chiave: tipo|numero|colore giorno) per non ricreare
// i divIcon a ogni render della mappa
const tappaIconCache = new Map<string, L.DivIcon>();
function getTappaIcon(tipo: string, number: number, dayColor: string): L.DivIcon {
  const key = `${tipo}|${number}|${dayColor}`;
  let icon = tappaIconCache.get(key);
  if (!icon) {
    icon = createTappaIcon(tipo, number, dayColor);
    tappaIconCache.set(key, icon);
  }
  return icon;
}

function ChangeView({ bounds }: { bounds: L.LatLngBounds | null }) {
  const map = useMap();
  useEffect(() => {
    if (bounds && bounds.isValid()) {
      map.fitBounds(bounds, { padding: [32, 32] });
    }
  }, [bounds, map]);
  return null;
}

const LEGEND = [
  { color: '#1e3a8a', label: 'Visita' },
  { color: '#f97316', label: 'Ristorante' },
  { color: '#f59e0b', label: 'Pausa' },
  { color: '#2563eb', label: 'Museo' },
  { color: '#7c3aed', label: 'Panorama' },
  { color: '#0891b2', label: 'Chiesa' },
  { color: '#16a34a', label: 'Natura' },
];

/** Distanza approssimata in km (equirettangolare: più che sufficiente per il filtro) */
function distKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const dLat = (aLat - bLat) * 111.32;
  const dLng = (aLng - bLng) * 111.32 * Math.cos(((aLat + bLat) / 2) * Math.PI / 180);
  return Math.sqrt(dLat * dLat + dLng * dLng);
}

function median(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function PlanMap({ giorni, isPrint = false, navRouteGeometry, onSelectPoi, isAudioGuideActive = false }: PlanMapProps) {
  const [cartoUrl, setCartoUrl] = React.useState<string>(() => cartoTileUrl());
  React.useEffect(() => {
    const off = onCartoKeyChange(() => setCartoUrl(cartoTileUrl()));
    ensureCartoKey().then(() => setCartoUrl(cartoTileUrl())).catch(() => {});
    return off;
  }, []);
  // Coordinate allucinate dall'AI (luogo omonimo in un'altra città) finivano
  // sulla mappa: un pin a 400 km sfasciava zoom e percorso. Filtro robusto:
  // centro MEDIANO delle tappe (insensibile agli outlier) + soglia adattiva.
  const { allStops, inRange } = useMemo(() => {
    const raw = giorni.flatMap(g => g.tappe).filter(
      (t: any) => t.coordinate && Number.isFinite(Number(t.coordinate.lat)) && Number.isFinite(Number(t.coordinate.lng)) && t.coordinate.lat !== 0 && t.coordinate.lng !== 0
    );
    if (raw.length < 3) {
      return { allStops: raw, inRange: (_t: any) => true };
    }
    const cLat = median(raw.map((t: any) => Number(t.coordinate.lat)));
    const cLng = median(raw.map((t: any) => Number(t.coordinate.lng)));
    const dists = raw.map((t: any) => distKm(Number(t.coordinate.lat), Number(t.coordinate.lng), cLat, cLng));
    // 80 km coprono le gite fuori porta (es. "Ravenna e la Riviera"); il 4×
    // della distanza mediana lascia respirare gli itinerari itineranti veri.
    const cutoff = Math.max(80, median(dists) * 4);
    const check = (t: any) => distKm(Number(t.coordinate.lat), Number(t.coordinate.lng), cLat, cLng) <= cutoff;
    return { allStops: raw.filter(check), inRange: check };
  }, [giorni]);

  // Bounds derivati dalle tappe: useMemo su [giorni] al posto di useState+useEffect
  const bounds = useMemo(() => {
    if (allStops.length === 0) return null;
    return L.latLngBounds(allStops.map((s: any) => [s.coordinate.lat, s.coordinate.lng] as [number, number]));
  }, [allStops]);

  if (allStops.length === 0) return null;

  return (
    <div className={`relative w-full shadow-md z-0 ${isPrint ? 'h-full overflow-hidden' : 'h-96 overflow-hidden rounded-[2rem] border border-amber-100/50 mt-8'}`}>
      {/* Legend overlay */}
      {!isPrint ? (
        <div className="absolute top-3 right-3 z-[1000] bg-white/95 backdrop-blur-sm rounded-xl px-3 py-2 shadow border border-amber-100/50 flex flex-row flex-wrap items-center gap-x-3 gap-y-1 max-w-[calc(100%-60px)] justify-end">
          <p className="text-[9px] font-black uppercase tracking-widest text-[#1e3a8a]/50 mr-1 hidden sm:block">Legenda</p>
          {LEGEND.map(item => (
            <div key={item.label} className="flex items-center gap-1.5">
              <span style={{ background: item.color }} className="w-2 h-2 rounded-full shrink-0" />
              <span className="text-[9px] font-bold text-[#1e3a8a]/70">{item.label}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="absolute top-0 left-0 w-full z-[1000] bg-white/90 backdrop-blur-sm border-b border-amber-100/60 px-2 py-1.5 flex flex-row flex-wrap justify-center items-center gap-x-4 gap-y-1">
          <p className="text-[9px] font-black uppercase tracking-widest text-[#1e3a8a]/50 mr-2">Legenda</p>
          {LEGEND.map(item => (
            <div key={item.label} className="flex items-center gap-1">
              <span style={{ background: item.color }} className="w-2.5 h-2.5 rounded-full shrink-0" />
              <span className="text-[9px] font-bold text-[#1e3a8a]/80">{item.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Day legend */}
      {!isPrint && (
        <div className="absolute bottom-4 left-3 z-[1000] bg-white/95 backdrop-blur-sm rounded-2xl px-3 py-2 shadow border border-amber-100/50 space-y-1.5">
          <p className="text-[9px] font-black uppercase tracking-widest text-[#1e3a8a]/50 mb-1">Giorni</p>
          {giorni.map((g, i) => (
            <div key={g.giorno} className="flex items-center gap-1.5">
              <span style={{ background: DAY_COLORS[i % DAY_COLORS.length] }} className="w-2.5 h-2.5 rounded-full shrink-0" />
              <span className="text-[10px] font-bold text-[#1e3a8a]/70">Giorno {g.giorno}</span>
            </div>
          ))}
        </div>
      )}

      <MapContainer
        preferCanvas={true}
        scrollWheelZoom={false}
        className="w-full h-full"
        center={allStops[0] ? [allStops[0].coordinate.lat, allStops[0].coordinate.lng] : [41.9, 12.5]}
        zoom={13}
      >
        {/* Stesse tile CARTO di MapArea (default Leaflet subdomains 'abc' +
            suffisso retina {r}): così il prefetch offline (offlineTiles.ts /
            service worker) copre anche la mappa dell'itinerario. */}
        <TileLayer
          attribution='&copy; <a href="https://carto.com/attributions">CARTO</a>'
          key={cartoUrl}
          url={cartoUrl}
        />
        {bounds && <ChangeView bounds={bounds} />}

        {navRouteGeometry && navRouteGeometry.length > 1 && (
          <Polyline
            positions={navRouteGeometry}
            pathOptions={{ color: '#eab308', weight: 6, opacity: 0.8 }}
          />
        )}

        {giorni.map((giorno, dayIdx) => {
          const tappeConMap = giorno.tappe.filter(
            (t: any) => t.coordinate && t.coordinate.lat !== 0 && t.coordinate.lng !== 0 && inRange(t)
          );
          const dayColor = DAY_COLORS[dayIdx % DAY_COLORS.length];
          const positions = tappeConMap.map((t: any) => [t.coordinate.lat, t.coordinate.lng] as [number, number]);

          return (
            <React.Fragment key={giorno.giorno}>
              {positions.length > 1 && (
                <Polyline
                  positions={positions}
                  pathOptions={{ color: dayColor, weight: 3, opacity: 0.75, dashArray: '8 6' }}
                />
              )}
              {tappeConMap.map((t: any, idx2: number) => {
                const { emoji } = getMarkerStyle(t.tipo);
                return (
                  <React.Fragment key={`${t.id_tappa}-${idx2}`}>
                    {/* AUDIO GUIDE CIRCLES */}
                    {isAudioGuideActive && t.tipo !== 'ristorante' && t.tipo !== 'pausa' && t.tipo !== 'spostamento' && (
                      <>
                        {/* Inner activation circle (50m) */}
                        <Circle
                          center={[t.coordinate.lat, t.coordinate.lng]}
                          radius={50}
                          pathOptions={{ 
                            color: '#eab308', 
                            fillColor: '#fef08a', 
                            fillOpacity: 0.15, 
                            weight: 1, 
                            dashArray: '4 4' 
                          }}
                        />
                        {/* Outer stop circle (70m) */}
                        <Circle
                          center={[t.coordinate.lat, t.coordinate.lng]}
                          radius={70}
                          pathOptions={{ 
                            color: '#f97316', 
                            fillColor: 'transparent', 
                            fillOpacity: 0, 
                            weight: 1, 
                            dashArray: '2 6' 
                          }}
                        />
                      </>
                    )}

                    <Marker
                      position={[t.coordinate.lat, t.coordinate.lng]}
                      icon={getTappaIcon(t.tipo, idx2 + 1, dayColor)}
                    >
                      <Popup>
                        <div style={{ minWidth: 160 }}>
                          <div style={{ fontWeight: 900, fontSize: 13, marginBottom: 4 }}>
                            {emoji} {t.titolo_tappa}
                          </div>
                          <div style={{ fontSize: 11, color: '#6b7280' }}>
                            Giorno {giorno.giorno} · {t.ora}
                          </div>
                          {t.tempo_necessario && (
                            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
                              ⏱ {t.tempo_necessario}
                            </div>
                          )}
                          {t.tipo && (
                            <div style={{ fontSize: 10, background: '#f3f4f6', padding: '2px 8px', borderRadius: 20, display: 'inline-block', marginTop: 4, textTransform: 'uppercase', fontWeight: 700, letterSpacing: 1 }}>
                              {t.tipo}
                            </div>
                          )}
                          
                          {/* Details button inside popup */}
                          {onSelectPoi && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onSelectPoi(t);
                              }}
                              style={{
                                display: 'block',
                                width: '100%',
                                marginTop: '10px',
                                padding: '6px 0',
                                background: '#eff6ff',
                                color: '#1e40af',
                                border: '1px solid #bfdbfe',
                                borderRadius: '8px',
                                fontSize: '11px',
                                fontWeight: 900,
                                textTransform: 'uppercase',
                                cursor: 'pointer',
                                textAlign: 'center'
                              }}
                            >
                              Vedi Dettagli
                            </button>
                          )}
                        </div>
                      </Popup>
                    </Marker>
                  </React.Fragment>
                );
              })}
            </React.Fragment>
          );
        })}
      </MapContainer>
    </div>
  );
}

// Memoizzato: ri-renderizza solo quando cambiano davvero le props (es. giorni)
export default React.memo(PlanMap);

