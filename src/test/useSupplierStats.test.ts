/**
 * Unit tests for the useSupplierStats hook.
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

// Mock auth context
const mockAuth = {
  user: { id: "test-user-id" },
  profile: { organization_id: "test-org-id" },
};
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => mockAuth,
}));

import { useSupplierStats } from "@/hooks/useSupplierStats";

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
}

describe("useSupplierStats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.user = { id: "test-user-id" };
    mockAuth.profile = { organization_id: "test-org-id" };
  });

  it("maps RPC result with null defaults", async () => {
    mockRpc.mockResolvedValue({
      data: {
        totalSuppliers: 15,
        activeSuppliers: null,
        totalProducts: 48,
        totalSupplyValue: null,
      },
      error: null,
    });

    const { result } = renderHook(() => useSupplierStats(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const stats = result.current.data!;
    expect(stats.totalSuppliers).toBe(15);
    expect(stats.activeSuppliers).toBe(0); // null → 0
    expect(stats.totalProducts).toBe(48);
    expect(stats.totalSupplyValue).toBe(0); // null → 0
  });

  it("calls RPC without organization_id (derived from auth)", async () => {
    mockRpc.mockResolvedValue({
      data: { totalSuppliers: 5, activeSuppliers: 4, totalProducts: 20, totalSupplyValue: 1500000 },
      error: null,
    });

    const { result } = renderHook(() => useSupplierStats(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockRpc).toHaveBeenCalledWith("get_supplier_stats");
  });

  it("does not call RPC when no organization", async () => {
    mockAuth.profile = null;

    const { result } = renderHook(() => useSupplierStats(), {
      wrapper: createWrapper(),
    });

    expect(result.current.data).toBeUndefined();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("propagates RPC errors", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: "function not found" },
    });

    const { result } = renderHook(() => useSupplierStats(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it("handles zero values correctly (not confused with null)", async () => {
    mockRpc.mockResolvedValue({
      data: { totalSuppliers: 0, activeSuppliers: 0, totalProducts: 0, totalSupplyValue: 0 },
      error: null,
    });

    const { result } = renderHook(() => useSupplierStats(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const stats = result.current.data!;
    expect(stats.totalSuppliers).toBe(0);
    expect(stats.activeSuppliers).toBe(0);
    expect(stats.totalProducts).toBe(0);
    expect(stats.totalSupplyValue).toBe(0);
  });
});
