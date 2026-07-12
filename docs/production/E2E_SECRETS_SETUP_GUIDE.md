# Guide de configuration des secrets E2E GitHub Actions

## Contexte

Le workflow `release-readiness.yml` est **bloquant** : si les secrets E2E manquent, il échoue (pas de skip silencieux). Ce guide décrit comment les configurer.

## Secrets requis (14 secrets)

### 1. Secrets Supabase (récupérables sur le dashboard)

| Secret | Description | Où trouver |
|--------|-------------|------------|
| `VITE_SUPABASE_URL` | URL du projet Supabase | Dashboard → Settings → API → Project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Clé anon/publishable | Dashboard → Settings → API → Project API keys → anon public |

### 2. Secrets E2E (URL + comptes de test)

| Secret | Description | Exemple |
|--------|-------------|---------|
| `E2E_BASE_URL` | URL du frontend déployé | `https://makitiplus.onrender.com` |
| `E2E_TEST_EMAIL` | Email compte test standard | `test@example.com` |
| `E2E_TEST_PASSWORD` | Mot de passe compte test | `TestPass123!` |
| `E2E_ADMIN_EMAIL` | Email compte admin boutique | `admin@boutique.com` |
| `E2E_ADMIN_PASSWORD` | Mot de passe admin boutique | `AdminPass123!` |
| `E2E_MANAGER_EMAIL` | Email compte manager | `manager@boutique.com` |
| `E2E_MANAGER_PASSWORD` | Mot de passe manager | `ManagerPass123!` |
| `E2E_VENDOR_EMAIL` | Email compte vendeur | `vendeur@boutique.com` |
| `E2E_VENDOR_PASSWORD` | Mot de passe vendeur | `VendorPass123!` |
| `E2E_SUPER_ADMIN_EMAIL` | Email super admin | `kaba.sekouna@gmail.com` |
| `E2E_SUPER_ADMIN_PASSWORD` | Mot de passe super admin | `SuperAdmin123!` |
| `E2E_TEST_ORG_NAME` | Nom de l'org de test | `Boutique Test E2E` |

## Procédure de configuration

### Étape 1 : Accéder aux secrets GitHub

1. Aller sur https://github.com/skaba89/makitiplus
2. Cliquer **Settings** (en haut du repo)
3. Dans le menu de gauche : **Secrets and variables** → **Actions**
4. Cliquer **New repository secret**

### Étape 2 : Ajouter chaque secret

Pour chaque secret de la liste ci-dessus :
1. **Name** : le nom exact du secret (ex: `VITE_SUPABASE_URL`)
2. **Secret** : la valeur
3. Cliquer **Add secret**

### Étape 3 : Créer les comptes de test dans Supabase

Si les comptes E2E n'existent pas encore, les créer via l'Auth Supabase :

1. Dashboard Supabase → Authentication → Users → **Add user**
2. Créer un utilisateur par rôle :
   - `test@example.com` (vendeur)
   - `admin@boutique.com` (admin boutique)
   - `manager@boutique.com` (manager)
   - `vendeur@boutique.com` (vendeur)
3. Attribuer les rôles via SQL :
   ```sql
   -- Après création des utilisateurs dans Auth
   INSERT INTO public.user_roles (user_id, role)
   SELECT id, 'admin' FROM auth.users WHERE email = 'admin@boutique.com'
   ON CONFLICT DO NOTHING;
   ```

### Étape 4 : Vérifier le workflow

1. Aller sur https://github.com/skaba89/makitiplus/actions
2. Cliquer sur **Release Readiness**
3. Cliquer **Run workflow** (manuel) ou créer une PR pour déclencher automatiquement
4. Vérifier que tous les jobs passent

## Vérification

Le workflow `release-readiness.yml` contient 8 jobs bloquants :
1. code-quality (lint + typecheck + build + tests)
2. sql-validation
3. security-audit
4. e2e-pilot
5. e2e-seller-activity
6. e2e-staging
7. e2e-sales-store-scope
8. release-readiness-summary

Si un job échoue à cause d'un secret manquant, le message sera explicite :
```
ERROR: VITE_SUPABASE_URL secret is required for release readiness
```

## Notes

- Les secrets sont chiffrés par GitHub et ne sont jamais exposés dans les logs
- Le workflow ne skip pas silencieusement — il échoue explicitement si un secret manque
- Une fois configurés, les secrets sont disponibles pour tous les workflows du repo
- Pour mettre à jour un secret, cliquer sur le crayon à côté du secret existant
