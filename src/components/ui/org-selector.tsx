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
 */
export function OrgSelector() {
  const { isSuperAdmin, selectedOrgId, setSelectedOrgId, allOrgs, loading } = useOrgSelector();

  if (!isSuperAdmin) return null;

  return (
    <Select value={selectedOrgId || "all"} onValueChange={(v) => setSelectedOrgId(v === "all" ? "" : v)}>
      <SelectTrigger className="w-full sm:w-[220px]">
        <SelectValue placeholder={loading ? "Chargement..." : "🌍 Toutes les organisations"} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">🌍 Toutes les organisations</SelectItem>
        {allOrgs.map((org) => (
          <SelectItem key={org.id} value={org.id}>
            🏪 {org.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
