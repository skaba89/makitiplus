# Décision Go/No-Go : réceptions fournisseurs idempotentes

Le nouveau flux de réception de MakitiPlus a trois composants **distincts** :
1. garde métier SQL `receive_purchase_order` (encore sous forme candidate) ;
2. registre durable et RPC `receive_purchase_order_once` (candidate) ;
3. stockage offline IndexedDB et transport de réception (dans le dépôt, mais non raccordés au formulaire actif).

## Ordre de bascule recommandé

1. Vérifier les données historiques en lecture seule avec
   `scripts/admin/audit_purchase_order_receipts.sql.example`.
   Examiner spécialement les commandes sans boutique et les lignes dupliquées.
2. Préparer une migration **forward-only** dans un environnement jetable.
   Protéger ou retirer toutes les surcharges historiques de
   `receive_purchase_order`, notamment `(uuid,jsonb)` et `(uuid,jsonb,text)`.
   Ne jamais les laisser accessibles en parallèle sans stratégie explicite.
3. Tester la migration sur Supabase natif : transactions concurrentes,
   autorisations admin/manager, super_admin selon règles réelles, absence
   d'accès pour autres rôles, organisations/boutiques et événements de stock.
4. En recette isolée, exécuter le SQL **en lecture seule**
   `scripts/admin/audit_purchase_receipt_cutover.sql.example`.
   Chaque ligne `passed=false` est un blocage de mise en production.
5. Une fois la RPC disponible, raccorder explicitement le client au transport
   idempotent et à l'outbox IndexedDB, sans fallback vers une RPC historique.
   Tester la coupure après COMMIT, la reprise, le multi-onglet et la perte
   d'accès IndexedDB.
6. Prévoir une transition compatible des anciennes PWA installées.
   La révocation brutale des anciennes RPC casse ces clients ; maintenir un
   RPC historique non protégé laisse un contournement. La stratégie de
   compatibilité doit être validée métier et sécurité avant la bascule.
7. Sauvegarde, restauration sur instance isolée, monitoring, fenêtre de
   déploiement et validation humaine obligatoires avant PROD.

## Interprétation des résultats

Le contrôle SQL vérifie **uniquement** la présence des objets, leurs droits
et leurs paramètres de sécurité. Il ne prouve pas les validations métier,
la robustesse du transport offline, ni une migration déjà appliquée.

**Etat actuel :** pas de déploiement autorisé par cette documentation.
Aucun script du dossier `scripts/admin` ne doit être exécuté automatiquement
sur une base réelle. L'ancienne API demeure utilisée par le formulaire.
