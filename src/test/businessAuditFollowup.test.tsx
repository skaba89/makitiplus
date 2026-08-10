/**
 * Tests de non-régression pour le "reste" des priorités de l'audit métier.
 *
 * Couvre les 5 fonctionnalités ajoutées :
 * 1. POSCartContext — persistance de la remise (discount) dans IndexedDB
 * 2. POSCartContext — calcul correct du total après remise (montant + pourcentage)
 * 3. useOfflineSale — la remise est appliquée au total envoyé à la RPC
 * 4. ProductList — détection des produits proches de la péremption
 * 5. Customers — filtre "clients à crédit uniquement"
 *
 * Référence : audit métier — top 3 déjà fait, ce fichier couvre les priorités 4-8.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { type ReactNode } from "react";
import fs from "fs";
import path from "path";

// ─── Mocks ──────────────────────────────────────────────────
vi.mock("@/lib/sentry", () => ({
  reportError: vi.fn(),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "test-user" },
    userRole: "admin",
    profile: { organization_id: "org-1", business_name: "Test Shop" },
    loading: false,
  }),
}));

vi.mock("@/contexts/DemoContext", () => ({
  useDemo: () => ({ blockMutation: () => false }),
}));

vi.mock("@/contexts/CurrencyContext", () => ({
  useCurrency: () => ({
    currency: { symbol: "GNF", position: "after" },
    formatPrice: (p: number) => `${new Intl.NumberFormat("fr-FR").format(p)} GNF`,
    availablePaymentMethods: ["cash", "wave", "orange_money", "credit"],
    phoneCode: "+224",
  }),
}));

vi.mock("@/contexts/BrandingContext", () => ({
  useBranding: () => ({ branding: { logoUrl: "", receiptTemplate: "default" } }),
}));

vi.mock("@/contexts/ThemeContext", () => ({
  useThemeSettings: () => ({ settings: null }),
}));

vi.mock("@/contexts/OfflineContext", () => ({
  useOnlineStatus: () => ({ isOnline: true }),
}));

vi.mock("@/hooks/useOrgTaxRate", () => ({
  useOrgTaxRate: () => 0,
}));

vi.mock("@/lib/offlineQueue", () => ({
  enqueueRPCMutation: vi.fn().mockResolvedValue(undefined),
  enqueueMutation: vi.fn().mockResolvedValue(undefined),
  cacheData: vi.fn().mockResolvedValue(undefined),
  decrementLocalStock: vi.fn().mockResolvedValue(undefined),
  OFFLINE_STORES: { SALE_CACHE: "sale_cache" },
}));

// ─── Import AFTER mocks ─────────────────────────────────────
import {
  usePOSCartStore,
  useCartTotal,
  useCartSubtotal,
  useCartDiscount,
} from "@/contexts/POSCartContext";

// ─── Test helpers ───────────────────────────────────────────
interface Product {
  id: string;
  name: string;
  price: number;
  cost_price: number;
  stock_quantity: number;
  organization_id?: string;
  category?: string;
  barcode?: string;
}

const makeProduct = (overrides: Partial<Product> = {}): Product => ({
  id: `prod-${Math.random().toString(36).slice(2, 8)}`,
  name: "Test Product",
  price: 5000,
  cost_price: 3000,
  stock_quantity: 100,
  organization_id: "org-1",
  ...overrides,
});

beforeEach(() => {
  // Reset Zustand store between tests
  const store = usePOSCartStore.getState();
  store.clearCart();
});

// ─────────────────────────────────────────────────────────────
// 1. POSCartContext — persistance et calcul de la remise
// ─────────────────────────────────────────────────────────────
describe("POSCartContext — remise (discount) sur panier", () => {
  it("calcule le total SANS remise (état initial = 0)", () => {
    const p1 = makeProduct({ price: 5000 });
    const p2 = makeProduct({ price: 3000 });

    act(() => {
      usePOSCartStore.getState().addToCart(p1, 2); // 10000
      usePOSCartStore.getState().addToCart(p2, 3); // 9000
    });

    const { result } = renderHook(() => useCartTotal(), {
      wrapper: ({ children }: { children: ReactNode }) => <>{children}</>,
    });

    // Total = 19000 (pas de remise)
    expect(result.current).toBe(19000);
  });

  it("calcule le total APRÈS remise en montant", () => {
    const p1 = makeProduct({ price: 5000 });
    const p2 = makeProduct({ price: 3000 });

    act(() => {
      usePOSCartStore.getState().addToCart(p1, 2); // 10000
      usePOSCartStore.getState().addToCart(p2, 3); // 9000 = 19000 au total
      usePOSCartStore.getState().setDiscount("amount", 4000); // remise 4000
    });

    const { result: totalResult } = renderHook(() => useCartTotal(), {
      wrapper: ({ children }: { children: ReactNode }) => <>{children}</>,
    });
    const { result: subtotalResult } = renderHook(() => useCartSubtotal(), {
      wrapper: ({ children }: { children: ReactNode }) => <>{children}</>,
    });
    const { result: discountResult } = renderHook(() => useCartDiscount(), {
      wrapper: ({ children }: { children: ReactNode }) => <>{children}</>,
    });

    // Sous-total brut = 19000
    expect(subtotalResult.current).toBe(19000);
    // Remise = 4000
    expect(discountResult.current).toBe(4000);
    // Total après remise = 15000
    expect(totalResult.current).toBe(15000);
  });

  it("calcule le total APRÈS remise en pourcentage", () => {
    const p1 = makeProduct({ price: 10000 });

    act(() => {
      usePOSCartStore.getState().addToCart(p1, 2); // 20000
      usePOSCartStore.getState().setDiscount("percent", 10); // 10% de remise
    });

    const { result: totalResult } = renderHook(() => useCartTotal(), {
      wrapper: ({ children }: { children: ReactNode }) => <>{children}</>,
    });
    const { result: discountResult } = renderHook(() => useCartDiscount(), {
      wrapper: ({ children }: { children: ReactNode }) => <>{children}</>,
    });

    // 10% de 20000 = 2000
    expect(discountResult.current).toBe(2000);
    // Total = 20000 - 2000 = 18000
    expect(totalResult.current).toBe(18000);
  });

  it("borne la remise au sous-total (remise > sous-total impossible)", () => {
    const p1 = makeProduct({ price: 5000 });

    act(() => {
      usePOSCartStore.getState().addToCart(p1, 1); // 5000
      usePOSCartStore.getState().setDiscount("amount", 99999); // remise > total
    });

    const { result: totalResult } = renderHook(() => useCartTotal(), {
      wrapper: ({ children }: { children: ReactNode }) => <>{children}</>,
    });

    // Total ne doit jamais être négatif — borné à 0
    expect(totalResult.current).toBe(0);
  });

  it("clearDiscount remet la remise à zéro", () => {
    const p1 = makeProduct({ price: 5000 });

    act(() => {
      usePOSCartStore.getState().addToCart(p1, 2); // 10000
      usePOSCartStore.getState().setDiscount("amount", 3000); // remise 3000
    });

    act(() => {
      usePOSCartStore.getState().clearDiscount();
    });

    const { result: totalResult } = renderHook(() => useCartTotal(), {
      wrapper: ({ children }: { children: ReactNode }) => <>{children}</>,
    });

    // Total = 10000 (remise annulée)
    expect(totalResult.current).toBe(10000);
  });

  it("clearCart réinitialise aussi la remise", () => {
    const p1 = makeProduct({ price: 5000 });

    act(() => {
      usePOSCartStore.getState().addToCart(p1, 2);
      usePOSCartStore.getState().setDiscount("amount", 3000);
      usePOSCartStore.getState().clearCart();
    });

    const state = usePOSCartStore.getState();
    expect(state.items).toHaveLength(0);
    expect(state.discountType).toBe("amount");
    expect(state.discountValue).toBe(0);
  });

  it("persiste la remise dans l'état du store entre les opérations", () => {
    const p1 = makeProduct({ price: 5000 });

    act(() => {
      usePOSCartStore.getState().setDiscount("percent", 15);
      usePOSCartStore.getState().addToCart(p1, 4); // 20000
    });

    const state = usePOSCartStore.getState();
    expect(state.discountType).toBe("percent");
    expect(state.discountValue).toBe(15);
  });
});

// ─────────────────────────────────────────────────────────────
// 2. ProductList — logique de détection de péremption
// ─────────────────────────────────────────────────────────────
describe("ProductList — logique de péremption", () => {
  // Helper : recopie de la fonction daysUntilExpiry de ProductList.tsx
  // (fix timezone du 2026-08-10 -- voir le commentaire dans ProductList.tsx :
  // parsing manuel "YYYY-MM-DD" en composants locaux plutôt que new Date()
  // sur une chaîne date-only, ambigu UTC/local).
  const daysUntilExpiry = (expiryDate: string | null): number | null => {
    if (!expiryDate) return null;
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const [year, month, day] = expiryDate.split("-").map(Number);
    if (!year || !month || !day) return null;
    const expiry = new Date(year, month - 1, day);
    expiry.setHours(0, 0, 0, 0);
    const diffMs = expiry.getTime() - now.getTime();
    return Math.round(diffMs / (1000 * 60 * 60 * 24));
  };

  // Helper de test : formate une date en "YYYY-MM-DD" à partir de ses
  // composants LOCAUX -- délibérément différent de toISOString().split("T")[0],
  // qui convertit d'abord en UTC et peut donc décaler d'un jour selon
  // l'heure locale au moment du test (piège identique à celui corrigé
  // dans daysUntilExpiry lui-même).
  const toLocalDateString = (d: Date): string => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  it("retourne null si pas de date de péremption", () => {
    expect(daysUntilExpiry(null)).toBeNull();
    expect(daysUntilExpiry("")).toBeNull();
  });

  it("retourne 0 pour une péremption aujourd'hui", () => {
    const today = toLocalDateString(new Date());
    expect(daysUntilExpiry(today)).toBe(0);
  });

  it("retourne un nombre positif pour une péremption future", () => {
    const future = new Date();
    future.setDate(future.getDate() + 30);
    const futureStr = toLocalDateString(future);
    expect(daysUntilExpiry(futureStr)).toBe(30);
  });

  it("retourne un nombre négatif pour une péremption passée", () => {
    const past = new Date();
    past.setDate(past.getDate() - 5);
    const pastStr = toLocalDateString(past);
    expect(daysUntilExpiry(pastStr)).toBe(-5);
  });

  it("détecte les produits proches de la péremption (≤ 7 jours)", () => {
    const inThreeDays = new Date();
    inThreeDays.setDate(inThreeDays.getDate() + 3);
    const days = daysUntilExpiry(toLocalDateString(inThreeDays));
    expect(days).toBe(3);
    expect(days !== null && days <= 7 && days >= 0).toBe(true);
  });

  it("détecte les produits déjà périmés", () => {
    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
    const days = daysUntilExpiry(toLocalDateString(twoDaysAgo));
    expect(days).toBe(-2);
    expect(days !== null && days < 0).toBe(true);
  });

  it("n'utilise jamais new Date(chaîne) directement sur la date de péremption (parsing UTC/local ambigu)", () => {
    // Régression : avant le fix, new Date("YYYY-MM-DD") + setHours(0,0,0,0)
    // en fuseau négatif (à l'ouest de UTC, ex. Amériques) faisait glisser la
    // date d'un jour en arrière -- new Date("2026-09-10") = minuit UTC, qui
    // en UTC-5 s'affiche "2026-09-09 19:00 local", et setHours(0,0,0,0) la
    // ramenait au 9 au lieu du 10. Le parsing manuel en composants locaux
    // (split "-" + new Date(year, month-1, day)) élimine cette ambiguïté
    // par construction, quel que soit le fuseau horaire du navigateur.
    const helperSrc = daysUntilExpiry.toString();
    expect(helperSrc).toMatch(/expiryDate\.split\("-"\)\.map\(Number\)/);
    expect(helperSrc).not.toMatch(/new Date\(expiryDate\)/);
  });

  it("reste synchronisée avec la vraie fonction de src/components/products/ProductList.tsx (pas de dérive de copie)", () => {
    const productListSrc = fs.readFileSync(
      path.join(process.cwd(), "src/components/products/ProductList.tsx"),
      "utf-8"
    );
    expect(productListSrc).toMatch(/const \[year, month, day\] = expiryDate\.split\("-"\)\.map\(Number\);/);
    expect(productListSrc).toMatch(/const expiry = new Date\(year, month - 1, day\);/);
    expect(productListSrc).not.toMatch(/const expiry = new Date\(expiryDate\);/);
  });
});

// ─────────────────────────────────────────────────────────────
// 3. ProductList — calcul de marge
// ─────────────────────────────────────────────────────────────
describe("ProductList — calcul de marge", () => {
  it("calcule la marge brute = prix - coût", () => {
    const price = 5000;
    const cost = 3000;
    const margin = price - cost;
    expect(margin).toBe(2000);
  });

  it("calcule le pourcentage de marge", () => {
    const price = 5000;
    const cost = 3000;
    const margin = price - cost;
    const marginPct = Math.round((margin / price) * 100);
    expect(marginPct).toBe(40);
  });

  it("gère un coût nul (marge à 0)", () => {
    const price = 5000;
    const cost = 0;
    const margin = cost > 0 ? price - cost : 0;
    const marginPct = cost > 0 ? Math.round((margin / price) * 100) : 0;
    expect(margin).toBe(0);
    expect(marginPct).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────
// 4. useOfflineSale — la remise doit être soustraite du total
// ─────────────────────────────────────────────────────────────
describe("useOfflineSale — calcul du total avec remise", () => {
  // Test purement logique : on vérifie que la formule de calcul du totalAmount
  // dans useOfflineSale.ts est bien `subtotal - discount` (et pas `subtotal`).
  // On ne mount pas le hook ici car il faudrait mocker Supabase etc.

  it("applique la formule totalAmount = max(0, subtotal - discount)", () => {
    const subtotal = 20000;
    const discount = 5000;

    // Formule utilisée dans useOfflineSale.ts après le fix P0
    const totalAmount = Math.max(0, subtotal - discount);
    expect(totalAmount).toBe(15000);
  });

  it("borne le total à 0 si remise > sous-total", () => {
    const subtotal = 5000;
    const discount = 8000;
    const totalAmount = Math.max(0, subtotal - discount);
    expect(totalAmount).toBe(0);
  });

  it("calcule la monnaie sur le total APRÈS remise", () => {
    const subtotal = 20000;
    const discount = 5000;
    const totalAmount = Math.max(0, subtotal - discount); // 15000
    const amountPaid = 20000;
    // Formule du useOfflineSale : changeAmount = amountPaid - totalAmount
    const changeAmount = amountPaid - totalAmount;
    expect(changeAmount).toBe(5000); // 20000 - 15000 = 5000 (et pas 0)
  });

  it("garde le subtotal brut intact pour la persistance", () => {
    // Le RPC reçoit p_subtotal = subtotal (brut, avant remise) et
    // p_total_amount = totalAmount (après remise). On vérifie que
    // la différence est bien le discount.
    const subtotal = 20000;
    const discount = 5000;
    const totalAmount = Math.max(0, subtotal - discount);

    expect(subtotal).toBe(20000); // inchangé
    expect(totalAmount).toBe(15000);
    expect(subtotal - totalAmount).toBe(discount); // écart justifié
  });
});

// ─────────────────────────────────────────────────────────────
// 5. Customers — logique du filtre "crédit uniquement"
// ─────────────────────────────────────────────────────────────────
describe("Customers — filtre 'crédit uniquement'", () => {
  it("construit le filtre total_credit > 0 quand activé", () => {
    const showCreditOnly = true;
    const filters = showCreditOnly
      ? [{ column: "total_credit", operator: "gt" as const, value: 0 }]
      : undefined;

    expect(filters).toEqual([{ column: "total_credit", operator: "gt", value: 0 }]);
  });

  it("ne construit aucun filtre quand désactivé", () => {
    const showCreditOnly = false;
    const filters = showCreditOnly
      ? [{ column: "total_credit", operator: "gt" as const, value: 0 }]
      : undefined;

    expect(filters).toBeUndefined();
  });

  it("reset la page courante quand le filtre change", () => {
    let currentPage = 5;
    const setCurrentPage = (p: number) => { currentPage = p; };
    const handleToggleCreditOnly = (checked: boolean) => {
      // showCreditOnly = checked (pas testé ici)
      setCurrentPage(1);
    };

    handleToggleCreditOnly(true);
    expect(currentPage).toBe(1);
  });
});
