import { useEffect, useState } from 'react';
import { Phone, Globe, Clock, ChevronDown } from 'lucide-react';
import { getApiUrl } from '../lib/api';
import { getTranslation, type Language } from '../lib/i18n';

/**
 * Bottoni d'azione per i contatti di un POI (telefono / sito / orari), resi da
 * colonne strutturate di shared_pois — NON testo libero. Se il POI non ha
 * ancora i contatti li scarica una sola volta (on-demand, /api/poi/contacts,
 * OSM + Wikidata) e li mostra. Se non ci sono contatti pubblici, non rende
 * nulla (niente riga vuota).
 */
interface PoiContactsInput {
  id: string;
  lat?: number;
  lon?: number;
  name?: string;
  category?: string | null;
  poiType?: string | null;
  isGem?: boolean;
  wikidata?: string | null;
  contact_phone?: string | null;
  contact_website?: string | null;
  opening_hours_json?: { raw?: string } | null;
}

interface Props {
  poi: PoiContactsInput;
  language: Language;
}

// Contatti SOLO per le categorie turistico-culturali (musei, monumenti,
// chiese, siti archeologici, teatri, attrazioni gestite). NON per bar,
// ristoranti, negozi, servizi/utilità: lì telefono/orari sono meno pertinenti
// alla scoperta e affollerebbero la scheda. Blocklist esplicita del
// commerciale/servizio; tutto il resto (culturale) passa.
const NON_TOURISTIC_CATEGORIES = new Set(['locali', 'utilita']);
const NON_TOURISTIC_TYPES = new Set([
  'restaurant', 'cafe', 'bar', 'pub', 'fast_food', 'pharmacy', 'hospital',
  'police', 'taxi', 'station', 'subway_entrance', 'toll_booth', 'drinking_water',
  'marketplace', 'mercato', 'playground', 'information', 'tourism_information', 'office',
]);
export function isTouristicPoi(category?: string | null, poiType?: string | null, isGem?: boolean): boolean {
  if (isGem) return true;
  if (NON_TOURISTIC_CATEGORIES.has(String(category || '').toLowerCase())) return false;
  if (NON_TOURISTIC_TYPES.has(String(poiType || '').toLowerCase())) return false;
  return true;
}

export default function PoiContactButtons({ poi, language }: Props) {
  const touristic = isTouristicPoi(poi.category, poi.poiType, poi.isGem);
  const [phone, setPhone] = useState<string | null>(poi.contact_phone || null);
  const [website, setWebsite] = useState<string | null>(poi.contact_website || null);
  const [hours, setHours] = useState<string | null>(poi.opening_hours_json?.raw || null);
  const [hoursOpen, setHoursOpen] = useState(false);

  useEffect(() => {
    // Solo POI turistico-culturali; se abbiamo già un contatto dal DB, niente fetch.
    const alreadyHas = poi.contact_phone || poi.contact_website || poi.opening_hours_json?.raw;
    if (!touristic || alreadyHas || !poi.id) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(getApiUrl('/api/poi/contacts'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            poiId: poi.id, lat: poi.lat, lon: poi.lon, name: poi.name, wikidata: poi.wikidata,
          }),
        });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (cancelled) return;
        if (data.phone) setPhone(data.phone);
        if (data.website) setWebsite(data.website);
        if (data.opening_hours) setHours(data.opening_hours);
      } catch { /* best-effort: la scheda funziona anche senza contatti */ }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poi.id]);

  if (!touristic) return null;
  if (!phone && !website && !hours) return null;

  const telHref = phone ? `tel:${phone.replace(/\s+/g, '')}` : undefined;
  const siteHref = website
    ? (website.startsWith('http') ? website : `https://${website}`)
    : undefined;
  const siteLabel = website ? website.replace(/^https?:\/\//, '').replace(/\/$/, '') : '';

  return (
    <div className="flex flex-col gap-2 my-3">
      <div className="flex flex-wrap gap-2">
        {phone && (
          <a
            href={telHref}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-emerald-500 text-white font-bold text-sm shadow-sm shadow-emerald-500/20 active:scale-95 transition-transform"
          >
            <Phone className="w-4 h-4" />
            {getTranslation('contact_call', language)}
          </a>
        )}
        {website && (
          <a
            href={siteHref}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-blue-600 text-white font-bold text-sm shadow-sm shadow-blue-600/20 active:scale-95 transition-transform max-w-full"
          >
            <Globe className="w-4 h-4 shrink-0" />
            <span className="truncate max-w-[9rem]">{getTranslation('contact_site', language)}</span>
          </a>
        )}
        {hours && (
          <button
            onClick={() => setHoursOpen(o => !o)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-amber-100 text-amber-800 font-bold text-sm active:scale-95 transition-transform"
          >
            <Clock className="w-4 h-4" />
            {getTranslation('contact_hours', language)}
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${hoursOpen ? 'rotate-180' : ''}`} />
          </button>
        )}
      </div>
      {hours && hoursOpen && (
        <div className="text-xs font-semibold text-gray-600 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 whitespace-pre-line">
          {hours}
        </div>
      )}
    </div>
  );
}
