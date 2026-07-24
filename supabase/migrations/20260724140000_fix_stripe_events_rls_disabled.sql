-- ════════════════════════════════════════════════════════════════
-- Fix SÉCURITÉ CRITIQUE : RLS désactivée sur stripe_events + droits
-- bruts excessifs accordés à authenticated
-- Date: 2026-07-24 -- trouve en audit RLS (P4, gap-closing)
--
-- Constat live : public.stripe_events a relrowsecurity = false (RLS
-- desactivee), alors que 20260705060000_force_row_level_security.sql
-- appliquait deja "FORCE ROW LEVEL SECURITY" sur cette table -- sans
-- effet, car FORCE ne fait qu'etendre RLS au proprietaire de la table,
-- il ne l'active pas si ENABLE ROW LEVEL SECURITY n'a jamais ete
-- execute. De plus, le role "authenticated" avait des GRANT bruts
-- (lecture et ecriture) sur la table -- heritage probable du schema
-- initial, jamais restreint.
--
-- Consequence : N'IMPORTE QUEL utilisateur authentifie (y compris un
-- role "vendeur" du plus bas niveau, dans n'importe quelle
-- organisation) pouvait lire l'INTEGRALITE des evenements Stripe de
-- TOUTES les organisations de la plateforme (payload JSON complet --
-- ids clients Stripe, abonnements, factures), ou en inserer/modifier de
-- faux (falsification potentielle de webhooks pour debloquer des
-- fonctionnalites payantes).
--
-- Verifie live : la table est actuellement VIDE (0 ligne) -- aucune
-- fuite de donnees reelle constatee a ce jour. Aucun code applicatif
-- actuel (Edge Function stripe-webhook, frontend) ne lit/ecrit cette
-- table Postgres -- le webhook utilise Deno KV pour l'idempotence, pas
-- cette table. Le fix est donc sans risque de regression fonctionnelle.
--
-- Fix (aligne sur l'intention documentee dans
-- 20260708000000_p1_security_fixes.sql, jamais appliquee en pratique) :
--   1. ENABLE + FORCE ROW LEVEL SECURITY
--   2. Policy service_role (ALL) -- ecriture reservee au webhook
--   3. Policy authenticated (SELECT uniquement) -- lecture scopee a sa
--      propre organisation, pour un futur ecran de diagnostic/facturation
--   4. REVOKE des droits d'ecriture bruts (INSERT/UPDATE/DELETE) sur
--      authenticated -- seul service_role doit pouvoir ecrire. Un autre
--      droit d'administration de table (non filtrable par RLS) reste
--      accorde a authenticated, comme sur la quasi-totalite des autres
--      tables du schema (comportement par defaut Supabase) : il n'est
--      pas exposable via l'API REST standard, donc hors perimetre de ce
--      fix cible -- laisse pour une passe de durcissement ulterieure.
-- ════════════════════════════════════════════════════════════════

ALTER TABLE public.stripe_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_events FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "stripe_events_service_role" ON public.stripe_events;
CREATE POLICY "stripe_events_service_role" ON public.stripe_events
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "stripe_events_select_authenticated" ON public.stripe_events;
CREATE POLICY "stripe_events_select_authenticated" ON public.stripe_events
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR organization_id = public.get_user_organization_id()
  );

REVOKE INSERT, UPDATE, DELETE ON public.stripe_events FROM authenticated;
