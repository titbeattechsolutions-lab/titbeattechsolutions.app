-- =====================================================================
-- 018: attendance summary RPCs for the live dashboard widget
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_today_attendance_summary(p_school_id UUID)
RETURNS TABLE (
  total_classes_with_attendance BIGINT,
  total_present                 BIGINT,
  total_absent                  BIGINT,
  attendance_rate               NUMERIC
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    COUNT(*)                                              AS total_classes_with_attendance,
    SUM(present_count)                                    AS total_present,
    SUM(absent_count)                                     AS total_absent,
    CASE
      WHEN SUM(present_count + absent_count) = 0 THEN 0
      ELSE ROUND(
        SUM(present_count)::NUMERIC /
        SUM(present_count + absent_count)::NUMERIC * 100, 1
      )
    END                                                   AS attendance_rate
  FROM public.attendance
  WHERE school_id = p_school_id
    AND date = CURRENT_DATE;
$$;

GRANT EXECUTE ON FUNCTION public.get_today_attendance_summary(UUID) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_today_attendance_by_class(p_school_id UUID)
RETURNS TABLE (
  class_id      UUID,
  class_name    TEXT,
  present_count INTEGER,
  absent_count  INTEGER,
  taken_by_name TEXT,
  taken_at      TIMESTAMPTZ
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    a.class_id::UUID,
    a.class_name,
    a.present_count,
    a.absent_count,
    a.taken_by_name,
    a.created_at AS taken_at
  FROM public.attendance a
  WHERE a.school_id = p_school_id
    AND a.date = CURRENT_DATE
  ORDER BY a.class_name;
$$;

GRANT EXECUTE ON FUNCTION public.get_today_attendance_by_class(UUID) TO authenticated;
