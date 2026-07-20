-- 1. Redefine the dual-write bridge to securely capture the client's IP address from headers
CREATE OR REPLACE FUNCTION public.log_staff_session_event(
  _session_token TEXT,
  _staff_member_id TEXT,
  _staff_name TEXT,
  _role TEXT,
  _action TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tenant_id UUID;
  _school_id UUID;
  _ip_address TEXT;
BEGIN
  -- Extract IP securely from PostgREST headers (prevent frontend spoofing)
  _ip_address := current_setting('request.headers', true)::json->>'x-forwarded-for';
  IF _ip_address IS NULL THEN
    _ip_address := current_setting('request.headers', true)::json->>'x-real-ip';
  END IF;

  -- Validate session and resolve tenant_id
  SELECT tenant_id INTO _tenant_id
  FROM public.tenant_sessions
  WHERE token = _session_token AND expires_at > now();

  IF _tenant_id IS NULL THEN
    RETURN;
  END IF;

  -- Dual-Write A: Legacy staff_session_logs
  INSERT INTO public.staff_session_logs (
    tenant_id, staff_member_id, staff_name, role, action
  ) VALUES (
    _tenant_id, _staff_member_id, _staff_name, _role, _action
  );

  -- Resolve school_id for the modern schema
  SELECT id INTO _school_id FROM public.schools WHERE tenant_id = _tenant_id;

  -- Dual-Write B: Modern session_logs (now with IP tracking)
  IF _school_id IS NOT NULL THEN
    INSERT INTO public.session_logs (
      school_id, staff_member_id, user_name, role, action, ip_address
    ) VALUES (
      _school_id, _staff_member_id, _staff_name, _role, _action, _ip_address
    );
  END IF;
END;
$$;

-- 2. Create authoritative Active Staff count RPC (Used by TenantActivityAudit.tsx)
CREATE OR REPLACE FUNCTION public.get_tenant_staff_count(_school_id UUID)
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _count INT;
BEGIN
  SELECT jsonb_array_length(COALESCE(td.data->'staffList', '[]'::jsonb)) INTO _count
  FROM public.tenant_data td
  JOIN public.schools s ON s.tenant_id = td.tenant_id
  WHERE s.id = _school_id;
  
  RETURN COALESCE(_count, 0);
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_tenant_staff_count(UUID) TO authenticated;

-- 3. Create missing Global Total Teachers RPC (Used by PlatformStatsPage.tsx)
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
  LEFT JOIN LATERAL (
    SELECT jsonb_array_length(COALESCE(td.data->'staffList', '[]'::jsonb))::int AS cnt
    FROM public.tenant_data td
    WHERE td.tenant_id = s.tenant_id
  ) sub ON true;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_teacher_counts_by_school() TO authenticated;
