# MakitiPlus — Guide de démarrage pilote (Post-audit)

**Date** : 2026-07-19
**Version** : Post deep-stabilization (P0+P1+P2 validés)
**Branche** : `main` (merge de `hotfix/deep-production-stabilization-priority-by-priority`)

---

## ✅ État du projet après audit

| Composant | Statut |
|-----------|--------|
| Migrations SQL | ✅ Toutes exécutées sur Supabase |
| Edge Functions | ✅ 9 déployées (admin-create-user, admin-manage-user, admin-send-reset-link, etc.) |
| Tests unitaires | ✅ 982/982 (79 fichiers) |
| Build TypeScript | ✅ 0 erreur |
| Build Vite | ✅ Succès (PWA 64 entries) |
| Sécurité RLS | ✅ super_admin bypass sur 9 tables + policies resserrées |
| `sale_items.cost_price` | ✅ Colonne ajoutée + index |
| RPC `get_product_kpis_by_period` | ✅ Corrigé (CTE, pas de ROW_NUMBER dans WHERE) |
| `create_full_sale` | ✅ Enregistre cost_price (snapshot historique) |
| PWA Repair | ✅ Bouton "Réparer l'application" dans ErrorBoundary |
| AdminAnalytics | ✅ Erreurs RPC envoyées à Sentry |
| Sélecteur d'org global | ✅ Context partagé entre toutes les pages + persistance localStorage |
| Conversion devise | ✅ 10 pages + EUR pivot pour AdminAnalytics |
| KPIs produits | ✅ Top 5 / Bottom 5 par jour/semaine/mois/trimestre/année |
| Impression code-barres | ✅ Tous les produits + génération auto |
| Documentation | ✅ 10+ guides production |

---

## 🚀 Démarrage du pilote

### Étape 1 — Vérifier le déploiement Render

1. Allez sur https://makitiplus.onrender.com
2. Vérifiez que la page d'accueil s'affiche
3. F12 → Console → aucune erreur critique
4. F12 → Application → Service Workers → 1 SW actif

### Étape 2 — Créer le magasin pilote

1. Connectez-vous en super_admin (kaba.sekouna@gmail.com)
2. Page **Magasins** → "Nouvelle organisation"
3. Créez : nom org + nom magasin + catégorie + pays + devise
4. Créez l'admin : nom + email + mot de passe
5. Vérifiez que l'org apparaît avec 1 seul magasin

### Étape 3 — Configurer le magasin pilote

Connectez-vous avec le compte admin créé :

1. **Catégories** → personnaliser les 10 catégories par défaut
2. **Produits** → ajouter 20-50 produits (avec prix + stock)
3. **Fournisseurs** → créer 2-3 fournisseurs
4. **Utilisateurs** → créer 1-2 vendeurs

### Étape 4 — Première vente

1. **Point de vente** (POS)
2. Ajouter un produit au panier
3. Encaisser (espèces, Wave, Orange Money, ou crédit)
4. Vérifier le reçu
5. Vérifier le stock décrémenté

### Étape 5 — Vérifier les KPIs

1. **Dashboard** → KPIs produits (Top 5 / Bottom 5) en bas de page
2. Sélectionner différentes périodes (Jour, Semaine, Mois, Trimestre, Année)
3. Vérifier que les quantités et pourcentages s'affichent
4. **Rapports** → consulter CA, dépenses, bénéfice net, marge brute

### Étape 6 — Tester le sélecteur d'org (super_admin)

1. Connectez-vous en super_admin
2. Sur le Dashboard, sélectionnez une organisation dans le dropdown
3. Naviguez entre les pages → les données doivent suivre l'org sélectionnée
4. Le nom de l'org doit s'afficher dans la sidebar

### Étape 7 — Tester le mode hors-ligne

1. Couper la connexion internet
2. Créer 2-3 ventes hors-ligne
3. Vérifier l'indicateur "Hors-ligne"
4. Reconnecter internet
5. Vérifier la synchronisation automatique

### Étape 8 — Clôture de caisse

1. En fin de journée → **Clôture caisse**
2. Compter la caisse réelle
3. Saisir le montant
4. Vérifier l'écart
5. Valider la clôture

---

## 📊 Critères de succès du pilote

- [ ] Au moins 20 ventes effectuées
- [ ] Aucune perte de données
- [ ] Mode hors-ligne fonctionne (au moins 1 test concluant)
- [ ] Clôture de caisse effectuée au moins 1 fois
- [ ] KPIs produits affichent les bonnes données
- [ ] Sélecteur d'org filtre toutes les pages
- [ ] Aucun bug bloquant non résolu
- [ ] Commerçant satisfait (note ≥ 7/10)

---

## ⚠️ Procédure en cas de problème

### Bug critique
1. Si une page ne charge pas → bouton "Réparer l'application" (ErrorBoundary)
2. Si erreur console → capturer l'écran + console (F12)
3. Si login impossible → vérifier user_roles dans Supabase

### Contact
- Dashboard Supabase : https://supabase.com/dashboard/project/exxntkuursgwhxvehekr
- Render : https://dashboard.render.com
- Repo GitHub : https://github.com/skaba89/makitiplus
