-- 1. Audit table
CREATE TABLE IF NOT EXISTS public.super_admin_token_audit (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type      TEXT NOT NULL CHECK (event_type IN ('issued', 'redeemed')),
  actor_user_id   UUID,                  -- who triggered the event (issuer or redeemer)
  target_user_id  UUID,                  -- who the token was/would be granted to
  token_id        UUID,                  -- references super_admin_bootstrap_tokens.id when known
  success         BOOLEAN NOT NULL,
  reason          TEXT,                  -- failure reason or note
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sata_created ON public.super_admin_token_audit(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sata_target  ON public.super_admin_token_audit(target_user_id);

ALTER TABLE public.super_admin_token_audit ENABLE ROW LEVEL SECURITY;

-- Only super_admins can read the audit log
CREATE POLICY "Super admins read audit"
  ON public.super_admin_token_audit
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role));

-- No client may insert/update/delete directly — all writes go through SECURITY DEFINER fns
-- (No INSERT policy = denied by default for authenticated; SECURITY DEFINER bypasses RLS.)

-- 2. Update issuer to log
CREATE OR REPLACE FUNCTION public.issue_super_admin_token(
  _target_user_id UUID,
  _hours_valid    INTEGER DEFAULT 24
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _raw_token TEXT;
  _hash      TEXT;
  _row_id    UUID;
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF _target_user_id IS NULL THEN
    RAISE EXCEPTION 'target_user_id required';
  END IF;

  IF _hours_valid IS NULL OR _hours_valid < 1 OR _hours_valid > 168 THEN
    RAISE EXCEPTION 'hours_valid must be between 1 and 168';
  END IF;

  IF public.has_role(_target_user_id, 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'target user already has super_admin';
  END IF;

  _raw_token := encode(gen_random_bytes(32), 'hex');
  _hash      := encode(digest(_raw_token, 'sha256'), 'hex');

  INSERT INTO public.super_admin_bootstrap_tokens(
    token_hash, target_user_id, issued_by, expires_at
  ) VALUES (
    _hash, _target_user_id, auth.uid(), now() + make_interval(hours => _hours_valid)
  )
  RETURNING id INTO _row_id;

  INSERT INTO public.super_admin_token_audit(
    event_type, actor_user_id, target_user_id, token_id, success, reason
  ) VALUES (
    'issued', auth.uid(), _target_user_id, _row_id, TRUE,
    'valid for ' || _hours_valid || 'h'
  );

  RETURN _raw_token;
END;
$$;

-- 3. Update redeemer to log every attempt
CREATE OR REPLACE FUNCTION public.redeem_super_admin_token(_token TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _hash    TEXT;
  _row_id  UUID;
  _caller  UUID := auth.uid();
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF _token IS NULL OR length(_token) < 32 THEN
    INSERT INTO public.super_admin_token_audit(
      event_type, actor_user_id, target_user_id, success, reason
    ) VALUES ('redeemed', _caller, _caller, FALSE, 'malformed token');
    RAISE EXCEPTION 'invalid token';
  END IF;

  _hash := encode(digest(_token, 'sha256'), 'hex');

  UPDATE public.super_admin_bootstrap_tokens
     SET consumed_at = now(),
         consumed_by = _caller
   WHERE token_hash     = _hash
     AND target_user_id = _caller
     AND consumed_at    IS NULL
     AND expires_at     > now()
  RETURNING id INTO _row_id;

  IF _row_id IS NULL THEN
    INSERT INTO public.super_admin_token_audit(
      event_type, actor_user_id, target_user_id, success, reason
    ) VALUES (
      'redeemed', _caller, _caller, FALSE,
      'token invalid, expired, already used, or not assigned to caller'
    );
    RAISE EXCEPTION 'token invalid, expired, already used, or not assigned to you';
  END IF;

  INSERT INTO public.user_roles(user_id, role)
  VALUES (_caller, 'super_admin'::app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  INSERT INTO public.super_admin_token_audit(
    event_type, actor_user_id, target_user_id, token_id, success, reason
  ) VALUES (
    'redeemed', _caller, _caller, _row_id, TRUE, 'super_admin granted'
  );

  RETURN TRUE;
END;
$$;