import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Hook réutilisable pour le sélecteur d'organisation (super_admin).
 *
 * - Pour super_admin : permet de sélectionner n'importe quelle org
 *   (ou "toutes les orgs" avec effectiveOrgId = undefined)
 * - Pour les autres rôles : utilise profile.organization_id (pas de sélecteur)
 *
 * Usage :
 *   const { isSuperAdmin, selectedOrgId, setSelectedOrgId, effectiveOrgId, allOrgs } = useOrgSelector();
 *
 * Dans les queries :
 *   if (effectiveOrgId) {
 *     query = query.eq("organization_id", effectiveOrgId);
 *   }
 *
 * Dans le JSX (super_admin seulement) :
 *   {isSuperAdmin && <OrgSelector ... />}
 */

interface OrgInfo {
  id: string;
  name: string;
  country: string | null;
  currency: string | null;
}

export interface UseOrgSelectorResult {
  /** true si l'utilisateur est super_admin (sélecteur visible) */
  isSuperAdmin: boolean;
  /** ID de l'org sélectionnée ("" = toutes les orgs) */
  selectedOrgId: string;
  /** Change l'org sélectionnée */
  setSelectedOrgId: (id: string) => void;
  /**
   * L'org effective pour filtrer les queries :
   * - super_admin → selectedOrgId ou undefined (toutes)
   * - autres → profile.organization_id
   * Utiliser dans les queries : if (effectiveOrgId) { query.eq("organization_id", effectiveOrgId) }
   */
  effectiveOrgId: string | undefined;
  /** Liste de toutes les orgs (pour le dropdown) */
  allOrgs: OrgInfo[];
  /** true pendant le chargement de la liste des orgs */
  loading: boolean;
  /** Nom de l'org sélectionnée (pour affichage) */
  selectedOrgName: string | null;
}

export function useOrgSelector(): UseOrgSelectorResult {
  const { userRole, profile } = useAuth();
  const isSuperAdmin = userRole === "super_admin";
  const [selectedOrgId, setSelectedOrgId] = useState<string>("");

  // Fetch toutes les organisations (super_admin seulement)
  const { data: allOrgs = [], isLoading: loading } = useQuery({
    queryKey: ["all-organizations-for-selector"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organizations")
        .select("id, name, country, currency")
        .order("name");
      if (error) return [];
      return data as OrgInfo[];
    },
    enabled: isSuperAdmin,
  });

  const effectiveOrgId = isSuperAdmin
    ? (selectedOrgId || undefined)
    : (profile?.organization_id || undefined);

  const selectedOrgName = useMemo(() => {
    if (!isSuperAdmin) return profile?.business_name || null;
    if (!selectedOrgId) return null;
    return allOrgs.find((o) => o.id === selectedOrgId)?.name || null;
  }, [isSuperAdmin, selectedOrgId, allOrgs, profile]);

  return {
    isSuperAdmin,
    selectedOrgId,
    setSelectedOrgId,
    effectiveOrgId,
    allOrgs,
    loading,
    selectedOrgName,
  };
}
