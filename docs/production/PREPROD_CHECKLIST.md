# MakitiPlus — Checklist Préproduction

## Frontend Render

| Variable | Obligatoire | Valeur attendue |
|---|---|---|
| `VITE_SUPABASE_URL` | ✅ | `https://xxx.supabase.co` |
| `VITE_SUPABASE_PROJECT_ID` | ✅ | Reference ID Supabase |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | ✅ | `eyJ...` (anon key) |
| `VITE_STRIPE_PUBLISHABLE_KEY` | ✅ | `pk_live_...` ou `pk_test_...` |
| `VITE_SENTRY_DSN` | Recommandé | `https://...@sentry.io/...` |
| `VITE_SENTRY_ENVIRONMENT` | ✅ | `production` |
| `VITE_SENTRY_TRACES_SAMPLE_RATE` | Optionnel | `0.1` |
| `VITE_SENTRY_REPLAY_SAMPLE_RATE` | Optionnel | `0.05` |
| `VITE_APP_VERSION` | Optionnel | Tag Git |
| `VITE_DEMO_MODE` | ✅ | `false` |

## Supabase Edge Functions Secrets

| Secret | Obligatoire | Notes |
|---|---|---|
| `SUPABASE_URL` | ✅ | Auto-provisionné par Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Auto-provisionné par Supabase |
| `STRIPE_SECRET_KEY` | ✅ | `sk_live_...` |
| `STRIPE_WEBHOOK_SECRET` | ✅ | `whsec_...` |
| `STRIPE_PRICE_ID_CROISSANCE_MONTHLY` | ✅ | `price_...` |
| `STRIPE_PRICE_ID_CROISSANCE_YEARLY` | Optionnel | `price_...` |
| `STRIPE_PRICE_ID_ENTERPRISE_MONTHLY` | ✅ | `price_...` |
| `STRIPE_PRICE_ID_ENTERPRISE_YEARLY` | Optionnel | `price_...` |
| `STRIPE_PRICE_ID_CROISSANCE` | Fallback | Alias legacy → redirige vers MONTHLY |
| `STRIPE_PRICE_ID_ENTERPRISE` | Fallback | Alias legacy → redirige vers MONTHLY |
| `CORS_ORIGIN` | ✅ | `https://makitiplus.onrender.com` |
| `CRON_SECRET` | ✅ | Voir `SUPABASE_CRON_SETUP.md` |
| `RESEND_API_KEY` | Optionnel | `re_...` — emails lifecycle |
| `APP_URL` | Recommandé | `https://makitiplus.onrender.com` |
| `LOVABLE_API_KEY` | Optionnel | SMS password reset |
| `TWILIO_API_KEY` | Optionnel | SMS password reset |
| `TWILIO_FROM_NUMBER` | Optionnel | SMS password reset |

## Stripe Dashboard

- [ ] Produit "Croissance" créé avec prix mensuel (`price_...`)
- [ ] Produit "Croissance" avec prix annuel (optionnel)
- [ ] Produit "Enterprise" créé avec prix mensuel (`price_...`)
- [ ] Produit "Enterprise" avec prix annuel (optionnel)
- [ ] Webhook endpoint configuré vers `https://PROJECT_ID.supabase.co/functions/v1/stripe-webhook`
- [ ] Webhook events sélectionnés :
  - [ ] `checkout.session.completed`
  - [ ] `customer.subscription.updated`
  - [ ] `customer.subscription.deleted`
  - [ ] `invoice.payment_failed`
- [ ] Signing secret (`whsec_...`) copié dans Supabase Edge Functions Secrets

## Supabase Base de données

- [ ] Toutes les migrations appliquées (vérifier dans Dashboard → Migrations)
- [ ] RPC `check_feature_access` fonctionne
- [ ] RPC `get_admin_stores_summary` fonctionne
- [ ] RPC `get_admin_article_ranking` fonctionne
- [ ] RPC `get_admin_stock_movements` fonctionne
- [ ] RPC `get_admin_sales_trend` fonctionne
- [ ] RPC `get_admin_payment_distribution` fonctionne
- [ ] RLS activé sur toutes les tables
- [ ] `GRANT EXECUTE` présent sur toutes les RPC
- [ ] Cron jobs configurés manuellement (voir `SUPABASE_CRON_SETUP.md`)
- [ ] Test manuel `subscription-lifecycle` → 200
- [ ] Test manuel `rotate-test-accounts` → 200

## Modules expérimentaux (non exposés en production)

Les modules suivants existent dans le code mais **ne sont pas routés** dans `App.tsx` :
- `Support.tsx` — système de tickets
- `Loyalty.tsx` — programme de fidélité
- `StockTransfers.tsx` — transferts inter-magasins

Ils ne doivent pas être exposés sans validation produit complète.

## Tests fonctionnels manuels

### Authentification
- [ ] Login admin
- [ ] Login vendeur
- [ ] Reset password

### POS
- [ ] Vente cash
- [ ] Vente Mobile Money
- [ ] Vente crédit
- [ ] Stock insuffisant → erreur

### Produits
- [ ] Création produit
- [ ] Modification produit
- [ ] Export produits CSV

### Administration
- [ ] Création utilisateur
- [ ] Accès admin-analytics (super_admin uniquement)

### Stripe
- [ ] Upgrade plan via Stripe Checkout
- [ ] Webhook Stripe reçu (vérifier logs edge function)
- [ ] Portail Stripe Client accessible
- [ ] Downgrade via portail Stripe

### Sécurité
- [ ] `VITE_DEMO_MODE` = `false` en production
- [ ] Aucun secret en dur dans le repo
- [ ] CSP headers présents (vérifier avec DevTools)

## Dette technique connue

| Élément | Sévérité | Impact | Plan |
|---|---|---|---|
| ~~`esbuild` ≤ 0.24.2 (via `vite` ≤ 6.4.2)~~ | ~~Moderate/High~~ | ~~Dev server uniquement~~ | ✅ Résolu : mise à jour `vite` v5 → v6.4.3 (`esbuild ^0.25.0`) |
| 49 warnings `GRANT EXECUTE` manquants sur RPC `SECURITY DEFINER` | Low | Les RPC restent accessibles via RLS ; les `GRANT` sont un hardening supplémentaire | ✅ Migration `20260704030000` couvre les 46 RPC principales ; les 3 restantes sont dans des modules expérimentaux |
| ~~Chunks > 500 kB (liberationSans fonts)~~ | ~~Warning~~ | ~~Temps de chargement initial~~ | ✅ Résolu : fonts déjà lazy-loadées ; `chunkSizeWarningLimit: 600` supprime le warning build |
| 0 tests unitaires sur les 22 pages | Medium | Régression silencieuse possible | Écrire tests d'intégration pour POS, Auth, Users en priorité |
| 3 suppressions `eslint-disable react-hooks/exhaustive-deps` | Low | Risque de closure stale | Réviser les dépendances des effects |

## Commandes de vérification automatisée

```bash
npm ci && npx tsc --noEmit && npx vite build && npx vitest run
python3 scripts/validate_sql_migrations.py
npm audit --audit-level=high
```
