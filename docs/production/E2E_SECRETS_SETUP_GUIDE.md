# Configuration des secrets GitHub Actions pour tests E2E

**Objectif** : Activer les tests E2E (Playwright) dans GitHub Actions pour valider automatiquement le dashboard et les flux critiques à chaque PR/push.

---

## 📋 Secrets requis

Allez sur : **GitHub → skaba89/makitiplus → Settings → Secrets and variables → Actions → New repository secret**

### Secrets obligatoires (build + tests unitaires)

| Nom | Description | Exemple |
|-----|-------------|---------|
| `VITE_SUPABASE_URL` | URL du projet Supabase | `https://exxntkuursgwhxvehekr.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Clé anon (publishable) de Supabase | `eyJhbGciOi...` |

### Secrets pour tests E2E pilot (bloquants)

| Nom | Description | Exemple |
|-----|-------------|---------|
| `E2E_TEST_EMAIL` | Email d'un compte de test (admin boutique) | `cheick009@gmail.com` |
| `E2E_TEST_PASSWORD` | Mot de passe du compte de test | `Cheick123!` |

### Secrets optionnels (tests E2E avancés)

| Nom | Description |
|-----|-------------|
| `E2E_ADMIN_EMAIL` | Email d'un compte admin |
| `E2E_ADMIN_PASSWORD` | Mot de passe admin |
| `E2E_SUPER_ADMIN_EMAIL` | Email du super_admin |
| `E2E_SUPER_ADMIN_PASSWORD` | Mot de passe super_admin |
| `E2E_ALLOW_DESTRUCTIVE` | `true` pour autoriser les tests destructifs |

---

## 🔧 Étapes de configuration

### 1. Ajouter les secrets dans GitHub

1. Allez sur https://github.com/skaba89/makitiplus/settings/secrets/actions
2. Cliquez **"New repository secret"**
3. Ajoutez chaque secret :
   - `VITE_SUPABASE_URL` = `https://exxntkuursgwhxvehekr.supabase.co`
   - `VITE_SUPABASE_PUBLISHABLE_KEY` = (votre clé anon Supabase)
   - `E2E_TEST_EMAIL` = email d'un compte de test existant
   - `E2E_TEST_PASSWORD` = mot de passe du compte

### 2. Vérifier que les tests s'exécutent

```bash
# Pousser un commit pour déclencher le workflow
git commit --allow-empty -m "ci: trigger E2E with secrets"
git push origin main
```

Vérifiez dans l'onglet **Actions** que :
- ✅ Le job `build-and-test` passe (tests unitaires)
- ✅ Le job `pilot-e2e` passe (tests pilot critiques)
- ✅ Le job `e2e` s'exécute (tests complets, dont `dashboard.spec.ts`)

---

## 🧪 Tests E2E activés

Une fois les secrets configurés, ces tests s'exécuteront automatiquement :

### `e2e/dashboard.spec.ts`
- Dashboard shows sales overview
- Navigation menu shows all allowed pages

### `e2e/pilot-critical.spec.ts`
- Login + logout
- POS basic flow (ajouter produit, encaisser)
- Produits (créer, modifier, supprimer)
- Rapports (consultation)

---

## ⚠️ Sécurité

- **Ne JAMAIS** committer les secrets dans le code
- Le compte de test doit avoir des permissions limitées (admin d'une org de test)
- Le mot de passe doit être fort : `TestPass123!` (maj/min/chiffre/symbole, 8+ car.)
- Pivotez le mot de passe régulièrement (tous les 90 jours)
