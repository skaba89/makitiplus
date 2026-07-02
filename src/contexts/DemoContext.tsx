/**
 * Demo Mode — Complete demo context providers for MakitiPlus
 *
 * How it works:
 * - Uses the REAL AuthContext.Provider and StoreContext.Provider with fake values
 * - So useAuth() and useStore() work transparently in demo pages
 * - Pre-populates React Query cache with realistic mock data
 * - Mutations are intercepted: destructive actions show a "demo mode" toast
 * - Auto-resets on page refresh (demo state is not persisted)
 *
 * Architecture:
 *   /demo routes → DemoProviders (replaces AuthProvider + StoreProvider)
 *                  → DemoDataProvider (populates React Query cache)
 *                  → DemoBanner (persistent top banner)
 *                  → Same page components (Dashboard, POS, Products, etc.)
 */

import { createContext, useContext, useEffect, useCallback, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { AuthContext } from "@/contexts/AuthContext";
import { StoreContext } from "@/contexts/StoreContext";
import { Database } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  ExternalLink,
  X,
  Sparkles,
  AlertTriangle,
} from "lucide-react";

// ─── Demo Constants ───────────────────────────────────────────

export const DEMO_USER_ID = "demo-user-00000000-0000-0000-0000-000000000001";
export const DEMO_ORG_ID = "demo-org-00000000-0000-0000-0000-000000000001";
export const DEMO_STORE_ID = "demo-store-00000000-0000-0000-0000-000000000001";
export const SESSION_FLAG = "makitiplus_demo_mode";

type AppRole = Database["public"]["Enums"]["app_role"];

// ─── Demo Profile ─────────────────────────────────────────────

const DEMO_PROFILE: Database["public"]["Tables"]["profiles"]["Row"] = {
  id: "demo-profile-1",
  user_id: DEMO_USER_ID,
  business_name: "Boutique Makiti Démo",
  owner_name: "Mamadou Diallo",
  phone: "+224 622 00 00 00",
  address: "Marché Madina, Conakry",
  city: "Conakry",
  country: "GN",
  currency: "GNF",
  organization_id: DEMO_ORG_ID,
  current_store_id: DEMO_STORE_ID,
  is_active: true,
  is_test_account: true,
  language: "fr",
  last_login_at: new Date().toISOString(),
  nfc_enabled: false,
  deactivated_at: null,
  deactivation_reason: null,
  subscription_expires_at: null,
  subscription_plan: null,
  test_expires_at: null,
  theme_mode: null,
  onboarding_step: "done",
  onboarding_completed: true,
  business_type: "boutique",
  created_at: "2025-01-15T10:00:00Z",
  updated_at: new Date().toISOString(),
};

const DEMO_USER = {
  id: DEMO_USER_ID,
  aud: "authenticated",
  role: "authenticated",
  email: "demo@makitiplus.com",
  created_at: "2025-01-15T10:00:00Z",
  app_metadata: {},
  user_metadata: {},
} as any;

const DEMO_SESSION = {
  access_token: "demo-token-not-real",
  refresh_token: "demo-refresh-not-real",
  token_type: "bearer",
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: DEMO_USER,
} as any;

// ─── Demo Store ───────────────────────────────────────────────

const DEMO_STORE = {
  id: DEMO_STORE_ID,
  name: "Boutique Makiti Démo",
  slug: "boutique-makiti-demo",
  address: "Marché Madina, Conakry",
  city: "Conakry",
  country: "GN",
  currency: "GNF",
  phone: "+224 622 00 00 00",
  is_active: true,
  is_headquarters: true,
  category: "boutique",
  metadata: {},
  product_count: 24,
  sales_this_month: 2_850_000,
  created_at: "2025-01-15T10:00:00Z",
  updated_at: new Date().toISOString(),
};

// ─── Demo Auth Provider (uses real AuthContext.Provider) ──────

function DemoAuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();

  const demoSignOut = useCallback(async () => {
    sessionStorage.removeItem(SESSION_FLAG);
    navigate("/", { replace: true });
  }, [navigate]);

  const demoSignIn = async () => ({ error: null as Error | null });
  const demoSignUp = async () => ({ error: null as Error | null });
  const demoRefreshProfile = async () => {};
  const demoRefreshUserData = async () => {};

  const value = {
    user: DEMO_USER,
    session: DEMO_SESSION,
    userRole: "admin" as AppRole,
    profile: DEMO_PROFILE,
    loading: false,
    signIn: demoSignIn,
    signUp: demoSignUp,
    signOut: demoSignOut,
    refreshProfile: demoRefreshProfile,
    refreshUserData: demoRefreshUserData,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

// ─── Demo Store Provider (uses real StoreContext.Provider) ────

function DemoStoreProvider({ children }: { children: ReactNode }) {
  const value = {
    currentStore: DEMO_STORE as any,
    stores: [DEMO_STORE] as any[],
    isLoading: false,
    setCurrentStore: async () => {},
    refreshStores: () => {},
  };

  return (
    <StoreContext.Provider value={value}>
      {children}
    </StoreContext.Provider>
  );
}

// ─── Mock Data ────────────────────────────────────────────────

const MOCK_CATEGORIES = [
  { id: "cat-1", name: "Alimentation", color: "#22c55e", icon: "shopping-bag", sort_order: 1, is_active: true, organization_id: DEMO_ORG_ID, store_id: DEMO_STORE_ID, created_at: "2025-01-15T10:00:00Z" },
  { id: "cat-2", name: "Boissons", color: "#3b82f6", icon: "coffee", sort_order: 2, is_active: true, organization_id: DEMO_ORG_ID, store_id: DEMO_STORE_ID, created_at: "2025-01-15T10:00:00Z" },
  { id: "cat-3", name: "Hygiène", color: "#a855f7", icon: "sparkles", sort_order: 3, is_active: true, organization_id: DEMO_ORG_ID, store_id: DEMO_STORE_ID, created_at: "2025-01-15T10:00:00Z" },
  { id: "cat-4", name: "Produits ménagers", color: "#f97316", icon: "home", sort_order: 4, is_active: true, organization_id: DEMO_ORG_ID, store_id: DEMO_STORE_ID, created_at: "2025-01-15T10:00:00Z" },
  { id: "cat-5", name: "Cosmétiques", color: "#ec4899", icon: "heart", sort_order: 5, is_active: true, organization_id: DEMO_ORG_ID, store_id: DEMO_STORE_ID, created_at: "2025-01-15T10:00:00Z" },
];

const MOCK_PRODUCTS = [
  { id: "prod-1", name: "Riz 25kg", price: 250000, stock_quantity: 45, min_stock_alert: 10, is_active: true, barcode: "612345678901", category_id: "cat-1", supplier_id: null, organization_id: DEMO_ORG_ID, store_id: DEMO_STORE_ID, categories: { name: "Alimentation", icon: "shopping-bag", color: "#22c55e" }, suppliers: null, created_at: "2025-01-15T10:00:00Z" },
  { id: "prod-2", name: "Huile végétale 5L", price: 85000, stock_quantity: 30, min_stock_alert: 8, is_active: true, barcode: "612345678902", category_id: "cat-1", supplier_id: null, organization_id: DEMO_ORG_ID, store_id: DEMO_STORE_ID, categories: { name: "Alimentation", icon: "shopping-bag", color: "#22c55e" }, suppliers: null, created_at: "2025-01-15T10:00:00Z" },
  { id: "prod-3", name: "Sucre 1kg", price: 12000, stock_quantity: 60, min_stock_alert: 15, is_active: true, barcode: "612345678903", category_id: "cat-1", supplier_id: null, organization_id: DEMO_ORG_ID, store_id: DEMO_STORE_ID, categories: { name: "Alimentation", icon: "shopping-bag", color: "#22c55e" }, suppliers: null, created_at: "2025-01-15T10:00:00Z" },
  { id: "prod-4", name: "Lait en poudre 400g", price: 35000, stock_quantity: 25, min_stock_alert: 10, is_active: true, barcode: "612345678904", category_id: "cat-1", supplier_id: null, organization_id: DEMO_ORG_ID, store_id: DEMO_STORE_ID, categories: { name: "Alimentation", icon: "shopping-bag", color: "#22c55e" }, suppliers: null, created_at: "2025-01-15T10:00:00Z" },
  { id: "prod-5", name: "Pâte dentifrice", price: 8000, stock_quantity: 40, min_stock_alert: 10, is_active: true, barcode: null, category_id: "cat-3", supplier_id: null, organization_id: DEMO_ORG_ID, store_id: DEMO_STORE_ID, categories: { name: "Hygiène", icon: "sparkles", color: "#a855f7" }, suppliers: null, created_at: "2025-01-15T10:00:00Z" },
  { id: "prod-6", name: "Savon de Marseille", price: 5000, stock_quantity: 55, min_stock_alert: 12, is_active: true, barcode: null, category_id: "cat-3", supplier_id: null, organization_id: DEMO_ORG_ID, store_id: DEMO_STORE_ID, categories: { name: "Hygiène", icon: "sparkles", color: "#a855f7" }, suppliers: null, created_at: "2025-01-15T10:00:00Z" },
  { id: "prod-7", name: "Coca-Cola 33cl", price: 3000, stock_quantity: 120, min_stock_alert: 24, is_active: true, barcode: "5449000000996", category_id: "cat-2", supplier_id: null, organization_id: DEMO_ORG_ID, store_id: DEMO_STORE_ID, categories: { name: "Boissons", icon: "coffee", color: "#3b82f6" }, suppliers: null, created_at: "2025-01-15T10:00:00Z" },
  { id: "prod-8", name: "Jus de bissap 1L", price: 5000, stock_quantity: 35, min_stock_alert: 10, is_active: true, barcode: null, category_id: "cat-2", supplier_id: null, organization_id: DEMO_ORG_ID, store_id: DEMO_STORE_ID, categories: { name: "Boissons", icon: "coffee", color: "#3b82f6" }, suppliers: null, created_at: "2025-01-15T10:00:00Z" },
  { id: "prod-9", name: "Eau minérale 1.5L", price: 4000, stock_quantity: 80, min_stock_alert: 20, is_active: true, barcode: null, category_id: "cat-2", supplier_id: null, organization_id: DEMO_ORG_ID, store_id: DEMO_STORE_ID, categories: { name: "Boissons", icon: "coffee", color: "#3b82f6" }, suppliers: null, created_at: "2025-01-15T10:00:00Z" },
  { id: "prod-10", name: "Détergent 1kg", price: 15000, stock_quantity: 20, min_stock_alert: 5, is_active: true, barcode: null, category_id: "cat-4", supplier_id: null, organization_id: DEMO_ORG_ID, store_id: DEMO_STORE_ID, categories: { name: "Produits ménagers", icon: "home", color: "#f97316" }, suppliers: null, created_at: "2025-01-15T10:00:00Z" },
  { id: "prod-11", name: "Café soluble 200g", price: 18000, stock_quantity: 18, min_stock_alert: 5, is_active: true, barcode: null, category_id: "cat-2", supplier_id: null, organization_id: DEMO_ORG_ID, store_id: DEMO_STORE_ID, categories: { name: "Boissons", icon: "coffee", color: "#3b82f6" }, suppliers: null, created_at: "2025-01-15T10:00:00Z" },
  { id: "prod-12", name: "Crème hydratante", price: 22000, stock_quantity: 15, min_stock_alert: 5, is_active: true, barcode: null, category_id: "cat-5", supplier_id: null, organization_id: DEMO_ORG_ID, store_id: DEMO_STORE_ID, categories: { name: "Cosmétiques", icon: "heart", color: "#ec4899" }, suppliers: null, created_at: "2025-01-15T10:00:00Z" },
  { id: "prod-13", name: "Shampooing 250ml", price: 16000, stock_quantity: 22, min_stock_alert: 8, is_active: true, barcode: null, category_id: "cat-5", supplier_id: null, organization_id: DEMO_ORG_ID, store_id: DEMO_STORE_ID, categories: { name: "Cosmétiques", icon: "heart", color: "#ec4899" }, suppliers: null, created_at: "2025-01-15T10:00:00Z" },
  { id: "prod-14", name: "Concentré Tomate", price: 7000, stock_quantity: 50, min_stock_alert: 12, is_active: true, barcode: null, category_id: "cat-1", supplier_id: null, organization_id: DEMO_ORG_ID, store_id: DEMO_STORE_ID, categories: { name: "Alimentation", icon: "shopping-bag", color: "#22c55e" }, suppliers: null, created_at: "2025-01-15T10:00:00Z" },
  { id: "prod-15", name: "Bougie parfumée", price: 10000, stock_quantity: 12, min_stock_alert: 3, is_active: true, barcode: null, category_id: "cat-4", supplier_id: null, organization_id: DEMO_ORG_ID, store_id: DEMO_STORE_ID, categories: { name: "Produits ménagers", icon: "home", color: "#f97316" }, suppliers: null, created_at: "2025-01-15T10:00:00Z" },
  { id: "prod-16", name: "Thé Lipton 25sachets", price: 9000, stock_quantity: 30, min_stock_alert: 10, is_active: true, barcode: null, category_id: "cat-2", supplier_id: null, organization_id: DEMO_ORG_ID, store_id: DEMO_STORE_ID, categories: { name: "Boissons", icon: "coffee", color: "#3b82f6" }, suppliers: null, created_at: "2025-01-15T10:00:00Z" },
  { id: "prod-17", name: "Moutarde 250g", price: 6000, stock_quantity: 28, min_stock_alert: 8, is_active: true, barcode: null, category_id: "cat-1", supplier_id: null, organization_id: DEMO_ORG_ID, store_id: DEMO_STORE_ID, categories: { name: "Alimentation", icon: "shopping-bag", color: "#22c55e" }, suppliers: null, created_at: "2025-01-15T10:00:00Z" },
  { id: "prod-18", name: "Savon liquide 500ml", price: 12000, stock_quantity: 18, min_stock_alert: 5, is_active: true, barcode: null, category_id: "cat-3", supplier_id: null, organization_id: DEMO_ORG_ID, store_id: DEMO_STORE_ID, categories: { name: "Hygiène", icon: "sparkles", color: "#a855f7" }, suppliers: null, created_at: "2025-01-15T10:00:00Z" },
  { id: "prod-19", name: "Laitue fraîche", price: 5000, stock_quantity: 3, min_stock_alert: 10, is_active: true, barcode: null, category_id: "cat-1", supplier_id: null, organization_id: DEMO_ORG_ID, store_id: DEMO_STORE_ID, categories: { name: "Alimentation", icon: "shopping-bag", color: "#22c55e" }, suppliers: null, created_at: "2025-01-15T10:00:00Z" },
  { id: "prod-20", name: "Eponge ménage", price: 3000, stock_quantity: 2, min_stock_alert: 10, is_active: true, barcode: null, category_id: "cat-4", supplier_id: null, organization_id: DEMO_ORG_ID, store_id: DEMO_STORE_ID, categories: { name: "Produits ménagers", icon: "home", color: "#f97316" }, suppliers: null, created_at: "2025-01-15T10:00:00Z" },
  { id: "prod-21", name: "Farine de blé 5kg", price: 45000, stock_quantity: 15, min_stock_alert: 5, is_active: true, barcode: null, category_id: "cat-1", supplier_id: null, organization_id: DEMO_ORG_ID, store_id: DEMO_STORE_ID, categories: { name: "Alimentation", icon: "shopping-bag", color: "#22c55e" }, suppliers: null, created_at: "2025-01-15T10:00:00Z" },
  { id: "prod-22", name: "Pâte alimentaire 1kg", price: 8000, stock_quantity: 40, min_stock_alert: 10, is_active: true, barcode: null, category_id: "cat-1", supplier_id: null, organization_id: DEMO_ORG_ID, store_id: DEMO_STORE_ID, categories: { name: "Alimentation", icon: "shopping-bag", color: "#22c55e" }, suppliers: null, created_at: "2025-01-15T10:00:00Z" },
  { id: "prod-23", name: "Lotion corps 400ml", price: 20000, stock_quantity: 10, min_stock_alert: 4, is_active: true, barcode: null, category_id: "cat-5", supplier_id: null, organization_id: DEMO_ORG_ID, store_id: DEMO_STORE_ID, categories: { name: "Cosmétiques", icon: "heart", color: "#ec4899" }, suppliers: null, created_at: "2025-01-15T10:00:00Z" },
  { id: "prod-24", name: "Javel 1L", price: 6000, stock_quantity: 35, min_stock_alert: 8, is_active: true, barcode: null, category_id: "cat-4", supplier_id: null, organization_id: DEMO_ORG_ID, store_id: DEMO_STORE_ID, categories: { name: "Produits ménagers", icon: "home", color: "#f97316" }, suppliers: null, created_at: "2025-01-15T10:00:00Z" },
];

const MOCK_DASHBOARD_STATS = {
  todaySales: 883000,
  todayTransactions: 12,
  monthSales: 2850000,
  monthTransactions: 47,
  monthCreditCount: 8,
  monthCreditTotal: 450000,
  totalProducts: 24,
  lowStockProducts: 2,
  totalCustomers: 35,
  totalCategories: 5,
};

const MOCK_TOP_PRODUCTS = [
  { product_name: "Riz 25kg", total_quantity: 28, total_revenue: 7000000 },
  { product_name: "Huile végétale 5L", total_quantity: 22, total_revenue: 1870000 },
  { product_name: "Coca-Cola 33cl", total_quantity: 95, total_revenue: 285000 },
  { product_name: "Sucre 1kg", total_quantity: 40, total_revenue: 480000 },
  { product_name: "Lait en poudre 400g", total_quantity: 15, total_revenue: 525000 },
];

const MOCK_SALES_MONTH = Array.from({ length: 47 }, () => ({
  total_amount: Math.floor(Math.random() * 200000) + 50000,
}));

const MOCK_EXPENSES_MONTH = [
  { amount: 350000, expense_date: "2025-06-05" },
  { amount: 180000, expense_date: "2025-06-12" },
  { amount: 95000, expense_date: "2025-06-18" },
  { amount: 220000, expense_date: "2025-06-25" },
];

const MOCK_RECENT_SALES = [
  { id: "sale-1", sale_number: "V-001", total_amount: 258000, payment_method: "cash", customer_name: "Fatou Bamba", created_at: new Date(Date.now() - 10 * 60000).toISOString(), organization_id: DEMO_ORG_ID, store_id: DEMO_STORE_ID },
  { id: "sale-2", sale_number: "V-002", total_amount: 92000, payment_method: "wave", customer_name: null, created_at: new Date(Date.now() - 45 * 60000).toISOString(), organization_id: DEMO_ORG_ID, store_id: DEMO_STORE_ID },
  { id: "sale-3", sale_number: "V-003", total_amount: 175000, payment_method: "orange_money", customer_name: "Ibrahima Soumah", created_at: new Date(Date.now() - 90 * 60000).toISOString(), organization_id: DEMO_ORG_ID, store_id: DEMO_STORE_ID },
  { id: "sale-4", sale_number: "V-004", total_amount: 38000, payment_method: "cash", customer_name: null, created_at: new Date(Date.now() - 120 * 60000).toISOString(), organization_id: DEMO_ORG_ID, store_id: DEMO_STORE_ID },
  { id: "sale-5", sale_number: "V-005", total_amount: 320000, payment_method: "cash", customer_name: "Aissatou Diallo", created_at: new Date(Date.now() - 180 * 60000).toISOString(), organization_id: DEMO_ORG_ID, store_id: DEMO_STORE_ID },
];

const MOCK_PRODUCT_STATS = {
  totalProducts: 24,
  lowStockCount: 2,
  outOfStockCount: 0,
  categoryCounts: MOCK_CATEGORIES.map((c) => ({ name: c.name, count: MOCK_PRODUCTS.filter((p) => p.category_id === c.id).length })),
};

const MOCK_SUPPLIERS = [
  { id: "sup-1", name: "Distributeur Guinée SARL", phone: "+224 666 11 11 11", email: "contact@dist-gn.com", address: "Kaloum, Conakry", is_active: true, organization_id: DEMO_ORG_ID, created_at: "2025-01-15T10:00:00Z" },
  { id: "sup-2", name: "Africa Boissons Import", phone: "+224 666 22 22 22", email: null, address: "Matam, Conakry", is_active: true, organization_id: DEMO_ORG_ID, created_at: "2025-01-15T10:00:00Z" },
  { id: "sup-3", name: "CosméPro Afrique", phone: "+224 666 33 33 33", email: "info@cosmepro.com", address: "Dixinn, Conakry", is_active: true, organization_id: DEMO_ORG_ID, created_at: "2025-01-15T10:00:00Z" },
];

const MOCK_CUSTOMERS = [
  { id: "cust-1", name: "Fatou Bamba", phone: "+224 622 11 11 11", total_credit: 50000, organization_id: DEMO_ORG_ID, store_id: DEMO_STORE_ID, is_active: true, created_at: "2025-02-01T10:00:00Z" },
  { id: "cust-2", name: "Ibrahima Soumah", phone: "+224 622 22 22 22", total_credit: 120000, organization_id: DEMO_ORG_ID, store_id: DEMO_STORE_ID, is_active: true, created_at: "2025-02-10T10:00:00Z" },
  { id: "cust-3", name: "Aissatou Diallo", phone: "+224 622 33 33 33", total_credit: 0, organization_id: DEMO_ORG_ID, store_id: DEMO_STORE_ID, is_active: true, created_at: "2025-03-01T10:00:00Z" },
  { id: "cust-4", name: "Moussa Condé", phone: "+224 622 44 44 44", total_credit: 75000, organization_id: DEMO_ORG_ID, store_id: DEMO_STORE_ID, is_active: true, created_at: "2025-03-15T10:00:00Z" },
  { id: "cust-5", name: "Mariama Touré", phone: "+224 622 55 55 55", total_credit: 0, organization_id: DEMO_ORG_ID, store_id: DEMO_STORE_ID, is_active: true, created_at: "2025-04-01T10:00:00Z" },
];

// ─── Demo Data Provider ───────────────────────────────────────

function DemoDataProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const storeId = DEMO_STORE_ID;
    const userId = DEMO_USER_ID;
    const orgId = DEMO_ORG_ID;

    // Dashboard queries
    queryClient.setQueryData(["dashboard-stats", userId, storeId], MOCK_DASHBOARD_STATS);
    queryClient.setQueryData(["dashboard-top-products", userId, storeId], MOCK_TOP_PRODUCTS);
    queryClient.setQueryData(["dashboard-sales-month", userId, storeId], MOCK_SALES_MONTH);
    queryClient.setQueryData(["dashboard-expenses-month", userId, storeId], MOCK_EXPENSES_MONTH);
    queryClient.setQueryData(["dashboard-products", userId, storeId], MOCK_PRODUCTS);
    queryClient.setQueryData(["dashboard-suppliers-count", userId], 3);
    queryClient.setQueryData(["dashboard-recent-sales", userId, orgId, storeId], MOCK_RECENT_SALES);

    // Products
    queryClient.setQueryData(["products", userId], {
      pages: [{ data: MOCK_PRODUCTS, totalCount: MOCK_PRODUCTS.length }],
      pageParams: [0],
    });
    queryClient.setQueryData(["products-stats", userId, storeId], MOCK_PRODUCT_STATS);

    // Categories
    queryClient.setQueryData(["categories", userId, storeId], MOCK_CATEGORIES);
    queryClient.setQueryData(["categories", userId], MOCK_CATEGORIES);

    // Stores
    queryClient.setQueryData(["organization-stores"], [DEMO_STORE]);

    // Suppliers
    queryClient.setQueryData(["suppliers", orgId], MOCK_SUPPLIERS);

    // Customers
    queryClient.setQueryData(["customers", userId, storeId], {
      pages: [{ data: MOCK_CUSTOMERS, totalCount: MOCK_CUSTOMERS.length }],
      pageParams: [0],
    });

    // Subscription
    queryClient.setQueryData(["subscription"], {
      subscription_id: "demo-sub-1",
      plan_id: "croissance",
      plan_name: "Croissance",
      status: "active",
      current_period_end: new Date(Date.now() + 30 * 24 * 3600000).toISOString(),
      trial_ends_at: null,
      grace_period_ends_at: null,
      max_stores: 3,
      max_users: 10,
      max_products: null,
      max_sales_per_month: null,
      has_advanced_reports: true,
      has_exports: true,
      has_supplier_management: true,
      has_offline_advanced: true,
      has_api_access: false,
      has_priority_support: false,
      has_custom_branding: false,
      has_multi_currency: true,
      has_ai_assistant: true,
      has_loyalty_program: false,
    });

    // Plan limits
    queryClient.setQueryData(["plan-limit", "products"], { allowed: true, current_count: 24, limit_value: null, plan_id: "croissance" });
    queryClient.setQueryData(["plan-limit", "users"], { allowed: true, current_count: 2, limit_value: 10, plan_id: "croissance" });
    queryClient.setQueryData(["plan-limit", "stores"], { allowed: true, current_count: 1, limit_value: 3, plan_id: "croissance" });

    // Feature access
    queryClient.setQueryData(["feature-access", "supplier_management"], { allowed: true, plan_id: "croissance" });
    queryClient.setQueryData(["feature-access", "ai_assistant"], { allowed: true, plan_id: "croissance" });
    queryClient.setQueryData(["feature-access", "advanced_reports"], { allowed: true, plan_id: "croissance" });
    queryClient.setQueryData(["feature-access", "exports"], { allowed: true, plan_id: "croissance" });

    // POS Products
    queryClient.setQueryData(
      ["pos-products", userId, orgId, storeId, null, "in-stock", "", 50],
      { pages: [{ data: MOCK_PRODUCTS.filter((p) => p.stock_quantity > 0), totalCount: MOCK_PRODUCTS.filter((p) => p.stock_quantity > 0).length }], pageParams: [0] }
    );

    // Onboarding checklist
    queryClient.setQueryData(["onboarding-checklist"], {
      has_account: true,
      has_store_configured: true,
      has_products: true,
      has_categories: true,
      has_sales: true,
      completion_pct: 100,
    });

    // Set session flag
    sessionStorage.setItem(SESSION_FLAG, "true");
  }, [queryClient]);

  return <>{children}</>;
}

