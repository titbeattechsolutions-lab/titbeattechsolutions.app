-- Patch critical Privilege Escalation Vulnerability in public.profiles
-- RLS policies do not restrict columns, only rows. The profiles_update_own policy
-- inadvertently allowed any user to update their own role to 'superadmin'.
-- This trigger intercepts updates and silently discards malicious role/school_id modifications.

CREATE OR REPLACE FUNCTION public.protect_profile_sensitive_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
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

DROP TRIGGER IF EXISTS trg_protect_profile_columns ON public.profiles;
CREATE TRIGGER trg_protect_profile_columns
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profile_sensitive_columns();
