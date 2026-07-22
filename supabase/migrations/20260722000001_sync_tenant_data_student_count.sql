-- Sync the schools.current_students column with the JSON offline state upon save
CREATE OR REPLACE FUNCTION public.save_tenant_data_v3(_session_token TEXT, _expected_rev INT, _data JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE 
  _tenant_id UUID;
  _current_data JSONB;
  _current_rev INT;
  _new_rev INT;
  _success BOOLEAN := false;
BEGIN
  -- Authenticate session
  SELECT s.tenant_id INTO _tenant_id
   FROM public.tenant_sessions s
   JOIN public.tenants t ON t.id = s.tenant_id
   WHERE s.token = _session_token
     AND s.expires_at > now()
     AND t.status IN ('trial', 'active');
  IF _tenant_id IS NULL THEN 
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized'); 
  END IF;

  -- Lock row for update and get current data
  SELECT data INTO _current_data
  FROM public.tenant_data
  WHERE tenant_id = _tenant_id
  FOR UPDATE;

  -- Handle initialization (if row doesn't exist)
  IF NOT FOUND THEN
    IF _expected_rev = 0 THEN
      INSERT INTO public.tenant_data (tenant_id, data) 
      VALUES (_tenant_id, _data || jsonb_build_object('_rev', 1, '_updatedAt', now()::text));
      _new_rev := 1;
      _success := true;
    ELSE
      RETURN jsonb_build_object('success', false, 'error', 'rev_conflict', 'currentData', '{}'::jsonb);
    END IF;
  ELSE
    -- Extract current rev
    _current_rev := COALESCE((_current_data->>'_rev')::int, 0);

    -- Check rev match
    IF _current_rev = _expected_rev THEN
      UPDATE public.tenant_data
      SET data = _data || jsonb_build_object('_rev', _current_rev + 1, '_updatedAt', now()::text), 
          updated_at = now()
      WHERE tenant_id = _tenant_id;
      _new_rev := _current_rev + 1;
      _success := true;
    ELSE
      RETURN jsonb_build_object('success', false, 'error', 'rev_conflict', 'currentData', _current_data);
    END IF;
  END IF;

  -- If successful, update the schools.current_students column to enforce single source of truth
  IF _success THEN
    UPDATE public.schools
    SET 
      current_students = (
        SELECT COALESCE(SUM(jsonb_array_length(v.value))::int, 0)
        FROM jsonb_each(_data->'classRolls') AS v
      ) + (
        SELECT COUNT(*)::int
        FROM public.students
        WHERE school_id = public.schools.id AND status = 'active'
      ),
      updated_at = now()
    WHERE tenant_id = _tenant_id;
    
    RETURN jsonb_build_object('success', true, 'rev', _new_rev);
  END IF;

END;
$$;

GRANT EXECUTE ON FUNCTION public.save_tenant_data_v3(text, int, jsonb) TO anon, authenticated;
