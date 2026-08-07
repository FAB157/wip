import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle, ShieldAlert, ThumbsUp, Lightbulb, ChevronDown, ChevronUp } from 'lucide-react';
import { getTranslation, Language } from '../../lib/i18n';

interface TravelInfoProps {
  info: {
    zone_da_evitare?: string[];
    raccomandazioni?: string[];
    suggerimenti?: string[];
    precauzioni?: string[];
  };
  language: Language;
}

export default function TravelInfo({ info, language }: TravelInfoProps) {
  const [expanded, setExpanded] = React.useState(false);

  const hasContent =
    (info.zone_da_evitare?.length ?? 0) > 0 ||
    (info.raccomandazioni?.length ?? 0) > 0 ||
    (info.suggerimenti?.length ?? 0) > 0 ||
    (info.precauzioni?.length ?? 0) > 0;

  if (!hasContent) return null;

  const sections = [
    {
      key: 'zone_da_evitare',
      label: getTranslation('areas_to_avoid', language),
      icon: <AlertTriangle className="w-4 h-4" />,
      items: info.zone_da_evitare || [],
      bg: 'bg-red-50',
      border: 'border-red-200',
      iconBg: 'bg-red-100 text-red-600',
      bullet: 'bg-red-400',
    },
    {
      key: 'precauzioni',
      label: getTranslation('precautions', language),
      icon: <ShieldAlert className="w-4 h-4" />,
      items: info.precauzioni || [],
      bg: 'bg-orange-50',
      border: 'border-orange-200',
      iconBg: 'bg-orange-100 text-orange-600',
      bullet: 'bg-orange-400',
    },
    {
      key: 'raccomandazioni',
      label: getTranslation('recommendations', language),
      icon: <ThumbsUp className="w-4 h-4" />,
      items: info.raccomandazioni || [],
      bg: 'bg-blue-50',
      border: 'border-blue-200',
      iconBg: 'bg-blue-100 text-blue-600',
      bullet: 'bg-blue-400',
    },
    {
      key: 'suggerimenti',
      label: getTranslation('tips', language),
      icon: <Lightbulb className="w-4 h-4" />,
      items: info.suggerimenti || [],
      bg: 'bg-emerald-50',
      border: 'border-emerald-200',
      iconBg: 'bg-emerald-100 text-emerald-600',
      bullet: 'bg-emerald-400',
    },
  ].filter(s => s.items.length > 0);

  return (
    <div className="bg-white rounded-[2rem] border border-amber-200 shadow-sm overflow-hidden print:hidden mb-2">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between gap-3 p-5 hover:bg-amber-50/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-amber-100 flex items-center justify-center shrink-0">
            <span className="text-xl">🧭</span>
          </div>
          <div className="text-left">
            <h3 className="font-black text-primary text-sm">
              {getTranslation('travel_info', language)}
            </h3>
            <p className="text-[11px] text-on-surface-variant/60 font-bold">
              {getTranslation('travel_info_desc', language)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] font-black uppercase tracking-widest bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
            {sections.length} {getTranslation('sections_count', language)}
          </span>
          {expanded ? <ChevronUp className="w-4 h-4 text-primary/50" /> : <ChevronDown className="w-4 h-4 text-primary/50" />}
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {sections.map(section => (
                <div
                  key={section.key}
                  className={`rounded-2xl border p-4 ${section.bg} ${section.border}`}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <span className={`w-7 h-7 rounded-xl flex items-center justify-center ${section.iconBg}`}>
                      {section.icon}
                    </span>
                    <h4 className="font-black text-xs text-primary uppercase tracking-wider">
                      {section.label}
                    </h4>
                  </div>
                  <ul className="space-y-2">
                    {section.items.map((item, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs font-medium text-on-surface-variant/80 leading-relaxed">
                        <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${section.bullet}`} />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
