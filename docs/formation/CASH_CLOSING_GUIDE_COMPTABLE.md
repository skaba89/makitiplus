# Guide Comptable — Clôture de caisse

## Votre rôle sur ce module

En tant que comptable, votre accès à la Clôture de caisse est **strictement en lecture seule** : vous consultez et exportez, vous n'ouvrez jamais de caisse, vous ne clôturez jamais une session à la place d'un vendeur, et vous n'approuvez ni ne rejetez aucune clôture. Ces actions restent réservées au manager/admin, y compris quand un vendeur est absent — ce n'est pas une limitation technique arbitraire, c'est une séparation des responsabilités volontaire (celui qui compte physiquement la caisse doit être celui qui certifie le comptage).

## Consulter l'historique

Sur **Clôture caisse**, la carte **Historique** vous montre toutes les sessions de l'organisation (toutes boutiques), avec :
- le nom du vendeur qui a ouvert la session,
- le magasin concerné (organisations multi-magasin),
- les horaires d'ouverture/clôture,
- le statut (ouverte, en attente, approuvée, rejetée),
- le total des ventes et, une fois clôturée, l'écart de caisse.

## Filtrer

Combinez librement les filtres en haut de la carte Historique :
- **Date** (du / au),
- **Statut** (ouverte / en attente / approuvée / rejetée),
- **Vendeur**,
- **Magasin** (si l'organisation en a plusieurs).

## Exporter

- **Export CSV** : exporte exactement les sessions actuellement filtrées, avec vendeur et magasin en colonnes — pratique pour un rapprochement comptable périodique.
- **Impression** : disponible sur une session individuelle depuis sa vue détaillée (pour un PDF, utilisez "Enregistrer en PDF" dans la fenêtre d'impression du navigateur).

## Ce que vous ne verrez jamais

- Le bouton "Ouvrir la caisse" (réservé vendeur/manager/admin).
- Les boutons "Approuver" / "Rejeter" (réservés manager/admin).
- Aucune action pouvant modifier une session existante — votre vue est purement consultative, à l'image du super_admin (audit) mais scopée à votre organisation.

## Questions fréquentes

**Je repère un écart de caisse suspect en analysant l'historique, que faire ?**
Signalez-le au manager/admin de la boutique concernée — c'est à eux d'investiguer avec le vendeur et, le cas échéant, de rejeter une clôture déjà en attente ou de documenter la correction. Vous n'avez pas d'action directe possible sur la session elle-même.

**Puis-je clôturer la caisse d'un vendeur en congé pour ne pas bloquer le rapport mensuel ?**
Non. C'est explicitement interdit par design. Le rapport mensuel doit attendre que la session soit clôturée par la personne responsable de cette caisse, ou escaladez au manager/admin pour qu'il gère la situation.
