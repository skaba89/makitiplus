-- Add nfc_enabled column to profiles for NFC preference persistence (#24)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS nfc_enabled boolean DEFAULT false;

-- Grant is already covered by existing RLS policies on profiles
