-- Create tenant_activity_logs table for granular in-app actions
CREATE TABLE IF NOT EXISTS public.tenant_activity_logs (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL,
  staff_id TEXT NOT NULL,
  action TEXT NOT NULL,
  details TEXT,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS tenant_activity_logs_tenant_id_idx ON public.tenant_activity_logs(tenant_id);
CREATE INDEX IF NOT EXISTS tenant_activity_logs_staff_id_idx ON public.tenant_activity_logs(staff_id);
CREATE INDEX IF NOT EXISTS tenant_activity_logs_timestamp_idx ON public.tenant_activity_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS tenant_activity_logs_action_idx ON public.tenant_activity_logs(action);

-- Enable RLS
ALTER TABLE public.tenant_activity_logs ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Super admins can view all activity logs"
  ON public.tenant_activity_logs FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Tenants can view their own activity logs"
  ON public.tenant_activity_logs FOR SELECT
  TO anon, authenticated
  USING (
    tenant_id = ANY(
      SELECT t.tenant_id FROM public.tenant_sessions t
      WHERE t.token = current_setting('app.session_token', true)
    )
  );

CREATE POLICY "Tenants can insert their own activity logs"
  ON public.tenant_activity_logs FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    tenant_id = ANY(
      SELECT t.tenant_id FROM public.tenant_sessions t
      WHERE t.token = current_setting('app.session_token', true)
    )
  );

-- RPC for logging activity
CREATE OR REPLACE FUNCTION public.log_tenant_activity(
  _tenant_id UUID,
  _staff_id TEXT,
  _action TEXT,
  _details TEXT DEFAULT NULL,
  _timestamp TIMESTAMPTZ DEFAULT now()
)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.tenant_activity_logs (
    tenant_id, staff_id, action, details, timestamp
  ) VALUES (
    _tenant_id, _staff_id, _action, _details, _timestamp
  );
END;
$$;

-- Grant execute permission to authenticated and anon users
GRANT EXECUTE ON FUNCTION public.log_tenant_activity(UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ) 
  TO anon, authenticated;

-- Helper function to get activity history for a tenant
CREATE OR REPLACE FUNCTION public.get_tenant_activity_logs(
  _tenant_id UUID,
  _limit INT DEFAULT 50
)
RETURNS TABLE(
  id BIGINT,
  staff_id TEXT,
  action TEXT,
  details TEXT,
  "timestamp" TIMESTAMPTZ
)
LANGUAGE plpgsql
SET search_path = public
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    l.id,
    l.staff_id,
    l.action,
    l.details,
    l.timestamp
  FROM public.tenant_activity_logs l
  WHERE l.tenant_id = _tenant_id
  ORDER BY l.timestamp DESC
  LIMIT _limit;
END;
$$;

-- Grant execute permission to authenticated and anon users
GRANT EXECUTE ON FUNCTION public.get_tenant_activity_logs(UUID, INT) 
  TO anon, authenticated;
