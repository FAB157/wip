import { Capacitor } from '@capacitor/core';

/**
 * Gestore intelligente degli URL API
 * Risolve il problema "Failed to fetch" sui dispositivi mobili
 */
export function getApiUrl(path: string): string {
  // Se il path è già un URL assoluto (es. Supabase), non toccarlo
  if (path.startsWith('http')) return path;

  const isNative = Capacitor.isNativePlatform();

  // URL di produzione: dominio custom (stesso progetto Vercel di
  // itainta.vercel.app, che resta attivo per le build vecchie).
  // `www.` e NON l'apex: l'apex `wip.guide` risponde 308 verso www (verificato
  // il 22/08/2026), e su un redirect cross-origin il client butta via
  // l'header Authorization — le rotte che vogliono il token (viaggi di gruppo,
  // giro a piu' tappe, crediti) tornavano 401 sull'app nativa, e le fetch
  // CORS si fermavano al 308 senza Access-Control-Allow-Origin.
  const PROD_URL = 'https://www.wip.guide';

  if (isNative) {
    // Se siamo su Android/iOS, dobbiamo usare l'URL assoluto
    // Assicurati che il path inizi con /
    const cleanPath = path.startsWith('/') ? path : `/${path}`;

    // In sviluppo (debug), potresti voler usare l'IP del tuo PC
    // ma per ora puntiamo alla produzione per massima stabilità
    return `${PROD_URL}${cleanPath}`;
  }

  // Su PC (Browser), usiamo il path relativo che funziona con il proxy di Vite/DevServer
  return path;
}

/**
 * Rete di sicurezza per le chiamate `/api/...` scritte con path relativo.
 *
 * Su app nativa un path relativo punta al bundle locale (capacitor://...) e
 * la richiesta fallisce: erano decine i punti che dimenticavano getApiUrl(),
 * e ogni omissione futura rompeva silenziosamente una funzione solo sul
 * telefono. Qui il fetch globale riscrive una volta per tutte i soli path
 * che iniziano con `/api/`, lasciando intatto qualsiasi altro URL.
 *
 * Da invocare una sola volta all'avvio (src/main.tsx).
 */
export function installNativeApiFetch(): void {
  if (!Capacitor.isNativePlatform()) return;
  const w = window as any;
  if (w.__wipApiFetchPatched) return;
  w.__wipApiFetchPatched = true;

  const originalFetch = window.fetch.bind(window);
  window.fetch = ((input: any, init?: any) => {
    try {
      if (typeof input === 'string' && input.startsWith('/api/')) {
        return originalFetch(getApiUrl(input), init);
      }
      if (input instanceof Request && input.url) {
        // Le Request costruite a mano risolvono l'URL sulla base locale
        const idx = input.url.indexOf('/api/');
        if (idx !== -1 && !input.url.startsWith('http')) {
          return originalFetch(new Request(getApiUrl(input.url.slice(idx)), input), init);
        }
      }
    } catch { /* qualunque imprevisto: si usa il fetch originale */ }
    return originalFetch(input, init);
  }) as typeof window.fetch;
}
