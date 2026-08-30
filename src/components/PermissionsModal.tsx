import React, { useState, useEffect, useCallback } from 'react';
import { MapPin, Bell, BatteryCharging, Check, ShieldCheck, ArrowRight, Settings } from 'lucide-react';
import { Geolocation } from '@capacitor/geolocation';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';
import { Language, getTranslation } from '../lib/i18n';
import { ItaintaBackgroundPoi, apriImpostazioniApp } from '../plugins/ItaintaBackgroundPoi';

interface PermissionsModalProps {
  onComplete: () => void;
  language: Language;
}

/**
 * PERMESSI IN UNA SCHERMATA SOLA (29/08/2026, richiesta del committente:
 * «troppe autorizzazioni, l'utente non può andare nelle impostazioni e fare
 * tutti quei passaggi — meno e più efficaci»).
 *
 * Prima: quattro card in fila (super-poteri → dove ti trovi → rimani
 * aggiornato → telefono in tasca), più la disclosure, più un dialogo nativo,
 * più la scheda Info app in cui trovare da soli Autorizzazioni → Posizione →
 * Consenti sempre, più la pagina batteria OEM. Una decina di schermate e due
 * viaggi a mano nelle Impostazioni: sul Realme del committente nessuno
 * arrivava in fondo.
 *
 * Ora: UNA schermata, nello stesso impaginato chiaro del carosello
 * d'onboarding, con la prominent disclosure (cosa raccogliamo, perché, anche
 * ad app chiusa, non per pubblicità — obbligatoria Play) in cima e sotto UNA
 * RIGA PER PERMESSO col suo tasto «Attiva»: ogni tasto apre direttamente il
 * dialogo o la pagina di sistema giusta (posizione: il plugin chiede il
 * background DOPO il foreground e su Android 11+ il sistema apre la pagina
 * «Posizione» col radio «Consenti sempre» — un tocco; notifiche: il permesso
 * e, se il telefono le blocca, la pagina notifiche dell'app; batteria:
 * facoltativa, la lista delle esenzioni). Le spunte si aggiornano da sole
 * quando si torna nell'app. Niente più dialogo nativo di disclosure (era un
 * doppione) e niente batteria obbligatoria.
 *
 * Contratto nativo: metodi granulari getPermissionsStatus /
 * requestLocationPermissions / requestNotificationPermission /
 * requestBatteryOptimization (Android, ItaintaBackgroundPoiPlugin.kt). Dove
 * mancano (iOS: il plugin Swift ha solo checkAndRequestPermissions) si
 * ripiega sulla catena unica, che su iOS è già di due dialoghi di sistema;
 * il passaggio a «Sempre» lì lo propone iOS da solo, dopo qualche uso.
 */

// Valori di `status` della catena unica checkAndRequestPermissions (invariati):
// - 'all_granted'                    -> posizione fg+bg e notifiche OK
// - 'requesting_background_location' -> (iOS) fg OK, «Sempre» rimandato al sistema
// - 'denied_background_location'     -> fg OK, background rifiutato
// - 'requesting_notifications'       -> notifiche bloccate: pagina di sistema aperta
// - 'denied_notifications'           -> notifiche rifiutate
// - 'requesting_battery_optimization'-> (build vecchie) pagina batteria aperta
interface NativePermResult { status?: string }

const isNative = () => typeof window !== 'undefined' && Capacitor.isNativePlatform();
const isAndroid = () => isNative() && Capacitor.getPlatform() === 'android';
const NativePermissionsPlugin = isNative() ? ItaintaBackgroundPoi : null;

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

// Applica alle chiavi granulari l'esito della catena unica.
function applyNativePermResult(result: NativePermResult | null | undefined) {
  const status = result?.status;
  if (status === 'all_granted') {
    setPermStatus('location', 'granted');
    setPermStatus('background', 'granted');
    setPermStatus('notifications', 'granted');
  } else if (status === 'requesting_battery_optimization') {
    setPermStatus('location', 'granted');
    setPermStatus('background', 'granted');
    setPermStatus('notifications', 'granted');
    setPermStatus('battery', 'skipped');
  } else if (status === 'requesting_background_location') {
    setPermStatus('location', 'granted');
    setPermStatus('background', 'skipped');
  } else if (status === 'denied_background_location') {
    setPermStatus('location', 'granted');
    setPermStatus('background', 'denied');
  } else if (status === 'requesting_notifications') {
    setPermStatus('location', 'granted');
    setPermStatus('background', 'granted');
    setPermStatus('notifications', 'skipped');
  } else if (status === 'denied_notifications') {
    setPermStatus('location', 'granted');
    setPermStatus('background', 'granted');
    setPermStatus('notifications', 'denied');
  }
}

