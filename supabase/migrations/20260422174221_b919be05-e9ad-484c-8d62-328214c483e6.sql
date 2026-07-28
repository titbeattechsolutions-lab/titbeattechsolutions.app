-- =====================================================================
-- 1. Case-insensitive unique constraint on school_name
-- =====================================================================
CREATE UNIQUE INDEX IF NOT EXISTS tenants_school_name_ci_uq
  ON public.tenants (lower(school_name));

-- =====================================================================
-- 2. Detect duplicate tenants (same name, email, or phone — normalised)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.find_duplicate_tenants()
RETURNS TABLE(
  match_type   TEXT,
  match_value  TEXT,
  tenant_ids   UUID[],
  school_names TEXT[],
  occurrences  INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT 'school_name'::TEXT,
         lower(t.school_name),
         array_agg(t.id ORDER BY t.created_at),
         array_agg(t.school_name ORDER BY t.created_at),
         count(*)::INTEGER
    FROM public.tenants t
   GROUP BY lower(t.school_name)
   HAVING count(*) > 1
  UNION ALL
  SELECT 'contact_email'::TEXT,
         lower(t.contact_email),
         array_agg(t.id ORDER BY t.created_at),
         array_agg(t.school_name ORDER BY t.created_at),
         count(*)::INTEGER
    FROM public.tenants t
   WHERE t.contact_email IS NOT NULL AND t.contact_email <> ''
   GROUP BY lower(t.contact_email)
   HAVING count(*) > 1
  UNION ALL
  SELECT 'contact_phone'::TEXT,
         regexp_replace(t.contact_phone, '\D', '', 'g'),
         array_agg(t.id ORDER BY t.created_at),
         array_agg(t.school_name ORDER BY t.created_at),
         count(*)::INTEGER
    FROM public.tenants t
   WHERE t.contact_phone IS NOT NULL AND t.contact_phone <> ''
   GROUP BY regexp_replace(t.contact_phone, '\D', '', 'g')
   HAVING count(*) > 1;
END;
$$;

REVOKE ALL ON FUNCTION public.find_duplicate_tenants() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.find_duplicate_tenants() TO authenticated;

-- =====================================================================
-- 3. School PIN reset (super-admin only) + revoke sessions + audit
-- =====================================================================
CREATE OR REPLACE FUNCTION public.reset_school_pin(_tenant_id UUID, _new_pin TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _exists BOOLEAN;
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF _tenant_id IS NULL OR _new_pin IS NULL OR length(_new_pin) < 4 THEN
    RAISE EXCEPTION 'tenant_id and pin (>=4 chars) required';
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.tenants WHERE id = _tenant_id) INTO _exists;
  IF NOT _exists THEN
    RAISE EXCEPTION 'tenant not found';
  END IF;

  UPDATE public.tenants
     SET school_pin_hash = crypt(_new_pin, gen_salt('bf', 10)),
         updated_at      = now()
   WHERE id = _tenant_id;

  -- Revoke all live sessions for this tenant
  DELETE FROM public.tenant_sessions WHERE tenant_id = _tenant_id;

  INSERT INTO public.tenant_auth_audit(event_type, tenant_id, success, reason)
  VALUES ('school_pin_verify', _tenant_id, TRUE,
          'school pin reset by super_admin; sessions revoked');

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.reset_school_pin(UUID, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.reset_school_pin(UUID, TEXT) TO authenticated;

-- =====================================================================
-- 4. Harden tenants RLS — deny anon outright, defence-in-depth
-- =====================================================================
CREATE POLICY "Tenants table: deny anonymous"
  ON public.tenants
  AS RESTRICTIVE
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

-- =====================================================================
-- 5. Prevent plaintext PIN hashes from ever being written
-- =====================================================================
CREATE OR REPLACE FUNCTION public._enforce_bcrypt_pins()
RETURNS TRIGGER
LANGUAGE plpgsql
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

DROP TRIGGER IF EXISTS enforce_bcrypt_pins ON public.tenants;
CREATE TRIGGER enforce_bcrypt_pins
  BEFORE INSERT OR UPDATE OF school_pin_hash, admin_pin_hash
  ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public._enforce_bcrypt_pins();
