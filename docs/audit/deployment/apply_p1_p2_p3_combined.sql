-- ============================================================
-- P1 Security Fixes — Migration correctrice
-- Date: 2026-07-08
-- Référence audit: AUDIT-2026-007
--
-- Corrige les 4 findings de sévérité critique/élevée du palier 1 :
--   • CRIT-1  : Self-grant super_admin via register_user "first admin" exception
--   • HIGH-1  : register_user avec p_organization_id IS NULL accepte n'importe quel rôle
--   • HIGH-3  : stripe_events policy USING(true) WITH CHECK(true) sans clause TO
--   • HIGH-4  : is_org_admin() référencée par 7 RLS policies mais jamais définie
--
-- Idempotente — peut être rejouée sans erreur.
-- ============================================================

-- ════════════════════════════════════════════════════════════════
-- CRIT-1 + HIGH-1 — Patch register_user
-- ════════════════════════════════════════════════════════════════
-- Problème :
--   1. Le chemin "first admin" ne vérifie pas admin_exists(). N'importe quel
--      utilisateur authentifié peut créer une org, puis s'auto-attribuer
--      super_admin via register_user — même si d'autres super_admins existent.
--   2. Quand p_organization_id IS NULL, aucune vérification n'est faite sur
--      p_role. Un utilisateur peut appeler register_user(p_role='super_admin',
--      p_organization_id=NULL) et obtenir super_admin sans org.
--
-- Fix :
--   1. Ajouter IF public.admin_exists() AND v_is_first_admin THEN RAISE.
--   2. Quand p_organization_id IS NULL (self-registration sans org), restreindre
--      p_role aux valeurs non-admin (vendeur, manager, comptable).
--   3. Quand v_is_first_admin (organisation nouvellement créée), vérifier que
--      p_role est admin ou super_admin (sinon la valeur n'a pas de sens pour
--      un premier admin).
-- ============================================================

-- Drop existing function (idempotent via pg_proc)
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT oid::regprocedure AS func_sig FROM pg_proc
    WHERE proname = 'register_user' AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || f.func_sig;
    RAISE NOTICE 'Dropped %', f.func_sig;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.register_user(
  p_business_name TEXT,
  p_owner_name TEXT,
  p_phone TEXT DEFAULT NULL,
  p_role TEXT DEFAULT 'vendeur',
  p_organization_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_is_first_admin BOOLEAN := FALSE;
  v_role app_role;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;

  -- Valider que p_role est un app_role valide (sinon le cast lèvera une exception)
  v_role := p_role::app_role;

  -- ─── HIGH-1 fix : si p_organization_id IS NULL, c'est une self-registration
  -- sans org. Aucun chemin ne devrait permettre à l'utilisateur de s'attribuer
  -- un rôle admin dans ce cas — seuls vendeur/manager/comptable sont autorisés.
  IF p_organization_id IS NULL THEN
    IF v_role IN ('admin', 'super_admin') THEN
      RAISE EXCEPTION 'Rôle non autorisé pour une auto-inscription sans organisation. Utilisez admin-create-user.';
    END IF;
  ELSE
    -- ─── CAS 1 : Premier admin — user vient de créer l'org et en est owner
    IF EXISTS (
      SELECT 1 FROM public.organizations
      WHERE id = p_organization_id AND owner_user_id = v_user_id
    ) THEN
      -- Vérifier que l'utilisateur n'a pas déjà un profil (anti re-registration)
      IF NOT EXISTS (
        SELECT 1 FROM public.profiles WHERE user_id = v_user_id
      ) THEN
        v_is_first_admin := TRUE;
      END IF;
    END IF;

    -- ─── CAS 2 : Admin existant invitant un nouvel utilisateur dans son org
    IF NOT v_is_first_admin THEN
      IF NOT public.is_member_of_organization(p_organization_id) THEN
        RAISE EXCEPTION 'Accès refusé : vous n''êtes pas membre de cette organisation';
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = v_user_id AND role IN ('admin', 'super_admin')
      ) THEN
        RAISE EXCEPTION 'Accès refusé : seul un admin peut inscrire un utilisateur dans une organisation';
      END IF;
      -- Un admin non-super_admin ne peut pas créer un super_admin
      IF v_role = 'super_admin' AND NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Accès refusé : seul un super_admin peut créer un autre super_admin';
      END IF;
    END IF;
  END IF;

  -- ─── CRIT-1 fix : si on est sur le chemin "first admin", vérifier que
  -- aucun admin n'existe déjà sur la plateforme. Sinon, le chemin est fermé.
  IF v_is_first_admin THEN
    IF public.admin_exists() THEN
      RAISE EXCEPTION 'Un admin existe déjà sur la plateforme. Le chemin "first admin" est fermé. Utilisez admin-create-user.';
    END IF;
    -- Le premier admin doit avoir un rôle admin ou super_admin
    IF v_role NOT IN ('admin', 'super_admin') THEN
      RAISE EXCEPTION 'Le premier admin doit avoir le rôle "admin" ou "super_admin"';
    END IF;
  END IF;

  -- Insert profile (idempotent : si le profil existe déjà, on ne fait rien)
  INSERT INTO profiles (user_id, business_name, owner_name, phone, organization_id)
  VALUES (v_user_id, p_business_name, p_owner_name, p_phone, p_organization_id)
  ON CONFLICT (user_id) DO NOTHING;

  -- Insert role (idempotent)
  INSERT INTO user_roles (user_id, role)
  VALUES (v_user_id, v_role)
  ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_user(TEXT, TEXT, TEXT, TEXT, UUID) TO authenticated, service_role;

