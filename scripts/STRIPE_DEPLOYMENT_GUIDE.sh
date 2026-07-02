# ═══════════════════════════════════════════════════════════════════════════
# GUIDE COMPLET — Déploiement Stripe + Edge Functions pour MakitiPlus
# ═══════════════════════════════════════════════════════════════════════════
#
# Ce guide couvre :
#   1. Déploiement des Edge Functions Stripe
#   2. Configuration des secrets Stripe dans Supabase
#   3. Création des produits/prix dans Stripe Dashboard
#   4. Configuration du webhook Stripe
#
# Durée estimée : 20-30 minutes
# ═══════════════════════════════════════════════════════════════════════════


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# ÉTAPE 1 — Déployer les Edge Functions
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# 1a. Installer la CLI Supabase (si pas déjà fait)
npm install -g supabase

# 1b. Se connecter à Supabase
supabase login
# → Une fenêtre browser s'ouvre pour l'authentification

# 1c. Lier le projet
cd /chemin/vers/makitiplus
supabase link --project-ref exxntkuursgwhxvehekr

# 1d. Déployer les 3 fonctions Stripe
supabase functions deploy stripe-checkout --project-ref exxntkuursgwhxvehekr
supabase functions deploy stripe-webhook  --project-ref exxntkuursgwhxvehekr
supabase functions deploy stripe-portal   --project-ref exxntkuursgwhxvehekr

# OU déployer TOUTES les fonctions d'un coup :
# chmod +x deploy-functions.sh && ./deploy-functions.sh

# Vérification — les URLs seront :
# https://exxntkuursgwhxvehekr.supabase.co/functions/v1/stripe-checkout
# https://exxntkuursgwhxvehekr.supabase.co/functions/v1/stripe-webhook
# https://exxntkuursgwhxvehekr.supabase.co/functions/v1/stripe-portal


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# ÉTAPE 2 — Créer les produits et prix dans Stripe Dashboard
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# Aller sur : https://dashboard.stripe.com/products

# ┌─────────────────────────────────────────────────────────────────────┐
# │ PRODUIT 1 : Croissance — Mensuel                                   │
# │  Nom      : MakitiPlus Croissance                                   │
# │  Prix     : 9 900 FCFA/mois (= 9 900 centimes = ~15€)              │
# │  Récurrent : Mensuel                                                │
# │  → Noter le price_id (price_xxx...)                                 │
# ├─────────────────────────────────────────────────────────────────────┤
# │ PRODUIT 2 : Croissance — Annuel                                    │
# │  Nom      : MakitiPlus Croissance (Annuel)                          │
# │  Prix     : 99 000 FCFA/an (= ~150€, 2 mois gratuits)              │
# │  Récurrent : Annuel                                                 │
# │  → Noter le price_id (price_xxx...)                                 │
# ├─────────────────────────────────────────────────────────────────────┤
# │ PRODUIT 3 : Enterprise — Mensuel                                    │
# │  Nom      : MakitiPlus Enterprise                                   │
# │  Prix     : 29 900 FCFA/mois (= ~45€)                              │
# │  Récurrent : Mensuel                                                │
# │  → Noter le price_id (price_xxx...)                                 │
# ├─────────────────────────────────────────────────────────────────────┤
# │ PRODUIT 4 : Enterprise — Annuel                                     │
# │  Nom      : MakitiPlus Enterprise (Annuel)                          │
# │  Prix     : 299 000 FCFA/an (= ~450€, 2 mois gratuits)             │
# │  Récurrent : Annuel                                                 │
# │  → Noter le price_id (price_xxx...)                                 │
# └─────────────────────────────────────────────────────────────────────┘


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# ÉTAPE 3 — Configurer les secrets Stripe dans Supabase
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# Aller sur : Supabase Dashboard → Edge Functions → Secrets
# OU utiliser la CLI :

# 3a. Clé secrète Stripe (trouver dans Stripe Dashboard → Developers → API keys)
supabase secrets set --project-ref exxntkuursgwhxvehekr \
  STRIPE_SECRET_KEY=sk_live_VOTRE_CLE_SECRETE

# 3b. Webhook secret (sera obtenu à l'étape 4)
# → À définir APRÈS avoir créé le webhook (étape 4)

# 3c. Price IDs (obtenus à l'étape 2)
supabase secrets set --project-ref exxntkuursgwhxvehekr \
  STRIPE_PRICE_CROISSANCE_MONTHLY=price_VOTRE_ID_CROISSANCE_MENSUEL \
  STRIPE_PRICE_CROISSANCE_YEARLY=price_VOTRE_ID_CROISSANCE_ANNUEL \
  STRIPE_PRICE_ENTERPRISE_MONTHLY=price_VOTRE_ID_ENTERPRISE_MENSUEL \
  STRIPE_PRICE_ENTERPRISE_YEARLY=price_VOTRE_ID_ENTERPRISE_ANNUEL

# 3d. URL de l'app
supabase secrets set --project-ref exxntkuursgwhxvehekr \
  APP_URL=https://makitiplus.onrender.com

# 3e. Webhook secret (après l'étape 4)
supabase secrets set --project-ref exxntkuursgwhxvehekr \
  STRIPE_WEBHOOK_SECRET=whsec_VOTRE_WEBHOOK_SECRET


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# ÉTAPE 4 — Configurer le webhook Stripe
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# Aller sur : Stripe Dashboard → Developers → Webhooks

# 4a. Cliquer "Add endpoint"
# 4b. URL de l'endpoint :
#     https://exxntkuursgwhxvehekr.supabase.co/functions/v1/stripe-webhook
# 4c. Événements à écouter (cliquer "Select events") :
#     ☑ checkout.session.completed
#     ☑ customer.subscription.updated
#     ☑ customer.subscription.deleted
#     ☑ invoice.payment_failed
# 4d. Cliquer "Add endpoint"
# 4e. Cliquer sur le webhook créé → "Signing secret" → "Reveal"
#     → Copier le whsec_xxx... et l'ajouter comme secret (étape 3e)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# ÉTAPE 5 — Clé publique Stripe (frontend)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# 5a. Dans Stripe Dashboard → Developers → API keys → "Publishable key"
#     Commence par pk_live_... (ou pk_test_... pour les tests)

# 5b. Ajouter dans les variables d'environnement de Render :
#     VITE_STRIPE_PUBLISHABLE_KEY=pk_live_VOTRE_CLE_PUBLIQUE

# OU dans .env.local pour le développement local :
# VITE_STRIPE_PUBLISHABLE_KEY=pk_test_VOTRE_CLE_TEST


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# RÉCAPITULATIF — Checklist
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# [ ] CLI Supabase installée + login
# [ ] Projet lié (supabase link)
# [ ] Edge Functions déployées (stripe-checkout, stripe-webhook, stripe-portal)
# [ ] Produits Stripe créés (4 prix : croissance mensuel/annuel, enterprise mensuel/annuel)
# [ ] Price IDs notés et configurés comme secrets
# [ ] STRIPE_SECRET_KEY configuré
# [ ] Webhook Stripe créé avec les 4 événements
# [ ] STRIPE_WEBHOOK_SECRET configuré
# [ ] APP_URL configuré
# [ ] VITE_STRIPE_PUBLISHABLE_KEY configuré sur Render
# [ ] Test : créer un checkout depuis le dashboard MakitiPlus
