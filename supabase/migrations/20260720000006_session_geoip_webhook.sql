-- =====================================================================
-- RPC to handle Geo-IP anomaly detection natively in Postgres
-- Called asynchronously by the enrich-session-geoip Edge Function
-- =====================================================================

CREATE OR REPLACE FUNCTION public.update_session_location(
  _session_id UUID,
  _user_id UUID,
  _location TEXT
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _is_suspicious BOOLEAN := false;
  _recent_locations TEXT[];
BEGIN
  -- 1. Gather the distinct locations from the user's last 10 logins
  -- (excluding the current session being updated)
  SELECT array_agg(DISTINCT location) INTO _recent_locations
  FROM (
    SELECT location 
    FROM public.session_logs 
    WHERE user_id = _user_id 
      AND id != _session_id 
      AND location IS NOT NULL
    ORDER BY created_at DESC 
    LIMIT 10
  ) sub;

  -- 2. Anomaly Rule: If the user has a baseline history, and this new 
  -- location isn't in their recent history, flag it as suspicious.
  IF _recent_locations IS NOT NULL AND array_length(_recent_locations, 1) > 0 THEN
    IF NOT (_location = ANY(_recent_locations)) THEN
      _is_suspicious := true;
    END IF;
  END IF;

  -- 3. Persist the location and anomaly flag back to the row
  UPDATE public.session_logs
  SET location = _location,
      is_suspicious = _is_suspicious
  WHERE id = _session_id;
END;
$$;

-- Grant execution to authenticated users (the Edge Function will call this via Service Role, 
-- but granting to authenticated is standard practice for completeness if needed)
GRANT EXECUTE ON FUNCTION public.update_session_location(UUID, UUID, TEXT) TO authenticated;
