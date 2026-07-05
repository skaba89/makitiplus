# MakitiPlus — Checklist magasin pilote

## 1. Avant le lancement

- [ ] Choisir 1 magasin pilote
- [ ] Créer l'organisation dans le dashboard super_admin
- [ ] Créer le compte admin boutique
- [ ] Créer 1 à 2 comptes vendeurs
- [ ] Importer ou saisir 50 à 100 produits
- [ ] Vérifier les catégories (noms, couleurs, icônes)
- [ ] Vérifier le stock initial pour chaque produit
- [ ] Vérifier la devise configurée (GNF, XOF, etc.)
- [ ] Vérifier la taxe si utilisée (TVA, pas de taxe, etc.)
- [ ] Tester la connexion internet sur site (3G/4G/WiFi)
- [ ] Tester sur téléphone, tablette et PC
- [ ] Tester l'imprimante ou la génération PDF de reçu
- [ ] Tester le scanner code-barres si utilisé
- [ ] Vérifier que le mode hors-ligne fonctionne (couper le réseau, recharger la page)
- [ ] Vérifier les méthodes de paiement configurées (cash, mobile money, crédit)

## 2. Tests obligatoires jour 0

### Authentification
- [ ] Login admin — accès complet au dashboard
- [ ] Login vendeur — accès limité au POS uniquement
- [ ] Déconnexion et reconnexion

### Produits
- [ ] Ajout d'un nouveau produit
- [ ] Modification du stock d'un produit
- [ ] Recherche produit par nom
- [ ] Recherche produit par code-barres (si scanner)

### Ventes
- [ ] Vente cash complète
- [ ] Vente mobile money (Wave, Orange Money)
- [ ] Vente à crédit (si activée)
- [ ] Annulation ou correction manuelle (si procédure prévue)
- [ ] Génération de reçu (PDF ou impression)

### Rapports
- [ ] Rapport de la journée — ventes du jour visibles
- [ ] Vérification des totaux vs ventes réelles

### Mode hors-ligne
- [ ] Passer en mode offline (couper le réseau)
- [ ] Effectuer une vente offline
- [ ] Vérifier que le stock local est décrémenté
- [ ] Vérifier que le ticket local est généré
- [ ] Revenir en ligne
- [ ] Vérifier la synchronisation automatique
- [ ] Vérifier le stock après synchronisation

## 3. Suivi quotidien pendant 7 jours

Chaque jour, noter :

- [ ] Nombre de ventes effectuées
- [ ] Erreurs rencontrées (type, fréquence, heure)
- [ ] Écarts de stock constatés
- [ ] Lenteur à la caisse (temps de chargement, freeze)
- [ ] Problèmes de connexion internet (durée, fréquence)
- [ ] Problèmes de reçus (impression, PDF, envoi)
- [ ] Retours des vendeurs (confusion, difficultés)
- [ ] Retours du patron (rapports corrects, chiffres cohérents)
- [ ] Captures d'écran des incidents
- [ ] Actions correctives prises

## 4. Critères de réussite pilote

Le pilote est considéré réussi si :

- [ ] 7 jours consécutifs sans perte de vente
- [ ] 0 perte de données (toutes les ventes synchronisées)
- [ ] 0 erreur critique POS (crash, données corrompues)
- [ ] Stock cohérent à plus de 95 % après sync
- [ ] Le vendeur est capable d'utiliser l'application sans assistance après formation
- [ ] Le patron valide les rapports de vente
- [ ] Le support quotidien est maîtrisé (temps de réponse < 30 min)

## 5. Passage à plusieurs magasins

Autoriser 3 à 5 magasins supplémentaires **uniquement si** :

- [ ] Le premier magasin est stable depuis 7 jours
- [ ] La synchronisation offline est validée sans perte de données
- [ ] Les rapports journaliers sont validés par les patrons
- [ ] Les admins comprennent la gestion des utilisateurs
- [ ] Le support peut répondre rapidement (< 30 min)

## 6. Ne pas faire pendant le pilote

- **NE PAS** activer 20 magasins d'un coup
- **NE PAS** tester de grosses migrations SQL en journée de vente
- **NE PAS** changer les règles RLS sans test préalable sur staging
- **NE PAS** modifier Stripe ou le billing en production sans avoir testé sur staging
- **NE PAS** supprimer les données pilote (elles servent de référence)
- **NE PAS** désactiver le mode offline
- **NE PAS** donner les droits super_admin aux admins boutique
