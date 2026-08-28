import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle, Check, Info, X } from 'lucide-react';
import { TOAST_EVENT, ToastDetail } from '../lib/toast';
import { getTranslation, Language } from '../lib/i18n';

/**
 * Renderer unico delle notifiche in-app (vedi lib/toast.ts).
 * Va montato una sola volta, in App.tsx.
 */
export default function ToastHost({ language = 'IT' as Language }: { language?: Language }) {
  const [items, setItems] = useState<ToastDetail[]>([]);

  const dismiss = useCallback((id: number) => {
    setItems(prev => prev.filter(t => t.id !== id));
  }, []);

  useEffect(() => {
    const timers = new Map<number, any>();

    const onToast = (e: Event) => {
      const detail = (e as CustomEvent<ToastDetail>).detail;
      if (!detail?.text) return;
      // Massimo 3 in pila: oltre, la schermata diventa illeggibile.
      setItems(prev => [...prev.slice(-2), detail]);
      timers.set(detail.id, setTimeout(() => dismiss(detail.id), detail.duration || 6000));
    };

    window.addEventListener(TOAST_EVENT, onToast);
    return () => {
      window.removeEventListener(TOAST_EVENT, onToast);
      timers.forEach(t => clearTimeout(t));
    };
  }, [dismiss]);

  if (items.length === 0) return null;

  return (
    // bottom con safe-area (UX-12): su iPhone `bottom-24` fisso finiva a
    // ridosso della gesture bar.
    <div className="fixed bottom-[calc(6rem+env(safe-area-inset-bottom,0px))] left-1/2 -translate-x-1/2 z-[9999] w-[calc(100%-2rem)] max-w-sm flex flex-col gap-2 print:hidden pointer-events-none">
      <AnimatePresence initial={false}>
        {items.map(t => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.97 }}
            transition={{ type: 'tween', duration: 0.2, ease: 'easeOut' }}
            role="status"
            aria-live="polite"
            className="pointer-events-auto"
          >
            <div className={`rounded-2xl shadow-2xl border overflow-hidden bg-white ${
              t.tone === 'error' ? 'border-red-200' : t.tone === 'success' ? 'border-emerald-200' : 'border-blue-200'
            }`}>
              <div className={`h-1 ${
                t.tone === 'error' ? 'bg-red-500' : t.tone === 'success' ? 'bg-emerald-500' : 'bg-blue-500'
              }`} />
              <div className="p-4 flex gap-3 items-start">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                  t.tone === 'error' ? 'bg-red-50 text-red-600'
                    : t.tone === 'success' ? 'bg-emerald-50 text-emerald-600'
                    : 'bg-blue-50 text-blue-600'
                }`}>
                  {t.tone === 'error' ? <AlertTriangle className="w-4 h-4" />
                    : t.tone === 'success' ? <Check className="w-4 h-4" />
                    : <Info className="w-4 h-4" />}
                </div>
                <p className="flex-1 text-[13px] font-bold text-gray-800 leading-snug pt-1.5 break-words">{t.text}</p>
                <button
                  type="button"
                  onClick={() => dismiss(t.id)}
                  aria-label={getTranslation('close', language)}
                  className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center transition-colors shrink-0"
                >
                  <X className="w-4 h-4 text-gray-500" />
                </button>
              </div>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
