-- Migration: Add branding columns to organizations table
-- This allows each organization to customize their app appearance

ALTER TABLE public.organizations
ADD COLUMN IF NOT EXISTS brand_color TEXT DEFAULT '16 80% 50%',
ADD COLUMN IF NOT EXISTS accent_color TEXT DEFAULT '38 70% 88%',
ADD COLUMN IF NOT EXISTS logo_url TEXT,
ADD COLUMN IF NOT EXISTS app_name TEXT DEFAULT 'MakitiPlus',
ADD COLUMN IF NOT EXISTS theme_mode TEXT DEFAULT 'light' CHECK (theme_mode IN ('light', 'dark', 'system')),
ADD COLUMN IF NOT EXISTS receipt_template TEXT DEFAULT 'default' CHECK (receipt_template IN ('default', 'minimal', 'detailed', 'african')),
ADD COLUMN IF NOT EXISTS font_family TEXT DEFAULT 'Plus Jakarta Sans',
ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'fr';

-- Also add branding fields to profiles for user-level preferences
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS theme_mode TEXT DEFAULT 'system' CHECK (theme_mode IN ('light', 'dark', 'system')),
ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'fr';

-- Create storage bucket for logos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('logos', 'logos', true, 2097152, ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'])
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload logos
CREATE POLICY "Users can upload logos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'logos' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Allow public read access to logos
CREATE POLICY "Logos are publicly accessible"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'logos');

-- Allow users to update their own logos
CREATE POLICY "Users can update their own logos"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'logos' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Allow users to delete their own logos
CREATE POLICY "Users can delete their own logos"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'logos' AND auth.uid()::text = (storage.foldername(name))[1]);
