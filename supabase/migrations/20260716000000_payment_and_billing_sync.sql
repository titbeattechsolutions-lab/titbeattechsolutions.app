-- =====================================================================
-- 20260716000000_payment_and_billing_sync.sql
-- Add dimension columns to correctly map Tier + Duration to subscriptions.
-- =====================================================================

DO $$ 
BEGIN 
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema='public' AND table_name='billing' AND column_name='billing_cycle'
  ) THEN
    ALTER TABLE public.billing ADD COLUMN billing_cycle TEXT CHECK (billing_cycle IN ('trial', 'termly', 'yearly')) DEFAULT 'trial';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema='public' AND table_name='subscription_payments' AND column_name='tier'
  ) THEN
    ALTER TABLE public.subscription_payments ADD COLUMN tier TEXT CHECK (tier IN ('starter', 'pro', 'enterprise'));
  END IF;
END $$;
