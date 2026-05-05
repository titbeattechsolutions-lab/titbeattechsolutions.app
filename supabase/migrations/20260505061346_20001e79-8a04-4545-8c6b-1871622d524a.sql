
-- Harden EXECUTE privileges on SECURITY DEFINER functions.
-- Revoke from PUBLIC/anon on super_admin-only functions; keep the public-facing
-- PIN/session RPCs callable by anon+authenticated (they self-authorize internally).

-- Super-admin only (require auth.uid() with super_admin role inside function)
REVOKE ALL ON FUNCTION public.create_tenant_v2(text, text, text, text, text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.find_duplicate_tenants() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.suspend_duplicate_tenant(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reset_school_pin(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.issue_super_admin_token(uuid, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.security_regression_check() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_tenant_v2(text, text, text, text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.find_duplicate_tenants() TO authenticated;
GRANT EXECUTE ON FUNCTION public.suspend_duplicate_tenant(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reset_school_pin(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.issue_super_admin_token(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.security_regression_check() TO authenticated;

-- Authenticated-only (must be signed in to redeem)
REVOKE ALL ON FUNCTION public.redeem_super_admin_token(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.redeem_super_admin_token(text) TO authenticated;

-- Internal helpers — should never be exposed
REVOKE ALL ON FUNCTION public._verify_pin_any(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._is_bcrypt(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._session_ref(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cleanup_expired_sessions() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

-- Legacy v1 RPCs no longer used by client (v2 replaces them)
REVOKE ALL ON FUNCTION public.verify_school_pin(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.verify_admin_pin(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_admin_pin(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_tenant_data(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.save_tenant_data(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;

-- Public-facing tenant RPCs (PIN-gated, audited) remain callable by anon+authenticated.
-- They do not trust the caller's auth.uid(); authorization is via the supplied PIN/session token.
-- Keep grants explicit:
GRANT EXECUTE ON FUNCTION public.verify_school_pin_v2(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_admin_pin_v2(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_admin_pin_v2(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_tenant_data_v2(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_tenant_data_v2(text, jsonb) TO anon, authenticated;
