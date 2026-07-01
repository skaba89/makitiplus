import { useEffect, lazy, Suspense, Component, type ReactNode } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider, QueryCache, MutationCache } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { SentryErrorBoundary } from "@/lib/sentry";
import { ADMIN_ROLES, INVENTORY_ROLES, FINANCIAL_ROLES, POS_ROLES, STORE_ROLES, MANAGEMENT_ROLES } from "@/types";
import { toast as sonnerToast } from "sonner";
import { AuthProvider } from "@/contexts/AuthContext";
import { OfflineProvider } from "@/contexts/OfflineContext";
import { BrandingProvider } from "@/contexts/BrandingContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Categories from "./pages/Categories";
import NotFound from "./pages/NotFound";
import Settings from "./pages/Settings";

// Lazy-loaded routes — heavy or admin-only pages
const Reports = lazy(() => import("./pages/Reports"));
const POS = lazy(() => import("./pages/POS"));
const Users = lazy(() => import("./pages/Users"));
const Stores = lazy(() => import("./pages/Stores"));
const SyncConflicts = lazy(() => import("./pages/SyncConflicts"));
const Products = lazy(() => import("./pages/Products"));
const Expenses = lazy(() => import("./pages/Expenses"));
const Customers = lazy(() => import("./pages/Customers"));

/** Minimal loading spinner for lazy-loaded routes */
const PageLoader = () => (
  <div className="flex items-center justify-center min-h-[60vh]">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900" />
  </div>
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
const PageErrorFallback = () => (
  <div className="flex flex-col items-center justify-center min-h-[60vh] bg-background p-8 text-center">
    <AlertTriangle className="h-12 w-12 text-destructive mb-4" />
    <h2 className="text-xl font-bold text-foreground mb-2">Erreur sur cette page</h2>
    <p className="text-muted-foreground mb-4 max-w-md">
      Une erreur inattendue s'est produite. Essayez de recharger la page.
    </p>
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

/** Page-level error boundary for critical pages (POS, Reports) */
class PageErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    reportError(error);
  }
  render() {
    if (this.state.hasError) return <PageErrorFallback />;
    return this.props.children;
  }
}

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      // Suppress noise from offline/background requests — only when actually offline
      if (!navigator.onLine && (message.includes('Failed to fetch') || message.includes('NetworkError'))) return;
      sonnerToast.error('Erreur de chargement', {
        description: message.length > 120 ? message.slice(0, 120) + '…' : message,
        duration: 4000,
      });
    },
  }),
  mutationCache: new MutationCache({
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      sonnerToast.error('Erreur', {
        description: message.length > 120 ? message.slice(0, 120) + '…' : message,
        duration: 5000,
      });
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes — reduces redundant network requests
      retry: 1,
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
  }, []);
  return (
  <QueryClientProvider client={queryClient}>
    <SentryErrorBoundary fallback={<ErrorFallback />}>
    <AuthProvider>
    <OfflineProvider>
    <BrandingProvider>
    <ThemeProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<Auth />} />
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
                <ProtectedRoute allowedRoles={INVENTORY_ROLES}>
                  <PageErrorBoundary>
                    <Suspense fallback={<PageLoader />}>
                      <Products />
                    </Suspense>
                  </PageErrorBoundary>
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/pos"
              element={
                <ProtectedRoute allowedRoles={POS_ROLES}>
                  <PageErrorBoundary>
                    <Suspense fallback={<PageLoader />}>
                      <POS />
                    </Suspense>
                  </PageErrorBoundary>
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/categories"
              element={
                <ProtectedRoute allowedRoles={INVENTORY_ROLES}>
                  <Categories />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/reports"
              element={
                <ProtectedRoute allowedRoles={FINANCIAL_ROLES}>
                  <PageErrorBoundary>
                    <Suspense fallback={<PageLoader />}>
                      <Reports />
                    </Suspense>
                  </PageErrorBoundary>
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/expenses"
              element={
                <ProtectedRoute allowedRoles={FINANCIAL_ROLES}>
                  <PageErrorBoundary>
                    <Suspense fallback={<PageLoader />}>
                      <Expenses />
                    </Suspense>
                  </PageErrorBoundary>
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/customers"
              element={
                <ProtectedRoute allowedRoles={MANAGEMENT_ROLES}>
                  <PageErrorBoundary>
                    <Suspense fallback={<PageLoader />}>
                      <Customers />
                    </Suspense>
                  </PageErrorBoundary>
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/users"
              element={
                <ProtectedRoute allowedRoles={ADMIN_ROLES}>
                  <Suspense fallback={<PageLoader />}>
                    <Users />
                  </Suspense>
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/stores"
              element={
                <ProtectedRoute allowedRoles={STORE_ROLES}>
                  <Suspense fallback={<PageLoader />}>
                    <Stores />
                  </Suspense>
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/sync-conflicts"
              element={
                <ProtectedRoute allowedRoles={ADMIN_ROLES}>
                  <Suspense fallback={<PageLoader />}>
                    <SyncConflicts />
                  </Suspense>
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/settings"
              element={
                <ProtectedRoute allowedRoles={MANAGEMENT_ROLES}>
                  <Settings />
                </ProtectedRoute>
              }
            />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
    </BrandingProvider>
    </OfflineProvider>
    </AuthProvider>
    </SentryErrorBoundary>
  </QueryClientProvider>
  );
};

export default App;
