-- 1. Create the Write Proxy RPC
CREATE OR REPLACE FUNCTION public.log_tenant_activity_v2(
  _tenant_id UUID,
  _staff_id TEXT,
  _action TEXT,
  _details TEXT DEFAULT NULL,
  _timestamp TIMESTAMPTZ DEFAULT now()
)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
SECURITY DEFINER
AS $$
DECLARE
  _school_id UUID;
BEGIN
  -- Bridge the architecture: resolve school_id from tenant_id
  SELECT id INTO _school_id FROM public.schools WHERE tenant_id = _tenant_id;
  
  -- Insert into the modern activity_logs table
  -- We package the textual _staff_id into the JSONB details column to bypass the UUID constraint on performed_by
  INSERT INTO public.activity_logs (
    school_id, 
    action, 
    details, 
    created_at
  ) VALUES (
    _school_id, 
    _action, 
    jsonb_build_object('note', _details, 'actor', _staff_id), 
    _timestamp
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_tenant_activity_v2(UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ) TO anon, authenticated;


-- 2. Create the Read Proxy RPC
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
  SELECT tenant_id INTO _tenant_id 
  FROM public.tenant_sessions 
  WHERE token = _session_token AND expires_at > now();

  IF _tenant_id IS NULL THEN
    RETURN; -- Invalid or expired session
  END IF;

  -- Resolve school_id
  SELECT id INTO _school_id FROM public.schools WHERE tenant_id = _tenant_id;

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
