CREATE OR REPLACE FUNCTION public.get_auth_triggers()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _result JSON;
BEGIN
  SELECT json_agg(json_build_object(
    'trigger_name', tgname,
    'table', relname,
    'function', proname
  )) INTO _result
  FROM pg_trigger t
  JOIN pg_class c ON t.tgrelid = c.oid
  JOIN pg_proc p ON t.tgfoid = p.oid
  JOIN pg_namespace n ON c.relnamespace = n.oid
  WHERE n.nspname = 'auth' AND c.relname = 'users';
  
  RETURN _result;
END;
$$;
