CREATE OR REPLACE FUNCTION public.test_profiles_insert()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role)
  VALUES (gen_random_uuid(), 'test@test.com', 'unassigned');
  RETURN 'Success';
EXCEPTION WHEN OTHERS THEN
  RETURN SQLERRM;
END;
$$;
