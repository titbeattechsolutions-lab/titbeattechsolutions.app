-- =====================================================================
-- Migration: Grant EXECUTE on Helper Functions
-- Description: The migration that moved public.is_school_admin and others
-- to the public schema omitted the GRANT statements, causing permission denied
-- errors for standard users and PIN-auth users.
-- =====================================================================

GRANT EXECUTE ON FUNCTION public.school_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.school_id() TO anon;

GRANT EXECUTE ON FUNCTION public.is_school_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_school_admin() TO anon;

GRANT EXECUTE ON FUNCTION public.is_teacher() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_teacher() TO anon;
