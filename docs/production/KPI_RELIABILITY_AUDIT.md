# Audit de fiabilité des KPI — P2

**Date** : 2026-07-23
**Méthode** : lecture complète des définitions live (`pg_get_functiondef`, lecture seule) des 6 RPC alimentant `AdminAnalytics.tsx`, en plus de `get_product_kpis_by_period` déjà vérifiée en P0.3.

## Périmètre vérifié

| Fonction | Isolation tenant | Fan-out | Montants + quantités | Résultat |
|---|---|---|---|---|
| `get_product_kpis_by_period` | ✅ (vérifiée P0.3) | ✅ | ✅ | OK |
| `get_admin_product_ranking_detailed` | ✅ | ✅ | ✅ | **Bug syntaxe corrigé en P1.3** (`ROW_NUMBER()` dans `WHERE`) |
| `get_admin_global_kpis` | ✅ super_admin only (`IF NOT is_super_admin() THEN RETURN`) | ✅ | ✅ | OK |
| `get_admin_org_kpis` | ✅ super_admin only (`WHERE is_super_admin()`) | ✅ | ✅ | OK |
| `get_category_kpis` | ✅ (`IF is_super_admin() THEN v_org_id := p_organization_id ELSE get_user_organization_id()`) | ✅ | ✅ | OK |
| `get_enhanced_dashboard_stats` | ✅ (même pattern) | ✅ | ✅ | OK |
| `get_seller_kpis_detailed` | ✅ (même pattern) | ✅ | ✅ | OK |

## Ce qui a été vérifié pour chaque fonction

**Isolation tenant** : soit un contrôle d'accès binaire (`get_admin_global_kpis`/`get_admin_org_kpis` — réservées au super_admin, jamais de paramètre d'organisation puisqu'elles agrègent volontairement toute la plateforme), soit le pattern `IF is_super_admin() THEN v_org_id := p_organization_id ELSE v_org_id := get_user_organization_id()` déjà validé en P0.3 — un non-super_admin est **toujours** forcé sur sa propre organisation, quel que soit le paramètre envoyé côté client. Aucune des 5 fonctions ne fait confiance à un `p_organization_id` fourni par un rôle non-super_admin.

**Fan-out (gonflement de CA/marge)** : toutes utilisent le même schéma sûr — un ou plusieurs CTE qui `GROUP BY` la clé pertinente (sale_id, organization_id, user_id, category_id) **avant** toute jointure, puis une jointure finale sur des agrégats déjà résolus (une ligne par entité). Aucune fonction ne fait de `JOIN` brut entre `sales` et `sale_items` suivi d'un `SUM()` sans `GROUP BY` intermédiaire — c'est exactement le bug de fan-out déjà corrigé ailleurs dans le projet (`20260720130000_fix_kpi_rpcs_sale_items_fanout.sql`, `20260720140000_fix_admin_kpis_fanout_and_bad_column.sql`), confirmé non réintroduit dans ces 5 fonctions.

**Montants + quantités** : chaque fonction retourne à la fois des colonnes monétaires (`total_sales`, `revenue`, `total_amount`, `gross_margin`, etc.) et des colonnes de quantité (`total_transactions`, `quantity_sold`, `total_products_sold`), conformément à la demande explicite de vérifier les deux dimensions.

**Marge artificielle à 100%** : les calculs de `margin_pct`/`gross_margin_pct` utilisent systématiquement `CASE WHEN revenue > 0 THEN (margin / revenue) * 100 ELSE 0 END` — jamais de valeur par défaut à 100 en cas de coût nul ou de division par zéro. Le coût utilise `COALESCE(cost_price, 0)`, donc un produit sans `cost_price` renseigné affiche une marge de 100% **réelle** (revenue - 0 = revenue), pas un artefact de calcul — comportement attendu tant que `cost_price` n'est pas obligatoire en base, pas un bug de la RPC elle-même.

**Fonctions de fenêtrage** (`seller_top_products`, `seller_top_categories`, `category_top_products`) : `ROW_NUMBER() OVER (PARTITION BY ...)` utilisé correctement dans un `SELECT` de CTE, jamais dans une clause `WHERE` — syntaxe PostgreSQL valide, contrairement au bug trouvé dans `get_admin_product_ranking_detailed`.

## Conclusion P2

Sur 7 RPC KPI vérifiées (6 + `get_product_kpis_by_period` de P0.3), une seule anomalie trouvée — `get_admin_product_ranking_detailed`, déjà corrigée en P1.3. Les 6 autres sont fiables : isolation tenant correcte, pas de fan-out, montants et quantités couverts, pas de marge artificielle.
