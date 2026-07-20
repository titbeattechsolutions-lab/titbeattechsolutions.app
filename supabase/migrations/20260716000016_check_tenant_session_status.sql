-- Lightweight RPC: checks if a tenant_session token is still valid
-- and returns the current live status from the tenants table.
-- Used by TenantApp.tsx to detect real-time suspension while a user
-- is already inside the app (without requiring a full re-login flow).
--
-- Returns: 'active' | 'trial' | 'suspended' | 'expired'
-- Returns NULL if the session token is invalid or expired.

CREATE OR REPLACE FUNCTION public.check_tenant_session_status(_session_token TEXT)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tenant_id UUID;
  _status    TEXT;
BEGIN
  -- Resolve tenant_id from the live session token
  SELECT tenant_id INTO _tenant_id
    FROM public.tenant_sessions
   WHERE session_token = _session_token
     AND expires_at > now()
   LIMIT 1;

  -- Token not found or expired → return NULL (caller treats as force-logout)
  IF _tenant_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Fetch current live status from the authoritative tenants table
  SELECT status::TEXT INTO _status
    FROM public.tenants
   WHERE id = _tenant_id;

  RETURN _status;
END;
$$;

-- Callable by anon (school users are not Supabase Auth users)
GRANT EXECUTE ON FUNCTION public.check_tenant_session_status(TEXT) TO anon, authenticated;
