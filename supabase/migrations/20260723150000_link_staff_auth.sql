-- =====================================================================
-- Migration: JIT Staff Auth Mapping (Native Auth)
-- Description: Maps a newly created synthetic Supabase Auth user
-- to their corresponding public.profiles record, securely bypassing
-- manual email verification and RLS restrictions.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.link_staff_auth(
  _staff_member_id TEXT,
  _role TEXT,
  _tenant_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid UUID := auth.uid();
  _school_id UUID;
BEGIN
  -- Must be signed in via the JIT frontend flow
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated in Supabase';
  END IF;

  -- Resolve school_id from tenant_id
  SELECT id INTO _school_id FROM public.schools WHERE tenant_id = _tenant_id;
  IF _school_id IS NULL THEN
    RAISE EXCEPTION 'School not found for tenant %', _tenant_id;
  END IF;

  -- Upsert the profile record
  INSERT INTO public.profiles (id, school_id, role, staff_member_id)
  VALUES (_uid, _school_id, _role, _staff_member_id)
  ON CONFLICT (id) DO UPDATE 
    SET school_id = EXCLUDED.school_id,
        role = EXCLUDED.role,
        staff_member_id = EXCLUDED.staff_member_id,
        updated_at = NOW();
        
END;
$$;

GRANT EXECUTE ON FUNCTION public.link_staff_auth(TEXT, TEXT, UUID) TO authenticated;
