import React, { useState, useEffect } from 'react';
import { MapPin, Bell, ShieldCheck, BatteryCharging, CheckCircle2, Settings } from 'lucide-react';
import { Geolocation } from '@capacitor/geolocation';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { Language, getTranslation } from '../lib/i18n';
import ProminentDisclosure from './ProminentDisclosure';

interface PermissionsModalProps {
  onComplete: () => void;
  language: Language;
}

// Contratto scoperto leggendo checkAndRequestPermissions in
// android/app/src/main/java/com/itaintasca/app/plugin/ItaintaBackgroundPoiPlugin.kt
// (righe 81-174) e il port Swift ios/App/App/ItaintaBackgroundPoiPlugin.swift:
// una singola chiamata incatena posizione foreground -> posizione background
// (Android Q+/iOS "Sempre", con prominent disclosure nativa) -> notifiche ->
// batteria (solo Android). La promise si risolve al primo punto della catena
// che richiede un'azione fuori dall'app (Impostazioni) o quando tutto è già
// concesso; viene invece rigettata (call.reject) se la posizione foreground
// viene negata. Valori di `status` osservati:
// - 'all_granted'                    -> posizione fg+bg, notifiche e batteria OK
// - 'requesting_battery_optimization'-> fg+bg e notifiche OK, Impostazioni batteria aperte (solo Android)
// - 'requesting_background_location' -> fg OK, utente mandato alle Impostazioni per il background
// - 'denied_background_location'     -> fg OK, utente ha rifiutato il background nel dialog nativo
interface NativePermResult { status?: string }

const NativePermissionsPlugin = (typeof window !== 'undefined' && Capacitor.isNativePlatform())
  ? registerPlugin<{ checkAndRequestPermissions: () => Promise<NativePermResult> }>('ItaintaBackgroundPoiPlugin')
  : null;

// Chiavi granulari (un esito per step), mantenute ACCANTO al flag aggregato
// legacy 'onboarding_permissions_done' che resta scritto per non rompere la
// logica esistente che lo legge altrove.
const PERM_KEYS = {
  location: 'wip_perm_location_status',
  background: 'wip_perm_background_status',
  notifications: 'wip_perm_notifications_status',
  battery: 'wip_perm_battery_status',
} as const;

type PermValue = 'granted' | 'denied' | 'skipped' | 'not_applicable';

function setPermStatus(key: keyof typeof PERM_KEYS, value: PermValue) {
  try { localStorage.setItem(PERM_KEYS[key], value); } catch (e) { /* storage non disponibile */ }
}

// Applica alle chiavi granulari l'esito di checkAndRequestPermissions in base
// a fin dove è arrivata la catena nativa (vedi commento sul contratto sopra).
function applyNativePermResult(result: NativePermResult | null | undefined) {
  const status = result?.status;
  if (status === 'all_granted') {
    setPermStatus('location', 'granted');
    setPermStatus('background', 'granted');
    setPermStatus('notifications', 'granted');
    setPermStatus('battery', 'granted');
  } else if (status === 'requesting_battery_optimization') {
    // La catena è arrivata fino alla batteria: posizione e notifiche già gestite.
    setPermStatus('location', 'granted');
    setPermStatus('background', 'granted');
    setPermStatus('notifications', 'granted');
    setPermStatus('battery', 'skipped'); // impostazioni aperte, esito non noto da qui
  } else if (status === 'requesting_background_location') {
    setPermStatus('location', 'granted');
    setPermStatus('background', 'skipped'); // rimandato alle Impostazioni
  } else if (status === 'denied_background_location') {
    setPermStatus('location', 'granted');
    setPermStatus('background', 'denied');
  }
}

// Esportata per riuso: incapsula l'INTERA catena nativa di permessi
// (posizione fg/bg, notifiche, batteria) in una sola chiamata, aggiornando le
// chiavi granulari. Un altro punto dell'app (es. un bottone "Verifica
// permessi" in ProfileScreen, vedi TODO più sotto) può richiamarla per far
// ripetere il check senza duplicare questa logica.
export async function requestBackgroundPermissionsFlow(): Promise<NativePermResult | null> {
  if (!NativePermissionsPlugin) return null;
  try {
    const result = await NativePermissionsPlugin.checkAndRequestPermissions();
    applyNativePermResult(result);
    return result;
  } catch (e) {
    // call.reject nativo: la posizione foreground è stata negata.
    setPermStatus('location', 'denied');
    return null;
  }
}

