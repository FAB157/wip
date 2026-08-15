import React from 'react';
import { Wallet, Coins, Ticket, Bus, Coffee, Utensils, Wine } from 'lucide-react';
import { Language, getTranslation } from '../../lib/i18n';

interface BudgetTableProps {
  giorno: any;
  language: Language;
}

export default function BudgetTable({ giorno, language }: BudgetTableProps) {
  if (!giorno.tabella_budget) return null;

  return (
    <div className="bg-white p-6 rounded-[2rem] border border-outline-variant/10 shadow-sm mt-8 print:break-inside-avoid relative overflow-hidden">
      <div className="absolute top-0 right-0 p-6 opacity-5">
        <Wallet className="w-24 h-24" />
      </div>
      <h4 className="font-black text-primary uppercase tracking-widest text-xs mb-6 flex items-center gap-2 relative z-10">
        <Coins className="w-4 h-4" /> Budget della Giornata
      </h4>

      <div className="space-y-3 relative z-10">
        {giorno.tabella_budget.attrazioni && (
          <BudgetEntry
            icon={<Ticket className="w-5 h-5 text-blue-500" />}
            label={getTranslation("attractions", language)}
            detail={giorno.tabella_budget.attrazioni.dettaglio || giorno.tabella_budget.attrazioni}
            price={giorno.tabella_budget.attrazioni.stima_pp}
            bg="bg-blue-50"
          />
        )}

        {giorno.tabella_budget.trasporti && (
          <BudgetEntry
            icon={<Bus className="w-5 h-5 text-orange-500" />}
            label={getTranslation("transport", language)}
            detail={giorno.tabella_budget.trasporti.dettaglio || giorno.tabella_budget.trasporti}
            price={giorno.tabella_budget.trasporti.stima_pp}
            bg="bg-orange-50"
          />
        )}

        {giorno.tabella_budget.colazione && (
          <BudgetEntry
            icon={<Coffee className="w-5 h-5 text-amber-600" />}
            label={getTranslation("breakfast", language)}
            detail={giorno.tabella_budget.colazione.dettaglio || giorno.tabella_budget.colazione}
            price={giorno.tabella_budget.colazione.stima_pp}
            bg="bg-amber-50"
          />
        )}

        {giorno.tabella_budget.pranzo && (
          <BudgetEntry
            icon={<Utensils className="w-5 h-5 text-red-500" />}
            label={getTranslation("lunch", language)}
            detail={giorno.tabella_budget.pranzo.dettaglio || giorno.tabella_budget.pranzo}
            price={giorno.tabella_budget.pranzo.stima_pp}
            bg="bg-red-50"
          />
        )}

        {giorno.tabella_budget.cena && (
          <BudgetEntry
            icon={<Wine className="w-5 h-5 text-purple-600" />}
            label={getTranslation("dinner", language)}
            detail={giorno.tabella_budget.cena.dettaglio || giorno.tabella_budget.cena}
            price={giorno.tabella_budget.cena.stima_pp}
            bg="bg-purple-50"
          />
        )}
      </div>

      <div className="mt-5 pt-4 border-t border-primary/10 flex items-center justify-between relative z-10">
        <span className="font-black text-primary tracking-wide">{getTranslation("total_day", language)}</span>
        <span className="font-black text-xl text-primary font-mono">{giorno.tabella_budget.totale_giorno}</span>
      </div>
    </div>
  );
}

function BudgetEntry({ icon, label, detail, price, bg }: { icon: React.ReactNode, label: string, detail: string, price: string, bg: string }) {
  return (
    <div className="flex items-center gap-4 p-3 bg-gray-50/50 rounded-2xl border border-gray-100/50">
      <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center flex-shrink-0`}>
        {icon}
      </div>
      <div className="flex-1">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">{label}</p>
        <p className="text-sm font-medium text-gray-700">{detail}</p>
      </div>
      <div className="font-mono font-bold text-primary whitespace-nowrap">
        {price || ''}
      </div>
    </div>
  );
}
