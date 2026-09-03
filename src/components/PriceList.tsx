import React from 'react';
import { motion } from 'motion/react';
import {
  Coins, MessageSquare, Info, Camera, Map,
  Headphones, Volume2, BookOpen, ShieldCheck, Zap,
  Ticket, RefreshCw, Route
} from 'lucide-react';
import { Language, getTranslation } from '../lib/i18n';
import { PRICING_LIST, DAY_PASS_GUIDE_CAP } from '../lib/pricing';

interface PriceListProps {
  language: Language;
  /** Apre lo shop crediti (tab pricing): senza, la pagina era un vicolo cieco */
  onOpenShop?: () => void;
}

export default function PriceList({ language, onOpenShop }: PriceListProps) {
  const t = (key: string) => getTranslation(key, language);

  return (
    <div className="space-y-6 pb-20">
      <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm">
        <div className="flex items-center gap-4 mb-8 border-b border-gray-100 pb-6">
          <div className="w-14 h-14 bg-amber-500 rounded-2xl flex items-center justify-center text-slate-900 shadow-lg shadow-amber-500/20">
            <Coins className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-gray-900">{t('vr_b_pl_title')}</h2>
            <p className="text-xs text-gray-500 font-bold uppercase tracking-widest">{t('vr_b_pl_sub')}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4">
          {/* Prezzi da PRICING_LIST: la copia hardcoded si desincronizzava
              al primo cambio di listino */}
          <PriceItem
            icon={<MessageSquare className="w-5 h-5" />}
            name={t('vr_b_svc_chat')}
            price={String(PRICING_LIST.chat_session)}
            unit={t('vr_b_unit_10messages')}
            desc={t('vr_b_pl_chat_desc')}
          />
          <PriceItem
            icon={<Info className="w-5 h-5" />}
            name={t('vr_b_svc_poi')}
            price={String(PRICING_LIST.poi_detail)}
            unit={t('vr_b_unit_per_place')}
            desc={t('vr_b_pl_poi_desc')}
          />
          <PriceItem
            icon={<Camera className="w-5 h-5" />}
            name="Vision AI"
            price={String(PRICING_LIST.photo_search)}
            unit={t('vr_b_unit_per_scan')}
            desc={t('vr_b_pl_vision_desc')}
          />
          <PriceItem
            icon={<Map className="w-5 h-5" />}
            name={t('vr_b_svc_iti')}
            price={String(PRICING_LIST.itinerary_daily)}
            unit={t('vr_b_unit_per_day')}
            desc={t('vr_b_pl_iti_desc')}
          />
          <PriceItem
            icon={<Headphones className="w-5 h-5" />}
            name={t('vr_b_svc_audio')}
            price={String(PRICING_LIST.audio_guide)}
            unit={t('vr_b_unit_per_place')}
            desc={t('vr_b_pl_audio_desc')}
          />
          <PriceItem
            icon={<Ticket className="w-5 h-5" />}
            name="WIP Day Pass"
            price={String(PRICING_LIST.day_pass)}
            unit={t('vr_b_unit_24h')}
            desc={t('vr_b_pl_daypass_desc').replace('{cap}', String(DAY_PASS_GUIDE_CAP))}
          />
          <PriceItem
            icon={<Route className="w-5 h-5" />}
            name={t('pc_listino_nome')}
            price={String(PRICING_LIST.custom_route)}
            unit={t('pc_listino_unit')}
            desc={t('pc_listino_desc')}
          />
          <PriceItem
            icon={<RefreshCw className="w-5 h-5" />}
            name={t('vr_b_pl_replace_name')}
            price={String(PRICING_LIST.replace_stop)}
            unit={t('vr_b_pl_replace_unit')}
            desc={t('vr_b_pl_replace_desc')}
          />
          <PriceItem
            icon={<Volume2 className="w-5 h-5" />}
            name={t('vr_b_svc_podcast')}
            price={String(PRICING_LIST.podcast_daily)}
            unit={t('vr_b_unit_per_day')}
            desc={t('vr_b_pl_podcast_desc')}
          />
          <PriceItem
            icon={<BookOpen className="w-5 h-5" />}
            name={t('vr_b_svc_pdf')}
            price={String(PRICING_LIST.premium_guide_daily)}
            unit={t('vr_b_unit_per_day')}
            desc={t('vr_b_pl_pdf_desc')}
          />
        </div>

        <div className="mt-8 p-6 bg-emerald-50 rounded-3xl border border-emerald-100">
          <div className="flex items-center gap-3 mb-2">
            <Zap className="w-5 h-5 text-emerald-600" />
            <h4 className="font-black text-emerald-900 text-sm uppercase tracking-wider">{t('vr_b_pl_free_title')}</h4>
          </div>
          <p className="text-xs text-emerald-800/70 font-medium leading-relaxed">
            {t('vr_b_pl_free_desc')}
          </p>
        </div>

        {onOpenShop && (
          <button
            onClick={onOpenShop}
            className="mt-6 w-full py-4 bg-amber-500 hover:bg-amber-600 text-slate-900 rounded-2xl font-black text-sm uppercase tracking-widest transition-colors shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2"
          >
            <Coins className="w-5 h-5" /> {t('vr_b_recharge_credits')}
          </button>
        )}

        <footer className="mt-8 pt-6 border-t border-gray-100 text-center">
          <div className="flex items-center justify-center gap-2 text-[10px] font-black text-gray-600 uppercase tracking-[0.2em]">
            <ShieldCheck className="w-3 h-3" /> {t('vr_b_pl_footer')}
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
        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">{unit}</p>
        <p className="text-xs text-gray-500 leading-snug">{desc}</p>
      </div>
    </div>
  );
}
