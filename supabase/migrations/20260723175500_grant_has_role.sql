-- =====================================================================
-- Migration: Grant EXECUTE on has_role for PIN auth users
-- Description: The public.has_role function was missing anon execution
-- permissions, which blocked PIN-authenticated users from passing
-- RLS checks that relied on has_role under the hood.
-- =====================================================================

GRANT EXECUTE ON FUNCTION public.has_role(UUID, app_role) TO anon;
