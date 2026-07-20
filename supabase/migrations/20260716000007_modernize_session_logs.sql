-- Modernize session logging architecture
-- 1. Relax constraints on the modern session_logs table to allow staff (non-auth.users)
ALTER TABLE public.session_logs ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.session_logs ADD COLUMN IF NOT EXISTS staff_member_id TEXT;

-- 2. Fix the RLS policies typo (change 'superadmin' to 'super_admin' to match app_role)
DROP POLICY IF EXISTS "session_logs_read_admin" ON public.session_logs;
DROP POLICY IF EXISTS "session_logs_read_superadmin" ON public.session_logs;

CREATE POLICY "session_logs_read_admin"
  ON public.session_logs FOR SELECT
  USING (
    school_id = (SELECT school_id FROM public.profiles WHERE id = auth.uid())
    AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('school_admin','principal','super_admin')
  );

CREATE POLICY "session_logs_read_superadmin"
  ON public.session_logs FOR SELECT
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'super_admin'
  );

-- 3. Backfill historical staff sessions into the modern table
INSERT INTO public.session_logs (
  id, school_id, staff_member_id, user_name, role, action, created_at
)
SELECT 
  s.id, 
  sch.id AS school_id, 
  s.staff_member_id, 
  s.staff_name, 
  s.role, 
  s.action, 
  s.created_at
FROM public.staff_session_logs s
JOIN public.schools sch ON sch.tenant_id = s.tenant_id
ON CONFLICT (id) DO NOTHING;

-- 4. Establish a Dual-Write Bridge for the frontend
-- This catches inserts from the frontend and routes them to both the legacy table
-- (for the global dashboard) and the modern table (for the tenant dashboard).
CREATE OR REPLACE FUNCTION public.log_staff_session_event(
  _session_token TEXT,
  _staff_member_id TEXT,
  _staff_name TEXT,
  _role TEXT,
  _action TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tenant_id UUID;
  _school_id UUID;
BEGIN
  -- Validate session and resolve tenant_id
  SELECT tenant_id INTO _tenant_id
  FROM public.tenant_sessions
  WHERE token = _session_token AND expires_at > now();

  IF _tenant_id IS NULL THEN
    RETURN;
  END IF;

  -- Dual-Write A: Legacy staff_session_logs (keeps global ActivityLogPage.tsx alive)
  INSERT INTO public.staff_session_logs (
    tenant_id, staff_member_id, staff_name, role, action
  ) VALUES (
    _tenant_id, _staff_member_id, _staff_name, _role, _action
  );

  -- Resolve school_id for the modern schema
  SELECT id INTO _school_id FROM public.schools WHERE tenant_id = _tenant_id;

  -- Dual-Write B: Modern session_logs (activates TenantActivityAudit.tsx modal)
  IF _school_id IS NOT NULL THEN
    INSERT INTO public.session_logs (
      school_id, staff_member_id, user_name, role, action
    ) VALUES (
      _school_id, _staff_member_id, _staff_name, _role, _action
    );
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_staff_session_event(TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;
