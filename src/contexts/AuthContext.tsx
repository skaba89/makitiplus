import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";
import { setSentryUserContext, clearSentryUserContext } from "@/lib/sentry";

type AppRole = Database["public"]["Enums"]["app_role"];

interface AuthContextType {
  user: User | null;
  session: Session | null;
  userRole: AppRole | null;
  profile: Database["public"]["Tables"]["profiles"]["Row"] | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, profileData: {
    businessName: string;
    ownerName: string;
    phone?: string;
    role: AppRole;
  }) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
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
  const [profile, setProfile] = useState<Database["public"]["Tables"]["profiles"]["Row"] | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUserData = async (userId: string) => {
    try {
      // Fetch user role
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .single();

      if (roleData) {
        setUserRole(roleData.role);
      }

      // Fetch profile
      const { data: profileData } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", userId)
        .single();

      if (profileData) {
        setProfile(profileData);
        // Set Sentry user context (non-PII)
        setSentryUserContext({
          userId: userId,
          role: roleData?.role ?? "unknown",
          organizationId: profileData.organization_id ?? undefined,
          deviceId: localStorage.getItem("malikiplus_device_id") ?? undefined,
        });
      }
    } catch (error) {
      reportError(error instanceof Error ? error : new Error(String(error)));
    }
  };

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);

        // Defer Supabase calls with setTimeout
        if (session?.user) {
          setTimeout(() => {
            fetchUserData(session.user.id);
          }, 0);
        } else {
          setUserRole(null);
          setProfile(null);
        }

        if (event === "SIGNED_OUT") {
          setLoading(false);
        }
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        fetchUserData(session.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) return { error };

    // Check if account is active; if not, sign out and return error
    if (data.user) {
      const { data: profileRow } = await supabase
        .from("profiles")
        .select("is_active")
        .eq("user_id", data.user.id)
        .maybeSingle();

      if (profileRow && profileRow.is_active === false) {
        await supabase.auth.signOut();
        return {
          error: new Error(
            "Votre compte a été désactivé. Contactez votre administrateur."
          ),
        };
      }

      // Track last login (best-effort, non-blocking)
      supabase.rpc("touch_last_login").then(() => {});
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
      // If admin: create organization first
      let organizationId: string | null = null;
      if (profileData.role === "admin") {
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
        return { error: roleError };
      }
    }

    return { error: null };
  };

  const signOut = async () => {
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
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
