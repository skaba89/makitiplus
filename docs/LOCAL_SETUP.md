# MakitiPlus — Guide de setup local dev

Ce guide te fait passer d'un dépôt cloné à une application fonctionnelle en local en moins de 30 minutes.

## Prérequis

| Outil | Version min | Vérifier |
|-------|-------------|----------|
| Node.js | 20+ | `node --version` |
| npm | 9+ | `npm --version` |
| Git | 2.30+ | `git --version` |
| Compte Supabase | — | https://supabase.com/dashboard |

Pas besoin de Docker en local — Supabase est géré en cloud.

## Étape 1 — Cloner et installer

```bash
git clone https://github.com/skaba89/makitiplus.git
cd makitiplus
npm install
```

L'installation prend 2-3 minutes (150+ dépendances).

## Étape 2 — Configurer Supabase

### 2.1 Récupérer les credentials

1. Va sur https://supabase.com/dashboard/project/exxntkuursgwhxvehekr/settings/api
2. Note :
   - **Project URL** : `https://exxntkuursgwhxvehekr.supabase.co`
   - **anon public key** : `eyJhbGciOi...` (clé publique, safe à exposer)

### 2.2 Créer le fichier .env

```bash
cp .env.example .env
```

Édite `.env` avec les valeurs :

```env
VITE_SUPABASE_URL="https://exxntkuursgwhxvehekr.supabase.co"
VITE_SUPABASE_PROJECT_ID="exxntkuursgwhxvehekr"
VITE_SUPABASE_PUBLISHABLE_KEY="eyJhbGciOi...ta-clé-anon..."
VITE_DEMO_MODE="false"
```

Les autres variables (Stripe, Sentry) sont optionnelles pour le dev local.

## Étape 3 — Appliquer les migrations (si DB neuve ou existante)

### Cas A — DB déjà peuplée (cas le plus probable)

Si tu as déjà des données en production et que `supabase db push` échoue avec `relation "customers" already exists` :

