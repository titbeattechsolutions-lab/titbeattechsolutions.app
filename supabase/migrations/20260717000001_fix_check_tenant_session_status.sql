-- FIX: check_tenant_session_status
--
-- Corrects two bugs found in migration 20260716000016:
--   1. Column name was wrong: 'session_token' → 'token' (the actual PK column name)
--   2. Function was marked STABLE but must be VOLATILE since tenant_sessions
--      is written to by concurrent sessions and we need live reads every call.

CREATE OR REPLACE FUNCTION public.check_tenant_session_status(_session_token TEXT)
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tenant_id UUID;
  _status    TEXT;
BEGIN
  -- Resolve tenant_id from the live session token.
  -- Column is 'token' (PK), not 'session_token'.
  SELECT tenant_id INTO _tenant_id
    FROM public.tenant_sessions
   WHERE token = _session_token
     AND expires_at > now()
   LIMIT 1;

  -- Token not found or already purged (e.g. by set_tenant_status suspend)
  -- → return NULL so the frontend treats this as a force-logout signal.
  IF _tenant_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Fetch the authoritative live status from the tenants table.
  SELECT status::TEXT INTO _status
    FROM public.tenants
   WHERE id = _tenant_id;

  RETURN _status;
END;
$$;

-- Callable by anon: school users are not Supabase Auth users.
-- SECURITY DEFINER runs as the table owner so it bypasses tenant_sessions RLS safely.
GRANT EXECUTE ON FUNCTION public.check_tenant_session_status(TEXT) TO anon, authenticated;
