-- 20260729193800_superadmin_staff_logs_rls.sql
-- Add RLS policy allowing super_admin to read staff_session_logs

DROP POLICY IF EXISTS "staff_session_logs_superadmin_read" ON public.staff_session_logs;

CREATE POLICY "staff_session_logs_superadmin_read"
  ON public.staff_session_logs FOR SELECT
  USING (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'superadmin'
  );
