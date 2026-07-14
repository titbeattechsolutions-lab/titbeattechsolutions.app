CREATE OR REPLACE FUNCTION public.get_student_counts_by_school()
RETURNS TABLE(school_id UUID, student_count INT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT s.id, COALESCE(sub.cnt, 0)::int
  FROM public.schools s
  LEFT JOIN LATERAL (
    SELECT SUM(jsonb_array_length(v.value))::int AS cnt
    FROM public.tenant_data td, jsonb_each(td.data->'classRolls') AS v
    WHERE td.tenant_id = s.tenant_id
  ) sub ON true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_student_counts_by_school() TO authenticated;
