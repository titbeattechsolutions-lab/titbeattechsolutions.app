-- =====================================================================
-- 005: schools table
-- Each school is linked 1:1 to a tenant. tenant_id is the FK to
-- public.tenants(id). school_id in all downstream tables = schools.id.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.schools (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL UNIQUE REFERENCES public.tenants(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  code             TEXT UNIQUE NOT NULL,
  email            TEXT,
  phone            TEXT,
  address_street   TEXT,
  address_city     TEXT,
  address_state    TEXT,
  address_country  TEXT DEFAULT 'Nigeria',
  logo             TEXT,
  timezone         TEXT DEFAULT 'Africa/Lagos',
  academic_year    TEXT DEFAULT '2025/2026',
  current_term     TEXT DEFAULT 'first'
                   CHECK (current_term IN ('first','second','third')),
  features         JSONB DEFAULT '{"attendance":true,"results":true,"fees":false,"library":false,"events":true}'::jsonb,
  max_students     INTEGER NOT NULL DEFAULT 500,
  current_students INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_schools_tenant ON public.schools(tenant_id);

ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;

-- Users can read only their own school
CREATE POLICY "schools_read_own"
  ON public.schools FOR SELECT
  USING (
    id = auth.school_id()
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );

-- Only school_admin / principal can update their own school settings
CREATE POLICY "schools_update_own"
  ON public.schools FOR UPDATE
  USING (id = auth.school_id() AND auth.is_school_admin());

-- Super admin can insert (provision new school record when creating tenant)
CREATE POLICY "schools_superadmin_insert"
  ON public.schools FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

-- Super admin can delete
CREATE POLICY "schools_superadmin_delete"
  ON public.schools FOR DELETE
  USING (public.has_role(auth.uid(), 'super_admin'::app_role));

-- No client INSERT/DELETE for school staff — service role / super_admin only

CREATE TRIGGER trg_schools_updated
  BEFORE UPDATE ON public.schools
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
