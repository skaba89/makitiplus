import { useState, useEffect } from "react";
import { useOnlineStatus } from "@/contexts/OfflineContext";
import { getCacheAge, OFFLINE_STORES, type OfflineStoreName } from "@/lib/offlineQueue";
import { cn } from "@/lib/utils";
import { Wifi, WifiOff, RefreshCw, CloudOff, AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * M2 fix: Hook to determine cache staleness for offline data display.
 * Returns a human-readable age string and a severity level.
 */
function useCacheStaleness() {
  const [ageText, setAgeText] = useState<string>("");
  const [severity, setSeverity] = useState<"fresh" | "stale" | "old">("fresh");

  useEffect(() => {
    let mounted = true;

    const checkAge = async () => {
      try {
        const ageSeconds = await getCacheAge(OFFLINE_STORES.PRODUCT_CACHE as OfflineStoreName);
        if (!mounted || ageSeconds === null) return;

        const minutes = Math.floor(ageSeconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (minutes < 5) {
          setAgeText("Données récentes");
          setSeverity("fresh");
        } else if (hours < 2) {
          setAgeText(`Données datant de ${minutes} min`);
          setSeverity("stale");
        } else if (days < 1) {
          setAgeText(`Données datant de ${hours}h`);
          setSeverity("stale");
        } else {
          setAgeText(`Données datant de ${days}j`);
          setSeverity("old");
        }
      } catch {
        // Cache age check is best-effort
      }
    };

    checkAge();
    const interval = setInterval(checkAge, 60_000); // Recheck every minute
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  return { ageText, severity };
}

/**
 * Network status indicator + sync button.
 * Shows online/offline state, pending mutation count, and cache staleness when offline.
 */
export const OfflineIndicator = () => {
  const { isOnline, isSyncing, pendingCount, failedCount, lastSyncAt, triggerSync, retryFailed } = useOnlineStatus();
  const { ageText, severity } = useCacheStaleness();

  const formatLastSync = (date: Date | null) => {
    if (!date) return "Jamais";
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 60) return "À l'instant";
    if (seconds < 3600) return `Il y a ${Math.floor(seconds / 60)} min`;
    return `Il y a ${Math.floor(seconds / 3600)}h`;
  };

  return (
    <div className="flex items-center gap-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            role="status"
            aria-live="polite"
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium transition-all",
              isOnline
                ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                : severity === "old"
                  ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                  : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
            )}
          >
            {isOnline ? (
              <Wifi className="h-3.5 w-3.5" />
            ) : (
              <WifiOff className="h-3.5 w-3.5" />
            )}
            <span className="hidden sm:inline">
              {isOnline ? "En ligne" : "Hors-ligne"}
            </span>
            {!isOnline && severity !== "fresh" && (
              <AlertTriangle className={cn(
                "h-3 w-3",
                severity === "old" ? "text-red-500" : "text-yellow-500"
              )} />
            )}
            {pendingCount > 0 && (
              <span className="ml-1 bg-yellow-500 text-white rounded-full px-1.5 py-0.5 text-micro font-bold">
                {pendingCount}
              </span>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          {isOnline ? (
            <span>Dernière sync : {formatLastSync(lastSyncAt)}</span>
          ) : (
            <span>
              {ageText && <span className="block">{ageText}</span>}
              <span>Les modifications seront synchronisées à la reconnexion</span>
            </span>
          )}
        </TooltipContent>
      </Tooltip>

      {isOnline && failedCount > 0 && (
        <Button
          variant="outline"
          size="sm"
          className="h-7 px-2 text-xs gap-1 text-orange-600 border-orange-300 hover:bg-orange-50 dark:text-orange-400 dark:border-orange-700 dark:hover:bg-orange-950"
          onClick={retryFailed}
          disabled={isSyncing}
        >
          <RotateCcw className={cn("h-3 w-3", isSyncing && "animate-spin")} />
          Réessayer ({failedCount})
        </Button>
      )}

      {isOnline && pendingCount > 0 && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs gap-1"
          onClick={triggerSync}
          disabled={isSyncing}
        >
          <RefreshCw className={cn("h-3 w-3", isSyncing && "animate-spin")} />
          Synchroniser
        </Button>
      )}
    </div>
  );
};

/**
 * Full-width banner shown when offline with pending changes.
 * M2 fix: Shows cache staleness warning when data is old.
 */
export const OfflineBanner = () => {
  const { isOnline, pendingCount, failedCount } = useOnlineStatus();
  const { ageText, severity } = useCacheStaleness();

  if (isOnline) return null;

  return (
    <div role="alert" aria-live="assertive" className={cn(
      "border-b px-4 py-2 flex items-center justify-center gap-2 text-sm",
      severity === "old"
        ? "bg-orange-500/10 border-orange-500/20"
        : "bg-yellow-500/10 border-yellow-500/20"
    )}>
      <CloudOff className={cn(
        "h-4 w-4",
        severity === "old"
          ? "text-orange-600 dark:text-orange-400"
          : "text-yellow-600 dark:text-yellow-400"
      )} />
      <span className={cn(
        "font-medium",
        severity === "old"
          ? "text-orange-700 dark:text-orange-300"
          : "text-yellow-700 dark:text-yellow-300"
      )}>
        Mode hors-ligne
      </span>
      {pendingCount > 0 && (
        <span className={cn(
          severity === "old"
            ? "text-orange-600 dark:text-orange-400"
            : "text-yellow-600 dark:text-yellow-400"
        )}>
          — {pendingCount} modification(s) en attente
        </span>
      )}
      {failedCount > 0 && (
        <span className="text-red-600 dark:text-red-400 font-medium ml-1">
          — {failedCount} échouée(s)
        </span>
      )}
      {severity === "old" && ageText && (
        <span className="text-orange-600 dark:text-orange-400 font-medium ml-1">
          — ⚠ {ageText}
        </span>
      )}
      {severity === "stale" && ageText && (
        <span className="text-yellow-600 dark:text-yellow-400 ml-1">
          — {ageText}
        </span>
      )}
    </div>
  );
};

/**
 * Sync success toast component.
 */
export const SyncSuccessIndicator = () => {
  const { isSyncing } = useOnlineStatus();

  if (!isSyncing) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 bg-card border shadow-lg rounded-lg px-4 py-2.5 text-sm animate-in slide-in-from-bottom-2">
      <RefreshCw className="h-4 w-4 animate-spin text-primary" />
      <span>Synchronisation en cours...</span>
    </div>
  );
};
