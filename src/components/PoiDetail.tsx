import { Star, MapPin, Globe, Phone, Navigation, Ticket, Bot, RefreshCw, Play, Volume2 } from 'lucide-react';
import { motion } from 'motion/react';
import { ReactNode } from 'react';

export default function PoiDetail() {
  return (
    <div className="bg-surface rounded-t-3xl shadow-[0_-8px_24px_rgba(0,0,0,0.08)] z-30 relative -mt-5 flex flex-col min-h-[600px] w-full">
      {/* Handle */}
      <div className="w-full py-4 flex justify-center shrink-0">
        <div className="w-12 h-1.5 bg-outline-variant/50 rounded-full" />
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-32">
        {/* Header Image */}
        <div className="relative w-full h-52 rounded-2xl overflow-hidden mb-6 shadow-md">
          <img
            src="https://lh3.googleusercontent.com/aida-public/AB6AXuAmmjNtXJkCimc39-osvXlN77lrh8jgrgM_NyVQhau1non5QojScO3tM6d1uTv35cy_mUBGG6SW0cYuUH7bVJBDRZ02A8eWBU3QxnC13fGnozWDPOGIVtH6BCr6aTnHd0Y4jBtVyhasnO2P2ERk7_qxTvIXMzNVeCXEX1pAoA0eGipNZvGtlqOOOyjIXiEI1r-DXw-jCydDVZoIeNA5JZSiL-f_B2qgvBuyTiep7GvVwWDem08zUK0ZXw6N_ETZjL0kWoBptNWang"
            alt="Colosseum at sunset"
            className="w-full h-full object-cover"
          />
          <div className="absolute bottom-0 left-0 w-full p-4 bg-gradient-to-t from-black/70 to-transparent">
            <span className="px-2 py-0.5 bg-surface/20 backdrop-blur-md rounded border border-surface/30 text-[10px] text-white font-bold uppercase tracking-wider mb-1 inline-block">
              Monumento
            </span>
            <h2 className="text-2xl font-extrabold text-white">Colosseo</h2>
          </div>
        </div>

        {/* Metadata */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-1.5">
            <Star className="w-5 h-5 text-secondary fill-secondary" />
            <span className="font-bold text-on-surface">4.8</span>
            <span className="text-sm text-on-surface-variant ml-1">(12.4k recensioni)</span>
          </div>
          <div className="flex items-center gap-1 text-primary">
            <MapPin className="w-4 h-4" />
            <span className="font-bold text-sm">1.2 km</span>
          </div>
        </div>

        {/* Action Grid */}
        <div className="grid grid-cols-2 gap-3 mb-8">
          <ActionButton icon={<Phone className="w-5 h-5 text-primary" />} label="Telefono" />
          <ActionButton icon={<Navigation className="w-5 h-5 text-primary" />} label="Maps" />
          <ActionButton
            icon={<Ticket className="w-5 h-5 text-secondary" />}
            label="Biglietti"
            primary
          />
        </div>

        {/* AI Audioguide Section */}
        <div className="bg-primary/5 rounded-2xl p-5 border border-primary/20 relative overflow-hidden mb-8">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <Volume2 className="w-20 h-20 text-primary" />
          </div>
          
          <div className="flex items-start justify-between mb-4 relative z-10">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Bot className="w-5 h-5 text-primary" />
                <h3 className="text-lg font-bold text-on-surface">Audioguida AI</h3>
              </div>
              <p className="text-xs text-primary/70 font-semibold mb-3">Voce: Nicky • ElevenLabs</p>
              <p className="text-sm text-on-surface-variant leading-relaxed">
                Benvenuti all'interno del maestoso Anfiteatro Flavio, meglio conosciuto come il Colosseo. 
                Immaginate il boato di cinquantamila spettatori mentre il sole tramonta su queste pietre millenarie. 
                Qui, il destino dei gladiatori veniva deciso con un semplice gesto...
              </p>
            </div>
            <button className="flex items-center gap-1.5 px-3 py-1.5 bg-surface rounded-full border border-primary/20 text-primary hover:bg-primary/10 transition-colors shrink-0">
              <RefreshCw className="w-3.5 h-3.5" />
              <span className="text-xs font-bold uppercase">Rigenera</span>
            </button>
          </div>

          <div className="flex items-center gap-4 relative z-10 bg-surface/50 p-3 rounded-xl border border-outline-variant/50 backdrop-blur-sm">
            <button className="w-11 h-11 rounded-full bg-primary flex items-center justify-center text-secondary shadow-lg hover:bg-primary/90 transition-all shrink-0">
              <Play className="w-6 h-6 fill-secondary ml-1" />
            </button>
            <div className="flex-1">
              {/* Progress Bar */}
              <div className="h-1.5 bg-outline-variant/30 rounded-full w-full mb-2 overflow-hidden">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: '35%' }}
                  className="h-full bg-primary rounded-full relative"
                >
                  <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-surface rounded-full shadow-md ring-2 ring-primary/20" />
                </motion.div>
              </div>
              <div className="flex justify-between text-[10px] font-bold text-on-surface-variant/80 uppercase">
                <span>1:24</span>
                <span>4:05</span>
              </div>
              
              <div className="flex gap-2 mt-3 overflow-x-auto no-scrollbar">
                {['0.85x', '1x', '1.25x', '1.5x'].map((speed) => (
                  <button 
                    key={speed}
                    className={`px-3 py-1 rounded-md text-[10px] font-bold border transition-all ${speed === '1x' ? 'bg-primary text-secondary border-primary' : 'bg-surface/50 border-primary/10 text-on-surface-variant'}`}
                  >
                    {speed}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ActionButton({ icon, label, primary = false }: { icon: ReactNode, label: string, primary?: boolean }) {
  return (
    <button className={`flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-sm transition-all shadow-sm
      ${primary 
        ? 'bg-primary text-secondary shadow-primary/20 hover:bg-primary/90' 
        : 'bg-surface-variant text-on-surface border border-outline-variant/20 hover:bg-surface-variant/80'
      }
    `}>
      {icon}
      {label}
    </button>
  );
}
