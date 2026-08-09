-- =====================================================================
-- Report Card Sync
-- Adds JSONB columns to support saving full report card templates and
-- behavioural traits to Supabase for public viewing.
-- =====================================================================

-- 1. Add report_settings to schools
ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS report_settings JSONB DEFAULT '{}'::jsonb;

-- 2. Add traits to report_cards
ALTER TABLE public.report_cards
  ADD COLUMN IF NOT EXISTS traits JSONB DEFAULT '{}'::jsonb;
