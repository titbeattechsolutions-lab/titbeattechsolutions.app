-- 1. Add Plaintext school_code to tenants
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS school_code TEXT UNIQUE;
CREATE INDEX IF NOT EXISTS idx_tenants_school_code ON public.tenants(school_code);

-- 2. Update create_tenant_v2 to store plaintext school_code
DROP FUNCTION IF EXISTS public.create_tenant_v2(text, text, text, text, text, boolean);
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
    school_name, school_code, contact_email, contact_phone, notes,
    status, plan, trial_started_at, subscription_ends_at
  ) VALUES (
    _school_name,
    _school_pin,
    _contact_email, _contact_phone, _notes,
    CASE WHEN _start_trial THEN 'trial'::tenant_status ELSE 'expired'::tenant_status END,
    'trial'::tenant_plan,
    CASE WHEN _start_trial THEN now() ELSE NULL END,
    CASE WHEN _start_trial THEN now() + INTERVAL '7 days' ELSE NULL END
  ) RETURNING id INTO _id;
  RETURN _id;
END;
$function$;

-- 3. Update reset_school_pin to store plaintext school_code
DROP FUNCTION IF EXISTS public.reset_school_pin(uuid, text);
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
     SET school_code = _new_pin,
         updated_at  = now()
   WHERE id = _tenant_id;

  DELETE FROM public.tenant_sessions WHERE tenant_id = _tenant_id;

  INSERT INTO public.tenant_auth_audit(event_type, tenant_id, success, reason)
  VALUES ('school_pin_verify', _tenant_id, TRUE,
          'school pin reset by super_admin; sessions revoked');

  RETURN TRUE;
END;
$function$;

-- 4. Update verify_school_pin_v2 with Lazy Migration Logic
DROP FUNCTION IF EXISTS public.verify_school_pin_v2(TEXT);
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
SET search_path = public, extensions
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

  -- FAST PATH: Direct O(1) plaintext lookup
  SELECT * INTO _t FROM public.tenants WHERE school_code = _pin LIMIT 1;
  
  IF FOUND THEN
    _token := encode(gen_random_bytes(32), 'hex');
    INSERT INTO public.tenant_sessions(token, tenant_id)
    VALUES (_token, _t.id);

    INSERT INTO public.tenant_auth_audit(
      event_type, tenant_id, success, reason, session_ref, ip_address
    ) VALUES (
      'school_pin_verify', _t.id, TRUE,
      'session issued (fast path); tenant_status=' || _t.status::text,
      public._session_ref(_token), _ip
    );

    RETURN QUERY SELECT
      _token, _t.id, _t.school_name, _t.status, _t.plan,
      _t.subscription_ends_at, _t.trial_started_at,
      (_t.admin_pin_hash IS NOT NULL);
    RETURN;
  END IF;



  -- No match found
  INSERT INTO public.tenant_auth_audit(event_type, success, reason, ip_address)
  VALUES ('school_pin_verify', FALSE, 'no tenant matched supplied pin', _ip);
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_school_pin_v2(TEXT) TO anon, authenticated;
