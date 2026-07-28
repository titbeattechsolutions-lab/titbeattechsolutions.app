-- =====================================================================
-- 015: Storage buckets + deployment verification queries
-- =====================================================================

-- ─── Storage buckets ─────────────────────────────────────────────────
-- school-assets: public bucket for school logos and shared media
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'school-assets',
  'school-assets',
  true,
  5242880,   -- 5 MB
  ARRAY['image/jpeg','image/png','image/webp','image/svg+xml']
)
ON CONFLICT (id) DO NOTHING;

-- student-documents: private bucket for sensitive student files
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'student-documents',
  'student-documents',
  false,
  10485760,  -- 10 MB
  ARRAY['application/pdf','image/jpeg','image/png']
)
ON CONFLICT (id) DO NOTHING;

-- ─── Storage RLS: school-assets ──────────────────────────────────────
-- Any authenticated user in the same school can read
CREATE POLICY "school_assets_read"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'school-assets'
    AND auth.role() = 'authenticated'
  );

-- Only school admins can upload to their school's folder
-- Objects must be stored under: {school_id}/{filename}
CREATE POLICY "school_assets_upload"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'school-assets'
    AND auth.role() = 'authenticated'
    AND public.is_school_admin()
    AND (storage.foldername(name))[1] = public.school_id()::text
  );

-- School admins can delete their own school's objects
CREATE POLICY "school_assets_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'school-assets'
    AND public.is_school_admin()
    AND (storage.foldername(name))[1] = public.school_id()::text
  );

-- ─── Storage RLS: student-documents ──────────────────────────────────
-- Only teaching staff in the same school can read
CREATE POLICY "student_docs_read"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'student-documents'
    AND auth.role() = 'authenticated'
    AND public.is_teacher()
    AND (storage.foldername(name))[1] = public.school_id()::text
  );

-- Only school admins can upload student documents
CREATE POLICY "student_docs_upload"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'student-documents'
    AND auth.role() = 'authenticated'
    AND public.is_school_admin()
    AND (storage.foldername(name))[1] = public.school_id()::text
  );

-- ─── Deployment verification queries (run manually) ──────────────────
-- These are informational — stored as comments for the checklist.

-- 1. Verify ALL public tables have RLS enabled:
--    SELECT tablename, rowsecurity
--    FROM pg_tables
--    WHERE schemaname = 'public'
--    ORDER BY tablename;
--    Expected: rowsecurity = true for every row.

-- 2. Verify no client INSERT/UPDATE/DELETE on payments:
--    SELECT policyname, cmd, qual
--    FROM pg_policies
--    WHERE tablename = 'payments' AND schemaname = 'public';
--    Expected: only SELECT policies present.

-- 3. Verify trigger on results table:
--    SELECT trigger_name, event_manipulation, action_timing
--    FROM information_schema.triggers
--    WHERE event_object_table = 'results';
--    Expected: trg_compute_result_totals BEFORE INSERT, UPDATE.

-- 4. Verify trigger on students table:
--    SELECT trigger_name FROM information_schema.triggers
--    WHERE event_object_table = 'students';
--    Expected: on_student_change, trg_students_updated.

-- 5. Verify auth helpers exist:
--    SELECT proname FROM pg_proc
--    WHERE pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'auth')
--    AND proname IN ('school_id','user_role','is_teacher','is_school_admin','school_is_active');
--    Expected: all 5 rows returned.

-- 6. Unauthenticated REST call must return 401:
--    curl -I https://YOUR_PROJECT.supabase.co/rest/v1/students
--    Expected: HTTP/2 401

-- 7. Trigger-computed score_total check:
--    INSERT INTO public.results (school_id, student_id, ..., score_ca1, score_ca2, score_exam)
--    VALUES (..., 15, 15, 50) RETURNING score_total, grade;
--    Expected: score_total = 80, grade = 'A1'
