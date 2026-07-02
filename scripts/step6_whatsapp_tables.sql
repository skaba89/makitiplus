-- ════════════════════════════════════════════════════════════════════════════
-- Step 6: WhatsApp Business API Integration Tables
-- ════════════════════════════════════════════════════════════════════════════
-- Creates:
--   1. whatsapp_config — per-org WhatsApp Business API credentials
--   2. whatsapp_message_logs — audit trail of sent messages
--   3. whatsapp_templates — reusable message templates
--   4. RLS policies for all tables
--   5. RPCs: save_whatsapp_config, get_whatsapp_config, log_whatsapp_message
--
-- IMPORTANT: Run AFTER step1-5 have been executed successfully.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. WhatsApp Config Table ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.whatsapp_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  phone_number_id TEXT NOT NULL,              -- Meta Phone Number ID
  business_account_id TEXT NOT NULL,           -- Meta Business Account ID
  access_token TEXT NOT NULL,                  -- Meta Permanent Access Token
  whatsapp_phone TEXT,                         -- Display phone number (e.g. +224 622 00 00)
  verify_token TEXT,                           -- Webhook verify token
  auto_send_receipt BOOLEAN DEFAULT false,     -- Auto-send receipt after sale
  auto_send_message TEXT,                      -- Custom message template for auto-send
  is_active BOOLEAN DEFAULT true,
  daily_limit INTEGER DEFAULT 1000,            -- Max messages per day
  daily_count INTEGER DEFAULT 0,               -- Sent today counter
  daily_count_date DATE,                       -- Date of current daily_count
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT one_config_per_org UNIQUE (organization_id)
);

-- Index
CREATE INDEX IF NOT EXISTS idx_whatsapp_config_org ON public.whatsapp_config(organization_id);

