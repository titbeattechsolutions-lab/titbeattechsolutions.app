-- Fix RLS for the results table. The old policies used strict checks like is_teacher() which failed for school_admin or principal.
-- Also the delete policy prevented teachers from replacing scores.

DROP POLICY IF EXISTS "results_insert" ON results;
DROP POLICY IF EXISTS "results_update" ON results;
DROP POLICY IF EXISTS "results_delete" ON results;
DROP POLICY IF EXISTS "results_read_staff" ON results;

CREATE POLICY "results_select_auth"
  ON results FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'super_admin'::app_role) OR
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN schools s ON p.school_id = s.tenant_id
      WHERE p.id = auth.uid()
      AND s.id = results.school_id
      AND p.role IN ('school_admin', 'principal', 'head_teacher', 'teacher')
    )
  );

CREATE POLICY "results_insert_auth"
  ON results FOR INSERT
  TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'super_admin'::app_role) OR
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN schools s ON p.school_id = s.tenant_id
      WHERE p.id = auth.uid()
      AND s.id = results.school_id
      AND p.role IN ('school_admin', 'principal', 'head_teacher', 'teacher')
    )
  );

CREATE POLICY "results_update_auth"
  ON results FOR UPDATE
  TO authenticated
  USING (
    has_role(auth.uid(), 'super_admin'::app_role) OR
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN schools s ON p.school_id = s.tenant_id
      WHERE p.id = auth.uid()
      AND s.id = results.school_id
      AND p.role IN ('school_admin', 'principal', 'head_teacher', 'teacher')
    )
  );

CREATE POLICY "results_delete_auth"
  ON results FOR DELETE
  TO authenticated
  USING (
    has_role(auth.uid(), 'super_admin'::app_role) OR
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN schools s ON p.school_id = s.tenant_id
      WHERE p.id = auth.uid()
      AND s.id = results.school_id
      AND p.role IN ('school_admin', 'principal', 'head_teacher', 'teacher')
    )
  );
