-- Add SECURITY DEFINER to the bcrypt pin enforcement trigger
-- This allows the trigger to execute public._is_bcrypt() successfully on behalf of the user
-- even when the authenticated user does not have direct execute permissions on _is_bcrypt.

CREATE OR REPLACE FUNCTION public._enforce_bcrypt_pins()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.school_pin_hash IS NOT NULL AND NOT public._is_bcrypt(NEW.school_pin_hash) THEN
    -- Allow legacy SHA-256 hashes to remain readable but block any *new* writes
    -- of non-bcrypt values. UPDATE that keeps the same legacy value is allowed.
    IF TG_OP = 'INSERT'
       OR NEW.school_pin_hash IS DISTINCT FROM OLD.school_pin_hash THEN
      RAISE EXCEPTION 'school_pin_hash must be a bcrypt hash';
    END IF;
  END IF;

  IF NEW.admin_pin_hash IS NOT NULL AND NOT public._is_bcrypt(NEW.admin_pin_hash) THEN
    IF TG_OP = 'INSERT'
       OR NEW.admin_pin_hash IS DISTINCT FROM OLD.admin_pin_hash THEN
      RAISE EXCEPTION 'admin_pin_hash must be a bcrypt hash';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
