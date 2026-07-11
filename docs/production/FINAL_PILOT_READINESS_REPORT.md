# MakitiPlus — Final Pilot Readiness Report

## État global

- **Score : 8.7 / 10**
- **Décision : NON PRÊT pour lancement magasin pilote tant que les blocages CI et store-plan-enforcement ne sont pas corrigés**
- **Date : 2026-07-06**
- **Branche : `hotfix/final-pilot-validation-no-regression`**
- **Base de validation : `main` après intégration des corrections SQL P0**

## Synthèse exécutive

Les corrections P0 SQL/billing précédentes sont validées : les migrations destructives cleanup ont été supprimées, la RPC dangereuse `update_organization_subscription(TEXT, TEXT, TEXT)` n'est plus recréée ni grantée à `authenticated`, et les tests SQL safety passent.

Cependant, la validation finale ne peut pas conclure à un feu vert magasin pilote parce que GitHub Actions échoue encore sur les tests unitaires, et un risque réel de contournement de limite de boutiques reste présent dans le flux de création de magasin.

## Corrections vérifiées

- Migration destructive `20260706090000_cleanup_final.sql` supprimée.
- Migrations cleanup destructives `20260706070000_cleanup_all_data_fixed.sql` et `20260706080000_cleanup_robust.sql` supprimées.
- RPC dangereuse `update_organization_subscription(TEXT, TEXT, TEXT)` non recréée.
- Aucun `GRANT EXECUTE` vers `authenticated` sur la RPC dangereuse.
- Migration de suppression `20260706180000_remove_unsafe_update_organization_subscription.sql` conservée.
- `_deploy_combined.sql` régénéré sans bloc SQL destructif et sans recréation de RPC dangereuse.
- `OrganizationManagement` réservé à `super_admin`.
- `OrganizationManagement` utilise `admin_update_organization_subscription`.
- Suppression organisation protégée par saisie exacte du nom.
- Champ trompeur “Nouveau statut” absent.
- `Billing.tsx` utilise la RPC sécurisée `admin_update_organization_subscription`.
- `Billing.tsx` affiche la gestion manuelle seulement au `super_admin`.
- POS/offline non refactoré.
- Recherche produit offline et queue RPC offline conservées.

## Commandes exécutées / vérifiées

### Exécutées localement par l'utilisateur sur la branche hotfix

```bash
python3 scripts/validate_sql_migrations.py
npm test -- --run src/test/sqlSafety.test.ts
```

Résultat confirmé :

- SQL validator : **PASSED — 0 erreur**
- SQL safety tests : **161 tests passed**

### Vérifiées via GitHub Actions sur PR #10

Workflow `CI`, run `28812413989` :

- `npm ci` : success
- lint CI : success
- typecheck CI : success
- build CI : success
- unit tests : failure
- SQL validator : skipped car le job s'arrête avant cette étape
- audit high : skipped
- secret scan : skipped
- pilot-e2e : skipped car dépend de `build-and-test`

## Résultats

| Contrôle | Résultat | Commentaire |
|---|---:|---|
| `npm ci` | OK | Validé localement et CI |
| `npm run lint` / lint CI | OK en CI | CI utilise `npx eslint src/ --ignore-pattern 'src/test/**' --max-warnings 10` |
| `npm run typecheck` | OK | Validé localement et CI |
| `npm run build` | OK | Validé localement et CI |
| `npm test -- --run src/test/sqlSafety.test.ts` | OK | 161 tests passés |
| `python3 scripts/validate_sql_migrations.py` | OK | 0 erreur |
| `npm audit --audit-level=high` | OK local précédent | 0 vulnérabilité dans le run local précédent |
| GitHub Actions unit tests complets | KO | Job `build-and-test` échoue à l'étape Unit tests |
| `npm run e2e:pilot` | NON VALIDÉ | Skipped en CI parce que unit tests KO |

## Bugs trouvés

### B1 — CI bloquée sur les tests unitaires complets

GitHub Actions échoue sur `build-and-test`, étape `Unit tests`. Les étapes précédentes — install, lint, typecheck, build — passent, mais les étapes suivantes sont automatiquement ignorées.

**Impact : bloquant production pilote.**

Tant que la CI ne passe pas entièrement, le projet ne doit pas être considéré prêt pour un magasin pilote.

### B2 — Création de magasin : risque de contournement de limite serveur

`Stores.tsx` utilise encore la RPC `create_first_organization` pour créer un magasin. Or, dans la migration `create_first_organization`, lorsque l'utilisateur possède déjà une organisation, la fonction insère directement dans `public.stores` sans passer par `check_plan_limit('stores')`.

La RPC sécurisée `create_store` existe déjà et vérifie la limite de plan avant insertion. Le frontend doit donc utiliser `create_store` pour l'ajout de magasin dans une organisation existante, et garder `create_first_organization` uniquement pour le vrai cas d'initialisation d'une première organisation.

**Impact : bloquant production pilote si les limites de boutiques sont une règle commerciale contractuelle.**

### B3 — Commentaire obsolète non exécutable dans SQL combiné

Le SQL exécutable est sécurisé, mais un commentaire obsolète subsiste dans la migration historique et dans `_deploy_combined.sql`, indiquant encore que `update_organization_subscription` serait créée pour Billing. Ce n'est pas un risque d'exécution, mais cela peut induire en erreur un développeur ou un auditeur.

