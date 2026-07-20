-- Drop the broken policies with the 'superadmin' typo
DROP POLICY IF EXISTS "activity_logs_superadmin_read" ON public.activity_logs;
DROP POLICY IF EXISTS "activity_logs_school_admin_read" ON public.activity_logs;
DROP POLICY IF EXISTS "activity_logs_insert" ON public.activity_logs;

-- Recreate policies with the correct 'super_admin' role
CREATE POLICY "activity_logs_superadmin_read"
  ON public.activity_logs FOR SELECT
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'super_admin'
  );

CREATE POLICY "activity_logs_school_admin_read"
  ON public.activity_logs FOR SELECT
  USING (
    school_id = (SELECT school_id FROM public.profiles WHERE id = auth.uid())
    AND (SELECT role FROM public.profiles WHERE id = auth.uid())
        IN ('school_admin','principal','super_admin')
  );

CREATE POLICY "activity_logs_insert"
  ON public.activity_logs FOR INSERT
  WITH CHECK (
    (SELECT role FROM public.profiles WHERE id = auth.uid())
        IN ('super_admin','school_admin','principal')
  );
