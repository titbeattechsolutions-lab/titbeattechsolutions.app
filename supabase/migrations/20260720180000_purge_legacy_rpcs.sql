-- Drop legacy sync functions
DROP FUNCTION IF EXISTS public.save_tenant_data(UUID, JSONB);
DROP FUNCTION IF EXISTS public.save_tenant_data(TEXT, JSONB);
DROP FUNCTION IF EXISTS public.save_tenant_data_v2(UUID, JSONB);
DROP FUNCTION IF EXISTS public.save_tenant_data_v2(TEXT, JSONB);

-- Drop legacy PIN auth functions (which were replaced by _v2 equivalents for token support)
DROP FUNCTION IF EXISTS public.verify_school_pin(TEXT);
DROP FUNCTION IF EXISTS public.verify_admin_pin(TEXT, TEXT);
DROP FUNCTION IF EXISTS public.set_admin_pin(TEXT, TEXT);
DROP FUNCTION IF EXISTS public.verify_admin_pin(UUID, TEXT);
DROP FUNCTION IF EXISTS public.set_admin_pin(UUID, TEXT);
