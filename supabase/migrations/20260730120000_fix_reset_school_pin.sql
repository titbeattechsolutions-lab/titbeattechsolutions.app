CREATE OR REPLACE FUNCTION public.reset_school_pin(_tenant_id uuid, _new_pin text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _exists BOOLEAN;
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _tenant_id IS NULL OR _new_pin IS NULL OR length(_new_pin) < 4 THEN
    RAISE EXCEPTION 'tenant_id and pin (>=4 chars) required';
  END IF;
  SELECT EXISTS (SELECT 1 FROM public.tenants WHERE id = _tenant_id) INTO _exists;
  IF NOT _exists THEN RAISE EXCEPTION 'tenant not found'; END IF;
  
  UPDATE public.tenants
     SET school_code = _new_pin,
         school_pin_hash = extensions.crypt(_new_pin, extensions.gen_salt('bf', 10)),
         updated_at  = now()
   WHERE id = _tenant_id;
   
  DELETE FROM public.tenant_sessions WHERE tenant_id = _tenant_id;
  INSERT INTO public.tenant_auth_audit(event_type, tenant_id, success, reason)
  VALUES ('school_pin_verify', _tenant_id, TRUE,
          'school pin reset by super_admin; sessions revoked');
  RETURN TRUE;
END;
$function$;
