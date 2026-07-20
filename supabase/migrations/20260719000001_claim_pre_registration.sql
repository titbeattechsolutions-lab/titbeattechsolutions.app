-- Ensure pre_registrations exists in case it was dropped or failed to run
CREATE TABLE IF NOT EXISTS public.pre_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Safely add claimed_at if it doesn't exist to preserve audit trail
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema='public' AND table_name='pre_registrations' AND column_name='claimed_at') THEN
        ALTER TABLE public.pre_registrations ADD COLUMN claimed_at TIMESTAMPTZ;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_pre_reg_email ON public.pre_registrations(email);
CREATE INDEX IF NOT EXISTS idx_pre_reg_school ON public.pre_registrations(school_id);

ALTER TABLE public.pre_registrations ENABLE ROW LEVEL SECURITY;

-- Patch the existing profiles security trigger to allow trusted bypass
CREATE OR REPLACE FUNCTION public.protect_profile_sensitive_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Allow trusted internal functions (like claim_pre_registration) to bypass this trigger
  IF current_setting('app.claiming_pre_registration', true) = 'true' THEN
    RETURN NEW;
  END IF;

  -- Only intercept if the request is coming from a client-side authenticated user session
  IF auth.uid() IS NOT NULL THEN
    -- If the user is NOT already a super admin, they cannot promote themselves or change schools
    IF NOT public.has_role(auth.uid(), 'super_admin'::app_role) THEN
      NEW.role := OLD.role;
      NEW.school_id := OLD.school_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;


-- Create RPC for claiming invite
CREATE OR REPLACE FUNCTION public.claim_pre_registration()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _email TEXT;
  _school_id UUID;
  _role TEXT;
BEGIN
  -- Extract email from JWT payload securely
  _email := auth.jwt()->>'email';
  IF _email IS NULL THEN 
    RETURN FALSE; 
  END IF;

  -- Look up pending invite (case insensitive)
  SELECT school_id, role INTO _school_id, _role
  FROM public.pre_registrations
  WHERE LOWER(email) = LOWER(_email) AND claimed_at IS NULL;

  IF NOT FOUND THEN 
    RETURN FALSE; 
  END IF;

  -- Set session flag to bypass the protect_profile_sensitive_columns trigger (is_local = true)
  PERFORM set_config('app.claiming_pre_registration', 'true', true);

  -- Apply to user profile
  UPDATE public.profiles
  SET school_id = _school_id, 
      role = _role
  WHERE id = auth.uid();

  -- Reset the session flag (though it would automatically clear at end of transaction)
  PERFORM set_config('app.claiming_pre_registration', '', true);

  -- Mark the invite as claimed to preserve audit trail
  UPDATE public.pre_registrations 
  SET claimed_at = now()
  WHERE LOWER(email) = LOWER(_email) AND claimed_at IS NULL;

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_pre_registration() TO authenticated;
