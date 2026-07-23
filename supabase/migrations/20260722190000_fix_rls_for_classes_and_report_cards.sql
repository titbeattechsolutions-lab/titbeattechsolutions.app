-- =====================================================================
-- Fix RLS policies for classes and report_cards
-- Just like students, we must explicitly JOIN with public.schools 
-- to correctly map the user's profile.school_id (tenant_id) to 
-- the actual schools.id used in the tables.
-- =====================================================================

-- CLASSES
DROP POLICY IF EXISTS "classes_read_staff" ON public.classes;
DROP POLICY IF EXISTS "classes_insert" ON public.classes;
DROP POLICY IF EXISTS "classes_update" ON public.classes;
DROP POLICY IF EXISTS "classes_delete" ON public.classes;

CREATE POLICY "classes_read_staff"
  ON public.classes FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.schools s ON p.school_id = s.tenant_id
      WHERE p.id = auth.uid()
        AND s.id = classes.school_id
        AND p.role IN ('school_admin', 'principal', 'head_teacher', 'teacher')
    )
  );

CREATE POLICY "classes_insert"
  ON public.classes FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.schools s ON p.school_id = s.tenant_id
      WHERE p.id = auth.uid()
        AND s.id = classes.school_id
        AND p.role IN ('school_admin', 'principal', 'head_teacher', 'teacher')
    )
  );

CREATE POLICY "classes_update"
  ON public.classes FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.schools s ON p.school_id = s.tenant_id
      WHERE p.id = auth.uid()
        AND s.id = classes.school_id
        AND p.role IN ('school_admin', 'principal', 'head_teacher', 'teacher')
    )
  );

CREATE POLICY "classes_delete"
  ON public.classes FOR DELETE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.schools s ON p.school_id = s.tenant_id
      WHERE p.id = auth.uid()
        AND s.id = classes.school_id
        AND p.role IN ('school_admin', 'principal')
    )
  );

-- REPORT CARDS
DROP POLICY IF EXISTS "report_cards_read_staff" ON public.report_cards;
DROP POLICY IF EXISTS "report_cards_insert" ON public.report_cards;
DROP POLICY IF EXISTS "report_cards_update" ON public.report_cards;
DROP POLICY IF EXISTS "report_cards_delete" ON public.report_cards;

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
