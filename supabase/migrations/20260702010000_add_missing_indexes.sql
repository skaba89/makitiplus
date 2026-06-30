-- ============================================================
-- INDEX MANQUANTS POUR LA PERFORMANCE
-- Ces index sont nécessaires pour les requêtes fréquentes
-- sur les grandes tables (2000+ produits, ventes multiples)
-- ============================================================

-- Index sur organizations.owner_user_id — utilisé dans les jointures Stores
CREATE INDEX IF NOT EXISTS idx_organizations_owner_user_id ON public.organizations(owner_user_id);

-- Index sur customers.phone — utilisé pour la recherche client lors des ventes (POS.tsx)
CREATE INDEX IF NOT EXISTS idx_customers_phone ON public.customers(phone);

-- Index sur expenses.expense_date — utilisé pour le filtrage par date dans les rapports
CREATE INDEX IF NOT EXISTS idx_expenses_expense_date ON public.expenses(expense_date);

-- Index sur sale_items.product_id — utilisé pour les requêtes top-produits dans les rapports
CREATE INDEX IF NOT EXISTS idx_sale_items_product_id ON public.sale_items(product_id);

-- Index composite sur sales(organization_id, created_at) — déjà partiellement couvert par idx_sales_organization_id
-- mais l'ordre composite est important pour les requêtes de dashboard filtrées par org + date
CREATE INDEX IF NOT EXISTS idx_sales_org_created_at ON public.sales(organization_id, created_at DESC);

-- Index composite sur products(organization_id, is_active) — pour les requêtes de produits actifs par magasin
CREATE INDEX IF NOT EXISTS idx_products_org_active ON public.products(organization_id, is_active);
