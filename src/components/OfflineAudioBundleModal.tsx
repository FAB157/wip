import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Download, Headphones, Check, Shield } from 'lucide-react';
import { PRICING_LIST } from '../lib/pricing';
import DayPassCard from './DayPassCard';

interface OfflineAudioBundleModalProps {
  isOpen: boolean;
  onClose: () => void;
  plan: any;
  language: string;
  guideMode: 'nicky' | 'dante';
  setGuideMode: (mode: 'nicky' | 'dante') => void;
  onSaveOfflineOnly: () => void;
  onDownloadAudioBundle: (selectedPoiIds: string[]) => void;
}

export default function OfflineAudioBundleModal({
  isOpen,
  onClose,
  plan,
  language,
  guideMode,
  setGuideMode,
  onSaveOfflineOnly,
  onDownloadAudioBundle
}: OfflineAudioBundleModalProps) {
  // Extract cultural POIs from the itinerary
  const culturalPois = React.useMemo(() => {
    if (!plan || !plan.giorni) return [];
    const pois: any[] = [];
    plan.giorni.forEach((giorno: any) => {
      giorno.tappe.forEach((tappa: any) => {
        if (
          tappa.tipo !== 'ristorante' && 
          tappa.tipo !== 'pausa' && 
          tappa.tipo !== 'spostamento' &&
          tappa.coordinate?.lat &&
          tappa.coordinate?.lng
        ) {
          pois.push({
            id: `iti-${tappa.titolo_tappa.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()}`,
            name: tappa.titolo_tappa,
            type: tappa.tipo,
            giorno: giorno.giorno
          });
        }
      });
    });
    return pois;
  }, [plan]);

  const [selectedPois, setSelectedPois] = useState<string[]>(culturalPois.map(p => p.id));
  // Prezzo pieno (audioguida + scheda): lo sconto 50% è stato rimosso,
  // l'offerta conveniente ora è il Day Pass. Tenere allineato a
  // handleDownloadAudioBundle in PlanScreen.tsx.
  const BUNDLE_PRICE_PER_POI = PRICING_LIST.audio_guide + PRICING_LIST.poi_detail;

  const handleToggle = (id: string) => {
    setSelectedPois(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]);
  };

  const totalCost = selectedPois.length * BUNDLE_PRICE_PER_POI;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 20 }}
        className="relative bg-white rounded-[2rem] shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[85vh]"
      >
        {/* Header */}
        <div className="bg-gradient-to-br from-primary to-indigo-800 p-6 text-white text-center shrink-0">
          <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4 backdrop-blur-md">
            <Download className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-2xl font-black mb-2">{language === 'IT' ? 'Scarica per Offline' : 'Download for Offline'}</h2>
          <p className="text-sm text-white/80 font-bold">
            {language === 'IT' ? 'Porta le audioguide con te senza consumare giga in viaggio.' : 'Take audio guides with you without using data.'}
          </p>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto custom-scrollbar flex-1 min-h-[300px]">
          {/* L'offerta conveniente al posto del vecchio sconto 50%: il Day Pass
              copre tutte le audioguide del viaggio per 24 ore. */}
          <div className="mb-6">
            <DayPassCard compact />
            <p className="text-[10px] font-bold text-gray-400 text-center mt-2">
              {language === 'IT'
                ? 'Con il Day Pass le audioguide delle prossime 24 ore sono incluse: il bundle qui sotto serve solo se vuoi i file audio permanenti.'
                : 'With the Day Pass all audio guides for the next 24 hours are included: the bundle below is only for permanent audio files.'}
            </p>
          </div>

          {/* Guide Selector */}
          <div className="bg-amber-50 rounded-2xl p-4 border border-amber-200 mb-6">
            <div className="flex items-center gap-3 mb-3">
              <Headphones className="w-5 h-5 text-amber-600" />
              <h3 className="font-black text-amber-800 text-sm">
                {language === 'IT' ? 'Voce Selezionata' : 'Selected Voice'}
              </h3>
            </div>
            <p className="text-xs font-bold text-amber-700/80 mb-3 leading-snug">
              {language === 'IT' 
                ? `Stai per scaricare le audioguide raccontate da ${guideMode === 'nicky' ? 'Nicky (la Guida)' : 'Dante (l\'Esploratore)'}. Puoi cambiarla ora se preferisci.`
                : `You are about to download audio guides narrated by ${guideMode === 'nicky' ? 'Nicky' : 'Dante'}. You can change it now if you prefer.`
              }
            </p>
            <div className="flex bg-white rounded-xl overflow-hidden border border-amber-200/50 shadow-sm">
              <button 
                onClick={() => setGuideMode('nicky')}
                className={`flex-1 py-2 text-xs font-black transition-colors ${guideMode === 'nicky' ? 'bg-amber-500 text-white' : 'text-amber-800 hover:bg-amber-100'}`}
              >
                Nicky
              </button>
              <button 
                onClick={() => setGuideMode('dante')}
                className={`flex-1 py-2 text-xs font-black transition-colors ${guideMode === 'dante' ? 'bg-amber-500 text-white' : 'text-amber-800 hover:bg-amber-100'}`}
              >
                Dante
              </button>
            </div>
          </div>

          <h3 className="text-sm font-black text-primary mb-3">
            {language === 'IT' ? 'Seleziona le tappe da scaricare:' : 'Select stops to download:'}
          </h3>
          
          <div className="space-y-2">
            {culturalPois.map(poi => (
              <label key={poi.id} className={`flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer ${selectedPois.includes(poi.id) ? 'bg-indigo-50 border-indigo-200' : 'bg-gray-50 border-gray-100 opacity-60'}`}>
                <div className="relative w-5 h-5 flex-shrink-0">
                  <input type="checkbox" className="sr-only" checked={selectedPois.includes(poi.id)} onChange={() => handleToggle(poi.id)} />
                  <div className={`w-5 h-5 rounded-md flex items-center justify-center transition-colors ${selectedPois.includes(poi.id) ? 'bg-primary text-white' : 'bg-gray-200'}`}>
                    {selectedPois.includes(poi.id) && <Check className="w-3.5 h-3.5" />}
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-bold text-gray-800 truncate">{poi.name}</h4>
                  <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">
                    {language === 'IT' ? 'Giorno' : 'Day'} {poi.giorno} • {poi.type}
                  </p>
                </div>
                <div className="text-xs font-black text-primary bg-white px-2 py-1 rounded-lg border border-indigo-100 shadow-sm shrink-0">
                  {BUNDLE_PRICE_PER_POI} <span className="text-[9px]">CR</span>
                </div>
              </label>
            ))}
            {culturalPois.length === 0 && (
              <p className="text-xs text-gray-400 font-bold text-center py-4">Nessuna tappa culturale trovata in questo itinerario.</p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 bg-gray-50 border-t border-gray-100 shrink-0">
          <div className="flex justify-between items-end mb-4">
            <div>
              <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">
                {language === 'IT' ? 'Totale Bundle' : 'Bundle Total'}
              </p>
              <div className="text-2xl font-black text-primary flex items-baseline gap-1">
                {totalCost} <span className="text-xs text-gray-400 font-bold">Crediti</span>
              </div>
              <p className="text-[10px] font-bold text-gray-400 mt-0.5">
                {language === 'IT' ? 'Audio permanente, tuo per sempre.' : 'Permanent audio, yours forever.'}
              </p>
            </div>
            <button
              onClick={() => {
                if (selectedPois.length === 0) return;
                // Conferma e addebito crediti vivono nel parent
                // (handleDownloadAudioBundle): qui si delega e si chiude.
                onDownloadAudioBundle(selectedPois);
                onClose();
              }}
              disabled={selectedPois.length === 0}
              className="bg-primary text-white px-6 py-3 rounded-xl font-black text-sm shadow-lg hover:bg-primary/90 transition-transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {language === 'IT' ? 'Acquista & Scarica' : 'Buy & Download'}
            </button>
          </div>
          
          <button
            onClick={() => {
              onSaveOfflineOnly();
              onClose();
            }}
            className="w-full py-3 bg-white border-2 border-gray-200 text-gray-500 rounded-xl font-bold text-xs hover:bg-gray-50 hover:text-gray-700 transition-colors flex items-center justify-center gap-2"
          >
            {language === 'IT' ? 'Salva solo il testo (Gratis)' : 'Save text only (Free)'}
          </button>
        </div>

        <button onClick={onClose} className="absolute top-4 right-4 w-8 h-8 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center text-white backdrop-blur-md transition-colors">
          <X className="w-4 h-4" />
        </button>
      </motion.div>
    </div>
  );
}