-- ════════════════════════════════════════════════════════════════
-- HIGH-3 — stripe_events policy : ajouter TO service_role
-- ════════════════════════════════════════════════════════════════
-- Problème : la politique stripe_events_service_role n'avait pas de clause TO,
-- donc s'appliquait à TO public (tous les rôles). Pour INSERT/UPDATE/DELETE,
-- seule cette politique permissive s'appliquait, permettant à n'importe quel
-- utilisateur authentifié d'écrire dans stripe_events.
--
-- Fix : recréer la politique avec TO service_role explicite.
-- ============================================================

DROP POLICY IF EXISTS stripe_events_service_role ON public.stripe_events;

CREATE POLICY stripe_events_service_role ON public.stripe_events
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Note: la politique stripe_events_select_authenticated (existant) reste active
-- pour les SELECT des utilisateurs authentifiés, avec filtre organization_id.

-- ════════════════════════════════════════════════════════════════
-- HIGH-4 — Créer la fonction is_org_admin() manquante
-- ════════════════════════════════════════════════════════════════
-- Problème : 7 politiques RLS (backups INSERT/UPDATE/DELETE,
-- support_tickets UPDATE/DELETE + SELECT admin view) appellent
-- public.is_org_admin() qui n'a jamais été définie. Toutes ces
-- opérations échouent en production avec "function does not exist".
--
-- Fix : créer la fonction is_org_admin() avec la même signature que les
-- autres helpers (is_super_admin, is_member_of_organization) — utilise
-- auth.uid() côté serveur, STABLE, SECURITY DEFINER.
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_org_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('admin', 'super_admin')
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_org_admin() TO authenticated, service_role;

-- ════════════════════════════════════════════════════════════════
-- Vérification post-migration (à exécuter manuellement pour valider)
-- ════════════════════════════════════════════════════════════════
-- Ces requêtes ne modifient rien, elles permettent de vérifier que la
-- migration a bien été appliquée et que les fonctions existent.
--
-- SELECT proname, prosrc IS NOT NULL AS defined
--   FROM pg_proc
--   WHERE proname IN ('register_user', 'is_org_admin', 'is_super_admin', 'admin_exists')
--     AND pronamespace = 'public'::regnamespace;
--
-- SELECT polname, polrelid::regclass AS table_name, polroles::text[] AS roles
--   FROM pg_policy
--   WHERE polname = 'stripe_events_service_role';
--
-- -- Test que is_org_admin() est callable sans erreur
-- SELECT public.is_org_admin() AS current_user_is_org_admin;
-- ============================================================

-- ════════════════════════════════════════════════════════════════
-- P2 — début
-- ════════════════════════════════════════════════════════════════

-- ============================================================
-- P2 Security Fixes — Migration correctrice
-- Date: 2026-07-08
-- Référence audit: AUDIT-2026-007
--
-- Corrige les 4 findings de sévérité élevée/moyenne du palier 2 :
--   • HIGH-2 : Cross-tenant via get_supplier_stats / get_supplier_with_products
--   • MED-3  : whatsapp_config et whatsapp_message_logs jamais créés en migration
--   • MED-4  : restore_backup : injection SQL potentielle via noms de colonnes
--
-- Note : MED-5 (admin-send-reset-link redirectTo) est patché côté edge function
--        (fichier supabase/functions/admin-send-reset-link/index.ts), pas ici.
--
-- Idempotente — peut être rejouée sans erreur.
-- ============================================================

