# Configuration des secrets GitHub Actions pour tests E2E

**Objectif** : Activer les tests E2E (Playwright) dans GitHub Actions pour valider automatiquement le dashboard et les flux critiques à chaque PR/push.

---

## 📋 Secrets requis

Allez sur : **GitHub → Repo → Settings → Secrets and variables → Actions → New repository secret**

### Secrets obligatoires (tests unitaires + build)

| Nom | Description | Exemple |
|-----|-------------|---------|
| `VITE_SUPABASE_URL` | URL du projet Supabase | `https://exxntkuursgwhxvehekr.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Clé anon (publishable) de Supabase | `eyJhbGciOi...` |

### Secrets pour tests E2E pilot (bloquants)

| Nom | Description | Exemple |
|-----|-------------|---------|
| `E2E_TEST_EMAIL` | Email d'un compte de test (admin boutique) | `test@makitiplus.com` |
| `E2E_TEST_PASSWORD` | Mot de passe du compte de test | `TestPass123!` |

### Secrets optionnels (tests E2E avancés)

| Nom | Description |
|-----|-------------|
| `E2E_ADMIN_EMAIL` | Email d'un compte admin |
| `E2E_ADMIN_PASSWORD` | Mot de passe admin |
| `E2E_SUPER_ADMIN_EMAIL` | Email d'un compte super_admin |
| `E2E_SUPER_ADMIN_PASSWORD` | Mot de passe super_admin |
| `E2E_ALLOW_DESTRUCTIVE` | `true` pour autoriser les tests destructifs |

---

## 🔧 Étapes de configuration

### 1. Créer un compte de test dans Supabase

```sql
-- Dans Supabase SQL Editor
-- Créer un user de test via auth.admin
SELECT auth.admin.create_user(
  email := 'test@makitiplus.com',
  password := 'TestPass123!',
  email_confirm := true
);
```

Ou via l'interface Supabase → Authentication → Users → Add user

### 2. Configurer le profil + rôle

```sql
-- Récupérer l'ID du user créé
SELECT id FROM auth.users WHERE email = 'test@makitiplus.com';

-- Créer le profil (remplacer <USER_ID>)
INSERT INTO public.profiles (user_id, organization_id, business_name, owner_name, is_active)
VALUES ('<USER_ID>', '<ORG_ID>', 'Boutique Test', 'User Test', true);

-- Assigner le rôle admin
INSERT INTO public.user_roles (user_id, role)
VALUES ('<USER_ID>', 'admin'::public.app_role);
```

### 3. Ajouter les secrets dans GitHub

1. Allez sur https://github.com/skaba89/makitiplus/settings/secrets/actions
2. Cliquez **"New repository secret"**
3. Ajoutez chaque secret :
   - `VITE_SUPABASE_URL` = `https://exxntkuursgwhxvehekr.supabase.co`
   - `VITE_SUPABASE_PUBLISHABLE_KEY` = (votre clé anon)
   - `E2E_TEST_EMAIL` = `test@makitiplus.com`
   - `E2E_TEST_PASSWORD` = `TestPass123!`

### 4. Vérifier que les tests s'exécutent

```bash
# Pousser un commit pour déclencher le workflow
git commit --allow-empty -m "test: trigger CI with E2E secrets"
git push origin main
```

Vérifiez dans l'onglet **Actions** que :
- ✅ Le job `build-and-test` passe (tests unitaires)
- ✅ Le job `pilot-e2e` passe (tests pilot critiques)
- ✅ Le job `e2e` s'exécute (tests complets, dont `dashboard.spec.ts`)

---

## 🧪 Tests E2E activés

Une fois les secrets configurés, ces tests s'exécuteront automatiquement :

### `e2e/dashboard.spec.ts` (nouveau)
- Dashboard shows sales overview
- Navigation menu shows all allowed pages

### `e2e/pilot-critical.spec.ts`
- Login + logout
- POS basic flow (ajouter produit, encaisser)
- Produits (créer, modifier, supprimer)
- Rapports (consultation)

### `e2e/staging-real-flow.spec.ts`
- Flux complets admin/super_admin (si credentials configurés)

---

## ⚠️ Sécurité

- **Ne JAMAIS** committer les secrets dans le code
- Le compte de test doit avoir des permissions limitées (admin d'une org de test, pas super_admin)
- Le mot de passe doit être fort : `TestPass123!` (maj/min/chiffre/symbole, 8+ car.)
- Pivotez le mot de passe régulièrement (tous les 90 jours)

---

## Dépannage

### Les tests E2E sont skippés
→ Vérifiez que `E2E_TEST_EMAIL` et `E2E_TEST_PASSWORD` sont bien configurés dans les secrets GitHub

### Erreur "Login failed"
→ Vérifiez que le compte de test existe dans Supabase Auth et que `email_confirm = true`

### Erreur "Dashboard not found"
→ Vérifiez que le compte a un profil dans `public.profiles` avec `organization_id` valide

### Erreur "Role not loaded"
→ Vérifiez que le compte a une entrée dans `public.user_roles` avec le rôle `admin`
