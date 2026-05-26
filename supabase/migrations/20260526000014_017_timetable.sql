-- =====================================================================
-- 017: timetable — per-class weekly schedule with periods & breaks
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.timetable (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  class_id      UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  class_name    TEXT NOT NULL,
  academic_year TEXT NOT NULL,
  term          TEXT NOT NULL CHECK (term IN ('first','second','third')),
  day           TEXT NOT NULL CHECK (day IN ('monday','tuesday','wednesday','thursday','friday')),
  period_number INTEGER NOT NULL CHECK (period_number BETWEEN 1 AND 12),
  period_type   TEXT NOT NULL DEFAULT 'lesson'
                CHECK (period_type IN ('lesson','short_break','long_break','assembly','lunch','closing')),
  start_time    TIME NOT NULL,
  end_time      TIME NOT NULL,
  subject_id    UUID REFERENCES public.subjects(id) ON DELETE SET NULL,
  subject_name  TEXT,
  teacher_id    UUID REFERENCES public.teachers(id) ON DELETE SET NULL,
  teacher_name  TEXT,
  room          TEXT,
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (school_id, class_id, day, period_number, academic_year, term)
);

CREATE INDEX IF NOT EXISTS idx_timetable_school  ON public.timetable(school_id);
CREATE INDEX IF NOT EXISTS idx_timetable_class   ON public.timetable(class_id, day);
CREATE INDEX IF NOT EXISTS idx_timetable_teacher ON public.timetable(teacher_id);

ALTER TABLE public.timetable ENABLE ROW LEVEL SECURITY;

-- All teaching staff can read their school's timetable
CREATE POLICY "timetable_read_staff"
  ON public.timetable FOR SELECT
  USING (school_id = auth.school_id() AND auth.is_teacher());

-- School admins can insert timetable entries
CREATE POLICY "timetable_insert"
  ON public.timetable FOR INSERT
  WITH CHECK (school_id = auth.school_id() AND auth.is_school_admin());

-- School admins can update timetable entries
CREATE POLICY "timetable_update"
  ON public.timetable FOR UPDATE
  USING (school_id = auth.school_id() AND auth.is_school_admin());

-- School admins can delete timetable entries
CREATE POLICY "timetable_delete"
  ON public.timetable FOR DELETE
  USING (school_id = auth.school_id() AND auth.is_school_admin());

CREATE TRIGGER trg_timetable_updated
  BEFORE UPDATE ON public.timetable
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
