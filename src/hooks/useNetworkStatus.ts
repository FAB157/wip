import { useState, useEffect } from 'react';
import { Network, ConnectionStatus } from '@capacitor/network';

export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    let mounted = true;

    const checkStatus = async () => {
      try {
        const status = await Network.getStatus();
        if (mounted) setIsOnline(status.connected);
      } catch (e) {
        console.warn('Network plugin error, falling back to navigator', e);
        if (mounted) setIsOnline(navigator.onLine);
      }
    };

    checkStatus();

    const listener = Network.addListener('networkStatusChange', (status: ConnectionStatus) => {
      if (mounted) setIsOnline(status.connected);
    });

    // Fallbacks
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      mounted = false;
      listener.then(l => l.remove()).catch(() => {});
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}
