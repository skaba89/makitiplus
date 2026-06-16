-- Allow unauthenticated users to check if an admin exists
-- This is required for the "Premier admin" signup tab to appear
GRANT EXECUTE ON FUNCTION public.admin_exists() TO anon, authenticated;
