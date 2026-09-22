-- =====================================================================
-- Auto-Sync Legacy Students in save_tenant_data_v3
-- =====================================================================

CREATE OR REPLACE FUNCTION public.save_tenant_data_v3(_session_token TEXT, _expected_rev INT, _data JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tenant_id UUID;
  _school_id UUID;
  _current_data JSONB;
  _current_rev INT;
  _new_rev INT;
  _success BOOLEAN := false;
  _cls_name TEXT;
  _students JSONB;
  _student JSONB;
  _adm_no TEXT;
  _full_name TEXT;
  _first TEXT;
  _last TEXT;
  _gender TEXT;
BEGIN
  SELECT s.tenant_id INTO _tenant_id
   FROM public.tenant_sessions s
   JOIN public.tenants t ON t.id = s.tenant_id
   WHERE s.token = _session_token
     AND s.expires_at > now()
     AND t.status IN ('trial', 'active');
  IF _tenant_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  SELECT data INTO _current_data
  FROM public.tenant_data
  WHERE tenant_id = _tenant_id
  FOR UPDATE;

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
    _current_rev := COALESCE((_current_data->>'_rev')::int, 0);

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

  IF _success THEN
    SELECT id INTO _school_id FROM public.schools WHERE tenant_id = _tenant_id LIMIT 1;
    
    IF _school_id IS NOT NULL AND _data->'classRolls' IS NOT NULL THEN
      FOR _cls_name, _students IN SELECT key, value FROM jsonb_each(_data->'classRolls') LOOP
        FOR _student IN SELECT * FROM jsonb_array_elements(_students) LOOP
          IF (_student->>'suggested') IS NULL OR (_student->>'suggested')::boolean = false THEN
            _adm_no := trim(_student->>'admNo');
            
            IF _adm_no IS NOT NULL AND _adm_no != '' THEN
              _full_name := trim(_student->>'name');
              _first := split_part(_full_name, ' ', 1);
              _last := trim(substring(_full_name from (length(_first) + 1)));
              IF _last = '' THEN _last := '.'; END IF;
              
              _gender := lower(trim(_student->>'gender'));
              IF _gender NOT IN ('male', 'female') THEN _gender := NULL; END IF;
              
              BEGIN
                INSERT INTO public.students (
                  school_id, admission_no, first_name, last_name, class_name, gender, status
                ) VALUES (
                  _school_id, _adm_no, _first, _last, _cls_name, _gender, 'active'
                )
                ON CONFLICT (school_id, admission_no) DO UPDATE
                SET class_name = EXCLUDED.class_name,
                    gender = COALESCE(EXCLUDED.gender, public.students.gender);
              EXCEPTION WHEN OTHERS THEN
                -- ignore specific row failures to not fail the whole sync
              END;
            END IF;
          END IF;
        END LOOP;
      END LOOP;
    END IF;

    UPDATE public.schools
    SET
      current_students = (
        SELECT COUNT(*)::int
        FROM public.students
        WHERE school_id = public.schools.id
          AND status = 'active'
      ),
      updated_at = now()
    WHERE tenant_id = _tenant_id;

    RETURN jsonb_build_object('success', true, 'rev', _new_rev);
  END IF;

END;
$$;