-- =====================================================================
-- Safely configure pg_net webhook for the enrich-session-geoip Edge Function
-- =====================================================================

CREATE OR REPLACE FUNCTION public.trigger_enrich_session_geoip()
RETURNS TRIGGER AS $$
DECLARE
  _function_url TEXT;
  _anon_key TEXT;
BEGIN
  -- We only want to trigger enrichment if there is an IP address and no location
  IF NEW.ip_address IS NULL OR NEW.location IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Build the absolute URL for the Edge Function.
  -- In Supabase, the API Gateway runs on the same domain but under /functions/v1/
  _function_url := current_setting('app.settings.endpoint', true) || '/functions/v1/enrich-session-geoip';
  
  -- Fallback if endpoint setting isn't available in Lovable Cloud
  IF _function_url IS NULL OR _function_url = '/functions/v1/enrich-session-geoip' THEN
    _function_url := 'http://localhost:54321/functions/v1/enrich-session-geoip'; -- Adjust if you have a specific production URL
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
  -- If pg_net fails, we silently catch the error so the user's login is never blocked.
  WHEN OTHERS THEN
    RAISE WARNING 'pg_net webhook failed to trigger for session %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate the trigger securely
DROP TRIGGER IF EXISTS session_logs_enrich_geoip ON public.session_logs;

CREATE TRIGGER session_logs_enrich_geoip
  AFTER INSERT ON public.session_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_enrich_session_geoip();
