# MakitiPlus — Production Stabilization Report

## Branche
`hotfix/production-stabilization-no-regression`

## Date
2026-07-09

## Objectif
Corriger les dernières régressions, stabiliser le projet et le rendre prêt pour une production pilote contrôlée, sans casser les modules déjà fonctionnels.

## Corrections réalisées

### Activité Vendeurs route/menu
- **App.tsx** : route `/dashboard/seller-activity` passée de `ADMIN_ROLES` à `MANAGEMENT_ROLES`
- **DashboardLayout.tsx** : item menu desktop passé à `MANAGEMENT_ROLES`
- **MobileBottomNav.tsx** : item "Activité Vendeurs" ajouté au menu mobile avec `MANAGEMENT_ROLES`

### RPC seller performance
- **Migration** `20260709010000_fix_seller_activity_production.sql` :
  - `get_seller_performance(TIMESTAMPTZ, TIMESTAMPTZ)` : casts explicites `ur.role::TEXT`, LATERAL join pour stats, vérification `has_role(auth.uid(), 'manager')`
  - `get_seller_activities(UUID, INTEGER)` : cast explicite `ual.action::TEXT`, `LIMIT LEAST(GREATEST(p_limit, 1), 500)` pour safety bounds

### Gestion erreur frontend
- **SellerActivity.tsx** :
  - Simplification : `(data ?? []) as SellerPerformance[]` (suppression de la normalisation complexe)
  - Ajout `activitiesLoading` et `activitiesError` sur la query des activités
  - Panneau détail : 3 états explicites (loading spinner / erreur destructif / "Aucune activité")

### Diagnostic Supabase link
- **Diagnostic.tsx** : suppression du Project Ref hardcodé (`exxntkuursgwhxvehekr`)
  - Remplacé par `import.meta.env.VITE_SUPABASE_DASHBOARD_URL`
  - Si super_admin + URL configurée → lien cliquable
  - Sinon → texte générique "Ouvrez le SQL Editor depuis votre dashboard Supabase."
- **.env.example** : ajout `VITE_SUPABASE_DASHBOARD_URL=""
- **render.yaml** : ajout `VITE_SUPABASE_DASHBOARD_URL` (sync: false)

### Tests ajoutés
- **src/test/sellerActivityRegression.test.ts** : 13 tests de non-régression
  - Route App.tsx avec MANAGEMENT_ROLES
  - Menu desktop avec MANAGEMENT_ROLES
  - Menu mobile avec MANAGEMENT_ROLES
  - Migration contient ur.role::TEXT
  - Migration contient ual.action::TEXT
  - Migration contient has_role(auth.uid(), 'manager')
  - SellerActivity.tsx utilise activitiesLoading
  - SellerActivity.tsx utilise activitiesError
  - SellerActivity.tsx ne contient plus [data] normalization
  - Diagnostic.tsx ne contient plus exxntkuursgwhxvehekr
  - Diagnostic.tsx utilise VITE_SUPABASE_DASHBOARD_URL

### E2E ajouté
- **e2e/seller-activity.spec.ts** : 4 scénarios
  - Admin peut accéder à la page (skip si secrets manquants)
  - Détail peut être ouvert si lignes existent
  - Manager peut accéder (skip si secrets manquants)
  - Vendor ne peut pas accéder (skip si secrets manquants)

## Commandes exécutées
| Commande | Résultat |
|----------|----------|
| npm ci | ✅ OK |
| npm run lint | ✅ 0 errors, 9 warnings (< 10) |
| npm run typecheck | ✅ OK |
| npm run build | ✅ OK |
| npm test -- --run | ✅ 780/780 passent |
| validate_sql_migrations | ✅ 0 erreurs |
| check_undefined_functions | ✅ OK |
| npm audit --audit-level=high | ✅ 0 vulnérabilités |
| e2e:pilot | ⚠️ Skipped (secrets E2E non configurés) |
| e2e:seller-activity | ⚠️ Skipped (secrets E2E non configurés) |
| e2e:staging | ⚠️ Skipped (secrets E2E non configurés) |

## Risques restants
1. **Secrets E2E non configurés** — les tests Playwright sont skip mais le framework est en place
2. **Token GitHub compromis** — à révoquer urgemment
3. **Migrations à appliquer** — la migration `20260709010000` doit être appliquée via SQL Editor
4. **Monitoring production** — Sentry à 0.1, augmenter pendant le pilote

## Décision
- **Prêt démo** : ✅ OUI
- **Prêt pilote 1 magasin** : ✅ OUI si CI verte
- **Prêt 3 à 5 magasins** : ✅ OUI après 7 jours stables
- **Prêt production large** : ⏳ Attendre validation terrain + monitoring + sauvegarde/rollback
