# MakitiPlus — Audit Clôture Caisse Complète

## Date
2026-07-27

## Branche
`feature/cash-closing-complete-no-regression` (créée depuis `main`)

## Commit de départ
`66f2fdb` — "feat(cash-closing): historique des clôtures + alerte double clôture (P1.3 partiel) (#43)"

## État actuel

- **Page CashClosing** (`src/pages/CashClosing.tsx`) : clôture "instantanée" en un seul geste (pas de notion de session ouverte/fermée). Affiche les ventes du jour par mode de paiement, calcule `expected_cash = ventes_cash - dépenses_jour`, permet de saisir le montant réel, calcule l'écart, enregistre, imprime. Historique en lecture seule ajouté récemment (PR #43).
- **Route** : `/dashboard/cash-closing`, gardée par `ProtectedRoute allowedRoles={MANAGEMENT_ROLES}` dans `src/App.tsx:445-450`.
- **Rôles actuels** : accessible uniquement à `super_admin`, `admin`, `manager` (`MANAGEMENT_ROLES` = `["super_admin","admin","manager"]`, défini dans `src/types/index.ts:203`). Le **vendeur est exclu** des 3 points d'accès (route `App.tsx`, menu desktop `DashboardLayout.tsx:147-152`, menu mobile `MobileBottomNav.tsx:118-123`) alors qu'il peut vendre (`POS_ROLES = ["admin","manager","vendeur"]`, `src/types/index.ts:210`) — confirme le constat du plan.
- **Stockage** : aucune table dédiée. Chaque clôture est un INSERT dans `public.user_activity_logs` (`action = 'settings_updated'`, `description = "Clôture de caisse {date}"`, `metadata` JSON contenant tous les chiffres). Pas de notion de session, de statut, d'approbation, ni de lien formel vers un `store_id`/vendeur responsable au niveau schéma (tout est dans le JSON `metadata`).
- **RPC existantes** : aucune RPC dédiée à la clôture. Les données (ventes du jour, dépenses du jour) sont lues côté client via des requêtes directes `supabase.from("sales")`/`supabase.from("expenses")` filtrées par `organization_id` (RLS applicable normalement, pas de `store_id` dans le filtre actuel — un magasin voit les ventes de toute l'organisation, pas seulement de son magasin, si l'organisation a plusieurs magasins).
- **Tables pertinentes confirmées en base live** (lecture seule, `information_schema`) :
  - `sales` : colonnes `store_id` (uuid) et `user_id` (uuid, vendeur) confirmées présentes — exploitables pour scoper par magasin/vendeur.
  - `stores` : `id`, `organization_id`, `name`, `is_active`, etc.
  - Enum `payment_method` (colonne `sales.payment_method`) : `cash`, `wave`, `orange_money`, `mtn_money`, `moov_money`, `mpesa`, `card`, `credit` — 8 valeurs réelles (le plan n'en liste explicitement que 6 dans les colonnes proposées pour la nouvelle table ; `moov_money`/`mpesa` seront ajoutées pour ne pas perdre de données réelles).
  - Enum `app_activity_action` : ne contient **aucune** valeur `cash_session_*` actuellement — confirmé par requête live sur `pg_enum`. Le plan autorise explicitement de ne pas modifier l'enum et d'utiliser `description`/`metadata` à la place ; c'est l'option retenue (moins de risque qu'une migration sur un type enum partagé par de nombreuses autres fonctionnalités).
- **Tests existants** : aucun test dédié à `CashClosing.tsx` ou à la logique de clôture (`src/test/` ne contient aucun fichier `cashClosing*`).
- **Fonction `has_role(_user_id, _role)`** (déjà existante, réutilisée pour les nouvelles RPC) : vérifie le rôle exact demandé, avec une exception spécifique — `_role = 'admin'` matche aussi `super_admin`. Donc `has_role(auth.uid(), 'manager')` ne matchera **pas** un `admin` ou `super_admin` — à garder à l'esprit pour écrire des vérifications de rôle précises (utiliser des `OR has_role(...)` explicites plutôt que supposer une hiérarchie implicite).

### Limites identifiées

1. Vendeur ne peut pas clôturer sa propre caisse (accès bloqué en amont, route/menu).
2. Pas de scoping par magasin (`store_id`) dans les requêtes de ventes/dépenses du jour — problématique pour une organisation multi-magasins où plusieurs vendeurs/managers travaillent en parallèle.
3. Pas de notion de session (ouverture avec fond de caisse initial, statut, approbation) — une seule clôture "finale" par jour, sans traçabilité de qui a ouvert/fermé/validé.
4. Pas de protection contre les clôtures multiples le même jour (correctif partiel déjà en place : avertissement non bloquant, PR #43) — mais aucune contrainte serveur.
5. Aucune RLS dédiée (le stockage actuel dans `user_activity_logs` hérite des policies de cette table générique, pas de policy pensée spécifiquement pour le cas d'usage clôture/session).
6. Calculs faits côté client (JS), pas côté serveur — un client compromis ou buggé pourrait en théorie soumettre des chiffres calculés différemment de la réalité serveur (risque faible vu qu'il n'y a pas d'impact sur `sales`/`expenses`, mais un écart entre ce qui est affiché et ce qui est enregistré est possible).

### Risques

- **Risque principal du plan** : le module touche une page qui lit déjà `sales`/`expenses` en production (Diallo & Frères clôture réellement sa caisse, 4 ventes réelles confirmées lors d'un audit précédent de cette session). Toute nouvelle RPC/migration doit être strictement additive et ne jamais modifier `sales`/`expenses`.
- La nouvelle table `cash_register_sessions` et les RPC associées sont un ajout de schéma pur (nouvelle table + nouvelles fonctions), sans toucher aux tables existantes — risque de régression faible si bien testé, mais le changement de MODÈLE (session ouverte/fermée vs clôture instantanée) change l'UX de fond pour tous les rôles actuels de `CashClosing.tsx` — nécessite une réécriture substantielle de la page, avec attention à ne pas casser les rôles qui l'utilisent déjà (manager/admin sur Diallo & Frères).

## Résultat commandes (Étape 0)

| Commande | Résultat |
|---|---|
| `npx eslint src/ --ignore-pattern 'src/test/**' --max-warnings 10` (lint, commande CI exacte) | ✅ 0 erreur |
| `npx tsc --noEmit` (typecheck, commande CI exacte) | ✅ 0 erreur |
| `npm run build` | ✅ succès |
| `npm test -- --run` | ✅ 84/84 fichiers, 1140/1140 tests (dernier run complet, quelques minutes avant la création de cette branche, sur le même commit de base) |
| `python3 scripts/validate_sql_migrations.py` | ✅ 141 fichiers, 0 erreur |
| `python3 scripts/check_undefined_functions.py` | ✅ 147 fichiers, 0 fonction non définie |
| `python3 scripts/check_rpc_signature_drift.py` | ✅ exécuté en mode statique (pas de comparaison live — nécessite des credentials non disponibles ici) |
| `npm audit --audit-level=high --omit=dev` | ✅ 0 high (2 moderate connues sur react-router, sous le seuil) |
| E2E (pilot/seller-activity/staging/sales-store-scope) | ⛔ non exécutés localement — pas de credentials E2E locaux, et la config actuelle pointe vers le vrai compte Diallo & Frères pour les scénarios "pilot" (constat déjà établi cette session). Un run Release Readiness frais a été déclenché manuellement sur `main` pour confirmer l'état de départ : [run 30294665705](https://github.com/skaba89/makitiplus/actions/runs/30294665705) — résultat à documenter dans le rapport final. |
| `npm run check:national-readiness` | Non relancé tel quel (composite des commandes ci-dessus, déjà passées individuellement + E2E via CI) |

## Décision avant correction

Aucune fonctionnalité modifiée dans cette étape 0 — audit en lecture seule uniquement (requêtes `information_schema`/`pg_enum`/`pg_proc` en lecture, commandes de validation locales), conforme à RULE 0/RULE 1. Prochaine étape : P0.1 (aligner les rôles), en modifiant uniquement les constantes de rôles et les 3 points de gating (route, menu desktop, menu mobile) — changement ciblé, testé avant d'aborder la refonte de stockage (P1) qui est le changement le plus structurant de ce plan.
