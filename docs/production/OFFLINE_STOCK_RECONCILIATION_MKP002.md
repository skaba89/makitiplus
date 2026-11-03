# MKP-002 — Ventes encaissées hors ligne et conflits de stock

**Date :** 2026-11-03 · **Statut :** phase de confinement proposée en PR, pas une résolution comptable complète.

## Choix conservateur (par défaut)

La politique finale nécessite l'accord du propriétaire : **(a)** stock négatif sous contrôle avec alerte et mouvement d'écart, ou **(b)** arbitrage manuel du gérant.

**Cette PR ne présume pas cette décision.** Elle implémente seulement une **file d'arbitrage locale et non destructive**, dans l'attente de la décision : les RPC qui échouent sur `Stock insuffisant` sont maintenues dans IndexedDB ; aucune écriture de vente ni de stock négatif n'est forcée côté serveur.

## Parcours mis en œuvre

1. Une vente réalisée hors connexion garde son numéro d'origine, son payload et son horodatage local.
2. Si la RPC serveur refuse le stock, l'opération devient `failed`, `reviewReason=stock_insufficient` et `reviewAt` est horodaté localement.
3. Les reconnexions, synchronisations périodiques et boutons globaux « Réessayer » **ne redéclenchent pas** ces conflits métier ; les erreurs réseau temporaires restent retentées.
4. Le responsable ouvre **Tableau de bord → Ventes offline** sur **le même appareil** et voit les conflits à arbitrer, y compris ceux de plus de 24 h.
5. Il vérifie l'inventaire physique, corrige le stock **par le flux d'inventaire existant** (avec trace côté serveur si son processus métier le prévoit), puis confirme la relance individuelle.
6. Cette action réarme la **même** opération et conserve son numéro de vente et le nombre cumulé de tentatives. La RPC habituelle applique toujours sa validation de stock, ses contrôles d'accès et son idempotence.
7. Une nouvelle erreur de stock remet la vente en arbitrage, sans effacer le payload.

## Limites importantes

- **L'alerte >24 h est locale :** elle est visible uniquement sur l'appareil où le navigateur conserve la vente. Ce n'est pas une notification serveur, email/SMS ou une file consolidée accessible depuis tous les appareils du commerce.
- **La vente refusée n'est PAS intégrée en base serveur.** Ne pas comptabiliser ces ventes comme confirmées tant que la synchronisation ne réussit pas.
- **La PR ne crée aucun mouvement automatique dans `stock_movements`** : cette exigence reste à développer une fois la politique métier et le schéma d'audit validés ; ne pas simuler une écriture de stock négatif en dehors du serveur.
- L'interface ne remplace pas une vérification physique du stock ni une politique de régularisation et de justification des écarts.
- Ne jamais effacer les données du navigateur / réinstaller l'application tant qu'il reste une transaction non synchronisée. Sauvegarder l'export CSV ne suffit **pas** à restaurer la file RPC complète.
- Des erreurs serveur autres que `stock insuffisant` peuvent également imposer une intervention humaine ; cette PR cible uniquement le stock.

## Tests exigés avant toute production

- Unitaire IndexedDB : zéro suppression, quarantine de l'erreur, aucun retry global/automatique, relance individuelle autorisée, tenant strict, conservation du numéro, reblocage si le stock reste insuffisant.
- SQL sur PostgreSQL jetable : deux caisses prennent le dernier article en parallèle, une offline ; refus sans écriture partielle ni stock négatif ; ensuite ajustement de stock audité et rejeu strictement idempotent.
- E2E sur organisation **synthétique de test** : visibilité des conflits et alertes après 24 h sur le même navigateur, accès refusé au vendeur, validation de l'action responsable, retour en arbitrage si stock toujours insuffisant.
- Validation métier : choix officiel du modèle (stock négatif contrôlé ou arbitrage), règles et permission des ajustements, journal serveur `stock_movements`, supervision centralisée.

**Aucune migration destructive ni donnée pilote modifiée par cette PR.** Le ticket #82 reste ouvert tant que les critères de sortie non couverts ne sont pas démontrés.
