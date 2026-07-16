-- =====================================================================
-- 20260714000000_renew_tenant_subscription.sql
-- Create an authoritative RPC for superadmins to renew a tenant subscription.
-- It explicitly updates public.tenants (the table used for session auth).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.renew_tenant_subscription(_tenant_id UUID, _months INT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _months IS NULL OR _months < 1 OR _months > 24 THEN
    RAISE EXCEPTION 'months must be between 1 and 24';
  END IF;

  UPDATE public.tenants
  SET subscription_ends_at = GREATEST(COALESCE(subscription_ends_at, now()), now()) 
                              + make_interval(months => _months),
      status = 'active',
      updated_at = now()
  WHERE id = _tenant_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.renew_tenant_subscription(UUID, INT) TO authenticated;
