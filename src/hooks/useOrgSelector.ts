/**
 * Hook réutilisable pour le sélecteur d'organisation (super_admin).
 *
 * ⚠️ Ce hook est maintenant un proxy vers OrgSelectorContext.
 * Le state est GLOBAL (partagé entre toutes les pages via le Contexte).
 * Ainsi, sélectionner une org sur le Dashboard filtre aussi Products,
 * Reports, Expenses, etc.
 *
 * Usage :
 *   const { isSuperAdmin, effectiveOrgId } = useOrgSelector();
 *
 * Dans les queries :
 *   if (effectiveOrgId) {
 *     query = query.eq("organization_id", effectiveOrgId);
 *   }
 *
 * Dans le JSX (super_admin seulement) :
 *   <OrgSelector />
 *
 * Le provider doit être ajouté dans App.tsx :
 *   <OrgSelectorProvider> ... <AppRoutes /> ... </OrgSelectorProvider>
 */

export { useOrgSelector, type OrgSelectorContextValue } from "@/contexts/OrgSelectorContext";
