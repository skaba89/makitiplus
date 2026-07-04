/**
 * Integration tests for AuthContext + useQueryErrorGuard
 *
 * These tests verify:
 * - AuthContext provides user/session/role/profile after sign-in
 * - AuthContext clears state on sign-out
 * - AuthContext handles session retrieval errors gracefully
 * - useQueryErrorGuard triggers signOut on JWT expiry + deactivated account
 * - useQueryErrorGuard does NOT sign out on transient RPC errors
 * - AuthContext guards: useAuth throws if used outside provider
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import React from "react";

// ─── Supabase mock ───────────────────────────────────────────────
const mockOnAuthStateChange = vi.fn(() => ({
  data: { subscription: { unsubscribe: vi.fn() } },
}));
const mockGetSession = vi.fn();
const mockSignInWithPassword = vi.fn();
const mockSignUp = vi.fn();
const mockSignOut = vi.fn();
const mockRpc = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      onAuthStateChange: (...args: unknown[]) => mockOnAuthStateChange(...args),
      getSession: () => mockGetSession(),
      signInWithPassword: (...args: unknown[]) => mockSignInWithPassword(...args),
      signUp: (...args: unknown[]) => mockSignUp(...args),
      signOut: (...args: unknown[]) => mockSignOut(...args),
    },
    rpc: (...args: unknown[]) => mockRpc(...args),
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: null, error: null }),
          maybeSingle: () => Promise.resolve({ data: null, error: null }),
        }),
      }),
      insert: () => Promise.resolve({ data: null, error: null }),
    }),
  },
}));

// ─── Sentry mock ─────────────────────────────────────────────────
vi.mock("@/lib/sentry", () => ({
  setSentryUserContext: vi.fn(),
  clearSentryUserContext: vi.fn(),
  reportError: vi.fn(),
}));

// ─── Toast mock ──────────────────────────────────────────────────
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

// ─── Logger mock ─────────────────────────────────────────────────
vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

// ─── Import after mocks ─────────────────────────────────────────
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { useQueryErrorGuard } from "@/hooks/useQueryErrorGuard";

// ─── Test component that reads auth state ────────────────────────
const AuthReader = () => {
  const { user, session, userRole, profile, loading, signOut } = useAuth();
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="user">{user?.email ?? "null"}</span>
      <span data-testid="role">{userRole ?? "null"}</span>
      <span data-testid="profile">{profile?.business_name ?? "null"}</span>
      <span data-testid="session">{session ? "yes" : "null"}</span>
      <button data-testid="signout" onClick={signOut}>Sign Out</button>
    </div>
  );
};

const GuardReader = () => {
  useQueryErrorGuard();
  return <div data-testid="guard-mounted">ok</div>;
};

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <AuthProvider>{children}</AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>
    );
  };
}

// ─── Tests ───────────────────────────────────────────────────────

describe("AuthContext integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    // Default: no existing session
    mockGetSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });
    mockOnAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    });
  });

  it("starts with loading=true, then becomes loading=false when no session exists", async () => {
    render(<AuthReader />, { wrapper: createWrapper() });

    // Initially loading
    expect(screen.getByTestId("loading").textContent).toBe("true");

    await waitFor(() => {
      expect(screen.getByTestId("loading").textContent).toBe("false");
    });
    expect(screen.getByTestId("user").textContent).toBe("null");
    expect(screen.getByTestId("session").textContent).toBe("null");
  });

  it("restores user from existing session on mount", async () => {
    const mockUser = { id: "user-1", email: "admin@test.com" };
    const mockSession = {
      access_token: "tok",
      user: mockUser,
    };
    mockGetSession.mockResolvedValue({
      data: { session: mockSession },
      error: null,
    });

    render(<AuthReader />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByTestId("user").textContent).toBe("admin@test.com");
      expect(screen.getByTestId("session").textContent).toBe("yes");
    });
    expect(screen.getByTestId("loading").textContent).toBe("false");
  });

  it("clears state and sets loading=false when session retrieval fails", async () => {
    mockGetSession.mockResolvedValue({
      data: { session: null },
      error: { message: "Invalid refresh token" },
    });
    mockSignOut.mockResolvedValue({ error: null });

    render(<AuthReader />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByTestId("loading").textContent).toBe("false");
    });
    expect(screen.getByTestId("user").textContent).toBe("null");
    expect(screen.getByTestId("role").textContent).toBe("null");
    // signOut was called to clear stale session
    expect(mockSignOut).toHaveBeenCalled();
  });

  it("signIn returns error when credentials are wrong", async () => {
    mockSignInWithPassword.mockResolvedValue({
      data: { user: null },
      error: { message: "Invalid login credentials" },
    });

    const SignInTester = () => {
      const { signIn } = useAuth();
      const [result, setResult] = React.useState<string>("pending");
      React.useEffect(() => {
        signIn("bad@test.com", "wrongpass").then(({ error }) => {
          setResult(error ? error.message : "ok");
        });
      }, [signIn]);
      return <span data-testid="signin-result">{result}</span>;
    };

    render(<SignInTester />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByTestId("signin-result").textContent).toBe(
        "Invalid login credentials"
      );
    });
  });

  it("signIn returns error when account is deactivated", async () => {
    const mockUser = { id: "deactivated-user", email: "deact@test.com" };
    mockSignInWithPassword.mockResolvedValue({
      data: { user: mockUser, session: { access_token: "tok" } },
      error: null,
    });
    // Profile says is_active = false
    // Need to mock supabase.from().select().eq().maybeSingle()
    const fromMock = vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: null, error: null })),
          maybeSingle: vi.fn(() =>
            Promise.resolve({ data: { is_active: false }, error: null })
          ),
        })),
      })),
      insert: vi.fn(() => Promise.resolve({ data: null, error: null })),
    }));

    // Re-mock supabase for this specific test
    const { supabase } = await import("@/integrations/supabase/client");
    vi.mocked(supabase).from = fromMock as never;
    mockSignOut.mockResolvedValue({ error: null });
    mockRpc.mockResolvedValue({ error: null });

    const SignInTester = () => {
      const { signIn } = useAuth();
      const [result, setResult] = React.useState<string>("pending");
      React.useEffect(() => {
        signIn("deact@test.com", "pass").then(({ error }) => {
          setResult(error ? error.message : "ok");
        });
      }, [signIn]);
      return <span data-testid="signin-result">{result}</span>;
    };

    render(<SignInTester />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByTestId("signin-result").textContent).toContain(
        "désactivé"
      );
    });
    // signOut should have been called to prevent the deactivated user from staying logged in
    expect(mockSignOut).toHaveBeenCalled();
  });

  it("signOut clears all auth state", async () => {
    const mockUser = { id: "user-1", email: "admin@test.com" };
    const mockSession = { access_token: "tok", user: mockUser };
    mockGetSession.mockResolvedValue({
      data: { session: mockSession },
      error: null,
    });
    mockSignOut.mockResolvedValue({ error: null });

    render(<AuthReader />, { wrapper: createWrapper() });

    // Wait for session to load
    await waitFor(() => {
      expect(screen.getByTestId("user").textContent).toBe("admin@test.com");
    });

    // Click sign out
    act(() => {
      screen.getByTestId("signout").click();
    });

    await waitFor(() => {
      expect(screen.getByTestId("user").textContent).toBe("null");
      expect(screen.getByTestId("role").textContent).toBe("null");
      expect(screen.getByTestId("session").textContent).toBe("null");
    });
  });

  it("useAuth throws when used outside AuthProvider", () => {
    // Suppress console.error for this test
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => render(<AuthReader />)).toThrow(
      "useAuth must be used within an AuthProvider"
    );

    spy.mockRestore();
  });
});

describe("useQueryErrorGuard integration", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: "tok", user: { id: "u1", email: "a@b.com" } } },
      error: null,
    });
    mockOnAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    });
    mockSignOut.mockResolvedValue({ error: null });
  });

  function GuardWrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <AuthProvider>{children}</AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>
    );
  }

  it("triggers signOut when JWT expired and account is deactivated", async () => {
    // Mock check_account_status RPC to return is_active = false
    mockRpc.mockResolvedValue({
      data: { is_active: false },
      error: null,
    });

    render(
      <>
        <GuardReader />
        <AuthReader />
      </>,
      { wrapper: GuardWrapper }
    );

    await waitFor(() => {
      expect(screen.getByTestId("loading").textContent).toBe("false");
    });

    // Inject a query with error directly into the cache to trigger the subscriber
    act(() => {
      const cache = queryClient.getQueryCache();
      // Use fetchQuery to create a query entry, then set its error state
      const queryKey = ["test-jwt-deactivated"];
      // Create the query by setting data first, then override with error
      queryClient.setQueryDefaults(queryKey, { retry: false });
      // Fetch to register the query in the cache
      queryClient.fetchQuery({
        queryKey,
        queryFn: () => Promise.reject(new Error("jwt expired")),
      }).catch(() => {});
    });

    // The fetch will fail, and the cache subscriber should pick up the error
    await waitFor(() => {
      expect(mockRpc).toHaveBeenCalledWith("check_account_status");
    }, { timeout: 5000 });

    // After RPC confirms account deactivated, signOut should be called
    await waitFor(() => {
      expect(mockSignOut).toHaveBeenCalled();
    }, { timeout: 5000 });
  });

  it("does NOT sign out when check_account_status RPC fails", async () => {
    // Mock RPC to return an error (e.g., network issue)
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: "Network error", code: "503" },
    });

    render(
      <>
        <GuardReader />
        <AuthReader />
      </>,
      { wrapper: GuardWrapper }
    );

    await waitFor(() => {
      expect(screen.getByTestId("loading").textContent).toBe("false");
    });

    // Inject JWT expired error via fetchQuery
    act(() => {
      queryClient.fetchQuery({
        queryKey: ["test-guard-rpc"],
        queryFn: () => Promise.reject(new Error("jwt expired")),
      }).catch(() => {});
    });

    await waitFor(() => {
      expect(mockRpc).toHaveBeenCalledWith("check_account_status");
    }, { timeout: 5000 });

    // signOut should NOT be called because RPC returned an error
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it("does NOT sign out when account is still active", async () => {
    // Mock RPC to return is_active = true
    mockRpc.mockResolvedValue({
      data: { is_active: true },
      error: null,
    });

    render(
      <>
        <GuardReader />
        <AuthReader />
      </>,
      { wrapper: GuardWrapper }
    );

    await waitFor(() => {
      expect(screen.getByTestId("loading").textContent).toBe("false");
    });

    // Inject invalid jwt error via fetchQuery
    act(() => {
      queryClient.fetchQuery({
        queryKey: ["test-guard-active"],
        queryFn: () => Promise.reject(new Error("invalid jwt")),
      }).catch(() => {});
    });

    await waitFor(() => {
      expect(mockRpc).toHaveBeenCalledWith("check_account_status");
    }, { timeout: 5000 });

    // signOut should NOT be called because account is still active
    expect(mockSignOut).not.toHaveBeenCalled();
  });
});
