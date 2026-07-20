import { useEffect, lazy, Suspense, Component, useState, type ReactNode } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider, QueryCache, MutationCache, QueryErrorResetBoundary } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { SentryErrorBoundary, reportError } from "@/lib/sentry";
import { repairPwaCache, isPwaCacheError } from "@/lib/pwaRepair";
import { extractErrorMessage } from "@/lib/extractErrorMessage";
import { ADMIN_ROLES, INVENTORY_ROLES, FINANCIAL_ROLES, POS_ROLES, STORE_ROLES, MANAGEMENT_ROLES, PRODUCT_MANAGEMENT_ROLES } from "@/types";
import { toast as sonnerToast } from "sonner";
import { AuthProvider } from "@/contexts/AuthContext";
import { OrgSelectorProvider } from "@/contexts/OrgSelectorContext";
import { OfflineProvider } from "@/contexts/OfflineContext";
import { BrandingProvider } from "@/contexts/BrandingContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { StoreProvider } from "@/contexts/StoreContext";
import { DemoProvider } from "@/contexts/DemoContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

// Eagerly loaded — critical first-load pages
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Products from "./pages/Products";
import NotFound from "./pages/NotFound";
import OfflineFallback from "./pages/OfflineFallback";
import Diagnostic from "./pages/Diagnostic";
import DiagnosticStores from "./pages/DiagnosticStores";

/**
 * Lazy-loaded routes with automatic recovery for stale chunks.
 *
 * Two failure modes:
 * 1. OFFLINE: User has no internet and the chunk isn't cached yet.
 *    → Show OfflineFallback component instead of reload loop.
 * 2. STALE CHUNK: New deployment replaced chunk files, user has old index.html.
 *    → Force-reload once to pick up the new index.html.
 */
const STALE_CHUNK_KEY = "makitiplus_stale_reload";

function lazyWithRecovery<T extends React.ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>
) {
  return lazy(() =>
    factory().catch((err) => {
      // M4 fix: If offline, don't try to reload — show offline fallback instead
      if (!navigator.onLine) {
        // Return a component that renders OfflineFallback
        return { default: OfflineFallback as unknown as T };
      }

      // Chunk failed to load (likely 404 after new deployment)
      if (!sessionStorage.getItem(STALE_CHUNK_KEY)) {
        sessionStorage.setItem(STALE_CHUNK_KEY, "1");
        window.location.reload();
      }
      throw err;
    })
  );
}

const POS = lazyWithRecovery(() => import("./pages/POS"));
const Reports = lazyWithRecovery(() => import("./pages/Reports"));
const Categories = lazyWithRecovery(() => import("./pages/Categories"));
const Expenses = lazyWithRecovery(() => import("./pages/Expenses"));
const Customers = lazyWithRecovery(() => import("./pages/Customers"));
const Suppliers = lazyWithRecovery(() => import("./pages/Suppliers"));
const Users = lazyWithRecovery(() => import("./pages/Users"));
const SyncConflicts = lazyWithRecovery(() => import("./pages/SyncConflicts"));
const Stores = lazyWithRecovery(() => import("./pages/Stores"));
const AdminAnalytics = lazyWithRecovery(() => import("./pages/AdminAnalytics"));
const Settings = lazyWithRecovery(() => import("./pages/Settings"));
const Billing = lazyWithRecovery(() => import("./pages/Billing"));
const Pricing = lazyWithRecovery(() => import("./pages/Pricing"));
const Onboarding = lazyWithRecovery(() => import("./pages/Onboarding"));
const PurchaseOrders = lazyWithRecovery(() => import("./pages/PurchaseOrders"));
const CashClosing = lazyWithRecovery(() => import("./pages/CashClosing"));
const AIAssistant = lazyWithRecovery(() => import("./pages/AIAssistant"));
const OrganizationManagement = lazyWithRecovery(() => import("./pages/OrganizationManagement"));
const SellerActivity = lazyWithRecovery(() => import("./pages/SellerActivity"));

/** Minimal loading spinner for lazy-loaded routes */
const PageLoader = () => (
  <div className="flex items-center justify-center min-h-[60vh]">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900" />
  </div>
);

/** Safe page wrapper: error boundary + suspense — prevents full-app crash on page errors */
const SafePage = ({ children }: { children: ReactNode }) => (
  <PageErrorBoundary>
    <Suspense fallback={<PageLoader />}>
      {children}
    </Suspense>
  </PageErrorBoundary>
);

/** Error fallback shown when the app crashes — user can reload */
const ErrorFallback = () => (
  <div className="flex flex-col items-center justify-center min-h-screen bg-background p-8 text-center">
    <AlertTriangle className="h-16 w-16 text-destructive mb-6" />
    <h1 className="text-2xl font-bold text-foreground mb-2">Une erreur est survenue</h1>
    <p className="text-muted-foreground mb-6 max-w-md">
      MakitiPlus a rencontré une erreur inattendue. Notre équipe a été notifiée.
      Vous pouvez recharger la page pour continuer.
    </p>
    <Button onClick={() => window.location.reload()} size="lg">
      Recharger l'application
    </Button>
  </div>
);

