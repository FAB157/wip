// =====================================================================
// WIP · featureFlags — kill switch senza deploy
// Il server espone /api/flags (letto da api_cache, gestito dal pannello
// admin in Diagnostica). Qui si legge all'avvio con fallback localStorage
// e default FAIL-OPEN: flag assente o rete giù = feature attiva. Lo scopo
// è spegnere una feature guasta in produzione in pochi secondi, non
// bloccare l'app quando qualcosa non risponde.
// =====================================================================

import { useEffect, useState } from 'react';
import { getApiUrl } from './api';

const LS_KEY = 'wip_feature_flags';

// I flag effettivamente cablati nel codice (client o server). Aggiungerne
// uno qui senza il gate corrispondente non spegne nulla: prima si cabla,
// poi si elenca.
export const KNOWN_FLAGS: Array<{ key: string; label: string; desc: string }> = [
  { key: 'events_tab', label: 'Tab Eventi', desc: 'Schermata eventi e biglietti (gate client)' },
  { key: 'vision_camera', label: 'Camera / Vision', desc: 'Scatto e riconoscimento monumenti (gate client)' },
  { key: 'itinerary_generation', label: 'Generazione itinerari', desc: 'Spegne la rotta AI lato server (vale anche per le vecchie build native)' },
];

let flags: Record<string, boolean> = {};
try { flags = JSON.parse(localStorage.getItem(LS_KEY) || '{}') || {}; } catch { /* storage bloccato */ }

const listeners = new Set<() => void>();

/** Fail-open: un flag mai impostato (o non scaricabile) risulta attivo. */
export const isFeatureEnabled = (key: string): boolean => flags[key] !== false;

export const refreshFeatureFlags = async (): Promise<void> => {
  try {
    const res = await fetch(getApiUrl('/api/flags'));
    if (!res.ok) return;
    const data = await res.json();
    if (data && typeof data.flags === 'object' && !Array.isArray(data.flags)) {
      flags = data.flags || {};
      try { localStorage.setItem(LS_KEY, JSON.stringify(flags)); } catch { /* best effort */ }
      listeners.forEach(fn => { try { fn(); } catch { /* mai propagare */ } });
    }
  } catch { /* offline: restano i flag dell'ultima sessione (o tutto acceso) */ }
};

/** Hook React: si aggiorna quando i flag arrivano dal server. */
export function useFeatureFlag(key: string): boolean {
  const [on, setOn] = useState(isFeatureEnabled(key));
  useEffect(() => {
    const fn = () => setOn(isFeatureEnabled(key));
    listeners.add(fn);
    fn();
    return () => { listeners.delete(fn); };
  }, [key]);
  return on;
}
