
-- Fix: pgcrypto lives in 'extensions' schema, but SECURITY DEFINER functions
-- run with search_path=public. Qualify all pgcrypto calls explicitly.

-- 1) verify_school_pin_v2
CREATE OR REPLACE FUNCTION public.verify_school_pin_v2(_pin text)
 RETURNS TABLE(session_token text, tenant_id uuid, school_name text, status tenant_status, plan tenant_plan, subscription_ends_at timestamp with time zone, trial_started_at timestamp with time zone, has_admin_pin boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _t      RECORD;
  _token  TEXT;
BEGIN
  IF _pin IS NULL OR length(_pin) < 4 THEN
    INSERT INTO public.tenant_auth_audit(event_type, success, reason)
    VALUES ('school_pin_verify', FALSE, 'malformed pin');
    RETURN;
  END IF;

  FOR _t IN SELECT * FROM public.tenants LOOP
    IF public._verify_pin_any(_pin, _t.school_pin_hash) THEN
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
        event_type, tenant_id, success, reason, session_ref
      ) VALUES (
        'school_pin_verify', _t.id, TRUE,
        'session issued; tenant_status=' || _t.status::text,
        public._session_ref(_token)
      );

      RETURN QUERY SELECT
        _token, _t.id, _t.school_name, _t.status, _t.plan,
        _t.subscription_ends_at, _t.trial_started_at,
        (_t.admin_pin_hash IS NOT NULL);
      RETURN;
    END IF;
  END LOOP;

  INSERT INTO public.tenant_auth_audit(event_type, success, reason)
  VALUES ('school_pin_verify', FALSE, 'no tenant matched supplied pin');
END;
$function$;

-- 2) _verify_pin_any
CREATE OR REPLACE FUNCTION public._verify_pin_any(_pin text, _stored_hash text)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
DECLARE _legacy TEXT;
BEGIN
  IF _stored_hash IS NULL OR _stored_hash = '' THEN RETURN FALSE; END IF;
  IF public._is_bcrypt(_stored_hash) THEN
    RETURN extensions.crypt(_pin, _stored_hash) = _stored_hash;
  END IF;
  _legacy := encode(extensions.digest('schoolapp_v1_salt_2024' || _pin, 'sha256'), 'hex');
  RETURN _legacy = _stored_hash;
END;
$function$;

-- 3) verify_admin_pin_v2
CREATE OR REPLACE FUNCTION public.verify_admin_pin_v2(_session_token text, _pin text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _tenant_id UUID;
  _stored    TEXT;
BEGIN
  IF _session_token IS NULL OR _pin IS NULL THEN
    INSERT INTO public.tenant_auth_audit(event_type, success, reason, session_ref)
    VALUES ('admin_pin_verify', FALSE, 'missing token or pin', public._session_ref(_session_token));
    RETURN FALSE;
  END IF;

  SELECT s.tenant_id INTO _tenant_id
    FROM public.tenant_sessions s
    JOIN public.tenants t ON t.id = s.tenant_id
   WHERE s.token = _session_token
     AND s.expires_at > now()
     AND t.status IN ('trial', 'active');

  IF _tenant_id IS NULL THEN
    INSERT INTO public.tenant_auth_audit(event_type, success, reason, session_ref)
    VALUES ('admin_pin_verify', FALSE, 'invalid/expired session or inactive tenant',
            public._session_ref(_session_token));
    RETURN FALSE;
  END IF;

  SELECT admin_pin_hash INTO _stored FROM public.tenants WHERE id = _tenant_id;

  IF NOT public._verify_pin_any(_pin, _stored) THEN
    INSERT INTO public.tenant_auth_audit(event_type, tenant_id, success, reason, session_ref)
    VALUES ('admin_pin_verify', _tenant_id, FALSE, 'wrong admin pin',
            public._session_ref(_session_token));
    RETURN FALSE;
  END IF;

  IF NOT public._is_bcrypt(_stored) THEN
    UPDATE public.tenants
    SET admin_pin_hash = extensions.crypt(_pin, extensions.gen_salt('bf', 10)), updated_at = now()
    WHERE id = _tenant_id;
  END IF;

  INSERT INTO public.tenant_auth_audit(event_type, tenant_id, success, reason, session_ref)
  VALUES ('admin_pin_verify', _tenant_id, TRUE, 'admin verified',
          public._session_ref(_session_token));
  RETURN TRUE;
END;
$function$;

-- 4) set_admin_pin_v2
CREATE OR REPLACE FUNCTION public.set_admin_pin_v2(_session_token text, _pin text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _tenant_id UUID;
  _ok        BOOLEAN;
BEGIN
  IF _session_token IS NULL OR _pin IS NULL OR length(_pin) < 4 THEN
    INSERT INTO public.tenant_auth_audit(event_type, success, reason, session_ref)
    VALUES ('admin_pin_set', FALSE, 'missing or weak pin', public._session_ref(_session_token));
    RETURN FALSE;
  END IF;

  SELECT s.tenant_id INTO _tenant_id
    FROM public.tenant_sessions s
    JOIN public.tenants t ON t.id = s.tenant_id
   WHERE s.token = _session_token
     AND s.expires_at > now()
     AND t.status IN ('trial', 'active');

  IF _tenant_id IS NULL THEN
    INSERT INTO public.tenant_auth_audit(event_type, success, reason, session_ref)
    VALUES ('admin_pin_set', FALSE, 'invalid session', public._session_ref(_session_token));
    RETURN FALSE;
  END IF;

  UPDATE public.tenants
  SET admin_pin_hash = extensions.crypt(_pin, extensions.gen_salt('bf', 10)), updated_at = now()
  WHERE id = _tenant_id AND admin_pin_hash IS NULL;
  _ok := FOUND;

  INSERT INTO public.tenant_auth_audit(event_type, tenant_id, success, reason, session_ref)
  VALUES ('admin_pin_set', _tenant_id, _ok,
          CASE WHEN _ok THEN 'admin pin established' ELSE 'admin pin already set' END,
          public._session_ref(_session_token));

  RETURN _ok;
END;
$function$;

-- 5) create_tenant_v2
CREATE OR REPLACE FUNCTION public.create_tenant_v2(_school_name text, _school_pin text, _contact_email text DEFAULT NULL::text, _contact_phone text DEFAULT NULL::text, _notes text DEFAULT NULL::text, _start_trial boolean DEFAULT true)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _id UUID;
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  INSERT INTO public.tenants(
    school_name, school_pin_hash, contact_email, contact_phone, notes,
    status, plan, trial_started_at, subscription_ends_at
  ) VALUES (
    _school_name,
    extensions.crypt(_school_pin, extensions.gen_salt('bf', 10)),
    _contact_email, _contact_phone, _notes,
    CASE WHEN _start_trial THEN 'trial'::tenant_status ELSE 'expired'::tenant_status END,
    'trial'::tenant_plan,
    CASE WHEN _start_trial THEN now() ELSE NULL END,
    CASE WHEN _start_trial THEN now() + INTERVAL '7 days' ELSE NULL END
  ) RETURNING id INTO _id;
  RETURN _id;
