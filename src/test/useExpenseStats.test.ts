/**
 * Unit tests for the useExpenseStats hook.
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

import { useExpenseStats } from "@/hooks/useExpenseStats";

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
}

describe("useExpenseStats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.user = { id: "test-user-id" };
    mockAuth.profile = { organization_id: "test-org-id" };
  });

  it("maps RPC result with null defaults", async () => {
    mockRpc.mockResolvedValue({
      data: {
        monthTotal: 350000,
        monthCount: null,
      },
      error: null,
    });

    const { result } = renderHook(() => useExpenseStats(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const stats = result.current.data!;
    expect(stats.monthTotal).toBe(350000);
    expect(stats.monthCount).toBe(0); // null → 0
  });

  it("passes organization_id to RPC", async () => {
    mockRpc.mockResolvedValue({
      data: { monthTotal: 100000, monthCount: 8 },
      error: null,
    });

    const { result } = renderHook(() => useExpenseStats(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockRpc).toHaveBeenCalledWith("get_expense_stats", {
      p_organization_id: "test-org-id",
    });
  });

  it("does not call RPC when no organization", async () => {
    mockAuth.profile = null;

    const { result } = renderHook(() => useExpenseStats(), {
      wrapper: createWrapper(),
    });

    expect(result.current.data).toBeUndefined();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("propagates RPC errors", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: "connection refused" },
    });

    const { result } = renderHook(() => useExpenseStats(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it("handles zero values correctly (not confused with null)", async () => {
    mockRpc.mockResolvedValue({
      data: { monthTotal: 0, monthCount: 0 },
      error: null,
    });

    const { result } = renderHook(() => useExpenseStats(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const stats = result.current.data!;
    expect(stats.monthTotal).toBe(0);
    expect(stats.monthCount).toBe(0);
    // Verify these are actually 0, not undefined or null
    expect(stats.monthTotal).not.toBeNull();
    expect(stats.monthCount).not.toBeNull();
  });
});
