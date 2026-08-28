// Tile raster CARTO: URL e chiave in UN posto solo.
//
// CARTO ha smesso di servire le tile anonime il 26/08/2026: senza `?key=` ogni
// tile esce con il watermark "API KEY REQUIRED". Sull'IPA di CI del 28/08/2026
// e' successo proprio questo: VITE_CARTO_API_KEY non era passata alla build e
// Vite l'aveva inlineata vuota. La chiave NON viene scritta nel sorgente:
// arriva dall'ambiente in fase di build oppure, se manca, viene chiesta a
// runtime alla nostra API (/api/config/public, che la legge dal suo env). E'
// una chiave pubblica di client (finisce nell'URL di ogni tile), quindi
// esporla via API non cambia il suo perimetro.
//
// Attenzione: offlineTiles.ts deve generare URL IDENTICI a quelli del layer
// Leaflet (stessa cache): per questo entrambi passano da cartoTileUrl().
import { getApiUrl } from './api';

let cartoKey: string = (import.meta.env.VITE_CARTO_API_KEY as string | undefined) || '';
let richiestaInCorso: Promise<string> | null = null;
const ascoltatori = new Set<() => void>();

/** Template Leaflet ({s},{z},{x},{y},{r}) con la chiave corrente. */
export function cartoTileUrl(): string {
  return `https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?key=${cartoKey}`;
}

export function hasCartoKey(): boolean {
  return cartoKey.length > 0;
}

/** Notifica chi disegna le tile quando la chiave arriva a runtime. */
export function onCartoKeyChange(cb: () => void): () => void {
  ascoltatori.add(cb);
  return () => { ascoltatori.delete(cb); };
}

/**
 * Se la build non aveva la chiave, la chiede una volta sola al server.
 * Risolve sempre (chiave vuota se anche il server non ce l'ha): il layer
 * viene comunque disegnato, al peggio con il watermark.
 */
export async function ensureCartoKey(): Promise<string> {
  if (cartoKey) return cartoKey;
  if (richiestaInCorso) return richiestaInCorso;
  richiestaInCorso = (async () => {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 8000);
      const res = await fetch(getApiUrl('/api/config/public'), { signal: ctrl.signal });
      clearTimeout(t);
      if (res.ok) {
        const j = await res.json().catch(() => null);
        const k = typeof j?.cartoApiKey === 'string' ? j.cartoApiKey.trim() : '';
        if (k) {
          cartoKey = k;
          ascoltatori.forEach((cb) => { try { cb(); } catch { /* niente */ } });
        }
      }
    } catch {
      /* offline o API giu': si resta senza chiave, niente da fare */
    } finally {
      richiestaInCorso = null;
    }
    return cartoKey;
  })();
  return richiestaInCorso;
}
