-- ─── Roles ────────────────────────────────────────────────────
CREATE TYPE public.app_role AS ENUM ('super_admin', 'school_admin');

CREATE TABLE public.user_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE POLICY "Super admins manage all roles"
ON public.user_roles FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Users can view their own roles"
ON public.user_roles FOR SELECT TO authenticated
USING (user_id = auth.uid());

-- ─── Tenants ──────────────────────────────────────────────────
CREATE TYPE public.tenant_status AS ENUM ('trial', 'active', 'expired', 'suspended');
CREATE TYPE public.tenant_plan AS ENUM ('trial', 'termly', 'yearly');

CREATE TABLE public.tenants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_name TEXT NOT NULL,
  contact_email TEXT,
  contact_phone TEXT,
  school_pin_hash TEXT NOT NULL UNIQUE,
  admin_pin_hash TEXT,
  status tenant_status NOT NULL DEFAULT 'trial',
  plan tenant_plan NOT NULL DEFAULT 'trial',
  trial_started_at TIMESTAMPTZ,
  subscription_starts_at TIMESTAMPTZ,
  subscription_ends_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins full access to tenants"
ON public.tenants FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- ─── Payments ─────────────────────────────────────────────────
CREATE TABLE public.subscription_payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL,
  plan tenant_plan NOT NULL,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  recorded_by UUID REFERENCES auth.users(id),
  reference TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.subscription_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins full access to payments"
ON public.subscription_payments FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- ─── Tenant data store (JSON blob per tenant) ─────────────────
CREATE TABLE public.tenant_data (
  tenant_id UUID NOT NULL PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.tenant_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins read all tenant data"
ON public.tenant_data FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins write tenant data"
ON public.tenant_data FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- ─── updated_at trigger ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_tenants_updated BEFORE UPDATE ON public.tenants
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_tenant_data_updated BEFORE UPDATE ON public.tenant_data
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── Auto-grant super_admin to designated email ──────────────
CREATE OR REPLACE FUNCTION public.handle_new_user_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email = 'pchiderasamuel@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'super_admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created_role
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_role();

-- ─── PIN verification RPC (security definer, bypasses RLS for tenant_data) ─
CREATE OR REPLACE FUNCTION public.verify_school_pin(_pin_hash TEXT)
RETURNS TABLE (
  tenant_id UUID,
  school_name TEXT,
  status tenant_status,
  plan tenant_plan,
  subscription_ends_at TIMESTAMPTZ,
  trial_started_at TIMESTAMPTZ,
  has_admin_pin BOOLEAN
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, school_name, status, plan, subscription_ends_at, trial_started_at,
    (admin_pin_hash IS NOT NULL) AS has_admin_pin
  FROM public.tenants WHERE school_pin_hash = _pin_hash;
$$;

CREATE OR REPLACE FUNCTION public.verify_admin_pin(_tenant_id UUID, _pin_hash TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tenants
    WHERE id = _tenant_id AND admin_pin_hash = _pin_hash
  );
$$;

CREATE OR REPLACE FUNCTION public.set_admin_pin(_tenant_id UUID, _pin_hash TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.tenants
  SET admin_pin_hash = _pin_hash, updated_at = now()
  WHERE id = _tenant_id AND admin_pin_hash IS NULL;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_tenant_data(_tenant_id UUID, _school_pin_hash TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _valid BOOLEAN;
  _data JSONB;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.tenants
    WHERE id = _tenant_id
      AND school_pin_hash = _school_pin_hash
      AND status IN ('trial', 'active')
  ) INTO _valid;
  IF NOT _valid THEN RETURN NULL; END IF;
  SELECT data INTO _data FROM public.tenant_data WHERE tenant_id = _tenant_id;
  RETURN COALESCE(_data, '{}'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.save_tenant_data(_tenant_id UUID, _school_pin_hash TEXT, _data JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _valid BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.tenants
    WHERE id = _tenant_id
      AND school_pin_hash = _school_pin_hash
      AND status IN ('trial', 'active')
  ) INTO _valid;
  IF NOT _valid THEN RETURN FALSE; END IF;
  INSERT INTO public.tenant_data (tenant_id, data) VALUES (_tenant_id, _data)
  ON CONFLICT (tenant_id) DO UPDATE SET data = EXCLUDED.data, updated_at = now();
  RETURN TRUE;
END;
$$;

-- ─── Auto-expire trigger: flip to 'expired' when subscription_ends_at passes ─
CREATE OR REPLACE FUNCTION public.check_tenant_expiry()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.subscription_ends_at IS NOT NULL
     AND NEW.subscription_ends_at < now()
     AND NEW.status NOT IN ('expired', 'suspended') THEN
    NEW.status = 'expired';
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_tenant_expiry BEFORE INSERT OR UPDATE ON public.tenants
FOR EACH ROW EXECUTE FUNCTION public.check_tenant_expiry();