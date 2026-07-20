-- 1. Add IP Address to tenant_auth_audit
ALTER TABLE public.tenant_auth_audit ADD COLUMN IF NOT EXISTS ip_address TEXT;

-- 2. Update verify_school_pin_v2 to include IP logging and Rate Limiting
CREATE OR REPLACE FUNCTION public.verify_school_pin_v2(_pin TEXT)
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

  -- Rate Limiting: max 5 failed attempts per IP per 15 mins
  SELECT count(*) INTO _fails
    FROM public.tenant_auth_audit
   WHERE event_type = 'school_pin_verify'
     AND success = FALSE
     AND ip_address = _ip
     AND created_at > now() - interval '15 minutes';

  IF _fails >= 5 THEN
    RAISE EXCEPTION 'Too many failed attempts. Account locked for 15 minutes.';
  END IF;

  IF _pin IS NULL OR length(_pin) < 4 THEN
    INSERT INTO public.tenant_auth_audit(event_type, success, reason, ip_address)
    VALUES ('school_pin_verify', FALSE, 'malformed pin', _ip);
    RETURN;
  END IF;

  -- Scan tenants
  FOR _t IN SELECT * FROM public.tenants LOOP
    IF public._verify_pin_any(_pin, _t.school_pin_hash) THEN
      IF NOT public._is_bcrypt(_t.school_pin_hash) THEN
        UPDATE public.tenants
        SET school_pin_hash = crypt(_pin, gen_salt('bf', 10)),
            updated_at = now()
        WHERE id = _t.id;
      END IF;

      _token := encode(gen_random_bytes(32), 'hex');
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
  END LOOP;

  INSERT INTO public.tenant_auth_audit(event_type, success, reason, ip_address)
  VALUES ('school_pin_verify', FALSE, 'no tenant matched supplied pin', _ip);
END;
$$;

-- 3. Update verify_admin_pin_v2 with Rate Limiting by tenant_id
CREATE OR REPLACE FUNCTION public.verify_admin_pin_v2(_session_token TEXT, _pin TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tenant_id UUID;
  _stored    TEXT;
  _ip        TEXT;
  _fails     INT;
BEGIN
  -- Safely extract IP
  BEGIN
    _ip := current_setting('request.headers', true)::json->>'x-forwarded-for';
  EXCEPTION WHEN OTHERS THEN
    _ip := 'unknown';
  END;
  IF _ip IS NULL THEN _ip := 'unknown'; END IF;

  IF _session_token IS NULL OR _pin IS NULL THEN
    INSERT INTO public.tenant_auth_audit(event_type, success, reason, session_ref, ip_address)
    VALUES ('admin_pin_verify', FALSE, 'missing token or pin', public._session_ref(_session_token), _ip);
    RETURN FALSE;
  END IF;

  SELECT s.tenant_id
    INTO _tenant_id
    FROM public.tenant_sessions s
    JOIN public.tenants t ON t.id = s.tenant_id
   WHERE s.token = _session_token
     AND s.expires_at > now()
     AND t.status IN ('trial', 'active');

  IF _tenant_id IS NULL THEN
    INSERT INTO public.tenant_auth_audit(event_type, success, reason, session_ref, ip_address)
    VALUES ('admin_pin_verify', FALSE, 'invalid/expired session or inactive tenant',
            public._session_ref(_session_token), _ip);
    RETURN FALSE;
  END IF;

  -- Rate Limiting: max 5 failed attempts per tenant per 15 mins
  SELECT count(*) INTO _fails
    FROM public.tenant_auth_audit
   WHERE event_type = 'admin_pin_verify'
     AND success = FALSE
     AND tenant_id = _tenant_id
     AND created_at > now() - interval '15 minutes';

  IF _fails >= 5 THEN
    RAISE EXCEPTION 'Too many failed attempts. Account locked for 15 minutes.';
  END IF;

  SELECT admin_pin_hash INTO _stored FROM public.tenants WHERE id = _tenant_id;

  IF NOT public._verify_pin_any(_pin, _stored) THEN
    INSERT INTO public.tenant_auth_audit(event_type, tenant_id, success, reason, session_ref, ip_address)
    VALUES ('admin_pin_verify', _tenant_id, FALSE, 'wrong admin pin',
            public._session_ref(_session_token), _ip);
    RETURN FALSE;
  END IF;

  IF NOT public._is_bcrypt(_stored) THEN
    UPDATE public.tenants
    SET admin_pin_hash = crypt(_pin, gen_salt('bf', 10)), updated_at = now()
    WHERE id = _tenant_id;
  END IF;

  INSERT INTO public.tenant_auth_audit(event_type, tenant_id, success, reason, session_ref, ip_address)
  VALUES ('admin_pin_verify', _tenant_id, TRUE, 'admin verified',
          public._session_ref(_session_token), _ip);
  RETURN TRUE;
END;
$$;
