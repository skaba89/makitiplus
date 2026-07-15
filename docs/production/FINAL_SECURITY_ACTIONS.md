# MakitiPlus — Final Security Actions

## Actions critiques à effectuer avant production nationale

### 1. Révoquer le token GitHub compromis
- URL : https://github.com/settings/tokens
- Action : révoquer TOUTES les Personal Access Tokens
- Vérifier les logs : https://github.com/settings/security-log
- Créer un nouveau token avec scope minimal `repo`

### 2. Vérifier secrets GitHub Actions
- URL : https://github.com/skaba89/makitiplus/settings/secrets/actions
- Secrets requis (14) :
  - VITE_SUPABASE_URL
  - VITE_SUPABASE_PUBLISHABLE_KEY
  - E2E_BASE_URL
  - E2E_TEST_EMAIL / E2E_TEST_PASSWORD
  - E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD
  - E2E_MANAGER_EMAIL / E2E_MANAGER_PASSWORD
  - E2E_VENDOR_EMAIL / E2E_VENDOR_PASSWORD
  - E2E_SUPER_ADMIN_EMAIL / E2E_SUPER_ADMIN_PASSWORD
  - E2E_TEST_ORG_NAME

### 3. Vérifier secrets Render
- URL : https://dashboard.render.com
- Variables requises : VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, VITE_SENTRY_DSN
- VITE_SENTRY_TRACES_SAMPLE_RATE=0.5 (pilote), 0.1 (production)

### 4. Vérifier variables Supabase
- Dashboard → Settings → API
- Anon key : utilisée côté client
- Service role key : utilisée uniquement dans Edge Functions
- JWT Secret : rotation possible mais invalide les sessions

### 5. Vérifier Sentry
- DSN configuré dans Render
- Taux d'échantillonnage : 0.5 (pilote) → 0.1 (production)
- Alertes : erreurs 500 > 1/heure → critique

### 6. Stripe (désactivé en Afrique)
- Stripe non utilisé pour le pilote (mobile money à la place)
- Vérifier que les webhooks Stripe sont désactivés
- Si réactivation : Dashboard Stripe → Developers → API keys

### 7. Backup Supabase avant migration
- Dashboard → Database → Backups → Create backup
- Nommer : `pre-national-deployment-YYYY-MM-DD`
- Statut : "Completed" avant de continuer

### 8. Rollback frontend
- Render Dashboard → Deploys → "Roll back to this deploy"
- Effet immédiat (pas de rebuild)

### 9. Rollback SQL
- Dashboard → Database → Backups → Restore
- ATTENTION : perte de toutes les données créées après le backup

### 10. Contacts support incident
- GitHub Security : security@github.com
- Supabase : support@supabase.com
- Render : support@render.com
- Sentry : support@sentry.io
