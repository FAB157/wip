import React, { useState, useEffect } from 'react';
import { MapPin, Bell, ShieldCheck, BatteryCharging, CheckCircle2, Settings } from 'lucide-react';
import { Geolocation } from '@capacitor/geolocation';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';
import { Language } from '../lib/i18n';
import ProminentDisclosure from './ProminentDisclosure';

interface PermissionsModalProps {
  onComplete: () => void;
  language: Language;
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
    localStorage.setItem('onboarding_permissions_done', 'true');
    setIsVisible(false);
    onComplete();
  };

  // Richiesta effettiva del permesso di posizione con rilevamento del diniego.
  const requestLocationPermission = async () => {
    let denied = false;
    try {
      const status = await Geolocation.requestPermissions();
      denied = (status as any)?.location === 'denied';
    } catch (e) {
      denied = true;
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
    setStep(2);
  };

  // Apre la schermata Impostazioni dell'app (best-effort per piattaforma).
  const openAppSettings = async () => {
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
      // Notifiche
      try {
        await LocalNotifications.requestPermissions();
      } catch (e) {}
      setStep(3);
    } else if (step === 3) {
      // Batteria (Fine)
      // Nota: Per Android, l'esenzione batteria richiede un plugin specifico o va chiesta in-app.
      // Qui diamo istruzioni visive all'utente o concludiamo il flusso.
      finishOnboarding();
    }
  };

  if (!isVisible) return null;

  const isItalian = language === 'IT';

  return (
    <div className="fixed inset-0 z-[9999] bg-slate-900/80 backdrop-blur-xl flex items-center justify-center p-4">
      <div className="bg-surface border border-white/10 rounded-[2rem] w-full max-w-sm shadow-2xl overflow-hidden flex flex-col animate-in fade-in slide-in-from-bottom-10 duration-500">

        {/* Intestazione Dinamica */}
        <div className="p-8 pb-4 text-center relative bg-gradient-to-br from-primary/20 to-transparent">
          <div className="w-20 h-20 mx-auto bg-primary text-white rounded-3xl flex items-center justify-center mb-6 shadow-xl shadow-primary/30 transform rotate-3 transition-all">
            {step === 0 && <ShieldCheck className="w-10 h-10" />}
            {step === 1 && <MapPin className="w-10 h-10 animate-bounce" />}
            {step === 2 && <Bell className="w-10 h-10 animate-pulse" />}
            {step === 3 && <BatteryCharging className="w-10 h-10" />}
          </div>
          <h2 className="text-2xl font-black text-secondary mb-2 tracking-tight">
            {step === 0 && (isItalian ? "I Tuoi Super-Poteri" : "Your Super-Powers")}
            {step === 1 && (isItalian ? "Dove ti trovi?" : "Where are you?")}
            {step === 2 && (isItalian ? "Rimani Aggiornato" : "Stay Updated")}
            {step === 3 && (isItalian ? "Telefono in Tasca" : "Pocket Mode")}
          </h2>
          <p className="text-sm text-secondary/70 leading-relaxed font-medium h-16">
            {step === 0 && (isItalian ? "Per trasformare il tuo telefono in una guida turistica magica, dobbiamo attivare 3 funzioni essenziali." : "To turn your phone into a magical tour guide, we need to activate 3 essential features.")}
            {step === 1 && (isItalian ? "WIP raccoglie i dati sulla posizione per attivare le audioguide quando ti avvicini a un monumento, anche quando l'app è chiusa o non in uso." : "WIP collects location data to enable audio guides when you approach a monument, even when the app is closed or not in use.")}
            {step === 2 && (isItalian ? "Ti avviseremo quando un'audioguida può partire o quando ci sono novità." : "We'll notify you when an audio guide can start or when there's news.")}
            {step === 3 && (isItalian ? "Finito! Potrai impostare la batteria senza restrizioni dalle impostazioni Android." : "Done! You can set battery unrestricted mode from Android settings.")}
          </p>
        </div>

        {/* Indicatori di Progresso */}
        <div className="px-8 py-2 flex justify-center gap-2">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`h-1.5 rounded-full transition-all duration-300 ${step >= s ? 'w-8 bg-primary' : 'w-2 bg-white/10'}`}
            />
          ))}
        </div>

        {/* Lista dei permessi (solo nello step 0) */}
        {step === 0 && (
          <div className="p-8 pt-4 flex-1">
            <div className="space-y-4">
              <div className="flex items-center gap-4 p-4 bg-white/5 rounded-2xl border border-white/5">
                <div className="w-10 h-10 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center shrink-0">
                  <MapPin className="w-5 h-5" />
                </div>
                <div className="text-sm font-bold text-secondary">{isItalian ? "GPS Sempre Attivo" : "Always-on GPS"}</div>
              </div>
              <div className="flex items-center gap-4 p-4 bg-white/5 rounded-2xl border border-white/5">
                <div className="w-10 h-10 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
                  <Bell className="w-5 h-5" />
                </div>
                <div className="text-sm font-bold text-secondary">{isItalian ? "Notifiche Push" : "Push Notifications"}</div>
              </div>
              <div className="flex items-center gap-4 p-4 bg-white/5 rounded-2xl border border-white/5">
                <div className="w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                  <BatteryCharging className="w-5 h-5" />
                </div>
                <div className="text-sm font-bold text-secondary">{isItalian ? "Risparmio Energetico" : "Battery Saving"}</div>
              </div>
            </div>
          </div>
        )}

        {/* Pulsanti Azione */}
        <div className="p-8 pt-6">
          {/* Diniego posizione: spiegazione + apri impostazioni (step 1) */}
          {locationDenied && step === 1 && (
            <div className="mb-4 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-left">
              <p className="text-sm font-bold text-secondary/90 leading-relaxed mb-3">
                {isItalian
                  ? "Senza il permesso di posizione le audioguide automatiche non possono partire. Abilitalo dalle impostazioni del telefono (Posizione → Consenti sempre)."
                  : "Without location permission, automatic audio guides can't start. Enable it from your phone settings (Location → Allow all the time)."}
              </p>
              <button
                onClick={openAppSettings}
                className="w-full bg-white/10 text-secondary font-bold py-3 rounded-xl border border-white/10 active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                <Settings className="w-4 h-4" />
                {isItalian ? "Apri Impostazioni" : "Open Settings"}
              </button>
            </div>
          )}

          <button
            onClick={locationDenied && step === 1 ? () => { setLocationDenied(false); setStep(2); } : requestNextPermission}
            className="w-full bg-primary text-white font-black py-4 text-lg rounded-2xl shadow-lg shadow-primary/30 active:scale-95 transition-all flex justify-center items-center gap-2"
          >
            {locationDenied && step === 1
              ? (isItalian ? "Continua" : "Continue")
              : (step === 0 ? (isItalian ? "Iniziamo!" : "Let's Go!") : (step === 3 ? (isItalian ? "Concludi" : "Finish") : (isItalian ? "Consenti" : "Allow")))}
            {step > 0 && <CheckCircle2 className="w-5 h-5" />}
          </button>

          <button
            onClick={finishOnboarding}
            className="w-full text-center mt-4 text-xs font-bold text-secondary/40 py-2 active:text-secondary/80 transition-colors"
          >
            {isItalian ? "Salta per ora (Non consigliato)" : "Skip for now (Not recommended)"}
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
