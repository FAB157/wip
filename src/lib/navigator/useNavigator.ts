import { useState, useEffect } from 'react';
import { navigatorEngine, NavigationState, TransportMode, LatLng } from './NavigatorEngine';
import type { Poi } from '../../types/poi';

export function useNavigator() {
  const [state, setState] = useState<NavigationState>({
    isNavigating: false,
    destination: null,
    mode: 'walking',
    geometry: [],
    steps: [],
    currentStepIndex: 0,
    remainingDistance: 0,
    remainingTime: 0,
    remainingToNextStep: 0,
    isOffRoute: false,
    isArrived: false
  });

  useEffect(() => {
    navigatorEngine.onStateChange((newState) => {
      setState(newState);
    });
  }, []);

  const startNavigation = async (userPos: LatLng, destination: Poi, mode: TransportMode) => {
    await navigatorEngine.startNavigation(userPos, destination, mode);
  };

  const stopNavigation = () => {
    navigatorEngine.stopNavigation();
  };

  return {
    ...state,
    currentStep: state.steps[state.currentStepIndex] || null,
    startNavigation,
    stopNavigation
  };
}
