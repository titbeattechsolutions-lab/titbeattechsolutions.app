-- Ensure vault extension is available
CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA vault;

-- Replace the trigger function to be completely dynamic
CREATE OR REPLACE FUNCTION public.trigger_enrich_session_geoip()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, vault
AS $$
DECLARE
  fn_url text;
  anon_key text;
BEGIN
  -- Skip rows without an IP or already-enriched rows
  IF NEW.ip_address IS NULL OR NEW.ip_address = '' OR NEW.location IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Dynamically grab the secrets from the Supabase Vault
  SELECT secret INTO fn_url FROM vault.decrypted_secrets WHERE name = 'edge_function_url';
  SELECT secret INTO anon_key FROM vault.decrypted_secrets WHERE name = 'anon_key';

  -- Fallback if secrets are missing (safely ignore webhook to prevent crashing inserts)
  IF fn_url IS NULL OR anon_key IS NULL THEN
    RAISE WARNING 'edge_function_url or anon_key not found in vault.secrets. Skipping enrich-session-geoip webhook.';
    RETURN NEW;
  END IF;

  -- Fire the async POST request
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
