-- ============================================================
-- Fix : RLS policies manquantes sur suppliers
-- Date: 2026-07-13
-- ============================================================
-- Bug : impossible d'ajouter un fournisseur
-- Cause : RLS activée sur suppliers MAIS aucune policy INSERT/SELECT/UPDATE/DELETE
-- → PostgreSQL bloque tout par défaut (deny all)
--
-- Fix : créer les policies RLS pour suppliers + expenses + customers
-- (vérifier aussi ces tables qui pourraient avoir le même problème)
-- ============================================================

-- ════════════════════════════════════════════════════════════════
-- 1. SUPPLIERS — policies RLS
-- ════════════════════════════════════════════════════════════════

-- SELECT : les utilisateurs peuvent voir les fournisseurs de leur org
DROP POLICY IF EXISTS "suppliers_select_own_org" ON public.suppliers;
CREATE POLICY "suppliers_select_own_org" ON public.suppliers
  FOR SELECT TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
    )
  );

-- INSERT : les utilisateurs peuvent créer des fournisseurs dans leur org
DROP POLICY IF EXISTS "suppliers_insert_own_org" ON public.suppliers;
CREATE POLICY "suppliers_insert_own_org" ON public.suppliers
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
    )
  );

-- UPDATE : les utilisateurs peuvent modifier les fournisseurs de leur org
DROP POLICY IF EXISTS "suppliers_update_own_org" ON public.suppliers;
CREATE POLICY "suppliers_update_own_org" ON public.suppliers
  FOR UPDATE TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
    )
  );

-- DELETE : les utilisateurs peuvent supprimer les fournisseurs de leur org
DROP POLICY IF EXISTS "suppliers_delete_own_org" ON public.suppliers;
CREATE POLICY "suppliers_delete_own_org" ON public.suppliers
  FOR DELETE TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
    )
  );

-- ════════════════════════════════════════════════════════════════
-- 2. EXPENSES — vérifier policies (si manquantes, créer)
-- ════════════════════════════════════════════════════════════════

DO $$
BEGIN
  -- Vérifier si expenses a au moins une policy
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'expenses'
  ) THEN
    RAISE NOTICE '⚠️  expenses n''a aucune policy RLS — création...';
  END IF;
END $$;

-- Créer les policies expenses si elles n'existent pas
DROP POLICY IF EXISTS "expenses_select_own_org" ON public.expenses;
CREATE POLICY "expenses_select_own_org" ON public.expenses
  FOR SELECT TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "expenses_insert_own_org" ON public.expenses;
CREATE POLICY "expenses_insert_own_org" ON public.expenses
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "expenses_update_own_org" ON public.expenses;
CREATE POLICY "expenses_update_own_org" ON public.expenses
  FOR UPDATE TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "expenses_delete_own_org" ON public.expenses;
CREATE POLICY "expenses_delete_own_org" ON public.expenses
  FOR DELETE TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
    )
  );

-- ════════════════════════════════════════════════════════════════
-- 3. CUSTOMERS — vérifier policies (si manquantes, créer)
-- ════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "customers_select_own_org" ON public.customers;
CREATE POLICY "customers_select_own_org" ON public.customers
  FOR SELECT TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "customers_insert_own_org" ON public.customers;
CREATE POLICY "customers_insert_own_org" ON public.customers
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "customers_update_own_org" ON public.customers;
CREATE POLICY "customers_update_own_org" ON public.customers
  FOR UPDATE TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "customers_delete_own_org" ON public.customers;
CREATE POLICY "customers_delete_own_org" ON public.customers
  FOR DELETE TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
    )
  );

-- ════════════════════════════════════════════════════════════════
-- 4. Vérification finale
-- ════════════════════════════════════════════════════════════════
DO $$
BEGIN
  RAISE NOTICE '═══════════════════════════════════════════════════════';
  RAISE NOTICE '✅ Policies RLS créées pour :';
  RAISE NOTICE '   - suppliers (SELECT/INSERT/UPDATE/DELETE)';
  RAISE NOTICE '   - expenses (SELECT/INSERT/UPDATE/DELETE)';
  RAISE NOTICE '   - customers (SELECT/INSERT/UPDATE/DELETE)';
  RAISE NOTICE '═══════════════════════════════════════════════════════';
END $$;
