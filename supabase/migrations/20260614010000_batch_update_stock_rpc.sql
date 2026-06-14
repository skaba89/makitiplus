-- Batch stock update RPC for POS sales.
-- Atomically decrements stock and records movements in a single transaction.
-- Prevents race conditions and avoids N+1 queries from the frontend.

CREATE OR REPLACE FUNCTION public.batch_update_stock(
  p_sale_id UUID,
  p_items JSONB  -- [{product_id: UUID, quantity: INT, previous_quantity: INT}]
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  item JSONB;
  new_qty INT;
BEGIN
  FOR item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    -- Decrement stock atomically with row lock
    UPDATE public.products
    SET stock_quantity = stock_quantity - (item->>'quantity')::INT
    WHERE id = (item->>'product_id')::UUID
    RETURNING stock_quantity INTO new_qty;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product % not found', item->>'product_id';
    END IF;

    IF new_qty < 0 THEN
      RAISE EXCEPTION 'Insufficient stock for product %', item->>'product_id';
    END IF;

    -- Record stock movement
    INSERT INTO public.stock_movements (user_id, product_id, type, quantity, previous_quantity, new_quantity, reference_id)
    VALUES (
      (SELECT user_id FROM public.sales WHERE id = p_sale_id),
      (item->>'product_id')::UUID,
      'sale',
      -(item->>'quantity')::INT,
      (item->>'previous_quantity')::INT,
      new_qty,
      p_sale_id
    );
  END LOOP;
END;
$$;
