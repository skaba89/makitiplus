# MakitiPlus — Checklist de déploiement production

## Phase 1 — Pré-déploiement (30 min)

### 1.1 Vérifications code
```bash
npm run check
# = lint + typecheck + build + tests (780)
# Doit afficher "0 errors" partout
```

### 1.2 Vérifications SQL
```bash
python3 scripts/validate_sql_migrations.py
python3 scripts/check_undefined_functions.py
# Les deux doivent afficher "PASSED" / "✓"
```

### 1.3 Vérifications sécurité
```bash
npm audit --audit-level=high
# Doit afficher "found 0 vulnerabilities"
```

### 1.4 Vérifications production
```bash
bash scripts/health-check-post-deployment.sh
# Tous les checks doivent être au vert
```

---

## Phase 2 — Déploiement DB (15 min)

### 2.1 Appliquer le script consolidé

1. Ouvrir https://supabase.com/dashboard/project/{PROJECT_REF}/sql/new
2. Coller le contenu de `docs/audit/deployment/consolidated_production_fix.sql`
3. Cliquer **Run**
4. Vérifier que toutes les fonctions ont `versions = 1` dans les Results

### 2.2 Vérifier les fonctions critiques

```sql
SELECT proname, count(*) AS versions
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND proname IN (
    'is_super_admin', 'is_org_admin', 'get_user_organization_id', 'has_role',
    'touch_last_login', 'record_user_logout', 'log_user_activity',
    'get_seller_performance', 'get_seller_activities',
    'get_organization_subscription', 'check_feature_access', 'check_plan_limit',
    'admin_get_all_subscriptions', 'delete_organization',
    'get_organization_stores', 'get_top_products', 'get_categories'
  )
GROUP BY proname
ORDER BY proname;
-- Toutes doivent afficher versions = 1
```

### 2.3 Réparer l'historique des migrations CLI (optionnel)

Si `supabase db push` échoue avec "relation already exists" :
1. Coller `docs/audit/deployment/repair_migration_history.sql` dans le SQL Editor
2. Cliquer **Run**

---

## Phase 3 — Déploiement frontend (5 min)

### 3.1 Configurer les variables d'environnement Render

Dans Render → makitiplus → Environment :

| Variable | Valeur | Requis |
|----------|--------|--------|
| `VITE_SUPABASE_URL` | `https://{PROJECT_REF}.supabase.co` | ✅ |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | `eyJhbGciOi...` (anon key) | ✅ |
| `VITE_SUPABASE_DASHBOARD_URL` | `https://supabase.com/dashboard/project/{PROJECT_REF}/sql/new` | ✅ |
| `VITE_STRIPE_PUBLISHABLE_KEY` | `pk_live_...` ou vide | ❌ |
| `VITE_SENTRY_DSN` | `https://...@sentry.io/...` | ❌ |
| `VITE_SENTRY_ENVIRONMENT` | `production` | ❌ |
| `VITE_DEMO_MODE` | `false` | ✅ |

### 3.2 Déployer

Render déploie automatiquement sur push vers `main`.
Pour un déploiement manuel : Render → Manual Deploy → Deploy latest commit.

---

## Phase 4 — Déploiement Edge Functions (5 min)

### 4.1 Configurer les secrets Supabase

Dans Supabase → Edge Functions → Secrets :

| Secret | Requis | Description |
|--------|--------|-------------|
| `STRIPE_SECRET_KEY` | ❌ | `sk_live_...` (vide = Stripe désactivé) |
| `STRIPE_WEBHOOK_SECRET` | ❌ | `whsec_...` |
| `STRIPE_PRICE_ID_CROISSANCE_MONTHLY` | ❌ | `price_...` |
| `STRIPE_PRICE_ID_ENTERPRISE_MONTHLY` | ❌ | `price_...` |
| `CRON_SECRET` | ✅ | Secret aléatoire pour les cron jobs |
| `CORS_ORIGIN` | ✅ | `https://makitiplus.onrender.com` |
| `APP_URL` | ✅ | `https://makitiplus.onrender.com` |

### 4.2 Déployer les edge functions

```bash
supabase functions deploy admin-send-reset-link
supabase functions deploy rotate-test-accounts
supabase functions deploy send-whatsapp
supabase functions deploy stripe-checkout
supabase functions deploy stripe-portal
supabase functions deploy stripe-webhook
```

---

## Phase 5 — Configuration du compte admin pilote (5 min)

### 5.1 Créer le super_admin

