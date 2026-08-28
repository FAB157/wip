import { createClient } from '@supabase/supabase-js';
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

const supabaseUrl = 'https://qfxxhzkkrkvbuekfknhh.supabase.co';

/**
 * STORAGE DELLA SESSIONE SU NATIVO (SEC-07, 28/08/2026).
 *
 * supabase-js di default tiene la sessione (refresh token compreso) in
 * localStorage, che nella WebView e' un file SQLite in chiaro leggibile da
 * qualunque backup/root. Su Android/iOS si passa a @capacitor/preferences
 * (SharedPreferences / NSUserDefaults, dentro la sandbox dell'app; supabase-js
 * accetta uno storage asincrono). Sul web resta localStorage.
 *
 * MIGRAZIONE: la prima lettura di una chiave assente nelle Preferences la
 * cerca in localStorage (sessione delle build precedenti), la copia e la
 * cancella da li': nessun utente viene sloggato dall'aggiornamento.
 * Nessun altro punto di src/ legge `sb-<ref>-auth-token` direttamente
 * (verificato con grep il 28/08/2026): tutto passa da supabase.auth.
 */
const isNativeStorage = typeof window !== 'undefined' && Capacitor.isNativePlatform();
const nativeAuthStorage = {
  async getItem(key: string): Promise<string | null> {
    try {
      const { value } = await Preferences.get({ key });
      if (value != null) return value;
    } catch { /* plugin non disponibile: si prova la migrazione sotto */ }
    try {
      const legacy = localStorage.getItem(key);
      if (legacy != null) {
        try { await Preferences.set({ key, value: legacy }); localStorage.removeItem(key); } catch { /* resta in localStorage */ }
        return legacy;
      }
    } catch { /* storage bloccato */ }
    return null;
  },
  async setItem(key: string, value: string): Promise<void> {
    try { await Preferences.set({ key, value }); }
    catch { try { localStorage.setItem(key, value); } catch { /* niente */ } }
  },
  async removeItem(key: string): Promise<void> {
    try { await Preferences.remove({ key }); } catch { /* niente */ }
    try { localStorage.removeItem(key); } catch { /* niente */ }
  },
};
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFmeHhoemtrcmt2YnVla2ZrbmhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMDM1ODcsImV4cCI6MjA5NDY3OTU4N30.4v8qFrPU4QOJ-Ko61CASjUoPVEBOM8J9rGeiAbNMpSs';

const isPlaceholder = (val: string) => !val || val.includes('your-') || val.includes('placeholder');

