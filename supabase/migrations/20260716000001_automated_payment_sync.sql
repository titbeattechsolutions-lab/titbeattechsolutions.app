-- 1. Create the Security Definer function to handle the autonomic sync
CREATE OR REPLACE FUNCTION public.sync_tenant_payment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER -- Ensures it runs with elevated privileges to bypass RLS issues
SET search_path = public
AS $$
DECLARE
  _school_id UUID;
BEGIN
  -- A. Update Authoritative Tenants Table
  UPDATE public.tenants
  SET status = 'active',
      plan = NEW.plan, -- Legacy enum duration
      subscription_starts_at = NEW.period_start,
      subscription_ends_at = NEW.period_end,
      updated_at = NOW()
  WHERE id = NEW.tenant_id;

  -- B. Resolve the related School ID
  SELECT id INTO _school_id FROM public.schools WHERE tenant_id = NEW.tenant_id LIMIT 1;

  IF _school_id IS NOT NULL THEN
    -- C. Sync the Schools Table (UI Status)
    UPDATE public.schools
    SET status = 'active'
    WHERE id = _school_id;

    -- D. Sync the Billing Table (UI Dates & Tier)
    UPDATE public.billing
    SET status = 'active',
        plan = NEW.tier,
        billing_cycle = NEW.plan,
        current_period_end = NEW.period_end,
        updated_at = NOW()
    WHERE school_id = _school_id;
  END IF;

  RETURN NEW;
END;
$$;

-- 2. Bind the trigger to the subscription_payments table
DROP TRIGGER IF EXISTS trg_sync_tenant_payment ON public.subscription_payments;
CREATE TRIGGER trg_sync_tenant_payment
  AFTER INSERT ON public.subscription_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_tenant_payment();
