-- Replace the Read Proxy RPC to fix ambiguous "id" column reference
CREATE OR REPLACE FUNCTION public.get_activity_logs_v2(
  _session_token TEXT,
  _limit INT DEFAULT 50
)
RETURNS TABLE(
  id BIGINT,
  staff_id TEXT,
  action TEXT,
  details TEXT,
  "timestamp" TIMESTAMPTZ
)
LANGUAGE plpgsql
SET search_path = public
SECURITY DEFINER
AS $$
DECLARE
  _tenant_id UUID;
  _school_id UUID;
BEGIN
  -- Validate the session token and get the tenant_id
  SELECT ts.tenant_id INTO _tenant_id 
  FROM public.tenant_sessions ts
  WHERE ts.token = _session_token AND ts.expires_at > now();

  IF _tenant_id IS NULL THEN
    RETURN; -- Invalid or expired session
  END IF;

  -- Resolve school_id (using alias 's' to avoid ambiguous 'id' column reference)
  SELECT s.id INTO _school_id FROM public.schools s WHERE s.tenant_id = _tenant_id;

  IF _school_id IS NULL THEN
    RETURN;
  END IF;

  -- Return the granular activity logs securely
  RETURN QUERY
  SELECT
    l.id,
    COALESCE(l.details->>'actor', '')::TEXT AS staff_id,
    l.action,
    COALESCE(l.details->>'note', l.details::TEXT, '')::TEXT AS details,
    l.created_at AS timestamp
  FROM public.activity_logs l
  WHERE l.school_id = _school_id
  ORDER BY l.created_at DESC
  LIMIT _limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_activity_logs_v2(TEXT, INT) TO anon, authenticated;
