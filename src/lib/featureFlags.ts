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
  { key: 'web_foreground_triggers', label: 'Trigger web foreground', desc: 'Audioguide per prossimità su PWA/browser in foreground (gate client, no nativo)' },
];

/** Voce pronta da disegnare nel pannello admin. `desc` e `descrizione` sono
 *  lo stesso testo: `desc` per non rompere chi già legge KNOWN_FLAGS. */
export interface FlagDescritto {
  key: string;
  label: string;
  desc: string;
  descrizione: string;
  /** false = flag creato lato server e non ancora documentato qui. */
  noto: boolean;
}

/** `web_foreground_triggers` → "web foreground triggers": meglio di niente
 *  quando il flag nasce sul server e nessuno l'ha ancora descritto. */
const etichettaDiRipiego = (key: string): string =>
  key.replace(/[_-]+/g, ' ').trim() || key;

/**
 * Elenco dei flag da mostrare all'admin: unione fra i flag cablati nel codice
 * (KNOWN_FLAGS, con etichetta e descrizione) e TUTTE le chiavi arrivate dal
 * server con /api/flags. Serve perché un kill switch che richiede un deploy
 * per comparire nel pannello non è un kill switch: creando la chiave in
 * api_cache il flag deve apparire da solo.
 * Ordine: prima i noti nell'ordine in cui sono dichiarati (i più importanti
 * stanno in cima), poi gli sconosciuti in ordine alfabetico.
 */
export function elencoFlagCompleto(remoto: Record<string, boolean> = {}): FlagDescritto[] {
  const noti: FlagDescritto[] = KNOWN_FLAGS.map(f => ({
    key: f.key, label: f.label, desc: f.desc, descrizione: f.desc, noto: true
  }));
  const chiaviNote = new Set(KNOWN_FLAGS.map(f => f.key));
  const sconosciuti: FlagDescritto[] = Object.keys(remoto || {})
    .filter(k => k && !chiaviNote.has(k))
    .sort((a, b) => a.localeCompare(b))
    .map(k => ({
      key: k,
      label: etichettaDiRipiego(k),
      desc: 'Flag creato lato server: nessuna descrizione nel client',
      descrizione: 'Flag creato lato server: nessuna descrizione nel client',
      noto: false
    }));
  return [...noti, ...sconosciuti];
}

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
