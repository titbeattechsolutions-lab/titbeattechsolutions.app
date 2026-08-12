-- 20260812000006_fix_teacher_counts_rpc.sql

CREATE OR REPLACE FUNCTION public.get_teacher_counts_by_school()
RETURNS TABLE(school_id UUID, teacher_count INT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT s.id, COALESCE(sub.cnt, 0)::int
  FROM public.schools s
  LEFT JOIN public.tenant_data td ON td.tenant_id = s.tenant_id
  LEFT JOIN LATERAL (
    SELECT count(*)::int AS cnt
    FROM jsonb_array_elements(COALESCE(td.data->'staffList', '[]'::jsonb)) AS obj
    WHERE obj->>'status' != 'revoked'
  ) sub ON true;
END;
$$;