// ─── Demo Banner ──────────────────────────────────────────────

export function DemoBanner() {
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <div className="bg-gradient-to-r from-amber-500/90 via-amber-500 to-orange-500/90 text-white px-4 py-2">
      <div className="container-app flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Sparkles className="h-4 w-4 shrink-0" />
          <span className="hidden sm:inline">
            Mode Démo — Les données sont fictives. Certaines actions (paiement, suppression) sont désactivées.
          </span>
          <span className="sm:hidden">
            Mode Démo — Données fictives
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => navigate("/auth")}
            className="gap-1 text-xs h-7"
          >
            Créer mon compte
            <ExternalLink className="h-3 w-3" />
          </Button>
          <button
            onClick={() => setDismissed(true)}
            className="p-1 hover:bg-white/20 rounded transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Demo Mutation Guard ──────────────────────────────────────

export function useDemoGuard() {
  const { toast } = useToast();

  const guardMutation = useCallback((actionName: string): boolean => {
    toast({
      title: "Action non disponible",
      description: `"${actionName}" est désactivé en mode démo. Créez un compte pour utiliser toutes les fonctionnalités.`,
      variant: "destructive",
      duration: 4000,
    });
    return false;
  }, [toast]);

  return guardMutation;
}

/**
 * Check if we're currently in demo mode.
 */
