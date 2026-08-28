import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { motion } from 'motion/react';
import { X, MapPin, Loader2, Check, LocateFixed } from 'lucide-react';
import { Language, getTranslation } from '../lib/i18n';

// Fix icone di default di Leaflet (stesso schema di PlanMap.tsx)
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

export type VisionCoordsSource = 'device' | 'exif' | 'user_pin' | 'none';

export interface VisionLocationPick {
  lat: number | null;
  lon: number | null;
  coordsSource: VisionCoordsSource;
}

interface VisionLocationPickerProps {
  /** Posizione del device se già nota (centra la mappa e alimenta "Usa la mia posizione"). */
  devicePosition: { lat: number; lon: number } | null;
  language: Language;
  onPick: (pick: VisionLocationPick) => void;
}

// Centro Italia, zoom 5: la vista di ripiego quando il GPS non è noto.
const ITALY_CENTER: [number, number] = [42.5, 12.5];
const ITALY_ZOOM = 5;
const DEVICE_ZOOM = 14;

/** Tap sulla mappa = pin (un solo marker, sempre l'ultimo tocco). */
function TapToPin({ onTap }: { onTap: (lat: number, lon: number) => void }) {
  useMapEvents({
    click(e) { onTap(e.latlng.lat, e.latlng.lng); },
  });
  return null;
}

/** La mappa nasce dentro una modale animata: ricalcola le dimensioni a layout stabile. */
function FixSize() {
  const map = useMap();
  useEffect(() => {
    const t1 = setTimeout(() => map.invalidateSize(), 80);
    const t2 = setTimeout(() => map.invalidateSize(), 400);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [map]);
  return null;
}

/** Ricentra la mappa quando arriva (tardi) la posizione del device. */
function FlyTo({ target }: { target: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo(target, DEVICE_ZOOM, { duration: 0.6 });
  }, [target, map]);
  return null;
}

/**
 * «Dove hai scattato questa foto?» — una foto dalla galleria senza GPS EXIF
 * non deve MAI ereditare la posizione del telefono di nascosto: qui l'utente
 * mette un pin sulla mappa (user_pin), sceglie esplicitamente la posizione
 * attuale (device) oppure salta (none → nessuna coordinata).
 */
export default function VisionLocationPicker({ devicePosition, language, onPick }: VisionLocationPickerProps) {
  const [pin, setPin] = useState<{ lat: number; lon: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [deviceFailed, setDeviceFailed] = useState(false);
  const [flyTarget, setFlyTarget] = useState<[number, number] | null>(null);
  const t = (key: string) => getTranslation(key, language);

  const center: [number, number] = devicePosition ? [devicePosition.lat, devicePosition.lon] : ITALY_CENTER;
  const zoom = devicePosition ? DEVICE_ZOOM : ITALY_ZOOM;

  // Esc = "Non lo so" (nessuna coordinata)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onPick({ lat: null, lon: null, coordsSource: 'none' }); }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onPick]);

  /** "Usa la mia posizione attuale": prop se nota, altrimenti geolocation diretta. */
  const useDevice = async () => {
    if (locating) return;
    if (devicePosition) {
      onPick({ lat: devicePosition.lat, lon: devicePosition.lon, coordsSource: 'device' });
      return;
    }
    if (!('geolocation' in navigator)) { setDeviceFailed(true); return; }
    setLocating(true);
    try {
      const pos: GeolocationPosition = await new Promise((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 6000, maximumAge: 60000 })
      );
      const { latitude, longitude } = pos.coords;
      setLocating(false);
      // Mostra dov'è prima di confermare? No: la scelta è esplicita, si chiude.
      onPick({ lat: latitude, lon: longitude, coordsSource: 'device' });
    } catch {
      // Permesso negato o timeout: il bottone si spegne, restano pin e "Non lo so".
      setLocating(false);
      setDeviceFailed(true);
    }
  };

  // Se la posizione del device arriva dopo il mount (prop aggiornata), ricentra.
  useEffect(() => {
    if (devicePosition && !pin) setFlyTarget([devicePosition.lat, devicePosition.lon]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [devicePosition?.lat, devicePosition?.lon]);

  return (
    <div className="fixed inset-0 z-[2600] bg-black/70 backdrop-blur-sm flex items-end sm:items-center sm:justify-center">
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={t('vis_where_title')}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.18 }}
        className="bg-white w-full sm:max-w-md h-[92vh] sm:h-auto sm:max-h-[92vh] rounded-t-[2rem] sm:rounded-[2rem] overflow-hidden flex flex-col shadow-2xl"
      >
        {/* Testata */}
        <div className="px-5 pt-5 pb-3 flex items-start gap-3">
          <div className="w-10 h-10 shrink-0 rounded-2xl bg-primary/10 flex items-center justify-center">
            <MapPin className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-black text-gray-900 leading-tight">{t('vis_where_title')}</h2>
            <p className="text-[11px] text-gray-500 font-medium leading-snug mt-1">{t('vis_where_desc')}</p>
          </div>
          <button
            onClick={() => onPick({ lat: null, lon: null, coordsSource: 'none' })}
            aria-label={t('vis_close')}
            className="w-9 h-9 shrink-0 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 active:scale-90 transition-transform"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mappa: tap = pin */}
        <div className="relative flex-1 min-h-[260px] sm:h-[340px] bg-slate-200">
          <MapContainer
            center={center}
            zoom={zoom}
            className="absolute inset-0 w-full h-full z-0"
            zoomControl={true}
            attributionControl={true}
          >
            {/* Attribuzione ODbL obbligatoria: le tile sono OpenStreetMap. */}
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              subdomains="abc"
              maxZoom={19}
            />
            <TapToPin onTap={(lat, lon) => setPin({ lat, lon })} />
            <FixSize />
            <FlyTo target={flyTarget} />
            {pin && <Marker position={[pin.lat, pin.lon]} />}
          </MapContainer>
          {pin && (
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-[400] px-3 py-1 rounded-full bg-black/60 text-white text-[10px] font-bold tabular-nums">
              {pin.lat.toFixed(5)}, {pin.lon.toFixed(5)}
            </div>
          )}
        </div>

        {/* Azioni */}
        <div className="px-5 pt-4 pb-6 space-y-2.5">
          <button
            onClick={useDevice}
            disabled={locating || deviceFailed}
            className="w-full flex items-center justify-center gap-2 py-3 bg-gray-100 text-gray-800 font-black text-sm rounded-2xl hover:bg-gray-200 active:scale-[0.98] transition-all disabled:opacity-40 disabled:active:scale-100"
          >
            {locating ? <Loader2 className="w-4 h-4 animate-spin" /> : <LocateFixed className="w-4 h-4" />}
            {t('vis_where_use_here')}
          </button>
          <button
            onClick={() => pin && onPick({ lat: pin.lat, lon: pin.lon, coordsSource: 'user_pin' })}
            disabled={!pin}
            className="w-full flex items-center justify-center gap-2 py-3.5 bg-primary text-white font-black text-sm rounded-2xl shadow-lg hover:bg-primary/90 active:scale-[0.98] transition-all disabled:opacity-40 disabled:active:scale-100"
          >
            <Check className="w-4 h-4" />
            {t('vis_where_confirm')}
          </button>
          <button
            onClick={() => onPick({ lat: null, lon: null, coordsSource: 'none' })}
            className="w-full py-2.5 text-gray-500 font-bold text-xs hover:text-gray-700 transition-colors"
          >
            {t('vis_where_skip')}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
