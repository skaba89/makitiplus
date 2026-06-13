import { useEffect, lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { installAutoFlush } from "@/lib/receiptDeliveryQueue";
import { toast as sonnerToast } from "sonner";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
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

// Lazy-loaded heavy routes (recharts + POS components → significant bundle reduction)
const Reports = lazy(() => import("./pages/Reports"));
const POS = lazy(() => import("./pages/POS"));

/** Minimal loading spinner for lazy-loaded routes */
const PageLoader = () => (
  <div className="flex items-center justify-center min-h-[60vh]">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900" />
  </div>
);

const queryClient = new QueryClient();

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
                <ProtectedRoute allowedRoles={["admin", "manager", "vendeur"]}>
                  <Products />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/pos"
              element={
                <ProtectedRoute allowedRoles={["admin", "manager", "vendeur"]}>
                  <Suspense fallback={<PageLoader />}>
                    <POS />
                  </Suspense>
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/categories"
              element={
                <ProtectedRoute allowedRoles={["admin", "manager"]}>
                  <Categories />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/reports"
              element={
                <ProtectedRoute allowedRoles={["admin", "manager", "comptable"]}>
                  <Suspense fallback={<PageLoader />}>
                    <Reports />
                  </Suspense>
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/expenses"
              element={
                <ProtectedRoute allowedRoles={["admin", "manager", "comptable"]}>
                  <Expenses />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/customers"
              element={
                <ProtectedRoute allowedRoles={["admin", "manager", "vendeur"]}>
                  <Customers />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/users"
              element={
                <ProtectedRoute allowedRoles={["admin"]}>
                  <Users />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/sync-conflicts"
              element={
                <ProtectedRoute allowedRoles={["admin"]}>
                  <SyncConflicts />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/settings"
              element={
                <ProtectedRoute allowedRoles={["admin", "manager"]}>
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
  </QueryClientProvider>
  );
};

export default App;
