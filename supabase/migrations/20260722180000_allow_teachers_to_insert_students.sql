-- =====================================================================
-- Fix students RLS policies
-- Previously, policies compared students.school_id directly with 
-- public.school_id() (which returns profiles.school_id / tenant_id).
-- Since students.school_id is actually schools.id, this always failed.
-- We now correctly JOIN public.schools to validate the tenant relationship
-- and loosen permissions to allow teachers to insert students.
-- =====================================================================

DROP POLICY IF EXISTS "students_read_staff" ON public.students;
DROP POLICY IF EXISTS "students_insert" ON public.students;
DROP POLICY IF EXISTS "students_update" ON public.students;
DROP POLICY IF EXISTS "students_delete" ON public.students;

-- Read Policy
CREATE POLICY "students_read_staff"
  ON public.students FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.schools s ON p.school_id = s.tenant_id
      WHERE p.id = auth.uid()
        AND s.id = students.school_id
        AND p.role IN ('school_admin', 'principal', 'head_teacher', 'teacher')
    )
  );

-- Insert Policy
CREATE POLICY "students_insert"
  ON public.students FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.schools s ON p.school_id = s.tenant_id
      WHERE p.id = auth.uid()
        AND s.id = students.school_id
        AND p.role IN ('school_admin', 'principal', 'head_teacher', 'teacher')
    )
  );

-- Update Policy
CREATE POLICY "students_update"
  ON public.students FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.schools s ON p.school_id = s.tenant_id
      WHERE p.id = auth.uid()
        AND s.id = students.school_id
        AND p.role IN ('school_admin', 'principal', 'head_teacher', 'teacher')
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.schools s ON p.school_id = s.tenant_id
      WHERE p.id = auth.uid()
        AND s.id = students.school_id
        AND p.role IN ('school_admin', 'principal', 'head_teacher', 'teacher')
    )
  );

-- Delete Policy
CREATE POLICY "students_delete"
  ON public.students FOR DELETE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.schools s ON p.school_id = s.tenant_id
      WHERE p.id = auth.uid()
        AND s.id = students.school_id
        AND p.role IN ('school_admin', 'principal')
    )
  );
