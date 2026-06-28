import { useEffect, lazy, Suspense, Component, type ReactNode } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { installAutoFlush } from "@/lib/receiptDeliveryQueue";
import { SentryErrorBoundary } from "@/lib/sentry";
import { toast as sonnerToast } from "sonner";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Products from "./pages/Products";
import Categories from "./pages/Categories";
import NotFound from "./pages/NotFound";
import Expenses from "./pages/Expenses";
import Settings from "./pages/Settings";
import Customers from "./pages/Customers";
import Users from "./pages/Users";
import SyncConflicts from "./pages/SyncConflicts";
import Stores from "./pages/Stores";

// Lazy-loaded heavy routes (recharts + POS components → significant bundle reduction)
const Reports = lazy(() => import("./pages/Reports"));
const POS = lazy(() => import("./pages/POS"));

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

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes — reduces redundant network requests
      retry: 1,
      onError: (error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        // Suppress noise from offline/background requests
        if (message.includes('Failed to fetch') || message.includes('NetworkError')) return;
        sonnerToast.error('Erreur de chargement', {
          description: message.length > 120 ? message.slice(0, 120) + '…' : message,
          duration: 4000,
        });
      },
    },
    mutations: {
      onError: (error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        sonnerToast.error('Erreur', {
          description: message.length > 120 ? message.slice(0, 120) + '…' : message,
          duration: 5000,
        });
      },
    },
  },
});

const App = () => {
  useEffect(() => {
    installAutoFlush((r) => {
      if (r.sent > 0) {
        sonnerToast.success(`Tickets envoyés à la reconnexion : ${r.sent}`, {
          description: r.skipped > 0 ? `${r.skipped} doublon(s) ignoré(s)` : undefined,
        });
      }
    });
  }, []);
  return (
  <QueryClientProvider client={queryClient}>
    <SentryErrorBoundary fallback={<ErrorFallback />}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Routes future={{ v7_relativeSplatPath: true }}>
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
                <ProtectedRoute allowedRoles={["super_admin", "admin", "manager", "vendeur"]}>
                  <Products />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/pos"
              element={
                <ProtectedRoute allowedRoles={["super_admin", "admin", "manager", "vendeur"]}>
                  <Suspense fallback={<PageLoader />}>
                    <POS />
                  </Suspense>
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/categories"
              element={
                <ProtectedRoute allowedRoles={["super_admin", "admin", "manager"]}>
                  <Categories />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/reports"
              element={
                <ProtectedRoute allowedRoles={["super_admin", "admin", "manager", "comptable"]}>
                  <Suspense fallback={<PageLoader />}>
                    <Reports />
                  </Suspense>
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/expenses"
              element={
                <ProtectedRoute allowedRoles={["super_admin", "admin", "manager", "comptable"]}>
                  <Expenses />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/customers"
              element={
                <ProtectedRoute allowedRoles={["super_admin", "admin", "manager", "vendeur"]}>
                  <Customers />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/users"
              element={
                <ProtectedRoute allowedRoles={["super_admin", "admin"]}>
                  <Users />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/stores"
              element={
                <ProtectedRoute allowedRoles={["super_admin"]}>
                  <Stores />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/sync-conflicts"
              element={
                <ProtectedRoute allowedRoles={["super_admin", "admin"]}>
                  <SyncConflicts />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/settings"
              element={
                <ProtectedRoute allowedRoles={["super_admin", "admin", "manager"]}>
                  <Settings />
                </ProtectedRoute>
              }
            />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
    </SentryErrorBoundary>
  </QueryClientProvider>
  );
};

export default App;
