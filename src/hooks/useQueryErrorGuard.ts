import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

/**
 * Intercepte globalement les erreurs TanStack Query.
 * Si une réponse Supabase indique JWT invalide / utilisateur supprimé,
 * on déclenche immédiatement la déconnexion (utile si le compte a été désactivé
 * pendant que la session avait encore un refresh token valide).
 */
export function useQueryErrorGuard() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { signOut, user } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (!user) return;
    const cache = queryClient.getQueryCache();
    const unsub = cache.subscribe((event) => {
      const queryError: unknown = (event as { query?: { state: { error: unknown } } })?.query?.state?.error;
      if (!queryError) return;
      const msg = String((queryError as { message?: string })?.message ?? "").toLowerCase();
      const code = String((queryError as { code?: string })?.code ?? "");
      if (
        msg.includes("jwt expired") ||
        msg.includes("invalid jwt") ||
        msg.includes("user not found") ||
        code === "PGRST301"
      ) {
        // Re-vérifie avec le serveur avant de déconnecter
        supabase.rpc("check_account_status").then(({ data }) => {
          const row = Array.isArray(data) ? data[0] : data;
          if (row && row.is_active === false) {
            signOut().then(() => {
              toast({
                variant: "destructive",
                title: "Session interrompue",
                description: "Votre compte a été désactivé.",
              });
              navigate("/auth", { replace: true });
            });
          }
        });
      }
    });
    return () => unsub();
  }, [queryClient, navigate, signOut, toast, user]);
}
