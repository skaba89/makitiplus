CREATE OR REPLACE FUNCTION public.resolve_stock_conflict(
  previous_qty integer,
  local_new_qty integer,
  remote_new_qty integer
)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT GREATEST(0, remote_new_qty + (local_new_qty - previous_qty));
$$;