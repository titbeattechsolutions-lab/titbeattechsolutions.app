-- =====================================================================
-- Result Checker: result_checker_tokens table + feature flag
-- Tokens are generated per-student per-term and embedded in report
-- card emails as a one-click link to the public result checker page.
-- =====================================================================

-- 1. result_checker_tokens table
CREATE TABLE IF NOT EXISTS public.result_checker_tokens (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     UUID        NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id    UUID        REFERENCES public.students(id) ON DELETE CASCADE,
  admission_no  TEXT        NOT NULL,           -- denormalized for fast lookup
  academic_year TEXT        NOT NULL,
  term          TEXT        NOT NULL CHECK (term IN ('first','second','third')),
  token         TEXT        UNIQUE NOT NULL,    -- e.g. "RC-7X4K-9P2A-QZ38"
  is_used       BOOLEAN     NOT NULL DEFAULT false,
  used_at       TIMESTAMPTZ,
  expires_at    TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '30 days'),
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rct_school  ON public.result_checker_tokens(school_id);
CREATE INDEX IF NOT EXISTS idx_rct_token   ON public.result_checker_tokens(token);
CREATE INDEX IF NOT EXISTS idx_rct_student ON public.result_checker_tokens(student_id);

-- 2. RLS
ALTER TABLE public.result_checker_tokens ENABLE ROW LEVEL SECURITY;

-- GoTrue authenticated staff can manage tokens for their school
DROP POLICY IF EXISTS "rct_staff_all" ON public.result_checker_tokens;
CREATE POLICY "rct_staff_all"
  ON public.result_checker_tokens
  FOR ALL
  TO authenticated
  USING (
    school_id IN (
      SELECT s.id FROM public.profiles p
      JOIN public.schools s ON p.school_id = s.tenant_id
      WHERE p.id = auth.uid()
        AND p.role IN ('school_admin', 'principal', 'head_teacher')
    )
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  )
  WITH CHECK (
    school_id IN (
      SELECT s.id FROM public.profiles p
      JOIN public.schools s ON p.school_id = s.tenant_id
      WHERE p.id = auth.uid()
        AND p.role IN ('school_admin', 'principal', 'head_teacher')
    )
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );

-- PIN/tenant session (anon) staff can also manage tokens
DROP POLICY IF EXISTS "rct_anon_session" ON public.result_checker_tokens;
CREATE POLICY "rct_anon_session"
  ON public.result_checker_tokens
  FOR ALL
  TO anon
  USING (
    school_id = (
      SELECT s.id FROM public.schools s
      WHERE s.tenant_id = public.get_tenant_from_session()
      LIMIT 1
    )
  )
  WITH CHECK (
    school_id = (
      SELECT s.id FROM public.schools s
      WHERE s.tenant_id = public.get_tenant_from_session()
      LIMIT 1
    )
  );

-- 3. Add result_checker feature flag to all existing schools (default off)
UPDATE public.schools
  SET features = features || '{"result_checker": false}'::jsonb
  WHERE features->>'result_checker' IS NULL;

-- 4. Update column default for new schools provisioned in future
ALTER TABLE public.schools
  ALTER COLUMN features SET DEFAULT
  '{"attendance":true,"results":true,"fees":false,"library":false,"events":true,"result_checker":false}'::jsonb;
