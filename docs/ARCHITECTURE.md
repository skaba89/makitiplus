# MakitiPlus — Architecture

## Vue d'ensemble

MakitiPlus est une plateforme SaaS offline-first pour commerces africains. L'architecture suit un modèle 3-tiers avec Supabase (PostgreSQL + Auth + Edge Functions) comme backend, React comme frontend, et Capacitor pour le mobile.

```
┌──────────────────────────────────────────────────────┐
│                    CLIENT                             │
│  ┌──────────┐  ┌──────────┐  ┌───────────────────┐  │
│  │  Browser │  │  PWA SW  │  │  Capacitor (iOS/  │  │
│  │  (React) │  │ (Workbox)│  │  Android)         │  │
│  └────┬─────┘  └────┬─────┘  └────────┬──────────┘  │
│       │              │                 │              │
│  ┌────▼──────────────▼─────────────────▼──────────┐  │
│  │              IndexedDB (offline queue)          │  │
│  └────────────────────┬───────────────────────────┘  │
└───────────────────────┼──────────────────────────────┘
                        │ HTTPS (REST + WebSocket)
┌───────────────────────┼──────────────────────────────┐
│              SUPABASE (Cloud)                         │
│  ┌────────────────────▼───────────────────────────┐  │
│  │           PostgREST (Auto API)                 │  │
│  │     ┌─────────────────────────────────┐        │  │
│  │     │  PostgreSQL + RLS + RPC (SQL)   │        │  │
│  │     │  ┌───────────┐  ┌────────────┐ │        │  │
│  │     │  │  Auth     │  │  Storage   │ │        │  │
│  │     │  │  (GoTrue) │  │  (S3)      │ │        │  │
│  │     │  └───────────┘  └────────────┘ │        │  │
│  │     └─────────────────────────────────┘        │  │
│  └────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────┐  │
│  │           Edge Functions (Deno)                │  │
│  │  stripe-webhook, stripe-checkout, stripe-portal│  │
│  │  admin-create-user, admin-manage-user          │  │
│  │  admin-send-reset-link, redeem-reset-token     │  │
│  │  send-whatsapp, rotate-test-accounts           │  │
│  │  subscription-lifecycle, admin-list-user-emails│  │
│  └────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
                        │
┌───────────────────────┼──────────────────────────────┐
│              RENDER (Frontend hosting)                │
│  ┌────────────────────▼───────────────────────────┐  │
│  │  Static build (dist/) + Security headers (CSP) │  │
│  └────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
```

## Stack technique

| Couche | Technologie | Version |
|--------|-------------|---------|
| Frontend | React + TypeScript | 18.3 + 5.8 |
| Build | Vite | 6.4 |
| UI | shadcn/ui + Tailwind CSS | 3.4 |
| State client | Zustand (cart) | 5.0 |
| State serveur | TanStack React Query | 5.83 |
| Backend | Supabase (PostgreSQL 15) | 2.93 |
| Auth | Supabase Auth (JWT, GoTrue) | — |
| Edge Functions | Deno + TypeScript | — |
| Offline | IndexedDB + Service Worker (Workbox) | 7.4 |
| Mobile | Capacitor 8 | 8.4 |
| Charts | Recharts | 2.15 |
| PDF | jsPDF | 4.1 |
| Monitoring | Sentry | 8.55 |
| CI/CD | GitHub Actions + Render | — |
| Tests | Vitest + Playwright | 3.2 + 1.61 |

## Structure du projet

```
makitiplus/
├── src/
│   ├── pages/              # 24 pages (POS, Dashboard, Reports, Stores...)
│   ├── components/
│   │   ├── pos/            # Composants caisse (cart, payment, scanner)
│   │   ├── dashboard/      # Layout, sidebar, mobile nav
│   │   ├── products/       # ProductForm, StockAdjust, Barcode
│   │   ├── customers/      # CreditPayment, CustomerDetail
│   │   ├── suppliers/      # SupplierDetail
│   │   ├── sync/           # Offline panels, receipt delivery
│   │   ├── settings/       # Branding, Tax, WhatsApp, Subscription
│   │   ├── users/          # AuditLog, ResetTokens, SecurityPanel
│   │   ├── saas/           # PlanLimitGuard
│   │   ├── skeletons/      # Loading states
│   │   └── ui/             # 40+ composants shadcn/ui
│   ├── contexts/           # 7 contexts (Auth, Offline, Store, Branding...)
│   ├── hooks/              # 22 hooks métier
│   ├── lib/
│   │   ├── schemas/        # Schémas Zod (product, customer, stock, credit)
│   │   ├── offlineQueue.ts # Queue de mutations offline
│   │   ├── postgrestSanitize.ts
│   │   ├── passwordPolicy.ts
│   │   ├── sentry.ts
│   │   └── logger.ts
│   ├── integrations/
│   │   ├── supabase/       # Client + types générés
│   │   └── stripe/         # Config Stripe
│   └── test/               # 68 fichiers, 780 tests
├── supabase/
│   ├── migrations/         # 88 migrations SQL
│   └── functions/          # 12 edge functions
│       └── _shared/        # CORS, rateLimiter, orgScope, passwordPolicy
├── e2e/                    # 10 scénarios Playwright
├── android/                # App Capacitor Android
├── ios/                    # App Capacitor iOS
├── docs/
│   ├── audit/              # Rapports + scripts déploiement
│   ├── production/         # Rapports stabilisation
│   └── manual/             # Guides manuels
├── scripts/                # validate_sql, check_undefined_functions, health-check
├── .github/workflows/      # CI: lint, typecheck, build, test, audit, E2E
└── render.yaml             # Config Render + CSP headers
```

