-- Fix security definer warning by setting the view to use the invoker's permissions (enforcing RLS)
ALTER VIEW public.recent_login_activity SET (security_invoker = true);
