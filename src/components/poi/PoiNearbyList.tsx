import React from 'react';
import { motion } from 'motion/react';
import { X } from 'lucide-react';
import { getTranslation, Language } from '../../lib/i18n';
import { CATEGORY_COLORS, CATEGORY_EMOJIS } from '../../lib/mapConstants';
import { getDistanceFromLatLonInM } from '../MapArea';

interface PoiNearbyListProps {
  poi: any;
  nearbyPois: any[];
  language: Language;
  onClose: () => void;
  onSelect: (p: any) => void;
}

export default function PoiNearbyList({
  poi,
  nearbyPois,
  language,
  onClose,
  onSelect
}: PoiNearbyListProps) {
  return (
    <motion.div
      initial={{ y: "100%" }}
      animate={{ y: 0 }}
      exit={{ y: "100%" }}
      className="absolute inset-0 bg-[#f8f5f0] z-[2001] flex flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
    >
      <div className="px-6 pt-5 pb-4 border-b border-amber-100/50 flex items-center justify-between sticky top-0 bg-[#f8f5f0] z-10">
        <div>
          <h2 className="text-xl font-black text-[#1e3a8a] tracking-tight leading-none">
            Vicino a te
          </h2>
          <p className="text-[10px] font-bold text-[#1e3a8a] uppercase tracking-widest mt-1.5 opacity-60">
            Attrazioni nei dintorni
          </p>
        </div>
        <button
          onClick={onClose}
          className="p-2 bg-secondary/5 hover:bg-secondary/10 text-secondary rounded-full transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto pt-4 px-4 pb-[calc(2rem+env(safe-area-inset-bottom))] space-y-3 custom-scrollbar">
        {nearbyPois.map((p, idx) => (
          <motion.button
            key={`${p.id}-${idx}`}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: idx * 0.05 }}
            onClick={() => onSelect(p)}
            className="w-full flex items-center gap-4 p-3 bg-white border border-stone-100 hover:border-primary/20 rounded-2xl transition-all group shadow-sm text-left"
          >
            <div
              className={`w-12 h-12 rounded-xl ${CATEGORY_COLORS[p.category] || "bg-[#fdfbf7]"} flex items-center justify-center text-xl shadow-sm grayscale-[0.2] group-hover:grayscale-0 transition-all`}
            >
              {CATEGORY_EMOJIS[p.category] || "📍"}
            </div>
            <div className="flex-1 text-left">
              <h3 className="font-black text-[#1e3a8a] text-sm line-clamp-1 leading-tight group-hover:text-primary transition-colors">
                {p.name || "Attrazione"}
              </h3>
              <p className="text-[10px] font-extrabold text-[#1e3a8a] uppercase tracking-wider mt-0.5 opacity-60">
                {p.category}
              </p>
            </div>
            <div className="text-[10px] font-black text-secondary bg-secondary/5 px-2 py-1 rounded-md">
              {Math.round(getDistanceFromLatLonInM(poi.lat, poi.lon, p.lat, p.lon))}m
            </div>
          </motion.button>
        ))}
      </div>
    </motion.div>
  );
}
