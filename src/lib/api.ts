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
 * fetch con TIMEOUT (AbortController), stesso schema di supabase.ts.
 *
 * Fino al 28/08/2026 decine di fetch (rotte OSRM, tile, Overpass, audioguide,
 * MP3, enrich) non avevano alcun limite: su rete mobile degradata la promise
 * restava appesa per minuti, con spinner eterni e code di audio bloccate.
 * Se il chiamante passa gia' un `signal`, si rispetta il suo e si aggiunge
 * il timeout sopra (abortiamo il nostro controller, che inoltra l'abort).
 * L'abort porta un motivo leggibile: 'TimeoutError' come DOMException, cosi'
 * chi fa `err.name === 'AbortError' || err.name === 'TimeoutError'` lo vede.
 */
// ── Bearer automatico (28/08/2026) ──────────────────────────────────────
// Il server esige `Authorization: Bearer <jwt>` su tutte le rotte che
// generano (audioguide, regenerate, enrich, tts, candidates, ...): 401
// {error:'auth_required'} all'anonimo. Invece di ricordarsene in ogni
// chiamata, apiFetch lo aggiunge da se' quando l'URL e' la NOSTRA API.
// Il token si legge da supabase.auth.getSession() con una cache breve
// (30 s, o meno se la sessione scade prima) per non interrogare l'SDK a
// ogni richiesta. Senza sessione: nessun header, il server rispondera' 401
// e chi chiama mostra l'invito al login.
let tokenCache: { token: string | null; scade: number } = { token: null, scade: 0 };
const TOKEN_CACHE_MS = 30_000;

export function invalidaTokenCache(): void { tokenCache = { token: null, scade: 0 }; }

export async function getBearerToken(): Promise<string | null> {
  const now = Date.now();
  if (now < tokenCache.scade) return tokenCache.token;
  try {
    const { supabase } = await import('./supabase');
    const { data } = await supabase.auth.getSession();
    const sess = data?.session;
    const token: string | null = sess?.access_token || null;
    // La cache non deve sopravvivere alla scadenza del JWT (expires_at in s).
    const expMs = Number(sess?.expires_at) > 0 ? Number(sess.expires_at) * 1000 - 60_000 : Infinity;
    tokenCache = { token, scade: Math.min(now + TOKEN_CACHE_MS, expMs) };
    return token;
  } catch {
    tokenCache = { token: null, scade: now + 5_000 };
    return null;
  }
}

/** `{ Authorization: 'Bearer …' }` se c'e' una sessione, altrimenti `{}`. */
export async function bearerHeaders(): Promise<Record<string, string>> {
  const t = await getBearerToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

/** L'URL e' verso la nostra API (relativo `/api/…` o assoluto su wip.guide / vercel)? */
export function isOurApiUrl(input: string | URL | Request): boolean {
  let u = '';
  try {
    u = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url || '';
  } catch { return false; }
  if (!u) return false;
  if (u.startsWith('/api/')) return true;
  if (/^https:\/\/(www\.)?wip\.guide\/api\//.test(u)) return true;
  if (/^https:\/\/itainta(-[a-z0-9-]+)?\.vercel\.app\/api\//.test(u)) return true;
  try {
    if (typeof window !== 'undefined' && u.startsWith(window.location.origin + '/api/')) return true;
  } catch { /* SSR */ }
  return false;
}

export async function apiFetch(url: string | URL | Request, init?: RequestInit, timeoutMs = 20000): Promise<Response> {
  // Bearer automatico verso la nostra API, se il chiamante non l'ha gia' messo.
  if (isOurApiUrl(url)) {
    const headers = new Headers(init?.headers || (url instanceof Request ? url.headers : undefined));
    if (!headers.has('Authorization')) {
      const t = await getBearerToken();
      if (t) headers.set('Authorization', `Bearer ${t}`);
    }
    // Oggetto semplice: la fetch patchata da CapacitorHttp non digerisce Headers.
    const plain: Record<string, string> = {};
    headers.forEach((v, k) => { plain[k] = v; });
    init = { ...(init || {}), headers: plain };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => {
    try {
      controller.abort(new DOMException(`Richiesta interrotta dopo ${Math.round(timeoutMs / 1000)} s (rete lenta)`, 'TimeoutError'));
    } catch {
      controller.abort();
    }
  }, timeoutMs);
  // Signal esterno: si inoltra l'abort del chiamante sul nostro controller.
  const esterno = init?.signal;
  if (esterno) {
    if (esterno.aborted) controller.abort();
    else esterno.addEventListener('abort', () => controller.abort(), { once: true });
  }
  const options: RequestInit = { ...(init || {}), signal: controller.signal };
  return fetch(url as any, options).finally(() => clearTimeout(timer));
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
