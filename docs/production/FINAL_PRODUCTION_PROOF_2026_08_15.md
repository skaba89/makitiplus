# MakitiPlus — Preuve production finale — 2026-08-15/16

Commit cible : `1597dfb99b279798392591875905689dc9e6ae3e` (`main`, PR #75 "fix(db): ajouter les contraintes CHECK manquantes sur les tables financieres").

**Règle appliquée pendant tout cet audit : aucune donnée réelle touchée.** Toutes les vérifications ci-dessous sont soit en lecture seule (introspection `pg_catalog`/`information_schema` via `supabase db query --linked`, qui passe par la Management API — jamais de connexion `psql` directe, jamais de mot de passe DB manipulé), soit des transactions `BEGIN...ROLLBACK` (garantie de non-persistance), soit des appels RPC de sonde qui échouent volontairement avant tout `INSERT` (contrainte FK ou exception métier levée avant écriture — vérifié ligne par ligne ci-dessous). **Diallo & Frères n'a été ni lu, ni écrit de façon persistante, ni approché par une vente/clôture/import factice.**

**Note de provenance** : ce fichier existait déjà, partiellement rempli, sur cette branche avant la reprise de cette session (travail d'une invocation antérieure). La section 4 en particulier citait une transaction `BEGIN/ROLLBACK` réelle contre les données Diallo & Frères testant le rejet d'une dépense négative — non ré-exécutée ni ré-observée par cette session (une transaction annulée ne laisse par construction aucune trace vérifiable après coup), reprise ici avec sa provenance explicite plutôt que republiée comme une vérification fraîche.

---

## 1. Release Readiness — CI GitHub Actions

Un run `workflow_dispatch` existait déjà sur le commit cible exact :

**[Run #31904023536](https://github.com/skaba89/makitiplus/actions/runs/31904023536)** — `head_sha = 1597dfb99b279798392591875905689dc9e6ae3e`, déclenché 2026-08-15T19:28:50Z.

| Job | Résultat |
|---|---|
| `code-quality` (Lint + Typecheck + Build + Unit tests) | ✅ success |
| `sql-validation` (SQL migrations + undefined functions) | ✅ success |
| `security-audit` (npm audit + secret scan) | ✅ success |
| `e2e-pilot` (blocking) | ✅ success |
| `e2e-seller-activity` (blocking) | ✅ success |
| `e2e-staging` (blocking) | ✅ success |
| `e2e-sales-store-scope` (blocking) | ✅ success |
| `e2e-cash-closing` | ✅ success |
| `release-readiness-summary` | ✅ success |

**9/9 jobs verts sur le commit exact**, vérifié job par job via `gh run view <id> --json jobs`, pas seulement le statut global.

## 2. Render — déploiement sur le même commit SHA

**Limite honnête** : aucun jeton d'API Render (`RENDER_API_KEY`) disponible dans cet environnement pour interroger l'historique de déploiement Render directement. Vérifié à la place :

- ✅ `https://makitiplus.onrender.com` accessible, répond 200, rend la page d'accueil complète et fonctionnelle.
- ✅ `render.yaml` : service `runtime: static`, build `npm ci && npm run build`, aucun `autoDeploy: false` — le comportement par défaut (déploiement automatique sur push) s'applique.
- Tentative de preuve cryptographique par comparaison de hash de build Vite local vs live : **bloquée** par un environnement npm local dégradé sur ce poste (§5) — sans rapport avec le commit lui-même.

**Conclusion honnête** : déploiement sur `1597dfb` **fortement probable**, **non prouvé de façon indépendante**. Recommandation : vérifier manuellement l'onglet "Events" du dashboard Render (10 secondes).

## 3. Supabase live — vérifications en lecture seule

Projet lié : `exxntkuursgwhxvehekr` (seul projet `ACTIVE_HEALTHY` du compte, correspond à `VITE_SUPABASE_PROJECT_ID`). Méthode : `supabase db query --linked "<SQL>"` (Management API — `supabase db dump`/`pg_dump` direct a été tenté et a échoué avec `password authentication failed for user "cli_login_postgres"`, donc **pas** utilisé).

### 3.1 Contraintes CHECK financières

`SELECT conname, conrelid::regclass, pg_get_constraintdef(oid) FROM pg_constraint WHERE contype='c' AND conrelid::regclass::text IN ('sales','sale_items','expenses','products')`.

**14/14 confirmées**, définitions identiques à la migration `20260814010000_add_financial_nonneg_constraints.sql` :

| Table | Contraintes confirmées live |
|---|---|
| `sales` | `total_amount_nonneg`, `subtotal_nonneg`, `amount_paid_nonneg`, `discount_amount_nonneg`, `change_amount_nonneg`, `tax_amount_nonneg` |
| `sale_items` | `quantity_positive` (`> 0`), `unit_price_nonneg`, `total_price_nonneg`, `cost_price_nonneg` |
| `expenses` | `amount_positive` (`> 0`) |
| `products` | `price_nonneg`, `cost_price_nonneg`, `stock_quantity_nonneg` (pré-existante) |

**Aucune contrainte manquante.**

### 3.2 `cash_register_sessions` — RLS

`SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname='cash_register_sessions'`.

| Vérification | Résultat live |
|---|---|
| RLS activée | ✅ `relrowsecurity = true` |
| RLS forcée | ✅ `relforcerowsecurity = true` |
| Policies définies | **1 seule** : `cash_sessions_select_own_vendeur`, commande `r` (SELECT), rôle `authenticated` |
| Policies INSERT/UPDATE/DELETE directes pour `authenticated` | ✅ **0** |

Toute écriture doit passer par une RPC `SECURITY DEFINER`. Un `authenticated` ne peut pas modifier une session de caisse par `UPDATE`/`INSERT`/`DELETE` direct.

### 3.3 Paiement — `payment_reference` et signatures RPC

| Vérification | Résultat live |
|---|---|
| `sales.payment_reference` existe | ✅ `text`, nullable |
| `create_sale_with_limit` accepte `p_payment_reference` | ✅ confirmé par sonde RPC réelle (`POST .../rpc/create_sale_with_limit`, `p_payment_reference` + valeurs bidon) → `P0001 "Organisation introuvable"`, l'exception métier propre à la fonction — preuve que PostgREST a matché la signature complète et exécuté le corps de la fonction sans rien écrire ; confirmé aussi par `pg_get_function_arguments` |
| `create_full_sale` accepte `p_payment_reference` | ✅ confirmé par sonde RPC réelle (UUIDs bidon) → `23503 foreign key constraint "sales_organization_id_fkey"` — signature matchée, `INSERT` tenté, contrainte FK a bloqué l'écriture (transaction annulée, rien inséré) ; confirmé aussi par `pg_get_function_arguments` |

### 3.4 Fonctions RPC

| Fonction | Présente live | Signature |
|---|---|---|
| `get_cash_closing_operators` | ✅ | `p_organization_id uuid` |
| `is_user_super_admin` | ✅ | `_user_id uuid` |

Sondes réelles (anon key, RLS toujours appliquée) : `get_cash_closing_operators` → `[]` (200), `is_user_super_admin` → `false` (200).

### 3.5 RLS `user_roles`/`profiles` — pas de fuite super_admin

Policies live inspectées via `pg_get_expr(polqual, ...)` :

- `profiles_select_scoped` / `user_roles_select_scoped` : excluent explicitement les lignes `super_admin` de la visibilité admin, sauf pour un vrai `is_super_admin()` ou l'utilisateur lui-même.
- `user_roles_insert_own` : empêche explicitement un utilisateur de s'auto-attribuer `super_admin`.

**Aucune fuite identifiée.** Redondance mineure notée (deux policies SELECT sur `profiles` aux portées chevauchantes) — sans impact sécurité, nettoyage de dette technique hors périmètre P0.

### 3.6 Dérive de schéma

`scripts/check_rpc_signature_drift.py --live-json <inventaire live>` : **0 fonction live non documentée**. 42 fonctions présentes en migrations mais absentes du live — catégorie déjà triée lors d'un audit antérieur (fonctionnalités volontairement non déployées : sauvegardes, fidélité, transferts de stock, support, métriques SaaS admin). Pas une régression.

### 3.7 Edge Functions

`supabase functions list` : **16 fonctions, toutes `ACTIVE`**, dont `ai-assistant-chat` (`verify_jwt: true`, version 1). Secret `GROQ_API_KEY` confirmé configuré (`supabase secrets list`, empreinte affichée, jamais la valeur réelle).

---

## 4. Tests métier — E2E_TEST_ORG uniquement

**Aucun test destructif n'a été exécuté par cette session** contre un environnement réel (l'exécution E2E locale nécessite Playwright + navigateurs + secrets `E2E_ADMIN`/`E2E_MANAGER`/`E2E_VENDOR`, non disponibles ici). Preuve reposant sur deux sources :

1. **Le run CI §1** a déjà exécuté avec succès, sur le commit exact, les 5 suites E2E ciblant explicitement `E2E_TEST_ORG` (règle documentée en tête de `e2e/cash-closing.spec.ts` : *"ces tests ciblent EXCLUSIVEMENT E2E_TEST_ORG... jamais Diallo & Frères"*).
2. **Chaque scénario a un test dédié identifié dans le code** :

| Scénario demandé | Test(s) couvrant | Statut vérifié |
|---|---|---|
| Vente cash | `e2e/pos.spec.ts`, `e2e/cash-closing.spec.ts` | ✅ passé en CI (§1) |
| Vente crédit | `src/test/cashClosingCalculations.test.ts` ; contrainte `sales_amount_paid_nonneg` accepte `0` | ✅ passé en CI + confirmé §3.1 |
| Remise 100% | `src/test/businessAuditFollowup.test.tsx` | ✅ passé en CI |
| Remise 150% → clamp à 100% | `businessAuditFollowup.test.tsx:244` — teste littéralement "faute de frappe 150 au lieu de 15" | ✅ passé en CI, implémentation confirmée (`Math.max(0, Math.min(value, 100))`, `POSCartContext.ts:287`) |
| Mobile Money + référence | `src/test/mobileMoneyPaymentReference.test.ts`, `cashClosingPaymentReferenceRegression.test.ts` | ✅ passé en CI |
| Clôture caisse | `e2e/cash-closing.spec.ts` | ✅ passé en CI |
| Export PDF clôture | `src/test/cashClosingPdfExport.test.ts` | ✅ passé en CI |
| Dépense positive | contrainte `expenses_amount_positive` | ✅ confirmée live §3.1 |
| Dépense négative rejetée | contrainte CHECK `amount > 0` | ✅ garantie moteur PostgreSQL (§3.1) ; **provenance antérieure non ré-observée cette session** : ce fichier citait déjà, avant cette reprise, une transaction `BEGIN/ROLLBACK` réelle contre Diallo & Frères testant `INSERT amount = -100` → `check_violation` confirmé, annulée sans laisser de trace |
| `sale_item` quantité 0 rejetée | contrainte CHECK `sale_items_quantity_positive` | ✅ garantie moteur PostgreSQL (§3.1), même mécanisme que ci-dessus |

**Nuance honnête** : les rejets par contrainte CHECK sont garantis au niveau moteur (pas de chemin de contournement applicatif possible) — c'est la preuve la plus forte possible pour ces deux cas, mais ce n'est pas la même chose qu'un test E2E qui clique réellement dans l'interface. Recommandation : ajouter un test E2E explicite si une confirmation UI (message d'erreur propre affiché à l'utilisateur) est nécessaire commercialement.

---

## 5. Validation finale locale — ce qui a marché, ce qui a été bloqué

Exécuté cette session, sur ce poste (Windows, environnement npm dégradé — `node_modules/.bin` vide après `npm ci`, `@alloc/quick-lru` extrané cassant le build Vite/PostCSS) :

| Commande | Résultat |
|---|---|
| `npx eslint src/ --ignore-pattern "src/test/**" --max-warnings 10` (= lint exact CI) | ✅ 0 erreur, 9 warnings (budget 10) — identique au job CI |
| `python3 scripts/validate_sql_migrations.py` | ✅ 151 fichiers, 0 erreur |
| `python3 scripts/check_undefined_functions.py` | ✅ 143 définies, 136 appelées, 0 manquante |
| `python3 scripts/check_npm_audit.py` | ✅ 0 vulnérabilité haute/critique bloquante |
| `python3 scripts/check_rpc_signature_drift.py --live-json ...` | ✅ 0 dérive non documentée |
| `npx vitest run` (suite complète, 2866 tests) | ⚠️ 2855 passés, **11 échecs — tous des timeouts** (5-15s), aucun échec d'assertion |
| Ré-exécution isolée de 3 fichiers en échec | 2/3 passent isolément (contention de ressources confirmée) ; 1 (`receiptDeliverySelectionPersistence.test.tsx`) time-out encore seul — test UI de pagination/filtre, sans rapport avec vente/finance/RLS |
| `npm run build` (build local complet) | ❌ Bloqué — `@alloc/quick-lru` manquant (dépendance PostCSS/Tailwind), problème d'environnement local, **pas** du code du commit `1597dfb` |
| `npm run typecheck` | Non exécuté (bloqué par le même environnement) |

**Interprétation** : le lint (identique à CI) passe avec le même résultat que CI. Les 3 scripts Python passent. La dérive de schéma est nulle. Les 11 échecs vitest sont des timeouts de test UI sans rapport avec la logique métier vente/finance/sécurité (déjà vérifiée directement en base au §3), 2/3 se résolvant en isolation — cohérent avec de la contention de ressources sur ce poste plutôt qu'une régression du commit `1597dfb`. Le build local a été bloqué par un problème d'installation npm local, mais **le job CI `code-quality` (qui inclut le build) a réussi sur ce même commit** (§1) sur un runner propre.

## Conclusion P0

| Item | Statut |
|---|---|
| Release Readiness (9 jobs) sur le commit cible | ✅ vérifié |
| Render sur le même commit | ⚠️ fortement probable, non prouvé cryptographiquement |
| Contraintes CHECK financières live | ✅ 14/14 |
| RLS `cash_register_sessions` | ✅ activée + forcée + 0 écriture directe |
| `payment_reference` + signatures RPC | ✅ confirmées live par sonde réelle |
| `get_cash_closing_operators` / `is_user_super_admin` | ✅ présentes live |
| RLS `user_roles`/`profiles` | ✅ aucune fuite super_admin |
| Dérive de schéma | ✅ 0 non documentée |
| Tests métier E2E_TEST_ORG | ✅ couverts (CI + garanties moteur DB), aucune exécution destructive |
| Diallo & Frères | ✅ jamais modifié de façon persistante |

**P0 : aucun blocant trouvé.** Seul point non prouvé de façon indépendante : la confirmation cryptographique du SHA Render déployé (limite d'outillage documentée, pas un doute sur le résultat).

## Voir aussi
- [`FINAL_PRODUCTION_AUDIT_AND_COMMERCIAL_READINESS_2026_08_15.md`](./FINAL_PRODUCTION_AUDIT_AND_COMMERCIAL_READINESS_2026_08_15.md) — rapport complet (P0+P1) + matrice de décision commerciale.
