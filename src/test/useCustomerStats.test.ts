/**
 * Unit tests for the useCustomerStats hook.
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

import { useCustomerStats } from "@/hooks/useCustomerStats";

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
}

describe("useCustomerStats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.user = { id: "test-user-id" };
    mockAuth.profile = { organization_id: "test-org-id" };
  });

  it("maps RPC result with null defaults", async () => {
    mockRpc.mockResolvedValue({
      data: {
        totalCustomers: 150,
        totalCredit: null,
        customersWithCredit: 12,
      },
      error: null,
    });

    const { result } = renderHook(() => useCustomerStats(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const stats = result.current.data!;
    expect(stats.totalCustomers).toBe(150);
    expect(stats.totalCredit).toBe(0); // null → 0
    expect(stats.customersWithCredit).toBe(12);
  });

  it("passes organization_id to RPC", async () => {
    mockRpc.mockResolvedValue({
      data: { totalCustomers: 50, totalCredit: 25000, customersWithCredit: 5 },
      error: null,
    });

    const { result } = renderHook(() => useCustomerStats(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockRpc).toHaveBeenCalledWith("get_customer_stats", {
      p_organization_id: "test-org-id",
    });
  });

  it("does not call RPC when no organization", async () => {
    mockAuth.profile = null;

    const { result } = renderHook(() => useCustomerStats(), {
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

    const { result } = renderHook(() => useCustomerStats(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
