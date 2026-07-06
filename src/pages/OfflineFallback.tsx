import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CloudOff, RefreshCw, ShoppingCart, Home, Wifi } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * M4 fix: Offline fallback page shown when a lazy-loaded route chunk
 * cannot be fetched because the user is offline.
 *
 * Instead of an infinite reload loop (the old lazyWithRecovery behavior),
 * this page clearly explains the situation and offers actionable options:
 * - Go to POS (available offline if cached)
 * - Go to Dashboard (always eagerly loaded)
 * - Wait for connection (auto-detects when back online)
 */
const OfflineFallback = ({ requestedPath }: { requestedPath?: string }) => {
  const navigate = useNavigate();
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isRetrying, setIsRetrying] = useState(false);

  // Auto-detect when connection is restored
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
    };
    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const handleRetry = () => {
    setIsRetrying(true);
    // Reload the page to attempt loading the chunk again
    window.location.reload();
  };

  const pageName = requestedPath
    ? requestedPath
        .split("/")
        .filter(Boolean)
        .pop()
        ?.replace(/-/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase()) || "cette page"
    : "cette page";

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] bg-background p-8 text-center">
      {/* Animated cloud-off icon */}
      <div className={cn(
        "mb-6 rounded-full p-6 transition-colors duration-300",
        isOnline
          ? "bg-green-100 dark:bg-green-900/20"
          : "bg-red-100 dark:bg-red-900/20"
      )}>
        {isOnline ? (
          <Wifi className="h-12 w-12 text-green-600 dark:text-green-400" />
        ) : (
          <CloudOff className="h-12 w-12 text-red-500 dark:text-red-400" />
        )}
      </div>

      {/* Title */}
      <h2 className="text-xl font-bold text-foreground mb-2">
        {isOnline ? "Connexion rétablie" : "Page indisponible hors-ligne"}
      </h2>

      {/* Description */}
      <p className="text-muted-foreground mb-2 max-w-md">
        {isOnline ? (
          <>
            La connexion est de retour. Vous pouvez maintenant charger <strong>{pageName}</strong>.
          </>
        ) : (
          <>
            <strong>{pageName}</strong> nécessite une connexion internet pour se charger.
            Cette page n'a pas encore été visitée et son contenu n'est pas en cache.
          </>
        )}
      </p>

      {!isOnline && (
        <p className="text-sm text-muted-foreground mb-6 max-w-md">
          Les pages déjà visitées restent accessibles hors-ligne.
          Vous pouvez continuer à utiliser le POS et consulter vos produits.
        </p>
      )}

      {/* Action buttons */}
      <div className="flex flex-col sm:flex-row gap-3 mt-2">
        {isOnline && (
          <Button onClick={handleRetry} disabled={isRetrying} size="lg">
            <RefreshCw className={cn("h-4 w-4 mr-2", isRetrying && "animate-spin")} />
            Charger la page
          </Button>
        )}

        {!isOnline && (
          <Button onClick={handleRetry} variant="outline" disabled={isRetrying}>
            <RefreshCw className={cn("h-4 w-4 mr-2", isRetrying && "animate-spin")} />
            Réessayer
          </Button>
        )}

        <Button
          variant="outline"
          onClick={() => navigate("/dashboard/pos")}
        >
          <ShoppingCart className="h-4 w-4 mr-2" />
          Aller au POS
        </Button>

        <Button
          variant="ghost"
          onClick={() => navigate("/dashboard")}
        >
          <Home className="h-4 w-4 mr-2" />
          Tableau de bord
        </Button>
      </div>

      {/* Auto-retry hint */}
      {!isOnline && (
        <p className="mt-6 text-xs text-muted-foreground">
          La page se chargera automatiquement quand la connexion sera rétablie.
        </p>
      )}
    </div>
  );
};

export default OfflineFallback;
