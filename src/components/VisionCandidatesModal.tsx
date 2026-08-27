import { useEffect } from 'react';
import { motion } from 'motion/react';
import { X, Loader2, HelpCircle, ChevronRight } from 'lucide-react';
import { Language, getTranslation } from '../lib/i18n';

interface VisionCandidatesModalProps {
  /** Data URL della foto analizzata (anteprima in testa). */
  image: string;
  /** Nomi alternativi reali proposti dal server (0-3, solo con confidenza < 70). */
  candidates: string[];
  /** Nome riconosciuto dal modello (mostrato come contesto, opzionale). */
  recognizedName?: string | null;
  /** true mentre /api/vision/choose riscrive la scheda. */
  busy: boolean;
  language: Language;
  onChoose: (name: string) => void;
  onKeep: () => void;
}

/**
 * «Non sono sicuro: quale di questi è?» — quando il riconoscimento ha
 * confidenza bassa il server allega fino a 3 candidati reali (Wikipedia/DB
 * vicini). L'utente ne sceglie uno e la scheda viene riscritta gratis su
 * quel soggetto; "Tieni la scheda così" mantiene il risultato originale.
 */
export default function VisionCandidatesModal({ image, candidates, recognizedName, busy, language, onChoose, onKeep }: VisionCandidatesModalProps) {
  const t = (key: string) => getTranslation(key, language);

  // Esc = tieni la scheda così (non mentre riscrive)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) { e.preventDefault(); onKeep(); }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [busy, onKeep]);

  return (
    <div className="fixed inset-0 z-[2600] bg-black/70 backdrop-blur-sm flex items-end sm:items-center sm:justify-center">
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={t('vis_cand_title')}
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', damping: 26, stiffness: 300 }}
        className="bg-white w-full sm:max-w-md max-h-[92vh] rounded-t-[2rem] sm:rounded-[2rem] overflow-hidden flex flex-col shadow-2xl"
      >
        {/* Anteprima foto */}
        <div className="relative h-36 shrink-0 bg-slate-200">
          <img src={image} alt="" className="w-full h-full object-cover" />
          <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/70 to-transparent" />
          <button
            onClick={onKeep}
            disabled={busy}
            aria-label={t('vis_close')}
            className="absolute top-3 right-3 w-9 h-9 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center text-white active:scale-90 transition-transform disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
          {recognizedName ? (
            <div className="absolute bottom-2 left-4 right-4 flex items-center gap-2 text-white">
              <HelpCircle className="w-4 h-4" />
              <span className="text-xs font-black uppercase tracking-wider drop-shadow truncate">{recognizedName}</span>
            </div>
          ) : null}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          <h2 className="text-lg font-black text-gray-900 leading-tight mb-1">{t('vis_cand_title')}</h2>
          <p className="text-xs text-gray-500 font-medium leading-relaxed mb-4">{t('vis_cand_desc')}</p>

          {busy ? (
            <div className="flex flex-col items-center justify-center py-8 gap-3 text-gray-600">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-sm font-black">{t('vis_cand_rewriting')}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {candidates.map((name, i) => (
                <button
                  key={`${i}-${name}`}
                  onClick={() => onChoose(name)}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl bg-[#f8f5f0] border border-gray-200 text-left hover:border-primary/50 active:scale-[0.98] transition-all"
                >
                  <span className="w-7 h-7 shrink-0 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-black">{i + 1}</span>
                  <span className="flex-1 min-w-0 text-sm font-black text-gray-900 truncate">{name}</span>
                  <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="px-5 pb-6 pt-2">
          <button
            onClick={onKeep}
            disabled={busy}
            className="w-full py-3 bg-gray-100 text-gray-700 font-black text-sm rounded-2xl hover:bg-gray-200 transition-colors disabled:opacity-50"
          >
            {t('vis_cand_keep')}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
