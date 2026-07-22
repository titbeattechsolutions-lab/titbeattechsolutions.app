-- =====================================================================
-- Migration: Student Lifecycle Events (Graduation & Withdrawal)
-- =====================================================================

-- 1. Create the audit table for historical tracking
CREATE TABLE IF NOT EXISTS public.student_lifecycle_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('graduated', 'withdrawn', 'suspended', 'readmitted')),
  academic_year TEXT NOT NULL,
  reason TEXT,
  recorded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lifecycle_school ON public.student_lifecycle_events(school_id);
CREATE INDEX IF NOT EXISTS idx_lifecycle_student ON public.student_lifecycle_events(student_id);

ALTER TABLE public.student_lifecycle_events ENABLE ROW LEVEL SECURITY;

-- Staff can read lifecycle events for their school
DROP POLICY IF EXISTS "lifecycle_read_staff" ON public.student_lifecycle_events;
CREATE POLICY "lifecycle_read_staff"
  ON public.student_lifecycle_events FOR SELECT
  USING (
    school_id = (SELECT school_id FROM public.profiles WHERE id = auth.uid())
    AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('teacher', 'head_teacher', 'principal', 'school_admin', 'superadmin')
  );

-- 2. Create RPC to securely log an exit and update the student status atomically
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
  SELECT school_id INTO _school_id
  FROM public.profiles
  WHERE id = auth.uid() AND role IN ('school_admin', 'principal');

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
  -- (The update_student_count trigger will automatically fire and adjust school capacity)
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
