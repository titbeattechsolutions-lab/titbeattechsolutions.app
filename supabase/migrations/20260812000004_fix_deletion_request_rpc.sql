-- 20260812000004_fix_deletion_request_rpc.sql

ALTER TABLE public.tenant_deletion_requests ALTER COLUMN requested_by DROP NOT NULL;

-- Create an RPC to request deletion via PIN session
CREATE OR REPLACE FUNCTION public.request_tenant_deletion_v2(_session_token TEXT)
RETURNS public.tenant_deletion_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _s RECORD;
  _req public.tenant_deletion_requests;
  _admin_id UUID;
BEGIN
  -- Validate session
  SELECT * INTO _s FROM public.tenant_sessions
   WHERE token = _session_token AND expires_at > now();
   
  IF _s IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired session';
  END IF;

  -- Find the primary admin for this tenant to attach as requested_by if possible
  SELECT id INTO _admin_id FROM public.profiles WHERE school_id = _s.tenant_id AND role = 'school_admin' LIMIT 1;

  -- Delete any existing pending requests first to avoid duplicates
  DELETE FROM public.tenant_deletion_requests WHERE tenant_id = _s.tenant_id AND status = 'pending';

  INSERT INTO public.tenant_deletion_requests (tenant_id, requested_by, status)
  VALUES (_s.tenant_id, _admin_id, 'pending')
  RETURNING * INTO _req;

  RETURN _req;
END;
$$;

-- Create an RPC to cancel deletion via PIN session
CREATE OR REPLACE FUNCTION public.cancel_tenant_deletion_v2(_session_token TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _s RECORD;
BEGIN
  SELECT * INTO _s FROM public.tenant_sessions
   WHERE token = _session_token AND expires_at > now();
   
  IF _s IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired session';
  END IF;

  UPDATE public.tenant_deletion_requests
  SET status = 'cancelled'
  WHERE tenant_id = _s.tenant_id AND status = 'pending';

  RETURN TRUE;
END;
$$;
