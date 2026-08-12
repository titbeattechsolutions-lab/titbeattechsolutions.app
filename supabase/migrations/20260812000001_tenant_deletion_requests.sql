-- Create tenant_deletion_requests table
CREATE TABLE IF NOT EXISTS public.tenant_deletion_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    requested_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.tenant_deletion_requests ENABLE ROW LEVEL SECURITY;

-- Tenants can view their own requests
CREATE POLICY "Tenants can view own deletion requests"
ON public.tenant_deletion_requests FOR SELECT
TO authenticated
USING (
  tenant_id = (SELECT school_id FROM public.profiles WHERE id = auth.uid())
);

-- Tenants can insert requests for their tenant
CREATE POLICY "Tenants can insert own deletion requests"
ON public.tenant_deletion_requests FOR INSERT
TO authenticated
WITH CHECK (
  tenant_id = (SELECT school_id FROM public.profiles WHERE id = auth.uid())
);

-- Tenants can cancel their own requests
CREATE POLICY "Tenants can update own deletion requests to cancelled"
ON public.tenant_deletion_requests FOR UPDATE
TO authenticated
USING (
  tenant_id = (SELECT school_id FROM public.profiles WHERE id = auth.uid())
)
WITH CHECK (
  status = 'cancelled'
);

-- Super admins can view all requests
CREATE POLICY "Super admins can view all deletion requests"
ON public.tenant_deletion_requests FOR SELECT
TO authenticated
USING (public.has_role('super_admin'));

-- Super admins can update all requests
CREATE POLICY "Super admins can update all deletion requests"
ON public.tenant_deletion_requests FOR UPDATE
TO authenticated
USING (public.has_role('super_admin'));


-- Create RPC to securely delete a tenant and its staff accounts
-- SECURITY DEFINER is required to allow deletion from auth.users
CREATE OR REPLACE FUNCTION public.execute_tenant_deletion(target_tenant_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    is_super_admin BOOLEAN;
    user_id UUID;
BEGIN
    -- Verify caller is super admin
    is_super_admin := public.has_role('super_admin');
    IF NOT is_super_admin THEN
        RAISE EXCEPTION 'Access denied. Must be super admin.';
    END IF;

    -- Verify that an approved request exists for this tenant
    IF NOT EXISTS (
        SELECT 1 FROM public.tenant_deletion_requests 
        WHERE tenant_id = target_tenant_id AND status = 'approved'
    ) THEN
        RAISE EXCEPTION 'No approved deletion request found for this tenant.';
    END IF;

    -- Delete all auth.users associated with this tenant (this will cascade to profiles)
    FOR user_id IN (SELECT id FROM public.profiles WHERE school_id = target_tenant_id)
    LOOP
        DELETE FROM auth.users WHERE id = user_id;
    END LOOP;

    -- Delete the tenant record (this will cascade to schools, students, results, etc.)
    DELETE FROM public.tenants WHERE id = target_tenant_id;

END;
$$;

-- Grant execution to authenticated users
GRANT EXECUTE ON FUNCTION public.execute_tenant_deletion(UUID) TO authenticated;
