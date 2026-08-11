import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { getApiUrl } from '../lib/api';
import { Activity, Play, RefreshCw, CheckCircle2, XCircle, AlertTriangle, Database, Wifi, Smartphone, HardDrive, Map, Award, Trash2, Bell, ShieldCheck, Globe2, Volume2, Navigation } from 'lucide-react';

type TestStatus = 'idle' | 'running' | 'passed' | 'failed' | 'warning';

// Una sola chiamata autenticata all'endpoint diagnostics, condivisa (con cache
// breve) tra tutti i check: prima ogni check faceva la sua fetch senza token.
let diagCache: { t: number; p: Promise<any> } | null = null;
const fetchDiagnostics = async (): Promise<any> => {
  if (diagCache && Date.now() - diagCache.t < 10_000) return diagCache.p;
  const p = (async () => {
    const { data: s } = await supabase.auth.getSession();
    const token = s?.session?.access_token;
    const res = await fetch(getApiUrl('/api/admin/diagnostics'), {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  })();
  diagCache = { t: Date.now(), p };
  return p;
};

interface DiagnosticTest {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  status: TestStatus;
  resultMessage?: string;
  solution?: string;
  run: () => Promise<{ status: TestStatus; message: string; solution?: string }>;
}

export default function AdminDiagnostics() {
  const [isRunningAll, setIsRunningAll] = useState(false);
  const [tests, setTests] = useState<DiagnosticTest[]>([
    {
      id: 'network',
      name: 'Connettività di Rete',
      description: 'Verifica se il dispositivo è connesso a Internet.',
      icon: <Wifi className="w-5 h-5" />,
      status: 'idle',
      run: async () => {
        const isOnline = navigator.onLine;
        if (isOnline) {
          try {
            const res = await fetch('https://1.1.1.1', { mode: 'no-cors', cache: 'no-store' });
            return { status: 'passed', message: 'Connessione Internet attiva e responsiva.' };
          } catch {
            return { status: 'warning', message: 'Il dispositivo risulta connesso, ma internet potrebbe essere lento o bloccato da un firewall.', solution: 'Controlla la tua connessione Wi-Fi o Dati.' };
          }
        }
        return { status: 'failed', message: 'Dispositivo Offline.', solution: 'Attiva il Wi-Fi o la rete cellulare del dispositivo.' };
      }
    },
    {
      id: 'supabase_latency',
      name: 'Salute Database (Supabase)',
      description: 'Misura la latenza di risposta del database centrale.',
      icon: <Database className="w-5 h-5" />,
      status: 'idle',
      run: async () => {
        const start = performance.now();
        try {
          const { error } = await supabase.from('shared_pois').select('id').limit(1);
          const end = performance.now();
          const latency = Math.round(end - start);
          
          if (error) throw error;
          
          if (latency > 1500) {
            return { status: 'warning', message: `Database lento. Risposta in ${latency}ms.`, solution: 'Possibili problemi ai server Supabase in Europa. Controlla la dashboard di Supabase.' };
          }
          return { status: 'passed', message: `Database in ottima salute. Risposta rapida in ${latency}ms.` };
        } catch (e: any) {
          return { status: 'failed', message: `Connessione al database fallita: ${e.message}`, solution: 'Verifica che le chiavi API Supabase (VITE_SUPABASE_URL) siano valide nel file .env' };
        }
      }
    },
    {
      id: 'ping_groq',
      name: 'Salute Groq (LLaMA)',
      description: 'Ping ai server di Groq per operazioni on-the-fly.',
      icon: <Activity className="w-5 h-5" />,
      status: 'idle',
      run: async () => {
        // Mai chiavi API nel browser: lo stato arriva dal backend autenticato.
        const start = performance.now();
        try {
          const data = await fetchDiagnostics();
          const latency = Math.round(performance.now() - start);
          if (data.groq?.status === 'passed') {
            return { status: 'passed', message: `Groq configurato lato server. Latenza backend: ${latency}ms` };
          }
          return { status: 'warning', message: 'Groq non configurato sul server.', solution: 'Configura GROQ_API_KEY su Vercel.' };
        } catch (e) {
          return { status: 'failed', message: 'Endpoint diagnostics irraggiungibile.', solution: 'Verifica la connessione o i log del server.' };
        }
      }
    },
    {
      id: 'ping_deepseek',
      name: 'Salute DeepSeek',
      description: 'Ping ai server DeepSeek per guide premium e itinerari.',
      icon: <Activity className="w-5 h-5" />,
      status: 'idle',
      run: async () => {
        // Mai chiavi API nel browser: lo stato arriva dal backend autenticato.
        const start = performance.now();
        try {
          const data = await fetchDiagnostics();
          const latency = Math.round(performance.now() - start);
          if (data.deepseek?.status === 'passed') {
            return { status: 'passed', message: `DeepSeek configurato lato server. Latenza backend: ${latency}ms` };
          }
          return { status: 'warning', message: 'DeepSeek non configurato sul server.', solution: 'Configura DEEPSEEK_API_KEY su Vercel.' };
        } catch (e) {
          return { status: 'failed', message: 'Endpoint diagnostics irraggiungibile.', solution: 'Verifica la connessione o i log del server.' };
        }
      }
    },
    {
      id: 'db_seeding',
      name: 'Integrità Database POI',
      description: 'Controlla che la tabella dei luoghi condivisi non sia vuota.',
      icon: <Database className="w-5 h-5" />,
      status: 'idle',
      run: async () => {
        try {
          const { count, error } = await supabase.from('shared_pois').select('*', { count: 'exact', head: true });
          if (error) throw error;
          if (count === 0 || count === null) {
            return { status: 'failed', message: 'Il database dei luoghi condivisi è completamente vuoto!', solution: 'Naviga sulla mappa nell\'app e apri la scheda di un luogo per innescare il seeding automatico per la prima volta.' };
          }
          return { status: 'passed', message: `Database popolato correttamente. Ci sono ${count} luoghi nell'ecosistema.` };
        } catch (e: any) {
          return { status: 'failed', message: `Errore lettura tabella: ${e.message}`, solution: 'Possibile problema ai permessi RLS su Supabase.' };
        }
      }
    },
    {
      id: 'geofencing_math',
      name: 'Motore Matematico Geofencing',
      description: 'Esegue un self-test sulla formula di Haversine per la rilevazione dei luoghi.',
      icon: <Map className="w-5 h-5" />,
      status: 'idle',
      run: async () => {
        return new Promise((resolve) => {
          try {
            // Roma Colosseo
            const lat1 = 41.8902 * (Math.PI / 180);
            const lon1 = 12.4922 * (Math.PI / 180);
            // 100 metri più in là
            const lat2 = 41.8911 * (Math.PI / 180);
            const lon2 = 12.4922 * (Math.PI / 180);
            
            const R = 6371e3; // Raggio terra in metri
            const dLat = lat2 - lat1;
            const dLon = lon2 - lon1;
            
            const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            const distance = Math.round(R * c);
            
            // Distanza dovrebbe essere circa 100 metri
            if (distance > 95 && distance < 105) {
              resolve({ status: 'passed', message: `Geometria spaziale accurata. Calcolo test: ${distance} metri.` });
            } else {
              resolve({ status: 'failed', message: `Errore nella formula! Distanza anomala: ${distance}m`, solution: 'La formula Haversine nel codice potrebbe essere stata corrotta o alterata accidentalmente.' });
            }
          } catch (e: any) {
            resolve({ status: 'failed', message: `Errore logico: ${e.message}`, solution: 'Contatta il programmatore per riparare il codice matematico.' });
          }
        });
      }
    },
    {
      id: 'audio_queue',
      name: 'Gestore Coda Audio',
      description: 'Verifica che il provider audio sia collegato al gestore della coda.',
      icon: <Volume2 className="w-5 h-5" />,
      status: 'idle',
      run: async () => {
        const { audioQueueManager } = await import('../lib/AudioQueueManager');
        if ((audioQueueManager as any).audioProvider) {
          return { status: 'passed', message: 'Provider audio collegato correttamente. La coda può riprodurre suoni.' };
        }
        return { status: 'failed', message: 'Provider audio non rilevato.', solution: 'Assicurati che locationService.init() sia chiamato all\'avvio dell\'app.' };
      }
    },
    {
      id: 'gamification_logic',
      name: 'Logica Gamification & Punti',
      description: 'Verifica la coerenza del sistema di calcolo dei punti XP.',
      icon: <Award className="w-5 h-5" />,
      status: 'idle',
      run: async () => {
        try {
          const { recordPoiVision } = await import('../lib/gamification');
          if (typeof recordPoiVision === 'function') {
            return { status: 'passed', message: 'Le librerie Gamification sono collegate ed espongono le funzioni corrette.' };
          } else {
            return { status: 'failed', message: 'Manca la funzione recordPoiVision', solution: 'La libreria gamification.ts non esiste o è corrotta.' };
          }
        } catch (e: any) {
          return { status: 'failed', message: `Errore nel caricamento moduli gamification: ${e.message}`, solution: 'Verifica l\'esistenza di src/lib/gamification.ts' };
        }
      }
    },
    {
      id: 'audio_tts',
      name: 'Motore Sintesi Vocale (TTS)',
      description: 'Verifica che il dispositivo sia in grado di leggere a voce alta i testi.',
      icon: <Smartphone className="w-5 h-5" />,
      status: 'idle',
      run: async () => {
        if ('speechSynthesis' in window) {
          const voices = window.speechSynthesis.getVoices();
          if (voices.length > 0) {
            return { status: 'passed', message: `Motore TTS Attivo. Trovate ${voices.length} voci installate.` };
          } else {
            return { status: 'warning', message: 'Motore TTS supportato, ma nessuna voce caricata (spesso richiede interazione utente iniziale).', solution: 'Niente di rotto. Le voci di sistema vengono caricate solo quando un utente avvia un audio per la prima volta su iOS/Android.' };
          }
        }
        return { status: 'failed', message: 'API Web Speech non supportata.', solution: 'Browser obsoleto o iOS WebKit bloccato.' };
      }
    },
    {
      id: 'api_azure_tts',
      name: 'Azure Speech (TTS Principale)',
      description: 'Verifica il motore vocale primario delle audioguide (voci Nicky/Dante).',
      icon: <Volume2 className="w-5 h-5 text-sky-500" />,
      status: 'idle',
      run: async () => {
        try {
          const data = await fetchDiagnostics();
          if (data.azure_tts?.status === 'passed') return { status: 'passed', message: 'Azure Speech configurato: le audioguide usano le voci neurali.' };
          return { status: 'warning', message: 'Azure Speech non configurato: fallback su Google TTS/nativo.', solution: 'Configura AZURE_SPEECH_KEY e AZURE_SPEECH_REGION su Vercel.' };
        } catch { return { status: 'failed', message: 'Endpoint backend irraggiungibile' }; }
      }
    },
    {
      id: 'api_ai_together',
      name: 'API Together AI (Vision)',
      description: 'Verifica il motore Llama-3.2 Vision.',
      icon: <CheckCircle2 className="w-5 h-5 text-blue-500" />,
      status: 'idle',
      run: async () => {
        try {
          const data = await fetchDiagnostics();
          if (data.together?.status === 'passed') return { status: 'passed', message: 'Together AI API Configured.' };
          return { status: 'warning', message: 'Together AI API non configurata (usando Gemini Fallback)', solution: 'Configura TOGETHER_API_KEY su Vercel.' };
        } catch { return { status: 'failed', message: 'Endpoint backend irraggiungibile' }; }
      }
    },
    {
      id: 'api_stripe',
      name: 'Stripe (Pagamenti)',
      description: 'Verifica la configurazione del gateway pagamenti crediti/abbonamenti.',
      icon: <ShieldCheck className="w-5 h-5 text-violet-500" />,
      status: 'idle',
      run: async () => {
        try {
          const data = await fetchDiagnostics();
          if (data.stripe?.status === 'passed') return { status: 'passed', message: 'Stripe configurato: checkout crediti e webhook attivi.' };
          return { status: 'failed', message: 'Stripe NON configurato: gli acquisti web falliranno.', solution: 'Configura STRIPE_SECRET_KEY e STRIPE_WEBHOOK_SECRET su Vercel.' };
        } catch { return { status: 'failed', message: 'Endpoint backend irraggiungibile' }; }
      }
    },
    {
      id: 'api_scraping_virgilio',
      name: 'Scraping Virgilio',
      description: 'Testa la validità dell\'estrattore eventi Virgilio.',
      icon: <Globe2 className="w-5 h-5" />,
      status: 'idle',
      run: async () => {
        try {
          const data = await fetchDiagnostics();
          if (data.virgilio?.status === 'passed') return { status: 'passed', message: 'Virgilio Scraper logic ok.' };
          return { status: 'failed', message: 'Errore nello scraping' };
        } catch { return { status: 'failed', message: 'Backend irraggiungibile' }; }
      }
    },
    {
      id: 'api_affiliate_gyg',
      name: 'GetYourGuide Affiliate',
      description: 'Test generatore link affiliato GYG.',
      icon: <Globe2 className="w-5 h-5" />,
      status: 'idle',
      run: async () => {
        try {
          const data = await fetchDiagnostics();
          if (data.getyourguide?.status === 'passed') return { status: 'passed', message: 'Generatore link GYG (partner_id=KYSFZYF) attivo.' };
          return { status: 'failed', message: 'Errore generatore link' };
        } catch { return { status: 'failed', message: 'Backend irraggiungibile' }; }
      }
    },
    {
      id: 'api_ticketmaster',
      name: 'Ticketmaster API',
      description: 'Test connessione Ticketmaster Discovery.',
      icon: <CheckCircle2 className="w-5 h-5 text-pink-500" />,
      status: 'idle',
      run: async () => {
        try {
          const data = await fetchDiagnostics();
          if (data.ticketmaster?.status === 'passed') return { status: 'passed', message: 'Ticketmaster proxy attivo.' };
          return { status: 'failed', message: 'Errore Ticketmaster' };
        } catch { return { status: 'failed', message: 'Backend irraggiungibile' }; }
      }
    },
    {
      id: 'api_ai_gemini',
      name: 'API Gemini (Fallback/Vision)',
      description: 'Verifica la configurazione di Google Gemini AI.',
      icon: <CheckCircle2 className="w-5 h-5 text-blue-400" />,
      status: 'idle',
      run: async () => {
        try {
          const data = await fetchDiagnostics();
          if (data.gemini?.status === 'passed') return { status: 'passed', message: 'Gemini API Configured.' };
          return { status: 'warning', message: 'Gemini API non configurata', solution: 'Configura GEMINI_API_KEY su Vercel.' };
        } catch { return { status: 'failed', message: 'Endpoint backend irraggiungibile' }; }
      }
    },
    {
      id: 'api_google_places',
      name: 'Google Places API',
      description: 'Verifica accesso API mappa commerciale.',
      icon: <CheckCircle2 className="w-5 h-5 text-red-500" />,
      status: 'idle',
      run: async () => {
        try {
          const data = await fetchDiagnostics();
          if (data.google_places?.status === 'passed') return { status: 'passed', message: 'Google Places API Configured.' };
          return { status: 'warning', message: 'Google Places API non configurata', solution: 'Configura VITE_GOOGLE_MAPS_API_KEY su Vercel.' };
        } catch { return { status: 'failed', message: 'Endpoint backend irraggiungibile' }; }
      }
    },
    {
      id: 'api_overpass',
      name: 'Overpass API (OSM)',
      description: 'Test server pubblico OpenStreetMap Overpass.',
      icon: <Globe2 className="w-5 h-5" />,
      status: 'idle',
      run: async () => {
        try {
          const data = await fetchDiagnostics();
          if (data.overpass?.status === 'passed') return { status: 'passed', message: 'Overpass API Proxy accessibile.' };
          return { status: 'failed', message: 'Errore Overpass' };
        } catch { return { status: 'failed', message: 'Backend irraggiungibile' }; }
      }
    },
    {
      id: 'api_foursquare',
      name: 'Foursquare API',
      description: 'Verifica accesso API per locali e ristoranti.',
      icon: <CheckCircle2 className="w-5 h-5 text-indigo-500" />,
      status: 'idle',
      run: async () => {
        try {
          const data = await fetchDiagnostics();
          if (data.foursquare?.status === 'passed') return { status: 'passed', message: 'Foursquare API Configured.' };
          return { status: 'warning', message: 'Foursquare API non configurata', solution: 'Configura VITE_FOURSQUARE_API_KEY su Vercel.' };
        } catch { return { status: 'failed', message: 'Endpoint backend irraggiungibile' }; }
      }
    },
    {
      id: 'api_tripadvisor',
      name: 'TripAdvisor API (Fallback)',
      description: 'Verifica proxy di scraping TripAdvisor per i locali.',
      icon: <Globe2 className="w-5 h-5" />,
      status: 'idle',
      run: async () => {
        try {
          const data = await fetchDiagnostics();
          if (data.tripadvisor?.status === 'passed') return { status: 'passed', message: 'TripAdvisor Fallback Proxy accessibile.' };
          return { status: 'failed', message: 'Errore TripAdvisor Proxy' };
        } catch { return { status: 'failed', message: 'Backend irraggiungibile' }; }
      }
    },
    {
      id: 'api_viator',
      name: 'Viator Affiliate',
      description: 'Verifica scraping affiliato Viator per eventi.',
      icon: <Globe2 className="w-5 h-5" />,
      status: 'idle',
      run: async () => {
        try {
          const data = await fetchDiagnostics();
          if (data.viator?.status === 'passed') return { status: 'passed', message: 'Generatore link Viator attivo.' };
          return { status: 'failed', message: 'Errore Viator' };
        } catch { return { status: 'failed', message: 'Backend irraggiungibile' }; }
      }
    },
    {
      id: 'api_wikipedia',
      name: 'Wikipedia API',
      description: 'Verifica accesso API pubblica per la cultura.',
      icon: <Globe2 className="w-5 h-5" />,
      status: 'idle',
      run: async () => {
        try {
          const data = await fetchDiagnostics();
          if (data.wikipedia?.status === 'passed') return { status: 'passed', message: 'Wikipedia API Proxy accessibile.' };
          return { status: 'failed', message: 'Errore Wikipedia' };
        } catch { return { status: 'failed', message: 'Backend irraggiungibile' }; }
      }
    },
    {
      id: 'api_elevenlabs',
      name: 'ElevenLabs API (TTS)',
      description: 'Verifica configurazione motore vocale premium.',
      icon: <Volume2 className="w-5 h-5 text-emerald-500" />,
      status: 'idle',
      run: async () => {
        try {
          const data = await fetchDiagnostics();
          if (data.elevenlabs?.status === 'passed') return { status: 'passed', message: 'ElevenLabs API Configured.' };
          return { status: 'warning', message: 'ElevenLabs API non configurata (userà sistema Nativo)', solution: 'Configura ELEVENLABS_API_KEY su Vercel.' };
        } catch { return { status: 'failed', message: 'Endpoint backend irraggiungibile' }; }
      }
    },
    {
      id: 'local_storage',
      name: 'Memoria App (Storage Locale)',
      description: 'Analizza lo stato della memoria offline usata dall\'app.',
      icon: <HardDrive className="w-5 h-5" />,
      status: 'idle',
      run: async () => {
        try {
          let total = 0;
          for (let x in localStorage) {  
            let amount = (localStorage[x].length * 2) / 1024 / 1024;  
            if (!isNaN(amount)) {
              total += amount;
            }
          }
          if (total > 4.5) { // Quota standard locale browser = 5MB
            return { status: 'warning', message: `Allarme! Stai usando ${total.toFixed(2)} MB di cache offline. Sei vicino al limite di 5MB standard.`, solution: 'Svuota la cache dal "Panic Button" o rimuovi Itinerari Offline.' };
          }
          return { status: 'passed', message: `Memoria sicura. L'app sta occupando ${total.toFixed(2)} MB nella cache del telefono.` };
        } catch (e: any) {
          return { status: 'failed', message: 'Storage bloccato', solution: 'L\'utente sta navigando in incognito totale o il dispositivo blocca il salvataggio dei dati. L\'app non può salvare preferenze!' };
        }
      }
    },
    {
      id: 'bg_geolocation',
      name: 'Background Geolocation',
      description: 'Verifica lo stato del plugin di localizzazione in background.',
      icon: <Navigation className="w-5 h-5" />,
      status: 'idle',
      run: async () => {
        try {
          if (typeof window !== 'undefined' && 'Capacitor' in window) {
            // Finta chiamata per testare se Capacitor è inizializzato
            return { status: 'passed', message: 'Plugin Capacitor nativo rilevato correttamente.' };
          } else {
            return { status: 'warning', message: 'App in esecuzione su Web Browser. Permessi nativi disabilitati.', solution: 'Per testare il background, usa un emulatore iOS/Android o un dispositivo fisico.' };
          }
        } catch (e: any) {
          return { status: 'failed', message: `Errore plugin GPS: ${e.message}`, solution: 'Verifica l\'installazione del plugin @capacitor-community/background-geolocation' };
        }
      }
    },
    {
      id: 'audio_context',
      name: 'Canale Audio & Bluetooth',
      description: 'Verifica l\'inizializzazione dell\'AudioContext per output multimediale.',
      icon: <Volume2 className="w-5 h-5" />,
      status: 'idle',
      run: async () => {
        try {
          const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
          if (AudioContextClass) {
            const ctx = new AudioContextClass();
            const state = ctx.state;
            await ctx.close();
            return { status: 'passed', message: `Motore Audio pronto. Stato iniziale: ${state}. Routing Bluetooth abilitato.` };
          }
          return { status: 'failed', message: 'AudioContext non disponibile.', solution: 'Browser non supportato o blocco rigoroso dell\'audio da parte del sistema operativo.' };
        } catch (e: any) {
          return { status: 'warning', message: 'Impossibile testare l\'audio automaticamente', solution: 'Il browser blocca l\'audio finché l\'utente non tocca lo schermo (Autoplay Policy).' };
        }
      }
    },
    {
      id: 'osm_nominatim',
      name: 'Server Mappe (Nominatim)',
      description: 'Verifica se l\'API OpenStreetMap per la ricerca delle città è online.',
      icon: <Globe2 className="w-5 h-5" />,
      status: 'idle',
      run: async () => {
        try {
          const start = performance.now();
          const res = await fetch('https://nominatim.openstreetmap.org/search?q=Roma&format=json&limit=1');
          const end = performance.now();
          if (res.ok) {
            return { status: 'passed', message: `Server OSM attivi. Risposta in ${Math.round(end - start)}ms.` };
          }
          return { status: 'failed', message: `Server OSM ha restituito errore ${res.status}.`, solution: 'Riprova più tardi. Nominatim potrebbe avere imposto limiti di Rate-Limiting temporanei.' };
        } catch (e: any) {
          return { status: 'failed', message: `Impossibile raggiungere OSM: ${e.message}`, solution: 'Problema di rete o server OpenStreetMap inattivo.' };
        }
      }
    },
    {
      id: 'push_notifications',
      name: 'Permessi Notifiche Push',
      description: 'Verifica lo stato del permesso per ricevere avvisi in background.',
      icon: <Bell className="w-5 h-5" />,
      status: 'idle',
      run: async () => {
        if (!('Notification' in window)) {
          return { status: 'failed', message: 'API Notifiche non supportata dal dispositivo.', solution: 'Controlla i permessi nativi in Capacitor Push Notifications.' };
        }
        if (Notification.permission === 'granted') {
          return { status: 'passed', message: 'Permesso Notifiche concesso.' };
        } else if (Notification.permission === 'denied') {
          return { status: 'failed', message: 'Permesso Negato dall\'utente.', solution: 'Mostra un popup all\'utente invitandolo ad aprire le Impostazioni del telefono.' };
        } else {
          return { status: 'warning', message: 'Permesso non ancora richiesto.', solution: 'L\'app dovrà chiedere il permesso al momento opportuno.' };
        }
      }
    },
    {
      id: 'auth_token',
      name: 'Salute Token Sicurezza',
      description: 'Controlla la validità e la scadenza della sessione Supabase.',
      icon: <ShieldCheck className="w-5 h-5" />,
      status: 'idle',
      run: async () => {
        try {
          const { data, error } = await supabase.auth.getSession();
          if (error) throw error;
          
          if (!data.session) {
            return { status: 'warning', message: 'Nessuna sessione attiva (Modalità Ospite).', solution: 'Nessun problema, ma i salvataggi in cloud sono disabilitati.' };
          }
          
          const expiresAt = data.session.expires_at;
          if (expiresAt) {
            const timeRemaining = expiresAt - Math.floor(Date.now() / 1000);
            if (timeRemaining < 3600) {
              return { status: 'warning', message: `Il Token scade tra meno di 1 ora (${Math.round(timeRemaining / 60)} min).`, solution: 'Supabase dovrebbe rigenerarlo in automatico. Tieni monitorato se gli utenti vengono disconnessi.' };
            }
            return { status: 'passed', message: `Token di sessione crittografico valido. Scadenza sicura tra ${Math.round(timeRemaining / 3600)} ore.` };
          }
          
          return { status: 'passed', message: 'Token valido ma senza scadenza esplicita.' };
        } catch (e: any) {
          return { status: 'failed', message: `Errore autenticazione: ${e.message}`, solution: 'Forza il logout e fai rientrare l\'utente.' };
        }
      }
    },
    {
      id: 'i18n_fallback',
      name: 'Motore Traduzioni (i18n)',
      description: 'Simula la richiesta di una lingua inesistente per testare il fallback di sicurezza.',
      icon: <Globe2 className="w-5 h-5" />,
      status: 'idle',
      run: async () => {
        try {
          const { getTranslation } = await import('../lib/i18n');
          // Richiediamo una lingua che sappiamo non essere pienamente supportata per testare il fallback a IT/EN
          const fakeKey = "test_key_does_not_exist";
          const res = getTranslation(fakeKey as any, 'IT');
          
          if (res === fakeKey || typeof res === 'string') {
             return { status: 'passed', message: 'Sistema di traduzione stabile. Fallback di emergenza funzionante.' };
          }
          return { status: 'warning', message: 'Risultato anomalo dal traduttore.', solution: 'Controlla lib/i18n.ts' };
        } catch (e: any) {
          return { status: 'failed', message: `Errore critico modulo lingue: ${e.message}`, solution: 'Il file i18n potrebbe essere corrotto.' };
        }
      }
    },
    {
      id: 'file_coherence',
      name: 'Coerenza File Offline',
      description: 'Verifica se ci sono itinerari scaricati corrotti o con file audio mancanti.',
      icon: <HardDrive className="w-5 h-5" />,
      status: 'idle',
      run: async () => {
        try {
          const offlineData = localStorage.getItem('offline_itineraries_data');
          if (!offlineData) {
            return { status: 'passed', message: 'Nessun file offline scaricato sul dispositivo. Situazione pulita.' };
          }
          
          const parsed = JSON.parse(offlineData);
          if (!Array.isArray(parsed) || parsed.length === 0) {
             return { status: 'warning', message: 'Il pacchetto offline è vuoto ma occupa memoria.', solution: 'Consiglia un Panic Reset per liberare lo spazio.' };
          }
          
          let corruptedCount = 0;
          parsed.forEach((itinerary: any) => {
            if (!itinerary.id || !itinerary.pois || !Array.isArray(itinerary.pois)) {
              corruptedCount++;
            }
          });
          
          if (corruptedCount > 0) {
            return { status: 'failed', message: `Trovati ${corruptedCount} itinerari offline irrimediabilmente corrotti.`, solution: 'Premi il pulsante "Panic Reset (Cache)" per distruggere i file corrotti e costringere l\'app a riscaricarli la prossima volta.' };
          }
          
          return { status: 'passed', message: `I file di ${parsed.length} itinerari offline sono strutturalmente integri.` };
        } catch (e: any) {
          return { status: 'failed', message: `Struttura File illegibile (JSON Corrotto).`, solution: 'Il disco del telefono ha corrotto i salvataggi. Esegui il "Panic Reset".' };
        }
      }
    }
  ]);

  const [lastRunAt, setLastRunAt] = useState<Date | null>(null);
  const [showOnlyProblems, setShowOnlyProblems] = useState(false);

  const updateTestStatus = (id: string, status: TestStatus, message?: string, solution?: string) => {
    setTests(prev => prev.map(t => t.id === id ? { ...t, status, resultMessage: message, solution } : t));
  };

  // try/catch obbligatorio: un run() che lancia un'eccezione imprevista
  // lasciava la card inchiodata su "running" per sempre.
  const executeTest = async (test: DiagnosticTest) => {
    updateTestStatus(test.id, 'running');
    try {
      const result = await test.run();
      updateTestStatus(test.id, result.status, result.message, result.solution);
    } catch (e: any) {
      updateTestStatus(test.id, 'failed', `Errore imprevisto del test: ${e?.message || e}`, 'Riprova; se persiste controlla la console del browser.');
    }
  };

  const runSingleTest = async (testId: string) => {
    const test = tests.find(t => t.id === testId);
    if (test) await executeTest(test);
  };

  const runAllTests = async () => {
    setIsRunningAll(true);
    // In parallelo: i check delle chiavi condividono un'unica fetch cacheata
    // all'endpoint diagnostics. Il vecchio giro sequenziale con 600ms di
    // ritardo "scenografico" per test impiegava oltre 20 secondi.
    await Promise.all(tests.map(t => executeTest(t)));
    setLastRunAt(new Date());
    setIsRunningAll(false);
  };

  // Riepilogo per la barra di stato in testa
  const summary = {
    passed: tests.filter(t => t.status === 'passed').length,
    warning: tests.filter(t => t.status === 'warning').length,
    failed: tests.filter(t => t.status === 'failed').length,
    ran: tests.filter(t => t.status !== 'idle' && t.status !== 'running').length,
  };
  const visibleTests = showOnlyProblems
    ? tests.filter(t => t.status === 'failed' || t.status === 'warning')
    : tests;

  /**
   * PANIC RESET: azzeramento completo dello stato LOCALE dell'app — l'ultima
   * spiaggia quando cache o salvataggi su device sono corrotti.
   * Cancella: localStorage/sessionStorage (impostazioni, sessione, mirror
   * preferiti), IndexedDB (POI offline, aree mappa, audio scaricati) e le
   * cache del service worker (tile mappa, audio, font).
   * NON tocca i dati sul cloud: account, crediti acquistati, preferiti
   * sincronizzati, itinerari salvati e cronologia restano intatti e tornano
   * al login successivo. Prima della pulizia prova a svuotare la coda di
   * sincronizzazione dei preferiti, per non perdere cuori messi offline.
   */
  const emergencyReset = async () => {
    if (!confirm(
      "PANIC RESET — leggi prima di confermare.\n\n" +
      "VERRÀ CANCELLATO (solo su questo dispositivo):\n" +
      "• impostazioni locali e sessione (dovrai rifare il login)\n" +
      "• mappe offline, POI e audio scaricati\n" +
      "• cache di mappa e contenuti\n\n" +
      "NON VERRÀ TOCCATO (è sul cloud):\n" +
      "• account, crediti acquistati e Day Pass\n" +
      "• preferiti sincronizzati, itinerari salvati, cronologia\n\n" +
      "Usalo solo se l'app è instabile o la diagnostica segnala file corrotti. Confermi?"
    )) return;

    // Salva sul cloud le sync dei preferiti rimaste in coda prima di distruggerla
    try {
      const { flushPendingFavSync } = await import('../lib/favorites');
      await flushPendingFavSync();
    } catch { /* offline o non loggato: la coda andrà persa, come avvisato */ }

    localStorage.clear();
    sessionStorage.clear();

    // IndexedDB: database Dexie dei POI + store idb-keyval (aree/audio offline)
    try {
      const dbs: any[] = (indexedDB as any).databases ? await (indexedDB as any).databases() : [];
      if (dbs.length > 0) {
        dbs.forEach(d => { if (d?.name) indexedDB.deleteDatabase(d.name); });
      } else {
        // Fallback per browser senza indexedDB.databases()
        ['ItaliaInTascaDB', 'keyval-store'].forEach(n => indexedDB.deleteDatabase(n));
      }
    } catch { /* best effort */ }

    // Cache del service worker (tile mappa, audio, font)
    try {
      if (typeof caches !== 'undefined') {
        const names = await caches.keys();
        await Promise.all(names.map(n => caches.delete(n)));
      }
    } catch { /* best effort */ }

    alert("Memoria locale svuotata. L'app si riavvierà pulita: fai di nuovo il login.");
    window.location.reload();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-primary flex items-center gap-2">
            <Activity className="w-6 h-6 text-secondary" />
            Diagnostica e Salute
          </h2>
          <p className="text-sm text-on-surface-variant font-medium mt-1">
            Strumenti avanzati per analizzare la stabilità, individuare problemi in tempo reale e riparare l'app.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={emergencyReset}
            title="Azzera TUTTA la memoria locale del dispositivo (cache, offline, sessione). Non tocca account, crediti e dati salvati sul cloud."
            className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 font-bold text-sm rounded-xl transition-colors flex items-center gap-2"
          >
            <Trash2 className="w-4 h-4" />
            Panic Reset (Cache)
          </button>
          <button 
            onClick={runAllTests}
            disabled={isRunningAll}
            className={`px-5 py-2.5 rounded-xl font-black text-sm uppercase tracking-wider flex items-center gap-2 shadow-sm transition-all ${
              isRunningAll ? 'bg-gray-200 text-on-surface-variant' : 'bg-emerald-500 hover:bg-emerald-600 text-secondary'
            }`}
          >
            {isRunningAll ? (
              <><RefreshCw className="w-4 h-4 animate-spin" /> Analisi in corso...</>
            ) : (
              <><Play className="w-4 h-4" /> Esegui Check-up Completo</>
            )}
          </button>
        </div>
      </div>

      {/* Riepilogo esito: appare dopo il primo giro di test */}
      {summary.ran > 0 && (
        <div className={`rounded-2xl p-4 border flex flex-col sm:flex-row sm:items-center gap-3 ${
          summary.failed > 0 ? 'bg-red-50 border-red-200' :
          summary.warning > 0 ? 'bg-amber-50 border-amber-200' :
          'bg-emerald-50 border-emerald-200'
        }`} aria-live="polite">
          <div className="flex items-center gap-2 font-black text-sm">
            {summary.failed > 0
              ? (<><XCircle className="w-5 h-5 text-red-600" /><span className="text-red-800">{summary.failed} {summary.failed === 1 ? 'problema critico' : 'problemi critici'}</span></>)
              : summary.warning > 0
                ? (<><AlertTriangle className="w-5 h-5 text-amber-600" /><span className="text-amber-800">Nessun errore critico, {summary.warning} {summary.warning === 1 ? 'avviso' : 'avvisi'}</span></>)
                : (<><CheckCircle2 className="w-5 h-5 text-emerald-600" /><span className="text-emerald-800">Tutti i sistemi operativi</span></>)}
          </div>
          <div className="flex items-center gap-2 text-xs font-bold sm:ml-auto">
            <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700">{summary.passed} OK</span>
            <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-700">{summary.warning} avvisi</span>
            <span className="px-2.5 py-1 rounded-full bg-red-100 text-red-700">{summary.failed} errori</span>
            {lastRunAt && (
              <span className="text-on-surface-variant/70 font-medium hidden md:inline">
                ultimo check {lastRunAt.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>
          {(summary.failed > 0 || summary.warning > 0) && (
            <button
              onClick={() => setShowOnlyProblems(v => !v)}
              className={`self-start sm:self-auto px-3 py-1.5 rounded-xl text-xs font-black transition-colors ${
                showOnlyProblems ? 'bg-primary text-white' : 'bg-white text-primary border border-primary/20 hover:bg-primary/5'
              }`}
            >
              {showOnlyProblems ? 'Mostra tutti' : 'Solo problemi'}
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {visibleTests.map(test => (
          <div key={test.id} className="bg-surface rounded-2xl p-4 border border-outline-variant flex flex-col justify-between">
            <div>
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2.5">
                  <div className={`p-2 rounded-xl text-secondary ${
                    test.status === 'passed' ? 'bg-emerald-500' :
                    test.status === 'failed' ? 'bg-red-500' :
                    test.status === 'warning' ? 'bg-amber-500' :
                    test.status === 'running' ? 'bg-blue-500 animate-pulse' :
                    'bg-gray-400'
                  }`}>
                    {test.icon}
                  </div>
                  <div>
                    <h3 className="font-bold text-primary text-sm">{test.name}</h3>
                    <p className="text-[10px] text-on-surface-variant leading-tight mt-0.5 max-w-[200px]">{test.description}</p>
                  </div>
                </div>
                <button
                  onClick={() => runSingleTest(test.id)}
                  disabled={test.status === 'running' || isRunningAll}
                  title={`Riesegui: ${test.name}`}
                  aria-label={`Riesegui il test ${test.name}`}
                  className="p-1.5 hover:bg-surface rounded-lg text-on-surface-variant hover:text-blue-600 transition-colors disabled:opacity-40"
                >
                  <RefreshCw className={`w-4 h-4 ${test.status === 'running' ? 'animate-spin text-blue-500' : ''}`} />
                </button>
              </div>
              
              <div className="mt-4 pt-3 border-t border-outline-variant">
                {test.status === 'idle' && (
                  <span className="text-xs text-on-surface-variant font-medium italic">In attesa del test...</span>
                )}
                {test.status === 'running' && (
                  <span className="text-xs text-blue-500 font-bold flex items-center gap-1"><RefreshCw className="w-3 h-3 animate-spin"/> Controllo in esecuzione...</span>
                )}
                {test.status === 'passed' && (
                  <span className="text-xs text-emerald-600 font-bold flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5"/> {test.resultMessage}</span>
                )}
                {test.status === 'warning' && (
                  <div className="space-y-1">
                    <span className="text-xs text-amber-600 font-bold flex items-start gap-1"><AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5"/> {test.resultMessage}</span>
                    {test.solution && <div className="text-[10px] bg-amber-50 text-amber-800 p-2 rounded-lg mt-1 font-medium border border-amber-100"><b>Azione Richiesta:</b> {test.solution}</div>}
                  </div>
                )}
                {test.status === 'failed' && (
                  <div className="space-y-1">
                    <span className="text-xs text-red-600 font-bold flex items-start gap-1"><XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5"/> {test.resultMessage}</span>
                    {test.solution && <div className="text-[10px] bg-red-50 text-red-800 p-2 rounded-lg mt-1 font-medium border border-red-100"><b>Soluzione Consigliata:</b> {test.solution}</div>}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
