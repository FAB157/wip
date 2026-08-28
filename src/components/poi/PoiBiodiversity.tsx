import React, { useEffect, useState } from 'react';
import { PawPrint } from 'lucide-react';
import { getApiUrl } from '../../lib/api';
import { getTranslation, Language } from '../../lib/i18n';

// Stessi valori di PARCHI_TYPES in src/lib/poiTaxonomy.ts — solo i parchi
// (richiesta utente 28/08/2026: "aggiungi le biodiversità nella scheda dei
// parchi relativi"), non l'intera macro natura.
const PARCHI_TYPES = new Set([
  'park', 'parchi', 'parco', 'garden', 'giardino', 'botanical_garden',
  'nature_reserve', 'riserva', 'geopark', 'forest', 'foresta', 'wood',
  'bosco', 'desert', 'deserto', 'national_park',
]);

interface Specie {
  specie: string;
  regno: string | null;
  foto_url: string;
  foto_autore: string | null;
  foto_fonte: string | null;
  data_avvistamento: string | null;
}

interface PoiBiodiversityProps {
  poi: any;
  language: Language;
}

/**
 * Specie avvistate vicino al parco, da GBIF (foto già filtrate per licenza
 * sicura lato server — vedi server.ts /api/biodiversita/vicino).
 */
export default function PoiBiodiversity({ poi, language }: PoiBiodiversityProps) {
  const [specie, setSpecie] = useState<Specie[] | null>(null);

  const categoria = String(poi?.category || '').toLowerCase();
  const attivo = PARCHI_TYPES.has(categoria) && Number.isFinite(poi?.lat) && Number.isFinite(poi?.lon);

  useEffect(() => {
    if (!attivo) { setSpecie(null); return; }
    let annullato = false;
    fetch(getApiUrl(`/api/biodiversita/vicino?lat=${poi.lat}&lon=${poi.lon}`))
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (!annullato) setSpecie(data?.specie || []); })
      .catch(() => { if (!annullato) setSpecie([]); });
    return () => { annullato = true; };
  }, [attivo, poi?.lat, poi?.lon]);

  if (!attivo || !specie || specie.length === 0) return null;

  return (
    <div className="mb-6 bg-white p-5 rounded-[2rem] border border-emerald-100/50 shadow-sm">
      <h4 className="text-[10px] font-black uppercase text-[#1e3a8a] mb-1 flex items-center gap-2">
        <PawPrint className="w-4 h-4" />
        {getTranslation('sk_biodiversita', language)}
      </h4>
      <p className="text-[11px] text-[#1e3a8a]/50 mb-3">{getTranslation('sk_biodiversita_fonte', language)}</p>
      <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
        {specie.map((s) => (
          <div key={s.specie} className="shrink-0 w-28">
            <div className="w-28 h-28 rounded-2xl overflow-hidden bg-[#f8f5f0]">
              <img src={s.foto_url} alt={s.specie} loading="lazy" className="w-full h-full object-cover" />
            </div>
            <div className="mt-1.5 text-[11px] font-bold text-[#1e3a8a] italic leading-tight line-clamp-2">{s.specie}</div>
            {s.foto_autore && (
              <div className="text-[9px] text-[#1e3a8a]/40 truncate">
                © {s.foto_autore}{s.foto_fonte ? ` / ${s.foto_fonte}` : ''}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
