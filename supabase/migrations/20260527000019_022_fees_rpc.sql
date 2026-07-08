CREATE OR REPLACE FUNCTION public.get_or_create_student(
  _session_token TEXT, _admission_no TEXT, _full_name TEXT, _class_name TEXT
) RETURNS UUID SECURITY DEFINER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE _school_id UUID; _student_id UUID; _first TEXT; _last TEXT;
BEGIN
  SELECT s.id INTO _school_id FROM public.tenant_sessions ts
    JOIN public.schools s ON s.tenant_id = ts.tenant_id
    WHERE ts.token = _session_token AND ts.expires_at > now();
  IF _school_id IS NULL THEN RAISE EXCEPTION 'Invalid or expired session'; END IF;

  _first := split_part(trim(_full_name), ' ', 1);
  _last := NULLIF(trim(substring(_full_name from length(_first) + 1)), '');
  IF _last IS NULL THEN _last := _first; END IF;

  INSERT INTO public.students (school_id, admission_no, first_name, last_name, class_name)
  VALUES (_school_id, _admission_no, _first, _last, _class_name)
  ON CONFLICT (school_id, admission_no) 
  DO UPDATE SET class_name = EXCLUDED.class_name, updated_at = now()
  RETURNING id INTO _student_id;

  RETURN _student_id;
END; $$;

CREATE OR REPLACE FUNCTION public.save_fee_structure(
  _session_token TEXT, _class_name TEXT, _term TEXT, _academic_year TEXT,
  _amount NUMERIC, _details TEXT
) RETURNS UUID SECURITY DEFINER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE _school_id UUID; _fee_id UUID; _normalized_term TEXT;
BEGIN
  SELECT s.id INTO _school_id FROM public.tenant_sessions ts
    JOIN public.schools s ON s.tenant_id = ts.tenant_id
    WHERE ts.token = _session_token AND ts.expires_at > now();
  IF _school_id IS NULL THEN RAISE EXCEPTION 'Invalid or expired session'; END IF;

  _normalized_term := lower(split_part(trim(_term), ' ', 1));

  SELECT id INTO _fee_id FROM public.fees 
    WHERE school_id = _school_id AND term = _normalized_term AND academic_year = _academic_year
    AND _class_name = ANY(applicable_to);

  IF _fee_id IS NULL THEN
    INSERT INTO public.fees (school_id, name, amount, term, academic_year, applicable_to)
    VALUES (_school_id, _details, _amount, _normalized_term, _academic_year, ARRAY[_class_name])
    RETURNING id INTO _fee_id;
  ELSE
    UPDATE public.fees SET amount = _amount, name = _details, updated_at = now() WHERE id = _fee_id;
  END IF;

  RETURN _fee_id;
END; $$;

CREATE OR REPLACE FUNCTION public.record_payment(
  _session_token TEXT, _admission_no TEXT, _student_name TEXT, _class_name TEXT,
  _term TEXT, _academic_year TEXT, _amount NUMERIC, _note TEXT
) RETURNS UUID SECURITY DEFINER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE _school_id UUID; _student_id UUID; _fee_id UUID; _fee_name TEXT; _payment_id UUID; _normalized_term TEXT;
BEGIN
  SELECT s.id INTO _school_id FROM public.tenant_sessions ts
    JOIN public.schools s ON s.tenant_id = ts.tenant_id
    WHERE ts.token = _session_token AND ts.expires_at > now();
  IF _school_id IS NULL THEN RAISE EXCEPTION 'Invalid or expired session'; END IF;

  _normalized_term := lower(split_part(trim(_term), ' ', 1));
  _student_id := public.get_or_create_student(_session_token, _admission_no, _student_name, _class_name);

  SELECT id, name INTO _fee_id, _fee_name FROM public.fees 
    WHERE school_id = _school_id AND term = _normalized_term AND academic_year = _academic_year
    AND _class_name = ANY(applicable_to);
  IF _fee_id IS NULL THEN RAISE EXCEPTION 'No fee structure found for this class/term'; END IF;

  INSERT INTO public.payments (school_id, student_id, student_name, fee_id, fee_name, 
    amount, status, channel, paid_by, paid_at)
  VALUES (_school_id, _student_id, _student_name, _fee_id, _fee_name, 
    _amount, 'success', 'manual', _note, now())
  RETURNING id INTO _payment_id;

  RETURN _payment_id;
END; $$;

CREATE OR REPLACE FUNCTION public.get_fee_data(_session_token TEXT)
RETURNS TABLE(fee_id UUID, class_name TEXT, term TEXT, academic_year TEXT, 
  fee_amount NUMERIC, fee_name TEXT, payment_id UUID, student_name TEXT, 
  paid_amount NUMERIC, paid_at TIMESTAMPTZ, paid_by TEXT)
SECURITY DEFINER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE _school_id UUID;
BEGIN
  SELECT s.id INTO _school_id FROM public.tenant_sessions ts
    JOIN public.schools s ON s.tenant_id = ts.tenant_id
    WHERE ts.token = _session_token AND ts.expires_at > now();
  IF _school_id IS NULL THEN RAISE EXCEPTION 'Invalid or expired session'; END IF;

  RETURN QUERY
  SELECT f.id, unnest(f.applicable_to), (initcap(f.term) || ' Term')::TEXT, f.academic_year, f.amount, f.name,
    p.id, p.student_name, p.amount, p.paid_at, p.paid_by
  FROM public.fees f
  LEFT JOIN public.payments p ON p.fee_id = f.id
  WHERE f.school_id = _school_id;
END; $$;

GRANT EXECUTE ON FUNCTION public.get_or_create_student(TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_fee_structure(TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_payment(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_fee_data(TEXT) TO anon, authenticated;