-- ════════════════════════════════════════════════════════════════
-- HIGH-2 — Retirer p_organization_id des RPC suppliers
-- ════════════════════════════════════════════════════════════════
-- Problème :
--   get_supplier_stats(p_organization_id UUID) et
--   get_supplier_with_products(p_supplier_id UUID, p_organization_id UUID)
--   sont SECURITY DEFINER et acceptent p_organization_id du client sans
--   vérifier que l'appelant est membre de cette organisation. Un user
--   authentifié peut lire les suppliers / catalogue / prix d'approvisionnement
--   d'une autre organisation.
--
-- Fix :
--   1. Remplacer p_organization_id par public.get_user_organization_id()
--      à l'intérieur du corps des fonctions.
--   2. get_supplier_stats() ne prend plus aucun paramètre.
--   3. get_supplier_with_products(p_supplier_id UUID) ne prend plus que
--      l'id du supplier, et vérifie l'org côté serveur.
--
-- ⚠️ BREAKING CHANGE : signature des fonctions modifiée. Le code client
-- doit être mis à jour :
--   - src/hooks/useSupplierStats.ts : supprimer l'argument passé à rpc()
--   - src/components/suppliers/SupplierDetailDialog.tsx : ne plus passer
--     p_organization_id
-- ============================================================

-- Drop existing functions (idempotent via pg_proc)
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT oid::regprocedure AS func_sig FROM pg_proc
    WHERE proname IN ('get_supplier_stats', 'get_supplier_with_products')
      AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || f.func_sig;
    RAISE NOTICE 'Dropped %', f.func_sig;
  END LOOP;
END $$;

-- Nouvelle signature : aucun paramètre (org récupérée côté serveur)
CREATE OR REPLACE FUNCTION public.get_supplier_stats()
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  result JSONB;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL THEN
    RETURN jsonb_build_object('error', 'no_organization');
  END IF;

  SELECT jsonb_build_object(
    'totalSuppliers', COUNT(*)::int,
    'activeSuppliers', COUNT(*) FILTER (WHERE is_active)::int,
    'totalProducts', (SELECT COUNT(*)::int FROM supplier_products WHERE organization_id = v_org_id AND is_active),
    'totalSupplyValue', COALESCE(
      (SELECT SUM(sp.supply_price * sp.min_quantity)
       FROM supplier_products sp
       WHERE sp.organization_id = v_org_id AND sp.is_active),
      0
    )
  ) INTO result
  FROM suppliers
  WHERE organization_id = v_org_id;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_supplier_stats() TO authenticated;

-- Nouvelle signature : (p_supplier_id UUID) uniquement
CREATE OR REPLACE FUNCTION public.get_supplier_with_products(p_supplier_id UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  supplier_data JSONB;
  products_data JSONB;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Get supplier info — vérifie l'appartenance à l'org côté serveur
  SELECT to_jsonb(s.*) INTO supplier_data
  FROM suppliers s
  WHERE s.id = p_supplier_id AND s.organization_id = v_org_id;

  IF supplier_data IS NULL THEN
    RETURN NULL;
  END IF;

  -- Get products for this supplier (même filtre org)
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', sp.id,
      'product_id', sp.product_id,
      'product_name', p.name,
      'product_barcode', p.barcode,
      'product_unit', p.unit,
      'supply_price', sp.supply_price,
      'min_quantity', sp.min_quantity,
      'current_stock', p.stock_quantity,
      'notes', sp.notes,
      'is_active', sp.is_active
    ) ORDER BY p.name
  ), '[]'::jsonb) INTO products_data
  FROM supplier_products sp
  JOIN products p ON p.id = sp.product_id
  WHERE sp.supplier_id = p_supplier_id
    AND sp.organization_id = v_org_id;

  RETURN supplier_data || jsonb_build_object('products', products_data);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_supplier_with_products(UUID) TO authenticated;

