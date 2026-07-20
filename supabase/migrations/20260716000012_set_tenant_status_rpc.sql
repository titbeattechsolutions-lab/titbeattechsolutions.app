-- Atomic RPC to handle tenant status changes (active/suspended).
-- SAFE TO RUN REPEATEDLY (CREATE OR REPLACE).
--
-- Defensive Design:
--   • _school_id is OPTIONAL (DEFAULT NULL). When omitted, the RPC resolves
--     it from the tenants→schools FK — this allows DuplicatesBanner to call
--     the function with only _tenant_id without needing a separate lookup.
--   • If no matching schools row exists (orphaned tenant), the UPDATE is a
--     no-op rather than raising an exception — the tenant status still changes.
--   • Only crashes on genuinely missing tenant rows.

CREATE OR REPLACE FUNCTION public.set_tenant_status(
  _tenant_id UUID,
  _status     TEXT,
  _school_id  UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _resolved_school_id UUID;
BEGIN
  -- 1. Security: super_admin only
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

  -- 3. Resolve school_id — use provided value or look it up from the FK
  IF _school_id IS NOT NULL THEN
    _resolved_school_id := _school_id;
  ELSE
    SELECT id INTO _resolved_school_id
      FROM public.schools
     WHERE tenant_id = _tenant_id
     LIMIT 1;
    -- If still NULL, the tenant has no linked school row yet — that is allowed.
  END IF;

  -- 4. Update the authoritative tenants record (authentication source of truth)
  UPDATE public.tenants
     SET status = _status::tenant_status, updated_at = now()
   WHERE id = _tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'tenant not found: %', _tenant_id;
  END IF;

  -- 5. Mirror status on the schools row (UI / stats source of truth)
  --    Only runs when a school row exists — orphaned tenants skip silently.
  IF _resolved_school_id IS NOT NULL THEN
    UPDATE public.schools
       SET status = _status
     WHERE id = _resolved_school_id AND tenant_id = _tenant_id;
  END IF;

  -- 6. Purge active sessions on suspend (security hardening)
  IF _status = 'suspended' THEN
    DELETE FROM public.tenant_sessions WHERE tenant_id = _tenant_id;
  END IF;

  -- 7. Audit the administrative action
  INSERT INTO public.activity_logs (school_id, action, details)
  VALUES (
    _resolved_school_id,
    'tenant_status_changed',
    jsonb_build_object(
      'new_status',     _status,
      'tenant_id',      _tenant_id,
      'performed_by',   auth.uid()
    )
  );

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_tenant_status(UUID, TEXT, UUID) TO authenticated;
