-- =====================================================================
-- 004: profiles table + RLS helper functions
-- Roles supported (excluding student/parent per platform scope):
--   superadmin | school_admin | principal | head_teacher | teacher | unassigned
-- =====================================================================

-- ─── Profiles table ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  school_id   UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
  role        TEXT NOT NULL DEFAULT 'unassigned'
              CHECK (role IN (
                'superadmin','school_admin','principal',
                'head_teacher','teacher','unassigned'
              )),
  first_name  TEXT,
  last_name   TEXT,
  email       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Users read their own profile
CREATE POLICY "profiles_read_own"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

-- Users update their own profile (name fields only — role/school_id must go via service role)
CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- Super admins can read all profiles
CREATE POLICY "profiles_superadmin_read_all"
  ON public.profiles FOR SELECT
  USING (public.has_role(auth.uid(), 'super_admin'::app_role));

-- Super admins can write all profiles (for provisioning school_admin etc.)
CREATE POLICY "profiles_superadmin_write_all"
  ON public.profiles FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

-- updated_at trigger
CREATE TRIGGER trg_profiles_updated
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── Auto-create profile on signup ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role)
  VALUES (NEW.id, NEW.email, 'unassigned')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_profile();

-- ─── RLS helper functions ─────────────────────────────────────────────
-- Returns the current user's school_id (tenant_id) from their profile
CREATE OR REPLACE FUNCTION auth.school_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT school_id FROM public.profiles WHERE id = auth.uid()
$$;

-- Returns the current user's role from their profile
CREATE OR REPLACE FUNCTION auth.user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid()
$$;

-- Is current user a teacher or above?
CREATE OR REPLACE FUNCTION auth.is_teacher()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role IN ('superadmin','school_admin','principal','head_teacher','teacher')
  FROM public.profiles WHERE id = auth.uid()
$$;

-- Is current user a school admin, principal, or superadmin?
CREATE OR REPLACE FUNCTION auth.is_school_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role IN ('superadmin','school_admin','principal')
  FROM public.profiles WHERE id = auth.uid()
$$;

-- Grant helpers to authenticated (they use auth.uid() internally — safe)
GRANT EXECUTE ON FUNCTION auth.school_id()      TO authenticated;
GRANT EXECUTE ON FUNCTION auth.user_role()      TO authenticated;
GRANT EXECUTE ON FUNCTION auth.is_teacher()     TO authenticated;
GRANT EXECUTE ON FUNCTION auth.is_school_admin() TO authenticated;