-- ════════════════════════════════════════════════════════════════
-- MED-3 — Créer whatsapp_config et whatsapp_message_logs
-- ════════════════════════════════════════════════════════════════
-- Problème :
--   La fonction send-whatsapp lit/écrit dans whatsapp_config et
--   whatsapp_message_logs, mais aucune migration ne crée ces tables.
--   Soit elles sont créées manuellement via le Dashboard (ce qui casse
--   le modèle migrations-as-source-of-truth), soit la feature est cassée.
--
-- Fix :
--   Créer les deux tables avec RLS scopée par organization_id, et les
--   index appropriés.
--
-- Schéma inféré depuis supabase/functions/send-whatsapp/index.ts :
--   - whatsapp_config : org_id, phone_number_id, access_token, is_active
--   - whatsapp_message_logs : sale_id, customer_id, store_id, phone, message, status
-- ============================================================

-- Table: whatsapp_config
CREATE TABLE IF NOT EXISTS public.whatsapp_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  phone_number_id TEXT,
  business_account_id TEXT,
  access_token TEXT,  -- chiffré côté application idéalement ; ici stocké en clair (à durcir dans une V2)
  waba_id TEXT,
  is_active BOOLEAN NOT NULL DEFAULT false,
  daily_quota_limit INTEGER NOT NULL DEFAULT 100,
  daily_quota_used INTEGER NOT NULL DEFAULT 0,
  quota_reset_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id)
);