// Esportata per riuso: la catena unica nativa (posizione fg/bg, notifiche) in
// una chiamata, aggiornando le chiavi granulari. La usa anche il ripiego iOS.
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

/** Il metodo non esiste in questo plugin (iOS, o build vecchia): si ripiega. */
function nonImplementato(e: any): boolean {
  const code = String(e?.code || '');
  const msg = String(e?.message || e || '');
  return code === 'UNIMPLEMENTED' || /not implemented|UNIMPLEMENTED/i.test(msg);
}

type StatoPosizione = 'always' | 'whileInUse' | 'denied' | 'unknown';
interface StatoPermessi {
  location: StatoPosizione;
  notifications: boolean | null;      // permesso E interruttore di sistema
  notificationsEnabled: boolean | null; // solo interruttore (false = bloccate dal telefono)
  battery: boolean | null;
}

const STATO_IGNOTO: StatoPermessi = { location: 'unknown', notifications: null, notificationsEnabled: null, battery: null };

/** Un colore per la schermata, come nel carosello (cielo = camminare). */
const ACCENTO = { alone: 'rgba(56, 189, 248, 0.20)', tinta: '#38bdf8' };

export default function PermissionsModal({ onComplete, language }: PermissionsModalProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [stato, setStato] = useState<StatoPermessi>(STATO_IGNOTO);
  const [occupato, setOccupato] = useState<'location' | 'notifications' | 'battery' | null>(null);
  // Posizione negata dall'utente: spiegazione + «Apri Impostazioni» invece di
  // ingoiare il diniego in silenzio.
  const [locationDenied, setLocationDenied] = useState(false);
  // iOS senza metodi granulari: dopo la catena unica sappiamo solo lo stato
  // riportato; il resto lo diciamo a parole (nota «Sempre lo propone iOS»).
  const [ripiegoIos, setRipiegoIos] = useState(false);
  // L'utente ha gia' premuto «Attiva» almeno una volta: da qui in poi uno
  // stato «denied» riletto dal nativo e' un rifiuto suo, non un «mai
  // chiesto», e va spiegato (collaudo 29/08: il dialogo di sistema puo'
  // comparire DOPO che la promise del plugin e' gia' tornata).
  const [tentativoFatto, setTentativoFatto] = useState(false);

  const t = (key: string) => getTranslation(key, language);

  useEffect(() => {
    // Se non siamo in un'app nativa o l'utente ha già fatto il setup, nascondi
    const seen = localStorage.getItem('onboarding_permissions_done');
    if (seen === 'true' || typeof window === 'undefined' || !Capacitor.isNativePlatform()) {
      onComplete();
      return;
    }
    setIsVisible(true);
  }, [onComplete]);

  // RIAPERTURA DAL PROFILO (29/08/2026, committente: «tutte queste
  // autorizzazioni si possono fare anche dal setup dell'utente?»). La stessa
  // schermata, con le spunte rilette dal nativo: Profilo → Setup → «Permessi».
  useEffect(() => {
    const apri = () => { if (Capacitor.isNativePlatform()) setIsVisible(true); };
    window.addEventListener('wip-apri-permessi', apri);
    return () => window.removeEventListener('wip-apri-permessi', apri);
  }, []);

  /** Rilegge lo stato dal nativo: le spunte. Dove il metodo manca resta ignoto. */
  const rileggi = useCallback(async () => {
    if (!NativePermissionsPlugin) return;
    try {
      const s = await NativePermissionsPlugin.getPermissionsStatus();
      setStato({
        location: (s?.location as StatoPosizione) || 'unknown',
        notifications: typeof s?.notifications === 'boolean' ? s.notifications : null,
        notificationsEnabled: typeof s?.notificationsEnabled === 'boolean' ? s.notificationsEnabled : null,
        battery: typeof s?.battery === 'boolean' ? s.battery : null,
      });
    } catch (e) {
      if (nonImplementato(e)) setRipiegoIos(true);
    }
  }, []);

  // Al ritorno dalle pagine di sistema (Impostazioni, dialoghi) lo stato si
  // rilegge da solo: è così che la spunta compare senza altri tocchi.
  useEffect(() => {
    if (!isVisible) return;
    void rileggi();
    const onVis = () => { if (document.visibilityState === 'visible') void rileggi(); };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onVis);
    let rimuoviApp: (() => void) | null = null;
    (async () => {
      try {
        const { App } = await import('@capacitor/app');
        const h = await App.addListener('appStateChange', ({ isActive }) => { if (isActive) void rileggi(); });
        rimuoviApp = () => { void h.remove(); };
      } catch { /* plugin App assente sul web */ }
    })();
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', onVis);
      rimuoviApp?.();
    };
  }, [isVisible, rileggi]);

  const finishOnboarding = () => {
    // Le chiavi granulari si scrivono da quello che si sa; ciò che non si
    // sa resta «skipped», così una UI futura (Profilo → Verifica permessi)
    // sa cosa riproporre.
    setPermStatus('location', stato.location === 'denied' ? 'denied' : stato.location === 'unknown' ? 'skipped' : 'granted');
    setPermStatus('background', stato.location === 'always' ? 'granted' : stato.location === 'whileInUse' ? 'denied' : 'skipped');
    setPermStatus('notifications', stato.notifications === true ? 'granted' : stato.notifications === false ? 'denied' : 'skipped');
    setPermStatus('battery', stato.battery === true ? 'granted' : 'skipped');
    localStorage.setItem('onboarding_permissions_done', 'true');
    setIsVisible(false);
    onComplete();
  };

  // Apre la scheda dell'app nelle Impostazioni: via plugin, poi best-effort.
  const openAppSettings = async () => {
    try { if (await apriImpostazioniApp()) return; } catch { /* plugin senza il metodo */ }
    try {
      const { App } = await import('@capacitor/app');
      if (Capacitor.getPlatform() === 'ios') await (App as any).openUrl({ url: 'app-settings:' });
      else await (App as any).openUrl({ url: 'package:com.itaintasca.app' });
    } catch { /* restano le istruzioni testuali */ }
  };

  /** Tasto «Attiva» della posizione. La disclosure è già in cima: toccare qui È il consenso. */
  const attivaPosizione = async () => {
    if (occupato) return;
    setOccupato('location');
    setTentativoFatto(true);
    localStorage.setItem('wip_location_disclosure_accepted', 'true');
    try {
      if (NativePermissionsPlugin) {
        try {
          const r = await NativePermissionsPlugin.requestLocationPermissions();
          const loc = (r?.location as StatoPosizione) || 'unknown';
          setStato((s) => ({ ...s, location: loc }));
          setLocationDenied(loc === 'denied');
          if (loc === 'denied') localStorage.setItem('wip_location_denied', 'true');
          else localStorage.removeItem('wip_location_denied');
        } catch (e) {
          if (!nonImplementato(e)) throw e;
          // iOS (o build vecchia): catena unica — notifiche + posizione «Sempre».
          setRipiegoIos(true);
          const r = await requestBackgroundPermissionsFlow();
          const s = r?.status;
          if (r === null) {
            setStato((x) => ({ ...x, location: 'denied' }));
            setLocationDenied(true);
          } else {
            setLocationDenied(false);
            setStato((x) => ({
              ...x,
              location: s === 'all_granted' ? 'always' : 'whileInUse',
              notifications: s === 'denied_notifications' ? false : (s === 'requesting_notifications' ? x.notifications : true),
            }));
          }
        }
      } else {
        // Web (nessun plugin): solo il permesso foreground del browser.
        try {
          const status = await Geolocation.requestPermissions();
          const ok = (status as any)?.location !== 'denied';
          setStato((s) => ({ ...s, location: ok ? 'whileInUse' : 'denied' }));
          setLocationDenied(!ok);
        } catch { setLocationDenied(true); }
      }
    } finally {
      setOccupato(null);
      void rileggi();
    }
  };

  /** Tasto «Attiva» delle notifiche: permesso e, se bloccate dal telefono, la pagina giusta. */
  const attivaNotifiche = async () => {
    if (occupato) return;
    setOccupato('notifications');
    try {
      if (NativePermissionsPlugin) {
        try {
          const r = await NativePermissionsPlugin.requestNotificationPermission();
          setStato((s) => ({
            ...s,
            notifications: !!r?.granted && r?.enabled !== false,
            notificationsEnabled: typeof r?.enabled === 'boolean' ? r.enabled : s.notificationsEnabled,
          }));
          return;
        } catch (e) {
          if (!nonImplementato(e)) throw e;
        }
      }
      try {
        const res = await LocalNotifications.requestPermissions();
        setStato((s) => ({ ...s, notifications: (res as any)?.display === 'granted' }));
      } catch {
        setStato((s) => ({ ...s, notifications: false }));
      }
    } finally {
      setOccupato(null);
      void rileggi();
    }
  };

  /** Tasto «Attiva» della batteria (solo Android, facoltativo): la lista di sistema. */
  const attivaBatteria = async () => {
    if (occupato || !NativePermissionsPlugin) return;
    setOccupato('battery');
    try { await NativePermissionsPlugin.requestBatteryOptimization(); } catch { /* metodo assente */ }
    finally { setOccupato(null); }
  };

  if (!isVisible) return null;

  const posizioneOk = stato.location === 'always';
  const notificheOk = stato.notifications === true;
  const batteriaOk = stato.battery === true;
  const mostraBatteria = isAndroid();

  const mostraNegata = locationDenied || (tentativoFatto && stato.location === 'denied');
  const sottotitoloPosizione = mostraNegata
    ? t('pf_pm_denied')
    : stato.location === 'whileInUse'
      ? (ripiegoIos ? t('pf_pm2_nota_ios') : t('pf_pm2_riga_pos_parziale'))
      : t('pf_pm2_riga_pos_testo');
  const sottotitoloNotifiche = stato.notificationsEnabled === false
    ? t('pf_pm2_riga_notif_bloccate')
    : t('pf_pm2_riga_notif_testo');

  const Riga = ({
    icona, titolo, testo, ok, facoltativo, occupata, onAttiva,
  }: { icona: React.ReactNode; titolo: string; testo: string; ok: boolean; facoltativo?: boolean; occupata: boolean; onAttiva: () => void }) => (
    <li className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white px-3.5 py-3 text-left shadow-sm">
      <div
        className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
        style={{ background: ok ? 'rgba(16,185,129,0.12)' : `${ACCENTO.tinta}1f`, color: ok ? '#059669' : '#0369a1' }}
      >
        {ok ? <Check className="h-5 w-5" strokeWidth={3} /> : icona}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-bold leading-snug text-slate-900">
          {titolo}
          {facoltativo && (
            <span className="ml-1.5 rounded-full border border-slate-200 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-500">
              {t('pf_pm2_facoltativo')}
            </span>
          )}
        </p>
        <p className="mt-0.5 text-[11.5px] leading-snug text-slate-600">{testo}</p>
      </div>
      {ok ? (
        <span className="shrink-0 self-center rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-700">
          {t('pf_pm2_attivo')}
        </span>
      ) : (
        <button
          type="button"
          onClick={onAttiva}
          disabled={occupata}
          className="shrink-0 self-center rounded-xl px-3.5 py-2 text-[11px] font-black uppercase tracking-wider text-white shadow-md transition-all active:scale-95 disabled:opacity-60"
          style={{ background: 'linear-gradient(100deg, #0284c7, #1e3a8a)' }}
        >
          {t('pf_pm2_attiva')}
        </button>
      )}
    </li>
  );

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col bg-[#f6f7fb] text-slate-900 select-none overflow-hidden"
      role="dialog"
      aria-label={t('pf_pm2_tag')}
    >
      {/* Alone e griglia: gli stessi del carosello, così è la stessa app. */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            `radial-gradient(120% 80% at 78% 12%, ${ACCENTO.alone} 0%, transparent 62%),` +
            'radial-gradient(90% 70% at 12% 92%, rgba(212,175,55,0.06) 0%, transparent 60%)',
        }}
      />
      <div className="absolute inset-0 pointer-events-none opacity-50 bg-[linear-gradient(rgba(15,23,42,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,0.05)_1px,transparent_1px)] bg-[size:34px_34px]" />

      <header className="relative z-10 shrink-0 flex items-center justify-between px-6 pt-4 sm:px-10">
        <div className="flex items-center gap-2">
          <span className="text-lg font-serif font-black tracking-[0.18em] text-[#d4af37]">WIP</span>
          <span className="w-1 h-1 rounded-full bg-[#d4af37]/70" />
          <span className="text-[9px] font-bold uppercase tracking-[0.28em] text-slate-500">World in Pocket</span>
        </div>
        <button
          type="button"
          onClick={finishOnboarding}
          className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 rounded-lg px-3 py-2 transition-colors"
        >
          {t('vr_a_ob_skip')}
        </button>
      </header>

      <main className="relative z-10 flex-1 overflow-y-auto px-6 pb-3 pt-2 sm:px-10">
        <div className="mx-auto flex w-full max-w-md flex-col items-center text-center">
          {/* Medaglione, pill, titolo: l'impaginato del carosello. */}
          {/* Intestazione compatta: sul Realme (1080x2400) con il medaglione
              grande le tre righe finivano sotto la piega — e la schermata
              esiste per quelle righe. */}
          <div className="relative mb-3 flex items-center justify-center">
            <span aria-hidden className="absolute h-20 w-20 rounded-full blur-xl" style={{ background: ACCENTO.alone }} />
            <div
              className="relative flex h-14 w-14 items-center justify-center rounded-[18px] border"
              style={{
                borderColor: `${ACCENTO.tinta}59`,
                background: 'linear-gradient(160deg, #ffffff, #eef1f7)',
                boxShadow: `0 18px 50px -20px ${ACCENTO.tinta}80`,
              }}
            >
              <ShieldCheck className="h-7 w-7" strokeWidth={1.6} style={{ color: ACCENTO.tinta }} />
            </div>
          </div>

          <span
            className="mb-3 inline-block rounded-full border px-3.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.22em]"
            style={{ color: '#0369a1', borderColor: `${ACCENTO.tinta}60`, background: `${ACCENTO.tinta}1a` }}
          >
            {t('pf_pm2_tag')}
          </span>

          <h2 className="text-[22px] sm:text-[26px] font-serif font-black leading-[1.2] tracking-tight text-balance">
            {t('pf_pm2_titolo')}{' '}
            <span style={{ color: '#0284c7' }}>{t('pf_pm2_evidenza')}</span>
          </h2>

          {/* PROMINENT DISCLOSURE (policy Play): cosa, perché, anche ad app
              chiusa, non per pubblicità — PRIMA di qualunque richiesta. */}
          <p className="mt-2 max-w-sm text-[13px] leading-relaxed text-slate-700">
            {t('vr_b_pd_body')}
          </p>
          <ul className="mt-3 flex flex-wrap justify-center gap-2">
            {[t('vr_b_pd_b1'), t('vr_b_pd_b2'), t('vr_b_pd_b3')].map((p) => (
              <li key={p} className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-700 shadow-sm">
                <Check className="h-3 w-3 shrink-0" strokeWidth={3} style={{ color: ACCENTO.tinta }} />
                {p}
              </li>
            ))}
          </ul>

          {/* UNA RIGA PER PERMESSO, col suo tasto «Attiva». */}
          <ul className="mt-4 w-full space-y-2.5">
            <Riga
              icona={<MapPin className="h-5 w-5" />}
              titolo={t('pf_pm2_riga_pos_titolo')}
              testo={sottotitoloPosizione}
              ok={posizioneOk}
              occupata={occupato === 'location'}
              onAttiva={attivaPosizione}
            />
            <Riga
              icona={<Bell className="h-5 w-5" />}
              titolo={t('pf_pm2_riga_notif_titolo')}
              testo={sottotitoloNotifiche}
              ok={notificheOk}
              occupata={occupato === 'notifications'}
              onAttiva={attivaNotifiche}
            />
            {mostraBatteria && (
              <Riga
                icona={<BatteryCharging className="h-5 w-5" />}
                titolo={t('pf_pm2_riga_batt_titolo')}
                testo={t('pf_pm2_riga_batt_testo')}
                ok={batteriaOk}
                facoltativo
                occupata={occupato === 'battery'}
                onAttiva={attivaBatteria}
              />
            )}
          </ul>

          {/* Posizione negata: si dice e si apre in un tocco la scheda dell'app. */}
          {mostraNegata && (
            <button
              type="button"
              onClick={openAppSettings}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-[12px] font-bold text-amber-900 active:scale-[0.98]"
            >
              <Settings className="h-4 w-4" />
              {t('pf_pm_apri_impostazioni')}
            </button>
          )}

          <p className="mt-3 text-[11px] leading-snug text-slate-500">{t('vr_b_pd_note')}</p>
        </div>
      </main>

      <footer className="relative z-10 shrink-0 px-6 pb-6 pt-2 sm:px-10">
        <div className="mx-auto w-full max-w-md">
          <button
            type="button"
            onClick={finishOnboarding}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-[12px] font-black uppercase tracking-[0.18em] text-slate-950 transition-all active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
            style={{
              background: `linear-gradient(100deg, ${ACCENTO.tinta}, #d4af37)`,
              boxShadow: `0 14px 40px -18px ${ACCENTO.tinta}`,
            }}
          >
            {t('pf_pm2_continua')}
            <ArrowRight className="h-4 w-4" strokeWidth={3} />
          </button>
          {/* «Più tardi» non è definitivo: le chiavi granulari restano, e da
              Profilo si può ripetere il check (requestBackgroundPermissionsFlow). */}
          <button
            type="button"
            onClick={finishOnboarding}
            className="mt-2 w-full py-2 text-center text-[11px] font-bold text-slate-500 underline underline-offset-2 active:text-slate-900"
          >
            {t('pf_pm2_dopo')}
          </button>
        </div>
      </footer>
    </div>
  );
}