-- ─── 2. WhatsApp Message Logs ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.whatsapp_message_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
  sale_id UUID,                                -- Optional link to sale
  customer_id UUID,                            -- Optional link to customer
  phone_number TEXT NOT NULL,                   -- Recipient phone
  message_type TEXT NOT NULL DEFAULT 'receipt', -- receipt | custom | template
  message_content TEXT,                         -- Full message text sent
  template_name TEXT,                           -- WhatsApp template name if used
  status TEXT NOT NULL DEFAULT 'pending',       -- pending | sent | delivered | read | failed
  whatsapp_message_id TEXT,                     -- Meta message ID for tracking
  error_message TEXT,                           -- Error details if failed
  attempts INTEGER DEFAULT 0,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_whatsapp_logs_org ON public.whatsapp_message_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_logs_sale ON public.whatsapp_message_logs(sale_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_logs_customer ON public.whatsapp_message_logs(customer_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_logs_status ON public.whatsapp_message_logs(status);
CREATE INDEX IF NOT EXISTS idx_whatsapp_logs_created ON public.whatsapp_message_logs(created_at DESC);

-- ─── 3. WhatsApp Templates ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.whatsapp_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                           -- Template name
  category TEXT NOT NULL DEFAULT 'UTILITY',     -- UTILITY | MARKETING | AUTHENTICATION
  language TEXT NOT NULL DEFAULT 'fr',          -- Language code
  header_text TEXT,                             -- Template header
  body_text TEXT NOT NULL,                      -- Body with {{1}} variables
  footer_text TEXT,                             -- Template footer
  is_active BOOLEAN DEFAULT true,
  meta_template_name TEXT,                      -- Name registered on Meta
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT unique_template_per_org UNIQUE (organization_id, name)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_templates_org ON public.whatsapp_templates(organization_id);

-- ─── 4. RLS Policies ─────────────────────────────────────────────────────

ALTER TABLE public.whatsapp_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_message_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY;

-- whatsapp_config: org members can read, admins can manage
CREATE POLICY "Org members can read whatsapp_config"
  ON public.whatsapp_config FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT p.organization_id FROM public.profiles p WHERE p.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can insert whatsapp_config"
  ON public.whatsapp_config FOR INSERT
  TO authenticated
  WITH CHECK (
    organization_id IN (
      SELECT p.organization_id FROM public.profiles p
      INNER JOIN public.user_roles ur ON ur.user_id = p.user_id
      WHERE p.user_id = auth.uid() AND ur.role IN ('admin', 'super_admin', 'manager')
    )
  );

CREATE POLICY "Admins can update whatsapp_config"
  ON public.whatsapp_config FOR UPDATE
  TO authenticated
  USING (
    organization_id IN (
      SELECT p.organization_id FROM public.profiles p
      INNER JOIN public.user_roles ur ON ur.user_id = p.user_id
      WHERE p.user_id = auth.uid() AND ur.role IN ('admin', 'super_admin', 'manager')
    )
  );

CREATE POLICY "Admins can delete whatsapp_config"
  ON public.whatsapp_config FOR DELETE
  TO authenticated
  USING (
    organization_id IN (
      SELECT p.organization_id FROM public.profiles p
      INNER JOIN public.user_roles ur ON ur.user_id = p.user_id
      WHERE p.user_id = auth.uid() AND ur.role IN ('super_admin')
    )
  );

-- whatsapp_message_logs: org members can read, system inserts
CREATE POLICY "Org members can read whatsapp_logs"
  ON public.whatsapp_message_logs FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT p.organization_id FROM public.profiles p WHERE p.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can insert whatsapp_logs"
  ON public.whatsapp_message_logs FOR INSERT
  TO authenticated
  WITH CHECK (
    organization_id IN (
      SELECT p.organization_id FROM public.profiles p
      INNER JOIN public.user_roles ur ON ur.user_id = p.user_id
      WHERE p.user_id = auth.uid() AND ur.role IN ('admin', 'super_admin', 'manager', 'vendeur')
    )
  );

CREATE POLICY "Admins can update whatsapp_logs"
  ON public.whatsapp_message_logs FOR UPDATE
  TO authenticated
  USING (
    organization_id IN (
      SELECT p.organization_id FROM public.profiles p
      INNER JOIN public.user_roles ur ON ur.user_id = p.user_id
      WHERE p.user_id = auth.uid() AND ur.role IN ('admin', 'super_admin', 'manager')
    )
  );

-- whatsapp_templates: org members can read, admins can manage
CREATE POLICY "Org members can read whatsapp_templates"
  ON public.whatsapp_templates FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT p.organization_id FROM public.profiles p WHERE p.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can manage whatsapp_templates"
  ON public.whatsapp_templates FOR ALL
  TO authenticated
  USING (
    organization_id IN (
      SELECT p.organization_id FROM public.profiles p
      INNER JOIN public.user_roles ur ON ur.user_id = p.user_id
      WHERE p.user_id = auth.uid() AND ur.role IN ('admin', 'super_admin', 'manager')
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT p.organization_id FROM public.profiles p
      INNER JOIN public.user_roles ur ON ur.user_id = p.user_id
      WHERE p.user_id = auth.uid() AND ur.role IN ('admin', 'super_admin', 'manager')
    )
  );


-- ─── 5. Seed Default Templates ───────────────────────────────────────────
INSERT INTO public.whatsapp_templates (organization_id, name, category, language, header_text, body_text, footer_text)
SELECT
  o.id,
  'receipt',
  'UTILITY',
  'fr',
  '🧾 Reçu de paiement',
  'Merci pour votre achat chez {{1}} !\n\nReçu N° {{2}}\nMontant : {{3}}\nDate : {{4}}\n\nNous espérons vous revoir bientôt !',
  'Powered by MakitiPlus'
FROM public.organizations o
ON CONFLICT (organization_id, name) DO NOTHING;

INSERT INTO public.whatsapp_templates (organization_id, name, category, language, header_text, body_text, footer_text)
SELECT
  o.id,
  'thank_you',
  'MARKETING',
  'fr',
  '🙏 Merci !',
  'Bonjour {{1}}, merci pour votre visite chez {{2}} ! Votre satisfaction est notre priorité.\nN''hésitez pas à nous contacter au {{3}}.',
  'Powered by MakitiPlus'
FROM public.organizations o
ON CONFLICT (organization_id, name) DO NOTHING;

INSERT INTO public.whatsapp_templates (organization_id, name, category, language, header_text, body_text, footer_text)
SELECT
  o.id,
  'credit_reminder',
  'UTILITY',
  'fr',
  '💰 Rappel de crédit',
  'Bonjour {{1}}, un rappel amical : votre crédit restant chez {{2}} est de {{3}}. Merci de régler votre solde à votre convenance.',
  'Powered by MakitiPlus'
FROM public.organizations o
ON CONFLICT (organization_id, name) DO NOTHING;


-- ─── 6. RPC: get_whatsapp_config ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_whatsapp_config()
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  result JSONB;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL THEN RETURN NULL; END IF;

  SELECT jsonb_build_object(
    'id', wc.id,
    'phone_number_id', wc.phone_number_id,
    'business_account_id', wc.business_account_id,
    'access_token', LEFT(wc.access_token, 8) || '***',  -- Never expose full token
    'whatsapp_phone', wc.whatsapp_phone,
    'auto_send_receipt', wc.auto_send_receipt,
    'auto_send_message', wc.auto_send_message,
    'is_active', wc.is_active,
    'daily_limit', wc.daily_limit,
    'daily_count', wc.daily_count,
    'daily_count_date', wc.daily_count_date
  ) INTO result
  FROM whatsapp_config wc
  WHERE wc.organization_id = v_org_id AND wc.is_active;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_whatsapp_config() TO authenticated;


-- ─── 7. RPC: save_whatsapp_config ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.save_whatsapp_config(
  p_phone_number_id TEXT,
  p_business_account_id TEXT,
  p_access_token TEXT,
  p_whatsapp_phone TEXT DEFAULT NULL,
  p_auto_send_receipt BOOLEAN DEFAULT false,
  p_auto_send_message TEXT DEFAULT NULL,
  p_daily_limit INTEGER DEFAULT 1000
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_config_id UUID;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organization not found';
  END IF;

  -- Verify admin/manager role
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    INNER JOIN public.user_roles ur ON ur.user_id = p.user_id
    WHERE p.user_id = auth.uid() AND p.organization_id = v_org_id
    AND ur.role IN ('admin', 'super_admin', 'manager')
  ) THEN
    RAISE EXCEPTION 'Access denied: admin or manager role required';
  END IF;

  INSERT INTO public.whatsapp_config (
    organization_id, phone_number_id, business_account_id, access_token,
    whatsapp_phone, auto_send_receipt, auto_send_message, daily_limit
  ) VALUES (
    v_org_id, p_phone_number_id, p_business_account_id, p_access_token,
    p_whatsapp_phone, p_auto_send_receipt, p_auto_send_message, p_daily_limit
  )
  ON CONFLICT (organization_id) DO UPDATE SET
    phone_number_id = EXCLUDED.phone_number_id,
    business_account_id = EXCLUDED.business_account_id,
    access_token = CASE
      WHEN EXCLUDED.access_token LIKE '%***' THEN whatsapp_config.access_token  -- Keep old token if masked
      ELSE EXCLUDED.access_token
    END,
    whatsapp_phone = EXCLUDED.whatsapp_phone,
    auto_send_receipt = EXCLUDED.auto_send_receipt,
    auto_send_message = EXCLUDED.auto_send_message,
    daily_limit = EXCLUDED.daily_limit,
    is_active = true,
    updated_at = now()
  RETURNING id INTO v_config_id;

  RETURN v_config_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_whatsapp_config(TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT, INTEGER) TO authenticated;


-- ─── 8. RPC: log_whatsapp_message ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.log_whatsapp_message(
  p_phone_number TEXT,
  p_message_type TEXT DEFAULT 'receipt',
  p_message_content TEXT DEFAULT NULL,
  p_template_name TEXT DEFAULT NULL,
  p_sale_id UUID DEFAULT NULL,
  p_customer_id UUID DEFAULT NULL,
  p_store_id UUID DEFAULT NULL,
  p_status TEXT DEFAULT 'pending',
  p_whatsapp_message_id TEXT DEFAULT NULL,
  p_error_message TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_log_id UUID;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organization not found';
  END IF;

  -- Update daily counter
  UPDATE public.whatsapp_config
  SET daily_count = CASE
      WHEN daily_count_date = current_date THEN daily_count + 1
      ELSE 1
    END,
    daily_count_date = current_date
  WHERE organization_id = v_org_id AND is_active;

  INSERT INTO public.whatsapp_message_logs (
    organization_id, store_id, sale_id, customer_id,
    phone_number, message_type, message_content, template_name,
    status, whatsapp_message_id, error_message, sent_at
  ) VALUES (
    v_org_id, p_store_id, p_sale_id, p_customer_id,
    p_phone_number, p_message_type, p_message_content, p_template_name,
    p_status, p_whatsapp_message_id, p_error_message,
    CASE WHEN p_status IN ('sent', 'delivered') THEN now() ELSE NULL END
  )
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_whatsapp_message(TEXT, TEXT, TEXT, TEXT, UUID, UUID, UUID, TEXT, TEXT, TEXT) TO authenticated;


-- ─── 9. RPC: get_whatsapp_stats ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_whatsapp_stats()
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  result JSONB;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL THEN RETURN NULL; END IF;

  SELECT jsonb_build_object(
    'total_sent', COUNT(*)::int,
    'total_delivered', COUNT(*) FILTER (WHERE status = 'delivered')::int,
    'total_failed', COUNT(*) FILTER (WHERE status = 'failed')::int,
    'today_sent', COUNT(*) FILTER (WHERE created_at >= current_date)::int,
    'receipts', COUNT(*) FILTER (WHERE message_type = 'receipt')::int,
    'custom', COUNT(*) FILTER (WHERE message_type = 'custom')::int,
    'is_configured', EXISTS(SELECT 1 FROM whatsapp_config WHERE organization_id = v_org_id AND is_active)
  ) INTO result
  FROM whatsapp_message_logs
  WHERE organization_id = v_org_id;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_whatsapp_stats() TO authenticated;
