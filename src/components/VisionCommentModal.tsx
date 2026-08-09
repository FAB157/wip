import { useState } from 'react';
import { motion } from 'motion/react';
import { X, Camera, Loader2, Send, Sparkles } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getApiUrl } from '../lib/api';
import { notify } from '../lib/toast';
import { Language } from '../lib/i18n';

// Opzioni selezionabili per il racconto "perché è speciale": arrivano
// nella coda di revisione WIP Community come comment_tags.
const TAG_OPTIONS = [
  'Panorama speciale',
  'Angolo nascosto',
  'Arte di strada',
  'Tradizione locale',
  'Natura',
  'Ricordo di viaggio',
];

interface VisionCommentModalProps {
  cardId: string | null;
  image: string;
  /** Esito reale del rimborso server (non un messaggio fisso). */
  refunded?: boolean;
  language: Language;
  onClose: () => void;
}

/**
 * Mostrata quando l'AI non riconosce la foto: i crediti sono già stati
 * rimborsati dal server e la scheda è comunque salvata in My Vision.
 * Qui l'utente racconta perché il posto è speciale — il commento e i tag
 * finiscono sulla sua scheda e aiutano la revisione WIP Community.
 */
export default function VisionCommentModal({ cardId, image, refunded = true, onClose }: VisionCommentModalProps) {
  const [tags, setTags] = useState<string[]>([]);
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);

  const toggleTag = (t: string) =>
    setTags(prev => (prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]));

  const submit = async () => {
    if (!cardId || (tags.length === 0 && !comment.trim())) {
      onClose();
      return;
    }
    setSending(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      const res = await fetch(getApiUrl('/api/vision/comment'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ cardId, comment: comment.trim(), tags }),
      });
      if (!res.ok) throw new Error('invio fallito');
      notify('Grazie! Il tuo racconto aiuterà la revisione della foto.');
      try { window.dispatchEvent(new CustomEvent('wip-vision-updated')); } catch {}
    } catch {
      notify('Invio non riuscito: la foto resta comunque salvata in My Vision.');
    } finally {
      setSending(false);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-[2600] bg-black/70 backdrop-blur-sm flex items-end sm:items-center sm:justify-center">
      <motion.div
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', damping: 26, stiffness: 300 }}
        className="bg-white w-full sm:max-w-md max-h-[92vh] rounded-t-[2rem] sm:rounded-[2rem] overflow-hidden flex flex-col shadow-2xl"
      >
        {/* Anteprima foto */}
        <div className="relative h-36 shrink-0 bg-slate-200">
          <img src={image} alt="La tua foto" className="w-full h-full object-cover" />
          <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/70 to-transparent" />
          <button
            onClick={onClose}
            className="absolute top-3 right-3 w-9 h-9 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center text-white active:scale-90 transition-transform"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="absolute bottom-2 left-4 right-4 flex items-center gap-2 text-white">
            <Camera className="w-4 h-4" />
            <span className="text-xs font-black uppercase tracking-wider drop-shadow">Salvata in My Vision</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          <h2 className="text-lg font-black text-gray-900 leading-tight mb-1">
            Non l'ho riconosciuta… ma di sicuro è speciale!
          </h2>
          <p className="text-xs text-gray-500 font-medium leading-relaxed mb-4">
            {refunded
              ? <>I tuoi crediti sono stati <span className="font-black text-emerald-600">rimborsati</span> e la foto è salvata in My Vision. </>
              : <>La foto è salvata in My Vision. </>}
            Raccontaci perché questo posto è speciale: il tuo racconto aiuterà la revisione per WIP Community.
          </p>

          <div className="flex flex-wrap gap-2 mb-4">
            {TAG_OPTIONS.map(t => (
              <button
                key={t}
                onClick={() => toggleTag(t)}
                className={`px-3 py-1.5 rounded-full text-[11px] font-bold border transition-all active:scale-95 ${
                  tags.includes(t)
                    ? 'bg-primary text-white border-primary shadow-sm'
                    : 'bg-[#f8f5f0] text-gray-600 border-gray-200 hover:border-gray-300'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          <textarea
            value={comment}
            onChange={e => setComment(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="Scrivi qualcosa su questo posto… (facoltativo)"
            className="w-full bg-[#f8f5f0] border border-gray-200 rounded-2xl p-3 text-sm text-gray-800 font-medium placeholder:text-gray-400 focus:outline-none focus:border-primary/50 resize-none"
          />
        </div>

        <div className="px-5 pb-6 pt-2 flex gap-3">
          <button
            onClick={onClose}
            disabled={sending}
            className="flex-1 py-3 bg-gray-100 text-gray-600 font-black text-sm rounded-2xl hover:bg-gray-200 transition-colors disabled:opacity-50"
          >
            Salta
          </button>
          <button
            onClick={submit}
            disabled={sending || (tags.length === 0 && !comment.trim())}
            className="flex-[2] py-3 bg-primary text-white font-black text-sm rounded-2xl shadow-lg hover:bg-primary/90 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Invia il racconto
          </button>
        </div>

        <p className="px-5 pb-4 -mt-2 text-[10px] text-gray-400 text-center flex items-center justify-center gap-1">
          <Sparkles className="w-3 h-3" />
          Se la foto verrà approvata diventerà un luogo WIP Community
        </p>
      </motion.div>
    </div>
  );
}
