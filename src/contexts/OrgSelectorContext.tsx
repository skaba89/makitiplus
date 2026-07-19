import { createContext, useContext, useState, useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Contexte global pour le sélecteur d'organisation (super_admin).
 *
 * PROBLÈME : Si useOrgSelector est un hook simple (avec useState), chaque page
 * qui l'utilise a SON PROPRE state → sélectionner une org sur le Dashboard
 * ne se répercute pas sur Products/Reports/etc.
 *
 * SOLUTION : Le state est stocké dans un Contexte React (au niveau de App.tsx),
 * partagé entre toutes les pages. Ainsi, sélectionner "KFM SARI" sur le Dashboard
 * filtre aussi Products, Reports, Expenses, etc.
 *
 * Usage :
 *   - Ajouter <OrgSelectorProvider> dans App.tsx (au-dessus des routes)
 *   - Dans chaque page : const { effectiveOrgId } = useOrgSelector();
 *   - Dans le JSX : <OrgSelector /> (composant dropdown)
 */

interface OrgInfo {
  id: string;
  name: string;
  country: string | null;
  currency: string | null;
}

interface OrgSelectorContextValue {
  isSuperAdmin: boolean;
  selectedOrgId: string;
  setSelectedOrgId: (id: string) => void;
  effectiveOrgId: string | undefined;
  allOrgs: OrgInfo[];
  loading: boolean;
  selectedOrgName: string | null;
}

const OrgSelectorContext = createContext<OrgSelectorContextValue | null>(null);

export function OrgSelectorProvider({ children }: { children: ReactNode }) {
  const { userRole, profile } = useAuth();
  const isSuperAdmin = userRole === "super_admin";
  const [selectedOrgId, setSelectedOrgId] = useState<string>("");

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

  const value: OrgSelectorContextValue = {
    isSuperAdmin,
    selectedOrgId,
    setSelectedOrgId,
    effectiveOrgId,
    allOrgs,
    loading,
    selectedOrgName,
  };

  return (
    <OrgSelectorContext.Provider value={value}>
      {children}
    </OrgSelectorContext.Provider>
  );
}

export function useOrgSelector(): OrgSelectorContextValue {
  const ctx = useContext(OrgSelectorContext);
  if (!ctx) {
    throw new Error("useOrgSelector must be used within <OrgSelectorProvider>");
  }
  return ctx;
}
