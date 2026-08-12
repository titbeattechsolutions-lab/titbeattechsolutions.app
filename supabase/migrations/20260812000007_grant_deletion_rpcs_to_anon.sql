-- 20260812000007_grant_deletion_rpcs_to_anon.sql

-- Grant execute permissions for the deletion RPCs to anon (since PIN users are not authenticated in Supabase Auth)
GRANT EXECUTE ON FUNCTION public.request_tenant_deletion_v2(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_tenant_deletion_v2(TEXT) TO anon, authenticated;

-- Create an RPC to check the status of a deletion request securely for PIN users
CREATE OR REPLACE FUNCTION public.get_tenant_deletion_request_v2(_session_token TEXT)
RETURNS public.tenant_deletion_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _s RECORD;
  _req public.tenant_deletion_requests;
BEGIN
  -- Validate session
  SELECT * INTO _s FROM public.tenant_sessions
   WHERE token = _session_token AND expires_at > now();
   
  IF _s IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired session';
  END IF;

  -- Return the pending deletion request if it exists
  SELECT * INTO _req 
  FROM public.tenant_deletion_requests 
  WHERE tenant_id = _s.tenant_id AND status = 'pending' 
  LIMIT 1;

  RETURN _req;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_tenant_deletion_request_v2(TEXT) TO anon, authenticated;
