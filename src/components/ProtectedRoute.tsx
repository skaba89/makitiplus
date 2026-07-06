import { ReactNode, useEffect } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";
import { Database } from "@/integrations/supabase/types";
import { useAccountStatusGuard } from "@/hooks/useAccountStatusGuard";
import { useQueryErrorGuard } from "@/hooks/useQueryErrorGuard";


type AppRole = Database["public"]["Enums"]["app_role"];

interface ProtectedRouteProps {
  children: ReactNode;
  allowedRoles?: AppRole[];
}

const AUTH_STORAGE_PREFIXES = [
  "sb-",
  "supabase.auth.token",
  "makitiplus_auth",
  "malikiplus_auth",
];

export const clearAuthStorage = () => {
  const clearFrom = (storage: Storage) => {
    for (let index = storage.length - 1; index >= 0; index -= 1) {
      const key = storage.key(index);
      if (!key) continue;

      const normalizedKey = key.toLowerCase();
      const isAuthKey = AUTH_STORAGE_PREFIXES.some((prefix) =>
        normalizedKey.startsWith(prefix.toLowerCase())
      );

      if (isAuthKey || normalizedKey.includes("supabase") && normalizedKey.includes("auth")) {
        storage.removeItem(key);
      }
    }
  };

  try {
    clearFrom(window.localStorage);
    clearFrom(window.sessionStorage);
  } catch {
    // Best-effort cleanup only. Never break protected-route rendering.
  }
};

const SessionGuards = ({ children }: { children: ReactNode }) => {
  useAccountStatusGuard();
  useQueryErrorGuard();
  return <>{children}</>;
};

const IncompleteSessionRedirect = () => {
  const { signOut } = useAuth();

  useEffect(() => {
    clearAuthStorage();
    signOut().finally(() => {
      window.location.replace("/auth");
    });
  }, [signOut]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <div className="w-16 h-16 rounded-2xl bg-hero-gradient flex items-center justify-center">
          <span className="text-3xl font-bold text-primary-foreground">M</span>
        </div>
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-muted-foreground">Redirection vers la connexion...</p>
      </div>
    </div>
  );
};

export const ProtectedRoute = ({ children, allowedRoles }: ProtectedRouteProps) => {
  const { user, userRole, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-hero-gradient flex items-center justify-center">
            <span className="text-3xl font-bold text-primary-foreground">M</span>
          </div>
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Chargement...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    clearAuthStorage();
    return <Navigate to="/auth" replace />;
  }

  // SECURITY: When loading is done but userRole is null, the session is incomplete.
  // Do not keep the user blocked on /dashboard. Clear only auth-related storage,
  // sign out, then redirect to /auth so email/password are requested again.
  if (userRole === null) {
    return <IncompleteSessionRedirect />;
  }

  if (allowedRoles && !allowedRoles.includes(userRole)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <SessionGuards>{children}</SessionGuards>;
};
