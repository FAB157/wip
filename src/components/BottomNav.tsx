import { Map as MapIcon, Calendar, Camera, User, Headphones, PartyPopper, Sparkles } from "lucide-react";
import { ReactNode, Ref, useState, useEffect, useRef } from "react";
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
  const muteAnchorRef = useRef<HTMLButtonElement | null>(null);
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
  //
  // SETTE VOCI SU UNO SCHERMO DA 390 px (08/09/2026, screenshot del
  // committente: «ESPLORA» sopra «ITINERARIO», «WIP AI» e «GUIDA» su due
  // altezze). Con il tasto Assistente la barra e' passata da sei a sette
  // voci e il vecchio impianto — `justify-around` + `min-w-[56px]` per voce
  // + etichette senza tetto — non stava piu' nella larghezza: le colonne si
  // accavallavano e le parole lunghe sbordavano su quella accanto. Ora ogni
  // voce e' una colonna `flex-1 min-w-0` che si prende un settimo dello
  // spazio, l'etichetta e' `truncate` dentro la propria colonna (mai sopra
  // la vicina, in nessuna lingua) e tutte le voci — Assistente e Guida
  // comprese, prima costruite a mano con margini propri — passano dallo
  // stesso NavItem: stessa icona da 20 px, stesso interlinea, stesso
  // baseline. La voce attiva ingrandisce solo l'icona, non il testo, cosi'
  // niente si sposta al cambio scheda.
  return (
    <>
    <nav
      aria-label={getTranslation("a11y_nav_principale", language)}
      className="w-full sm:max-w-none bg-surface-container-lowest/90 flex-shrink-0 backdrop-blur-xl border-t border-amber-100/60 shadow-[0_-4px_24px_rgba(0,0,0,0.02)] flex items-stretch min-h-[calc(4rem+env(safe-area-inset-bottom))] pb-[env(safe-area-inset-bottom)] z-[100] relative print:hidden"
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
      {/* La fotocamera e' l'unica colonna a larghezza fissa: il tondo
          sporge sopra la barra e non ha etichetta, quindi non ha bisogno
          di un settimo intero. */}
      <div className="flex flex-col items-center justify-center -mt-9 relative z-10 w-[60px] shrink-0">
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
      {/* ASSISTENTE WIP, tra fotocamera e guida (08/09/2026, richiesto dal
          committente: «un tasto per attivare l'assistente WIP come quello
          nella sezione itinerario ma che può rispondere su tutto»). Apre la
          STESSA chat generica "Chiedi a WIP" già raggiungibile dalla scheda
          di un POI (evento 'wip-open-chat', nessun contesto): stesso
          componente, stesso motore, solo un ingresso in più, sempre a
          disposizione invece che legato a un luogo. */}
      <NavItem
        icon={<Sparkles className="w-5 h-5" />}
        label={getTranslation('nav_assistente', language)}
        ariaLabel={getTranslation('a11y_assistente_ia', language)}
        onClick={() => window.dispatchEvent(new CustomEvent('wip-open-chat', { detail: {} }))}
      />
      {/* Il tasto mute e' renderizzato FUORI dalla <nav> (vedi sopra):
          il ref qui serve solo come ancora per la sua posizione orizzontale. */}
      <NavItem
        anchorRef={muteAnchorRef}
        icon={<Headphones className="w-5 h-5" />}
        label={getTranslation("guide", language)}
        ariaLabel={getTranslation("a11y_audioguida", language)}
        active={isAudioGuideActive}
        ariaPressed={isAudioGuideActive}
        tone="secondary"
        badge={isAudioGuideActive && !isAudioGuideMuted ? (
          <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5" aria-hidden="true">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-secondary opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-secondary"></span>
          </span>
        ) : null}
        onClick={() => setIsAudioGuideActive(!isAudioGuideActive)}
      />
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

/**
 * Una voce della barra. Tutte passano di qui (anche Assistente e Guida) per
 * avere lo stesso baseline. `flex-1 min-w-0` = un settimo della barra, mai
 * di piu'; l'etichetta e' `truncate` nella sua colonna, cosi' «ITINERARIO»
 * (o il tedesco, o il russo) al massimo si accorcia, ma non finisce mai
 * sopra la voce accanto. Testo a 10 px con tracking stretto: sette parole
 * maiuscole in 390 px non ci stanno a 11.
 */
function NavItem({
  icon,
  label,
  ariaLabel,
  active = false,
  ariaPressed,
  tone = "primary",
  badge,
  anchorRef,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  ariaLabel?: string;
  active?: boolean;
  /** Per le voci che sono interruttori (Guida) e non schede. */
  ariaPressed?: boolean;
  tone?: "primary" | "secondary";
  /** Segnale sopra l'icona (il pallino della guida che parla). */
  badge?: ReactNode;
  anchorRef?: Ref<HTMLButtonElement>;
  onClick: () => void;
}) {
  const acceso = tone === "secondary" ? "text-secondary" : "text-primary";
  const hover = tone === "secondary" ? "hover:text-secondary" : "hover:text-primary";
  const colore = active ? `${acceso} font-bold` : `text-slate-500 font-medium ${hover}`;
  return (
    <button
      ref={anchorRef}
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      aria-current={ariaPressed === undefined && active ? "page" : undefined}
      aria-pressed={ariaPressed}
      className={`flex-1 min-w-0 flex flex-col items-center justify-center gap-0.5 px-0 py-1 min-h-[48px] transition-colors cursor-pointer ${colore}`}
    >
      {/* Solo l'icona cresce quando la voce e' attiva: scalare tutto il
          tasto spostava anche il testo e riapriva le sovrapposizioni. */}
      <span className={`relative w-6 h-6 flex items-center justify-center transition-transform ${active ? "scale-110" : ""}`}>
        {icon}
        {badge}
      </span>
      {/* 9 px e tracking-tighter: misurato sull'anteprima, «ITINERARIO»
          (la parola piu' lunga in italiano) sta in 46 px, e la colonna piu'
          stretta — iPhone da 360 px — ne ha 50. A 10 px si troncava. */}
      <span className="max-w-full truncate text-[9px] leading-none uppercase tracking-tighter">
        {label}
      </span>
    </button>
  );
}
