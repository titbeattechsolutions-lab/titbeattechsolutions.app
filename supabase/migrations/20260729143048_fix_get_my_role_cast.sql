-- Explicitly cast the string literals to app_role to avoid Postgres function signature resolution errors
CREATE OR REPLACE FUNCTION public.get_my_role()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN public.has_role(auth.uid(), 'super_admin'::app_role) THEN 'super_admin'
    WHEN public.has_role(auth.uid(), 'school_admin'::app_role) THEN 'school_admin'
    ELSE (SELECT role FROM public.profiles WHERE id = auth.uid())
  END
$function$;
