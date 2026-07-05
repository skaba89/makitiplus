import { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from "react";
import { toast } from "@/hooks/use-toast";
import { reportError } from "@/lib/sentry";
import { logger } from "@/lib/logger";

interface OfflineContextType {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  failedCount: number;
  lastSyncAt: Date | null;
  triggerSync: () => Promise<void>;
  retryFailed: () => Promise<void>;
}

const OfflineContext = createContext<OfflineContextType | undefined>(undefined);

export const useOnlineStatus = () => {
  const context = useContext(OfflineContext);
  if (!context) {
    throw new Error("useOnlineStatus must be used within OfflineProvider");
  }
  return context;
};

/**
 * M3 fix: Debounce threshold for "online" events.
 * If the connection drops again within this window, we consider it unstable
 * and don't reset wasOffline. This prevents missing the next offline→online
 * transition on flaky connections (common on West African 3G/4G).
 */
const ONLINE_STABILITY_MS = 5000;

export const OfflineProvider = ({ children }: { children: ReactNode }) => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);
  const wasOfflineRef = useRef(false);
  const onlineStabilityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Update pending and failed counts from IndexedDB
  const refreshPendingCount = useCallback(async () => {
    try {
      const offlineQueue = await import("@/lib/offlineQueue");
      const { count } = await offlineQueue.getPendingCount();
      setPendingCount(count);
      const { count: failed } = await offlineQueue.getFailedCount();
      setFailedCount(failed);
    } catch {
      // IndexedDB may not be available
    }
  }, []);

  // Listen to online/offline events
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      if (wasOfflineRef.current) {
        toast({
          title: "Connexion rétablie",
          description: "Synchronisation des données en attente...",
        });

        // M3 fix: Don't reset wasOffline immediately — wait for stability.
        // If the connection drops again during the stability window,
        // we'll still be in "wasOffline" state and the next recovery
        // will trigger auto-sync again.
        if (onlineStabilityTimerRef.current) {
          clearTimeout(onlineStabilityTimerRef.current);
        }
        onlineStabilityTimerRef.current = setTimeout(() => {
          wasOfflineRef.current = false;
          onlineStabilityTimerRef.current = null;
          logger.info("[Offline] Connection stable — resetting wasOffline flag");
        }, ONLINE_STABILITY_MS);
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
      wasOfflineRef.current = true;

      // Cancel any pending stability timer — connection is definitely not stable
      if (onlineStabilityTimerRef.current) {
        clearTimeout(onlineStabilityTimerRef.current);
        onlineStabilityTimerRef.current = null;
      }

      toast({
        variant: "destructive",
        title: "Mode hors-ligne",
        description: "Vos modifications seront synchronisées à la reconnexion.",
      });
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Initial count
    refreshPendingCount();

    // Refresh count periodically
    const interval = setInterval(refreshPendingCount, 30000);

    // Cleanup expired mutations on mount and every 30 minutes
    const cleanupExpired = async () => {
      try {
        const { cleanupExpiredMutations } = await import("@/lib/offlineQueue");
        await cleanupExpiredMutations();
        await refreshPendingCount();
      } catch {
        // Best-effort
      }
    };
    cleanupExpired();
    const cleanupInterval = setInterval(cleanupExpired, 30 * 60 * 1000);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      clearInterval(interval);
      clearInterval(cleanupInterval);
      if (onlineStabilityTimerRef.current) {
        clearTimeout(onlineStabilityTimerRef.current);
      }
    };
  }, [refreshPendingCount]);

  const triggerSync = useCallback(async () => {
    if (isSyncing || !isOnline) return;
    setIsSyncing(true);
    try {
      // H1 fix: Use mutex-protected flush to prevent concurrent sync operations
      const { flushQueueWithMutex } = await import("@/lib/offlineQueue");
      const result = await flushQueueWithMutex();
      if (result.synced > 0) {
        setLastSyncAt(new Date());
        toast({
          title: "Synchronisation terminée",
          description: `${result.synced} opération(s) synchronisée(s)${result.failed > 0 ? `, ${result.failed} échouée(s)` : ""}`,
        });
      }
      await refreshPendingCount();
    } catch (err) {
      reportError(err instanceof Error ? err : new Error('[Offline] Sync failed: ' + String(err)));
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing, isOnline, refreshPendingCount]);

  // Retry failed mutations: reset them to pending and trigger a flush
  const retryFailed = useCallback(async () => {
    if (!isOnline) return;
    try {
      const { retryFailedMutations, flushQueueWithMutex } = await import("@/lib/offlineQueue");
      const { retried } = await retryFailedMutations();
      if (retried > 0) {
        toast({
          title: "Nouvelle tentative",
          description: `${retried} opération(s) vont être retentées.`,
        });
        // Trigger a flush to process the retried mutations
        const result = await flushQueueWithMutex();
        if (result.synced > 0) {
          setLastSyncAt(new Date());
          toast({
            title: "Synchronisation terminée",
            description: `${result.synced} opération(s) synchronisée(s)${result.failed > 0 ? `, ${result.failed} échouée(s)` : ""}`,
          });
        }
      }
      await refreshPendingCount();
    } catch (err) {
      reportError(err instanceof Error ? err : new Error('[Offline] Retry failed: ' + String(err)));
    }
  }, [isOnline, refreshPendingCount]);

  // Stable ref to triggerSync so the auto-sync effect doesn't re-run on every isSyncing change
  const triggerSyncRef = useRef(triggerSync);
  triggerSyncRef.current = triggerSync;

  // Auto-sync when coming back online
  useEffect(() => {
    if (isOnline && wasOfflineRef.current) {
      triggerSyncRef.current();
    }
  }, [isOnline]);

  return (
    <OfflineContext.Provider
      value={{
        isOnline,
        isSyncing,
        pendingCount,
        failedCount,
        lastSyncAt,
        triggerSync,
        retryFailed,
      }}
    >
      {children}
    </OfflineContext.Provider>
  );
};