```sql
-- Dans le SQL Editor
DO $$
DECLARE v_user_id UUID; v_org_id UUID;
BEGIN
  SELECT id INTO v_user_id FROM auth.users WHERE email = 'admin@magasin-pilote.com';
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'User not found'; END IF;

  DELETE FROM public.user_roles WHERE user_id = v_user_id;
  INSERT INTO public.user_roles (user_id, role) VALUES (v_user_id, 'super_admin');

  SELECT id INTO v_org_id FROM public.organizations WHERE owner_user_id = v_user_id LIMIT 1;
  IF v_org_id IS NULL THEN
    ALTER TABLE public.organizations DISABLE TRIGGER USER;
    INSERT INTO public.organizations (id, name, owner_user_id, created_at, updated_at)
    VALUES (gen_random_uuid(), 'Magasin Pilote', v_user_id, now(), now());
    SELECT id INTO v_org_id FROM public.organizations WHERE owner_user_id = v_user_id LIMIT 1;
    ALTER TABLE public.organizations ENABLE TRIGGER USER;
  END IF;

  ALTER TABLE public.profiles DISABLE TRIGGER USER;
  INSERT INTO public.profiles (user_id, organization_id, business_name, owner_name, created_at, updated_at)
  VALUES (v_user_id, v_org_id, 'Magasin Pilote', 'Admin', now(), now())
  ON CONFLICT (user_id) DO UPDATE SET organization_id = v_org_id, business_name = 'Magasin Pilote';
  ALTER TABLE public.profiles ENABLE TRIGGER USER;
END $$;
```

### 5.2 Activer le plan Enterprise

```sql
UPDATE public.subscriptions
SET plan_id = 'enterprise', status = 'active',
    current_period_end = NOW() + INTERVAL '365 days'
WHERE organization_id = (
  SELECT organization_id FROM public.profiles
  WHERE user_id = (SELECT id FROM auth.users WHERE email = 'admin@magasin-pilote.com')
);
```

---

## Phase 6 — Validation post-déploiement (15 min)

### 6.1 Page de diagnostic
1. Ouvrir `https://makitiplus.onrender.com/diagnostic`
2. Vérifier que le statut global est "Opérationnel"
3. Se connecter en super_admin → vérifier les détails techniques

### 6.2 Test de connexion
1. Ouvrir `https://makitiplus.onrender.com/auth`
2. Se connecter avec le compte admin pilote
3. Vérifier l'arrivée sur `/dashboard` sans erreur

### 6.3 Test des pages critiques
| Page | URL | Vérification |
|------|-----|--------------|
| Dashboard | /dashboard | Stats affichées |
| Produits | /dashboard/products | Liste ou vide |
| POS | /dashboard/pos | Interface caisse |
| Clients | /dashboard/customers | Liste ou vide |
| Magasins | /dashboard/stores | Boutiques visibles |
| Activité Vendeurs | /dashboard/seller-activity | Tableau ou vide |
| Organisations | /dashboard/admin/organizations | Liste orgs |
| Paramètres | /dashboard/settings | Formulaire |
| Diagnostic | /diagnostic | Statut OK |

### 6.4 Test end-to-end
1. Ajouter un produit (nom, prix, stock)
2. Enregistrer une vente au POS (espèces)
3. Vérifier le stock décrémenté
4. Consulter les rapports → vente visible
5. Générer un reçu PDF

### 6.5 Test offline
1. Couper internet
2. Enregistrer une vente → doit réussir
3. Rallumer internet → "Tickets synchronisés"
4. Vérifier la vente dans les rapports

---

## Phase 7 — Actions post-déploiement

### 7.1 Sécurité
- [ ] Révoquer le token GitHub si compromis
- [ ] Configurer les secrets E2E dans GitHub Actions
- [ ] Vérifier que `VITE_DEMO_MODE = false`

### 7.2 Monitoring
- [ ] Sentry : augmenter `TRACES_SAMPLE_RATE` à 0.5 pendant le pilote
- [ ] Vérifier que les erreurs remontent dans Sentry
- [ ] Configurer les alertes email pour erreurs critiques

### 7.3 Sauvegarde
- [ ] Vérifier que Supabase Pro backup est activé
- [ ] Tester la restauration en staging

### 7.4 Documentation
- [ ] Partager le guide de formation au magasin pilote
- [ ] Documenter l'URL de production
- [ ] Créer un canal de support (WhatsApp/email)

---

## Rollback

### Rollback frontend
```bash
# Render → Manual Deploy → Deploy previous commit
# Ou via git :
git revert HEAD --no-edit
git push origin main
```

### Rollback DB
```bash
# Supabase → Database → Backups → Restore to timestamp
# Ou via SQL Editor (si migration spécifique à annuler)
```

### Rollback edge functions
```bash
# Redéployer la version précédente
supabase functions deploy <function-name> --no-bundle
```
