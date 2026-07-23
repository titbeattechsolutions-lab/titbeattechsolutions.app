-- =====================================================================
-- Migration: Security Audit Fixes
-- Description: Resolves three RLS vulnerabilities flagged by linter:
-- 1. profiles_read_tenant: scopes read access to self or school admins
-- 2. activity_logs_insert: ensures school_admin/principal inserts are scoped to their own school
-- 3. Block role self-assignment: scoped to INSERT/UPDATE/DELETE to prevent blocking SELECT
-- =====================================================================

-- 1. Fix profiles_read_tenant
DROP POLICY IF EXISTS "profiles_read_tenant" ON public.profiles;

CREATE POLICY "profiles_read_tenant"
  ON public.profiles FOR SELECT
  USING (
    id = auth.uid() OR 
    (school_id = public.get_my_school_id() AND public.is_school_admin())
  );

-- 2. Fix activity_logs_insert
DROP POLICY IF EXISTS "activity_logs_insert" ON public.activity_logs;

CREATE POLICY "activity_logs_insert"
  ON public.activity_logs FOR INSERT
  WITH CHECK (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('super_admin') OR
    (
      (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('school_admin', 'principal') 
      AND school_id = public.get_my_school_id()
    )
  );

-- 3. Fix user_roles restrictive policy
DROP POLICY IF EXISTS "Block role self-assignment" ON public.user_roles;

CREATE POLICY "Block role self-assignment_insert"
  ON public.user_roles AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Block role self-assignment_update"
  ON public.user_roles AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Block role self-assignment_delete"
  ON public.user_roles AS RESTRICTIVE FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role));
