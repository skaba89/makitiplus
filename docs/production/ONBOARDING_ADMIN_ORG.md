# Guide d'onboarding — Administrateur d'organisation

**À destination de** : L'admin d'une boutique/organisation qui découvre MakitiPlus
**Durée estimée** : 30 minutes pour tout configurer

---

## 🎯 Votre rôle

En tant qu'**administrateur d'organisation**, vous gérez :
- ✅ Votre boutique (magasin)
- ✅ Vos produits, catégories, stock
- ✅ Vos ventes (POS)
- ✅ Vos clients
- ✅ Vos fournisseurs et commandes
- ✅ Vos dépenses
- ✅ Vos rapports financiers
- ✅ Vos utilisateurs (vendeurs, managers, comptables)

Vous ne gérez PAS :
- ❌ Les autres organisations (réservé au super_admin)
- ❌ Les abonnements (réservé au super_admin)
- ❌ La configuration SaaS globale

---

## 📋 Jour 1 — Configuration initiale

### 1. Connexion (2 min)
1. Allez sur `https://makitiplus.onrender.com/auth`
2. Saisissez votre email + mot de passe (fournis par le super_admin)
3. Vous arrivez sur le **Dashboard**

### 2. Vérifier les informations de la boutique (5 min)
- Vérifiez le nom de votre boutique en haut à gauche
- Vérifiez la devise (GNF, XOF, etc.) — si incorrect, contactez le super_admin
- Vérifiez le pays

### 3. Configurer les catégories (10 min)
**Menu → Catégories**
- 10 catégories par défaut sont déjà créées (Alimentation, Boissons, etc.)
- Personnalisez-les selon votre activité :
  - Modifier le nom, la couleur, l'icône
  - Ajouter vos propres catégories
  - Supprimer celles non pertinentes

### 4. Ajouter des produits (varie)
**Menu → Produits → Ajouter un produit**

Pour chaque produit :
- **Nom** (ex: "Riz 5kg")
- **Code-barres** (optionnel — scanneur automatique)
- **Catégorie** (déroulante)
- **Prix de vente** (dans votre devise)
- **Prix d'achat** (pour calculer la marge)
- **Stock initial**
- **Stock minimum** (pour alerte de rupture)
- **Unité** (pièce, kg, L, etc.)
- **Date de péremption** (si applicable)

💡 **Astuce** : Pour ajouter 50+ produits rapidement, utilisez l'**import CSV** (bouton "Importer CSV").

### 5. Ajouter des fournisseurs (5 min)
**Menu → Fournisseurs → Ajouter**
- Nom, téléphone, email, adresse
- Associez les produits à leurs fournisseurs (utile pour les commandes)

### 6. Créer des vendeurs (5 min)
**Menu → Utilisateurs → Nouvel utilisateur**
- Email + mot de passe + nom
- Rôle : **vendeur** (accès POS uniquement) ou **manager** (POS + produits)
- Le vendeur ne peut PAS gérer les produits ni voir les rapports financiers

---

## 📋 Jour 1 — Première vente

### 1. Ouvrir le POS
**Menu → Point de vente**

### 2. Ajouter un produit au panier
- Recherche par nom ou scan code-barres
- Cliquez sur le produit → ajouté au panier
- Modifiez la quantité si besoin

