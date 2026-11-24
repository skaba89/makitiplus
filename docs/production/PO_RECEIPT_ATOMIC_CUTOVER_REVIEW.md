# Lot SQL atomique de bascule des réceptions — REVUE UNIQUEMENT

Ce lot rassemble dans un fichier unique :
- le garde SQL de réception fournisseur déjà éprouvé en tests ;
- le registre privé des UUID et `receive_purchase_order_once` ;
- la révocation des deux signatures historiques `receive_purchase_order(uuid,jsonb)` et `receive_purchase_order(uuid,jsonb,text)` pour les clients ;
- les permissions explicites de la nouvelle RPC.

Fichier : `scripts/admin/receive_purchase_order_atomic_cutover.sql.example`.

**Statut : candidat de revue, non autorisé en recette ou en production.**
Aucune migration numérotée n'est introduite dans cette PR, aucun
formulaire n'est basculé et aucune donnée d'une base réelle n'est changée.

## Test natif de ce lot

Le test `scripts/test-supabase-native-snapshot.mjs` :
1. compare le SQL assemblé aux deux candidats revus précédemment ;
2. l'installe sous un savepoint dans le Supabase local jetable ;
3. exécute le contrôle Go/No-Go des droits et objets ;
4. vérifie qu'aucune barrière structurale ne manque ;
5. annule toutes les modifications du lot par ROLLBACK TO SAVEPOINT.

Les autres tests natifs couvrent séparément les courses concurrentes,
le reliquat, les replays UUID, la séparation des organisations et les rôles.

## Bloqueurs avant création de la migration forward-only

- Vérifier les commandes et produits historiques (boutiques nulles,
  produits dupliqués, quantités déjà reçues incohérentes).
- Vérifier la matrice de rôles métier, y compris le traitement souhaité
  des super-administrateurs.
- Déployer et valider le nouveau client dans une fenêtre de transition ;
  une révocation anticipée interrompt les anciennes PWA installées.
- Tester la reprise réseau et la conservation de l'UUID après COMMIT
  avec une vraie instance de recette.
- Définir un mécanisme contrôlé de bascule et de retour arrière, avec
  sauvegarde, restauration isolée, supervision et preuve de compatibilité.
- Créer la migration numérotée par Supabase CLI sur l'environnement
  approprié, revalider les tests et obtenir une décision humaine de PROD.

Le fichier SQL de revue **ne doit jamais** être exécuté directement
sur une instance de recette ou de production.
