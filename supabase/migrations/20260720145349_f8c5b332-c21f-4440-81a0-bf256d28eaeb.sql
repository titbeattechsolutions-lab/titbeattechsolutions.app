
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.trigger_enrich_session_geoip()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  fn_url text := 'https://fliphfrxuhmhnxtmettd.supabase.co/functions/v1/enrich-session-geoip';
  anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZsaXBoZnJ4dWhtaG54dG1ldHRkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY2ODUyNTUsImV4cCI6MjA5MjI2MTI1NX0.-5q6bBebbWoBU0uDIAQGyDFb-BbvghuMdl3T0Uil6qc';
BEGIN
  -- Skip rows without an IP or already-enriched rows
  IF NEW.ip_address IS NULL OR NEW.ip_address = '' OR NEW.location IS NOT NULL THEN
    RETURN NEW;
  END IF;

  PERFORM extensions.http_post(
    url := fn_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || anon_key
    ),
    body := jsonb_build_object(
      'type', 'INSERT',
      'table', 'session_logs',
      'schema', 'public',
      'record', to_jsonb(NEW),
      'old_record', NULL
    )
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never block the insert if the webhook fails
  RAISE WARNING 'enrich-session-geoip trigger failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.trigger_enrich_session_geoip() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS session_logs_enrich_geoip ON public.session_logs;
CREATE TRIGGER session_logs_enrich_geoip
  AFTER INSERT ON public.session_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_enrich_session_geoip();
