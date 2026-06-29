import { Network, ConnectionStatus } from '@capacitor/network';
import { useEffect } from 'react';

/**
 * Native network status hook using Capacitor Network plugin.
 * Falls back to navigator.onLine for web.
 */
export function useNativeNetworkStatus(
  onStatusChange?: (status: ConnectionStatus) => void
) {
  useEffect(() => {
    let cleanup: (() => void) | undefined;

    const setup = async () => {
      try {
        // Get initial status
        const status = await Network.getStatus();
        onStatusChange?.(status);

        // Listen for changes
        const handler = await Network.addListener('networkStatusChange', (newStatus) => {
          onStatusChange?.(newStatus);
        });

        cleanup = () => {
          handler.remove();
        };
      } catch {
        // Capacitor not available (web only) — fallback to navigator.onLine
        const handleOnline = () => onStatusChange?.({ connected: true, connectionType: 'unknown' });
        const handleOffline = () => onStatusChange?.({ connected: false, connectionType: 'none' });

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        cleanup = () => {
          window.removeEventListener('online', handleOnline);
          window.removeEventListener('offline', handleOffline);
        };
      }
    };

    setup();

    return () => {
      cleanup?.();
    };
  }, [onStatusChange]);
}
