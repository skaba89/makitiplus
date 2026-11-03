# MKP-003 — Vente à crédit atomique et offline idempotente

**Date :** 2026-11-03 · **État :** proposé en PR ; non déployé et non vérifié en production.

## Architecture

Une nouvelle fonction `public.create_credit_sale_atomic` réalise dans **la même transaction PostgreSQL** : validation de l'appelant et de l'organisation, vente et stock via `public.create_sale_with_limit`, sélection ou création du client, insertion dans `customer_credits`, incrément du solde du client. Une erreur dans l'une des opérations annule toute la transaction.

- Les autres moyens de paiement continuent à appeler `create_sale_with_limit` inchangée.
- Pour le crédit, le frontend appelle `create_credit_sale_atomic` en ligne et n'enqueue **qu'une seule** RPC hors ligne.
- Le `sale_number` reste identique lors d'un rejeu ; la vente existante est verrouillée et une dette existante pour ce numéro est traitée comme un succès idempotent.
- Les anciennes mutations `increment_customer_credit_by_phone` déjà stockées sur des appareils demeurent reconnues (migration du 2026-11-02) : ne jamais effacer IndexedDB.
- Un client sans téléphone peut être retrouvé par nom exact ; si plusieurs clients sans téléphone portent le même nom dans l'organisation, la vente est refusée plutôt que d'imputer une dette au mauvais client.

## Ordre impératif de déploiement

1. Vérifier sur **staging isolé**, avec sauvegarde testée, que les migrations antérieures sont présentes, notamment `20261102100000_credit_by_phone_idempotent.sql`, la contrainte unique des numéros de vente et la signature effective de `create_sale_with_limit` incluant `p_payment_reference`.
2. Exécuter `20261103160000_atomic_credit_sale.sql` sur staging, vérifier l'accès RPC authentifié et l'absence d'accès anonyme.
3. Exécuter les tests en base jetable et Playwright avec des utilisateurs, stocks et clients fictifs. Vérifier le retour d'erreur de stock et l'absence d'écriture partielle.
4. Après feu vert manuel, appliquer d'abord la migration backend cible, puis déployer la version frontend correspondante.
5. Observer les ventes crédit et la file offline après déploiement sans toucher aux données pilotes pour les tests.

**Ne jamais déployer le frontend avant la migration** : en l'absence de la nouvelle RPC, les ventes à crédit échoueraient.

## Plan de test SQL d'intégration (base jetable uniquement)

| Cas | Assertion |
|---|---|
| Première vente crédit par téléphone | 1 vente, lignes et stock cohérents, 1 dette, solde augmenté une fois |
| Première vente crédit par nom seul | Client créé/retrouvé, dette enregistrée, solde correct |
| Rejeu du même numéro | 1 vente, 1 dette, 1 seul décrément de stock |
| Deux appels concurrents même numéro | Résultat équivalent à un seul appel ou échec sûr, sans double débit |
| Coupure réseau après commit | Même numéro rejoué, pas de seconde écriture |
| Erreur injectée lors de l'INSERT dette | Aucune vente, article ou décrément de stock validé |
| Stock insuffisant | Aucune vente ni dette validée |
| Appel anonyme / autre organisation | Erreur permission, aucune écriture |
| Même numéro avec montant différent | Erreur de conflit, aucune altération |
| Plusieurs clients homonymes sans téléphone | Erreur claire, pas de dette à un client arbitraire |
| Ancienne dette déjà présente | Pas de deuxième ligne ni incrément |
| Ventes cash et paiement mobile | Parcours actuel inchangé |

## Limites et validation

Les nouveaux tests Vitest vérifient le **contrat du code** (structure des appels et protections), pas une transaction PostgreSQL réellement exécutée. Le chantier ne doit pas être considéré comme entièrement achevé sans test d'intégration SQL sur une base jetable et contrôle des signatures actives. Une PR verte ne démontre pas à elle seule que la migration est appliquée en production.

**Suivi :** ticket [#83](https://github.com/skaba89/makitiplus/issues/83).
