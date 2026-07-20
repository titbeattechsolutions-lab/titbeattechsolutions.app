-- Fix: Update get_login_history RPC to properly match the modern 'super_admin' role
-- while retaining backwards compatibility with legacy 'superadmin' logs.

CREATE OR REPLACE FUNCTION public.get_login_history(
  _auth_type  TEXT,
  _identifier TEXT,
  _limit      INTEGER DEFAULT 50
)
RETURNS TABLE (
  id          UUID,
  event_type  TEXT,
  "timestamp" TIMESTAMPTZ,
  ip_address  TEXT,
  user_agent  TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    sl.id,
    sl.action        AS event_type,
    sl.created_at    AS "timestamp",
    sl.ip_address,
    sl.device        AS user_agent
  FROM public.session_logs sl
  WHERE
    CASE _auth_type
      WHEN 'super_admin' THEN sl.role IN ('superadmin', 'super_admin')
      WHEN 'tenant'      THEN sl.school_id::TEXT = _identifier
      WHEN 'staff'       THEN sl.user_id::TEXT = _identifier
      ELSE sl.user_id::TEXT = _identifier
    END
  ORDER BY sl.created_at DESC
  LIMIT _limit;
$$;

GRANT EXECUTE ON FUNCTION public.get_login_history(TEXT, TEXT, INTEGER) TO authenticated;
