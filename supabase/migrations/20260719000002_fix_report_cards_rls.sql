-- Drop the existing badly formatted policies
DROP POLICY IF EXISTS "report_cards_read_staff" ON public.report_cards;
DROP POLICY IF EXISTS "report_cards_insert" ON public.report_cards;
DROP POLICY IF EXISTS "report_cards_update" ON public.report_cards;
DROP POLICY IF EXISTS "report_cards_delete" ON public.report_cards;

-- Recreate them securely bridging the tenant_id gap directly via JOINs
CREATE POLICY "report_cards_read_staff"
  ON public.report_cards FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.schools s ON p.school_id = s.tenant_id
      WHERE p.id = auth.uid()
        AND s.id = report_cards.school_id
        AND p.role IN ('school_admin', 'principal', 'head_teacher', 'teacher')
    )
  );

CREATE POLICY "report_cards_insert"
  ON public.report_cards FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.schools s ON p.school_id = s.tenant_id
      WHERE p.id = auth.uid()
        AND s.id = report_cards.school_id
        AND p.role IN ('school_admin', 'principal', 'head_teacher', 'teacher')
    )
  );

CREATE POLICY "report_cards_update"
  ON public.report_cards FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.schools s ON p.school_id = s.tenant_id
      WHERE p.id = auth.uid()
        AND s.id = report_cards.school_id
        AND p.role IN ('school_admin', 'principal', 'head_teacher', 'teacher')
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.schools s ON p.school_id = s.tenant_id
      WHERE p.id = auth.uid()
        AND s.id = report_cards.school_id
        AND p.role IN ('school_admin', 'principal', 'head_teacher', 'teacher')
    )
  );

CREATE POLICY "report_cards_delete"
  ON public.report_cards FOR DELETE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.schools s ON p.school_id = s.tenant_id
      WHERE p.id = auth.uid()
        AND s.id = report_cards.school_id
        AND p.role IN ('school_admin', 'principal')
    )
  );
