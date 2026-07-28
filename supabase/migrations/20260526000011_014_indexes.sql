-- =====================================================================
-- 014: Performance indexes for 1,000+ school scale
-- All use IF NOT EXISTS — safe to re-run.
-- =====================================================================

-- ─── students ────────────────────────────────────────────────────────
-- Most common query: class roster for teacher (school_id + class_id)
CREATE INDEX IF NOT EXISTS idx_students_school_class
  ON public.students (school_id, class_id);

-- Composite status filter (replaces the separate school+status index)
-- idx_students_school_status already exists from 006 migration — skip duplicate.

-- Auth user lookup (used by getMyTeacherProfile pattern for students)
-- Removed invalid index: auth_user_id column does not exist on public.students

-- ─── results ─────────────────────────────────────────────────────────
-- Teacher loads results by class + subject + term on every ResultsPage open
CREATE INDEX IF NOT EXISTS idx_results_class_term
  ON public.results (school_id, class_id, term, academic_year);

-- Student-level lookup (report cards, per-student view)
CREATE INDEX IF NOT EXISTS idx_results_school_student
  ON public.results (school_id, student_id);

-- ─── attendance ──────────────────────────────────────────────────────
-- Teacher checks if today's attendance exists: (school_id, class_id, date)
-- Backs the UNIQUE constraint and the "getAttendance" query pattern
CREATE INDEX IF NOT EXISTS idx_attendance_class_date
  ON public.attendance (school_id, class_id, date DESC);

-- ─── payments ────────────────────────────────────────────────────────
-- Admin views all payments for a student
CREATE INDEX IF NOT EXISTS idx_payments_school_student
  ON public.payments (school_id, student_id);

-- Admin filters by status (pending → follow-up, success → receipts)
CREATE INDEX IF NOT EXISTS idx_payments_school_status
  ON public.payments (school_id, status);

-- ─── fees ────────────────────────────────────────────────────────────
-- Already has idx_fees_term (school_id, academic_year, term) from 010 — no change needed.

-- ─── activity_logs ───────────────────────────────────────────────────
-- Already has idx_activity_logs_school + idx_activity_logs_time from 013 — no change needed.

-- ─── ANALYZE tables to update planner statistics ─────────────────────
ANALYZE public.students;
ANALYZE public.results;
ANALYZE public.attendance;
ANALYZE public.payments;
