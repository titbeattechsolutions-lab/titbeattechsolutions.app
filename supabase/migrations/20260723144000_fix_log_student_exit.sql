-- =====================================================================
-- Migration: Fix log_student_exit for PIN Auth users
-- =====================================================================

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
BEGIN
  -- Get the caller's school_id and verify they are an admin
  IF auth.uid() IS NOT NULL THEN
    SELECT school_id INTO _school_id
    FROM public.profiles
    WHERE id = auth.uid() AND LOWER(role) IN ('school_admin', 'principal', 'headmaster', 'headmistress');
  ELSE
    -- Custom Header Architecture support for PIN-only tenants
    _school_id := public.get_tenant_from_session();
  END IF;

  IF _school_id IS NULL THEN
    RAISE EXCEPTION 'Forbidden: Only school administrators can modify student enrollment status.';
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
    auth.uid()
  );
END;
$$;
