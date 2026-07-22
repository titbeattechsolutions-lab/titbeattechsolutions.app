-- Update the superadmin student count RPC to include both relational and JSON records
CREATE OR REPLACE FUNCTION public.get_student_counts_by_school()
RETURNS TABLE(school_id UUID, student_count INT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT 
    s.id, 
    (COALESCE(sub_json.cnt, 0)::int + COALESCE(sub_rel.cnt, 0)::int) AS student_count
  FROM public.schools s
  LEFT JOIN LATERAL (
    SELECT SUM(jsonb_array_length(v.value))::int AS cnt
    FROM public.tenant_data td, jsonb_each(td.data->'classRolls') AS v
    WHERE td.tenant_id = s.tenant_id
  ) sub_json ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::int AS cnt
    FROM public.students st
    WHERE st.school_id = s.id AND st.status = 'active'
  ) sub_rel ON true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_student_counts_by_school() TO authenticated;