/** Page-level error fallback — shows inline error with option to go back */
const PageErrorFallback = ({ error }: { error?: Error }) => {
  const showPwaRepair = error ? isPwaCacheError(error) : false;
  const [repairing, setRepairing] = useState(false);

  const handleRepair = async () => {
    setRepairing(true);
    await repairPwaCache();
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] bg-background p-8 text-center">
      <AlertTriangle className="h-12 w-12 text-destructive mb-4" />
      <h2 className="text-xl font-bold text-foreground mb-2">Erreur sur cette page</h2>
      <p className="text-muted-foreground mb-4 max-w-md">
        Une erreur inattendue s'est produite. Essayez de recharger la page.
      </p>
      {showPwaRepair && (
        <div className="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-950/30 dark:border-amber-800 max-w-md">
          <p className="text-sm text-amber-800 dark:text-amber-200 mb-2">
            Une ancienne version de l'application est peut-être en cache.
            Cliquez sur "Réparer l'application" pour vider le cache technique.
            <strong> Vos ventes hors-ligne ne seront pas supprimées.</strong>
          </p>
          <Button onClick={handleRepair} disabled={repairing} variant="default" className="w-full">
            {repairing ? "Réparation en cours..." : "Réparer l'application"}
          </Button>
        </div>
      )}
      <div className="flex gap-3">
        <Button variant="outline" onClick={() => window.history.back()}>
          Retour
        </Button>
        <Button onClick={() => window.location.reload()}>
          Recharger
        </Button>
      </div>
    </div>
  );
};

/** Page-level error boundary for critical pages (POS, Reports) */
class PageErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: Error | null }> {
  state = { hasError: false, error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { hasError: true, error }; }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    reportError(error);
  }
  render() {
    if (this.state.hasError) return <PageErrorFallback error={this.state.error} />;
    return this.props.children;
  }
}

/** Smart retry: more retries for network errors, none for 4xx client errors or auth failures */
function smartRetry(failureCount: number, error: unknown): boolean {
  const message = extractErrorMessage(error);

  // Never retry auth failures — refresh token is dead, retrying makes it worse
  if (/Refresh Token Not Found|Invalid Refresh Token|JWTExpired|JWT invalid/i.test(message)) return false;

  // Never retry client errors (4xx) — the request itself is invalid
  if (/4[0-9]{2}|PGRST|JWT|auth/i.test(message)) return false;

  // Never retry 404 — RPC/table doesn't exist (migration not applied yet)
  if (/404|not found|Could not find the function/i.test(message)) return false;

  // Retry up to 3 times for network/server errors
  return failureCount < 3;
}

/** Toast deduplication — prevents flooding the same error */
const recentErrors = new Map<string, number>();
const ERROR_DEDUP_MS = 5000; // 5 seconds

function shouldShowError(message: string): boolean {
  const now = Date.now();
  const lastShown = recentErrors.get(message);
  if (lastShown && now - lastShown < ERROR_DEDUP_MS) return false;
  recentErrors.set(message, now);

  // Cleanup old entries every 100 errors to prevent memory leak
  if (recentErrors.size > 100) {
    for (const [key, timestamp] of recentErrors) {
      if (now - timestamp > ERROR_DEDUP_MS) recentErrors.delete(key);
    }
  }
  return true;
}

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error: unknown) => {
      const message = extractErrorMessage(error);
      // Suppress noise from offline/background requests — only when actually offline
      if (!navigator.onLine && (message.includes('Failed to fetch') || message.includes('NetworkError'))) return;
      if (!shouldShowError(message)) return;
      sonnerToast.error('Erreur de chargement', {
        description: message.length > 120 ? message.slice(0, 120) + '…' : message,
        duration: 4000,
      });
    },
  }),
  mutationCache: new MutationCache({
    onError: (error: unknown) => {
      const message = extractErrorMessage(error);
      if (!shouldShowError(message)) return;
      sonnerToast.error('Erreur', {
        description: message.length > 120 ? message.slice(0, 120) + '…' : message,
        duration: 5000,
      });
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes — reduces redundant network requests
      retry: smartRetry,
      refetchOnWindowFocus: (query) => {
        // Don't refetch on focus if we're offline
        if (!navigator.onLine) return false;
        // Only refetch queries that have failed or are stale
        return query.state.status === 'error' || query.isStale();
      },
    },
    mutations: {
      // No global onError — each mutation has its own local handler
      // to avoid double toast (local Shadcn + global Sonner)
    },
  },
});

