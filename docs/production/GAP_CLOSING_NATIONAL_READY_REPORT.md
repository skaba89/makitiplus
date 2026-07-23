# MakitiPlus — Gap Closing National Ready Report

## Date
2026-07-23

## Branche
`gap-closing/national-production-ready-no-regression` (créée depuis `production-ready/national-hardening-no-regression`, qui contient déjà tout le travail P0-P3 de la session précédente : Release Readiness verte, fix session-loss E2E, audit schema drift, régénération des types, audit KPI, 3 bugs POS/offline/PO trouvés — voir `NATIONAL_PRODUCTION_READY_AUDIT.md` pour l'historique complet).

## Commit de départ
`ae3a48f3b577f610f0d0f32c87d92d06cd8e9f54` — "docs(audit): documenter 3 bugs P3 trouves dans POS/offline-sync/PO"

## Résultat audit initial

- **lint** : ✅ 0 erreur, 9 warnings (pré-existants, `react-hooks/exhaustive-deps` sur `ProductAutocomplete.tsx` et `StoreCustomization.tsx`) — sous le budget de 10 configuré dans `npm run check`.
- **typecheck (script actuel `tsc --noEmit`, sans `-p`)** : ⚠️ **FAUX GATE** — 0 erreur reportée, mais `tsconfig.json` racine a `files: []` donc `tsc --noEmit` sans `-p` ne vérifie **aucun fichier réel**. Confirmé en relançant avec la vraie config app :
- **typecheck RÉEL (`tsc --noEmit -p tsconfig.app.json`)** : ❌ **417 erreurs** (dont 4 dans `src/utils/receiptGenerator.ts` liées à `jsPDF` mal typé — `Cannot find name 'jsPDF'` lignes 222/448/535/763 — et 1 variable inutilisée `infoY`). Ce chiffre est cohérent avec l'audit P1.1 de la session précédente (387 → 417 après régénération des types Supabase, hausse due à des types plus fidèles au schéma réel révélant des incohérences préexistantes).
- **build** : ✅ succès en 49.23s, PWA générée (64 entrées précachées, 4146.64 KiB).
- **tests** (`npm test -- --run`) : ✅ **81/81 fichiers, 1059/1059 tests verts**.
- **SQL validator** (`validate_sql_migrations.py`) : ✅ 131 fichiers vérifiés, 0 erreur. (Note : le script crashe sur `UnicodeEncodeError` dans un terminal Windows cp1252 local à cause des emojis dans les messages de succès — **cosmétique uniquement**, confirmé sans erreur avec `PYTHONIOENCODING=utf-8`, et la CI Linux ne rencontre jamais ce problème, voir run GitHub Actions déjà vert.)
- **undefined functions** (`check_undefined_functions.py`) : ✅ 137 fichiers analysés, 132 fonctions définies, 125 fonctions appelées, aucune fonction `public.*` appelée non définie. (Même artefact cosmétique Windows que ci-dessus.)
- **npm audit --audit-level=high** : ✅ 0 vulnérabilité high/critical (1 vulnérabilité **low** restante sur `dompurify` — `CUSTOM_ELEMENT_HANDLING` bypass — sous le seuil `--audit-level=high`, non bloquante).
- **e2e pilot / seller-activity / staging / sales-store-scope** : ✅ déjà vérifiés verts via le workflow GitHub Actions Release Readiness ([run 30003323763](https://github.com/skaba89/makitiplus/actions/runs/30003323763)), sur le commit de départ de cette branche. Non ré-exécutés localement pour cette baseline (redondant avec la preuve CI toute récente) — seront ré-exécutés en validation finale après les correctifs de cette phase.
- **national readiness** (`npm run check:national-readiness`) : composite des commandes ci-dessus — non relancé tel quel pour éviter la duplication (lint/typecheck/build/test/SQL déjà passés individuellement ci-dessus, E2E déjà prouvés verts en CI).

## Gaps détectés

1. **P0.1 — Faux gate typecheck** : `npm run typecheck` ne vérifie rien (voir ci-dessus). 417 erreurs réelles masquées.
2. **P0.2/P0.3 — Fix `get_admin_product_ranking_detailed` écrit mais pas appliqué en live** : migration `20260722110000_fix_admin_product_ranking_rownumber.sql` déjà écrite et revue (session précédente), en attente d'application.
3. **P0.4 — E2E pointent vers le compte super_admin réel de Diallo & Frères** : `E2E_TEST_EMAIL`/`E2E_ADMIN_EMAIL` authentifient sur l'organisation pilote réelle (découvert dans la session précédente via trace Playwright — voir `NATIONAL_PRODUCTION_READY_AUDIT.md`), pas sur un `E2E_TEST_ORG` dédié. Aucun test destructif n'a encore été exécuté dessus (garde-fous `assertSafeForDestructiveAction`/`E2E_ALLOW_DESTRUCTIVE=false` déjà en place), mais l'exigence "E2E_ADMIN_EMAIL ne doit pas pointer vers Diallo & Frères" n'est structurellement pas respectée tant qu'un compte de test dédié n'existe pas.
4. **P1.2 — 42 fonctions non déployées** : déjà inventoriées par domaine dans `SUPABASE_SCHEMA_DRIFT_AUDIT.md`, décision (activer / reporter / masquer / déployer) pas encore prise formellement par domaine.
5. **P3 — 3 bugs POS/offline/fournisseurs confirmés** (session précédente, voir `NATIONAL_PRODUCTION_READY_AUDIT.md` section P3) : signature RPC `increment_customer_credit` incorrecte côté file offline (échec garanti), aucune protection d'idempotence sur `create_sale_with_limit`/`sale_number` (doublon possible sur reconnexion instable), `receive_purchase_order` ne persiste pas la réception partielle.
6. **P4 — Sécurité nationale** : RLS/rôles, Edge Functions, scan de secrets — non encore audités formellement dans cette session.
7. **P5 — Nettoyage production** : dossier `skills/` toujours présent à la racine (contourné côté Vite mais pas déplacé/isolé), PWA repair et Sentry à vérifier.
8. **P6 — Documentation terrain** : runbook Diallo & Frères, rollback plan, incident response plan — n'existent pas encore.

## Risques production

- Le typecheck CI actuel ne protège contre **aucune** régression de type — un risque silencieux mais réel de longue date, pas introduit par cette session.
- Les 3 bugs P3 touchent directement l'argent et le stock (chemin le plus critique, RULE 0) — priorité la plus haute avant toute déclaration de readiness.
- Tant que P0.4 n'est pas résolu (E2E_TEST_ORG dédié), toute extension de couverture E2E destructive reste bloquée par design (protection RULE 1 déjà correcte, mais couverture incomplète).

## Décision avant correction

Aucune déclaration de "production ready national" à ce stade — conforme à la règle du prompt ("ne pas annoncer national ready par optimisme"). Passage à P0.1 → P0.5 puis P1-P6 dans l'ordre, avec validation utilisateur avant toute modification du schéma/RPC live touchant le chemin financier (P0.2/P0.3, P3), conformément à RULE 0/RULE 1.
