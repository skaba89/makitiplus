# MakitiPlus

**La caisse intelligente et offline-first pour les boutiques, grossistes et chaînes de magasins en Afrique.**

MakitiPlus est une plateforme SaaS de gestion commerciale pensée pour les commerces africains : caisse enregistreuse (POS), gestion de stock, fournisseurs, clients à crédit, mode offline, mobile, rapports, multi-boutiques et intelligence commerciale.

---

## Fonctionnalités

| Module | Description |
|--------|-------------|
| **Caisse enregistreuse (POS)** | Vente rapide, recherche produits, scan code-barres, multi-moyens de paiement (espèces, Wave, Orange Money, Mobile Money, carte, crédit) |
| **Gestion de stock** | Stock en temps réel, alertes rupture, mouvements de stock, ajustements, inventaire |
| **Clients à crédit** | Suivi crédits, paiements partiels, historique, relances |
| **Fournisseurs** | Annuaire fournisseurs, produits fournisseurs, commandes, liste de commande par fournisseur |
| **Rapports** | Ventes, dépenses, bénéfices, tendances, export PDF/Excel, périodes personnalisées |
| **Multi-boutiques** | Gestion de plusieurs points de vente, analytics consolidées, stock par boutique |
| **Mode offline** | Fonctionnement complet sans connexion, synchronisation automatique à la reconnexion |
| **Mobile & PWA** | Application installable sur mobile, responsive, scan code-barres caméra |
| **Reçus & tickets** | Génération PDF, QR code, envoi WhatsApp/SMS, impression thermique 58mm/80mm |
| **Admin Analytics** | Dashboard super_admin, ranking produits, tendances ventes, distribution paiements, mouvements stock |
| **Sécurité** | RLS Supabase, SECURITY DEFINER RPC, auth.uid() server-side, headers sécurité, CI audit |

---

## Stack technique

| Couche | Technologie |
|--------|-------------|
| **Frontend** | React 18, TypeScript, Vite, shadcn/ui, Tailwind CSS |
| **State** | Zustand (cart POS), React Query (server state), localStorage (offline) |
| **Backend** | Supabase (PostgreSQL, Auth, Storage, RPC) |
| **Offline** | IndexedDB, Service Worker, queue de mutations |
| **Mobile** | PWA + Capacitor (iOS/Android) |
| **Charts** | Recharts |
| **PDF** | jsPDF (reçus, rapports) |
| **Monitoring** | Sentry (erreurs + Web Vitals) |
| **CI/CD** | GitHub Actions + Render |
| **Tests** | Vitest (174 unitaires) + Playwright (E2E) |

---

## Architecture

```
src/
├── pages/              # Pages principales (POS, Dashboard, Reports...)
├── components/
│   ├── pos/            # Composants caisse enregistreuse
│   ├── dashboard/      # Layout et widgets dashboard
│   ├── customers/      # Gestion clients et crédits
│   ├── suppliers/      # Gestion fournisseurs
│   ├── sync/           # Synchronisation offline/reçus
│   └── ui/             # Composants shadcn/ui
├── contexts/           # Auth, Offline, Branding, Theme, POS Cart
├── hooks/              # Hooks métier (usePOSProducts, useCategories...)
├── lib/                # Utilitaires (offlineQueue, sentry, taxUtils...)
├── integrations/       # Client Supabase + types générés
└── test/               # 174 tests unitaires

supabase/
└── migrations/         # 25+ migrations SQL (RLS, RPC, indexes, sécurité)

e2e/                    # Tests Playwright (auth, POS, offline, dashboard)
```

---

## Installation locale

### Prérequis

- Node.js 20+
- npm 9+
- Compte Supabase

### Étapes

```bash
# 1. Cloner le dépôt
git clone https://github.com/skaba89/makitiplus.git
cd makitiplus

# 2. Installer les dépendances
npm ci

# 3. Configurer les variables d'environnement
cp .env.example .env
# Remplir VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY

# 4. Lancer le serveur de développement
npm run dev

# 5. Vérifier que tout fonctionne
npm run check
```

---

## Variables d'environnement

