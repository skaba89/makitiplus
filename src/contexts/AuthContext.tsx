import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";
import { setSentryUserContext, clearSentryUserContext, reportError } from "@/lib/sentry";
import { extractErrorMessage } from "@/lib/extractErrorMessage";
import { isAdminRole } from "@/types";
import { logger } from "@/lib/logger";

type AppRole = Database["public"]["Enums"]["app_role"];
type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

interface AuthContextType {
  user: User | null;
  session: Session | null;
  userRole: AppRole | null;
  profile: ProfileRow | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, profileData: {
    businessName: string;
    ownerName: string;
    phone?: string;
    role: AppRole;
  }) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  refreshUserData: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [userRole, setUserRole] = useState<AppRole | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUserData = async (userId: string): Promise<{ role: AppRole | null; profile: ProfileRow | null }> => {
    try {
      // Fetch user role. Limit to one row to avoid 406 when old test data created duplicates.
      const { data: roleData, error: roleError } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle();

      if (roleError) {
        reportError(new Error(`[Auth] Failed to fetch user role: ${roleError.message}`));
      }

      const nextRole = roleData?.role ?? null;
      setUserRole(nextRole);

      // Fetch profile. Limit to one row to avoid 406 when duplicate profile rows exist.
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle();

      if (profileError) {
        reportError(new Error(`[Auth] Failed to fetch profile: ${profileError.message}`));
      }

      const nextProfile = profileData ?? null;
      setProfile(nextProfile);

      if (nextProfile) {
        // Set Sentry user context (non-PII)
        setSentryUserContext({
          userId: userId,
          role: nextRole ?? "unknown",
          organizationId: nextProfile.organization_id ?? undefined,
          deviceId: localStorage.getItem("malikiplus_device_id") ?? undefined,
        });
      }

      return { role: nextRole, profile: nextProfile };
    } catch (error) {
      reportError(error instanceof Error ? error : new Error(extractErrorMessage(error)));
      setUserRole(null);
      setProfile(null);
      return { role: null, profile: null };
    }
  };

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);

        // Handle session expiration — redirect to login
        if (event === "TOKEN_REFRESHED" && !session) {
          // Refresh token failed — session is dead
          logger.warn("[Auth] Refresh token invalid — signing out and redirecting to /auth");
          setUserRole(null);
          setProfile(null);
          setLoading(false);
          // Sign out to clear stale session from storage, then redirect
          Promise.resolve(supabase.auth.signOut()).catch(() => {});
          // Use replace to prevent back-button loop
          window.location.replace("/auth");
          return;
        }

        if (session?.user) {
          setLoading(true);
          setTimeout(() => {
            fetchUserData(session.user.id).finally(() => setLoading(false));
          }, 0);
        } else {
          setUserRole(null);
          setProfile(null);
          setLoading(false);
        }
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      // If session retrieval fails (expired refresh token), clear state + redirect
      if (error) {
        logger.warn("[Auth] Session retrieval failed:", error.message);
        setSession(null);
        setUser(null);
        setUserRole(null);
        setProfile(null);
        // Clear invalid session from storage to stop retry loops
        Promise.resolve(supabase.auth.signOut()).catch(() => {});
        setLoading(false);
        // Redirect to login if not already there
        if (window.location.pathname !== "/auth" && window.location.pathname !== "/") {
          window.location.replace("/auth");
        }
        return;
      }

      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        setLoading(true);
        fetchUserData(session.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    }).catch((err) => {
      logger.warn("[Auth] getSession() threw:", err instanceof Error ? err.message : String(err));
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    setLoading(true);

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setLoading(false);
      return { error };
    }

    // Check if account is active; if not, sign out and return error
    if (data.user) {
      setUser(data.user);
      setSession(data.session ?? null);

      const { data: profileRow } = await supabase
        .from("profiles")
        .select("is_active")
        .eq("user_id", data.user.id)
        .limit(1)
        .maybeSingle();

      if (profileRow && profileRow.is_active === false) {
        await supabase.auth.signOut();
        setUser(null);
        setSession(null);
        setUserRole(null);
        setProfile(null);
        setLoading(false);
        return {
          error: new Error(
            "Votre compte a été désactivé. Contactez votre administrateur."
          ),
        };
      }

      const loaded = await fetchUserData(data.user.id);
      setLoading(false);

      if (!loaded.role) {
        return {
          error: new Error(
            "Connexion réussie, mais le rôle de ce compte n'a pas pu être chargé. Vérifiez la configuration du profil et des droits."
          ),
        };
      }

      // Track last login (best-effort, non-blocking)
      // touch_last_login peut échouer (400/404/42501) si la fonction n'est pas
      // déployée ou si RLS bloque. C'est non-critique — on ignore l'erreur.
      Promise.resolve(supabase.rpc("touch_last_login")).then(({ error }) => {
        if (error) {
          // Silencieux : best-effort, non critique
          logger?.warn?.("[Auth] touch_last_login failed (non-critical):", error.message);
        }
      }).catch(() => {
        // Best-effort: ne pas crasher si le RPC est indisponible
      });

      // Log login activity (best-effort)
      // log_user_activity peut échouer si l'ENUM app_activity_action
      // n'est pas encore appliqué ou si la signature a changé.
      // C'est non-critique — on ignore l'erreur.
      Promise.resolve(supabase.rpc("log_user_activity", {
        p_action: 'login',
        p_description: 'Connexion',
        p_metadata: { user_agent: navigator.userAgent.substring(0, 200) }
      })).then(({ error }) => {
        if (error) {
          logger?.warn?.("[Auth] log_user_activity failed (non-critical):", error.message);
        }
      }).catch(() => {});
    } else {
      setLoading(false);
    }

    return { error: null };
  };

  const signUp = async (
    email: string,
    password: string,
    profileData: {
      businessName: string;
      ownerName: string;
      phone?: string;
      role: AppRole;
    }
  ) => {
    const redirectUrl = `${window.location.origin}/`;

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
      },
    });

    if (error) {
      return { error };
    }

    if (data.user) {
      // If admin/super_admin: create organization first
      let organizationId: string | null = null;
      if (isAdminRole(profileData.role)) {
        const { data: org, error: orgError } = await supabase
          .from("organizations")
          .insert({
            name: profileData.businessName,
            owner_user_id: data.user.id,
          })
          .select("id")
          .single();

        if (orgError) {
          return { error: orgError };
        }
        organizationId = org.id;
      }

      // C9: Atomic profile + role creation via RPC
      // Try register_user RPC first (single transaction — no orphaned user without role)
      const { error: rpcError } = await supabase.rpc("register_user", {
        p_business_name: profileData.businessName,
        p_owner_name: profileData.ownerName,
        p_phone: profileData.phone || null,
        p_role: profileData.role,
        p_organization_id: organizationId,
      });

      if (!rpcError) {
        // Atomic RPC succeeded
        return { error: null };
      }

      // Fallback: non-atomic path (for older DB without the RPC)
      // register_user RPC indisponible — fallback séquentiel utilisé

      // Create profile (linked to org if admin)
      const { error: profileError } = await supabase.from("profiles").insert({
        user_id: data.user.id,
        business_name: profileData.businessName,
        owner_name: profileData.ownerName,
        phone: profileData.phone || null,
        organization_id: organizationId,
      });

      if (profileError) {
        return { error: profileError };
      }

      // Create user role
      const { error: roleError } = await supabase.from("user_roles").insert({
        user_id: data.user.id,
        role: profileData.role,
      });

      if (roleError) {
        reportError(new Error(`[Auth] Failed to create user role: ${roleError.message}`));
        if (isAdminRole(profileData.role)) {
          return { error: new Error("Compte créé mais rôle non assigné. Contactez un administrateur existant pour vous attribuer le rôle.") };
        }
      }
    }

    return { error: null };
  };

  const refreshProfile = async () => {
    if (user) {
      setLoading(true);
      try {
        await fetchUserData(user.id);
      } finally {
        setLoading(false);
      }
    }
  };

  const refreshUserData = async () => {
    if (user) {
      setLoading(true);
      try {
        await fetchUserData(user.id);
      } finally {
        setLoading(false);
      }
    }
  };

  const signOut = async () => {
    // Track logout time before signing out (best-effort)
    if (user) {
      Promise.resolve(supabase.rpc("log_user_activity", {
        p_action: 'logout',
        p_description: 'Déconnexion',
      })).catch(() => {});

      Promise.resolve(
        supabase
          .from("profiles")
          .update({ last_logout_at: new Date().toISOString() })
          .eq("user_id", user.id)
      ).catch(() => {});
    }
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setUserRole(null);
    setProfile(null);
    clearSentryUserContext();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        userRole,
        profile,
        loading,
        signIn,
        signUp,
        signOut,
        refreshProfile,
        refreshUserData,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};