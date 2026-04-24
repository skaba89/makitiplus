import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Products from "./pages/Products";
import POS from "./pages/POS";
import Categories from "./pages/Categories";
import Reports from "./pages/Reports";
import NotFound from "./pages/NotFound";
import Expenses from "./pages/Expenses";
import Settings from "./pages/Settings";
import Customers from "./pages/Customers";
import Users from "./pages/Users";
import SyncConflicts from "./pages/SyncConflicts";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
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
                <ProtectedRoute allowedRoles={["admin", "manager", "vendeur"]}>
                  <Products />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/pos"
              element={
                <ProtectedRoute allowedRoles={["admin", "manager", "vendeur"]}>
                  <POS />
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
                  <Reports />
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

export default App;
