import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";
import { Database } from "@integrations/supabase/types";
import { useAccountStatusGuard } from "@/hooks/useAccountStatusGuard";
import { useQueryErrorGuard } from "@/hooks/useQueryErrorGuard";
import { Button } from "@/components/ui/button";


type AppRole = Database["public"]["Enums"]["app_role"];

interface ProtectedRouteProps {
  children: ReactNode;
  allowedRoles?: AppRole[];
}

const SessionGuards = ({ children }: { children: ReactNode }) => {
  useAccountStatusGuard();
  useQueryErrorGuard();
  return <>{children}</>;
};

export const ProtectedRoute = ({ children, allowedRoles }: ProtectedRouteProps) => {
  const { user, userRole, loading, refreshUserData, profile } = useAuth();
  const location = useLocation();

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
    return <Navigate to="/auth" replace />;
  }

  // SECURITY: When loading is done but userRole is null, the session is incomplete.
  // This can happen if the role fetch failed or the user has no role in user_roles.
  // Block access to ALL routes (even those without allowedRoles) to prevent
  // unauthenticated access via a broken session.
  if (userRole === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4 text-center p-6">
          <div className="w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center">
            <span className="text-3xl font-bold text-destructive">!</span>
          </div>
          <h2 className="text-xl font-semibold">Session incomplète</h2>
          <p className="text-muted-foreground max-w-md">
            Votre rôle n'a pas pu être chargé. Cela peut arriver si votre compte
            n'est pas encore configuré ou si la connexion a échoué.
          </p>
          <Button onClick={refreshUserData} variant="outline">
            Réessayer
          </Button>
        </div>
      </div>
    );
  }

  // Onboarding redirect: if the user hasn't completed onboarding, send them to /onboarding
  // (unless they're already there, on the pricing page, or in the auth flow)
  if (
    profile &&
    !profile.onboarding_completed &&
    location.pathname !== "/onboarding" &&
    location.pathname !== "/pricing" &&
    location.pathname !== "/auth"
  ) {
    return <Navigate to="/onboarding" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(userRole)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <SessionGuards>{children}</SessionGuards>;
};
