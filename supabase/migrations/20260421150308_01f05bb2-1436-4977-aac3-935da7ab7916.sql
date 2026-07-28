-- Enable pgcrypto for bcrypt support
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;

-- Session tokens table
CREATE TABLE IF NOT EXISTS public.tenant_sessions (
  token TEXT PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '12 hours')
);
CREATE INDEX IF NOT EXISTS tenant_sessions_tenant_idx ON public.tenant_sessions(tenant_id);
CREATE INDEX IF NOT EXISTS tenant_sessions_expires_idx ON public.tenant_sessions(expires_at);

ALTER TABLE public.tenant_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins manage sessions"
ON public.tenant_sessions FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

-- Helper: detect bcrypt vs legacy SHA-256 hex
CREATE OR REPLACE FUNCTION public._is_bcrypt(_hash TEXT)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$ SELECT _hash LIKE '$2%$%' $$;

-- Helper: verify a plain PIN against either bcrypt or legacy SHA-256(salt+pin)
CREATE OR REPLACE FUNCTION public._verify_pin_any(_pin TEXT, _stored_hash TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $$
DECLARE
  _legacy TEXT;
BEGIN
  IF _stored_hash IS NULL OR _stored_hash = '' THEN
    RETURN FALSE;
  END IF;
  IF public._is_bcrypt(_stored_hash) THEN
    RETURN crypt(_pin, _stored_hash) = _stored_hash;
  END IF;
  -- Legacy SHA-256 with fixed salt 'schoolapp_v1_salt_2024'
  _legacy := encode(digest('schoolapp_v1_salt_2024' || _pin, 'sha256'), 'hex');
  RETURN _legacy = _stored_hash;
END;
$$;

-- New: verify school PIN with plain text + auto-upgrade to bcrypt + issue session token
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
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _t RECORD;
  _token TEXT;
BEGIN
  -- Find tenant whose stored hash matches the supplied PIN.
  -- We must scan tenants because hashes are now random-salted.
  FOR _t IN SELECT * FROM public.tenants LOOP
    IF public._verify_pin_any(_pin, _t.school_pin_hash) THEN
      -- Auto-upgrade legacy hashes to bcrypt
      IF NOT public._is_bcrypt(_t.school_pin_hash) THEN
        UPDATE public.tenants
        SET school_pin_hash = crypt(_pin, gen_salt('bf', 10)),
            updated_at = now()
        WHERE id = _t.id;
      END IF;

      -- Issue session token
      _token := encode(gen_random_bytes(32), 'hex');
      INSERT INTO public.tenant_sessions(token, tenant_id) VALUES (_token, _t.id);

      RETURN QUERY SELECT
        _token,
        _t.id,
        _t.school_name,
        _t.status,
        _t.plan,
        _t.subscription_ends_at,
        _t.trial_started_at,
        (_t.admin_pin_hash IS NOT NULL);
      RETURN;
    END IF;
  END LOOP;
END;
$$;

-- New: verify admin PIN with plain text + auto-upgrade
CREATE OR REPLACE FUNCTION public.verify_admin_pin_v2(_session_token TEXT, _pin TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tenant_id UUID;
  _stored TEXT;
BEGIN
  SELECT tenant_id INTO _tenant_id FROM public.tenant_sessions
   WHERE token = _session_token AND expires_at > now();
  IF _tenant_id IS NULL THEN RETURN FALSE; END IF;

  SELECT admin_pin_hash INTO _stored FROM public.tenants WHERE id = _tenant_id;
  IF NOT public._verify_pin_any(_pin, _stored) THEN RETURN FALSE; END IF;

  -- Auto-upgrade
  IF NOT public._is_bcrypt(_stored) THEN
    UPDATE public.tenants
    SET admin_pin_hash = crypt(_pin, gen_salt('bf', 10)), updated_at = now()
    WHERE id = _tenant_id;
  END IF;

  RETURN TRUE;
END;
$$;

-- New: set first-time admin PIN using bcrypt
CREATE OR REPLACE FUNCTION public.set_admin_pin_v2(_session_token TEXT, _pin TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _tenant_id UUID;
BEGIN
  SELECT tenant_id INTO _tenant_id FROM public.tenant_sessions
   WHERE token = _session_token AND expires_at > now();
  IF _tenant_id IS NULL THEN RETURN FALSE; END IF;

  UPDATE public.tenants
  SET admin_pin_hash = crypt(_pin, gen_salt('bf', 10)), updated_at = now()
  WHERE id = _tenant_id AND admin_pin_hash IS NULL;
  RETURN FOUND;
END;
$$;

-- Tenant data access via session token
CREATE OR REPLACE FUNCTION public.get_tenant_data_v2(_session_token TEXT)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tenant_id UUID;
  _data JSONB;
BEGIN
  SELECT s.tenant_id INTO _tenant_id
   FROM public.tenant_sessions s
   JOIN public.tenants t ON t.id = s.tenant_id
   WHERE s.token = _session_token
     AND s.expires_at > now()
     AND t.status IN ('trial', 'active');
  IF _tenant_id IS NULL THEN RETURN NULL; END IF;

  SELECT data INTO _data FROM public.tenant_data WHERE tenant_id = _tenant_id;
  RETURN COALESCE(_data, '{}'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.save_tenant_data_v2(_session_token TEXT, _data JSONB)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _tenant_id UUID;
BEGIN
  SELECT s.tenant_id INTO _tenant_id
   FROM public.tenant_sessions s
   JOIN public.tenants t ON t.id = s.tenant_id
   WHERE s.token = _session_token
     AND s.expires_at > now()
     AND t.status IN ('trial', 'active');
  IF _tenant_id IS NULL THEN RETURN FALSE; END IF;

  INSERT INTO public.tenant_data (tenant_id, data) VALUES (_tenant_id, _data)
  ON CONFLICT (tenant_id) DO UPDATE SET data = EXCLUDED.data, updated_at = now();
  RETURN TRUE;
END;
$$;

-- Cleanup expired sessions opportunistically
CREATE OR REPLACE FUNCTION public.cleanup_expired_sessions()
RETURNS VOID LANGUAGE sql SECURITY DEFINER
SET search_path = public
AS $$ DELETE FROM public.tenant_sessions WHERE expires_at < now() - INTERVAL '1 hour'; $$;

-- Make sure new tenants created from the admin panel use bcrypt going forward.
-- (The admin panel will be updated to call a helper that hashes server-side.)
CREATE OR REPLACE FUNCTION public.create_tenant_v2(
  _school_name TEXT,
  _school_pin TEXT,
  _contact_email TEXT DEFAULT NULL,
  _contact_phone TEXT DEFAULT NULL,
  _notes TEXT DEFAULT NULL,
  _start_trial BOOLEAN DEFAULT TRUE
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
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
    crypt(_school_pin, gen_salt('bf', 10)),
    _contact_email, _contact_phone, _notes,
    CASE WHEN _start_trial THEN 'trial'::tenant_status ELSE 'expired'::tenant_status END,
    'trial'::tenant_plan,
    CASE WHEN _start_trial THEN now() ELSE NULL END,
    CASE WHEN _start_trial THEN now() + INTERVAL '7 days' ELSE NULL END
  ) RETURNING id INTO _id;
  RETURN _id;
END;
$$;
