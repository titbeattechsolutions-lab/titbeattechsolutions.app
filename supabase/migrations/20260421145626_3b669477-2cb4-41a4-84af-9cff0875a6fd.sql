-- Restrictive policy: blocks ALL writes from authenticated users unless they are super_admin.
-- Combined with the existing permissive "Super admins manage all roles" policy, only super admins can write.
-- The handle_new_user_role trigger runs as SECURITY DEFINER, bypassing RLS, so signup auto-assignment still works.

CREATE POLICY "Block role self-assignment"
ON public.user_roles
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));