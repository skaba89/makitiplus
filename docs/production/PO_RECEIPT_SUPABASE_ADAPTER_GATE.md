# Intégration Supabase des réceptions idempotentes — module inactif

Le nouveau module `src/lib/purchaseOrderReceiptSupabaseAdapter.ts` ne change pas le
formulaire de réception existant. Il cible **exclusivement**
`receive_purchase_order_once` avec l'UUID durable créé par l'outbox.

En cas d'erreur SQL, de réponse perdue ou d'indisponibilité de la RPC, le
module signale l'échec et **ne tente jamais** `receive_purchase_order`.
L'outbox IndexedDB conserve la même réception pour une nouvelle tentative.

### Conditions préalables à l'activation

1. Terminer la migration forward-only du garde SQL, du registre et de la RPC
   `receive_purchase_order_once`, avec tests PostgreSQL réels.
2. Vérifier les droits sur les deux anciennes signatures et planifier une
   transition compatible des PWA déjà installées.
3. Régénérer les types Supabase depuis la base de recette après migration.
4. Brancher le formulaire sur `submitPurchaseReceipt` et
   `retryPendingPurchaseReceipt`, en injectant le transport créé par
   `createSupabaseReceiptOnceSender`.
5. Prévoir une UI explicite pour les requêtes en attente, les conflits et
   la synchronisation après redémarrage. Ne jamais forcer un acquittement.
6. Exécuter les tests E2E de réseau coupé, commit avec réponse perdue,
   reprise après reconnexion, multi-tenant et anciennes PWA.

Le merge de cette PR n'est **pas** une autorisation de déploiement ou
d'activation du nouveau flux.
