-- ============================================================
-- Fix: generate_sale_number — handle integer overflow + GRANT to authenticated
-- ============================================================
-- Problem: CAST(SUBSTRING(...) AS integer) fails when sale_number
-- contains timestamps > 2.1 billion (e.g. VNT-1782805735456)
-- Solution: Use BIGINT instead, and also GRANT EXECUTE to authenticated

CREATE OR REPLACE FUNCTION public.generate_sale_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_num bigint;
  org_id uuid;
  prefix text;
BEGIN
  -- Try to get org_id, but don't fail if function is not available
  BEGIN
    org_id := public.get_user_organization_id();
  EXCEPTION WHEN OTHERS THEN
    org_id := NULL;
  END;

  prefix := 'VTE-';

  IF org_id IS NOT NULL THEN
    SELECT COALESCE(MAX(CAST(SUBSTRING(sale_number FROM '[0-9]+$') AS bigint)), 0) + 1
      INTO next_num
      FROM public.sales
      WHERE organization_id = org_id;
  ELSE
    SELECT COALESCE(MAX(CAST(SUBSTRING(sale_number FROM '[0-9]+$') AS bigint)), 0) + 1
      INTO next_num
      FROM public.sales;
  END IF;

  RETURN prefix || LPAD(next_num::text, 6, '0');
END;
$$;

-- Grant execute to authenticated users (was only service_role before)
GRANT EXECUTE ON FUNCTION public.generate_sale_number() TO authenticated, service_role;
