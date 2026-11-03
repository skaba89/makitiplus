# MakitiPlus — Backlog priorisé

> **Date** : 2026-11-02 · **Méthode** : `Score = (F × G × V) × Confiance / Coût` (voir `CUSTOMER_NEEDS_RESEARCH.md` §5). Les garde-fous P0 (perte de vente, fuite inter-organisations, stock ou marge faux) passent avant le score.
> Chaque item a un ticket GitHub (label `backlog`, identifiant `MKP-xxx` dans le titre).

## Tickets GitHub

MKP-001 → #81 · MKP-002 → #82 · MKP-003 → #83 · MKP-004 → #84 · MKP-005 → #85 · MKP-006 → #86 · MKP-007 → #87 · MKP-008 → #88 · MKP-009 → #89 · MKP-010 → #90 · MKP-011 → #91 · MKP-012 → #92 · MKP-013 → #93 · MKP-014 → #94 · MKP-015 → #95 · MKP-016 → #96 · MKP-017 → #97 · MKP-018 → #98 · MKP-019 → #99 · MKP-020 → #100 · MKP-021 → #101 · MKP-022 → #102 · MKP-023 → #103 · MKP-024 → #104

## Règles communes à tous les tickets

- Branche dédiée `type/mkp-xxx-description`, PR vers `main`, **CI verte obligatoire** (`build-and-test` + `Release Readiness Summary`), **aucune fusion sans accord explicite du propriétaire**.
- Migrations : non destructives (`IF NOT EXISTS`, `CREATE OR REPLACE` avec signature identique, pas de `DELETE`/`TRUNCATE` global), validées par `scripts/validate_sql_migrations.py`, testées sur une base Postgres jetable.
- Toute RPC `SECURITY DEFINER` vérifie l'appartenance de l'appelant à l'organisation ciblée.
- Permissions vérifiées côté serveur (RLS/RPC), pas seulement dans l'interface.
- **Jamais de test destructif sur les données réelles des commerces pilotes** (Diallo & Frères) : utiliser `E2E_TEST_ORG` ou une base jetable.
- Documentation utilisateur en français (et anglais si l'écran est traduit) livrée avec la fonctionnalité, dans `docs/formation/` ou l'aide intégrée.
- « Terminé » = fusionné **et** déployé **et** vérifié en production (ou explicitement marqué « non déployé »).

## P0 — Fiabilité (avant toute nouvelle fonctionnalité)

| ID | Titre | F·G·V | Conf. | Coût | Score | Dépend de |
|---|---|---|---|---|---|---|
| MKP-001 | Zéro perte / zéro doublon de vente offline (PR `fix/offline-sale-zero-loss`) | 5·5·5 | 0,8 | 2 | 50 | — |
| MKP-002 | Politique des ventes offline refusées à la synchro (« Stock insuffisant ») | 4·5·5 | 0,8 | 3 | 27 | MKP-001 + décision produit |
| MKP-003 | Crédit client dans la même transaction que la vente | 4·4·5 | 0,8 | 2 | 32 | MKP-001 |
| MKP-004 | Écran gérant « ventes en attente / en échec » (liste, export, relance) | 3·5·4 | 0,8 | 2 | 24 | MKP-001 |
| MKP-005 | Test de restauration réel et chronométré (RTO/RPO) sur un projet de staging | 2·5·5 | 1,0 | 1 | 50 | — |
| MKP-006 | Preuve automatique d'alignement production ↔ `main` (SHA exposé + contrôle post-déploiement + état des migrations) | 3·4·4 | 1,0 | 2 | 24 | — |
| MKP-007 | Garde CI : toute fonction SECURITY DEFINER prenant `p_organization_id` doit vérifier l'appartenance | 2·5·5 | 1,0 | 1 | 50 | — |
| MKP-008 | Marges fiables : coût moyen pondéré à la réception fournisseur | 4·4·4 | 0,8 | 3 | 17 | — |
| MKP-009 | Retours, remboursements et annulation de vente (stock + caisse + audit) | 4·4·4 | 0,8 | 3 | 17 | MKP-013 (permissions) |
| MKP-010 | Inventaire physique : session de comptage, écarts valorisés | 3·4·4 | 0,4 | 3 | 6 | — |

## P1 — Différenciation Guinée (après P0)

| ID | Titre | F·G·V | Conf. | Coût | Score | Dépend de |
|---|---|---|---|---|---|---|
| MKP-011 | Fidélité client : brancher le moteur existant au POS | 3·2·3 | 0,8 | 2 | 7 | — |
| MKP-012 | Transferts de stock entre magasins : interface sur les RPC existantes | 3·3·4 | 0,8 | 2 | 14 | — |
| MKP-013 | Personnel : PIN vendeur, permissions fines (remise max, annulation), journal | 4·4·4 | 0,4 | 3 | 9 | — |
| MKP-014 | Crédit et recouvrement : plafond, échéance, âge de la dette, relances WhatsApp | 5·4·5 | 0,8 | 3 | 27 | MKP-003 |
| MKP-015 | Grossistes : grilles de prix (détail / demi-gros / gros) et unités (carton/pièce) | 3·3·4 | 0,4 | 5 | 3 | entretiens |
| MKP-016 | Paiements locaux : connecteur agrégateur Orange Money GN / MTN MoMo GN | 4·4·4 | 0,4 | 5 | 5 | contrat agrégateur, MKP-022 |
| MKP-017 | Tarification cohérente en GNF + abonnement payable en mobile money | 4·4·5 | 0,8 | 2 | 32 | décision prix |
| MKP-018 | Catalogue WhatsApp : lien boutique public + commande par WhatsApp | 3·3·4 | 0,8 | 5 | 6 | — |
| MKP-019 | Réversibilité : export complet des données d'une organisation | 3·5·4 | 0,8 | 2 | 24 | — |

## P2 — Expansion et plateforme

| ID | Titre | F·G·V | Conf. | Coût | Score | Dépend de |
|---|---|---|---|---|---|---|
| MKP-020 | Comptabilité : export journal SYSCOHADA (CSV) | 2·3·4 | 0,4 | 3 | 3 | MKP-008 |
| MKP-021 | Assistant IA : validation réelle (compte payant), coût par requête, garde-fous | 2·2·3 | 0,8 | 1 | 10 | compte réel |
| MKP-022 | Modèle multi-pays : pays, devise, fiscalité configurable par organisation | 2·4·5 | 0,8 | 5 | 6 | — |
| MKP-023 | API publique : clés par organisation, scopes, quotas, webhooks sortants | 2·3·4 | 0,8 | 5 | 4 | MKP-022 |
| MKP-024 | Langues locales : étude d'usage (pular, malinké, soussou) + prototype d'interface vocale/iconique | 3·3·3 | 0,4 | 3 | 4 | entretiens |

## Ordre d'exécution recommandé

1. **Semaine 1–2** : MKP-001 (revue + fusion + déploiement + migration), MKP-005, MKP-007, MKP-006.
2. **Semaine 3–4** : MKP-003, MKP-004, décision MKP-002 puis implémentation, MKP-017 (décision prix).
3. **Mois 2** : MKP-014, MKP-019, MKP-012, MKP-011, MKP-008.
4. **Mois 3** : MKP-009, MKP-013, première vague d'entretiens → recalibrage des scores, MKP-016 si contrat agrégateur signé.
5. **Ensuite** : MKP-018, MKP-015, MKP-022 → expansion (voir `AFRICA_EXPANSION.md`).

## Fiches détaillées (critères d'acceptation et tests)

### MKP-001 — Zéro perte / zéro doublon de vente offline
- **Acceptation** : (1) aucune vente ou crédit en file n'est supprimé automatiquement ; (2) un échec compte pour un seul essai ; (3) une vente de plus de 7 jours est rejouée ; (4) une entrée orpheline en `syncing` depuis plus de 2 min est reprise ; (5) une coupure réseau ambiguë en ligne met la vente en file avec le **même** numéro ; (6) les ventes en file sont synchronisées au démarrage et toutes les 60 s quand l'appareil est en ligne ; (7) `increment_customer_credit_by_phone` est idempotente par numéro de vente et refuse un appelant hors organisation.
- **Tests** : `src/test/offlineSaleZeroLoss.test.ts` (9 tests échouent sur l'ancien code) ; scénarios Postgres S1–S10 + course concurrente ; E2E `offline-cycle.spec.ts` en CI.
- **Déploiement** : appliquer la migration `20261102100000` **avant** de déployer le frontend.

### MKP-002 — Ventes offline refusées à la synchronisation
- **Contexte** : une vente faite hors-ligne alors que le stock serveur est insuffisant (autre caisse, autre magasin) est refusée par `create_full_sale`. Elle n'est plus perdue (MKP-001) mais reste bloquée.
- **Décision requise** : (a) accepter en stock négatif avec alerte et mouvement « à régulariser », ou (b) file de conflits que le gérant arbitre.
- **Acceptation** : aucune vente encaissée ne reste hors de la base plus de 24 h sans être visible par le gérant ; l'écart de stock est tracé dans `stock_movements`.
- **Tests** : SQL sur base jetable (2 caisses vendent le dernier article) ; unitaire du rejeu ; E2E sur `E2E_TEST_ORG`.

### MKP-003 — Crédit dans la transaction de vente
- **Acceptation** : une vente à crédit crée vente + dette dans une seule transaction (tout ou rien) ; le toast « crédit en attente » disparaît ; rejeu idempotent.
- **Tests** : SQL (échec forcé de la dette → aucune vente) ; unitaire du hook ; E2E vente à crédit.

### MKP-004 — Écran « ventes en attente / en échec »
- **Acceptation** : liste des mutations en file (numéro, montant, date, erreur, essais) ; export CSV ; bouton « réessayer » ; visible par `admin`/`manager` ; alerte si une vente est en file depuis plus de 24 h.
- **Tests** : composant (fake-indexeddb) ; accessibilité ; i18n fr/en.

### MKP-005 — Test de restauration réel
- **Acceptation** : restauration d'un snapshot sur un projet Supabase de staging **sans données pilotes réelles ou avec données anonymisées** ; RTO et RPO mesurés ; requêtes de contrôle (comptes de lignes, sommes des ventes) ; rapport daté dans `docs/production/`.
- **Tests** : script de contrôle post-restauration versionné dans `scripts/`.

### MKP-006 — Alignement production ↔ `main`
- **Acceptation** : le build expose son SHA (`/version.json`) ; un job CI post-déploiement compare ce SHA au commit attendu et échoue sinon ; `/diagnostic` liste la dernière migration appliquée.
- **Tests** : unitaire du générateur `version.json` ; job CI testé sur une PR.

### MKP-007 — Garde CI SECURITY DEFINER
- **Acceptation** : un script `scripts/check_security_definer_tenant_guard.py` échoue si la **dernière** définition d'une fonction SECURITY DEFINER prenant `p_organization_id` ne contient ni `is_member_of_organization`, ni `get_user_organization_id`, ni comparaison explicite avec `auth.uid()` ; liste d'exceptions documentée.
- **Tests** : unitaires du script (cas conforme / non conforme) ; ajouté au workflow CI.

### MKP-008 — Coût moyen pondéré
- **Acceptation** : à chaque réception, `cost_price = (stock × coût actuel + qté reçue × coût reçu) / (stock + qté reçue)` ; historique du coût conservé ; rapport de marge cohérent sur un jeu de données de référence.
- **Tests** : SQL sur base jetable (réceptions successives à prix différents) ; régression des rapports.

### MKP-009 — Retours et remboursements
- **Acceptation** : retour total ou partiel lié à la vente d'origine ; réintégration du stock (option « défectueux » sans réintégration) ; impact sur la clôture de caisse ; permission dédiée ; trace dans le journal d'audit.
- **Tests** : SQL ; unitaire ; E2E ; clôture de caisse incluant un retour.

### MKP-010 — Inventaire physique
- **Acceptation** : session de comptage par magasin, saisie ou scan, écarts valorisés au coût, validation par un manager, mouvements générés en une transaction.
- **Tests** : SQL ; E2E ; hors-ligne (comptage sans réseau).

### MKP-011 — Fidélité
- **Acceptation** : réglage du taux (points par GNF) ; points gagnés à la vente (y compris hors-ligne, crédités à la synchro, idempotents par numéro de vente) ; utilisation en remise au POS ; solde visible sur le reçu.
- **Tests** : SQL d'idempotence ; unitaire du panier ; E2E.

### MKP-012 — Transferts de stock
- **Acceptation** : création, envoi, réception (partielle), annulation ; stock « en transit » ; permissions manager ; badge « transferts en attente ».
- **Tests** : E2E multi-magasins sur `E2E_TEST_ORG` ; SQL d'atomicité.

### MKP-013 — Personnel
- **Acceptation** : PIN à 4–6 chiffres pour changer de vendeur sur une caisse partagée ; remise maximale par rôle ; annulation et retour soumis à permission ; toutes les actions sensibles journalisées.
- **Tests** : sécurité (le PIN ne contourne pas la RLS) ; unitaire ; E2E.

### MKP-014 — Crédit et recouvrement
- **Acceptation** : plafond par client (blocage ou alerte au POS) ; échéance ; balance âgée (0–30 / 31–60 / > 60 j) ; relance WhatsApp manuelle puis automatique selon un modèle validé ; historique des relances.
- **Tests** : SQL (plafond appliqué côté serveur) ; unitaire de la balance âgée ; Edge function en mode test.

### MKP-015 — Grossistes
- **Pré-requis** : au moins 5 entretiens grossistes confirmant le besoin (confiance actuelle H).
- **Acceptation** : plusieurs prix par produit (par niveau de client ou par quantité) ; unités de conditionnement avec conversion de stock ; prix appliqué au POS selon le client.
- **Tests** : unitaire du calcul de prix ; SQL de conversion d'unités.

### MKP-016 — Paiements locaux
- **Pré-requis** : contrat et documentation d'un agrégateur (Paycard, CinetPay, Moneroo ou Lengo Pay) ; KYC marchand.
- **Acceptation** : interface `PaymentConnector` (initier, vérifier, webhook signé) ; statut du paiement vérifié par l'API avant validation de la vente ; idempotence par référence ; rapprochement en clôture de caisse.
- **Tests** : bac à sable de l'agrégateur ; tests de signature de webhook ; rejeu.

### MKP-017 — Tarification en GNF
- **Décision requise** : grille de prix en GNF (référence marché : 8 000–20 000 FCFA/mois au Sénégal [V], à confirmer par les entretiens Q19–Q20).
- **Acceptation** : une seule source de vérité (table `plans`) affichée partout ; montants en GNF ; paiement d'abonnement en mobile money (lié à MKP-016) ou manuel tracé.
- **Tests** : `src/test/pricingLocalCurrency.test.ts` étendu ; aucune valeur codée en dur dans la page d'accueil.

### MKP-018 — Catalogue WhatsApp
- **Acceptation** : page publique par boutique (produits, prix, disponibilité) ; bouton « commander sur WhatsApp » avec message prérempli ; activation et désactivation par le gérant ; aucune donnée interne exposée (coût, stock exact optionnel).
- **Tests** : sécurité (RLS de la vue publique) ; performance sur réseau lent.

### MKP-019 — Réversibilité des données
- **Acceptation** : l'admin télécharge une archive (CSV par table : produits, clients, dettes, ventes, lignes, dépenses, fournisseurs) limitée à son organisation ; journalisé.
- **Tests** : isolement inter-organisations ; volumétrie (100 000 ventes).

### MKP-020 à MKP-024
Fiches à détailler au moment de leur entrée en sprint. Critères minimaux : voir `AFRICA_EXPANSION.md` (MKP-022, MKP-023) et `GUINEA_MARKET_LAUNCH.md` (MKP-024).
