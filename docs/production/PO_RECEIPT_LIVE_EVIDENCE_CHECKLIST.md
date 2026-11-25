# Recette de transition des réceptions fournisseurs

Statut initial : NON VALIDÉ. Ce document ne constitue pas une autorisation de déploiement. Voir `PO_RECEIPT_BUILD_CUTOVER_GATE.md`.

## Préparation

- [ ] Identifier le SHA frontend, la version de migration, l'environnement de recette isolé et les versions PWA testées.
- [ ] Vérifier sauvegarde et restauration isolée ; relever le temps de restauration et le responsable.
- [ ] Utiliser deux organisations et des produits fictifs ; relever stocks, lignes de réception et mouvements avant chaque scénario.

## Scénarios bloquants

| Scénario | Résultat attendu | Preuve |
|---|---|---|
| Réception partielle puis solde | Quantités cumulées exactes, statut cohérent | À fournir |
| Réponse perdue après COMMIT puis même UUID | Un seul effet métier et aucun double mouvement | À fournir |
| Deux appels simultanés avec même UUID | Un seul effet métier | À fournir |
| Même UUID avec contenu différent | Aucun deuxième effet, rejet ou résultat conforme au contrat audité | À fournir |
| Réceptions simultanées dépassant le reliquat | Aucun dépassement autorisé | À fournir |
| Accès depuis une autre organisation | Refus, aucune mutation | À fournir |
| Ancienne PWA ouverte avant transition, puis reconnexion | Parcours compatible sans doublon ; sinon NO-GO | À fournir |
| Mise à jour PWA puis réouverture | Nouvelle version démontrée et opérations en attente préservées | À fournir |
| Retour au frontend historique | Compatibilité serveur vérifiée, aucun effacement de données | À fournir |

Pour chaque scénario conserver date UTC, version, identifiant de test fictif, attendu, observé, résultat PASS/FAIL et référence de preuve expurgée. Un scénario non exécuté reste NON VALIDÉ. Ne pas inclure de secrets ou de données clients.

## Décision

- [ ] CI et Release Readiness verts sur le SHA candidat.
- [ ] Tous les scénarios bloquants réussis et preuves revues.
- [ ] Anciennes RPC maintenues tant que des clients historiques peuvent les utiliser.
- [ ] Procédure de retour arrière répétée en recette.
- [ ] Approbation explicite du propriétaire, datée.

Sans ces conditions, garder les flags frontend désactivés et ne renseigner aucune attestation de cutover à true. En cas de doublon, dépassement, divergence de stock ou fuite tenant, arrêter la recette, préserver les preuves et corriger avant toute activation.
