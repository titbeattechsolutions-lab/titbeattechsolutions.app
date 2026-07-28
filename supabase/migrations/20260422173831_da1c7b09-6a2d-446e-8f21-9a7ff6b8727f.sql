-- =====================================================================
-- 1. Harden super_admin_token_audit: explicit deny for client writes
-- =====================================================================
-- Restrictive policy => writes only allowed if caller is super_admin.
-- Combined with no permissive INSERT/UPDATE/DELETE policy, this means:
--   * client INSERT/UPDATE/DELETE = denied (no permissive policy passes)
--   * SECURITY DEFINER fns = bypass RLS, always allowed
-- Defence-in-depth in case a permissive write policy is added later.
CREATE POLICY "Audit writes only via security definer"
  ON public.super_admin_token_audit
  AS RESTRICTIVE
  FOR ALL
  TO authenticated, anon
  USING (false)
  WITH CHECK (false);

-- =====================================================================
-- 2. New audit table for tenant-side authentication events
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.tenant_auth_audit (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type      TEXT NOT NULL CHECK (event_type IN (
    'school_pin_verify',
    'admin_pin_verify',
    'admin_pin_set'
  )),
  tenant_id       UUID,                 -- known only on success or admin events
  success         BOOLEAN NOT NULL,
  reason          TEXT,                 -- failure reason or note (never the PIN)
  session_ref     TEXT,                 -- short prefix (first 8 chars) of session token, never full token
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_taa_created ON public.tenant_auth_audit(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_taa_tenant  ON public.tenant_auth_audit(tenant_id);

ALTER TABLE public.tenant_auth_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins read tenant auth audit"
  ON public.tenant_auth_audit
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Tenant audit writes only via security definer"
  ON public.tenant_auth_audit
  AS RESTRICTIVE
  FOR ALL
  TO authenticated, anon
  USING (false)
  WITH CHECK (false);

-- =====================================================================
-- 3. Helper: short, non-sensitive reference for a session token
-- =====================================================================
CREATE OR REPLACE FUNCTION public._session_ref(_token TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN _token IS NULL OR length(_token) < 8 THEN NULL
    ELSE substr(_token, 1, 8) || '…'
  END;
$$;

-- =====================================================================
-- 4. verify_school_pin_v2 — log every attempt, bind token to matched tenant
-- =====================================================================
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
BEGIN
  IF _pin IS NULL OR length(_pin) < 4 THEN
    INSERT INTO public.tenant_auth_audit(event_type, success, reason)
    VALUES ('school_pin_verify', FALSE, 'malformed pin');
    RETURN;
  END IF;

  -- Scan tenants because hashes use random bcrypt salts
  FOR _t IN SELECT * FROM public.tenants LOOP
    IF public._verify_pin_any(_pin, _t.school_pin_hash) THEN
      -- Auto-upgrade legacy SHA-256 to bcrypt
      IF NOT public._is_bcrypt(_t.school_pin_hash) THEN
        UPDATE public.tenants
        SET school_pin_hash = crypt(_pin, gen_salt('bf', 10)),
            updated_at = now()
        WHERE id = _t.id;
      END IF;

      -- Issue a fresh session token bound to THIS tenant only
      _token := encode(gen_random_bytes(32), 'hex');
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

  -- No match
  INSERT INTO public.tenant_auth_audit(event_type, success, reason)
  VALUES ('school_pin_verify', FALSE, 'no tenant matched supplied pin');
END;
$$;

-- =====================================================================
-- 5. verify_admin_pin_v2 — strict session→tenant binding + logging
-- =====================================================================
CREATE OR REPLACE FUNCTION public.verify_admin_pin_v2(_session_token TEXT, _pin TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tenant_id UUID;
  _stored    TEXT;
BEGIN
  IF _session_token IS NULL OR _pin IS NULL THEN
    INSERT INTO public.tenant_auth_audit(event_type, success, reason, session_ref)
    VALUES ('admin_pin_verify', FALSE, 'missing token or pin', public._session_ref(_session_token));
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

  -- Auto-upgrade legacy hash
  IF NOT public._is_bcrypt(_stored) THEN
    UPDATE public.tenants
    SET admin_pin_hash = crypt(_pin, gen_salt('bf', 10)), updated_at = now()
    WHERE id = _tenant_id;
  END IF;

  INSERT INTO public.tenant_auth_audit(event_type, tenant_id, success, reason, session_ref)
  VALUES ('admin_pin_verify', _tenant_id, TRUE, 'admin verified',
          public._session_ref(_session_token));
  RETURN TRUE;
END;
$$;

-- =====================================================================
-- 6. set_admin_pin_v2 — log first-time admin setup
-- =====================================================================
CREATE OR REPLACE FUNCTION public.set_admin_pin_v2(_session_token TEXT, _pin TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  SET admin_pin_hash = crypt(_pin, gen_salt('bf', 10)), updated_at = now()
  WHERE id = _tenant_id AND admin_pin_hash IS NULL;
  _ok := FOUND;

  INSERT INTO public.tenant_auth_audit(event_type, tenant_id, success, reason, session_ref)
  VALUES ('admin_pin_set', _tenant_id, _ok,
          CASE WHEN _ok THEN 'admin pin established' ELSE 'admin pin already set' END,
          public._session_ref(_session_token));

  RETURN _ok;
END;
$$;
