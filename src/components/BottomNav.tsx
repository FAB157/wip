import { Map as MapIcon, Calendar, Camera, User, Headphones, PartyPopper } from "lucide-react";
import { ReactNode, useState, useEffect, useRef } from "react";
import { Language, getTranslation } from "../lib/i18n";

interface BottomNavProps {
  activeTab: "map" | "plan" | "camera" | "profile" | "events";
  setActiveTab: (tab: "map" | "plan" | "camera" | "profile" | "events") => void;
  isAudioGuideActive: boolean;
  setIsAudioGuideActive: (active: boolean) => void;
  isAudioGuideMuted?: boolean;
  setIsAudioGuideMuted?: (muted: boolean) => void;
  language: Language;
}

export default function BottomNav({ activeTab, setActiveTab, isAudioGuideActive, setIsAudioGuideActive, isAudioGuideMuted, setIsAudioGuideMuted, onPlanClick, language }: BottomNavProps & { onPlanClick?: () => void }) {
  const [showWipTooltip, setShowWipTooltip] = useState(true);

  useEffect(() => {
    if (localStorage.getItem('wip_tooltip_dismissed')) {
      setShowWipTooltip(false);
    }
  }, []);

  const handleCameraClick = () => {
    setActiveTab("camera");
    if (showWipTooltip) {
      localStorage.setItem('wip_tooltip_dismissed', 'true');
      setShowWipTooltip(false);
    }
  };

  // IL TASTO MUTE FUORI DALLA BARRA (31/08/2026, collaudo: «il tasto mute
  // sopra al tasto della guida non funziona»). Stava DENTRO la <nav> (z-100)
  // come absolute: durante il giro il cruscotto TourBanner (fixed z-[9000])
  // occupa esattamente quella fascia sopra la barra e si prendeva tutti i
  // tocchi — il tasto si vedeva ma non rispondeva. Ora e' un fratello fixed
  // della barra con z-[9100], ancorato con una misura alla colonna del tasto
  // guida (si rimisura al resize/rotazione).
  const muteAnchorRef = useRef<HTMLDivElement | null>(null);
  const [muteX, setMuteX] = useState<number | null>(null);
  useEffect(() => {
    if (!isAudioGuideActive) { setMuteX(null); return; }
    const misura = () => {
      const r = muteAnchorRef.current?.getBoundingClientRect();
      if (r) setMuteX(r.left + r.width / 2);
    };
    misura();
    window.addEventListener('resize', misura);
    return () => window.removeEventListener('resize', misura);
  }, [isAudioGuideActive]);

  // `bg-[#fcfaf8]-container-lowest/90` era una classe inesistente (UX-05):
  // la barra non aveva sfondo. Altezza in `min-h` così Dynamic Type (iOS)
  // può allargarla senza tagliare le etichette (UX-04).
  return (
    <>
    <nav
      aria-label={getTranslation("a11y_nav_principale", language)}
      className="w-full sm:max-w-none bg-surface-container-lowest/90 flex-shrink-0 backdrop-blur-xl border-t border-amber-100/60 shadow-[0_-4px_24px_rgba(0,0,0,0.02)] flex justify-around items-center min-h-[calc(4rem+env(safe-area-inset-bottom))] pb-[env(safe-area-inset-bottom)] px-1 z-[100] relative print:hidden"
    >
      <NavItem
        icon={<MapIcon className="w-5 h-5" />}
        label={getTranslation("explore", language)}
        active={activeTab === "map"}
        onClick={() => setActiveTab("map")}
      />
      <NavItem
        icon={<Calendar className="w-5 h-5" />}
        label={getTranslation("itinerary", language)}
        active={activeTab === "plan"}
        onClick={() => {
          if (onPlanClick) onPlanClick();
          else setActiveTab("plan");
        }}
      />
      <NavItem
        icon={<PartyPopper className="w-5 h-5" />}
        label={getTranslation("eventi", language)}
        active={activeTab === "events"}
        onClick={() => setActiveTab("events")}
      />
      <div className="flex flex-col items-center justify-center -mt-9 relative z-10 w-[70px]">
        <button
          type="button"
          onClick={handleCameraClick}
          aria-label={getTranslation("a11y_fotocamera", language)}
          aria-current={activeTab === "camera" ? "page" : undefined}
          className={`flex flex-col items-center justify-center w-14 h-14 bg-primary text-white rounded-full shadow-xl transition-all active:scale-95 border-4 border-surface cursor-pointer
          ${activeTab === "camera" ? "scale-105 shadow-primary/20" : "hover:scale-105"}
        `}
        >
          <Camera className="w-6 h-6" />
        </button>
        {showWipTooltip && (
          <div className="absolute -bottom-4 flex flex-col items-center justify-center pb-0.5 pointer-events-none" aria-hidden="true">
            <div className="flex items-center justify-center gap-1 opacity-90 bg-surface/80 backdrop-blur-sm px-2 py-0.5 rounded-full shadow-sm">
              <div className="h-4 px-1 bg-primary rounded flex items-center justify-center shadow-sm transform -rotate-1">
                <span className="text-white font-black text-[11px] italic leading-none">WIP</span>
              </div>
              <span className={`text-[11px] font-black uppercase tracking-wide whitespace-nowrap hidden sm:block ${activeTab === "camera" ? "text-primary" : "text-slate-500"}`}>
                World in pocket
              </span>
            </div>
          </div>
        )}
      </div>
      <div ref={muteAnchorRef} className="relative flex flex-col items-center justify-center -mb-2">
        <button
          type="button"
          onClick={() => setIsAudioGuideActive(!isAudioGuideActive)}
          aria-label={getTranslation("a11y_audioguida", language)}
          aria-pressed={isAudioGuideActive}
          className={`flex flex-col items-center justify-center gap-0.5 px-2 py-1 min-h-[48px] min-w-[56px] transition-all cursor-pointer ${isAudioGuideActive ? "text-secondary scale-105 font-bold" : "text-slate-500 font-medium hover:text-secondary"}`}
        >
          <div className={`w-6 h-6 relative flex items-center justify-center ${isAudioGuideActive ? "text-secondary" : "text-slate-500"}`}>
            <Headphones className="w-full h-full" />
            {isAudioGuideActive && !isAudioGuideMuted && (
              <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-secondary opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-secondary"></span>
              </span>
            )}
          </div>
          <span className={`text-[11px] uppercase tracking-normal mt-0.5 ${isAudioGuideActive ? "text-secondary" : "text-slate-500"}`}>
            {getTranslation("guide", language)}
          </span>
        </button>
        {/* Il tasto mute e' renderizzato FUORI dalla <nav> (vedi sopra):
            qui resta solo l'ancora per la sua posizione orizzontale. */}
      </div>
      <NavItem
        icon={<User className="w-5 h-5" />}
        label={getTranslation("profile", language)}
        active={activeTab === "profile"}
        onClick={() => setActiveTab("profile")}
      />
    </nav>
    {/* Mute: area propria di 44 px sospesa sopra la barra (UX-06), ma come
        fratello `fixed z-[9100]` della nav — sopra il TourBanner (z-9000)
        che prima gli rubava i tocchi durante il giro. */}
    {isAudioGuideActive && setIsAudioGuideMuted && muteX != null && (
      <button
        type="button"
        onClick={() => setIsAudioGuideMuted(!isAudioGuideMuted)}
        aria-label={getTranslation(isAudioGuideMuted ? "a11y_riattiva_audio" : "a11y_silenzia_audio", language)}
        aria-pressed={!!isAudioGuideMuted}
        className={`fixed z-[9100] min-w-11 min-h-11 flex items-center justify-center bg-[#fcfaf8] text-base rounded-full shadow-lg border cursor-pointer print:hidden ${isAudioGuideMuted ? "text-rose-500 border-rose-200" : "text-emerald-500 border-emerald-200"}`}
        style={{ left: muteX, transform: "translateX(-50%)", bottom: "calc(4.75rem + env(safe-area-inset-bottom, 0px))" }}
      >
        <span aria-hidden="true">{isAudioGuideMuted ? "🔇" : "🔊"}</span>
      </button>
    )}
    </>
  );
}

function NavItem({
  icon,
  label,
  active = false,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  const colorClass = active ? "text-primary font-bold" : "text-slate-500 font-medium hover:text-primary";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`flex flex-col items-center justify-center gap-0.5 px-2 py-1 min-h-[48px] min-w-[56px] transition-all cursor-pointer ${colorClass} ${active ? "scale-105" : ""}`}
    >
      <div className={`w-6 h-6 flex items-center justify-center ${active ? "text-primary" : "text-slate-500"}`}>{icon}</div>
      <span className={`text-[11px] uppercase tracking-normal ${active ? "text-primary" : "text-slate-500"}`}>
        {label}
      </span>
    </button>
  );
}
