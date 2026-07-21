# Audit initial — National Production Readiness

**Date** : 2026-07-21
**Branche** : `production-ready/national-hardening-no-regression`
**Commit de départ** : `97c56d29504867f0a6444f3afc02a5a2e797e868`
**Règle 0** : aucune donnée réelle (Diallo & Frères) n'a été lue, modifiée ni supprimée pendant cet audit. Tous les contrôles ci-dessous sont statiques (lint/typecheck/build/tests) ou en lecture seule (introspection Supabase CLI éventuelle). Aucune commande destructive n'a été exécutée.

## Méthode

Séquence exécutée telle que définie dans le prompt de mission, dans l'ordre : `git status` → `git pull` (déjà à jour) → `npm ci` (environnement déjà installé, non ré-exécuté pour ne pas perturber node_modules) → `npm run lint` → `npm run typecheck` → `npm run build` → `npm test -- --run` → `validate_sql_migrations.py` → `check_undefined_functions.py` → `npm audit --audit-level=high` → `e2e:pilot` → `e2e:seller-activity` → `e2e:staging` → `e2e:sales-store-scope`.

**Deux bugs bloquants ont été découverts *pendant* cet audit et corrigés immédiatement**, car ils empêchaient l'audit lui-même de produire un résultat honnête (l'un cassait le rendu de l'app en mode dev, donc quasiment tous les scénarios E2E ; l'autre cassait le *parsing* d'un fichier de test entier). Sans ces deux corrections, l'audit initial aurait rapporté des faux échecs (app "cassée") ou une suite E2E entière invisible (0 test découvert), ce qui aurait été trompeur. Ce sont des corrections chirurgicales, aucune donnée n'a été touchée. Voir section "Bugs trouvés et corrigés pendant l'audit".

## État initial par vérification

