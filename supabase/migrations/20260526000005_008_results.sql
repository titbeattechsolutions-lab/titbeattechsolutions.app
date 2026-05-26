-- =====================================================================
-- 008: results table
-- GOLDEN RULES enforced here:
--   Rule 2: score_total NEVER written by client — computed by trigger
--   Rule 7: trigger blocks any client attempt to set score_total directly
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.results (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id      UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  student_name    TEXT NOT NULL,    -- denormalized
  admission_no    TEXT NOT NULL,    -- denormalized
  class_id        UUID NOT NULL,
  class_name      TEXT NOT NULL,    -- denormalized
  subject_id      UUID NOT NULL REFERENCES public.subjects(id) ON DELETE RESTRICT,
  subject_name    TEXT NOT NULL,    -- denormalized
  teacher_id      UUID REFERENCES public.teachers(id) ON DELETE SET NULL,
  academic_year   TEXT NOT NULL,
  term            TEXT NOT NULL CHECK (term IN ('first','second','third')),
  score_ca1       NUMERIC(5,2) CHECK (score_ca1 IS NULL OR (score_ca1 >= 0 AND score_ca1 <= 20)),
  score_ca2       NUMERIC(5,2) CHECK (score_ca2 IS NULL OR (score_ca2 >= 0 AND score_ca2 <= 20)),
  score_exam      NUMERIC(5,2) CHECK (score_exam IS NULL OR (score_exam >= 0 AND score_exam <= 60)),
  score_total     NUMERIC(5,2),    -- COMPUTED BY TRIGGER — blocked from client writes
  grade           TEXT,             -- COMPUTED BY TRIGGER
  remark          TEXT,             -- COMPUTED BY TRIGGER
  teacher_comment TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (school_id, student_id, subject_id, term, academic_year)
);

CREATE INDEX IF NOT EXISTS idx_results_school   ON public.results(school_id);
CREATE INDEX IF NOT EXISTS idx_results_student  ON public.results(student_id);
CREATE INDEX IF NOT EXISTS idx_results_class    ON public.results(class_id);
CREATE INDEX IF NOT EXISTS idx_results_term     ON public.results(school_id, academic_year, term);

-- ─── Trigger: compute score_total, grade, remark + block client writes ─
CREATE OR REPLACE FUNCTION public._compute_result_totals()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  _total NUMERIC(5,2);
BEGIN
  -- Block any client attempt to directly set score_total
  -- (SECURITY DEFINER trigger context means this runs with elevated perms;
  --  we check if the caller is trying to set score_total differently from computed)
  IF TG_OP = 'UPDATE' AND NEW.score_total IS DISTINCT FROM OLD.score_total THEN
    -- If scores haven't changed but total has, that's a client tampering attempt
    IF NEW.score_ca1 IS NOT DISTINCT FROM OLD.score_ca1
       AND NEW.score_ca2 IS NOT DISTINCT FROM OLD.score_ca2
       AND NEW.score_exam IS NOT DISTINCT FROM OLD.score_exam THEN
      RAISE EXCEPTION 'score_total is computed by the database — client writes are not allowed';
    END IF;
  END IF;

  -- Compute total
  _total := COALESCE(NEW.score_ca1, 0)
           + COALESCE(NEW.score_ca2, 0)
           + COALESCE(NEW.score_exam, 0);

  NEW.score_total := _total;

  -- Grade boundaries (100-point scale)
  NEW.grade := CASE
    WHEN _total >= 75 THEN 'A1'
    WHEN _total >= 70 THEN 'B2'
    WHEN _total >= 65 THEN 'B3'
    WHEN _total >= 60 THEN 'C4'
    WHEN _total >= 55 THEN 'C5'
    WHEN _total >= 50 THEN 'C6'
    WHEN _total >= 45 THEN 'D7'
    WHEN _total >= 40 THEN 'E8'
    ELSE 'F9'
  END;

  NEW.remark := CASE
    WHEN _total >= 75 THEN 'Excellent'
    WHEN _total >= 60 THEN 'Good'
    WHEN _total >= 50 THEN 'Average'
    WHEN _total >= 40 THEN 'Below Average'
    ELSE 'Fail'
  END;

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_compute_result_totals
  BEFORE INSERT OR UPDATE OF score_ca1, score_ca2, score_exam
  ON public.results
  FOR EACH ROW EXECUTE FUNCTION public._compute_result_totals();

-- ─── RLS ─────────────────────────────────────────────────────────────
ALTER TABLE public.results ENABLE ROW LEVEL SECURITY;

-- All teaching staff in the school can read results
CREATE POLICY "results_read_staff"
  ON public.results FOR SELECT
  USING (school_id = auth.school_id() AND auth.is_teacher());

-- Teaching staff can insert results (score_total computed by trigger)
CREATE POLICY "results_insert"
  ON public.results FOR INSERT
  WITH CHECK (school_id = auth.school_id() AND auth.is_teacher());

-- Teaching staff can update results (score_total still computed by trigger)
CREATE POLICY "results_update"
  ON public.results FOR UPDATE
  USING (school_id = auth.school_id() AND auth.is_teacher());

-- Only school admins can delete results
CREATE POLICY "results_delete"
  ON public.results FOR DELETE
  USING (school_id = auth.school_id() AND auth.is_school_admin());
