-- =====================================================================
-- Migration: Extend tenant_sessions for Staff Identity
-- Description: Completely bypasses GoTrue Auth for staff by tracking
-- their role securely inside the Custom Header Session mechanism.
-- Resolves UUID constraint conflicts by using unique column names.
-- =====================================================================

-- 1. Extend the session table using uniquely named columns to avoid conflicts
ALTER TABLE public.tenant_sessions
  ADD COLUMN IF NOT EXISTS session_staff_id TEXT,
  ADD COLUMN IF NOT EXISTS session_staff_role TEXT;

-- 2. Update log_staff_session_event to track the staff identity into the session
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

  -- Dual-Write B: Attach the staff identity to the tenant_session if login
  IF _action = 'login' THEN
    UPDATE public.tenant_sessions
    SET session_staff_id = _staff_member_id, session_staff_role = _role
    WHERE token = _session_token;
  END IF;

  -- Resolve school_id for the modern schema
  SELECT id INTO _school_id FROM public.schools WHERE tenant_id = _tenant_id;
  IF _school_id IS NOT NULL THEN
    INSERT INTO public.session_logs (
      school_id, staff_member_id, user_name, role, action, ip_address
    ) VALUES (
      _school_id, _staff_member_id, _staff_name, _role, _action, _ip_address
    );
  END IF;
END;
$$;


-- 3. Update log_student_exit to read identity purely from tenant_sessions
CREATE OR REPLACE FUNCTION public.log_student_exit(
  _student_id UUID,
  _new_status TEXT,
  _academic_year TEXT,
  _reason TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _school_id UUID;
  _tenant_id UUID;
  _staff_role TEXT;
BEGIN
  -- We now completely bypass auth.uid() for staff!
  -- 1. Extract the active session from the Custom Header
  SELECT tenant_id, session_staff_role INTO _tenant_id, _staff_role
  FROM public.tenant_sessions
  WHERE token = (current_setting('request.headers', true)::json->>'x-tenant-session');

  -- 2. Map tenant_id to the actual school_id
  SELECT id INTO _school_id FROM public.schools WHERE tenant_id = _tenant_id;

  IF _school_id IS NULL THEN
    RAISE EXCEPTION 'Forbidden: Invalid session or school not found.';
  END IF;

  -- 3. Verify they have an admin role
  --    Note: roles might come in as "Administrator", "Principal", etc.
  IF LOWER(COALESCE(_staff_role, '')) NOT IN ('school_admin', 'administrator', 'principal', 'headmaster', 'headmistress') THEN
    RAISE EXCEPTION 'Forbidden: Only school administrators can modify student enrollment status. Found role: %', _staff_role;
  END IF;

  -- Verify the student belongs to the caller's school
  IF NOT EXISTS (SELECT 1 FROM public.students WHERE id = _student_id AND school_id = _school_id) THEN
    RAISE EXCEPTION 'Student not found or access denied.';
  END IF;

  -- Verify valid status
  IF _new_status NOT IN ('graduated', 'withdrawn', 'suspended', 'active') THEN
    RAISE EXCEPTION 'Invalid status: %', _new_status;
  END IF;

  -- 1. Update the student's status
  UPDATE public.students
  SET status = _new_status, updated_at = NOW()
  WHERE id = _student_id;

  -- 2. Insert the audit trail log (map 'active' back to 'readmitted' for the log)
  INSERT INTO public.student_lifecycle_events (
    school_id, student_id, event_type, academic_year, reason, recorded_by
  ) VALUES (
    _school_id,
    _student_id,
    CASE WHEN _new_status = 'active' THEN 'readmitted' ELSE _new_status END,
    _academic_year,
    _reason,
    NULL -- We are bypassing GoTrue auth.uid() entirely
  );
END;
$$;
