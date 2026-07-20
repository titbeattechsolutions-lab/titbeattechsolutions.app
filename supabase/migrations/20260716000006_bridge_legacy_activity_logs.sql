-- Redefine the legacy log_tenant_activity RPC to dual-write to the modern schema
-- This acts as a safety net for any clients running older frontend builds or cached code

CREATE OR REPLACE FUNCTION public.log_tenant_activity(
  _tenant_id UUID,
  _staff_id TEXT,
  _action TEXT,
  _details TEXT DEFAULT NULL,
  _timestamp TIMESTAMPTZ DEFAULT now()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _school_id UUID;
BEGIN
  -- 1. Insert into the legacy table (maintains backward compatibility if anything still reads it)
  INSERT INTO public.tenant_activity_logs (
    tenant_id, staff_id, action, details, timestamp
  ) VALUES (
    _tenant_id, _staff_id, _action, _details, _timestamp
  );

  -- 2. Resolve school_id for the modern schema
  SELECT id INTO _school_id FROM public.schools WHERE tenant_id = _tenant_id;
  
  -- 3. Forward the action into the modern activity_logs schema so dashboards see it immediately
  INSERT INTO public.activity_logs (
    school_id, 
    action, 
    details, 
    created_at
  ) VALUES (
    _school_id, 
    _action, 
    jsonb_build_object('note', _details, 'actor', _staff_id, 'migrated', false), 
    _timestamp
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_tenant_activity(UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ) TO anon, authenticated;
