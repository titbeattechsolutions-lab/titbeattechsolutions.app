-- =====================================================================
-- 021: report_cards table
-- Stores per-student per-term report card metadata, signature, and
-- email delivery state. Actual scores live in public.results.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.report_cards (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id      UUID REFERENCES public.students(id) ON DELETE SET NULL,
  student_name    TEXT NOT NULL,
  student_class   TEXT NOT NULL,
  term            TEXT NOT NULL CHECK (term IN ('first','second','third')),
  academic_year   TEXT NOT NULL,

  -- Comments / remarks
  teacher_remark    TEXT,
  principal_remark  TEXT,

  -- Attendance snapshot
  days_open    INTEGER,
  days_present INTEGER,
  days_absent  INTEGER,

  -- E-signature (base64 PNG from canvas)
  signature TEXT,

  -- Email delivery tracking
  email_sent     BOOLEAN NOT NULL DEFAULT FALSE,
  email_sent_at  TIMESTAMPTZ,
  email_sent_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Workflow status
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','ready','sent')),

  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (school_id, student_id, term, academic_year)
);

CREATE INDEX IF NOT EXISTS idx_report_cards_school     ON public.report_cards(school_id);
CREATE INDEX IF NOT EXISTS idx_report_cards_student    ON public.report_cards(student_id);
CREATE INDEX IF NOT EXISTS idx_report_cards_term_year  ON public.report_cards(school_id, term, academic_year);

ALTER TABLE public.report_cards ENABLE ROW LEVEL SECURITY;

-- Teaching staff in the school can read all report cards for their school
CREATE POLICY "report_cards_read_staff"
  ON public.report_cards FOR SELECT
  USING (
    school_id = (SELECT school_id FROM public.profiles WHERE id = auth.uid())
    AND (SELECT role FROM public.profiles WHERE id = auth.uid())
        IN ('school_admin','principal','head_teacher','teacher')
  );

-- School admins and teachers can insert
CREATE POLICY "report_cards_insert"
  ON public.report_cards FOR INSERT
  WITH CHECK (
    school_id = (SELECT school_id FROM public.profiles WHERE id = auth.uid())
    AND (SELECT role FROM public.profiles WHERE id = auth.uid())
        IN ('school_admin','principal','head_teacher','teacher')
  );

-- School admins and teachers can update
CREATE POLICY "report_cards_update"
  ON public.report_cards FOR UPDATE
  USING (
    school_id = (SELECT school_id FROM public.profiles WHERE id = auth.uid())
    AND (SELECT role FROM public.profiles WHERE id = auth.uid())
        IN ('school_admin','principal','head_teacher','teacher')
  );

-- Only school admins can delete
CREATE POLICY "report_cards_delete"
  ON public.report_cards FOR DELETE
  USING (
    school_id = (SELECT school_id FROM public.profiles WHERE id = auth.uid())
    AND (SELECT role FROM public.profiles WHERE id = auth.uid())
        IN ('school_admin','principal')
  );

CREATE TRIGGER trg_report_cards_updated
  BEFORE UPDATE ON public.report_cards
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
