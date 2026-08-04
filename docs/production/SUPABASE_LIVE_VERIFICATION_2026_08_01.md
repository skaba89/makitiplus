# MakitiPlus — Vérification Supabase live — 2026-08-01

Toutes les vérifications ci-dessous sont **en lecture seule** (introspection `pg_catalog`/`information_schema`, ou requêtes enveloppées dans `BEGIN...ROLLBACK`). Aucune donnée n'a été modifiée. Projet Supabase lié : `exxntkuursgwhxvehekr`.

## 1. RPC de clôture de caisse et de vente — présence live

```sql
SELECT proname FROM pg_proc JOIN pg_namespace n ON n.oid = pg_proc.pronamespace
WHERE n.nspname = 'public' AND proname IN (
  'open_cash_register_session', 'get_cash_closing_summary', 'close_cash_register_session',
  'approve_cash_register_session', 'reject_cash_register_session', 'get_cash_register_sessions',
  'is_user_super_admin', 'create_sale_with_limit', 'create_full_sale'
);
```

**Résultat : 9/9 présentes.**

| Fonction | Présente |
|---|---|
| `open_cash_register_session` | ✅ |
| `get_cash_closing_summary` | ✅ |
| `close_cash_register_session` | ✅ |
| `approve_cash_register_session` | ✅ |
| `reject_cash_register_session` | ✅ |
| `get_cash_register_sessions` | ✅ |
| `is_user_super_admin` | ✅ (créée aujourd'hui, PR #59 — fix RLS super_admin) |
| `create_sale_with_limit` | ✅ |
| `create_full_sale` | ✅ |

## 2. `cash_register_sessions` — RLS

```sql
SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = 'cash_register_sessions';
SELECT polname, polcmd FROM pg_policy WHERE polrelid = 'public.cash_register_sessions'::regclass;
```

| Vérification | Résultat |
|---|---|
| RLS activée (`relrowsecurity`) | ✅ `true` |
| RLS forcée (`relforcerowsecurity`) | ✅ `true` |
| Nombre de policies | 1 — `cash_sessions_select_own_vendeur` (commande `r` = SELECT uniquement) |
| Policies INSERT/UPDATE/DELETE directes pour `authenticated` | ✅ **0** — aucune. Toute écriture (ouverture, clôture, approbation, rejet) doit obligatoirement passer par les RPC `SECURITY DEFINER` ci-dessus. Un utilisateur `authenticated` ne peut pas modifier une session de caisse par un `UPDATE`/`INSERT`/`DELETE` direct sur la table. |

## 3. Paiement — `sales.payment_reference` et arguments RPC

```sql
SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='sales' AND column_name='payment_reference';
```

| Vérification | Résultat |
|---|---|
| `sales.payment_reference` existe | ✅ |
| `create_sale_with_limit` accepte `p_payment_reference` | ✅ `p_payment_reference text DEFAULT NULL::text` |
| `create_full_sale` accepte `p_payment_reference` | ✅ `p_payment_reference text DEFAULT NULL::text` |

## 4. Dérive de schéma (migrations locales vs. schéma live)

Introspection live réelle (`SELECT proname FROM pg_proc ... WHERE prokind='f'`) comparée à `scripts/check_rpc_signature_drift.py --live-json`.

- **Fonctions live mais absentes de toute migration locale : 0.** Aucune dérive non documentée — la base n'a pas été modifiée hors du pipeline de migrations.
- **Fonctions dans les migrations mais absentes du live : 42.** Connu, déjà trié lors d'un audit précédent (fonctionnalités volontairement non déployées : sauvegardes/restauration, programme de fidélité, transferts de stock inter-magasins, tickets support, métriques SaaS admin). Pas un bug — ce sont des fonctionnalités en développement ou volontairement retardées, pas des régressions.

## 5. Edge Functions

```
supabase functions list --project-ref exxntkuursgwhxvehekr
```

14 fonctions, toutes `status: ACTIVE`. Notamment `ai-assistant-chat` (`verify_jwt: true`, version 1, déployée 2026-07-29) — présente et active, mais **pas encore testée fonctionnellement avec un vrai compte autorisé** dans le cadre de cet audit (prévu section P0.6, non exécuté à ce stade).

## Conclusion

Aucune fuite de sécurité, aucune dérive de schéma non documentée, aucune régression sur les RPC critiques de vente/clôture de caisse. Le fix RLS `is_user_super_admin` du PR #59 est bien présent et actif en production.
