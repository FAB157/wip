// Accesso nativo con Google e Apple (09/09/2026).
//
// Perche' esiste: fino a ieri il login social apriva il browser di sistema
// (@capacitor/browser) e tornava in app via redirect. Funziona, ma l'utente
// vede una finestra Safari con l'indirizzo del progetto Supabase
// (qfxxhzkkrkvbuekfknhh.supabase.co) — il committente l'ha giustamente letta
// come "sembra un sito truffa". Con l'accesso nativo non c'e' nessuna
// finestra web: iOS mostra il foglio di sistema col NOME dell'app, e al
// codice arriva direttamente un id token da scambiare con Supabase
// (`signInWithIdToken`), senza redirect ne' allow-list di URL.
//
// Ricadute: e' anche piu' robusto (niente Universal Link, niente schema
// personalizzato, niente browser che resta aperto) ed e' la forma che Apple
// preferisce in revisione.
//
// Il flusso browser resta come RIPIEGO: se il nativo non e' configurato
// (manca il client ID iOS di Google) o fallisce, LoginScreen ricade sul
// vecchio percorso, che continua a funzionare.

import { Capacitor } from '@capacitor/core';

/**
 * Client ID iOS di Google — client "WIP iOS" del progetto Google Cloud
 * `wip-ita`, creato il 10/09/2026 e autorizzato fra i Client IDs del provider
 * Google su Supabase (senza quel passaggio Supabase rifiuta il token).
 *
 * E' scritto in chiaro di proposito: i client ID OAuth di Google sono pubblici
 * per definizione — questo stesso valore, al contrario, sta gia' in
 * `ios/App/App/Info.plist` dentro ogni copia dell'app. Il segreto e' il client
 * SECRET, che qui non c'e' e non deve esserci. L'env permette comunque di
 * cambiarlo senza toccare il codice.
 */
const GOOGLE_IOS_CLIENT_ID = String(
  import.meta.env.VITE_GOOGLE_IOS_CLIENT_ID ||
    '363241288394-ur4d52235e9mpm75mmaslt7shm4ufiae.apps.googleusercontent.com',
).trim();
/**
 * Client ID "web" da usare come audience del token (`iOSServerClientId`).
 * VUOTO DI PROPOSITO: Google lo accetta solo se il client web sta nello STESSO
 * progetto del client iOS, e il nostro client web vive in un progetto
 * (908373483783) a cui non abbiamo piu' accesso. Lasciandolo vuoto il token
 * esce con l'audience del client iOS, che e' quella autorizzata su Supabase.
 */
const GOOGLE_WEB_CLIENT_ID = String(import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID || '').trim();

let inizializzato = false;

/** Inizializza il plugin una volta sola (chiamarlo piu' volte non fa danni). */
const inizializza = async () => {
  if (inizializzato) return;
  const { SocialLogin } = await import('@capgo/capacitor-social-login');
  await SocialLogin.initialize({
    // Apple su iOS non vuole configurazione: usa il Bundle ID dell'app.
    apple: {},
    ...(GOOGLE_IOS_CLIENT_ID
      ? {
          google: {
            iOSClientId: GOOGLE_IOS_CLIENT_ID,
            // Serve a farsi emettere il token con l'audience del client "web",
            // quello che Supabase ha configurato sul provider Google.
            ...(GOOGLE_WEB_CLIENT_ID
              ? { iOSServerClientId: GOOGLE_WEB_CLIENT_ID, webClientId: GOOGLE_WEB_CLIENT_ID }
              : {}),
          },
        }
      : {}),
  } as any);
  inizializzato = true;
};

/** Google nativo: solo su app nativa e solo se il client ID iOS e' configurato. */
export const googleNativoDisponibile = () =>
  Capacitor.isNativePlatform() && (GOOGLE_IOS_CLIENT_ID !== '' || GOOGLE_WEB_CLIENT_ID !== '');

/** Apple nativo: solo su iOS (su Android non esiste, si usa il browser). */
export const appleNativoDisponibile = () =>
  Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';

/**
 * Accesso Google nativo. Restituisce l'id token da passare a
 * `supabase.auth.signInWithIdToken({ provider: 'google', token })`.
 */
export const accediConGoogleNativo = async (): Promise<string> => {
  await inizializza();
  const { SocialLogin } = await import('@capgo/capacitor-social-login');
  const esito = await SocialLogin.login({ provider: 'google', options: { scopes: ['email', 'profile'] } });
  const token = (esito as any)?.result?.idToken;
  if (!token) throw new Error('Google non ha restituito un id token');
  return String(token);
};

/**
 * Nonce per Apple: ad Apple si manda l'IMPRONTA SHA-256, a Supabase il valore
 * IN CHIARO — e' Supabase a rifare l'impronta e a confrontarla con quella
 * dentro il token. Mandare lo stesso valore da entrambe le parti fa fallire
 * la verifica.
 */
const nonceGrezzo = () => {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return Array.from(b, (n) => n.toString(16).padStart(2, '0')).join('');
};

const impronta = async (testo: string) => {
  const dati = new TextEncoder().encode(testo);
  const digest = await crypto.subtle.digest('SHA-256', dati);
  return Array.from(new Uint8Array(digest), (n) => n.toString(16).padStart(2, '0')).join('');
};

/**
 * Accesso Apple nativo. Restituisce id token e nonce in chiaro, entrambi da
 * passare a `supabase.auth.signInWithIdToken({ provider: 'apple', token, nonce })`.
 */
export const accediConAppleNativo = async (): Promise<{ token: string; nonce: string }> => {
  await inizializza();
  const { SocialLogin } = await import('@capgo/capacitor-social-login');
  const grezzo = nonceGrezzo();
  const esito = await SocialLogin.login({
    provider: 'apple',
    options: { scopes: ['email', 'name'], nonce: await impronta(grezzo) },
  });
  const token = (esito as any)?.result?.idToken;
  if (!token) throw new Error('Apple non ha restituito un id token');
  return { token: String(token), nonce: grezzo };
};
