# Supabase Cron Jobs — Configuration manuelle

> ⚠️ Cette procédure est **100% manuelle**. Aucune migration ne configure les cron jobs automatiquement.

## Prérequis

1. **CRON_SECRET** défini dans Supabase Dashboard → Edge Functions → Secrets
   - Générer un secret : `openssl rand -base64 32`
2. **pg_cron** activé sur la base
3. **pg_net** activé sur la base

## Étape 1 — Activer les extensions PostgreSQL

Dans **Supabase SQL Editor**, exécuter :

```sql
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
```

## Étape 2 — Supprimer les anciens cron jobs cassés

```sql
SELECT cron.unschedule('rotate-test-accounts-daily');
```

> L'ancien job `rotate-test-accounts-daily` n'envoyait pas le header `X-Cron-Secret`, ce qui provoquait un **403 Forbidden** systématique.

## Étape 3 — Créer les cron jobs avec les vraies valeurs

⚠️ **Remplacez les 2 placeholders** avant d'exécuter :
- `VOTRE_PROJECT_ID` : visible dans Supabase → Settings → General → **Reference ID**
- `VOTRE_CRON_SECRET` : même valeur que dans Edge Functions → Secrets

```sql
-- ── Rotate test accounts — tous les jours à 03:00 UTC ──
SELECT cron.schedule(
  'rotate-test-accounts-daily',
  '0 3 * * *',
  $$
  SELECT net.http_post(
    url := 'https://VOTRE_PROJECT_ID.supabase.co/functions/v1/rotate-test-accounts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Cron-Secret', 'VOTRE_CRON_SECRET'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- ── Subscription lifecycle — toutes les 6 heures ──
SELECT cron.schedule(
  'subscription-lifecycle-6h',
  '0 */6 * * *',
  $$
  SELECT net.http_post(
    url := 'https://VOTRE_PROJECT_ID.supabase.co/functions/v1/subscription-lifecycle',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer VOTRE_CRON_SECRET'
    ),
    body := '{}'::jsonb
  );
  $$
);
```

## Étape 4 — Vérifier

```sql
SELECT jobname, schedule, command FROM cron.job;
```

Vérifier que :
- ✅ Les 2 jobs apparaissent
- ✅ Les URLs contiennent votre vrai Project ID
- ✅ Les headers contiennent votre vrai CRON_SECRET (pas `VOTRE_CRON_SECRET`)

## Étape 5 — Tester manuellement

```sql
-- Tester rotate-test-accounts
SELECT net.http_post(
  url := 'https://VOTRE_PROJECT_ID.supabase.co/functions/v1/rotate-test-accounts',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'X-Cron-Secret', 'VOTRE_CRON_SECRET'
  ),
  body := '{}'::jsonb
);

-- Tester subscription-lifecycle
SELECT net.http_post(
  url := 'https://VOTRE_PROJECT_ID.supabase.co/functions/v1/subscription-lifecycle',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer VOTRE_CRON_SECRET'
  ),
  body := '{}'::jsonb
);
```

## Sécurité

- Le CRON_SECRET est stocké dans `cron.job`, visible uniquement par le superutilisateur postgres
- Ne jamais commiter de vraie valeur de CRON_SECRET dans le dépôt
- Si le CRON_SECRET est compromis, le régénérer et mettre à jour les 2 endroits :
  1. Supabase Dashboard → Edge Functions → Secrets
  2. `cron.unschedule()` + `cron.schedule()` avec la nouvelle valeur
