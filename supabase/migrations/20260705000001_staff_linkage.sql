-- 1. Add columns
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS staff_member_id TEXT,
  ADD COLUMN IF NOT EXISTS signature TEXT;

-- 2. Allow tenant-wide read (for signature fallback lookups)
CREATE POLICY "profiles_read_tenant"
  ON public.profiles FOR SELECT
  USING (school_id = auth.school_id());

-- 3. Allow admins to write staff_member_id on others' profiles within their school
CREATE POLICY "profiles_update_staff_linkage_tenant"
  ON public.profiles FOR UPDATE
  USING (
    school_id = auth.school_id()
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('school_admin', 'principal', 'head_teacher')
    )
  )
  WITH CHECK (
    school_id = auth.school_id()
  );
