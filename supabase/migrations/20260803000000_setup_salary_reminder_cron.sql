-- Enable necessary extensions
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Create the cron job to fire at 08:00 AM every day
-- We assume the Edge Function is deployed and accessible
-- NOTE: In a production Supabase project, replace the URL and Anon Key with the correct project URL and ANON key, 
-- or use the internal endpoint if available.
select cron.schedule(
  'process-salary-reminders',
  '0 8 * * *',
  $$
  select net.http_post(
    url := 'https://[PROJECT_REF].supabase.co/functions/v1/process-salary-reminders',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer [ANON_KEY]"}'::jsonb,
    body := '{}'::jsonb
  )
  $$
);
