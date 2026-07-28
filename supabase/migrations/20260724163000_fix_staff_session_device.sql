-- =====================================================================
-- Migration: Fix log_staff_session_event device column
-- Description: Parses the user-agent header from PostgREST to
-- correctly populate the device column in session_logs.
-- =====================================================================

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
  _ip_address TEXT;
  _device TEXT;
BEGIN
  -- Extract IP securely from PostgREST headers (prevent frontend spoofing)
  _ip_address := current_setting('request.headers', true)::json->>'x-forwarded-for';
  IF _ip_address IS NULL THEN
    _ip_address := current_setting('request.headers', true)::json->>'x-real-ip';
  END IF;

  -- Extract Device/User-Agent securely from PostgREST headers
  _device := current_setting('request.headers', true)::json->>'user-agent';

  -- Validate session and resolve tenant_id
  SELECT tenant_id INTO _tenant_id
  FROM public.tenant_sessions
  WHERE token = _session_token AND expires_at > now();

  IF _tenant_id IS NULL THEN
    RETURN;
  END IF;

  -- Dual-Write A: Legacy staff_session_logs
  INSERT INTO public.staff_session_logs (
    tenant_id, staff_member_id, staff_name, role, action
  ) VALUES (
    _tenant_id, _staff_member_id, _staff_name, _role, _action
  );

  -- Dual-Write B: Attach the staff identity to the tenant_session if login
  IF _action = 'login' THEN
    UPDATE public.tenant_sessions
    SET session_staff_id = _staff_member_id, session_staff_role = _role
    WHERE token = _session_token;
  END IF;

  -- Resolve school_id for the modern schema
  SELECT id INTO _school_id FROM public.schools WHERE tenant_id = _tenant_id;
  IF _school_id IS NOT NULL THEN
    INSERT INTO public.session_logs (
      school_id, staff_member_id, user_name, role, action, ip_address, device
    ) VALUES (
      _school_id, _staff_member_id, _staff_name, _role, _action, _ip_address, _device
    );
  END IF;
END;
$$;
