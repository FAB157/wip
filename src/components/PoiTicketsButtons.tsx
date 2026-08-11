import { useEffect, useState } from 'react';
import { Ticket } from 'lucide-react';
import { getApiUrl } from '../lib/api';
import { getTranslation, type Language } from '../lib/i18n';
import { isTouristicPoi } from './PoiContactButtons';

/**
 * Biglietti d'ingresso reali (Tiqets) nella scheda POI: prezzo, rating e link
 * di prenotazione GIÀ affiliato — il ?partner= viene appeso da Tiqets in base
 * al token server, quindi l'URL va aperto INTATTO, mai riscritto. Stesso
 * filtro turistico dei contatti (niente bar/utilità); best-effort: se non
 * c'è un biglietto pertinente non rende nulla.
 */

interface TicketItem {
  id: string;
  name: string;
  price: string;
  rating: string;
  url: string;
  venue?: string;
}

interface Props {
  poi: {
    id: string;
    lat?: number;
    lon?: number;
    name?: string;
    category?: string | null;
    poiType?: string | null;
    isGem?: boolean;
  };
  language: Language;
}

export default function PoiTicketsButtons({ poi, language }: Props) {
  const touristic = isTouristicPoi(poi.category, poi.poiType, poi.isGem);
  const [tickets, setTickets] = useState<TicketItem[]>([]);

  useEffect(() => {
    if (!touristic || !poi.lat || !poi.lon) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(getApiUrl('/api/poi/tickets'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            lat: poi.lat, lon: poi.lon, name: poi.name,
            lang: (language || 'IT').toLowerCase(),
          }),
        });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (!cancelled && Array.isArray(data.tickets)) setTickets(data.tickets.slice(0, 2));
      } catch { /* la scheda vive anche senza biglietti */ }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poi.id]);

  if (!touristic || tickets.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 my-3">
      {tickets.map((t) => (
        <a
          key={t.id}
          href={t.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-violet-600 text-white shadow-sm shadow-violet-600/20 active:scale-[0.98] transition-transform"
        >
          <Ticket className="w-5 h-5 shrink-0" />
          <span className="flex-1 min-w-0 text-left">
            <span className="block text-sm font-bold leading-tight truncate">{t.name}</span>
            <span className="block text-[11px] font-semibold text-violet-100/90">
              {t.price}{t.rating ? ` · ${t.rating}` : ''} · Tiqets
            </span>
          </span>
          <span className="text-xs font-black uppercase tracking-wide shrink-0">
            {getTranslation('poi_tickets_book', language)}
          </span>
        </a>
      ))}
    </div>
  );
}
