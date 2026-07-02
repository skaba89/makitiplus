-- ============================================================
-- Multi-Store — ÉTAPE 2: Ajouter store_id à toutes les tables
-- Exécuter en DEUXIÈME (après l'étape 1)
-- ============================================================

-- Products
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'store_id'
  ) THEN
    ALTER TABLE public.products ADD COLUMN store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL;
  END IF;
END $$;

UPDATE public.products p
SET store_id = s.id
FROM public.stores s
WHERE p.organization_id = s.organization_id
  AND s.is_headquarters = true
  AND p.store_id IS NULL;

-- Sales
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sales' AND column_name = 'store_id'
  ) THEN
    ALTER TABLE public.sales ADD COLUMN store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL;
  END IF;
END $$;

UPDATE public.sales sl
SET store_id = s.id
FROM public.stores s
WHERE sl.organization_id = s.organization_id
  AND s.is_headquarters = true
  AND sl.store_id IS NULL;

-- Sale items
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sale_items' AND column_name = 'store_id'
  ) THEN
    ALTER TABLE public.sale_items ADD COLUMN store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL;
  END IF;
END $$;

UPDATE public.sale_items si
SET store_id = s.id
FROM public.stores s
WHERE si.organization_id = s.organization_id
  AND s.is_headquarters = true
  AND si.store_id IS NULL;

-- Expenses
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'expenses' AND column_name = 'store_id'
  ) THEN
    ALTER TABLE public.expenses ADD COLUMN store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL;
  END IF;
END $$;

UPDATE public.expenses e
SET store_id = s.id
FROM public.stores s
WHERE e.organization_id = s.organization_id
  AND s.is_headquarters = true
  AND e.store_id IS NULL;

-- Categories
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'categories' AND column_name = 'store_id'
  ) THEN
    ALTER TABLE public.categories ADD COLUMN store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL;
  END IF;
END $$;

UPDATE public.categories c
SET store_id = s.id
FROM public.stores s
WHERE c.organization_id = s.organization_id
  AND s.is_headquarters = true
  AND c.store_id IS NULL;

-- Customers
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'customers' AND column_name = 'store_id'
  ) THEN
    ALTER TABLE public.customers ADD COLUMN store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL;
  END IF;
END $$;

UPDATE public.customers cu
SET store_id = s.id
FROM public.stores s
WHERE cu.organization_id = s.organization_id
  AND s.is_headquarters = true
  AND cu.store_id IS NULL;

-- Stock movements
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'stock_movements' AND column_name = 'store_id'
  ) THEN
    ALTER TABLE public.stock_movements ADD COLUMN store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL;
  END IF;
END $$;

UPDATE public.stock_movements sm
SET store_id = s.id
FROM public.stores s
WHERE sm.organization_id = s.organization_id
  AND s.is_headquarters = true
  AND sm.store_id IS NULL;

-- Suppliers (shared across stores — store_id stays NULL = org-level)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'suppliers' AND column_name = 'store_id'
  ) THEN
    ALTER TABLE public.suppliers ADD COLUMN store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Ajouter current_store_id à profiles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'current_store_id'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN current_store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL;
  END IF;
END $$;

UPDATE public.profiles p
SET current_store_id = s.id
FROM public.stores s
WHERE p.organization_id = s.organization_id
  AND s.is_headquarters = true
  AND p.current_store_id IS NULL;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_products_store_id ON public.products (store_id);
CREATE INDEX IF NOT EXISTS idx_sales_store_id ON public.sales (store_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_store_id ON public.sale_items (store_id);
CREATE INDEX IF NOT EXISTS idx_expenses_store_id ON public.expenses (store_id);
CREATE INDEX IF NOT EXISTS idx_categories_store_id ON public.categories (store_id);
CREATE INDEX IF NOT EXISTS idx_customers_store_id ON public.customers (store_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_store_id ON public.stock_movements (store_id);
CREATE INDEX IF NOT EXISTS idx_profiles_current_store_id ON public.profiles (current_store_id);
