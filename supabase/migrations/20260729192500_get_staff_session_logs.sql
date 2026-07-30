-- 20260724173000_get_staff_session_logs.sql
-- Create function to fetch staff session logs securely for a given session

CREATE OR REPLACE FUNCTION public.get_staff_session_logs(_session_token TEXT, _limit INT DEFAULT 50)
RETURNS TABLE (
  id UUID,
  staff_name TEXT,
  role TEXT,
  action TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tenant_id UUID;
BEGIN
  -- 1. Validate session and resolve tenant_id
  SELECT tenant_id INTO _tenant_id
  FROM public.tenant_sessions
  WHERE token = _session_token AND expires_at > now();

  IF _tenant_id IS NULL THEN
    RETURN; -- Unauthorized or expired session
  END IF;

  -- 2. Return the granular staff activity logs securely
  RETURN QUERY
  SELECT
    l.id,
    l.staff_name,
    l.role,
    l.action,
    l.created_at
  FROM public.staff_session_logs l
  WHERE l.tenant_id = _tenant_id
  ORDER BY l.created_at DESC
  LIMIT _limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_staff_session_logs(TEXT, INT) TO anon, authenticated;
