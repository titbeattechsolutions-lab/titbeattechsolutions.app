-- Fix public.has_role to seamlessly bridge Phase 1 (user_roles) and Phase 2 (profiles)
-- This restores RLS update permissions for superadmins on the tenants and schools tables
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    -- Legacy Phase 1 Check (Checks the enum)
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
    
    UNION ALL
    
    -- Modern Phase 2 Check (Checks the text column and maps formatting discrepancies)
    SELECT 1 FROM public.profiles 
    WHERE id = _user_id 
      AND (
        role = _role::text 
        OR (role = 'superadmin' AND _role = 'super_admin'::app_role)
        OR (role = 'school_admin' AND _role = 'school_admin'::app_role)
      )
  )
$$;

GRANT EXECUTE ON FUNCTION public.has_role(UUID, app_role) TO authenticated;
