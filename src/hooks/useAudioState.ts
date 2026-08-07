import { useState, useEffect } from 'react';
import { locationService, AudioState } from '../services/locationService';

export function useAudioState() {
  const [state, setState] = useState<AudioState>(locationService.getAudioState());

  useEffect(() => {
    return locationService.observeAudioState((newState) => {
      setState(newState);
    });
  }, []);

  return state;
}