**Impact : non bloquant runtime, à nettoyer avant merge final.**

## Bugs corrigés dans cette phase

Aucune correction applicative n'a été appliquée dans cette phase finale, car le rôle de cette étape était de valider sans refonte et d'éviter les modifications non prouvées. Les corrections SQL P0 avaient déjà été intégrées dans `main`.

## Preuves anti-régression

- `sqlSafety.test.ts` vérifie l'absence de SQL destructif global dans toutes les migrations.
- `sqlSafety.test.ts` vérifie que `update_organization_subscription(TEXT,TEXT,TEXT)` n'est plus recréée ni grantée à `authenticated`.
- `sqlSafety.test.ts` vérifie que `Billing.tsx` et `OrganizationManagement.tsx` n'appellent pas la RPC dangereuse.
- `sqlSafety.test.ts` vérifie la confirmation forte de suppression organisation.
- `sqlSafety.test.ts` vérifie les invariants POS/offline.
- `productionPilotReadiness.test.ts` vérifie la stricte CI, le job `pilot-e2e`, les scripts npm, POS/offline, billing et documentation.
- `e2e/pilot-critical.spec.ts` couvre auth, pricing, login pilote, dashboard, POS, billing et route organisations, sans mutation destructive.

## Fichiers vérifiés

- `package.json`
- `.github/workflows/ci.yml`
- `src/pages/OrganizationManagement.tsx`
- `src/pages/Billing.tsx`
- `src/pages/Stores.tsx`
- `src/hooks/useOfflineSale.ts`
- `src/hooks/useProductSearch.ts`
- `src/components/pos/ProductAutocomplete.tsx`
- `src/test/sqlSafety.test.ts`
- `src/test/productionPilotReadiness.test.ts`
- `e2e/pilot-critical.spec.ts`
- `supabase/migrations/20260705040000_admin_subscription_management.sql`
- `supabase/migrations/20260705050000_secure_manual_subscription_management.sql`
- `supabase/migrations/20260706100000_create_first_organization_rpc.sql`
- `supabase/migrations/_deploy_combined.sql`

## Fichiers volontairement non modifiés

- POS principal : pas de refonte.
- Offline queue : pas de refonte.
- Stripe checkout/portal : pas de modification.
- `OrganizationManagement.tsx` : déjà conforme aux points de sécurité principaux.
- `Billing.tsx` : déjà conforme sur le modèle super_admin.
- Migrations SQL sécurisées existantes : pas de modification destructive.

## Variables nécessaires production pilote

```text
VITE_SUPABASE_URL
VITE_SUPABASE_PROJECT_ID
VITE_SUPABASE_PUBLISHABLE_KEY
VITE_STRIPE_PUBLISHABLE_KEY
VITE_SENTRY_DSN
VITE_SENTRY_ENVIRONMENT
VITE_DEMO_MODE=false
VITE_APP_VERSION
CRON_SECRET
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
SUPABASE_SERVICE_ROLE_KEY
E2E_TEST_EMAIL
E2E_TEST_PASSWORD
```

Ne jamais stocker les vraies valeurs dans le repository.

## Risques restants

### Bloquants

1. GitHub Actions unit tests KO.
2. `Stores.tsx` doit utiliser `create_store` pour l'ajout de magasin dans une organisation existante.
3. `npm run e2e:pilot` non validé en CI car le job est skipped après échec unit tests.

### Non bloquants mais à corriger

1. Commentaire obsolète sur `update_organization_subscription` dans la migration historique et dans `_deploy_combined.sql`.
2. E2E login dépendants des secrets `E2E_TEST_EMAIL` et `E2E_TEST_PASSWORD`.
3. Test terrain magasin réel à faire après CI verte.
4. Sauvegarde Supabase + plan rollback à préparer avant pilote.

## Actions correctives minimales recommandées

### A1 — Corriger Stores.tsx sans refonte

- Remplacer le flux principal de création de magasin par `supabase.rpc("create_store", ...)`.
- Garder `create_first_organization` uniquement comme fallback si l'utilisateur n'a pas encore d'organisation.
- Ne pas modifier la logique POS/offline.
- Ne pas modifier Stripe.

### A2 — Corriger les tests unitaires complets

Relancer :

```bash
npm test -- --run
```

Corriger uniquement les tests réellement en échec, sans assouplir les règles de sécurité.

### A3 — Régénérer `_deploy_combined.sql` après nettoyage du commentaire historique

Nettoyer le commentaire obsolète, puis régénérer le fichier combiné pour éviter toute incohérence documentaire.

### A4 — Relancer la validation complète

```bash
npm ci
npm run lint
npm run typecheck
npm run build
npm test -- --run
python3 scripts/validate_sql_migrations.py
npm audit --audit-level=high
npm run e2e:pilot
```

## Décision finale

- **Magasin pilote : NON PRÊT maintenant**
- **Condition de feu vert magasin pilote : CI GitHub Actions verte + correction du flux `create_store` + E2E pilote exécuté ou secrets manquants explicitement documentés**
- **Plusieurs magasins : NON PRÊT**
- **Production large : NON PRÊT**

Le projet est proche du pilote, mais il ne faut pas lancer tant que la CI complète n'est pas verte et que la création de magasin ne passe pas par la RPC avec limite serveur.
