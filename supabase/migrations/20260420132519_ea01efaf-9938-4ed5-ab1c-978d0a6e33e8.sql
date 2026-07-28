CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE OR REPLACE FUNCTION public.check_tenant_expiry()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.subscription_ends_at IS NOT NULL
     AND NEW.subscription_ends_at < now()
     AND NEW.status NOT IN ('expired', 'suspended') THEN
    NEW.status = 'expired';
  END IF;
  RETURN NEW;
END;
$$;
