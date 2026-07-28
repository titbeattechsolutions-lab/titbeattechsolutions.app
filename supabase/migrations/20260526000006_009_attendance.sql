-- =====================================================================
-- 009: attendance table
-- One row per class per day. records JSONB = { "student-uuid": { "present": bool, "remark": "" } }
-- Unique constraint prevents duplicate attendance for same class+date.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.attendance (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id      UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  class_id       UUID NOT NULL,
  class_name     TEXT NOT NULL,    -- denormalized
  date           DATE NOT NULL,
  term           TEXT NOT NULL CHECK (term IN ('first','second','third')),
  academic_year  TEXT NOT NULL,
  taken_by       UUID NOT NULL REFERENCES public.teachers(id) ON DELETE RESTRICT,
  taken_by_name  TEXT NOT NULL,    -- denormalized
  records        JSONB NOT NULL DEFAULT '{}'::jsonb,
  present_count  INTEGER NOT NULL DEFAULT 0,
  absent_count   INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (school_id, class_id, date)
);

CREATE INDEX IF NOT EXISTS idx_attendance_school ON public.attendance(school_id);
CREATE INDEX IF NOT EXISTS idx_attendance_class  ON public.attendance(class_id, date);
CREATE INDEX IF NOT EXISTS idx_attendance_date   ON public.attendance(school_id, date);

ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

-- All teaching staff in school can read attendance
CREATE POLICY "attendance_read"
  ON public.attendance FOR SELECT
  USING (school_id = public.school_id() AND public.is_teacher());

-- Any teacher can take attendance for their school
CREATE POLICY "attendance_insert"
  ON public.attendance FOR INSERT
  WITH CHECK (school_id = public.school_id() AND public.is_teacher());

-- Only the teacher who took it (same day) or an admin can update
CREATE POLICY "attendance_update"
  ON public.attendance FOR UPDATE
  USING (
    school_id = public.school_id()
    AND (
      public.is_school_admin()
      OR (
        taken_by = (
          SELECT id FROM public.teachers
          WHERE auth_user_id = auth.uid() AND school_id = public.school_id()
          LIMIT 1
        )
        AND date = CURRENT_DATE
      )
    )
  );

-- Only school admins can delete attendance records
CREATE POLICY "attendance_delete"
  ON public.attendance FOR DELETE
  USING (school_id = public.school_id() AND public.is_school_admin());