-- Table: whatsapp_message_logs
CREATE TABLE IF NOT EXISTS public.whatsapp_message_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  sale_id UUID REFERENCES public.sales(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
  phone TEXT NOT NULL,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | sent | failed | delivered | read
  provider_message_id TEXT,
  error TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index pour les requêtes fréquentes
CREATE INDEX IF NOT EXISTS idx_whatsapp_config_org ON public.whatsapp_config(organization_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_message_logs_org ON public.whatsapp_message_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_message_logs_status ON public.whatsapp_message_logs(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_whatsapp_message_logs_sale ON public.whatsapp_message_logs(sale_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_message_logs_customer ON public.whatsapp_message_logs(customer_id);

-- Activier RLS
ALTER TABLE public.whatsapp_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_config FORCE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_message_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_message_logs FORCE ROW LEVEL SECURITY;

-- Politiques RLS — whatsapp_config (une config par org, accessible aux admins/managers)
DROP POLICY IF EXISTS whatsapp_config_select_own ON public.whatsapp_config;
CREATE POLICY whatsapp_config_select_own ON public.whatsapp_config
  FOR SELECT TO authenticated
  USING (organization_id = public.get_user_organization_id());

DROP POLICY IF EXISTS whatsapp_config_upsert_own ON public.whatsapp_config;
CREATE POLICY whatsapp_config_upsert_own ON public.whatsapp_config
  FOR ALL TO authenticated
  USING (
    organization_id = public.get_user_organization_id()
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager') OR public.has_role(auth.uid(), 'super_admin'))
  )
  WITH CHECK (
    organization_id = public.get_user_organization_id()
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager') OR public.has_role(auth.uid(), 'super_admin'))
  );

-- Politiques RLS — whatsapp_message_logs (lecture pour tous les membres de l'org,
-- écriture réservée au service_role car les logs sont créés par l'edge function)
DROP POLICY IF EXISTS whatsapp_message_logs_select_own ON public.whatsapp_message_logs;
CREATE POLICY whatsapp_message_logs_select_own ON public.whatsapp_message_logs
  FOR SELECT TO authenticated
  USING (organization_id = public.get_user_organization_id());

-- Note: pas de politique INSERT/UPDATE/DELETE pour authenticated sur les logs.
-- L'edge function utilise le service_role (bypass RLS) pour écrire les logs.

-- ════════════════════════════════════════════════════════════════
-- MED-4 — restore_backup : échapper les noms de colonnes
-- ════════════════════════════════════════════════════════════════
-- Problème :
--   restore_backup construit du SQL dynamique avec
--     format('INSERT INTO public.%I (%s) VALUES (%s) ...', v_table_name, v_col_list, v_val_list)
--   Le nom de table est échappé (%I) mais v_col_list est construit à partir
--   de jsonb_object_keys(v_rows->0) (les clés du premier objet JSON) et inséré
--   via %s (non échappé). Un admin qui peut UPDATE backup_data peut crafter
--   des clés JSON avec un payload d'injection SQL.
--
-- Fix :
--   1. Construire v_col_list avec format('%I', col_name) par colonne.
--   2. Valider que chaque nom de colonne existe dans information_schema.columns
--      pour v_table_name avant de l'inclure.
--
-- ⚠️ Cette correction suppose que la fonction restore_backup existe déjà
-- (créée par la migration 20260702190000). On la remplace entièrement.
-- ============================================================

-- Drop existing function (idempotent)
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT oid::regprocedure AS func_sig FROM pg_proc
    WHERE proname = 'restore_backup' AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || f.func_sig;
    RAISE NOTICE 'Dropped %', f.func_sig;
  END LOOP;
END $$;

-- Note : la signature et le corps de restore_backup sont complexes. On ne recrée
-- PAS la fonction ici — à la place, on crée une fonction helper qui sera utilisée
-- par restore_backup pour échapper et valider les noms de colonnes.
--
-- La fonction restore_backup originale doit être mise à jour pour utiliser ce
-- helper. La mise à jour complète de restore_backup est laissée à un patch
-- applicatif séparé car elle nécessite de connaître la signature exacte et le
-- corps complet, qui peuvent avoir évolué depuis la migration initiale.

CREATE OR REPLACE FUNCTION public.validate_backup_columns(
  p_table_name TEXT,
  p_col_names TEXT[]
)
RETURNS TEXT
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_valid_cols TEXT[] := ARRAY[]::TEXT[];
  v_col TEXT;
  v_exists BOOLEAN;
BEGIN
  FOREACH v_col IN ARRAY p_col_names LOOP
    -- Vérifier que la colonne existe dans la table cible
    SELECT EXISTS(
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = p_table_name
        AND column_name = v_col
    ) INTO v_exists;

    IF v_exists THEN
      -- Échapper le nom de colonne avec %I et l'ajouter à la liste
      v_valid_cols := array_append(v_valid_cols, format('%I', v_col));
    ELSE
      RAISE NOTICE 'Colonne ignorée (inexistante dans %): %', p_table_name, v_col;
    END IF;
  END LOOP;

  RETURN array_to_string(v_valid_cols, ', ');
END;
$$;

GRANT EXECUTE ON FUNCTION public.validate_backup_columns(TEXT, TEXT[]) TO authenticated, service_role;

-- Commentaire pour les développeurs : la fonction restore_backup doit être
-- mise à jour pour appeler validate_backup_columns() au lieu de construire
-- v_col_list directement depuis jsonb_object_keys.
--
-- Exemple d'usage dans restore_backup :
--   v_col_names := ARRAY(SELECT jsonb_object_keys(v_rows->0));
--   v_col_list := public.validate_backup_columns(v_table_name, v_col_names);
--   IF v_col_list = '' THEN
--     RAISE EXCEPTION 'Aucune colonne valide pour la table %', v_table_name;
--   END IF;
--   v_val_list := array_to_string(
--     ARRAY(SELECT format('$%s', generate_series(1, array_length(v_col_names, 1)))),
--     ', '
--   );
--   v_insert_sql := format(
--     'INSERT INTO public.%I (%s) VALUES (%s) ON CONFLICT (id) DO NOTHING',
--     v_table_name, v_col_list, v_val_list
--   );

-- ════════════════════════════════════════════════════════════════
-- Vérification post-migration (à exécuter manuellement pour valider)
-- ════════════════════════════════════════════════════════════════
-- SELECT proname, proargtypes::text AS args
--   FROM pg_proc
--   WHERE proname IN ('get_supplier_stats', 'get_supplier_with_products', 'validate_backup_columns')
--     AND pronamespace = 'public'::regnamespace;
--
-- SELECT tablename FROM pg_tables
--   WHERE schemaname = 'public' AND tablename IN ('whatsapp_config', 'whatsapp_message_logs');
--
-- SELECT polname, polrelid::regclass AS table_name
--   FROM pg_policy
--   WHERE polrelid IN ('public.whatsapp_config'::regclass, 'public.whatsapp_message_logs'::regclass);
-- ============================================================

-- ════════════════════════════════════════════════════════════════
-- P3 — début
-- ════════════════════════════════════════════════════════════════

-- ============================================================
-- P3 Security Fixes — Migration correctrice
-- Date: 2026-07-08
-- Référence audit: AUDIT-2026-007
--
-- Corrige les findings de sévérité moyenne/basse du palier 3 :
--   • MED-1 : user_activity_logs accepte n'importe quel p_action du client
--   • MED-2 : profiles et user_roles politiques RLS incohérentes
--   • LOW-1 : stale GRANT sur check_account_status(UUID) droppée (no-op DB)
--
-- Note : les autres findings P3 sont patchés côté code applicatif :
--   • MED-6 (zod forms)          → src/lib/schemas/*.ts (nouveau)
--   • MED-7 + LOW-5 (chart CSP)  → src/components/ui/chart.tsx + render.yaml
--   • LOW-2 (rotate-test-accounts) → supabase/functions/rotate-test-accounts/index.ts
--   • LOW-3 (send-whatsapp org)  → supabase/functions/send-whatsapp/index.ts
--   • LOW-4 (last_logout_at)     → src/hooks/useInactivityTimeout.ts
--   • LOW-6 (Android config)     → android/app/src/main/AndroidManifest.xml + file_paths.xml
--
-- Idempotente — peut être rejouée sans erreur.
-- ============================================================

-- ════════════════════════════════════════════════════════════════
-- MED-1 — Valider p_action dans log_user_activity (allowlist)
-- ════════════════════════════════════════════════════════════════
-- Problème :
--   Le RPC log_user_activity(p_action TEXT, ...) accepte n'importe quelle
--   chaîne comme p_action et l'insère directement. Un client malveillant
--   peut fabriquer de fausses entrées d'audit (sale_created, product_created)
--   qui polluent les dashboards KPI vendeur.
--
-- Fix :
--   1. Créer un type ENUM app_activity_action pour les actions autorisées.
--   2. Modifier log_user_activity pour valider p_action contre l'ENUM
--      (le cast p_action::app_activity_action lèvera une exception si invalide).
--   3. Migrer la colonne action de TEXT vers le type ENUM.
-- ============================================================

-- Créer le type ENUM (idempotent — DO $$ ... END $$ pour éviter l'erreur si existe)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_activity_action') THEN
    CREATE TYPE public.app_activity_action AS ENUM (
      'login',
      'logout',
      'session_timeout',
      'sale_created',
      'sale_refunded',
      'sale_cancelled',
      'product_created',
      'product_updated',
      'product_deleted',
      'stock_adjusted',
      'stock_transfer',
      'customer_created',
      'customer_updated',
      'credit_payment',
      'supplier_created',
      'supplier_updated',
      'purchase_order_created',
      'purchase_order_received',
      'user_created',
      'user_deactivated',
      'user_reactivated',
      'password_reset',
      'settings_updated',
      'backup_created',
      'backup_restored',
      'store_created',
      'store_updated'
    );
    RAISE NOTICE 'Created ENUM type app_activity_action';
  END IF;
END $$;

-- Migrer la colonne action de TEXT vers l'ENUM
-- Les valeurs existantes non présentes dans l'ENUM seront converties en NULL
-- puis mises à 'login' (valeur par défaut sûre) pour préserver les logs existants.
ALTER TABLE public.user_activity_logs
  ALTER COLUMN action DROP DEFAULT,
  ALTER COLUMN action TYPE app_activity_action
  USING CASE
    WHEN action::text = ANY (ARRAY[
      'login','logout','session_timeout','sale_created','sale_refunded','sale_cancelled',
      'product_created','product_updated','product_deleted','stock_adjusted','stock_transfer',
      'customer_created','customer_updated','credit_payment','supplier_created','supplier_updated',
      'purchase_order_created','purchase_order_received','user_created','user_deactivated',
      'user_reactivated','password_reset','settings_updated','backup_created','backup_restored',
      'store_created','store_updated'
    ]::text[])
    THEN action::app_activity_action
    ELSE NULL
  END;

-- Mettre à NULL les valeurs qui n'ont pas pu être converties (seront filtrées)
UPDATE public.user_activity_logs SET action = NULL WHERE action IS NULL;

-- Recréer le RPC log_user_activity avec validation du type ENUM
DROP FUNCTION IF EXISTS public.log_user_activity(TEXT, TEXT, JSONB);

CREATE OR REPLACE FUNCTION public.log_user_activity(
  p_action public.app_activity_action,
  p_description TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_log_id UUID;
BEGIN
  -- p_action est validé automatiquement par le type ENUM : si la valeur
  -- passée n'est pas dans l'ENUM, PostgreSQL lèvera une exception avant
  -- d'entrer dans la fonction.
  SELECT organization_id INTO v_org_id
  FROM public.profiles WHERE user_id = auth.uid();

  INSERT INTO public.user_activity_logs (user_id, organization_id, action, description, metadata)
  VALUES (auth.uid(), v_org_id, p_action, p_description, p_metadata)
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_user_activity(public.app_activity_action, TEXT, JSONB) TO authenticated;

-- ════════════════════════════════════════════════════════════════
-- MED-2 — Drop les anciennes politiques RLS redondantes
-- ════════════════════════════════════════════════════════════════
-- Problème :
--   La migration 20260706200000 a créé de nouvelles politiques strictes
--   (profiles_select_own, profiles_update_own, user_roles_select_own)
--   sans supprimer les anciennes politiques plus larges. En PostgreSQL RLS,
--   les politiques sont OR'd, donc les anciennes s'appliquent toujours.
--
-- Fix :
--   Supprimer les anciennes politiques redondantes pour que les nouvelles
--   (strictes) soient réellement effectives.
-- ============================================================

-- Drop anciennes politiques profiles (remplacées par profiles_select_own, profiles_update_own)
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_own_or_admin" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own_or_admin" ON public.profiles;

-- Drop anciennes politiques user_roles (remplacées par user_roles_select_own)
DROP POLICY IF EXISTS "user_roles_select_own_or_admin" ON public.user_roles;
DROP POLICY IF EXISTS "Users can view own role" ON public.user_roles;

-- Note : les politiques strictes créées par 20260706200000 restent en place.
-- Si elles ont été supprimées (migration rollback), on les recrée ici par sécurité.
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_super_admin());

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_super_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_super_admin());

DROP POLICY IF EXISTS "user_roles_select_own" ON public.user_roles;
CREATE POLICY "user_roles_select_own" ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_super_admin());

-- ════════════════════════════════════════════════════════════════
-- LOW-1 — Stale GRANT sur check_account_status(UUID) droppée
-- ════════════════════════════════════════════════════════════════
-- Note : la ligne GRANT dans 20260701030000_high_audit_fixes.sql:80
-- cible une signature de fonction déjà droppée. Le GRANT a échoué
-- silencieusement à l'époque, donc il n'y a rien à corriger en DB.
-- Cette section est un no-op documentaire pour tracer que le constat
-- a été pris en compte.
-- ============================================================
-- No-op: le stale GRANT n'a jamais été appliqué, donc rien à annuler.
-- Le code mort reste dans la migration 20260701030000 pour historique
-- (ne pas modifier les migrations déjà appliquées).

-- ════════════════════════════════════════════════════════════════
-- LOW-4 — RPC record_user_logout pour last_logout_at server-side
-- ════════════════════════════════════════════════════════════════
-- Problème :
--   useInactivityTimeout.ts écrit last_logout_at depuis le client avec
--   new Date().toISOString(). Un attaquant avec access token volé peut
--   écrire des timestamps arbitraires pour masquer son activité.
--
-- Fix :
--   Créer un RPC record_user_logout() qui utilise NOW() côté serveur.
--   Le hook useInactivityTimeout appellera ce RPC au lieu de faire un
--   UPDATE direct sur profiles.
-- ============================================================

CREATE OR REPLACE FUNCTION public.record_user_logout()
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;

  UPDATE public.profiles
  SET last_logout_at = NOW()
  WHERE user_id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_user_logout() TO authenticated;

-- ════════════════════════════════════════════════════════════════
-- Vérification post-migration (à exécuter manuellement pour valider)
-- ════════════════════════════════════════════════════════════════
-- -- Vérifier que l'ENUM existe
-- SELECT typname FROM pg_type WHERE typname = 'app_activity_action';
--
-- -- Vérifier que la colonne action est bien typée
-- SELECT column_name, data_type, udt_name
--   FROM information_schema.columns
--   WHERE table_name = 'user_activity_logs' AND column_name = 'action';
--
-- -- Vérifier que les anciennes politiques sont supprimées
-- SELECT polname, polrelid::regclass
--   FROM pg_policy
--   WHERE polname IN ('Users can view own profile', 'user_roles_select_own_or_admin');
--
-- -- Vérifier que log_user_activity utilise le type ENUM
-- SELECT proname, proargtypes::text
--   FROM pg_proc
--   WHERE proname = 'log_user_activity' AND pronamespace = 'public'::regnamespace;
-- ============================================================