## Modèle de données (tables principales)

```
organizations (id, name, owner_user_id, subscription_plan)
    ├── stores (id, organization_id, name, slug, category)
    ├── profiles (user_id, organization_id, business_name, owner_name)
    ├── user_roles (user_id, role: super_admin|admin|manager|vendeur|comptable)
    ├── products (id, organization_id, name, price, stock_quantity, barcode)
    │   └── categories (id, organization_id, name, sort_order)
    ├── customers (id, organization_id, name, phone, total_credit)
    │   └── customer_credits (id, customer_id, type, amount)
    ├── sales (id, organization_id, sale_number, total_amount, payment_method)
    │   └── sale_items (id, sale_id, product_id, quantity, unit_price)
    ├── expenses (id, organization_id, amount, category)
    ├── suppliers (id, organization_id, name, phone)
    │   └── supplier_products (id, supplier_id, product_id, supply_price)
    ├── subscriptions (id, organization_id, plan_id, status)
    ├── plans (id, name, max_stores, max_users, max_products)
    ├── user_activity_logs (id, user_id, organization_id, action, metadata)
    ├── user_audit_log (id, actor_id, action, target_user_id, details)
    ├── stripe_events (id, event_id, payload, status)
    └── whatsapp_config / whatsapp_message_logs
```

## Sécurité

### RLS (Row Level Security)
- Toutes les tables business ont RLS forcée (`FORCE ROW LEVEL SECURITY`)
- Toutes les politiques scoppent par `organization_id = get_user_organization_id()`
- `super_admin` bypass via `is_super_admin()` dans les politiques

### RPC SECURITY DEFINER
- Tous les RPC critiques utilisent `auth.uid()` + `get_user_organization_id()` côté serveur
- Aucun RPC n'accepte `p_user_id` ou `p_organization_id` du client (P0 fix)
- `admin_update_organization_subscription` vérifie `is_super_admin()`

### Session
- `persistSession: false` — tokens en mémoire uniquement (résistance XSS)
- `autoRefreshToken: false` — refresh manuel pour contrôle
- Inactivité : timeout 5 min avec warning 60s

### Edge Functions
- CORS allowlist (pas de wildcard en production)
- Rate limiter atomique via `Deno.openKv()`
- `timingSafeEqual` pour signature webhook Stripe
- `requireAdminContext` vérifie JWT + admin role + org scope

## Mode offline

```
[User action] → [useOfflineMutation hook]
    ↓
[Check navigator.onLine]
    ↓ online                    ↓ offline
[Direct Supabase call]    [IndexedDB enqueue]
    ↓                          ↓
[React Query cache]       [Service Worker queue]
                               ↓ (on reconnect)
                          [Flush queue → Supabase]
                               ↓
                          [Sync conflict resolver]
                               ↓
                          [React Query invalidate]
```

### Tables allowlistées pour offline
- `products`, `categories`, `customers`, `sales`, `sale_items`, `expenses`

### Validation au flush
- `organizationId === currentUserOrgId`
- `userId === user.id`
- TTL 7 jours sur les mutations en attente

## CI/CD

```
Push → GitHub Actions
    ├── lint (max 10 warnings)
    ├── typecheck
    ├── build
    ├── vitest (780 tests)
    ├── validate_sql_migrations.py
    ├── check_undefined_functions.py
    ├── npm audit --audit-level=high
    ├── secret scan (sk_live_, JWT, .env)
    └── pilot-e2e (Playwright, bloquant)
         ↑
    Render auto-deploys on main push
```

## Plans SaaS

| Plan | Boutiques | Users | Produits | Prix |
|------|-----------|-------|----------|------|
| Starter | 1 | 2 | 500 | Gratuit |
| Croissance | 3 | 10 | Illimité | 39,90 €/mois |
| Enterprise | Illimité | Illimité | Illimité | 99,90 €/mois |

- Vérification `check_plan_limit` côté serveur (RPC)
- `PlanLimitGuard` côté frontend (UI)
- Stripe Checkout + Portal pour paiements
- `admin_update_organization_subscription` pour super_admin (manuel)
