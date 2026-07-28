# MakitiPlus — Cash Closing Final Hardening Audit

## Date
2026-07-28

## Branche
`hotfix/cash-closing-final-hardening-no-regression`

## Commit de départ
`9dfb396` (main — merge PR #44, module clôture caisse déjà réécrit par sessions)

## État initial

- **lint** : `npx eslint src/ --ignore-pattern 'src/test/**' --max-warnings 10` — 0 erreur (baseline propre avant modification).
- **typecheck** : `npm run typecheck` (config stricte `tsconfig.typecheck.json`) — 0 erreur.
- **build** : succès.
- **tests** : 87 fichiers / 1175 tests passés (suite complète avant modification).
- **SQL validator** (`validate_sql_migrations.py`) : 144 fichiers, 0 erreur.
- **undefined functions** (`check_undefined_functions.py`) : 0 fonction `public.*` non définie.
- **npm audit** (`--audit-level=high`) : 0 vulnérabilité haute/critique en production.
- **E2E pilot/seller-activity/staging/sales-store-scope** : non exécutables localement (secrets `E2E_*` réels non disponibles dans cet environnement — comportement identique aux sessions précédentes de ce projet ; validés en CI via Release Readiness sur la PR).
- **check:national-readiness** : non exécutable en local pour la même raison (dépend des mêmes E2E).

## État actuel du module clôture caisse (avant corrections de cette session)

- **table `cash_register_sessions`** : créée par `20260727150000_create_cash_register_sessions.sql`, RLS activée + forcée, contrainte UNIQUE anti-double-ouverture par (organisation, magasin, vendeur), zéro GRANT direct (écriture RPC uniquement).
- **RPC** : 5 fonctions `SECURITY DEFINER` (`open_cash_register_session`, `get_cash_closing_summary`, `close_cash_register_session`, `approve_cash_register_session`, `get_cash_register_sessions`), toutes avec `search_path` fixé.
- **RLS** : SELECT scopée par organisation/rôle, écriture exclusivement via RPC.
- **rôles** : vendeur (ouvre/clôture sa session), manager/admin (vue équipe + approbation), comptable (lecture seule), super_admin (audit seul, jamais d'ouverture).
- **UI vendeur** : carte "Ouvrir ma caisse" / "Session en cours" / comptage-clôture — fonctionnelle.
- **UI manager/admin** : caisses ouvertes de l'équipe, clôtures en attente d'approbation, bouton "Approuver" seul (pas de rejet).
- **UI comptable** : lecture seule via l'historique, export CSV déjà présent.
- **tests** : `cashClosingRegression.test.ts`, `cashClosingCalculations.test.ts`, `cashClosingRoles.test.ts`, `e2e/cash-closing.spec.ts` (4 cas, gated).

### Risques identifiés (justifiant cette session de durcissement)

1. **P0.1 — `open_cash_register_session` appelée avec `p_store_id: undefined` en dur** (`src/pages/CashClosing.tsx`) : en organisation multi-magasin, toute session ouvre sans lien de magasin explicite — risque de mélange de ventes entre magasins d'une même organisation.
2. **P0.2 — dépenses non filtrées par magasin dans `get_cash_closing_summary`** : la requête d'agrégation des dépenses (contrairement à la CTE `qualifying_sales` des ventes) ne filtre pas par `store_id` — une session multi-magasin peut compter les dépenses d'un AUTRE magasin de la même organisation dans son calcul de caisse attendue.
3. **P0.3 — erreurs RPC masquées** : les 5 hooks `useQuery` de `CashClosing.tsx` retournaient `[]`/`null` sur erreur RPC au lieu de la remonter — un service cassé, non déployé, ou bloqué par RLS ressemblait à "aucune session" pour l'utilisateur.
4. **P0.4 — aucune vérification des ventes offline en attente avant clôture** : une clôture calculée pendant que des ventes hors-ligne ne sont pas encore synchronisées serait fausse (elles manqueraient au total serveur), sans aucun avertissement.
5. **P0.5/P0.6 — pas de test E2E cash-closing dans la validation nationale** : `e2e/cash-closing.spec.ts` existait mais n'était référencé ni dans `package.json` (`e2e:cash-closing` absent) ni dans `check:national-readiness`, ni bloquant dans Release Readiness.
6. **P0.7 — faux gate TypeScript en CI** : `ci.yml` et `release-readiness.yml` utilisaient `npx tsc --noEmit` (config racine, plus permissive) au lieu de `npm run typecheck` (le vrai script strict du projet).

## Décision avant correction

Aucun de ces risques ne constitue une régression en cours (le module fonctionne pour un usage mono-magasin comme Diallo & Frères), mais tous sont des trous réels avant un déploiement multi-magasin national fiable, en particulier P0.1/P0.2 (données financières potentiellement fausses en multi-magasin) et P0.3 (fiabilité perçue du module). Priorité stricte P0 avant toute amélioration P1/P2/P3, conformément à la règle absolue du plan — aucune correction ne touche `sales`, `expenses`, ni les données réelles de Diallo & Frères (toutes les modifications SQL sont additives, testées en transaction annulée avant application live).
