# MakitiPlus — État réel vérifié

- **Date** : 2026-11-03
- **Commit audité** : `main` @ `0d10567` (fusion de #113, 2026-11-03 17:24 UTC)
- **Auteur** : audit assisté par IA (Claude Code), à relire par le propriétaire
- **État de validation** : vérifié dans le dépôt, la CI et une base PostgreSQL 16 jetable. **Production (Supabase, Render) non vérifiée** : aucun accès dans cette session.
- **Documents liés** : détail par domaine et écarts concurrentiels dans
  `docs/strategy/MAKITIPLUS_GAP_ANALYSIS.md` (2026-11-02, @`a6cc74c`), que ce
  document **met à jour** pour la partie P0 ; backlog dans `docs/strategy/PRIORITIZED_BACKLOG.md`.

## 1. Méthode et sources

| Source | Ce qui a été fait |
|---|---|
| Git / GitHub | `git log main`, PR #105 à #113 (descriptions et fichiers), tickets #81 à #104, protection de `main`, runs CI |
| Code | lecture ciblée de `src/hooks/useOfflineSale.ts`, `src/lib/offlineQueue.ts`, migration MKP-003, scripts CI ; recherche par motif dans `src/`, `supabase/migrations/` (160 fichiers), `src/test/` (129), `e2e/` (12) |
| Base jetable | PostgreSQL 16 (Docker) + shim Supabase minimal (rôles, `auth.uid()`, `storage`), `supabase/00000_initial_schema.sql` puis rejeu de toutes les migrations |
| Tests locaux | `vitest run` : 128 fichiers / 3024 tests OK (branche #114, contenu identique à `main` côté `src/`) |

**Non fait** : requêtes sur la production, dashboard Render, exécution des E2E
(secrets uniquement dans GitHub Actions), test sur appareil Android/iOS réel,
mesures de performance et d'accessibilité, recherche concurrentielle nouvelle
(celle du 2026-11-03, #108, est reprise sans revérification).

## 2. CI et gouvernance

| Élément | État | Preuve |
|---|---|---|
| CI `main` | ✅ vert sur les 5 derniers commits | runs `CI` sur `0d10567`, `e7e16cf`, `c95f0ae`, `5bf7766`, `cf58379` |
| Checks requis | `build-and-test`, `Release Readiness Summary`, mode strict | API `branches/main/protection` |
| Relecture obligatoire | ❌ aucune | `required_pull_request_reviews` absent |
| Règles appliquées aux admins | ❌ `enforce_admins: false` | un admin peut fusionner malgré une CI rouge |
| Job `e2e` complet | 🔧 en échec sur `main`, `continue-on-error` | 2 tests instables (scénarios 6 et 7 de `e2e/pilot-critical.spec.ts`), réussis au 2ᵉ essai, mais l'étape sort en erreur |
| Migrations exécutées sur un vrai PostgreSQL en CI | ❌ | tous les contrôles SQL sont statiques (`validate_sql_migrations.py`, `check_undefined_functions.py`, garde MKP-007) |
| Schéma reconstructible depuis le dépôt | ❌ **22/160 migrations échouent** sur base vierge | doublons avec l'instantané `00000_initial_schema.sql`, extensions `pg_cron`/`supabase_realtime`, `stripe_events` absent, changements de type de retour, `app_role` vs `text` |

## 3. Réconciliation des tickets MKP fusionnés le 2026-11-03

« Fusionné » ne veut pas dire « déployé » : aucune preuve de déploiement n'existe
pour ces PR.

| Ticket | PR | Fait (vérifié dans le code) | Reste à faire | Ticket |
|---|---|---|---|---|
| MKP-001 Zéro perte / doublon offline | #105 | file IndexedDB sans suppression des ventes, rejeu au même numéro, reprise des `syncing` bloqués, crédit par téléphone idempotent (migration `20261102100000`, testée sur Postgres jetable d'après la PR) | mesure en production du nombre de ventes en file depuis plus de 24 h | #81 fermé ✅ cohérent |
| MKP-007 Garde tenant SECURITY DEFINER | #109 | `scripts/check_tenant_rpc_guard.py` + 9 tests, bloquant en CI | analyse **limitée aux fonctions modifiées** par une PR (les fonctions existantes sont exemptées d'office) ; contrôle par motif : `is_member_of_organization(p_organization_id)`, ou bien un appel à `get_user_organization_id()` plus une égalité `organization_id = p_organization_id` n'importe où dans le corps (sans vérifier que l'égalité protège réellement l'écriture) ; ne voit que les fonctions ayant un paramètre `p_organization_id` ; aucun test SQL inter-organisations réel | #87 ouvert ✅ cohérent |
| MKP-004 Écran ventes en attente | #110 | `src/pages/OfflineSalesQueue.tsx` : file **de l'appareil courant**, export, relance au même numéro | supervision consolidée multi-appareils côté serveur | #84 ouvert ✅ |
| MKP-005 Restauration | #111 | comparateur read-only `scripts/verify_staging_restore.py` + 8 tests, procédure `RESTORE_DRILL_MKP005.md` | **aucune restauration réelle exécutée**, RTO et RPO non mesurés | #85 ouvert ✅ |
| MKP-003 Vente + crédit atomiques | #112 | RPC `create_credit_sale_atomic` (une transaction, contrôle tenant, verrou `FOR UPDATE`, rejeu idempotent), appelée par `useOfflineSale.ts` pour toute vente à crédit en ligne et hors ligne | **aucun test SQL réel** (tests Vitest de contrat seulement, selon la PR elle-même) ; course concurrente non testée ; **application en production non prouvée alors que le frontend en dépend** | #83 ouvert ✅ |
| MKP-002 Conflits de stock offline | #113 | vente refusée pour « Stock insuffisant » conservée et isolée pour arbitrage dans l'écran local | décision métier (stock négatif contrôlé ou arbitrage), mouvements d'écart `stock_movements`, visibilité serveur pour le responsable | #82 ouvert ✅ |

## 4. Matrice fonctionnelle

Légende (catégories de la mission) : **P** = fonctionnel et prouvé (code + tests
automatisés) · **ND** = fonctionnel mais non déployé ou déploiement non prouvé ·
**Pa** = partiel · **NT** = implémenté non testé · **UI** = interface seule ·
**DB** = base seule · **D** = défectueux · **A** = absent · **NV** = non vérifiable ici.

| Domaine | Fonction | Statut | Preuve |
|---|---|---|---|
| Vente | Vente en ligne atomique (vente, lignes, stock) | P | `create_sale_with_limit` → `create_full_sale` ; `e2e/pilot-critical.spec.ts`, `salesStoreScope.test.tsx` |
| Vente | Idempotence par numéro de vente | P | index `sales_org_sale_number_unique` présent après rejeu ; `20260723130000_fix_sale_idempotency.sql` |
| Vente | File offline sans perte, rejeu contrôlé | P (unitaire) / ND | #105 ; `offlineSaleZeroLoss.test.ts` ; pas de mesure terrain |
| Vente | Vente à crédit atomique | NT (SQL) / ND | #112 ; RPC présente après rejeu, jamais exécutée dans un test |
| Vente | Conflits de stock offline | Pa | #113 ; arbitrage local uniquement |
| Vente | Paiement fractionné (plusieurs moyens sur une vente) | A | `sales.payment_method` est une valeur unique ; aucun motif `split`/`payments[]` dans `src/` |
| Vente | Remise plafonnée | P | #74 ; `posCart*.test.ts` |
| Vente | Retours, remboursements, annulation | A | aucune RPC ni interface (#89) |
| Caisse | Clôture de caisse | P | `CashClosing.tsx` ; 12 fichiers de test ; `e2e/cash-closing.spec.ts` |
| Caisse | Reçus PDF/58-80 mm, partage WhatsApp | P | `receiptGenerator.ts` ; tests `receiptDelivery*` |
| Caisse | Lecteur de codes-barres | Pa | code présent (19 fichiers) ; **matériel réel non validé** |
| Stock | Ajustements et historique | P | `StockAdjustDialog.tsx`, `StockMovementHistory.tsx` |
| Stock | Réception fournisseur partielle | P | `e2e/stock-and-purchase-orders.spec.ts` |
| Stock | Transferts entre magasins | DB | RPC présentes dans les migrations ; seule référence `src/` = `types.ts` généré |
| Stock | Inventaire physique (session, écarts valorisés) | Pa | ajustement unitaire seulement (#90) |
| Stock | Lots et péremption | Pa | champs produit (`ProductForm.tsx`) ; pas de gestion par lot |
| Stock | Coût moyen pondéré | A | aucun motif dans `src/` ni dans les migrations (#88) |
| Clients | Fidélité | DB | tables et RPC `loyalty_*` ; `src/` ne les cite que dans les pages d'offre (#91) |
| Clients | Crédit, paiements partiels | P | `process_credit_payment` ; fiche client |
| Clients | Plafond, échéance, balance âgée, relances | A | #94 |
| Personnel | Rôles (admin, manager, vendeur, comptable, super_admin) | P | `authRlsPolicies.test.ts` |
| Personnel | PIN vendeur, permissions fines | A | aucun motif `pin` (#93) |
| Grossistes | Unités de conditionnement, grilles de prix | A | aucun motif (#95) |
| Omnicanal | Catalogue public / commande WhatsApp | A | WhatsApp = liens `wa.me` d'envoi seulement (#98) |
| Paiements | Mobile money intégré (Orange Money GN, MTN MoMo GN) | A | référence saisie à la main seulement (#96) |
| Comptabilité | Export SYSCOHADA | A | aucun motif (#100) |
| Sauvegarde | Restauration réelle chronométrée | A | #85 ; outils seulement |
| Sauvegarde | RPC `create_backup` / `restore_backup` | DB | aucune référence dans `src/` hors tests (vérifié le 2026-11-03) |
| Sécurité | RLS métier, corrections inter-organisations | P (statique) | tests Vitest de lecture des migrations ; **aucun test RLS exécuté sur PostgreSQL** |
| Sécurité | Scripts destructeurs dans les migrations | **D** | voir P0-1 ; corrigé dans #114 (non fusionnée) |
| IA | Assistant | Pa / NV | Edge function scopée ; jamais validé sur un compte payant (`AI_ASSISTANT_LIVE_VALIDATION.md`) |
| Mobile | Android / iOS (Capacitor 8.6) | NV | aucun test sur appareil dans le dépôt ; `npx cap sync` requis depuis #107 |
| Production | Alignement frontend et migrations ↔ `main` | NV | dernière preuve live 2026-08-22 (#86) |

## 5. Risques P0 non clôturés

Classés par gravité (perte d'argent ou de données, puis sécurité).

| # | Risque | Gravité | État | Action |
|---|---|---|---|---|
| P0-1 | **Migrations destructrices** : `20260713260000_clean_transactional_data.sql` (DELETE sans WHERE de toutes les données commerciales) et `CLEANUP_RESET_PROJECT` s'exécutent via `supabase db push` sur tout projet dont l'historique ne les connaît pas. Prouvé sur base jetable : 2 produits de 2 organisations → 0. | Critique | Corrigé dans **#114** (non fusionnée) | Fusion après accord, puis requête 1 de `docs/production/MIGRATION_SAFETY_MKP025.md` |
| P0-2 | **Comptes aux mots de passe publics** : `vendeur@/manager@/comptable@test.com`, mots de passe en clair dans un **dépôt public**, rattachés à l'organisation du super admin si la migration a tourné. | Critique (si présents en production) | Fichier neutralisé dans #114 ; **état de la production inconnu** | Propriétaire : requête 2 de la même note, puis désactivation ou rotation |
| P0-3 | **MKP-003 dépend d'une migration non prouvée en production** : toute vente à crédit en ligne appelle `create_credit_sale_atomic`. Si elle est absente, la vente à crédit échoue (rien n'est perdu, mais le crédit est bloqué). | Élevée | NV | Propriétaire : `SELECT to_regprocedure('public.create_credit_sale_atomic(text,numeric,numeric,jsonb,numeric,text,numeric,numeric,text,text,text,numeric,uuid,text)');` |
| P0-4 | **Aucune preuve SQL d'exécution** pour l'atomicité, l'idempotence, la concurrence et le tenant de MKP-003, ni pour les RLS : aucune migration n'est exécutée en CI. | Élevée | Ouvert | Prochaine PR proposée : harnais PostgreSQL jetable en CI + tests MKP-003 |
| P0-5 | **Schéma non reconstructible** (22/160 migrations en échec sur base vierge) : une reprise après sinistre sur un nouveau projet n'est pas garantie depuis le dépôt. | Élevée | Ouvert | Même chantier que P0-4, puis MKP-005 |
| P0-6 | **Restauration jamais exécutée**, RTO/RPO inconnus. | Élevée | Ouvert (#85) | Nécessite un projet de staging (décision et coût propriétaire) |
| P0-7 | **Conflits de stock offline** : politique métier non décidée ; écarts non tracés en `stock_movements`. | Moyenne à élevée | Ouvert (#82) | Décision propriétaire |
| P0-8 | **Alignement production ↔ `main`** non prouvé depuis le 2026-08-22, alors que 6 PR P0 ont été fusionnées. | Élevée | Ouvert (#86) | |
| P0-9 | **Protection de branche contournable** par un admin (`enforce_admins: false`, aucune relecture requise). | Moyenne | Ouvert | Décision propriétaire (paramètre GitHub) |

## 6. Scores

Aucun score global n'est donné : il n'existe pas encore de méthode
reproductible ni de mesures de production (latence de vente, taux de
synchronisation, incidents, rétention). Les indicateurs sont à instrumenter
d'abord (`COMMERCIAL_KPI_FRAMEWORK.md`, à créer).

## 7. Décisions attendues du propriétaire

1. Autoriser ou non la fusion de #114 (P0-1, P0-2).
2. Lancer les 3 requêtes de lecture en production (P0-1, P0-2, P0-3) et communiquer le résultat.
3. Politique des ventes offline refusées (P0-7).
4. Projet Supabase de staging pour la restauration (P0-6).
5. Activer `enforce_admins` et/ou une relecture obligatoire (P0-9).

## 8. Prochaines actions techniques (ordre proposé)

1. **Harnais PostgreSQL jetable en CI** : shim Supabase, construction du schéma, liste explicite des migrations non rejouables avec justification (toute nouvelle défaillance bloque), puis tests SQL de MKP-003 (atomicité par rollback, idempotence, conflit de clé, isolement tenant, deux sessions concurrentes). Traite P0-4 et prépare P0-5.
2. Tests RLS inter-organisations exécutés sur ce harnais.
3. Rendre le schéma reconstructible (P0-5), puis drill de restauration MKP-005.
4. Stabiliser les 2 E2E instables (cause, pas suppression).
