-- =====================================================================
-- 016: session_logs — tracks login/logout events per user/school
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.session_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id    UUID REFERENCES public.schools(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_name    TEXT NOT NULL,
  role         TEXT NOT NULL,
  action       TEXT NOT NULL CHECK (action IN ('login','logout')),
  ip_address   TEXT,
  device       TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_session_logs_school   ON public.session_logs(school_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_session_logs_user     ON public.session_logs(user_id, created_at DESC);

ALTER TABLE public.session_logs ENABLE ROW LEVEL SECURITY;

-- School admin reads only their school's logs
CREATE POLICY "session_logs_read_admin"
  ON public.session_logs FOR SELECT
  USING (school_id = auth.school_id() AND auth.is_school_admin());

-- Superadmin reads all logs across every school
CREATE POLICY "session_logs_read_superadmin"
  ON public.session_logs FOR SELECT
  USING (public.has_role(auth.uid(), 'super_admin'::app_role));

-- Any authenticated user can insert their own log entry
CREATE POLICY "session_logs_insert"
  ON public.session_logs FOR INSERT
  WITH CHECK (user_id = auth.uid());
