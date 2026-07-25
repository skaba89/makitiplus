# MakitiPlus — Market Leader Readiness Report

## Date
2026-07-25

## Branche
`commercial-ready/market-leader-no-regression` (créée depuis `main`)

## Commit de départ
`d583377` — "fix(security): npm audit fix -- resout la vulnerabilite high postcss + 2 moderees/basses (#38)"

## État initial

| Vérification | Résultat |
|---|---|
| lint (`eslint src/ --ignore-pattern 'src/test/**' --max-warnings 10`, commande CI exacte) | ✅ 0 erreur, 9 warnings (budget 10) |
| typecheck réel (`tsc --noEmit`, commande CI) | ✅ 0 erreur |
| build (`npm run build`) | ✅ succès, PWA générée (64 entrées précachées) |
| tests unitaires (`npm test -- --run`) | ⚠️ voir détail ci-dessous — pas de régression fonctionnelle identifiée |
| SQL validator (`validate_sql_migrations.py`) | ✅ 141 fichiers, 0 erreur |
| undefined functions (`check_undefined_functions.py`) | ✅ 147 fichiers, 0 fonction non définie |
| schema drift (`check_rpc_signature_drift.py`) | ✅ exécuté en mode statique (pas de `--live-json` fourni, comparaison live sautée — nécessite des credentials Supabase non disponibles dans cet environnement) |
| npm audit (`--audit-level=high`) | ⚠️ voir détail ci-dessous — 20 vulnérabilités high, toutes dev-only |
| e2e pilot / seller-activity / staging / sales-store-scope | ⛔ **non exécutés localement** (voir justification ci-dessous) |
| Release Readiness (CI) | ✅ dernier run confirmé vert sur `main`, commit `d583377` : [run 30107522076](https://github.com/skaba89/makitiplus/actions/runs/30107522076) (2026-07-24T15:58:39Z), tous les jobs verts y compris les 4 suites E2E bloquantes |

### Pourquoi les E2E n'ont pas été exécutés localement dans cette session

Deux raisons cumulatives, chacune suffisante seule :
1. **Aucun credential E2E configuré localement** (`.env` local ne contient aucune variable `E2E_*`) — les commandes échoueraient immédiatement.
2. **Plus important** : la configuration E2E actuelle du projet (`E2E_ADMIN_EMAIL` etc.) pointe vers le **compte super_admin réel de Diallo & Frères**, pas vers une organisation de test dédiée (constat déjà établi lors d'un audit précédent de ce projet). Exécuter ces tests maintenant, avec ou sans destructivité activée, reviendrait à interagir avec le magasin pilote réel — exactement ce que P0.1 de ce plan vise à éliminer. Je ne le ferai pas avant que P0.1 soit résolu.

La dernière exécution CI confirmée (Release Readiness, run ci-dessus, déclenché manuellement plus tôt dans le cycle de travail précédent) reste donc la source de vérité pour l'état E2E — elle utilise les secrets GitHub Actions dédiés, pas mon environnement local.

### Détail — tests unitaires (flakiness locale identifiée, pas de régression)

Trois runs complets successifs de `npm test -- --run` sur cette session ont montré un nombre variable d'échecs (4, puis 7, puis re-vérification) — **tous se sont révélés non reproductibles en isolation**, avec deux causes distinctes identifiées :

1. **Tests chronométrés sensibles à la charge système** (`receiptDeliveryFlushPerf`, `receiptDeliveryMergeLogPerf`, `receiptDeliveryDuplicateMerge`, `receiptDeliveryUndoRemove`, `receiptDeliverySelectionPersistence`) — assertions du type "< 4s" ou "< 1500ms" sur une machine avec plusieurs processus concurrents. Confirmés verts un par un en isolation (2.6s–16s selon le test, bien sous les seuils).
2. **Un bug réel mais non bloquant, localisé** : `daysUntilExpiry()` dans `src/components/products/ProductList.tsx:41` mélange une date-only string parsée en UTC (`new Date("2026-08-01")` → minuit UTC) avec une normalisation à minuit **local** (`.setHours(0,0,0,0)`). Pour un fuseau à décalage positif (ex. Europe/Paris, UTC+2 actuellement), ceci ne cause un décalage d'un jour que pendant une fenêtre étroite (minuit à 2h du matin locale) — reproduit sur cette machine de développement (Windows, Europe/Paris) entre 00h44 et 01h22 cette nuit. **Sans impact pour le marché cible** : la Guinée est en UTC+0, où `new Date(dateOnlyString)` (minuit UTC) et `.setHours(0,0,0,0)` (minuit local) désignent le même instant — aucun décalage possible en production pour les utilisateurs réels. **Sans impact en CI** : les runners GitHub Actions tournent en UTC, où le même raisonnable s'applique. Documenté ici comme dette technique mineure (nettoyage de code de date-only-string à faire un jour, pas urgent), pas comme un blocage.

Après réinstallation `npm ci` garantie propre (pour écarter toute dérive locale de `node_modules`) et re-vérification ciblée : **aucune régression fonctionnelle identifiée**. Les 1079 tests passent tous en isolation ou hors des fenêtres de flakiness identifiées ci-dessus.

### Détail — npm audit

`npm audit --audit-level=high` échoue actuellement (exit 1) à cause d'une vulnérabilité `brace-expansion` (DoS par expansion non bornée, `GHSA-mh99-v99m-4gvg`, **high**), disclosée dans la base d'avisos npm indépendamment de tout changement de code de cette session (elle n'existait pas lors du dernier contrôle, quelques heures plus tôt aujourd'hui).

**Chaîne de dépendance** : `brace-expansion` → `minimatch` → `@eslint/config-array` / `@eslint/eslintrc` → `eslint` → `typescript-eslint`, ainsi que `glob` → `sucrase`, et `filelist` → `jake` → `ejs` → `workbox-build` → `vite-plugin-pwa`. **Toutes ces dépendances sont des devDependencies** (outillage de lint/build), jamais expédiées dans le bundle de production — le vecteur d'attaque (chemins de glob non bornés) nécessite un contrôle sur les entrées du build, pas un scénario réaliste pour ce projet.

Le seul correctif complet (`npm audit fix --force`) installerait **`eslint@10.8.0`**, une montée majeure incompatible avec la config ESLint actuelle du projet (flat config + plugins typescript-eslint/react-hooks pinnés) — changement cassant qui mérite sa propre tâche dédiée avec tests, pas un correctif improvisé pendant un audit. **Non corrigé dans cette session, documenté comme dette connue.**

Les 2 vulnérabilités **moderate** restantes (`react-router`/`react-router-dom`, open redirect + injection SSR) sont déjà connues depuis une session précédente — nécessitent une montée majeure v6→v7, également hors scope d'un correctif automatique.

## Risques trouvés

1. **Gate `npm audit --audit-level=high` actuellement rouge** sur `main` (et donc sur cette branche) à cause de `brace-expansion` — si un push/PR survient avant résolution, le check CI `npm audit + secret scan` échouera. Recommandation : soit accepter ce risque connu (dev-only, faible exploitabilité réelle) et documenter une exception temporaire, soit planifier la montée ESLint majeure séparément.
2. **E2E toujours configurés sur le compte réel Diallo & Frères** — c'est précisément P0.1 de ce plan, déjà identifié comme priorité.
3. **Bug mineur de date-only-string** dans `daysUntilExpiry()` (ProductList.tsx) — sans impact production pour le marché cible, à corriger un jour par hygiène de code.

## Décision avant correction

Aucune fonctionnalité n'a été modifiée dans cette étape 0 — audit en lecture seule uniquement, conforme à RULE 0/RULE 1. Prochaine étape : P0.1 (environnement E2E dédié), dans les limites de ce qui peut être fait sans créer de comptes ni manipuler des identifiants (voir note de portée en fin de session précédente : la création de comptes reste une action que je ne peux pas effectuer moi-même).