1. Va sur https://supabase.com/dashboard/project/exxntkuursgwhxvehekr/sql/new
2. Colle le contenu de `docs/audit/deployment/apply_p1_p2_p3_combined.sql` → Run
3. Colle le contenu de `supabase/migrations/20260708030000_p3_1_create_update_updated_at_column.sql` → Run
4. Colle le contenu de `docs/audit/deployment/verify_deployment.sql` → Run (vérification)
5. Optionnel : `docs/audit/deployment/repair_migration_history.sql` → Run (pour réparer l'historique CLI)

### Cas B — DB neuve (projet Supabase frais)

```bash
# Installer supabase CLI
npm install -g supabase

# Login + link
supabase login
supabase link --project-ref exxntkuursgwhxvehekr

# Pousser toutes les migrations
supabase db push
```

## Étape 4 — Démarrer le serveur dev

```bash
npm run dev
```

Le serveur démarre sur http://localhost:5173

Vérifie que tu vois la page d'accueil MakitiPlus sans erreur dans la console.

## Étape 5 — Créer un compte admin de test

Si la DB est neuve (pas d'admin existant) :

1. Va sur http://localhost:5173/auth
2. Clique sur "S'inscrire" (le premier utilisateur devient automatiquement admin)
3. Remplis : email, mot de passe, nom de la boutique, ton nom
4. Tu es redirigé vers `/onboarding` puis `/dashboard`

Si un admin existe déjà, demande-lui de t'inviter via **Settings → Users**.

## Étape 6 — Vérifier que tout fonctionne

### 6.1 Health check automatique

```bash
bash scripts/health-check-post-deployment.sh
```

Doit afficher `✓ Health check OK` avec tous les checks en vert.

### 6.2 Tests unitaires

```bash
# Tous les tests
npm test

# Tests de sécurité uniquement (audit AUDIT-2026-007)
npx vitest run src/test/p1SecurityFixes.test.ts src/test/p2SecurityFixes.test.ts src/test/p3SecurityFixes.test.ts
```

Doit afficher `115 tests passed`.

### 6.3 Smoke test E2E

```bash
# Installer les navigateurs Playwright (première fois seulement)
npx playwright install --with-deps chromium

# Configurer les credentials de test
export E2E_TEST_EMAIL="ton-admin@example.com"
export E2E_TEST_PASSWORD="ton-mot-de-passe"

# Lancer le smoke test post-déploiement
npx playwright test e2e/post-deployment-audit.spec.ts --ui
```

## Étape 7 — Build de production (vérification finale)

```bash
npm run build
npm run preview
```

Le build génère `dist/` (statique, déployable sur Render/Vercel/Netlify).

## Structure du projet

```
makitiplus/
├── src/                    # Code frontend React
│   ├── pages/              # 24 pages (POS, Dashboard, Reports...)
│   ├── components/         # Composants UI + métier
│   ├── contexts/           # Auth, Offline, Store, Branding, Theme
│   ├── hooks/              # 22 hooks métier
│   ├── lib/                # Utilitaires + schemas zod
│   ├── integrations/       # Client Supabase + types
│   └── test/               # 63+ tests unitaires
├── supabase/
│   ├── migrations/         # 79 migrations SQL
│   └── functions/          # 12 edge functions Deno
├── e2e/                    # 8 tests Playwright
├── android/                # App Android Capacitor
├── ios/                    # App iOS Capacitor
├── docs/audit/             # Rapport audit + scripts déploiement
└── scripts/                # Helpers (health-check, validate, etc.)
```

## Scripts npm disponibles

| Commande | Description |
|----------|-------------|
| `npm run dev` | Serveur dev Vite (hot reload) |
| `npm run build` | Build production → `dist/` |
| `npm run preview` | Prévisualiser le build |
| `npm test` | Tests unitaires Vitest |
| `npm run e2e` | Tests E2E Playwright |
| `npm run e2e:ui` | Tests E2E avec UI Playwright |
| `npm run check` | Lint + typecheck + build + tests |
| `npm run check:production` | Check complet + npm audit + E2E pilote |

## Dépannage

### Erreur : `Failed to fetch` au login

→ Vérifie que `VITE_SUPABASE_URL` et `VITE_SUPABASE_PUBLISHABLE_KEY` sont correctement remplis dans `.env`. Redémarre `npm run dev` après modification.

### Erreur : `function is_org_admin() does not exist`

→ Les migrations P1/P2/P3 ne sont pas appliquées. Va sur Supabase SQL Editor et exécute `docs/audit/deployment/apply_p1_p2_p3_combined.sql`.

### Erreur : `relation "customers" already exists` lors de `supabase db push`

→ La DB est déjà peuplée mais le CLI ne le sait pas. Exécute `docs/audit/deployment/repair_migration_history.sql` dans le SQL Editor pour marquer les migrations historiques comme appliquées.

### Build échoue avec erreur TypeScript

→ Lance `npx tsc --noEmit` pour voir les erreurs détaillées. Corrige-les avant de rebuilder.

### Tests E2E échouent avec `E2E_TEST_EMAIL is not defined`

→ Configure les variables d'environnement :
```bash
export E2E_TEST_EMAIL="ton-admin@example.com"
export E2E_TEST_PASSWORD="ton-mot-de-passe"
```

### Page blanche après login

→ Vérifie la console du navigateur (F12). Causes courantes :
- Session expirée → déconnecte-toi et reconnecte-toi
- RLS bloque l'accès → vérifie que ton profil a un `organization_id`
- Cache corrompu → vide le localStorage et recharge

## Prochaines étapes

Une fois le projet fonctionnel en local :

1. **Tester les flows métier** : créer un produit, enregistrer une vente, ajouter un client à crédit
2. **Tester le mode offline** : coupe internet, enregistre une vente, reconnecte → la sync doit se faire automatiquement
3. **Tester les edge functions** : envoie un reçu WhatsApp, génère un lien de reset password
4. **Déployer en production** : merge ta branche dans `main`, Render déploie automatiquement

## Support

- **Documentation audit** : `docs/audit/README.md`
- **Rapport PDF** : `docs/audit/audit-securite-2026-07-07.pdf`
- **Matrice de risques** : `docs/audit/matrice-risques-2026-07-07.xlsx`
- **Scripts déploiement** : `docs/audit/deployment/README.md`
