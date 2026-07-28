-- Create login/logout tracking table
CREATE TABLE IF NOT EXISTS public.login_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID,
  tenant_id UUID,
  staff_id TEXT,
  auth_type TEXT NOT NULL CHECK (auth_type IN ('super_admin', 'tenant', 'staff')),
  event_type TEXT NOT NULL CHECK (event_type IN ('login', 'logout')),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address TEXT,
  user_agent TEXT,
  session_token TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS login_logs_user_id_idx ON public.login_logs(user_id);
CREATE INDEX IF NOT EXISTS login_logs_tenant_id_idx ON public.login_logs(tenant_id);
CREATE INDEX IF NOT EXISTS login_logs_staff_id_idx ON public.login_logs(staff_id);
CREATE INDEX IF NOT EXISTS login_logs_timestamp_idx ON public.login_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS login_logs_auth_type_idx ON public.login_logs(auth_type);
CREATE INDEX IF NOT EXISTS login_logs_event_type_idx ON public.login_logs(event_type);

-- Enable RLS on login_logs
ALTER TABLE public.login_logs ENABLE ROW LEVEL SECURITY;

-- Policies for login_logs
CREATE POLICY "Super admins can view all login logs"
  ON public.login_logs FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Tenants can view their own login logs"
  ON public.login_logs FOR SELECT
  TO anon, authenticated
  USING (
    -- Allow if tenant_id matches current tenant session
    tenant_id = ANY(
      SELECT tenant_id FROM public.tenant_sessions 
      WHERE token = current_setting('app.session_token', true)
    )
  );

-- Helper function to log login/logout events
CREATE OR REPLACE FUNCTION public.log_auth_event(
  _auth_type TEXT,
  _event_type TEXT,
  _user_id UUID DEFAULT NULL,
  _tenant_id UUID DEFAULT NULL,
  _staff_id TEXT DEFAULT NULL,
  _ip_address TEXT DEFAULT NULL,
  _user_agent TEXT DEFAULT NULL,
  _session_token TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.login_logs (
    user_id, tenant_id, staff_id, auth_type, event_type,
    ip_address, user_agent, session_token, timestamp
  ) VALUES (
    _user_id, _tenant_id, _staff_id, _auth_type, _event_type,
    _ip_address, _user_agent, _session_token, now()
  );
END;
$$;

-- Grant execute permission to authenticated and anon users
GRANT EXECUTE ON FUNCTION public.log_auth_event(TEXT, TEXT, UUID, UUID, TEXT, TEXT, TEXT, TEXT) 
  TO anon, authenticated;

-- Helper function to get login history for a user/tenant/staff
CREATE OR REPLACE FUNCTION public.get_login_history(
  _auth_type TEXT,
  _identifier TEXT,
  _limit INT DEFAULT 50
)
RETURNS TABLE(
  id BIGINT,
  event_type TEXT,
  "timestamp" TIMESTAMPTZ,
  ip_address TEXT,
  user_agent TEXT
)
LANGUAGE plpgsql
SET search_path = public
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    l.id,
    l.event_type,
    l.timestamp,
    l.ip_address,
    l.user_agent
  FROM public.login_logs l
  WHERE 
    l.auth_type = _auth_type
    AND (
      (_auth_type = 'super_admin' AND l.user_id = _identifier::uuid) OR
      (_auth_type = 'tenant' AND l.tenant_id = _identifier::uuid) OR
      (_auth_type = 'staff' AND l.staff_id = _identifier)
    )
  ORDER BY l.timestamp DESC
  LIMIT _limit;
END;
$$;

-- Grant execute permission to authenticated and anon users
GRANT EXECUTE ON FUNCTION public.get_login_history(TEXT, TEXT, INT) 
  TO anon, authenticated;

-- Add tracking columns to tenant_sessions
ALTER TABLE public.tenant_sessions ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE public.tenant_sessions ADD COLUMN IF NOT EXISTS last_logout_at TIMESTAMPTZ;

-- Update the tenant_sessions to set last_login_at on creation
CREATE OR REPLACE FUNCTION public.update_tenant_session_login()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.last_login_at := now();
  RETURN NEW;
END;
$$;

-- Create trigger for tenant_sessions last_login_at
DROP TRIGGER IF EXISTS tenant_sessions_login_trigger ON public.tenant_sessions;
CREATE TRIGGER tenant_sessions_login_trigger
BEFORE INSERT ON public.tenant_sessions
FOR EACH ROW
EXECUTE FUNCTION public.update_tenant_session_login();

-- Create a view for recent login activity
CREATE OR REPLACE VIEW public.recent_login_activity AS
SELECT
  id,
  user_id,
  tenant_id,
  staff_id,
  auth_type,
  event_type,
  timestamp,
  ip_address,
  user_agent
FROM public.login_logs
ORDER BY timestamp DESC
LIMIT 1000;

-- Grant permissions on the view
ALTER VIEW public.recent_login_activity OWNER TO postgres;
