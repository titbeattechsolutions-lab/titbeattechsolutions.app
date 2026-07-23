-- =====================================================================
-- Migration: PIN-Only RLS (Custom Header Architecture)
-- Description: Allows pure PIN users (anon) to securely fetch data
-- by validating the x-tenant-session custom header against tenant_sessions.
-- =====================================================================

-- 1. Helper function to securely extract and validate the session header
CREATE OR REPLACE FUNCTION public.get_tenant_from_session()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id FROM public.tenant_sessions 
  WHERE token = (current_setting('request.headers', true)::json->>'x-tenant-session')
    AND expires_at > now() 
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_tenant_from_session() TO anon, authenticated;

-- 2. Add `anon` RLS policies for all relevant tables

-- SCHOOLS
DROP POLICY IF EXISTS "schools_anon_pin_access" ON public.schools;
CREATE POLICY "schools_anon_pin_access" ON public.schools FOR ALL TO anon
USING (id = public.get_tenant_from_session())
WITH CHECK (id = public.get_tenant_from_session());

-- STUDENTS
DROP POLICY IF EXISTS "students_anon_pin_access" ON public.students;
CREATE POLICY "students_anon_pin_access" ON public.students FOR ALL TO anon
USING (school_id = public.get_tenant_from_session())
WITH CHECK (school_id = public.get_tenant_from_session());

-- CLASSES
DROP POLICY IF EXISTS "classes_anon_pin_access" ON public.classes;
CREATE POLICY "classes_anon_pin_access" ON public.classes FOR ALL TO anon
USING (school_id = public.get_tenant_from_session())
WITH CHECK (school_id = public.get_tenant_from_session());

-- TEACHERS
DROP POLICY IF EXISTS "teachers_anon_pin_access" ON public.teachers;
CREATE POLICY "teachers_anon_pin_access" ON public.teachers FOR ALL TO anon
USING (school_id = public.get_tenant_from_session())
WITH CHECK (school_id = public.get_tenant_from_session());

-- SUBJECTS
DROP POLICY IF EXISTS "subjects_anon_pin_access" ON public.subjects;
CREATE POLICY "subjects_anon_pin_access" ON public.subjects FOR ALL TO anon
USING (school_id = public.get_tenant_from_session())
WITH CHECK (school_id = public.get_tenant_from_session());

-- ATTENDANCE
DROP POLICY IF EXISTS "attendance_anon_pin_access" ON public.attendance;
CREATE POLICY "attendance_anon_pin_access" ON public.attendance FOR ALL TO anon
USING (school_id = public.get_tenant_from_session())
WITH CHECK (school_id = public.get_tenant_from_session());

-- RESULTS
DROP POLICY IF EXISTS "results_anon_pin_access" ON public.results;
CREATE POLICY "results_anon_pin_access" ON public.results FOR ALL TO anon
USING (school_id = public.get_tenant_from_session())
WITH CHECK (school_id = public.get_tenant_from_session());

-- FEES
DROP POLICY IF EXISTS "fees_anon_pin_access" ON public.fees;
CREATE POLICY "fees_anon_pin_access" ON public.fees FOR ALL TO anon
USING (school_id = public.get_tenant_from_session())
WITH CHECK (school_id = public.get_tenant_from_session());

-- PAYMENTS
DROP POLICY IF EXISTS "payments_anon_pin_access" ON public.payments;
CREATE POLICY "payments_anon_pin_access" ON public.payments FOR ALL TO anon
USING (school_id = public.get_tenant_from_session())
WITH CHECK (school_id = public.get_tenant_from_session());

-- TIMETABLE
DROP POLICY IF EXISTS "timetable_anon_pin_access" ON public.timetable;
CREATE POLICY "timetable_anon_pin_access" ON public.timetable FOR ALL TO anon
USING (school_id = public.get_tenant_from_session())
WITH CHECK (school_id = public.get_tenant_from_session());

-- REPORT CARDS
DROP POLICY IF EXISTS "report_cards_anon_pin_access" ON public.report_cards;
CREATE POLICY "report_cards_anon_pin_access" ON public.report_cards FOR ALL TO anon
USING (school_id = public.get_tenant_from_session())
WITH CHECK (school_id = public.get_tenant_from_session());

-- PRE REGISTRATIONS
DROP POLICY IF EXISTS "pre_registrations_anon_pin_access" ON public.pre_registrations;
CREATE POLICY "pre_registrations_anon_pin_access" ON public.pre_registrations FOR ALL TO anon
USING (school_id = public.get_tenant_from_session())
WITH CHECK (school_id = public.get_tenant_from_session());