| Vérification | Commande réelle exécutée | Résultat |
|---|---|---|
| Lint (scope réel utilisé par `npm run check` / CI) | `eslint src/ --ignore-pattern 'src/test/**' --max-warnings 10` | ✅ **0 erreur**, 10 warnings (exactement au plafond `--max-warnings 10`) → exit 0 |
| Lint (brut, `npm run lint` = `eslint .`) | `eslint .` | ⚠️ 68 erreurs, 10 warnings sur l'ensemble du repo (inclut `src/test/**`, `supabase/functions/`, `tailwind.config.ts` — hors du scope réellement appliqué en CI) |
| Typecheck (script `npm run typecheck`) | `tsc --noEmit` | ⚠️ **Faux positif connu** : `tsconfig.json` racine a `files: []` + `references`, donc `tsc --noEmit` sans `-p` ne vérifie **rien** et retourne toujours exit 0, y compris avec des erreurs réelles. **Ce n'est pas un vrai contrôle.** |
| Typecheck réel | `tsc --noEmit -p tsconfig.app.json` | ❌ **387 erreurs réelles**, concentrées presque entièrement dans `src/test/**` (mocks typés `any`/`null` incompatibles, imports inutilisés) et dans `src/utils/receiptGenerator.ts` (`Cannot find name 'jsPDF'` × 5 — type global manquant). Aucune erreur dans les 3 fichiers touchés par les correctifs de cet audit. |
| Build production | `npm run build` | ✅ Succès, `dist/` généré + service worker PWA (`sw.js`, 64 entrées précachées, 4145 KiB) |
| Tests unitaires | `npm test -- --run` (Vitest) | ❌ **1033 passed / 4 failed** sur 1037 (76/80 fichiers). Résultat identique avant et après les correctifs Bug A/B (confirmé par ré-exécution complète) — aucune régression introduite. Échecs : `authPromiseHandling` (assertion fragile sur le code source littéral), `currencyConversion` (chemin absolu Linux codé en dur `/home/z/my-project/makitiplus/...`, `ENOENT` sur Windows — bug de portabilité du test, pas du code applicatif), `adminAnalyticsRegression`, `resetTokensPanelE2E` (timeout 5000ms dépassé). Détail dans P0.4. |
| `validate_sql_migrations.py` | `python3 scripts/validate_sql_migrations.py` | ✅ **0 erreur** / 129 fichiers vérifiés (le script crashe de façon cosmétique sur l'impression finale ✅ à cause de l'encodage cp1252 de la console Windows — n'affecte pas le résultat) |
| `check_undefined_functions.py` | `python3 scripts/check_undefined_functions.py` | ✅ **0 fonction `public.*` appelée non définie** — 129 fonctions définies, 123 appelées, 135 fichiers de migration analysés (même crash cosmétique cp1252 en fin de script) |
| `npm audit --audit-level=high` | — | ⚠️ **1 vulnérabilité high** : `brace-expansion` (DoS via expansion exponentielle de `{}`) — uniquement dans des dépendances de *tooling* (`@typescript-eslint`, `glob`, `workbox-build`), **pas dans le bundle runtime livré aux utilisateurs**. Fix disponible via `npm audit fix`. |
| `npm run e2e:pilot` | Playwright, `e2e/pilot-critical.spec.ts` | ✅ **4 passed / 10 skipped** (skip attendu : credentials `E2E_*` non configurés localement) — **avant correctif : 4 échecs sur ces mêmes 4 tests**, voir ci-dessous |
| `npm run e2e:seller-activity` | Playwright, `e2e/seller-activity.spec.ts` | ✅ 8 skipped (credentials non configurés — comportement attendu) |
| `npm run e2e:staging` | Playwright, `e2e/staging-real-flow.spec.ts` | ✅ 22 skipped — **avant correctif : `SyntaxError`, 0 test découvert, fichier entier illisible par Playwright**, voir ci-dessous |
| `npm run e2e:sales-store-scope` | Playwright, `e2e/sales-store-scope.spec.ts` | ✅ 14 skipped (credentials non configurés — comportement attendu) |

## Bugs trouvés et corrigés pendant l'audit

### Bug A — Rendu vide en mode `npm run dev` (bloquant pour tout le pipeline E2E)

- **Symptôme** : sur `npm run dev` (port 8080), `#root` restait vide (`innerHTML.length === 0`) indéfiniment sur `/auth`, sans **aucune** erreur console, avec `readyState: "complete"` et ~200 requêtes modules toutes en 200 OK. Le build de production (`npm run preview`) et Render fonctionnaient normalement — le bug était strictement spécifique au serveur de dev non-bundlé.
- **Gravité réelle** : **P0**, pas un simple confort développeur. `playwright.config.ts:41` définit `webServer.command: "npm run dev"` — donc **toute** la suite E2E (`e2e:pilot`, `e2e:seller-activity`, `e2e:staging`, `e2e:sales-store-scope`, et par extension `check:national-readiness` et la CI) tournait contre cette instance cassée. C'est la cause directe des 4 échecs constatés dans `e2e:pilot` sur les scénarios "page auth accessible" / "page pricing accessible" — échecs qui n'avaient **rien à voir** avec les credentials manquants.
- **Cause racine identifiée** : `SyntaxError: Identifier 'useOrgSelector' has already been declared`, provoquée par un **double import** du même hook dans le même fichier, dans trois fichiers :
  - [src/pages/Suppliers.tsx](../../src/pages/Suppliers.tsx) (lignes 13 et 17)
  - [src/pages/Products.tsx](../../src/pages/Products.tsx) (lignes 13 et 44)
  - [src/pages/Expenses.tsx](../../src/pages/Expenses.tsx) (lignes 58 et 62)

  En mode dev (transformation par fichier via esbuild, ESM natif), une redéclaration du même identifiant importé dans le même module est une `SyntaxError` qui casse le chargement du graphe de modules. Le bundler de production (Rollup) tolère/fusionne silencieusement ce cas, ce qui explique pourquoi seul le mode dev était affecté — d'où la confusion initiale.
- **Correctif appliqué** : suppression de la ligne d'import dupliquée dans les 3 fichiers (aucune logique modifiée, seul le second `import { useOrgSelector } from "@/hooks/useOrgSelector";` redondant a été retiré).
- **Vérification** : `rootLen` passe de `0` à `5691` sur `npm run dev` (valeur identique au build de production). `e2e:pilot` repasse de 4 échecs à 4 succès. `tsc --noEmit -p tsconfig.app.json` ne rapporte aucune erreur sur ces 3 fichiers (suppression de code strictement mort). `npm run build` reste vert.
- **Hypothèse écartée** : Sentry `replayIntegration()` avait été suspecté initialement (DSN actif en dev) ; testé en isolant avec `VITE_SENTRY_DSN=""` — le bug persistait à l'identique, ce qui a permis d'écarter cette piste et de continuer l'investigation vers la vraie cause.

### Bug B — `e2e/staging-real-flow.spec.ts` illisible par Playwright (0 test découvert)

- **Symptôme** : `npm run e2e:staging` échouait immédiatement avec `SyntaxError: Unterminated regular expression` à la ligne 200, et **aucun test n'était découvert** (`No tests found`) — la suite complète de 22 scénarios (Diagnostic, Login admin, création produit, vente cash, vente offline, billing sécurité, suppression organisation sécurisée) était donc **totalement invisible** pour Playwright, en local comme en CI, quel que soit l'état des credentials.
- **Cause racine** : typo dans un littéral regex — `/valider|confirmer|i }` au lieu de `/valider|confirmer/i }` : le flag `i` avait été absorbé dans l'alternation au lieu de fermer le regex, rendant le littéral non terminé.
- **Correctif appliqué** : [e2e/staging-real-flow.spec.ts:200](../../e2e/staging-real-flow.spec.ts) — `/valider|confirmer/i` (fermeture correcte du regex avant le flag).
- **Vérification** : le fichier se parse maintenant correctement, les 22 tests sont découverts et skippent proprement (credentials staging non configurés localement — comportement attendu, pas un échec).

## Risques critiques identifiés (non encore corrigés)

1. **`npm run typecheck` est un faux gate** : ne vérifie rien à cause de `tsconfig.json` racine (`files: []` + `references` sans `-p`). Ce script est utilisé tel quel dans `npm run check` (donc dans `check:national-readiness` et probablement en CI) — **387 erreurs de type réelles ne sont actuellement jamais détectées automatiquement**. Impact majeur sur la fiabilité du gate CI. À traiter en priorité (P1.1 / process CI), sans réécriture non nécessaire du reste du pipeline.
2. **387 erreurs TypeScript réelles** (via `tsc --noEmit -p tsconfig.app.json`), majoritairement dans `src/test/**` (mocks mal typés) et `src/utils/receiptGenerator.ts` (type global `jsPDF` non résolu, 5 occurrences). À trier : certaines sont de la dette de test bénigne, `receiptGenerator.ts` mérite une vérification dédiée (génération de reçus = fonctionnalité visible pilote).
3. **4 tests unitaires en échec** (`authPromiseHandling`, `currencyConversion`, `adminAnalyticsRegression`, `resetTokensPanelE2E`) — à traiter en P0.4, aucun lien avec les bugs A/B ci-dessus.
4. **1 vulnérabilité npm high** (`brace-expansion`, tooling uniquement) — fix mécanique disponible, faible risque réel mais à appliquer par hygiène.
5. Les 4 suites E2E credentialées (`e2e:pilot` scénarios 3-7, `e2e:seller-activity`, `e2e:staging`, `e2e:sales-store-scope`) n'ont **jamais réellement exécuté leurs assertions métier** dans cet environnement faute de `E2E_*` configurés — donc aucune garantie réelle n'existe encore sur login pilote, POS, offline/sync, billing par rôle, ou suppression d'organisation sécurisée. Ce n'est pas un bug, mais un **angle mort de couverture** tant que ces variables ne sont pas fournies (probablement en CI/staging uniquement, jamais avec les identifiants Diallo & Frères réels).

## P0.3 — Vérification des 7 migrations critiques (2026-07-20)

Les 7 migrations critiques identifiées sont celles datées du 2026-07-20 (hors la migration explicitement `OPTIONAL_backfill_sale_items_cost_price.sql`, qui reste **volontairement non exécutée** — RULE 1) :

1. `p0_security_fix_kpi_rpcs_org_scoping.sql`
2. `fix_kpi_rpcs_sale_items_fanout.sql`
3. `fix_admin_kpis_fanout_and_bad_column.sql`
4. `fix_create_full_sale_orphaned_overload.sql`
5. `reassert_hide_super_admin_from_audit_log.sql`
6. `document_live_receive_purchase_order.sql`
7. `document_live_generate_order_number.sql`

**Constat initial préoccupant** : `supabase migration list --linked` montre `remote: ""` pour la quasi-totalité des 137 migrations locales (y compris ces 7) — ce qui semble indiquer qu'aucune n'est appliquée. **C'est trompeur** : ce projet a été géré en partie par SQL direct sur Supabase (hors `supabase db push`), comme le documentent explicitement les migrations 6 et 7 elles-mêmes (fonctions trouvées déployées avec une signature différente de celle du dépôt). La table de suivi `supabase_migrations.schema_migrations` n'est donc pas fiable comme signal ici — seule l'inspection du schéma réel fait foi.

**Vérification effectuée (lecture seule, aucune donnée modifiée)** via `supabase db query --linked` (introspection `pg_proc`/`pg_policy`) :

| Migration | Vérification | Résultat |
|---|---|---|
| 4. `create_full_sale` overload orphelin | `overload_count` sur `create_full_sale` | ✅ **1 seul overload** en base (plus d'orphelin) ; corps live contient bien la capture `cost_price` au moment de la vente |
| 1. Org-scoping KPI RPCs | Corps complet de `get_product_kpis_by_period` | ✅ `IF is_super_admin() THEN v_org_id := p_organization_id ELSE v_org_id := get_user_organization_id()` — confirme que seul le super_admin peut passer `NULL` pour voir toutes les orgs ; les autres rôles sont forcés sur leur propre org quel que soit le paramètre envoyé |
| 2/3. Fan-out ventes → KPI gonflés | `get_admin_org_kpis`, `get_admin_global_kpis`, `get_enhanced_dashboard_stats`, `get_seller_kpis_detailed`, `get_category_kpis` | ✅ Les 5 utilisent un CTE (`WITH ...`) ; 4/5 utilisent `GROUP BY` avant agrégation (le 5ᵉ, `get_admin_global_kpis`, agrège une unique ligne globale — pas de `GROUP BY` nécessaire, comportement attendu) |
| 5. Masquage super_admin dans l'audit | Policy RLS `admins_view_audit_log` sur `user_audit_log` | ✅ Expression `USING` live identique à celle de la migration (super_admin voit tout, admin voit son org hors actions super_admin) |
| 6/7. Signatures live `receive_purchase_order` / `generate_order_number` | Signatures confirmées par construction (ces migrations réaffirment `pg_get_functiondef` déjà extrait de la base) | ✅ Cohérent avec le frontend corrigé dans les mêmes commits |

**Conclusion P0.3** : les 7 migrations critiques sont bien reflétées dans le schéma réellement déployé, malgré une table de suivi CLI non fiable. Aucune n'a été ré-exécutée pendant cette vérification (lecture seule uniquement). La migration `OPTIONAL_backfill_sale_items_cost_price.sql` reste non appliquée et **ne doit pas l'être sur Diallo & Frères sans validation explicite du magasin pilote**, conformément à RULE 1.

**Risque additionnel identifié** : la fiabilité de `supabase migration list --linked` comme signal de déploiement est nulle sur ce projet. Toute décision "est-ce déployé ?" doit désormais passer par une introspection réelle du schéma (`pg_get_functiondef`, `pg_policy`), jamais par la table de suivi seule. À documenter dans le futur `SUPABASE_SCHEMA_DRIFT_AUDIT.md` (P1.2).

## P0.4 — Correction des tests unitaires restants

Les 4 tests unitaires en échec (voir tableau initial) ont été corrigés individuellement, causes racines distinctes :

| Test | Cause racine réelle | Correctif |
|---|---|---|
| `adminAnalyticsRegression.test.ts` | Corrigé comme effet de bord de P0.2 (le test vérifiait justement l'absence de `if (error) return []` masqué) | Aucun correctif dédié — résolu par P0.2 |
| `authPromiseHandling.test.ts` | **Faux négatif d'environnement** : `src/contexts/AuthContext.tsx` est checkouté avec des fins de ligne CRLF sur cette machine Windows (`core.autocrlf`), donc l'assertion littérale `\n` du test ne matchait jamais — sans rapport avec le comportement réel testé | Normalisation `\r\n` → `\n` du contenu source avant assertion dans le test (aucun fichier applicatif modifié) |
| `currencyConversion.test.ts` | Chemin absolu Linux codé en dur (`/home/z/my-project/makitiplus/...`) → `ENOENT` sur Windows | Remplacé par `path.join(process.cwd(), "src/hooks/useExchangeRates.ts")`, portable |
| `resetTokensPanelE2E.test.tsx` | Test légitimement proche de la limite (4.2s sur budget 5000ms en isolation), dépasse sous charge CPU complète (1037 tests en parallèle) — pas un bug fonctionnel | (a) `userMap` dans `ResetTokensPanel.tsx` était recréé à chaque render au lieu d'être mémoïsé (`useMemo` manquant, déjà signalé par ESLint `exhaustive-deps`) — corrigé ; (b) timeout du test porté à 15s pour absorber la variance sous charge CI |

**Résultat final** : `npm test -- --run` → **81/81 fichiers, 1055/1055 tests verts** (0 échec). Confirmé par une exécution complète après tous les correctifs P0.1-P0.4.

## P0.5 — Workflow Release Readiness (GitHub Actions)

**Secrets actuellement configurés sur le repo** (`gh secret list`, noms uniquement — lecture seule, aucune valeur consultée) :
`E2E_TEST_EMAIL`, `E2E_TEST_PASSWORD`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_URL` — soit exactement les 4 secrets **obligatoires** requis par le job bloquant `e2e-pilot` (`.github/workflows/release-readiness.yml:129-143`, qui échoue explicitement si l'un manque).

**Secrets manquants** (utilisés par le workflow mais absents du repo — jobs concernés continueront de skipper gracieusement en interne, ce n'est pas un échec CI mais une perte de couverture) :
`E2E_BASE_URL`, `E2E_ADMIN_EMAIL`/`E2E_ADMIN_PASSWORD`, `E2E_SUPER_ADMIN_EMAIL`/`E2E_SUPER_ADMIN_PASSWORD`, `E2E_MANAGER_EMAIL`/`E2E_MANAGER_PASSWORD`, `E2E_VENDOR_EMAIL`/`E2E_VENDOR_PASSWORD`, `E2E_TEST_ORG_NAME`.

**Bug de workflow trouvé et corrigé** : le job `e2e-staging` (`.github/workflows/release-readiness.yml`) ne transmettait **aucune** variable admin/super_admin dans son bloc `env:`, alors que `e2e/staging-real-flow.spec.ts` en dépend pour les Scénarios B à G. Résultat concret : même si `E2E_ADMIN_EMAIL`/`E2E_SUPER_ADMIN_EMAIL` étaient ajoutés comme secrets GitHub demain, ce job continuerait de ne tester **que** le Scénario A (diagnostic public, sans auth) — 6 scénarios sur 7 resteraient silencieusement non couverts en CI. Corrigé : passthrough de `E2E_ADMIN_EMAIL/PASSWORD`, `E2E_SUPER_ADMIN_EMAIL/PASSWORD`, `E2E_TEST_ORG_NAME` ajouté. `E2E_ALLOW_DESTRUCTIVE` reste volontairement absent de l'env CI (comportement par défaut `false`, RULE 1).

**Risque déjà documenté en P0 (rappel)** : le job `code-quality` du même workflow exécute `npx tsc --noEmit` (ligne 46) — c'est le même script cassé identifié dans l'audit initial (`tsconfig.json` racine `files: []` sans `-p`), qui **ne détecte jamais** les 387 erreurs de type réelles. Ce gate CI est donc actuellement un faux gate. **Ne pas corriger isolément** (basculer vers `-p tsconfig.app.json` ferait immédiatement échouer ce job bloquant sur les 387 erreurs existantes) — à traiter conjointement avec le triage des erreurs de types dans P1.1.

**Lancement effectif du workflow** : non exécuté dans cette session — déclencher `release-readiness.yml` nécessite soit de pousser cette branche (elle n'est pas encore publiée sur `origin`), soit un déclenchement manuel `workflow_dispatch`, deux actions visibles sur le dépôt partagé et consommant des minutes CI. Décision de le faire ou non laissée à validation explicite avant exécution.

## Décision avant correction (P0-P6)

**Aucune déclaration de "production ready" n'est faite à ce stade.** L'audit initial a lui-même révélé deux bugs bloquants qui auraient invalidé toute mesure ultérieure s'ils n'avaient pas été corrigés en premier. Les risques listés ci-dessus (typecheck non fonctionnel en CI, 4 tests unitaires rouges, couverture E2E credentialée non vérifiée) doivent être traités avant toute décision Démo / Pilote / Déploiement. Passage aux tâches P0.1 → P0.5 ensuite.
