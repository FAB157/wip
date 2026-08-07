import React from 'react';
import { motion } from 'motion/react';
import {
  Coins, MessageSquare, Info, Camera, Map,
  Headphones, Volume2, BookOpen, ShieldCheck, Zap
} from 'lucide-react';
import { Language } from '../lib/i18n';
import { PRICING_LIST } from '../lib/pricing';

interface PriceListProps {
  language: Language;
  /** Apre lo shop crediti (tab pricing): senza, la pagina era un vicolo cieco */
  onOpenShop?: () => void;
}

export default function PriceList({ language, onOpenShop }: PriceListProps) {
  const isItalian = language === 'IT';

  return (
    <div className="space-y-6 pb-20">
      <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm">
        <div className="flex items-center gap-4 mb-8 border-b border-gray-100 pb-6">
          <div className="w-14 h-14 bg-amber-500 rounded-2xl flex items-center justify-center text-slate-900 shadow-lg shadow-amber-500/20">
            <Coins className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-gray-900">{isItalian ? "Listino Servizi" : "Service Prices"}</h2>
            <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">{isItalian ? "Trasparenza totale sui consumi" : "Full transparency on usage"}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4">
          {/* Prezzi da PRICING_LIST: la copia hardcoded si desincronizzava
              al primo cambio di listino */}
          <PriceItem
            icon={<MessageSquare className="w-5 h-5" />}
            name="Wip - Esperto Viaggi"
            price={String(PRICING_LIST.chat_session)}
            unit="10 messaggi"
            desc={isItalian ? "Ogni itinerario include 10 messaggi gratis; poi 3 crediti ogni 10 messaggi. Nelle schede dei luoghi la chat parte dal pacchetto a crediti." : "Every itinerary includes 10 free messages; then 3 credits per 10 messages. In place sheets the chat starts from the credit pack."}
          />
          <PriceItem
            icon={<Info className="w-5 h-5" />}
            name="Dettagli POI"
            price={String(PRICING_LIST.poi_detail)}
            unit="per luogo"
            desc={isItalian ? "Arricchimento dettagliato di un monumento con dati storici e curiosità." : "Detailed enrichment of a monument with historical data and trivia."}
          />
          <PriceItem
            icon={<Camera className="w-5 h-5" />}
            name="Vision AI"
            price={String(PRICING_LIST.photo_search)}
            unit="per scansione"
            desc={isItalian ? "Riconoscimento istantaneo di monumenti tramite la fotocamera." : "Instant recognition of monuments via camera."}
          />
          <PriceItem
            icon={<Map className="w-5 h-5" />}
            name="Itinerario AI"
            price={String(PRICING_LIST.itinerary_daily)}
            unit="al giorno"
            desc={isItalian ? "Creazione di un percorso su misura ottimizzato per i tuoi interessi." : "Creation of a tailored route optimized for your interests."}
          />
          <PriceItem
            icon={<Headphones className="w-5 h-5" />}
            name="Audioguida"
            price={String(PRICING_LIST.audio_guide)}
            unit="per luogo"
            desc={isItalian ? "Narrazione vocale immersiva (Nicky o Dante) del punto di interesse." : "Immersive voice narration (Nicky or Dante) of the POI."}
          />
          <PriceItem
            icon={<Volume2 className="w-5 h-5" />}
            name="Podcast AI"
            price={String(PRICING_LIST.podcast_daily)}
            unit="al giorno"
            desc={isItalian ? "Sintesi vocale completa di tutto il tuo itinerario giornaliero." : "Full voice summary of your entire daily itinerary."}
          />
          <PriceItem
            icon={<BookOpen className="w-5 h-5" />}
            name="Guida PDF"
            price={String(PRICING_LIST.premium_guide_daily)}
            unit="al giorno"
            desc={isItalian ? "Generazione di una guida editoriale in alta qualità scaricabile." : "Generation of a high-quality downloadable editorial guide."}
          />
        </div>

        <div className="mt-8 p-6 bg-emerald-50 rounded-3xl border border-emerald-100">
          <div className="flex items-center gap-3 mb-2">
            <Zap className="w-5 h-5 text-emerald-600" />
            <h4 className="font-black text-emerald-900 text-sm uppercase tracking-wider">{isItalian ? "Servizi Gratuiti" : "Free Services"}</h4>
          </div>
          <p className="text-xs text-emerald-800/70 font-medium leading-relaxed">
            {isItalian
              ? "La visualizzazione della mappa, la navigazione GPS e i suggerimenti di utilità (farmacie, fontanelle, parcheggi) sono sempre gratuiti e illimitati."
              : "Map viewing, GPS navigation, and utility suggestions (pharmacies, water fountains, parking) are always free and unlimited."}
          </p>
        </div>

        {onOpenShop && (
          <button
            onClick={onOpenShop}
            className="mt-6 w-full py-4 bg-amber-500 hover:bg-amber-600 text-slate-900 rounded-2xl font-black text-sm uppercase tracking-widest transition-colors shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2"
          >
            <Coins className="w-5 h-5" /> {isItalian ? "Ricarica Crediti" : "Top Up Credits"}
          </button>
        )}

        <footer className="mt-8 pt-6 border-t border-gray-100 text-center">
          <div className="flex items-center justify-center gap-2 text-[10px] font-black text-gray-300 uppercase tracking-[0.2em]">
            <ShieldCheck className="w-3 h-3" /> {isItalian ? "Crediti protetti e senza scadenza" : "Credits protected & never expire"}
          </div>
        </footer>
      </div>
    </div>
  );
}

function PriceItem({ icon, name, price, unit, desc }: { icon: React.ReactNode, name: string, price: string, unit: string, desc: string }) {
  return (
    <div className="flex gap-4 p-4 bg-gray-50/50 rounded-2xl border border-gray-100">
      <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-amber-500 shadow-sm shrink-0">
        {icon}
      </div>
      <div className="flex-1">
        <div className="flex justify-between items-start mb-1">
          <h4 className="text-sm font-black text-gray-900 uppercase tracking-tight">{name}</h4>
          <div className="flex items-center gap-1 bg-amber-100 px-2 py-0.5 rounded-lg">
            <span className="text-sm font-black text-amber-700">{price}</span>
            <Coins className="w-3 h-3 text-amber-600" />
          </div>
        </div>
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">{unit}</p>
        <p className="text-xs text-gray-500 leading-snug">{desc}</p>
      </div>
    </div>
  );
}
