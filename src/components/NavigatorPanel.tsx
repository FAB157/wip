// @deprecated STACK NON USATO. Questo pannello (con NavigatorEngine e
// useNavigator) non è importato da nessuno: la UI di navigazione attiva è
// NavigationOverlay (pilotata da useWalkingNavigation). Mantenuto per
// riferimento; non ricollegare senza revisione.
import React from 'react';
import { NavigationState } from '../lib/navigator/NavigatorEngine';
import { X, ArrowUp, CornerUpLeft, CornerUpRight, MoveDiagonal, RotateCw, MapPin } from 'lucide-react';

interface NavigatorPanelProps {
  state: NavigationState;
  onStop: () => void;
}

export function NavigatorPanel({ state, onStop }: NavigatorPanelProps) {
  if (!state.isNavigating) return null;

  const getManeuverIcon = (maneuver: string) => {
    if (maneuver.includes('left')) return <CornerUpLeft className="w-10 h-10 text-white" />;
    if (maneuver.includes('right')) return <CornerUpRight className="w-10 h-10 text-white" />;
    if (maneuver.includes('roundabout')) return <RotateCw className="w-10 h-10 text-white" />;
    if (maneuver.includes('arrive')) return <MapPin className="w-10 h-10 text-emerald-400" />;
    if (maneuver.includes('depart')) return <ArrowUp className="w-10 h-10 text-white" />;
    if (maneuver.includes('slight')) return <MoveDiagonal className="w-10 h-10 text-white" />;
    return <ArrowUp className="w-10 h-10 text-white" />;
  };

  const formatDistance = (meters: number) => {
    if (meters < 1000) return `${Math.round(meters)} m`;
    return `${(meters / 1000).toFixed(1)} km`;
  };

  const formatTime = (seconds: number) => {
    const mins = Math.ceil(seconds / 60);
    if (mins < 60) return `${mins} min`;
    const hours = Math.floor(mins / 60);
    const remMins = mins % 60;
    return `${hours}h ${remMins}m`;
  };

  const currentStep = state.steps[state.currentStepIndex];

  return (
    <div className="absolute top-4 left-4 right-4 z-50 flex flex-col gap-2">
      {/* Turn instruction */}
      <div className="bg-primary rounded-3xl shadow-2xl p-4 flex items-center gap-4 border border-white/10">
        <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center shrink-0">
          {currentStep ? getManeuverIcon(currentStep.maneuver) : <ArrowUp className="w-10 h-10 text-white/50" />}
        </div>
        
        <div className="flex-1 min-w-0">
          <p className="text-white/80 text-sm font-bold uppercase tracking-wider">
            {state.isOffRoute ? 'Ricalcolo in corso...' : (currentStep ? `Tra ${formatDistance(state.remainingToNextStep)}` : 'In arrivo')}
          </p>
          <h2 className="text-white text-xl md:text-2xl font-black leading-tight truncate">
            {currentStep?.instruction || 'Prosegui verso la destinazione'}
          </h2>
        </div>
        
        <button 
          onClick={onStop}
          className="w-12 h-12 bg-white/10 hover:bg-red-500/80 rounded-full flex items-center justify-center text-white transition-colors shrink-0"
          title="Interrompi navigazione"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      {/* Destination info */}
      <div className="bg-surface rounded-2xl shadow-xl px-5 py-3 flex items-center justify-between mx-auto w-fit min-w-[280px]">
        <div className="flex items-center gap-2 max-w-[150px]">
          <span className="text-xl">🏛️</span>
          <span className="font-black text-on-surface truncate text-sm">
            {state.destination?.name || 'Destinazione'}
          </span>
        </div>
        <div className="w-px h-6 bg-outline-variant/20 mx-3"></div>
        <div className="flex items-center gap-4 text-sm font-bold">
          <span className="text-secondary">{formatDistance(state.remainingDistance)}</span>
          <span className="text-emerald-600">{formatTime(state.remainingTime)}</span>
        </div>
      </div>
    </div>
  );
}
