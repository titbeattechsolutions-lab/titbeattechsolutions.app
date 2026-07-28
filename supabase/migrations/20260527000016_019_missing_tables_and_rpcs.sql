-- =====================================================================
-- 019: Create missing tables and RPCs
--   1. activity_logs  (superadmin activity log page)
--   2. billing        (superadmin billing list page)
--   3. get_login_history RPC (legacy login-history.ts / auth-logger.ts)
-- All RLS uses inline public.profiles subqueries — no auth.* schema needed
-- =====================================================================

-- ─── 1. activity_logs ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.activity_logs (
  id           BIGSERIAL PRIMARY KEY,
  school_id    UUID REFERENCES public.schools(id) ON DELETE SET NULL,
  action       TEXT NOT NULL,
  performed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  details      JSONB,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_school  ON public.activity_logs(school_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_time    ON public.activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_action  ON public.activity_logs(action);

ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "activity_logs_superadmin_read" ON public.activity_logs;
CREATE POLICY "activity_logs_superadmin_read"
  ON public.activity_logs FOR SELECT
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'superadmin'
  );

DROP POLICY IF EXISTS "activity_logs_school_admin_read" ON public.activity_logs;
CREATE POLICY "activity_logs_school_admin_read"
  ON public.activity_logs FOR SELECT
  USING (
    school_id = (SELECT school_id FROM public.profiles WHERE id = auth.uid())
    AND (SELECT role FROM public.profiles WHERE id = auth.uid())
        IN ('school_admin','principal','superadmin')
  );

DROP POLICY IF EXISTS "activity_logs_insert" ON public.activity_logs;
CREATE POLICY "activity_logs_insert"
  ON public.activity_logs FOR INSERT
  WITH CHECK (
    (SELECT role FROM public.profiles WHERE id = auth.uid())
        IN ('superadmin','school_admin','principal')
  );

-- ─── 2. billing ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.billing (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id           UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  plan                TEXT NOT NULL DEFAULT 'starter'
                      CHECK (plan IN ('starter','pro','enterprise')),
  status              TEXT NOT NULL DEFAULT 'trial'
                      CHECK (status IN ('trial','active','past_due','cancelled')),
  trial_ends_at       TIMESTAMPTZ,
  current_period_end  TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (school_id)
);

CREATE INDEX IF NOT EXISTS idx_billing_school  ON public.billing(school_id);
CREATE INDEX IF NOT EXISTS idx_billing_status  ON public.billing(status);

ALTER TABLE public.billing ENABLE ROW LEVEL SECURITY;

CREATE POLICY "billing_superadmin_all"
  ON public.billing FOR ALL
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'superadmin'
  )
  WITH CHECK (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'superadmin'
  );

CREATE POLICY "billing_school_admin_read"
  ON public.billing FOR SELECT
  USING (
    school_id = (SELECT school_id FROM public.profiles WHERE id = auth.uid())
    AND (SELECT role FROM public.profiles WHERE id = auth.uid())
        IN ('school_admin','principal','superadmin')
  );

CREATE OR REPLACE FUNCTION public.set_billing_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_billing_updated ON public.billing;
CREATE TRIGGER trg_billing_updated
  BEFORE UPDATE ON public.billing
  FOR EACH ROW EXECUTE FUNCTION public.set_billing_updated_at();

-- Auto-create a billing row when a new school is provisioned
CREATE OR REPLACE FUNCTION public.create_default_billing()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.billing (school_id, plan, status, trial_ends_at)
  VALUES (NEW.id, 'starter', 'trial', NOW() + INTERVAL '30 days')
  ON CONFLICT (school_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_school_billing ON public.schools;
CREATE TRIGGER trg_school_billing
  AFTER INSERT ON public.schools
  FOR EACH ROW EXECUTE FUNCTION public.create_default_billing();

-- Backfill billing rows for any schools that don't have one yet
INSERT INTO public.billing (school_id, plan, status, trial_ends_at)
SELECT id, 'starter', 'trial', NOW() + INTERVAL '30 days'
FROM public.schools
WHERE id NOT IN (SELECT school_id FROM public.billing)
ON CONFLICT (school_id) DO NOTHING;

-- ─── 3. get_login_history RPC ────────────────────────────────────────
-- Satisfies legacy calls from lib/login-history.ts and lib/auth-logger.ts
-- Returns rows from session_logs table (created in migration 016)

DROP FUNCTION IF EXISTS public.get_login_history(TEXT, TEXT, INT);
CREATE OR REPLACE FUNCTION public.get_login_history(
  _auth_type  TEXT,
  _identifier TEXT,
  _limit      INTEGER DEFAULT 50
)
RETURNS TABLE (
  id          UUID,
  event_type  TEXT,
  "timestamp" TIMESTAMPTZ,
  ip_address  TEXT,
  user_agent  TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    sl.id,
    sl.action        AS event_type,
    sl.created_at    AS "timestamp",
    sl.ip_address,
    sl.device        AS user_agent
  FROM public.session_logs sl
  WHERE
    CASE _auth_type
      WHEN 'super_admin' THEN sl.role = 'superadmin'
      WHEN 'tenant'      THEN sl.school_id::TEXT = _identifier
      WHEN 'staff'       THEN sl.user_id::TEXT = _identifier
      ELSE sl.user_id::TEXT = _identifier
    END
  ORDER BY sl.created_at DESC
  LIMIT _limit;
$$;

GRANT EXECUTE ON FUNCTION public.get_login_history(TEXT, TEXT, INTEGER) TO authenticated;
