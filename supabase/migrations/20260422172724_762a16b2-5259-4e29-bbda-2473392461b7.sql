-- Remove the email-based auto-assignment trigger and function.
-- Super_admin role is now granted only by existing super_admins (via RLS-protected writes)
-- or by direct DB action. The original bootstrap super_admin remains intact.

DROP TRIGGER IF EXISTS on_auth_user_created_role ON auth.users;
DROP TRIGGER IF EXISTS handle_new_user_role_trigger ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user_role();