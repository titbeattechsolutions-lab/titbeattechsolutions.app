-- =====================================================================
-- 20260923000001_fix_double_count_student_stats.sql
-- Root-cause fix for inflated student counts in schools.current_students
-- and get_student_counts_by_school().
--
-- Problem:
--   save_tenant_data_v3 was setting:
--     current_students = SUM(classRolls) + COUNT(public.students)
--   For migrated schools, students exist in BOTH JSON classRolls AND
--   public.students, so they were counted twice.
--   The subsequent GREATEST() fix in get_student_counts_by_school picked
--   s.current_students (the doubled value) as the winner every time.
--
-- Fix:
--   1. save_tenant_data_v3: Use GREATEST(classRolls_count, relational_count)
--      so whichever source is more complete wins, never both summed.
--   2. get_student_counts_by_school: Same GREATEST logic, but drop the
--      s.current_students term (it was always ≥ the others after the bug).
--   3. One-time backfill: recalculate current_students for all schools.
-- =====================================================================

-- ── 1. Fix save_tenant_data_v3 ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.save_tenant_data_v3(
  _session_token TEXT,
  _expected_rev  INT,
  _data          JSONB
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tenant_id   UUID;
  _current_data JSONB;
  _current_rev  INT;
  _new_rev      INT;
  _success      BOOLEAN := false;
BEGIN
  -- Authenticate session
  SELECT s.tenant_id INTO _tenant_id
  FROM   public.tenant_sessions s
  JOIN   public.tenants t ON t.id = s.tenant_id
  WHERE  s.token       = _session_token
    AND  s.expires_at  > now()
    AND  t.status IN ('trial', 'active');

  IF _tenant_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  -- Lock row for update and get current data
  SELECT data INTO _current_data
  FROM   public.tenant_data
  WHERE  tenant_id = _tenant_id
  FOR UPDATE;

  -- Handle initialisation (if row doesn't exist)
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
      SET    data       = _data || jsonb_build_object('_rev', _current_rev + 1, '_updatedAt', now()::text),
             updated_at = now()
      WHERE  tenant_id = _tenant_id;
      _new_rev := _current_rev + 1;
      _success := true;
    ELSE
      RETURN jsonb_build_object('success', false, 'error', 'rev_conflict', 'currentData', _current_data);
    END IF;
  END IF;

  -- FIX: Use GREATEST instead of + to prevent double-counting students who
  -- appear in both JSON classRolls (offline state) and public.students (relational).
  -- Whichever count is higher is the authoritative enrollment figure.
  IF _success THEN
    UPDATE public.schools
    SET
      current_students = GREATEST(
        -- Count from offline JSON class rolls
        COALESCE((
          SELECT SUM(jsonb_array_length(v.value))::int
          FROM   jsonb_each(_data->'classRolls') AS v
        ), 0),
        -- Count from relational students table
        COALESCE((
          SELECT COUNT(*)::int
          FROM   public.students
          WHERE  school_id = public.schools.id
            AND  status = 'active'
        ), 0)
      ),
      updated_at = now()
    WHERE tenant_id = _tenant_id;

    RETURN jsonb_build_object('success', true, 'rev', _new_rev);
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_tenant_data_v3(text, int, jsonb) TO anon, authenticated;


-- ── 2. Fix get_student_counts_by_school ──────────────────────────────
-- Drop s.current_students from the GREATEST() because it was inflated by
-- the bug above. Now that save_tenant_data_v3 is fixed, just compare the
-- two authoritative sources directly.
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
    GREATEST(
      COALESCE(sub_json.cnt, 0)::int,
      COALESCE(sub_rel.cnt,  0)::int
    ) AS student_count
  FROM public.schools s
  LEFT JOIN LATERAL (
    SELECT SUM(jsonb_array_length(v.value))::int AS cnt
    FROM   public.tenant_data td,
           jsonb_each(td.data->'classRolls') AS v
    WHERE  td.tenant_id = s.tenant_id
  ) sub_json ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::int AS cnt
    FROM   public.students st
    WHERE  st.school_id = s.id
      AND  st.status = 'active'
  ) sub_rel ON true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_student_counts_by_school() TO authenticated;


-- ── 3. One-time backfill: correct current_students for every school ──
-- This recalculates the accurate value for every existing school using
-- the same GREATEST() logic now baked into save_tenant_data_v3.
UPDATE public.schools sch
SET
  current_students = GREATEST(
    COALESCE((
      SELECT SUM(jsonb_array_length(v.value))::int
      FROM   public.tenant_data td,
             jsonb_each(td.data->'classRolls') AS v
      WHERE  td.tenant_id = sch.tenant_id
    ), 0),
    COALESCE((
      SELECT COUNT(*)::int
      FROM   public.students st
      WHERE  st.school_id = sch.id
        AND  st.status = 'active'
    ), 0)
  ),
  updated_at = now();
