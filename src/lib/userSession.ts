/**
 * Pulizia dei dati utente locali al logout / cambio account.
 *
 * Il logout faceva solo `supabase.auth.signOut()`: cronologia ascolti,
 * preferiti, itinerari, profilo in cache e credenziali biometriche restavano
 * sul dispositivo. Sul telefono di famiglia il secondo utente vedeva (e
 * ri-sincronizzava sul proprio account) i dati del primo.
 */

import { Capacitor } from '@capacitor/core';
import { NativeBiometric } from '@capgo/capacitor-native-biometric';

/** Chiavi localStorage che contengono dati personali dell'utente loggato. */
const USER_DATA_KEYS = [
  'wip_user_profile',
  'userProfileName',
  'userProfileAvatar',
  'wip_user_xp',
  'mock_db_listening_history',
  'mock_db_saved_pois',
  'mock_db_user_itineraries',
  'wip_pending_fav_sync',
  'wip_played_pois',
];

/** Prefissi di chiavi generate dinamicamente (una per POI/itinerario). */
const USER_DATA_PREFIXES = [
  'offline_poi_',
  'wip_gamification_',
  'pending_deeplink_',
];

export function wipeLocalUserData(): void {
  try {
    USER_DATA_KEYS.forEach(k => localStorage.removeItem(k));

    // Le chiavi dinamiche vanno raccolte prima di rimuoverle: mutare
    // localStorage mentre lo si itera salta elementi.
    const dynamicKeys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && USER_DATA_PREFIXES.some(p => key.startsWith(p))) dynamicKeys.push(key);
    }
    dynamicKeys.forEach(k => localStorage.removeItem(k));
  } catch (e) {
    console.warn('[Session] Pulizia dati locali fallita:', e);
  }

  // Credenziali biometriche: restavano nel keychain dopo il logout, quindi
  // il device offriva l'accesso rapido all'account appena abbandonato.
  if (Capacitor.isNativePlatform()) {
    NativeBiometric.deleteCredentials({ server: 'itainta' })
      .catch(() => { /* nessuna credenziale salvata */ });
  }
}
