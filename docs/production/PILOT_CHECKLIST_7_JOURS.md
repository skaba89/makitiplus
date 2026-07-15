# MakitiPlus — Checklist Pilote Magasin (7 jours)

**Objectif** : Valider le système en conditions réelles pendant 7 jours avec un vrai commerçant.

---

## 📋 JOUR 0 — Préparation (avant ouverture)

### Configuration système
- [ ] Migration SQL consolidée exécutée ✅
- [ ] 9 Edge Functions déployées ✅
- [ ] Build déployé sur Render ✅
- [ ] Vérifier que le PWA s'installe sur mobile (Chrome → Ajouter à l'écran d'accueil)

### Création de l'organisation pilote
- [ ] Choisir 1 magasin pilote (avec commerçant volontaire)
- [ ] Super_admin crée l'organisation : nom + magasin + devise + pays
- [ ] Super_admin crée l'admin boutique (email + mot de passe)
- [ ] Admin boutique se connecte → vérifier qu'il ne voit PAS le super_admin
- [ ] Créer 1-2 comptes vendeurs (depuis le compte admin boutique)

### Données initiales
- [ ] Importer ou saisir 50-100 produits (CSV ou manuel)
- [ ] Vérifier les catégories (10 catégories par défaut créées automatiquement)
- [ ] Vérifier le stock initial pour chaque produit
- [ ] Configurer 2-3 fournisseurs
- [ ] Vérifier la devise (GNF, XOF, etc.)

### Tests techniques sur site
- [ ] Tester la connexion internet (3G/4G/WiFi)
- [ ] Tester sur téléphone Android (Chrome)
- [ ] Tester sur tablette (si disponible)
- [ ] Tester sur PC (Chrome/Firefox)
- [ ] Tester l'imprimante ou génération PDF de reçu
- [ ] Tester le scanner code-barres (si utilisé)
- [ ] Couper le réseau → vérifier le mode hors-ligne (créer une vente, reconnecter → sync)

---

## 📋 JOUR 1 — Ouverture et premières ventes

### Tests authentification
- [ ] Login admin boutique — accès complet
- [ ] Login vendeur — accès limité au POS
- [ ] Déconnexion et reconnexion
- [ ] Test reset mot de passe (par super_admin)

### Tests POS (vendeur/admin)
- [ ] Ajouter un produit au panier
- [ ] Modifier la quantité
- [ ] Appliquer une remise
- [ ] Encaisser en espèces (montant exact)
- [ ] Encaisser en espèces (avec monnaie à rendre)
- [ ] Encaisser via Wave
- [ ] Encaisser via Orange Money
- [ ] Encaisser à crédit (client)
- [ ] Imprimer/envoyer le reçu
- [ ] Vérifier le stock décrémenté après vente

### Tests produits
- [ ] Ajouter un nouveau produit
- [ ] Modifier un produit (prix, stock)
- [ ] Ajuster le stock (inventaire)
- [ ] Désactiver un produit
- [ ] Scanner un code-barres

### Tests clients
- [ ] Créer un client
- [ ] Vente à crédit pour ce client
- [ ] Vérifier le solde créditeur

---

## 📋 JOUR 2 — Gestion et rapports

### Tests dépenses
- [ ] Enregistrer une dépense (achat fournisseur)
- [ ] Enregistrer une dépense (loyer, électricité, etc.)
- [ ] Voir le total dépenses du jour

### Tests commandes fournisseurs
- [ ] Créer une commande fournisseur
- [ ] Ajouter des produits à la commande
- [ ] Recevoir la commande (BL)
- [ ] Vérifier le stock mis à jour
- [ ] Télécharger le BL
- [ ] Envoyer le BL par email/WhatsApp

### Tests rapports
- [ ] Consulter le rapport du jour
- [ ] Vérifier le CA, les dépenses, le bénéfice net
- [ ] Vérifier le top des produits vendus
- [ ] Consulter le rapport de la semaine
- [ ] Exporter les ventes en CSV

### Tests conversion de devise
- [ ] Cliquer sur l'icône 💰 dans Produits
- [ ] Sélectionner une autre devise (ex: XOF si org en GNF)
- [ ] Vérifier que les prix s'affichent convertis
- [ ] Vérifier l'infobulle avec le prix original
- [ ] Tester sur Rapports et Commandes

---

## 📋 JOUR 3 — Clôture de caisse et inventaire

### Tests clôture de caisse
- [ ] En fin de journée → page Clôture de caisse
- [ ] Compter la caisse réelle
- [ ] Saisir le montant réel
- [ ] Vérifier l'écart (excédent/manque)
- [ ] Valider la clôture
- [ ] Imprimer le rapport de clôture

