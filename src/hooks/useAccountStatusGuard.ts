import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

/**
 * Garde de session : vérifie en continu que le compte connecté est encore actif.
 * - Polling toutes les 60 secondes via RPC `check_account_status`.
 * - Vérification immédiate au focus de l'onglet.
 * Si désactivé : signOut + redirection /auth + toast.
 */
export function useAccountStatusGuard() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const checkingRef = useRef(false);

  useEffect(() => {
    if (!user) return;

    const check = async () => {
      if (checkingRef.current) return;
      checkingRef.current = true;
      try {
        const { data, error } = await supabase.rpc("check_account_status");
        if (error) return; // réseau down → on ne déconnecte pas
        const row = Array.isArray(data) ? data[0] : data;
        if (row && row.is_active === false) {
          await signOut();
          toast({
            variant: "destructive",
            title: "Compte désactivé",
            description:
              row.deactivation_reason ||
              "Votre compte a été désactivé par l'administrateur.",
          });
          navigate("/auth", { replace: true });
        }
      } catch {
        // silent
      } finally {
        checkingRef.current = false;
      }
    };

    // Vérification immédiate
    check();

    // Polling 60s
    const interval = setInterval(check, 60_000);

    // Vérification au retour de focus
    const onFocus = () => check();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [user, signOut, navigate, toast]);
}
