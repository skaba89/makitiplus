-- ============================================================
-- Loyalty Program — Customer rewards & points system
-- ============================================================

-- ─── loyalty_accounts table ──────────────────────────────────
-- One per customer, tracks total points and tier level
CREATE TABLE IF NOT EXISTS public.loyalty_accounts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  customer_id     UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  points_balance  INTEGER NOT NULL DEFAULT 0,
  total_points_earned INTEGER NOT NULL DEFAULT 0,
  tier            TEXT NOT NULL DEFAULT 'bronze' CHECK (tier IN ('bronze', 'silver', 'gold', 'platinum')),
  joined_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, customer_id)
);

CREATE INDEX IF NOT EXISTS idx_la_org ON public.loyalty_accounts(organization_id);
CREATE INDEX IF NOT EXISTS idx_la_customer ON public.loyalty_accounts(customer_id);
CREATE INDEX IF NOT EXISTS idx_la_tier ON public.loyalty_accounts(tier);

-- ─── loyalty_transactions table ──────────────────────────────
-- Tracks every point movement (earn, redeem, expire, adjust)
CREATE TABLE IF NOT EXISTS public.loyalty_transactions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  account_id      UUID NOT NULL REFERENCES public.loyalty_accounts(id) ON DELETE CASCADE,
  customer_id     UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  type            TEXT NOT NULL CHECK (type IN ('earn', 'redeem', 'expire', 'adjust', 'bonus')),
  points          INTEGER NOT NULL,
  balance_after   INTEGER NOT NULL,
  description     TEXT,
  sale_id         UUID REFERENCES public.sales(id) ON DELETE SET NULL,
  created_by      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lt_org ON public.loyalty_transactions(organization_id);
CREATE INDEX IF NOT EXISTS idx_lt_account ON public.loyalty_transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_lt_customer ON public.loyalty_transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_lt_created_at ON public.loyalty_transactions(created_at DESC);

