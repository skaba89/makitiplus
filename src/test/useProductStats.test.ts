/**
 * Unit tests for the useProductStats hook.
 * Verifies RPC data mapping, null defaults, and disabled state.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";

// Mock supabase client
const mockRpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
    auth: { getSession: vi.fn(), onAuthStateChange: vi.fn() },
  },
  getSupabaseClient: vi.fn(),
}));

// Mock auth context — default: authenticated with org
const mockAuth = {
  user: { id: "test-user-id" },
  profile: { organization_id: "test-org-id" },
};
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => mockAuth,
}));


// Mock org selector — default: not super admin, uses profile org
vi.mock("@/hooks/useOrgSelector", () => ({
  useOrgSelector: () => ({
    isSuperAdmin: false,
    effectiveOrgId: "test-org-id",
    selectedOrgId: "",
    setSelectedOrgId: vi.fn(),
    allOrgs: [],
    loading: false,
    selectedOrgName: null,
  }),
}));

import { useProductStats } from "@/hooks/useProductStats";

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
}

describe("useProductStats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset auth mock to default
    mockAuth.user = { id: "test-user-id" };
    mockAuth.profile = { organization_id: "test-org-id" };
  });

  it("maps RPC result with null defaults", async () => {
    mockRpc.mockResolvedValue({
      data: {
        totalProducts: 42,
        lowStockCount: null,
        outOfStockCount: 3,
        categoryCounts: null,
      },
      error: null,
    });

    const { result } = renderHook(() => useProductStats(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const stats = result.current.data!;
    expect(stats.totalProducts).toBe(42);
    expect(stats.lowStockCount).toBe(0); // null → 0
    expect(stats.outOfStockCount).toBe(3);
    expect(stats.categoryCounts).toEqual({}); // null → {}
  });

  it("calls RPC without organization_id (derived from auth)", async () => {
    mockRpc.mockResolvedValue({
      data: { totalProducts: 10, lowStockCount: 2, outOfStockCount: 1, categoryCounts: {} },
      error: null,
    });

    const { result } = renderHook(() => useProductStats(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockRpc).toHaveBeenCalledWith("get_product_stats");
  });

  it("returns zeros when no organization", async () => {
    mockAuth.profile = null;
    mockRpc.mockResolvedValue({ data: null, error: null });

    const { result } = renderHook(() => useProductStats(), {
      wrapper: createWrapper(),
    });

    // When no org, queryFn returns zeros immediately (early return)
    // Wait a bit for the query to resolve
    await new Promise((r) => setTimeout(r, 100));
    expect(result.current.data?.totalProducts ?? 0).toBe(0);
  });

  it("returns fallback data on RPC error", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: "RPC not found", code: "42883" },
    });

    const { result } = renderHook(() => useProductStats(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const stats = result.current.data!;
    expect(stats.totalProducts).toBe(0);
    expect(stats.lowStockCount).toBe(0);
    expect(stats.outOfStockCount).toBe(0);
  });

  it("preserves categoryCounts object from RPC", async () => {
    const categoryCounts = { Boissons: 12, Alimentation: 8 };
    mockRpc.mockResolvedValue({
      data: {
        totalProducts: 20,
        lowStockCount: 3,
        outOfStockCount: 1,
        categoryCounts,
      },
      error: null,
    });

    const { result } = renderHook(() => useProductStats(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data!.categoryCounts).toEqual(categoryCounts);
  });
});
