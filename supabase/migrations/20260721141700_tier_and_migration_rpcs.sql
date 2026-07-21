-- =====================================================================
-- Migration: Add Tier Upgrade and Student Promotion RPCs
-- =====================================================================

-- 1. Tier Upgrade RPC (superadmin only)
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
  IF _new_plan NOT IN ('starter', 'pro', 'enterprise') THEN
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
      WHEN _new_plan = 'pro' THEN 2000
      ELSE 500
    END,
    features = CASE
      WHEN _new_plan = 'enterprise' THEN features || '{"fees":true, "library":true}'::jsonb
      WHEN _new_plan = 'pro' THEN features || '{"fees":true, "library":false}'::jsonb
      ELSE features || '{"fees":false, "library":false}'::jsonb
    END,
    updated_at = NOW()
  WHERE id = _school_id;
END;
$$;

-- 2. Bulk Promote Students RPC (school admin only)
CREATE OR REPLACE FUNCTION public.promote_students(_school_id UUID, _current_class TEXT, _next_class TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify caller belongs to school and is a school admin or principal
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND school_id = _school_id
      AND role IN ('school_admin', 'principal')
  ) THEN
    RAISE EXCEPTION 'Forbidden: school admin access required for this school';
  END IF;

  -- Promote all active students in the current class to the next class
  UPDATE public.students
  SET class_name = _next_class, updated_at = NOW()
  WHERE school_id = _school_id
    AND class_name = _current_class
    AND status = 'active';
END;
$$;
