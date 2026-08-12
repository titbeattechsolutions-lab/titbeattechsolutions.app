-- 20260812000005_remove_deletion_request_requirement.sql

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
    is_super_admin := public.has_role(auth.uid(), 'super_admin'::app_role);
    IF NOT is_super_admin THEN
        RAISE EXCEPTION 'Access denied. Must be super admin.';
    END IF;

    -- Note: Removed the requirement for an 'approved' deletion request. 
    -- Super Admins have the ultimate authority to delete schools at any time.

    -- Delete all auth.users associated with this tenant (this will cascade to profiles)
    FOR user_id IN (SELECT id FROM public.profiles WHERE school_id = target_tenant_id)
    LOOP
        DELETE FROM auth.users WHERE id = user_id;
    END LOOP;

    -- Delete the tenant record (this will cascade to schools, students, results, etc.)
    DELETE FROM public.tenants WHERE id = target_tenant_id;

END;
$$;
