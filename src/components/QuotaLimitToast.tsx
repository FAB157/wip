import React, { useEffect } from 'react';
import { AlertTriangle, X, Zap, Clock } from 'lucide-react';
import { getTranslation, linguaCorrente } from '../lib/i18n';

interface QuotaLimitToastProps {
  feature: string;
  onClose: () => void;
  onUpgrade?: () => void;
  autoDismissMs?: number;
}

// Chiavi i18n al posto delle etichette fisse: tradotte al render.
const FEATURE_LABELS: Record<string, { labelKey: string; icon: string }> = {
  itinerary:     { labelKey: 'vr_b_ql_itinerary', icon: '🗺️' },
  audio_guide:   { labelKey: 'vr_b_ql_audio',     icon: '🎧' },
  poi_detail:    { labelKey: 'vr_b_ql_poi',       icon: '🏛️' },
  photo_search:  { labelKey: 'vr_b_ql_photo',     icon: '📸' },
  premium_guide: { labelKey: 'vr_b_ql_pdf',       icon: '📖' },
};

export default function QuotaLimitToast({ feature, onClose, onUpgrade, autoDismissMs = 6000 }: QuotaLimitToastProps) {
  const lingua = linguaCorrente();
  const known = FEATURE_LABELS[feature];
  const info = known
    ? { label: getTranslation(known.labelKey, lingua), icon: known.icon }
    : { label: feature, icon: '⚡' };

  useEffect(() => {
    const timer = setTimeout(onClose, autoDismissMs);
    return () => clearTimeout(timer);
  }, [autoDismissMs, onClose]);

  return (
    <div
      className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[9999] w-[calc(100%-2rem)] max-w-sm"
      style={{ animation: 'slideUpFade 0.35s cubic-bezier(0.34,1.56,0.64,1) both' }}
    >
      <style>{`
        @keyframes slideUpFade {
          from { opacity: 0; transform: translate(-50%, 24px); }
          to   { opacity: 1; transform: translate(-50%, 0);    }
        }
      `}</style>

      <div className="bg-white rounded-2xl shadow-2xl border border-orange-100 overflow-hidden">
        {/* Orange top bar */}
        <div className="h-1 bg-gradient-to-r from-orange-400 via-rose-400 to-pink-500" />

        <div className="p-4 flex gap-3 items-start">
          {/* Icon */}
          <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center text-lg flex-shrink-0 border border-orange-100">
            {info.icon}
          </div>

          {/* Text */}
          <div className="flex-1 min-w-0">
            <p className="font-black text-[13px] text-[#1e3a8a] leading-snug">
              {getTranslation('vr_b_ql_limit', lingua).replace('{label}', info.label)}
            </p>
            <p className="text-[11px] text-gray-500 font-medium mt-0.5 leading-snug flex items-center gap-1">
              <Clock className="w-3 h-3 inline-block flex-shrink-0" />
              {getTranslation('vr_b_ql_reset', lingua)}
            </p>

            {onUpgrade && (
              <button
                onClick={onUpgrade}
                className="mt-2.5 flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-orange-500 to-rose-500 text-white rounded-lg text-[11px] font-black uppercase tracking-wider shadow-sm hover:opacity-90 transition-opacity"
              >
                <Zap className="w-3 h-3" />
                {getTranslation('vr_b_ql_upgrade', lingua)}
              </button>
            )}
          </div>

          {/* Close */}
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg hover:bg-gray-100 flex items-center justify-center transition-colors flex-shrink-0"
            aria-label={getTranslation('close', lingua)}
          >
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        {/* Auto-dismiss progress bar */}
        <div className="h-0.5 bg-gray-100 mx-4 mb-3 rounded-full overflow-hidden">
          <div
            className="h-full bg-orange-300 rounded-full"
            style={{ animation: `shrink ${autoDismissMs}ms linear both` }}
          />
        </div>
        <style>{`
          @keyframes shrink {
            from { width: 100%; }
            to   { width: 0%;   }
          }
        `}</style>
      </div>
    </div>
  );
}

/**
 * Hook per gestire lo stato del toast da quota.
 * Usage:
 *   const { quotaToast, showQuotaToast, closeQuotaToast } = useQuotaToast();
 *   ...
 *   if (!canUse) { showQuotaToast('itinerary'); return; }
 *   ...
 *   {quotaToast && <QuotaLimitToast feature={quotaToast} onClose={closeQuotaToast} />}
 */
export function useQuotaToast() {
  const [quotaToast, setQuotaToast] = React.useState<string | null>(null);

  const showQuotaToast = (feature: string) => setQuotaToast(feature);
  const closeQuotaToast = () => setQuotaToast(null);

  return { quotaToast, showQuotaToast, closeQuotaToast };
}
