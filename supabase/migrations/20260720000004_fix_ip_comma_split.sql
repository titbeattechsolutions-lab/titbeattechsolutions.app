-- =====================================================================
-- Fix comma-separated IP bug in both session and activity log triggers.
-- x-forwarded-for often contains multiple IPs (client_ip, proxy_ip).
-- We must split by comma and extract the first part to get the real IP.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.trg_activity_logs_capture_ip()
RETURNS TRIGGER AS $$
DECLARE
  _ip TEXT;
BEGIN
  -- Securely extract the IP from PostgREST headers
  _ip := current_setting('request.headers', true)::json->>'x-forwarded-for';
  IF _ip IS NOT NULL THEN
    _ip := trim(split_part(_ip, ',', 1));
  ELSE
    _ip := current_setting('request.headers', true)::json->>'x-real-ip';
    IF _ip IS NOT NULL THEN
      _ip := trim(split_part(_ip, ',', 1));
    END IF;
  END IF;

  -- Initialize details JSONB if null
  IF NEW.details IS NULL THEN
    NEW.details := '{}'::jsonb;
  END IF;

  -- Inject the captured IP address alongside the performed_by data
  IF _ip IS NOT NULL THEN
    NEW.details := NEW.details || jsonb_build_object('ip_address', _ip);
  END IF;

  -- Fallback capture of performed_by if not supplied explicitly
  IF NEW.performed_by IS NULL THEN
    NEW.performed_by := auth.uid();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


CREATE OR REPLACE FUNCTION public.trg_session_logs_capture_ip()
RETURNS TRIGGER AS $$
DECLARE
  _ip TEXT;
BEGIN
  -- Only attempt to capture if the client didn't explicitly provide one
  IF NEW.ip_address IS NULL THEN
    -- Securely extract the IP from PostgREST headers
    _ip := current_setting('request.headers', true)::json->>'x-forwarded-for';
    IF _ip IS NOT NULL THEN
      _ip := trim(split_part(_ip, ',', 1));
    ELSE
      _ip := current_setting('request.headers', true)::json->>'x-real-ip';
      IF _ip IS NOT NULL THEN
        _ip := trim(split_part(_ip, ',', 1));
      END IF;
    END IF;

    -- Assign to the row
    IF _ip IS NOT NULL THEN
      NEW.ip_address := _ip;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
