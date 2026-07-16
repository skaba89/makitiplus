import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useOrgSelector } from "@/hooks/useOrgSelector";

/**
 * Sélecteur d'organisation réutilisable pour le super_admin.
 * Affiche un dropdown avec toutes les organisations.
 * Ne s'affiche QUE pour le super_admin (retourne null sinon).
 *
 * Usage :
 *   <OrgSelector />
 *
 * Le state est géré par le hook useOrgSelector (shared via contexte React Query).
 * Pour récupérer l'org sélectionnée dans une page :
 *   const { effectiveOrgId, isSuperAdmin } = useOrgSelector();
 */
export function OrgSelector() {
  const { isSuperAdmin, selectedOrgId, setSelectedOrgId, allOrgs, loading } = useOrgSelector();

  if (!isSuperAdmin) return null;

  return (
    <Select value={selectedOrgId} onValueChange={setSelectedOrgId}>
      <SelectTrigger className="w-full sm:w-[220px]">
        <SelectValue placeholder={loading ? "Chargement..." : "🌍 Toutes les organisations"} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="">🌍 Toutes les organisations</SelectItem>
        {allOrgs.map((org) => (
          <SelectItem key={org.id} value={org.id}>
            🏪 {org.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
