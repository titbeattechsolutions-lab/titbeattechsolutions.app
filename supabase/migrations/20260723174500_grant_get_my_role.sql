-- =====================================================================
-- Migration: Grant EXECUTE on get_my_role
-- Description: The public.get_my_role() function was missing execution 
-- permissions for standard users, blocking the directory tab.
-- =====================================================================

GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_role() TO anon;
