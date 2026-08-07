import React from 'react';
import { User, Calendar, Sparkles } from 'lucide-react';
import { getTranslation, Language } from '../../lib/i18n';

interface PoiExtraDetailsProps {
  poi: any;
  language: Language;
}

export default function PoiExtraDetails({ poi, language }: PoiExtraDetailsProps) {
  if (!poi.isVision) return null;
  if (!poi.autore && !poi.anno_produzione && !poi.curiosita && !poi.description) return null;

  return (
    <div className="mb-6 bg-white p-5 rounded-[2rem] border border-amber-100/50 shadow-sm">
      <h4 className="text-[10px] font-black uppercase text-[#1e3a8a] mb-4">
        Dettagli dell'Opera
      </h4>
      <div className="space-y-4">
        {poi.description && (
          <div className="text-sm text-[#1e3a8a]/90 leading-relaxed bg-[#f8f5f0]/30 p-4 rounded-xl italic mb-2">
             {poi.description}
          </div>
        )}
        {poi.autore && (
          <div className="flex items-start gap-3 text-sm">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
               <User className="w-4 h-4" />
            </div>
            <div><span className="block font-bold">{getTranslation("author", language)}</span> <span className="text-[#1e3a8a]/80 leading-snug">{poi.autore}</span></div>
          </div>
        )}
        {poi.anno_produzione && (
          <div className="flex items-start gap-3 text-sm">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
               <Calendar className="w-4 h-4" />
            </div>
            <div><span className="block font-bold">{getTranslation("period", language)}</span> <span className="text-[#1e3a8a]/80 leading-snug">{poi.anno_produzione}</span></div>
          </div>
        )}
        {poi.curiosita && (
          <div className="flex items-start gap-3 text-sm">
            <div className="w-8 h-8 rounded-full bg-secondary/10 flex items-center justify-center text-secondary shrink-0">
               <Sparkles className="w-4 h-4" />
            </div>
            <div><span className="block font-bold">{getTranslation("curiosity", language)}</span> <span className="text-[#1e3a8a]/80 leading-snug">{poi.curiosita}</span></div>
          </div>
        )}
      </div>
    </div>
  );
}
