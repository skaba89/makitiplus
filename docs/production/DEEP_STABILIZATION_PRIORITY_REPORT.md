# Deep Stabilization Priority Report

## État initial
- branche : `hotfix/deep-production-stabilization-priority-by-priority`
- commit : `216673b`
- lint : ✅ (skip — pas de config eslint dans le audit initial)
- typecheck : ✅ 0 erreur
- build : ✅ Vite OK (64 entries PWA)
- tests unitaires : ✅ 954/954 passent (76 fichiers)
- SQL validator : ✅ 113 fichiers, 0 erreur
- undefined functions : ✅ 121 définies, 115 appelées, 0 manquante
- npm audit : ✅ 0 vulnérabilité high
- e2e pilot : ⚠️ Skippé (secrets E2E_TEST_EMAIL/PASSWORD non configurés)
- e2e seller activity : ⚠️ Skippé (secrets manquants)
- e2e staging : ⚠️ Skippé (secrets manquants)
- e2e sales store scope : ⚠️ Skippé (secrets manquants)
- check national readiness : ⚠️ Skippé (secrets manquants)
- erreurs détectées : 
  - P0.1 : RPC `get_product_kpis_by_period` utilise `ROW_NUMBER()` dans `WHERE` (interdit PostgreSQL)
  - P0.2 : `sale_items.cost_price` — vérifier si la colonne existe
  - P1.2 : AdminAnalytics masque les erreurs RPC avec `if (error) return []`

## P0 — Résultats
- RPC product KPIs corrigé : ✅ CTE `ranked_products` + `ROW_NUMBER()` dans CTE (pas dans WHERE)
- sale_items.cost_price : ✅ Migration `20260719130000_add_sale_items_cost_price_snapshot.sql` (ALTER TABLE ADD COLUMN)
- create_full_sale mis à jour : ✅ Migration `20260719140000_update_create_full_sale_cost_price.sql` (récupère cost_price depuis products au moment de la vente)
- tests ajoutés : ✅ `src/test/productKpisSqlRegression.test.ts` (10 tests)
- commandes exécutées : typecheck ✅, build ✅, tests ✅ (10/10), SQL validator ✅, undefined functions ✅, npm audit ✅
- résultat : P0 VALIDÉ ✅
- risques restants : 
  - Les 3 migrations P0 doivent être exécutées sur Supabase
  - Les ventes anciennes auront cost_price = 0 (pas d'erreur, marge = revenue)