END;
$function$;

-- 6) reset_school_pin
CREATE OR REPLACE FUNCTION public.reset_school_pin(_tenant_id uuid, _new_pin text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _exists BOOLEAN;
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _tenant_id IS NULL OR _new_pin IS NULL OR length(_new_pin) < 4 THEN
    RAISE EXCEPTION 'tenant_id and pin (>=4 chars) required';
  END IF;
  SELECT EXISTS (SELECT 1 FROM public.tenants WHERE id = _tenant_id) INTO _exists;
  IF NOT _exists THEN RAISE EXCEPTION 'tenant not found'; END IF;

  UPDATE public.tenants
     SET school_pin_hash = extensions.crypt(_new_pin, extensions.gen_salt('bf', 10)),
         updated_at      = now()
   WHERE id = _tenant_id;

  DELETE FROM public.tenant_sessions WHERE tenant_id = _tenant_id;

  INSERT INTO public.tenant_auth_audit(event_type, tenant_id, success, reason)
  VALUES ('school_pin_verify', _tenant_id, TRUE,
          'school pin reset by super_admin; sessions revoked');

  RETURN TRUE;
END;
$function$;

-- 7) issue_super_admin_token
CREATE OR REPLACE FUNCTION public.issue_super_admin_token(_target_user_id uuid, _hours_valid integer DEFAULT 24)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _raw_token TEXT;
  _hash      TEXT;
  _row_id    UUID;
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _target_user_id IS NULL THEN
    RAISE EXCEPTION 'target_user_id required';
  END IF;
  IF _hours_valid IS NULL OR _hours_valid < 1 OR _hours_valid > 168 THEN
    RAISE EXCEPTION 'hours_valid must be between 1 and 168';
  END IF;
  IF public.has_role(_target_user_id, 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'target user already has super_admin';
  END IF;

  _raw_token := encode(extensions.gen_random_bytes(32), 'hex');
  _hash      := encode(extensions.digest(_raw_token, 'sha256'), 'hex');

  INSERT INTO public.super_admin_bootstrap_tokens(
    token_hash, target_user_id, issued_by, expires_at
  ) VALUES (
    _hash, _target_user_id, auth.uid(), now() + make_interval(hours => _hours_valid)
  )
  RETURNING id INTO _row_id;

  INSERT INTO public.super_admin_token_audit(
    event_type, actor_user_id, target_user_id, token_id, success, reason
  ) VALUES (
    'issued', auth.uid(), _target_user_id, _row_id, TRUE,
    'valid for ' || _hours_valid || 'h'
  );

  RETURN _raw_token;
END;
$function$;

-- 8) redeem_super_admin_token
CREATE OR REPLACE FUNCTION public.redeem_super_admin_token(_token text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _hash    TEXT;
  _row_id  UUID;
  _caller  UUID := auth.uid();
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF _token IS NULL OR length(_token) < 32 THEN
    INSERT INTO public.super_admin_token_audit(
      event_type, actor_user_id, target_user_id, success, reason
    ) VALUES ('redeemed', _caller, _caller, FALSE, 'malformed token');
    RAISE EXCEPTION 'invalid token';
  END IF;

  _hash := encode(extensions.digest(_token, 'sha256'), 'hex');

  UPDATE public.super_admin_bootstrap_tokens
     SET consumed_at = now(),
         consumed_by = _caller
   WHERE token_hash     = _hash
     AND target_user_id = _caller
     AND consumed_at    IS NULL
     AND expires_at     > now()
  RETURNING id INTO _row_id;

  IF _row_id IS NULL THEN
    INSERT INTO public.super_admin_token_audit(
      event_type, actor_user_id, target_user_id, success, reason
    ) VALUES (
      'redeemed', _caller, _caller, FALSE,
      'token invalid, expired, already used, or not assigned to caller'
    );
    RAISE EXCEPTION 'token invalid, expired, already used, or not assigned to you';
  END IF;

  INSERT INTO public.user_roles(user_id, role)
  VALUES (_caller, 'super_admin'::app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  INSERT INTO public.super_admin_token_audit(
    event_type, actor_user_id, target_user_id, token_id, success, reason
  ) VALUES (
    'redeemed', _caller, _caller, _row_id, TRUE, 'super_admin granted'
  );

  RETURN TRUE;
END;
$function$;
