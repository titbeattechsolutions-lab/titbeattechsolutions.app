CREATE OR REPLACE FUNCTION public.create_tenant_v2(_school_name text, _school_pin text, _contact_email text DEFAULT NULL::text, _contact_phone text DEFAULT NULL::text, _notes text DEFAULT NULL::text, _start_trial boolean DEFAULT true)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _id UUID;
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  INSERT INTO public.tenants(
    school_name, school_code, school_pin_hash, contact_email, contact_phone, notes,
    status, plan, trial_started_at, subscription_ends_at
  ) VALUES (
    _school_name,
    _school_pin,
    extensions.crypt(_school_pin, extensions.gen_salt('bf', 10)),
    _contact_email, _contact_phone, _notes,
    CASE WHEN _start_trial THEN 'trial'::tenant_status ELSE 'expired'::tenant_status END,
    'trial'::tenant_plan,
    CASE WHEN _start_trial THEN now() ELSE NULL END,
    CASE WHEN _start_trial THEN now() + INTERVAL '7 days' ELSE NULL END
  ) RETURNING id INTO _id;
  RETURN _id;
END;
$function$;
