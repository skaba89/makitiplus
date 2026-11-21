# P0 — isolation des écritures de vente

## Périmètre

La migration additive conserve la signature de `create_full_sale`, y compris les paramètres optionnels utilisés par les files offline. Le helper interne vérifie l'identité authentifiée et son organisation avant toute recherche de vente ou écriture. Les produits doivent appartenir à cette même organisation et les quantités être positives. La décrémentation du stock est également filtrée sur l'organisation.

L'appel direct de ce helper par `anon`, `authenticated` ou `PUBLIC` est révoqué : les points d'entrée applicatifs existants `create_sale_with_limit` et `create_credit_sale_atomic` continuent de l'appeler côté serveur et de conserver le contrôle du quota. Aucun changement de signature publique ni modification de migration historique.

## Preuves locales — PostgreSQL 16.16 jetable

- Rejeu : 144/162 migrations appliquées, 18 échecs historiques identiques (code et empreinte), aucun nouveau ni résolu.
- Deux organisations distinctes : refus des produits étrangers dans les deux sens, refus d'une vente à crédit avec produit étranger, rollback intégral d'un panier mixte contenant un produit légitime puis étranger.
- Quantité négative refusée ; aucune vente, ligne, dette ou modification de stock résiduelle après les refus.
- Appel direct interdit aux rôles publics ; vente comptant et rejeu avec même identifiant et un seul mouvement de stock réussis.
- Tous les scénarios de crédit, concurrence et RLS de la PR précédente sont rejoués par la CI existante.

## Limites et déploiement

Tests exécutés sur une base locale jetable avec les rôles applicatifs simulés ; pas de données réelles. Aucun déploiement ni validation en production. L'isolation des autres RPC de stock, les permissions des boutiques, la liste historique des super-administrateurs et les 18 échecs de migrations restent à auditer séparément. Aucune hausse du score officiel avant validation des preuves et du déploiement.
