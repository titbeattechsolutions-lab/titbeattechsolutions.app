-- Surface and optionally purge orphaned schools rows.
-- An "orphaned school" is a row in public.schools where the tenant_id FK
-- points to a tenant that no longer exists. These should never occur if
-- ON DELETE CASCADE is correctly set, but can appear from failed provisions
-- or manual service-role deletes.

-- Read-only RPC: returns all orphaned school rows for inspection.
CREATE OR REPLACE FUNCTION public.find_orphaned_schools()
RETURNS TABLE(
  school_id   UUID,
  school_name TEXT,
  tenant_id   UUID,
  created_at  TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
    SELECT s.id, s.name, s.tenant_id, s.created_at
      FROM public.schools s
     WHERE NOT EXISTS (
       SELECT 1 FROM public.tenants t WHERE t.id = s.tenant_id
     );
END;
$$;

-- Destructive RPC: removes all orphaned school rows (use after inspection).
CREATE OR REPLACE FUNCTION public.cleanup_orphaned_schools()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _deleted INTEGER;
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  DELETE FROM public.schools s
   WHERE NOT EXISTS (
     SELECT 1 FROM public.tenants t WHERE t.id = s.tenant_id
   );

  GET DIAGNOSTICS _deleted = ROW_COUNT;
  RETURN _deleted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.find_orphaned_schools()    TO authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_orphaned_schools() TO authenticated;
