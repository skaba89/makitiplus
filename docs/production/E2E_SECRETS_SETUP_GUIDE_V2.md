# Configuration des secrets GitHub Actions pour tests E2E

**Objectif** : Activer les tests E2E (Playwright) dans GitHub Actions pour valider automatiquement le dashboard et les flux critiques à chaque PR/push.

> **Correction de sécurité (2026-07-25)** : ce document contenait précédemment (et sa version `E2E_SECRETS_SETUP_GUIDE.md`, désormais dépréciée) un exemple d'identifiants avec l'apparence d'un compte réel plutôt qu'un placeholder générique — corrigé ici. Ce document décrivait aussi `e2e/pilot-critical.spec.ts` comme testant la création/modification/suppression de produits, ce qui ne correspond plus (et ne doit plus jamais correspondre) au comportement réel de ce fichier — corrigé ci-dessous. Voir `docs/production/MARKET_LEADER_READINESS_REPORT.md` pour le contexte complet.

---

## ⚠️ Modèle de sécurité — à lire avant toute configuration

MakitiPlus a un magasin pilote réel, **Diallo & Frères**, avec de vraies données (ventes, produits, clients). Deux catégories d'identifiants E2E, avec des règles différentes :

| Catégorie | Variables | Cible | Usage autorisé |
|---|---|---|---|
| **Pilote réel (lecture seule)** | `E2E_TEST_EMAIL` / `E2E_TEST_PASSWORD` | Compte admin réel de Diallo & Frères | **Uniquement** navigation/affichage (`e2e/pilot-critical.spec.ts`). Jamais de création, modification ou suppression. |
| **Organisation de test dédiée (mutable)** | `E2E_ADMIN_EMAIL`/`PASSWORD`, `E2E_MANAGER_EMAIL`/`PASSWORD`, `E2E_VENDOR_EMAIL`/`PASSWORD`, `E2E_SUPER_ADMIN_EMAIL`/`PASSWORD`, `E2E_TEST_ORG_NAME`, `E2E_TEST_STORE_NAME` | Organisation de test jetable, **jamais Diallo & Frères** | Scénarios qui créent/modifient/suppriment des données (`e2e/staging-real-flow.spec.ts`, `e2e/seller-activity.spec.ts` pour les rôles manager/vendeur). |

Le garde-fou `src/lib/pilotProtection.ts` (`assertSafeForDestructiveAction`) bloque **inconditionnellement** toute action destructive ciblant Diallo & Frères, même si `E2E_ALLOW_DESTRUCTIVE=true` est mal configuré. Voir `src/test/pilotDataProtection.test.ts` et `src/test/e2ePilotSafetyRegression.test.ts`.

**État actuel (2026-07-25)** : seuls `E2E_TEST_EMAIL`/`E2E_TEST_PASSWORD` sont configurés dans les secrets GitHub Actions. Aucun compte d'organisation de test dédiée n'existe encore — voir la checklist ci-dessous. En attendant, `e2e/seller-activity.spec.ts` utilise un fallback documenté (`E2E_ADMIN_EMAIL` → `E2E_TEST_EMAIL` si absent), qui ne s'exécute aujourd'hui que sur des scénarios de lecture/navigation vérifiés sans mutation — mais qui reste un risque latent tant que l'organisation dédiée n'existe pas.

---

## 📋 Secrets requis

Allez sur : **GitHub → skaba89/makitiplus → Settings → Secrets and variables → Actions → New repository secret**

### Secrets obligatoires (build + tests unitaires)

| Nom | Description |
|-----|-------------|
| `VITE_SUPABASE_URL` | URL du projet Supabase |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Clé anon (publishable) de Supabase |

### Secrets pilote (lecture seule, déjà configurés)

| Nom | Description |
|-----|-------------|
| `E2E_TEST_EMAIL` | Email du compte admin réel de Diallo & Frères — **lecture seule uniquement** |
| `E2E_TEST_PASSWORD` | Mot de passe correspondant |

### Secrets organisation de test dédiée (à créer — voir checklist)

