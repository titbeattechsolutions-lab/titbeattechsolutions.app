-- =====================================================================
-- 010: fees and payments tables
-- GOLDEN RULE 1: payments INSERT/UPDATE/DELETE = service role ONLY
--   No client INSERT/UPDATE/DELETE policy → blocked by default RLS.
--   Edge Functions use service role key which bypasses RLS.
-- =====================================================================

-- ─── fees ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.fees (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  amount          NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  currency        TEXT NOT NULL DEFAULT 'NGN',
  due_date        DATE,
  term            TEXT NOT NULL CHECK (term IN ('first','second','third')),
  academic_year   TEXT NOT NULL,
  applicable_to   TEXT[] DEFAULT '{}',   -- class names / 'all'
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fees_school ON public.fees(school_id);
CREATE INDEX IF NOT EXISTS idx_fees_term   ON public.fees(school_id, academic_year, term);

ALTER TABLE public.fees ENABLE ROW LEVEL SECURITY;

-- All teaching staff can read fee definitions
CREATE POLICY "fees_read_staff"
  ON public.fees FOR SELECT
  USING (school_id = public.school_id() AND public.is_teacher());

-- Only school admins can create/update/delete fee definitions
CREATE POLICY "fees_insert"
  ON public.fees FOR INSERT
  WITH CHECK (school_id = public.school_id() AND public.is_school_admin());

CREATE POLICY "fees_update"
  ON public.fees FOR UPDATE
  USING (school_id = public.school_id() AND public.is_school_admin());

CREATE POLICY "fees_delete"
  ON public.fees FOR DELETE
  USING (school_id = public.school_id() AND public.is_school_admin());

CREATE TRIGGER trg_fees_updated
  BEFORE UPDATE ON public.fees
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ─── payments ────────────────────────────────────────────────────────
-- CRITICAL: No client INSERT/UPDATE/DELETE policy.
-- All writes must go through Edge Functions using the service role key.
CREATE TABLE IF NOT EXISTS public.payments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id      UUID NOT NULL REFERENCES public.students(id) ON DELETE RESTRICT,
  student_name    TEXT NOT NULL,    -- denormalized
  fee_id          UUID NOT NULL REFERENCES public.fees(id) ON DELETE RESTRICT,
  fee_name        TEXT NOT NULL,    -- denormalized
  amount          NUMERIC(12,2) NOT NULL,
  currency        TEXT NOT NULL DEFAULT 'NGN',
  reference       TEXT UNIQUE,      -- payment gateway reference
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','success','failed')),
  channel         TEXT,             -- e.g. 'paystack', 'manual', 'bank_transfer'
  paid_by         TEXT,             -- name of payer
  paid_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_school   ON public.payments(school_id);
CREATE INDEX IF NOT EXISTS idx_payments_student  ON public.payments(student_id);
CREATE INDEX IF NOT EXISTS idx_payments_status   ON public.payments(school_id, status);
CREATE INDEX IF NOT EXISTS idx_payments_ref      ON public.payments(reference);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- School admins can read all payments for their school
CREATE POLICY "payments_read_admin"
  ON public.payments FOR SELECT
  USING (school_id = public.school_id() AND public.is_school_admin());

-- Teachers (non-admin) can read payments for their school too (read-only dashboard)
CREATE POLICY "payments_read_teacher"
  ON public.payments FOR SELECT
  USING (school_id = public.school_id() AND public.is_teacher());

-- INTENTIONALLY NO INSERT / UPDATE / DELETE policies for authenticated users.
-- Edge Functions (service role) bypass RLS and write payments.
-- Any client attempt to INSERT/UPDATE/DELETE will be denied by default.

-- Restrictive policy to make the intent explicit and prevent accidental permissive policy additions
CREATE POLICY "payments_client_writes_denied"
  ON public.payments
  AS RESTRICTIVE
  FOR ALL
  TO authenticated, anon
  USING (true)
  WITH CHECK (false);
