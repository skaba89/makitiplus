# MakitiPlus — Plan de Tests Fonctionnels Manuels (Préproduction)

> Exécuter chaque test dans l'ordre. Cocher ✅ quand le test passe.
> En cas d'échec, documenter le comportement observé et créer un ticket.

---

## 0. Pré-requis

- [ ] Déploiement Render réussi (vérifier `https://makitiplus.onrender.com` charge sans erreur 500)
- [ ] Edge Functions déployées (`./deploy-functions.sh` — 12 fonctions)
- [ ] Tous les secrets configurés (voir `PREPROD_CHECKLIST.md`)
- [ ] Cron jobs actifs (`SELECT jobname FROM cron.job;` doit retourner 2 lignes)

---

## 1. Authentification

### 1.1 Login Admin
1. Ouvrir `https://makitiplus.onrender.com/auth`
2. Se connecter avec un compte `super_admin`
3. **Résultat attendu** : Redirection vers `/dashboard`, avatar visible dans la sidebar

### 1.2 Login Vendeur
1. Se déconnecter
2. Se connecter avec un compte `vendeur`
3. **Résultat attendu** : Redirection vers `/dashboard`, menu restreint (pas d'Utilisateurs, pas d'Analyse Multi-Magasins)

### 1.3 Accès non-autorisé
1. Se connecter comme `vendeur`
2. Naviguer manuellement vers `/dashboard/admin-analytics`
3. **Résultat attendu** : Page "Accès restreint" affichée (pas le contenu admin)

### 1.4 Reset Password
1. Cliquer "Mot de passe oublié" sur `/auth`
2. Entrer l'email d'un compte existant
3. **Résultat attendu** : Toast "Lien de réinitialisation envoyé" + email reçu (si RESEND_API_KEY configuré)

---

## 2. Point de Vente (POS)

### 2.1 Vente Cash
1. Aller sur `/dashboard/pos`
2. Scanner un code-barres ou chercher un produit
3. Ajouter au panier, cliquer "Encaisser"
4. Sélectionner "Espèces", valider
5. **Résultat attendu** : Ticket affiché/imprimé, stock décrémenté

### 2.2 Vente Mobile Money
1. Créer une vente, sélectionner "Mobile Money"
2. Valider
3. **Résultat attendu** : Vente enregistrée avec mode de paiement "mobile_money"

### 2.3 Vente Crédit
1. Créer une vente, sélectionner "Crédit client"
2. Choisir un client existant
3. **Résultat attendu** : Vente enregistrée, solde client mis à jour

### 2.4 Stock Insuffisant
1. Tenter de vendre plus que le stock disponible
2. **Résultat attendu** : Erreur "Stock insuffisant" affichée, vente bloquée

---

## 3. Produits

### 3.1 Création Produit
1. Aller sur `/dashboard/products`
2. Cliquer "Ajouter un produit"
3. Remplir le formulaire (nom, prix, stock, catégorie)
4. **Résultat attendu** : Produit créé, visible dans la liste, stock correct

### 3.2 Modification Produit
1. Cliquer sur un produit existant
2. Modifier le prix de vente
3. Sauvegarder
4. **Résultat attendu** : Prix mis à jour, pas de duplication

### 3.3 Export CSV
1. Cliquer "Exporter" sur la page Produits
2. **Résultat attendu** : Fichier CSV téléchargé avec tous les produits

---

## 4. Administration

### 4.1 Création Utilisateur
1. Aller sur `/dashboard/users`
2. Cliquer "Inviter un utilisateur"
3. Remplir email + rôle (ex: vendeur)
4. **Résultat attendu** : Invitation envoyée, utilisateur visible dans la liste

### 4.2 Accès admin-analytics (super_admin uniquement)
1. Se connecter comme `super_admin`
2. Aller sur `/dashboard/admin-analytics`
3. **Résultat attendu** : Dashboard multi-magasin affiché (ranking, top articles, tendances)
4. Se connecter comme `admin`
5. Tenter d'accéder à `/dashboard/admin-analytics`
6. **Résultat attendu** : Page "Accès restreint"

---

## 5. Stripe — Cycle Complet

### 5.1 Upgrade Plan via Checkout
1. Se connecter comme `super_admin`
2. Aller sur `/dashboard/billing`
3. Cliquer "Voir les offres" ou un bouton d'upgrade
4. Sélectionner le plan "Croissance"
5. **Résultat attendu** : Redirection vers Stripe Checkout, page de paiement affichée

