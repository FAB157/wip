import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Map, Compass, Brain, Users, Sparkles, CheckCircle2 } from 'lucide-react';

interface FreeFeaturesModalProps {
  onClose: () => void;
}

export default function FreeFeaturesModal({ onClose }: FreeFeaturesModalProps) {
  const freeFeatures = [
    {
      icon: <Map className="w-6 h-6 text-emerald-500" />,
      title: "Mappa 3D Interattiva",
      description: "Esplora liberamente la mappa in 3D, scopri tutti i punti di interesse (POI) e naviga per la città senza alcun costo."
    },
    {
      icon: <Compass className="w-6 h-6 text-blue-500" />,
      title: "Lettura Info Monumenti",
      description: "Clicca su qualsiasi attrazione sulla mappa per leggere la sua storia, gli orari, le recensioni e i dettagli gratuitamente."
    },
    {
      icon: <Brain className="w-6 h-6 text-purple-500" />,
      title: "Quiz e Premi",
      description: "Partecipa ai quiz culturali gratuiti durante i caricamenti o esplorando la mappa per guadagnare Crediti ed XP reali!"
    },
    {
      icon: <Users className="w-6 h-6 text-amber-500" />,
      title: "Eventi e Condivisione",
      description: "Scopri gli eventi locali e salva i tuoi posti preferiti senza spendere un centesimo."
    },
    {
      icon: <Map className="w-6 h-6 text-orange-500" />,
      title: "Mappe Offline (Mondiali)",
      description: "Scarica intere città e i loro POI nel raggio di 100km per navigare ed esplorare anche senza internet (inclusi i dati mondiali)."
    }
  ];

  return (
    <div className="fixed inset-0 z-[10000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden relative flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-slate-800 z-10 bg-white rounded-full p-1 shadow-sm">
          <X className="w-5 h-5" />
        </button>

        <div className="bg-gradient-to-br from-emerald-500 to-teal-600 p-6 text-white text-center shrink-0">
          <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-3 backdrop-blur-md">
            <Sparkles className="w-8 h-8 text-emerald-100" />
          </div>
          <h2 className="text-2xl font-black mb-2">Cosa puoi fare Gratis?</h2>
          <p className="text-emerald-50 text-sm">
            ItaInta offre tantissime funzionalità gratuite per esplorare. I crediti servono solo per le funzioni Premium avanzate.
          </p>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          {freeFeatures.map((feature, idx) => (
            <div key={idx} className="flex gap-4 items-start">
              <div className="p-2 bg-slate-50 rounded-xl border border-slate-100 shrink-0">
                {feature.icon}
              </div>
              <div>
                <h3 className="font-bold text-slate-800 flex items-center gap-1">
                  {feature.title}
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                </h3>
                <p className="text-sm text-slate-500 leading-relaxed mt-0.5">
                  {feature.description}
                </p>
              </div>
            </div>
          ))}
        </div>
        
        <div className="p-4 border-t border-slate-100 bg-slate-50">
          <button 
            onClick={onClose}
            className="w-full bg-slate-800 text-white font-bold py-3 rounded-xl hover:bg-slate-700 transition-colors"
          >
            Ho capito, continua a esplorare
          </button>
        </div>
      </motion.div>
    </div>
  );
}