export default function PermissionsModal({ onComplete, language }: PermissionsModalProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [step, setStep] = useState(0); // 0: intro, 1: location, 2: notifications, 3: battery
  // Informativa Prominent Disclosure (obbligatoria Play) mostrata UNA volta
  // prima di chiedere la posizione in background.
  const [showDisclosure, setShowDisclosure] = useState(false);
  // Posizione negata dall'utente: mostriamo spiegazione + "Apri Impostazioni"
  // invece di ingoiare il diniego in silenzio.
  const [locationDenied, setLocationDenied] = useState(false);

  useEffect(() => {
    // Se non siamo in un'app nativa o l'utente ha già fatto il setup, nascondi
    const seen = localStorage.getItem('onboarding_permissions_done');
    if (seen === 'true' || typeof window === 'undefined' || !Capacitor.isNativePlatform()) {
      onComplete();
      return;
    }
    setIsVisible(true);
  }, [onComplete]);

  const finishOnboarding = () => {
    // Step mai raggiunti (skip anticipato): li marchiamo esplicitamente
    // invece di lasciarli assenti, per distinguerli da "mai controllato".
    (Object.keys(PERM_KEYS) as (keyof typeof PERM_KEYS)[]).forEach((k) => {
      if (!localStorage.getItem(PERM_KEYS[k])) setPermStatus(k, 'skipped');
    });
    localStorage.setItem('onboarding_permissions_done', 'true');
    setIsVisible(false);
    onComplete();
  };

  // Richiesta effettiva del permesso di posizione con rilevamento del diniego.
  // Su nativo passa dal plugin ItaintaBackgroundPoiPlugin, che gestisce anche
  // background/notifiche/batteria in sequenza (vedi requestBackgroundPermissionsFlow
  // sopra); su web (nessun plugin nativo) resta il fallback @capacitor/geolocation,
  // che copre solo il permesso in foreground.
  const requestLocationPermission = async () => {
    let denied = false;
    let nativeResult: NativePermResult | null = null;
    if (NativePermissionsPlugin) {
      nativeResult = await requestBackgroundPermissionsFlow();
      denied = nativeResult === null;
    } else {
      try {
        const status = await Geolocation.requestPermissions();
        denied = (status as any)?.location === 'denied';
      } catch (e) {
        denied = true;
      }
    }
    if (denied) {
      // Diniego: NON proseguiamo in silenzio. Segnaliamo lo stato (banner ai
      // prossimi avvii, gestito in App.tsx) e mostriamo "Apri Impostazioni".
      localStorage.setItem('wip_location_denied', 'true');
      setLocationDenied(true);
      return;
    }
    localStorage.removeItem('wip_location_denied');
    setLocationDenied(false);
    // Se la catena nativa è arrivata fino a notifiche/batteria, quegli step
    // sono già stati gestiti lato nativo: saltiamo direttamente allo step
    // finale per non richiederli una seconda volta in JS (vedi contratto
    // del plugin sopra).
    const nativeStatus = nativeResult?.status;
    if (nativeStatus === 'all_granted' || nativeStatus === 'requesting_battery_optimization') {
      setStep(3);
    } else {
      setStep(2);
    }
  };

  // Apre la schermata Impostazioni dell'app: prima via plugin nativo
  // (src/plugins/ItaintaBackgroundPoi.ts, metodo openAppSettings), poi il
  // vecchio best-effort con App.openUrl per le build che non lo espongono.
  const openAppSettings = async () => {
    try {
      const { apriImpostazioniApp } = await import('../plugins/ItaintaBackgroundPoi');
      if (await apriImpostazioniApp()) return;
    } catch (e) {
      // modulo assente o plugin senza il metodo: si prova la via vecchia
    }
    try {
      const { App } = await import('@capacitor/app');
      // openUrl non è nei tipi di @capacitor/app (servirebbe il plugin
      // AppLauncher, non installato): cast best-effort, il catch degrada
      // comunque alle istruzioni testuali.
      if (Capacitor.getPlatform() === 'ios') {
        await (App as any).openUrl({ url: 'app-settings:' });
      } else {
        // Android: scheda dell'app nelle Impostazioni di sistema.
        await (App as any).openUrl({ url: 'package:com.itaintasca.app' });
      }
    } catch (e) {
      // Nessun modo programmatico disponibile: restano le istruzioni testuali.
    }
  };

  const requestNextPermission = async () => {
    if (step === 0) {
      setStep(1);
    } else if (step === 1) {
      // Prima di chiedere la posizione (che su Android include il background)
      // mostriamo l'informativa Prominent Disclosure, una sola volta.
      const disclosureAccepted = localStorage.getItem('wip_location_disclosure_accepted') === 'true';
      if (!disclosureAccepted) {
        setShowDisclosure(true);
        return;
      }
      await requestLocationPermission();
    } else if (step === 2) {
      // Notifiche: raggiunto solo quando il plugin nativo NON le ha già
      // richieste (web senza plugin, oppure catena nativa fermata prima per
      // la posizione in background — vedi requestLocationPermission).
      try {
        const res = await LocalNotifications.requestPermissions();
        setPermStatus('notifications', (res as any)?.display === 'granted' ? 'granted' : 'denied');
      } catch (e) {
        setPermStatus('notifications', 'denied');
      }
      setStep(3);
    } else if (step === 3) {
      // Batteria (Fine)
      // Su Android l'esenzione batteria è già stata richiesta dal plugin
      // nativo quando la catena arriva fin qui (status
      // 'requesting_battery_optimization', vedi sopra); se siamo arrivati a
      // questo step passando per lo step 2 JS, non è stata richiesta.
      if (!localStorage.getItem(PERM_KEYS.battery)) {
        setPermStatus('battery', 'skipped');
      }
      finishOnboarding();
    }
  };

  if (!isVisible) return null;

  // Traduzione nella lingua della UI (7 lingue, chiavi pf_pm_* in traduzioni/profilo)
  const tr = (key: string) => getTranslation(key, language);

  return (
    <div className="fixed inset-0 z-[9999] bg-slate-900/80 backdrop-blur-xl flex items-center justify-center p-4">
      {/* Pannello BIANCO: i colori qui sotto erano quelli di un pannello
          scuro (oro, bianco/10) rimasti dopo il cambio di sfondo — titolo
          oro su bianco a 2,1:1, «Salta» a 1,3:1 (UX-01, audit 28/08/2026). */}
      <div className="bg-surface border border-primary/10 rounded-[2rem] w-full max-w-sm shadow-2xl overflow-hidden flex flex-col animate-in fade-in slide-in-from-bottom-10 duration-500">

        {/* Intestazione Dinamica */}
        <div className="p-8 pb-4 text-center relative bg-gradient-to-br from-primary/20 to-transparent">
          <div className="w-20 h-20 mx-auto bg-primary text-white rounded-3xl flex items-center justify-center mb-6 shadow-xl shadow-primary/30 transform rotate-3 transition-all">
            {step === 0 && <ShieldCheck className="w-10 h-10" />}
            {step === 1 && <MapPin className="w-10 h-10 animate-bounce" />}
            {step === 2 && <Bell className="w-10 h-10 animate-pulse" />}
            {step === 3 && <BatteryCharging className="w-10 h-10" />}
          </div>
          <h2 className="text-2xl font-black text-primary mb-2 tracking-tight">
            {step === 0 && tr('pf_pm_titolo0')}
            {step === 1 && tr('pf_pm_titolo1')}
            {step === 2 && tr('pf_pm_titolo2')}
            {step === 3 && tr('pf_pm_titolo3')}
          </h2>
          <p className="text-sm text-on-surface-variant leading-relaxed font-medium min-h-16">
            {step === 0 && tr('pf_pm_desc0')}
            {step === 1 && tr('pf_pm_desc1')}
            {step === 2 && tr('pf_pm_desc2')}
            {step === 3 && tr('pf_pm_desc3')}
          </p>
        </div>

        {/* Indicatori di Progresso */}
        <div className="px-8 py-2 flex justify-center gap-2">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`h-1.5 rounded-full transition-all duration-300 ${step >= s ? 'w-8 bg-primary' : 'w-2 bg-primary/15'}`}
            />
          ))}
        </div>

        {/* Lista dei permessi (solo nello step 0) */}
        {step === 0 && (
          <div className="p-8 pt-4 flex-1">
            <div className="space-y-4">
              <div className="flex items-center gap-4 p-4 bg-primary/10 rounded-2xl border border-primary/10">
                <div className="w-10 h-10 rounded-full bg-blue-500/15 text-blue-700 flex items-center justify-center shrink-0">
                  <MapPin className="w-5 h-5" />
                </div>
                <div className="text-sm font-bold text-primary">{tr('pf_pm_gps')}</div>
              </div>
              <div className="flex items-center gap-4 p-4 bg-primary/10 rounded-2xl border border-primary/10">
                <div className="w-10 h-10 rounded-full bg-amber-500/15 text-amber-700 flex items-center justify-center shrink-0">
                  <Bell className="w-5 h-5" />
                </div>
                <div className="text-sm font-bold text-primary">{tr('pf_pm_notifiche')}</div>
              </div>
              <div className="flex items-center gap-4 p-4 bg-primary/10 rounded-2xl border border-primary/10">
                <div className="w-10 h-10 rounded-full bg-emerald-500/15 text-emerald-700 flex items-center justify-center shrink-0">
                  <BatteryCharging className="w-5 h-5" />
                </div>
                <div className="text-sm font-bold text-primary">{tr('pf_pm_batteria')}</div>
              </div>
            </div>
          </div>
        )}

        {/* Pulsanti Azione */}
        <div className="p-8 pt-6">
          {/* Diniego posizione: spiegazione + apri impostazioni (step 1) */}
          {locationDenied && step === 1 && (
            <div className="mb-4 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-left">
              <p className="text-sm font-bold text-on-surface leading-relaxed mb-3">
                {tr('pf_pm_denied')}
              </p>
              <button
                type="button"
                onClick={openAppSettings}
                className="w-full min-h-11 bg-primary/10 text-primary font-bold py-3 rounded-xl border border-primary/20 active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                <Settings className="w-4 h-4" />
                {tr('pf_pm_apri_impostazioni')}
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={locationDenied && step === 1 ? () => { setLocationDenied(false); setStep(2); } : requestNextPermission}
            className="w-full min-h-11 bg-primary text-white font-black py-4 text-lg rounded-2xl shadow-lg shadow-primary/30 active:scale-95 transition-all flex justify-center items-center gap-2"
          >
            {locationDenied && step === 1
              ? tr('pf_pm_continua')
              : (step === 0 ? tr('pf_pm_iniziamo') : (step === 3 ? tr('pf_pm_concludi') : tr('pf_pm_consenti')))}
            {step > 0 && <CheckCircle2 className="w-5 h-5" />}
          </button>

          {/* "Salta per ora" chiude il flusso ma NON è definitivo: le chiavi
              granulari (PERM_KEYS) restano rilette da requestBackgroundPermissionsFlow,
              che una UI futura può richiamare per far ripetere il check senza
              riaprire tutto l'onboarding. */}
          {/* TODO: richiamare requestBackgroundPermissionsFlow (esportata da
              questo file) da ProfileScreen come voce "Verifica permessi", così
              chi ha saltato o negato qui può riprovare in un secondo momento. */}
          <button
            type="button"
            onClick={finishOnboarding}
            className="w-full min-h-11 text-center mt-2 text-xs font-bold text-slate-600 underline underline-offset-2 py-2 active:text-primary transition-colors"
          >
            {tr('pf_pm_salta')}
          </button>
        </div>
      </div>

      {/* Informativa posizione in background (Google Play) prima della richiesta */}
      <ProminentDisclosure
        isOpen={showDisclosure}
        language={language}
        onDecline={() => {
          // L'utente non acconsente alla posizione in background: non la
          // richiediamo (policy Play) e proseguiamo con le notifiche.
          setShowDisclosure(false);
          setStep(2);
        }}
        onAccept={async () => {
          localStorage.setItem('wip_location_disclosure_accepted', 'true');
          setShowDisclosure(false);
          await requestLocationPermission();
        }}
      />
    </div>
  );
}
