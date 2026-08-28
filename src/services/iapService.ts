// Acquisti in-app (RevenueCat): RIPRISTINO e PREZZI LOCALIZZATI.
//
// Due requisiti di App Store Review che l'app non soddisfaceva (28/08/2026):
//
// 1) "Restore purchases" — Guideline 3.1.1: ogni app con acquisti non
//    consumabili o abbonamenti DEVE offrire un modo esplicito di ripristinare
//    ciò che è già stato pagato. Non c'era alcuna chiamata a
//    Purchases.restorePurchases() in tutto il progetto.
//
// 2) Il PREZZO mostrato deve essere quello del negozio dell'utente. I prezzi
//    erano scritti a mano in euro ("€ 4,99"): un utente americano vedeva un
//    simbolo e un importo che non corrispondevano a quanto gli veniva
//    addebitato. Il prezzo vero è `product.priceString` delle offerte
//    RevenueCat, già formattato in valuta e locale dello store.
//    Vale la stessa regola delle foto: meglio NESSUN prezzo che il prezzo
//    sbagliato.
//
// I CREDITI (lib/pricing.ts) sono un'altra cosa: valuta interna, non denaro.

import { Capacitor } from '@capacitor/core';
import { Purchases } from '@revenuecat/purchases-capacitor';
import { getTranslation, linguaCorrente, type Language } from '../lib/i18n';
import { notifyCreditsChanged } from '../lib/pricing';
import {
  caricaPoiPosseduti,
  reconcileOfflineBilling,
  getDayPassState,
  DAY_PASS_UPDATED_EVENT,
} from './dayPassService';

/** Gli acquisti in-app esistono solo dentro l'app (Play Store / App Store). */
export function acquistiInAppDisponibili(): boolean {
  return Capacitor.isNativePlatform();
}

export interface EsitoRipristino {
  /** true = la chiamata allo store è andata a buon fine (anche con 0 acquisti). */
  ok: boolean;
  /** Quanti acquisti/entitlement lo store ha restituito. */
  ripristinati: number;
  /** Messaggio già tradotto, pronto per il toast. Mai un errore tecnico. */
  messaggio: string;
}

/**
 * Ripristina gli acquisti dal negozio e riallinea lo stato locale.
 *
 * Il valore vero lo scrivono i webhook (RevenueCat → server → crediti), qui
 * dopo il ripristino si forza la ri-lettura di ciò che dipende dall'acquisto:
 * wallet, POI già posseduti, Day Pass e registro offline.
 */
export async function ripristinaAcquisti(
  userId?: string | null,
  lang?: Language,
): Promise<EsitoRipristino> {
  const lingua = lang || linguaCorrente();
  const t = (k: string) => getTranslation(k, lingua);

  if (!acquistiInAppDisponibili()) {
    // Sul web non c'è niente da ripristinare: i pagamenti passano da Stripe e
    // i crediti sono già sul profilo. Lo si dice, non si finge un errore.
    return { ok: false, ripristinati: 0, messaggio: t('iap_ripristino_web') };
  }

  try {
    // Senza logIn il ripristino finirebbe su un utente anonimo RevenueCat e i
    // crediti non tornerebbero mai al profilo giusto.
    if (userId && userId !== 'mock-user-id') {
      await Purchases.logIn({ appUserID: userId }).catch(() => { /* si prova comunque */ });
    }

    const res: any = await Purchases.restorePurchases();
    const info: any = res?.customerInfo ?? res;

    const entitlementsAttivi = Object.keys(info?.entitlements?.active || {}).length;
    const prodotti: string[] = Array.isArray(info?.allPurchasedProductIdentifiers)
      ? info.allPurchasedProductIdentifiers
      : [];
    const transazioni: any[] = Array.isArray(info?.nonSubscriptionTransactions)
      ? info.nonSubscriptionTransactions
      : [];
    const ripristinati = Math.max(entitlementsAttivi, prodotti.length, transazioni.length);

    // Riallineamento dello stato locale (best-effort, nessuno di questi
    // fallimenti deve trasformarsi in un errore per l'utente).
    try { notifyCreditsChanged(userId ? { userId } : undefined); } catch { /* niente */ }
    await caricaPoiPosseduti(true).catch(() => {});
    await reconcileOfflineBilling().catch(() => {});
    try {
      const pass = await getDayPassState();
      window.dispatchEvent(new CustomEvent(DAY_PASS_UPDATED_EVENT, { detail: pass }));
    } catch { /* il badge si aggiornerà da solo */ }

    if (ripristinati <= 0) {
      return { ok: true, ripristinati: 0, messaggio: t('iap_ripristino_vuoto') };
    }
    return {
      ok: true,
      ripristinati,
      messaggio: t('iap_ripristino_ok').replace('{n}', String(ripristinati)),
    };
  } catch (e: any) {
    // L'utente non deve MAI leggere il messaggio grezzo dello store.
    console.warn('[iap] restorePurchases fallito:', e);
    return { ok: false, ripristinati: 0, messaggio: t('iap_ripristino_errore') };
  }
}

/**
 * I prezzi VERI dei pacchetti acquistabili, dal negozio dell'utente.
 * Chiave: identifier del pacchetto RevenueCat E identifier del prodotto dello
 * store (senza il suffisso ":base-plan" di Google), così ShopScreen può
 * cercare con lo stesso criterio che usa per l'acquisto.
 * Mappa VUOTA = offerte non disponibili: non si inventa nessun prezzo.
 */
export async function leggiPrezziPacchetti(): Promise<Record<string, string>> {
  if (!acquistiInAppDisponibili()) return {};
  try {
    const offerings = await Purchases.getOfferings();
    const corrente = offerings?.current;
    if (!corrente) return {};
    const prezzi: Record<string, string> = {};
    for (const p of corrente.availablePackages || []) {
      const price = String((p as any)?.product?.priceString || '').trim();
      if (!price) continue;
      if (p.identifier) prezzi[p.identifier] = price;
      const prodId = String((p as any)?.product?.identifier || '').split(':')[0];
      if (prodId) prezzi[prodId] = price;
    }
    return prezzi;
  } catch (e) {
    console.warn('[iap] getOfferings fallito:', e);
    return {};
  }
}
