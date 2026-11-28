# MakitiPlus — Réceptions fournisseurs : décision GO/NO-GO

Date de revue : 2026-11-28 (UTC). Statut : **NO-GO pour la bascule en production**.

## Références vérifiées

- Branche principale : `main` à `ea5465a365a6cf35d53afe13fa24ce8314d0fc9b`.
- PR #196 : `feature/po-receipt-cutover-legacy-pause`, commit initial contrôlé `0a41ae631d3c7e12f4f6f7fcb7ac7699ee3f8a41`.
- Avant ce rapport, CI : [45570989915](https://github.com/skaba89/makitiplus/actions/runs/45570989915) **success**.
- Avant ce rapport, Supabase Native Snapshot : [45570989943](https://github.com/skaba89/makitiplus/actions/runs/45570989943) **success**.
- Avant ce rapport, Release Readiness : [45570990101](https://github.com/skaba89/makitiplus/actions/runs/45570990101) **success**.
- La PR #195 montre qu'une ancienne RPC de réception incrémentale pouvait contourner le registre UUID dans une coexistence non contrôlée. La réussite du test signifie que le contre-exemple a été reproduit.
- La PR #196 ajoute des assertions SQL : deux tentatives des anciennes signatures après révocation doivent être refusées (SQLSTATE 42501) et préserver quantité en stock, quantité reçue, nombre de mouvements et registre de réceptions UUID. Ces assertions ont passé dans le workflow natif cité plus haut.

## Ce qui est démontré

- Les contrôles automatisés sur le **commit initial** de la PR #196 sont verts.
- Le test natif couvre le refus des signatures historiques après la révocation simulée dans une transaction isolée.
- Les scripts et le document `PO_RECEIPT_CONTROLLED_TRANSITION.md` préservent la possibilité d'interrompre les réceptions sans remettre en service les RPC legacy dangereuses.

## Ce qui n'est PAS démontré

- Aucune migration effective en recette Supabase isolée n'a été exécutée par cette revue.
- Aucun relevé prouvant la migration des appareils / anciennes PWA, leurs files IndexedDB et leur reconnexion après mise à jour.
- Aucune preuve de sauvegarde réellement restaurée, de RTO/RPO mesurés ou d'alignement frontend et schéma.
- Aucune preuve de compatibilité d'un ancien client physique ni d'une fenêtre de maintenance validée.
- Aucune autorisation du propriétaire de fusionner ou de basculer la production.
- Aucun test de réception sur des données client réelles, aucune modification de production.

## Critères obligatoires avant GO

1. Exécuter les audits historiques et les corrections manuelles documentées **en lecture seule** et obtenir zéro anomalie critique non arbitrée.
2. Sur un projet de recette jetable : installer la migration candidate, tester les deux RPC anciennes après révocation, permissions tenant/roles, même UUID répété, UUID concurrents, réception partielle, dépassement de reliquat et absence d'effets secondaires en échec.
3. Tester au moins une ancienne PWA, une PWA actualisée et une reconnexion après une réponse réseau perdue ; démontrer que les files IndexedDB sont conservées et réconciliées.
4. Fournir des preuves datées : SHAs, version du schéma, résultats SQL, état des stocks et mouvements avant/après, erreurs attendues, rapports RTO et RPO.
5. Répéter une procédure de suspension et retour sûr en recette ; jamais de réactivation automatique des RPC legacy.
6. Obtenir l'approbation explicite du propriétaire pour fusion et déploiement.

**Décision : NO-GO.** Garder les indicateurs de bascule désactivés. Une CI verte seule n'autorise pas le déploiement.

## Travail suivant

- Terminer la recette isolée et recueillir les preuves manquantes (sans toucher aux données pilotes).
- Réconcilier les tickets GitHub avec les preuves plutôt que les fermer automatiquement.
- Démarrer MKP-008 (coût moyen pondéré à la réception) sur une **branche dédiée uniquement après sécurisation du cutover**, afin de ne pas intervenir sur deux mécanismes concurrents de réception.