| Nom | Description |
|-----|-------------|
| `E2E_TEST_ORG_NAME` | Nom de l'organisation de test jetable |
| `E2E_TEST_STORE_NAME` | Nom du magasin de test rattaché |
| `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD` | Compte admin de l'organisation de test |
| `E2E_MANAGER_EMAIL` / `E2E_MANAGER_PASSWORD` | Compte manager de l'organisation de test |
| `E2E_VENDOR_EMAIL` / `E2E_VENDOR_PASSWORD` | Compte vendeur de l'organisation de test |
| `E2E_SUPER_ADMIN_EMAIL` / `E2E_SUPER_ADMIN_PASSWORD` | Compte super_admin (scénarios plateforme) |
| `E2E_ALLOW_DESTRUCTIVE` | `"true"` uniquement dans un run CI dédié ciblant explicitement l'organisation de test — jamais en usage général |

---

## 🔧 Checklist — créer l'organisation de test dédiée

Cette étape ne peut pas être automatisée sans créer un compte réel (mot de passe) — à faire manuellement par une personne ayant accès à Supabase et aux secrets GitHub.

1. **Créer l'organisation de test** dans l'app (ou via Supabase SQL Editor / `auth.admin.create_user` pour les comptes) — nom clairement identifiable, ex. `MakitiPlus QA` (jamais un nom pouvant se confondre avec "Diallo & Frères").
2. **Créer un magasin** rattaché à cette organisation.
3. **Créer 3 comptes** (mots de passe forts, générés, jamais réutilisés d'un compte réel) :
   - un `admin` de l'organisation de test
   - un `manager`
   - un `vendeur`
4. **Ajouter les 9 secrets correspondants** dans GitHub Actions (voir tableau ci-dessus) — jamais dans un fichier commité, uniquement via l'interface Settings → Secrets.
5. **Vérifier** en déclenchant manuellement le workflow Release Readiness (`gh workflow run release-readiness.yml`) que les jobs `E2E Seller Activity` et `E2E Staging` s'exécutent avec ces nouveaux identifiants (plus de fallback vers `E2E_TEST_EMAIL`).

### Vérifier que les tests s'exécutent

```bash
gh workflow run release-readiness.yml --repo skaba89/makitiplus --ref main
```

Vérifiez dans l'onglet **Actions** que tous les jobs bloquants passent, y compris les 4 suites E2E.

---

## 🧪 Tests E2E existants

### `e2e/pilot-critical.spec.ts` — pilote réel, lecture seule stricte
Login, navigation POS/produits/rapports/abonnement/organisations. **Aucune** création, modification ou suppression — ce fichier ne doit jamais en contenir (garde-fou de régression : `src/test/e2ePilotSafetyRegression.test.ts`).

### `e2e/staging-real-flow.spec.ts` — organisation de test, scénarios destructifs
Protégé par `assertSafeForDestructiveAction` avant toute suppression. Nécessite `E2E_ALLOW_DESTRUCTIVE=true` et les secrets de l'organisation de test dédiée.

### `e2e/seller-activity.spec.ts` — rôles admin/manager/vendeur
Vérifie l'accès par rôle à la page Activité vendeurs. Aujourd'hui limité à navigation/affichage.

### `e2e/sales-store-scope.spec.ts`, `e2e/dashboard.spec.ts`
Scénarios de lecture/affichage supplémentaires.

---

## ⚠️ Sécurité

- **Ne JAMAIS** committer de secret ou d'identifiant réel dans le code ou la documentation — utiliser uniquement des placeholders génériques (`test@example.com`, `••••••••`) dans les exemples.
- Les comptes de l'organisation de test doivent avoir des permissions limitées à cette organisation (jamais super_admin sauf pour les scénarios qui le testent explicitement).
- Mots de passe forts et générés, jamais réutilisés, rotation recommandée tous les 90 jours.
- `E2E_ALLOW_DESTRUCTIVE` doit rester `"false"` partout sauf dans le run CI dédié aux tests destructifs sur l'organisation de test.

---

## Dépannage

### Les tests E2E sont skippés
→ Vérifiez que les secrets requis pour ce test précis sont configurés dans GitHub Actions.

### Erreur "Login failed"
→ Vérifiez que le compte existe dans Supabase Auth et que `email_confirm = true`.

### Erreur "Dashboard not found"
→ Vérifiez que le compte a un profil dans `public.profiles` avec `organization_id` valide.

### Erreur "Role not loaded"
→ Vérifiez que le compte a une entrée dans `public.user_roles` avec le rôle attendu.
