# MKP-008 — Contrat initial de coût moyen pondéré (étape de caractérisation)

Date : 2026-11-28. Branche : `feature/mkp-008-weighted-average-cost-contract`.
**Statut : PR préparatoire seulement. Aucun changement de stock, schéma, RPC ou interface.**

## Constat vérifiable

- La table `public.products` expose `cost_price` et `stock_quantity`.
- Les lignes de commandes fournisseurs contiennent `unit_cost` et `quantity_received` (voir `20260702130001_purchase_orders.sql`).
- La RPC historique `receive_purchase_order` majore les stocks et écrit `stock_movements` ; le coût moyen n'y est pas calculé (voir `20260723140000_fix_receive_purchase_order_partial.sql`).
- Le registre UUID proposé sous `scripts/admin/receive_purchase_order_once.sql.example` est **review-only** et nécessite encore un cutover contrôlé ; ne pas mettre à jour l'ancien chemin en parallèle.

## Contrat arithmétique proposé

Pour stock initial `Q >= 0`, coût unitaire initial `C >= 0`, quantité réceptionnée `q > 0`, prix de réception `c >= 0` :

`nouveau_coût = (Q*C + q*c)/(Q+q)`.

- Si `Q=0`, nouveau coût = `c`.
- Si `q=0`, préserver le coût actuel, aucun mouvement à créer.
- Les valeurs invalides (quantité négative, coût négatif, stock négatif) doivent bloquer la mise à jour et déclencher une décision explicite de régularisation.
- Calcul en **PostgreSQL NUMERIC**, pas en flottants JavaScript.
- La précision finale et la stratégie d'arrondi devront être validées en fonction du type réel `products.cost_price` et des obligations monétaires par pays ; ne pas arrondir à chaque étape intermédiaire arbitrairement.

## Invariants à prouver avant intégration

1. La réception idempotente répétée avec le même UUID produit **un seul mouvement** et **un seul recalcul du coût**.
2. Deux réceptions distinctes en concurrence sont sérialisées avec verrous cohérents produits/commandes et ne perdent aucun coût.
3. Transaction atomique : réception, stock, coût, historique et registre UUID sont soit tous validés soit tous annulés.
4. L'utilisateur ne peut modifier le coût d'une autre organisation ni d'un autre magasin.
5. Les ventes historiques gardent leur instantané de coût dans `sale_items` ; ne jamais recalculer leurs marges rétroactivement.
6. Coûts de réception modifiés, unités carton/pièce, retours fournisseurs et frais annexes : règles métier à valider avant implémentation.
7. Les lignes sans produit, les doublons produit/commande et les anciennes commandes incohérentes restent des **NO-GO** tant que non arbitrés.
8. Les PWA anciennes sont bloquées ou migrées sans perte de file offline, avant ouverture des nouveaux flux.

## Vérifications disponibles

`scripts/admin/test_mkp008_cost_average.sql.example` contient **neuf cas arithmétiques**, uniquement avec table temporaire et transaction rollback. Exécuter sur une base jetable via `psql -v ON_ERROR_STOP=1 -f scripts/admin/test_mkp008_cost_average.sql.example`.

**Non exécuté lors de cette préparation :** aucun accès à une base PostgreSQL de recette isolée n'a été établi. Aucun test d'intégration ni workflow GitHub n'est déclaré réussi sur ce nouveau commit avant leur exécution.

## Critères de sortie de MKP-008

- Recette de bascule des réceptions fournisseurs approuvée (GO) et version du schéma confirmée.
- Migration forward-only revue, avec journal de changements du coût et documentation des règles de calcul.
- Tests native Supabase : partielle, soldée, concurrente, rejouée, refusée, inter-tenant et rollback.
- Tests E2E de marge historique sur données synthétiques ; rapports comparés au calcul de référence.
- Validation métier, décision de release et contrôle post-déploiement.

Ne pas fusionner ni mettre en production sans autorisation explicite.
