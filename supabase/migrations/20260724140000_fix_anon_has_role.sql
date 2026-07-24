-- Fix: Grant anon access to has_role to prevent 42501 permission errors during RLS evaluation.
-- The function is safe for anon since auth.uid() is null for them anyway.

GRANT EXECUTE ON FUNCTION public.has_role(UUID, app_role) TO anon;
