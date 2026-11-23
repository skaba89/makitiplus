# Réceptions fournisseurs — critères bloquants avant déploiement

**Statut : conception et revue, NON déployable.** Le fichier
`scripts/admin/receive_purchase_order_once.sql.example` est un candidat,
pas une migration. Il suppose que le garde SQL de la PR #175 a d'abord été
installé dans une base Supabase jetable et testé avec des données synthétiques.

## Contrat de rejeu

- Le client génère un UUID **une seule fois** pour chaque réception métier et
  le conserve jusqu'à preuve d'un succès serveur ; une relance réseau réutilise
  ce même UUID et exactement les mêmes lignes et notes.
- PostgreSQL verrouille la commande, puis compare la requête enregistrée :
  organisation, commande, auteur, panier canonique et notes.
- UUID identique et contenu identique : succès sans nouvel ajout de stock.
- UUID identique et contenu différent : SQLSTATE `23505`.
- UUID différent : nouvelle réception autorisée seulement si le reliquat,
  le statut, les produits et la boutique restent conformes.
- Transaction interrompue : registre et stock sont annulés ensemble.

## Barrières de lancement impératives

1. Exécuter un audit des produits sans boutique et des doublons
   `purchase_order_items(product_id, purchase_order_id)`; définir leur
   traitement sans réaffectation implicite de stock.
2. Tester réellement sur PostgreSQL/Supabase natif deux connexions concurrentes,
   mêmes UUID/panier, mêmes UUID/paniers différents, UUID différents, échec
   après écriture et rejouabilité après rollback.
3. Vérifier les statuts historiques `draft`, `sent`, `confirmed`, `partial`,
   `received`, `cancelled` et les permissions effectives des caissiers,
   responsables de magasins, administrateurs et super-administrateurs.
4. Prévoir la compatibilité des clients installés ; le nom RPC nouveau
   `receive_purchase_order_once` ne remplace **pas** l'ancien RPC.
   Révoquer l'exécution de l'ancien RPC à la bascule contrôlée une fois que
   tous les clients l'utilisant ont été migrés, sinon la protection reste
   contournable. Attention aux anciens overloads SQL.
5. Stocker durablement l'identifiant et le payload de réception dans la
   file offline (IndexedDB), avec confirmation **après commit** ; ne jamais
   générer un nouvel UUID sur un simple retry de la même réception.
6. Revoir la rétention du registre : supprimer prématurément une clé permet un
   double ajout de stock ; une politique d'archivage doit préserver
   les tombstones de déduplication.
7. Produire une migration créée par `supabase migration new`, testée et
   approuvée en recette, puis effectuer sauvegarde, plan de retour arrière,
   contrôle post-déploiement et validation humaine de production.

La présence du candidat en `main` n'autorise aucune exécution sur les
bases de recette ou de production.
