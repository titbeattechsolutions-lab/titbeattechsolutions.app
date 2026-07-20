-- =====================================================================
-- Capture Client IP Address for all Session Logs (Logins/Logouts)
-- Ensures all frontend auth events track the originating IP natively
-- =====================================================================

CREATE OR REPLACE FUNCTION public.trg_session_logs_capture_ip()
RETURNS TRIGGER AS $$
DECLARE
  _ip TEXT;
BEGIN
  -- Only attempt to capture if the client didn't explicitly provide one
  IF NEW.ip_address IS NULL THEN
    -- Securely extract the IP from PostgREST headers
    _ip := current_setting('request.headers', true)::json->>'x-forwarded-for';
    IF _ip IS NULL THEN
      _ip := current_setting('request.headers', true)::json->>'x-real-ip';
    END IF;

    -- Assign to the row
    IF _ip IS NOT NULL THEN
      NEW.ip_address := _ip;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if exists to prevent duplicates
DROP TRIGGER IF EXISTS trg_session_logs_ip_before ON public.session_logs;

-- Attach trigger to session_logs table
CREATE TRIGGER trg_session_logs_ip_before
  BEFORE INSERT ON public.session_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_session_logs_capture_ip();
