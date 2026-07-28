-- 1. Tenant serial code
CREATE SEQUENCE IF NOT EXISTS public.tenant_code_seq START 1;

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS tenant_code TEXT;

-- Backfill existing rows
UPDATE public.tenants
SET tenant_code = 'T-' || lpad(nextval('public.tenant_code_seq')::text, 6, '0')
WHERE tenant_code IS NULL;

ALTER TABLE public.tenants
  ALTER COLUMN tenant_code SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS tenants_tenant_code_uniq
  ON public.tenants(tenant_code);

-- Auto-assign on insert
CREATE OR REPLACE FUNCTION public._assign_tenant_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.tenant_code IS NULL OR NEW.tenant_code = '' THEN
    NEW.tenant_code := 'T-' || lpad(nextval('public.tenant_code_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_tenant_code ON public.tenants;
CREATE TRIGGER trg_assign_tenant_code
BEFORE INSERT ON public.tenants
FOR EACH ROW EXECUTE FUNCTION public._assign_tenant_code();

-- Re-attach bcrypt enforcement trigger if missing
DROP TRIGGER IF EXISTS trg_enforce_bcrypt_pins ON public.tenants;
CREATE TRIGGER trg_enforce_bcrypt_pins
BEFORE INSERT OR UPDATE ON public.tenants
FOR EACH ROW EXECUTE FUNCTION public._enforce_bcrypt_pins();

-- 2. Suspend duplicate tenant RPC
CREATE OR REPLACE FUNCTION public.suspend_duplicate_tenant(_tenant_id uuid, _reason text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id required';
  END IF;

  UPDATE public.tenants
    SET status = 'suspended', updated_at = now()
   WHERE id = _tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'tenant not found';
  END IF;

  DELETE FROM public.tenant_sessions WHERE tenant_id = _tenant_id;

  INSERT INTO public.tenant_auth_audit(event_type, tenant_id, success, reason)
  VALUES ('admin_pin_set', _tenant_id, TRUE,
          'tenant suspended as duplicate by super_admin: ' || COALESCE(_reason, 'no reason given'));

  RETURN TRUE;
END;
$$;

-- 3. RLS regression check RPC
CREATE OR REPLACE FUNCTION public.security_regression_check()
RETURNS TABLE(check_name text, passed boolean, detail text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tables TEXT[] := ARRAY[
    'tenants','tenant_data','tenant_sessions',
    'super_admin_bootstrap_tokens','super_admin_token_audit',
    'tenant_auth_audit','user_roles','subscription_payments'
  ];
  _t TEXT;
  _enabled BOOLEAN;
  _restrictive_count INT;
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- RLS enabled on every sensitive table
  FOREACH _t IN ARRAY _tables LOOP
    SELECT c.relrowsecurity INTO _enabled
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname='public' AND c.relname=_t;
    RETURN QUERY SELECT
      'rls_enabled:' || _t,
      COALESCE(_enabled, FALSE),
      CASE WHEN _enabled THEN 'RLS enabled' ELSE 'RLS DISABLED — critical' END;
  END LOOP;

  -- Audit tables must have a RESTRICTIVE deny-write policy
  FOR _t IN SELECT unnest(ARRAY['super_admin_token_audit','tenant_auth_audit']) LOOP
    SELECT count(*) INTO _restrictive_count
      FROM pg_policies
     WHERE schemaname='public' AND tablename=_t AND permissive='RESTRICTIVE';
    RETURN QUERY SELECT
      'audit_write_locked:' || _t,
      _restrictive_count >= 1,
      _restrictive_count || ' restrictive policy(ies) found';
  END LOOP;

  -- Tenants: anonymous role must be denied
  SELECT count(*) INTO _restrictive_count
    FROM pg_policies
   WHERE schemaname='public' AND tablename='tenants'
     AND permissive='RESTRICTIVE'
     AND 'anon' = ANY(roles);
  RETURN QUERY SELECT
    'tenants_deny_anon',
    _restrictive_count >= 1,
    _restrictive_count || ' anon-deny policy(ies) found';

  -- user_roles must NOT be self-writable
  SELECT count(*) INTO _restrictive_count
    FROM pg_policies
   WHERE schemaname='public' AND tablename='user_roles'
     AND permissive='RESTRICTIVE';
  RETURN QUERY SELECT
    'user_roles_self_assign_blocked',
    _restrictive_count >= 1,
    _restrictive_count || ' restrictive policy(ies) on user_roles';
END;
$$;
