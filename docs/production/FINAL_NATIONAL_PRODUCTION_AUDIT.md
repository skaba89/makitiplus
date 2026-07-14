# MakitiPlus — Final National Production Audit

## Date
2026-07-14

## Branche
`hardening/final-national-readiness-no-regression`

## Commit
Dernier commit sur cette branche

## Objectif
Corriger les derniers risques P0/P1 avant déploiement national progressif, sans casser ce qui fonctionne.

## Résumé

| Phase | Décision | Condition |
|-------|----------|-----------|
| Démo | OUI | — |
| Pilote 1 magasin | OUI | Appliquer PILOT_LAUNCH_ALL_IN_ONE.sql + révoquer token |
| Pilote 3-5 magasins | OUI | Après 7j pilote 1 sans P0/P1 |
| Déploiement régional | OUI | Après 30j pilote 3-5 sans P0 |
| Déploiement national | OUI | Après 60j régional + audit sécurité |

## Corrections réalisées

### 1. Sécurisation suppression utilisateur
- **Avant** : fallback destructif frontend (delete user_roles + profiles directement)
- **Après** : l'Edge Function `admin-manage-user` est le SEUL chemin pour la suppression définitive
- Si l'Edge Function échoue : message clair "Suppression impossible : Edge Function non disponible"
- Désactivation/réactivation : conservées avec UPDATE direct (sûr, non-destructif)
- `reportError` ajouté sur tout échec

### 2. Déplacement delete_user_manual.sql
- **Avant** : `supabase/migrations/20260713250000_delete_user_manual.sql` (dans les migrations)
- **Après** : `scripts/admin/delete_user_manual.sql.example` (hors migrations)
- En-tête ajouté : "SCRIPT MANUEL DANGEREUX — NE PAS EXÉCUTER EN PRODUCTION SANS VALIDATION"

### 3. Restauration sqlSafety.test.ts
- Exclusion `delete_user_manual` supprimée du test
- Nouveau test ajouté : vérifie qu'aucun script destructif n'est dans `supabase/migrations`
- Pattern : `delete_user_manual`, `manual_delete`, `cleanup_reset`

### 4. Migration consolidée finale testée
- 12 tests ajoutés dans `finalConsolidatedMigration.test.ts`
- Vérifie : colonnes products, cast payment_method, p_store_id, store scope, non-destructif

### 5. Plan pilot_national créé
- Nouveau plan `pilot_national` avec toutes les features (pour le pilote)
- Plan `Starter` restauré avec ses vraies limites commerciales
- Migration : `20260714010000_create_pilot_plan_restore_starter.sql`

### 6. Tests sécurité ajoutés
- `adminManageUserSecurity.test.ts` (8 tests) :
  - Users.tsx appelle admin-manage-user
  - Pas de .from().delete() dans le fallback
  - Message clair si Edge Function échoue
  - Edge Function utilise SUPABASE_SERVICE_ROLE_KEY
  - Edge Function vérifie le rôle admin
  - Edge Function empêche suppression super_admin
  - Edge Function écrit un audit log
  - Aucun fallback destructif frontend

## Fichiers modifiés
- `src/pages/Users.tsx` — suppression du fallback destructif
- `src/test/sqlSafety.test.ts` — restauration protection + nouveau test
- `scripts/validate_sql_migrations.py` — exclusion des scripts utilitaires

## Fichiers déplacés
- `supabase/migrations/20260713250000_delete_user_manual.sql` → `scripts/admin/delete_user_manual.sql.example`

## Migrations ajoutées
- `supabase/migrations/20260714010000_create_pilot_plan_restore_starter.sql`

## Tests ajoutés
- `src/test/adminManageUserSecurity.test.ts` (8 tests)
- `src/test/finalConsolidatedMigration.test.ts` (12 tests)
- `src/test/sqlSafety.test.ts` (+1 test anti-regression)

## Commandes exécutées
- npm ci : OK
- npm run lint : 0 errors, 9 warnings (< 10) OK
- npm run typecheck : 0 erreur OK
- npm run build : OK (PWA 66 entries)
- npm test -- --run : 909/909 passent OK
- python3 scripts/validate_sql_migrations.py : 0 erreur OK
- python3 scripts/check_undefined_functions.py : 0 undefined OK
- npm audit --audit-level=high : 0 vulnérabilité OK

## E2E
- e2e:pilot : Skip (secrets E2E manquants)
- e2e:seller-activity : Skip (secrets E2E manquants)
- e2e:staging : Skip (secrets E2E manquants)
- e2e:sales-store-scope : Skip (secrets E2E manquants)

Secrets manquants : voir `docs/production/E2E_SECRETS_SETUP_GUIDE.md`

## Risques restants
1. Token GitHub compromis — À RÉVOQUER (action utilisateur)
2. Migration consolidée — À APPLIQUER en prod (action utilisateur)
3. Secrets E2E — À CONFIGURER dans GitHub Actions (action utilisateur)
4. Edge Functions — À DÉPLOYER sur Supabase (action utilisateur)

## Décision finale
- Démo : OUI
- Pilote 1 magasin : OUI (après actions utilisateur)
- Pilote 3-5 magasins : OUI (après 7j pilote 1)
- Déploiement régional : OUI (après 30j pilote 3-5)
- Déploiement national : OUI (après 60j régional)
