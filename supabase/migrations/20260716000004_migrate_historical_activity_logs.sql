-- Migrate data from tenant_activity_logs to activity_logs
INSERT INTO public.activity_logs (school_id, action, details, created_at)
SELECT 
  s.id AS school_id, 
  t.action, 
  jsonb_build_object('note', t.details, 'actor', t.staff_id, 'migrated', true) AS details, 
  t.timestamp AS created_at 
FROM public.tenant_activity_logs t 
JOIN public.schools s ON s.tenant_id = t.tenant_id;
