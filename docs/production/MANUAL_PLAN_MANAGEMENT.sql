-- ============================================================
-- MakitiPlus — Manual Plan Management (sans Stripe)
-- ============================================================
-- Utilisez ces commandes dans Supabase SQL Editor
-- pour gérer les abonnements manuellement.
-- ============================================================
-- ⚠️ CORRECTION : la colonne s'appelle organization_id, PAS org_id
-- ============================================================

-- ═══════════════════════════════════════════════════════════
-- 1. ASSIGNER un plan à une organisation
-- ═══════════════════════════════════════════════════════════

-- ► Activer CROISSANCE (39,90 €/mois) — durée 1 mois
-- Remplacez VOTRE_ORG_ID par l'UUID de l'organisation
UPDATE public.subscriptions
SET
  plan_id = 'croissance',
  status = 'active',
  current_period_start = NOW(),
  current_period_end = NOW() + INTERVAL '1 month'
WHERE organization_id = 'VOTRE_ORG_ID';

-- Si aucune ligne n'existe encore :
INSERT INTO public.subscriptions (organization_id, plan_id, status, current_period_start, current_period_end)
VALUES ('VOTRE_ORG_ID', 'croissance', 'active', NOW(), NOW() + INTERVAL '1 month')
ON CONFLICT (organization_id) DO UPDATE SET
  plan_id = EXCLUDED.plan_id,
  status = EXCLUDED.status,
  current_period_start = EXCLUDED.current_period_start,
  current_period_end = EXCLUDED.current_period_end;


-- ► Activer ENTERPRISE (99,90 €/mois) — durée 1 mois
UPDATE public.subscriptions
SET
  plan_id = 'enterprise',
  status = 'active',
  current_period_start = NOW(),
  current_period_end = NOW() + INTERVAL '1 month'
WHERE organization_id = 'VOTRE_ORG_ID';


-- ► Activer CROISSANCE ANNUEL (399,00 €/an)
UPDATE public.subscriptions
SET
  plan_id = 'croissance',
  status = 'active',
  current_period_start = NOW(),
  current_period_end = NOW() + INTERVAL '1 year'
WHERE organization_id = 'VOTRE_ORG_ID';


-- ► Activer ENTERPRISE ANNUEL (999,00 €/an)
UPDATE public.subscriptions
SET
  plan_id = 'enterprise',
  status = 'active',
  current_period_start = NOW(),
  current_period_end = NOW() + INTERVAL '1 year'
WHERE organization_id = 'VOTRE_ORG_ID';


-- ═══════════════════════════════════════════════════════════
-- 2. PROLONGER un abonnement existant
-- ═══════════════════════════════════════════════════════════

-- Prolonger de 1 mois à partir de la fin actuelle
UPDATE public.subscriptions
SET current_period_end = GREATEST(current_period_end, NOW()) + INTERVAL '1 month'
WHERE organization_id = 'VOTRE_ORG_ID';

-- Prolonger de 1 an
UPDATE public.subscriptions
SET current_period_end = GREATEST(current_period_end, NOW()) + INTERVAL '1 year'
WHERE organization_id = 'VOTRE_ORG_ID';


-- ═══════════════════════════════════════════════════════════
-- 3. DOWNGRADE / RÉTROGRADER vers essai
-- ═══════════════════════════════════════════════════════════

UPDATE public.subscriptions
SET
  plan_id = 'starter',
  status = 'trialing',
  current_period_end = NOW() + INTERVAL '14 days'
WHERE organization_id = 'VOTRE_ORG_ID';


-- ═══════════════════════════════════════════════════════════
-- 4. CONSULTER l'état d'un abonnement
-- ═══════════════════════════════════════════════════════════

-- Voir l'abonnement d'une org
SELECT s.organization_id, s.plan_id, s.status,
       s.current_period_start, s.current_period_end,
       o.name as org_name,
       CASE WHEN s.current_period_end < NOW() THEN 'EXPIRÉ' ELSE 'VALIDE' END as etat
FROM public.subscriptions s
JOIN public.organizations o ON o.id = s.organization_id
WHERE s.organization_id = 'VOTRE_ORG_ID';


-- ═══════════════════════════════════════════════════════════
-- 5. LISTE DE TOUS LES ABONNEMENTS
-- ═══════════════════════════════════════════════════════════

SELECT o.name as organisation, s.plan_id, s.status,
       s.current_period_start,
       s.current_period_end,
       CASE WHEN s.current_period_end < NOW() THEN 'EXPIRÉ' ELSE 'VALIDE' END as etat
FROM public.subscriptions s
JOIN public.organizations o ON o.id = s.organization_id
ORDER BY s.current_period_end DESC;


-- ═══════════════════════════════════════════════════════════
-- 6. TROUVER VOTRE_ORG_ID
-- ═══════════════════════════════════════════════════════════

SELECT id, name FROM public.organizations ORDER BY name;
