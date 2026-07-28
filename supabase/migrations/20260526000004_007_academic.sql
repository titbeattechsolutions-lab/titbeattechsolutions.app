-- =====================================================================
-- 007: teachers, classes, subjects
-- All tables scoped by school_id → public.schools(id)
-- =====================================================================

-- ─── teachers ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.teachers (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id           UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  auth_user_id        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  employee_id         TEXT,
  first_name          TEXT NOT NULL,
  last_name           TEXT NOT NULL,
  email               TEXT,
  phone               TEXT,
  role                TEXT NOT NULL DEFAULT 'teacher'
                      CHECK (role IN ('teacher','head_teacher','principal','school_admin')),
  subject_ids         UUID[] DEFAULT '{}',     -- subjects this teacher handles
  class_ids           UUID[] DEFAULT '{}',     -- classes this teacher teaches
  is_class_teacher    BOOLEAN NOT NULL DEFAULT false,
  class_teacher_of    UUID,                    -- class_id if is_class_teacher
  status              TEXT NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active','on_leave','inactive')),
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (school_id, employee_id)
);

CREATE INDEX IF NOT EXISTS idx_teachers_school      ON public.teachers(school_id);
CREATE INDEX IF NOT EXISTS idx_teachers_auth_user   ON public.teachers(auth_user_id);

ALTER TABLE public.teachers ENABLE ROW LEVEL SECURITY;

-- All teaching staff in the school can read teachers
CREATE POLICY "teachers_read_staff"
  ON public.teachers FOR SELECT
  USING (school_id = public.school_id() AND public.is_teacher());

-- Only school admins can insert/delete
CREATE POLICY "teachers_insert"
  ON public.teachers FOR INSERT
  WITH CHECK (school_id = public.school_id() AND public.is_school_admin());

CREATE POLICY "teachers_update"
  ON public.teachers FOR UPDATE
  USING (school_id = public.school_id() AND public.is_school_admin());

CREATE POLICY "teachers_delete"
  ON public.teachers FOR DELETE
  USING (school_id = public.school_id() AND public.is_school_admin());

CREATE TRIGGER trg_teachers_updated
  BEFORE UPDATE ON public.teachers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ─── classes ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.classes (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id           UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,           -- e.g. "JSS 1 Gold"
  level               TEXT,                    -- e.g. "JSS 1"
  arm                 TEXT,                    -- e.g. "Gold"
  class_teacher_id    UUID REFERENCES public.teachers(id) ON DELETE SET NULL,
  class_teacher_name  TEXT,                    -- denormalized
  student_count       INTEGER NOT NULL DEFAULT 0,
  academic_year       TEXT NOT NULL,
  term                TEXT NOT NULL CHECK (term IN ('first','second','third')),
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (school_id, name, academic_year, term)
);

CREATE INDEX IF NOT EXISTS idx_classes_school ON public.classes(school_id);

ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "classes_read_staff"
  ON public.classes FOR SELECT
  USING (school_id = public.school_id() AND public.is_teacher());

CREATE POLICY "classes_insert"
  ON public.classes FOR INSERT
  WITH CHECK (school_id = public.school_id() AND public.is_school_admin());

CREATE POLICY "classes_update"
  ON public.classes FOR UPDATE
  USING (school_id = public.school_id() AND public.is_school_admin());

CREATE POLICY "classes_delete"
  ON public.classes FOR DELETE
  USING (school_id = public.school_id() AND public.is_school_admin());

CREATE TRIGGER trg_classes_updated
  BEFORE UPDATE ON public.classes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ─── subjects ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.subjects (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  code        TEXT,
  description TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (school_id, name)
);

CREATE INDEX IF NOT EXISTS idx_subjects_school ON public.subjects(school_id);

ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "subjects_read_staff"
  ON public.subjects FOR SELECT
  USING (school_id = public.school_id() AND public.is_teacher());

CREATE POLICY "subjects_insert"
  ON public.subjects FOR INSERT
  WITH CHECK (school_id = public.school_id() AND public.is_school_admin());

CREATE POLICY "subjects_update"
  ON public.subjects FOR UPDATE
  USING (school_id = public.school_id() AND public.is_school_admin());

CREATE POLICY "subjects_delete"
  ON public.subjects FOR DELETE
  USING (school_id = public.school_id() AND public.is_school_admin());
