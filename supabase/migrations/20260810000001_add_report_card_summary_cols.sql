-- Add missing report_cards columns needed by the result checker
-- These are queried by check-result/index.ts but were missing from the schema.

ALTER TABLE public.report_cards
  ADD COLUMN IF NOT EXISTS total_score       NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS total_subjects    INTEGER,
  ADD COLUMN IF NOT EXISTS average_score     NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS position_in_class INTEGER;
