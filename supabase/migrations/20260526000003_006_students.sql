-- =====================================================================
-- 006: students table
-- school_id references public.schools(id) — not tenants directly.
-- Excludes student/parent auth roles per platform scope.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.students (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id             UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  admission_no          TEXT NOT NULL,
  first_name            TEXT NOT NULL,
  last_name             TEXT NOT NULL,
  other_names           TEXT,
  date_of_birth         DATE,
  gender                TEXT CHECK (gender IN ('male','female')),
  photo                 TEXT,
  class_id              UUID,
  class_name            TEXT,       -- denormalized
  status                TEXT NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active','graduated','withdrawn')),
  guardian_name         TEXT,
  guardian_phone        TEXT,
  guardian_email        TEXT,
  guardian_relationship TEXT,
  enrolled_at           TIMESTAMPTZ DEFAULT NOW(),
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (school_id, admission_no)
);

CREATE INDEX IF NOT EXISTS idx_students_school    ON public.students(school_id);
CREATE INDEX IF NOT EXISTS idx_students_class     ON public.students(class_id);
CREATE INDEX IF NOT EXISTS idx_students_status    ON public.students(school_id, status);

ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

-- All teaching staff in the school can read students
CREATE POLICY "students_read_staff"
  ON public.students FOR SELECT
  USING (school_id = public.school_id() AND public.is_teacher());

-- Only school admins can insert students
CREATE POLICY "students_insert"
  ON public.students FOR INSERT
  WITH CHECK (school_id = public.school_id() AND public.is_school_admin());

-- Teaching staff can update student records (class assignment, status, etc.)
CREATE POLICY "students_update"
  ON public.students FOR UPDATE
  USING (school_id = public.school_id() AND public.is_teacher());

-- Only school admins can delete students
CREATE POLICY "students_delete"
  ON public.students FOR DELETE
  USING (school_id = public.school_id() AND public.is_school_admin());

CREATE TRIGGER trg_students_updated
  BEFORE UPDATE ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