const initMock = () => {
  const mockDb: Record<string, any[]> = {};

  return {
    from: (table: string) => {
      const getStorage = () => {
        try {
          const stored = localStorage.getItem(`mock_db_${table}`);
          if (stored) return JSON.parse(stored);
        } catch(e) {}
        if (!mockDb[table]) mockDb[table] = [];
        return mockDb[table];
      };
      const setStorage = (data: any[]) => {
        mockDb[table] = data;
        try {
          localStorage.setItem(`mock_db_${table}`, JSON.stringify(data));
        } catch(e) {}
      };

      return {
        select: (query?: string) => {
          let data = [...getStorage()];
          const queryBuilder: any = {
            order: (field: string, { ascending }: { ascending?: boolean } = {}) => {
              data.sort((a: any, b: any) => {
                if (a[field] < b[field]) return ascending ? -1 : 1;
                if (a[field] > b[field]) return ascending ? 1 : -1;
                return 0;
              });
              return queryBuilder;
            },
            limit: (n: number) => {
              data = data.slice(0, n);
              return queryBuilder;
            },
            eq: (field: string, value: any) => {
              data = data.filter((item: any) => item[field] === value);
              return queryBuilder;
            },
            single: () => {
              const res = data.length > 0 ? data[0] : null;
              return Promise.resolve({ data: res, error: data.length > 0 ? null : { code: 'PGRST116', message: 'No rows found' } });
            },
            then: (resolve: any, reject: any) => {
              resolve({ data, error: null });
            }
          };
          return queryBuilder;
        },
        insert: (items: any[]) => {
          let data = getStorage();
          const newItems = items.map((i: any) => ({
            ...i,
            created_at: i.created_at || new Date().toISOString()
          }));
          data = [...data, ...newItems];
          setStorage(data);
          return Promise.resolve({ error: null });
        },
        upsert: (item: any) => {
          let data = getStorage();
          const id = item.id || Math.random().toString(36).substr(2, 9);
          const existingIdx = data.findIndex(i => i.id === id);
          const newItem = {
            ...item,
            id,
            updated_at: new Date().toISOString(),
            created_at: existingIdx >= 0 ? data[existingIdx].created_at : new Date().toISOString()
          };
          if (existingIdx >= 0) {
            data[existingIdx] = newItem;
          } else {
            data.push(newItem);
          }
          setStorage(data);
          return Promise.resolve({ data: [newItem], error: null });
        },
        delete: () => {
          return {
            eq: (field: string, value: any) => {
              let data = getStorage();
              data = data.filter((item: any) => item[field] !== value);
              setStorage(data);
              return Promise.resolve({ error: null });
            }
          };
        }
      };
    },
    auth: {
      onAuthStateChange: (callback: any) => {
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
      getSession: async () => {
        try {
          const session = localStorage.getItem('mock_supabase_session');
          if (session) {
            return { data: { session: JSON.parse(session) }, error: null };
          }
        } catch(e) {}
        return { data: { session: null }, error: null };
      },
      signInWithPassword: async ({ email, password }: any) => {
        const session = {
          access_token: 'mock-token',
          user: {
            id: email === 'marmidicarrara@gmail.com' ? 'mock-user-id' : `mock-user-${Date.now()}`,
            email: email,
          }
        };
        localStorage.setItem('mock_supabase_session', JSON.stringify(session));
        return { data: { session, user: session.user }, error: null };
      },
      signUp: async ({ email, password }: any) => {
        const session = {
          access_token: 'mock-token',
          user: {
            id: email === 'marmidicarrara@gmail.com' ? 'mock-user-id' : `mock-user-${Date.now()}`,
            email: email,
          }
        };
        localStorage.setItem('mock_supabase_session', JSON.stringify(session));
        return { data: { session, user: session.user }, error: null };
      },
      signOut: async () => {
        localStorage.removeItem('mock_supabase_session');
        return { error: null };
      }
    }
  };
};

        const fetchWithTimeout = (input: RequestInfo | URL, init?: RequestInit) => {
          const timeout = 20000; // 20s: su reti lente 15s abortiva login/query legittime
          const controller = new AbortController();
          // abort CON motivo: senza, l'utente vedeva il messaggio grezzo del
          // browser "signal is aborted without reason" (es. alla schermata di
          // login su rete lenta) invece di un errore comprensibile.
          const id = setTimeout(
            () => controller.abort(new DOMException('Connessione lenta: richiesta interrotta dopo 20 secondi. Riprova.', 'TimeoutError')),
            timeout
          );

          // Copia dell'init: mutare l'oggetto del chiamante è un side effect
          // sull'SDK; se il chiamante ha già un signal, rispettiamo il suo.
          const options: RequestInit = { ...(init || {}), signal: init?.signal ?? controller.signal };

          return fetch(input, options).finally(() => clearTimeout(id));
        };

        // In produzione una anon key placeholder NON deve degradare in silenzio
        // nel mock (che accetta qualsiasi password e assegna l'id privilegiato
        // 'mock-user-id'): meglio un errore esplicito in build che un'app
        // "funzionante" senza persistenza e con login finto.
        const usingPlaceholder = isPlaceholder(supabaseUrl) || isPlaceholder(supabaseAnonKey);
        if (usingPlaceholder && import.meta.env.PROD) {
          throw new Error('[supabase] Configurazione mancante: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY sono placeholder in una build di produzione.');
        }
        if (usingPlaceholder) {
          console.warn('[supabase] Chiavi placeholder: uso il MOCK client (solo sviluppo, nessun dato persistito).');
        }

        export const supabase: any = usingPlaceholder
          ? initMock()
          : createClient(supabaseUrl, supabaseAnonKey, {
              global: {
                fetch: fetchWithTimeout
              },
              auth: isNativeStorage
                ? {
                    storage: nativeAuthStorage,
                    persistSession: true,
                    autoRefreshToken: true,
                    // PKCE sul nativo: il code verifier vive nello stesso
                    // storage cifrato; niente token nel frammento dell'URL.
                    // Sul web resta il flusso di default: i link di recupero
                    // password (PASSWORD_RECOVERY in App.tsx) arrivano ancora
                    // col frammento implicito e cambiarli qui li romperebbe.
                    flowType: 'pkce',
                    // Nessun frammento OAuth da leggere in una WebView.
                    detectSessionInUrl: false,
                  }
                : undefined,
            });

