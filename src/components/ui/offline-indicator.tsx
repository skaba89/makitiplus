import { useOnlineStatus } from "@/contexts/OfflineContext";
import { cn } from "@/lib/utils";
import { Wifi, WifiOff, RefreshCw, CloudOff, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Network status indicator + sync button.
 * Shows online/offline state and pending mutation count.
 */
export const OfflineIndicator = () => {
  const { isOnline, isSyncing, pendingCount, lastSyncAt, triggerSync } = useOnlineStatus();

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
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium transition-all",
              isOnline
                ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
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
            {pendingCount > 0 && (
              <span className="ml-1 bg-yellow-500 text-white rounded-full px-1.5 py-0.5 text-[10px] font-bold">
                {pendingCount}
              </span>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          {isOnline ? (
            <span>Dernière sync : {formatLastSync(lastSyncAt)}</span>
          ) : (
            <span>Les modifications seront synchronisées à la reconnexion</span>
          )}
        </TooltipContent>
      </Tooltip>

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
 */
export const OfflineBanner = () => {
  const { isOnline, pendingCount } = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="bg-yellow-500/10 border-b border-yellow-500/20 px-4 py-2 flex items-center justify-center gap-2 text-sm">
      <CloudOff className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
      <span className="text-yellow-700 dark:text-yellow-300 font-medium">
        Mode hors-ligne
      </span>
      {pendingCount > 0 && (
        <span className="text-yellow-600 dark:text-yellow-400">
          — {pendingCount} modification(s) en attente
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