### 3. Encaisser
- Cliquez **"Payer"**
- Choisissez le mode de paiement :
  - **Espèces** — saisir le montant reçu, la monnaie est calculée
  - **Wave** — paiement mobile (Guinée, Sénégal, Côte d'Ivoire)
  - **Orange Money** — paiement mobile
  - **Crédit** — pour un client (nécessite un client sélectionné)
- Validez → reçu généré (imprimable ou PDF)

### 4. Vérifier le stock
- Le stock est automatiquement décrémenté après la vente
- Allez dans **Produits** pour vérifier

---

## 📋 Fin de journée — Clôture de caisse

### 1. Page Clôture de caisse
**Menu → Clôture caisse**

### 2. Compter la caisse
- Vérifiez le montant attendu (espèces encaissées - dépenses)
- Comptez physiquement la caisse
- Saisissez le montant réel

### 3. Vérifier l'écart
- **Écart = 0** → caisse parfaite
- **Excédent** → plus d'argent que prévu (à investiguer)
- **Manque** → moins d'argent que prévu (à investiguer)

### 4. Valider la clôture
- Cliquez **"Clôturer la caisse"**
- Imprimez le rapport pour vos archives

---

## 📋 Hebdomadaire — Rapports

### 1. Consulter les rapports
**Menu → Rapports**
- Sélectionnez la période : Jour / Semaine / Mois
- Vérifiez :
  - **Chiffre d'affaires**
  - **Dépenses**
  - **Bénéfice net** (CA - Dépenses)
  - **Marge brute** (CA - Coût des marchandises)
  - **Top des produits vendus**
  - **Valeur du stock** par fournisseur

### 2. Exporter les données
- Bouton **"Exporter"** → CSV (ventes ou dépenses)
- Utile pour la comptabilité

### 3. Conversion de devise (optionnel)
- Cliquez sur l'icône **💰** dans le header
- Sélectionnez une autre devise (ex: EUR, USD)
- Tous les montants sont convertis au taux réel
- Le prix original apparaît en infobulle

---

## 📋 Mensuel — Gestion

### 1. Inventaire
- Faites un inventaire physique mensuel
- Allez dans **Produits** → **Stock** (icône entrepôt)
- Ajustez les écarts avec un motif (casse, vol, erreur)

### 2. Commandes fournisseurs
**Menu → Commandes → Nouvelle commande**
- Sélectionnez le fournisseur
- Ajoutez les produits + quantités
- Validez la commande
- À réception : **"Recevoir"** → met à jour le stock automatiquement
- Téléchargez le Bon de Livraison (PDF)
- Envoyez par email ou WhatsApp au fournisseur

### 3. Gestion des crédits clients
**Menu → Clients**
- Vérifiez les clients avec solde créditeur (badge rouge)
- Relancez les clients en retard de paiement
- Enregistrez les remboursements

---

## 🔧 Fonctionnalités avancées

### Mode hors-ligne
- MakitiPlus fonctionne **sans internet**
- Les ventes sont stockées localement (IndexedDB)
- À la reconnexion, synchronisation automatique
- Indicateur "Hors-ligne" visible en haut

### PWA (Progressive Web App)
- Sur mobile Chrome : **3 points → Ajouter à l'écran d'accueil**
- L'app se lance en plein écran comme une vraie app
- Mises à jour automatiques

### Scanner code-barres
- Au POS, cliquez sur l'icône scanner
- Autorisez la caméra
- Scannez le code-barres du produit
- Le produit s'ajoute au panier

---

## ❓ FAQ

### Mon vendeur ne peut pas ajouter de produits, pourquoi ?
→ Normal. Les **vendeurs** ne peuvent que vendre (POS). Seuls les **managers** et **admins** peuvent gérer les produits.

### Je ne vois pas le super_admin dans ma liste d'utilisateurs
→ Normal. Le super_admin est caché aux admins d'org pour des raisons de sécurité.

### Un client a un crédit, comment l'enregistrer ?
1. Créez le client dans **Clients**
2. Au POS, sélectionnez ce client avant d'encaisser
3. Choisissez **"Crédit"** comme mode de paiement
4. Le solde créditeur est mis à jour automatiquement

### Comment changer la devise de MA boutique ?
→ Contactez le super_admin. La devise est configurée au niveau de l'organisation.

### J'ai oublié mon mot de passe
→ Contactez le super_admin. Il peut le réinitialiser (page Utilisateurs → icône clé).

### Mes données sont-elles sauvegardées ?
→ Oui. Toutes les données sont stockées sur Supabase (PostgreSQL) avec réplication automatique. Le mode hors-ligne garde aussi une copie locale.

---

## 🆘 Support

- **Problème technique** : contactez le super_admin (Ousmane Kaba)
- **Bug bloquant** : décrivez le problème + capture d'écran
- **Suggestion d'amélioration** : toutes les idées sont bienvenues

---

## ✅ Checklist de démarrage

- [ ] Connexion réussie
- [ ] Catégories personnalisées
- [ ] 10+ produits ajoutés
- [ ] 1+ fournisseur configuré
- [ ] 1+ vendeur créé
- [ ] Première vente encaissée
- [ ] Reçu imprimé
- [ ] Stock vérifié après vente
- [ ] Première clôture de caisse
- [ ] Premier rapport consulté
