-- =====================================================================
-- Trigger Edge Function on Superadmin Login (Facebook-Style Alerts)
-- =====================================================================

CREATE OR REPLACE FUNCTION public.trigger_alert_superadmin_login()
RETURNS TRIGGER AS $$
DECLARE
  _function_url TEXT;
  _anon_key TEXT;
BEGIN
  -- Build the absolute URL for the Edge Function.
  _function_url := current_setting('app.settings.endpoint', true) || '/functions/v1/alert-superadmin-login';
  
  -- Fallback for local development if endpoint setting isn't available
  IF _function_url IS NULL OR _function_url = '/functions/v1/alert-superadmin-login' THEN
    _function_url := 'http://localhost:54321/functions/v1/alert-superadmin-login';
  END IF;

  _anon_key := current_setting('app.settings.anon_key', true);

  -- Perform the asynchronous HTTP POST via pg_net
  PERFORM net.http_post(
    url := _function_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || COALESCE(_anon_key, 'YOUR_ANON_KEY')
    ),
    body := row_to_json(NEW)::jsonb
  );

  RETURN NEW;
EXCEPTION
  -- Silently catch error so login is not blocked
  WHEN OTHERS THEN
    RAISE WARNING 'pg_net webhook failed to trigger for superadmin login %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create the trigger
DROP TRIGGER IF EXISTS alert_superadmin_login_trigger ON public.session_logs;

CREATE TRIGGER alert_superadmin_login_trigger
  AFTER INSERT ON public.session_logs
  FOR EACH ROW
  WHEN (NEW.action = 'login' AND NEW.role IN ('superadmin', 'super_admin'))
  EXECUTE FUNCTION public.trigger_alert_superadmin_login();
