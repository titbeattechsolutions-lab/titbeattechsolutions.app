-- 1. Table to hold one-time super_admin grant tokens
CREATE TABLE IF NOT EXISTS public.super_admin_bootstrap_tokens (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash      TEXT NOT NULL UNIQUE,            -- sha256 of the issued token (raw token never stored)
  target_user_id  UUID NOT NULL,                   -- the auth.users.id allowed to redeem
  issued_by       UUID NOT NULL,                   -- super_admin who created it
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ NOT NULL,
  consumed_at     TIMESTAMPTZ,
  consumed_by     UUID
);

CREATE INDEX IF NOT EXISTS idx_sabt_target ON public.super_admin_bootstrap_tokens(target_user_id);

ALTER TABLE public.super_admin_bootstrap_tokens ENABLE ROW LEVEL SECURITY;

-- Only super_admins can see / manage tokens directly
CREATE POLICY "Super admins manage bootstrap tokens"
  ON public.super_admin_bootstrap_tokens
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

-- 2. Issue a one-time token (super_admin only). Returns the raw token ONCE.
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

  -- Reject if target already has the role
  IF public.has_role(_target_user_id, 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'target user already has super_admin';
  END IF;

  _raw_token := encode(gen_random_bytes(32), 'hex');
  _hash      := encode(digest(_raw_token, 'sha256'), 'hex');

  INSERT INTO public.super_admin_bootstrap_tokens(
    token_hash, target_user_id, issued_by, expires_at
  ) VALUES (
    _hash, _target_user_id, auth.uid(), now() + make_interval(hours => _hours_valid)
  );

  RETURN _raw_token;
END;
$$;

REVOKE ALL ON FUNCTION public.issue_super_admin_token(UUID, INTEGER) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.issue_super_admin_token(UUID, INTEGER) TO authenticated;

-- 3. Redeem a token (any signed-in user). Atomically marks consumed + grants role.
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
    RAISE EXCEPTION 'invalid token';
  END IF;

  _hash := encode(digest(_token, 'sha256'), 'hex');

  -- Atomically claim the token: lock matching row and ensure single-use
  UPDATE public.super_admin_bootstrap_tokens
     SET consumed_at = now(),
         consumed_by = _caller
   WHERE token_hash     = _hash
     AND target_user_id = _caller
     AND consumed_at    IS NULL
     AND expires_at     > now()
  RETURNING id INTO _row_id;

  IF _row_id IS NULL THEN
    RAISE EXCEPTION 'token invalid, expired, already used, or not assigned to you';
  END IF;

  -- Grant the role (idempotent thanks to UNIQUE(user_id, role))
  INSERT INTO public.user_roles(user_id, role)
  VALUES (_caller, 'super_admin'::app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_super_admin_token(TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.redeem_super_admin_token(TEXT) TO authenticated;