-- ════════════════════════════════════════════════════════════════
-- Fix: get_admin_product_ranking_detailed — ROW_NUMBER() dans WHERE
-- Date: 2026-07-22 — P1.3 (renforcement validate_sql_migrations.py,
-- nouvelle règle "window function in WHERE" détecte ce cas)
--
-- Bug : la version déployée (20260716100000_admin_analytics_advanced_rpcs.sql)
-- utilise `WHERE ROW_NUMBER() OVER (...) <= p_limit`, syntaxe interdite par
-- PostgreSQL (les fonctions de fenêtrage ne sont autorisées que dans
-- SELECT/ORDER BY, jamais dans WHERE). Confirmé en base LIVE via
-- pg_get_functiondef : c'est la version actuellement déployée, donc
-- get_admin_product_ranking_detailed échoue systématiquement en
-- production avec "window functions are not allowed in WHERE".
--
-- Impact : AdminAnalytics.tsx (onglet "Top / Bad Articles", RPC #10)
-- appelle cette fonction — la bannière d'erreur ajoutée en P0.2 la
-- rend maintenant visible, mais la fonctionnalité était déjà cassée
-- avant cette session (le masquage silencieux de P0.2 empêchait juste
-- de le voir). Même classe de bug déjà corrigée pour
-- get_product_kpis_by_period dans 20260719130000_product_kpis_fix_rownumber.sql
-- — même fix appliqué ici : ROW_NUMBER() calculé dans un CTE
-- intermédiaire (ranked), filtré ensuite dans la clause WHERE externe.
--
-- Logique métier strictement inchangée (mêmes colonnes, mêmes filtres,
-- même seuil p_limit pour top/bad) — uniquement la position du calcul
-- de rang est déplacée pour respecter la syntaxe PostgreSQL.
--
-- Second bug trouvé en relisant la version live pendant la validation de
-- ce fix (P0.2/P0.3, gap-closing) : le filtre de période
-- (`s.created_at >= v_start_date`) est posé dans la condition ON du
-- LEFT JOIN sales, pas dans un WHERE. Un LEFT JOIN ne supprime pas la
-- ligne côté gauche (sale_items) quand la condition échoue — il ne fait
-- que mettre les colonnes de `sales` à NULL. Comme les agrégats
-- (SUM(si.quantity), SUM(si.quantity*si.unit_price), ...) ne portent que
-- sur des colonnes de `sale_items`, les ventes HORS période restaient
-- comptées dans les totaux : la fonction aurait silencieusement renvoyé
-- des cumuls "depuis toujours" au lieu des cumuls de la période demandée.
-- Ce bug est déjà présent dans la version live actuelle (vérifié via
-- pg_get_functiondef) mais n'a jamais pu se manifester car l'erreur de
-- syntaxe ROW_NUMBER()-dans-WHERE empêche toute exécution — corriger l'un
-- sans l'autre aurait fait passer d'une erreur visible à des chiffres
-- silencieusement faux, ce qui est pire. Fix : les sale_items sont
-- pré-filtrés par période dans une sous-requête jointe (INNER JOIN sales
-- + WHERE période à l'intérieur), puis cette sous-requête est LEFT JOIN
-- sur products — préserve le comportement voulu (afficher aussi les
-- produits sans aucune vente sur la période, à 0) tout en excluant
-- réellement les ventes hors période des totaux.
--
-- Troisième bug trouvé en testant ce fix dans une transaction ROLLBACK
-- avant application (protocole P0.2/P0.3) : RETURNS TABLE déclare
-- `stock_quantity NUMERIC` mais la colonne réelle `products.stock_quantity`
-- est INTEGER — "structure of query does not match function result type"
-- au premier appel réel. Comme les deux bugs précédents, jamais visible
-- avant car l'erreur de syntaxe ROW_NUMBER empêchait toute exécution.
-- Fix : cast explicite `pr.stock_quantity::NUMERIC` dans product_stats.
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_admin_product_ranking_detailed(
  p_period TEXT DEFAULT 'month',
  p_organization_id UUID DEFAULT NULL,
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  product_id UUID,
  product_name TEXT,
  org_name TEXT,
  category_name TEXT,
  quantity_sold BIGINT,
  revenue NUMERIC,
  cost NUMERIC,
  margin NUMERIC,
  margin_pct NUMERIC,
  stock_quantity NUMERIC,
  revenue_pct_of_total NUMERIC,
  rank_type TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
  DECLARE
    v_start_date TIMESTAMPTZ;
    v_total_revenue NUMERIC;
  BEGIN
    v_start_date := CASE
      WHEN p_period = 'day' THEN date_trunc('day', NOW()) - INTERVAL '1 day'
      WHEN p_period = 'week' THEN date_trunc('week', NOW()) - INTERVAL '7 days'
      WHEN p_period = 'month' THEN date_trunc('month', NOW()) - INTERVAL '30 days'
      ELSE date_trunc('month', NOW()) - INTERVAL '30 days'
    END;

    -- Calculer le CA total pour les pourcentages
    SELECT COALESCE(SUM(si.quantity * si.unit_price), 0) INTO v_total_revenue
    FROM public.sale_items si
    JOIN public.sales s ON s.id = si.sale_id
    WHERE s.created_at >= v_start_date
      AND (p_organization_id IS NULL OR s.organization_id = p_organization_id)
      AND public.is_super_admin();

    RETURN QUERY
    WITH product_stats AS (
      SELECT
        pr.id AS product_id,
        pr.name AS product_name,
        o.name AS org_name,
        COALESCE(cat.name, '—') AS category_name,
        COALESCE(SUM(si.quantity), 0) AS quantity_sold,
        COALESCE(SUM(si.quantity * si.unit_price), 0) AS revenue,
        COALESCE(SUM(si.quantity * si.cost_price), 0) AS cost,
        COALESCE(SUM(si.quantity * si.unit_price), 0) - COALESCE(SUM(si.quantity * si.cost_price), 0) AS margin,
        pr.stock_quantity::NUMERIC AS stock_quantity,
        o.id AS org_id
      FROM public.products pr
      LEFT JOIN (
        SELECT si2.product_id, si2.quantity, si2.unit_price, si2.cost_price
        FROM public.sale_items si2
        JOIN public.sales s2 ON s2.id = si2.sale_id
        WHERE s2.created_at >= v_start_date
      ) si ON si.product_id = pr.id
      LEFT JOIN public.organizations o ON o.id = pr.organization_id
      LEFT JOIN public.categories cat ON cat.id = pr.category_id
      WHERE public.is_super_admin()
        AND (p_organization_id IS NULL OR pr.organization_id = p_organization_id)
      GROUP BY pr.id, pr.name, o.name, cat.name, pr.stock_quantity, o.id
    ),
    ranked AS (
      SELECT
        ps.*,
        ROW_NUMBER() OVER (ORDER BY ps.revenue DESC) AS rank_top,
        ROW_NUMBER() OVER (ORDER BY ps.revenue ASC) AS rank_bad
      FROM product_stats ps
    )
    SELECT
      r.product_id,
      r.product_name,
      r.org_name,
      r.category_name,
      r.quantity_sold,
      r.revenue,
      r.cost,
      r.margin,
      CASE WHEN r.revenue > 0 THEN (r.margin / r.revenue) * 100 ELSE 0 END AS margin_pct,
      r.stock_quantity,
      CASE WHEN v_total_revenue > 0 THEN (r.revenue / v_total_revenue) * 100 ELSE 0 END AS revenue_pct_of_total,
      CASE
        WHEN r.rank_top <= p_limit THEN 'top'
        WHEN r.rank_bad <= p_limit THEN 'bad'
        ELSE NULL
      END AS rank_type
    FROM ranked r
    WHERE r.rank_top <= p_limit
       OR r.rank_bad <= p_limit
    ORDER BY r.revenue DESC;
  END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_product_ranking_detailed(TEXT, UUID, INTEGER) TO authenticated;
