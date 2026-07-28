-- =====================================================================
-- Migration: Add provisioning_requests table for idempotency tracking
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.provisioning_requests (
  idempotency_key text PRIMARY KEY,
  tenant_id uuid REFERENCES public.tenants(id),
  school_id uuid REFERENCES public.schools(id),
  created_at timestamptz DEFAULT now()
);

-- Enable RLS to lock it down (service role only)
ALTER TABLE public.provisioning_requests ENABLE ROW LEVEL SECURITY;

-- No policies means it's inaccessible to anon/authenticated,
-- only the service_role key (used by the edge function) can access it.
