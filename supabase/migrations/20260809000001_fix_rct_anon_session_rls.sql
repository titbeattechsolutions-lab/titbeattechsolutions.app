-- Fix rct_anon_session RLS policy
-- get_tenant_from_session() returns schools.id (the PK), NOT tenant_id.
-- The previous policy incorrectly used it as tenant_id in the subquery,
-- causing every anon insert/update to fail with a policy violation.

DROP POLICY IF EXISTS "rct_anon_session" ON public.result_checker_tokens;

CREATE POLICY "rct_anon_session"
  ON public.result_checker_tokens
  FOR ALL
  TO anon
  USING (
    school_id = public.get_tenant_from_session()
  )
  WITH CHECK (
    school_id = public.get_tenant_from_session()
  );
