-- =====================================================================
-- 20260917000001_fix_student_double_count.sql
--
-- PROBLEM: Two bugs caused student counts to be inflated (up to 2x):
--
-- Bug 1: save_tenant_data_v3 set current_students = JSON_count + relational_count,
--        but students enrolled via bulkCreateStudents() exist in BOTH sources,
--        so they were double-counted on every sync push.
--
-- Bug 2: get_student_counts_by_school used GREATEST() across all three sources
--        which still returns a wrong (inflated) value when sources diverge.
--
-- FIX:
--   1. Rewrite get_student_counts_by_school to count ONLY from the students
--      relational table (status = 'active'). This is the single source of truth.
--   2. Rewrite save_tenant_data_v3 to set current_students from the students
--      table only - removing the JSON classRolls addend.
--      The on_student_change trigger handles incremental updates; this function
--      now only recalculates from the authoritative table on each push.
--   3. Recalculate current_students for ALL schools to clear accumulated drift.
-- =====================================================================


-- Fix 1: Rewrite get_student_counts_by_school
CREATE OR REPLACE FUNCTION public.get_student_counts_by_school()
RETURNS TABLE(school_id UUID, student_count INT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT
    s.id AS school_id,
    COALESCE(sub.cnt, 0)::int AS student_count
  FROM public.schools s
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::int AS cnt
    FROM public.students st
    WHERE st.school_id = s.id
      AND st.status = 'active'
  ) sub ON true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_student_counts_by_school() TO authenticated;


-- Fix 2: Rewrite save_tenant_data_v3 (remove JSON double-add)
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

GRANT EXECUTE ON FUNCTION public.save_tenant_data_v3(text, int, jsonb) TO anon, authenticated;


-- Fix 3: Recalculate current_students for ALL schools (clear drift)
UPDATE public.schools s
SET current_students = (
  SELECT COUNT(*)::int
  FROM public.students st
  WHERE st.school_id = s.id
    AND st.status = 'active'
),
updated_at = now();
