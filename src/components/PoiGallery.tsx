import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getTranslation, linguaCorrente } from '../lib/i18n';
import { fotoMiniatura, fotoPiena } from '../lib/fotoUrl';

/**
 * Galleria community della scheda POI: le foto Vision approvate e accorpate
 * sul POI (images_json di shared_pois — sia POI community sia POI ufficiali
 * con foto allegate). Fetch on-demand all'apertura della scheda: i payload
 * della mappa non trasportano la galleria. Senza foto non rende nulla.
 *
 * NIENTE RIGA DI CREDITO QUI, e non e' una dimenticanza (25/08/2026). Queste
 * sono le foto degli utenti, non quelle di Wikimedia Commons: l'obbligo di
 * citare l'autore nasce da CC BY-SA e riguarda le immagini prese da Commons,
 * che stanno in `image_url` e hanno la loro attribuzione. Qui vale la regola
 * opposta, decisa per WIP Community: ANONIMATO TOTALE, nessun nome accanto
 * agli scatti. Aggiungere un credito «per simmetria» la violerebbe.
 */
export default function PoiGallery({ poiId }: { poiId: string }) {
  const [images, setImages] = useState<{ url: string }[]>([]);
  const [openIndex, setOpenIndex] = useState<number | null>(null);

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

  const goTo = (delta: number) => {
    setOpenIndex(prev => {
      if (prev === null) return prev;
      return (prev + delta + images.length) % images.length;
    });
  };

  return (
    <div className="my-3">
      <p className="text-[9px] font-black uppercase tracking-widest text-gray-500 mb-2">
        📸 {getTranslation('vr_b_pg_title', linguaCorrente())} · {images.length}
      </p>
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {images.map((img, i) => (
          <button
            key={`${img.url}-${i}`}
            type="button"
            onClick={() => setOpenIndex(i)}
            className="shrink-0 active:scale-95 transition-transform"
            aria-label={getTranslation('vr_b_pg_open', linguaCorrente()).replace('{i}', String(i + 1)).replace('{n}', String(images.length))}
          >
            {/* Miniatura vera: 96×128 sullo schermo scaricavano l'immagine
                intera (24/08/2026). Su Wikimedia sono ~30 KB invece di ~200,
                e in una galleria da sei scatti la differenza e' un megabyte. */}
            <img
              src={fotoMiniatura(img.url) || undefined}
              alt=""
              loading="lazy"
              decoding="async"
              className="h-24 w-32 object-cover rounded-xl border border-gray-100 shadow-sm"
            />
          </button>
        ))}
      </div>

      {/* Gallery a schermo intero: prima ogni foto apriva una scheda esterna
          del browser; con più scatti l'utente non aveva modo di sfogliarli
          dentro l'app. */}
      <AnimatePresence>
        {openIndex !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[2100] bg-black/90 flex items-center justify-center"
            onClick={() => setOpenIndex(null)}
          >
            <button
              onClick={() => setOpenIndex(null)}
              aria-label={getTranslation('vr_b_pg_close', linguaCorrente())}
              className="absolute top-4 right-4 p-2.5 bg-white/10 hover:bg-white/20 rounded-full text-white backdrop-blur-md"
            >
              <X className="w-5 h-5" />
            </button>

            {images.length > 1 && (
              <button
                onClick={(e) => { e.stopPropagation(); goTo(-1); }}
                aria-label={getTranslation('vr_b_pg_prev', linguaCorrente())}
                className="absolute left-2 sm:left-4 p-2.5 bg-white/10 hover:bg-white/20 rounded-full text-white backdrop-blur-md"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
            )}

            <motion.img
              key={openIndex}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              /* A schermo intero serve la risoluzione piena della scheda: qui
                 la foto si guarda, non si sbircia. */
              src={fotoPiena(images[openIndex].url) || undefined}
              alt=""
              className="max-w-[92vw] max-h-[80vh] object-contain rounded-lg"
              onClick={(e) => e.stopPropagation()}
            />

            {images.length > 1 && (
              <button
                onClick={(e) => { e.stopPropagation(); goTo(1); }}
                aria-label={getTranslation('vr_b_pg_next', linguaCorrente())}
                className="absolute right-2 sm:right-4 p-2.5 bg-white/10 hover:bg-white/20 rounded-full text-white backdrop-blur-md"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            )}

            {images.length > 1 && (
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 px-3 py-1 bg-white/10 rounded-full text-white text-xs font-bold backdrop-blur-md">
                {openIndex + 1} / {images.length}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
