-- =====================================================================
-- Capture Client IP Address for all Activity Logs
-- Ensures all superadmin system events track the originating IP natively
-- =====================================================================

CREATE OR REPLACE FUNCTION public.trg_activity_logs_capture_ip()
RETURNS TRIGGER AS $$
DECLARE
  _ip TEXT;
BEGIN
  -- Securely extract the IP from PostgREST headers
  _ip := current_setting('request.headers', true)::json->>'x-forwarded-for';
  IF _ip IS NULL THEN
    _ip := current_setting('request.headers', true)::json->>'x-real-ip';
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

-- Drop trigger if exists to prevent duplicates
DROP TRIGGER IF EXISTS trg_activity_logs_ip_before ON public.activity_logs;

-- Attach trigger to activity_logs table
CREATE TRIGGER trg_activity_logs_ip_before
  BEFORE INSERT ON public.activity_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_activity_logs_capture_ip();
