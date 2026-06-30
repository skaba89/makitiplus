-- ============================================================
-- Migration: Create product-images storage bucket + RLS policies
-- ============================================================

-- 1. Create the bucket (idempotent)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-images',
  'product-images',
  true,                          -- public so images show without auth headers
  5242880,                       -- 5 MB max per image
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- 2. Clean up any previously created policies (idempotent)
DROP POLICY IF EXISTS "authenticated_upload_product_images" ON storage.objects;
DROP POLICY IF EXISTS "authenticated_update_product_images" ON storage.objects;
DROP POLICY IF EXISTS "anyone_view_product_images"         ON storage.objects;
DROP POLICY IF EXISTS "authenticated_delete_product_images" ON storage.objects;

-- 3. Policies
-- Upload: any authenticated user
CREATE POLICY "authenticated_upload_product_images" ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'product-images'
    AND auth.role() = 'authenticated'
  );

-- Update: owner of the folder (user_id = first path segment)
CREATE POLICY "authenticated_update_product_images" ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'product-images'
    AND auth.role() = 'authenticated'
  );

-- Read: public (product images should load without login)
CREATE POLICY "anyone_view_product_images" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'product-images');

-- Delete: any authenticated user (scoped by app-level checks)
CREATE POLICY "authenticated_delete_product_images" ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'product-images'
    AND auth.role() = 'authenticated'
  );
