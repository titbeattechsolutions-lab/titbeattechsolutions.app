-- Two new SECURITY DEFINER RPCs to replace the remaining bare table updates
-- in SuperAdmin.tsx that were failing with 403 / bcrypt permission errors.
--
-- 1. reset_admin_pin_to_null   — clears the admin PIN (forces re-setup on next login)
-- 2. extend_tenant_subscription — records a payment activation on the tenants row

-- ── 1. reset_admin_pin_to_null ───────────────────────────────────────────────
-- Replaces the bare: supabase.from("tenants").update({ admin_pin_hash: null })
-- The trigger _enforce_bcrypt_pins only fires on school_pin_hash / admin_pin_hash
-- column updates, so we must SECURITY DEFINER this to bypass RLS cleanly.

CREATE OR REPLACE FUNCTION public.reset_admin_pin_to_null(_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden: super_admin only';
  END IF;

  IF _tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id is required';
  END IF;

  UPDATE public.tenants
     SET admin_pin_hash = NULL, updated_at = now()
   WHERE id = _tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'tenant not found: %', _tenant_id;
  END IF;

  -- Audit the reset
  INSERT INTO public.activity_logs (school_id, action, details)
  SELECT s.id,
         'admin_pin_reset',
         jsonb_build_object('tenant_id', _tenant_id, 'performed_by', auth.uid())
    FROM public.schools s
   WHERE s.tenant_id = _tenant_id
   LIMIT 1;

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reset_admin_pin_to_null(UUID) TO authenticated;


-- ── 2. extend_tenant_subscription ────────────────────────────────────────────
-- Replaces the bare: supabase.from("tenants").update({ status, plan, ... })
-- Atomically activates a tenant and records the subscription window.

CREATE OR REPLACE FUNCTION public.extend_tenant_subscription(
  _tenant_id             UUID,
  _plan                  TEXT,       -- 'termly' | 'yearly'
  _subscription_starts_at TIMESTAMPTZ,
  _subscription_ends_at   TIMESTAMPTZ
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden: super_admin only';
  END IF;

  IF _tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id is required';
  END IF;

  IF _plan NOT IN ('termly', 'yearly', 'trial') THEN
    RAISE EXCEPTION 'invalid plan: must be termly, yearly, or trial';
  END IF;

  UPDATE public.tenants
     SET status                  = 'active',
         plan                    = _plan::tenant_plan,
         subscription_starts_at  = _subscription_starts_at,
         subscription_ends_at    = _subscription_ends_at,
         updated_at              = now()
   WHERE id = _tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'tenant not found: %', _tenant_id;
  END IF;

  -- Mirror status=active on the linked schools row (keeps PlatformStatsPage in sync)
  UPDATE public.schools
     SET status = 'active'
   WHERE tenant_id = _tenant_id;

  -- Audit
  INSERT INTO public.activity_logs (school_id, action, details)
  SELECT s.id,
         'subscription_extended',
         jsonb_build_object(
           'plan',    _plan,
           'ends_at', _subscription_ends_at,
           'performed_by', auth.uid()
         )
    FROM public.schools s
   WHERE s.tenant_id = _tenant_id
   LIMIT 1;

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.extend_tenant_subscription(UUID, TEXT, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