| Variable | Requise | Description |
|----------|---------|-------------|
| `VITE_SUPABASE_URL` | ✅ | URL du projet Supabase |
| `VITE_SUPABASE_ANON_KEY` | ✅ | Clé anonyme Supabase |
| `VITE_SENTRY_DSN` | ❌ | DSN Sentry pour monitoring |
| `VITE_SENTRY_ENVIRONMENT` | ❌ | Environnement (production/staging/development) |
| `VITE_SENTRY_TRACES_SAMPLE_RATE` | ❌ | Taux d'échantillonnage traces (défaut: 0.1) |
| `VITE_APP_VERSION` | ❌ | Version pour release Sentry |

---

## Migrations Supabase

Les migrations sont dans `supabase/migrations/` et doivent être appliquées dans l'ordre :

```bash
# Via Supabase CLI
supabase db push

# Ou manuellement via le SQL Editor du Dashboard
```

**Migrations critiques de sécurité :**
- `20260702090000_p0_security_remove_client_identity_params.sql` — Supprime les params client des RPC SECURITY DEFINER
- `20260702100000_fix_register_user_first_admin.sql` — Corrige le flux premier admin

---

## Déploiement

### Render (recommandé)

1. Connecter le dépôt GitHub à Render
2. Configurer les variables d'environnement
3. Le déploiement est automatique sur push vers `main`

Le fichier `render.yaml` contient les headers de sécurité (CSP, X-Frame-Options, etc.).

### Build manuel

```bash
npm run build    # Génère dist/
npm run preview  # Prévisualise le build
```

---

## Tests

```bash
# Tests unitaires (Vitest)
npm test

# Vérification complète
npm run check

# Tests E2E (Playwright)
npm run e2e

# Tests E2E avec UI
npm run e2e:ui
```

**Couverture actuelle :** 174 tests unitaires + 20 tests E2E

---

## Sécurité

| Mesure | Implémentation |
|--------|----------------|
| **RLS (Row Level Security)** | Toutes les tables Supabase ont des politiques RLS par organisation |
| **SECURITY DEFINER RPC** | Les fonctions critiques utilisent `auth.uid()` + `get_user_organization_id()` côté serveur |
| **Pas de params client** | Les RPC n'acceptent plus `p_user_id` ou `p_organization_id` du client |
| **Headers sécurité** | CSP, X-Frame-Options DENY, X-Content-Type-Options, Referrer-Policy, Permissions-Policy |
| **ProtectedRoute** | Bloque l'accès si `userRole === null` (session incomplète) |
| **Offline sécurisé** | Validation organization_id + userId sur flush, allowlist de tables |
| **CI audit** | `npm audit --audit-level=high` bloque les vulnérabilités high/critical |

---

## Plans SaaS

| Plan | Boutiques | Utilisateurs | Produits | Fonctionnalités |
|------|-----------|-------------|----------|-----------------|
| **Starter** | 1 | 2 | 500 | POS + stock + clients |
| **Croissance** | 3 | 10 | Illimité | Fournisseurs, rapports avancés, exports, offline avancé |
| **Enterprise** | Illimité | Illimité | Illimité | Analytics, API, support prioritaire, branding, multi-boutiques |

---

## Roadmap

- [x] POS caisse enregistreuse
- [x] Gestion stock et catégories
- [x] Clients à crédit
- [x] Fournisseurs
- [x] Mode offline + synchronisation
- [x] PWA mobile
- [x] Reçus PDF + WhatsApp
- [x] Admin analytics multi-boutiques
- [x] Sécurité RPC P0/P1
- [x] CI/CD GitHub Actions
- [x] Tests E2E Playwright
- [x] Module abonnements et quotas (SaaS Foundation)
- [x] Page Billing/Pricing
- [ ] Onboarding premium
- [ ] Mode démo commercial
- [ ] Multi-boutiques avancé (transfert stock)
- [ ] Commandes fournisseurs intelligentes
- [ ] Assistant IA métier
- [ ] Programme fidélité
- [ ] Backup/restore
- [ ] Support client intégré

---

## Licence

Propriétaire — Tous droits réservés.
