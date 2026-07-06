/**
 * Integration tests for AuthContext — signIn, signUp, signOut, session handling
 *
 * These tests verify that the AuthProvider correctly orchestrates Supabase
 * auth calls and handles edge cases (disabled accounts, failed RPCs, etc.)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ─── Supabase mock ─────────────────────────────────────────
const mockGetSession = vi.fn();
const mockSignInWithPassword = vi.fn();
const mockSignUp = vi.fn();
const mockSignOut = vi.fn();
const mockOnAuthStateChange = vi.fn();
const mockFrom = vi.fn();
const mockRpc = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
      signInWithPassword: (...args: unknown[]) => mockSignInWithPassword(...args),
      signUp: (...args: unknown[]) => mockSignUp(...args),
      signOut: (...args: unknown[]) => mockSignOut(...args),
      onAuthStateChange: (...args: unknown[]) => mockOnAuthStateChange(...args),
    },
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

// ─── Sentry mock (to avoid real error reporting) ──────────
vi.mock("@/lib/sentry", () => ({
  setSentryUserContext: vi.fn(),
  clearSentryUserContext: vi.fn(),
  reportError: vi.fn(),
}));

// ─── Import AFTER mocks ──────────────────────────────────
import { AuthProvider, useAuth } from "@/contexts/AuthContext";

// ─── Test helpers ─────────────────────────────────────────
const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
};

// Chainable Supabase query builder mock
const createChainMock = (resolveWith: { data: unknown; error: unknown | null }) => {
  const resolved = Promise.resolve(resolveWith);
  const chain = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(resolveWith),
    maybeSingle: vi.fn().mockResolvedValue(resolveWith),
    then: vi.fn((onFulfilled?: (value: typeof resolveWith) => unknown, onRejected?: (reason: unknown) => unknown) =>
      resolved.then(onFulfilled, onRejected)
    ),
    catch: vi.fn((onRejected?: (reason: unknown) => unknown) => resolved.catch(onRejected)),
  };
  return chain;
};

beforeEach(() => {
  vi.clearAllMocks();

  // Default: no session on mount
  mockGetSession.mockResolvedValue({ data: { session: null }, error: null });
  mockOnAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
  mockSignOut.mockResolvedValue({ error: null });
});

// ─── Test suites ──────────────────────────────────────────

describe("AuthProvider — initialization", () => {
  it("starts in loading state, then resolves to unauthenticated", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

    // Initially loading
    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.user).toBeNull();
    expect(result.current.session).toBeNull();
    expect(result.current.userRole).toBeNull();
  });

  it("restores existing session on mount", async () => {
    const fakeUser = { id: "user-1", email: "admin@test.com" };
    const fakeSession = { access_token: "token-123", user: fakeUser };

    mockGetSession.mockResolvedValue({ data: { session: fakeSession }, error: null });

    // Mock profile + role fetches
    const chain = createChainMock({ data: { role: "admin" }, error: null });
    const profileChain = createChainMock({
      data: { organization_id: "org-1", business_name: "Test Shop", owner_name: "Test", is_active: true },
      error: null,
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === "user_roles") return chain;
      if (table === "profiles") return profileChain;
      return createChainMock({ data: null, error: null });
    });

    const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.user).toEqual(fakeUser);
    expect(result.current.session).toEqual(fakeSession);
  });

  it("handles getSession error gracefully", async () => {
    mockGetSession.mockResolvedValue({
      data: { session: null },
      error: { message: "Invalid refresh token" },
    });

    const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.user).toBeNull();
    // signOut should have been called to clear stale session
    expect(mockSignOut).toHaveBeenCalled();
  });

  it("handles getSession() throwing (unhandled rejection fix)", async () => {
    mockGetSession.mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Should not crash — loading should be false, user null
    expect(result.current.user).toBeNull();
  });
});

describe("AuthProvider — signIn", () => {
  it("signs in successfully and returns no error", async () => {
    const fakeUser = { id: "user-1", email: "admin@test.com" };

    mockSignInWithPassword.mockResolvedValue({
      data: { user: fakeUser },
      error: null,
    });

    // Mock active profile check
    const profileChain = createChainMock({
      data: { is_active: true },
      error: null,
    });
    mockFrom.mockReturnValue(profileChain);

    // touch_last_login — best-effort
    mockRpc.mockResolvedValue({ data: null, error: null });

    const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.loading).toBe(false));

    let signInResult: { error: Error | null } | undefined;
    await act(async () => {
      signInResult = await result.current.signIn("admin@test.com", "password123");
    });

    expect(signInResult?.error).toBeNull();
    expect(mockSignInWithPassword).toHaveBeenCalledWith({
      email: "admin@test.com",
      password: "password123",
    });
  });

  it("returns error when Supabase auth fails", async () => {
    mockSignInWithPassword.mockResolvedValue({
      data: { user: null },
      error: { message: "Invalid login credentials" },
    });

    const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.loading).toBe(false));

    let signInResult: { error: Error | null } | undefined;
    await act(async () => {
      signInResult = await result.current.signIn("bad@test.com", "wrong");
    });

    expect(signInResult?.error).toBeTruthy();
  });

  it("rejects sign-in for deactivated accounts", async () => {
    const fakeUser = { id: "user-1", email: "deactivated@test.com" };

    mockSignInWithPassword.mockResolvedValue({
      data: { user: fakeUser },
      error: null,
    });

    // Mock deactivated profile
    const profileChain = createChainMock({
      data: { is_active: false },
      error: null,
    });
    mockFrom.mockReturnValue(profileChain);

    const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.loading).toBe(false));

    let signInResult: { error: Error | null } | undefined;
    await act(async () => {
      signInResult = await result.current.signIn("deactivated@test.com", "password123");
    });

    expect(signInResult?.error).toBeTruthy();
    expect(signInResult?.error?.message).toContain("désactivé");
    // Should have signed out the session immediately
    expect(mockSignOut).toHaveBeenCalled();
  });

  it("handles touch_last_login RPC failure gracefully (best-effort)", async () => {
    const fakeUser = { id: "user-1", email: "admin@test.com" };

    mockSignInWithPassword.mockResolvedValue({
      data: { user: fakeUser },
      error: null,
    });

    const profileChain = createChainMock({
      data: { is_active: true },
      error: null,
    });
    mockFrom.mockReturnValue(profileChain);

    // touch_last_login fails — but this should not break sign-in
    mockRpc.mockResolvedValue({ data: null, error: { code: "42501", message: "not allowed" } });

    const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.loading).toBe(false));

    let signInResult: { error: Error | null } | undefined;
    await act(async () => {
      signInResult = await result.current.signIn("admin@test.com", "password123");
    });

    // Sign-in should still succeed despite touch_last_login failing
    expect(signInResult?.error).toBeNull();
  });
});

describe("AuthProvider — signOut", () => {
  it("clears all auth state on signOut", async () => {
    const fakeUser = { id: "user-1", email: "admin@test.com" };
    const fakeSession = { access_token: "token-123", user: fakeUser };

    mockGetSession.mockResolvedValue({ data: { session: fakeSession }, error: null });

    const roleChain = createChainMock({ data: { role: "admin" }, error: null });
    const profileChain = createChainMock({
      data: { organization_id: "org-1", business_name: "Test Shop", owner_name: "Test", is_active: true },
      error: null,
    });
    mockFrom.mockImplementation((table: string) => {
      if (table === "user_roles") return roleChain;
      if (table === "profiles") return profileChain;
      return createChainMock({ data: null, error: null });
    });

    const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

    // Wait for session restore
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.signOut();
    });

    expect(result.current.user).toBeNull();
    expect(result.current.session).toBeNull();
    expect(result.current.userRole).toBeNull();
    expect(result.current.profile).toBeNull();
    expect(mockSignOut).toHaveBeenCalled();
  });
});
