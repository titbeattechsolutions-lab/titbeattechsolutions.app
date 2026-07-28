-- =====================================================================
-- 013: Phase 8 additions
--   1. auth.school_is_active() — enforce suspend at RLS level
--   2. Superadmin UPDATE policy for schools (suspend/reactivate/plan)
--   3. platform activity_logs table with pagination support
-- =====================================================================

-- ─── 1. auth.school_is_active() ──────────────────────────────────────
-- Returns FALSE when the school's status != 'active'.
-- Adding AND auth.school_is_active() to read policies instantly
-- zeroes out all queries for a suspended school's users.
CREATE OR REPLACE FUNCTION auth.school_is_active()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT status = 'active'
  FROM public.schools
  WHERE id = public.school_id()
$$;

GRANT EXECUTE ON FUNCTION auth.school_is_active() TO authenticated;

-- ─── Apply school_is_active to all major staff read policies ─────────

-- students
DROP POLICY IF EXISTS "students_read_staff" ON public.students;
CREATE POLICY "students_read_staff"
  ON public.students FOR SELECT
  USING (
    school_id = public.school_id()
    AND public.is_teacher()
    AND auth.school_is_active()
  );

-- teachers
DROP POLICY IF EXISTS "teachers_read_staff" ON public.teachers;
CREATE POLICY "teachers_read_staff"
  ON public.teachers FOR SELECT
  USING (
    school_id = public.school_id()
    AND public.is_teacher()
    AND auth.school_is_active()
  );

-- classes
DROP POLICY IF EXISTS "classes_read_staff" ON public.classes;
CREATE POLICY "classes_read_staff"
  ON public.classes FOR SELECT
  USING (
    school_id = public.school_id()
    AND public.is_teacher()
    AND auth.school_is_active()
  );

-- subjects
DROP POLICY IF EXISTS "subjects_read_staff" ON public.subjects;
CREATE POLICY "subjects_read_staff"
  ON public.subjects FOR SELECT
  USING (
    school_id = public.school_id()
    AND public.is_teacher()
    AND auth.school_is_active()
  );

-- attendance
DROP POLICY IF EXISTS "attendance_read" ON public.attendance;
CREATE POLICY "attendance_read"
  ON public.attendance FOR SELECT
  USING (
    school_id = public.school_id()
    AND public.is_teacher()
    AND auth.school_is_active()
  );

-- results
DROP POLICY IF EXISTS "results_read_staff" ON public.results;
CREATE POLICY "results_read_staff"
  ON public.results FOR SELECT
  USING (
    school_id = public.school_id()
    AND public.is_teacher()
    AND auth.school_is_active()
  );

-- fees
DROP POLICY IF EXISTS "fees_read_staff" ON public.fees;
CREATE POLICY "fees_read_staff"
  ON public.fees FOR SELECT
  USING (
    school_id = public.school_id()
    AND public.is_teacher()
    AND auth.school_is_active()
  );


-- ─── 2. Superadmin UPDATE policy for schools ─────────────────────────
-- Allows superadmin to suspend, reactivate, and update plan/features/max_students.
DROP POLICY IF EXISTS "schools_superadmin_update" ON public.schools;
CREATE POLICY "schools_superadmin_update"
  ON public.schools FOR UPDATE
  USING (public.has_role(auth.uid(), 'super_admin'::app_role));


-- ─── 3. Platform activity_logs ───────────────────────────────────────
-- Centralised log for all significant in-app actions.
-- school_id nullable so platform-level events (provision, billing) can be logged.
CREATE TABLE IF NOT EXISTS public.activity_logs (
  id           BIGSERIAL PRIMARY KEY,
  school_id    UUID REFERENCES public.schools(id) ON DELETE SET NULL,
  action       TEXT NOT NULL,
  performed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  details      JSONB,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_school    ON public.activity_logs(school_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_time      ON public.activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_action    ON public.activity_logs(action);

ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

-- Superadmin reads all logs
CREATE POLICY "activity_logs_superadmin_read"
  ON public.activity_logs FOR SELECT
  USING (public.has_role(auth.uid(), 'super_admin'::app_role));

-- School admins read only their school's logs
CREATE POLICY "activity_logs_school_admin_read"
  ON public.activity_logs FOR SELECT
  USING (
    school_id = public.school_id()
    AND public.is_school_admin()
  );

-- School admins and superadmins can insert logs
CREATE POLICY "activity_logs_insert"
  ON public.activity_logs FOR INSERT
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR (school_id = public.school_id() AND public.is_school_admin())
  );

-- No client UPDATE/DELETE — append-only audit trail