-- ─── loyalty_rewards table ───────────────────────────────────
-- Configurable rewards that customers can redeem
CREATE TABLE IF NOT EXISTS public.loyalty_rewards (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  description     TEXT,
  points_required INTEGER NOT NULL CHECK (points_required > 0),
  reward_type     TEXT NOT NULL DEFAULT 'discount' CHECK (reward_type IN ('discount', 'free_product', 'voucher', 'custom')),
  reward_value    NUMERIC(12,2) NOT NULL DEFAULT 0,
  product_id      UUID REFERENCES public.products(id) ON DELETE SET NULL,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  max_redemptions INTEGER,
  redemptions_count INTEGER NOT NULL DEFAULT 0,
  min_tier        TEXT DEFAULT 'bronze' CHECK (min_tier IN ('bronze', 'silver', 'gold', 'platinum')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lr_org ON public.loyalty_rewards(organization_id);
CREATE INDEX IF NOT EXISTS idx_lr_active ON public.loyalty_rewards(is_active);

-- ─── RLS Policies ────────────────────────────────────────────
ALTER TABLE public.loyalty_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_rewards ENABLE ROW LEVEL SECURITY;

-- loyalty_accounts
CREATE POLICY "la_select_org" ON public.loyalty_accounts
  FOR SELECT USING (
    organization_id IN (
      SELECT o.id FROM public.organizations o
      INNER JOIN public.profiles p ON p.organization_id = o.id
      WHERE p.id = auth.uid()
    )
  );
CREATE POLICY "la_insert_org" ON public.loyalty_accounts
  FOR INSERT WITH CHECK (
    organization_id = (SELECT p.organization_id FROM public.profiles p WHERE p.id = auth.uid())
  );
CREATE POLICY "la_update_org" ON public.loyalty_accounts
  FOR UPDATE USING (
    organization_id IN (
      SELECT o.id FROM public.organizations o
      INNER JOIN public.profiles p ON p.organization_id = o.id
      WHERE p.id = auth.uid()
    )
  );

-- loyalty_transactions
CREATE POLICY "lt_select_org" ON public.loyalty_transactions
  FOR SELECT USING (
    organization_id IN (
      SELECT o.id FROM public.organizations o
      INNER JOIN public.profiles p ON p.organization_id = o.id
      WHERE p.id = auth.uid()
    )
  );
CREATE POLICY "lt_insert_org" ON public.loyalty_transactions
  FOR INSERT WITH CHECK (
    organization_id = (SELECT p.organization_id FROM public.profiles p WHERE p.id = auth.uid())
  );

-- loyalty_rewards
CREATE POLICY "lr_select_org" ON public.loyalty_rewards
  FOR SELECT USING (
    organization_id IN (
      SELECT o.id FROM public.organizations o
      INNER JOIN public.profiles p ON p.organization_id = o.id
      WHERE p.id = auth.uid()
    )
  );
CREATE POLICY "lr_insert_org" ON public.loyalty_rewards
  FOR INSERT WITH CHECK (
    organization_id = (SELECT p.organization_id FROM public.profiles p WHERE p.id = auth.uid())
  );
CREATE POLICY "lr_update_org" ON public.loyalty_rewards
  FOR UPDATE USING (
    organization_id IN (
      SELECT o.id FROM public.organizations o
      INNER JOIN public.profiles p ON p.organization_id = o.id
      WHERE p.id = auth.uid()
    )
  );
CREATE POLICY "lr_delete_org" ON public.loyalty_rewards
  FOR DELETE USING (
    organization_id = (SELECT p.organization_id FROM public.profiles p WHERE p.id = auth.uid())
  );

-- ─── Trigger: auto-update updated_at ─────────────────────────
DROP TRIGGER IF EXISTS trg_la_updated_at ON public.loyalty_accounts;
CREATE TRIGGER trg_la_updated_at
  BEFORE UPDATE ON public.loyalty_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_stock_transfers_updated_at();

DROP TRIGGER IF EXISTS trg_lr_updated_at ON public.loyalty_rewards;
CREATE TRIGGER trg_lr_updated_at
  BEFORE UPDATE ON public.loyalty_rewards
  FOR EACH ROW EXECUTE FUNCTION public.update_stock_transfers_updated_at();

-- ─── RPC: earn_loyalty_points ────────────────────────────────
-- Earn points for a sale (1 point per X amount spent, configurable)
CREATE OR REPLACE FUNCTION public.earn_loyalty_points(
  p_customer_id UUID,
  p_sale_id UUID,
  p_amount_spent NUMERIC,
  p_points_rate NUMERIC DEFAULT 1
)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_org_id UUID;
  v_account_id UUID;
  v_points INTEGER;
  v_new_balance INTEGER;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Utilisateur non associé à une organisation';
  END IF;

  -- Calculate points (1 point per p_points_rate amount)
  v_points := FLOOR(p_amount_spent / GREATEST(p_points_rate, 1));
  IF v_points <= 0 THEN RETURN 0; END IF;

  -- Get or create loyalty account
  SELECT id, points_balance INTO v_account_id, v_new_balance
  FROM public.loyalty_accounts
  WHERE customer_id = p_customer_id AND organization_id = v_org_id;

  IF v_account_id IS NULL THEN
    INSERT INTO public.loyalty_accounts (organization_id, customer_id, points_balance, total_points_earned)
    VALUES (v_org_id, p_customer_id, v_points, v_points)
    RETURNING id, points_balance INTO v_account_id, v_new_balance;
  ELSE
    UPDATE public.loyalty_accounts
    SET points_balance = points_balance + v_points,
        total_points_earned = total_points_earned + v_points
    WHERE id = v_account_id
    RETURNING points_balance INTO v_new_balance;
  END IF;

  -- Record transaction
  INSERT INTO public.loyalty_transactions (
    organization_id, account_id, customer_id,
    type, points, balance_after, description, sale_id, created_by
  ) VALUES (
    v_org_id, v_account_id, p_customer_id,
    'earn', v_points, v_new_balance,
    'Points gagnés pour achat de ' || p_amount_spent,
    p_sale_id, auth.uid()
  );

  -- Auto-upgrade tier
  PERFORM public.update_loyalty_tier(v_account_id);

  RETURN v_points;
END;
$$;

-- ─── RPC: redeem_loyalty_points ──────────────────────────────
CREATE OR REPLACE FUNCTION public.redeem_loyalty_points(
  p_customer_id UUID,
  p_points INTEGER,
  p_reward_id UUID DEFAULT NULL,
  p_description TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_org_id UUID;
  v_account_id UUID;
  v_current_balance INTEGER;
  v_new_balance INTEGER;
BEGIN
  v_org_id := public.get_user_organization_id();

  -- Get account
  SELECT id, points_balance INTO v_account_id, v_current_balance
  FROM public.loyalty_accounts
  WHERE customer_id = p_customer_id AND organization_id = v_org_id;

  IF v_account_id IS NULL OR v_current_balance < p_points THEN
    RAISE EXCEPTION 'Points insuffisants (solde: %)', COALESCE(v_current_balance, 0);
  END IF;

  -- Deduct points
  UPDATE public.loyalty_accounts
  SET points_balance = points_balance - p_points
  WHERE id = v_account_id
  RETURNING points_balance INTO v_new_balance;

  -- Record transaction
  INSERT INTO public.loyalty_transactions (
    organization_id, account_id, customer_id,
    type, points, balance_after, description, created_by
  ) VALUES (
    v_org_id, v_account_id, p_customer_id,
    'redeem', -p_points, v_new_balance,
    COALESCE(p_description, 'Points échangés'),
    auth.uid()
  );

  -- Increment reward redemptions count
  IF p_reward_id IS NOT NULL THEN
    UPDATE public.loyalty_rewards
    SET redemptions_count = redemptions_count + 1
    WHERE id = p_reward_id;
  END IF;

  RETURN true;
END;
$$;

-- ─── RPC: update_loyalty_tier ────────────────────────────────
-- Auto-upgrade tier based on total points earned
CREATE OR REPLACE FUNCTION public.update_loyalty_tier(
  p_account_id UUID
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_total_earned INTEGER;
  v_new_tier TEXT;
BEGIN
  SELECT total_points_earned INTO v_total_earned
  FROM public.loyalty_accounts WHERE id = p_account_id;

  v_new_tier := CASE
    WHEN v_total_earned >= 10000 THEN 'platinum'
    WHEN v_total_earned >= 5000 THEN 'gold'
    WHEN v_total_earned >= 2000 THEN 'silver'
    ELSE 'bronze'
  END;

  UPDATE public.loyalty_accounts SET tier = v_new_tier WHERE id = p_account_id;
END;
$$;

-- ─── RPC: get_loyalty_stats ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_loyalty_stats()
RETURNS TABLE (
  total_members BIGINT,
  active_members_30d BIGINT,
  total_points_issued BIGINT,
  total_points_redeemed BIGINT,
  bronze_count BIGINT,
  silver_count BIGINT,
  gold_count BIGINT,
  platinum_count BIGINT
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  v_org_id := public.get_user_organization_id();

  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT,
    COUNT(*) FILTER (WHERE EXISTS (
      SELECT 1 FROM public.loyalty_transactions lt
      WHERE lt.account_id = la.id AND lt.created_at >= now() - INTERVAL '30 days'
    ))::BIGINT,
    COALESCE(SUM(lt_earn.points), 0)::BIGINT,
    COALESCE(ABS(SUM(lt_redeem.points)), 0)::BIGINT,
    COUNT(*) FILTER (WHERE la.tier = 'bronze')::BIGINT,
    COUNT(*) FILTER (WHERE la.tier = 'silver')::BIGINT,
    COUNT(*) FILTER (WHERE la.tier = 'gold')::BIGINT,
    COUNT(*) FILTER (WHERE la.tier = 'platinum')::BIGINT
  FROM public.loyalty_accounts la
  LEFT JOIN public.loyalty_transactions lt_earn ON lt_earn.account_id = la.id AND lt_earn.type = 'earn'
  LEFT JOIN public.loyalty_transactions lt_redeem ON lt_redeem.account_id = la.id AND lt_redeem.type = 'redeem'
  WHERE la.organization_id = v_org_id;
END;
$$;