### Tests stock
- [ ] Faire un inventaire physique de 10 produits
- [ ] Comparer avec le stock système
- [ ] Ajuster les écarts (avec motif)
- [ ] Vérifier l'historique des mouvements de stock

---

## 📋 JOUR 4 — Mode hors-ligne

### Tests offline
- [ ] Couper la connexion internet
- [ ] Créer 3-5 ventes hors-ligne
- [ ] Vérifier l'indicateur "Hors-ligne"
- [ ] Reconnecter internet
- [ ] Vérifier la synchronisation automatique
- [ ] Vérifier que les ventes apparaissent dans les rapports

### Tests PWA
- [ ] Installer l'app sur mobile (Add to Home Screen)
- [ ] Lancer l'app depuis l'icône
- [ ] Vérifier qu'elle fonctionne en plein écran
- [ ] Tester le mode hors-ligne après installation

---

## 📋 JOUR 5 — Gestion des utilisateurs

### Tests super_admin
- [ ] Super_admin se connecte
- [ ] Vérifier qu'il voit TOUTES les orgs et magasins
- [ ] Vérifier qu'il NE voit PAS le POS (pas accès vente)
- [ ] Vérifier qu'il NE voit PAS les Clients

### Tests admin boutique
- [ ] Admin boutique ne voit PAS le super_admin dans sa liste
- [ ] Admin boutique ne voit QUE sa propre org
- [ ] Admin boutique peut créer des vendeurs/managers
- [ ] Admin boutique peut désactiver un vendeur

### Tests reset mot de passe
- [ ] Super_admin reset le mot de passe d'un vendeur
- [ ] Super_admin reset le mot de passe de l'admin boutique
- [ ] Vendeur se connecte avec le nouveau mot de passe

---

## 📋 JOUR 6 — Gestion des abonnements (super_admin)

### Tests Billing
- [ ] Super_admin → page Billing
- [ ] Sélectionner l'org pilote dans le dropdown
- [ ] Vérifier les détails (plan, statut, expiration, magasins)
- [ ] Changer le plan (ex: Starter → Croissance)
- [ ] Vérifier que le plan est mis à jour
- [ ] Prolonger l'abonnement (1 mois)
- [ ] Vérifier la date d'expiration mise à jour

### Tests AdminAnalytics
- [ ] Super_admin → page Analyse Multi-Magasins
- [ ] Vérifier les KPIs globaux (convertis en €)
- [ ] Vérifier le tableau par magasin (montants en € pivot)
- [ ] Vérifier le graphique des ventes
- [ ] Vérifier le top des articles

---

## 📋 JOUR 7 — Bilan et rétrospective

### Collecte des métriques
- [ ] Nombre total de ventes sur 7 jours
- [ ] CA total sur 7 jours
- [ ] Nombre de produits actifs
- [ ] Nombre de clients enregistrés
- [ ] Nombre de commandes fournisseurs
- [ ] Nombre de clôtures de caisse effectuées
- [ ] Temps moyen de réponse du POS

### Retour utilisateur
- [ ] Recueillir les retours du commerçant (points forts)
- [ ] Recueillir les points faibles / friction
- [ ] Noter les bugs rencontrés
- [ ] Noter les fonctionnalités manquantes

### Vérifications techniques
- [ ] Vérifier les logs Supabase (erreurs Edge Functions)
- [ ] Vérifier Sentry (erreurs frontend)
- [ ] Vérifier les performances (temps de chargement)
- [ ] Vérifier la taille de la base de données

### Décision
- [ ] Validé pour déploiement national ? (Oui/Non)
- [ ] Si Non : liste des corrections à apporter
- [ ] Si Oui : plan de déploiement sur 10-100 magasins

---

## 🚨 Procédure de rollback (en cas de problème majeur)

Si un bug critique est découvert pendant le pilote :

1. **Ventes impossibles** → utiliser le carnet de papier en attendant
2. **Perte de données** → contacter le support technique immédiatement
3. **Erreur 500** → vérifier les logs Supabase Edge Functions
4. **Login impossible** → exécuter la migration `20260715200000` à nouveau

### Contacts urgence
- Support technique : [à définir]
- Supabase dashboard : https://supabase.com/dashboard/project/exxntkuursgwhxvehekr
- Render dashboard : [URL à définir]

---

## ✅ Critères de succès du pilote

Le pilote est considéré comme **réussi** si :

- ✅ Au moins 100 ventes effectuées sur 7 jours
- ✅ Aucune perte de données
- ✅ Mode hors-ligne fonctionne (au moins 1 test concluant)
- ✅ Clôture de caisse effectuée au moins 3 fois
- ✅ Aucun bug bloquant non résolu
- ✅ Commerçant satisfait (note ≥ 7/10)
- ✅ Performances acceptables (temps de réponse < 3s)

Si tous les critères sont remplis, le système est prêt pour le déploiement national.
