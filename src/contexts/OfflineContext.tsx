import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { toast } from "@/hooks/use-toast";

interface OfflineContextType {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  lastSyncAt: Date | null;
  triggerSync: () => Promise<void>;
}

const OfflineContext = createContext<OfflineContextType | undefined>(undefined);

export const useOnlineStatus = () => {
  const context = useContext(OfflineContext);
  if (!context) {
    throw new Error("useOnlineStatus must be used within OfflineProvider");
  }
  return context;
};

export const OfflineProvider = ({ children }: { children: ReactNode }) => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);
  const [wasOffline, setWasOffline] = useState(false);

  // Update pending count from IndexedDB
  const refreshPendingCount = useCallback(async () => {
    try {
      const { count } = await import("@/lib/offlineQueue").then((m) => m.getPendingCount());
      setPendingCount(count);
    } catch {
      // IndexedDB may not be available
    }
  }, []);

  // Listen to online/offline events
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      if (wasOffline) {
        toast({
          title: "Connexion rétablie",
          description: "Synchronisation des données en attente...",
        });
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
      setWasOffline(true);
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

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      clearInterval(interval);
    };
  }, [wasOffline, refreshPendingCount]);

  // Auto-sync when coming back online
  useEffect(() => {
    if (isOnline && wasOffline) {
      triggerSync();
      setWasOffline(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline, wasOffline]);

  const triggerSync = useCallback(async () => {
    if (isSyncing || !isOnline) return;
    setIsSyncing(true);
    try {
      const { flushQueue } = await import("@/lib/offlineQueue");
      const result = await flushQueue();
      if (result.synced > 0) {
        setLastSyncAt(new Date());
        toast({
          title: "Synchronisation terminée",
          description: `${result.synced} opération(s) synchronisée(s)${result.failed > 0 ? `, ${result.failed} échouée(s)` : ""}`,
        });
      }
      await refreshPendingCount();
    } catch (err) {
      console.error("[Offline] Sync failed:", err);
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing, isOnline, refreshPendingCount]);

  return (
    <OfflineContext.Provider
      value={{
        isOnline,
        isSyncing,
        pendingCount,
        lastSyncAt,
        triggerSync,
      }}
    >
      {children}
    </OfflineContext.Provider>
  );
};
