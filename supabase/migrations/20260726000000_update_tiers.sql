-- Migration to update tiers from (starter, pro, enterprise) to (micro, starter, growth, enterprise)

-- 1. Migrate existing 'pro' data to 'growth'
UPDATE public.billing SET plan = 'growth' WHERE plan = 'pro';
UPDATE public.subscription_payments SET tier = 'growth' WHERE tier = 'pro';

-- 2. Drop constraints dynamically and add the new ones
DO $$ 
DECLARE
  constraint_name text;
BEGIN
  -- Drop constraint for billing.plan
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'public.billing'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%plan%';
  
  IF constraint_name IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.billing DROP CONSTRAINT ' || constraint_name;
  END IF;

  -- Add new constraint for billing.plan
  ALTER TABLE public.billing ADD CONSTRAINT billing_plan_check CHECK (plan IN ('micro', 'starter', 'growth', 'enterprise'));

  -- Drop constraint for subscription_payments.tier
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'public.subscription_payments'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%tier%';
  
  IF constraint_name IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.subscription_payments DROP CONSTRAINT ' || constraint_name;
  END IF;

  -- Add new constraint for subscription_payments.tier
  ALTER TABLE public.subscription_payments ADD CONSTRAINT subscription_payments_tier_check CHECK (tier IN ('micro', 'starter', 'growth', 'enterprise'));
END $$;

-- 3. Update the upgrade_school_tier RPC
CREATE OR REPLACE FUNCTION public.upgrade_school_tier(_school_id UUID, _new_plan TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify caller is superadmin (using the correct role check)
  IF NOT public.has_role(auth.uid(), 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'Forbidden: superadmin access required';
  END IF;

  -- Verify valid plan
  IF _new_plan NOT IN ('micro', 'starter', 'growth', 'enterprise') THEN
    RAISE EXCEPTION 'Invalid plan: %', _new_plan;
  END IF;

  -- Update billing plan
  UPDATE public.billing
  SET plan = _new_plan, updated_at = NOW()
  WHERE school_id = _school_id;

  -- Update max_students and safely merge features in schools table
  UPDATE public.schools
  SET 
    max_students = CASE
      WHEN _new_plan = 'enterprise' THEN 10000
      WHEN _new_plan = 'growth' THEN 1000
      WHEN _new_plan = 'starter' THEN 500
      WHEN _new_plan = 'micro' THEN 200
      ELSE 200
    END,
    features = CASE
      WHEN _new_plan = 'enterprise' THEN features || '{"fees":true, "library":true}'::jsonb
      WHEN _new_plan = 'growth' THEN features || '{"fees":true, "library":true}'::jsonb
      WHEN _new_plan = 'starter' THEN features || '{"fees":true, "library":false}'::jsonb
      WHEN _new_plan = 'micro' THEN features || '{"fees":true, "library":false}'::jsonb
      ELSE features || '{"fees":true, "library":false}'::jsonb
    END,
    updated_at = NOW()
  WHERE id = _school_id;
END;
$$;