export function useIsDemo(): boolean {
  try {
    // If DemoAuthProvider is in the tree, useAuth will return our demo data
    // We check by comparing the user email
    const auth = useContext(AuthContext);
    if (auth?.user?.email === "demo@makitiplus.com") return true;
  } catch {
    // Not in any auth context
  }
  return false;
}

// ─── Demo Layout ──────────────────────────────────────────────

export function DemoLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <DemoBanner />
      <div className="flex-1">
        {children}
      </div>
    </div>
  );
}

// ─── Demo Landing Page ────────────────────────────────────────

export function DemoLanding() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30 flex items-center justify-center p-4">
      <Card className="max-w-lg mx-auto text-center">
        <CardContent className="space-y-6 pt-8">
          <div className="mx-auto p-4 rounded-full bg-primary/10 w-fit">
            <Sparkles className="h-10 w-10 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Essayer MakitiPlus</h1>
            <p className="text-muted-foreground mt-2">
              Découvrez toutes les fonctionnalités avec des données
              de démonstration réalistes. Aucun compte requis !
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 text-left text-sm">
            <div className="p-3 rounded-lg bg-muted/50">
              <p className="font-medium">Caisse enregistreuse</p>
              <p className="text-xs text-muted-foreground">Testez le POS avec 24 produits</p>
            </div>
            <div className="p-3 rounded-lg bg-muted/50">
              <p className="font-medium">Gestion de stock</p>
              <p className="text-xs text-muted-foreground">5 catégories, alertes de stock</p>
            </div>
            <div className="p-3 rounded-lg bg-muted/50">
              <p className="font-medium">Rapports & Analytics</p>
              <p className="text-xs text-muted-foreground">Ventes, dépenses, bénéfices</p>
            </div>
            <div className="p-3 rounded-lg bg-muted/50">
              <p className="font-medium">Clients à crédit</p>
              <p className="text-xs text-muted-foreground">Suivi des crédits et paiements</p>
            </div>
          </div>

          <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-950/20 text-left flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
                Données fictives
              </p>
              <p className="text-xs text-amber-600 dark:text-amber-500">
                Toutes les données sont générées pour la démonstration.
                Les actions de paiement et suppression sont désactivées.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <Button
              size="lg"
              className="gap-2 w-full"
              onClick={() => {
                sessionStorage.setItem(SESSION_FLAG, "true");
                navigate("/demo/dashboard", { replace: true });
              }}
            >
              Lancer la démo
              <Sparkles className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              onClick={() => navigate("/auth")}
              className="gap-2"
            >
              Créer un compte réel
              <ExternalLink className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Combined Demo Providers ──────────────────────────────────

export function DemoProviders({ children }: { children: ReactNode }) {
  return (
    <DemoAuthProvider>
      <DemoStoreProvider>
        <DemoDataProvider>
          <DemoLayout>
            {children}
          </DemoLayout>
        </DemoDataProvider>
      </DemoStoreProvider>
    </DemoAuthProvider>
  );
}
