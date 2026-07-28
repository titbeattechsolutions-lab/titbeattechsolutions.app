
ALTER TABLE public.login_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.login_logs FROM anon, authenticated;
GRANT ALL ON public.login_logs TO service_role;
GRANT SELECT ON public.login_logs TO authenticated;

CREATE POLICY login_logs_read_super_admin ON public.login_logs
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY login_logs_read_school_admin ON public.login_logs
  FOR SELECT TO authenticated
  USING (
    tenant_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.schools s ON s.id = p.school_id
      WHERE p.id = auth.uid()
        AND s.tenant_id = login_logs.tenant_id
        AND p.role = ANY (ARRAY['school_admin','principal'])
    )
  );


DROP POLICY IF EXISTS report_cards_read_staff ON public.report_cards;
DROP POLICY IF EXISTS report_cards_insert ON public.report_cards;
DROP POLICY IF EXISTS report_cards_update ON public.report_cards;
DROP POLICY IF EXISTS report_cards_delete ON public.report_cards;

CREATE POLICY report_cards_read_staff ON public.report_cards
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.school_id = report_cards.school_id
        AND p.role = ANY (ARRAY['school_admin','principal','head_teacher','teacher'])
    )
  );

CREATE POLICY report_cards_insert ON public.report_cards
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.school_id = report_cards.school_id
        AND p.role = ANY (ARRAY['school_admin','principal','head_teacher','teacher'])
    )
  );

CREATE POLICY report_cards_update ON public.report_cards
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.school_id = report_cards.school_id
        AND p.role = ANY (ARRAY['school_admin','principal','head_teacher','teacher'])
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.school_id = report_cards.school_id
        AND p.role = ANY (ARRAY['school_admin','principal','head_teacher','teacher'])
    )
  );

CREATE POLICY report_cards_delete ON public.report_cards
  FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.school_id = report_cards.school_id
        AND p.role = ANY (ARRAY['school_admin','principal'])
    )
  );

DROP POLICY IF EXISTS profiles_service_role_update ON public.profiles;
DROP POLICY IF EXISTS profiles_service_role_insert ON public.profiles;

DROP POLICY IF EXISTS "anyone can submit a request" ON public.school_requests;
CREATE POLICY school_requests_public_insert ON public.school_requests
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    status = 'pending'
    AND admin_email IS NOT NULL
    AND length(admin_email) BETWEEN 3 AND 320
  );
