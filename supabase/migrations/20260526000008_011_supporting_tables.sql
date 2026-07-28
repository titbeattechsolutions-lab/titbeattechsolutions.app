-- =====================================================================
-- 011: pre_registrations + billing tables
-- pre_registrations: used by provision-school Edge Function to link
--   an invite email to a school_admin role before they sign up.
-- billing: one row per school tracking subscription state.
-- =====================================================================

-- ─── pre_registrations ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pre_registrations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'school_admin'
              CHECK (role IN ('school_admin','principal','head_teacher','teacher')),
  claimed     BOOLEAN NOT NULL DEFAULT false,
  claimed_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (school_id, email)
);

CREATE INDEX IF NOT EXISTS idx_pre_reg_email ON public.pre_registrations(email);
CREATE INDEX IF NOT EXISTS idx_pre_reg_school ON public.pre_registrations(school_id);

ALTER TABLE public.pre_registrations ENABLE ROW LEVEL SECURITY;

-- No client policies — only service role (Edge Functions) reads/writes pre_registrations.
-- Super admin can read for debugging.
CREATE POLICY "pre_reg_superadmin_read"
  ON public.pre_registrations FOR SELECT
  USING (public.has_role(auth.uid(), 'super_admin'::app_role));

-- Restrictive deny for all authenticated/anon client writes
CREATE POLICY "pre_reg_client_writes_denied"
  ON public.pre_registrations
  AS RESTRICTIVE FOR ALL
  TO authenticated, anon
  USING (true)
  WITH CHECK (false);


-- ─── billing ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.billing (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id            UUID NOT NULL UNIQUE REFERENCES public.schools(id) ON DELETE CASCADE,
  plan                 TEXT NOT NULL DEFAULT 'starter'
                       CHECK (plan IN ('starter','pro','enterprise')),
  status               TEXT NOT NULL DEFAULT 'trial'
                       CHECK (status IN ('trial','active','past_due','cancelled')),
  trial_ends_at        TIMESTAMPTZ,
  current_period_start TIMESTAMPTZ,
  current_period_end   TIMESTAMPTZ,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_billing_school ON public.billing(school_id);

ALTER TABLE public.billing ENABLE ROW LEVEL SECURITY;

-- School admins can read their own billing info
CREATE POLICY "billing_read_own"
  ON public.billing FOR SELECT
  USING (
    school_id = public.school_id() AND public.is_school_admin()
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );

-- No client write policies — all writes via service role (Edge Functions)
CREATE POLICY "billing_client_writes_denied"
  ON public.billing
  AS RESTRICTIVE FOR ALL
  TO authenticated, anon
  USING (true)
  WITH CHECK (false);

CREATE TRIGGER trg_billing_updated
  BEFORE UPDATE ON public.billing
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
