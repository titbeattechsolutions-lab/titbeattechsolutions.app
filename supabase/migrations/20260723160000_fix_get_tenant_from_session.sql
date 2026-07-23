-- =====================================================================
-- Migration: Fix get_tenant_from_session
-- Description: The original RLS helper incorrectly returned the `tenant_id`
-- instead of the `school_id`. Since all RLS policies (e.g. public.students)
-- map `school_id = get_tenant_from_session()`, this resulted in comparing
-- a school_id UUID with a tenant_id UUID, which always failed.
-- This fix joins the schools table to correctly return the school_id.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_tenant_from_session()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id 
  FROM public.tenant_sessions ts
  JOIN public.schools s ON s.tenant_id = ts.tenant_id
  WHERE ts.token = (current_setting('request.headers', true)::json->>'x-tenant-session')
    AND ts.expires_at > now() 
  LIMIT 1;
$$;
