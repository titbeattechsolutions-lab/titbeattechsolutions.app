-- 20260724153000_verify_school_pin_v3.sql
-- Create a secure, O(1) indexed PIN verification function that requires the tenant_code.

CREATE OR REPLACE FUNCTION public.verify_school_pin_v3(_tenant_code TEXT, _pin TEXT)
RETURNS TABLE(
  session_token TEXT,
  tenant_id UUID,
  school_name TEXT,
  status tenant_status,
  plan tenant_plan,
  subscription_ends_at TIMESTAMPTZ,
  trial_started_at TIMESTAMPTZ,
  has_admin_pin BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _t      RECORD;
  _token  TEXT;
  _ip     TEXT;
  _fails  INT;
BEGIN
  -- Safely extract IP
  BEGIN
    _ip := current_setting('request.headers', true)::json->>'x-forwarded-for';
  EXCEPTION WHEN OTHERS THEN
    _ip := 'unknown';
  END;
  IF _ip IS NULL THEN _ip := 'unknown'; END IF;

  -- Find the exact tenant by tenant_code
  SELECT * INTO _t FROM public.tenants WHERE lower(tenant_code) = lower(_tenant_code);
  
  IF _t IS NULL THEN
    INSERT INTO public.tenant_auth_audit(event_type, success, reason, ip_address)
    VALUES ('school_pin_verify', FALSE, 'tenant code not found', _ip);
    RETURN;
  END IF;

  -- Rate Limiting: max 5 failed attempts per IP per 15 mins
  SELECT count(*) INTO _fails
    FROM public.tenant_auth_audit a
   WHERE a.event_type = 'school_pin_verify'
     AND a.tenant_id = _t.id
     AND a.success = FALSE
     AND a.ip_address = _ip
     AND a.created_at > now() - interval '15 minutes';

  IF _fails >= 5 THEN
    RAISE EXCEPTION 'Too many failed attempts. Account locked for 15 minutes.';
  END IF;

  IF _pin IS NULL OR length(_pin) < 4 THEN
    INSERT INTO public.tenant_auth_audit(event_type, tenant_id, success, reason, ip_address)
    VALUES ('school_pin_verify', _t.id, FALSE, 'malformed pin', _ip);
    RETURN;
  END IF;

  -- Verify PIN against this specific tenant
  IF public._verify_pin_any(_pin, _t.school_pin_hash) THEN
    -- Auto-upgrade hash if needed
    IF NOT public._is_bcrypt(_t.school_pin_hash) THEN
      UPDATE public.tenants
      SET school_pin_hash = extensions.crypt(_pin, extensions.gen_salt('bf', 10)),
          updated_at = now()
      WHERE id = _t.id;
    END IF;

    _token := encode(extensions.gen_random_bytes(32), 'hex');
    INSERT INTO public.tenant_sessions(token, tenant_id)
    VALUES (_token, _t.id);

    INSERT INTO public.tenant_auth_audit(
      event_type, tenant_id, success, reason, session_ref, ip_address
    ) VALUES (
      'school_pin_verify', _t.id, TRUE,
      'session issued; tenant_status=' || _t.status::text,
      public._session_ref(_token), _ip
    );

    RETURN QUERY SELECT
      _token, _t.id, _t.school_name, _t.status, _t.plan,
      _t.subscription_ends_at, _t.trial_started_at,
      (_t.admin_pin_hash IS NOT NULL);
    RETURN;
  END IF;

  -- Failed PIN
  INSERT INTO public.tenant_auth_audit(
    event_type, tenant_id, success, reason, ip_address
  ) VALUES (
    'school_pin_verify', _t.id, FALSE, 'invalid pin', _ip
  );
  RETURN;
END;
$$;
