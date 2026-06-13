-- 1. Add test account columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_test_account boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS test_expires_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_profiles_test_expiry
  ON public.profiles (test_expires_at)
  WHERE is_test_account = true AND is_active = true;

-- 2. Password reset tokens table (one-time magic links)
CREATE TABLE IF NOT EXISTS public.password_reset_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  token_hash text NOT NULL UNIQUE,
  channel text NOT NULL CHECK (channel IN ('email','sms')),
  destination text NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  organization_id uuid
);

CREATE INDEX IF NOT EXISTS idx_pwd_reset_tokens_user
  ON public.password_reset_tokens (user_id, used_at);

ALTER TABLE public.password_reset_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins_view_reset_tokens"
  ON public.password_reset_tokens FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "admins_insert_reset_tokens"
  ON public.password_reset_tokens FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- No UPDATE/DELETE policies: only edge functions (service role) can mutate

-- 3. Mark existing test accounts as test with 7-day rotation
UPDATE public.profiles p
SET is_test_account = true,
    test_expires_at = now() + interval '7 days'
FROM auth.users u
WHERE p.user_id = u.id
  AND u.email LIKE '%.test@malikiplus.local';

-- 4. Enable cron + net extensions for scheduled rotation
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;