/**
 * Integration test for useQueryErrorGuard — verifies the JWT expiration
 * → account status check → auto sign-out flow
 *
 * This tests the fix for the unhandled promise rejection that was
 * previously present in this hook.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";

// ─── Supabase mock ─────────────────────────────────────────
const mockRpc = vi.fn();
const mockSignOut = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

// ─── Auth context mock ─────────────────────────────────────
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "test-user-id", email: "test@test.com" },
    signOut: (...args: unknown[]) => mockSignOut(...args),
  }),
}));

// ─── Other mocks ───────────────────────────────────────────
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock("@/lib/sentry", () => ({
  reportError: vi.fn(),
}));

// ─── Import AFTER mocks ──────────────────────────────────
import { useQueryErrorGuard } from "@/hooks/useQueryErrorGuard";

// ─── Test helpers ─────────────────────────────────────────
const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>{children}</BrowserRouter>
    </QueryClientProvider>
  );
};

beforeEach(() => {
  vi.clearAllMocks();
  mockSignOut.mockResolvedValue(undefined);
});

// ─── Test suites ──────────────────────────────────────────

describe("useQueryErrorGuard — JWT expiration handling", () => {
  it("does nothing when there are no query errors", () => {
    const { result } = renderHook(() => useQueryErrorGuard(), {
      wrapper: createWrapper(),
    });

    // Hook should render without errors
    expect(result.error).toBeUndefined();
  });

  it("does not sign out when account is still active", async () => {
    mockRpc.mockResolvedValue({
      data: { is_active: true },
      error: null,
    });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });

    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>{children}</BrowserRouter>
      </QueryClientProvider>
    );

    renderHook(() => useQueryErrorGuard(), { wrapper });

    // Simulate a query error with JWT expired message
    queryClient.getQueryCache().notify({
      type: "updated",
      query: {
        state: {
          error: { message: "jwt expired", code: "PGRST301" },
        },
      } as any,
    });

    // Give time for async handlers
    await new Promise((r) => setTimeout(r, 100));

    // check_account_status should have been called
    expect(mockRpc).toHaveBeenCalledWith("check_account_status");

    // But sign out should NOT be called (account is active)
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it("signs out when account is deactivated", async () => {
    mockRpc.mockResolvedValue({
      data: { is_active: false },
      error: null,
    });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });

    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>{children}</BrowserRouter>
      </QueryClientProvider>
    );

    renderHook(() => useQueryErrorGuard(), { wrapper });

    // Simulate a query error with "invalid jwt"
    queryClient.getQueryCache().notify({
      type: "updated",
      query: {
        state: {
          error: { message: "invalid jwt token", code: "" },
        },
      } as any,
    });

    // Wait for the async flow: check_account_status → signOut
    await waitFor(() => {
      expect(mockRpc).toHaveBeenCalledWith("check_account_status");
    }, { timeout: 2000 });

    await waitFor(() => {
      expect(mockSignOut).toHaveBeenCalled();
    }, { timeout: 2000 });
  });

  it("does not sign out when check_account_status RPC fails (network error)", async () => {
    // RPC throws — this is the case our .catch() fix handles
    mockRpc.mockRejectedValue(new Error("Network error"));

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });

    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>{children}</BrowserRouter>
      </QueryClientProvider>
    );

    renderHook(() => useQueryErrorGuard(), { wrapper });

    // Simulate a query error with JWT message
    queryClient.getQueryCache().notify({
      type: "updated",
      query: {
        state: {
          error: { message: "jwt expired", code: "" },
        },
      } as any,
    });

    // Give time for async handlers
    await new Promise((r) => setTimeout(r, 200));

    // signOut should NOT be called on network error
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it("does not sign out when RPC returns an error (GRANT missing, etc.)", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: "42501", message: "permission denied" },
    });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });

    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>{children}</BrowserRouter>
      </QueryClientProvider>
    );

    renderHook(() => useQueryErrorGuard(), { wrapper });

    // Simulate query error with "user not found"
    queryClient.getQueryCache().notify({
      type: "updated",
      query: {
        state: {
          error: { message: "user not found", code: "" },
        },
      } as any,
    });

    await new Promise((r) => setTimeout(r, 200));

    // signOut should NOT be called when RPC itself returns error
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it("ignores non-JWT query errors", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });

    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>{children}</BrowserRouter>
      </QueryClientProvider>
    );

    renderHook(() => useQueryErrorGuard(), { wrapper });

    // Simulate a generic query error (not JWT-related)
    queryClient.getQueryCache().notify({
      type: "updated",
      query: {
        state: {
          error: { message: "Network request failed", code: "FETCH_ERROR" },
        },
      } as any,
    });

    await new Promise((r) => setTimeout(r, 100));

    // RPC should NOT be called for non-JWT errors
    expect(mockRpc).not.toHaveBeenCalled();
  });
});
