# Barrière de compilation — migration des réceptions fournisseurs

**État : aucun changement de l'API active ou de la production.**

Le formulaire de réception propose une future branche `receive_purchase_order_once`, désactivée par défaut. Le service worker PWA utilise `autoUpdate` et les anciennes pages installées peuvent continuer à appeler `receive_purchase_order` jusqu'à leur mise à jour réelle.

Les commandes `npm run build` et `npm run build:dev` lancent maintenant `scripts/check-po-receipt-build-gate.mjs`, qui lit les variables Vite du **même mode** avec `loadEnv`. La barrière est inactive pour les builds habituels, où les deux drapeaux du nouveau formulaire sont absents ou faux.

## Condition de passage lorsque la nouvelle API est activée

Les variables de build du frontend doivent valoir exactement `true` :
- `VITE_PO_RECEIPT_ONCE_ENABLED`
- `VITE_PO_RECEIPT_ONCE_RELEASE_APPROVED`

Les deux attestations **non Vite, non publiées au navigateur** doivent aussi être transmises à la commande de build par l'opérateur de release :
- `PO_RECEIPT_SERVER_CUTOVER_VERIFIED=true` — l'API UUID et les contrôles SQL ont été installés, audités et exercés sur l'environnement cible ;
- `PO_RECEIPT_LEGACY_PWA_COMPAT_VERIFIED=true` — les clients PWA historiques ont été traités via une transition compatible, une mise à jour démontrée et un plan de retour arrière approuvé.

Les attestations sont des **affirmations de l'opérateur**, pas des preuves automatiques. Les fichiers d'évidence, la restauration isolée et la décision humaine restent obligatoires. Ne pas insérer d'identifiants, de clés Supabase ou de secrets dans les variables `VITE_*`.

## Restrictions

- Ne pas révoquer les anciennes RPC tant que des PWA peuvent encore les appeler.
- Ne pas supposer que `autoUpdate` garantit la mise à jour instantanée d'onglets hors ligne.
- Ne pas activer les deux flags avant la migration serveur et la recette réseau réel avec réponse perdue après COMMIT.
- Ne pas contourner `npm run build` / `npm run build:dev` avec `vite build` directement : la barrière est exécutée par les scripts npm, pas par Vite lui-même.
- Une compilation réussie n'est pas une autorisation de déploiement.

Les tests `purchaseOrderReceiptBuildGate.test.ts` prouvent le refus des configurations contradictoires et des déploiements activés sans les deux attestations explicites.