const App = () => {
  useEffect(() => {
    // Dynamic import avoids pulling jsPDF (390 kB) into the initial bundle
    import("@/lib/receiptDeliveryQueue").then(({ installAutoFlush }) => {
      installAutoFlush((r) => {
        if (r.sent > 0) {
          sonnerToast.success(`Tickets envoyés à la reconnexion : ${r.sent}`, {
            description: r.skipped > 0 ? `${r.skipped} doublon(s) ignoré(s)` : undefined,
          });
        }
      });
    });

    // Initialize Web Vitals monitoring (LCP, INP, CLS, TTFB) → Sentry
    import("@/lib/webVitals").then(({ initWebVitals }) => initWebVitals());
  }, []);
  return (
  <QueryClientProvider client={queryClient}>
    <QueryErrorResetBoundary>
    <SentryErrorBoundary fallback={<ErrorFallback />}>
    <AuthProvider>
    <OrgSelectorProvider>
    <OfflineProvider>
    <DemoProvider>
    <StoreProvider>
    <BrandingProvider>
    <ThemeProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/index.html" element={<Navigate to="/auth" replace />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/diagnostic" element={<Diagnostic />} />
            <Route
              path="/diagnostic-stores"
              element={
                <ProtectedRoute>
                  <DiagnosticStores />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/products"
              element={
                <ProtectedRoute allowedRoles={PRODUCT_MANAGEMENT_ROLES}>
                  <SafePage><Products /></SafePage>
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/pos"
              element={
                <ProtectedRoute allowedRoles={POS_ROLES}>
                  <SafePage><POS /></SafePage>
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/categories"
              element={
                <ProtectedRoute allowedRoles={MANAGEMENT_ROLES}>
                  <SafePage><Categories /></SafePage>
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/reports"
              element={
                <ProtectedRoute allowedRoles={FINANCIAL_ROLES}>
                  <SafePage><Reports /></SafePage>
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/expenses"
              element={
                <ProtectedRoute allowedRoles={FINANCIAL_ROLES}>
                  <SafePage><Expenses /></SafePage>
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/customers"
              element={
                <ProtectedRoute allowedRoles={POS_ROLES}>
                  <SafePage><Customers /></SafePage>
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/suppliers"
              element={
                <ProtectedRoute allowedRoles={MANAGEMENT_ROLES}>
                  <SafePage><Suppliers /></SafePage>
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/users"
              element={
                <ProtectedRoute allowedRoles={ADMIN_ROLES}>
                  <SafePage><Users /></SafePage>
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/stores"
              element={
                <ProtectedRoute allowedRoles={ADMIN_ROLES}>
                  <SafePage><Stores /></SafePage>
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/admin-analytics"
              element={
                <ProtectedRoute allowedRoles={STORE_ROLES}>
                  <SafePage><AdminAnalytics /></SafePage>
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/seller-activity"
              element={
                <ProtectedRoute allowedRoles={MANAGEMENT_ROLES}>
                  <SafePage><SellerActivity /></SafePage>
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/admin/organizations"
              element={
                <ProtectedRoute allowedRoles={STORE_ROLES}>
                  <SafePage><OrganizationManagement /></SafePage>
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/sync-conflicts"
              element={
                <ProtectedRoute allowedRoles={ADMIN_ROLES}>
                  <SafePage><SyncConflicts /></SafePage>
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/settings"
              element={
                <ProtectedRoute allowedRoles={MANAGEMENT_ROLES}>
                  <SafePage><Settings /></SafePage>
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/billing"
              element={
                <ProtectedRoute allowedRoles={ADMIN_ROLES}>
                  <SafePage><Billing /></SafePage>
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/ai-assistant"
              element={
                <ProtectedRoute allowedRoles={MANAGEMENT_ROLES}>
                  <SafePage><AIAssistant /></SafePage>
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/purchase-orders"
              element={
                <ProtectedRoute allowedRoles={MANAGEMENT_ROLES}>
                  <SafePage><PurchaseOrders /></SafePage>
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/cash-closing"
              element={
                <ProtectedRoute allowedRoles={MANAGEMENT_ROLES}>
                  <SafePage><CashClosing /></SafePage>
                </ProtectedRoute>
              }
            />
            <Route
              path="/onboarding"
              element={
                <ProtectedRoute>
                  <SafePage><Onboarding /></SafePage>
                </ProtectedRoute>
              }
            />
            <Route
              path="/pricing"
              element={
                <SafePage><Pricing /></SafePage>
              }
            />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
    </BrandingProvider>
    </StoreProvider>
    </DemoProvider>
    </OfflineProvider>
    </OrgSelectorProvider>
    </AuthProvider>
    </SentryErrorBoundary>
    </QueryErrorResetBoundary>
  </QueryClientProvider>
  );
};

export default App;
