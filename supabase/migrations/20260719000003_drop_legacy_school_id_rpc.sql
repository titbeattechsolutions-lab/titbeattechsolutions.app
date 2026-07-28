-- Restore execute permissions to the legacy get_my_school_id function.
-- (Production RLS policies still depend on this function due to migration drift).

CREATE OR REPLACE FUNCTION public.get_my_school_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT school_id FROM public.profiles WHERE id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.get_my_school_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_school_id() TO anon;
