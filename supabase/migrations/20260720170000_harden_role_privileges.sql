-- 1. Redefine has_role to exclusively query user_roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Only rely on the immutable user_roles table to determine platform-level app_roles (e.g., super_admin)
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = _user_id AND role = _role
  );
$$;

GRANT EXECUTE ON FUNCTION public.has_role(UUID, app_role) TO authenticated;

-- 2. Drop the existing staff linkage update policy and recreate it with a restricted WITH CHECK
DROP POLICY IF EXISTS "profiles_update_staff_linkage_tenant" ON public.profiles;

CREATE POLICY "profiles_update_staff_linkage_tenant"
  ON public.profiles FOR UPDATE
  USING (
    school_id = public.get_my_school_id()
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('school_admin', 'principal', 'head_teacher')
    )
  )
  WITH CHECK (
    school_id = public.get_my_school_id()
    -- Explicitly forbid privilege escalation through the update policy
    AND role NOT IN ('superadmin', 'super_admin')
  );
