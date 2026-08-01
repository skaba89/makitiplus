-- ════════════════════════════════════════════════════════════════
-- Fix RÉGRESSION : l'icône et la couleur choisies pour une catégorie
-- reviennent à la valeur par défaut (icône "carton"/Package) juste
-- après enregistrement.
--
-- Cause racine : la migration 20260708090000_fix_all_returns_table_rpcs.sql
-- ("caster name et description") a redéfini get_categories() avec un
-- RETURNS TABLE qui a perdu les colonnes icon, color et is_default --
-- présentes dans la version précédente (20260702090000) et toujours
-- attendues par le frontend (useCategories.ts fait `c.icon || "Package"`,
-- donc dès que la RPC ne renvoie plus `icon` du tout, TOUTES les
-- catégories affichent l'icône par défaut, pas seulement celle qu'on
-- vient de modifier -- le bug est juste plus visible juste après un
-- enregistrement car invalidateQueries force un refetch immédiat via
-- cette RPC cassée).
--
-- L'insert/update dans categories (Categories.tsx) écrit bien icon/color
-- en base -- la donnée n'était jamais perdue, seulement jamais relue.
-- ════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.get_categories();

CREATE OR REPLACE FUNCTION public.get_categories()
RETURNS TABLE (
  id UUID,
  name TEXT,
  icon TEXT,
  color TEXT,
  description TEXT,
  sort_order INTEGER,
  is_default BOOLEAN,
  product_count BIGINT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.name::text,
    c.icon,
    c.color,
    c.description::text,
    c.sort_order,
    c.is_default,
    (SELECT count(*) FROM public.products p WHERE p.category_id = c.id)
  FROM public.categories c
  WHERE c.organization_id = public.get_user_organization_id()
  ORDER BY c.sort_order, c.name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_categories() TO authenticated;
