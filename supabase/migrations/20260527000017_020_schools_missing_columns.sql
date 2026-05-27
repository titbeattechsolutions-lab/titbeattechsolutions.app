-- =====================================================================
-- 020: Add missing columns to existing schools table
--   The live schools table was created by an earlier migration that
--   predates the current schema. This migration safely adds any
--   columns that are missing using ADD COLUMN IF NOT EXISTS.
-- =====================================================================

-- status column (used by SchoolsListPage suspend/reactivate)
ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
  CHECK (status IN ('active','suspended','trial'));

-- current_students counter (may already exist)
ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS current_students INTEGER NOT NULL DEFAULT 0;

-- max_students limit
ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS max_students INTEGER NOT NULL DEFAULT 500;

-- features JSONB flags
ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS features JSONB DEFAULT '{"attendance":true,"results":true,"fees":false,"library":false,"events":true}'::jsonb;

-- academic_year
ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS academic_year TEXT DEFAULT '2025/2026';

-- current_term
ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS current_term TEXT DEFAULT 'first'
  CHECK (current_term IN ('first','second','third'));

-- phone / address / logo / timezone
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS phone           TEXT;
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS address_street  TEXT;
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS address_city    TEXT;
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS address_state   TEXT;
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS address_country TEXT DEFAULT 'Nigeria';
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS logo            TEXT;
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS timezone        TEXT DEFAULT 'Africa/Lagos';
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS updated_at      TIMESTAMPTZ DEFAULT NOW();

-- Index on status for fast filtering
CREATE INDEX IF NOT EXISTS idx_schools_status ON public.schools(status);
