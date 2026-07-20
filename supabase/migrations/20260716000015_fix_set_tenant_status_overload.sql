-- RESOLVE OVERLOAD COLLISION: public.set_tenant_status
--
-- Root cause: migration 20260716000012 was overwritten with a different
-- parameter order (_school_id moved from position 2 to position 3).
-- Postgres treated this as a NEW overload rather than replacing the old one,
-- leaving two candidates with the same types in different positions:
--
--   public.set_tenant_status(uuid, uuid, text)  ← old (original migration)
--   public.set_tenant_status(uuid, text, uuid)  ← new (overwritten migration)
--
-- Postgres cannot resolve named-argument calls when two overloads are
-- equally valid, producing: "could not choose best candidate function".
--
-- Fix: DROP both overloads explicitly by full type signature, then
--      recreate exactly one canonical version.
--
-- All frontend callers use NAMED parameters only (_tenant_id, _status,
-- _school_id) so the final argument order is irrelevant to them.

-- ── 1. Drop both overloads ────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.set_tenant_status(UUID, UUID, TEXT);
DROP FUNCTION IF EXISTS public.set_tenant_status(UUID, TEXT, UUID);

-- ── 2. Recreate the single canonical version ──────────────────────────────────
--
-- Signature: (_tenant_id UUID, _status TEXT, _school_id UUID DEFAULT NULL)
--
-- Design rules preserved from the original implementation:
--   • _school_id is OPTIONAL — omit it when calling from SuperAdmin.tsx where
--     only a tenant_id is available; the RPC resolves it from the FK.
--   • Gracefully skips the schools UPDATE when no linked school row exists
--     (legacy tenants created via CreateTenantDialog have no schools row).
--   • Purges all active sessions on suspend.
--   • Writes an audit entry to activity_logs (school_id nullable).
--   • SECURITY DEFINER — bypasses RLS and bcrypt trigger permission issues.

CREATE FUNCTION public.set_tenant_status(
  _tenant_id UUID,
  _status    TEXT,
  _school_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _resolved_school_id UUID;
BEGIN
  -- 1. Security gate
  IF NOT public.has_role(auth.uid(), 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden: super_admin only';
  END IF;

  IF _tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id is required';
  END IF;

  -- 2. Validate status value
  IF _status NOT IN ('active', 'suspended') THEN
    RAISE EXCEPTION 'invalid status: must be ''active'' or ''suspended''';
  END IF;

  -- 3. Resolve school_id (use caller-supplied value, or look it up from FK)
  IF _school_id IS NOT NULL THEN
    _resolved_school_id := _school_id;
  ELSE
    SELECT id INTO _resolved_school_id
      FROM public.schools
     WHERE tenant_id = _tenant_id
     LIMIT 1;
    -- Still NULL = tenant has no schools row yet — allowed (legacy tenants).
  END IF;

  -- 4. Update the authoritative tenants record
  UPDATE public.tenants
     SET status = _status::tenant_status, updated_at = now()
   WHERE id = _tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'tenant not found: %', _tenant_id;
  END IF;

  -- 5. Mirror status on the schools row (UI / PlatformStatsPage source of truth)
  --    No-op when the tenant has no linked school (orphaned / legacy tenant).
  IF _resolved_school_id IS NOT NULL THEN
    UPDATE public.schools
       SET status = _status
     WHERE id = _resolved_school_id AND tenant_id = _tenant_id;
  END IF;

  -- 6. Purge active sessions on suspend (security hardening)
  IF _status = 'suspended' THEN
    DELETE FROM public.tenant_sessions WHERE tenant_id = _tenant_id;
  END IF;

  -- 7. Audit the administrative action (school_id nullable — safe for legacy tenants)
  INSERT INTO public.activity_logs (school_id, action, details)
  VALUES (
    _resolved_school_id,
    'tenant_status_changed',
    jsonb_build_object(
      'new_status',   _status,
      'tenant_id',    _tenant_id,
      'performed_by', auth.uid()
    )
  );

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_tenant_status(UUID, TEXT, UUID) TO authenticated;
