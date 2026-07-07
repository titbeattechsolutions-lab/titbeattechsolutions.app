CREATE TABLE public.staff_session_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  staff_member_id TEXT NOT NULL,   -- matches StaffMember.id, e.g. "s1"
  staff_name TEXT NOT NULL,
  role TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('login', 'logout')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.staff_session_logs ENABLE ROW LEVEL SECURITY;
-- No direct RLS policies for anon/authenticated — all access goes through SECURITY DEFINER RPCs below.
-- Optional: allow superadmin direct read for a cross-tenant view.
CREATE POLICY "staff_session_logs_superadmin_read"
  ON public.staff_session_logs FOR SELECT
  USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'super_admin');
