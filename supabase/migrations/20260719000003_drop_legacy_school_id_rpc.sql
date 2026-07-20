-- Restore execute permissions to the legacy get_my_school_id function.
-- (Production RLS policies still depend on this function due to migration drift).
GRANT EXECUTE ON FUNCTION public.get_my_school_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_school_id() TO anon;
