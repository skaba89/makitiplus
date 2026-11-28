# Transition contrôlée des réceptions fournisseurs

Statut : proposition NON VALIDÉE, aucun déploiement autorisé.

Le test de la PR #195 démontre que les anciennes RPC incrémentales sans UUID contournent le registre des réceptions. Ne pas autoriser simultanément les écritures anciennes et nouvelles. Deux demandes identiques peuvent représenter deux livraisons légitimes : ne jamais dédupliquer sur le seul contenu.

## Séquence proposée en recette isolée

1. Informer les gérants, suspendre les réceptions, identifier les PWA anciennes et réconcilier toutes les demandes ambiguës avec commandes, mouvements et justificatifs. Ne pas effacer les files locales.
2. Vérifier sauvegarde/restauration et audit historique ; toute anomalie non résolue bloque la suite.
3. Préparer une migration numérotée revue séparément. Tester la révocation des deux anciennes signatures et les droits de la nouvelle RPC dans une transaction isolée. Ne pas exécuter le fichier SQL example sur une base réelle.
4. Durant la fenêtre sans réception, vérifier côté serveur que les anciennes signatures sont refusées et que les tentatives répétées ne modifient ni stock, ni quantité reçue, ni mouvements, ni registre UUID.
5. Valider le nouveau client en recette, y compris perte de réponse après COMMIT, reconnexion, multi-onglets et conservation de l'UUID. Les anciennes PWA doivent se mettre à jour avant de reprendre les réceptions. Un refus serveur est préférable à une double écriture ; ce refus ne constitue pas une compatibilité fonctionnelle.
6. Reprendre les réceptions seulement après preuves complètes et accord explicite du propriétaire. Les attestations de build ne remplacent pas les preuves.

## Retour arrière

Suspendre les réceptions, préserver le registre UUID et les files locales, rapprocher toutes les opérations ambiguës. Ne pas réaccorder automatiquement les anciennes RPC : cela réintroduit le risque démontré. Préférer un correctif forward-only ; toute restauration nécessite une décision distincte et l'analyse des écritures postérieures à la sauvegarde.

Voir `PO_RECEIPT_LIVE_EVIDENCE_CHECKLIST.md` et `PO_RECEIPT_ATOMIC_CUTOVER_REVIEW.md`. Les tests natifs ne prouvent pas à eux seuls la mise à jour des PWA ni la réussite de la recette réelle.