### 5.2 Webhook Stripe Reçu
1. Compléter le paiement Stripe (utiliser une carte test : `4242 4242 4242 4242`)
2. Vérifier les logs de l'edge function `stripe-webhook` dans Supabase Dashboard
3. **Résultat attendu** : Log `[stripe-webhook] Updated org ... to plan: croissance`

### 5.3 Portail Stripe Client
1. Retourner sur `/dashboard/billing`
2. Cliquer "Gérer l'abonnement"
3. **Résultat attendu** : Redirection vers Stripe Customer Portal

### 5.4 Downgrade via Portail
1. Dans le portail Stripe, annuler l'abonnement
2. Vérifier les logs du webhook
3. **Résultat attendu** : Log `[stripe-webhook] Subscription deleted for org ... — downgraded to starter`

### 5.5 Webhook sur Erreur Partielle (test 500)
1. Via Supabase Dashboard, désactiver temporairement la table `subscriptions` (RLS bloque tout)
2. Envoyer un événement test Stripe (Dashboard → Webhooks → Send test event)
3. **Résultat attendu** : Webhook retourne 500, Stripe marque "Failed" et retry automatiquement
4. Restaurer la RLS et vérifier que le retry réussit

---

## 6. Cron Jobs

### 6.1 rotate-test-accounts
1. Dans Supabase SQL Editor, exécuter :
```sql
SELECT net.http_post(
  url := 'https://exxntkuursgwhxvehekr.supabase.co/functions/v1/rotate-test-accounts',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'X-Cron-Secret', 'VOTRE_VRAI_CRON_SECRET'
  ),
  body := '{}'::jsonb
);
```
2. **Résultat attendu** : Status 200 dans les logs de l'edge function

### 6.2 subscription-lifecycle
1. Même procédure avec `Authorization: Bearer VOTRE_VRAI_CRON_SECRET`
2. **Résultat attendu** : Status 200, abonnements expirés traités

---

## 7. Sécurité

### 7.1 Demo Mode Désactivé
1. Ouvrir DevTools Console sur le site de production
2. Vérifier que `import.meta.env.VITE_DEMO_MODE` === `"false"`
3. **Résultat attendu** : `"false"` — les mutations doivent fonctionner normalement

### 7.2 Aucun Secret en Dur
1. Lancer `git grep -nE '(sk_live_|whsec_|SUPABASE_SERVICE_ROLE_KEY)' -- . ':!*.md' ':!docs/**' ':!.env.example'`
2. **Résultat attendu** : Aucun résultat

### 7.3 CSP Headers
1. Ouvrir DevTools → Network → Recharger la page
2. Vérifier l'en-tête `Content-Security-Policy` de la réponse HTML
3. **Résultat attendu** : Contient `js.stripe.com`, `api.stripe.com`, `hooks.stripe.com`, `*.supabase.co`, `*.sentry.io`

### 7.4 Sécurité Webhook
1. Envoyer un POST sans `stripe-signature` header à l'endpoint webhook
2. **Résultat attendu** : 401 Unauthorized

---

## 8. Modules Expérimentaux (Non-Routés)

### 8.1 Support non accessible
1. Naviguer vers `/dashboard/support`
2. **Résultat attendu** : Page 404 (non routé dans App.tsx)

### 8.2 Loyalty non accessible
1. Naviguer vers `/dashboard/loyalty`
2. **Résultat attendu** : Page 404

### 8.3 StockTransfers non accessible
1. Naviguer vers `/dashboard/stock-transfers`
2. **Résultat attendu** : Page 404

---

## 9. Performance

### 9.1 Chargement Initial
1. Ouvrir le site en navigation privée
2. Mesurer le temps de chargement (DevTools → Performance)
3. **Seuil acceptable** : LCP < 3s, FCP < 1.5s

### 9.2 Bundle Size
1. Vérifier que les chunks principaux restent raisonnables
2. **Seuil acceptable** : Pas de chunk > 600 kB (les polices liberationSans sont des exceptions connues)

---

## Résultat Final

| Catégorie | Tests | Pass | Fail | Bloquant |
|---|---|---|---|---|
| Authentification | 4 | | | |
| POS | 4 | | | |
| Produits | 3 | | | |
| Administration | 2 | | | |
| Stripe | 5 | | | |
| Cron Jobs | 2 | | | |
| Sécurité | 4 | | | |
| Modules Expérimentaux | 3 | | | |
| Performance | 2 | | | |
| **Total** | **29** | | | |

> ⚠️ Tout échec dans les catégories **Sécurité** ou **Stripe** est bloquant pour la mise en production.
