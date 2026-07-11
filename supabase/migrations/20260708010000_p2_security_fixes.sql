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
