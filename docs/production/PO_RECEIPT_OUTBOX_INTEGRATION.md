# Outbox IndexedDB de réception — étape préparatoire

Le module `src/lib/purchaseOrderReceiptOutbox.ts` conserve de manière
atomique un identifiant UUID et le contenu canonique d'une réception avant
toute future émission réseau. Les appels répétés obtiennent le même UUID et
ne peuvent pas altérer le contenu enregistré.

**Non activé dans l'interface :** le formulaire utilise encore la RPC
historique. Aucun appel à `receive_purchase_order_once` n'est déclenché
par cette PR et aucune mutation côté serveur n'est faite.

### Contrat de l'intégration future

- Avant soumission, appeler `preparePurchaseReceipt` en fournissant
  `organization_id`, `actor_id`, `order_id`, lignes et notes.
- Réutiliser exactement `receipt_id`, `items` et `notes` depuis
  l'enregistrement persistant pour tout retry HTTP ou redémarrage.
- En cas de panne réseau, conserver la réception et afficher clairement
  qu'elle est en attente ; ne jamais fabriquer de nouvel UUID en secours.
- Après confirmation de la RPC **idempotente** côté serveur et commit,
  appeler `acknowledgePurchaseReceipt`.
- L'ancienne API non idempotente ne doit jamais être utilisée comme
  solution de repli pour rejouer ces réceptions.
- La mise en production nécessite le serveur déployé, des tests
  d'extrémité à extrémité, la gestion de la reconnexion, l'observabilité,
  la réconciliation des erreurs, la sécurité RLS et la révocation
  contrôlée des anciennes RPC.
- Attention : ce module est une première brique. Il ne constitue
  pas encore un moteur de synchronisation multi-onglets/multi-appareils,
  une sauvegarde serveur des requêtes en attente, ni une solution de
  récupération après effacement du stockage navigateur.
