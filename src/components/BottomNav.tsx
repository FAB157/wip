import { Map as MapIcon, Calendar, Camera, User, Headphones, PartyPopper } from "lucide-react";
import { ReactNode, useState, useEffect } from "react";
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

  return (
    <div className="w-full sm:max-w-none bg-[#fcfaf8]-container-lowest/90 flex-shrink-0 backdrop-blur-xl border-t border-amber-100/60 shadow-[0_-4px_24px_rgba(0,0,0,0.02)] flex justify-around items-center h-[calc(4rem+env(safe-area-inset-bottom))] pb-[env(safe-area-inset-bottom)] px-1 z-[100] relative print:hidden">
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
          onClick={handleCameraClick}
          className={`flex flex-col items-center justify-center w-14 h-14 bg-primary text-white rounded-full shadow-xl transition-all active:scale-95 border-4 border-surface cursor-pointer
          ${activeTab === "camera" ? "scale-105 shadow-primary/20" : "hover:scale-105"}
        `}
        >
          <Camera className="w-6 h-6" />
        </button>
        {showWipTooltip && (
          <div className="absolute -bottom-4 flex flex-col items-center justify-center pb-0.5 pointer-events-none">
            <div className="flex items-center justify-center gap-0.5 opacity-90 bg-surface/80 backdrop-blur-sm px-2 py-0.5 rounded-full shadow-sm">
              <div className="w-3.5 h-3.5 bg-primary rounded flex items-center justify-center shadow-sm transform -rotate-1">
                <span className="text-white font-black text-[7px] italic leading-none">WIP</span>
              </div>
              <span className={`text-[8px] font-black uppercase tracking-wider whitespace-nowrap hidden sm:block ${activeTab === "camera" ? "text-primary" : "text-slate-500"}`}>
                World in pocket
              </span>
            </div>
          </div>
        )}
      </div>
      <div className="relative flex flex-col items-center justify-center -mb-2">
        <button
          onClick={() => setIsAudioGuideActive(!isAudioGuideActive)}
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
          <span className={`text-[9px] uppercase tracking-tighter mt-0.5 ${isAudioGuideActive ? "text-secondary" : "text-slate-500"}`}>
            {getTranslation("guide", language)}
          </span>
        </button>
        {isAudioGuideActive && setIsAudioGuideMuted && (
          <button
            onClick={() => setIsAudioGuideMuted(!isAudioGuideMuted)}
            className={`absolute -top-7 -right-2 bg-[#fcfaf8] text-xs rounded-full shadow-lg border p-1 cursor-pointer ${isAudioGuideMuted ? "text-rose-500 border-rose-200" : "text-emerald-500 border-emerald-200"}`}
          >
            {isAudioGuideMuted ? "🔇" : "🔊"}
          </button>
        )}
      </div>
      <NavItem
        icon={<User className="w-5 h-5" />}
        label={getTranslation("profile", language)}
        active={activeTab === "profile"}
        onClick={() => setActiveTab("profile")}
      />
    </div>
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
      onClick={onClick}
      className={`flex flex-col items-center justify-center gap-0.5 px-2 py-1 min-h-[48px] min-w-[56px] transition-all cursor-pointer ${colorClass} ${active ? "scale-105" : ""}`}
    >
      <div className={`w-6 h-6 flex items-center justify-center ${active ? "text-primary" : "text-slate-500"}`}>{icon}</div>
      <span className={`text-[9px] uppercase tracking-wider ${active ? "text-primary" : "text-slate-500"}`}>
        {label}
      </span>
    </button>
  );
}

