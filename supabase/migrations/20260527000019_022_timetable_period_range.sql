-- =====================================================================
-- 022: fix timetable period_number range to allow 0 (Assembly)
-- The original constraint was BETWEEN 1 AND 12 which rejects period 0.
-- Assembly is period 0 by design (07:30-08:00, before P1).
-- =====================================================================

ALTER TABLE public.timetable
  DROP CONSTRAINT IF EXISTS timetable_period_number_check;

ALTER TABLE public.timetable
  ADD CONSTRAINT timetable_period_number_check
  CHECK (period_number BETWEEN 0 AND 20);
