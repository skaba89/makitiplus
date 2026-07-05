-- ============================================================
-- Stock Transfers — Multi-store stock transfer system
-- Allows transferring products between stores within an organization
-- ============================================================

-- ─── Enum for transfer status ────────────────────────────────
DO $$ BEGIN
  CREATE TYPE public.transfer_status AS ENUM (
    'draft',
    'pending',
    'in_transit',
    'received',
    'partial',
    'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── stock_transfers table ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.stock_transfers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  transfer_number TEXT NOT NULL,
  from_store_id   UUID NOT NULL REFERENCES public.stores(id) ON DELETE SET NULL,
  to_store_id     UUID NOT NULL REFERENCES public.stores(id) ON DELETE SET NULL,
  status          public.transfer_status NOT NULL DEFAULT 'draft',
  notes           TEXT,
  sent_at         TIMESTAMPTZ,
  received_at     TIMESTAMPTZ,
  created_by      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  received_by     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT st_from_to_different CHECK (from_store_id <> to_store_id),
  CONSTRAINT st_transfer_number_format CHECK (transfer_number ~ '^TRF-')
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_stock_transfers_org ON public.stock_transfers(organization_id);
CREATE INDEX IF NOT EXISTS idx_stock_transfers_from_store ON public.stock_transfers(from_store_id);
CREATE INDEX IF NOT EXISTS idx_stock_transfers_to_store ON public.stock_transfers(to_store_id);
CREATE INDEX IF NOT EXISTS idx_stock_transfers_status ON public.stock_transfers(status);
CREATE INDEX IF NOT EXISTS idx_stock_transfers_created_at ON public.stock_transfers(created_at DESC);

-- Unique transfer number per org
CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_transfers_number ON public.stock_transfers(organization_id, transfer_number);

-- ─── stock_transfer_items table ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.stock_transfer_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id     UUID NOT NULL REFERENCES public.stock_transfers(id) ON DELETE CASCADE,
  product_id      UUID REFERENCES public.products(id) ON DELETE SET NULL,
  product_name    TEXT NOT NULL,
  quantity        INTEGER NOT NULL CHECK (quantity > 0),
  quantity_received INTEGER NOT NULL DEFAULT 0 CHECK (quantity_received >= 0),
  unit_cost       NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sti_transfer ON public.stock_transfer_items(transfer_id);
CREATE INDEX IF NOT EXISTS idx_sti_product ON public.stock_transfer_items(product_id);

-- ─── RLS Policies ────────────────────────────────────────────
ALTER TABLE public.stock_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_transfer_items ENABLE ROW LEVEL SECURITY;

-- stock_transfers: users can only see transfers in their organization
CREATE POLICY "st_select_org" ON public.stock_transfers
  FOR SELECT USING (
    organization_id IN (
      SELECT o.id FROM public.organizations o
      INNER JOIN public.profiles p ON p.organization_id = o.id
      WHERE p.id = auth.uid()
    )
  );

CREATE POLICY "st_insert_org" ON public.stock_transfers
  FOR INSERT WITH CHECK (
    organization_id = (
      SELECT p.organization_id FROM public.profiles p WHERE p.id = auth.uid()
    )
    AND from_store_id IN (
      SELECT s.id FROM public.stores s WHERE s.organization_id = (
        SELECT p.organization_id FROM public.profiles p WHERE p.id = auth.uid()
      )
    )
  );

CREATE POLICY "st_update_org" ON public.stock_transfers
  FOR UPDATE USING (
    organization_id IN (
      SELECT o.id FROM public.organizations o
      INNER JOIN public.profiles p ON p.organization_id = o.id
      WHERE p.id = auth.uid()
    )
  );

CREATE POLICY "st_delete_org" ON public.stock_transfers
  FOR DELETE USING (
    organization_id IN (
      SELECT o.id FROM public.organizations o
      INNER JOIN public.profiles p ON p.organization_id = o.id
      WHERE p.id = auth.uid()
    )
    AND status = 'draft'
  );

-- stock_transfer_items: same org scoping via parent transfer
CREATE POLICY "sti_select_org" ON public.stock_transfer_items
  FOR SELECT USING (
    transfer_id IN (
      SELECT id FROM public.stock_transfers
      WHERE organization_id IN (
        SELECT o.id FROM public.organizations o
        INNER JOIN public.profiles p ON p.organization_id = o.id
        WHERE p.id = auth.uid()
      )
    )
  );

CREATE POLICY "sti_insert_org" ON public.stock_transfer_items
  FOR INSERT WITH CHECK (
    transfer_id IN (
      SELECT id FROM public.stock_transfers
      WHERE organization_id = (
        SELECT p.organization_id FROM public.profiles p WHERE p.id = auth.uid()
      )
      AND status = 'draft'
    )
  );

CREATE POLICY "sti_update_org" ON public.stock_transfer_items
  FOR UPDATE USING (
    transfer_id IN (
      SELECT id FROM public.stock_transfers
      WHERE organization_id IN (
        SELECT o.id FROM public.organizations o
        INNER JOIN public.profiles p ON p.organization_id = o.id
        WHERE p.id = auth.uid()
      )
    )
  );

CREATE POLICY "sti_delete_org" ON public.stock_transfer_items
  FOR DELETE USING (
    transfer_id IN (
      SELECT id FROM public.stock_transfers
      WHERE organization_id = (
        SELECT p.organization_id FROM public.profiles p WHERE p.id = auth.uid()
      )
      AND status = 'draft'
    )
  );

-- ─── Helper: get user's organization_id ──────────────────────
CREATE OR REPLACE FUNCTION public.get_user_organization_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT organization_id FROM public.profiles WHERE id = auth.uid();
$$;

-- ─── RPC: generate_transfer_number ───────────────────────────
CREATE OR REPLACE FUNCTION public.generate_transfer_number()
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_org_id UUID;
  v_count INTEGER;
  v_number TEXT;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Utilisateur non associé à une organisation';
  END IF;

  SELECT COALESCE(MAX(CAST(SUBSTRING(transfer_number FROM 5) AS INTEGER)), 0) + 1
  INTO v_count
  FROM public.stock_transfers
  WHERE organization_id = v_org_id;

  v_number := 'TRF-' || LPAD(v_count::TEXT, 6, '0');
  RETURN v_number;
END;
$$;

-- ─── RPC: create_stock_transfer ──────────────────────────────
-- Creates a draft transfer with items
CREATE OR REPLACE FUNCTION public.create_stock_transfer(
  p_from_store_id UUID,
  p_to_store_id UUID,
  p_items JSONB,
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_org_id UUID;
  v_transfer_id UUID;
  v_transfer_number TEXT;
  v_item JSONB;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Utilisateur non associé à une organisation';
  END IF;

  -- Verify both stores belong to the same organization
  IF NOT EXISTS (
    SELECT 1 FROM public.stores WHERE id = p_from_store_id AND organization_id = v_org_id
  ) THEN
    RAISE EXCEPTION 'Boutique source invalide';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.stores WHERE id = p_to_store_id AND organization_id = v_org_id
  ) THEN
    RAISE EXCEPTION 'Boutique destination invalide';
  END IF;

  -- Generate transfer number
  v_transfer_number := public.generate_transfer_number();

  -- Create transfer
  INSERT INTO public.stock_transfers (
    organization_id, transfer_number, from_store_id, to_store_id,
    status, notes, created_by
  ) VALUES (
    v_org_id, v_transfer_number, p_from_store_id, p_to_store_id,
    'draft', p_notes, auth.uid()
  ) RETURNING id INTO v_transfer_id;

  -- Insert items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO public.stock_transfer_items (
      transfer_id, product_id, product_name, quantity, unit_cost, notes
    ) VALUES (
      v_transfer_id,
      (v_item->>'product_id')::UUID,
      v_item->>'product_name',
      (v_item->>'quantity')::INTEGER,
      COALESCE((v_item->>'unit_cost')::NUMERIC, 0),
      v_item->>'notes'
    );
  END LOOP;

  RETURN v_transfer_id;
END;
$$;

-- ─── RPC: send_stock_transfer ────────────────────────────────
-- Changes status from draft to pending, deducts stock from source store
CREATE OR REPLACE FUNCTION public.send_stock_transfer(
  p_transfer_id UUID
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_org_id UUID;
  v_from_store_id UUID;
  v_item RECORD;
  v_current_stock INTEGER;
BEGIN
  v_org_id := public.get_user_organization_id();

  -- Verify transfer belongs to user's org and is in draft status
  SELECT from_store_id INTO v_from_store_id
  FROM public.stock_transfers
  WHERE id = p_transfer_id
    AND organization_id = v_org_id
    AND status = 'draft';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transfert introuvable ou statut invalide';
  END IF;

  -- Verify sufficient stock for each item and deduct from source
  FOR v_item IN
    SELECT sti.product_id, sti.quantity, sti.product_name
    FROM public.stock_transfer_items sti
    WHERE sti.transfer_id = p_transfer_id
  LOOP
    -- Get current stock in source store
    SELECT stock_quantity INTO v_current_stock
    FROM public.products
    WHERE id = v_item.product_id AND store_id = v_from_store_id;

    IF v_current_stock IS NULL OR v_current_stock < v_item.quantity THEN
      RAISE EXCEPTION 'Stock insuffisant pour "%": disponible %, demandé %',
        v_item.product_name, COALESCE(v_current_stock, 0), v_item.quantity;
    END IF;

    -- Deduct from source store
    UPDATE public.products
    SET stock_quantity = stock_quantity - v_item.quantity,
        updated_at = now()
    WHERE id = v_item.product_id AND store_id = v_from_store_id;
  END LOOP;

  -- Update transfer status
  UPDATE public.stock_transfers
  SET status = 'pending',
      sent_at = now(),
      updated_at = now()
  WHERE id = p_transfer_id;
END;
$$;

-- ─── RPC: receive_stock_transfer ─────────────────────────────
-- Marks transfer as received and adds stock to destination store
CREATE OR REPLACE FUNCTION public.receive_stock_transfer(
  p_transfer_id UUID,
  p_received_items JSONB DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_org_id UUID;
  v_to_store_id UUID;
  v_from_store_id UUID;
  v_item JSONB;
  v_product_id UUID;
  v_qty_received INTEGER;
  v_existing_product_id UUID;
  v_total_items INTEGER;
  v_total_received INTEGER;
BEGIN
  v_org_id := public.get_user_organization_id();

  -- Verify transfer belongs to user's org and is in pending/in_transit status
  SELECT to_store_id, from_store_id
  INTO v_to_store_id, v_from_store_id
  FROM public.stock_transfers
  WHERE id = p_transfer_id
    AND organization_id = v_org_id
    AND status IN ('pending', 'in_transit');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transfert introuvable ou statut invalide (doit être en attente ou en transit)';
  END IF;

  -- Process received items (if provided, otherwise receive all)
  IF p_received_items IS NOT NULL THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_received_items)
    LOOP
      v_product_id := (v_item->>'product_id')::UUID;
      v_qty_received := (v_item->>'quantity_received')::INTEGER;

      -- Update transfer item received quantity
      UPDATE public.stock_transfer_items
      SET quantity_received = v_qty_received
      WHERE transfer_id = p_transfer_id AND product_id = v_product_id;

      -- Check if product exists in destination store
      SELECT id INTO v_existing_product_id
      FROM public.products
      WHERE id = v_product_id AND store_id = v_to_store_id;

      IF v_existing_product_id IS NOT NULL THEN
        -- Add to existing stock in destination
        UPDATE public.products
        SET stock_quantity = stock_quantity + v_qty_received,
            updated_at = now()
        WHERE id = v_product_id AND store_id = v_to_store_id;
      ELSE
        -- Product doesn't exist in destination store - copy from source store
        INSERT INTO public.products (
          name, description, barcode, price, cost_price, stock_quantity,
          min_stock_alert, unit, category_id, organization_id, store_id,
          supplier_id, is_active, image_url
        )
        SELECT
          name, description, barcode, price, cost_price, v_qty_received,
          min_stock_alert, unit, category_id, organization_id, v_to_store_id,
          supplier_id, is_active, image_url
        FROM public.products
        WHERE id = v_product_id AND store_id = v_from_store_id
        ON CONFLICT DO NOTHING;
      END IF;
    END LOOP;
  ELSE
    -- Receive all items fully
    FOR v_item IN
      SELECT sti.product_id, sti.quantity
      FROM public.stock_transfer_items sti
      WHERE sti.transfer_id = p_transfer_id
    LOOP
      -- Update received quantity = ordered quantity
      UPDATE public.stock_transfer_items
      SET quantity_received = v_item.quantity
      WHERE transfer_id = p_transfer_id AND product_id = v_item.product_id;

      -- Check if product exists in destination store
      SELECT id INTO v_existing_product_id
      FROM public.products
      WHERE id = v_item.product_id AND store_id = v_to_store_id;

      IF v_existing_product_id IS NOT NULL THEN
        UPDATE public.products
        SET stock_quantity = stock_quantity + v_item.quantity,
            updated_at = now()
        WHERE id = v_item.product_id AND store_id = v_to_store_id;
      ELSE
        INSERT INTO public.products (
          name, description, barcode, price, cost_price, stock_quantity,
          min_stock_alert, unit, category_id, organization_id, store_id,
          supplier_id, is_active, image_url
        )
        SELECT
          name, description, barcode, price, cost_price, v_item.quantity,
          min_stock_alert, unit, category_id, organization_id, v_to_store_id,
          supplier_id, is_active, image_url
        FROM public.products
        WHERE id = v_item.product_id AND store_id = v_from_store_id
        ON CONFLICT DO NOTHING;
      END IF;
    END LOOP;
  END IF;

  -- Determine final status: partial or full
  SELECT COUNT(*), COUNT(*) FILTER (WHERE quantity_received < quantity)
  INTO v_total_items, v_total_received
  FROM public.stock_transfer_items
  WHERE transfer_id = p_transfer_id;

  -- Update transfer
  UPDATE public.stock_transfers
  SET status = CASE
      WHEN v_total_received > 0 THEN 'partial'
      ELSE 'received'
    END,
    received_at = now(),
    received_by = auth.uid(),
    updated_at = now()
  WHERE id = p_transfer_id;
END;
$$;

-- ─── RPC: cancel_stock_transfer ──────────────────────────────
-- Cancels a pending transfer and returns stock to source store
CREATE OR REPLACE FUNCTION public.cancel_stock_transfer(
  p_transfer_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_org_id UUID;
  v_from_store_id UUID;
  v_item RECORD;
BEGIN
  v_org_id := public.get_user_organization_id();

  -- Verify transfer belongs to user's org and is in pending/in_transit status
  SELECT from_store_id INTO v_from_store_id
  FROM public.stock_transfers
  WHERE id = p_transfer_id
    AND organization_id = v_org_id
    AND status IN ('pending', 'in_transit', 'draft');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transfert introuvable ou ne peut pas être annulé';
  END IF;

  -- Return stock to source if transfer was already sent (not draft)
  IF EXISTS (
    SELECT 1 FROM public.stock_transfers
    WHERE id = p_transfer_id AND status IN ('pending', 'in_transit')
  ) THEN
    FOR v_item IN
      SELECT sti.product_id, sti.quantity - sti.quantity_received AS qty_to_return
      FROM public.stock_transfer_items sti
      WHERE sti.transfer_id = p_transfer_id
    LOOP
      IF v_item.qty_to_return > 0 THEN
        UPDATE public.products
        SET stock_quantity = stock_quantity + v_item.qty_to_return,
            updated_at = now()
        WHERE id = v_item.product_id AND store_id = v_from_store_id;
      END IF;
    END LOOP;
  END IF;

  -- Update status
  UPDATE public.stock_transfers
  SET status = 'cancelled',
      notes = COALESCE(notes, '') || CASE WHEN p_reason IS NOT NULL THEN E'\nAnnulé: ' || p_reason ELSE '' END,
      updated_at = now()
  WHERE id = p_transfer_id;
END;
$$;

-- ─── RPC: get_stock_transfers ────────────────────────────────
-- Lists transfers for the current organization with optional filters
CREATE OR REPLACE FUNCTION public.get_stock_transfers(
  p_status public.transfer_status DEFAULT NULL,
  p_store_id UUID DEFAULT NULL,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  transfer_number TEXT,
  from_store_id UUID,
  from_store_name TEXT,
  to_store_id UUID,
  to_store_name TEXT,
  status public.transfer_status,
  notes TEXT,
  sent_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ,
  created_by UUID,
  created_by_name TEXT,
  received_by UUID,
  received_by_name TEXT,
  item_count BIGINT,
  total_quantity BIGINT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  v_org_id := public.get_user_organization_id();

  RETURN QUERY
  SELECT
    st.id,
    st.transfer_number,
    st.from_store_id,
    fs.name AS from_store_name,
    st.to_store_id,
    ts.name AS to_store_name,
    st.status,
    st.notes,
    st.sent_at,
    st.received_at,
    st.created_by,
    cb.owner_name AS created_by_name,
    st.received_by,
    rb.owner_name AS received_by_name,
    COUNT(sti.id)::BIGINT AS item_count,
    COALESCE(SUM(sti.quantity), 0)::BIGINT AS total_quantity,
    st.created_at,
    st.updated_at
  FROM public.stock_transfers st
  INNER JOIN public.stores fs ON fs.id = st.from_store_id
  INNER JOIN public.stores ts ON ts.id = st.to_store_id
  LEFT JOIN public.profiles cb ON cb.id = st.created_by
  LEFT JOIN public.profiles rb ON rb.id = st.received_by
  LEFT JOIN public.stock_transfer_items sti ON sti.transfer_id = st.id
  WHERE st.organization_id = v_org_id
    AND (p_status IS NULL OR st.status = p_status)
    AND (p_store_id IS NULL OR st.from_store_id = p_store_id OR st.to_store_id = p_store_id)
  GROUP BY st.id, fs.name, ts.name, cb.owner_name, rb.owner_name
  ORDER BY st.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- ─── RPC: get_stock_transfer_details ─────────────────────────
-- Gets a single transfer with its items
CREATE OR REPLACE FUNCTION public.get_stock_transfer_details(
  p_transfer_id UUID
)
RETURNS TABLE (
  id UUID,
  transfer_number TEXT,
  from_store_id UUID,
  from_store_name TEXT,
  to_store_id UUID,
  to_store_name TEXT,
  status public.transfer_status,
  notes TEXT,
  sent_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ,
  created_by UUID,
  created_by_name TEXT,
  received_by UUID,
  received_by_name TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  items JSONB
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  v_org_id := public.get_user_organization_id();

  RETURN QUERY
  SELECT
    st.id,
    st.transfer_number,
    st.from_store_id,
    fs.name AS from_store_name,
    st.to_store_id,
    ts.name AS to_store_name,
    st.status,
    st.notes,
    st.sent_at,
    st.received_at,
    st.created_by,
    cb.owner_name AS created_by_name,
    st.received_by,
    rb.owner_name AS received_by_name,
    st.created_at,
    st.updated_at,
    (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'id', sti.id,
          'product_id', sti.product_id,
          'product_name', sti.product_name,
          'quantity', sti.quantity,
          'quantity_received', sti.quantity_received,
          'unit_cost', sti.unit_cost,
          'notes', sti.notes,
          'current_stock_source', (
            SELECT p.stock_quantity FROM public.products p
            WHERE p.id = sti.product_id AND p.store_id = st.from_store_id
          )
        )
        ORDER BY sti.created_at
      ), '[]'::JSONB)
      FROM public.stock_transfer_items sti
      WHERE sti.transfer_id = st.id
    ) AS items
  FROM public.stock_transfers st
  INNER JOIN public.stores fs ON fs.id = st.from_store_id
  INNER JOIN public.stores ts ON ts.id = st.to_store_id
  LEFT JOIN public.profiles cb ON cb.id = st.created_by
  LEFT JOIN public.profiles rb ON rb.id = st.received_by
  WHERE st.id = p_transfer_id AND st.organization_id = v_org_id;
END;
$$;

-- ─── RPC: get_pending_transfers_count ────────────────────────
-- Counts pending transfers for the current store (used in dashboard alerts)
CREATE OR REPLACE FUNCTION public.get_pending_transfers_count(
  p_store_id UUID DEFAULT NULL
)
RETURNS TABLE (
  pending_count BIGINT,
  in_transit_count BIGINT
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  v_org_id := public.get_user_organization_id();

  RETURN QUERY
  SELECT
    COUNT(*) FILTER (WHERE st.status = 'pending'
      AND (p_store_id IS NULL OR st.to_store_id = p_store_id))::BIGINT,
    COUNT(*) FILTER (WHERE st.status = 'in_transit'
      AND (p_store_id IS NULL OR st.to_store_id = p_store_id))::BIGINT
  FROM public.stock_transfers st
  WHERE st.organization_id = v_org_id;
END;
$$;

-- ─── Trigger: auto-update updated_at ─────────────────────────
CREATE OR REPLACE FUNCTION public.update_stock_transfers_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_st_updated_at ON public.stock_transfers;
CREATE TRIGGER trg_st_updated_at
  BEFORE UPDATE ON public.stock_transfers
  FOR EACH ROW EXECUTE FUNCTION public.update_stock_transfers_updated_at();
