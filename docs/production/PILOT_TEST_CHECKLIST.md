# MakitiPlus — Guide de Test Pilote

## Avant de commencer

1. **Sauvegardez la DB** : Supabase Dashboard → Database → Backups → Create backup
2. **Exécutez le script SQL** : `PILOT_LAUNCH_ALL_IN_ONE.sql` dans Supabase SQL Editor
3. **Révoquez le token GitHub** : https://github.com/settings/tokens → révoquer toutes les PAT
4. **Attendez le rebuild Render** (5-10 min après le dernier push)

---

## Tests à effectuer (ordre recommandé)

### 1. Connexion Super Admin
- [ ] Se connecter avec `kaba.sekouna@gmail.com`
- [ ] Le Dashboard s'affiche avec le nom du magasin
- [ ] Le nom du magasin apparaît dans la sidebar

### 2. Création de produits
- [ ] Aller sur **Produits** → "Ajouter un produit"
- [ ] Créer un produit avec : nom, prix, stock, coût, catégorie, description, date de péremption
- [ ] Le produit apparaît dans la liste
- [ ] Le badge marge s'affiche si cost_price > 0
- [ ] Importer un CSV (bouton "Importer CSV") avec 5 produits

### 3. Création de fournisseur
- [ ] Aller sur **Fournisseurs** → "Ajouter un fournisseur"
- [ ] Créer un fournisseur avec : nom, téléphone, email, adresse, ville
- [ ] Le fournisseur apparaît dans la liste

### 4. Commande fournisseur
- [ ] Aller sur **Commandes** → "Nouvelle commande"
- [ ] Sélectionner un fournisseur
- [ ] Ajouter un produit (existant ou créer rapide)
- [ ] Saisir quantité + prix unitaire
- [ ] Cliquer "Créer la commande" → doit réussir
- [ ] Cliquer sur l'icône 👁 pour voir le détail
- [ ] Bouton "Télécharger le BL" → ouvre une fenêtre d'impression
- [ ] Bouton "Email" → ouvre le client email
- [ ] Bouton "WhatsApp" → ouvre WhatsApp

### 5. Vente au POS
- [ ] Aller sur **Point de vente**
- [ ] Cliquer sur un produit → s'ajoute au panier
- [ ] Ajouter une remise (montant ou pourcentage)
- [ ] Cliquer "Payer"
- [ ] Choisir "Espèces" → saisir montant reçu → confirmer
- [ ] Le reçu s'affiche
- [ ] Bouton "WhatsApp" sur le reçu → envoie le reçu
- [ ] Faire une vente avec "Wave" → doit réussir
- [ ] Faire une vente avec "Crédit" → doit réussir
- [ ] Créer un produit rapide ( taper nom inexistant → "Créer rapidement")

### 6. Clients
- [ ] Aller sur **Clients** → "Ajouter un client"
- [ ] Créer un client avec nom + téléphone
- [ ] Activer le filtre "Crédit uniquement" → voir les clients avec crédit

### 7. Dépenses
- [ ] Aller sur **Dépenses** → "Nouvelle dépense"
- [ ] Créer une dépense (catégorie, montant, date)
- [ ] La dépense apparaît dans la liste

### 8. Catégories
- [ ] Aller sur **Catégories**
- [ ] Les 10 catégories par défaut s'affichent
- [ ] Créer une nouvelle catégorie
- [ ] Supprimer une catégorie

### 9. Rapports
- [ ] Aller sur **Rapports**
- [ ] Choisir "Aujourd'hui" → les ventes du jour s'affichent
- [ ] Le bloc "Rentabilité" affiche marge brute, taux de marge, remises, bénéfice net
- [ ] Le graphique des ventes s'affiche
- [ ] La répartition par mode de paiement s'affiche
- [ ] Bouton "Exporter" → CSV des ventes

### 10. Clôture de caisse
- [ ] Aller sur **Clôture caisse** (menu sidebar)
- [ ] Les ventes du jour par mode de paiement s'affichent
- [ ] Saisir le montant réel en caisse
- [ ] L'écart se calcule automatiquement
- [ ] Bouton "Imprimer le rapport" → fenêtre d'impression
- [ ] Bouton "Clôturer la caisse" → enregistre

### 11. Rapport WhatsApp
- [ ] Sur le **Dashboard** → bouton "Rapport WhatsApp"
- [ ] Saisir un numéro → WhatsApp s'ouvre avec le résumé

### 12. Paramètres
- [ ] Aller sur **Paramètres** → onglet "Général"
- [ ] Modifier le nom de la boutique → "Enregistrer" → doit réussir
- [ ] Onglet "Personnalisation" → doit afficher le composant (pas "Upgradez")
- [ ] Onglet "Abonnement" → affiche le plan Starter

### 13. Test des utilisateurs
- [ ] Se déconnecter → se connecter avec `vendeur@test.com` / `Vendeur123!`
- [ ] Le vendeur ne voit que : Dashboard + POS (pas Produits, pas Rapports)
- [ ] Le vendeur peut faire une vente au POS
- [ ] Se déconnecter → se connecter avec `manager@test.com` / `Manager123!`
- [ ] Le manager voit : Produits, Clients, Fournisseurs, Commandes, Clôture caisse
- [ ] Le manager peut créer un produit
- [ ] Se déconnecter → se connecter avec `comptable@test.com` / `Comptable123!`
- [ ] Le comptable voit : Rapports, Dépenses, Dashboard (pas POS)

### 14. Mode offline
- [ ] Ouvrir le POS → couper le réseau (DevTools → Network → Offline)
- [ ] L'indicateur "Hors ligne" apparaît
- [ ] Faire une vente → doit réussir (mise en cache locale)
- [ ] Restaurer le réseau → la vente se synchronise

### 15. Diagnostic
- [ ] Aller sur `/diagnostic`
- [ ] Tous les checks doivent être ✅ (ou ⚠️ pour les warnings)

---

## Critères de réussite du pilote

Le pilote est réussi si pendant 7 jours :
- ✅ Aucune erreur P0 (page inaccessible, données perdues)
- ✅ Aucune erreur P1 récurrente (vente impossible, création produit impossible)
- ✅ Taux d'erreur JavaScript < 1% (Sentry)
- ✅ Feedback utilisateur positif
- ✅ Toutes les ventes sont correctement enregistrées
- ✅ Les rapports sont cohérents avec les ventes

## En cas de problème

1. Ouvrir la console (F12 → Console) → copier l'erreur
2. Faire une capture d'écran
3. Envoyer à l'équipe technique
4. Si bloquant : restaurer la sauvegarde Supabase

## Contacts

- Technique : [à compléter]
- Support terrain : [à compléter]
- Supabase : support@supabase.com
- Render : support@render.com
