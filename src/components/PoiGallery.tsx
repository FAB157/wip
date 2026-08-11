import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Galleria community della scheda POI: le foto Vision approvate e accorpate
 * sul POI (images_json di shared_pois — sia POI community sia POI ufficiali
 * con foto allegate). Fetch on-demand all'apertura della scheda: i payload
 * della mappa non trasportano la galleria. Senza foto non rende nulla.
 */
export default function PoiGallery({ poiId }: { poiId: string }) {
  const [images, setImages] = useState<{ url: string }[]>([]);

  useEffect(() => {
    if (!poiId) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase
          .from('shared_pois')
          .select('images_json')
          .eq('id', poiId)
          .maybeSingle();
        if (cancelled) return;
        const raw = (data as any)?.images_json;
        const arr = Array.isArray(raw) ? raw : JSON.parse(raw || '[]');
        setImages(arr.filter((i: any) => i && typeof i.url === 'string'));
      } catch { /* niente galleria: la scheda vive lo stesso */ }
    })();
    return () => { cancelled = true; };
  }, [poiId]);

  if (images.length === 0) return null;

  return (
    <div className="my-3">
      <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 mb-2">
        📸 Scatti della community · {images.length}
      </p>
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {images.map((img, i) => (
          <a key={`${img.url}-${i}`} href={img.url} target="_blank" rel="noopener noreferrer" className="shrink-0 active:scale-95 transition-transform">
            <img
              src={img.url}
              alt=""
              loading="lazy"
              className="h-24 w-32 object-cover rounded-xl border border-gray-100 shadow-sm"
            />
          </a>
        ))}
      </div>
    </div>
  );
}
