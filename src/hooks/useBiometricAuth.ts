import { useState, useEffect } from 'react';
import { NativeBiometric } from '@capgo/capacitor-native-biometric';
import { Capacitor } from '@capacitor/core';

/** Marker locale: esistono credenziali biometriche salvate per questa app. */
export const BIOMETRIC_CREDS_SAVED_KEY = 'wip_biometric_creds_saved';
export const hasSavedBiometricCredentials = () => {
  try { return localStorage.getItem(BIOMETRIC_CREDS_SAVED_KEY) === '1'; } catch { return false; }
};

export function useBiometricAuth() {
  const [isAvailable, setIsAvailable] = useState(false);

  useEffect(() => {
    const checkAvailability = async () => {
      if (!Capacitor.isNativePlatform()) {
        setIsAvailable(false);
        return;
      }
      try {
        const result = await NativeBiometric.isAvailable();
        setIsAvailable(result.isAvailable);
      } catch (error) {
        console.error('Biometric check failed:', error);
        setIsAvailable(false);
      }
    };

    checkAvailability();
  }, []);

  const saveCredentials = async (email: string, password: string): Promise<boolean> => {
    if (!isAvailable) return false;
    try {
      await NativeBiometric.setCredentials({
        username: email,
        password: password,
        server: 'itainta' // Identifier for the app's credentials in keychain
      });
      // Marker per l'auto-prompt del login: dice "ci sono credenziali salvate"
      // SENZA dover interrogare il keystore (che richiederebbe la verifica).
      try { localStorage.setItem(BIOMETRIC_CREDS_SAVED_KEY, '1'); } catch { /* storage pieno */ }
      return true;
    } catch (error) {
      console.error('Failed to save biometric credentials:', error);
      return false;
    }
  };

  const getCredentials = async () => {
    if (!isAvailable) return null;
    try {
      // verifyIdentity è OBBLIGATORIA: getCredentials da sola legge il keystore
      // SENZA alcun prompt biometrico — chiunque col telefono in mano entrava
      // nell'account con un tap. Lancia un'eccezione se la verifica fallisce.
      await NativeBiometric.verifyIdentity({
        reason: 'Accedi a World in Pocket',
        title: 'Autenticazione biometrica'
      });
      const credentials = await NativeBiometric.getCredentials({
        server: 'itainta'
      });
      return credentials;
    } catch (error) {
      console.error('Biometric verification failed:', error);
      return null;
    }
  };

  const deleteCredentials = async (): Promise<boolean> => {
    if (!isAvailable) return false;
    try {
      await NativeBiometric.deleteCredentials({
        server: 'itainta'
      });
      try { localStorage.removeItem(BIOMETRIC_CREDS_SAVED_KEY); } catch { /* no-op */ }
      return true;
    } catch (error) {
      console.error('Failed to delete biometric credentials:', error);
      return false;
    }
  };

  return {
    isAvailable,
    saveCredentials,
    getCredentials,
    deleteCredentials
  };
}
