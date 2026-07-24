-- Enable pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Create a function to delete old logs
CREATE OR REPLACE FUNCTION public.prune_old_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Delete tenant activity logs older than 90 days
    DELETE FROM public.tenant_activity_logs 
    WHERE created_at < NOW() - INTERVAL '90 days';

    -- Delete staff session logs older than 90 days
    DELETE FROM public.staff_session_logs 
    WHERE created_at < NOW() - INTERVAL '90 days';
END;
$$;

-- Schedule the cron job to run daily at 3:00 AM
-- Using PL/pgSQL DO block to avoid returning a row which might upset the migration runner
DO $$
BEGIN
    -- Unschedule it first if it exists to avoid duplicates
    PERFORM cron.unschedule('prune_old_logs_daily');
    -- Schedule it
    PERFORM cron.schedule('prune_old_logs_daily', '0 3 * * *', 'SELECT public.prune_old_logs();');
EXCEPTION
    WHEN OTHERS THEN
        -- Ignore errors if cron schema doesn't exist or permissions fail
        RAISE NOTICE 'Could not schedule cron job: %', SQLERRM;
END
$$;
